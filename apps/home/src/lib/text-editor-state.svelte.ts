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
	SAVE_SVG,
	TRASH_SVG,
	BOLD_SVG,
	ITALIC_SVG,
	CODE_SVG,
	QUOTE_SVG,
	LIST_UL_SVG,
	LIST_OL_SVG,
	RULE_SVG,
	LINK_SVG,
	DOC_TEXT_SVG,
	FOLDER_OPEN_SVG
} from '$lib/icons';

export type Mode = 'write' | 'split' | 'proof';

/**
 * One readable document inside an opened folder. It arrives one of two ways, and which one
 * decides what the workspace can do with it:
 *
 *   `file`   — a read-only snapshot from `<input webkitdirectory>`. Every browser. Open only.
 *   `handle` — a live handle from `showDirectoryPicker`. Chromium only. Open, save in place,
 *              rename, delete.
 *
 * `parent` comes with the handle because deleting is the DIRECTORY's verb, not the file's:
 * `removeEntry` is called on the folder that contains it.
 */
export type FolderEntry = {
	name: string;
	path: string;
	file?: File;
	handle?: FileSystemFileHandle;
	parent?: FileSystemDirectoryHandle;
};

/**
 * A document on the sheet that did NOT come out of the open folder — one picked with Open, or
 * one left over from a folder that has since been changed. The workspace keeps a short shelf of
 * them above the tree, because otherwise a file you opened by hand has nowhere to be: the tree
 * cannot list it (it is not in the folder), so the moment you clicked anything else it was gone
 * from the screen with no way back to it but the picker.
 *
 * `file` or `handle`, the same pair a FolderEntry carries and for the same reason — a handle is
 * what makes saving possible and a picked File never has one. It re-reads from disk when it is
 * opened again: this is a shelf of WHERE documents came from, not a drawer of their contents.
 * There is one sheet in this editor and these are not buffers.
 */
export type LooseDoc = {
	/**
	 * Its identity, which is not its name: two folders both holding a README are the ordinary
	 * case, and a shelf keyed on names would show one row for them and open the wrong one. It is
	 * the old path where there was one, and name + size + mtime for a picked file.
	 */
	id: string;
	name: string;
	file?: File;
	handle?: FileSystemFileHandle;
};

/**
 * A document that exists only here. New makes one — `Ephemeral 1`, `Ephemeral 2` — and unlike
 * everything else in this pane it has no file behind it at all: not a File, not a handle, not a
 * path. So it is the one kind of document the workspace has to hold the TEXT of. A shelf row can
 * afford to remember only where its document came from, because it can always read it again;
 * there is nowhere to read this one back from, and a list that dropped it on the way to another
 * row would be quietly destroying work.
 *
 * They are kept across a reload with the sheet, for the same reason the sheet is kept: this app
 * has always promised that what you typed is still there when you come back, and three scratch
 * notes are not less yours than one.
 */
export type Ephemeral = { id: string; name: string; text: string };

/**
 * What counts as openable. Deliberately narrow: this is a Markdown editor, and handing it a
 * binary would put mojibake on the sheet rather than an error. The extension list is the gate
 * for a FOLDER (where the picker cannot filter for us); a single file also offers these to the
 * native picker, which is a hint rather than a rule — the picker can always be overridden, so
 * the same check runs on what comes back.
 */
export const OPENABLE = /\.(md|markdown|mdown|mkd|txt|text)$/i;

