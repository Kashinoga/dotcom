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
	DOWNLOAD_SVG,
	SAVE_SVG,
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
import type { FolderEntry, WriteError } from '$lib/text-editor-store';
import type { Connection } from '$lib/nextcloud-connections';

export type Mode = 'write' | 'split' | 'proof';

/**
 * One readable document inside an opened folder — a NAME AND A PATH, and nothing else.
 *
 * It used to carry the thing it was made of: a `File` from `<input webkitdirectory>`, or a live
 * `handle` and its `parent` from `showDirectoryPicker`. Every one of those was the local store's
 * own bookkeeping, published to the whole editor because there was nowhere else to put it — and a
 * document that lives on a server has none of them and never will. They are private to the store
 * now (see $lib/text-editor-store), which is what lets a second kind of workspace exist at all.
 */
export type { FolderEntry, Store, WriteError, WriteResult } from '$lib/text-editor-store';

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
	/**
	 * A document on a connected DRIVE — the connection's id and the path in it. See `DetachedDoc`
	 * in $lib/text-editor-store, which this mirrors and which explains why a store is named rather
	 * than carried.
	 */
	drive?: { connection: string; path: string };
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
 * What counts as openable. The extension list is the gate for a FOLDER (where the picker cannot
 * filter for us); a single file also offers these to the native picker, which is a hint rather
 * than a rule — the picker can always be overridden, so the same check runs on what comes back.
 *
 * Re-exported rather than declared, so every caller here keeps its import: it now lives in
 * $lib/markdown, beside the parser that has to be able to read whatever it lets in, and where a
 * plain `node --test` can reach it. This module cannot be imported outside a Svelte build — it is
 * runes all the way down — and the install manifest's file handlers need checking against the
 * same list. See the note there.
 */
