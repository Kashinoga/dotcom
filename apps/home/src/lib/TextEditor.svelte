<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { renderMarkdown, tally, lineMarks } from '$lib/markdown';
	import { editor, shownMode } from '$lib/text-editor-state.svelte';

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
	let savedAt = $state(0);
	let saveTimer = 0;
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
		editor.cmd = { surround, prefix, block, link, copy, download, clear: clearSheet };

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
		};
	});

	$effect(() => {
		const body = text; // read it so the effect tracks the document
		if (typeof localStorage === 'undefined') return;
		dirty = true;
		clearTimeout(saveTimer);
		saveTimer = window.setTimeout(() => {
			try {
				localStorage.setItem(STORE, body);
				savedAt = Date.now();
				dirty = false;
			} catch {
				// Same as above — the sheet is still on screen, it just won't survive a reload.
				dirty = false;
			}
		}, 400);
	});

	$effect(() => {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(`${STORE}:mode`, editor.mode);
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

	/** The document leaves as a real file. The name is the first heading, or the date. */
	function download() {
		const heading = text.match(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*$/m)?.[1] ?? 'text-editor';
		const name =
			heading
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '')
				.slice(0, 48) || 'text-editor';
		const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `${name}.md`;
		a.click();
		URL.revokeObjectURL(url);
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

	/** Four figures in the pixel face, the way a manual sets a count. */
	const pad = (n: number) => String(n).padStart(4, '0');
</script>

<!-- The KEYS are not here. They live in the panel's dense bar, drawn by the catch-all page from
     $lib/TextEditorRack, and reach back into this component through the command table published
     in $lib/text-editor-state. What is left in the body is the work itself: the sheet, the proof, and
     the running foot under both. -->
<div class="te" class:te-write={shown === 'write'} class:te-proof-only={shown === 'proof'}>
	<div class="te-desk">
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

	<!-- THE RUNNING FOOT — the tally, set in the pixel face, the way a manual foots a page. The
	     lamp at the end says whether what is on screen has reached storage yet. -->
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
		<p class="te-lamp" class:te-lamp-dirty={dirty} role="status">
			{dirty ? 'Setting…' : savedAt ? 'Set in type' : 'Held in this browser'}
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
	}

	/* ── The desk ──────────────────────────────────────────────────────────────
	   One row of panes on a wide window, one pane on a narrow one. min-height:0 on both the row
	   and the panes is what lets the scrollers inside actually scroll instead of growing the
	   whole column — the flexbox trap this layout would otherwise fall into. */
	.te-desk {
		flex: 1 1 auto;
		display: flex;
		min-height: 0;
		gap: 0;
	}
	.te-pane {
		flex: 1 1 50%;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}
	.te-pane + .te-pane {
		border-left: 1px solid var(--te-rule);
	}
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
		/* THE BAR'S HEIGHT, as padding rather than as a gap above. The scroller starts at the very
		   top of the panel — underneath the bar — and this pushes the first line clear of it. So
		   the document begins below the keys and then travels UNDER them as it scrolls, which is
		   what gives the bar's frost something to frost. (The page publishes the measured height
		   as --bar-h; the fallback is the one-row bar the stylesheet assumes elsewhere.) */
		padding-top: var(--bar-h, 60px);
		background: var(--surface);
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
	.te-stack {
		position: relative;
		min-height: 100%;
	}

	/* ── The scrollbar, held clear of the bar ──────────────────────────────────
	   The scroller runs UNDER the bar so the frost has something to frost, which means its
	   scrollbar would run up behind the bar too — a thumb travelling into the glass and out of
	   reach. The docs shell already solved this and the recipe is copied from it wholesale
	   (DocsShell, .docs-scroll): the track takes a top MARGIN of the bar's height, so the
	   scrollport still starts at the top of the panel while the bar the thumb runs in starts
	   below the keys.
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
		margin-top: var(--bar-h, 60px);
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
		/* The proof runs under the bar on the same terms as the sheet — see .te-paper. */
		padding: calc(var(--bar-h, 60px) + var(--te-pad)) clamp(1.25rem, 3vw, 2.5rem) 40vh;
		counter-reset: te-sec te-listing;
		color: var(--ink);
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 1rem;
		line-height: 1.65;
	}
	/* Held to a reading measure and hugging the left, the way the docs sheets are — a proof set
	   to the full width of a wide window is not a proof of anything anyone will read. */
	.te-proof > :global(*) {
		max-width: 34rem;
	}
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
	}
</style>
