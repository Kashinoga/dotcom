import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefox } from 'playwright';

// Computed-style snapshots of THE PIXELITE DOCS BODIES — the sheet, the cover, the prose measure
// and the two grids that ride on them.
//
//   node e2e/docs-snap.mjs --save     record the baseline (writes e2e/snapshots/docs/*.json)
//   node e2e/docs-snap.mjs            compare against it; exit 1 on any drift
//   node e2e/docs-snap.mjs --save apps   …only the states whose names match
//   SNAP_BASE=http://localhost:5173 node e2e/docs-snap.mjs    use a server you're running
//   SNAP_PORT=5297 node e2e/docs-snap.mjs                     spawn on a different port
//
// WHY THIS EXISTS. Sky-snap's argument, applied to the other half of the split: what a refactor
// breaks when CSS moves between components is not the picture, it is the CASCADE. A rule whose
// selector no longer matches because the element it names is now built in a DIFFERENT component
// fails SILENTLY — Svelte scopes `.a .b` as `.a.svelte-x .b.svelte-x`, and a `.b` built by a
// snippet handed in from elsewhere carries the OTHER file's hash. Nothing errors; the rule simply
// stops applying. That is invisible to `svelte-check`, invisible to the unit tests, and invisible
// to any assertion that only asks whether an element exists.
//
// The docs pages are not live-data pages, so a screenshot would also work — but a screenshot says
// "something moved" where this says WHICH PROPERTY on WHICH ELEMENT, which is the shape of the
// bug being hunted. The one live reading in the set (Weather) is aborted, as sky-snap aborts it,
// because what is under test here is the SHEET the reading rides on, not the reading.
//
// SCOPE HASHES ARE NORMALISED (`svelte-1abc2de` → `svelte-*`), for exactly the reason sky-snap
// normalises them: moving CSS between components changes those hashes BY DESIGN. What survives
// the normalisation is the failure that matters — a rule that stopped applying shows up as a
// changed VALUE, and an entrance whose @keyframes was left behind drops out of getAnimations().

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
const SNAPS = join(HERE, 'snapshots', 'docs');
const PORT = Number(process.env.SNAP_PORT ?? 5197);

const argv = process.argv.slice(2);
const SAVE = argv.includes('--save');
const filters = argv.filter((a) => !a.startsWith('--'));

// ── The states ────────────────────────────────────────────────────────────────────────────────
// One per BRANCH of the pixeliteBody snippet, not one per page — the snippet forks four ways
// (Densette bare, the full-bleed readings, Apps, Settings, and the block-page default), and each
// fork lays its head and its measure out differently. Then the same five at 390px, because the
// phone rules are where the cover comes off the sheet and the measure cap is lifted, and those
// two rules between them decide what every docs page looks like in a hand.
const WIDE = { width: 1500, height: 950 };
const PHONE = { width: 390, height: 844 };
const SHAPES = [
	// The block page — a capped sheet, prose held to 72ch, the serif cover printed on it. Two of
	// them: one that is a section root and one a leaf, because the shell's crumbs differ and the
	// sheet must not.
	{ name: 'block-about', route: '/about' },
	{ name: 'block-work', route: '/about/work' },
	// Apps — a FULL-WIDTH sheet whose card shelf flattens into one auto-fill grid. The cards are
	// built by the page's own appCards snippet, so every `.app-page .app-cols` rule here is a
	// cross-component selector and exactly the kind this file exists to watch.
	{ name: 'apps', route: '/apps' },
	// Settings — the other cross-component grid: `.docs-settings` is the wrapper, `.stg-group` is
	// the page's, and the four rules that tune one against the other all reach across the seam.
	{ name: 'settings', route: '/settings' },
	// A full-bleed reading — its head sits directly ON the sheet rather than inside .docs-prose,
	// which is the arrangement the phone rule's descendant selector has to reach as well.
	{ name: 'bleed-emoji', route: '/apps/emoji-viewer' },
	{ name: 'bleed-court', route: '/apps/court-of-public-opinion' },
	{ name: 'bleed-weather', route: '/apps/weather' },
	// Densette renders BARE — no sheet, no cover, no prose column. The claim is an ABSENCE, and
	// the counts are how it is asserted.
	{ name: 'densette', route: '/apps/densette' }
];
const STATES = [
	...SHAPES.map((s) => ({ ...s, viewport: WIDE })),
	...SHAPES.map((s) => ({ ...s, name: `${s.name}-phone`, viewport: PHONE }))
];

