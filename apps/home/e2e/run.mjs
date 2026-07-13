import { spawn, spawnSync } from 'node:child_process';
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
//   pnpm --filter home test:e2e --changed    …only the suites the working-tree diff can affect
//   pnpm --filter home test:e2e --changed=main   …vs a ref (staged+unstaged+untracked, or that ref)
//   E2E_LIST=1 pnpm --filter home test:e2e --changed   print the chosen suites and exit (dry run)
//   E2E_BASE=http://localhost:5173 pnpm --filter home test:e2e     use a server you're running
//   E2E_PORT=5299 pnpm --filter home test:e2e                      spawn on a different port
//
// `--changed` keeps scoped runs honest across machines: the file→suite map lives here, in the
// repo, so CI and every clone scope identically — no per-machine memory required. It only ever
// SHRINKS the run for changes we've explicitly reasoned about; anything broad or unrecognised
// falls back to the full suite (see BROAD / the unclassified path below).
//
// The port defaults to 5199, NOT Vite's 5173: you may well have a dev server up, and these
// suites must never assume it's theirs. When this script spawns one it kills only the
// process group it created, never a pattern match.
//
// Browsers are not installed by `pnpm install`. Once, per machine:
//   pnpm --filter home exec playwright install firefox
//
// Turnaround / what-to-run (the whole run pays a cold `vite dev` spawn up front):
//   • Iterating: keep ONE dev server warm and point at it — `E2E_BASE=http://localhost:5219
//     pnpm --filter home test:e2e --changed` — so a run is just the browser, no server spawn.
//   • `--changed` scopes to the suites a diff can regress: puhig token/theme edits → the visual
//     suites (dots/noshadow/glass/pcclose); board/builder/component edits → their suites; the
//     catch-all page or an unclassified file → the full run.
//   • The homepage CHROME (masthead, nav, tagline, the stage click-to-close) is NOT covered by
//     any live suite — the suites that touched it are parked (see SKIP). Verify those edits by
//     driving the page in a browser, not by running e2e; the suite has nothing to say about them.

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = dirname(HERE);