export { isOpenable, PROSE, BINARY, kindOf, looksBinary, type Kind } from '$lib/markdown';
// Re-exported ABOVE for the call sites that used to import from here, and imported again HERE
// because a re-export does not bind a name in this module's own scope — `openKind` below needs
// the real one.
import { kindOf, type Kind } from '$lib/markdown';

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
	/** Write the sheet back to where it came from. Only when `openWritable` says there is a where. */
	saveInPlace(): void;
};
// COPY and CLEAR are gone from this table, not renamed. They are a document's verbs now, offered
// on a document's own row (see the note in DOC_KEYS), and the row menu is drawn INSIDE the editor
// — so they never cross this seam and do not need publishing. The table is what the BAR can ask
// for, and the bar no longer asks for either.

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
	 * `webkitdirectory` snapshot? It is the STORE's own answer (see $lib/text-editor-store), which
	 * is why it is not the same question as `canWrite`: a remote store would be writable in every
	 * engine, including the two that can never reach the local disk. Save on a scratch note reads
	 * it, because a key offering to file a note in a folder that cannot take one is a key that lies.
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
	/**
	 * The handle behind the open document when it came from OUTSIDE the tree — the Open key's
	 * picker, a launched file, or a row on the shelf. A document in the WORKSPACE no longer has one
	 * here: it is a path, and the store is what knows how to write to a path (see
	 * $lib/text-editor-store). This is what is left of the field, and it is the shelf's.
	 */
	openHandle: null as FileSystemFileHandle | null,
	/**
	 * Can the document ON THE SHEET be written back to where it came from?
	 *
	 * Not "does this browser have the API" — that is `canWrite`, and the two were the same question
	 * for exactly as long as there was one kind of workspace. A tree document is writable when its
	 * store is; a shelf document is writable when it has a handle behind it; a scratch note is
	 * neither until it is filed. The keys read THIS, so that a key which offers to save says so
	 * because of the document in front of it rather than because of the engine it is running in.
	 */
	openWritable: false,
	/** Briefly true after a save lands, so the key can say so. */
	saved: false,
	/**
	 * Briefly set to WHY a save did not land. A save is the one write in this app whose failure
	 * leaves nothing on screen to notice — the words are still on the sheet either way — and it was
	 * silent here for as long as the only way to fail was a file somebody had deleted. Over a
	 * network it can fail because a train went into a tunnel, or because the same note is open on a
	 * phone, and neither of those may be told by saying nothing.
	 */
	saveFailed: '' as WriteError | '',
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
	 *
	 * There is ALWAYS at least one (`Ephemeral 0`, made at mount and remade if the list ever
	 * empties). The sheet used to be able to be a document with no row behind it — a first visit,
	 * before anything was opened or made — and that one document was the exception to everything
	 * the workspace can do: it could not be copied, saved out or cleared from a row, because it
	 * had no row. Now every document on the sheet is a document in the pane.
	 */
	ephemeral: [] as Ephemeral[],
	/**
	 * Is the SCRATCH shelf drawn? It is, always, unless this says otherwise — the shelf used to
	 * appear only when it had rows, which meant the list you were about to add to was invisible
	 * until you had added to it. Hiding it is a choice made in Settings and kept across visits,
	 * for the desk where scratch notes are not part of how somebody works.
	 */
	scratchShown: true,
	/**
	 * WHICH LIST `openPath` names. Three lists draw rows in this pane and all three can hold the
	 * same string; without this the mark would land on every row that matched.
	 *
	 * A field rather than a prefix on the path itself — a folder is free to hold a file called
	 * `loose:anything`, and a marker that a real filename could forge is a marker that will mark
	 * the wrong row one day.
	 */
	openIn: 'tree' as 'tree' | 'cloud' | 'loose' | 'ephemeral',
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
	/**
	 * THE DRIVES this editor knows about — see $lib/nextcloud-connections. Kept apart from the store
	 * because a connection OUTLIVES the workspace it opens: it is what a shelf row will point at
	 * once a row can name a document on a server, and it is what Settings lists and forgets.
	 *
	 * The TOKEN is not in here. It is sealed in the vault for a connection that is kept and held in
	 * a module variable for one that is not, and either way it has no business in reactive state
	 * that a component is free to spread into a log, a snapshot or a devtools panel.
	 */
	connections: [] as Connection[],
	// ── THE DRIVE ─────────────────────────────────────────────────────────────
	// A connected workspace is a FOURTH LIST in the pane, beside the tree and the two shelves —
	// not a replacement for the folder. The two are different kinds of place and somebody may
	// reasonably have both open: a folder of work on the machine, and notes that follow them about.
	//
	// The fields below shadow the local ones deliberately rather than being folded into them. A
	// generic `workspaces[]` was the other option and it would have rewritten every assertion in the
	// suite and every reference to `editor.folder` in the page for a saving of about nine lines.
	// Two named things that are drawn by one snippet is the smaller idea.
	/** Its documents, flat, exactly as `folder` is. The tree is derived where it is drawn. */
	drive: [] as FolderEntry[],
	/** Its folders, by path — including ones nothing has been fetched from yet. */
	driveFolders: [] as string[],
	/** What the head says: the drive's own folder name. */
	driveName: '',
	/**
	 * WHICH SERVER it is on, for the head to name beside the folder — `Notes
	 * (nextcloud.kashinoga.com)`. A folder called `Notes` says nothing about where it is, and a
	 * visitor with a drive open beside a local folder of the same name has two lists with one name
	 * on them.
	 *
	 * Only worth saying when there IS a folder: a drive opened at its root is already named for its
	 * host, and `nextcloud.kashinoga.com (nextcloud.kashinoga.com)` is a label arguing with itself.
	 * The head compares the two rather than a flag being carried.
	 */
	driveHost: '',
	/** Is a connection LIVE — opened, answered, and holding rows? */
	driveOpen: false,
	/**
	 * A drive is REMEMBERED but not open: a first load with a connection in the list, or one whose
	 * password could not be read back. The section is drawn with its head and a line saying so,
	 * rather than not drawn at all — a workspace that vanishes because a token expired looks like a
	 * workspace that was never there.
	 */
	drivePending: false,
	/** Which of its folders are shut, by path. Its own, because it is its own tree. */
	driveCollapsed: [] as string[],
	/**
	 * Which of its folders have been READ. A remote tree arrives one level at a time (see `listDir`
	 * in $lib/text-editor-store), so a folder can be on screen with its children unknown — and an
	 * unfetched folder drawn open is indistinguishable from an empty one.
	 *
	 * Hence the OTHER half of this arrangement: a drive's folders arrive SHUT. That is deliberately
	 * the opposite of the rule the local tree keeps (see `collapsed`, which records shut precisely
	 * so an unseen folder arrives open), and the reason is the cost: arriving open on a remote tree
	 * means arriving with a request per folder, which is the thing lazy listing exists to avoid.
	 */
	driveFetched: [] as string[],
	/**
	 * Which of its paths are being READ RIGHT NOW — folders and documents both, because pressing
	 * either is a request and neither is instant. On a slow connection that is a row which does
	 * nothing for a second or two, indistinguishable from the outside from an empty folder, an empty
	 * document, or a press that missed.
	 *
	 * ONE LIST for the two, because it is one fact: this path is being read. A folder draws it where
	 * its tally would be and a document where nothing was, and that is the whole of the difference.
	 *
	 * Separate from `driveFetched`, which is marked before a folder's request and stays marked
	 * afterwards: that one says "this has been read", this says "this is being read", and a folder
	 * row needs both to know whether to draw a tally or a bar.
	 */
	driveFetching: [] as string[],
	/**
	 * Where the SETTINGS flyout should stand, or null when it is shut. Carried rather than
	 * anchored for the reason `headingAt` is — the key that opens it stands in a bar that scrolls
	 * on a phone, and a popover parented into a scroller is clipped by it.
	 *
	 * The flyout is where the panel's own chrome went: Apps, About, Install, and the version. Four
	 * things that are not the document, behind one key, so the bar's corner is one control wide
	 * rather than four — which is what a one-row bar can afford.
	 */
	settingsAt: null as { x: number; y: number } | null,

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
		list: 'tree' | 'cloud' | 'loose' | 'ephemeral';
		/**
		 * A DOCUMENT or a FOLDER. One piece of state for both, because they are one gesture — a
		 * right-click on a row — and two would be two scrims, two placements and two Escapes over
		 * the same list. The verbs differ and nothing else does.
		 */
		kind: 'file' | 'dir';
	} | null,
	// `copied` was here, beside `armed`, and went with the Copy key: a row says "Copied" on the
	// row itself now (see `flash` in the editor), which is the only place that can say WHICH
	// document went to the clipboard. The Save key's own lamp is `saved`, further up.
	/**
	 * The row whose CLEAR is armed — a path or a scratch id, empty when nothing is asking.
	 *
	 * It was a bare boolean while Clear was one key acting on the sheet. Clear is now offered on
	 * every document's own menu, so "armed" has to say WHICH: three lists can hold the same string
	 * and a shared yes would have put `Sure?` on every row at once.
	 */
	armed: '',
	/**
	 * True once anything has scrolled under the bar. The BAR reads it, and it has to come from
	 * here because the bar cannot see it any other way: the panel's own `scrolled` state is driven
	 * by the scroll of `.surface-body`, and in this app the body does not scroll at all — the
	 * sheet and the proof scroll inside it. So the bar sat at its transparent resting state
	 * forever while the document slid underneath it in plain sight.
	 */
	scrolled: false,
	/**
	 * Can this browser install the editor as an app, right now? True only once Chromium has fired
	 * `beforeinstallprompt` at us — which it does when the manifest, the icons and a service worker
	 * are all in place and the visitor has not already installed it.
	 *
	 * A flag rather than a capability check, because there is nothing to check: no browser will say
	 * whether it is willing to install something, and Safari and Firefox never fire the event at all
	 * (Safari installs from its own Share menu instead, which is not a thing a page can offer). So
	 * the key is DRAWN only where it works, the way every other key in this app that depends on the
	 * platform is — not drawn and disabled.
	 */
	installable: false,
	/**
	 * Is this window already the installed app? `display-mode: standalone` is the only reliable
	 * way to know — there is no "am I installed" API, and asking would be the wrong question
	 * anyway: what the key needs to know is whether the visitor is looking at the thing it would
	 * offer to make.
	 */
	installed: false,
	cmd: null as Commands | null
});

