// Text Editor's shared state — the seam between the editor and its keys.
//
// The keys do not live with the editor. They live in the panel's DENSE BAR, which is drawn by the
// catch-all page, several thousand lines and one component boundary away from the textarea they
// act on. Svelte has no portal, so the rack cannot simply be rendered from inside the editor into
// a slot in the bar; something has to sit between the two. This module is that something.
//
// It follows the pattern $lib/emoji-search set for the Emoji Viewer's superbar search — one
// source of truth, several mouths — and extends it in the one way this app needs: the editor also
// publishes its VERBS here. Every gesture (wrap a selection, mark a line, copy, download, clear)
// needs the live textarea, its selection and its undo stack, all of which belong to the editor and
// none of which can be handed across as data. So the editor registers a table of commands while it
// is mounted, and the rack in the bar calls through it.
//
// `cmd` is null before the editor mounts and null again after it unmounts, and BOTH matter. The
// rack and the editor mount in the same tick with no guaranteed order, so a key pressed in that
// window must do nothing rather than throw; and a stale table left behind after a navigation would
// hold a closure over a destroyed textarea. Every call site goes through `cmd?.`.

import {
	COPY_SVG,
	DOWNLOAD_SVG,
	TRASH_SVG,
	BOLD_SVG,
	ITALIC_SVG,
	CODE_SVG,
	QUOTE_SVG,
	LIST_UL_SVG,
	LIST_OL_SVG,
	RULE_SVG,
	LINK_SVG
} from '$lib/icons';

export type Mode = 'write' | 'split' | 'proof';

/** What the rack can ask the editor to do. Registered by the editor while it is mounted. */
export type Commands = {
	/** Wrap the selection in a pair of marks, or unwrap it if it already wears them. */
	surround(open: string, close?: string): void;
	/** Put a mark at the head of every line the selection touches, or take it off. */
	prefix(mark: string): void;
	/** Drop a block in on its own lines. */
	block(body: string): void;
	link(): void;
	copy(): void;
	download(): void;
	/** Two-step: the first call arms, the second clears. See `armed`. */
	clear(): void;
};

export const editor = $state({
	/** What the visitor last chose. `shownMode` is what is actually rendered. */
	mode: 'split' as Mode,
	/** Set by the editor from a media query — the rack reads it to hide SPLIT. */
	narrow: false,
	/**
	 * Is the text held to a reading MEASURE, or does it run the full width of the pane? On by
	 * default: a line of prose set to the width of a 1440px window runs to around 160 characters,
	 * and the eye starts losing its place on the return to the left edge somewhere around 90. The
	 * full width is still worth having — for a wide table, or a listing that would otherwise wrap
	 * — so it is a setting rather than a rule.
	 */
	measured: true,
	/** Confirmation lamps, owned by the editor's timers, read by the rack's keys. */
	copied: false,
	armed: false,
	/**
	 * True once anything has scrolled under the bar. The BAR reads it, and it has to come from
	 * here because the bar cannot see it any other way: the panel's own `scrolled` state is driven
	 * by the scroll of `.surface-body`, and in this app the body does not scroll at all — the
	 * sheet and the proof scroll inside it. So the bar sat at its transparent resting state
	 * forever while the document slid underneath it in plain sight.
	 */
	scrolled: false,
	cmd: null as Commands | null
});

/**
 * SPLIT needs two readable columns and a phone has room for one, so it is not offered below the
 * breakpoint — and a session that was in SPLIT on a wide window falls back to WRITE rather than
 * rendering a split nobody can read. A function rather than an exported `$derived`, because a
 * derived read across a module boundary is a value, not a subscription; calling this inside a
 * reactive context reads `editor` there and tracks properly.
 */
export function shownMode(): Mode {
	return editor.narrow && editor.mode === 'split' ? 'write' : editor.mode;
}

// ── What the app offers ───────────────────────────────────────────────────────
// The key tables live HERE rather than in the rack, because on a phone the same keys are drawn
// twice in two different shapes: a strip in the bar on a wide window, a flyout at the thumb on a
// narrow one. Two copies of the list is how the two quietly stop agreeing about what the app can
// do — which is the same fault the register ($lib/places) exists to prevent, at a smaller scale.

/** A key that inserts a mark. Either a glyph from the shared set or — for the two heading levels,
 *  which no icon set distinguishes — a word. */
export type MarkKey = { label?: string; svg?: string; title: string; run: () => void };

export const MARKS: MarkKey[] = [
	{ label: 'H1', title: 'Heading, first level', run: () => editor.cmd?.prefix('# ') },
	{ label: 'H2', title: 'Heading, second level', run: () => editor.cmd?.prefix('## ') },
	{ svg: BOLD_SVG, title: 'Bold (⌘B)', run: () => editor.cmd?.surround('**') },
	{ svg: ITALIC_SVG, title: 'Italic (⌘I)', run: () => editor.cmd?.surround('*') },
	{ svg: CODE_SVG, title: 'Code (⌘E)', run: () => editor.cmd?.surround('`') },
	{ svg: QUOTE_SVG, title: 'Quotation', run: () => editor.cmd?.prefix('> ') },
	{ svg: LIST_UL_SVG, title: 'Bulleted list', run: () => editor.cmd?.prefix('- ') },
	{ svg: LIST_OL_SVG, title: 'Numbered list', run: () => editor.cmd?.prefix('1. ') },
	{ svg: RULE_SVG, title: 'Rule', run: () => editor.cmd?.block('---') },
	{ svg: LINK_SVG, title: 'Link (⌘K)', run: () => editor.cmd?.link() }
];

/**
 * The keys that act on the DOCUMENT rather than on the text. Their labels are functions because
 * two of them answer back — "Copied", "Sure?" — and that answer is state, read where it is drawn.
 * `folds` says whether the key finishes the job: on a phone these close the flyout behind them,
 * where a mark leaves it open so several can be applied without reopening.
 */
export type DocKey = {
	id: string;
	svg: string;
	title: () => string;
	label: () => string;
	run: () => void;
	on?: () => boolean;
	folds: () => boolean;
};

export const DOC_KEYS: DocKey[] = [
	{
		id: 'copy',
		svg: COPY_SVG,
		title: () => 'Copy the whole document',
		label: () => (editor.copied ? 'Copied' : 'Copy'),
		run: () => editor.cmd?.copy(),
		folds: () => true
	},
	{
		id: 'download',
		svg: DOWNLOAD_SVG,
		title: () => 'Download it as a .md file',
		label: () => '.md',
		run: () => editor.cmd?.download(),
		folds: () => true
	},
	{
		id: 'clear',
		svg: TRASH_SVG,
		title: () => (editor.armed ? 'Press again to clear the sheet' : 'Clear the sheet'),
		label: () => (editor.armed ? 'Sure?' : 'Clear'),
		run: () => editor.cmd?.clear(),
		on: () => editor.armed,
		// Clear ASKS first, so this is read INVERTED — and the inversion is the whole subtlety.
		// `folds` is asked AFTER the key has run, and by then the arming press has just set
		// `armed` to true: reading it straight folded the flyout on the very press that posed the
		// question, hiding it. Armed means "still asking"; not armed, at this point, means the
		// second press went through and the sheet is clear.
		folds: () => !editor.armed
	}
];
