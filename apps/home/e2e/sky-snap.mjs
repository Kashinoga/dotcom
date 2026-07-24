import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefox } from 'playwright';

// Computed-style snapshots of THE SKY — the verification the sky can't get any other way.
//
//   node e2e/sky-snap.mjs --save     record the baseline (writes e2e/snapshots/sky/*.json)
//   node e2e/sky-snap.mjs            compare against it; exit 1 on any drift
//   node e2e/sky-snap.mjs --save night-dark   …only the states whose names match
//   SNAP_BASE=http://localhost:5173 node e2e/sky-snap.mjs      use a server you're running
//   SNAP_PORT=5298 node e2e/sky-snap.mjs                       spawn on a different port
//
// WHY THIS EXISTS. The sky is one of the six live-data pages: it reads the real clock, the real
// weather and Bing's photo of the day, so two runs never paint the same pixels and a screenshot
// diff proves nothing about it. But the thing a refactor breaks is not the picture — it is the
// CASCADE: a rule that stopped matching because its selector moved out of scope, a keyframe left
// behind when its animation moved to a component, a custom property that resolves to nothing now
// that it is declared in a different file. All of that is visible in the COMPUTED styles, and
// those are stable run to run once the live inputs are pinned. So: pin the inputs, freeze the
// motion, and record every resolved property of every element the sky draws.
//
// HOW THE INPUTS ARE PINNED. Three sources of variation, three answers:
//   • the clock — `ksh-sky` pins a phase by hand, so nothing consults the time of day.
//   • the weather — /api/weather is aborted, so the stage keeps its default (no overcast). The
//     overcast branch is reached through the sky console's own Weather Feature row instead: a
//     click, not a stub, so no upstream shape has to be mirrored here.
//   • the photo — /api/wallpaper is answered with ONE photo, which also settles the page's
//     "pick one of the eight at random" (with one to pick, the random pick is a constant).
//
// AND THE MOTION. Every animation is paused at time 0 before anything is read. Otherwise a
// twinkling star reports whatever opacity it happened to be at, and every run drifts against
// every other run for reasons that have nothing to do with the code.
//
// SCOPE HASHES ARE NORMALISED (`svelte-1abc2de` → `svelte-*`) in every value read. Svelte hashes
// a component's class names and its @keyframes names, and moving CSS between components changes
// those hashes BY DESIGN — comparing them raw would report a diff on every line of a refactor
// whose whole point is to move CSS between components. What the normalisation does NOT hide is
// the failure that matters: a rule that no longer applies shows up as a changed VALUE, and an
// animation whose keyframes were left behind disappears from document.getAnimations() (a
// dangling animation-name still computes to its own name — the running-animations list is the
// check that catches it).

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
const SNAPS = join(HERE, 'snapshots', 'sky');
const PORT = Number(process.env.SNAP_PORT ?? 5198);

const argv = process.argv.slice(2);
const SAVE = argv.includes('--save');
const filters = argv.filter((a) => !a.startsWith('--'));