// ── Installing ────────────────────────────────────────────────────────────────
// The editor can be installed as an app of its own (static/text-editor.webmanifest). The KEY that
// offers it stands in the panel's chrome corner, which is the page's, and on a phone it goes down
// to the editor's flyout — so, exactly like the rack, the two halves have to meet in this file.
//
// The event is held here as a plain module variable rather than in `$state`. It is a live DOM
// object with a method that has to be called on the original, and nothing about it is worth
// making reactive — `installable` above is the reactive part, and it is the only part a key reads.

/** What Chromium hands over: a deferred prompt, to be shown later on a real gesture. */
type InstallPrompt = Event & {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: InstallPrompt | null = null;

/** Hold on to the offer. Called from the editor's `beforeinstallprompt` listener. */
export function holdInstall(event: Event) {
	deferred = event as InstallPrompt;
	editor.installable = true;
}

/**
 * Show the browser's own install dialog. It can only be shown ONCE per offer — Chromium
 * invalidates the event after `prompt()` — so the key goes away whatever the visitor answers.
 * Declining is not an error and leaves nothing to say: the browser will offer again on a later
 * visit, and a key that reappeared immediately would be arguing.
 */
export async function install() {
	if (!deferred) return;
	const offer = deferred;
	deferred = null;
	editor.installable = false;
	try {
		await offer.prompt();
		await offer.userChoice;
	} catch {
		// A prompt the browser refused to show (no gesture, or already installed in another
		// window). Nothing to recover — the offer is spent either way.
	}
}

/**
 * SPLIT needs two readable columns and a phone has room for one, so it is not offered below the
 * breakpoint — and a session that was in SPLIT on a wide window falls back to WRITE rather than
 * rendering a split nobody can read. A function rather than an exported `$derived`, because a
 * derived read across a module boundary is a value, not a subscription; calling this inside a
 * reactive context reads `editor` there and tracks properly.
 */
export function shownMode(): Mode {
	// A CODE FILE HAS ONE VIEW, and this is the single place that decides it. There is no proof of
	// a stylesheet — the markdown engine would set `# !/bin/sh` as a heading and a `*` as a
	// bullet, which is not a rendering of the file but a misreading of it — and SPLIT is two panes
	// of which one would be that misreading. Forcing it here rather than at each pane means the
	// sheet, the rack, the flyout and the rail all follow without any of them asking what kind of
	// document is open. `editor.mode` is left ALONE: it is the visitor's standing preference, and
	// opening a `.json` should not silently reset the view they chose for their prose.
	if (openKind() === 'code') return 'write';
	return editor.narrow && editor.mode === 'split' ? 'write' : editor.mode;
}

/**
 * WHAT KIND OF DOCUMENT IS OPEN, from its name.
 *
 * A function rather than a field on `editor`, for the reason `shownMode` is one: it is DERIVED,
 * and a field would be a second copy of a fact that `editor.filename` already holds — settable in
 * the eight places that set a filename, and therefore wrong in whichever of them somebody forgets.
 */
export function openKind(): Kind {
	return kindOf(editor.filename);
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

/**
 * WHAT A REFUSED WRITE SAYS, one word each, because it is said on a key in a one-row bar and on a
 * row in a 250px column. These are the whole message — there is no second line and no dialog, and
 * the audience for this app can act on every one of them.
 *
 * `Conflict` is the only one that is not self-evident, and it is deliberately the technical word:
 * it means the document changed somewhere else and NOTHING was overwritten. A softer word would
 * have to be longer to say the same thing, and the people who use this know what it means.
 */
export const SAID: Record<WriteError, string> = {
	conflict: 'Conflict',
	offline: 'Offline',
	denied: 'Refused',
	gone: 'Gone',
	failed: 'Failed'
};

/** Open the heading menu under whatever key was pressed. */
export function openHeadings(event: MouseEvent) {
	const key = (event.currentTarget as HTMLElement).getBoundingClientRect();
	editor.headingAt = editor.headingAt ? null : { x: key.left, y: key.bottom + 4 };
}

/**
 * Open the SETTINGS flyout under whatever key was pressed — the gear in the bar's corner on a
 * desk, the gear in the flyout's stack on a phone. Same arrangement as the heading menu above and
 * for the same two reasons: the key is drawn in two places that cannot share a component, and the
 * surface it opens is drawn once, inside the editor, where it can be portalled clear of both.
 *
 * Right-ALIGNED, because the key it hangs from is in the right-hand corner: the card is laid out
 * from its own right edge (the x carried here is the key's RIGHT) and pulled back inside the
 * window by the effect in $lib/TextEditorSettings.
 */
/*
 * `openWorkspaceMenu` stood here and is gone with the menu it opened. The Workspace key is a toggle
 * again — see the note in OPEN_KEYS — and the three things that menu held are on the Scratch head's
 * `+` and on the folder row's own right-click. `editor.workspaceAt` went with it.
 */

export function openSettings(event: MouseEvent) {
	const key = (event.currentTarget as HTMLElement).getBoundingClientRect();
	editor.settingsAt = editor.settingsAt ? null : { x: key.right, y: key.bottom + 6 };
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
	/**
	 * The EVENT is passed on. Most of these want nothing to do with it, and `() => void` is
	 * assignable here so they carry on saying so — but a key that opens a popover has to measure
	 * the key it is opening from, and the only thing that knows where the key is is the key.
	 */
	run: (event: MouseEvent) => void;
	on?: () => boolean;
	/** Does this key OPEN something rather than do something? Draws the caret, like `H▾`. */
	opens?: () => boolean;
	/**
	 * Is the key ANSWERING — "Saved", "Copied" — rather than offering? A different state from
	 * `on`, and drawn in a different colour for that reason: `on` is the cobalt accent, which
	 * every selected and hovered control in this theme wears, and a confirmation in the same ink
	 * reads as "this is the mode you are in". A key that is answering goes emerald and comes back
	 * on its own timer. `armed` is deliberately NOT this: "Sure?" is a question, not an answer.
	 */
	done?: () => boolean;
	/**
	 * Is the key saying a write did NOT happen? A third state beside `done`, in a third colour,
	 * because the two it would otherwise borrow are both wrong: emerald means it landed, and the
	 * cobalt accent means this is the mode you are in. A refusal is neither, and a refusal that
	 * looked like either would be worse than no answer at all.
	 */
	lost?: () => boolean;
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
		title: () => (editor.folderShown ? 'Hide the workspace' : 'Show the workspace'),
		// WORKSPACE, not Folder. The key opens a folder, but what it MAKES is the workspace — the
		// pane beside the sheet with the tree, the shelves and New in it — and that pane is what
		// the key acts on every time after the first. Naming it for the thing it picks rather than
		// the thing it builds described one press out of many.
		label: () => 'Workspace',
		/*
		 * IT IS A TOGGLE AGAIN. It held a menu of three — New note, a different folder, hide the pane
		 * — and every one of them has a better home: New is the Scratch head's `+`, and the folder's
		 * own verbs (open a different one, make a folder in it, close it) are on the folder's own
		 * ROW, where a file manager keeps them and where Rename and Delete already were.
		 *
		 * What is left is the one thing the key was named for. A key that means the workspace and
		 * shows or hides the workspace needs no menu between the press and the result — and it stops
		 * being the only key in this bar whose press is a question rather than an answer.
		 */
		run: () => (editor.folderShown = !editor.folderShown),
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
				? `File this note in ${editor.folderName || editor.driveName || 'the folder'} as ${editor.filename}.md`
				: `Save back to ${editor.filename || 'the file'}`,
		label: () => (editor.saveFailed ? SAID[editor.saveFailed] : editor.saved ? 'Saved' : 'Save'),
		run: () => editor.cmd?.saveInPlace(),
		done: () => editor.saved,
		lost: () => !!editor.saveFailed,
		/**
		 * Only when there is somewhere for it to go. Two ways there can be: a document on the sheet
		 * that can be written back to, or a SCRATCH note and a writable folder open to file it into
		 * — which is the one way a document is created on disk now that New makes a scratch note
		 * instead. Otherwise `.md` (the download) is how a document leaves, and it stands right
		 * beside this.
		 *
		 * `openWritable`, not `openHandle`: what the key needs to know is whether THIS document can
		 * be saved, and a handle is only one of the ways that can be true.
		 *
		 * And it does NOT ask `canWrite` any more. That was the browser's answer standing in for the
		 * document's, which was harmless while the local disk was the only place a document could
		 * live and wrong the moment it was not — a store reached over a network is writable in
		 * Safari and Firefox too. Both flags below already imply everything `canWrite` was adding.
		 */
		shown: () => editor.openWritable || (editor.openIn === 'ephemeral' && editor.folderWritable),
		folds: () => true
	},
	/*
	 * COPY, .MD and CLEAR used to stand here, and they are now on a DOCUMENT'S OWN MENU — the
	 * right-click menu in the workspace, beside Rename and Delete. Three keys came off the bar
	 * for it, and the reason is that all three were lies of scope: they were drawn among the
	 * document keys as though they acted on documents, and every one of them acted on whatever
	 * happened to be on the sheet. There is one sheet and a workspace full of documents.
	 *
	 * On a row they mean exactly what they say — copy THIS, save THIS out, empty THIS — and they
	 * cost no width in a one-row bar. SAVE stays, alone, because it is the one write that has to
	 * be reachable without taking a hand off the document: it writes back what you are typing.
	 *
	 * The consequence, which is the price of the arrangement: a sheet with no row behind it (a
	 * first visit, before anything is opened or made) has no Clear. New makes a scratch note and
	 * that note has a row, so the way to a clearable document is one press.
	 */
	/*
	 * ...and the one thing a document keeps in the bar is where it came IN. `.md` is not on the
	 * menu below: it is offered per row (Save a copy), and it is the ONLY way out of a browser
	 * that cannot write in place — so it must not be reachable only by right-clicking something.
	 * Deliberately last, as it always was: it is how a document LEAVES.
	 */
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
				: editor.openWritable
					? 'Download a copy — Save writes to the file itself'
					: 'Download it as a .md file',
		label: () => '.md',
		run: () => editor.cmd?.download(),
		/**
		 * `canWrite`, deliberately — this is the one gate in the app that is still the BROWSER's
		 * question rather than the document's, and it stays that way. `.md` is here because a
		 * download is the only way a document reaches the LOCAL DISK in an engine that cannot write
		 * to one, and that stays true however many remote stores are connected: somebody in Safari
		 * with a drive open can save, but they still cannot get a copy onto their own machine any
		 * other way. Complementing Save would take the key away from exactly those people.
		 */
		shown: () => !editor.canWrite,
		folds: () => true
	}
];
