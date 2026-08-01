// FORMATTING — Prettier behind one verb, and the parsers fetched one file kind at a time.
//
// Stage 3 of code support, and the first thing in this app that REWRITES a document rather than
// adding to it. Everything about the shape below follows from that: it is one press, it is
// undoable in one press back, and it never throws.
//
// WHY THIS IS NOT IN A WORKER, which was the plan until it was measured. The fear was that parsing
// and printing a large file would lock the page. It does not:
//
//     typescript    749 lines   39 KB   median 12ms
//     typescript   4499 lines  232 KB   median 91ms
//     markdown     1381 lines  105 KB   median 80ms
//
// Ninety milliseconds, once, on a key somebody deliberately pressed. That is not jank worth a
// second module graph, a message protocol and — the part that actually decided it — a second set
// of chunk URLs, which would put the formatter's downloads somewhere the service worker's
// cache-on-use never sees the main thread ask for. The first press is dominated by the FETCH
// (213 KB gzipped for TypeScript) by more than two orders of magnitude, and a worker does not make
// a network round trip faster. If a file ever turns up that makes this hurt, the measurement above
// is the thing to re-run, not this comment.
//
// WHAT IT COSTS, gzipped, and why it is per-extension rather than a bundle:
//
//     core (standalone)          27 KB     every format, whatever the file
//     + markdown                 95 KB     .md — the app's own kind
//     + postcss                  46 KB     .css .scss .less
//     + yaml                     44 KB     .yaml .yml
//     + graphql                  12 KB     .graphql .gql
//     + html                     51 KB     .html .vue
//     + babel + estree          145 KB     .js .jsx .mjs .cjs .json
//     + typescript + estree     275 KB     .ts .tsx .mts .cts
//
// TypeScript alone is half the weight of the entire site. It is behind a dynamic import keyed on
// the extension of the file being formatted, so it is fetched by the person who pressed Format on
// a `.ts` and by nobody else — the same rule the grammars keep in $lib/code-sheet.
//
// THERE IS NO WARM HERE, and the asymmetry with `warmCodeSheet` is deliberate rather than an
// oversight. The code sheet is fetched when a file is OPENED, which is an action the visitor has
// definitely taken and which leaves an empty pane if it fails. A formatter is fetched when Format
// is PRESSED, which most visitors never do, at up to ten times the size — warming it would spend a
// quarter of a megabyte on a maybe, on behalf of somebody whose folder merely CONTAINS a `.ts`.
// The offline gap it leaves is small and honest: the key says so, and the document is untouched.

/**
 * A plugin module, as Prettier wants it. The builds export the plugin as `default`; the namespace
 * object also carries `parsers`/`printers` and would work, but taking `default` first is what the
 * package documents and what will keep working if the shape of the namespace changes.
 */
const plugin = (m: unknown): unknown => (m as { default?: unknown }).default ?? m;

const babelPlugins = () =>
	Promise.all([
		import('prettier/plugins/babel').then(plugin),
		import('prettier/plugins/estree').then(plugin)
	]);

/**
 * WHICH PARSER A NAME WANTS, and what has to be fetched to run it.
 *
 * Keyed on extension, exactly like `LANGUAGES` in $lib/code-sheet, and for the same reason: the
 * name is the one thing known before the file is read, and a second way of deciding (a shebang, a
 * sniff of the first line) would be a second answer that could disagree with the first.
 *
 * AN ABSENCE HERE IS THE FEATURE, NOT A GAP. Prettier has no opinion about Python, Rust, Go, Java,
 * C or PHP — all of which this editor happily OPENS and highlights — so those files get no Format
 * key at all rather than a key that fails when pressed. `.svelte` is absent for a different
 * reason: its plugin is a Node package that expects a filesystem, and there is no browser build.
 */
type Formatter = { parser: string; load: () => Promise<unknown[]> };