// The docs body's own elements, plus the page-built ones the docs rules reach ACROSS the seam to
// style. Read top-down the way the page is built: the sheet, the cover on it, the measure inside
// it, then the two grids and the content the prose rules dress.
const SELECTORS = [
	'html',
	'.docs-sheet',
	'.docs-sheet.prose',
	'.docs-sheet.app-page',
	'.docs-page-head',
	'.docs-page-title',
	'.docs-prose',
	// Built by the page's appBody/appCards snippets — every one of these is styled by a rule that
	// starts inside the docs body and ends outside it.
	'.docs-prose > p',
	'.docs-prose blockquote',
	'.docs-prose pre',
	'.docs-prose code',
	'.docs-prose pre code',
	'.app-page .app-cols',
	{ sel: '.app-page .app-cols > .app-cards', counted: true },
	{ sel: '.app-card', sampled: true },
	'.docs-settings',
	{ sel: '.docs-settings .stg-group', sampled: true },
	'.docs-settings .stg-group > .seg-lead',
	// The Emoji wall's search bar — the one `:global()` the docs sheet already carried, and the
	// proof that the bleed-cancelling rule still lands after the move.
	'.docs-sheet .ev-searchbar',
	// Densette's own root, so the bare branch is asserted by PRESENCE as well as by the absence of
	// every sheet selector above it — "renders bare" is two claims, and a count of zero is only one.
	'.dens',
	'.dens .chap'
].map((s) => ({ counted: true, sampled: true, ...(typeof s === 'string' ? { sel: s } : s) }));

// Runs before anything on the page does, and keeps running: every frame it folds whatever is
// currently animating into one set. The entrance being watched here lasts 0.45s and is over before
// the page is quiet enough to read, so the list has to be gathered as it happens — not asked for
// afterwards, when it is always empty. Cheap: a set add per animation per frame, on a page that
// stops animating almost immediately.
const WATCH = () => {
	window.__anims = new Set();
	const tick = () => {
		for (const a of document.getAnimations()) {
			const t = a.effect?.target;
			const who = t ? t.className || t.tagName.toLowerCase() : '?';
			window.__anims.add(`${who} | ${a.animationName ?? a.transitionProperty ?? '?'}`);
		}
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
};

// Pixelite is the default and ships hard-coded on <html>, so no look seed is needed — but the
// theme is pinned so a machine's own dark mode can never decide what the sheet's stock resolves
// to, and the sky is turned off because none of it is drawn under Pixelite anyway.
const DEFAULT_SEED = { 'ksh-theme': 'light', 'ksh-sky': 'off' };

// ── The reading ───────────────────────────────────────────────────────────────────────────────
// Sky-snap's reader, minus the star-field allowance: nothing on a docs page is placed by inline
// style, so every element here gets the full property sweep and a rect.
const READ = (selectors) => {
	const norm = (s) => String(s).replace(/svelte-[a-z0-9]+/g, 'svelte-*');
	const read = (el) => {
		const cs = getComputedStyle(el);
		const props = {};
		for (let i = 0; i < cs.length; i++) {
			const prop = cs[i];
			const val = cs.getPropertyValue(prop);
			if (val !== '') props[prop] = norm(val);
		}
		const r = el.getBoundingClientRect();
		return {
			rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
			props
		};
	};
	const counts = {};
	const nodes = {};
	for (const { sel, counted, sampled } of selectors) {
		const all = document.querySelectorAll(sel);
		if (counted) counts[sel] = all.length;
		if (!sampled) continue;
		// Three of a repeated element prove the rule that styles them; the rest prove a for-loop ran.
		nodes[sel] = [...all].slice(0, 3).map(read);
	}
	// Everything that EVER animated on this page, gathered frame by frame from the very first one
	// by the init script (see WATCH). An animation is listed only if its @keyframes RESOLVED, which
	// is the one way to catch a keyframe left behind by a refactor — a dangling animation-name
	// still computes to its own name, so no computed value can tell you.
	//
	// Sampled from load rather than read at the end, and that distinction is the whole check: the
	// docs entrance is 0.45s and finishes long before the page settles, so `getAnimations()` asked
	// at reading time returns an empty list on every page whether the keyframes resolved or not.
	// (Measured — the first baseline recorded "0 animations" for all sixteen states.)
	const animations = [...(window.__anims ?? [])].map(norm).sort();
	const attrs = {};
	for (const a of document.documentElement.attributes) attrs[a.name] = norm(a.value);
	return { attrs, counts, nodes, animations };
};

// ── Server ────────────────────────────────────────────────────────────────────────────────────
// `detached` puts vite in its own process group so one kill takes it and nothing else. Never a
// pattern kill — a dev server you are running yourself must survive this.
let server = null;
let base = process.env.SNAP_BASE ?? null;
if (!base) {
	base = `http://localhost:${PORT}`;
	server = spawn(
		join(APP, 'node_modules', '.bin', 'vite'),
		['dev', '--port', String(PORT), '--strictPort'],
		{ cwd: APP, detached: true, stdio: 'ignore' }
	);
	console.log(`docs-snap: spawned a dev server on :${PORT} (pid ${server.pid})`);
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
			const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
			if (r.ok) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 300));
	}
	throw new Error(`Server never came up at ${url}`);
}

