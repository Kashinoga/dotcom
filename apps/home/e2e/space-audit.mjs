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
// document on the site. The Emoji Viewer earns its place: it is the only page whose superbar grows
// a SEARCH KEY, and that key cancels the bar's right padding with a negative margin. Leave it out
// and the report is silent about the one control the whole scale was built after.
//
// AND THE TEXT EDITOR, which is an APP and was deliberately out of the first pass — an app owns
// its interior. It is in now because "owns its interior" turned out to mean thirty-one distinct
// spacings, twenty-two of them off the grid. Each page names the class prefix its own elements
// wear, because there is no one selector that means "this surface's own boxes".
const PAGES = [
	{ path: '/', scope: 'docs-' },
	{ path: '/about', scope: 'docs-' },
	{ path: '/about/work', scope: 'docs-' },
	{ path: '/apps', scope: 'docs-' },
	{ path: '/settings', scope: 'docs-' },
	{ path: '/apps/densette', scope: 'docs-' },
	{ path: '/apps/emoji-viewer', scope: 'docs-' },
	// PROOF as well as WRITE: the rendered document's rhythm — headings, lists, listings, quotes —
	// is not on screen at all in WRITE, so a walk that only loads the page misses every value in it.
	{ path: '/apps/text-editor', scope: 'te-', proof: true }
];

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

const READ = ({ props, scope }) => {
	const out = [];
	// AN `auto` MARGIN IS NOT A SPACING DECISION — it is "push this to the far end", and what it
	// resolves to is whatever width happens to be left over. The editor's running foot ends with
	// `margin: 0 0 0 auto` on its lamp, which reported as 388.17px, 620.17px and 1020.17px: three
	// rows in the distribution from ONE declaration, none of them a number anybody chose.
	// `test/spacing.test.ts` already exempts `auto` — it reads the source and can see the keyword.
	//
	// This reads COMPUTED style, where `auto` has already become a used value, so the keyword has
	// to be recovered from the stylesheets. Typed OM would answer directly and was tried first;
	// MEASURED, Firefox has no `computedStyleMap` at all, so that route reports nothing and the
	// noise stays. Walking the sheets works in every engine.
	//
	// Cheap despite appearances: the rules are filtered ONCE per page down to the few that declare
	// an auto margin, and only those are matched against each element.
	const autoRules = [];
	for (const sheet of document.styleSheets) {
		let rules;
		try {
			rules = sheet.cssRules;
		} catch {
			continue; // cross-origin, and nothing here is
		}
		for (const rule of rules) {
			if (!rule.selectorText || !rule.style) continue;
			const which = new Set();
			for (const side of ['Top', 'Bottom', 'Left', 'Right'])
				if (rule.style[`margin${side}`] === 'auto') which.add(`margin${side}`);
			if (which.size) autoRules.push({ sel: rule.selectorText, which });
		}
	}
	const autoFor = (el) => {
		const set = new Set();
		for (const { sel, which } of autoRules) {
			let hit = false;
			try {
				hit = el.matches(sel);
			} catch {
				/* a selector this engine will not parse */
			}
			if (hit) for (const w of which) set.add(w);
		}
		return set;
	};
	// `[class*="te-"]` alone would also catch any class with those two letters inside it, so the
	// prefix is anchored: either the class list starts with it, or it follows a space.
	const sel = `[class^="${scope}"], [class*=" ${scope}"]`;
	for (const el of document.querySelectorAll(sel)) {
		const s = getComputedStyle(el);
		const who = [...el.classList].filter((c) => !c.startsWith('svelte-'))[0] ?? el.tagName;
		for (const p of props) {
			if (autoFor(el).has(p)) continue;
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
		for (const { path, scope, proof } of PAGES) {
			await page.goto(base + path, { waitUntil: 'networkidle' });
			await page.waitForTimeout(900);
			// SCROLLED, or the report is missing the chrome most likely to be wrong. The superbar's
			// separator and its search key are not in the DOM until the bar marks itself scrolled, and
			// both cancel a bar inset with a negative margin — the exact shape that goes stale when the
			// bar changes. An audit taken at rest walks past them and prints a clean page.
			await page.evaluate(() => document.querySelector('.docs-scroll')?.scrollTo({ top: 600 }));
			await page.waitForTimeout(600);
			const take = async () => {
				for (const { who, prop, px } of await page.evaluate(READ, { props: PROPS, scope })) {
					const key = Math.round(px * 100) / 100;
					if (!seen.has(key)) seen.set(key, { n: 0, who: new Set() });
					const e = seen.get(key);
					e.n += 1;
					e.who.add(`${who}.${prop}`);
				}
			};
			await take();
			if (proof) {
				const key = page.getByRole('button', { name: /^PROOF$/i });
				if (await key.count()) {
					await key.first().click();
					await page.waitForTimeout(800);
					await take();
				}
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
	7: "the search key's optical centring in the bar",
	// The editor's margin-mark column: 2.6rem of gutter for the marks, plus --te-pad. A COLUMN's
	// width reserved as padding by the sheet beside it, and it feeds the wrap invariant besides.
	65.6: "the editor's margin-mark column (--te-margin + --te-pad)",
	51.2: "…the same column at the phone's type size",
	2: "room for a key's focus ring inside the bar's scrolling strip",
	// 7px of optical centring less the bar's own 1px transparent border. Derived from the dense
	// bar's pinned height and the 28px control line, exactly like the 7px above.
	6: "the dense bar's inset, matched to its vertical (1px border + 6px = 7px)",
	// 7px − 12px. The key wants to sit 7px off the bar's right edge (half the 42−28 difference,
	// so its air matches top and bottom); the bar already pads 12px. The pull is the arithmetic
	// between two numbers that are each correct, and it is not a rung in its own right.
	'-5': "the search key's pull against the bar's own right padding"
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
