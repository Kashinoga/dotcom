<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { renderMarkdown, tally, lineMarks } from '$lib/markdown';
	import {
		editor,
		shownMode,
		MARKS,
		DOC_KEYS,
		OPEN_KEYS,
		OPENABLE,
		HEADING_LEVELS,
		openHeadings,
		type FolderEntry
	} from '$lib/text-editor-state.svelte';
	import FloatingKey from '$lib/FloatingKey.svelte';
	import { NIB_SVG, RULE_SVG } from '$lib/icons';

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
	/** The running foot's measured height — the floating key sits clear above it. */
	let footHeight = $state(0);

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
		} catch {
			// Private mode, a storage quota, a browser with storage switched off. The editor works
			// perfectly well without persistence; it just forgets. Nothing to tell the visitor.
		}

		// The editor owns the media query even though the RACK is what reads it: the rack only
		// exists while the editor does, and one listener beats two that could disagree.
		const mq = window.matchMedia('(max-width: 820px)');
		editor.narrow = mq.matches;
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
		// The folder from last time. Never pops a permission dialog on load — see recallFolder.
		recallFolder();

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
			copy,
			download,
			clear: clearSheet,
			openFile,
			openFolder,
			saveInPlace,
			heading,
			newFile: () => (editor.naming = true)
		};

		return () => {
			mq.removeEventListener('change', onMq);
			fine.removeEventListener('change', onFine);
			document.removeEventListener('selectionchange', onSelectionChange);
			clearTimeout(saveTimer);
			clearTimeout(copyTimer);
			clearTimeout(armTimer);
			editor.cmd = null;
			editor.copied = false;
			editor.armed = false;
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
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(`${STORE}:mode`, editor.mode);
			localStorage.setItem(`${STORE}:measure`, editor.measured ? '1' : '0');
		} catch {
			/* nothing to do */
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
			if (k === 's') return stop(event, () => (editor.openHandle ? saveInPlace() : download()));
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
	// The two confirmation lamps live in $lib/text-editor-state rather than here, because the keys that
	// show them are in the bar. The TIMERS stay here, with the verbs that set them.
	let copyTimer = 0;

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Blocked clipboard (insecure context, denied permission) — the same fallback the
			// Emoji Viewer keeps, so a tap still copies rather than silently failing.
			const scratch = document.createElement('textarea');
			scratch.value = text;
			scratch.style.position = 'fixed';
			scratch.style.opacity = '0';
			document.body.appendChild(scratch);
			scratch.select();
			try {
				document.execCommand('copy');
			} catch {
				scratch.remove();
				return; // leave the lamp unset — no false confirmation
			}
			scratch.remove();
		}
		editor.copied = true;
		clearTimeout(copyTimer);
		copyTimer = window.setTimeout(() => (editor.copied = false), 1400);
	}

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
	 * Put a document on the sheet. It goes through `write`, like every other edit, so opening the
	 * wrong file is UNDOABLE — Cmd-Z brings back what was there. That is the whole reason opening
	 * does not have to ask first.
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
		if (!ta) return;
		ta.focus();
		ta.setSelectionRange(0, ta.value.length);
		write(body.replace(/\r\n?/g, '\n'));
		editor.filename = file.name;
		editor.openHandle = handle;
		// The workspace STAYS OPEN when you pick from it — that is what makes it a workspace
		// rather than a picker. It closes on a phone, where it covers the sheet it just filled.
		if (editor.narrow) editor.folderShown = false;
		ta.setSelectionRange(0, 0);
		trackCaret();
	}

	function openFile() {
		fileInput?.click();
	}

	/**
	 * With no workspace open, this picks a folder. With one open it TOGGLES the pane — the same
	 * key, because once a folder is loaded "Folder" is a place you go rather than a thing you
	 * choose, and a second key to show a pane that is already loaded is a key too many. Changing
	 * folders is inside the pane, where the folder you would be changing is named.
	 */
	function openFolder() {
		if (editor.folder.length) {
			editor.folderShown = !editor.folderShown;
			return;
		}
		pickFolder();
	}

	// ── Writing, where the browser allows it ──────────────────────────────────
	// Everything below needs a live handle, which only `showDirectoryPicker` yields and only
	// Chromium implements. See `canWrite` in $lib/text-editor-state for why the detect is on that
	// one function and not on the handle classes, which exist everywhere and reach nothing.

	/** Folders not worth walking into. A workspace is for documents, not for a dependency tree. */
	const SKIP_DIR = /^(node_modules|\.git|\.svn|\.hg|\.cache|dist|build|\.next|\.svelte-kit)$/;

	/** Collect the openable documents under a directory handle, depth first, path in hand. */
	async function walk(dir: FileSystemDirectoryHandle, prefix: string, out: FolderEntry[]) {
		// A folder can be arbitrarily deep and arbitrarily large; a workspace that walked all of
		// it would hang on a home directory. Stop at a depth and a count that still cover any
		// notes folder anyone actually keeps.
		if (out.length > 500 || prefix.split('/').length > 6) return;
		for await (const [name, entry] of dir.entries()) {
			const path = prefix ? `${prefix}/${name}` : name;
			if (entry.kind === 'directory') {
				if (!SKIP_DIR.test(name) && !name.startsWith('.')) {
					await walk(entry as FileSystemDirectoryHandle, path, out);
				}
			} else if (OPENABLE.test(name)) {
				out.push({ name, path, handle: entry as FileSystemFileHandle, parent: dir });
			}
		}
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
		const out: FolderEntry[] = [];
		try {
			await walk(dir, '', out);
		} catch {
			/* a folder that went away mid-walk — take what was gathered */
		}
		out.sort((a, b) => a.path.localeCompare(b.path));
		editor.folder = out;
		editor.folderName = dir.name;
		editor.folderShown = true;
		editor.openPath = '';
		heldFolder = dir;
		editor.folderPending = false;
		rememberFolder(dir);
	}

	/** Write the sheet back to the file it came from. */
	async function saveInPlace() {
		const handle = editor.openHandle;
		if (!handle) return;
		try {
			const w = await handle.createWritable();
			await w.write(text);
			await w.close();
		} catch {
			// Permission withdrawn, or the file went away. Nothing was written; say nothing rather
			// than claim a save that did not happen.
			return;
		}
		editor.saved = true;
		clearTimeout(savedTimer);
		savedTimer = window.setTimeout(() => (editor.saved = false), 1400);
	}
	let savedTimer = 0;

	/**
	 * Make a new document in the open folder, and open it. Needs a directory handle to create
	 * INTO, so it is offered only where the rest of the writing is — a "new file" that could not
	 * be written anywhere would just be the Clear key with a longer name.
	 */
	async function newFile(name: string) {
		const base = name.trim();
		editor.naming = false;
		if (!base || !heldFolder) return;
		// A name, not a path: creating into another directory is a different verb, and a text
		// field in a sidebar is the wrong place to offer one.
		if (/[/\\]/.test(base)) return;
		const file = OPENABLE.test(base) ? base : `${base}.md`;
		let handle: FileSystemFileHandle;
		try {
			handle = await heldFolder.getFileHandle(file, { create: true });
		} catch {
			return;
		}
		const entry: FolderEntry = { name: file, path: file, handle, parent: heldFolder };
		// Only add it if the walk did not already know it — `create: true` on an existing name
		// hands back the existing file rather than failing, and opening that is the right thing.
		if (!editor.folder.some((e) => e.path === entry.path)) {
			editor.folder = [...editor.folder, entry].sort((a, b) => a.path.localeCompare(b.path));
		}
		await openEntry(entry);
	}

	/** Rename an entry on disk, and follow it if it is the one on the sheet. */
	async function rename(entry: FolderEntry, to: string) {
		const name = to.trim();
		editor.renaming = '';
		if (!name || name === entry.name || !entry.handle) return;
		// A name is a NAME, not a path — a rename that could write into another directory is a
		// move, and a text field in a list is the wrong place to offer one.
		if (/[/\\]/.test(name)) return;
		try {
			await entry.handle.move(name);
		} catch {
			return;
		}
		const was = entry.path;
		entry.name = name;
		entry.path = was.includes('/') ? `${was.slice(0, was.lastIndexOf('/'))}/${name}` : name;
		editor.folder = [...editor.folder].sort((a, b) => a.path.localeCompare(b.path));
		if (editor.openPath === was) {
			editor.openPath = entry.path;
			editor.filename = name;
		}
	}

	/** Delete an entry from disk. Two presses, like Clear — see `doomed`. */
	async function remove(entry: FolderEntry) {
		if (editor.doomed !== entry.path) {
			editor.doomed = entry.path;
			clearTimeout(doomTimer);
			doomTimer = window.setTimeout(() => (editor.doomed = ''), 3000);
			return;
		}
		clearTimeout(doomTimer);
		editor.doomed = '';
		if (!entry.parent) return;
		try {
			await entry.parent.removeEntry(entry.name);
		} catch {
			return;
		}
		editor.folder = editor.folder.filter((e) => e.path !== entry.path);
		// The sheet keeps what it is showing — the words are still yours even though the file is
		// gone — but it is no longer that file, so it stops claiming to be.
		if (editor.openPath === entry.path) {
			editor.openPath = '';
			editor.filename = '';
			editor.openHandle = null;
		}
	}
	let doomTimer = 0;

	// ── Remembering the folder ────────────────────────────────────────────────
	// A directory HANDLE can be stored — it is a structured-cloneable object, so IndexedDB will
	// take one — and re-used on the next visit. A `webkitdirectory` File cannot: it is a snapshot
	// with nothing behind it. So this only helps where the File System Access API does, which is
	// the same place everything else about writing only helps.
	//
	// The permission does NOT survive with it. On the next visit the handle is remembered but its
	// grant has lapsed to 'prompt', and a browser will only re-ask during a user gesture — so the
	// workspace comes back as a NAMED, unopened folder with one key to reconnect it, rather than
	// popping a permission dialog at somebody who has just loaded a page.
	const HANDLE_DB = 'ksh:text-editor';

	function handleStore(mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
		return new Promise((resolve) => {
			if (typeof indexedDB === 'undefined') return resolve(null);
			const req = indexedDB.open(HANDLE_DB, 1);
			req.onupgradeneeded = () => req.result.createObjectStore('handles');
			req.onsuccess = () => {
				try {
					resolve(req.result.transaction('handles', mode).objectStore('handles'));
				} catch {
					resolve(null);
				}
			};
			req.onerror = () => resolve(null);
		});
	}

	async function rememberFolder(dir: FileSystemDirectoryHandle | null) {
		const store = await handleStore('readwrite');
		if (!store) return;
		try {
			if (dir) store.put(dir, 'folder');
			else store.delete('folder');
		} catch {
			/* private mode, or a browser that will not clone a handle — forgetting is survivable */
		}
	}

	/** The folder from last time, if the browser kept it and still lets us read it. */
	async function recallFolder() {
		if (!editor.canWrite) return;
		const store = await handleStore('readonly');
		if (!store) return;
		const dir: FileSystemDirectoryHandle | null = await new Promise((resolve) => {
			const req = store.get('folder');
			req.onsuccess = () => resolve(req.result ?? null);
			req.onerror = () => resolve(null);
		});
		if (!dir) return;
		editor.folderName = dir.name;
		heldFolder = dir;
		// Granted already (same session, or a browser that persisted the grant) — open it outright.
		// Otherwise leave it named and shut, for `reconnect` to ask about on a real click.
		const state = await dir.queryPermission?.({ mode: 'readwrite' });
		if (state === 'granted') await openHeldFolder();
		else editor.folderPending = true;
	}

	let heldFolder: FileSystemDirectoryHandle | null = null;

	async function openHeldFolder() {
		if (!heldFolder) return;
		const out: FolderEntry[] = [];
		try {
			await walk(heldFolder, '', out);
		} catch {
			// The folder moved, or was deleted, or the grant went away between the check and here.
			editor.folderPending = false;
			editor.folderName = '';
			await rememberFolder(null);
			return;
		}
		out.sort((a, b) => a.path.localeCompare(b.path));
		editor.folder = out;
		editor.folderPending = false;
		editor.folderShown = true;
	}

	/** The one thing a remembered folder needs: a click, so the browser will re-ask. */
	async function reconnect() {
		if (!heldFolder) return;
		const state = await heldFolder.requestPermission?.({ mode: 'readwrite' });
		if (state !== 'granted') return;
		await openHeldFolder();
	}

	function pickFolder() {
		if (editor.canWrite) return pickWritableFolder();
		// Re-opening the same folder should re-read it, so the value is cleared first — an input
		// handed the same directory twice fires no change event otherwise.
		if (folderInput) folderInput.value = '';
		folderInput?.click();
	}

	/**
	 * Put an entry on the sheet and mark it as the one the workspace is showing. An entry arrives
	 * either as a read-only File (every browser) or as a live handle (Chromium) — the handle is
	 * what later makes saving, renaming and deleting possible, so it is carried through.
	 */
	async function openEntry(entry: FolderEntry) {
		const file = entry.handle ? await entry.handle.getFile() : entry.file;
		if (!file) return;
		editor.openPath = entry.path;
		load(file, entry.handle ?? null);
	}

	function tookFolder(event: Event) {
		const picked = [...((event.currentTarget as HTMLInputElement).files ?? [])];
		const entries = picked
			.filter((f) => OPENABLE.test(f.name))
			.map((f) => ({ name: f.name, path: f.webkitRelativePath || f.name, file: f }))
			.sort((a, b) => a.path.localeCompare(b.path));
		editor.folder = entries;
		// The folder's own name is the first segment of any entry's relative path.
		editor.folderName = entries[0]?.path.split('/')[0] ?? '';
		editor.folderShown = true;
		editor.openPath = '';
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

	// Clearing the sheet is the one irreversible thing in here, so the key asks. It asks by
	// BECOMING the question rather than by opening a dialog: a confirm() is a modal that stops
	// the page, and the manual's answer to "are you sure" is a key that changes what it says.
	let armTimer = 0;

	function clearSheet() {
		if (!editor.armed) {
			editor.armed = true;
			clearTimeout(armTimer);
			armTimer = window.setTimeout(() => (editor.armed = false), 3000);
			return;
		}
		clearTimeout(armTimer);
		editor.armed = false;
		editor.filename = '';
		editor.openPath = '';
		editor.openHandle = null;
		if (!ta) return;
		ta.focus();
		ta.setSelectionRange(0, text.length);
		write('');
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

{#snippet docKeys()}
	<!-- `icon-btn` is the class FloatingKey's stack dresses: it gives these the touch-sized
	     frosted face the other apps' flyout controls wear.
	     ORDER MATTERS and reads backwards: the stack is column-reverse so that the FIRST button
	     here lands nearest the thumb. Copy, then the download, then Clear — the bar's own
	     left-to-right — and the measure last, furthest away, because it is the one you set once
	     and forget. -->
	{#each [...DOC_KEYS, ...OPEN_KEYS].filter((k) => k.shown?.() ?? true) as k (k.id)}
		<button
			type="button"
			class="icon-btn"
			class:on={k.on?.()}
			title={k.title()}
			aria-label={k.label()}
			onclick={() => {
				k.run();
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
{/snippet}

<!-- The KEYS are not here. They live in the panel's dense bar, drawn by the catch-all page from
     $lib/TextEditorRack, and reach back into this component through the command table published
     in $lib/text-editor-state. What is left in the body is the work itself: the sheet, the proof, and
     the running foot under both. -->
<div
	class="te"
	style:--te-foot-h="{footHeight}px"
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
			<aside class="te-work" aria-label="Workspace: {editor.folderName || 'folder'}">
				<header class="te-work-head">
					<h2 class="te-work-name" title={editor.folderName}>{editor.folderName || 'Folder'}</h2>
					<span class="te-work-count">{editor.folder.length}</span>
					{#if editor.canWrite}
						<button
							type="button"
							class="tb te-work-act"
							onclick={() => (editor.naming = true)}
							title="Make a new document in this folder">New</button
						>
					{/if}
					<button
						type="button"
						class="tb te-work-act"
						onclick={pickFolder}
						title="Open a different folder">Change</button
					>
					<button
						type="button"
						class="tb te-work-act"
						onclick={() => (editor.folderShown = false)}
						title="Hide the workspace">Hide</button
					>
				</header>
				{#if editor.naming}
					<form
						class="te-work-rename"
						onsubmit={(e) => {
							e.preventDefault();
							newFile(new FormData(e.currentTarget).get('name') as string);
						}}
					>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="field te-work-field"
							name="name"
							placeholder="new-document.md"
							autofocus
							aria-label="Name for the new document"
							onkeydown={(e) => {
								if (e.key === 'Escape') editor.naming = false;
							}}
							onblur={() => (editor.naming = false)}
						/>
					</form>
				{/if}
				<ul class="te-work-list">
					{#each editor.folder as entry (entry.path)}
						<li class="te-work-item">
							{#if editor.renaming === entry.path}
								<!-- Renaming happens IN the row, not in a dialog. The row is where the name
								     is, and a prompt() would stop the page to ask about one word. -->
								<form
									class="te-work-rename"
									onsubmit={(e) => {
										e.preventDefault();
										rename(entry, new FormData(e.currentTarget).get('name') as string);
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
								<button
									type="button"
									class="te-work-row"
									class:on={editor.openPath === entry.path}
									aria-current={editor.openPath === entry.path ? 'true' : undefined}
									onclick={() => openEntry(entry)}
								>
									<span class="te-work-file">{entry.name}</span>
									{#if entry.path !== entry.name}
										<span class="te-work-path">{entry.path}</span>
									{/if}
								</button>
								{#if editor.canWrite && entry.handle}
									<!-- The two verbs the browser will actually carry out, and only where it
									     will. They are held back until the row is hovered or focused so the
									     list reads as a list; Delete asks twice, like Clear. -->
									<span class="te-work-verbs">
										<button
											type="button"
											class="te-work-verb"
											title="Rename {entry.name}"
											onclick={() => {
												editor.doomed = '';
												editor.renaming = entry.path;
											}}>Rename</button
										>
										<button
											type="button"
											class="te-work-verb"
											class:on={editor.doomed === entry.path}
											title={editor.doomed === entry.path
												? `Press again to delete ${entry.name}`
												: `Delete ${entry.name}`}
											onclick={() => remove(entry)}
											>{editor.doomed === entry.path ? 'Sure?' : 'Delete'}</button
										>
									</span>
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
				{#if !editor.folder.length}
					<!-- An EMPTY folder still gets its sidebar. It used to be hidden — and once New
					     existed that meant the one place to make a first document disappeared exactly
					     when it was needed. -->
					<p class="te-work-note">
						{editor.canWrite
							? 'Nothing here this editor can open yet. New makes one.'
							: 'Nothing here this editor can open — it takes Markdown and plain text.'}
					</p>
				{/if}
				{#if !editor.canWrite}
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
	</div>

	{#if editor.headingAt}
		<!-- THE HEADING MENU. Rendered here rather than beside the key that opens it, for two
		     reasons: the marks live in a strip that SCROLLS, and a popover inside it would be
		     clipped by its own scroller; and on a phone that strip is not drawn at all, while the
		     flyout's grid still needs the same menu. Fixed, at the key's measured rect. -->
		<button
			class="te-scrim"
			aria-label="Close the heading menu"
			onclick={() => (editor.headingAt = null)}
		></button>
		<div
			class="te-heads-menu"
			role="menu"
			aria-label="Heading level"
			style:left="{editor.headingAt.x}px"
			style:top="{editor.headingAt.y}px"
		>
			{#each HEADING_LEVELS as level (level)}
				<button
					type="button"
					role="menuitem"
					class="te-heads-item"
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
				class="te-heads-item te-heads-none"
				onclick={() => {
					editor.cmd?.heading(0);
					editor.headingAt = null;
				}}>No heading</button
			>
		</div>
	{/if}

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
			if (f) load(f);
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
	     lamp at the end says whether what is on screen has reached storage yet. -->
	<div class="te-foot" bind:clientHeight={footHeight}>
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
</div>

<style>
	/* ── The desk ──────────────────────────────────────────────────────────────
	   Full height of whatever the stage gives it, in three bands: the rack, the desk, the foot.
	   Only the middle band scrolls — the rack and the foot are always to hand, which is the
	   whole reason an editor takes the viewport rather than sitting in a scrolling panel. */
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

	.te-proof :global(h1) {
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
	/* A fenced block is a LISTING, and is numbered as one. The tag rides the top-right corner
	   in the pixel face, off the page field rather than the slab, so it reads as a caption on
	   the block and not as the block's first line. */
	.te-proof :global(pre) {
		position: relative;
		margin: 0 0 1.4rem;
		padding: 1.1rem 1rem 0.9rem;
		overflow-x: auto;
		background: var(--page);
		border: 1px solid var(--te-rule);
		border-radius: 2px;
		counter-increment: te-listing;
	}
	.te-proof :global(pre::before) {
		content: 'Listing ' counter(te-listing, decimal-leading-zero);
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
	.te-work {
		border-radius: 4px;
		overflow: hidden;
		flex: none;
		width: 15rem;
		display: flex;
		flex-direction: column;
		min-height: 0;
		/* No rule down its edge either: it is a sheet on the same gutter as the panes beside it. */
		background: var(--surface);
	}
	.te-work-head {
		flex: none;
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		padding: 0.6rem 0.75rem 0.4rem;
	}
	.te-work-name {
		margin: 0;
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
	.te-work-act:first-of-type {
		margin-left: auto;
	}
	.te-work-list {
		margin: 0;
		padding: 0;
		list-style: none;
		overflow-y: auto;
	}
	/* Each row is the catalog row the Apps index uses — a hairline under it, the accent on
	   hover, nothing floating. The OPEN one is marked, because a workspace whose list does not
	   say which file you are looking at is a list rather than a workspace. */
	/* No rule under each row. A list of four documents does not need three lines drawn through
	   it: the rows are already parted by their own leading, and the hover tint and the marked
	   row are what actually need to be seen. The same argument as the panes beside it. */
	.te-work-row {
		display: block;
		width: 100%;
		padding: 0.4rem 0.75rem;
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
	/* A row and its verbs share the item, the verbs held back until the row is reached for — a
	   list of documents should read as a list, not as a list of buttons. */
	.te-work-item {
		position: relative;
	}
	.te-work-verbs {
		position: absolute;
		right: 0.4rem;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		gap: 0.25rem;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.12s ease;
	}
	.te-work-item:hover .te-work-verbs,
	.te-work-item:focus-within .te-work-verbs {
		opacity: 1;
		pointer-events: auto;
	}
	.te-work-verb {
		font-family: var(--font-mono, monospace);
		font-size: 0.6rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 0.2rem 0.35rem;
		color: var(--ink);
		background: var(--surface);
		border: 1px solid var(--te-rule);
		border-radius: 3px;
		cursor: pointer;
	}
	.te-work-verb:hover {
		color: var(--orange);
		border-color: var(--orange);
	}
	.te-work-verb.on {
		color: var(--orange);
		border-color: var(--orange);
		background: var(--pixel-key-on, transparent);
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
	/* Said once, at the foot of the list, rather than by drawing verbs that would not work. */
	.te-work-note {
		flex: none;
		margin: 0;
		padding: 0.6rem 0.75rem;
		border-top: 1px solid var(--te-rule);
		font-size: 0.66rem;
		line-height: 1.4;
		color: var(--sub);
	}
	.te-work-file {
		display: block;
		font-family: var(--font-mono, monospace);
		font-size: 0.76rem;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.te-work-path {
		display: block;
		margin-top: 0.1rem;
		font-size: 0.66rem;
		color: var(--sub);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* THE FLOATING KEY sits clear of the running foot rather than on it. $lib/FloatingKey pins
	   itself 1.25rem off the bottom, which is right in an app whose content runs to the edge —
	   this one ends in a fixed foot, and the key was landing on the tally. Overridden with
	   :global() because the class belongs to that component; the offset is the foot's MEASURED
	   height, so it follows the foot when it wraps to two lines on a narrow screen.
	   The class is DOUBLED for weight. FloatingKey styles its own key as `.fkey.svelte-hash`, which
	   is (0,2,0); a bare `:global(.fkey)` is (0,1,0) and loses, and `:global(.te .fkey)` merely
	   ties and would be decided by whichever component's stylesheet happened to be injected last.
	   `.fkey.fkey` is (0,3,0) and settles it. */
	:global(.te .fkey.fkey) {
		bottom: calc(var(--te-foot-h, 0px) + 1.25rem);
	}

	/* ── The heading menu ──────────────────────────────────────────────────────
	   Six levels, set in their own sizes so the list shows what it is offering rather than
	   naming it — the manual's own trick, and the reason a menu beats six keys here. */
	.te-scrim {
		position: fixed;
		inset: 0;
		z-index: 30;
		border: 0;
		padding: 0;
		background: transparent;
		cursor: default;
	}
	.te-heads-menu {
		position: fixed;
		z-index: 31;
		min-width: 11rem;
		padding: 0.25rem;
		background: var(--surface);
		border: 1px solid var(--te-rule);
		border-radius: 3px;
		box-shadow: var(--pixel-paper-shadow, 0 10px 30px rgba(0, 0, 0, 0.18));
	}
	.te-heads-item {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		padding: 0.3rem 0.5rem;
		text-align: left;
		font-family: var(--font-motto, Georgia, serif);
		color: var(--ink);
		background: none;
		border: 0;
		border-radius: 2px;
		cursor: pointer;
	}
	.te-heads-item:hover,
	.te-heads-item:focus-visible {
		background: color-mix(in srgb, var(--orange) 8%, transparent);
		outline: none;
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
		/* The foot's lamp drops below the tally rather than squeezing it. */
		.te-lamp {
			margin-left: 0;
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
		/* EQUAL ON EVERY SIDE. It used to carry a 4.5rem left inset so the floating key would not
		   sit on the first count — which fixed the collision by making the foot lopsided: 72px of
		   padding on the left against 12px on the right, measured. The key moves up above the
		   foot instead (see the .fkey override), so the foot can simply be evenly framed. */
		.te-foot {
			padding: 0.75rem;
		}
	}
</style>