// ── The states ────────────────────────────────────────────────────────────────────────────────
// One per branch the sky's CSS actually forks on, not one per combination — the matrix is the
// gradient phases (each has its own cloud tinting), the two decor toggles (stars, clouds), the
// photo sky (a different set of layers entirely), Off (nothing painted, which is its own claim),
// the panel-driven hide (decorHidden), and the phone. Anything the sky does is reachable from
// this list; anything it doesn't do isn't worth a file.
const STATES = [
	{ name: 'night-dark', seed: { 'ksh-sky': 'night', 'ksh-theme': 'dark' } },
	{ name: 'noon-light', seed: { 'ksh-sky': 'noon', 'ksh-theme': 'light' } },
	{ name: 'dawn-light', seed: { 'ksh-sky': 'dawn', 'ksh-theme': 'light' } },
	{ name: 'dusk-dark', seed: { 'ksh-sky': 'dusk', 'ksh-theme': 'dark' } },
	{ name: 'morning-light', seed: { 'ksh-sky': 'morning', 'ksh-theme': 'light' } },
	// Stars off: the star field must be GONE, not merely transparent.
	{ name: 'night-nostars', seed: { 'ksh-sky': 'night', 'ksh-theme': 'dark', 'ksh-stars': '0' } },
	// The photo sky — its own layers (picture, veil, credit), and data-sky-photo suppressing the
	// server-rendered star field.
	{ name: 'photo', seed: { 'ksh-sky': 'photo', 'ksh-theme': 'light' }, photo: true },
	// Off — the claim is that nothing paints, so the counts are the assertion.
	{ name: 'off', seed: { 'ksh-sky': 'off', 'ksh-theme': 'light' } },
	// The hand-picked stage weather, reached through the sky console rather than by stubbing an
	// upstream. Each one summons a different set of layers — thickened clouds, falling rain or
	// snow, a fog bank over a veil, a lightning sheet — and every one of them is a separate
	// arrangement of elements that a refactor can drop on the floor.
	{ name: 'noon-overcast', seed: { 'ksh-sky': 'noon', 'ksh-theme': 'light' }, feature: /^Clouds$/ },
	{ name: 'noon-rain', seed: { 'ksh-sky': 'noon', 'ksh-theme': 'light' }, feature: /^Rain$/ },
	{ name: 'noon-snow', seed: { 'ksh-sky': 'noon', 'ksh-theme': 'light' }, feature: /^Snow$/ },
	{ name: 'noon-fog', seed: { 'ksh-sky': 'noon', 'ksh-theme': 'light' }, feature: /^Fog$/ },
	{ name: 'dusk-storm', seed: { 'ksh-sky': 'dusk', 'ksh-theme': 'dark' }, feature: /^Storm$/ },
	// A panel open over the stage: decorHidden, the decor's other exit.
	{ name: 'panel-open', route: '/about', seed: { 'ksh-sky': 'night', 'ksh-theme': 'dark' } },
	// The phone — the decor's mobile rules, and the sky console at a width that has to fold.
	{
		name: 'night-phone',
		viewport: { width: 390, height: 844 },
		seed: { 'ksh-sky': 'night', 'ksh-theme': 'dark' }
	}
];

// Every element the sky draws, plus the two boxes that react to it (the stage it paints on, the
// panel backdrop that goes translucent under a photo). Read in this order in the file so a diff
// reads top-down like the layers do.
//
// `counted: false` marks a selector whose POPULATION is a dice roll. Which stars twinkle is
// decided per load, so `.stars span.tw` has a different length every run — but each of the two
// kinds still has to be STYLED the same way, which is why they are sampled separately at all: a
// sample of "the first three spans" mixes twinkling and still stars in whatever proportion the
// dice gave, and then even the animation-name of a sample disagrees run to run. Split by class,
// each sample is one ruleset. The stable total (`.stars span`) is counted right above them.
const SELECTORS = [
	'html',
	'.stage',
	'.photo-bg',
	'.photo-veil',
	'.photo-credit',
	'.photo-credit-row',
	'.photo-toggle',
	'.photo-link',
	'.clouds',
	'.cloud-layer.cloud-far',
	'.cloud-layer.cloud-near',
	'.stars',
	// Counted, never sampled: the field's SIZE is fixed, but which of its spans come first is not,
	// so a sample taken here is a random mix of the two kinds and disagrees with itself run to run.
	{ sel: '.stars span', sampled: false },
	{ sel: '.stars span.tw', counted: false },
	{ sel: '.stars span:not(.tw):not(.shoot)', counted: false },
	'.stars .shoot',
	'.sky-console',
	'.sky-pop',
	'.sky-group',
	'.sky-lab',
	'.sky-row',
	'.fx-rain',
	{ sel: '.fx-rain span', sampled: false },
	{ sel: '.fx-rain span:first-child', counted: false },
	'.fx-snow',
	{ sel: '.fx-snow span', sampled: false },
	{ sel: '.fx-snow span:first-child', counted: false },
	'.fx-fog',
	'.fog-veil',
	'.fog-band.fog-a',
	'.fog-band.fog-d',
	'.fx-flash',
	'.surface-backdrop'
].map((s) => ({ counted: true, sampled: true, ...(typeof s === 'string' ? { sel: s } : s) }));