// ── Diff ──────────────────────────────────────────────────────────────────────────────────────
// One line per differing leaf, deliberately flat: "this property, on this element, in this state,
// changed from X to Y" is the shape of a cascade bug.
function diff(a, b, path = '', out = []) {
	if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
		if (JSON.stringify(a) !== JSON.stringify(b))
			out.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
		return out;
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		// Two samples of the same element are walked INDEX BY INDEX, so a single changed property
		// prints as one line about that property. Compared whole, the pair prints as two complete
		// computed-style objects — measured at 257KB for one broken rule, which buries the answer
		// in the evidence. Lengths that disagree are a different claim (an element gained or lost)
		// and are still reported as one line, because then the indices no longer line up.
		if (JSON.stringify(a) === JSON.stringify(b)) return out;
		// A list of plain values (a rect, the animation names) is short enough to print whole, and
		// reads better that way than as a per-index walk.
		const flat = (x) => Array.isArray(x) && x.every((v) => typeof v !== 'object' || v === null);
		if (flat(a) && flat(b)) {
			out.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
			return out;
		}
		if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
			for (let i = 0; i < a.length; i++) diff(a[i], b[i], `${path}[${i}]`, out);
			return out;
		}
		out.push(`${path}: ${a?.length ?? '?'} entries → ${b?.length ?? '?'} entries`);
		return out;
	}
	for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
		if (!(k in a)) out.push(`${path}/${k}: ABSENT → ${JSON.stringify(b[k])}`);
		else if (!(k in b)) out.push(`${path}/${k}: ${JSON.stringify(a[k])} → ABSENT`);
		else diff(a[k], b[k], `${path}/${k}`, out);
	}
	return out;
}

// ── Run ───────────────────────────────────────────────────────────────────────────────────────
mkdirSync(SNAPS, { recursive: true });
const chosen = filters.length
	? STATES.filter((s) => filters.some((f) => s.name.includes(f)))
	: STATES;
if (!chosen.length) {
	console.error(`docs-snap: no state matches ${filters.join(', ')}`);
	process.exit(1);
}

