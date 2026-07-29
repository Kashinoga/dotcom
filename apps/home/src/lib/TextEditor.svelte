<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { renderMarkdown, tally, lineMarks, outline } from '$lib/markdown';
	import {
		editor,
		shownMode,
		MARKS,
		DOC_KEYS,
		OPEN_KEYS,
		OPENABLE,
		HEADING_LEVELS,
		openHeadings,
		holdInstall,
		openSettings,
		type FolderEntry,
		type LooseDoc,
		type Ephemeral
	} from '$lib/text-editor-state.svelte';
	import {
		localStore,
		snapshotStore,
		notWritten,
		WROTE,
		whyLocal,
		type LocalStore,
		type Store,
		type WriteResult
	} from '$lib/text-editor-store';
	import { SAID } from '$lib/text-editor-state.svelte';
	import {
		configFor,
		forgetToken,
		objectStore,
		unseal,
		type Connection
	} from '$lib/dav-connections';
	import { davStore } from '$lib/dav';
	import FloatingKey from '$lib/FloatingKey.svelte';
	import TextEditorSettings from '$lib/TextEditorSettings.svelte';
	import { dev } from '$app/environment';
	import { NIB_SVG, RULE_SVG, GEAR_SVG } from '$lib/icons';

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
		// ORDER MATTERS HERE, and getting it wrong is what made this take two clicks.
		//
		// Focusing a text control scrolls its CURRENT selection into view, and the textarea is not
		// its own scroller — it is the full height of the document, laid over the mirror — so the
		// browser scrolls `.te-paper` instead. Done after the row was scrolled to, that threw the
		// sheet straight back to wherever the caret had been left: the first press on a heading
		// landed on the PREVIOUS heading's position, and the second one, with the caret now in the
		// right chapter, looked like it had worked.
		//
		// So the caret is set first, focus is taken with the scrolling suppressed, and the row is
		// scrolled to LAST, where nothing can undo it.
		const at = srcLines.slice(0, entry.line).reduce((n, l) => n + l.length + 1, 0);
		if (ta) {
			ta.setSelectionRange(at, at);
			ta.focus({ preventScroll: true });
		}
		const row = mirrorEl?.children[entry.line] as HTMLElement | undefined;
		row?.scrollIntoView({ block: 'center' });
		trackCaret();
	}

	// Which panes are on. The rule (SPLIT is not offered on a narrow window) lives in
	// $lib/text-editor-state, because the rack in the bar has to apply the same one to decide whether to
	// draw the SPLIT key at all.
	const shown = $derived(shownMode());

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
			editor.workspaceAt = null;
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
		if (!ta) return;
		const { selectionStart: s, selectionEnd: e } = ta;
		const chosen = text.slice(s, e);
		const before = text.slice(Math.max(0, s - open.length), s);
		const after = text.slice(e, e + close.length);

		if (before === open && after === close) {
			// Already wrapped — take the marks off, and keep the words selected.
			ta.selectionStart = s - open.length;
			ta.selectionEnd = e + close.length;
			write(chosen, s - open.length, e - open.length);
			return;
		}
		const at = s + open.length;
		write(open + chosen + close, at, at + chosen.length);
	}

	/**
	 * Put a mark at the head of every line the selection touches — headings, quotes, bullets.
	 * Pressing the same key again takes it off, so H1 is a toggle rather than a stack of hashes.
	 * The whole affected range is rewritten in ONE execCommand so it is a single undo step.
	 */
	function prefix(mark: string) {
		if (!ta) return;
		const { selectionStart: s, selectionEnd: e } = ta;
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

		ta.selectionStart = from;
		ta.selectionEnd = to;
		const shift = next.length - (to - from);
		write(next, Math.max(from, s + (allMarked ? -mark.length : mark.length)), e + shift);
	}

	const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	/**
	 * Set every line the selection touches to a heading LEVEL — or to none, at level 0. It is its
	 * own verb rather than six calls to `prefix` because the levels are EXCLUSIVE: asking for an
	 * H3 on an H1 line is a change of level, not a second heading, so whatever is there comes off
	 * first. Pressing the level a line already has takes it off, the way the two keys did.
	 */
	function heading(level: number) {
		if (!ta) return;
		const { selectionStart: s, selectionEnd: e } = ta;
		const from = text.lastIndexOf('\n', s - 1) + 1;
		const toNewline = text.indexOf('\n', e);
		const to = toNewline === -1 ? text.length : toNewline;
		const chosen = text.slice(from, to).split('\n');
		const ATX = /^ {0,3}(#{1,6})[ \t]+/;
		const already = chosen.every((l) => l.match(ATX)?.[1].length === level);
		const mark = level && !already ? '#'.repeat(level) + ' ' : '';
		const next = chosen.map((l) => mark + l.replace(ATX, '')).join('\n');
		ta.selectionStart = from;
		ta.selectionEnd = to;
		const shift = next.length - (to - from);
		const head = chosen[0].match(ATX)?.[0].length ?? 0;
		write(next, Math.max(from, s + (mark.length - head)), e + shift);
	}

	/** Drop a block in on its own lines, with blank lines around it if there aren't any. */
	function block(body: string) {
		if (!ta) return;
		const { selectionStart: s } = ta;
		const lead = s > 0 && text[s - 1] !== '\n' ? '\n' : '';
		const tail = s < text.length && text[s] !== '\n' ? '\n' : '';
		write(lead + body + '\n' + tail);
	}

	// The link key, which is the one that earns a special case. With text selected, the selection
	// becomes the LABEL and the caret lands in the empty target, ready for a paste — which is the
	// order the gesture actually happens in: you copy a URL, select the words, press the key.
	function link() {
		if (!ta) return;
		const { selectionStart: s, selectionEnd: e } = ta;
		const chosen = text.slice(s, e) || 'text';
		const body = `[${chosen}](`;
		write(`${body})`, s + body.length);
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
			return write('  ');
		}
		if (event.key === 'Escape') {
			// The advertised way out of the trap. Blurring hands focus back to the document, so
			// the next Tab reaches the rack.
			ta?.blur();
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
		if (!ta) return;
		const { selectionStart: s } = ta;
		const from = text.lastIndexOf('\n', s - 1) + 1;
		const line = text.slice(from, s);
		const lead = line.match(/^[ \t]{1,2}/)?.[0];
		if (!lead) return;
		ta.selectionStart = from;
		ta.selectionEnd = from + lead.length;
		write('', s - lead.length);
	}

	/**
	 * Enter inside a list carries the list on: same indent, same marker, the number stepped. Enter
	 * on an EMPTY item ends the list instead of laying down another empty bullet — which is the
	 * behaviour every editor has and nobody notices until it is missing.
	 */
	function carryList(event: KeyboardEvent) {
		if (!ta) return;
		const { selectionStart: s, selectionEnd: e } = ta;
		if (s !== e) return; // a selection makes this an ordinary replace
		const from = text.lastIndexOf('\n', s - 1) + 1;
		const line = text.slice(from, s);
		const m = line.match(/^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))[ \t]+(.*)$/);
		if (!m) return;
		const [, indent, bullet, number, delimiter, rest] = m;

		event.preventDefault();
		if (!rest) {
			// An empty item: clear the marker off this line and leave the caret on a blank line.
			ta.selectionStart = from;
			ta.selectionEnd = s;
			write('');
			return;
		}
		const marker = bullet ? `${bullet} ` : `${Number(number) + 1}${delimiter} `;
		write(`\n${indent}${marker}`);
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
	) {
		// Whatever is on the sheet may be a scratch note, and this is about to be over it.
		stashEphemeral();
		putOnSheet(body.replace(/\r\n?/g, '\n'));
		editor.filename = name;
		editor.openHandle = handle;
		editor.openWritable = writable;
		// The workspace STAYS OPEN when you pick from it — that is what makes it a workspace
		// rather than a picker. It closes on a phone, where it covers the sheet it just filled.
		if (editor.narrow) editor.folderShown = false;
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
		putOnSheet(doc.text);
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
			land(body, doc.name, null, !!drive?.writable);
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
		held = localStore(dir, OPENABLE);
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

	/** The path being dragged, and the folder path under the pointer. Both '' for none. */
	let dragging = $state('');
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
	 * Can rows be dragged at all? It stopped being a question about the ROW when the row stopped
	 * carrying a handle: what it asks is whether the workspace can be written to, and that is one
	 * answer for the whole tree.
	 */
	const canMove = () => editor.folderWritable;

	function onDragStart(event: DragEvent, entry: FolderEntry) {
		if (!canMove()) return event.preventDefault();
		dragging = entry.path;
		event.dataTransfer?.setData('text/plain', entry.path);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function onDragOver(event: DragEvent, destPath: string) {
		if (!dragging) return;
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

	async function onDrop(event: DragEvent, destPath: string) {
		event.preventDefault();
		const path = event.dataTransfer?.getData('text/plain') || dragging;
		dragging = '';
		dropInto = null;
		const entry = editor.folder.find((e) => e.path === path);
		if (entry) await moveTo(entry, destPath);
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

	function measureName() {
		const el = workNameEl;
		// +1 for the sub-pixel: a name that exactly fits reports a scrollWidth a fraction over its
		// clientWidth often enough to flash a reveal that shows the same characters back.
		nameClipped = !!el && el.scrollWidth > el.clientWidth + 1;
	}

	$effect(() => {
		editor.folderName;
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

	function countIn(branch: Branch): number {
		let n = branch.files.length;
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
	let workMenuEl: HTMLDivElement | null = $state(null);
	let fileMenuAt = $state({ x: 0, y: 0 });
	/** The TREE entry the open menu belongs to — null when the menu belongs to a shelf row. */
	const fileMenuEntry = $derived(
		editor.fileMenu?.list === 'tree' || editor.fileMenu?.list === 'cloud'
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
		if (!at || at.list === 'tree' || at.list === 'cloud') return null;
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
		putOnSheet('');
	}

	/** The tree entry, the shelf row or the scratch note the open menu belongs to, as one thing. */
	const menuDoc: MenuDoc | null = $derived.by(() => {
		const at = editor.fileMenu;
		if (!at) return null;

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

	/** Where a menu stands, given the event that asked for it. Shared by all three lists. */
	function placeMenu(
		event: MouseEvent,
		path: string,
		list: 'tree' | 'cloud' | 'loose' | 'ephemeral'
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
		editor.fileMenu = { path, x, y, list };
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
		if (refocus) ta?.focus();
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

	$effect(() => {
		const at = editor.workspaceAt;
		const el = workMenuEl;
		if (!at || !el) return;
		// LEFT-aligned to its key and pulled back off the right edge if it overhangs — this key is
		// at the far left of the bar on a desk and in the flyout's stack on a phone, and neither
		// place is anywhere near the edge it could fall off. The clamp is for the phone, where the
		// stack sits at the bottom and the menu opens upward into the window.
		const box = el.getBoundingClientRect();
		const left = Math.max(8, Math.min(at.x, window.innerWidth - box.width - 8));
		const top = Math.max(8, Math.min(at.y, window.innerHeight - box.height - 8));
		if (Math.abs(left - box.left) > 0.5) el.style.left = `${left}px`;
		if (Math.abs(top - box.top) > 0.5) el.style.top = `${top}px`;
		if (!el.contains(document.activeElement)) el.querySelector('button')?.focus();
	});

	// A menu whose row has gone — deleted, or the folder changed underneath it — is a menu aimed
	// at nothing. It comes down rather than staying open over the row that took its place.
	$effect(() => {
		if (editor.fileMenu && !fileMenuEntry && !shelfMenuRow) closeFileMenu();
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
	// The DATABASE is opened in $lib/dav-connections, which owns its version — there are two stores
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
		held = localStore(dir, OPENABLE);
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

	async function openHeldFolder() {
		if (!held) return;
		if (await adopt(held)) return;
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
		const next = davStore(configFor(c, secret), OPENABLE);
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

	/** Shut a drive's section without forgetting the drive. */
	function closeDrive() {
		drive = null;
		driveId = '';
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
		land(body, entry.name, null, !!from?.writable);
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
		adopt(snapshotStore('', picked, OPENABLE));
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
		putOnSheet(STARTER);
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
		if (wasProof && now !== 'proof') tick().then(() => ta?.focus());
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
						class:into={list === 'tree' && dropInto === row.path}
						class:fetching={busy}
						aria-busy={busy || undefined}
						role="treeitem"
						aria-level={row.depth + 1}
						aria-expanded={!row.shut}
						aria-selected="false"
						style:padding-left="calc(0.75rem + {row.depth} * 0.8rem)"
						ondragover={(e) => list === 'tree' && onDragOver(e, row.path)}
						ondragleave={(e) => list === 'tree' && onDragLeave(e, row.path)}
						ondrop={(e) => list === 'tree' && onDrop(e, row.path)}
						onclick={() => twist(row.path)}
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
				</li>
			{:else}
				{@const entry = row.entry}
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
							aria-haspopup="menu"
							title={entry.path}
							draggable={list === 'tree' && canMove()}
							ondragstart={(e) => onDragStart(e, entry)}
							ondragend={() => {
								dragging = '';
								dropInto = null;
							}}
							style:padding-left="calc(0.75rem + {row.depth} * 0.8rem)"
							onclick={() => openEntry(entry, list)}
							oncontextmenu={(e) => openFileMenu(e, entry, list)}
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
	rows: {
		id: string;
		name: string;
		list: 'loose' | 'ephemeral';
		open: () => void;
		menu: (e: MouseEvent) => void;
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
	     frosted face the other apps' flyout controls wear.
	     ORDER MATTERS and reads backwards: the stack is column-reverse so that the FIRST button
	     here lands nearest the thumb. The document keys, then the file keys — the bar's own
	     left-to-right — and the measure last, furthest away, because it is the one you set once
	     and forget.
	     THE EVENT IS PASSED ON. Most of these want nothing to do with it; Workspace opens a menu
	     and has to measure the disc it opens from, and on a phone that disc is the only thing that
	     knows where the bottom-left of the screen is. -->
	{#each [...DOC_KEYS, ...OPEN_KEYS].filter((k) => k.shown?.() ?? true) as k (k.id)}
		<button
			type="button"
			class="icon-btn"
			class:on={k.on?.()}
			class:done={k.done?.()}
			class:lost={k.lost?.()}
			title={k.title()}
			aria-label={k.label()}
			aria-expanded={k.opens?.() ? !!editor.workspaceAt : undefined}
			onclick={(e) => {
				k.run(e);
				if (k.folds()) keyOpen = false;
			}}>{@html k.svg}</button
		>
	{/each}
	<button
		type="button"
		class="icon-btn"
		class:on={editor.measured}
		aria-pressed={editor.measured}
		title={editor.measured ? 'Let the text run the full width' : 'Hold the text to a measure'}
		aria-label="Hold the text to a reading measure"
		onclick={() => (editor.measured = !editor.measured)}>{@html RULE_SVG}</button
	>
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
		class="icon-btn"
		class:on={!!editor.settingsAt}
		aria-expanded={!!editor.settingsAt}
		title="Settings — About, Install, Apps, and the version"
		aria-label="Settings"
		onclick={openSettings}>{@html GEAR_SVG}</button
	>
{/snippet}

<!-- The KEYS are not here. They live in the panel's dense bar, drawn by the catch-all page from
     $lib/TextEditorRack, and reach back into this component through the command table published
     in $lib/text-editor-state. What is left in the body is the work itself: the sheet, the proof, and
     the running foot under both. -->
<div
	class="te"
	class:te-write={shown === 'write'}
	class:te-proof-only={shown === 'proof'}
	class:te-measured={editor.measured}
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
				<div class="te-shelves">
					<!-- SCRATCH IS ALWAYS DRAWN (unless it is switched off in Settings). It used to
					     appear only once it had rows, which made the list you were about to add to
					     invisible until you had added to it — and there is always a row now anyway,
					     because the sheet is always a document with one. -->
					{#if editor.scratchShown}
						{@render shelf(
							'Scratch',
							editor.ephemeral.map((d) => ({
								id: d.id,
								name: d.name,
								list: 'ephemeral' as const,
								open: () => openEphemeral(d),
								menu: (e: MouseEvent) => openShelfMenu(e, d.id, 'ephemeral'),
								close: () => closeShelfRow({ id: d.id, list: 'ephemeral' })
							})),
							sortEphemeral,
							newEphemeral
						)}
					{/if}
					{#if editor.loose.length}
						{@render shelf(
							'Elsewhere',
							editor.loose.map((d) => ({
								id: d.id,
								name: d.name,
								list: 'loose' as const,
								open: () => openLoose(d),
								menu: (e: MouseEvent) => openShelfMenu(e, d.id, 'loose')
							}))
						)}
					{/if}
				</div>
				<!-- THE DRIVE — a fourth list, above the folder and below the shelves. It is not the
				     folder and never replaces it: a folder on the machine and a folder on a server are
				     different kinds of place, and somebody may reasonably keep both open.

				     It is drawn whenever a drive is CONNECTED OR REMEMBERED. A remembered one that has
				     not answered yet — or whose password could not be read back — gets its head and a
				     line saying so, rather than nothing at all: a workspace that vanishes because a
				     token expired looks exactly like a workspace that was never there, and the visitor
				     has no way to tell which. -->
				{#if editor.driveOpen || editor.drivePending}
					<section class="te-drive" aria-label="Drive: {editor.driveName}">
						<header class="te-work-head te-drive-head">
							<h2 class="te-work-name">{editor.driveName || 'Drive'}</h2>
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
							{#if !editor.drive.length}
								<p class="te-work-note">Nothing here this editor can open.</p>
							{/if}
						{/if}
					</section>
				{/if}
				<!-- THE FOLDER, head and all. The head used to be pinned to the TOP of the pane, above
				     the shelves and above the drive, while the rows it heads were at the bottom — so a
				     workspace called `Syncthing` announced itself three lists away from the first thing
				     inside it, and the row directly under its name belonged to something else.
				     A head names the list it is on top of, or it is a title for the pane; this pane has
				     four lists and no room for a title. -->
				<section class="te-local" aria-label="Workspace: {editor.folderName || 'folder'}">
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
						class:into={dropInto === ''}
						ondragover={(e) => onDragOver(e, '')}
						ondragleave={(e) => onDragLeave(e, '')}
						ondrop={(e) => onDrop(e, '')}
					>
						<!-- THE FOLDER'S OWN NAME, and now the whole of what this row is for. `Workspace`
					     as the placeholder rather than `Folder`: the row has the width for it since New,
					     Change and Hide left for the bar key's menu — that is what they were competing
					     with, and the name is the one thing in this row you cannot work out from
					     anywhere else. -->
						<h2 class="te-work-name" bind:this={workNameEl}>
							{editor.folderName || 'Workspace'}
						</h2>
						<!-- The folder's own tally comes LAST, past the keys, because it is one of a
					     column: every folder row in the tree below carries the same figure at the
					     same right edge, and this one is the head of that column rather than a
					     footnote to the name. -->
						<span class="te-work-count">{editor.folder.length}</span>
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
		{#if shown !== 'proof'}
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
									{#if marks[i]}<span class="te-margin-mark">{marks[i]}</span>{/if}<!--
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
		{#if editor.contentsShown && !editor.narrow}
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
			<button
				type="button"
				role="menuitem"
				class="popover-item"
				onclick={() => {
					closeFileMenu();
					copyDoc(doc);
				}}>Copy</button
			>
			<button
				type="button"
				role="menuitem"
				class="popover-item"
				onclick={() => {
					closeFileMenu();
					saveCopy(doc);
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
	{#if editor.workspaceAt}
		<button
			class="popover-scrim"
			aria-label="Close the workspace menu"
			onclick={() => (editor.workspaceAt = null)}
		></button>
		<div
			class="popover te-work-menu"
			role="menu"
			aria-label="Workspace"
			tabindex="-1"
			bind:this={workMenuEl}
			style:left="{editor.workspaceAt.x}px"
			style:top="{editor.workspaceAt.y}px"
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					editor.workspaceAt = null;
				}
			}}
		>
			<!-- New is offered EVERYWHERE. It used to need a writable folder to create into, which
			     made it a Chromium key; a scratch note needs nothing but a sheet. -->
			<button
				type="button"
				role="menuitem"
				class="popover-item"
				onclick={() => {
					editor.workspaceAt = null;
					newEphemeral();
				}}>New note</button
			>
			<button
				type="button"
				role="menuitem"
				class="popover-item"
				onclick={() => {
					editor.workspaceAt = null;
					pickFolder();
				}}>{editor.folderName ? 'Change folder…' : 'Open a folder…'}</button
			>
			<!-- Hide and Show are ONE item that says which it will do, rather than two with one of
			     them dead. The pane is the only thing in this app that a key both opens and closes. -->
			<button
				type="button"
				role="menuitem"
				class="popover-item"
				onclick={() => {
					editor.folderShown = !editor.folderShown;
					editor.workspaceAt = null;
				}}>{editor.folderShown ? 'Hide the workspace' : 'Show the workspace'}</button
			>
		</div>
	{/if}

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
			card={shown === 'proof' ? undefined : markCard}
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
				<div class="te-count">
					<dt>Words</dt>
					<dd>{pad(count.words)}</dd>
				</div>
				<div class="te-count">
					<dt>Chars</dt>
					<dd>{pad(count.chars)}</dd>
				</div>
				<div class="te-count">
					<dt>Read</dt>
					<dd>{count.minutes ? `${pad(count.minutes)} min` : '—'}</dd>
				</div>
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
		/* The margin the marks hang in, and the one measure the sheet and the mirror share. */
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
		--te-pad: 1.5rem;
		/* The sheet's measure, in the mono face: ~82 columns once the gutter and the right pad
		   come out of it. The proof's is narrower because prose sets wider per pixel — 34rem of
		   IBM Plex is about 68 characters, which is the same reading comfort. */
		/* The band of gutter round and between the columns. */
		--te-gutter: 0.4rem;
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

	/* ── The sheet ─────────────────────────────────────────────────────────────
	   The scroller. Paper white under Pixelite (--surface is the white sheet), with the margin's
	   rule drawn as a background line rather than a border, so it runs the full scroll height
	   instead of stopping at the viewport. */
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
		padding: var(--te-pad) clamp(1.25rem, 3vw, 2.5rem) 40vh;
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
		margin: 0 0 1.2rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--te-rule);
		font-family: var(--font-motto, Georgia, serif);
		font-size: clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem);
		font-weight: 400;
		line-height: 1.15;
	}
	.te-proof :global(h2) {
		margin: 2.2rem 0 0.7rem;
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
	.te-proof :global(h2::before) {
		content: counter(te-sec, decimal-leading-zero);
		margin-right: 0.6rem;
		font-family: var(--font-pixel, monospace);
		font-size: 1.15em;
		color: var(--orange);
	}
	/* Third level drops out of the serif into the manual's running-head voice — mono, uppercase,
	   tracked. Two serif sizes that close together read as an accident; a change of voice does
	   not. */
	.te-proof :global(h3),
	.te-proof :global(h4),
	.te-proof :global(h5),
	.te-proof :global(h6) {
		margin: 1.6rem 0 0.5rem;
		font-family: var(--font-mono, monospace);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--ink) 65%, transparent);
	}
	.te-proof :global(p) {
		margin: 0 0 1rem;
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
		margin: 0 0 1.4rem;
		padding: 1.7rem 1rem 0.9rem;
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
		font-family: var(--font-pixel, monospace);
		font-size: 0.95rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
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
		margin: 0 0 1.2rem;
		padding: 0.1rem 0 0.1rem 1.1rem;
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
		margin: 0 0 1.1rem;
		padding-left: 1.5rem;
	}
	.te-proof :global(li) {
		margin-bottom: 0.35rem;
	}
	/* The marker is chrome, so it speaks the chrome's language — cobalt, in the mono face. */
	.te-proof :global(li::marker) {
		color: var(--orange);
		font-family: var(--font-mono, monospace);
		font-size: 0.85em;
	}
	/* A nested list is tighter than its parent: it is a sub-point, not a second document. */
	.te-proof :global(li > ul),
	.te-proof :global(li > ol) {
		margin: 0.35rem 0 0;
	}
	.te-proof :global(hr) {
		height: 1px;
		margin: 2rem 0;
		border: 0;
		/* The site's own fading rule, so a break in the proof is the break the docs pages draw. */
		background: var(--rule-fade, var(--te-rule));
	}
	.te-proof :global(table) {
		width: 100%;
		margin: 0 0 1.3rem;
		border-collapse: collapse;
		font-size: 0.92rem;
	}
	.te-proof :global(th) {
		padding: 0.45rem 0.6rem;
		border-bottom: 1px solid var(--card-edge, var(--te-rule));
		font-family: var(--font-mono, monospace);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-align: left;
		color: color-mix(in srgb, var(--ink) 65%, transparent);
	}
	.te-proof :global(td) {
		padding: 0.45rem 0.6rem;
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
		/* No rule down its edge either: it is a sheet on the same gutter as the panes beside it. */
		background: var(--surface);
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
		gap: 0.4rem;
		min-height: 30px;
		padding: 0.25rem 0.75rem;
	}
	/* The name takes what the keys leave, and no less than nothing: `min-width: 0` is what makes
	   a flex child agree to be narrower than its own text, and without it the name would push the
	   keys off the pane instead of ellipsising. */
	.te-work-name {
		margin: 0;
		flex: 1 1 auto;
		min-width: 0;
		font-family: var(--font-mono, monospace);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
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
		padding: 0.35rem 0.5rem;
		font-family: var(--font-mono, monospace);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
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
		padding: 0 0.4rem;
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
		   shelf's own HEAD is what parts it from whatever is above, and the shading is what parts
		   the block from the tree; a margin as well is the same boundary drawn a third time. */
		background: color-mix(in srgb, var(--ink) 4%, var(--surface));
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
	/* The manual's running-head voice — the same one a folder row in the tree is set in, because
	   this is the same kind of thing: a heading over a handful of documents. */
	/* A-Z on the Scratch head. Set as small as the tally beside it and in the same muted ink: it
	   is a key, but it is a key about the LIST rather than about a document, and the documents are
	   what this pane is for. */
	.te-loose-sort {
		flex: none;
		padding: 0 0.25rem;
		font-family: var(--font-mono, monospace);
		font-size: 0.6rem;
		letter-spacing: 0.04em;
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
	   stated because a lone `+` in the mono face sits high in its own box, and the row is 30px of
	   things that all have to sit on one line. */
	.te-loose-add {
		font-size: 0.85rem;
		line-height: 1;
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
		font-family: var(--font-mono, monospace);
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
		padding: 0 0.3rem;
		font-size: 0.55rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
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
	   set in different faces and different sizes (a folder name is the running-head voice, a
	   filename is the mono one), and left to their own type they came out a pixel or two apart,
	   which reads as a list that has been assembled rather than one that was set.
	   A flex row with a floor under it, rather than padding alone: padding plus a smaller face is
	   still a smaller row. */
	.te-work-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		width: 100%;
		min-height: 30px;
		padding: 0.3rem 0.75rem;
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
		font-family: var(--font-mono, monospace);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
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
	.te-drive,
	.te-local {
		border-top: 1px solid var(--pixel-hairline, rgba(0, 0, 0, 0.12));
	}
	/* Except at the very top, where a rule would be drawing the pane's own edge twice. */
	.te-work > .te-local:first-child {
		border-top: 0;
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
		font-family: var(--font-mono, monospace);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
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
		padding: 0.25rem 0.5rem;
	}
	.te-work-field {
		width: 100%;
		box-sizing: border-box;
		height: 26px;
		padding: 0 0.4rem;
		font-family: var(--font-mono, monospace);
		font-size: 0.76rem;
		color: var(--ink);
	}
	/* The remembered-but-shut state: named, explained, one key. */
	.te-work-shut .te-work-note {
		border-top: 0;
	}
	.te-work-reconnect {
		align-self: flex-start;
		margin: 0 0.75rem 0.75rem;
		height: 26px;
		padding: 0 0.6rem;
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
		padding: 0.8rem 0.75rem 0.6rem;
		font-size: 0.66rem;
		line-height: 1.4;
		color: var(--sub);
	}
	.te-work-file {
		flex: 1 1 auto;
		min-width: 0;
		line-height: 1.3;
		font-family: var(--font-mono, monospace);
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
		letter-spacing: 0.04em;
		text-transform: uppercase;
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
	/* How many documents are under a shut folder. Set in the pixel voice, like the count in the
	   header, because it is the same fact about a smaller thing. */
	.te-work-tally {
		flex: none;
		font-family: var(--font-pixel, var(--font-mono, monospace));
		font-size: 0.8rem;
		line-height: 1;
		color: var(--sub);
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
	   other side, so the desk reads as a spread with the writing in the middle. */
	.te-toc {
		flex: none;
		width: 13rem;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
		border-radius: 4px;
		background: var(--surface);
		/* No top inset — the head is a row and brings its own. */
		padding: 0 0 0.75rem;
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
		padding: 0.25rem 0.75rem;
		font-family: var(--font-mono, monospace);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
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
		gap: 0.4rem;
		width: 100%;
		padding: 0.25rem 0.75rem;
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
	   informs, and h4–h6 are the mono running-head voice in the proof anyway. */
	.te-toc-link.lvl-1 {
		font-weight: 600;
		color: var(--ink);
	}
	.te-toc-link.lvl-2 {
		padding-left: 1.4rem;
	}
	.te-toc-link.lvl-3,
	.te-toc-link.lvl-4,
	.te-toc-link.lvl-5,
	.te-toc-link.lvl-6 {
		padding-left: 2.1rem;
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
		padding: 0 0.75rem;
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
		gap: 0.5rem;
		/* The one place a popover item is not in the mono voice: these ARE headings. */
		font-family: var(--font-motto, Georgia, serif);
	}
	.te-heads-mark {
		margin-left: auto;
		font-family: var(--font-mono, monospace);
		font-size: 0.68rem;
		color: var(--sub);
	}
	.te-heads-none {
		font-family: var(--font-mono, monospace);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
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
	.te-work-menu {
		min-width: 12rem;
	}

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
		gap: 0.4rem;
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
		font-family: var(--font-mono, ui-monospace, monospace);
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
	   The tally, set the way a manual foots a page: mono labels, pixel figures, one hairline
	   over the lot. Fixed to the bottom of the desk, never scrolling with either pane. */
	.te-foot {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 1.1rem;
		padding: 0.5rem clamp(0.75rem, 2vw, 1.25rem);
		border-top: 1px solid var(--te-rule);
	}
	.te-tally {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.1rem;
		margin: 0;
	}
	.te-count {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}
	.te-count dt {
		font-family: var(--font-mono, monospace);
		font-size: 0.66rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
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
	.te-lamp {
		margin: 0 0 0 auto;
		font-family: var(--font-mono, monospace);
		font-size: 0.66rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
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
			--te-pad: 1rem;
		}
		.te-desk {
			flex-direction: column;
		}
		.te-pane + .te-pane {
			border-left: 0;
			border-top: 1px solid var(--te-rule);
		}
		/* The workspace cannot be a column on a phone — there is only room for one. It becomes a
		   sheet over the desk instead, and closes when you pick from it (see `load`). */
		.te-work {
			position: absolute;
			z-index: 5;
			inset: var(--bar-h, 60px) 0 0 0;
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