const DEFAULT_SEED = { 'ksh-look': 'aeropalite' };

const PHOTO_STUB = {
	photos: [
		{
			// A 1×1 transparent GIF: the picture's BYTES are not what is being snapshotted, and an
			// inline one keeps the run off the network entirely.
			url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
			uhd: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
			thumb: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
			title: 'A pinned photo',
			copyright: 'Nobody (Snapshot stub)',
			copyrightlink: 'https://example.invalid/',
			date: '20260724'
		}
	]
};

// ── The reading ───────────────────────────────────────────────────────────────────────────────
// Runs in the page. Everything it returns must be stable across runs of IDENTICAL code, which is
// the whole bargain — a check that cries drift on its own is worth nothing.
//
// The star field is where that bargain is nearly lost. `makeStars()` builds a FRESH RANDOM field
// on every load, by design: a different night sky each visit is a feature, not a defect (see the
// note at STARS). So a star's own numbers — where it sits, how big it is, how long its twinkle
// takes — are dice, and dice must not be in a snapshot. What IS in the contract is the rule that
// styles a star: its shape, its colour, the NAME of the animation it runs.
//
// So: any property the page set INLINE on an element is skipped, as is every property that
// merely follows from those (a span's size decides its block-size, its perspective origin, its
// rect). One rule, applied generically — nothing here has to know that stars are the reason.
const READ = (selectors) => {
	const norm = (s) => String(s).replace(/svelte-[a-z0-9]+/g, 'svelte-*');
	// An element the page placed by hand gets an ALLOWLIST instead of every property. Chasing the
	// dice property by property is whack-a-mole: skipping the inline ones leaves the ones computed
	// from them (block-size from an inline width), and skipping those still leaves the ones a
	// keyframe reads out of an inline CUSTOM property (a shooting star's rotate(), off --ang).
	// Custom properties are not enumerable on a computed style, so there is no way to see it
	// coming — only a positive list is safe. These are the properties that say what a star IS: a
	// small round dot, its colour, its glow, and the name of the animation it runs. Everything a
	// refactor could break about it, and nothing a random number decides.
	const ALLOW = new Set([
		'display',
		'position',
		'background-color',
		'background-image',
		'background-size',
		'border-top-left-radius',
		'border-bottom-right-radius',
		'box-shadow',
		'filter',
		'mix-blend-mode',
		'z-index',
		'pointer-events',
		'will-change',
		'animation-name',
		'animation-direction',
		'animation-fill-mode',
		'animation-iteration-count',
		'animation-timing-function'
	]);
	const read = (el) => {
		const inline = new Set(el.style);
		const cs = getComputedStyle(el);
		const props = {};
		for (let i = 0; i < cs.length; i++) {
			const prop = cs[i];
			if (inline.size && !ALLOW.has(prop)) continue;
			const val = cs.getPropertyValue(prop);
			if (val !== '') props[prop] = norm(val);
		}
		// An element placed by inline styles has a rect made of dice; one placed by the cascade
		// has a rect that IS the claim.
		let rect = null;
		if (!inline.size) {
			const r = el.getBoundingClientRect();
			rect = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
		}
		return { rect, props };
	};
	const counts = {};
	const nodes = {};
	for (const { sel, counted, sampled } of selectors) {
		const all = document.querySelectorAll(sel);
		if (counted) counts[sel] = all.length;
		if (!sampled) continue;
		// Three of a repeated element prove the rule that styles them; the other seventy-eight
		// only prove that a for-loop ran.
		nodes[sel] = [...all].slice(0, 3).map(read);
	}
	// What is animating, and with what. NOT each animation's timing — a star's twinkle is as long
	// as its own random number — and not a count either, because how many of the eighty-one stars
	// drew the twinkling class is another roll of the same dice. Presence is what carries the
	// weight here: an animation appears in this list only if its @keyframes RESOLVED, so a
	// keyframe left behind by a refactor drops its whole entry. No computed value can tell you
	// that — a dangling animation-name still computes to its own name.
	const seen = new Set();
	for (const a of document.getAnimations()) {
		const t = a.effect?.target;
		const who = t ? norm(t.className || t.tagName.toLowerCase()) : '?';
		seen.add(`${who} | ${norm(a.animationName ?? a.transitionProperty ?? '?')}`);
	}
	const animations = [...seen].sort();
	const attrs = {};
	for (const a of document.documentElement.attributes) attrs[a.name] = norm(a.value);
	return { attrs, counts, nodes, animations };
};