const MARKDOWN: Formatter = {
	parser: 'markdown',
	// The markdown plugin ALONE, deliberately. Prettier will format fenced code blocks when the
	// parser for their language happens to be loaded, and dragging babel in on the off-chance a
	// document contains a JS fence would put 145 KB on every prose visitor who pressed Format. A
	// fence in an unloaded language is left exactly as written, which is the right failure.
	load: () => import('prettier/plugins/markdown').then((m) => [plugin(m)])
};
const BABEL: Formatter = { parser: 'babel', load: babelPlugins };
const TYPESCRIPT: Formatter = {
	parser: 'typescript',
	load: () =>
		Promise.all([
			import('prettier/plugins/typescript').then(plugin),
			import('prettier/plugins/estree').then(plugin)
		])
};
const postcss = (parser: string): Formatter => ({
	parser,
	load: () => import('prettier/plugins/postcss').then((m) => [plugin(m)])
});
const YAML: Formatter = {
	parser: 'yaml',
	load: () => import('prettier/plugins/yaml').then((m) => [plugin(m)])
};
const GRAPHQL: Formatter = {
	parser: 'graphql',
	load: () => import('prettier/plugins/graphql').then((m) => [plugin(m)])
};
const HTML: Formatter = {
	parser: 'html',
	// HTML brings babel, estree and postcss with it, and that is not padding: the html printer
	// EMBEDS the other two for `<script>` and `<style>`, so without them a page comes back with its
	// markup tidied and its script left as one long line — a format that did half the job and said
	// nothing about the half it skipped.
	load: () =>
		Promise.all([
			import('prettier/plugins/html').then(plugin),
			import('prettier/plugins/babel').then(plugin),
			import('prettier/plugins/estree').then(plugin),
			import('prettier/plugins/postcss').then(plugin)
		])
};

export const FORMATTERS: Record<string, Formatter> = {
	md: MARKDOWN,
	markdown: MARKDOWN,
	mdown: MARKDOWN,
	mkd: MARKDOWN,
	// `json` is a parser of the BABEL plugin, not a plugin of its own — which is why a `.json` file
	// costs the same 145 KB a `.js` does. Worth knowing before it looks like a bug.
	json: { parser: 'json', load: babelPlugins },
	jsonc: { parser: 'json', load: babelPlugins },
	json5: { parser: 'json5', load: babelPlugins },
	js: BABEL,
	mjs: BABEL,
	cjs: BABEL,
	jsx: BABEL,
	ts: TYPESCRIPT,
	tsx: TYPESCRIPT,
	mts: TYPESCRIPT,
	cts: TYPESCRIPT,
	css: postcss('css'),
	scss: postcss('scss'),
	less: postcss('less'),
	yaml: YAML,
	yml: YAML,
	graphql: GRAPHQL,
	gql: GRAPHQL,
	html: HTML,
	vue: HTML
};

const extOf = (name: string) => name.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? '';

/**
 * Can this document be formatted at all? What the key asks before it draws itself.
 *
 * A name with no extension answers NO, which is the honest answer and not an oversight: a scratch
 * note is `Ephemeral 0` and a cleared sheet has no name, so there is nothing to key on. It is the
 * deliberate opposite of `kindOf`, which treats a bare name as prose — being generous there costs
 * a plain monospaced editor, and being generous here would cost a key that fails when pressed.
 */
export function canFormat(name: string): boolean {
	return Object.hasOwn(FORMATTERS, extOf(name));
}

/**
 * HOW THIS DOCUMENT IS ALREADY INDENTED — read off the document, not guessed and not configured.
 *
 * This exists because of the one thing that would make Format useless to the people it is for.
 * Prettier's defaults are two spaces; this repo, and a great many others, are written with tabs.
 * Pressing Format on a file from such a folder would re-indent every line of it — a whole-file diff
 * in a tool whose audience lives in `git diff`, and the fastest possible way to make a feature
 * something nobody presses twice.
 *
 * IT IS EVIDENCE, NOT A PREFERENCE. The leading whitespace of an indented line is an unambiguous
 * fact about the document, in the same class as `looksBinary` reading the bytes rather than
 * trusting the name. What is NOT inferred is anything that cannot be read this plainly — print
 * width and quote style are settings, not evidence, and are left at Prettier's own defaults.
 *
 * THE WIDTH IS THE COMMONEST STEP BETWEEN CONSECUTIVE LINES, never the smallest indent seen. A
 * wrapped argument list, a chained call and a continued condition all produce indents that are not
 * multiples of the step, and the smallest of them would name a width the file does not use.
 *
 * (This does NOT read `.prettierrc`. It could not without a new store verb — the walk skips
 * dot-files, so `read('.prettierrc')` has no handle to resolve — and a root config would in any
 * case say nothing about a scratch note or a shelved document, which have no root. That is the
 * honest next step here, not something quietly missing.)
 */
