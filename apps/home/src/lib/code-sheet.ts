// THE CODE SHEET — CodeMirror behind the Sheet interface, for the files prose cannot serve.
//
// WHY A SECOND ENGINE AT ALL, since the prose sheet is the better-tested one. Highlighting is the
// visible half of code support and the cheap half; what actually hurts in a textarea is the
// EDITING MODEL. There is no auto-indent when you open a block, no bracket closing, no way to
// re-indent a region, and Tab moves focus instead of indenting. None of those can be bolted onto a
// textarea without rebuilding an editor, and one has already been built.
//
// WHAT IT COSTS AND WHY THAT IS ACCEPTABLE HERE: about 245 KB gzipped with the languages, against
// a whole site that is 408 KB. It is behind a dynamic import keyed on the file being opened, so a
// visitor who only ever writes markdown never fetches a byte of it. The cost lands on the person
// who opened a `.ts`, which is the person it is for.
//
// WHAT DOES *NOT* GET WRITTEN TWICE, because the seam was put in first ($lib/text-editor-sheet):
// the marks (they are markdown's and the bar hides them for code), the file verbs (they talk to
// the store, not to a text control), and — the big one — the prose sheet's own machinery. The
// drawn caret, the drawn selection, the wrap mirror, the typewriter scrolling and the paper
// scroller exist to give a textarea things CodeMirror simply has. On this path they are not
// reimplemented; they are not there.
//
// EVERYTHING IS LOADED ON DEMAND, twice over: this module is imported only when a code file is
// opened, and the LANGUAGE inside it is imported only when a file of that language is opened. So
// opening a `.json` does not fetch the Rust grammar.

import type { Sheet } from '$lib/text-editor-sheet';

/**
 * How the editor talks to a sheet it does not own.
 *
 * `onChange` is a CONSTRUCTION parameter rather than a method on `Sheet`, and that is the honest
 * shape: the prose sheet reports its changes through `bind:value` and has nothing to subscribe to.
 * Only an engine that owns its own document needs to push, so only that engine is asked for it.
 */
export type CodeSheetOptions = {
	/** The element to build in. Emptied on `destroy`. */
	parent: HTMLElement;
	/** What the document says right now. */
	doc: string;
	/** Its name — the ONLY thing that picks a language. See `languageFor`. */
	filename: string;
	/** Every edit, with the whole document. The editor keeps `text` from this. */
	onChange: (text: string) => void;
};

/**
 * WHICH GRAMMAR A NAME WANTS.
 *
 * Keyed on extension and nothing else: a shebang sniffer would be a second, disagreeing answer to
 * a question `$lib/markdown` already answers by name, and the two would drift.
 *
 * An unknown extension resolves to NOTHING, deliberately, and that is a working state rather than
 * a failure — brackets, indentation, undo, the gutter and the selection all come from the core
 * extensions below and none of them need a grammar. A `.conf` opens as plain monospaced text with
 * a real editor around it, which is better than what it had, and it is not worth shipping a
 * grammar for every extension the walk will list.
 */
const LANGUAGES: Record<string, () => Promise<unknown>> = {
	ts: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true })),
	tsx: () =>
		import('@codemirror/lang-javascript').then((m) =>
			m.javascript({ typescript: true, jsx: true })
		),
	js: () => import('@codemirror/lang-javascript').then((m) => m.javascript()),
	mjs: () => import('@codemirror/lang-javascript').then((m) => m.javascript()),
	cjs: () => import('@codemirror/lang-javascript').then((m) => m.javascript()),
	jsx: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true })),
	json: () => import('@codemirror/lang-json').then((m) => m.json()),
	jsonc: () => import('@codemirror/lang-json').then((m) => m.json()),
	css: () => import('@codemirror/lang-css').then((m) => m.css()),
	scss: () => import('@codemirror/lang-css').then((m) => m.css()),
	less: () => import('@codemirror/lang-css').then((m) => m.css()),
	html: () => import('@codemirror/lang-html').then((m) => m.html()),
	svelte: () => import('@codemirror/lang-html').then((m) => m.html()),
	vue: () => import('@codemirror/lang-html').then((m) => m.html()),
	py: () => import('@codemirror/lang-python').then((m) => m.python()),
	rs: () => import('@codemirror/lang-rust').then((m) => m.rust()),
	sql: () => import('@codemirror/lang-sql').then((m) => m.sql()),
	xml: () => import('@codemirror/lang-xml').then((m) => m.xml()),
	svg: () => import('@codemirror/lang-xml').then((m) => m.xml()),
	yaml: () => import('@codemirror/lang-yaml').then((m) => m.yaml()),
	yml: () => import('@codemirror/lang-yaml').then((m) => m.yaml()),
	go: () => import('@codemirror/lang-go').then((m) => m.go()),
	java: () => import('@codemirror/lang-java').then((m) => m.java()),
	c: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
	h: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
	cpp: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
	hpp: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
	php: () => import('@codemirror/lang-php').then((m) => m.php())
};