// ── Server ────────────────────────────────────────────────────────────────────────────────────
// The same arrangement run.mjs uses, and for the same reason: `detached` puts vite in its own
// process group so one kill takes it and nothing else. Never a pattern kill — a dev server you
// are running yourself must survive this.
let server = null;
let base = process.env.SNAP_BASE ?? null;
if (!base) {
	base = `http://localhost:${PORT}`;
	server = spawn(
		join(APP, 'node_modules', '.bin', 'vite'),
		['dev', '--port', String(PORT), '--strictPort'],
		{
			cwd: APP,
			detached: true,
			stdio: 'ignore'
		}
	);
	console.log(`sky-snap: spawned a dev server on :${PORT} (pid ${server.pid})`);
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
// Walks two snapshots together and returns one line per differing leaf. Deliberately flat: the
// output is meant to be read as "this property, on this element, in this state, changed from X
// to Y" — the shape of a cascade bug — not as a structural diff of two documents.
function diff(a, b, path = '', out = []) {
	if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
		if (JSON.stringify(a) !== JSON.stringify(b))
			out.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
		return out;
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (JSON.stringify(a) !== JSON.stringify(b))
			out.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
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
	console.error(`sky-snap: no state matches ${filters.join(', ')}`);
	process.exit(1);
}

let drifted = 0;
let saved = 0;
const browser = await firefox.launch();
try {
	await waitForServer(base);
	for (const state of chosen) {
		const ctx = await browser.newContext({
			viewport: state.viewport ?? { width: 1500, height: 950 },
			// Pinned, so a 'System' display mode can never make the run depend on the machine.
			colorScheme: 'light',
			deviceScaleFactor: 1
		});
		const page = await ctx.newPage();
		// The weather is aborted rather than stubbed: the stage's default (no overcast) is a state
		// worth snapshotting on its own, and the overcast branch is reached by clicking the sky
		// console instead. Nothing here has to know the NWS's JSON.
		await page.route('**/api/weather*', (r) => r.abort());
		await page.route('**/api/wallpaper*', (r) =>
			r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PHOTO_STUB) })
		);

		// Seed, then load: the pre-paint script in app.html reads localStorage before the first
		// frame, so the settings have to be there before the page that uses them.
		await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
		await page.evaluate(
			(kv) => {
				for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
			},
			{ ...DEFAULT_SEED, ...state.seed }
		);
		await page.goto(`${base}${state.route ?? '/'}`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1500);

		if (state.feature) {
			// The sky console's Weather Feature row — the hand-picked stage weather. These are the
			// same chips a reader presses, so the state is reached the way it is really reached:
			// through the console's callback, the page's own state, and out to the layers. That
			// makes each of these a check on the console as much as on what it summons.
			const toggle = page.locator('.sky-console button').last();
			if (await toggle.count()) {
				await toggle.click();
				await page.waitForTimeout(400);
				const chip = page
					.locator('.sky-row')
					.last()
					.locator('button', { hasText: state.feature })
					.first();
				if (await chip.count()) await chip.click();
				// Long enough for the slowest layer to finish arriving (the fog bank, 900ms).
				await page.waitForTimeout(1200);
			}
		}

		// Freeze every animation at its first frame. Without this a twinkling star reports whatever
		// opacity the clock caught it at and every run disagrees with every other run.
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
		? `\nsky-snap: saved ${saved} baseline${saved === 1 ? '' : 's'} to e2e/snapshots/sky/`
		: `\nsky-snap: ${chosen.length - drifted}/${chosen.length} states unchanged`
);
process.exit(!SAVE && drifted ? 1 : 0);
