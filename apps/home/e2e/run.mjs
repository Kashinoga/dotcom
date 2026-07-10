import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Browser tests for the home app. `svelte-check` type-checks; nothing else here looks at
// what the page actually renders, and most of the bugs these were written for type-checked
// cleanly: a max-width silently ignored on a table cell, two map labels overlapping at every
// phone size, a focus ring that fell back to a hairline because Firefox dropped an invalid
// `calc()`. Reading the source proves none of those either way.
//
//   pnpm --filter home test:e2e              spawn a server, run every suite
//   pnpm --filter home test:e2e oplong map   …only the suites whose names match
//   E2E_BASE=http://localhost:5173 pnpm --filter home test:e2e     use a server you're running
//   E2E_PORT=5299 pnpm --filter home test:e2e                      spawn on a different port
//
// The port defaults to 5199, NOT Vite's 5173: you may well have a dev server up, and these
// suites must never assume it's theirs. When this script spawns one it kills only the
// process group it created, never a pattern match.
//
// Browsers are not installed by `pnpm install`. Once, per machine:
//   pnpm --filter home exec playwright install firefox

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = dirname(HERE);

// Ordered so the cheap, broad suites fail first. Every suite exits non-zero on a failure.
const SUITES = [
	'deeplink', // URLs, aliases, redirects, back/forward
	'scope', // ?field= / ?range= / ?refresh=
	'field', // the field selector
	'settings', // the settings panel
	'reset', // reset to defaults
	'maplayout', // station labels never collide, at any phone size
	'hubsize', // the hub dot never outgrows the masthead bullets
	'dots', // accent bullets beside every panel title
	'buttons', // one hover pop and press squash, everywhere
	'noshadow', // Flat mode grows no shadows — rest, hover, or :active
	'glass', // …and no backdrop-filter
	'oplong', // the Operator column truncates instead of overlapping Alt
	'pcclose', // the photo card's close button
	'ticker', // editing the motto ticker
	'ticker-edge', // …and its edge cases
	'repeat' // the ticker's repeat factor
];

const PORT = Number(process.env.E2E_PORT ?? 5199);
const filters = process.argv.slice(2);
const chosen = filters.length
	? SUITES.filter((s) => filters.some((f) => s.includes(f)))
	: SUITES;

if (!chosen.length) {
	console.error(`No suite matches ${filters.join(', ')}.\nAvailable: ${SUITES.join(', ')}`);
	process.exit(1);
}

/** Resolve once the port answers, or reject after ~30s. */
async function waitForServer(base) {
	for (let i = 0; i < 150; i++) {
		try {
			const r = await fetch(base, { signal: AbortSignal.timeout(1000) });
			if (r.ok) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`Server never came up at ${base}`);
}

const run = (cmd, args, opts) =>
	new Promise((resolve) => {
		const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
		p.on('close', (code) => resolve(code ?? 1));
	});

let server = null;
let base = process.env.E2E_BASE ?? null;

if (!base) {
	base = `http://localhost:${PORT}`;
	// `detached` puts the child in its own process group, so one kill(-pid) takes down Vite
	// and anything it spawned — and nothing else. Never `pkill -f vite`: that would take a
	// dev server you're running with it.
	//
	// The workspace's own vite binary, not `npx` (which would happily fetch a different one).
	const vite = join(APP, 'node_modules', '.bin', 'vite');
	server = spawn(vite, ['dev', '--port', String(PORT), '--strictPort'], {
		cwd: APP,
		detached: true,
		stdio: 'ignore'
	});
	console.log(`e2e: spawned a dev server on :${PORT} (pid ${server.pid})`);
}

const stop = () => {
	if (!server?.pid) return;
	try {
		process.kill(-server.pid, 'SIGTERM');
	} catch {
		/* already gone */
	}
	server = null;
};
// Ctrl-C and friends must not leave the spawned server behind.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (stop(), process.exit(130)));

const failed = [];
try {
	await waitForServer(base);
	for (const suite of chosen) {
		console.log(`\n[1m── ${suite} ${'─'.repeat(Math.max(0, 60 - suite.length))}[0m`);
		const code = await run(process.execPath, [join(HERE, `${suite}.mjs`)], {
			cwd: HERE,
			env: { ...process.env, BASE: base }
		});
		if (code !== 0) failed.push(suite);
	}
} finally {
	stop();
}

console.log(
	failed.length
		? `\n[31m${failed.length} of ${chosen.length} suites failed: ${failed.join(', ')}[0m`
		: `\n[32mall ${chosen.length} suites passed[0m`
);
process.exit(failed.length ? 1 : 0);
