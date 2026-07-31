import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefox } from 'playwright';

// THE SPACING AUDIT — what the Kashinoga pages actually spend, and where it is off the scale.
//
//   pnpm --filter home audit:space              spawn a server, walk the pages, print the report
//   AUDIT_BASE=http://localhost:5173 …          use a server you are already running
//   AUDIT_PORT=5196 …                           spawn on a different port
//
// This is a TOOL, not a suite. Nothing runs it for you and nothing fails because of it — it is for
// the middle of a change, when you want to know what the page is doing before deciding what it
// should do. The two things that DO fail live elsewhere and are narrower on purpose:
//   • `test/spacing.test.ts` — reads the source, asks that every value came from a `--space-*` rung
//   • `e2e/pixelite.mjs`     — loads the pages, asks that every computed value is a whole pixel
//
// What this adds is the middle ground neither can give you: the actual DISTRIBUTION. Which rungs
// are carrying the page, which are used once, and which elements are spending something that is
// not a rung at all. Spacing goes wrong by drift rather than by breakage — nineteen values that
// each looked reasonable the day it was written — and a distribution is what makes drift visible
// before it is a bug.
//
// It reads COMPUTED styles, so it sees through `clamp()`, `calc()` and custom properties to what
// the browser actually laid out. That is also why it needs a browser at all.

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
const PORT = Number(process.env.AUDIT_PORT ?? 5196);

// The Kashinoga pages: the cover, a prose page, the two full-width sheets, and the longest
// document on the site. Apps are deliberately out — they own their interiors and their own rhythm.
const PAGES = ['/', '/about', '/about/work', '/apps', '/settings', '/apps/densette'];
// Where the clamps sit at their ends, and two widths in the fluid middle between them.
const WIDTHS = [1500, 1100, 860, 390];

const PROPS = [
	'marginTop',
	'marginBottom',
	'marginLeft',
	'marginRight',
	'paddingTop',
	'paddingBottom',
	'paddingLeft',
	'paddingRight',
	'rowGap',
	'columnGap'
];

let server = null;
let base = process.env.AUDIT_BASE ?? null;
if (!base) {
	base = `http://localhost:${PORT}`;
	server = spawn(
		join(APP, 'node_modules', '.bin', 'vite'),
		['dev', '--port', String(PORT), '--strictPort'],
		{ cwd: APP, detached: true, stdio: 'ignore' }
	);
	console.log(`space-audit: spawned a dev server on :${PORT} (pid ${server.pid})`);
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
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (stop(), process.exit(130)));

async function waitForServer(url) {
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 300));
	}
	throw new Error(`Server never came up at ${url}`);
}

const READ = (props) => {
	const out = [];
	for (const el of document.querySelectorAll('[class*="docs-"]')) {
		const s = getComputedStyle(el);
		const who = [...el.classList].filter((c) => !c.startsWith('svelte-'))[0] ?? el.tagName;
		for (const p of props) {
			const v = parseFloat(s[p]);
			if (isNaN(v) || v === 0) continue;
			out.push({ who, prop: p, px: v });
		}
	}
	return out;
};

const browser = await firefox.launch();
const seen = new Map(); // px → { n, who:Set }
try {
	await waitForServer(base);
	for (const w of WIDTHS) {
		const ctx = await browser.newContext({ viewport: { width: w, height: 950 } });
		const page = await ctx.newPage();
		for (const path of PAGES) {
			await page.goto(base + path, { waitUntil: 'networkidle' });
			await page.waitForTimeout(900);
			for (const { who, prop, px } of await page.evaluate(READ, PROPS)) {
				const key = Math.round(px * 100) / 100;
				if (!seen.has(key)) seen.set(key, { n: 0, who: new Set() });
				const e = seen.get(key);
				e.n += 1;
				e.who.add(`${who}.${prop}`);
			}
		}
		await ctx.close();
	}
} finally {
	await browser.close();
	stop();
}

// STRUCTURAL SIZES ARE NOT RHYTHM, and the audit says so rather than flagging them for ever. Each
// of these is the measurement of a THING — a bar, a key — reserved as space by something else. They
// are off the 4px grid because the thing is that size, and rounding the thing to suit a spacing
// scale would be the tail wagging the dog.
const STRUCTURAL = {
	42: "the superbar's height, reserved by the scroller beneath it",
	7: "the search key's optical centring in the bar"
};

const rows = [...seen.entries()].sort((a, b) => a[0] - b[0]);
const onGrid = (px) => px % 4 === 0;

console.log(`\n  ${'px'.padStart(7)}  ${'uses'.padStart(5)}  grid   where`);
console.log('  ' + '─'.repeat(72));
for (const [px, e] of rows) {
	const mark = onGrid(px) ? ' ·  ' : STRUCTURAL[px] ? ' ─  ' : '  ✗ ';
	const who = STRUCTURAL[px]
		? STRUCTURAL[px]
		: [...e.who].slice(0, 3).join(', ') + (e.who.size > 3 ? ` +${e.who.size - 3}` : '');
	console.log(
		`  ${String(px).padStart(7)}  ${String(e.n).padStart(5)}  ${mark}  ${who.slice(0, 60)}`
	);
}

const off = rows.filter(([px]) => !onGrid(px) && !STRUCTURAL[px]);
const total = rows.reduce((n, [, e]) => n + e.n, 0);
console.log('  ' + '─'.repeat(72));
console.log(
	`  ${rows.length} distinct values over ${total} declarations, ${PAGES.length} pages × ${WIDTHS.length} widths.`
);
if (!off.length) {
	console.log(
		'  Every one is a multiple of 4px, or a structural size (─) that is a thing rather than a gap.\n'
	);
} else {
	console.log(`  ${off.length} OFF THE 4px GRID: ${off.map(([px]) => px + 'px').join(', ')}`);
	console.log('  Each is either a rung that should exist, or a literal that should be a rung.\n');
}
// Always exits 0. It reports; the two checks that judge are named at the top of this file.