const extOf = (name: string) => name.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? '';

/** The grammar for a name, or null where there is none. Never throws — a missing grammar is a
 *  plain-text sheet, not an error. */
async function languageFor(filename: string): Promise<unknown | null> {
	const load = LANGUAGES[extOf(filename)];
	if (!load) return null;
	try {
		return await load();
	} catch {
		return null;
	}
}

/**
 * Build the sheet. Async because everything it needs is fetched on demand.
 *
 * The caller awaits this and holds the result until the document kind changes; switching between
 * two CODE files does NOT rebuild it — `put` replaces the text and `setLanguage` swaps the grammar
 * through a Compartment, which is what a Compartment is for. Rebuilding would throw away the undo
 * history on every file switch, which is exactly the kind of quiet loss this app is careful about
 * elsewhere (see `write` in the prose sheet).
 */
export async function makeCodeSheet(
	opts: CodeSheetOptions
): Promise<Sheet & { setLanguage(filename: string): Promise<void> }> {
	const [{ EditorState, Compartment }, view, commands, language, autocomplete, highlight] =
		await Promise.all([
			import('@codemirror/state'),
			import('@codemirror/view'),
			import('@codemirror/commands'),
			import('@codemirror/language'),
			import('@codemirror/autocomplete'),
			import('@lezer/highlight')
		]);
	const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } = view;
	const { defaultKeymap, history, historyKeymap, indentWithTab } = commands;
	const { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, foldGutter } =
		language;
	const t = highlight.tags;

	/**
	 * THE PALETTE IS THE MANUAL'S, not a borrowed code theme.
	 *
	 * Every colour here is one of the four inks the design system already has (see the theme's own
	 * note on why they are gems): cobalt for the keywords that say what KIND of thing a line is,
	 * emerald for literal values, ruby for the things that break a line's flow, topaz for names
	 * the file itself defines, and plain muted ink for comments. A downloaded theme would put a
	 * sixth and seventh hue on the one page in this app that is supposed to look like the rest of
	 * it.
	 *
	 * Comments are `--sub` — ink at 40% — rather than a colour, because a comment is the one thing
	 * on the sheet that is deliberately NOT the code.
	 */
	const paint = HighlightStyle.define([
		{ tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--sub)' },
		{ tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: 'var(--orange)' },
		{ tag: [t.definitionKeyword, t.modifier, t.self], color: 'var(--orange)' },
		{ tag: [t.string, t.special(t.string), t.regexp], color: 'var(--emerald)' },
		{ tag: [t.number, t.bool, t.null, t.atom], color: 'var(--emerald)' },
		{ tag: [t.typeName, t.className, t.namespace], color: 'var(--topaz)' },
		{ tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--topaz)' },
		{ tag: [t.propertyName, t.attributeName], color: 'var(--ink)' },
		{ tag: [t.tagName], color: 'var(--orange)' },
		{ tag: [t.operator, t.punctuation, t.bracket], color: 'var(--sub)' },
		{ tag: [t.invalid], color: 'var(--ruby)' },
		{ tag: [t.meta, t.processingInstruction], color: 'var(--sub)' },
		{ tag: [t.heading], color: 'var(--ink)', fontWeight: '700' },
		{ tag: [t.link, t.url], color: 'var(--orange)', textDecoration: 'underline' },
		{ tag: [t.emphasis], fontStyle: 'italic' },
		{ tag: [t.strong], fontWeight: '700' }
	]);

	/**
	 * THE SHEET'S GEOMETRY IS THE APP'S, read from the same custom properties the prose sheet
	 * uses. They never appear on screen together — there is no SPLIT for code — so this does not
	 * have to line up pixel for pixel with the prose sheet; it has to look like it belongs to the
	 * same desk, which is what reading the same tokens buys.
	 *
	 * `--te-row` is a WHOLE number of pixels for the prose sheet's own reasons (its mirror and its
	 * textarea must round identically). CodeMirror has no mirror and does not need that, but it
	 * takes the same value so the two sheets share a rhythm.
	 */
	const dress = EditorView.theme({
		'&': {
			height: '100%',
			backgroundColor: 'var(--surface)',
			color: 'var(--ink)',
			fontSize: 'var(--te-type-size, 15px)'
		},
		'&.cm-focused': { outline: 'none' },
		'.cm-scroller': {
			fontFamily: "var(--font-mono, ui-monospace, 'SF Mono', Consolas, monospace)",
			lineHeight: 'var(--te-row, 26px)',
			// The same typewriter room the prose sheet keeps: without it the last line of a
			// document sits welded to the bottom edge, which is the least comfortable place on the
			// screen to be typing.
			paddingBottom: '40vh'
		},
		'.cm-content': { caretColor: 'var(--orange)' },
		'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--orange)', borderLeftWidth: '2px' },
		// The selection is the accent at a wash, matching what the prose sheet draws.
		'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
			backgroundColor: 'color-mix(in srgb, var(--orange) 18%, transparent)'
		},
		'.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--orange) 5%, transparent)' },
		// THE GUTTER IS THE MARGIN COLUMN. The prose sheet reserves --te-margin for its line marks
		// and leaves it empty over code; this is what that space is for on this path.
		'.cm-gutters': {
			backgroundColor: 'var(--surface)',
			color: 'var(--sub)',
			border: 'none',
			borderRight: '1px solid var(--te-rule, var(--line))'
		},
		'.cm-lineNumbers .cm-gutterElement': {
			// The pixel face, because a line number is a NUMERAL and that is what the numeral face
			// is for — the tallies, the section marks and the running foot all wear it.
			fontFamily: 'var(--font-pixel, var(--font-mono, monospace))',
			fontSize: '1.05em',
			padding: '0 var(--space-8) 0 var(--space-12)'
		},
		'.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--orange)' },
		'.cm-foldGutter .cm-gutterElement': { padding: '0 2px', color: 'var(--sub)' },
		'.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
			backgroundColor: 'color-mix(in srgb, var(--orange) 16%, transparent)',
			outline: 'none',
			color: 'inherit'
		},
		'.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': {
			backgroundColor: 'color-mix(in srgb, var(--ruby) 18%, transparent)',
			color: 'inherit'
		}
	});

	const lang = new Compartment();
	const first = await languageFor(opts.filename);

	const state = EditorState.create({
		doc: opts.doc,
		extensions: [
			lineNumbers(),
			highlightActiveLine(),
			highlightActiveLineGutter(),
			foldGutter(),
			history(),
			indentOnInput(),
			bracketMatching(),
			autocomplete.closeBrackets(),
			// `indentWithTab` LAST in the keymap so it wins the Tab binding. It is the single
			// biggest reason this path exists: in the prose sheet Tab writes two spaces because a
			// textarea's Tab moves focus, and neither behaviour is what somebody indenting a block
			// of code wants.
			keymap.of([
				...autocomplete.closeBracketsKeymap,
				...defaultKeymap,
				...historyKeymap,
				indentWithTab
			]),
			syntaxHighlighting(paint),
			dress,
			EditorView.lineWrapping,
			...(first ? [lang.of(first as never)] : [lang.of([])]),
			EditorView.updateListener.of((u) => {
				if (u.docChanged) opts.onChange(u.state.doc.toString());
			})
		]
	});

	const cm = new EditorView({ state, parent: opts.parent });

	/** Replace whatever is selected, undoably, and optionally leave the caret placed. */
	const replace = (text: string, selectStart?: number, selectEnd?: number) => {
		const { from, to } = cm.state.selection.main;
		cm.dispatch({
			changes: { from, to, insert: text },
			selection:
				selectStart === undefined
					? { anchor: from + text.length }
					: { anchor: selectStart, head: selectEnd ?? selectStart }
		});
	};

	return {
		selection: () => ({ start: cm.state.selection.main.from, end: cm.state.selection.main.to }),
		select(start, end) {
			const max = cm.state.doc.length;
			cm.dispatch({
				selection: { anchor: Math.min(start, max), head: Math.min(end ?? start, max) }
			});
		},
		write: replace,
		put(body) {
			// The whole document, in ONE transaction, so opening the wrong file is a single ⌘Z —
			// the same promise `write` keeps in the prose sheet through execCommand.
			cm.dispatch({
				changes: { from: 0, to: cm.state.doc.length, insert: body },
				selection: { anchor: 0 }
			});
		},
		focus: () => cm.focus(),
		blur: () => cm.contentDOM.blur(),
		goToLine(line) {
			// The caller counts from ZERO (it slices an array of source lines); CodeMirror counts
			// lines from one. Clamped, because an outline computed a moment ago can name a line a
			// since-shortened document no longer has.
			const n = Math.min(Math.max(line + 1, 1), cm.state.doc.lines);
			const at = cm.state.doc.line(n).from;
			cm.dispatch({
				selection: { anchor: at },
				effects: EditorView.scrollIntoView(at, { y: 'center' })
			});
			cm.focus();
		},
		destroy: () => cm.destroy(),
		/** Swap the grammar without rebuilding — see the note on the factory. */
		async setLanguage(filename) {
			const next = await languageFor(filename);
			cm.dispatch({ effects: lang.reconfigure((next ?? []) as never) });
		}
	};
}