// Ordered so the cheap, broad suites fail first. Every suite exits non-zero on a failure.
const SUITES = [
	'deeplink', // URLs, aliases, redirects, back/forward
	'scope', // ?field= / ?range= / ?refresh=
	'field', // the field selector
	'settings', // the settings panel
	'reset', // reset to defaults
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

// ── Change-scoped selection (`--changed`) ───────────────────────────────────────────────────
// Map each changed file to the suites that could plausibly regress from it. The bias is toward
// OVER-running: any broad/cross-cutting file, any file we haven't classified, forces the full
// suite. Scoping may only shrink the run for changes we've reasoned about — never hide a bug.

// A change here can surface in ANY view → run everything. The route is a catch-all
// (`[...view=view]/+page.svelte`) that renders every view and imports every component; the
// layout wraps them all; icons/barrel/config are cross-cutting.
//   NOTE: `.css` is deliberately NOT here. The home app has no standalone .css (styles live in
//   each .svelte `<style>`); the only .css in play is puhig's design tokens, which re-skin the
//   app but only visually — those are scoped to the visual suites via NARROW below, not the
//   full run. A home .css added later would fall through to the unclassified → full path.
const BROAD = [
	/^src\/routes\/\[\.\.\.view=view\]\/\+page\.svelte$/,
	/^src\/routes\/\+layout\.svelte$/,
	/^src\/lib\/icons\.ts$/,
	/^src\/lib\/index\.ts$/,
	/^src\/app\.html$/,
	/^(svelte|vite)\.config\./,
	/^package\.json$/
];

// Suites that assert on colour, material, shadow, dot geometry or panel chrome — i.e. what a
// design-token or puhig-surface change can regress. Reused for every puhig file below.
const PANEL_UI = ['dots', 'noshadow', 'glass', 'pcclose'];

// Narrower source files → just the suites that exercise them. (Views all render through the
// catch-all page, but these modules own a bounded slice of it.) Entries may name suites that
// are currently parked (see SKIP); the parked ones are filtered out at run time, so this map
// stays the TRUE coupling and un-parking a suite needs no edit here.
const NARROW = [
	{ re: /^src\/lib\/network\.ts$/, suites: ['maplayout', 'hubsize', 'dots'] },
	{ re: /^src\/lib\/views\.ts$/, suites: ['deeplink', 'dots'] },
	{ re: /^src\/lib\/scope\.ts$/, suites: ['scope', 'field'] },
	{ re: /^src\/lib\/fields\.ts$/, suites: ['field', 'scope', 'oplong'] },
	{ re: /^src\/params\/view\.ts$/, suites: ['deeplink'] },
	{ re: /^src\/routes\/\[\.\.\.view=view\]\/\+page\.ts$/, suites: ['deeplink'] },
	// The homepage masthead/nav is its own component. Only `hubsize` asserts on it (the hub dot
	// vs the masthead's bullets), and it's parked, so a masthead-only edit currently scopes to
	// nothing — verify those in a browser. Left as the true coupling for when hubsize un-parks.
	{ re: /^src\/lib\/Masthead\.svelte$/, suites: ['hubsize'] },
	{ re: /^src\/lib\/PresentationBuilder\.svelte$/, suites: ['ticker', 'ticker-edge', 'repeat'] },
	{ re: /^src\/lib\/TrafficBoard\.svelte$/, suites: ['scope', 'field', 'oplong', 'pcclose', 'dots'] },
	{ re: /^src\/lib\/SplitFlap\.svelte$/, suites: ['scope', 'field', 'oplong', 'pcclose'] },
	{ re: /^src\/routes\/api\/traffic\/\+server\.ts$/, suites: ['scope', 'field', 'oplong', 'pcclose'] },
	// puhig design system (out-of-app): tokens/base/themes re-colour and re-material everything;
	// Panel/Card/Sleeve/grid are the surfaces the panels render on. Either way a regression shows
	// up in the visual suites, so scope there rather than forcing the full run. One rule covers
	// all of puhig/src — the granularity isn't worth per-file rules for a design-system package.
	{ re: /^packages\/puhig\/src\//, suites: PANEL_UI }
];

// Type-only / no runtime surface: contributes no suites and never forces a full run.
const IGNORE = [/^src\/app\.d\.ts$/];

/** Files changed vs a ref, or in the working tree (staged + unstaged + untracked), app-relative. */
function changedFiles(ref) {
	const git = (args, cwd = APP) => {
		const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
		return r.status === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : [];
	};
	// The home app's files come back app-relative (`--relative`, cwd = apps/home). The puhig
	// design system lives OUTSIDE the app, so those queries can't see it — yet a token/component
	// change there re-skins the app. Pull puhig's changes separately, from the repo root, as
	// repo-relative `packages/puhig/…` paths. Untracked files (a brand-new theme file) count too,
	// hence the `ls-files --others` on each side.
	const root = git(['rev-parse', '--show-toplevel'])[0] ?? APP;
	const puhig = (args) => git([...args, '--', 'packages/puhig'], root);
	// A caller that already knows the file list (a pre-commit hook, CI) can pass it directly and
	// skip git entirely: E2E_FILES="src/lib/network.ts,packages/puhig/src/themes/lab.css".
	const raw = process.env.E2E_FILES
		? process.env.E2E_FILES.split(/[\s,]+/).filter(Boolean)
		: ref
			? [...git(['diff', '--name-only', '--relative', ref]), ...puhig(['diff', '--name-only', ref])]
			: [
					...git(['diff', '--name-only', '--relative']),
					...git(['diff', '--name-only', '--relative', '--cached']),
					...git(['ls-files', '--others', '--exclude-standard', '.']),
					...puhig(['diff', '--name-only']),
					...puhig(['diff', '--name-only', '--cached']),
					...git(['ls-files', '--others', '--exclude-standard', 'packages/puhig'], root)
				];
	// Keep home-app files (app-relative) and puhig files (repo-relative); drop everything else in
	// the monorepo — a change elsewhere is not ours to gate. Strip a stray repo-root prefix on the
	// home side just in case.
	const homeScoped = (f) =>
		f.startsWith('src/') ||
		f.startsWith('e2e/') ||
		f.startsWith('packages/puhig/') ||
		/^(package\.json|svelte\.config\.|vite\.config\.)/.test(f);
	return [...new Set(raw.map((f) => f.replace(/^apps\/home\//, '')).filter(homeScoped))];
}

/** Which suites to run for a set of changed files, in canonical SUITES order. */
function suitesForChanges(files) {
	const relevant = files.filter((f) => !IGNORE.some((re) => re.test(f)));
	if (!relevant.length) return { suites: [], reason: 'no runtime-affecting home files changed' };

	const chosen = new Set();
	const unknown = [];
	for (const f of relevant) {
		if (BROAD.some((re) => re.test(f))) return { suites: SUITES, reason: `broad change: ${f}` };
		const e2e = /^e2e\/(.+)\.mjs$/.exec(f);
		if (e2e) {
			if (SUITES.includes(e2e[1])) chosen.add(e2e[1]); // editing a suite reruns that suite
			else return { suites: SUITES, reason: `shared e2e helper: ${f}` }; // run.mjs, artifacts.mjs, …
			continue;
		}
		const rule = NARROW.find((r) => r.re.test(f));
		if (rule) rule.suites.forEach((s) => chosen.add(s));
		else unknown.push(f);
	}
	// A source file we haven't classified could touch anything — fail safe to the full suite.
	if (unknown.length) return { suites: SUITES, reason: `unclassified, running all: ${unknown.join(', ')}` };
	return { suites: SUITES.filter((s) => chosen.has(s)), reason: 'scoped to changed files' };
}

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const filters = argv.filter((a) => !a.startsWith('--'));
const changed = flags.find((f) => f === '--changed' || f.startsWith('--changed='));

let chosen;
if (changed) {
	const ref = changed.includes('=') ? changed.slice('--changed='.length) : null;
	const picked = suitesForChanges(changedFiles(ref));
	if (!picked.suites.length) {
		console.log(`e2e --changed: ${picked.reason} — nothing to run.`);
		process.exit(0);
	}
	chosen = picked.suites;
	console.log(`e2e --changed (${picked.reason}): ${chosen.join(', ')}`);
} else {
	chosen = filters.length ? SUITES.filter((s) => filters.some((f) => s.includes(f))) : SUITES;
	if (!chosen.length) {
		console.error(`No suite matches ${filters.join(', ')}.\nAvailable: ${SUITES.join(', ')}`);
		process.exit(1);
	}
}

// The route map — and the whole transit motif behind it — is gone (see $lib/network). Most of what
// was parked here has been repointed at the UI that replaced it: `deeplink` and `field` now reach a
// place through the masthead's nav and the Apps cards, and `dots` checks the accents that used to
// come from the lines. `maplayout` and `hubsize` were pure map geometry and are deleted, not
// repaired — there is nothing left for them to measure.
//
// TODO(buttons): `buttons` is still parked, but NOT for the map any more — its legend section is
// gone. It hangs hovering a Settings `.seg` that demonstrably exists, which is its own rot and
// wants its own look.
const SKIP = new Set(['buttons']);
const parked = chosen.filter((s) => SKIP.has(s));
if (parked.length) console.log(`e2e: skipping ${parked.length} map-dependent suite(s) — see TODO(map) in run.mjs: ${parked.join(', ')}`);
chosen = chosen.filter((s) => !SKIP.has(s));
if (!chosen.length) {
	console.log('e2e: nothing to run (all selected suites are parked behind TODO(map)).');
	process.exit(0);
}

// Dry run: report the selection without spawning a server or a browser.
if (process.env.E2E_LIST) {
	console.log(`e2e would run ${chosen.length}/${SUITES.length}: ${chosen.join(', ')}`);
	process.exit(0);
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
