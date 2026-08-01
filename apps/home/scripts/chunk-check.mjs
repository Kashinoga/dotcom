// Prove that the two heavy engines this app loads on demand are ACTUALLY on demand — by walking
// the built module graph rather than by trusting the source.
//
// WHAT IT IS FOR, and it is emphatically not "the suite cannot do this". `e2e/text-editor.mjs`
// already asserts the laziness the good way: it counts the SCRIPTS a prose visitor's page asks for
// and fails if any of them is CodeMirror. That is the better test of the two, because it measures
// what a browser really did.
//
// It has exactly one blind spot, and this exists for it. A bundler does not only choose what to
// import — it chooses what to INLINE. If a static import ever creeps in, the parser does not arrive
// as an extra script; it is folded into a chunk the page was fetching anyway, and the script COUNT
// DOES NOT CHANGE. The page simply gets bigger. Measured, by adding one static import of Prettier's
// markdown plugin on purpose: the route chunk went from 437 KB to 704 KB and not one additional
// script was requested. A network-counting assertion cannot see that, and a reviewer reading the
// source cannot either, because the source still says `import(...)`.
//
// So: the suite proves nothing extra is FETCHED. This proves nothing heavy is BAKED IN.
//
// THE MARKERS ARE THE LIBRARIES' OWN INTERNALS, never the package name. An earlier version of this
// check matched the word `prettier`, which also appears in this app's own call site
// (`prettier.formatWithCursor`) — so it reported the clean build as a leak. `astFormat` and
// `linguist` are fields of Prettier's plugin metadata and appear in all nine of its chunks and in
// none of ours; `cm-content` and `cmView` are CodeMirror's.

import fs from 'node:fs';
import path from 'node:path';

const OUT = 'apps/home/.svelte-kit/output/client/_app/immutable';
const root = path.resolve(process.cwd().endsWith('apps/home') ? '../..' : '.', OUT);

if (!fs.existsSync(root)) {
	console.error(`chunks: no build at ${root} — run \`pnpm build\` first`);
	process.exit(1);
}

/**
 * What must never be reachable without a click, and what identifies it in a minified chunk.
 *
 * THESE MARKERS ARE A TRIPWIRE, NOT AN INVENTORY, and the difference is worth stating so nobody
 * later reads the reported chunk count as a complete one. CodeMirror's core is split across six
 * packages and only its VIEW carries `cm-` class names, so the count below names the chunks the
 * marker can see rather than every chunk the engine occupies. That is enough for what this guard
 * is: nothing can pull in CodeMirror without pulling in its view, and nothing can pull in a
 * Prettier plugin without its language metadata. A leak drags the marked chunk in with it.
 */
const ENGINES = [
	{ name: 'prettier', mark: /astFormat|linguist/ },
	{ name: 'codemirror', mark: /cm-content|cmView|LRParser/ }
];

const all = [];
(function walk(d) {
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name);
		if (e.isDirectory()) walk(p);
		else if (e.name.endsWith('.js')) all.push(path.relative(root, p));
	}
})(root);

const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/**
 * The STATIC imports of a chunk. Deliberately not a parser: the output is minified ESM where every
 * import is a top-level `import ... from "..."` statement, and a dynamic one is always written
 * `import("...")` — which this does not match, because the `(` is not a quote.
 */
const staticImports = (f) =>
	[...read(f).matchAll(/(?:^|[;\n}])\s*import\s*(?:[^"';]*?from\s*)?["']([^"']+)["']/g)].map((m) =>
		path.normalize(path.join(path.dirname(f), m[1]))
	);

// Every file a browser can end up executing without the visitor doing anything: the app entry and
// every route node. SvelteKit names them `entry/` and `nodes/`.
const entries = all.filter((f) => f.startsWith('nodes/') || f.startsWith('entry/'));

// A GUARD THAT MATCHES NOTHING READS EXACTLY LIKE A GUARD THAT PASSES, which this repo has now
// been bitten by in three separate places. The first version of this check used a regex needing a
// leading slash, matched zero entries, walked zero files and reported a confident zero leaks — on
// a build that had a 292 KB parser inlined into the route. So the count is asserted before the
// thing it is counted for.
if (entries.length === 0) {
	console.error('chunks: matched NO entry chunks — the check would pass by looking at nothing');
	process.exit(1);
}

const reachable = new Set();
const queue = [...entries];
while (queue.length) {
	const f = queue.pop();
	if (reachable.has(f) || !fs.existsSync(path.join(root, f))) continue;
	reachable.add(f);
	for (const next of staticImports(f)) queue.push(next);
}

const bad = [];
const report = [];
for (const { name, mark } of ENGINES) {
	const bearing = all.filter((f) => mark.test(read(f)));
	if (bearing.length === 0) {
		// The engine is not in the build at all. That is either a removal nobody updated this for or
		// a marker that has gone stale — both worth stopping on, because a check for a thing that is
		// no longer there is the same silent pass as a check that matches nothing.
		bad.push(`${name}: no chunk carries it — has it been removed, or has the marker gone stale?`);
		continue;
	}
	const leaked = bearing.filter((f) => reachable.has(f));
	const kb = (f) => (fs.statSync(path.join(root, f)).size / 1024).toFixed(0);
	for (const f of leaked) bad.push(`${name}: ${f} (${kb(f)} KB) is reachable without a click`);
	const held = bearing.reduce((n, f) => n + fs.statSync(path.join(root, f)).size, 0);
	report.push(`${name} ${bearing.length} chunks, ${(held / 1024 / 1024).toFixed(1)} MB, on demand`);
}

if (bad.length) {
	console.error(`\nchunks: ${bad.length} problem(s):\n${bad.map((b) => `  ${b}`).join('\n')}`);
	process.exit(1);
}
console.log(
	`chunks: ${entries.length} entries reach ${reachable.size} files — ${report.join(' · ')}`
);
