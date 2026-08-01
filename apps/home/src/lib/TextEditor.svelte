<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { renderMarkdown, tally, lineMarks, outline } from '$lib/markdown';
	import {
		editor,
		shownMode,
		openKind,
		MARKS,
		DOC_KEYS,
		OPEN_KEYS,
		isOpenable,
		kindOf,
		looksBinary,
		HEADING_LEVELS,
		openHeadings,
		holdInstall,
		openSettings,
		type FolderEntry,
		type LooseDoc,
		type Ephemeral
	} from '$lib/text-editor-state.svelte';
	import {
		dirOf,
		localStore,
		snapshotStore,
		notWritten,
		WROTE,
		whyLocal,
		type DetachedDoc,
		type LocalStore,
		type Store,
		type WriteResult
	} from '$lib/text-editor-store';
	import { SAID } from '$lib/text-editor-state.svelte';
	import type { Sheet } from '$lib/text-editor-sheet';
	import {
		configFor,
		forgetToken,
		objectStore,
		unseal,
		type Connection
	} from '$lib/nextcloud-connections';
	import { nextcloudStore } from '$lib/nextcloud';
	import FloatingKey from '$lib/FloatingKey.svelte';
	import TextEditorSettings from '$lib/TextEditorSettings.svelte';
	import { dev } from '$app/environment';
	import {
		NIB_SVG,
		RULE_SVG,
		GEAR_SVG,
		REFRESH_SVG,
		CHEVRON_EXPAND_Y_SVG,
		EDIT_SVG,
		GLASSES_SVG,
		SSD_SVG,
		CLOUD_SVG,
		GHOST_SVG,
		FOLDER_FILES_SVG
	} from '$lib/icons';

	/**
	 * The door out, which is the PAGE's — closing the panel, showing what is behind it and pushing
	 * the URL are all things this component knows nothing about. It arrives as a prop for the same
	 * reason the ranger's floating key takes one ($lib/RangerKey): the key that calls it is in the
	 * SETTINGS flyout, and that flyout is drawn in here.
	 *
	 * It leads to APPS rather than to the front of the site now — the place this app is in, one
	 * level up. Somebody leaving an editor is usually going to another app rather than to the map.
	 */
	let { onApps }: { onApps?: () => void } = $props();

	// TEXT EDITOR — a Markdown editor, written as a page of the manual it renders.
	//
	// The conceit is the whole design. Pixelite is a printed technical manual, so the editor is
	// the DESK that manual is written at: a sheet of paper in a carriage on the left, the set
	// proof on the right, a rack of plastic keys along the bar above both, and a running foot
	// along the bottom with the tally. Nothing here is chrome for its own sake — every part of it
	// is a thing that exists on a real desk, doing the job it does there.
	//
	// THE KEYS ARE NOT IN THIS FILE. They are in the panel's dense bar, which the catch-all page
	// draws, so they are $lib/TextEditorRack and they talk to this component through the command
	// table in $lib/text-editor-state. They were in the body once, as a rack over the sheet — and the bar
	// above that rack held nothing but the word "Text Editor", which is a strip of chrome spent on
	// saying what the tab, the URL and the favicon all already said. Moving the keys up bought the
	// document that whole band back.
	//
	// THE MARGIN is the piece worth reading the code for. Down the left edge of the sheet, each
	// source line that opens a block carries a small pixel-face mark — H1, *, >, <>, --. It is
	// the annotation a copy-editor pencils down the side of a proof, and it is live: it appears
	// the moment you type `## `, before the heading has any text, because it reads the caret's
	// line rather than the parse (see lineMarks in $lib/markdown).
	//
	// HOW THE MARGIN STAYS ALIGNED, which is the one genuinely tricky thing in this file. A
	// textarea soft-wraps, so line 12 of the source is not on visual row 12 and no amount of
	// arithmetic will say where it is. The fix is a MIRROR: a div sitting exactly under the
	// textarea, with byte-identical typography and box metrics, holding one block element per
	// SOURCE line. The browser wraps the mirror exactly as it wraps the textarea — same font,
	// same width, same rules — so each mirror line lands at precisely the y the real line
	// occupies, and the mark hangs off it in the margin, absolutely positioned so it never joins
	// the text flow and changes the wrap it was measuring. The mirror's own text is transparent
	// and inert; it exists to be a ruler. The current-line wash rides the same element.
	//
	// The rule that keeps it working: .te-type and .te-mirror share ONE typography block. If you
	// change the font, the size, the leading, the padding or the wrap mode of either, change it
	// in that block, not on one of them. The two drift apart silently — the marks slide a few
	// pixels per line and only look wrong forty lines down.
	//
	// WHERE THIS RUNS. The place takes `dense` chrome ($lib/places), so it is full-viewport under
	// BOTH themes and never inside the docs sheet. Pixelite is its home and where every decision
	// was made; under Aeropalite it still has to be usable, so the surfaces read the --pixel-*
	// tokens with an Aeropalite fallback, and the controls wear the shared class names (.tb,
	// .field) that each theme dresses for itself.

	// ── The document ──────────────────────────────────────────────────────────
	// One document, in localStorage. Not a file list: this is a scratch sheet you come back to,
	// and a file manager would be a second app bolted to the side of the first one. Download
	// is the way a document leaves — it becomes a real .md on disk, where files belong.
	const STORE = 'ksh:text-editor:v1';

	// What is on the sheet before you have written anything. It is a page of the manual about
	// itself, so the proof has something worth looking at on the first visit and every construct
	// the engine supports is demonstrated by being used.
	const STARTER = `# Text Editor

A Markdown editor set as a page of the manual. Type on the left; the proof sets
itself on the right.

## The marks

Down the left margin, each line that opens a block wears its mark — the annotation
a copy-editor pencils down the side of a proof. Put the caret on this line to see
it lit.

**Bold**, *italic*, ~~struck~~, and \`code\` all set as you would expect. A [link](/apps)
goes cobalt.

> A quotation takes the cobalt margin rule and the serif face.

## The keys

| Key | What it does        |
|-----|---------------------|
| H1  | Sets the line as a heading |
| B   | Wraps the selection in bold |
| <>  | Wraps it in code    |

1. Press a key with text selected and it wraps what you chose.
2. Press it with nothing selected and it leaves the marks with the caret between them.
3. Enter carries a list on. Enter on an empty item ends it.

## The listing

\`\`\`js
// Code sets as a listing, numbered in the pixel face.
export const sheet = (mm) => mm * 2.83465;
\`\`\`

---

Everything is kept in this browser as you type. Nothing is sent anywhere.
`;

	let text = $state(STARTER);
	let caretLine = $state(-1);
	/** Is the phone's controls flyout disclosed? See the FloatingKey at the foot of the markup. */
	let keyOpen = $state(false);

	let ta: HTMLTextAreaElement | undefined = $state();
	let paperEl: HTMLDivElement | undefined = $state();
	let proofEl: HTMLDivElement | undefined = $state();

	// ── Derived state ─────────────────────────────────────────────────────────
	// All three are pure functions of the text, so they cost one pass each per keystroke on a
	// document that fits in a textarea. No debounce, and deliberately not: a preview that lags
	// behind the caret is worse than one that costs a millisecond.
	const srcLines = $derived(text.split('\n'));
	const marks = $derived(lineMarks(text));
	const proof = $derived(renderMarkdown(text));
	const count = $derived(tally(text));

	/**
	 * The document's headings, for the rail on the right — numbered the way the proof numbers
	 * them, so the two agree: a first-level heading opens a chapter and the section count starts
	 * again beneath it.
	 */
	const contents = $derived.by(() => {
		let chapter = 0;
		let section = 0;
		return outline(text).map((h) => {
			if (h.level === 1) {
				chapter += 1;
				section = 0;
			} else if (h.level === 2) {
				section += 1;
			}
			return { ...h, num: h.level === 2 ? String(section).padStart(2, '0') : '' };
		});
	});

	/** The heading the caret is under — what the rail marks. */
	const hereHeading = $derived.by(() => {
		let at = -1;
		contents.forEach((h, i) => {
			if (h.line <= caretLine) at = i;
		});
		return at;
	});

	/**
	 * Jump to a heading. In WRITE or SPLIT that means the SHEET — the mirror already has a block
	 * per source line, so the line to scroll to is simply there — and it puts the caret on the
	 * heading, because in an editor "go to" means "start typing here". In PROOF there is no
	 * sheet, so it scrolls the rendered heading by its anchor instead.
	 */
	function goTo(entry: { line: number; id: string }) {
		if (shown === 'proof') {
			proofEl?.querySelector(`#${CSS.escape(entry.id)}`)?.scrollIntoView({ block: 'start' });
			return;
		}
		// The ordering this used to spell out in place is the SHEET's now — see `goToLine` in
		// $lib/text-editor-sheet, where it is stated as the invariant it is. The rail's own job is
		// only to know that a heading is at a line.
		sheet.goToLine(entry.line);
	}

	// Which panes are on. The rule (SPLIT is not offered on a narrow window) lives in
	// $lib/text-editor-state, because the rack in the bar has to apply the same one to decide whether to
	// draw the SPLIT key at all.
	const shown = $derived(shownMode());
	// WHAT KIND OF DOCUMENT IS OPEN — prose or code. Everything it gates is an affordance that is
	// ABOUT prose: the proof, the reading measure, the contents rail (which indexes markdown
	// headings) and the word and reading-time counts. None of them are wrong for code so much as
	// meaningless, and a rail of headings found in a shell script would be actively misleading —
	// `# set the path` is a comment, and outline() would list it as a chapter.
	const kind = $derived(openKind());

	/**
	 * THE VIEW KEYS AS THE FLYOUT WANTS THEM — a mark, a word and a mode.
	 *
	 * They are the RACK's in the bar (`MODES` there, words in a row of words) and this is not that
	 * table re-declared: the bar offers three and the phone offers two. SPLIT is not among them for
	 * the same reason the rack drops it at this width — two panes side by side on 390px is two
	 * columns of four words each.
	 *
	 * The marks are the flyout's own need. In the bar these keys are words in a row of words and
	 * want nothing else; here every control is a mark beside its name, and a key with no mark in
	 * that column reads as one that failed to load.
	 */
	const VIEW_KEYS: { id: 'write' | 'proof'; label: string; title: string; svg: string }[] = [
		{ id: 'write', label: 'Write', title: 'Type on the sheet', svg: EDIT_SVG },
		{ id: 'proof', label: 'Proof', title: 'Read it set as a page of the manual', svg: GLASSES_SVG }
	];

	// ── Persistence ───────────────────────────────────────────────────────────
	// Written on a trailing debounce: a keystroke is cheap, a localStorage write is a synchronous
	// main-thread hop, and doing one per character is how a text field starts dropping frames on
	// a long document.
	let saveTimer = 0;
	// Nothing has CHANGED at mount — the document was either just loaded from storage or is the
	// starter, and in both cases it is already what is on disk. Writing it back would be a
	// pointless round trip, and it would flash the lamp on every single page load.
	let settled = false;
	// True from the first keystroke until the debounce lands — what the foot's lamp reads.
	let dirty = $state(false);

	onMount(() => {
		try {
			const held = localStorage.getItem(STORE);
			// An EMPTY stored string is a real state — you cleared the sheet and meant it — so it
			// must not fall back to the starter. Hence the null check rather than a truthiness one.
			if (held !== null) text = held;
			const heldMode = localStorage.getItem(`${STORE}:mode`);
			if (heldMode === 'write' || heldMode === 'split' || heldMode === 'proof')
				editor.mode = heldMode;
			// Only an explicit '0' turns the measure off — an absent key is a first visit, and the
			// measure is what a first visit should get.
			editor.measured = localStorage.getItem(`${STORE}:measure`) !== '0';
			// The scratch notes come back with the sheet. They are called ephemeral because they
			// have no file behind them, not because losing them is fine — three scratch notes are
			// not less yours than the one on the sheet, and the sheet has always survived a reload.
			const scratch = JSON.parse(localStorage.getItem(`${STORE}:scratch`) || 'null');
			if (scratch && Array.isArray(scratch.docs)) {
				editor.ephemeral = scratch.docs.filter(
					(d: unknown): d is Ephemeral =>
						!!d && typeof d === 'object' && typeof (d as Ephemeral).id === 'string'
				);
				// Past every id already handed out, so a new note cannot take a restored one's.
				ephemeralSeq =
					editor.ephemeral.reduce((n, d) => Math.max(n, Number(d.id.slice(4)) || 0), 0) + 1;
				// The pane comes up with them: they are the only place those words are, and a list
				// you have to go looking for is a list you will forget you have.
				if (editor.ephemeral.length) editor.folderShown = true;
				if (editor.ephemeral.some((d) => d.id === scratch.open)) {
					// The sheet was showing this one, and `text` above has just restored its words.
					editor.openPath = scratch.open;
					editor.openIn = 'ephemeral';
					editor.filename = editor.ephemeral.find((d) => d.id === scratch.open)?.name ?? '';
				}
			}
			// Whether the SCRATCH shelf is drawn at all. Only an explicit '0' hides it — an absent key
			// is a first visit, and a first visit should see the list.
			editor.scratchShown = localStorage.getItem(`${STORE}:scratch-shown`) !== '0';
			// WHICH FOLDERS WERE SHUT. Held in a variable rather than put straight on `editor`,
			// because the folder itself has not come back yet and `adopt` clears `collapsed` when it
			// does — a tree that arrived a moment later would wipe this. `openHeldFolder` puts it on
			// once the walk has landed; see the note there for why only the REMEMBERED folder gets it.
			const shut = JSON.parse(localStorage.getItem(`${STORE}:collapsed`) || 'null');
			if (Array.isArray(shut))
				heldCollapsed = shut.filter((p): p is string => typeof p === 'string');
		} catch {
			// Private mode, a storage quota, a browser with storage switched off. The editor works
			// perfectly well without persistence; it just forgets. Nothing to tell the visitor.
		}

		// AFTER the restore, and outside the try: a storage failure must not be the reason the pane
		// comes up with no document in it. `text` is whatever survived — the manual page on a first
		// visit, the last sheet on a later one — and the standing note is made around it.
		const standing = ensureScratch(text);
		// The MARKERS only. The note was made from the sheet, so it is already exactly what is on
		// it, and a write here would be a write on top of an identical one — on the single path
		// where the textarea may not have mounted yet. Skipped entirely if something else is
		// already open: a restored folder can have a document on the sheet behind it, and a note
		// that stole it at mount would be a note nobody asked for.
		if (standing && !editor.openPath) {
			editor.openPath = standing.id;
			editor.openIn = 'ephemeral';
			editor.filename = standing.name;
		}

		// The editor owns the media query even though the RACK is what reads it: the rack only
		// exists while the editor does, and one listener beats two that could disagree.
		const mq = window.matchMedia('(max-width: 820px)');
		editor.narrow = mq.matches;
		// The workspace is open by default on a desk and shut on a phone, where it is a sheet OVER
		// the document rather than a column beside it — and somebody who came to write should not
		// have to dismiss a file list first.
		if (mq.matches) editor.folderShown = false;
		const onMq = (e: MediaQueryListEvent) => (editor.narrow = e.matches);
		mq.addEventListener('change', onMq);

		// The drawn caret is a FINE-POINTER affordance only. On a touch screen the caret is not
		// really the browser's to lend: the platform pairs it with selection handles and a
		// magnifier that are drawn against the native one, and replacing the bar while leaving
		// its furniture behind would be worse than the oversized bar this fixes. Touch keeps the
		// native caret; the CSS that hides it is gated on the same query.
		// `select` does not fire for every way a selection can change — a drag that leaves the
		// field, a shift-click, a keyboard extension in some engines. `selectionchange` is the one
		// signal that always arrives; it is on the DOCUMENT, so it is filtered to this textarea.
		const onSelectionChange = () => {
			if (document.activeElement !== ta) return;
			trackCaret();
		};
		document.addEventListener('selectionchange', onSelectionChange);

		// See `canWrite` in the state module: this one function, and nothing else, says whether the
		// real file system is reachable for writing.
		editor.canWrite = typeof window.showDirectoryPicker === 'function';
		// The folder from last time, and the shelf that outlived it. Neither pops a permission
		// dialog on load — see recallFolder and recallLoose; both re-ask on a click instead.
		recallFolder();
		recallLoose();
		recallConnections();

		// ── THE EDITOR AS AN APP ───────────────────────────────────────────────────
		// This app can be installed — a window of its own, an icon in the Start menu or the dock,
		// `.md` files that open in it, and no address bar. It is the only app on this site that
		// is offered that way, and the reason is what the other places ARE: a reader of live
		// aircraft or live weather installed to a desktop is a promise the app cannot keep the
		// first time it opens on a plane. The editor's documents are already on this machine.
		//
		// All three of the pieces are here rather than in the page, because all three are the
		// EDITOR's: the worker (which serves only this route), the offer, and the files a launch
		// hands over. The page draws the key; that is all it knows about any of it.
		registerWorker();
		takeLaunchedFiles();

		// Already running as the installed app. There is no API that answers "am I installed",
		// and this is the better question anyway — what the key needs to know is whether the
		// visitor is looking at the thing it would offer to make.
		const standalone = window.matchMedia('(display-mode: standalone)');
		editor.installed = standalone.matches;
		const onStandalone = (e: MediaQueryListEvent) => (editor.installed = e.matches);
		standalone.addEventListener('change', onStandalone);

		// Chromium fires this when it is willing to install; nothing else fires it at all. The
		// default is PREVENTED so the offer is ours to make: left alone, the browser puts up its
		// own bar at the foot of the page, over the editor's foot, saying what the key in the bar
		// already says.
		const onOffer = (e: Event) => {
			e.preventDefault();
			holdInstall(e);
		};
		window.addEventListener('beforeinstallprompt', onOffer);
		// Installed from somewhere else — the browser's own menu, or another tab. The offer this
		// window is holding is spent, and the key has nothing left to do.
		const onInstalled = () => {
			editor.installable = false;
			editor.installed = true;
		};
		window.addEventListener('appinstalled', onInstalled);

		const fine = window.matchMedia('(pointer: fine)');
		finePointer = fine.matches;
		const onFine = (e: MediaQueryListEvent) => {
			finePointer = e.matches;
			measureCaret();
			measureSelection();
		};
		fine.addEventListener('change', onFine);

		// Publish the verbs. The keys are in the bar, several thousand lines away in the catch-all
		// page, and every one of these needs the live textarea and its undo stack — see the note in
		// $lib/text-editor-state. Cleared on the way out so a key pressed after a navigation cannot reach
		// through a stale closure into a textarea that no longer exists.
		editor.cmd = {
			surround,
			prefix,
			block,
			link,
			download,
			openFile,
			openFolder,
			saveInPlace,
			heading,
			readme,
			newFile: () => newEphemeral()
		};

		return () => {
			mq.removeEventListener('change', onMq);
			fine.removeEventListener('change', onFine);
			standalone.removeEventListener('change', onStandalone);
			window.removeEventListener('beforeinstallprompt', onOffer);
			window.removeEventListener('appinstalled', onInstalled);
			// The key is drawn by the PAGE, which outlives this component — a flag left true after
			// a navigation would put an install key in the corner of the air traffic board.
			editor.installable = false;
			document.removeEventListener('selectionchange', onSelectionChange);
			clearTimeout(saveTimer);
			clearTimeout(armTimer);
			clearTimeout(saidTimer);
			editor.cmd = null;
			editor.armed = '';
			// The flyout is drawn by this component but its position is shared state — left set, a
			// navigation back into the editor would open on a card nobody asked for.
			editor.settingsAt = null;
			editor.scrolled = false;
			keyOpen = false;
		};
	});

	$effect(() => {
		const body = text; // read it so the effect tracks the document
		if (typeof localStorage === 'undefined') return;
		if (!settled) {
			// The first run is the mount. `onMount` has already put the stored document (or the
			// starter) into `text` by now, so there is nothing to save and nothing to report.
			settled = true;
			return;
		}
		dirty = true;
		clearTimeout(saveTimer);
		saveTimer = window.setTimeout(() => {
			try {
				localStorage.setItem(STORE, body);
				dirty = false;
			} catch {
				// Same as above — the sheet is still on screen, it just won't survive a reload.
				dirty = false;
			}
		}, 400);
	});

	$effect(() => {
		editor.mode;
		editor.measured;
		editor.scratchShown;
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(`${STORE}:mode`, editor.mode);
			localStorage.setItem(`${STORE}:measure`, editor.measured ? '1' : '0');
			localStorage.setItem(`${STORE}:scratch-shown`, editor.scratchShown ? '1' : '0');
		} catch {
			/* nothing to do */
		}
	});

	// WHICH FOLDERS ARE SHUT, written whenever that changes — so a workspace comes back the way it
	// was left rather than fully open every time, which on a deep tree is a fistful of twisties to
	// press before the pane says anything useful.
	//
	// Gated on there BEING a tree, and that guard is load-bearing: at mount `folders` is empty for
	// as long as the walk takes, and an ungated effect would write `[]` over the remembered list in
	// that window — before `openHeldFolder` had a chance to spend it. Pruned to the tree for the
	// same reason it is pruned on the way in: a path nothing answers to any more is dead weight.
	//
	// THE DRIVE IS NOT REMEMBERED, deliberately. Its folders arrive SHUT so that arriving costs no
	// requests (see `twistBranch`), and restoring an opened remote tree would mean a PROPFIND per
	// remembered folder at mount — the exact cost that rule exists to avoid.
	$effect(() => {
		const shut = editor.collapsed.filter((p) => editor.folders.includes(p));
		if (!editor.folders.length || typeof localStorage === 'undefined') return;
		try {
			if (shut.length) localStorage.setItem(`${STORE}:collapsed`, JSON.stringify(shut));
			else localStorage.removeItem(`${STORE}:collapsed`);
		} catch {
			/* nothing to do — the tree is on screen, it just will not come back this way */
		}
	});

	// The shelf, written whenever it changes. Reading `.length` and the ids is what subscribes it
	// — the handles themselves are not reactive and never change in place.
	$effect(() => {
		editor.loose.map((d) => d.id).join();
		rememberLoose();
	});

	// The scratch list, written whenever it changes. Not debounced: the list changes when a note
	// is made, opened or closed, which is a handful of times a session — the per-keystroke cost
	// is on the sheet's own write above, and this reads the already-stashed text.
	$effect(() => {
		const docs = editor.ephemeral.map((d) => ({ ...d }));
		const open = editor.openIn === 'ephemeral' ? editor.openPath : null;
		if (typeof localStorage === 'undefined') return;
		try {
			if (docs.length) localStorage.setItem(`${STORE}:scratch`, JSON.stringify({ docs, open }));
			else localStorage.removeItem(`${STORE}:scratch`);
		} catch {
			/* nothing to do — the notes are on screen, they just will not survive a reload */
		}
	});

	// ── The caret ─────────────────────────────────────────────────────────────
	// Which SOURCE line the caret is on, for the margin's lit line. Counting newlines before the
	// selection start is exact and costs one scan of the text — cheaper than anything clever, and
	// it cannot disagree with the mirror, which is split on the same character.
	function trackCaret() {
		if (!ta) return;
		caretLine = text.slice(0, ta.selectionStart).split('\n').length - 1;
		measureCaret();
		measureSelection();
	}

	// ── WE DRAW THE CARET OURSELVES ───────────────────────────────────────────
	// A textarea's caret is sized by the FONT, not by the line: the browser draws it the full
	// ascent-plus-descent of the face, which for Space Mono at 15px is 22px against an 11px cap
	// band. On tight leading nobody notices. On this sheet's 26px rows it is a bar looming three
	// times the height of the letters it sits between, starting well above their tops — measured
	// in WebKit at y 1→22 where the caps run 8→18. That is the complaint, and CSS has no lever
	// for it: caret-color sets the colour and nothing sets the size.
	//
	// So the native caret is hidden and this one is drawn instead, which is what every real
	// editor ends up doing. What makes it cheap HERE is that the mirror already exists and is a
	// verified layout replica of the textarea (see the invariant in e2e/text-editor.mjs): a
	// caret placed at an offset in the mirror is at the same pixel as the native one would be.
	//
	// It is measured with a RANGE over the mirror's own text node — deliberately, rather than by
	// splitting the line around a marker span. Splitting would put an inline-box boundary in the
	// middle of a word, which can change shaping and break opportunities, and the one thing this
	// component cannot afford is for the mirror to stop wrapping exactly like the textarea. A
	// Range reads the layout without touching it.
	let caretX = $state(0);
	let caretY = $state(0);
	let caretOn = $state(false);
	let composing = $state(false);
	let finePointer = $state(false);
	let mirrorEl: HTMLDivElement | undefined = $state();
	let stackEl: HTMLDivElement | undefined = $state();

	/** Re-key the caret element so its blink restarts — a caret that is moving must be solid. */
	const caretKey = $derived(`${caretX},${caretY}`);

	function measureCaret() {
		if (!ta || !mirrorEl || !stackEl || !finePointer) return (caretOn = false);
		// No caret for a selection (the highlight says where you are), none when unfocused, and
		// none mid-composition — an IME moves the real caret through text we are not tracking, so
		// the native one is restored for the duration (see the `composing` binding below).
		if (composing || document.activeElement !== ta || ta.selectionStart !== ta.selectionEnd)
			return (caretOn = false);

		const at = ta.selectionStart;
		const lineStart = text.lastIndexOf('\n', at - 1) + 1;
		const mline = mirrorEl.children[caretLine] as HTMLElement | undefined;
		if (!mline) return (caretOn = false);

		// The line's text node, if it has one. An EMPTY line has none at all (it holds no
		// characters — see the note about the zero-width space in the markup), and its caret sits
		// at the line's own left edge.
		const node = [...mline.childNodes].find((n) => n.nodeType === Node.TEXT_NODE) as
			Text | undefined;
		const stack = stackEl.getBoundingClientRect();
		const lineBox = mline.getBoundingClientRect();

		/**
		 * Take a measured rect and place the caret from it.
		 *
		 * The y is SNAPPED to the row grid rather than taken from the rect, and that is not
		 * tidying — the engines disagree about what a range's rect even is. WebKit and Firefox
		 * report the LINE box (26px, starting at the row top); Chromium reports the FONT box
		 * (22px, starting 2px lower, because the half-leading is not part of it). Trusting the
		 * rect's top therefore put the caret 2px low in one engine out of three, which is exactly
		 * the sort of "only wrong in one browser" difference this component keeps producing.
		 * Which ROW the rect is on is unambiguous in all three, so that is what is read off it;
		 * the offset within the row comes from the stylesheet, where it is stated once.
		 */
		const place = (x: number, top: number, ok: boolean) => {
			const rowIndex = Math.max(0, Math.round((top - lineBox.top) / rowHeight()));
			caretX = x - stack.left;
			caretY = lineBox.top - stack.top + rowIndex * rowHeight();
			return (caretOn = ok);
		};

		// THE START OF THE LINE, which is where every blank line's caret lives. The mline's own box
		// already begins exactly where its first character would, so the line box IS the answer —
		// no range needed, and none that would work anyway (see below).
		const atLineStart = () => place(lineBox.left, lineBox.top, true);

		// A line with no text node at all. Rare but real: Svelte need not emit one for an empty
		// expression, and an engine need not keep one.
		if (!node) return atLineStart();

		const col = Math.min(at - lineStart, node.data.length);
		const range = document.createRange();
		range.setStart(node, col);
		range.collapse(true);
		const rect = range.getBoundingClientRect();

		if (!rect.height) {
			// A collapsed range reports NOTHING here, and there are two quite different reasons for
			// it. Mid-line, some engines simply decline to measure a collapsed range: the rect of
			// the character BEFORE the caret, taken at its right edge, is the same place.
			if (col > 0) {
				range.setStart(node, col - 1);
				range.setEnd(node, col);
				const r2 = range.getBoundingClientRect();
				if (r2.height) return place(r2.right, r2.top, true);
			}
			// At column 0 there is no character to fall back to — and on a BLANK line there is no
			// character at all, so the text node is empty and a range inside it can never have a
			// height. That is why blank lines had no caret: the empty rect was being read as "we
			// could not measure this", when in fact it is the correct and only answer for a line
			// with nothing in it. The line's own box says where the caret goes.
			return atLineStart();
		}
		return place(rect.left, rect.top, true);
	}

	/** The row, in px, read from the mirror itself so it cannot disagree with the stylesheet. */
	function rowHeight(): number {
		if (!mirrorEl) return 1;
		const h = parseFloat(getComputedStyle(mirrorEl).lineHeight);
		return Number.isFinite(h) && h > 0 ? h : 1;
	}

	// ── AND WE DRAW THE SELECTION TOO ─────────────────────────────────────────
	// The native selection band has the caret's problem exactly: it is the FONT's box, not the
	// line's — measured at 22px in WebKit and 23px in Firefox against a 26px row, sitting two
	// pixels inside it at the top and stopping short at the bottom. One selected line looks
	// merely a little tight; several in a row look STRIPED, because each band leaves a gap above
	// and below itself that the next one does not fill.
	//
	// So it is drawn from the mirror, on the same principle as the caret and reusing the same
	// row-snapping: a rect per visual row, each exactly one row tall, tiling with no seam.
	//
	// ONLY WHAT IS ON SCREEN. Select-all on a long document would otherwise mean a span per row
	// for the whole file — thousands of elements rebuilt on every selection change. Lines outside
	// the scroller's band are skipped, and the recompute is hung off the scroll handler as well,
	// so the cost is bounded by the window rather than by the document.
	type SelRect = { x: number; y: number; w: number };
	let selRects = $state<SelRect[]>([]);

	function measureSelection() {
		if (!ta || !mirrorEl || !stackEl || !paperEl || !finePointer || composing)
			return (selRects = []);
		const { selectionStart: s, selectionEnd: e } = ta;
		if (s === e || document.activeElement !== ta) return (selRects = []);

		const row = rowHeight();
		const stack = stackEl.getBoundingClientRect();
		const view = paperEl.getBoundingClientRect();
		const lines = srcLines;
		const out: SelRect[] = [];
		// The tail that marks a selected NEWLINE — the line break is inside the selection, and a
		// highlight that stopped at the last character would not say so.
		const tail = rowHeight() * 0.24;

		let at = 0; // running offset of the current line's first character
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineEnd = at + line.length;
			// Wholly before or after the selection.
			if (lineEnd < s || at > e) {
				at = lineEnd + 1;
				continue;
			}
			const mline = mirrorEl.children[i] as HTMLElement | undefined;
			if (!mline) {
				at = lineEnd + 1;
				continue;
			}
			const lb = mline.getBoundingClientRect();
			// Off screen: skip it. This is what keeps a select-all cheap.
			if (lb.bottom < view.top - row || lb.top > view.bottom + row) {
				at = lineEnd + 1;
				continue;
			}

			const a = Math.max(s, at) - at;
			const b = Math.min(e, lineEnd) - at;
			const node = [...mline.childNodes].find((n) => n.nodeType === Node.TEXT_NODE) as
				Text | undefined;
			const newlineSelected = e > lineEnd;

			const push = (left: number, top: number, w: number) => {
				const rowIndex = Math.max(0, Math.round((top - lb.top) / row));
				out.push({
					x: left - stack.left,
					y: lb.top - stack.top + rowIndex * row,
					w: Math.max(w, 1)
				});
			};

			if (node && b > a) {
				const range = document.createRange();
				range.setStart(node, Math.min(a, node.data.length));
				range.setEnd(node, Math.min(b, node.data.length));
				const rects = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
				rects.forEach((r, n) =>
					push(r.left, r.top, r.width + (newlineSelected && n === rects.length - 1 ? tail : 0))
				);
			} else if (newlineSelected || (b === a && b === 0 && line.length === 0)) {
				// A blank line inside the selection, or a line whose newline alone is selected. It
				// gets the same small tail, so an empty line reads as included rather than skipped.
				push(lb.left, lb.top, tail);
			}
			at = lineEnd + 1;
		}
		selRects = out;
	}

	// The mirror re-renders on every keystroke, so the measurement has to happen AFTER Svelte has
	// flushed it — otherwise the Range reads the previous frame's text and the caret trails a
	// character behind. Reading `text` here is what makes this run on every edit.
	$effect(() => {
		text;
		caretLine;
		tick().then(() => {
			measureCaret();
			measureSelection();
		});
	});

	// ── Editing ───────────────────────────────────────────────────────────────
	// Every one of these goes through `write`, and `write` goes through execCommand, because that
	// is the only way to change a textarea's value and keep the browser's own UNDO STACK. Set
	// `.value` directly and Cmd-Z stops working — which, in an editor, is not a rough edge but a
	// broken app. execCommand is deprecated and has been for years; there is still no replacement
	// that preserves undo, so it stays, with a direct-assignment fallback for the day it goes.

	function write(replacement: string, selectStart?: number, selectEnd?: number) {
		if (!ta) return;
		ta.focus();
		let ok = false;
		try {
			ok = document.execCommand('insertText', false, replacement);
		} catch {
			ok = false;
		}
		if (!ok) {
			// The fallback: correct output, lost undo. Better than a key that does nothing.
			const { selectionStart: s, selectionEnd: e } = ta;
			ta.value = ta.value.slice(0, s) + replacement + ta.value.slice(e);
			ta.selectionStart = ta.selectionEnd = s + replacement.length;
		}
		text = ta.value;
		if (selectStart !== undefined) {
			ta.selectionStart = selectStart;
			ta.selectionEnd = selectEnd ?? selectStart;
		}
		trackCaret();
	}

	/**
	 * Wrap the selection in a pair of marks. With NOTHING selected it still writes the pair and
	 * parks the caret between them — pressing B and then typing is the gesture people actually
	 * make, and a key that needs a selection first would be dead half the time it is pressed.
	 * Pressing it again on an already-wrapped selection unwraps it.
	 */
	function surround(open: string, close = open) {
		const { start: s, end: e } = sheet.selection();
		const chosen = text.slice(s, e);
		const before = text.slice(Math.max(0, s - open.length), s);
		const after = text.slice(e, e + close.length);

		if (before === open && after === close) {
			// Already wrapped — take the marks off, and keep the words selected.
			sheet.select(s - open.length, e + close.length);
			sheet.write(chosen, s - open.length, e - open.length);
			return;
		}
		const at = s + open.length;
		sheet.write(open + chosen + close, at, at + chosen.length);
	}

	/**
	 * Put a mark at the head of every line the selection touches — headings, quotes, bullets.
	 * Pressing the same key again takes it off, so H1 is a toggle rather than a stack of hashes.
	 * The whole affected range is rewritten in ONE execCommand so it is a single undo step.
	 */
	function prefix(mark: string) {
		const { start: s, end: e } = sheet.selection();
		const from = text.lastIndexOf('\n', s - 1) + 1;
		const toNewline = text.indexOf('\n', e);
		const to = toNewline === -1 ? text.length : toNewline;

		const chosen = text.slice(from, to).split('\n');
		// A heading replaces whatever heading is already there rather than nesting inside it, so
		// H1 on an H2 line is a change of level, not `# ## text`.
		const family = /^#{1,6} $/.test(mark) ? /^#{1,6} / : new RegExp(`^${escapeRe(mark)}`);
		const allMarked = chosen.every((l) => new RegExp(`^${escapeRe(mark)}`).test(l));
		const next = chosen
			.map((l) => (allMarked ? l.replace(family, '') : mark + l.replace(family, '')))
			.join('\n');

		sheet.select(from, to);
		const shift = next.length - (to - from);
		sheet.write(next, Math.max(from, s + (allMarked ? -mark.length : mark.length)), e + shift);
	}

	const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	/**
	 * Set every line the selection touches to a heading LEVEL — or to none, at level 0. It is its
	 * own verb rather than six calls to `prefix` because the levels are EXCLUSIVE: asking for an
	 * H3 on an H1 line is a change of level, not a second heading, so whatever is there comes off
	 * first. Pressing the level a line already has takes it off, the way the two keys did.
	 */
	function heading(level: number) {
		const { start: s, end: e } = sheet.selection();
		const from = text.lastIndexOf('\n', s - 1) + 1;
		const toNewline = text.indexOf('\n', e);
		const to = toNewline === -1 ? text.length : toNewline;
		const chosen = text.slice(from, to).split('\n');
		const ATX = /^ {0,3}(#{1,6})[ \t]+/;
		const already = chosen.every((l) => l.match(ATX)?.[1].length === level);
		const mark = level && !already ? '#'.repeat(level) + ' ' : '';
		const next = chosen.map((l) => mark + l.replace(ATX, '')).join('\n');
		sheet.select(from, to);
		const shift = next.length - (to - from);
		const head = chosen[0].match(ATX)?.[0].length ?? 0;
		sheet.write(next, Math.max(from, s + (mark.length - head)), e + shift);
	}

	/** Drop a block in on its own lines, with blank lines around it if there aren't any. */
	function block(body: string) {
		const { start: s } = sheet.selection();
		const lead = s > 0 && text[s - 1] !== '\n' ? '\n' : '';
		const tail = s < text.length && text[s] !== '\n' ? '\n' : '';
		sheet.write(lead + body + '\n' + tail);
	}

	// The link key, which is the one that earns a special case. With text selected, the selection
	// becomes the LABEL and the caret lands in the empty target, ready for a paste — which is the
	// order the gesture actually happens in: you copy a URL, select the words, press the key.
	function link() {
		const { start: s, end: e } = sheet.selection();
		const chosen = text.slice(s, e) || 'text';
		const body = `[${chosen}](`;
		sheet.write(`${body})`, s + body.length);
	}

	// ── The keyboard ──────────────────────────────────────────────────────────
	function onKey(event: KeyboardEvent) {
		const meta = event.metaKey || event.ctrlKey;

		if (meta && !event.altKey) {
			const k = event.key.toLowerCase();
			if (k === 'b') return stop(event, () => surround('**'));
			if (k === 'i') return stop(event, () => surround('*'));
			if (k === 'k') return stop(event, link);
			if (k === 'e') return stop(event, () => surround('`'));
			// ⌘S saves back to the open file where that is possible. Where it is not, the browser's
			// own Save-page dialog is not what anyone pressing ⌘S in an editor wants either, so it
			// is swallowed and the download takes its place.
			if (k === 's') return stop(event, () => (editor.openWritable ? saveInPlace() : download()));
		}

		// TAB indents, and that is a deliberate trade. Tab is the keyboard's way OUT of a control,
		// so trapping it takes something away from a keyboard user — but in a text editor Tab is
		// also how you indent a nested list, and a Markdown editor where Tab jumps to the next
		// button is not an editor. Escape is the way out instead (below), which is the pattern
		// every code editor on the web settled on.
		if (event.key === 'Tab') {
			event.preventDefault();
			if (event.shiftKey) return dedent();
			return sheet.write('  ');
		}
		if (event.key === 'Escape') {
			// The advertised way out of the trap. Blurring hands focus back to the document, so
			// the next Tab reaches the rack.
			sheet.blur();
			return;
		}

		if (event.key === 'Enter' && !event.shiftKey && !meta) return carryList(event);
	}

	function stop(event: KeyboardEvent, run: () => void) {
		event.preventDefault();
		run();
	}

	/** Shift-Tab: take one indent step off the current line, if there is one to take. */
	function dedent() {
		const { start: s } = sheet.selection();
		const from = text.lastIndexOf('\n', s - 1) + 1;
		const line = text.slice(from, s);
		const lead = line.match(/^[ \t]{1,2}/)?.[0];
		if (!lead) return;
		sheet.select(from, from + lead.length);
		sheet.write('', s - lead.length);
	}

	/**
	 * Enter inside a list carries the list on: same indent, same marker, the number stepped. Enter
	 * on an EMPTY item ends the list instead of laying down another empty bullet — which is the
	 * behaviour every editor has and nobody notices until it is missing.
	 */
	function carryList(event: KeyboardEvent) {
		const { start: s, end: e } = sheet.selection();
		if (s !== e) return; // a selection makes this an ordinary replace
		const from = text.lastIndexOf('\n', s - 1) + 1;
		const line = text.slice(from, s);
		const m = line.match(/^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))[ \t]+(.*)$/);
		if (!m) return;
		const [, indent, bullet, number, delimiter, rest] = m;

		event.preventDefault();
		if (!rest) {
			// An empty item: clear the marker off this line and leave the caret on a blank line.
			sheet.select(from, s);
			sheet.write('');
			return;
		}
		const marker = bullet ? `${bullet} ` : `${Number(number) + 1}${delimiter} `;
		sheet.write(`\n${indent}${marker}`);
	}

	// ── Getting it out ────────────────────────────────────────────────────────
	// COPYING THE SHEET used to live here, behind a key in the bar. It is `copyDoc` now, on a
	// document's own menu — the same clipboard write with a row in front of it, so it says which
	// document it copied. The Save lamp's timer is still here, with the verb that sets it.

	// ── Opening ───────────────────────────────────────────────────────────────
	// Two hidden inputs, because the two pickers are genuinely different things. A single file is
	// `accept`; a folder is `webkitdirectory`, which is a prefixed de-facto standard rather than a
	// specified one — every current browser implements it, but WHAT the picker looks like, and
	// whether it will even offer a directory, is the platform's call. That is why the folder is a
	// separate key rather than an option inside the first: a picker that sometimes cannot do what
	// the label says is worse than two labels.
	//
	// The File System Access API (`showDirectoryPicker`) would give a nicer folder experience and
	// the ability to save back — and it is Chromium-only, so it is deliberately NOT used. One code
	// path that works everywhere beats a good one that works in one browser and a fallback nobody
	// tests.
	let fileInput: HTMLInputElement | undefined = $state();
	let folderInput: HTMLInputElement | undefined = $state();

	/**
	 * Replace EVERYTHING on the sheet — the one gesture behind opening a document, putting the
	 * manual back, and clearing. Every caller then sets the name, the handle and the marked row.
	 *
	 * Through the textarea where there is one, because `write` is what keeps the browser's undo
	 * stack and that is what makes opening the wrong file cost one Cmd-Z instead of the words.
	 *
	 * In PROOF there is NO textarea — the sheet is not mounted in that mode — and every one of
	 * these used to give up at the `if (!ta)` guard. The workspace is drawn in all three modes, so
	 * picking a document in PROOF marked the row and left the old document set: the pane followed
	 * the file in Write and Split and nowhere else. Clear was worse, taking the name off a sheet it
	 * then failed to empty.
	 *
	 * Straight onto `text` in that case, and nothing is lost by it: the textarea is DESTROYED on
	 * the way into proof and built again on the way out, so its undo stack is already empty before
	 * this runs — there is no history here to preserve. `bind:value` fills the new one from `text`,
	 * so the two cannot come back disagreeing.
	 */
	function putOnSheet(body: string) {
		if (!ta) {
			text = body;
			return;
		}
		ta.focus();
		ta.setSelectionRange(0, ta.value.length);
		write(body);
		ta.setSelectionRange(0, 0);
		trackCaret();
	}

	/**
	 * THE SHEET, as everything above it sees it — the seam described at length in
	 * $lib/text-editor-sheet.
	 *
	 * This is the PROSE implementation, and it is deliberately thin: every method here is one or
	 * two lines over machinery that already existed, because the point of this object is not to do
	 * anything new but to be the only door through which the marks, the contents rail and the
	 * workspace reach the text control. What is left OUTSIDE it — `trackCaret`, `measureCaret`,
	 * `measureSelection`, `onPaperScroll`, the mirror itself — is this sheet's own business and
	 * has no meaning for any other one. A second engine draws its own caret and scrolls itself.
	 *
	 * It stays an object literal in this component rather than a factory in the module, because it
	 * closes over `ta`, `text`, `mirrorEl` and `srcLines`, and `text` is a rune that has to be
	 * ASSIGNED. Handing all of that to a factory would mean passing a setter for the one piece of
	 * state the component most obviously owns.
	 */
	const proseSheet: Sheet = {
		selection: () => ({ start: ta?.selectionStart ?? 0, end: ta?.selectionEnd ?? 0 }),
		select(start, end) {
			if (!ta) return;
			ta.selectionStart = start;
			ta.selectionEnd = end ?? start;
		},
		write: (replacement, selectStart, selectEnd) => write(replacement, selectStart, selectEnd),
		put: (body) => putOnSheet(body),
		focus: (opts) => ta?.focus(opts),
		blur: () => ta?.blur(),
		goToLine(line) {
			// ORDER MATTERS HERE, and getting it wrong is what made the contents rail take two
			// clicks. Focusing a text control scrolls its CURRENT selection into view, and this
			// textarea is not its own scroller — it is the full height of the document, laid over
			// the mirror — so the browser scrolls `.te-paper` instead. Done after the row was
			// scrolled to, that threw the sheet straight back to wherever the caret had been left:
			// the first press on a heading landed on the PREVIOUS heading's position, and the
			// second, with the caret now in the right chapter, looked like it had worked.
			//
			// So the caret is set first, focus is taken with the scrolling suppressed, and the row
			// is scrolled to LAST, where nothing can undo it.
			const at = srcLines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
			if (ta) {
				ta.setSelectionRange(at, at);
				ta.focus({ preventScroll: true });
			}
			const row = mirrorEl?.children[line] as HTMLElement | undefined;
			row?.scrollIntoView({ block: 'center' });
			trackCaret();
		},
		// Nothing to let go of: this sheet IS markup, and Svelte unmounts it.
		destroy: () => {}
	};

	/**
	 * THE CODE SHEET — CodeMirror, built on demand, held here while a code file is open.
	 *
	 * Null in every other case, which is what makes `sheet` below resolve to the prose one. It is
	 * `$state` rather than a plain variable because `sheet` is derived from it and the whole app
	 * reads `sheet`.
	 */
	let codeSheet = $state<(Sheet & { setLanguage(f: string): Promise<void> }) | null>(null);
	/** The element CodeMirror builds into. Only rendered for a code file. */
	let codeEl: HTMLDivElement | undefined = $state();
	/** True between asking for the module and having an editor. It is a network fetch the first
	 *  time, so it is worth saying so rather than showing an empty white pane. */
	let codeComing = $state(false);
	/** The engine was asked for and did not arrive. Falls back to the prose sheet; see the catch. */
	let codeLost = $state(false);

	/**
	 * WHICH SHEET IS THE SHEET. Everything above this line — the marks, the contents rail, the
	 * workspace, the keyboard — goes through `sheet` and none of it knows which engine answered.
	 * That is the entire return on the seam.
	 */
	const sheet: Sheet = $derived(codeSheet ?? proseSheet);

	/**
	 * BUILDING AND LETTING GO OF THE CODE SHEET.
	 *
	 * Two effects rather than one, and the split is the point: this one owns the sheet's LIFE and
	 * runs only when the kind changes, the one below owns its GRAMMAR and runs on every file. Put
	 * together they would rebuild CodeMirror on every code-file switch and throw away the undo
	 * history each time — the same quiet loss the prose sheet goes through `execCommand` to avoid.
	 *
	 * `text` and `editor.filename` are read through `untrack`, because this effect must not re-run
	 * on a keystroke or on a file switch. What it depends on is the kind and the element, and
	 * saying so precisely is what keeps a network import from being fired twice.
	 *
	 * THE DOCUMENT COMES FROM `text`, WHICH IS ALREADY RIGHT. `load` calls `sheet.put` BEFORE it
	 * sets the filename, so at that moment the OLD sheet is still the sheet: coming from prose the
	 * words land in the textarea, coming from code they land through `onChange`. Either way `text`
	 * holds the document by the time the kind flips and this runs.
	 */
	$effect(() => {
		const el = codeEl;
		const wantsCode = kind === 'code' && !codeLost;
		if (!wantsCode || !el) {
			if (codeSheet) {
				codeSheet.destroy();
				codeSheet = null;
			}
			codeComing = false;
			return;
		}
		if (codeSheet) return;
		let dropped = false;
		codeComing = true;
		(async () => {
			try {
				const { makeCodeSheet } = await import('$lib/code-sheet');
				const built = await makeCodeSheet({
					parent: el,
					doc: untrack(() => text),
					filename: untrack(() => editor.filename),
					onChange: (next) => (text = next)
				});
				// The kind can change while a module is in flight — open a `.ts`, change your mind,
				// open a `.md`. Without this the editor is built into an element that is no longer
				// in the document and never torn down.
				if (dropped) return built.destroy();
				codeSheet = built;
				codeComing = false;
			} catch {
				// THE ENGINE COULD NOT BE FETCHED — almost always offline, on a machine that has
				// never opened a code file here (see `warmCodeSheet`, which exists to make that
				// rare). The document is NOT lost and must not appear to be: the prose sheet is a
				// textarea, and a textarea can read, edit and save a stylesheet perfectly well. It
				// has no bracket matching and no highlighting, which is a smaller loss than a pane
				// that says "Loading…" until the tab is closed.
				if (dropped) return;
				codeComing = false;
				codeLost = true;
			}
		})();
		return () => {
			dropped = true;
		};
	});

	/**
	 * THE GRAMMAR FOLLOWS THE FILENAME, through a Compartment rather than a rebuild. Opening a
	 * `.css` after a `.ts` is a reconfigure; the editor, its history and its scroll position stay.
	 */
	$effect(() => {
		const name = editor.filename;
		codeSheet?.setLanguage(name);
	});

	/**
	 * A NEW DOCUMENT DESERVES A FRESH ATTEMPT AT THE ENGINE.
	 *
	 * `codeLost` latches, so a fetch that failed does not retry on every keystroke and leave the
	 * pane flickering between two sheets. Opening another file clears it — which is also how
	 * somebody who was offline and has since come back gets the real editor without reloading the
	 * page.
	 */
	$effect(() => {
		editor.filename;
		untrack(() => {
			if (codeLost) codeLost = false;
		});
	});

	/**
	 * A document's WORDS, on the sheet, under its name. It goes through `write`, like every other
	 * edit, so opening the wrong file is UNDOABLE — Cmd-Z brings back what was there. That is the
	 * whole reason opening does not have to ask first.
	 *
	 * `handle` is the shelf's business and is null for anything in the workspace: a tree document is
	 * a path in a store now, and the store is what knows how to write to one. `writable` is the
	 * answer to the only question the keys ever asked the handle — can this be saved back — asked
	 * of the document rather than of the browser.
	 */
	function land(
		body: string,
		name: string,
		handle: FileSystemFileHandle | null,
		writable: boolean
	): boolean {
		// THE BYTES GET THE LAST WORD. The name says a file is openable — the deny-list is short
		// and deliberately incomplete, because text is the default state of a file and the
		// exceptions are what deserve naming. This is the guard that makes that safe: a NUL byte
		// near the front means no encoding this app can display, and putting it on the sheet would
		// be mojibake over the reader's own document with a Save key next to it.
		//
		// Refused rather than mangled, and said out loud. The row stays where it is.
		if (looksBinary(body)) return false;
		// Whatever is on the sheet may be a scratch note, and this is about to be over it.
		stashEphemeral();
		sheet.put(body.replace(/\r\n?/g, '\n'));
		editor.filename = name;
		editor.openHandle = handle;
		editor.openWritable = writable;
		// The workspace STAYS OPEN when you pick from it — that is what makes it a workspace
		// rather than a picker. It closes on a phone, where it covers the sheet it just filled.
		if (editor.narrow) editor.folderShown = false;
		return true;
	}

	/**
	 * The same, from a File — the Open key's pick, a launched document, a row on the shelf. These
	 * are the documents that come from OUTSIDE any workspace, which is why they still arrive as a
	 * file and a handle rather than as a path.
	 */
	async function load(file: File, handle: FileSystemFileHandle | null = null) {
		let body: string;
		try {
			body = await file.text();
		} catch {
			// A file that vanished between picking and reading, or one the browser will not hand
			// over. Nothing to put on the sheet, and nothing worth interrupting the writer for.
			return;
		}
		land(body, file.name, handle, !!handle);
	}

	/**
	 * A file, by hand. Where the browser has `showOpenFilePicker` it is used, and everywhere else
	 * the hidden `<input type=file>` stands in — exactly the arrangement the FOLDER key already
	 * keeps, and for the two things a handle buys that a File cannot: the document can be saved
	 * back to, and its row on the shelf can be REMEMBERED. A File is a snapshot with nothing
	 * behind it; there is no way to re-read one after a reload, so a shelf built on them empties
	 * itself every visit.
	 */
	async function openFile() {
		const pick = window.showOpenFilePicker;
		if (!pick) return fileInput?.click();
		let handle: FileSystemFileHandle;
		try {
			[handle] = await pick({
				types: [
					{
						description: 'Markdown and plain text',
						accept: {
							'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'],
							'text/plain': ['.txt', '.text']
						}
					}
				]
			});
		} catch {
			// Cancelled. Not an error, and not worth a word.
			return;
		}
		let file: File;
		try {
			file = await handle.getFile();
		} catch {
			return;
		}
		shelve({ id: `h:${handle.name}`, name: handle.name, handle });
		await load(file, handle);
	}

	// ── Installed ─────────────────────────────────────────────────────────────
	// See the note in onMount for why all of this is the editor's rather than the page's.

	/**
	 * Put the service worker up (src/service-worker.ts). It is what makes the editor openable
	 * without a network, and it is also half of what makes the browser willing to install it at
	 * all — Chromium will not offer an install for a page that has no worker.
	 *
	 * Registered from HERE and nowhere else, which is why `serviceWorker: { register: false }` is
	 * set in vite.config.ts. A failure is quiet on purpose: the worker is an improvement to an app
	 * that works without one, and a page that popped a message about a caching layer would be
	 * telling the visitor about the plumbing.
	 */
	async function registerWorker() {
		if (!('serviceWorker' in navigator)) return;
		try {
			// The dev server hands the worker over as an ES module (it is TypeScript, unbundled);
			// the build emits one classic file. Registering with the wrong type fails outright, and
			// the two answers are not the same in the two places.
			await navigator.serviceWorker.register('/service-worker.js', {
				type: dev ? 'module' : 'classic'
			});
		} catch {
			// No worker: an insecure origin, a private window, a browser with them switched off.
		}
	}

	/**
	 * Documents handed over by a LAUNCH — a `.md` opened from the file manager once the editor is
	 * installed (`file_handlers` in static/text-editor.webmanifest). They arrive as real handles,
	 * already granted, which is the same thing the Open key's picker returns; so they go through
	 * the same two steps and the launched document is savable in place like any other.
	 *
	 * There is ONE sheet, so a multiple selection cannot all be opened. Every one of them is
	 * shelved — that is what the shelf is for, documents from outside the folder — and the first
	 * goes on the sheet. Not the last: the first is the one under the pointer when a selection is
	 * dragged onto the app.
	 */
	function takeLaunchedFiles() {
		const queue = (
			window as unknown as {
				launchQueue?: { setConsumer(fn: (p: { files: FileSystemFileHandle[] }) => void): void };
			}
		).launchQueue;
		if (!queue) return;
		queue.setConsumer(async (params) => {
			if (!params.files?.length) return;
			for (const handle of params.files) {
				shelve({ id: `h:${handle.name}`, name: handle.name, handle });
			}
			const first = params.files[0];
			try {
				await load(await first.getFile(), first);
			} catch {
				// The launch named a file the app can no longer read. Its row is on the shelf, and
				// pressing that row is the retry.
			}
		});
	}

	// ── Scratch ───────────────────────────────────────────────────────────────
	// What New makes. It used to ask for a name and create a real file in the open folder, which
	// meant it only existed in Chromium, only with a folder open, and asked you to decide what a
	// note was called before you had written it. A new document is now a scratch one: named for
	// you, on the sheet at once, and on a list of its own above the shelf.
	//
	// This is the ONE kind of document the workspace holds the text of. Everything else in the
	// pane can afford to remember only where its document came from, because it can always read
	// it back; there is nowhere to read this one back from, so a list that dropped it on the way
	// to another row would be quietly destroying work.

	/** `Ephemeral 3` — the lowest number not already taken, so closing one frees its name. */
	function nextEphemeralName() {
		const taken = new Set(editor.ephemeral.map((d) => d.name));
		let n = 1;
		while (taken.has(`Ephemeral ${n}`)) n += 1;
		return `Ephemeral ${n}`;
	}

	/**
	 * The sheet holds an ephemeral document and is about to stop. Its words go back to its row
	 * BEFORE anything replaces them — this is the only place they exist.
	 */
	function stashEphemeral() {
		if (editor.openIn !== 'ephemeral') return;
		const at = editor.ephemeral.findIndex((d) => d.id === editor.openPath);
		if (at >= 0) editor.ephemeral[at].text = text;
	}

	/**
	 * THE STANDING NOTE. There is always a scratch document, and at mount it is `Ephemeral 0`.
	 *
	 * Before this the sheet could hold a document with no row behind it — whatever a first visit
	 * opened with, or whatever was restored — and that one document was the exception to
	 * everything the workspace can do to a document: no Copy, no Save a copy, no Clear, because
	 * all three are a ROW'S verbs now. Seeding the list closes that hole rather than special-casing
	 * it in three places.
	 *
	 * `keep` is the sheet's own words, so a first visit does not lose the manual page it opened
	 * with: the note is made AROUND what is already there rather than over it. It takes id `eph-0`
	 * and the seq carries on at 1, so the first New is still `Ephemeral 1`.
	 */
	function ensureScratch(keep = ''): Ephemeral | null {
		if (editor.ephemeral.length) return null;
		const doc = { id: 'eph-0', name: 'Ephemeral 0', text: keep };
		editor.ephemeral = [doc];
		// It MAKES the note and does not open it. Opening is the caller's, because the two callers
		// need opposite things: at mount the note is made around what is already on the sheet and
		// only the markers are missing, and after a close the sheet is holding the words of the
		// note that was just destroyed and has to be written over.
		//
		// Marking a row open without putting it on the sheet is exactly the bug this shape fixes:
		// the row said `Ephemeral 0` was open, the sheet still held the closed note's words, and
		// clicking the row did nothing at all — `openEphemeral` saw a note that was already open
		// and returned.
		return doc;
	}

	function newEphemeral() {
		stashEphemeral();
		const doc = { id: `eph-${ephemeralSeq++}`, name: nextEphemeralName(), text: '' };
		editor.ephemeral = [...editor.ephemeral, doc];
		putEphemeralOnSheet(doc);
		// The workspace stays open on a wide window, and on a phone it covers the sheet it just
		// filled — the same rule every other way of opening a document keeps.
		if (editor.narrow) editor.folderShown = false;
	}
	let ephemeralSeq = 1;

	function openEphemeral(doc: Ephemeral) {
		if (editor.openIn === 'ephemeral' && editor.openPath === doc.id) return;
		stashEphemeral();
		putEphemeralOnSheet(doc);
		if (editor.narrow) editor.folderShown = false;
	}

	/**
	 * Through `write`, like every other way of putting something on the sheet, so switching to a
	 * scratch note is undoable exactly as opening a file is.
	 */
	function putEphemeralOnSheet(doc: Ephemeral) {
		sheet.put(doc.text);
		editor.filename = doc.name;
		editor.openHandle = null;
		editor.openWritable = false;
		editor.openPath = doc.id;
		editor.openIn = 'ephemeral';
	}

	// The scratch list is the ONE list in this pane whose order is yours. The tree is alphabetical
	// because a folder is, and the shelf is by recency because that is what it means; these are
	// notes you made, and the order you want them in is not a fact about anything else.
	let dragEph = $state('');
	let dropEphOn = $state('');

	function onEphDragStart(event: DragEvent, id: string) {
		dragEph = id;
		event.dataTransfer?.setData('text/plain', id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function onEphDragOver(event: DragEvent, id: string) {
		if (!dragEph || dragEph === id) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		dropEphOn = id;
	}

	/** Dropped ON a row means "take the place of this one", which is what a list of six needs. */
	function onEphDrop(event: DragEvent, id: string) {
		event.preventDefault();
		const from = editor.ephemeral.findIndex((d) => d.id === dragEph);
		const to = editor.ephemeral.findIndex((d) => d.id === id);
		dragEph = '';
		dropEphOn = '';
		if (from < 0 || to < 0 || from === to) return;
		const next = [...editor.ephemeral];
		next.splice(to, 0, ...next.splice(from, 1));
		editor.ephemeral = next;
	}

	/**
	 * A-Z, for when the order you dragged them into has stopped meaning anything. `numeric` so
	 * `Ephemeral 10` follows `Ephemeral 9` rather than `Ephemeral 1` — these names END in a
	 * figure, and a plain string sort would file them the way a filing cabinet files 1, 10, 2.
	 */
	function sortEphemeral() {
		editor.ephemeral = [...editor.ephemeral].sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { numeric: true })
		);
	}

	/** Take a scratch note off the list. Its words go with it — there is nowhere else they are. */
	function closeEphemeral(doc: Ephemeral) {
		const at = editor.ephemeral.findIndex((d) => d.id === doc.id);
		const wasOpen = editor.openIn === 'ephemeral' && editor.openPath === doc.id;
		editor.ephemeral = editor.ephemeral.filter((d) => d.id !== doc.id);
		// Closing the LAST one leaves a standing note behind it rather than an empty list — the
		// pane always has a scratch document, and closing the only one reads as clearing it. The
		// new one is empty: what it replaces is gone, and this is not a way of undoing that.
		const standing = ensureScratch();
		if (!wasOpen) return;
		// IT LANDS ON ANOTHER NOTE, the way closing a tab does. The sheet used to keep the closed
		// note's words with no row marked anywhere — a document on the sheet that the workspace
		// had never heard of, which is the one state this pane is now built not to have: Copy,
		// Save a copy and Clear are a ROW'S verbs, so a sheet with no row has none of them.
		// The neighbour at the same index (the one that slid up into the closed row's place), or
		// the last one if it was the last row, or the standing note that has just been made.
		const next = standing ?? editor.ephemeral[Math.min(at, editor.ephemeral.length - 1)];
		putEphemeralOnSheet(next);
	}

	// The sheet is the live copy while a scratch note is open, so the row has to follow it. On a
	// debounce with the same rhythm as the localStorage write below rather than per keystroke —
	// it is the same cost for the same reason.
	$effect(() => {
		text;
		if (editor.openIn !== 'ephemeral') return;
		const id = editor.openPath;
		const t = window.setTimeout(() => {
			const at = editor.ephemeral.findIndex((d) => d.id === id);
			if (at >= 0) editor.ephemeral[at].text = text;
		}, 300);
		return () => clearTimeout(t);
	});

	// ── The shelf ─────────────────────────────────────────────────────────────
	// Documents opened from OUTSIDE the folder. Without it, a file picked with Open had nowhere
	// to be — the tree cannot list what is not in the folder, so the moment you clicked anything
	// else it was off the screen with no way back but the picker. It sits above the tree because
	// it is the shorter, more recent list, and because a shelf under a tree of unknown depth is a
	// shelf you have to scroll to.
	//
	// Ephemeral, and it says so by behaving that way: capped, oldest off the end, nothing kept
	// across a reload. A folder is where the work lives; this is what you reached for while you
	// were in it.
	const LOOSE_MAX = 6;

	/** Identity for a picked file — NOT its name; two folders both holding a README is normal. */
	const looseId = (file: File) => `${file.name}\u0000${file.size}\u0000${file.lastModified}`;

	function shelve(doc: LooseDoc) {
		// Re-opening something already on the shelf moves it to the front rather than doubling it:
		// the list is in the order you last reached for them.
		const rest = editor.loose.filter((d) => d.id !== doc.id);
		editor.loose = [doc, ...rest].slice(0, LOOSE_MAX);
		editor.openPath = doc.id;
		editor.openIn = 'loose';
	}

	/**
	 * A shelf row that cannot be opened. Moved, deleted, a permission that has lapsed, a drive that
	 * will not answer — the row is the only thing that was ever ours, so the row goes.
	 */
	function dropShelfRow(id: string) {
		editor.loose = editor.loose.filter((d) => d.id !== id);
	}

	/** The Open key's file. It has no handle — a picked file cannot be saved back to. */
	async function openLooseFile(file: File) {
		shelve({ id: looseId(file), name: file.name, file });
		await load(file);
	}

	/** A row on the shelf, opened again. It re-reads from disk; the shelf holds no text. */
	async function openLoose(doc: LooseDoc) {
		// A DRIVE ROW re-reads from the server, exactly as a handle row re-reads from disk — the
		// shelf holds where a document came from and never its words. If that drive is not the one
		// currently open it is opened first, which is the same shape as a handle whose grant has
		// lapsed re-asking on the click: the row promises to open the document, so the click is
		// where the cost of keeping that promise is paid.
		if (doc.drive) {
			if (driveId !== doc.drive.connection) {
				const c = editor.connections.find((k) => k.id === doc.drive!.connection);
				if (!c || !(await openDrive(c))) return dropShelfRow(doc.id);
			}
			const body = await drive?.read(doc.drive.path);
			if (body == null) return dropShelfRow(doc.id);
			shelve(doc);
			if (!land(body, doc.name, null, !!drive?.writable)) flash(doc.id, 'Not text', 'lost');
			return;
		}
		let file = doc.handle ? await doc.handle.getFile().catch(() => null) : (doc.file ?? null);
		// A remembered row comes back with its grant lapsed. This click is a user gesture, which
		// is the only moment a browser will re-ask — so it asks here rather than at mount, where
		// it would be a permission dialog thrown at somebody who has just loaded a page.
		if (!file && doc.handle) {
			const state = await doc.handle
				.requestPermission?.({ mode: 'readwrite' })
				.catch(() => 'denied');
			if (state === 'granted') file = await doc.handle.getFile().catch(() => null);
		}
		if (!file) return dropShelfRow(doc.id);
		shelve(doc);
		await load(file, doc.handle ?? null);
	}

	/**
	 * A folder is being opened while a document from the LAST one is on the sheet. It is about to
	 * stop being in the folder, which is exactly what the shelf is for — so it is put there,
	 * with its handle, rather than quietly losing its row.
	 */
	function shelveTheOpenOne() {
		if (!editor.openPath || !editor.filename) return;
		if (editor.openIn !== 'tree' && editor.openIn !== 'cloud') return;
		// The STORE makes the row, because the store is the only thing that knows what the document
		// was made of — a handle here, a File there. It used to be built from `editor.openHandle`,
		// which a `webkitdirectory` document never had: those were shelved as a name with nothing
		// behind it, so the row deleted itself the moment it was pressed.
		const doc = storeOf(editor.openIn)?.detach(editor.openPath);
		if (doc) {
			const rest = editor.loose.filter((d) => d.id !== doc.id);
			editor.loose = [doc, ...rest].slice(0, LOOSE_MAX);
			// It is not marked as open after this: `openPath` is cleared by the folder that is
			// arriving, and the sheet still holds it but the workspace no longer claims to.
			return;
		}
		// NULL IS NOT "nothing to do here". It is "there is no way to refer to this document once
		// the workspace it is in has gone", and the caller is about to take its row away — so
		// returning quietly leaves a document on the sheet with NO ROW ANYWHERE, which is the one
		// state this pane is built not to have. Copy, Save a copy and Clear are all a row's verbs;
		// a sheet with no row is a document that none of them can reach.
		//
		// It becomes a SCRATCH note, and that is not a demotion — it is the correct name for what
		// it now is. A scratch note is defined here as the one document this pane holds the words
		// of because there is nowhere to read them back from, and a document whose store has just
		// gone is exactly that. The words are kept, the row is real, and every verb works.
		//
		// A remote document does NOT have to end up here: its server is still there and only this
		// app has lost its grip on it. Giving it a proper shelf row needs a reference that outlives
		// the store — a connection and a path rather than a handle — which is what the connection
		// registry is for. Until then this is the floor, and the floor is not the ground.
		strandTheOpenOne();
	}

	/**
	 * The open document, kept as a scratch note because nothing else can hold it. See the note
	 * above for when this happens and why it is the honest answer rather than a fallback.
	 *
	 * It is marked OPEN, unlike a shelved row: the sheet is not changing, so the row and the sheet
	 * have to agree about what is on it. That is the opposite of `shelveTheOpenOne`'s ending, and
	 * for the opposite reason — there the document is leaving the workspace's care, here it is
	 * arriving in it.
	 */
	function strandTheOpenOne() {
		const doc = {
			id: `eph-${ephemeralSeq++}`,
			// Its own name, not `Ephemeral 4`. What is on the sheet is still that document, and a
			// row that renamed it would be the second thing lost in one gesture.
			name: editor.filename,
			text
		};
		editor.ephemeral = [...editor.ephemeral, doc];
		editor.openPath = doc.id;
		editor.openIn = 'ephemeral';
		editor.openHandle = null;
		editor.openWritable = false;
	}

	/**
	 * With no workspace open, this picks a folder. With one open it TOGGLES the pane — the same
	 * key, because once a folder is loaded "Folder" is a place you go rather than a thing you
	 * choose, and a second key to show a pane that is already loaded is a key too many. Changing
	 * folders is inside the pane, where the folder you would be changing is named.
	 */
	function openFolder() {
		// A SHELF counts as something to show. Scratch notes and documents from elsewhere live in
		// this pane too, and after a reload they can outlive the folder entirely — a key that
		// answered "pick a folder" while two scratch notes sat behind it would be hiding them.
		if (editor.folder.length || editor.loose.length || editor.ephemeral.length) {
			editor.folderShown = !editor.folderShown;
			return;
		}
		pickFolder();
	}

	// ── The workspace's backing store ─────────────────────────────────────────
	// The tree is not a list of handles any more. It is a list of PATHS and a `Store` that knows
	// what a path means — see $lib/text-editor-store, which holds both the walk and the five verbs
	// that used to be spelled out here against `FileSystemFileHandle`. Two stores exist today, and
	// they are the two ways a browser will hand over a folder: a real directory (Chromium, writable)
	// and a `webkitdirectory` snapshot (everywhere, read-only).
	//
	// `$state.raw` rather than `$state`: this is REPLACED wholesale and never mutated, and a deep
	// proxy would be actively harmful — the local store carries the directory handle that IndexedDB
	// has to structured-clone, and a Proxy is not cloneable.
	let store = $state.raw<Store | null>(null);
	/**
	 * THE DRIVE, which is a second store living at the same time rather than a different value of
	 * the first. A folder on the machine and a folder on a server are different kinds of place and
	 * somebody may reasonably keep both — so they are two lists in the pane, and every verb below
	 * takes the list it is acting on rather than assuming there is only one.
	 */
	let drive = $state.raw<Store | null>(null);
	/** Which CONNECTION the live drive is. A shelf row names one, and this is how it is matched. */
	let driveId = $state('');

	/** Which store a list's rows belong to. The one lookup that keeps the verbs written once. */
	const storeOf = (list: 'tree' | 'cloud') => (list === 'cloud' ? drive : store);
	/** And which array holds them. */
	const entriesOf = (list: 'tree' | 'cloud') => (list === 'cloud' ? editor.drive : editor.folder);

	/**
	 * Take a store on as the workspace. False if it could not be read at all, which only a
	 * remembered folder ever acts on — see `openHeldFolder`.
	 */
	/**
	 * Ask for the code engine in the background if this listing contains any code at all.
	 *
	 * The import of the WARMER is itself dynamic, so a prose-only visitor does not even fetch the
	 * module that decides not to fetch anything — `$lib/code-sheet` is where the language table
	 * lives, and pulling it in eagerly would drag the decision into the main chunk.
	 */
	function warmForCode(names: string[]) {
		const code = names.filter((n) => kindOf(n) === 'code');
		if (!code.length) return;
		import('$lib/code-sheet').then((m) => m.warmCodeSheet(code)).catch(() => {});
	}

	async function adopt(next: Store) {
		const listing = await next.list();
		if (!listing) return false;
		// Whatever was open belonged to the LAST folder. Shelved before the new one lands, or its
		// row would simply vanish with the tree it was in. A no-op unless a TREE document is on the
		// sheet, which is why it can be called on every path through here.
		shelveTheOpenOne();
		store = next;
		editor.folder = listing.files;
		editor.folders = listing.dirs;
		editor.folderName = next.name;
		// A WORKSPACE THAT HOLDS CODE WARMS THE ENGINE. The service worker caches what is fetched,
		// so doing this now — while there is a network — is what makes a `.ts` in this folder open
		// on a plane later. Nothing happens for a folder of prose, which is why the install stays
		// small. See `warmCodeSheet` for why it is a warm rather than a precache.
		warmForCode(listing.files.map((f) => f.name));
		editor.folderWritable = next.writable;
		editor.folderShown = true;
		editor.folderPending = false;
		// Only a document from the OLD TREE stops being the open one — it has just been shelved by
		// the line above. A scratch note or a shelf row belongs to no folder at all, and clearing
		// the mark on one because a folder changed underneath it took the Save key away from a
		// note that was still on the sheet.
		if (editor.openIn === 'tree') {
			editor.openPath = '';
			editor.openWritable = false;
		}
		// A different folder is a different tree; what was shut in the last one means nothing here.
		editor.collapsed = [];
		return true;
	}

	/** The Chromium path: a real directory, with permission to write it. */
	async function pickWritableFolder() {
		const pick = window.showDirectoryPicker;
		if (!pick) return;
		let dir: FileSystemDirectoryHandle;
		try {
			dir = await pick({ mode: 'readwrite' });
		} catch {
			// The visitor cancelled the picker, or declined permission. Neither is an error worth
			// saying anything about.
			return;
		}
		held = localStore(dir, isOpenable);
		if (await adopt(held)) rememberFolder(dir);
	}

	/**
	 * A SCRATCH note becomes a real file. This is the one way a document is created on disk now
	 * that New makes a note instead of a file — and it is the right way round: you write the
	 * thing first and decide it is worth keeping second, rather than naming an empty file before
	 * there is anything in it.
	 *
	 * It stops being scratch the moment it lands. The row leaves the shelf, the tree gains it,
	 * and the sheet is holding a real file with a handle behind it — so the next press of Save is
	 * an ordinary save in place.
	 */
	async function fileScratchNote() {
		const doc = editor.ephemeral.find((d) => d.id === editor.openPath);
		// Into the store that is OPEN, at its root. The free name and the write are both the store's
		// — filing a second note over a first one has to be impossible wherever documents are kept,
		// not only where this app happens to have written the check.
		// INTO THE FOLDER where there is a writable one, and into the drive otherwise. The local one
		// leads because a note filed on the machine it was written on is the less surprising of the
		// two — and because a drive is often open alongside a folder, so a rule of "whichever is
		// open" would have no answer.
		const list: 'tree' | 'cloud' = store?.writable ? 'tree' : 'cloud';
		const into = storeOf(list);
		if (!doc || !into?.writable) return;
		const entry = await into.create('', doc.name, '.md', text);
		if (!entry) return;
		if (!entriesOf(list).some((e) => e.path === entry.path)) {
			if (list === 'cloud')
				editor.drive = [...editor.drive, entry].sort((a, b) => a.path.localeCompare(b.path));
			else editor.folder = [...editor.folder, entry].sort((a, b) => a.path.localeCompare(b.path));
		}
		editor.ephemeral = editor.ephemeral.filter((d) => d.id !== doc.id);
		editor.openPath = entry.path;
		editor.openIn = list;
		editor.openHandle = null;
		editor.openWritable = true;
		editor.filename = entry.name;
		saySaved();
		flash(entry.path, 'Saved');
	}

	/** Write the sheet back to the document it came from. */
	async function saveInPlace() {
		// A scratch note has no file to be written BACK to; it is written OUT for the first time.
		if (editor.openIn === 'ephemeral') return fileScratchNote();
		// A document in the workspace is a path, and the store owns the write. A document from the
		// SHELF is a handle and has no store behind it — it came from outside every folder.
		if (editor.openIn === 'tree' || editor.openIn === 'cloud') {
			const from = storeOf(editor.openIn);
			return answer(from ? await from.write(editor.openPath, text) : notWritten('gone'));
		}
		const handle = editor.openHandle;
		if (!handle) return;
		// Permission withdrawn, or the file went away. It USED to say nothing at all here — the
		// reasoning being that a claim of a save that did not happen is worse than silence, which is
		// true and is only half the choice available.
		answer(await writeThrough(handle, text));
	}

	/** Land a write's answer on the Save key: Saved, or the one word that says why not. */
	function answer(wrote: WriteResult) {
		clearTimeout(savedTimer);
		editor.saved = wrote.ok;
		editor.saveFailed = wrote.ok ? '' : wrote.why;
		// A refusal holds twice as long as a confirmation. "Saved" is a thing you glance at and a
		// refusal is a thing you have to read, decide about, and probably act on.
		savedTimer = window.setTimeout(
			() => {
				editor.saved = false;
				editor.saveFailed = '';
			},
			wrote.ok ? 1400 : 3200
		);
	}

	/** The Save key's own confirmation — emerald, for a second and a bit. */
	const saySaved = () => answer(WROTE);
	let savedTimer = 0;

	/**
	 * A ROW THAT HAS JUST ANSWERED — renamed, moved, copied, cleared — and the word it is saying.
	 *
	 * ONE mechanism, not one per verb. It began as two (`justRenamed`, `justMoved`), each with its
	 * own state, its own timer, its own class and its own `content:` rule, and the third and fourth
	 * verbs would have been the moment that arrangement became four of everything. The word is
	 * carried on the row as a data attribute and drawn with `content: attr(...)`, so a new verb
	 * costs a call rather than a stylesheet.
	 *
	 * Every one of these is a write you CANNOT otherwise see. A rename leaves the sheet untouched;
	 * a move only shows if you were watching the part of the list it landed in; a copy goes to a
	 * clipboard nothing on screen can show; a clear that the browser refused looks exactly like a
	 * clear that worked.
	 *
	 * TWO TONES, and the split is the one this app already keeps between `.done` and `.on`:
	 * `done` is emerald and means it happened (Saved, Copied); `here` is the accent and means look
	 * where it is now (Moved, Cleared).
	 */
	type Tone = 'done' | 'here' | 'lost';
	let said = $state({ key: '', word: '', tone: 'done' as Tone });
	let saidTimer = 0;

	function flash(key: string, word: string, tone: Tone = 'done') {
		said = { key, word, tone };
		clearTimeout(saidTimer);
		// A refusal holds longer than a confirmation, for the reason `answer` does: one is glanced
		// at and the other has to be read and acted on.
		saidTimer = window.setTimeout(
			() => (said = { key: '', word: '', tone: 'done' }),
			tone === 'lost' ? 3200 : 1700
		);
	}

	/** Rename an entry in the store, and follow it if it is the one on the sheet. */
	async function rename(entry: FolderEntry, to: string, list: 'tree' | 'cloud' = 'tree') {
		const name = to.trim();
		const from = storeOf(list);
		editor.renaming = '';
		if (!name || name === entry.name || !from) return;
		// A name is a NAME, not a path — a rename that could write into another directory is a
		// move, and a text field in a list is the wrong place to offer one. The store refuses one
		// too; this is the field's own answer, given before the round trip.
		if (/[/\\]/.test(name)) return;
		const moved = await from.rename(entry.path, name);
		if (!moved) return;
		const was = entry.path;
		entry.name = moved.name;
		entry.path = moved.path;
		resort(list);
		if (editor.openPath === was) {
			editor.openPath = moved.path;
			editor.filename = moved.name;
		}
		flash(entry.path, 'Saved');
	}

	// ── Moving a document ─────────────────────────────────────────────────────
	// Drag a row onto a folder and the document MOVES where it is kept — one call to the store,
	// which is the same call rename makes with a directory in front of it.
	//
	// Dropping is the only gesture here that changes something outside this app without a key
	// having been pressed, so it is deliberately narrow: only a document can be dragged, only a
	// folder row or the head can take it, and a name already in the destination cancels the whole
	// thing. That last rule is the STORE'S now rather than this function's, because it is not a
	// fact about the File System Access API — every backing store this app ever grows will have
	// some way of silently overwriting, and the check belongs beside the write it guards.

	/**
	 * The path being dragged, WHICH TREE it came out of, and the folder path under the pointer.
	 *
	 * The list travels with the path because both trees draw the same rows and a drag has to be
	 * refused across them. Dragging a document from the folder onto a drive folder is not a move at
	 * all — it is a read, a write and a delete, three requests with two different outcomes if the
	 * second fails — and offering it as the same gesture that shuffles a file inside one folder would
	 * lie about what is happening to somebody's document, at the exact moment it is in neither place.
	 * When there is an upload it will be its own gesture with its own word on it.
	 */
	let dragging = $state('');
	let dragList = $state<'tree' | 'cloud'>('tree');
	let dropInto = $state<string | null>(null);

	async function moveTo(entry: FolderEntry, destPath: string, list: 'tree' | 'cloud' = 'tree') {
		const moved = await storeOf(list)?.move(entry.path, destPath);
		if (!moved) return;
		const was = entry.path;
		entry.path = moved.path;
		resort(list);
		// The document on the sheet follows its own file, exactly as it does through a rename.
		if (editor.openIn === list && editor.openPath === was) editor.openPath = moved.path;
		flash(moved.path, 'Moved', 'here');
	}

	/**
	 * Can rows in THIS tree be dragged? One answer per tree, not per row — it stopped being a
	 * question about the row when the row stopped carrying a handle, and what it asks is whether that
	 * workspace can be written to.
	 *
	 * The drive can, which is new. Inside one store a move IS a move: `MOVE` with `Overwrite: F`,
	 * one request, refused by the server rather than by a check here. The rule that kept the drive
	 * undraggable was about crossing BETWEEN stores, and it still holds — see `dragging`.
	 */
	const canMoveIn = (list: 'tree' | 'cloud') =>
		list === 'cloud' ? !!drive?.writable : editor.folderWritable;

	function onDragStart(event: DragEvent, entry: FolderEntry, list: 'tree' | 'cloud' = 'tree') {
		if (!canMoveIn(list)) return event.preventDefault();
		dragging = entry.path;
		dragList = list;
		event.dataTransfer?.setData('text/plain', entry.path);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function onDragOver(event: DragEvent, destPath: string, list: 'tree' | 'cloud' = 'tree') {
		if (!dragging) return;
		// NOT ACROSS THE TWO TREES. Refused by saying nothing — no `preventDefault`, so the pointer
		// keeps the browser's own "you cannot drop that here" cursor, which is the truthful answer and
		// costs no copy. Highlighting the row and then declining on release would be worse.
		if (list !== dragList) return;
		const from = dragging.includes('/') ? dragging.slice(0, dragging.lastIndexOf('/')) : '';
		// A folder will not take what it already holds. Without this every row lights up as a
		// target for the file directly above it, which reads as an offer to do nothing.
		if (from === destPath) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		dropInto = destPath;
	}

	/**
	 * `dragleave` BUBBLES, and a row is made of a twisty, a name and a tally — so crossing one
	 * fires leave after leave from its own children and the highlight strobed off and on. The
	 * check is where the pointer went NEXT: still inside this row means it never left.
	 */
	function onDragLeave(event: DragEvent, destPath: string) {
		const to = event.relatedTarget as Node | null;
		const row = event.currentTarget as HTMLElement;
		if (to && row.contains(to)) return;
		if (dropInto === destPath) dropInto = null;
	}

	async function onDrop(event: DragEvent, destPath: string, list: 'tree' | 'cloud' = 'tree') {
		event.preventDefault();
		const path = event.dataTransfer?.getData('text/plain') || dragging;
		const from = dragList;
		dragging = '';
		dropInto = null;
		// Checked again on RELEASE and not only on hover. `dragover` is what draws the highlight and
		// a drop can still arrive at a target that never highlighted — a fast release, a nested
		// element, a browser that fires them out of order.
		if (list !== from) return;
		const entry = entriesOf(from).find((e) => e.path === path);
		if (entry) await moveTo(entry, destPath, from);
	}

	/** Delete an entry from disk. Two presses, like Clear — see `doomed`. */
	async function remove(entry: FolderEntry, list: 'tree' | 'cloud' = 'tree') {
		if (editor.doomed !== entry.path) {
			editor.doomed = entry.path;
			clearTimeout(doomTimer);
			doomTimer = window.setTimeout(() => (editor.doomed = ''), 3000);
			return;
		}
		clearTimeout(doomTimer);
		editor.doomed = '';
		if (!(await storeOf(list)?.remove(entry.path))) return;
		if (list === 'cloud') editor.drive = editor.drive.filter((e) => e.path !== entry.path);
		else editor.folder = editor.folder.filter((e) => e.path !== entry.path);
		// The sheet keeps what it is showing — the words are still yours even though the file is
		// gone — but it is no longer that file, so it stops claiming to be.
		if (editor.openPath === entry.path && editor.openIn === list) {
			editor.openPath = '';
			editor.filename = '';
			editor.openHandle = null;
			editor.openWritable = false;
		}
	}
	let doomTimer = 0;

	// ── The folder's name, when it does not fit ───────────────────────────────
	// The head is one row — name, tally, three keys — so a long folder name is clipped to a few
	// characters. CSS can ellipsise it but cannot tell you that it did, and a reveal that repeats
	// a name already legible in full is a flicker with no information in it. So it is measured.
	//
	// Measured in an effect rather than once: the width the name has depends on the tally beside
	// it (five documents and five hundred are different widths) and on whether New is drawn at
	// all, and the text itself changes with the folder. The ResizeObserver covers the case the
	// effect cannot see — the pane is a fixed column on a wide window but a full-width sheet on a
	// phone, so a rotation changes the room without changing a thing this component reads.
	let workNameEl: HTMLElement | null = $state(null);
	let nameClipped = $state(false);

	/** What the drive's head says: the folder, and the server when the two differ. */
	/**
	 * WHERE A LIST LIVES, in one line, shown on its head's mark.
	 *
	 * Four lists stacked in a 15rem column, and the pane never says which of them is on the machine
	 * and which is on a server — the marks say it in a glyph, and these say the same thing in words
	 * with the ADDRESS attached where there is one to attach. The drive has a real address and
	 * gives it; the folder has only a name, because a `FileSystemDirectoryHandle` does not carry a
	 * path and no browser will tell you one. Saying "Local" and then the folder's name is the whole
	 * of what this side can honestly report.
	 */
	const driveWhere = $derived.by(() => {
		const c = editor.connections.find((k) => k.id === driveId);
		if (!c) return editor.driveHost ? `Cloud · ${editor.driveHost}` : 'Cloud';
		// The origin and the folder inside it — the address somebody would type to reach the same
		// place in a browser, not the DAV path, which is an implementation detail of the transport.
		return `Cloud · ${c.base}${c.root ? `/${c.root}` : ''}`;
	});
	/** The address of a connection, the way somebody would type it to reach the same place. */
	function driveAddress(id: string): string {
		const c = editor.connections.find((k) => k.id === id);
		return c ? `${c.base}${c.root ? `/${c.root}` : ''}` : '';
	}

	/**
	 * WHERE ONE DOCUMENT IS, for the row's own tooltip.
	 *
	 * A row shows a NAME, and a name is not a location — two `README.md` three folders apart are
	 * the ordinary case here, and the shelves make it worse by holding documents from anywhere at
	 * all beside each other. This is the answer to "which one is this".
	 *
	 * What it can say differs by list, and it says only what is true of each. A DRIVE row has a real
	 * address and gives the whole of it. A LOCAL row cannot: the File System Access API does not
	 * expose an absolute path anywhere — a handle carries `name`, the last segment and nothing
	 * more, and `resolve()` answers with a path RELATIVE to the handle you picked. Chrome withholds
	 * the rest deliberately. `webkitdirectory` is the same story through `webkitRelativePath`.
	 *
	 * So a local path is written under a LEADING ELLIPSIS — `Local · …/Syncthing/scratch.txt`. The
	 * three characters are the honest part: they say there is more above this that the browser will
	 * not hand over, which a bare `Syncthing/scratch.txt` reads as an absolute path and is not one.
	 * Where the limit itself is worth stating in words it is stated ONCE, on the LOCAL head's own
	 * card, rather than on every row — see `localWhere`.
	 */
	function whereIs(path: string, list: 'tree' | 'cloud'): string {
		if (list === 'cloud') {
			const at = driveAddress(driveId);
			return at ? `Cloud · ${at}/${path}` : `Cloud · ${path}`;
		}
		return `Local · …/${editor.folderName ? `${editor.folderName}/` : ''}${path}`;
	}

	/** The same for a SHELF row, which knows where it came from and may have come from a drive. */
	function looseWhere(d: DetachedDoc): string {
		if (d.drive) {
			const at = driveAddress(d.drive.connection);
			return at ? `Cloud · ${at}/${d.drive.path}` : `Cloud · ${d.drive.path}`;
		}
		// A hand-picked FILE has no folder behind it at all — the picker hands back a handle and
		// nothing else — so this is a name under a leading ellipsis and nothing more.
		return `Local · …/${d.name}`;
	}

	/**
	 * Keyed on whether a STORE is open, not on whether the folder has a name — those are two
	 * different questions and only one of them is "is there a workspace here". A directory handle
	 * can hand back an empty name (the Origin Private File System's root does, which is what the
	 * suite picks), and reading that as "no folder open" told a visitor with a folder open that
	 * they had none.
	 */
	const localWhere = $derived(
		store
			? `Local · …/${editor.folderName || 'the open folder'} — the browser does not reveal where this folder is on the disk`
			: 'Local · no folder open'
	);

	const driveLabel = $derived(
		(editor.driveName || 'Drive') +
			(editor.driveHost && editor.driveHost !== editor.driveName ? ` (${editor.driveHost})` : '')
	);
	let driveNameEl: HTMLElement | null = $state(null);
	let driveClipped = $state(false);

	function measureName() {
		const el = workNameEl;
		// +1 for the sub-pixel: a name that exactly fits reports a scrollWidth a fraction over its
		// clientWidth often enough to flash a reveal that shows the same characters back.
		nameClipped = !!el && el.scrollWidth > el.clientWidth + 1;
		// The drive's, measured the same way in the same pass — one observer and one effect for both,
		// because they share a column and change width together.
		const dv = driveNameEl;
		driveClipped = !!dv && dv.scrollWidth > dv.clientWidth + 1;
	}

	$effect(() => {
		editor.folderName;
		driveLabel;
		editor.folder.length;
		editor.canWrite;
		measureName();
		const el = workNameEl;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(measureName);
		ro.observe(el);
		// The mono face arrives after first paint, and it is wider than the fallback — a name
		// measured before it lands is measured against the wrong letters.
		document.fonts?.ready.then(measureName).catch(() => {});
		return () => ro.disconnect();
	});

	// ── The tree ──────────────────────────────────────────────────────────────
	// The workspace lists a FOLDER, and a folder has folders in it. It used to answer that by
	// printing the whole relative path under every nested name, which reads as a list of long
	// strings rather than as a place: four documents in two sub-folders gave you four paths to
	// compare character by character.
	//
	// So the rows are a tree. `editor.folder` is untouched — a flat list of documents, which is
	// what open, rename and delete all want — and the shape is derived from the paths here, then
	// flattened straight back into a list of rows with a depth on each. A nested <ul> would
	// recurse in the markup and indent no better.

	type Branch = { dirs: Map<string, Branch>; files: FolderEntry[] };
	type WorkRow =
		| {
				kind: 'dir';
				name: string;
				path: string;
				depth: number;
				/**
				 * How many documents are under it — or NULL where that cannot be known. A remote tree
				 * arrives one level at a time, so a folder nothing has been fetched from holds an
				 * unknown number of documents, and a confident `0` beside a folder with forty in it is
				 * worse than no figure at all. Null means the tally is not drawn, not that it is zero.
				 */
				count: number | null;
				shut: boolean;
		  }
		| { kind: 'file'; entry: FolderEntry; depth: number };

	/**
	 * How many DOCUMENTS are under a branch — not how many rows.
	 *
	 * The tree lists unopenable files too, greyed out, so a reader can see the folder as it really
	 * is (see `openable` in the store). They are not counted here: the tally answers "how much is
	 * in here for me", and a folder of forty photographs and one note is not a folder of forty-one.
	 */
	function countIn(branch: Branch): number {
		let n = branch.files.filter((f) => f.openable !== false).length;
		for (const child of branch.dirs.values()) n += countIn(child);
		return n;
	}

	/**
	 * The rows for ONE tree, from its flat lists. Written once and called twice — the folder and the
	 * drive are two lists of paths and nothing about laying them out differs.
	 *
	 * `known` is the set of folders whose children have been read. Where it is null the whole tree is
	 * known (a local walk reads all of it), and every folder gets a tally; where it is a set, a
	 * folder outside it has never been opened and its tally is null.
	 */
	function rowsFor(
		files: FolderEntry[],
		dirs: string[],
		collapsed: string[],
		known: Set<string> | null
	): WorkRow[] {
		const root: Branch = { dirs: new Map(), files: [] };
		/** Walk to a path, making the branches on the way. */
		const branchAt = (path: string) => {
			let branch = root;
			for (const seg of path.split('/')) {
				let next = branch.dirs.get(seg);
				if (!next) branch.dirs.set(seg, (next = { dirs: new Map(), files: [] }));
				branch = next;
			}
			return branch;
		};
		// The DIRECTORIES first, so a folder with nothing readable in it still gets a row. It used
		// to be derived from the file paths alone, which meant an empty folder was invisible —
		// and an empty folder you cannot see is one you cannot drag anything into.
		for (const path of dirs) branchAt(path);
		for (const entry of files) {
			const at = entry.path.lastIndexOf('/');
			(at < 0 ? root : branchAt(entry.path.slice(0, at))).files.push(entry);
		}
		// Folders first, then documents, each alphabetical — the order every file manager uses,
		// and the one that keeps a folder's own contents together instead of interleaved with the
		// documents beside it. The files need no sorting: the list arrives in path order, so within
		// one branch they are already alphabetical.
		const rows: WorkRow[] = [];
		const lay = (branch: Branch, prefix: string, depth: number) => {
			for (const name of [...branch.dirs.keys()].sort((a, b) => a.localeCompare(b))) {
				const path = prefix ? `${prefix}/${name}` : name;
				const child = branch.dirs.get(name)!;
				const shut = collapsed.includes(path);
				rows.push({
					kind: 'dir',
					name,
					path,
					depth,
					shut,
					count: !known || known.has(path) ? countIn(child) : null
				});
				if (!shut) lay(child, path, depth + 1);
			}
			for (const entry of branch.files) rows.push({ kind: 'file', entry, depth });
		};
		lay(root, '', 0);
		return rows;
	}

	const workRows = $derived(rowsFor(editor.folder, editor.folders, editor.collapsed, null));
	const driveRows = $derived(
		rowsFor(editor.drive, editor.driveFolders, editor.driveCollapsed, new Set(editor.driveFetched))
	);

	function toggleDir(path: string) {
		editor.collapsed = editor.collapsed.includes(path)
			? editor.collapsed.filter((p) => p !== path)
			: [...editor.collapsed, path];
	}

	// ── Open or shut a whole branch at once ───────────────────────────────────
	// The row twisty does one folder. This does everything under something — and "something" is
	// either a SECTION (the key on the folder's head or the drive's, where the branch is the whole
	// list) or a FOLDER ROW (where it is that folder and everything inside it). One pair of
	// functions serves both, because they are one idea at two scales; writing the head's version
	// and the row's version separately is how the two would come to disagree about what "all"
	// means the first time either was touched.
	//
	// Only lists that HAVE folders get a key. The two SHELVES are flat by definition — one
	// is notes with nowhere to be yet, the other a record of what was reached for — so a key there
	// would be a control that cannot do anything. Nor does a folder with no folders inside it get
	// one: its own twisty already IS the whole of what a branch key would do.
	//
	// ONE KEY, not two. It reads the branch and offers the move the branch is not already in: shut
	// it all while anything is open, open it all once it is all shut. Two keys would mean one of
	// them was always the no-op, on a row that has a name to protect and in a head that already
	// carries a name, a key and a tally across 15rem.

	/**
	 * The folders one press acts on. At a section head (`path` is the root, '') that is every
	 * folder in the list; at a folder row it is that folder AND everything inside it.
	 *
	 * The folder itself is in the branch on purpose. Opening the inside of a shut folder would
	 * change nothing anybody can see, and shutting a branch without shutting the folder that names
	 * it leaves the one row that says what just happened standing open.
	 */
	function branchOf(path: string, list: 'tree' | 'cloud'): string[] {
		const dirs = list === 'cloud' ? editor.driveFolders : editor.folders;
		return path === '' ? [...dirs] : dirs.filter((d) => d === path || d.startsWith(`${path}/`));
	}

	/**
	 * Is there ANYTHING left to open in this branch — the state that flips the key.
	 *
	 * ANY, not ALL, and the drive is what settles it. Opening a remote branch reveals folders that
	 * were not paths this app knew a moment ago, and every one of them arrives SHUT (see
	 * `twistBranch`). Under an all-are-shut rule the key flipped to "Shut every folder" the instant
	 * the first level landed — offering to undo the press you had just made, while the tree below
	 * was still folded. Asking whether anything is shut keeps the key saying "Open" until the
	 * revealed tree really is open, which is what a second press is for.
	 * Locally it changes nothing: a local branch opens fully in one press, so all-shut and any-shut
	 * are the same question one press apart.
	 *
	 * An EMPTY branch is not that state — `some` over nothing is false, so a list with no folders
	 * correctly offers nothing.
	 */
	function branchShut(path: string, list: 'tree' | 'cloud'): boolean {
		const shut = list === 'cloud' ? editor.driveCollapsed : editor.collapsed;
		return branchOf(path, list).some((d) => shut.includes(d));
	}

	/**
	 * Shut the branch, or open it where it is already all shut.
	 *
	 * ON A DRIVE IT CANNOT PROMISE AS MUCH, because that tree is lazy. Opening reaches the folders
	 * the drive has REVEALED, which is not the whole of it: a folder nothing has been read from has
	 * not said what is inside, so its children are not yet paths this app knows. Reading them is
	 * what makes them known, and `fetchDriveDir` files everything fresh as SHUT (the drive's
	 * standing rule) — so the press after this one goes a level deeper. That is why the key's word
	 * on a drive is "read so far" rather than a flat "everything": a key that claims to have opened
	 * the whole drive when it opened one level of it is a key that lies.
	 *
	 * The reads are SERIALISED, not fired off together. A branch somebody has browsed a way into
	 * can be a dozen folders, and a dozen simultaneous PROPFINDs at somebody else's Nextcloud is a
	 * thundering herd sent on one click. One at a time also makes the rows say what is happening —
	 * `Fetching` walks down the tree instead of every row lighting up at once.
	 */
	async function twistBranch(path: string, list: 'tree' | 'cloud') {
		const branch = branchOf(path, list);
		if (!branch.length) return;
		const open = branchShut(path, list);
		const shut = list === 'cloud' ? editor.driveCollapsed : editor.collapsed;
		const next = open
			? shut.filter((p) => !branch.includes(p))
			: [...new Set([...shut, ...branch])];
		if (list === 'tree') {
			editor.collapsed = next;
			return;
		}
		// Opened first, so the tree unfolds as each answer lands rather than all at the end. The
		// branch is captured ABOVE this line because `fetchDriveDir` appends what it finds to
		// `editor.driveFolders` — walking a list that grows as it is walked would keep going until
		// it had read the whole drive, which is the one thing a lazy tree exists not to do.
		editor.driveCollapsed = next;
		if (!open) return;
		for (const p of branch) await fetchDriveDir(p);
	}

	/**
	 * The drive's twisty, which also FETCHES. Its tree arrives one level at a time, so opening a
	 * folder for the first time is a request — and every folder starts shut, which is what makes
	 * "open it" and "read it" the same gesture rather than two.
	 */
	function toggleDriveDir(path: string) {
		const shut = editor.driveCollapsed.includes(path);
		editor.driveCollapsed = shut
			? editor.driveCollapsed.filter((p) => p !== path)
			: [...editor.driveCollapsed, path];
		if (shut) fetchDriveDir(path);
	}

	// ── The row's context menu ────────────────────────────────────────────────
	// Rename and Delete were keys ON the row, held back until it was hovered. Two problems with
	// that: they sat over the end of the name, so any filename long enough to need reading was
	// the one they covered; and a list of documents drew twice as many buttons as documents.
	// A right-click menu is where a file manager keeps both verbs, costs the row nothing, and
	// leaves the name the whole width it has.
	//
	// It is NOT announced anywhere, and that is deliberate: the foot of the list carried a line
	// saying to try it, and a line telling somebody who writes Markdown in a folder of their own
	// that a file list has a context menu is a line explaining a doorknob. The pane says the one
	// thing that cannot be guessed — that this browser will not write at all — and nothing else.
	let fileMenuEl: HTMLDivElement | null = $state(null);
	/** The workspace menu's own element, so it can be pulled back inside the window. */
	let fileMenuAt = $state({ x: 0, y: 0 });
	/** The TREE entry the open menu belongs to — null when the menu belongs to a shelf row. */
	const fileMenuEntry = $derived(
		editor.fileMenu?.kind === 'file' &&
			(editor.fileMenu?.list === 'tree' || editor.fileMenu?.list === 'cloud')
			? (entriesOf(editor.fileMenu.list).find((e) => e.path === editor.fileMenu?.path) ?? null)
			: null
	);
	/** And which tree it is in — what every verb on that menu needs in order to act on the right one. */
	const fileMenuList = $derived(
		editor.fileMenu?.list === 'cloud' ? ('cloud' as const) : ('tree' as const)
	);
	/** The SHELF row the open menu belongs to, from whichever shelf it is on. */
	const shelfMenuRow = $derived.by(() => {
		const at = editor.fileMenu;
		// Neither TREE is a shelf. Both are excluded here rather than one, because the two draw the
		// same rows and a menu opened on a drive row would otherwise fall through to looking for it
		// among the scratch notes.
		if (!at || at.kind === 'dir' || at.list === 'tree' || at.list === 'cloud') return null;
		const doc =
			at.list === 'loose'
				? editor.loose.find((d) => d.id === at.path)
				: editor.ephemeral.find((d) => d.id === at.path);
		return doc ? { name: doc.name, list: at.list, id: doc.id } : null;
	});

	// ── What a menu can do to the document it belongs to ──────────────────────
	// COPY, SAVE A COPY and CLEAR came off the bar and onto the row. In the bar all three read as
	// document verbs and acted on the sheet, which is one document out of however many the
	// workspace is holding; here they mean what they say.
	//
	// The three lists keep their documents in three different ways — a tree entry has a File or a
	// handle, a shelf row has a handle, a scratch note has nothing but its own words — so they are
	// flattened to this ONE shape and the verbs are written once against it. Without that the same
	// three verbs would be written three times and the copy on the shelf would be the one that
	// stopped matching.

	type MenuDoc = {
		/** Path or id — whatever `doomed` and `armed` compare against for this list. */
		key: string;
		name: string;
		/** Its words, read from wherever they actually live. Null if they cannot be got at. */
		read: () => Promise<string | null>;
		/**
		 * Empty it, where that is possible at all. Null means Clear is not offered on this row —
		 * which is not the same as a Clear that was refused, and is why this is not simply a verb
		 * that answers no.
		 */
		clear: (() => Promise<WriteResult>) | null;
	};

	/** Is this row the one on the sheet? Its words are then the sheet's, not the disk's. */
	function isOnSheet(key: string, list: 'tree' | 'cloud' | 'loose' | 'ephemeral') {
		return editor.openIn === list && editor.openPath === key;
	}

	/** Empty a document that is open, through the sheet, so the emptying is UNDOABLE. */
	function emptyTheSheet() {
		sheet.put('');
	}

	/** The tree entry, the shelf row or the scratch note the open menu belongs to, as one thing. */
	const menuDoc: MenuDoc | null = $derived.by(() => {
		const at = editor.fileMenu;
		if (!at) return null;

		if (at.kind === 'dir') return null;
		if (at.list === 'tree' || at.list === 'cloud') {
			// ONE branch for both trees. They differ in which store answers and in nothing else,
			// which is the whole return on the seam: a document is a path, and a path is a store's
			// question. Writing this twice is how the two would stop agreeing.
			const list = at.list;
			const from = storeOf(list);
			const entry = entriesOf(list).find((e) => e.path === at.path);
			if (!entry) return null;
			return {
				key: entry.path,
				name: entry.name,
				read: async () => {
					if (isOnSheet(entry.path, list)) return text;
					return (await from?.read(entry.path)) ?? null;
				},
				// Only where the workspace can be written to. A `webkitdirectory` snapshot cannot be,
				// and a Clear that could not clear would be the one kind of key this app refuses to
				// draw.
				clear: from?.writable
					? async () => {
							const wrote = from ? await from.write(entry.path, '') : notWritten('gone');
							if (!wrote.ok) return wrote;
							// It is still the open file, still named, still savable — it is empty now.
							// So the sheet follows it rather than being detached from it.
							if (isOnSheet(entry.path, list)) emptyTheSheet();
							return wrote;
						}
					: null
			};
		}

		if (at.list === 'loose') {
			const doc = editor.loose.find((d) => d.id === at.path);
			if (!doc) return null;
			return {
				key: doc.id,
				name: doc.name,
				read: async () => {
					if (isOnSheet(doc.id, 'loose')) return text;
					// A DRIVE row, where its drive happens to be the open one. Not opened here if it is
					// not: a menu item is not the place to make a connection, any more than it is the
					// place to throw a permission dialog. Pressing the row does both.
					if (doc.drive) {
						return driveId === doc.drive.connection
							? ((await drive?.read(doc.drive.path)) ?? null)
							: null;
					}
					try {
						// Otherwise a handle where the browser has them and a File where it does not —
						// a `<input type=file>` pick carries no handle to store. Either can be read;
						// only the first can be written, which is what the gate below is.
						const file = doc.handle ? await doc.handle.getFile() : doc.file;
						return file ? await file.text() : null;
					} catch {
						// A grant that has lapsed. Opening the row re-asks; a menu item is not the
						// place to throw a permission dialog at somebody.
						return null;
					}
				},
				// A handle is the whole of the question here — a shelf row came from outside every
				// workspace, so no store speaks for it, and a browser that handed one over can write
				// through it. `canWrite` used to stand in front of this and said nothing extra.
				// A handle, or a drive row whose drive is open. Both can be written; a picked File
				// cannot, and a drive that is not connected is not something to connect from a menu.
				clear:
					doc.handle || (doc.drive && driveId === doc.drive.connection)
						? async () => {
								const wrote = doc.drive
									? ((await drive?.write(doc.drive.path, '')) ?? notWritten('gone'))
									: await writeThrough(doc.handle!, '');
								if (!wrote.ok) return wrote;
								if (isOnSheet(doc.id, 'loose')) emptyTheSheet();
								return WROTE;
							}
						: null
			};
		}

		const note = editor.ephemeral.find((d) => d.id === at.path);
		if (!note) return null;
		return {
			key: note.id,
			name: note.name,
			// A scratch note that is on the sheet is being TYPED — the row's copy is only as fresh
			// as the last debounce, and what the visitor means by "this note" is what they can see.
			read: async () => (isOnSheet(note.id, 'ephemeral') ? text : note.text),
			// Always. A scratch note has no file behind it and needs no permission — it is the one
			// document in the pane this app holds outright.
			clear: async () => {
				note.text = '';
				if (isOnSheet(note.id, 'ephemeral')) emptyTheSheet();
				return WROTE;
			}
		};
	});

	/** Write through a bare handle — the shelf's own documents, which belong to no store. */
	async function writeThrough(handle: FileSystemFileHandle, body: string): Promise<WriteResult> {
		try {
			const w = await handle.createWritable();
			await w.write(body);
			await w.close();
			return WROTE;
		} catch (error) {
			return notWritten(whyLocal(error));
		}
	}

	/** Copy a row's document to the clipboard, and say so on the row. */
	async function copyDoc(doc: MenuDoc) {
		const body = await doc.read();
		if (body === null) return;
		try {
			await navigator.clipboard.writeText(body);
		} catch {
			// Blocked clipboard (insecure context, denied permission) — the same fallback the
			// Emoji Viewer keeps, so a tap still copies rather than silently failing.
			const pad = document.createElement('textarea');
			pad.value = body;
			pad.style.position = 'fixed';
			pad.style.opacity = '0';
			document.body.appendChild(pad);
			pad.select();
			try {
				document.execCommand('copy');
			} catch {
				pad.remove();
				return; // no false confirmation
			}
			pad.remove();
		}
		flash(doc.key, 'Copied', 'done');
	}

	/** Hand a row's document to the browser as a download, under the name it already has. */
	async function saveCopy(doc: MenuDoc) {
		const body = await doc.read();
		if (body === null) return;
		// The name it has, with `.md` on it if it has no extension of its own — a scratch note is
		// called `Ephemeral 1`, and a download called that opens in nothing.
		save(body, /\.[a-z0-9]+$/i.test(doc.name) ? doc.name : `${doc.name}.md`);
		flash(doc.key, 'Saved', 'done');
	}

	/**
	 * Empty a row's document. Two presses, like Delete and like the Clear key it replaces: this is
	 * the one thing in the pane that destroys words without taking the row with them, so there is
	 * nothing left on screen afterwards to say it happened by mistake.
	 */
	async function clearDoc(doc: MenuDoc) {
		if (!doc.clear) return false;
		if (editor.armed !== doc.key) {
			editor.armed = doc.key;
			clearTimeout(armTimer);
			armTimer = window.setTimeout(() => (editor.armed = ''), 3000);
			return false;
		}
		clearTimeout(armTimer);
		editor.armed = '';
		const wrote = await doc.clear();
		if (wrote.ok) flash(doc.key, 'Cleared', 'here');
		else flash(doc.key, SAID[wrote.why], 'lost');
		return true;
	}

	// ── A FOLDER'S OWN MENU ───────────────────────────────────────────────────
	// Folder rows had no menu at all: a folder was a twisty and nothing else, so the two gestures a
	// folder needs — put one inside it, take it away — had nowhere to live. They are on its
	// right-click menu now, which is where a file manager keeps them and where this pane already
	// keeps a document's verbs.
	//
	// RENAME IS NOT OFFERED, and that is a limit rather than an omission. A drive would take it
	// (`MOVE` works on a collection) and the local store would not: `move` is on
	// FileSystemFileHandle and not on the directory handle, so a folder renamed on a drive and
	// refused on a disk is one verb with two answers. A verb that works in one workspace and not the
	// other is the thing this app has spent its whole life not drawing.

	/** Which form the folder menu is showing: its verbs, a new folder's name, or the deletion. */
	let dirMode = $state<'verbs' | 'new' | 'delete'>('verbs');
	/** What has been typed into whichever form is open. */
	let dirField = $state('');
	/**
	 * WHAT IS INSIDE, for the deletion to be able to say. Null while it is not known — which on a
	 * drive is the ordinary case, because a folder nothing has been opened is a folder whose contents
	 * this app has never read. It is FETCHED before the question is asked: "delete this, contents
	 * unknown" is not a confirmation, it is a coin toss with a text field on it.
	 */
	let dirCounts = $state<{ files: number; dirs: number } | null>(null);

	/**
	 * The folder the open menu belongs to, and its name. A HEAD counts: `path: ''` is the workspace's
	 * own root, which is a folder row in all but name — it already takes a drop, and the two things a
	 * root needs (put a folder in it, put it away) had nowhere else to live.
	 */
	const menuDir = $derived.by(() => {
		const at = editor.fileMenu;
		if (!at || at.kind !== 'dir') return null;
		const list = at.list === 'cloud' ? ('cloud' as const) : ('tree' as const);
		const root = at.path === '';
		return {
			path: at.path,
			// A root has no last segment to be named by, so it borrows the head's own name.
			name: root
				? list === 'cloud'
					? editor.driveName || 'Drive'
					: editor.folderName || 'Workspace'
				: at.path.slice(at.path.lastIndexOf('/') + 1),
			list,
			root
		};
	});

	/**
	 * PUT THE FOLDER AWAY. The workspace keeps its shelves and its scratch notes — those belong to
	 * the pane, not to the folder — and everything the folder brought goes with it, including the
	 * memory of it: a folder closed on purpose that came back on the next visit would be a key that
	 * did not work.
	 *
	 * Whatever was open from it is SHELVED first, the same as when a folder is changed. It is still a
	 * document somebody was reading and the sheet still holds it; losing its row because the list it
	 * was in went away is the hole `strandTheOpenOne` exists to close.
	 */
	async function closeFolder() {
		shelveTheOpenOne();
		store = null;
		held = null;
		editor.folder = [];
		editor.folders = [];
		editor.folderName = '';
		editor.folderWritable = false;
		editor.folderPending = false;
		editor.collapsed = [];
		if (editor.openIn === 'tree') {
			editor.openPath = '';
			editor.openWritable = false;
		}
		closeFileMenu();
		await rememberFolder(null);
	}

	function openDirMenu(event: MouseEvent, path: string, list: 'tree' | 'cloud') {
		dirMode = 'verbs';
		dirField = '';
		dirCounts = null;
		placeMenu(event, path, list, 'dir');
	}

	/** Count what is under a path, from the flat lists the tree is derived from. */
	function countUnder(path: string, list: 'tree' | 'cloud') {
		const under = (p: string) => p === path || p.startsWith(`${path}/`);
		const dirs = list === 'cloud' ? editor.driveFolders : editor.folders;
		return {
			files: entriesOf(list).filter((e) => under(e.path)).length,
			dirs: dirs.filter((d) => d !== path && under(d)).length
		};
	}

	/**
	 * Open the deletion, having first made sure the count is TRUE. On a drive an unopened folder has
	 * never been read, and every folder inside it is unread in its turn — so the whole subtree is
	 * walked before the question is asked. A count that only covers the part somebody happened to
	 * browse would understate exactly the folder most dangerous to delete.
	 */
	async function askDeleteDir(path: string, list: 'tree' | 'cloud') {
		dirMode = 'delete';
		dirField = '';
		dirCounts = null;
		if (list === 'cloud' && drive?.listDir) {
			const queue = [path];
			while (queue.length) {
				const at = queue.shift() as string;
				if (!editor.driveFetched.includes(at)) await fetchDriveDir(at);
				queue.push(...editor.driveFolders.filter((d) => dirOf(d) === at));
			}
		}
		dirCounts = countUnder(path, list);
	}

	/** Make a folder inside the one the menu belongs to. */
	async function makeDir(inside: string, list: 'tree' | 'cloud', name: string) {
		const clean = name.trim();
		const store = storeOf(list);
		if (!clean || !store?.createDir) return;
		const path = await store.createDir(inside, clean);
		if (!path) return;
		if (list === 'cloud') {
			editor.driveFolders = [...editor.driveFolders, path];
			// Made and therefore READ: it is empty, and a folder marked unfetched would draw a
			// tally-less row that asks the server for children nobody put there.
			editor.driveFetched = [...editor.driveFetched, path];
		} else {
			editor.folders = [...editor.folders, path];
		}
		closeFileMenu();
		flash(path, 'Saved');
	}

	/** Delete a folder and everything under it. The name has already been typed — see `dirMode`. */
	async function killDir(path: string, list: 'tree' | 'cloud') {
		const store = storeOf(list);
		if (!store?.removeDir || !(await store.removeDir(path))) return;
		const under = (p: string) => p === path || p.startsWith(`${path}/`);
		if (list === 'cloud') {
			editor.drive = editor.drive.filter((e) => !under(e.path));
			editor.driveFolders = editor.driveFolders.filter((d) => !under(d));
			editor.driveFetched = editor.driveFetched.filter((d) => !under(d));
			editor.driveCollapsed = editor.driveCollapsed.filter((d) => !under(d));
		} else {
			editor.folder = editor.folder.filter((e) => !under(e.path));
			editor.folders = editor.folders.filter((d) => !under(d));
			editor.collapsed = editor.collapsed.filter((d) => !under(d));
		}
		// The sheet keeps its words — they are still yours — but it stops claiming to be a document
		// that no longer exists.
		if (editor.openIn === list && under(editor.openPath)) {
			editor.openPath = '';
			editor.filename = '';
			editor.openWritable = false;
		}
		closeFileMenu();
	}

	/** Where a menu stands, given the event that asked for it. Shared by all three lists. */
	function placeMenu(
		event: MouseEvent,
		path: string,
		list: 'tree' | 'cloud' | 'loose' | 'ephemeral',
		kind: 'file' | 'dir' = 'file'
	) {
		event.preventDefault();
		editor.renaming = '';
		editor.doomed = '';
		editor.armed = '';
		// The KEYBOARD opens this menu too — Shift+F10, or the menu key — and then there is no
		// pointer behind the event. Chromium sends (0, 0) for those; fall back to the row's own
		// box so the menu opens on the row rather than in the corner of the window.
		const row = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const x = event.clientX > 0 ? event.clientX : row.left + 12;
		const y = event.clientY > 0 ? event.clientY : row.bottom;
		fileMenuAt = { x, y };
		editor.fileMenu = { path, x, y, list, kind };
	}

	function openFileMenu(event: MouseEvent, entry: FolderEntry, list: 'tree' | 'cloud' = 'tree') {
		// IT OPENS EVERYWHERE NOW. It used to refuse where the browser could not write, because
		// the only things on it were Rename and Delete and a menu of two keys that cannot do what
		// they say is worse than the browser's own. Copy and Save a copy changed that: both only
		// READ, both work in every engine, and a document you cannot copy because the app decided
		// its folder was read-only is a worse answer than a short menu.
		// What the platform will not take is still not drawn — see `menuDoc.clear`, and the Rename
		// and Delete items, which are gated on the handle rather than on the menu.
		placeMenu(event, entry.path, list);
	}

	/**
	 * A shelf's menu, which every browser gets: Close only takes a row off a list this app keeps
	 * in memory, so unlike Rename and Delete it needs nothing from the file system.
	 */
	function openShelfMenu(event: MouseEvent, id: string, list: 'loose' | 'ephemeral') {
		placeMenu(event, id, list);
	}

	/**
	 * Close a shelf row. On ELSEWHERE the file stays exactly where it is and only the row goes;
	 * on SCRATCH the row is the only place the words were, so Close is the end of them — which is
	 * why that one asks twice, like Clear.
	 */
	function closeShelfRow(row: { id: string; list: 'loose' | 'ephemeral' }) {
		if (row.list === 'loose') {
			const doc = editor.loose.find((d) => d.id === row.id);
			if (doc) {
				editor.loose = editor.loose.filter((d) => d.id !== doc.id);
				if (editor.openIn === 'loose' && editor.openPath === doc.id) {
					editor.openPath = '';
					editor.openIn = 'tree';
				}
			}
			return true;
		}
		if (editor.doomed !== row.id) {
			editor.doomed = row.id;
			clearTimeout(doomTimer);
			doomTimer = window.setTimeout(() => (editor.doomed = ''), 3000);
			return false;
		}
		clearTimeout(doomTimer);
		editor.doomed = '';
		const doc = editor.ephemeral.find((d) => d.id === row.id);
		if (doc) closeEphemeral(doc);
		return true;
	}

	function closeFileMenu(refocus = false) {
		editor.fileMenu = null;
		editor.doomed = '';
		clearTimeout(doomTimer);
		if (refocus) sheet.focus();
	}

	$effect(() => {
		const at = editor.fileMenu;
		const el = fileMenuEl;
		if (!at || !el) return;
		// A pointer can be a few pixels off the bottom of the window with a whole menu still to
		// draw, so the menu is MEASURED and pulled back inside rather than given a guessed height:
		// the items are set in the theme's own type, and a hard number would be wrong under another
		// theme, another zoom, or a longer filename.
		const box = el.getBoundingClientRect();
		fileMenuAt = {
			x: Math.max(8, Math.min(at.x, window.innerWidth - box.width - 8)),
			y: Math.max(8, Math.min(at.y, window.innerHeight - box.height - 8))
		};
		// A menu the pointer opened should still be a menu the keyboard can walk. Focusing the
		// first item is also what closes the loop on Shift+F10: the event that opens it leaves
		// focus on the row, and nothing else would move it in.
		if (!el.contains(document.activeElement)) el.querySelector('button')?.focus();
	});

	// A menu whose row has gone — deleted, or the folder changed underneath it — is a menu aimed
	// at nothing. It comes down rather than staying open over the row that took its place.
	$effect(() => {
		// `menuDir` counts, and leaving it out shut the folder menu in the same frame it opened: this
		// asks "is the row this menu points at still there", and a folder row is a row.
		if (editor.fileMenu && !fileMenuEntry && !shelfMenuRow && !menuDir) closeFileMenu();
	});

	// ── Remembering the folder ────────────────────────────────────────────────
	// NOTE ON THE NAME `handles` in the four functions below: it is the IndexedDB object store, and
	// it is not called `store` because this component now has one of those at its top level — the
	// workspace's backing store. Two things called `store` in one file, one of them shadowing the
	// other inside four functions, is a trap set for whoever edits them next.
	// A directory HANDLE can be stored — it is a structured-cloneable object, so IndexedDB will
	// take one — and re-used on the next visit. A `webkitdirectory` File cannot: it is a snapshot
	// with nothing behind it. So this only helps where the File System Access API does, which is
	// the same place everything else about writing only helps.
	//
	// The permission does NOT survive with it. On the next visit the handle is remembered but its
	// grant has lapsed to 'prompt', and a browser will only re-ask during a user gesture — so the
	// workspace comes back as a NAMED, unopened folder with one key to reconnect it, rather than
	// popping a permission dialog at somebody who has just loaded a page.
	// The DATABASE is opened in $lib/nextcloud-connections, which owns its version — there are two stores
	// in it now (the folder handles here, a connection's sealed token there) and only one of them
	// can decide what version the database is at. `indexedDB.open` at a version BELOW the one on
	// disk fails outright, so two openers asking for different numbers is a remembered folder that
	// stops working the day somebody connects a drive.
	const handleStore = (mode: IDBTransactionMode) => objectStore('handles', mode);

	/**
	 * THE SHELF, remembered. Only the rows with a HANDLE behind them: a File from the fallback
	 * input is a snapshot with nothing to re-read, so those rows are the session's and go with
	 * it. IndexedDB rather than localStorage because a handle is a structured-cloneable OBJECT —
	 * `JSON.stringify` would turn it into `{}` and hand back a row that opens nothing.
	 *
	 * The PERMISSION does not survive with them, exactly as it does not for the folder. A row
	 * that comes back with a lapsed grant re-asks on the click that opens it, which is a user
	 * gesture and therefore the one moment a browser will allow the question.
	 */
	async function rememberLoose() {
		const handles = await handleStore('readwrite');
		if (!handles) return;
		const keep = editor.loose
			.filter((d) => d.handle)
			.map((d) => ({ id: d.id, name: d.name, handle: d.handle }));
		try {
			if (keep.length) handles.put(keep, 'loose');
			else handles.delete('loose');
		} catch {
			/* private mode, or a browser that will not clone a handle — forgetting is survivable */
		}
	}

	/** The shelf from last time, minus anything the browser will no longer hand over. */
	async function recallLoose() {
		// NO `canWrite` GATE. It was right while a row could only be a handle — those are Chromium's
		// alone — and it is wrong now: a drive row is plain data, and somebody in Safari or Firefox
		// with a drive connected has a shelf worth remembering. The same conflation step two took
		// out of the keys, one file later.
		const handles = await handleStore('readonly');
		if (!handles) return;
		const kept: LooseDoc[] | null = await new Promise((resolve) => {
			const req = handles.get('loose');
			req.onsuccess = () => resolve(req.result ?? null);
			req.onerror = () => resolve(null);
		});
		if (!kept?.length) return;
		// Merged rather than assigned: this runs after the mount, and anything opened in the
		// meantime is newer than anything remembered.
		const have = new Set(editor.loose.map((d) => d.id));
		editor.loose = [
			...editor.loose,
			...kept.filter((d) => (d.handle || d.drive) && !have.has(d.id))
		].slice(0, LOOSE_MAX);
	}

	async function rememberFolder(dir: FileSystemDirectoryHandle | null) {
		const handles = await handleStore('readwrite');
		if (!handles) return;
		try {
			if (dir) handles.put(dir, 'folder');
			else handles.delete('folder');
		} catch {
			/* private mode, or a browser that will not clone a handle — forgetting is survivable */
		}
	}

	/** The folder from last time, if the browser kept it and still lets us read it. */
	async function recallFolder() {
		if (!editor.canWrite) return;
		const handles = await handleStore('readonly');
		if (!handles) return;
		const dir: FileSystemDirectoryHandle | null = await new Promise((resolve) => {
			const req = handles.get('folder');
			req.onsuccess = () => resolve(req.result ?? null);
			req.onerror = () => resolve(null);
		});
		if (!dir) return;
		held = localStore(dir, isOpenable);
		editor.folderName = held.name;
		// Granted already (same session, or a browser that persisted the grant) — open it outright.
		// Otherwise leave it named and shut, for `reconnect` to ask about on a real click.
		if ((await held.permission()) === 'granted') await openHeldFolder();
		else editor.folderPending = true;
	}

	/**
	 * The REMEMBERED store, which is not always the open one: between a recall and a reconnect it is
	 * named and shut, waiting for the click that lets the browser re-ask. Typed as the local store
	 * rather than as a `Store`, because permission is a thing only a handle-backed folder has.
	 */
	let held: LocalStore | null = null;

	/**
	 * Which folders were shut when the pane was last closed, read at mount and spent here.
	 *
	 * Only the REMEMBERED folder gets it, which is why it is applied in `openHeldFolder` and not
	 * in `adopt`: adopting a DIFFERENT folder clears `collapsed` on purpose (a different tree, and
	 * what was shut in the last one means nothing here), and restoring a saved list there would
	 * shut whatever folders happened to share a path with the old workspace.
	 */
	let heldCollapsed: string[] = [];

	async function openHeldFolder() {
		if (!held) return;
		if (await adopt(held)) {
			// PRUNED TO THE TREE THAT ACTUALLY CAME BACK. A folder deleted or renamed while the app
			// was closed leaves a path behind that matches nothing, and an unpruned list would carry
			// it for ever. Spent once — a second call is a folder being re-opened by hand, and by
			// then `collapsed` is whatever the visitor has since done.
			const back = heldCollapsed.filter((p) => editor.folders.includes(p));
			heldCollapsed = [];
			if (back.length) editor.collapsed = back;
			return;
		}
		// The folder moved, or was deleted, or the grant went away between the check and here.
		editor.folderPending = false;
		editor.folderName = '';
		await rememberFolder(null);
	}

	/** The one thing a remembered folder needs: a click, so the browser will re-ask. */
	async function reconnect() {
		if (!held) return;
		if ((await held.requestPermission()) !== 'granted') return;
		await openHeldFolder();
	}

	// ── Drives ────────────────────────────────────────────────────────────────
	// A CONNECTION IS NOT A FOLDER. A folder is picked, used and forgotten in one gesture; a drive
	// is set up once and then simply exists, which is why it is made in Settings and why the list of
	// them lives in `editor.connections` rather than anywhere near the workspace. Opening one IS the
	// workspace, and that part goes through `adopt` exactly as a picked folder does — the whole
	// point of the store seam.
	//
	// The TOKEN is deliberately not in `editor`. A kept one is sealed in the vault and read back
	// when the drive is opened; an unkept one lives in this map for as long as the tab does and is
	// written nowhere. Neither is reactive: nothing should be able to put one on screen by
	// rendering the wrong thing, and nothing needs to.
	const sessionTokens = new Map<string, string>();

	/** The list, kept across visits. Only what a connection IS — never what opens it. */
	async function rememberConnections() {
		const handles = await objectStore('handles', 'readwrite');
		if (!handles) return;
		try {
			const keep = editor.connections.filter((c) => c.keep);
			if (keep.length) handles.put($state.snapshot(keep), 'drives');
			else handles.delete('drives');
		} catch {
			/* private mode — a drive that is not remembered is asked for again, which is survivable */
		}
	}

	async function recallConnections() {
		const handles = await objectStore('handles', 'readonly');
		if (!handles) return;
		const kept: Connection[] | null = await new Promise((resolve) => {
			const req = handles.get('drives');
			req.onsuccess = () => resolve(req.result ?? null);
			req.onerror = () => resolve(null);
		});
		if (!kept?.length) return;
		editor.connections = kept;
		// NAMED AND SHUT first, then opened. Reading a sealed token and asking a server both take a
		// moment, and a section that appeared out of nothing several seconds into a session reads as
		// a glitch; one that is there from the start and fills in reads as loading.
		editor.driveName = kept[0].name;
		editor.drivePending = true;
		await openDrive(kept[0]);
	}

	/**
	 * A drive, just connected. It has already ANSWERED — the form probes before it hands anything
	 * over — so this opens it rather than checking it again.
	 */
	async function connected(c: Connection, token: string) {
		if (!c.keep) sessionTokens.set(c.id, token);
		editor.connections = [...editor.connections.filter((d) => d.id !== c.id), c];
		rememberConnections();
		await openDrive(c, token);
	}

	/**
	 * Open a drive as the DRIVE list — never as the folder. It gets its own section, its own tree
	 * and its own collapsed state, and opening one does not disturb whatever folder is open.
	 */
	async function openDrive(c: Connection, token?: string) {
		const secret = token ?? sessionTokens.get(c.id) ?? (c.keep ? await unseal(c.id) : null);
		// No token and no way to get one — a vault cleared, or another browser profile. The drive
		// stays in the list because the drive is still real; it is the password that is missing, so
		// the section is drawn PENDING rather than not drawn.
		if (!secret) {
			editor.driveName = c.name;
			editor.drivePending = true;
			return false;
		}
		const next = nextcloudStore(configFor(c, secret), isOpenable);
		const listing = await next.list();
		if (!listing) {
			editor.driveName = c.name;
			editor.drivePending = true;
			return false;
		}
		// Whatever was open on the LAST drive is about to stop being in a list, exactly as a document
		// is when a folder changes — `adopt` shelves for the folder and this is the drive's half of
		// the same job. Without it, connecting a second drive left the first one's open document on
		// the sheet with no row: the hole gap A was about, reopened one path over.
		shelveTheOpenOne();
		drive = next;
		driveId = c.id;
		editor.drive = listing.files;
		editor.driveFolders = listing.dirs;
		// EVERY folder arrives SHUT, and every one of them is unfetched. See `driveFetched` in the
		// state module for why this is the opposite of the local tree's rule and why it has to be.
		editor.driveCollapsed = [...listing.dirs];
		editor.driveFetched = [''];
		editor.driveFetching = [];
		editor.driveName = next.name;
		editor.driveHost = new URL(c.base).hostname;
		editor.driveOpen = true;
		editor.drivePending = false;
		editor.folderShown = true;
		// Only a document from the OLD DRIVE stops being the open one — it has just been shelved.
		// A folder document, a shelf row or a scratch note belongs to no drive at all.
		if (editor.openIn === 'cloud') {
			editor.openPath = '';
			editor.openWritable = false;
		}
		return true;
	}

	/**
	 * A drive folder, opened for the first time. One request for its own children, merged in.
	 *
	 * Merged rather than assigned: the rest of the tree is already on screen and this is one branch
	 * arriving. Everything it brings is shut and unfetched in its turn, so the same press opens the
	 * next level down rather than the whole subtree.
	 */
	async function fetchDriveDir(path: string) {
		if (!drive?.listDir || editor.driveFetched.includes(path)) return;
		// Marked BEFORE the request, not after: a folder pressed twice while its request is in
		// flight would otherwise ask twice and merge twice.
		editor.driveFetched = [...editor.driveFetched, path];
		editor.driveFetching = [...editor.driveFetching, path];
		const listing = await drive.listDir(path);
		editor.driveFetching = editor.driveFetching.filter((p) => p !== path);
		if (!listing) {
			// It could not be read. Un-mark it, so pressing again tries again — a folder that failed
			// once because the network dropped should not be permanently empty.
			editor.driveFetched = editor.driveFetched.filter((p) => p !== path);
			return;
		}
		const have = new Set(editor.drive.map((e) => e.path));
		editor.drive = [...editor.drive, ...listing.files.filter((f) => !have.has(f.path))].sort(
			(a, b) => a.path.localeCompare(b.path)
		);
		const known = new Set(editor.driveFolders);
		const fresh = listing.dirs.filter((d) => !known.has(d));
		editor.driveFolders = [...editor.driveFolders, ...fresh];
		editor.driveCollapsed = [...editor.driveCollapsed, ...fresh];
	}

	/**
	 * A NEW DOCUMENT ON THE DRIVE — `Untitled.md`, or `Untitled 2.md` where that is taken.
	 *
	 * It is a real file the moment it is made, which is the opposite of what NEW does: that makes a
	 * scratch note precisely so nobody has to name a document before writing it. The difference is
	 * the place. A scratch note has nowhere to be until it is filed; a drive is somewhere, already
	 * open, and the gesture somebody wants at the head of a list of documents on a server is "put one
	 * more here". The name is not asked for either — `Untitled` is a placeholder Rename exists to
	 * replace, and asking would be the thing NEW stopped doing.
	 */
	/**
	 * `Untitled 0`, then `Untitled 1` — the LOWEST free index, Notepad++'s `new 0` convention, and
	 * the same rule `nextEphemeralName` keeps: closing one frees its name rather than leaving a gap
	 * that counts up forever.
	 *
	 * Numbered from the FIRST one. `Untitled.md` and then `Untitled 2.md` reads as a missing
	 * `Untitled 1.md` — the unnumbered name is doing the work of an index without looking like one.
	 */
	function nextDriveName() {
		const taken = new Set(editor.drive.map((e) => e.name));
		let n = 0;
		while (taken.has(`Untitled ${n}.md`)) n += 1;
		return `Untitled ${n}`;
	}

	async function newDriveDoc() {
		if (!drive?.writable) return;
		// The APP picks the name it wants and the STORE guarantees it does not land on top of
		// anything — its own free-naming stays as the backstop for the case this cannot see, which is
		// another device having made the same file a moment ago.
		const entry = await drive.create('', nextDriveName(), '.md', '');
		if (!entry) return;
		editor.drive = [...editor.drive, entry].sort((a, b) => a.path.localeCompare(b.path));
		await openEntry(entry, 'cloud');
		flash(entry.path, 'Saved');
	}

	/**
	 * FETCH UPDATES. A drive is somebody else's disk and this app reads it once — another device, or
	 * the web client, or a phone can change it underneath and nothing here would know. So the head
	 * carries a refresh.
	 *
	 * It re-reads the root and then RE-READS EVERY FOLDER THAT HAD BEEN READ, in order of depth so a
	 * parent arrives before its children can be asked for. Re-listing the root alone would silently
	 * collapse the tree back to one level while leaving the rows on screen, which is worse than not
	 * refreshing: the open folders would look current and be stale.
	 *
	 * A folder that has appeared since is SHUT, as any newly-seen folder is; one that was open stays
	 * open. Somebody refreshing wants the drive brought up to date, not their place in it thrown away.
	 */
	async function refreshDrive() {
		if (!drive || editor.driveFetching.includes('')) return;
		// The head says so with the row's own word and bar — `driveFetching` already means "this path
		// is being read", and the root is a path.
		editor.driveFetching = [...editor.driveFetching, ''];
		const wasRead = editor.driveFetched
			.filter(Boolean)
			.sort((a, b) => a.split('/').length - b.split('/').length);
		const wasShut = new Set(editor.driveCollapsed);
		const listing = await drive.list();
		if (listing) {
			editor.drive = listing.files;
			editor.driveFolders = listing.dirs;
			editor.driveFetched = [''];
			editor.driveCollapsed = listing.dirs.filter((d) => wasShut.has(d) || !wasRead.includes(d));
			for (const path of wasRead) {
				if (editor.driveFolders.includes(path)) await fetchDriveDir(path);
			}
		}
		editor.driveFetching = editor.driveFetching.filter((p) => p !== '');
	}

	/** Shut a drive's section without forgetting the drive. */
	function closeDrive() {
		drive = null;
		driveId = '';
		editor.driveHost = '';
		editor.driveFetching = [];
		editor.drive = [];
		editor.driveFolders = [];
		editor.driveCollapsed = [];
		editor.driveFetched = [];
		editor.driveOpen = false;
		editor.drivePending = !!editor.connections.length;
		if (editor.openIn === 'cloud') {
			editor.openPath = '';
			editor.openWritable = false;
		}
	}

	/**
	 * FORGET, which is not revoke. The app password itself lives on the server and stays valid
	 * until it is cancelled in Nextcloud's Devices & sessions — that list is the control, and this
	 * app cannot reach it. All this does is stop holding a copy.
	 */
	async function forgetDrive(c: Connection) {
		editor.connections = editor.connections.filter((d) => d.id !== c.id);
		if (editor.driveName === c.name) closeDrive();
		sessionTokens.delete(c.id);
		await forgetToken(c.id);
		rememberConnections();
	}

	function pickFolder() {
		if (editor.canWrite) return pickWritableFolder();
		// Re-opening the same folder should re-read it, so the value is cleared first — an input
		// handed the same directory twice fires no change event otherwise.
		if (folderInput) folderInput.value = '';
		folderInput?.click();
	}

	/**
	 * Put an entry on the sheet and mark it as the one the workspace is showing. It is a PATH — the
	 * store is what turns one into words, and what will later save, rename or delete it.
	 */
	async function openEntry(entry: FolderEntry, list: 'tree' | 'cloud' = 'tree') {
		const from = storeOf(list);
		// A DOCUMENT on a drive is a request too, and it is the one somebody is waiting on most
		// directly — they pressed a row expecting words. Only the drive is marked: a local read is a
		// handle and a `File.text()`, over before a frame has passed, and a bar that flickered for
		// one frame on every press would be noise wearing the shape of information.
		if (list === 'cloud') editor.driveFetching = [...editor.driveFetching, entry.path];
		const body = await from?.read(entry.path);
		if (list === 'cloud') {
			editor.driveFetching = editor.driveFetching.filter((p) => p !== entry.path);
		}
		if (body == null) return;
		editor.openPath = entry.path;
		editor.openIn = list;
		if (!land(body, entry.name, null, !!from?.writable)) flash(entry.path, 'Not text', 'lost');
	}

	/** Put one of the two flat lists back in path order, after a name in it changed. */
	function resort(list: 'tree' | 'cloud') {
		const by = (a: FolderEntry, b: FolderEntry) => a.path.localeCompare(b.path);
		if (list === 'cloud') editor.drive = [...editor.drive].sort(by);
		else editor.folder = [...editor.folder].sort(by);
	}

	function tookFolder(event: Event) {
		const picked = [...((event.currentTarget as HTMLInputElement).files ?? [])];
		// A `webkitdirectory` workspace is read-only, session-only, and knows no empty folders: an
		// empty directory leaves no File to be seen in. All three are the platform's, and all three
		// are the snapshot store's to say — see $lib/text-editor-store.
		adopt(snapshotStore('', picked, isOpenable));
	}

	/** The document leaves as a real file. The name is the first heading, or the date. */
	/** Hand a body to the browser as a download under a given name. */
	function save(body: string, name: string) {
		const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		a.click();
		URL.revokeObjectURL(url);
	}

	function download() {
		// An OPENED document keeps the name it came in under. Guessing one from the first heading
		// is for a sheet that never had one — and a file that went out under a different name
		// from the one it arrived as would be a small betrayal.
		if (editor.filename) return save(text, editor.filename);
		const heading = text.match(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*$/m)?.[1] ?? 'text-editor';
		const name =
			heading
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '')
				.slice(0, 48) || 'text-editor';
		save(text, `${name}.md`);
	}

	// CLEARING is a DOCUMENT'S verb now — `clearDoc`, on the row's own menu, emptying the file it
	// is opened on rather than detaching whatever happened to be on the sheet. This timer is what
	// is left of the key that used to do it: the two-press question is unchanged (it asks by
	// BECOMING the question rather than by opening a dialog — a confirm() is a modal that stops
	// the page), and `editor.armed` now carries WHICH row is asking rather than a bare yes.
	let armTimer = 0;

	/**
	 * Put the manual page back on the sheet — the document the editor opens with on a first visit,
	 * which is also the only documentation this app has. That is deliberate: the page describes the
	 * marks by wearing them, so the way to read it is to open it in the thing it describes.
	 *
	 * It goes through `write` like every other edit, so it is UNDOABLE: pressing this by mistake
	 * costs one Cmd-Z, which is why it does not ask first the way Clear does.
	 *
	 * The name, the handle and the workspace's marked row all come OFF. What is on the sheet is no
	 * longer the file that was open, and leaving the name behind would leave Save pointed at a file
	 * it would overwrite with the manual.
	 */
	function readme() {
		stashEphemeral();
		sheet.put(STARTER);
		editor.filename = '';
		editor.openPath = '';
		editor.openIn = 'tree';
		editor.openHandle = null;
		editor.openWritable = false;
	}

	// ── Scroll ────────────────────────────────────────────────────────────────
	// In SPLIT the proof follows the sheet, proportionally. Proportional rather than line-mapped
	// on purpose: a line map needs the rendered height of every block, which means measuring the
	// proof on each keystroke, and the ratio is right to within a paragraph for the price of one
	// subtraction. `syncing` breaks the feedback loop — setting scrollTop fires scroll.
	let syncing = false;

	/**
	 * Has anything gone under the bar yet? Published to the shared state, because the BAR is the
	 * page's and it cannot see this scroll — see the note on `scrolled` in $lib/text-editor-state.
	 * Either pane counts: content passing beneath the keys is content passing beneath the keys,
	 * whichever pane it is in.
	 */
	function reportScrolled() {
		editor.scrolled = (paperEl?.scrollTop ?? 0) > 2 || (proofEl?.scrollTop ?? 0) > 2;
	}

	function onPaperScroll() {
		// The selection only draws the rows on screen, so scrolling is what brings the rest into
		// existence. Cheap: it is a handful of ranges over the visible band.
		measureSelection();
		reportScrolled();
		if (shown !== 'split' || syncing || !paperEl || !proofEl) return;
		const room = paperEl.scrollHeight - paperEl.clientHeight;
		const theirs = proofEl.scrollHeight - proofEl.clientHeight;
		if (room <= 0 || theirs <= 0) return;
		syncing = true;
		proofEl.scrollTop = (paperEl.scrollTop / room) * theirs;
		requestAnimationFrame(() => (syncing = false));
	}

	// A window widening past the breakpoint puts the keys back in the bar, so a flyout left
	// standing would be a second copy of controls that are already up there.
	$effect(() => {
		if (!editor.narrow) keyOpen = false;
	});

	// Leaving PROOF hands focus back to the sheet, so the mode keys in the bar are a round trip
	// rather than a one-way door: press WRITE and you are typing again without reaching for the
	// textarea. `tick` because the pane the caret is going to has not been mounted yet.
	//
	// Gated on the TRANSITION out of proof, not on the current mode, and that is the whole reason
	// this keeps a variable. An effect that just focused whenever `shown` was not 'proof' would
	// fire once on mount and steal focus the instant the page opened — which scrolls the document
	// to the textarea and throws up the keyboard on a phone, neither of which anybody asked for.
	let wasProof = false;
	$effect(() => {
		const now = shown;
		if (wasProof && now !== 'proof') tick().then(() => sheet.focus());
		wasProof = now === 'proof';
		// A mode change swaps which panes exist, and the new one has its own scroll position —
		// so the bar's frost has to be re-read rather than left on from the pane that just went.
		tick().then(reportScrolled);
	});

	// Holding the text to a measure RE-WRAPS it, which moves every row — so the caret and the
	// selection band, both of which are drawn at measured positions, have to be taken again.
	$effect(() => {
		editor.measured;
		tick().then(() => {
			measureCaret();
			measureSelection();
		});
	});

	/** Four figures in the pixel face, the way a manual sets a count. */
	const pad = (n: number) => String(n).padStart(4, '0');