/** What the rack can ask the editor to do. Registered by the editor while it is mounted. */
export type Commands = {
	/** Wrap the selection in a pair of marks, or unwrap it if it already wears them. */
	surround(open: string, close?: string): void;
	/** Set every touched line to a heading LEVEL, 1–6. Zero takes the heading off. */
	heading(level: number): void;
	/** Put a mark at the head of every line the selection touches, or take it off. */
	prefix(mark: string): void;
	/** Drop a block in on its own lines. */
	block(body: string): void;
	link(): void;
	copy(): void;
	download(): void;
	/** Put a document on the sheet, replacing what is there. Undoable — see `load` in the editor. */
	openFile(): void;
	openFolder(): void;
	/** Make a new document in the open folder. Needs a writable handle, so Chromium only. */
	newFile(): void;
	/**
	 * Put the app's own manual page back on the sheet — what a first visit opens with. Undoable,
	 * like opening a file, so the key does not have to ask.
	 */
	readme(): void;
	/** Write the sheet back to the file it came from. Only when `canWrite` and a handle is open. */
	saveInPlace(): void;
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
	/**
	 * The name of the document on the sheet, once one has been OPENED. Empty for the scratch
	 * sheet you get by default — which is most of the time, and is why the running foot only
	 * names a file when there is one to name.
	 */
	filename: '',
	/**
	 * THE WORKSPACE — a folder opened alongside the document, the way an editor keeps one. Its
	 * readable files, the folder's own name, whether the pane is showing, and which entry is on
	 * the sheet. The File objects are kept UNREAD: a directory can be large, and there is no
	 * reason to pull every file into memory to list their names.
	 *
	 * It lasts the session and no longer, and that is the platform's rule rather than a choice.
	 * A `<input webkitdirectory>` hands over File objects, not a handle that can be stored and
	 * re-read after a reload; only the File System Access API can do that, and only in Chromium.
	 * So the pane comes back empty on a reload and the folder has to be picked again.
	 */
	folder: [] as FolderEntry[],
	/**
	 * Every DIRECTORY under the open folder, by path. Kept beside the files rather than derived
	 * from them, because a folder with nothing readable in it has no file to be derived from —
	 * and an empty folder that the sidebar refuses to draw is a folder you cannot put anything
	 * into. Only a `showDirectoryPicker` walk can know them: a `webkitdirectory` pick hands over
	 * a list of Files and an empty directory leaves no trace in one.
	 */
	folders: [] as string[],
	folderName: '',
	/**
	 * Is the open folder one this browser can WRITE into — a real directory handle rather than a
	 * `webkitdirectory` snapshot? `canWrite` says the browser has the API at all; this says there
	 * is somewhere to use it. Save on a scratch note reads it, because a key offering to file a
	 * note in a folder that cannot take one is a key that lies.
	 */
	folderWritable: false,
	/**
	 * The pane is OPEN by default. It is not only a folder listing any more — it holds the scratch
	 * notes and the New key that makes them, so a workspace that started shut hid the one control
	 * in it that does not need a folder at all. On a phone it is a sheet OVER the document rather
	 * than a column beside it, so the editor shuts it again at mount (see `narrow`).
	 */
	folderShown: true,
	/**
	 * Which folders in the workspace TREE are shut, by path. The list stays flat — every other
	 * thing this app does with a folder works in paths, and a nested structure would move open,
	 * rename and delete onto a shape none of them needs — so the tree is derived from the paths
	 * where it is drawn, and this is the only state it keeps.
	 *
	 * Shut, not open, is what is recorded: a folder you have never seen should arrive OPEN, so a
	 * workspace shows its documents the moment it is picked rather than a row you have to press.
	 */
	collapsed: [] as string[],
	/** The handle behind the open document, when there is one — what makes saving possible. */
	openHandle: null as FileSystemFileHandle | null,
	/** Briefly true after a save lands, so the key can say so. */
	saved: false,
	/** The path of the entry currently on the sheet, so the workspace can mark it. */
	openPath: '',
	/**
	 * THE SHELF — documents opened from outside the folder, newest first. Ephemeral on purpose:
	 * it is capped, the oldest falls off, and nothing about it is remembered across a reload.
	 * A folder is where your work lives; this is only what you reached for while you were in it.
	 */
	loose: [] as LooseDoc[],
	/**
	 * SCRATCH — what New makes, newest last. Above the shelf, because the shelf is where things
	 * from elsewhere land and these came from nowhere at all.
	 */
	ephemeral: [] as Ephemeral[],
	/**
	 * WHICH LIST `openPath` names. Three lists draw rows in this pane and all three can hold the
	 * same string; without this the mark would land on every row that matched.
	 *
	 * A field rather than a prefix on the path itself — a folder is free to hold a file called
	 * `loose:anything`, and a marker that a real filename could forge is a marker that will mark
	 * the wrong row one day.
	 */
	openIn: 'tree' as 'tree' | 'loose' | 'ephemeral',
	/**
	 * Can this browser reach the real file system for WRITING — save in place, rename, delete?
	 *
	 * Detected on `showDirectoryPicker`, and on nothing else, because everything else lies.
	 * `FileSystemDirectoryHandle`, `removeEntry`, `move` and `createWritable` are all present in
	 * Safari and Firefox — measured, not assumed — but only ever reach the Origin Private File
	 * System, a sandboxed area the visitor cannot see in a file manager. A detect on those would
	 * pass everywhere and then fail on the only folder anyone cares about.
	 *
	 * Where this is false the workspace is READ-ONLY and the keys that would write are not drawn
	 * at all. Not drawn, not disabled: a key that cannot do what its label says is worse than no
	 * key, and this file already keeps that rule for the folder picker.
	 */
	canWrite: false,
	/**
	 * A folder was remembered from a previous visit, but the browser's permission for it has
	 * lapsed and can only be re-asked during a click. The workspace shows it NAMED and shut, with
	 * one key to reconnect — rather than throwing a permission dialog at somebody who has only
	 * just loaded the page.
	 */
	folderPending: false,
	/**
	 * Where the heading menu should stand, in viewport coordinates, or null when it is shut. Six
	 * levels will not fit the bar as six keys, and two of them (which is what the rack had) is an
	 * arbitrary place to stop — so one key opens the set.
	 *
	 * The coordinates are carried rather than the menu being anchored in the DOM, because the
	 * marks live in a strip that SCROLLS: a popover inside it would be clipped by its own
	 * scroller. Fixed, positioned from the key's measured rect, it escapes.
	 */
	headingAt: null as { x: number; y: number } | null,
	/** Is the contents rail showing? On by default: it is the one column that costs nothing. */
	contentsShown: true,
	/** Which entry is being renamed, if any — the workspace swaps its row for a field. */
	renaming: '',
	/** The entry armed for deletion, if any. Two presses, like Clear. */
	doomed: '',
	/**
	 * The workspace row whose context menu is open, and where the pointer opened it, in viewport
	 * coordinates. Rename and Delete used to be two small keys revealed on the row itself, which
	 * put four buttons in a list of two documents and covered the end of every long filename. They
	 * are a right-click menu instead: the place every file manager keeps them.
	 *
	 * Carried as coordinates for the same reason `headingAt` is — the list SCROLLS, so a popover
	 * inside it would be clipped by its own scroller. Fixed, at the measured point, it escapes.
	 */
	fileMenu: null as {
		path: string;
		x: number;
		y: number;
		list: 'tree' | 'loose' | 'ephemeral';
	} | null,
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

/** The six levels, behind one key. See `headingAt`. */
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

/** Open the heading menu under whatever key was pressed. */
export function openHeadings(event: MouseEvent) {
	const key = (event.currentTarget as HTMLElement).getBoundingClientRect();
	editor.headingAt = editor.headingAt ? null : { x: key.left, y: key.bottom + 4 };
}

export const MARKS: MarkKey[] = [
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
	/**
	 * Is the key ANSWERING — "Saved", "Copied" — rather than offering? A different state from
	 * `on`, and drawn in a different colour for that reason: `on` is the cobalt accent, which
	 * every selected and hovered control in this theme wears, and a confirmation in the same ink
	 * reads as "this is the mode you are in". A key that is answering goes emerald and comes back
	 * on its own timer. `armed` is deliberately NOT this: "Sure?" is a question, not an answer.
	 */
	done?: () => boolean;
	/** Drawn at all? A key that cannot do what it says should not be on screen. */
	shown?: () => boolean;
	folds: () => boolean;
};

/**
 * The keys that bring a document IN. They lead the bar, at the far left, because that is where a
 * document starts — before there is anything to mark up or anything to do with it.
 */
export const OPEN_KEYS: DocKey[] = [
	{
		id: 'open',
		svg: DOC_TEXT_SVG,
		title: () => 'Open a Markdown or text file',
		label: () => 'Open',
		run: () => editor.cmd?.openFile(),
		folds: () => true
	},
	{
		id: 'folder',
		svg: FOLDER_OPEN_SVG,
		title: () =>
			editor.folder.length
				? editor.folderShown
					? 'Hide the workspace'
					: 'Show the workspace'
				: 'Open a folder as a workspace',
		label: () => 'Folder',
		run: () => editor.cmd?.openFolder(),
		on: () => editor.folderShown,
		folds: () => true
	}
];

export const DOC_KEYS: DocKey[] = [
	{
		id: 'save',
		svg: SAVE_SVG,
		title: () =>
			editor.openIn === 'ephemeral'
				? `File this note in ${editor.folderName || 'the folder'} as ${editor.filename}.md`
				: `Save back to ${editor.filename || 'the file'}`,
		label: () => (editor.saved ? 'Saved' : 'Save'),
		run: () => editor.cmd?.saveInPlace(),
		done: () => editor.saved,
		/**
		 * Only when there is somewhere for it to go. Two ways there can be: a real file behind the
		 * sheet, or a SCRATCH note and a writable folder open to file it into — which is the one
		 * way a document is created on disk now that New makes a scratch note instead. Otherwise
		 * `.md` (the download) is how a document leaves, and it stands right beside this.
		 */
		shown: () =>
			editor.canWrite &&
			(!!editor.openHandle || (editor.openIn === 'ephemeral' && editor.folderWritable)),
		folds: () => true
	},
	{
		id: 'copy',
		svg: COPY_SVG,
		title: () => 'Copy the whole document',
		label: () => (editor.copied ? 'Copied' : 'Copy'),
		run: () => editor.cmd?.copy(),
		// The same answer Save gives, so it is given the same way. These two sit side by side in
		// the bar; one of them going emerald and the other staying plain would say the two events
		// were different kinds of thing.
		done: () => editor.copied,
		folds: () => true
	},
	{
		id: 'download',
		svg: DOWNLOAD_SVG,
		// The one place the app could otherwise be ambiguous about what it just did. Without the
		// File System Access API a download is the ONLY way out, and it writes a new file to the
		// Downloads folder rather than to the one you opened — press it twice and you have
		// `notes (1).md`. Somebody who pressed Cmd-S in Safari and saw no complaint could
		// reasonably believe they had saved. The tooltip says otherwise, in each of the three
		// states it can be in.
		title: () =>
			!editor.canWrite
				? 'Download a copy — this browser cannot save in place'
				: editor.openHandle
					? 'Download a copy — Save writes to the file itself'
					: 'Download it as a .md file',
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
