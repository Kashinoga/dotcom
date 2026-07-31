// THE SHEET — what the app needs from "the thing you type into", and nothing else.
//
// The editor has exactly one text control today: a textarea laid over a mirror, with the caret and
// the selection DRAWN rather than native, wrapping proved identical in three engines at five
// widths. That arrangement is excellent for prose and is the wrong shape for code, which wants
// bracket matching, block re-indent and a Tab key that indents instead of moving focus. If a
// second engine is ever put behind a code file, everything above it has to stop knowing which one
// it is talking to. This type is that line.
//
// WHAT IS DELIBERATELY NOT HERE, and each absence is a decision:
//
// - THE TEXT ITSELF. `text` stays the component's own `$state`, read directly by the counts, the
//   proof, the outline, the dirty flag and the scratch stash — dozens of readers, all of which
//   want a rune rather than a method call. The sheet MUTATES the text and says where the caret is;
//   it is not the source of truth for what the text says. A second engine keeps that arrangement
//   by pushing its changes into `text`, which is the same direction the textarea already pushes.
//
// - THE MARKS. `surround`, `prefix`, `heading`, `block` and `link` are written in terms of this
//   interface rather than being part of it, which is the whole point: they are pure text
//   transforms over a selection, so they work against ANY sheet without being written twice. (They
//   are markdown's, so a code file would hide them — but that is the bar's decision, not theirs.)
//
// - `onChange`. It belongs to an engine that owns its own document, so it is a CONSTRUCTION
//   parameter of the one that does ($lib/code-sheet) rather than a method here. The prose sheet
//   reports through `bind:value` and has nothing to subscribe to; putting a subscription on the
//   interface would oblige it to invent one.
//
//   (`destroy` was in the same position until Stage 2 and is now below, because it acquired a real
//   caller. That is the rule this file is trying to keep: a method arrives when something needs
//   it, not when it seems likely to be needed.)
//
// EVERY METHOD IS NULL-SAFE, and that is load-bearing rather than defensive. PROOF does not mount
// the sheet at all — `{#if shown !== 'proof'}` — so there are real, reachable moments with no text
// control on screen. The call sites used to each carry their own `if (!ta) return`; the guard
// belongs in one place, behind the interface, and `put` in particular MUST still work with no
// sheet mounted (it writes straight to `text`, which is how the workspace can replace the document
// while you are reading the proof).

/** Where the caret is, as offsets into the sheet's text. Collapsed when `start === end`. */
export type SheetSelection = { start: number; end: number };

export type Sheet = {
	/** Where the caret is. `{ start: 0, end: 0 }` when there is no sheet mounted. */
	selection(): SheetSelection;

	/**
	 * Put the caret somewhere, or select a range. Callers use this to WIDEN a range before
	 * writing over it — `write` replaces whatever is selected, so "replace these three lines" is
	 * `select(from, to)` and then `write(next)`.
	 */
	select(start: number, end?: number): void;

	/**
	 * Replace the selection, UNDOABLY, and optionally leave the caret placed afterwards.
	 *
	 * Undoability is the whole reason this is a method rather than an assignment, and the two
	 * engines keep it in completely different ways — the textarea through
	 * `document.execCommand('insertText')`, which is the one call that survives in the browser's
	 * own stack, and CodeMirror through a dispatched transaction against its history extension.
	 * Neither caller should ever learn which.
	 */
	write(replacement: string, selectStart?: number, selectEnd?: number): void;

	/**
	 * Replace EVERYTHING, undoably. Opening the wrong document has to be ⌘Z-able — that is why
	 * `load` does not stop to ask first, and it is the one behaviour in this app that would be
	 * silently lost by a sheet that swapped its own value.
	 */
	put(body: string): void;

	focus(opts?: { preventScroll?: boolean }): void;
	blur(): void;

	/**
	 * Put a source line on screen with the caret in it — what the contents rail asks for.
	 *
	 * ORDER IS AN INVARIANT INSIDE THIS METHOD, and it is the reason the rail is not allowed to do
	 * this itself. Focusing a text control scrolls its CURRENT selection into view; the prose
	 * sheet's textarea is not its own scroller, so the browser scrolls the paper instead, and
	 * doing that AFTER the row was scrolled to threw the sheet back to wherever the caret had last
	 * been left. Every jump landed on the previous heading. Caret first, focus with the scroll
	 * suppressed, row scrolled to last.
	 */
	goToLine(line: number): void;

	/**
	 * Let go of whatever this sheet holds. A no-op for the prose sheet, which is markup Svelte
	 * unmounts for it; real work for an engine that built its own DOM and its own listeners.
	 */
	destroy(): void;
};