export function readIndent(source: string): { useTabs: boolean; tabWidth: number } {
	const lines = source.split('\n');
	let tabbed = 0;
	let spaced = 0;
	const widths: number[] = [];
	let last = -1;
	for (const line of lines) {
		if (!line.trim()) continue;
		const lead = line.match(/^[ \t]*/)?.[0] ?? '';
		if (lead.includes('\t')) tabbed++;
		else if (lead.length) spaced++;
		// A tabbed line contributes nothing to the WIDTH question — a tab is one character however
		// wide it is drawn — so only space indents feed the step.
		const width = lead.includes('\t') ? -1 : lead.length;
		if (width >= 0) {
			if (last >= 0 && width > last) widths.push(width - last);
			last = width;
		} else last = -1;
	}
	if (tabbed > spaced) return { useTabs: true, tabWidth: 2 };
	const tally = new Map<number, number>();
	for (const step of widths) if (step <= 8) tally.set(step, (tally.get(step) ?? 0) + 1);
	let best = 0;
	let width = 2;
	for (const [step, n] of tally) if (n > best) ((best = n), (width = step));
	return { useTabs: false, tabWidth: width };
}

/** What a format did. There is no thrown path — see `format`. */
export type Formatted =
	| { ok: true; text: string; cursor: number }
	| { ok: false; why: string; where: { line: number; column: number } | null };

/**
 * FORMAT A DOCUMENT, AND NEVER THROW.
 *
 * A syntax error is the ORDINARY case here, not an exceptional one: a file is very often broken
 * precisely while it is being edited, and pressing Format on it must leave the words alone and say
 * so. So the failure is a return value the key can wear, with the position kept — Prettier reports
 * `Unexpected token (1:7)`, and the line and column are the most useful thing in that sentence.
 *
 * THE CARET SURVIVES, through `formatWithCursor`. Reformatting a file moves every offset in it, so
 * a format that put the caret back at the same NUMBER would drop it somewhere unrelated — most
 * visibly on a long file, where it also takes the scroll position with it. Prettier tracks the
 * offset through its own printing, which is the only place that knowledge exists.
 *
 * `endOfLine: 'auto'`, and it matters more than it looks: the default is `lf`, so a file written on
 * Windows would come back with every line ending rewritten. That is a diff on every line of the
 * document, caused by a key that was pressed to tidy it.
 */
export async function format(source: string, filename: string, cursor = 0): Promise<Formatted> {
	const which = FORMATTERS[extOf(filename)];
	if (!which) return { ok: false, why: 'Nothing here formats that kind of file', where: null };
	try {
		const [prettier, plugins] = await Promise.all([import('prettier/standalone'), which.load()]);
		const { useTabs, tabWidth } = readIndent(source);
		const out = await prettier.formatWithCursor(source, {
			parser: which.parser,
			plugins: plugins as never,
			cursorOffset: Math.max(0, Math.min(cursor, source.length)),
			useTabs,
			tabWidth,
			endOfLine: 'auto'
		});
		return { ok: true, text: out.formatted, cursor: Math.max(0, out.cursorOffset) };
	} catch (e) {
		// TWO FAILURES ARE CAUGHT HERE AND THEY ARE NOT THE SAME. A SyntaxError means the document is
		// broken and the visitor can fix it; anything else is almost always the import above failing,
		// which means offline. Both leave the document untouched, so both are safe to report on a
		// key — but telling them apart is the difference between "look at line 12" and "you have no
		// network", and a reader can act on either.
		const err = e as { message?: string; loc?: { start?: { line?: number; column?: number } } };
		const first = String(err?.message ?? e)
			.split('\n')[0]
			.trim();
		const start = err?.loc?.start;
		return {
			ok: false,
			why: first || 'The formatter could not be reached',
			where:
				typeof start?.line === 'number' ? { line: start.line, column: start.column ?? 0 } : null
		};
	}
}