let drifted = 0;
let saved = 0;
const browser = await firefox.launch();
try {
	await waitForServer(base);
	for (const state of chosen) {
		const ctx = await browser.newContext({
			viewport: state.viewport,
			// Pinned, so a 'System' display mode can never make the run depend on the machine.
			colorScheme: 'light',
			deviceScaleFactor: 1
		});
		const page = await ctx.newPage();
		await page.addInitScript(WATCH);
		// The live readings are aborted, not stubbed: what is under test is the SHEET, and a page
		// whose fetch failed still lays its head, its measure and its paper out exactly the same.
		for (const api of ['weather', 'traffic', 'places', 'wallpaper', 'aita'])
			await page.route(`**/api/${api}*`, (r) => r.abort());

		// Seed, then load: static/preflight.js reads localStorage before the first frame, so the
		// settings have to be there before the page that uses them.
		await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
		await page.evaluate((kv) => {
			for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
		}, DEFAULT_SEED);
		await page.goto(`${base}${state.route}`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1200);

		// PLANT A CODE BLOCK. `appBody` renders a `code` block as <pre><code>…</code></pre> inside
		// .docs-prose, and the docs voice dresses both — but no page's copy carries one today, so
		// those two rules ship with no coverage at all and a snapshot taken as-is would record a
		// count of zero and call it a baseline. Planted rather than written into content.json:
		// content is the site's copy, not a fixture, and a paragraph of Lorem in a real page to
		// hold a CSS rule is a worse trade than a few lines here.
		//
		// IT MUST WEAR THE PAGE'S SCOPE CLASS, and that is the whole subtlety. A bare <pre> carries
		// no `svelte-hash` at all, so a SCOPED rule cannot reach it and a GLOBAL one can — which
		// means an unmarked plant records "unstyled" against one arrangement of the CSS and
		// "styled" against the other, and reports a difference between the two that says nothing
		// about whether real content is dressed. (Measured: planted bare, the old code gave it
		// `font-family: monospace` and no border — the UA default, the rule never landing.) So the
		// class is copied off an element the page really built, and the plant then stands in for
		// the code block appBody would have built in that same spot: reached by a scoped rule and
		// by a global one alike, and styled identically by either.
		await page.evaluate(() => {
			const prose = document.querySelector('.docs-prose');
			if (!prose) return;
			// Any page-built sibling will do — they all carry the same one.
			const sibling = prose.querySelector('p, blockquote, h2, h3');
			const scope = [...(sibling?.classList ?? [])].filter((c) => c.startsWith('svelte-'));
			const pre = document.createElement('pre');
			const code = document.createElement('code');
			code.textContent = 'planted --by e2e/docs-snap.mjs';
			pre.classList.add(...scope);
			code.classList.add(...scope);
			pre.append(code);
			prose.append(pre);
		});

		// Freeze whatever is STILL running at its first frame. The docs entrance is long over by
		// now (WATCH is what catches that one); this is for anything looping — read mid-flight, a
		// loop reports whatever opacity or offset the clock caught it at, and no two runs agree.
		await page.evaluate(() => {
			for (const a of document.getAnimations()) {
				try {
					a.pause();
					a.currentTime = 0;
				} catch {
					/* an animation that refuses to seek is one we simply read as it stands */
				}
			}
		});
		await page.waitForTimeout(150);

		const shot = await page.evaluate(READ, SELECTORS);
		await ctx.close();

		const file = join(SNAPS, `${state.name}.json`);
		if (SAVE) {
			writeFileSync(file, JSON.stringify(shot, null, '\t') + '\n');
			const drawn = Object.entries(shot.counts)
				.filter(([, n]) => n)
				.map(([s, n]) => `${s}×${n}`)
				.join(' ');
			console.log(`SAVE  ${state.name}  — ${shot.animations.length} animations, ${drawn}`);
			saved++;
		} else if (!existsSync(file)) {
			console.log(`MISS  ${state.name}  — no baseline; run with --save`);
			drifted++;
		} else {
			const lines = diff(JSON.parse(readFileSync(file, 'utf8')), shot);
			if (!lines.length) console.log(`SAME  ${state.name}`);
			else {
				console.log(`DRIFT ${state.name}  — ${lines.length} differences`);
				for (const l of lines.slice(0, 40)) console.log(`        ${l}`);
				if (lines.length > 40) console.log(`        …and ${lines.length - 40} more`);
				drifted++;
			}
		}
	}
} finally {
	await browser.close();
	stop();
}

console.log(
	SAVE
		? `\ndocs-snap: saved ${saved} baseline${saved === 1 ? '' : 's'} to e2e/snapshots/docs/`
		: `\ndocs-snap: ${chosen.length - drifted}/${chosen.length} states unchanged`
);
process.exit(!SAVE && drifted ? 1 : 0);
