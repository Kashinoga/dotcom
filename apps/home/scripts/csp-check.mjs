// Walk every route this site has and prove the Content Security Policy is both PRESENT and QUIET.
//
// WHY THIS IS NOT IN THE e2e SUITE, which is the obvious place for it: the suite drives `vite dev`,
// and the policy is deliberately switched off there — Vite's dev server needs `unsafe-eval` and
// `unsafe-inline` for HMR, so a policy strict enough to be worth having is strict enough to break
// `pnpm dev`, and a CSP that breaks the dev server is a CSP somebody deletes by Thursday. The only
// place the real policy exists is a production build, so that is what this builds and serves.
//
// WHAT IT IS FOR is the failure mode a CSP has that most things do not: it can be quietly WRONG in
// both directions and look fine either way. Too strict and a page breaks somewhere nobody clicked;
// too loose — or accidentally deleted, which is exactly what `headers.set` did to it once in this
// repo — and it restricts nothing while still appearing in the response. Neither shows up in a diff.
//
// THE ROUTE LIST IS THE APP'S OWN SITEMAP, not a list kept here. A hand-written list of pages goes
// stale the first time somebody adds one, and the page it misses is the page that breaks.

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = Number(process.env.CSP_PORT ?? 5189);
const B = `http://localhost:${PORT}`;

/** What every page's policy has to say. Each one is a claim somebody could otherwise loosen. */
const REQUIRED = [
	// The directive that matters. A hash beside it is SvelteKit's own boot script and is expected;
	// `unsafe-inline` beside it would mean the whole thing had been given up on.
	/script-src 'self'/,
	/default-src 'self'/,
	/object-src 'none'/,
	/base-uri 'self'/
];

/** What no page's policy may say, whatever else is in it. */
const FORBIDDEN = [
	// The flag that turns a string into code. The production bundle needs none.
	/unsafe-eval/,
	// Inline SCRIPT, as opposed to inline style — see the note in vite.config.ts about why the one
	// is allowed and the other is the point of the exercise.
	/script-src[^;]*unsafe-inline/
];

let server;
/**
 * Idempotent, because it is called explicitly at the end AND from `exit` — and killing a process
 * group that has already gone throws ESRCH, which would turn a clean pass into a stack trace.
 */
function stop() {
	if (!server) return;
	const group = -server.pid;
	server = null;
	try {
		process.kill(group, 'SIGTERM');
	} catch {
		/* already gone, which is the outcome we wanted */
	}
}
process.on('exit', stop);
process.on('SIGINT', () => {
	stop();
	process.exit(130);
});

async function serve() {
	server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], {
		// Its own process group, so `stop` kills the server and not this script's whole tree.
		detached: true,
		stdio: 'ignore'
	});
	for (let n = 0; n < 60; n += 1) {
		try {
			await fetch(`${B}/sitemap.xml`);
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 500));
		}
	}
	throw new Error(`no preview server on ${PORT} after 30s — is the build there? (pnpm build)`);
}

await serve();

const xml = await (await fetch(`${B}/sitemap.xml`)).text();
const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
if (!paths.length) throw new Error('the sitemap named no routes');

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const bad = [];
page.on('console', (m) => {
	if (/Content Security Policy|Refused to/i.test(m.text()))
		bad.push(`${page.url()} :: ${m.text()}`);
});
page.on('pageerror', (e) => bad.push(`${page.url()} :: ${e.message}`));

for (const path of paths) {
	const res = await page.goto(B + path, { waitUntil: 'networkidle' }).catch(() => null);
	if (!res) {
		bad.push(`${path} :: would not load`);
		continue;
	}
	// The policy arrives as a HEADER on a server-rendered page; the `<meta>` is SvelteKit's fallback
	// for a prerendered one. Both are read, because which one a route gets is SvelteKit's business.
	const header = res.headers()['content-security-policy'] ?? '';
	const meta = await page.evaluate(
		() => document.querySelector('meta[http-equiv="content-security-policy"]')?.content ?? ''
	);
	const policy = `${header} ${meta}`;
	for (const re of REQUIRED) if (!re.test(policy)) bad.push(`${path} :: policy lacks ${re}`);
	for (const re of FORBIDDEN) if (re.test(policy)) bad.push(`${path} :: policy allows ${re}`);
	// `frame-ancestors` is ignored in a meta tag, so it can only have come from the header — which
	// is the whole reason src/hooks.server.ts exists beside `kit.csp`.
	if (!/frame-ancestors 'none'/.test(header))
		bad.push(`${path} :: no frame-ancestors in the header`);
	await page.waitForTimeout(1200);
	// And the one thing the policy could plausibly have broken outright: the pre-paint script, which
	// stopped being inline in order to satisfy it. If it did not run, the page renders in the wrong
	// scheme for a frame and nothing else complains.
	const look = await page.evaluate(() => document.documentElement.dataset.look ?? '(none)');
	if (look !== 'pixelite') bad.push(`${path} :: preflight did not run — data-look is ${look}`);
}

await browser.close();
stop();

if (bad.length) {
	console.error(`\n${bad.length} problem(s):\n${bad.join('\n')}`);
	process.exit(1);
}
console.log(`csp: ${paths.length} routes, policy present and quiet on every one`);