</script>

{#snippet markCard()}
	<!-- The marks, as a grid rather than a column. They keep the flyout open — see the note at
	     the call. -->
	<div class="te-fly-marks" role="group" aria-label="Marks">
		<button
			type="button"
			class="te-fly-mark"
			title="Heading level"
			aria-label="Heading level"
			onclick={openHeadings}>H▾</button
		>
		{#each MARKS as mark (mark.title)}
			<button
				type="button"
				class="te-fly-mark"
				title={mark.title}
				aria-label={mark.title}
				onclick={mark.run}
			>
				{#if mark.svg}
					<span class="te-key-ico" aria-hidden="true">{@html mark.svg}</span>
				{:else}
					{mark.label}
				{/if}
			</button>
		{/each}
	</div>
{/snippet}

<!-- ONE TREE, DRAWN TWICE. The folder on the machine and the drive on a server are two lists of
     paths and nothing about laying one out differs from the other — so `list` says which it is and
     every verb takes it. Two copies of this markup is how the two would quietly stop agreeing about
     what a row does, which is the same argument the key tables in $lib/text-editor-state make.

     DRAGGING IS THE LOCAL TREE'S ALONE. A drive's rows are not draggable and its folders take no
     drop: a move between two stores is a read and a write and a delete, not a move, and offering it
     as the same gesture would be a lie about what is happening to somebody's document. -->
<!-- OPEN OR SHUT A WHOLE TREE AT ONCE — the row twisty's job at the scale of everything under
     something. Worn by the two section HEADS (the folder and the drive, where it means the whole
     list) and by every folder ROW that has folders inside it (where it means that branch). Written
     once for all of them: several copies is how they would stop agreeing about what the key does,
     the same argument the tree snippet below is written once for.
     THE MARK IS reicon's `chevron-expand-y` — two chevrons pointing apart — and its mirror for the
     other direction. Not the row twisty doubled, which is what this wore first: the twisty is the
     mark for ONE folder, and a control that acts on many should not be the one-folder mark
     repeated. The chevrons point the way the rows will point AFTER the press, so the key shows its
     result rather than its name; the title says the same thing in words. -->
{#snippet twistAll(allShut: boolean, what: string, act: () => void, where: 'head' | 'row' = 'head')}
	<button
		type="button"
		class="te-loose-sort te-twist-all"
		class:te-twist-branch={where === 'row'}
		class:shuts={!allShut}
		title={allShut ? `Open ${what}` : `Shut ${what}`}
		aria-label={allShut ? `Open ${what}` : `Shut ${what}`}
		onclick={act}
	>
		{@html CHEVRON_EXPAND_Y_SVG}
	</button>
{/snippet}

{#snippet tree(
	rows: WorkRow[],
	list: 'tree' | 'cloud',
	label: string,
	twist: (path: string) => void
)}
	<ul
		class="te-work-list {list === 'cloud' ? 'te-drive-list' : 'te-local-list'}"
		role="tree"
		aria-label={label}
	>
		{#each rows as row (row.kind === 'dir' ? `d:${row.path}` : `f:${row.entry.path}`)}
			<!-- IS THIS ROW BEING READ? One question for both kinds, because it is one fact — see
			     `driveFetching` in the state module. Hoisted above the branch so a folder and a
			     document ask it the same way and answer it with the same two marks. -->
			{@const busy =
				list === 'cloud' &&
				editor.driveFetching.includes(row.kind === 'dir' ? row.path : row.entry.path)}
			{#if row.kind === 'dir'}
				<li class="te-work-item" role="none">
					<!-- A folder is a row you can shut. It carries how many documents are under
						     it — closed, that number is the only thing left saying what is in
						     there, and open it still answers "is this the big one?". -->
					<button
						type="button"
						class="te-work-row te-work-dir"
						class:into={list === dragList && dropInto === row.path}
						class:fetching={busy}
						aria-busy={busy || undefined}
						role="treeitem"
						aria-level={row.depth + 1}
						aria-expanded={!row.shut}
						aria-selected="false"
						style:padding-left="calc(0.75rem + {row.depth} * 0.8rem)"
						ondragover={(e) => onDragOver(e, row.path, list)}
						ondragleave={(e) => onDragLeave(e, row.path)}
						ondrop={(e) => onDrop(e, row.path, list)}
						onclick={() => twist(row.path)}
						oncontextmenu={(e) => canMoveIn(list) && openDirMenu(e, row.path, list)}
						title={whereIs(row.path, list)}
						onkeydown={(e) => {
							// The arrow keys a tree is expected to answer to. Left shuts an open
							// folder, right opens a shut one — the rest of the tree's keyboard is
							// Tab, which already walks the rows in the order they are drawn.
							if (e.key === 'ArrowLeft' && !row.shut) twist(row.path);
							else if (e.key === 'ArrowRight' && row.shut) twist(row.path);
							else return;
							e.preventDefault();
						}}
					>
						<span class="te-work-twist" class:shut={row.shut} aria-hidden="true"></span>
						<span class="te-work-file te-work-dirname">{row.name}</span>
						<!-- ABSENT, not zero, where the count cannot be known. See `count` in WorkRow: a
							     remote folder nothing has been fetched from holds an unknown number of
							     documents, and a confident 0 beside forty of them is worse than silence. -->
						{#if busy}
							<!-- WHERE THE TALLY WOULD BE, because it is the answer to the same question:
								     how much is in here. It cannot be known yet, and this says what is being
								     done about that. -->
							<span class="te-work-fetching">Fetching</span>
							<span class="te-work-bar" aria-hidden="true"></span>
						{:else if row.count !== null}
							<span class="te-work-tally">{row.count}</span>
						{/if}
					</button>
					<!-- THE BRANCH KEY, a SIBLING of the row button and never a child: a button inside a
					     button is not markup a browser keeps, which is the same rule the scratch row's ×
					     follows. Held back until the row is reached for, like that × — a key drawn on
					     every folder at rest is the arrangement Rename and Delete were taken OFF the rows
					     for, and it would cover the end of the one thing on the row you cannot work out
					     from anywhere else.
					     Only where the folder HAS folders in it: with nothing nested, this key and the
					     row's own twisty would do the identical thing, one of them invisibly. -->
					{#if branchOf(row.path, list).length > 1}
						{@render twistAll(
							branchShut(row.path, list),
							branchShut(row.path, list) && list === 'cloud'
								? `everything in ${row.name} read so far`
								: `everything in ${row.name}`,
							() => twistBranch(row.path, list),
							'row'
						)}
					{/if}
				</li>
			{:else}
				{@const entry = row.entry}
				<!-- LISTED BUT NOT OPENABLE: a picture, a PDF, anything this editor cannot set. The row
				     is drawn so the folder looks like itself, and drawn plainly inert so nobody presses
				     it twice wondering why nothing happened. -->
				{@const inert = entry.openable === false}
				<li class="te-work-item" role="none">
					{#if editor.renaming === entry.path}
						<!-- Renaming happens IN the row, not in a dialog. The row is where the name
						     is, and a prompt() would stop the page to ask about one word. -->
						<form
							class="te-work-rename"
							style:padding-left="calc(0.5rem + {row.depth} * 0.8rem)"
							onsubmit={(e) => {
								e.preventDefault();
								rename(entry, new FormData(e.currentTarget).get('name') as string, list);
							}}
						>
							<!-- svelte-ignore a11y_autofocus -->
							<input
								class="field te-work-field"
								name="name"
								value={entry.name}
								autofocus
								aria-label="New name for {entry.name}"
								onkeydown={(e) => {
									if (e.key === 'Escape') editor.renaming = '';
								}}
								onblur={() => (editor.renaming = '')}
							/>
						</form>
					{:else}
						<!-- The row is one key with one job: open this document. Rename and Delete
							     are on its context menu, where a file manager keeps them. The path
							     is gone from under the name — the tree is where it is now. -->
						<button
							type="button"
							class="te-work-row"
							class:fetching={busy}
							aria-busy={busy || undefined}
							role="treeitem"
							aria-level={row.depth + 1}
							aria-selected={editor.openIn === list && editor.openPath === entry.path}
							class:on={editor.openIn === list && editor.openPath === entry.path}
							class:menu={editor.fileMenu?.list === list && editor.fileMenu.path === entry.path}
							class:dragging={dragging === entry.path}
							class:said={said.key === entry.path}
							class:said-here={said.key === entry.path && said.tone === 'here'}
							class:said-lost={said.key === entry.path && said.tone === 'lost'}
							data-said={said.key === entry.path ? said.word : null}
							aria-current={editor.openIn === list && editor.openPath === entry.path
								? 'true'
								: undefined}
							class:inert
							aria-disabled={inert || undefined}
							aria-haspopup={inert ? undefined : 'menu'}
							title={inert
								? `${entry.name} — this editor only opens text. ${whereIs(entry.path, list)}`
								: whereIs(entry.path, list)}
							draggable={canMoveIn(list) && !inert}
							ondragstart={(e) => onDragStart(e, entry, list)}
							ondragend={() => {
								dragging = '';
								dropInto = null;
							}}
							style:padding-left="calc(0.75rem + {row.depth} * 0.8rem)"
							onclick={() => !inert && openEntry(entry, list)}
							oncontextmenu={(e) => !inert && openFileMenu(e, entry, list)}
						>
							<span class="te-work-file">{entry.name}</span>
							{#if busy}
								<!-- The same two marks a folder gets. A document has no tally for the word to
									     stand in for, so it stands at the same right edge the tallies keep — the
									     column is the column whatever happens to be in it. -->
								<span class="te-work-fetching">Fetching</span>
								<span class="te-work-bar" aria-hidden="true"></span>
							{/if}
						</button>
					{/if}
				</li>
			{/if}
		{/each}
	</ul>
{/snippet}

{#snippet shelf(
	title: string,
	mark: string,
	tip: string,
	rows: {
		id: string;
		name: string;
		list: 'loose' | 'ephemeral';
		open: () => void;
		menu: (e: MouseEvent) => void;
		/** Where this document is, for the row's tooltip. See `whereIs`. */
		where: string;
		/** Present where a row can be dismissed from the row itself. False while it asks. */
		close?: () => boolean;
	}[],
	sort?: () => void,
	add?: () => void
)}
	<div class="te-loose">
		<!-- THE SAME HEAD the folder and the drive wear. It was set in the muted running-head voice,
		     a shade of the real thing, back when the shelves were the only lists that had one and
		     the folder's name sat at the top of the pane where nothing could be compared to it.
		     Four lists now, each with a head, and one of them set differently reads as a subheading
		     of whatever is above it rather than as the top of its own list. -->
		<div class="te-work-head te-loose-head">
			<span class="te-work-mark" role="img" aria-label={tip}>{@html mark}</span>
			<span class="popover te-work-where" aria-hidden="true">{tip}</span>
			<h2 class="te-work-name">{title}</h2>
			{#if add}
				<!-- + on the Scratch head. New note is in the Workspace menu, which is the right place
				     for it — the menu is where the pane's own controls went — but a list you add to
				     this often deserves the shorter road as well, at the head of the list it adds to.
				     Only on SCRATCH: nothing can be added to ELSEWHERE by asking, since that shelf is
				     a record of what you reached for rather than a list you keep.
				     It stands LEFT of A–Z, which is the order the two are used in. The tally stays
				     last, past both, because it heads a column — every folder row in the tree below
				     carries the same figure at the same right edge. -->
				<button
					type="button"
					class="te-loose-sort te-loose-add"
					title="Make a scratch document"
					aria-label="New {title} note"
					onclick={add}>+</button
				>
			{/if}
			{#if sort}
				<!-- A-Z. Only on the list whose order is the visitor's: sorting ELSEWHERE would
				     contradict what that shelf means, which is the order you reached for them. -->
				<button
					type="button"
					class="te-loose-sort"
					title="Sort these A to Z"
					aria-label="Sort {title} A to Z"
					onclick={sort}>A–Z</button
				>
			{/if}
			<span class="te-work-count">{rows.length}</span>
		</div>
		<ul class="te-work-list te-loose-list te-shelf-list" aria-label={title}>
			{#each rows as row (row.id)}
				<li class="te-work-item">
					<button
						type="button"
						class="te-work-row"
						class:on={editor.openIn === row.list && editor.openPath === row.id}
						class:menu={editor.fileMenu?.list === row.list && editor.fileMenu.path === row.id}
						class:dragging={row.list === 'ephemeral' && dragEph === row.id}
						class:into={row.list === 'ephemeral' && dropEphOn === row.id}
						class:said={said.key === row.id}
						class:said-here={said.key === row.id && said.tone === 'here'}
						class:said-lost={said.key === row.id && said.tone === 'lost'}
						data-said={said.key === row.id ? said.word : null}
						aria-current={editor.openIn === row.list && editor.openPath === row.id
							? 'true'
							: undefined}
						aria-haspopup="menu"
						draggable={row.list === 'ephemeral'}
						ondragstart={(e) => row.list === 'ephemeral' && onEphDragStart(e, row.id)}
						ondragover={(e) => row.list === 'ephemeral' && onEphDragOver(e, row.id)}
						ondragleave={() => {
							if (dropEphOn === row.id) dropEphOn = '';
						}}
						ondrop={(e) => row.list === 'ephemeral' && onEphDrop(e, row.id)}
						ondragend={() => {
							dragEph = '';
							dropEphOn = '';
						}}
						onclick={row.open}
						oncontextmenu={row.menu}
						title={row.where}
					>
						<span class="te-work-file">{row.name}</span>
					</button>
					{#if row.close}
						<!-- The × is a SIBLING of the row, not a child: a button inside a button is not markup
						     a browser will keep. It asks twice, like everything else in this app that cannot be
						     undone — a scratch note's words are nowhere but this row.
						     ARMED, IT SAYS SO IN WORDS. It used to ask by turning the same × the accent
						     colour, which is not a question: you were asked to press a second time by
						     something that looked like the thing you had just pressed, so the gesture read
						     as a double-click on one control rather than as two answers. Clear had the
						     answer already — it becomes the word `Sure?` — and this is the same two-press
						     bargain, so it wears the same word. -->
						<button
							type="button"
							class="te-eph-close"
							class:on={editor.doomed === row.id}
							title={editor.doomed === row.id
								? `Press again to close ${row.name} — its words go with it`
								: `Close ${row.name}`}
							aria-label={editor.doomed === row.id
								? `Press again to close ${row.name}`
								: `Close ${row.name}`}
							onclick={row.close}>{editor.doomed === row.id ? 'Sure?' : '×'}</button
						>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/snippet}

{#snippet docKeys()}
	<!-- `icon-btn` is the class FloatingKey's stack dresses: it gives these the touch-sized
	     frosted face the other apps' flyout controls wear. `te-fkey` is this app's own, and it
	     turns each disc into a NAMED key — see the note by its CSS.
	     ORDER MATTERS and reads backwards: the stack is column-reverse so that the FIRST button
	     here lands nearest the thumb. The VIEW keys lead, because the bar that used to hold them
	     is gone at this width and switching between the sheet and the proof is the thing a phone
	     does most; then the document keys, then the file keys — the bar's own left-to-right — and
	     the measure last, furthest away, because it is the one you set once and forget.
	     THE EVENT IS PASSED ON. Most of these want nothing to do with it; Workspace opens a menu
	     and has to measure the disc it opens from, and on a phone that disc is the only thing that
	     knows where the bottom-left of the screen is. -->
	<!-- The same rule the bar keeps: the view keys and the measure are PROSE's, and a code file
	     has one view. See `shownMode`. -->
	{#each kind === 'code' ? [] : VIEW_KEYS as m (m.id)}
		<button
			type="button"
			class="icon-btn te-fkey"
			class:on={shown === m.id}
			aria-pressed={shown === m.id}
			title={m.title}
			onclick={() => {
				editor.mode = m.id;
				keyOpen = false;
			}}
		>
			{@html m.svg}<span class="te-fkey-word">{m.label}</span>
		</button>
	{/each}
	{#each [...DOC_KEYS, ...OPEN_KEYS].filter((k) => k.shown?.() ?? true) as k (k.id)}
		<button
			type="button"
			class="icon-btn te-fkey"
			class:on={k.on?.()}
			class:done={k.done?.()}
			class:lost={k.lost?.()}
			title={k.title()}
			onclick={(e) => {
				k.run(e);
				if (k.folds()) keyOpen = false;
			}}
		>
			{@html k.svg}<span class="te-fkey-word">{k.label()}</span>
		</button>
	{/each}
	{#if kind !== 'code'}
		<button
			type="button"
			class="icon-btn te-fkey"
			class:on={editor.measured}
			aria-pressed={editor.measured}
			title={editor.measured ? 'Let the text run the full width' : 'Hold the text to a measure'}
			onclick={() => (editor.measured = !editor.measured)}
		>
			{@html RULE_SVG}<span class="te-fkey-word">Measure</span>
		</button>
	{/if}
	<!-- THE PANEL'S CHROME, past the document keys — and it is ONE key now. About, Install and the
	     door out were three discs at the top of this stack, drawn among the marks and looking like
	     three more marks; the Beta tag was a fourth thing in the bar beside them. All four are
	     behind SETTINGS, here and in the bar's corner alike, which is the same surface opened from
	     two keys (see `openSettings` in $lib/text-editor-state).
	     LAST WRITTEN, so it lands furthest from the thumb: the stack is column-reverse, and the
	     one key holding the door out of the app is the one a mis-tap must not find. It does not
	     fold the flyout — the settings card opens over it, and folding the thing underneath would
	     animate a stack nobody is looking at any more. -->
	<button
		type="button"
		class="icon-btn te-fkey"
		class:on={!!editor.settingsAt}
		aria-expanded={!!editor.settingsAt}
		title="Settings — About, Install, Apps, and the version"
		onclick={openSettings}
	>
		{@html GEAR_SVG}<span class="te-fkey-word">Settings</span>
	</button>
{/snippet}

<!-- The KEYS are not here. They live in the panel's dense bar, drawn by the catch-all page from
     $lib/TextEditorRack, and reach back into this component through the command table published
     in $lib/text-editor-state. What is left in the body is the work itself: the sheet, the proof, and
     the running foot under both. -->
<div
	class="te"
	class:te-write={shown === 'write'}
	class:te-proof-only={shown === 'proof'}
	class:te-measured={editor.measured && kind !== 'code'}
>
	<div class="te-desk">
		{#if editor.folderPending}
			<!-- A folder REMEMBERED from last time, whose permission has lapsed. It is named and
			     shut, and one click reconnects it: a browser will only re-ask during a gesture,
			     so the alternative would be a permission dialog thrown at somebody who has just
			     loaded a page. -->
			<aside class="te-work te-work-shut" aria-label="Remembered folder">
				<header class="te-work-head">
					<h2 class="te-work-name" title={editor.folderName}>{editor.folderName}</h2>
					<button
						type="button"
						class="tb te-work-act"
						onclick={() => {
							editor.folderPending = false;
							editor.folderName = '';
							rememberFolder(null);
						}}
						title="Forget this folder">Forget</button
					>
				</header>
				<p class="te-work-note">
					Opened here last time. Browsers ask again after a reload — one press reconnects it.
				</p>
				<button type="button" class="tb te-work-reconnect" onclick={reconnect}>Reconnect</button>
			</aside>
		{:else if editor.folderShown}
			<!-- THE WORKSPACE — the opened folder, kept alongside the document the way an editor
			     keeps one, rather than a picker that appears and goes. It is a column of the desk
			     on a wide window and a sheet over it on a phone, and picking from it does not
			     close it: that is the difference between a workspace and a dialog.
			     Set as the manual sets a list — a ruled row per document, the name in the mono
			     voice over its path in the muted one, the open one marked. -->
			<!-- FOUR LISTS, and the pane is not any one of them. It used to be labelled for the folder,
			     which was true while the folder was all there was in here. -->
			<aside class="te-work" aria-label="Workspace">
				<!-- TWO SHELVES above the tree, both drawn by the same snippet below: SCRATCH (what
				     New makes, which has no file anywhere) and ELSEWHERE (what was opened from
				     outside this folder). Scratch is on top because it is the list you just added
				     to; both are shaded off the sheet, which is the whole of how they say they are
				     not part of the folder named above them. -->
				<!-- The two shelves share one shaded block. Apart, the gap between them showed the
				     sheet through — a white band between two grey lists, which reads as the tree
				     starting and then changing its mind. The block is the shading; the gap inside
				     it is the same grey, and the one white gap is the one below, which is where
				     the shelves actually end and the folder begins. -->
				<section class="te-band te-shelves">
					<!-- SCRATCH IS ALWAYS DRAWN (unless it is switched off in Settings). It used to
					     appear only once it had rows, which made the list you were about to add to
					     invisible until you had added to it — and there is always a row now anyway,
					     because the sheet is always a document with one. -->
					{#if editor.scratchShown}
						{@render shelf(
							'Scratch',
							GHOST_SVG,
							'In this browser · these notes have no file behind them',
							editor.ephemeral.map((d) => ({
								id: d.id,
								name: d.name,
								list: 'ephemeral' as const,
								open: () => openEphemeral(d),
								menu: (e: MouseEvent) => openShelfMenu(e, d.id, 'ephemeral'),
								// A scratch note has no location, and saying so IS the fact worth having:
								// it is the one row in this pane whose words exist nowhere but here.
								where: 'In this browser · not saved to disk',
								close: () => closeShelfRow({ id: d.id, list: 'ephemeral' })
							})),
							sortEphemeral,
							newEphemeral
						)}
					{/if}
					{#if editor.loose.length}
						{@render shelf(
							'Local',
							FOLDER_FILES_SVG,
							'Opened from outside the workspace · usually local, and a drive row says so',
							editor.loose.map((d) => ({
								id: d.id,
								name: d.name,
								list: 'loose' as const,
								open: () => openLoose(d),
								menu: (e: MouseEvent) => openShelfMenu(e, d.id, 'loose'),
								where: looseWhere(d)
							}))
						)}
					{/if}
				</section>
				<!-- THE DRIVE — a fourth list, above the folder and below the shelves. It is not the
				     folder and never replaces it: a folder on the machine and a folder on a server are
				     different kinds of place, and somebody may reasonably keep both open.

				     It is drawn whenever a drive is CONNECTED OR REMEMBERED. A remembered one that has
				     not answered yet — or whose password could not be read back — gets its head and a
				     line saying so, rather than nothing at all: a workspace that vanishes because a
				     token expired looks exactly like a workspace that was never there, and the visitor
				     has no way to tell which. -->
				{#if editor.driveOpen || editor.drivePending}
					<section class="te-band te-drive" aria-label="Drive: {editor.driveName}">
						<!-- ITS HEAD IS THE ROOT'S DROP TARGET, exactly as the folder's is. Without it a
						     document dragged into a sub-folder has no way back to the top level, which
						     makes the gesture one-way and therefore a trap. -->
						<header
							class="te-work-head te-drive-head"
							role="group"
							aria-label="Drive {editor.driveName || ''}"
							class:into={dragList === 'cloud' && dropInto === ''}
							ondragover={(e) => onDragOver(e, '', 'cloud')}
							ondragleave={(e) => onDragLeave(e, '')}
							ondrop={(e) => onDrop(e, '', 'cloud')}
							oncontextmenu={(e) => editor.driveOpen && openDirMenu(e, '', 'cloud')}
						>
							<!-- NAMED FOR THE FOLDER AND THE SERVER BOTH — `Notes (nextcloud.kashinoga.com)`.
							     A folder called `Notes` says nothing about where it is, and somebody with a
							     drive open beside a local folder of the same name has two lists wearing one
							     name. The host is left off when the drive was opened at its ROOT, because the
							     name IS the host then and `host (host)` is a label arguing with itself. -->
							<span class="te-work-mark" role="img" aria-label={driveWhere}>{@html CLOUD_SVG}</span>
							<span class="popover te-work-where" aria-hidden="true">{driveWhere}</span>
							<h2 class="te-work-name" bind:this={driveNameEl}>{driveLabel}</h2>
							{#if driveClipped}
								<!-- THE SAME REVEAL the folder's head keeps, and the drive needs it more: its label is a
								     folder AND a host, so it is the longest name in this pane by some way and the one
								     somebody most needs in full — two drives on two servers can hold a folder of one name.
								     BELOW the row, never over it: over the name it lands under the pointer that opened it
								     and takes its own hover away. -->
								<span class="popover te-work-full" aria-hidden="true">{driveLabel}</span>
							{/if}
							{#if editor.driveOpen}
								{@const busy = editor.driveFetching.includes('')}
								<!-- FETCH UPDATES. A drive is somebody else's disk: another device, the web
								     client or a phone can change it underneath and nothing here would know.
								     It is the only key in this pane that asks a question rather than
								     changing something, which is why it is a glyph and not a word. -->
								<button
									type="button"
									class="te-loose-sort te-drive-refresh"
									class:on={busy}
									disabled={busy}
									title="Fetch updates from {editor.driveHost || 'the drive'}"
									aria-label="Fetch updates from the drive"
									onclick={refreshDrive}>{@html REFRESH_SVG}</button
								>
								{#if busy}
									<!-- The row's own word and bar, on the head. `driveFetching` already means
									     "this path is being read" and the root is a path, so refreshing says it
									     in the vocabulary the rows already use rather than inventing a spinner. -->
									<span class="te-work-fetching">Fetching</span>
									<span class="te-work-bar" aria-hidden="true"></span>
								{/if}
							{/if}
							<!-- `+`, the same key the Scratch head wears and in the same place: the short
							     road to one more row, at the head of the list it adds to. What it MAKES
							     differs, and has to — a scratch note has nowhere to be until it is filed,
							     and a drive is somewhere already. See `newDriveDoc`. -->
							{#if editor.driveOpen && drive?.writable}
								<button
									type="button"
									class="te-loose-sort te-loose-add"
									title="Make a document on {editor.driveName || 'the drive'}"
									aria-label="New document on the drive"
									onclick={newDriveDoc}>+</button
								>
							{/if}
							<!-- The drive's own, in the same place in the row and saying LESS in its word: this
							     tree is lazy, so opening it reaches what the drive has revealed rather than all
							     of it. See `twistAllDrive`. -->
							{#if editor.driveOpen && editor.driveFolders.length}
								{@render twistAll(
									branchShut('', 'cloud'),
									branchShut('', 'cloud') ? 'every folder read so far' : 'every folder',
									() => twistBranch('', 'cloud')
								)}
							{/if}
							<!-- NO TALLY. The tree arrives one level at a time, so the number of documents
							     in the drive is not a thing this app knows until every folder has been
							     opened — and a figure that grows as you browse is worse than none. -->
						</header>
						{#if editor.drivePending}
							<p class="te-work-note">
								Not connected. {editor.connections.length
									? 'Its password could not be read back, or the server did not answer.'
									: ''}
							</p>
						{:else}
							{@render tree(driveRows, 'cloud', 'Drive documents', toggleDriveDir)}
						{/if}
					</section>
				{/if}
				<!-- THE FOLDER, head and all. The head used to be pinned to the TOP of the pane, above
				     the shelves and above the drive, while the rows it heads were at the bottom — so a
				     workspace called `Syncthing` announced itself three lists away from the first thing
				     inside it, and the row directly under its name belonged to something else.
				     A head names the list it is on top of, or it is a title for the pane; this pane has
				     four lists and no room for a title. -->
				<section class="te-band te-local" aria-label="Workspace: {editor.folderName || 'folder'}">
					<!-- ONE ROW: the folder's name, its tally, and the three keys that act on the pane.
				     The name had the row to itself for a while, because sharing it with three keys
				     ellipsised any long name after a few characters and the name is the one thing
				     in here you cannot work out from anything else. It shares again — a whole row
				     spent on a word is a row the list could have had — and the ellipsis is answered
				     rather than accepted: point at a clipped name and the whole of it opens below,
				     wrapped, on the same sheet the menus are cut from. -->
					<!-- The head is the ROOT's drop target. Dragging a document out of a sub-folder has to
				     have somewhere to land, and the folder's own name is the obvious place: it is the
				     row that names the directory everything else is inside. -->
					<header
						class="te-work-head"
						role="group"
						aria-label="Workspace {editor.folderName || ''}"
						class:into={dragList === 'tree' && dropInto === ''}
						ondragover={(e) => onDragOver(e, '', 'tree')}
						ondragleave={(e) => onDragLeave(e, '')}
						ondrop={(e) => onDrop(e, '', 'tree')}
						oncontextmenu={(e) => openDirMenu(e, '', 'tree')}
					>
						<!-- THE FOLDER'S OWN NAME, and `FOLDER` when there is none. Not `Workspace`: the
					     PANE is the workspace — four lists in it now — and this is the one of them that
					     is on the machine. Naming the section for the whole pane was fine while it was
					     the only section in it.
					     It said `LOCAL` until the shelf below took that word. The shelf holds files
					     picked off this machine, and calling it ELSEWHERE said the one thing about them
					     that is not true — that they are not local. This section never needed the word:
					     it is headed by the folder's own name whenever there is a folder, and this is
					     only what stands in when there is not.
					     The name is still the one thing in this row you cannot work out from anywhere
					     else, which is why the verbs are on the row's right-click and not beside it. -->
						<span class="te-work-mark" role="img" aria-label={localWhere}>{@html SSD_SVG}</span>
						<span class="popover te-work-where" aria-hidden="true">{localWhere}</span>
						<h2 class="te-work-name" bind:this={workNameEl}>
							{editor.folderName || 'Folder'}
						</h2>
						<!-- The folder's own tally comes LAST, past the keys, because it is one of a
					     column: every folder row in the tree below carries the same figure at the
					     same right edge, and this one is the head of that column rather than a
					     footnote to the name. -->
						<!-- `+` HERE MEANS THE OS PICKER, and that is a different `+` from the drive's on purpose.
						     Locally you BRING A FOLDER IN — the documents are already on the machine and what this
						     section is short of is a way to point at them. On a drive the folder is already there and
						     what is short is a document, so its `+` makes one.
						     Making a document locally is what Save on a scratch note does, which is this app's own
						     order of operations: write it, then decide where it lives. -->
						<button
							type="button"
							class="te-loose-sort te-loose-add"
							title={store ? 'Open a different folder' : 'Open a folder'}
							aria-label="Open a folder"
							onclick={pickFolder}>+</button
						>
						<!-- …then the whole tree's twisty, after the key that brings a tree in and before the
						     tally that heads its column. Only where there is a folder to shut: the tree of a
						     workspace with no sub-folders is one level deep and already as open as it goes. -->
						{#if editor.folders.length}
							{@render twistAll(branchShut('', 'tree'), 'every folder', () =>
								twistBranch('', 'tree')
							)}
						{/if}
						<!-- DOCUMENTS, not rows — the same count the folder rows carry, for the same
						     reason. See `countIn`. -->
						<span class="te-work-count"
							>{editor.folder.filter((f) => f.openable !== false).length}</span
						>
						{#if nameClipped}
							<!-- Drawn only when the name is ACTUALLY clipped — a reveal that repeats a name
						     you can already read in full is a flicker with no information in it. It
						     hangs BELOW the row rather than over it, so it never lands under the
						     pointer that opened it and cannot take its own hover away. -->
							<span class="popover te-work-full" aria-hidden="true">{editor.folderName}</span>
						{/if}
					</header>
					<!-- A TREE, drawn flat: every row carries its own depth as a left inset, which indents
				     exactly as nested lists would and lets one `each` draw the whole thing. The
				     ARIA is the flattened kind — `aria-level` on each item says where it sits, since
				     the DOM nesting no longer does. -->
					{@render tree(workRows, 'tree', 'Documents', toggleDir)}
					{#if !editor.folder.length}
						<!-- An EMPTY folder still gets its sidebar. It used to be hidden — and once New
					     existed that meant the one place to make a first document disappeared exactly
					     when it was needed. -->
						<!-- It names the KEY, which is the one thing here that cannot be guessed now: New and
					     Change were two keys in this pane's own head and they are in the bar's Workspace
					     menu instead. Naming the place, not the gesture — the audience knows what a menu
					     is; what it cannot know is which key was chosen to hold this one. -->
						<p class="te-work-note">
							{!editor.folderName
								? 'No folder open. The Workspace key picks one, and makes scratch notes.'
								: 'Nothing here this editor can open — it takes Markdown and plain text.'}
						</p>
					{/if}
				</section>
				<!-- Only while there is no way to write ANYWHERE: not to the local disk, and not to
				     whatever workspace is open. The second half is what stops this contradicting a
				     writable store reached over a network, which Safari and Firefox can hold even
				     though they can never reach a folder on the machine. -->
				{#if !editor.canWrite && !editor.folderWritable}
					<p class="te-work-note">
						Read-only — this browser cannot write to a folder. Chrome and Edge can.
					</p>
				{/if}
			</aside>
		{/if}
		{#if kind === 'code' && !codeLost}
			<!-- THE CODE SHEET. A different engine entirely — see $lib/code-sheet — behind the same
			     Sheet interface, so nothing above this line knows which one answered.
			     It is a bare element that CodeMirror builds into, and it carries NONE of the prose
			     sheet's apparatus: no mirror, no drawn caret, no drawn selection, no paper
			     scroller. All of those exist to give a textarea things this engine already has, so
			     on this path they are not reimplemented — they are absent. -->
			<div class="te-pane te-sheet te-code-pane">
				<div class="te-code" bind:this={codeEl}></div>
				{#if codeComing}
					<!-- The first code file of a session is a network fetch. Saying so beats a white
					     pane, and it says what is happening rather than spinning at somebody. -->
					<p class="te-code-coming">Loading the code editor…</p>
				{/if}
			</div>
		{:else if shown !== 'proof'}
			<!-- THE SHEET. The scroller is .te-paper; inside it the mirror sets the height and the
			     textarea lies over it at exactly the same metrics. See the file head for why. -->
			<div class="te-pane te-sheet">
				<div class="te-paper" bind:this={paperEl} onscroll={onPaperScroll}>
					<div class="te-stack" bind:this={stackEl}>
						<!-- The selection, drawn a row at a time. First in the stack so it paints under
						     the textarea's ink — the textarea has no background of its own, so anything
						     laid down here shows through it. -->
						{#each selRects as r, i (i)}
							<span
								class="te-sel"
								aria-hidden="true"
								style:left="{r.x}px"
								style:top="{r.y}px"
								style:width="{r.w}px"
							></span>
						{/each}
						<div class="te-mirror" bind:this={mirrorEl} aria-hidden="true">
							{#each srcLines as line, i (i)}
								<div class="te-mline" class:te-here={i === caretLine}>
									{#if kind !== 'code' && marks[i]}<span class="te-margin-mark">{marks[i]}</span
										>{/if}<!--
					-->{line}
								</div>
							{/each}
						</div>
						{#if caretOn}
							<!-- OUR caret, in place of the browser's oversized one. Keyed on its own
							     position so that moving it REMOUNTS the element and restarts the blink:
							     a caret that is travelling has to be solid, or it disappears exactly when
							     you are watching where it went. -->
							{#key caretKey}
								<span
									class="te-caret"
									aria-hidden="true"
									style:left="{caretX}px"
									style:top="{caretY}px"
								></span>
							{/key}
						{/if}
						<!-- Spellcheck ON, and the platform's own autocorrect and autocapitalise left
						     alone — which is the opposite of what a code editor would ask for, and right
						     here for the same reason: this is a PROSE editor whose syntax happens to be
						     Markdown. A misspelt word in a paragraph is the likelier mistake by far, and
						     the two places the platform would get in the way (a code span, a fenced
						     listing) are short and obvious enough to fix by eye. -->
						<textarea
							class="te-type"
							bind:this={ta}
							bind:value={text}
							onkeydown={onKey}
							onkeyup={trackCaret}
							onclick={trackCaret}
							onselect={trackCaret}
							onfocus={trackCaret}
							onblur={() => {
								caretLine = -1;
								caretOn = false;
								selRects = [];
							}}
							oncompositionstart={() => {
								composing = true;
								caretOn = false;
								selRects = [];
							}}
							oncompositionend={() => {
								composing = false;
								measureCaret();
								measureSelection();
							}}
							spellcheck="true"
							autocomplete="off"
							aria-label="The document, in Markdown"
							placeholder="The sheet is blank. Start typing."></textarea>
					</div>
				</div>
			</div>
		{/if}

		{#if shown !== 'write'}
			<!-- THE PROOF. Everything in here is set by the engine and mounted with {@html}, which
			     is safe on exactly the terms $lib/markdown states: every source character is
			     escaped once up front, and every tag in the output is written by that file from a
			     fixed vocabulary. All the styling below is :global() for the same reason — Svelte
			     cannot scope selectors it never saw in this file's markup. -->
			<div class="te-pane te-proof-pane">
				<div class="te-proof" bind:this={proofEl} onscroll={reportScrolled}>
					{#if proof}
						{@html proof}
					{:else}
						<p class="te-blank">Nothing set yet.</p>
					{/if}
				</div>
			</div>
		{/if}
		{#if editor.contentsShown && !editor.narrow && kind !== 'code'}
			<!-- THE CONTENTS, a fourth column at the right — the docs shell's own right rail, in an
			     editor. It indexes the SOURCE rather than the proof, so it is there in WRITE where
			     there is no proof to read, and it carries the same section numbers the proof
			     prints so the two never disagree about what section 03 is. -->
			<nav class="te-toc" aria-label="Contents">
				<p class="te-toc-head">Contents</p>
				{#if contents.length}
					<ul class="te-toc-list">
						{#each contents as entry, i (entry.line)}
							<li>
								<button
									type="button"
									class="te-toc-link lvl-{entry.level}"
									class:on={i === hereHeading}
									aria-current={i === hereHeading ? 'true' : undefined}
									onclick={() => goTo(entry)}
								>
									{#if entry.num}<span class="te-toc-num">{entry.num}</span>{/if}{entry.text}
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="te-toc-empty">No headings yet.</p>
				{/if}
			</nav>
		{/if}
	</div>

	{#if editor.headingAt}
		<!-- THE HEADING MENU. Rendered here rather than beside the key that opens it, for two
		     reasons: the marks live in a strip that SCROLLS, and a popover inside it would be
		     clipped by its own scroller; and on a phone that strip is not drawn at all, while the
		     flyout's grid still needs the same menu. Fixed, at the key's measured rect. -->
		<button
			class="popover-scrim"
			aria-label="Close the heading menu"
			onclick={() => (editor.headingAt = null)}
		></button>
		<div
			class="popover te-heads-menu"
			role="menu"
			aria-label="Heading level"
			style:left="{editor.headingAt.x}px"
			style:top="{editor.headingAt.y}px"
		>
			{#each HEADING_LEVELS as level (level)}
				<button
					type="button"
					role="menuitem"
					class="popover-item te-heads-item"
					style:font-size="{1.15 - (level - 1) * 0.08}rem"
					onclick={() => {
						editor.cmd?.heading(level);
						editor.headingAt = null;
					}}>Heading {level}<span class="te-heads-mark">{'#'.repeat(level)}</span></button
				>
			{/each}
			<button
				type="button"
				role="menuitem"
				class="popover-item te-heads-item te-heads-none"
				onclick={() => {
					editor.cmd?.heading(0);
					editor.headingAt = null;
				}}>No heading</button
			>
		</div>
	{/if}

	<!-- THE THREE VERBS EVERY DOCUMENT HAS, wherever its row is. Rendered into both menus from
	     one snippet: the tree, the shelf and the scratch list all hold documents, and three lists
	     that offer the same three things in three copies of the markup is how one of them ends up
	     offering two.
	     Copy and Save a copy are offered EVERYWHERE — reading a document needs no permission, and
	     a download is how a document leaves a browser that cannot write. Clear is not: it is a
	     write, and `menuDoc.clear` is null where the platform will not take one. Not drawn, not
	     disabled, which is this app's rule for every key the browser cannot honour.
	     The menu closes on Copy and Save at once, because both have finished by the time the hand
	     leaves the button and the row itself says which one happened. Clear keeps the menu up
	     while it is asking. -->
	{#snippet docVerbs()}
		{#if menuDoc}
			{@const doc = menuDoc}
			<!-- READ THE DOCUMENT BEFORE CLOSING THE MENU, and it is not a style choice.
			     `{@const}` is a DERIVATION, not a snapshot: `doc` re-reads `menuDoc` every time it is
			     touched, and `menuDoc` is derived from `editor.fileMenu`. So `closeFileMenu()` first
			     and `copyDoc(doc)` second handed the verb a NULL — Copy put nothing on the clipboard,
			     Save a copy downloaded nothing, the row said nothing, and the only trace was a
			     TypeError in a console nobody had open. It was true of every list.
			     The local is taken deliberately rather than the two lines being swapped, so that
			     swapping them back cannot break it again. -->
			<button
				type="button"
				role="menuitem"
				class="popover-item"
				onclick={() => {
					const it = doc;
					closeFileMenu();
					copyDoc(it);
				}}>Copy</button
			>
			<button
				type="button"
				role="menuitem"
				class="popover-item"
				onclick={() => {
					const it = doc;
					closeFileMenu();
					saveCopy(it);
				}}>Save a copy</button
			>
			{#if doc.clear}
				<button
					type="button"
					role="menuitem"
					class="popover-item"
					class:on={editor.armed === doc.key}
					onclick={async () => {
						// The first press only arms it and the menu stays up holding the question; the
						// second has done the emptying by the time this resolves, so the menu goes.
						if (await clearDoc(doc)) closeFileMenu(true);
					}}>{editor.armed === doc.key ? 'Sure?' : 'Clear'}</button
				>
			{/if}
		{/if}
	{/snippet}

	{#if editor.fileMenu && shelfMenuRow}
		<!-- A SHELF's menu. One verb, and on ELSEWHERE it acts on the LIST rather than on the
		     disk: Close takes the row off and leaves the file where it is, which is why it is
		     offered in every browser where Rename and Delete are not.
		     On SCRATCH the same word means something heavier — the row is the only place those
		     words exist — so it asks twice, exactly as Clear does. -->
		<button
			class="popover-scrim"
			aria-label="Close the document menu"
			onclick={() => closeFileMenu()}
			oncontextmenu={(e) => {
				e.preventDefault();
				closeFileMenu();
			}}
		></button>
		<div
			class="popover te-file-menu"
			role="menu"
			aria-label={shelfMenuRow.name}
			tabindex="-1"
			bind:this={fileMenuEl}
			style:left="{fileMenuAt.x}px"
			style:top="{fileMenuAt.y}px"
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					closeFileMenu(true);
				}
			}}
		>
			<p class="popover-title">{shelfMenuRow.name}</p>
			{@render docVerbs()}
			<button
				type="button"
				role="menuitem"
				class="popover-item"
				class:on={editor.doomed === shelfMenuRow.id}
				onclick={() => {
					const row = shelfMenuRow;
					if (row && closeShelfRow(row)) closeFileMenu(true);
				}}
				>{shelfMenuRow.list === 'ephemeral' && editor.doomed === shelfMenuRow.id
					? 'Sure?'
					: 'Close'}</button
			>
		</div>
	{:else if editor.fileMenu && menuDir}
		<!-- A FOLDER'S MENU. Same scrim, same placement, same Escape as a document's — see the note
		     below. What differs is the verbs and, for the deletion, that it asks in words. -->
		{@const dir = menuDir}
		<button
			class="popover-scrim"
			aria-label="Close the folder menu"
			onclick={() => closeFileMenu()}
			oncontextmenu={(e) => {
				e.preventDefault();
				closeFileMenu();
			}}
		></button>
		<div
			class="popover te-file-menu"
			role="menu"
			aria-label={dir.name}
			tabindex="-1"
			bind:this={fileMenuEl}
			style:left="{fileMenuAt.x}px"
			style:top="{fileMenuAt.y}px"
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					// Backing out of a form goes to the verbs, not out of the menu: one Escape should
					// undo one step, and the step somebody wants undone is the one they just took.
					if (dirMode !== 'verbs') dirMode = 'verbs';
					else closeFileMenu(true);
				}
			}}
		>
			<p class="popover-title">{dir.name}</p>
			{#if dirMode === 'verbs'}
				{#if storeOf(dir.list)?.createDir}
					<button
						type="button"
						role="menuitem"
						class="popover-item"
						onclick={() => {
							dirMode = 'new';
							dirField = '';
						}}>New folder…</button
					>
				{/if}
				{#if dir.root && dir.list === 'tree'}
					<!-- OPENING A FOLDER lives here now, and this is the ONLY way to it: the bar key held
					     it and is a toggle again. So the head's menu opens whether or not a folder is
					     open — a head that refused to talk until a folder was open would leave a first
					     visit with no way to open one. The WORD changes with the state, because
					     "different" is a lie when there is nothing to differ from. -->
					<button
						type="button"
						role="menuitem"
						class="popover-item"
						onclick={() => {
							closeFileMenu();
							pickFolder();
						}}>{store ? 'Open a different folder…' : 'Open a folder…'}</button
					>
					<!-- CLOSE, on the ROOT only, and it is not Delete: nothing on the disk is touched.
					     The word is the difference — this pane already keeps `Close` for a shelf row,
					     where it means the same thing, and `Forget` for a drive, where it means it about
					     a password. -->
					{#if store}
						<button type="button" role="menuitem" class="popover-item" onclick={closeFolder}
							>Close the folder</button
						>
					{/if}
				{:else if !dir.root}
					<!-- DELETE IS LAST and it is the only item here that opens a question rather than
					     doing something. The ellipsis is the promise that pressing it is not the end of
					     it. It is not offered on a ROOT: deleting the folder you are looking at from
					     inside it is a gesture with nowhere to stand afterwards, and Close is what
					     somebody reaching for it actually wants. -->
					<button
						type="button"
						role="menuitem"
						class="popover-item te-file-del"
						onclick={() => askDeleteDir(dir.path, dir.list)}>Delete folder…</button
					>
				{/if}
			{:else if dirMode === 'new'}
				<!-- A FOLDER IS NAMED ON PURPOSE, so it is asked for. A document is not — `+` makes
				     `Untitled 0.md` and Rename exists to replace it — and the difference is that a
				     folder with a placeholder name is a folder nobody can find anything in. -->
				<form
					class="te-dir-form"
					onsubmit={(e) => {
						e.preventDefault();
						makeDir(dir.path, dir.list, dirField);
					}}
				>
					<label class="te-dir-label" for="te-dir-new">Name it</label>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						id="te-dir-new"
						class="field te-work-field"
						autofocus
						spellcheck="false"
						bind:value={dirField}
						placeholder="Notes"
					/>
					<div class="te-dir-keys">
						<button type="button" class="chip" onclick={() => (dirMode = 'verbs')}>Cancel</button>
						<button type="submit" class="chip" disabled={!dirField.trim()}>Make it</button>
					</div>
				</form>
			{:else}
				<!-- TYPING THE NAME, because this is recursive and, on a drive, not undoable from here:
				     Nextcloud keeps a trash bin and the proxy's path allow-list does not reach it, so
				     this app cannot offer a restore it cannot make. Two presses is the confirmation
				     calibrated for emptying one document; this deletes a folder and everything under it,
				     and the difference in consequence has to show as a difference in effort. -->
				<form
					class="te-dir-form"
					onsubmit={(e) => {
						e.preventDefault();
						if (dirField.trim() === dir.name) killDir(dir.path, dir.list);
					}}
				>
					<p class="te-dir-warn">
						{#if dirCounts === null}
							Reading what is in it…
						{:else if dirCounts.files || dirCounts.dirs}
							<!-- COUNTED, and counted over the WHOLE subtree — on a drive the folder is read
							     first, because a count that covered only the part somebody happened to browse
							     would understate exactly the folder most dangerous to delete. -->
							This deletes {dirCounts.files}
							{dirCounts.files === 1 ? 'document' : 'documents'}{dirCounts.dirs
								? ` and ${dirCounts.dirs} ${dirCounts.dirs === 1 ? 'folder' : 'folders'}`
								: ''} inside it.
							{dir.list === 'cloud' ? 'It cannot be undone from here.' : ''}
						{:else}
							It is empty.
						{/if}
					</p>
					<label class="te-dir-label" for="te-dir-kill">Type <b>{dir.name}</b> to confirm</label>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						id="te-dir-kill"
						class="field te-work-field"
						autofocus
						spellcheck="false"
						bind:value={dirField}
						aria-label="Type {dir.name} to confirm deleting it"
					/>
					<div class="te-dir-keys">
						<button type="button" class="chip" onclick={() => (dirMode = 'verbs')}>Cancel</button>
						<button
							type="submit"
							class="chip te-dir-kill"
							disabled={dirField.trim() !== dir.name || dirCounts === null}>Delete it</button
						>
					</div>
				</form>
			{/if}
		</div>
	{:else if editor.fileMenu && fileMenuEntry}
		<!-- THE ROW'S MENU. Rendered here rather than inside the row it belongs to, because the
		     list is a scroller and a popover inside it would be clipped by it. Fixed, at the
		     measured point, nudged back inside the window by the effect above.
		     Delete still asks twice, exactly as Clear does — a menu is a deliberate act, but the
		     item under the pointer when it opens is decided by where the pointer already was. -->
		<button
			class="popover-scrim"
			aria-label="Close the document menu"
			onclick={() => closeFileMenu()}
			oncontextmenu={(e) => {
				e.preventDefault();
				closeFileMenu();
			}}
		></button>
		<div
			class="popover te-file-menu"
			role="menu"
			aria-label={fileMenuEntry.name}
			tabindex="-1"
			bind:this={fileMenuEl}
			style:left="{fileMenuAt.x}px"
			style:top="{fileMenuAt.y}px"
			onkeydown={(e) => {
				// Escape is spoken for further up — it is how the panel itself closes — so this one
				// is STOPPED here. Otherwise one press took the menu down and the whole app with it.
				if (e.key === 'Escape') {
					e.stopPropagation();
					closeFileMenu(true);
				}
			}}
		>
			<p class="popover-title">{fileMenuEntry.name}</p>
			{@render docVerbs()}
			<!-- RENAME and DELETE are the two that need the file system, so they are gated where the
			     menu itself used to be: it refused to open at all without a writable handle, which
			     also took Copy and Save a copy away from every browser that cannot write. The menu
			     opens everywhere now and these two simply are not in it. -->
			<!-- RENAME AND DELETE are the store's question, per tree — `folderWritable` was right while
			     the only tree was the folder's. A drive is writable in every engine, including the two
			     that can never reach a folder on the machine. -->
			{#if storeOf(fileMenuList)?.writable}
				<button
					type="button"
					role="menuitem"
					class="popover-item"
					onclick={() => {
						const path = fileMenuEntry.path;
						closeFileMenu();
						editor.renaming = path;
					}}>Rename</button
				>
				<button
					type="button"
					role="menuitem"
					class="popover-item te-file-del"
					class:on={editor.doomed === fileMenuEntry.path}
					onclick={() => {
						const armed = editor.doomed === fileMenuEntry.path;
						remove(fileMenuEntry, fileMenuList);
						// The first press only arms it, and the menu stays up holding the question. The
						// second one has done the deleting by the time this runs, so the menu goes.
						if (armed) closeFileMenu(true);
					}}>{editor.doomed === fileMenuEntry.path ? 'Sure?' : 'Delete'}</button
				>
			{/if}
		</div>
	{/if}

	<!-- THE WORKSPACE MENU — New, Change and Hide, which stood as three keys on the pane's own
	     head. They were three controls sharing a 250px row with the folder's name, and the name
	     lost: any name past a few characters ellipsised behind them. They are behind the bar key
	     that already means the workspace, which is where somebody looking for them will press.
	     Drawn HERE for the reason every other popover in this app is: the key that opens it lives
	     in a bar that scrolls, and a popover parented into a scroller is clipped by it. -->

	<!-- THE SETTINGS FLYOUT — About, Install, Apps and the version, behind the one gear key that
	     stands in the bar's corner on a desk and at the foot of the floating stack on a phone.
	     Drawn HERE, once, for the reason the heading menu is: two keys open it and neither of
	     them can own it. It portals itself out to <body>. -->
	<TextEditorSettings {onApps} onConnected={connected} onForget={forgetDrive} />

	<!-- The two pickers. Hidden rather than styled: a file input cannot be made to look like
	     anything in this manual, and the keys that stand in for it already do. -->
	<input
		class="te-picker"
		type="file"
		bind:this={fileInput}
		accept=".md,.markdown,.mdown,.mkd,.txt,.text,text/markdown,text/plain"
		aria-hidden="true"
		tabindex="-1"
		onchange={(e) => {
			const f = e.currentTarget.files?.[0];
			// Onto the SHELF, not just onto the sheet: a file picked by hand is not in the folder,
			// so the tree cannot show it and something has to.
			if (f) openLooseFile(f);
			e.currentTarget.value = '';
		}}
	/>
	<!-- `webkitdirectory` is a prefixed de-facto standard rather than a specified one. Every
	     current browser implements it; what the picker LOOKS like, and how willingly it offers a
	     directory, is the platform's own business. Svelte does not know the attribute, hence the
	     spread. -->
	<input
		class="te-picker"
		type="file"
		bind:this={folderInput}
		aria-hidden="true"
		tabindex="-1"
		{...{ webkitdirectory: true, directory: true }}
		onchange={tookFolder}
	/>

	{#if editor.narrow}
		<!-- THE PHONE'S CONTROLS, in the shared floating key ($lib/FloatingKey — the shape the
		     Emoji Viewer started, the docs shell, the Park Ranger, the board and the Star Map all
		     wear). Seventeen keys will not sit in a 390px bar without becoming a strip you swipe
		     to reach anything, and the top of a phone is the worst place to put a control anyway:
		     furthest from the thumbs, with the keyboard at the opposite end. The bar keeps the
		     VIEW keys; everything else is here, one reach from where the hand already is.
		     Two shapes, because the keys are two kinds. The MARKS go in the card as a grid — ten
		     of them would make a 400px column of discs — and they leave the flyout STANDING, so a
		     run of marks costs one open rather than one each. The document keys are the disc
		     stack, and they FOLD it behind them, because each finishes the job. Clear is the
		     exception that proves it: it asks first, and folding on the asking press would hide
		     its own question. -->
		<FloatingKey
			bind:open={keyOpen}
			icon={NIB_SVG}
			label="Editor controls"
			buttons={docKeys}
			card={shown === 'proof' || kind === 'code' ? undefined : markCard}
		/>
	{/if}

	<!-- THE RUNNING FOOT — the tally, set in the pixel face, the way a manual foots a page. The
	     lamp at the end says whether what is on screen has reached storage yet.
	     A DESK AFFORDANCE ONLY. A phone has one pane, a software keyboard over the bottom third
	     of it, and the flyout key already standing in that corner; a fixed strip of counts under
	     all of that spends the scarcest rows on the screen on four numbers nobody came for. It is
	     not rendered rather than hidden, so the sheet gets the rows back and the tally stops being
	     computed for a foot that is not there.
	     The two never share a screen now — the foot is wide-only and the flyout is narrow-only —
	     which is what let the key's measured lift above the foot go with it. -->
	{#if !editor.narrow}
		<div class="te-foot">
			<dl class="te-tally">
				<div class="te-count">
					<dt>Lines</dt>
					<dd>{pad(count.lines)}</dd>
				</div>
				<!-- WORDS AND READING TIME ARE PROSE'S. "How long will this take somebody to read"
				     is a question about a document, and it has no answer for a stylesheet — words
				     counts identifiers and punctuation runs, and a reading time computed from them
				     is a number that is precise and means nothing. Lines and characters are true
				     of any text file, so those two stay for both kinds. -->
				{#if kind !== 'code'}
					<div class="te-count">
						<dt>Words</dt>
						<dd>{pad(count.words)}</dd>
					</div>
				{/if}
				<div class="te-count">
					<dt>Chars</dt>
					<dd>{pad(count.chars)}</dd>
				</div>
				{#if kind !== 'code'}
					<div class="te-count">
						<dt>Read</dt>
						<!-- `min` is a LABEL, not part of the figure, and it used to be inside the <dd>'s
					     string — so the one word in this row that is not a number was set in the
					     number face. The foot's whole recipe is sans labels and bitmap figures; this
					     was the one place it was not kept, and it was invisible because `min` next to
					     `0001` looks like it belongs to it. Its own span, in the label's voice.
					     THE SPACE IS A REAL CHARACTER, INSIDE THE SPAN, and that is the second thing
					     this cost. It was a `margin-left` first, which looks identical and is not:
					     `textContent` came out `0001min`, so the running foot read as one word to
					     anything not looking at pixels — a screen reader, a copy-paste, and the
					     suite, which caught it. A GAP IS NOT A SPACE; $lib/VersionCard's legend
					     records the same lesson from the same mistake.
					     NON-BREAKING, because a figure and its unit are one thing and the foot wraps
					     on a narrow window. `\s` matches U+00A0, so the assertion's whitespace
					     normalisation still reads it as an ordinary space. Inside the span, so the
					     space itself is set in the label's face at the label's size rather than in
					     the bitmap figure's. -->
						<dd>
							{#if count.minutes}{pad(count.minutes)}<span class="te-unit">&nbsp;min</span
								>{:else}—{/if}
						</dd>
					</div>
				{/if}
			</dl>
			<!-- The lamp speaks only while a write is pending, and is silent the rest of the time.
		     It used to sign off with "Set in type", which read as a wordmark rather than as
		     status — a phrase the foot wore permanently, saying the same thing whatever the app
		     was doing, which is the opposite of what a status line is for.
		     There was a third state under it, "Held in this browser", and it went with the same
		     cut: the save effect runs on mount, so that line was only ever on screen for the
		     400ms before the first write landed. A message nobody can finish reading is a flash,
		     not a message. -->
			<p class="te-lamp" class:te-lamp-dirty={dirty} role="status">
				{#if dirty}Setting…{:else if editor.filename}{editor.filename}{/if}
			</p>
		</div>
	{/if}
</div>

<style>
	/* ── The desk ──────────────────────────────────────────────────────────────
	   Full height of whatever the stage gives it, in three bands: the rack, the desk, the foot —
	   two of them on a phone, where the foot does not run. Only the middle band scrolls; the rack
	   and the foot are always to hand, which is the whole reason an editor takes the viewport
	   rather than sitting in a scrolling panel. */
	.te {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		/* The two --pixel-* tokens this file leans on, with an Aeropalite fallback each. Pixelite
		   is where every decision here was made, but the place is `dense` chrome and so renders
		   under both themes; a bare var() would have left the sheet unpainted under the other. */
		--te-key-face: var(--pixel-key-face, var(--aero-face, rgba(255, 255, 255, 0.5)));
		--te-rule: var(--pixel-hairline, var(--line-edge, rgba(0, 0, 0, 0.2)));
		/* The margin the marks hang in, and the one measure the sheet and the mirror share.
		   NOT ON THE `--space-*` SCALE, and it is the same exemption the superbar's height takes:
		   this is the WIDTH OF A COLUMN — the box a margin mark is drawn in — reserved as space by
		   the sheet beside it. It is sized by what it holds, and rounding it to suit a spacing
		   scale would be the tail wagging the dog. It also feeds the wrap invariant (the sheet and
		   the mirror both take their measure from it), so it is not a number to nudge for tidiness. */
		--te-margin: 2.6rem;
		--te-type-size: 15px;
		/* THE ROW IS AN INTEGER NUMBER OF PIXELS, and that is a correctness rule, not a taste one.
		   The obvious spelling is a unitless ratio — 15px at 1.7 — and it gives a 25.5px row. The
		   mirror then stacks fractional block heights while the textarea steps its own rows
		   internally, and the two round to device pixels independently. On a fractional row that
		   disagreement is re-rolled on every line, and it is worst exactly where it is hardest to
		   chase: Safari, at non-integer device pixel ratios, forty lines down.
		   26px is the nearest whole pixel to the leading this wants (≈1.73). Nothing can accumulate
		   between two integer stacks. The phone override below keeps the same rule. */
		--te-row: 26px;
		--te-pad: var(--space-24);
		/* The sheet's measure, in the mono face: ~82 columns once the gutter and the right pad
		   come out of it. The proof's is narrower because prose sets wider per pixel — 34rem of
		   IBM Plex is about 68 characters, which is the same reading comfort. */
		/* The band of gutter round and between the columns. A rung, like every other gap in this
		   app — it was 6.4px, which is the one spacing here that is SEEN as a field rather than as
		   air, since it is what makes four panes read as four objects laid on a desk. */
		--te-gutter: var(--space-8);
		/* THE RAILS' STOCK — the workspace on one side, the contents on the other. They used to be
		   cut from the same --surface as the sheet and the proof, and four panes in one white made
		   the desk read as one wide sheet with rules drawn on it: the thing you are WRITING stood
		   level with the two lists that only say where it is. So the rails step BACK — the desk's
		   own colour, carried a little further from the sheet, so they read as laid under it
		   rather than beside it. The sheet is the only white left, which is the point.
		   Off --page and --ink rather than a pair of hex values, so it follows the scheme and the
		   theme: light, the desk is #fbfbfb under a #ffffff sheet and this lands near #f6f6f6;
		   dark, the desk is #0e0e10 under a #202023 sheet and it lands near #1b1b1c — a step back
		   toward the gutter in both, which is what "behind" means either way round. Nudged past
		   the desk rather than stopped at it because the panes are objects ON the desk (see the
		   4px corner below); at exactly --page the rails dissolve into the gutter and that corner
		   has nothing left to round.
		   TWO ARMS, and it needs them: the mix runs toward --ink, and --ink FLIPS with the scheme.
		   More ink is darker on white stock and LIGHTER on dark stock, so a single percentage
		   moves the two schemes in opposite directions — asked to lighten both, one knob can only
		   lighten one. The arms are what let "a smidge lighter" mean the same thing in each: less
		   ink in light, more of it in dark. Keep them in step by EFFECT (how far the rail sits off
		   the sheet), never by matching the numbers, which are not comparable. */
		--te-rail: light-dark(
			color-mix(in srgb, var(--page) 98%, var(--ink)),
			color-mix(in srgb, var(--page) 94.5%, var(--ink))
		);
		--te-measure: 52rem;
		--te-proof-measure: 34rem;
	}

	/* ── The desk ──────────────────────────────────────────────────────────────
	   One row of panes on a wide window, one pane on a narrow one. min-height:0 on both the row
	   and the panes is what lets the scrollers inside actually scroll instead of growing the
	   whole column — the flexbox trap this layout would otherwise fall into. */
	/* THE DESK IS THE GUTTER, and the panes are sheets laid on it. Each pane used to be parted
	   from the next by a hairline — a line drawn between two things that are the same white,
	   which is the least the manual's own language can do. Densette's page has always been paper
	   on a grey field; borrowing that here means the SPACE does the parting, and the panes read
	   as separate sheets rather than as one surface someone has ruled. */
	.te-desk {
		flex: 1 1 auto;
		display: flex;
		min-height: 0;
		/* Real space, not a hairline in disguise — but a thin band of it. A 1px gap is just the
		   border again under another name, and a wide one turns two panes into two documents.
		   The same measure goes round the OUTSIDE as between: each column is framed by the gutter
		   on all four sides rather than sitting flush to the panel at the top and bottom and
		   apart only in the middle, which read as two different ideas about the same space. One
		   token, so they cannot drift. */
		gap: var(--te-gutter);
		padding: var(--te-gutter);
		background: var(--page);
	}
	/* The columns take the keys' own corner — 4px, the manual's plastic radius. Square sheets on a
	   grey field read as a table with the rules rubbed out; the same soft corner every control in
	   the bar wears makes them objects laid on it. `overflow: hidden` so the scrollers inside
	   cannot paint into the corners they are supposed to be rounding. */
	.te-pane {
		border-radius: 4px;
		overflow: hidden;
		flex: 1 1 50%;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}
	/* (The hairline between panes is gone — see .te-desk. The gutter behind them is the parting.) */
	.te-write .te-sheet,
	.te-proof-only .te-proof-pane {
		flex-basis: 100%;
	}

	/* THE DESK ARRIVES SHEETS FIRST, RAILS BEHIND THEM. The bar rides in on `btn-in` (see the
	   entrance block in $lib/TextEditorRack) and the desk under it used to be simply there, so the
	   app assembled from the top down and then stopped halfway.
	   The order is the point, and it is the reading order rather than the layout order: the SHEET is
	   what you came for, and the workspace and the contents rail are both about the sheet — one
	   says where the document is, the other what is in it. Landing them first would put the
	   apparatus on screen ahead of the thing it is apparatus for.
	   `rise` is puhig's own (base.css), the vertical counterpart to the bar's `btn-in`: the two axes
	   read as two groups arriving rather than one wall, which is the same argument the panel's
	   chrome and its content column already settle this way. Both rails share ONE delay — they are
	   a pair framing the writing, and stepping them left-to-right would make a frame arrive
	   crookedly. */
	@media (prefers-reduced-motion: no-preference) {
		.te-sheet,
		.te-proof-pane {
			animation: rise 0.5s var(--spring) backwards;
			animation-delay: var(--enter-lead);
		}
		.te-work,
		.te-toc {
			animation: rise 0.5s var(--spring) backwards;
			animation-delay: calc(var(--enter-lead) + 0.12s);
		}
	}

	/* ── The sheet ─────────────────────────────────────────────────────────────
	   The scroller. Paper white under Pixelite (--surface is the white sheet), with the margin's
	   rule drawn as a background line rather than a border, so it runs the full scroll height
	   instead of stopping at the viewport. */
	/* ── The code pane ────────────────────────────────────────────────────────
	   CodeMirror brings its own scroller, its own gutter and its own line layout, so this is a
	   frame and nothing else. Everything about how it LOOKS is set in $lib/code-sheet through
	   CodeMirror's own theme API, reading the same custom properties this file does — which is
	   the only way to dress it, since its DOM is built at runtime and carries no Svelte scope
	   class for a scoped rule to reach. */
	.te-code-pane {
		position: relative;
		overflow: hidden;
	}
	.te-code {
		height: 100%;
	}
	/* The waiting line, centred over the empty frame. It is only ever seen once per session and
	   only on a cold cache, so it is deliberately plain — a spinner would be a moving thing on a
	   desk whose one moving thing is reserved for the drive (see TOPAZ in the theme). */
	.te-code-coming {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.78rem;
		color: var(--sub);
		pointer-events: none;
	}
	.te-paper {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		background: var(--surface);
	}
	/* THE COLUMN. Everything that has to move together when the measure changes lives on this one
	   box: the text, the mirror that rules it, the caret and the selection (both positioned
	   against it), and the margin rule.
	   The rule is drawn HERE rather than on the paper, and that is what the measure needed. As a
	   background on the scroller it was pinned to the scroller's left edge, so holding the text to
	   a measure and centring it would have left the rule stranded at the far left, ruling nothing.
	   On the stack it is the column's own margin, wherever the column sits. */
	.te-stack {
		position: relative;
		min-height: 100%;
		margin-inline: auto;
		background-image: linear-gradient(
			to right,
			transparent calc(var(--te-pad) + var(--te-margin) - 0.75rem),
			color-mix(in srgb, var(--orange) 35%, transparent)
				calc(var(--te-pad) + var(--te-margin) - 0.75rem),
			color-mix(in srgb, var(--orange) 35%, transparent)
				calc(var(--te-pad) + var(--te-margin) - 0.75rem + 1px),
			transparent calc(var(--te-pad) + var(--te-margin) - 0.75rem + 1px)
		);
	}
	/* ── The measure ───────────────────────────────────────────────────────────
	   Held, the sheet's column caps at --te-measure and the proof's at its own, narrower one:
	   the sheet is monospace and the proof is prose, and the same pixel width is a different
	   number of characters in each. ~82 columns of the mono face, ~68 of the body face.
	   The cap goes on .te-stack, NOT on the textarea or the mirror separately — they take their
	   width from it, so they cannot end up with different measures, which is the one way this
	   could break the wrap they have to agree on. */
	.te-measured .te-stack {
		max-width: var(--te-measure);
	}
	.te-measured .te-proof > :global(*) {
		max-width: var(--te-proof-measure);
		margin-inline: auto;
	}

	/* ── The scrollbar ─────────────────────────────────────────────────────────
	   The columns sit below the bar now, so the track needs no margin to dodge it — it simply
	   runs the height of its own column. (It carried one while the scrollers ran under the bar.)
	   Styling any ::-webkit-scrollbar part opts out of the platform's overlay bars, so the whole
	   set has to be stated — a slim transparent gutter, the thumb an ink wash on the key radius.
	   LITERALS in the thumb's colours: custom properties and color-mix() do not resolve inside
	   these pseudos, and a declaration that does not resolve paints NOTHING rather than falling
	   back, so the dark arm is keyed to the .scheme-dark root class the way pixelite.css is. */
	.te-paper::-webkit-scrollbar,
	.te-proof::-webkit-scrollbar {
		width: 10px;
	}
	.te-paper::-webkit-scrollbar-track,
	.te-proof::-webkit-scrollbar-track {
		background: transparent;
	}
	.te-paper::-webkit-scrollbar-thumb,
	.te-proof::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.28);
		border-radius: 4px;
		border: 2px solid transparent;
		background-clip: padding-box;
	}
	.te-paper::-webkit-scrollbar-thumb:hover,
	.te-proof::-webkit-scrollbar-thumb:hover {
		background: rgba(0, 0, 0, 0.45);
		border: 2px solid transparent;
		background-clip: padding-box;
	}
	:global(html.scheme-dark) .te-paper::-webkit-scrollbar-thumb,
	:global(html.scheme-dark) .te-proof::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.3);
	}
	:global(html.scheme-dark) .te-paper::-webkit-scrollbar-thumb:hover,
	:global(html.scheme-dark) .te-proof::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.5);
	}
	/* Firefox ONLY (it has no ::-webkit-scrollbar): scrollbar-color keeps the thumb on-palette.
	   It must NOT reach Chrome — a non-auto scrollbar-color DISABLES every ::-webkit-scrollbar
	   rule above, the track margin included, which is the whole trick. Firefox has no track
	   margins either, so its full-height thumb simply shows through the bar's frost, dimmed. */
	@supports not selector(::-webkit-scrollbar) {
		.te-paper,
		.te-proof {
			scrollbar-color: color-mix(in srgb, var(--ink) 30%, transparent) transparent;
		}
	}

	/* ══ THE ONE TYPOGRAPHY BLOCK ══════════════════════════════════════════════
	   Both the textarea and the mirror, together, because they MUST agree to the pixel. The
	   mirror's job is to wrap exactly as the textarea wraps; every property here is one the
	   browser consults when deciding where to break a line. Change any of it and you change it
	   for both, here, or the margin marks slide out of true — a few pixels a line, invisible at
	   the top of the sheet and plainly wrong forty lines down. */
	.te-type,
	.te-mirror {
		box-sizing: border-box;
		width: 100%;
		margin: 0;
		padding: var(--te-pad) var(--te-pad) 40vh calc(var(--te-pad) + var(--te-margin));
		border: 0;
		font-family: var(--font-mono, ui-monospace, 'SF Mono', Consolas, monospace);
		font-size: var(--te-type-size);
		line-height: var(--te-row);
		letter-spacing: 0;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		word-break: normal;
		tab-size: 2;
		text-align: left;
		text-transform: none;
	}
	/* The bottom padding above is 40vh on purpose — TYPEWRITER SCROLLING. Without it the last
	   line of a document sits welded to the bottom edge of the window, which is the least
	   comfortable place on the screen to be typing. The room lets the caret ride nearer the
	   middle at the end of a long document, the way it does everywhere else in it. */

	.te-type {
		position: absolute;
		inset: 0;
		height: 100%;
		display: block;
		resize: none;
		background: transparent;
		color: var(--ink);
		/* No scroller of its own: the textarea is exactly as tall as the mirror it lies on, and
		   .te-paper is what scrolls. A second scroller here would fight the first. */
		overflow: hidden;
		caret-color: var(--orange);
	}
	/* The native caret goes only where ours replaces it: a FINE pointer. On touch the platform
	   draws selection handles and a magnifier against the native caret, and taking the bar away
	   while leaving its furniture behind would be a worse trade than the oversized bar. Gated on
	   the same query the component reads for `finePointer`, so the CSS and the script cannot
	   disagree about which caret is on screen. */
	@media (pointer: fine) {
		.te-type {
			caret-color: transparent;
		}
		/* The native selection band goes with the native caret, and for the same reason: it is the
		   FONT's box rather than the line's — 22px in WebKit, 23px in Firefox, against a 26px row —
		   so it sits two pixels inside the row and stops short of the bottom. One line looks tight;
		   several in a row look STRIPED, each band separated from the next by a gap it cannot
		   fill. Transparent, not `none`: the selection must still BE a selection to the browser,
		   for copy, for drag, and for the accessibility tree. Only its paint is ours. */
		.te-type::selection {
			background: transparent;
		}
	}
	/* Our band. Exactly one row tall and snapped to the row grid, so consecutive rows tile with no
	   seam — which is the whole point of replacing the native one. */
	.te-sel {
		position: absolute;
		height: var(--te-row);
		background: color-mix(in srgb, var(--orange) 20%, transparent);
		pointer-events: none;
	}
	/* OUR caret. Sized to the TEXT rather than to the face's full ascent-and-descent, which is
	   the whole point: the browser's is 22px for an 11px cap band, and this is 1.05em — tall
	   enough to clear the capitals and drop past the baseline, short enough to read as a mark in
	   the line rather than a rule between the lines. Centred in the row, which is also centred on
	   the text (both work out at 13px in a 26px row).
	   Positioned in .te-stack, so it scrolls with the sheet for free and needs no scroll handler. */
	.te-caret {
		position: absolute;
		width: 2px;
		height: calc(var(--te-type-size) * 1.05);
		margin-top: calc((var(--te-row) - var(--te-type-size) * 1.05) / 2);
		background: var(--orange);
		border-radius: 1px;
		pointer-events: none;
		animation: te-blink 1.06s steps(1, end) infinite;
	}
	@keyframes te-blink {
		0%,
		50% {
			opacity: 1;
		}
		50.01%,
		100% {
			opacity: 0;
		}
	}
	/* A blinking caret is motion, and some people ask for none. It stays solid instead of
	   disappearing — an unblinking caret is still a caret; an absent one is a bug. */
	@media (prefers-reduced-motion: reduce) {
		.te-caret {
			animation: none;
		}
	}
	.te-type:focus,
	.te-type:focus-visible {
		/* The sheet's focus is the caret and the lit margin line — a ring round a full-height
		   pane says nothing a blinking caret has not already said. */
		outline: none;
	}
	.te-type::placeholder {
		color: var(--sub);
	}

	.te-mirror {
		position: relative;
		min-height: 100%;
		/* The ruler, not the text. Its glyphs are invisible; only the marks and the lit line it
		   carries are painted. pointer-events off so every click lands on the textarea above. */
		color: transparent;
		pointer-events: none;
		user-select: none;
	}
	/* One block per SOURCE line. Because it is a block, its box top is the y of that line's first
	   visual row however many rows it wrapped to — which is the whole trick. */
	.te-mline {
		position: relative;
		min-height: var(--te-row);
	}
	/* The mark hangs in the margin, ABSOLUTELY — in the flow it would join the first row's text
	   and change the very wrapping it exists to measure.

	   IT CENTRES ON THE WHOLE LOGICAL LINE, not on that line's first row. `top: 0; bottom: 0`
	   stretches the mark's box over the full height of its .te-mline, however many visual rows the
	   line wrapped to, and the flex centring puts the glyph in the middle of that block. So a
	   paragraph that wraps to five rows carries its mark against the middle of the paragraph, which
	   is where a copy-editor would pencil it — the annotation belongs to the whole line, and
	   pinning it to the first row made it look like it belonged only to the first row.

	   It also fixes the drift the first-row version had. Two different typefaces at two different
	   sizes do not share a baseline unless they sit in the same line box, and these never can: the
	   mark is out of flow precisely so it cannot join the text's line box and disturb the wrap it
	   measures. Aligning the two BOXES instead of their baselines is what makes the placement
	   independent of either face's metrics — and a box centred on the whole line has no baseline to
	   drift from in the first place.

	   `line-height: 1` matters here: left at the inherited 1.7, the glyph's own line box would be
	   taller than the row it sits in and the half-leading would push the ink below the centre the
	   flex box just worked out. */
	.te-margin-mark {
		position: absolute;
		top: 0;
		bottom: 0;
		left: calc(-1 * var(--te-margin));
		width: calc(var(--te-margin) - 0.9rem);
		font-family: var(--font-pixel, var(--font-mono, monospace));
		/* The pixel face runs small — the theme's own note says to bump it 15–20% over a mono
		   equivalent to match optical size. */
		font-size: calc(var(--te-type-size) * 1.15);
		line-height: 1;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		color: color-mix(in srgb, var(--orange) 70%, transparent);
		white-space: nowrap;
	}
	/* The line the caret is on, washed across the full width of the sheet. Drawn on a ::before so
	   it sits under the transparent mirror text AND under the textarea (which has no background
	   of its own), rather than over either. */
	.te-here::before {
		content: '';
		position: absolute;
		inset: 0;
		left: calc(-1 * (var(--te-pad) + var(--te-margin)));
		right: calc(-1 * var(--te-pad));
		background: color-mix(in srgb, var(--orange) 5%, transparent);
	}
	.te-here .te-margin-mark {
		color: var(--orange);
	}

	/* ── The proof ─────────────────────────────────────────────────────────────
	   A page of the manual. Every selector is :global() because the markup comes from
	   $lib/markdown by way of {@html}, and Svelte only scopes what it can see in this file.
	   The counters are what make it read as a manual rather than as a preview: sections number
	   themselves and code blocks are numbered listings, both set in the pixel face, both
	   entirely CSS — the engine emits plain <h2> and <pre> and knows nothing about either. */
	.te-proof-pane {
		background: var(--surface);
	}
	.te-proof {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		/* Declared TWICE, and the second is the one that counts where `round()` exists: the reading
		   measure's side inset steps in whole 4px increments instead of sliding through fractional
		   pixels as the pane is resized. An engine without `round()` drops the second declaration and
		   keeps a working clamp — the same arrangement the docs shell uses. (40vh is the runway under
		   the last line so a heading can reach the top of the pane; a viewport fraction, not a rung.) */
		padding: var(--te-pad) clamp(var(--space-20), 3vw, var(--space-40)) 40vh;
		padding: var(--te-pad) clamp(var(--space-20), round(3vw, var(--space-4)), var(--space-40)) 40vh;
		counter-reset: te-sec te-listing;
		color: var(--ink);
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 1rem;
		line-height: 1.65;
	}
	/* (The proof's reading measure is not unconditional any more — see .te-measured above. Off,
	   the proof runs the full width of its pane, which is what a wide table wants.) */
	.te-blank {
		color: var(--sub);
		font-style: italic;
	}

	/* A first-level heading OPENS A CHAPTER, so the section count starts again under it. Without
	   this the numbers ran 01, 02, 03… straight down the sheet however many chapters they
	   crossed, which is a running count of h2s rather than a numbering of sections.
	   `counter-SET`, not `counter-reset`, and the difference is the whole fix. `counter-reset` on
	   a sibling creates a NEW nested instance, and when the parent has already reset the same
	   counter the two do not compose the way you would expect: tested four ways side by side, a
	   parent reset plus a sibling reset numbers 1, 2, 3, 4 straight through, while the same
	   markup with `counter-set` on the heading gives 1, 2 / 1, 2. `counter-set` assigns the
	   counter already in scope rather than minting another, which is what "start this chapter's
	   sections at zero" actually means. */
	.te-proof :global(h1) {
		counter-set: te-sec 0 te-listing 0;
		margin: 0 0 var(--space-20);
		padding-bottom: var(--space-8);
		border-bottom: 1px solid var(--te-rule);
		font-family: var(--font-motto, Georgia, serif);
		font-size: clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem);
		font-weight: 400;
		line-height: 1.15;
	}
	.te-proof :global(h2) {
		margin: var(--space-36) 0 var(--space-12);
		font-family: var(--font-motto, Georgia, serif);
		font-size: 1.35rem;
		font-weight: 400;
		line-height: 1.25;
		counter-increment: te-sec;
	}
	/* A LISTING is numbered inside the heading it sits under, not down the whole document. The
	   count ran straight through before, so the third code block on a sheet was "Listing 03"
	   however many sections back the first one was — a running total of fences rather than a
	   caption you could use to point at one ("the second listing in this section").
	   Every level resets it, not just the chapter: a heading of any depth starts a new run of
	   prose, and the number means "the nth listing in this run".
	   `counter-SET` again, for the reason spelled out on the h1 above — a `counter-reset` here
	   would mint a NEW counter scoped to the heading, which the <pre> SIBLINGS are not inside,
	   so they would go on reading the outer one and nothing would change. */
	.te-proof :global(h2),
	.te-proof :global(h3),
	.te-proof :global(h4),
	.te-proof :global(h5),
	.te-proof :global(h6) {
		counter-set: te-listing 0;
	}
	/* The section numeral. Inline rather than hanging in a margin: the proof pane is half a
	   window wide in SPLIT and a hanging numeral would be the first thing off the edge. */
	/* The fallback is spelled THROUGH --font-mono, and it has to be. --font-pixel is declared by
	   Pixelite alone — Aeropalite and metro never set it — so this fallback is live rather than
	   theoretical, and written as a bare `monospace` it fell to whatever generic mono the browser
	   keeps while every other numeral in the app (the tallies, the contents rail, the margin
	   marks, the word count) fell to Space Mono. Two numerals a rail apart in two different faces,
	   in the one look where nobody would think to check. */
	.te-proof :global(h2::before) {
		content: counter(te-sec, decimal-leading-zero);
		margin-right: var(--space-8);
		font-family: var(--font-pixel, var(--font-mono, monospace));
		font-size: 1.15em;
		color: var(--orange);
	}
	/* EVERY HEADING IS THE SERIF, ALL SIX OF THEM. The lower four used to drop out of Iowan into
	   the manual's running-head voice — mono, uppercase, tracked — on the argument that two serif
	   sizes that close together read as an accident where a change of voice does not. The
	   argument was sound about the SIZES and wrong about the fix: it bought the separation by
	   spending a whole second face on it, and the result was a document whose outline was written
	   in two alphabets, so a reader scanning for structure had to recognise two things rather than
	   one. A heading is a heading at every depth.
	   The separation is bought with SIZE AND WEIGHT instead, which is what a type ladder is for.
	   The steps are deliberately uneven: 2.2 → 1.35 is a chapter opening a section, and the drop
	   is large because those two are different KINDS of thing; 1.35 → 1.05 → 0.95 → 0.9 is one
	   kind of thing getting quieter. Weight goes UP as size comes down (400 at the top, 600 below
	   it) — past h3 a heading is smaller than the 1rem prose it introduces, and something has to
	   say "heading" once size has stopped being able to. H6 adds italic because 0.9/600 twice
	   over is not a step, and at the sixth level there is no size left to spend.
	   Full ink, where these were muted to 65%. The mute was propping up a face that had already
	   left the prose behind; in the same serif as h1 it only made the deepest headings look like
	   an aside. */
	.te-proof :global(h3),
	.te-proof :global(h4),
	.te-proof :global(h5),
	.te-proof :global(h6) {
		margin: var(--space-24) 0 var(--space-8);
		font-family: var(--font-motto, Georgia, serif);
		font-weight: 600;
		line-height: 1.3;
		color: var(--ink);
	}
	.te-proof :global(h3) {
		font-size: 1.05rem;
	}
	.te-proof :global(h4) {
		font-size: 0.95rem;
	}
	.te-proof :global(h5),
	.te-proof :global(h6) {
		font-size: 0.9rem;
	}
	.te-proof :global(h6) {
		font-style: italic;
	}
	.te-proof :global(p) {
		margin: 0 0 var(--space-16);
	}
	.te-proof :global(a) {
		color: var(--orange);
		text-decoration: underline;
		text-underline-offset: 2px;
		text-decoration-thickness: 1px;
	}
	.te-proof :global(strong) {
		font-weight: 700;
	}
	.te-proof :global(del) {
		color: var(--sub);
	}
	/* An inline code span wears the keyed face — the same plastic the controls are cut from, at
	   text size. It is the one place the chrome's material shows up inside the prose, and it is
	   right there: a code span names a thing you type on a key. */
	.te-proof :global(code) {
		padding: 0.1em 0.35em;
		font-family: var(--font-mono, monospace);
		font-size: 0.88em;
		background: var(--te-key-face);
		border: 1px solid var(--te-rule);
		border-radius: 3px;
	}
	/* A fenced block is a BLOCK, and is numbered as one — inside the heading it sits under, see
	   the counter note above. The tag rides the top-right corner in the pixel face, off the page
	   field rather than the slab, so it reads as a caption on the block rather than as its first
	   line. */
	/* The eyebrow rides the top-right corner, so the block has to keep a whole line clear under
	   it — at 1.1rem the first line of code sat under the tag rather than below it, and the two
	   read as one crowded row. */
	.te-proof :global(pre) {
		position: relative;
		margin: 0 0 var(--space-24);
		padding: var(--space-28) var(--space-16) var(--space-16);
		overflow-x: auto;
		background: var(--page);
		border: 1px solid var(--te-rule);
		border-radius: 2px;
		counter-increment: te-listing;
	}
	.te-proof :global(pre::before) {
		content: 'Block ' counter(te-listing, decimal-leading-zero);
		position: absolute;
		top: 0.15rem;
		right: 0.55rem;
		/* Through --font-mono for the reason spelled out on the section numeral above. */
		font-family: var(--font-pixel, var(--font-mono, monospace));
		font-size: 0.95rem;
		color: var(--sub);
	}
	/* Inside a listing the span drops its own face and border — it already has the slab's. */
	.te-proof :global(pre code) {
		display: block;
		padding: 0;
		font-size: 0.85rem;
		line-height: 1.6;
		white-space: pre;
		background: none;
		border: 0;
	}
	.te-proof :global(blockquote) {
		margin: 0 0 var(--space-20);
		padding: var(--space-4) 0 var(--space-4) var(--space-16);
		border-left: 2px solid var(--orange);
		font-family: var(--font-motto, Georgia, serif);
		font-size: 1.05rem;
		color: color-mix(in srgb, var(--ink) 80%, transparent);
	}
	.te-proof :global(blockquote p:last-child) {
		margin-bottom: 0;
	}
	.te-proof :global(ul),
	.te-proof :global(ol) {
		margin: 0 0 var(--space-16);
		padding-left: var(--space-24);
	}
	.te-proof :global(li) {
		margin-bottom: var(--space-4);
	}
	/* The marker is chrome, so it speaks the chrome's language — which is now the same sans the
	   prose is set in. The COLOUR is what marks it as the app's own mark rather than the author's
	   text, and the colour was always doing that work; the mono face was a second signal for one
	   fact, and it is the signal that made a bulleted list look like it had been set by a
	   different hand than the paragraph above it. */
	.te-proof :global(li::marker) {
		color: var(--orange);
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.85em;
	}
	/* A nested list is tighter than its parent: it is a sub-point, not a second document. */
	.te-proof :global(li > ul),
	.te-proof :global(li > ol) {
		margin: var(--space-4) 0 0;
	}
	.te-proof :global(hr) {
		height: 1px;
		margin: var(--space-32) 0;
		border: 0;
		/* The site's own fading rule, so a break in the proof is the break the docs pages draw. */
		background: var(--rule-fade, var(--te-rule));
	}
	.te-proof :global(table) {
		width: 100%;
		margin: 0 0 var(--space-20);
		border-collapse: collapse;
		font-size: 0.92rem;
	}
	/* A table head is the AUTHOR's content, not the app's chrome, so it takes the sheet's own sans
	   — and its own CASE. It wore tracked uppercase at 0.72rem for one release, on the argument
	   that nothing else would separate a header row from the first row of data once the face
	   matched the body. Three things do: the WEIGHT, the heavier rule under it (--card-edge
	   against the --te-rule the data rows keep), and the position. A header is the first row of a
	   table; it does not need to be shouted.
	   The size override went with the uppercase and did not survive on its own. 0.72rem was an
	   EYEBROW size, sized for caps; in initial case it left the head smaller than the 0.92rem
	   cells beneath it, which reads as a caption over a table rather than as part of one. It
	   inherits the table's size now — a bold row at the data's own measure, which is what a table
	   head is everywhere else. Full ink for the same reason the proof's deep headings took it. */
	.te-proof :global(th) {
		padding: var(--space-8) var(--space-12);
		border-bottom: 1px solid var(--card-edge, var(--te-rule));
		font-family: var(--font-body, system-ui, sans-serif);
		font-weight: 700;
		text-align: left;
		color: var(--ink);
	}
	.te-proof :global(td) {
		padding: var(--space-8) var(--space-12);
		border-bottom: 1px solid var(--te-rule);
		vertical-align: top;
	}
	.te-proof :global(img) {
		max-width: 100%;
		height: auto;
		border: 1px solid var(--te-rule);
		border-radius: 2px;
	}
	/* A wide table or a long listing scrolls INSIDE its own box. The proof pane itself must never
	   scroll sideways — a preview that slides out from under the sheet beside it is a bug. */
	.te-proof :global(table),
	.te-proof :global(pre) {
		max-width: 100%;
	}

	/* The pickers themselves are never seen — the keys stand in for them. Not `display: none`:
	   a hidden input is still clicked programmatically, and some engines decline to open a
	   picker for a box with no layout at all. */
	.te-picker {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	/* ── The workspace ─────────────────────────────────────────────────────────
	   A column of the desk, to the left of the panes: the folder is a place you are working IN,
	   so it sits beside the work rather than over it. Fixed width — a file list that grew and
	   shrank with the window would move the sheet every time you resized it. */
	/* THE PANE IS THE SCROLLER, and it has to be: there are four lists in here now and each one
	   scrolling inside its own box would mean four scrollbars, four thumbs, and a folder you could
	   not reach because the list it was in had already given its share of the height to a list you
	   were not looking at.
	   It was the TREE that scrolled, back when the tree was the only list with an unknown length
	   and a direct child of this box. Wrapping it in its own section — so the folder's head could
	   stand on it — left the `overflow-y: auto` on a list that no longer had a constrained height,
	   so nothing scrolled at all and `overflow: hidden` here quietly clipped the rest of the
	   workspace off the bottom of the pane. */
	.te-work {
		border-radius: 4px;
		overflow-y: auto;
		overscroll-behavior: contain;
		flex: none;
		width: 15rem;
		display: flex;
		flex-direction: column;
		min-height: 0;
		/* No rule down its edge either: it is a pane on the same gutter as the ones beside it —
		   but cut from the RAIL stock rather than the sheet's, so it stands behind the writing
		   instead of level with it. See --te-rail. */
		background: var(--te-rail);
	}
	/* THE HEAD IS ONE ROW: the name, its tally, then New / Change / Hide at the right. The keys
	   act on the PANE rather than on the list, so they belong at the end of the head where a
	   panel keeps its own controls.
	   `align-items: center`, not baseline: three plastic keys and a word have no baseline worth
	   sharing, and on a baseline the keys hung a pixel low against the name.
	   `position: relative` is the anchor for the name's reveal below. */
	/* The head is a ROW, on the same 30px as everything else in this pane and as the contents
	   rail's head on the other side of the desk. The keys inside it are 22px, so the inset is
	   what is left over rather than a round number picked on its own — a head that stood taller
	   than its list started the desk on two different grids.
	   The side insets are the LIST'S: the tally at the end has to land on the same right edge as
	   every folder tally under it, and the name has to start where the top-level rows start. */
	.te-work-head {
		position: relative;
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--space-8);
		min-height: 30px;
		padding: var(--space-4) var(--space-12);
	}
	/* The name takes what the keys leave, and no less than nothing: `min-width: 0` is what makes
	   a flex child agree to be narrower than its own text, and without it the name would push the
	   keys off the pane instead of ellipsising. */
	.te-work-name {
		margin: 0;
		flex: 1 1 auto;
		min-width: 0;
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* THE REVEAL. The shared popover surface — the recipe leaves placement to whoever opens one,
	   and this one is placed by its own head rather than measured into the viewport: it belongs
	   to a fixed column, it never needs to be wider than that column, and an absolute box inside
	   the pane cannot be clipped by it.
	   It hangs below the row, which is the whole reason it works: over the name it would land
	   under the pointer, take the hover it was opened by, and flicker. `pointer-events: none`
	   in case the pointer arrives from below anyway. */
	.te-work-full {
		position: absolute;
		z-index: 6;
		top: calc(100% - 0.25rem);
		left: 0.75rem;
		right: 0.75rem;
		padding: var(--space-4) var(--space-8);
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--ink);
		/* Wrapped, and broken mid-word if it has to be: a folder name can be one long token with
		   no space in it, and the point of this box is that the WHOLE name is readable. */
		white-space: normal;
		overflow-wrap: anywhere;
		line-height: 1.35;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.1s ease;
	}
	/* Opened by the NAME under the pointer — pointing at Hide should not explain the folder — and
	   by keyboard FOCUS anywhere in the head, which is the only way somebody who is not using a
	   pointer can ask. The heading itself is not focusable and must not be made so: a tabbable
	   <h2> is a stop on the tab order that does nothing, and the full name is in the DOM and in
	   the pane's own aria-label already, so a screen reader was never the one being clipped.
	   `:has(:focus-visible)` rather than `:focus-within`, and the difference is visible: a MOUSE
	   click on Change focuses it, and with :focus-within the reveal opened on the click and sat
	   there until focus moved on — an explanation nobody asked for, over the list. */
	.te-work-name:hover ~ .te-work-full,
	.te-work-head:has(:focus-visible) .te-work-full {
		opacity: 1;
	}
	.te-work-count {
		flex: none;
		font-family: var(--font-pixel, var(--font-mono, monospace));
		font-size: 0.9rem;
		line-height: 1;
		color: var(--sub);
	}
	.te-work-act {
		flex: none;
		height: 22px;
		padding: 0 var(--space-8);
		font: inherit;
		font-size: 0.62rem;
		line-height: 1;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border: 1px solid var(--line-edge, rgba(0, 0, 0, 0.2));
		border-radius: 3px;
		cursor: pointer;
	}
	/* A list takes exactly the height of its rows and scrolls not at all — the PANE above it is
	   what scrolls. See the note on `.te-work`. */
	.te-work-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* ── The shelf ─────────────────────────────────────────────────────────────
	   What was opened from outside the folder. A SHADE off the sheet and ruled off underneath —
	   that shading is the whole of how it says it is a different kind of list, and it has to be
	   slight: these are still documents in the same pane, not a warning.
	   Mixed off --ink rather than given a colour, so it darkens on dark stock instead of turning
	   into a grey patch on a near-black sheet.
	   It never scrolls and never takes more than its rows: `flex: none`, so a long tree below
	   keeps every pixel the shelf is not using. It is capped at six, so it cannot run away. */
	/* NO RULE anywhere in here. The shading is the boundary — a shaded block with a line under it
	   is the same edge drawn twice, and this pane is a sheet of the manual rather than a table.
	   The block holds both shelves so the space BETWEEN them is its own grey; the only white gap
	   is the one below it, where the shelves end and the folder begins. */
	.te-shelves:not(:empty) {
		flex: none;
		display: flex;
		flex-direction: column;
		/* NO SPACE anywhere on this block — not between the two shelves and not under it. A
		   shelf's own HEAD is what parts it from whatever is above, and the SHADE is what parts one
		   section from the next; a margin as well is the same boundary drawn a third time.
		   The shade itself is `.te-band`'s now — two shelves are one band, because they are one
		   kind of thing (lists of documents that are not a place) and shading them apart would say
		   they are two. */
	}
	.te-loose {
		flex: none;
	}
	/* A shelf's head IS a folder row — it names a list and counts what is in it, which is the
	   whole of what a folder row does. So it is built to the same measurements: the row's height,
	   the row's insets, the row's gap. Anything else made the pane read as two lists that had
	   been set by different hands. */
	/* `.te-work-head` carries the geometry now — 30px, the list's own side insets, the row's gap —
	   and this is what is left that is the SHELF'S: the block it sits in is shaded, so the head has
	   no background of its own to set. */
	.te-loose-head {
		background: none;
	}
	/* The same voice a folder row in the tree is set in, because this is the same kind of thing:
	   a heading over a handful of documents. (Which is now every voice in the chrome — see the
	   head rules above. The sentence is kept because the CLAIM is still the point: these two are
	   the same kind of thing and must not be set apart.) */
	/* A-Z on the Scratch head. Set as small as the tally beside it and in the same muted ink: it
	   is a key, but it is a key about the LIST rather than about a document, and the documents are
	   what this pane is for. */
	.te-loose-sort {
		flex: none;
		padding: 0 var(--space-4);
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.6rem;
		color: var(--sub);
		background: none;
		border: 0;
		border-radius: 2px;
		cursor: pointer;
	}
	.te-loose-sort:hover,
	.te-loose-sort:focus-visible {
		color: var(--orange);
		outline: none;
	}
	/* The + is the same key at the same weight, one step up in size: a single glyph set at 0.6rem
	   beside a two-character word reads as a speck rather than as a control. Its line-height is
	   stated because a lone `+` sits high in its own box, and the row is 30px of things that all
	   have to sit on one line. */
	.te-loose-add {
		font-size: 0.85rem;
		line-height: 1;
	}
	/* THE SECTION MARK — one reicon glyph per list, at the head of it: a disk for the folder on
	   this machine, a cloud for the drive, a ghost for notes with no file behind them, a folder of
	   loose sheets for what was opened from elsewhere. It says what KIND of list this is before the
	   name is read, which is the one thing four stacked lists in a 15rem column cannot say for
	   themselves — three of the four names are the app's own words and the fourth is whatever the
	   folder happens to be called.
	   SET IN THE MUTED INK, like the tally and the twisty. The name is the bold thing in this row
	   and the mark must not compete with it: it is an aid to finding the row, not the row's
	   subject. Every one of them is aria-hidden — the name beside it already says this. */
	.te-work-mark {
		flex: none;
		display: inline-flex;
		align-items: center;
		color: var(--sub);
		/* It carries a hover card, so it wants a pointer that says something is under it — but not
		   a `pointer`, which promises a click that does nothing. `help` is the one cursor that
		   means exactly "there is a note about this here". */
		cursor: help;
	}
	/* WHERE THIS LIST LIVES — Local or Cloud, with the address where there is one. The section
	   marks say it in a glyph; a glyph is quick to find and slow to learn, so the words stand
	   behind it. Same box as the clipped-name reveal below and for the same reasons: the shared
	   `.popover` surface, BELOW the row rather than over it (over the mark it would land under the
	   pointer that opened it and take its own hover away), and wrapped, because an address is long
	   and the point is to read the whole of it.
	   Opened by the MARK's own hover, not the head's: the head is a drop target, a context menu and
	   three keys, and a card that appeared whenever the pointer crossed any of that would be in the
	   way constantly. */
	.te-work-where {
		position: absolute;
		z-index: 6;
		top: calc(100% - 0.25rem);
		left: 0.75rem;
		right: 0.75rem;
		padding: var(--space-4) var(--space-8);
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.68rem;
		color: var(--ink);
		white-space: normal;
		overflow-wrap: anywhere;
		line-height: 1.4;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.1s ease;
	}
	.te-work-mark:hover + .te-work-where,
	.te-work-mark:focus-visible + .te-work-where {
		opacity: 1;
	}
	.te-work-mark :global(svg) {
		width: 0.9rem;
		height: 0.9rem;
		display: block;
	}
	/* OPEN/SHUT EVERYTHING — reicon's chevron-expand-y, sized like the refresh glyph beside it
	   rather than like the `A-Z` word, because it is a glyph among words and the two sizes are
	   already settled (see .te-drive-refresh). */
	.te-twist-all {
		display: inline-flex;
		align-items: center;
		line-height: 1;
		/* NO SIDE PADDING, unlike the word keys beside it. `.te-loose-sort` gives every key 0.25rem
		   a side, which a WORD needs — its ink runs to its box. This icon's does not: two chevrons
		   sit in the middle of a 24-unit viewBox with a quarter of the width empty each side, so
		   the key's own padding lands on top of air the glyph already brought. On the drive's head,
		   which is the one head with no tally after its keys, that stacked up as a visible hole
		   between the last key and the pane's right edge — measured at 20px of box holding 6px of
		   ink. The head's own 0.4rem gap is what parts this key from the `+`; it needs nothing of
		   its own. */
		padding: 0;
	}
	.te-twist-all :global(svg) {
		/* A shade over the 0.8rem the refresh glyph takes, and no more. The chevrons fill about half
		   their viewBox where the refresh path fills its own, so at a MATCHED box they read at half
		   the weight — but sizing them so the ink matches exactly (1.15rem, tried) overshoots the
		   other way and the mark reads as the biggest thing in the row. This is the middle: enough
		   to stop it looking like a speck between the `+` and the tally, not enough to outrank
		   either. The ink is what was tuned, by eye, against its neighbours. */
		width: 0.95rem;
		height: 0.95rem;
	}
	/* WHERE THIS KEY ENDS A HEAD it is pulled out by its own side bearing, so its INK lands on the
	   right edge every tally in the pane lands on rather than four pixels inside it. The drive's
	   head is the only one this catches — it is the one head with no tally after its keys (a lazy
	   tree cannot count itself; see the note in the markup) — and a glyph that stops short of a
	   column of numbers reads as a gap somebody forgot to close, which is exactly what it was
	   reported as. The BOX overhangs into the pane's 12px padding, which costs nothing: it is
	   transparent, and what a reader lines up is ink.
	   `:last-child` and not a class, because "does anything follow me" is precisely the question.
	   On the folder's head the tally follows, so this does not apply there. */
	.te-work-head > .te-twist-all:last-child {
		/* A PULL, so it is the rung negated rather than a number of its own — the amount it cancels
		   is the key's own side padding, and the two must move together or the mark stops landing
		   on the right edge every tally under it lands on. */
		margin-right: calc(-1 * var(--space-4));
	}
	/* THE COLLAPSE MARK, made from the expand one — chevrons pointing TOGETHER instead of apart.
	   reicon has no `chevron-collapse-y` and this is how the pair is got without hand-cutting a
	   second path: flip each chevron about ITS OWN centre.
	   NOT `scaleY(-1)` on the svg, which was tried first and does nothing at all — measured, the
	   transform applies and the picture does not change. `chevron-expand-y` is SYMMETRIC under a
	   vertical mirror: turning it over maps the top chevron onto the bottom one and the bottom
	   onto the top, so the icon comes back as itself. (180° is the same story — chevrons are
	   symmetric left to right too.) What is wanted is each chevron reversed IN PLACE, which is a
	   per-path transform, which is what `transform-box: fill-box` buys: the origin becomes the
	   path's own bounding box rather than the whole viewBox. */
	.te-twist-all :global(svg path) {
		transform-box: fill-box;
		transform-origin: center;
		transition: transform 0.12s ease;
	}
	.te-twist-all.shuts :global(svg path) {
		transform: scaleY(-1);
	}
	/* ON A FOLDER ROW the same key is held back until the row is reached for — the scratch row's ×
	   exactly, and for its reason: a key drawn on every folder at rest is the arrangement Rename
	   and Delete were taken off the rows for. Absolute, so appearing costs the name no width and
	   the row does not reflow under the pointer. */
	.te-twist-branch {
		position: absolute;
		/* THE LIST'S OWN INSET, less this glyph's side bearing — so the ink lands on the same right
		   edge as the tally it replaces, and as every tally in the column. Written as the
		   subtraction rather than as the 0.5rem it comes to: those are two independent numbers (the
		   row's padding and the icon's empty margin), they only agree by arithmetic, and a bare
		   0.5rem here would silently stop lining up the day either one moved. */
		right: calc(0.75rem - 0.25rem);
		top: 50%;
		transform: translateY(-50%);
		padding: 0;
		opacity: 0;
		transition: opacity 0.12s ease;
	}
	.te-work-item:hover .te-twist-branch,
	.te-work-item:focus-within .te-twist-branch {
		opacity: 1;
	}
	/* …and the TALLY steps aside while it shows. The two want the same corner, and the choice
	   between them is easy: the tally is a standing fact you can come back for, the key is the
	   thing you reached for just now. Hidden rather than moved — sliding the figure left would
	   shuffle the one column in this pane that is meant to hold still. */
	.te-work-item:has(.te-twist-branch):hover .te-work-tally,
	.te-work-item:has(.te-twist-branch):focus-within .te-work-tally {
		opacity: 0;
	}
	.te-work-tally {
		transition: opacity 0.12s ease;
	}
	/* The × on a scratch row. Held back until the row is reached for, the way the tree's verbs
	   once were — but there is only one of it and it is a glyph rather than a word, so it costs
	   the name nothing. ARMED it stops being a glyph and becomes the question — see `.on` below,
	   which is where the width comes from. */
	.te-work-item {
		position: relative;
	}
	.te-eph-close {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		/* PADDING ZERO, and it is load-bearing. A <button> carries the UA's own `1px 6px`, which
		   this rule never reset — so inside an 18px border-box the CONTENT box was 6px wide while
		   the glyph's advance is 8.33px. `place-items: center` cannot centre something wider than
		   the box it is centring in: it clamps to the start edge and overflows the other way, so
		   the × sat a pixel right of centre (measured off the rendered pixels — 7.4px of face to
		   its left against 5.3px to its right). Nothing about the glyph was wrong; it was never
		   being centred in the button at all, only in the six pixels the UA had left it. */
		padding: 0;
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.85rem;
		line-height: 1;
		color: var(--sub);
		background: none;
		border: 0;
		border-radius: 3px;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.12s ease;
	}
	.te-work-item:hover .te-eph-close,
	.te-work-item:focus-within .te-eph-close,
	.te-eph-close.on {
		opacity: 1;
	}
	.te-eph-close:hover,
	.te-eph-close:focus-visible {
		color: var(--orange);
		background: color-mix(in srgb, var(--orange) 10%, transparent);
		outline: none;
	}
	/* THE QUESTION. It stops being an 18px square and becomes a small plastic key wearing the
	   word — the bar's Clear key at row scale, and for the same reason: a second press has to be
	   asked for in language, not in a shade of the first press.
	   It is drawn as a KEY (a face and an edge, not a wash) so it reads as standing OVER the row
	   rather than as the row having changed colour. That matters here more than in the bar: this
	   button is absolutely positioned over the end of the filename, and a word on a wash would
	   read as part of the name underneath it.
	   Width is left to the content. The 18px square is a `min-width` now rather than a width, so
	   the × keeps its box and the word takes what it needs. */
	.te-eph-close.on {
		width: auto;
		min-width: 18px;
		padding: 0 var(--space-4);
		font-size: 0.6rem;
		font-weight: 700;
		color: var(--orange);
		background: var(--pixel-key-on, color-mix(in srgb, var(--orange) 14%, transparent));
		border: 1px solid color-mix(in srgb, var(--orange) 55%, transparent);
	}
	/* The hover pair spelled out, because the plain :hover above is (0,2,0) like this and would
	   otherwise win on order and wash the key's face back out mid-question. */
	.te-eph-close.on:hover,
	.te-eph-close.on:focus-visible {
		color: var(--orange);
		background: var(--pixel-key-on, color-mix(in srgb, var(--orange) 14%, transparent));
	}

	/* The same voice a folder row's name is set in, for the same reason: both name a place. */
	/* `.te-loose-name` was here and is gone with the markup that wore it: a shelf's title is a
	   `.te-work-name` like every other head's, which is the whole point of the change. */
	/* The lists themselves are FLUSH — no padding of their own at either end. Every gap in this
	   pane is a head's, so a head sets the same distance from what is above it everywhere. */
	.te-loose-list {
		overflow: visible;
	}
	/* Each row is the catalog row the Apps index uses — a hairline under it, the accent on
	   hover, nothing floating. The OPEN one is marked, because a workspace whose list does not
	   say which file you are looking at is a list rather than a workspace. */
	/* No rule under each row. A list of four documents does not need three lines drawn through
	   it: the rows are already parted by their own leading, and the hover tint and the marked
	   row are what actually need to be seen. The same argument as the panes beside it. */
	/* EVERY row in this pane is the same height — a document, a folder, a scratch note. They are
	   set at different sizes and weights (a folder name is bold and small, a filename is neither),
	   and left to their own type they came out a pixel or two apart, which reads as a list that
	   has been assembled rather than one that was set. One face across the pane narrowed the gap
	   and did not close it: the floor is still what holds the rows level.
	   A flex row with a floor under it, rather than padding alone: padding plus a smaller face is
	   still a smaller row. */
	.te-work-row {
		display: flex;
		align-items: center;
		gap: var(--space-8);
		width: 100%;
		min-height: 30px;
		padding: var(--space-4) var(--space-12);
		text-align: left;
		background: none;
		border: 0;
		cursor: pointer;
	}
	.te-work-row:hover,
	.te-work-row:focus-visible {
		background: color-mix(in srgb, var(--orange) 7%, transparent);
		outline: none;
	}
	.te-work-row.on {
		background: var(--pixel-key-on, color-mix(in srgb, var(--orange) 12%, transparent));
	}
	.te-work-row.on .te-work-file {
		color: var(--orange);
	}
	/* The row whose menu is open is marked the way the hovered one is: the pointer has left the
	   row to reach the menu, so nothing else would say which document the menu is about. */
	/* `:not(.on)` because this rule comes after the open row's and would otherwise take the
	   stronger mark off the very document you are working in. */
	.te-work-row.menu:not(.on) {
		background: color-mix(in srgb, var(--orange) 7%, transparent);
	}
	/* ── Dragging a document ───────────────────────────────────────────────────
	   The row being carried fades; the folder that would take it is OUTLINED rather than filled,
	   because a fill is what the pane already uses for "this is the one you are looking at" and
	   a drop target is a question rather than a state. */
	.te-work-row.dragging {
		opacity: 0.45;
	}
	.te-work-row.into,
	/* A folder menu's two forms. Narrow, because the popover is a menu that has grown a question
	   rather than a dialog that has been dressed as one. */
	.te-dir-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
	}
	.te-dir-label {
		font-size: 0.72rem;
		color: var(--sub);
	}
	.te-dir-warn {
		margin: 0 0 var(--space-4);
		font-size: 0.72rem;
		line-height: 1.35;
		/* THE REFUSAL INK, on a warning rather than on a refusal — this is the one place the two
		   meet. What is about to happen is not reversible and the colour says so before the words
		   are read. */
		color: var(--ruby);
	}
	.te-dir-keys {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-8);
		margin-top: var(--space-4);
	}
	.te-dir-kill:not(:disabled) {
		color: var(--ruby);
		border-color: var(--ruby);
	}
	.te-dir-keys .chip:disabled {
		opacity: 0.45;
	}

	/* ── A FOLDER BEING READ ───────────────────────────────────────────────────
	   Opening a remote folder is a request, and on a slow connection the row does nothing for a
	   second or two — which from the outside is indistinguishable from a folder that is empty or a
	   press that missed. So it says so, in TOPAZ: the fourth gem, and the one that is not an
	   answer. Emerald landed, ruby did not, and this has not done either yet.

	   It is also the only one of the four allowed to MOVE, for the same reason — a bar that sweeps
	   is saying "still going", which is the whole of what a determinate figure cannot say here: the
	   server does not tell us how many rows are coming, so there is no progress to report, only
	   activity. An indeterminate bar that pretends to be a percentage is a lie with a number in it. */
	.te-work-row.fetching {
		position: relative;
		color: var(--topaz);
	}
	/* The word stands exactly where the tally stands, in the tally's own type — it is the answer to
	   the same question, arriving late. */
	.te-work-fetching {
		margin-left: auto;
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.6rem;
		color: var(--topaz);
	}
	/* A 2px rule along the bottom of the row, with a sliver sweeping it. Along the BOTTOM rather
	   than under the name: every row in this pane is 30px and a bar with its own height would make
	   this one taller than its neighbours, which is the one thing the row rule does not allow. */
	.te-work-bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 2px;
		overflow: hidden;
		background: color-mix(in srgb, var(--topaz) 18%, transparent);
	}
	.te-work-bar::after {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 38%;
		background: var(--topaz);
		animation: te-fetching 1.1s ease-in-out infinite;
	}
	@keyframes te-fetching {
		0% {
			transform: translateX(-100%);
		}
		/* 264%, not 100%: the sliver is 38% of the bar, so one of its OWN widths is 38% of the
		   travel. Crossing the bar and clearing the far edge is (100 + 38) / 38 ≈ 264 of them.
		   A round 100% would have it stall a third of the way across and jump back. */
		100% {
			transform: translateX(264%);
		}
	}
	/* Reduced motion keeps the BAR and drops the sweep. The bar is the information; the movement is
	   how it says "still", and somebody who has asked for less movement has not asked for less
	   information. A steady breathing fill says the same thing without travelling. */
	@media (prefers-reduced-motion: reduce) {
		.te-work-bar::after {
			width: 100%;
			animation: te-fetching-still 1.6s ease-in-out infinite;
		}
		@keyframes te-fetching-still {
			0%,
			100% {
				opacity: 0.35;
			}
			50% {
				opacity: 1;
			}
		}
	}

	/* THE DRIVE'S BLOCK. A rule above it and its head set like the workspace's, so the pane reads as
	   two places rather than one list with a gap in it. No shading: the shelves are shaded because
	   they are NOT a place (they hold documents from anywhere and notes from nowhere), and a drive
	   is as much a place as the folder is. */
	/* The refresh is a GLYPH among word keys, so it is sized like the `+` rather than like `A-Z` —
	   and it spins while it works, which is the one place this pane animates a key. */
	.te-drive-refresh {
		display: inline-flex;
		align-items: center;
		line-height: 1;
	}
	.te-drive-refresh :global(svg) {
		width: 0.8rem;
		height: 0.8rem;
	}
	.te-drive-refresh.on :global(svg) {
		animation: te-spin 0.9s linear infinite;
	}
	@keyframes te-spin {
		to {
			transform: rotate(1turn);
		}
	}
	/* The head carries the bar while the root is being re-read, so it needs to be the box the bar
	   is absolute to. */
	.te-drive-head {
		position: relative;
	}
	/* ── THE BANDS ─────────────────────────────────────────────────────────────
	   Four lists in one pane, told apart by SHADE rather than by rules. A hairline between every
	   section drew four lines down a 15rem column and read as a table; shade says "a different
	   kind of list" with nothing added to the page at all — which is the argument the shelves were
	   already making on their own, extended to the sections beside them.

	   ALTERNATING, and computed rather than assigned. `nth-of-type` is why all three are
	   `<section>`: the drive is conditional, so a hard-coded "shelves shaded, drive plain, folder
	   shaded" would put two shaded bands against each other the moment no drive was connected —
	   one wide band with a seam nobody can see. Counting them lets the folder take whichever shade
	   is left. */
	.te-band:nth-of-type(odd) {
		/* Over the RAIL, not over the sheet: this band is drawn inside the workspace, and shading
		   4% of ink onto a stock the pane no longer uses put the shaded sections BRIGHTER than the
		   unshaded ones the moment the rail stepped back. The shade is a relationship with the
		   pane under it, so it has to name that pane. */
		background: color-mix(in srgb, var(--ink) 4%, var(--te-rail));
	}
	.te-work-head.into {
		outline: 1px dashed var(--orange);
		outline-offset: -2px;
		background: color-mix(in srgb, var(--orange) 6%, transparent);
	}
	/* NO grab cursor, even though these rows drag. A row's first job is to OPEN the document, and
	   a hand telling you to pick it up is an offer to do the rarer thing — the pointer says
	   "this is a control", which is the true and more useful of the two. Dragging still works;
	   it just does not advertise itself over the clicking. */
	/* ── A rename SAYS so ──────────────────────────────────────────────────────
	   The one write in this pane that changes nothing you can see: the sheet is unchanged, the
	   row simply has a different word in it, and a rename the browser refused looks identical to
	   one that worked. So the row answers, in the emerald the Save key uses for exactly this —
	   `.done` on a key, a wash on a row. It fades in and back out on its own. */
	/* The WASH and the WORD are animated, never the row's opacity. Fading the row faded the
	   filename with it — the cell whited out and the name reappeared at the end, which reads as
	   the row being replaced rather than as an answer about it. */
	.te-work-row.said {
		position: relative;
		animation: te-saved-wash 1.6s ease forwards;
	}
	/* The ACCENT tone — Moved, Cleared. Emerald says it happened; the accent says look where it is
	   now. Same split the keys keep between `.done` and `.on`. */
	.te-work-row.said-here {
		--te-said: var(--orange);
	}
	/* The REFUSAL tone. Neither of the other two would do: emerald says it happened, and the accent
	   says look where it is now — a write that did not happen is not either of those, and wearing
	   one of their colours would make the row say the opposite of what it means. */
	.te-work-row.said-lost {
		--te-said: var(--ruby);
	}
	/* The word is the ROW'S, carried as an attribute rather than as one rule per verb. Four verbs
	   answer here now and a fifth should cost a call, not a stylesheet. */
	.te-work-row.said::after {
		content: attr(data-said);
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.6rem;
		color: var(--te-said, var(--emerald));
		animation: te-saved-word 1.6s ease forwards;
	}
	@keyframes te-saved-wash {
		0% {
			background-color: transparent;
		}
		15% {
			background-color: color-mix(in srgb, var(--te-said, var(--emerald)) 16%, transparent);
		}
		70% {
			background-color: color-mix(in srgb, var(--te-said, var(--emerald)) 16%, transparent);
		}
		100% {
			background-color: transparent;
		}
	}
	@keyframes te-saved-word {
		0% {
			opacity: 0;
		}
		15% {
			opacity: 1;
		}
		70% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
	/* The word is an ANSWER, not an animation. Under reduced motion it simply stands for its
	   second and a half and goes. */
	@media (prefers-reduced-motion: reduce) {
		.te-work-row.saved,
		.te-work-row.moved,
		.te-work-row.saved::after,
		.te-work-row.moved::after {
			animation: none;
		}
		.te-work-row.saved,
		.te-work-row.moved {
			background: color-mix(in srgb, var(--te-said, var(--emerald)) 16%, transparent);
		}
	}
	.te-work-rename {
		padding: var(--space-4) var(--space-8);
	}
	.te-work-field {
		width: 100%;
		box-sizing: border-box;
		height: 26px;
		padding: 0 var(--space-8);
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.76rem;
		color: var(--ink);
	}
	/* The remembered-but-shut state: named, explained, one key. */
	.te-work-shut .te-work-note {
		border-top: 0;
	}
	.te-work-reconnect {
		align-self: flex-start;
		margin: 0 var(--space-12) var(--space-12);
		height: 26px;
		padding: 0 var(--space-8);
		font: inherit;
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border: 1px solid var(--line-edge, rgba(0, 0, 0, 0.2));
		border-radius: 4px;
		cursor: pointer;
	}
	/* Said once, at the foot of the list, rather than by drawing verbs that would not work.
	   No rule over it either: it is the last thing in the pane and the space above it says so. */
	.te-work-note {
		flex: none;
		margin: 0;
		padding: var(--space-12) var(--space-12) var(--space-8);
		font-size: 0.66rem;
		line-height: 1.4;
		color: var(--sub);
	}
	.te-work-file {
		flex: 1 1 auto;
		min-width: 0;
		line-height: 1.3;
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.76rem;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* ── The tree's own rows ───────────────────────────────────────────────────
	   A folder row is the same row as a document's, told apart by its twisty and by being set in
	   the header's voice rather than the document's: it NAMES a place, and the pane already sets
	   the one place-name it has — the folder at the top — the same way. */
	/* (A folder row needs no layout of its own — the flex, the gap and the height are the ROW's,
	   which is what keeps a folder the same height as a document.) */
	.te-work-dirname {
		flex: 1 1 auto;
		min-width: 0;
		font-size: 0.7rem;
		color: var(--sub);
	}
	.te-work-dir:hover .te-work-dirname {
		color: var(--ink);
	}
	/* Drawn rather than set in a character: ▸ and ▾ are different weights and different widths in
	   every font this theme might fall back to, so the row jumped sideways as it opened. A border
	   triangle is the same triangle turned. */
	.te-work-twist {
		flex: none;
		width: 0;
		height: 0;
		border-left: 4px solid currentColor;
		border-top: 3.5px solid transparent;
		border-bottom: 3.5px solid transparent;
		color: var(--sub);
		transform: rotate(90deg);
		transition: transform 0.12s ease;
	}
	.te-work-twist.shut {
		transform: none;
	}
	/* AN INERT ROW — listed so the folder looks like itself, dimmed so it is plainly not a document
	   you can open. Dimmed rather than struck through or badged: it is not an error and not a
	   warning, it is simply not this app's kind of file, and the quietest possible treatment is the
	   honest one. `default` cursor, because `not-allowed` scolds somebody for pointing at a
	   photograph. The title says why — see the row's markup. */
	.te-work-row.inert {
		opacity: 0.45;
		cursor: default;
	}
	/* …and it does not answer to the pointer the way a document does. The hover wash says "this
	   opens"; there is nothing to open. */
	.te-work-row.inert:hover {
		background: none;
	}

	/* How many documents are under a shut folder. Set in the pixel voice, like the count in the
	   header, because it is the same fact about a smaller thing. */
	.te-work-tally {
		flex: none;
		font-family: var(--font-pixel, var(--font-mono, monospace));
		font-size: 0.8rem;
		line-height: 1;
		color: var(--sub);
	}

	/* THE FLYOUT'S KEYS ARE NAMED, not bare discs. FloatingKey dresses its stack's children as
	   40px circles — right for the Emoji Viewer's four controls and the ranger's two, wrong for a
	   column of ELEVEN that now includes both view keys: a stack of eleven identical circles is a
	   puzzle, and the marks alone cannot tell Save from Copy from Save-a-copy.
	   DOUBLED CLASS (`.icon-btn.te-fkey`), and it has to be. FloatingKey's rule is
	   `.fkey-stack :global(.icon-btn)` — (0,2,0) — and a scoped `.te-fkey` here compiles to
	   `.te-fkey.svelte-hash`, also (0,2,0), so which one won would come down to the order two
	   components' stylesheets happened to land in. Naming both classes takes it to (0,3,0) and
	   settles it.
	   `min-width` rather than a stretched stack: `.fkey-flyout` is `align-items: flex-start`, so
	   pills take their own widths and a column of ragged right edges reads as a list that failed
	   to lay out. The floor lines them up without this file reaching into a component it does not
	   own. */
	.icon-btn.te-fkey {
		/* FLEX, and that is the load-bearing line. puhig's `.icon-btn` is `inline-grid` with
		   `place-items: center` — right for one glyph in a square, and with TWO children it laid
		   the mark and the word out as two grid ROWS that overflowed a 40px box and printed the
		   word across the sheet behind. Nothing about the widths was wrong; the box was never a
		   flex row to begin with. */
		display: inline-flex;
		align-items: center;
		justify-content: flex-start;
		width: auto;
		min-width: 11rem;
		height: 40px;
		padding: 0 var(--space-16);
		gap: var(--space-12);
		border-radius: 20px;
	}
	.te-fkey-word {
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.78rem;
		white-space: nowrap;
	}
	/* The mark keeps its size while the key grows around it — without this the flex row would
	   stretch an svg with no intrinsic width across whatever the word left over. */
	.icon-btn.te-fkey :global(svg) {
		flex: none;
	}

	/* THE FLOATING KEY takes FloatingKey's own 1.25rem inset and needs nothing from this file.
	   It used to be lifted by the running foot's measured height, because the key was landing on
	   the tally — the two shared the bottom of a phone. The foot is a desk affordance now, so on
	   the only screen the key exists on there is nothing under it, and the override went with the
	   measurement that fed it (`footHeight`, `--te-foot-h`, and a doubled-class specificity fight
	   with the component's own stylesheet). Rules that exist to reconcile two things are the
	   first thing to delete when one of them leaves. */

	/* ── The contents rail ─────────────────────────────────────────────────────
	   The docs shell's right rail, in an editor: a column of the document's own headings, stepped
	   by level, the one under the caret marked. Same width and material as the workspace on the
	   other side, so the desk reads as a spread with the writing in the middle — and the material
	   is the RAIL stock, not the sheet's, for the reason set out at --te-rail: both rails say
	   where the writing is, and neither should stand level with it. */
	.te-toc {
		flex: none;
		width: 13rem;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
		border-radius: 4px;
		background: var(--te-rail);
		/* No top inset — the head is a row and brings its own. */
		padding: 0 0 var(--space-12);
	}
	/* The same row as the workspace's head across the desk: 30px, the same insets, the label
	   centred in it rather than sitting on a margin. The two rails frame the writing, and they
	   only read as a frame if they start on the same line. */
	.te-toc-head {
		flex: none;
		display: flex;
		align-items: center;
		min-height: 30px;
		margin: 0;
		padding: var(--space-4) var(--space-12);
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.66rem;
		font-weight: 700;
		color: var(--sub);
	}
	.te-toc-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.te-toc-link {
		display: flex;
		align-items: baseline;
		gap: var(--space-8);
		width: 100%;
		padding: var(--space-4) var(--space-12);
		text-align: left;
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.78rem;
		line-height: 1.35;
		color: color-mix(in srgb, var(--ink) 80%, transparent);
		background: none;
		border: 0;
		cursor: pointer;
	}
	.te-toc-link:hover,
	.te-toc-link:focus-visible {
		color: var(--orange);
		outline: none;
	}
	/* The heading the caret is under. A rail that does not say where you are is a list of links. */
	.te-toc-link.on {
		color: var(--orange);
		background: color-mix(in srgb, var(--orange) 8%, transparent);
	}
	/* Levels step in. Only the first three earn a step — past that a rail indents further than it
	   informs, and h4–h6 are the quietest steps of the proof's own ladder anyway. */
	/* A TOP-LEVEL heading is not BOLDER than the ones under it, only darker. The rail already says
	   the hierarchy twice — by indent and by the numbering — and a third telling in weight made the
	   H1s read as the important entries rather than as the outer ones. Full ink against the 80% the
	   rest keep is the whole of the difference now, which is enough to find them by and quiet
	   enough that the entry under the caret (`.on`, the accent) is still the loudest thing here. */
	.te-toc-link.lvl-1 {
		color: var(--ink);
	}
	.te-toc-link.lvl-2 {
		padding-left: var(--space-24);
	}
	.te-toc-link.lvl-3,
	.te-toc-link.lvl-4,
	.te-toc-link.lvl-5,
	.te-toc-link.lvl-6 {
		padding-left: var(--space-36);
		font-size: 0.72rem;
		color: var(--sub);
	}
	.te-toc-num {
		flex: none;
		font-family: var(--font-pixel, var(--font-mono, monospace));
		font-size: 0.9rem;
		line-height: 1;
		color: var(--orange);
	}
	.te-toc-empty {
		margin: 0;
		padding: 0 var(--space-12);
		font-size: 0.72rem;
		color: var(--sub);
	}

	/* ── The heading menu ──────────────────────────────────────────────────────
	   The shared popover (puhig's .popover / .popover-item — see the note there) with one thing
	   added: six levels, each SET in its own size, so the list shows what it is offering rather
	   than naming it. That is the manual's own trick, and the reason a menu beats six keys. */
	.te-heads-menu {
		min-width: 11rem;
	}
	.te-heads-item {
		display: flex;
		align-items: baseline;
		gap: var(--space-8);
		/* Named rather than inherited. These items read `Heading 1`, `Heading 2` — the app's own
		   words for a level, not a specimen of the level, so they take the chrome's voice like
		   every other popover item. They wore the SERIF for a while on the argument that these
		   ARE headings; they are not, they are a menu of them. */
		font-family: var(--font-body, system-ui, sans-serif);
	}
	/* THE HASHES STAY MONO, and they are the reason this rule exists. `#`, `##`, `###` is
	   MARKDOWN — the literal characters the key is about to type into the sheet — so it is the
	   same thing an inline code span is, and it is set the way the sheet sets it. The one place
	   in the chrome where the mono face survived the pass, and it survived on the same argument
	   that keeps it on the WRITE sheet: this is source, not label. */
	.te-heads-mark {
		margin-left: auto;
		font-family: var(--font-mono, monospace);
		font-size: 0.68rem;
		color: var(--sub);
	}
	.te-heads-none {
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.7rem;
		color: var(--sub);
	}

	/* ── The workspace row's menu ──────────────────────────────────────────────
	   The shared popover again, with a width and nothing else. Its head (the filename), its
	   items and the armed state of Delete are all puhig's .popover-title / .popover-item /
	   .popover-item.on — the same parts the Beta card and the heading menu are built from, so
	   the three cannot drift into being three different apps. */
	.te-file-menu {
		min-width: 9rem;
		max-width: 15rem;
	}

	/* ── The workspace menu ────────────────────────────────────────────────────
	   The shared popover again, with a width and nothing else. Wider than the row menu because
	   its items are sentences rather than verbs — `Hide the workspace` says which way the toggle
	   will go, and an item that wrapped to say it would be worse than the three keys this
	   replaced. */

	/* ── The phone's flyout ────────────────────────────────────────────────────
	   The card FloatingKey opens above its stack holds the marks as a grid. Five across is what
	   fits a 390px screen with the key's own insets taken off, and it puts all ten within a
	   thumb's sweep of the key that opened them.
	   The buttons are dressed here rather than borrowing .icon-btn: a mark key is square and
	   flush to its neighbours in a grid, where the stack's discs are spaced and round. Same
	   plastic, different arrangement. */
	.te-fly-marks {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: var(--space-8);
	}
	.te-fly-mark {
		display: grid;
		place-items: center;
		box-sizing: border-box;
		width: 100%;
		height: 44px;
		padding: 0;
		color: var(--ink);
		background: var(--pixel-key-face, rgba(255, 255, 255, 0.5));
		border: 1px solid var(--pixel-key-border, rgba(0, 0, 0, 0.4));
		border-radius: 4px;
		box-shadow: var(--pixel-bevel);
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}
	.te-fly-mark:active {
		box-shadow: var(--pixel-bevel-press);
	}
	.te-fly-mark:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.te-fly-mark :global(svg) {
		display: block;
		width: 1.1rem;
		height: 1.1rem;
	}

	/* ── The running foot ──────────────────────────────────────────────────────
	   The tally, set the way a manual foots a page: sans labels, pixel figures, one hairline
	   over the lot. The label/figure split is the whole recipe — the word is chrome and reads as
	   chrome, the number is a readout and wears the bitmap face every other numeral in the app
	   wears. Fixed to the bottom of the desk, never scrolling with either pane. */
	.te-foot {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-8) var(--space-16);
		padding: var(--space-8) clamp(var(--space-12), 2vw, var(--space-20));
		padding: var(--space-8) clamp(var(--space-12), round(2vw, var(--space-4)), var(--space-20));
		border-top: 1px solid var(--te-rule);
	}
	/* THE FOOT COMES IN LAST, after the desk it is a footnote to. The app arrives in the order it
	   is read — the bar, the sheet, the rails that say where the sheet is and what is in it, and
	   then the tally, which is the only thing on screen nobody opened the editor for.
	   `rise` like the desk (a horizontal `btn-in` on a full-width strip would slide the whole row
	   in from the left, which reads as a banner arriving rather than as a foot settling), and one
	   delay for the whole strip: the counts are one fact in four parts, and dealing them out
	   left to right would invite reading them as a sequence. */
	@media (prefers-reduced-motion: no-preference) {
		.te-foot {
			animation: rise 0.5s var(--spring) backwards;
			animation-delay: calc(var(--enter-lead) + 0.2s);
		}
	}
	.te-tally {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-8) var(--space-16);
		margin: 0;
	}
	.te-count {
		display: flex;
		align-items: baseline;
		gap: var(--space-4);
	}
	.te-count dt {
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.66rem;
		color: var(--sub);
	}
	.te-count dd {
		margin: 0;
		font-family: var(--font-pixel, var(--font-mono, monospace));
		font-size: 1.05rem;
		line-height: 1;
		color: var(--ink);
		/* Tabular figures so the counts do not shuffle sideways as they tick over. */
		font-variant-numeric: tabular-nums;
	}
	/* The unit rides the figure but is not one, so it takes the label's face and the label's size.
	   NO MARGIN: the gap is the non-breaking space inside the span — see the markup for why it has
	   to be a real character. Setting both would space it twice. */
	.te-unit {
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.66rem;
		color: var(--sub);
	}
	.te-lamp {
		margin: 0 0 0 auto;
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.66rem;
		color: var(--sub);
	}
	.te-lamp-dirty {
		color: var(--orange);
	}

	/* ── Narrow ────────────────────────────────────────────────────────────────
	   One pane, always (SPLIT is not offered — see shownMode), and the type goes to 16px, which
	   is the size below which iOS Safari zooms the whole page the moment the field takes focus.
	   Because it is set on the shared --te-type-size, the mirror follows it without being told. */
	@media (max-width: 820px) {
		.te {
			--te-type-size: 16px;
			--te-row: 28px;
			--te-margin: 2.2rem;
			--te-pad: var(--space-16);
		}
		/* NO GUTTER AND NO GAP. The desk's band of grey is what makes four columns read as four
		   objects laid on a field — and at this width there are no four columns: there is one pane,
		   and the field around it is a frame drawn around a single sheet of paper. On a 390px
		   screen that frame costs 13px of width and 13px of height off the one surface somebody
		   came here to write on, to say something ("these are separate") that is not true when
		   there is only one of them.
		   The words keep their own breathing room either way — that is --te-pad, inside the pane,
		   and it is untouched. What goes is only the space OUTSIDE the paper. */
		.te-desk {
			flex-direction: column;
			padding: 0;
			gap: 0;
		}
		/* …and with no field left to be an object on, the pane stops being a card. The 4px corner
		   is the manual's plastic radius, right for a sheet lying on a grey desk and wrong for one
		   that IS the screen: rounded corners against the panel's own straight edge read as a
		   rendering fault rather than as a shape. Same for the workspace over it. */
		.te-pane,
		.te-work {
			border-radius: 0;
		}
		.te-pane + .te-pane {
			border-left: 0;
			border-top: 1px solid var(--te-rule);
		}
		/* The workspace cannot be a column on a phone — there is only room for one. It becomes a
		   sheet over the desk instead, and closes when you pick from it (see `load`).
		   INSET 0, ALL FOUR SIDES. It used to start at `var(--bar-h, 60px)`, clearing the dense bar
		   it opened under — and at this width there is no bar any more (the page stops drawing the
		   head below 820px; the keys are in the flyout). The variable is not merely unnecessary
		   now, it is WRONG: it holds whatever the bar last measured before it unmounted, so the
		   pane opened with a band of sheet showing above it and nothing to explain the gap. */
		.te-work {
			position: absolute;
			z-index: 5;
			inset: 0;
			width: auto;
			padding-top: 0;
		}
		/* No .te-foot rules here any more: the foot is not drawn at this width at all. What stood
		   here was the third answer to one collision — the key sitting on the first count. The
		   first was a 4.5rem left inset on the foot, which fixed it by making the foot lopsided
		   (72px of padding on the left against 12px on the right, measured); the second lifted
		   the key by the foot's height. Removing one of the two things is what actually settled
		   it. */
	}
</style>
