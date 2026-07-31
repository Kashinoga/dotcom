<script lang="ts">
	import { onMount } from 'svelte';
	import {
		editor,
		shownMode,
		openHeadings,
		MARKS,
		DOC_KEYS,
		OPEN_KEYS,
		type Mode
	} from '$lib/text-editor-state.svelte';

	// THE RACK — Text Editor's keys, rendered INSIDE the panel's dense bar.
	//
	// It is its own component for one reason: the bar is drawn by the catch-all page and the
	// editor is drawn in the body below it, so the keys cannot be markup inside the editor and
	// still land in the bar. What crosses between them is $lib/text-editor-state — the mode, the
	// two confirmation lamps, the key tables, and the verbs the editor registers while it is
	// mounted.
	//
	// ON A PHONE IT KEEPS ALMOST NOTHING. Seventeen keys in a bar 390px wide is a strip you swipe
	// to reach anything, and the bar is the wrong end of a phone for a control anyway — it is the
	// furthest point from the thumbs, and the on-screen keyboard is at the other. So the narrow
	// bar holds the VIEW keys and nothing else, and the rest go to a flyout at the bottom-left
	// (see $lib/FloatingKey, rendered by the editor). The tables are shared so the two shapes
	// cannot drift apart about what the app offers.
	//
	// ONE ROW, ALWAYS, and that is a constraint rather than a preference. The bar is positioned
	// absolutely over the scroller and the body reserves its height. A rack that wrapped to a
	// second row would slide straight under that reserve and sit on the first lines of the
	// document. On a wide window the strip never needs to move; it can still scroll sideways if
	// the window is narrow enough to crowd it before the flyout takes over.
	//
	// The keys wear the shared .tb class, so each theme dresses them — under Pixelite they come
	// out as the manual's plastic keys with no rule of ours. What is set below is only the
	// geometry the theme has no opinion about.

	const MODES: { id: Mode; label: string }[] = [
		{ id: 'write', label: 'Write' },
		{ id: 'split', label: 'Split' },
		{ id: 'proof', label: 'Proof' }
	];

	const shown = $derived(shownMode());

	/**
	 * THE ENTRANCE IS THE BAR ARRIVING, NOT A KEY APPEARING — and it has to be able to stop.
	 *
	 * `btn-in` was attached to `.tb` unconditionally, so ANY key that mounted later replayed the
	 * whole app's arrival. That is not hypothetical: SAVE is `{#if docKeys.length}` behind a
	 * `shown()` that asks whether this document can be written back, so it appears the moment a
	 * savable document is opened — and it slid in from the left every time, as though the toolbar
	 * had just loaded. Measured: opening a file with a handle runs `btn-in` on SAVE and on the rule
	 * beside it. The same is true of every conditional key here.
	 *
	 * A key that appears because the DOCUMENT changed should simply be there. The entrance belongs
	 * to the load, so it is scoped to a window after mount and then switched off for good.
	 *
	 * The window is a plain timer rather than an `animationend` count, and generous on purpose:
	 * the last key's animation ends at `--enter-lead` + 6 × `--btn-enter-step` + 0.42s, which is
	 * well under a second, and flipping the flag LATE costs nothing (the animations are over)
	 * while flipping it early would cut the last key off mid-slide. Counting `animationend` would
	 * mean knowing how many keys are drawn, which is the thing that varies.
	 */
	let arrived = $state(false);
	onMount(() => {
		const t = setTimeout(() => (arrived = true), 1500);
		return () => clearTimeout(t);
	});
</script>

{#if !editor.narrow}
	<!-- THE FILE KEYS lead the bar, at the far left. A document has to arrive before there is
	     anything to mark up or anything to do with it, and reading the bar left to right tells
	     that order: bring one in, mark it up, choose how to look at it, then take it away. Pinned
	     outside the scrolling strip for the same reason the document keys are — a file verb that
	     can scroll out of reach is a file verb you cannot find.
	     A RULE AFTER THEM, restored. It was taken out once on the argument that these two wear
	     WORDS and the strip beside them is nothing but glyphs, so the difference was already
	     unmissable — but a rule is not only telling two things apart, it is saying where one job
	     ends and the next begins, and this bar reads left to right in the order of the work. It
	     matches the one in the tail, which parts the document keys from what stands past them. -->
	<div class="te-lead" class:te-arrived={arrived}>
		<div class="te-group" role="group" aria-label="Open">
			{#each OPEN_KEYS as k, i (k.id)}
				<!-- NO CARET on either of these any more. Workspace held a menu and wore one; it is a
				     toggle now, and a caret on a key that opens nothing is a promise it cannot keep —
				     it was also what made the word sit off-centre, because the caret took width on one
				     side of a row the browser was otherwise centring. -->
				<button
					type="button"
					class="tb"
					class:on={k.on?.()}
					aria-pressed={k.on ? k.on() : undefined}
					onclick={k.run}
					title={k.title()}
					style:--bn={i}
				>
					<span class="te-key-ico" aria-hidden="true">{@html k.svg}</span>
					<span class="te-key-word">{k.label()}</span>
				</button>
			{/each}
		</div>
		<!-- Drawn only where there is something on the other side of it. In PROOF the strip is
		     empty — nothing to mark up — and a rule with a whole empty bar past it parts one thing
		     from nothing. -->
		{#if shown !== 'proof'}
			<span class="te-sep" aria-hidden="true"></span>
		{/if}
	</div>
{/if}
<div class="te-rack" class:te-arrived={arrived} role="toolbar" aria-label="Text Editor">
	{#if shown !== 'proof' && !editor.narrow}
		<!-- The marks are only offered when there is a sheet to put them on. In PROOF there is
		     nothing to mark up, and ten dead keys would say otherwise. On a phone they are in the
		     flyout instead. They are the ONLY thing in the scrolling strip now: everything else
		     acts on the document or on the view, and those belong in the fixed clusters at the
		     ends where they cannot scroll away. -->
		<div class="te-group" role="group" aria-label="Marks">
			<!-- ONE key for six levels. Two of them in the bar was an arbitrary place to stop — the
			     engine has always set H1 through H6 — and six keys would spend a third of the strip
			     on a single mark. -->
			<button
				type="button"
				class="tb te-mark-key te-heads"
				title="Heading level"
				aria-label="Heading level"
				aria-expanded={!!editor.headingAt}
				style:--bn={1}
				onclick={openHeadings}>H<span class="te-caret-down" aria-hidden="true"></span></button
			>
			{#each MARKS as mark, i (mark.title)}
				<button
					type="button"
					class="tb te-mark-key"
					title={mark.title}
					aria-label={mark.title}
					onclick={mark.run}
					style:--bn={2 + i}
				>
					{#if mark.svg}
						<span class="te-key-ico" aria-hidden="true">{@html mark.svg}</span>
					{:else}
						{mark.label}
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<!-- THE RIGHT-HAND END: the view keys, then the document keys, then a rule and Home. Both
     clusters sit OUTSIDE the scrolling strip — a key that changes what you are looking at, or
     acts on the whole file, must not be able to scroll out of reach. A rule parts the document
     keys from Home, which is the page's rather than the app's.
     The tail itself is always drawn: on a phone the document keys go to the flyout, but the view
     keys stay, because switching between the sheet and the proof is the one thing a phone still
     has to do from the bar. -->
<div class="te-tail" class:te-arrived={arrived}>
	<div class="te-group" role="group" aria-label="View">
		{#each MODES as m, i (m.id)}
			<!-- SPLIT simply is not offered on a narrow window; see shownMode. -->
			{#if !(editor.narrow && m.id === 'split')}
				<button
					type="button"
					class="tb"
					class:on={shown === m.id}
					aria-pressed={shown === m.id}
					style:--bn={2 + i}
					onclick={() => (editor.mode = m.id)}>{m.label}</button
				>
			{/if}
		{/each}
		<!-- The measure sits with the VIEW keys, not the marks: it changes how the document is laid
		     out rather than what it says, and it applies to the proof as much as to the sheet — so
		     it stays offered in PROOF, where the marks are not. On a phone it is in the flyout. -->
		{#if !editor.narrow}
			<button
				type="button"
				class="tb"
				class:on={editor.measured}
				aria-pressed={editor.measured}
				title={editor.measured
					? 'Let the text run the full width'
					: 'Hold the text to a reading measure'}
				style:--bn={5}
				onclick={() => (editor.measured = !editor.measured)}>Measure</button
			>
		{/if}
	</div>
	{#if !editor.narrow}
		<!-- A RULE SEPARATES TWO THINGS, so it is drawn only when there are two — and the GROUP goes
		     with it. The document group can be EMPTY now: Save appears only when there is somewhere
		     to save to, and `.md` only in a browser that cannot save at all. Empty, it still stood
		     in the tail's flex row and still took a gap on either side, so the one rule left came
		     with a hole in front of it. Rendering neither is what closes it. -->
		{@const docKeys = DOC_KEYS.filter((k) => k.shown?.() ?? true)}
		{#if docKeys.length}
			<span class="te-sep" aria-hidden="true"></span>
			<div class="te-group" role="group" aria-label="The document">
				{#each docKeys as k, i (k.id)}
					<button
						type="button"
						class="tb"
						class:on={k.on?.()}
						class:done={k.done?.()}
						class:lost={k.lost?.()}
						onclick={k.run}
						title={k.title()}
						style:--bn={6 + i}
					>
						<span class="te-key-ico" aria-hidden="true">{@html k.svg}</span>
						<!-- The word goes on a narrow bar and the glyph carries the key — EXCEPT while
						     a key is saying something back. "Saved" and "Sure?" are state, not a label,
						     and state that only shows on a wide window is state half the visitors never
						     see. -->
						<span class="te-key-word" class:te-say={k.on?.() || k.done?.() || k.lost?.()}
							>{k.label()}</span
						>
					</button>
				{/each}
			</div>
		{/if}
		<!-- The rule before the panel's own chrome. Always drawn: what stands past it is the
		     SETTINGS key, which is not a document verb at all, and that boundary is there whether
		     or not the document has any keys to its left. -->
		<span class="te-sep" aria-hidden="true"></span>
	{/if}
</div>

<style>
	/* THE STRIP. It takes the bar's free width and scrolls its own overflow — see the note at the
	   top for why it must never wrap. min-width:0 is what actually lets it shrink inside the
	   bar's flex row rather than pushing Home off the right edge. */
	.te-rack {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-8);
		overflow-x: auto;
		overflow-y: hidden;
		/* No visible scrollbar: a bar of controls with a track under it reads as a scrolling
		   pane, and the bar has a fixed height that a classic scrollbar would eat into. The
		   fade at the right edge (below) is what says there is more. */
		scrollbar-width: none;
		/* Room for the keys' focus ring and the press bevel, which would otherwise be clipped by
		   the scroller's own box.
		   DELIBERATELY OFF THE `--space-*` SCALE, like the 1px hairline: this is CLEARANCE for
		   something drawn outside the key's border box, not a gap between two things, and its size
		   is set by the ring's own width. A rung here would be 4px top and bottom inside a bar of
		   fixed height, which is 8px taken off the one row the keys stand in. */
		padding-block: 2px;
	}
	.te-rack::-webkit-scrollbar {
		display: none;
	}
	/* The affordance the hidden scrollbar gives up: the strip fades out at its right edge, so a
	   half-visible key says "there is more this way" rather than looking cut off. Only while it
	   actually overflows — a mask on a strip that fits would dim the last key for no reason.
	   (animation-timeline is the scroll-driven way to do this exactly; a static mask on an
	   overflowing box is the version that works everywhere, and the cost is that the fade also
	   shows when the strip is scrolled fully to its end.) */
	@supports (mask-image: linear-gradient(to right, black, transparent)) {
		.te-rack {
			mask-image: linear-gradient(to right, #000 calc(100% - 1.5rem), transparent 100%);
		}
		/* …but only when there is something to scroll to. Without a container query there is no
		   pure-CSS test for overflow, so this is keyed off the coarse pointer instead: a phone is
		   where the strip overflows, and a mouse window is where it does not. */
		@media (pointer: fine) {
			.te-rack {
				mask-image: none;
			}
		}
	}
	.te-group {
		display: flex;
		align-items: center;
		gap: var(--space-8);
		flex: none;
	}
	/* The right-hand cluster. Outside .te-rack on purpose: the strip scrolls, and a key that acts
	   on the whole document must not be able to scroll out of reach. flex:none so it keeps its
	   width while the strip beside it gives ground. */
	.te-lead,
	.te-tail {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--space-8);
		padding-block: 2px;
	}
	/* A hairline between the groups — the manual's own way of parting a row of keys, and the
	   thing that makes a long strip readable as three clusters instead of sixteen buttons. */
	.te-sep {
		flex: none;
		width: 1px;
		align-self: stretch;
		/* NO margin of its own. A rule with margins sat 10.4px from the key before it and 12px
		   from the one after — two different gaps, neither of them the one the keys keep between
		   themselves (6.4px when that was written, `--space-8` now). The flex gap alone puts it on
		   the same rhythm as everything else, so a separator reads as one step in the row rather
		   than a wider pause. */
		margin-inline: 0;
		background: var(--pixel-hairline, var(--line-edge, rgba(0, 0, 0, 0.2)));
	}

	/* THE BAR ARRIVES THE WAY IT READS. The page already rides the panel's chrome in on `btn-in`
	   (`.surface-head .head-actions .icon-btn` in +page.svelte), but on this app's dense bar the
	   only thing that rule reaches is the SETTINGS key in the corner — so the bar used to load with
	   one button sliding in and sixteen simply being there. Everything else is the rack's, so the
	   rack rides it in.
	   The keyframe is puhig's, not a second copy: `btn-in` is declared globally in base.css exactly
	   so the panel and any app's own bar draw the one definition. Same curve, same step token.
	   `--bn` is set in the MARKUP, off each `{#each}`'s index, rather than as a wall of
	   `:nth-child` rules — the clusters are three separate boxes, so no single nth-child series
	   spans them, and the indices are chosen to run left to right ACROSS the three: the two lead
	   keys, then the marks, then the view keys and the document keys. The tail's numbers overlap
	   the marks' on purpose. Sixteen keys stepped end to end is over half a second of ripple on a
	   toolbar somebody sees on every load; overlapping them reads as the bar arriving rather than
	   as a queue forming.
	   `backwards` fill, for the reason the page's rule spells out: these are buttons in the
	   universal hover/press list, so the fill has to lift the moment the entrance ends or the
	   animated translate would pin their scale(). */
	@media (prefers-reduced-motion: no-preference) {
		/* `:not(.te-arrived)` is what keeps this an ARRIVAL. See the note on `arrived` above: the
		   rule used to reach every `.tb` for the life of the page, so a key that mounted later —
		   SAVE, the moment a savable document is opened — replayed the whole bar's entrance. */
		.te-lead:not(.te-arrived) .tb,
		.te-rack:not(.te-arrived) .tb,
		.te-tail:not(.te-arrived) .tb {
			animation: btn-in 0.42s var(--spring) backwards;
			animation-delay: calc(var(--enter-lead) + var(--bn, 0) * var(--btn-enter-step));
		}
		/* The rules come in with the keys they part, a beat behind the key on their left, so a
		   cluster arrives as a cluster instead of the hairline standing there waiting for it. */
		.te-lead:not(.te-arrived) .te-sep,
		.te-tail:not(.te-arrived) .te-sep {
			animation: btn-in 0.42s var(--spring) backwards;
			animation-delay: calc(var(--enter-lead) + var(--bn, 2) * var(--btn-enter-step));
		}
		.te-tail .te-sep {
			--bn: 6;
		}
	}

	/* The shared control class at this app's measure. Everything about how a .tb LOOKS — face,
	   border, bevel, the mono uppercase label, the cobalt hover and the sunken press — comes from
	   the theme (pixelite.css dresses .tb globally at 0,2,1, which outranks these scoped rules). */
	.tb {
		display: inline-flex;
		align-items: center;
		gap: var(--space-4);
		box-sizing: border-box;
		flex: none;
		height: 28px; /* the manual's one control line */
		padding: 0 var(--space-12);
		font: inherit;
		font-size: 0.78rem;
		/* REGULAR, not the 600 this carried. Every key in the bar was semibold, so nothing in the
		   row was emphasised by being bold — the weight was just a heavier setting of the whole
		   strip, and against the pane's own bold uppercase heads it made the chrome shout over the
		   lists. The mono face, the uppercase and the letter-spacing are already what says "this is
		   a key"; a key that is ON has the accent to say so. */
		font-weight: 400;
		line-height: 1;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border: 1px solid var(--line-edge, rgba(0, 0, 0, 0.2));
		border-radius: 4px;
		cursor: pointer;
		white-space: nowrap;
	}
	.tb:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.te-key-ico {
		display: grid;
		place-items: center;
	}
	.te-key-ico :global(svg) {
		display: block;
		width: 13px;
		height: 13px;
	}
	/* Every mark key is the same SQUARE, glyph or word alike — ten keys of even measure read as a
	   rack of keys rather than as ten differently-sized buttons. Square rather than merely
	   min-width'd: a 28px glyph key beside a 42px "H1" key is the ragged rhythm the typographic
	   labels used to give the whole strip, and the point of moving to the icon set was to end it.
	   The two word keys keep the mono face; the theme's uppercase transform is harmless on them. */
	.te-mark-key {
		width: 28px;
		padding: 0;
		justify-content: center;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.72rem;
	}

	/* ── Narrow ────────────────────────────────────────────────────────────────
	   The document keys drop their words and stand on their glyphs, which takes about 150px off
	   the strip — enough that a phone swipes a little rather than a lot. A key that is currently
	   SAYING something keeps its word (see .te-say in the markup). */
	@media (max-width: 900px) {
		.te-key-word:not(.te-say) {
			/* Not display:none — the word is the accessible name of these three keys, and hiding
			   it that way would leave a screen reader three unlabelled buttons. Clipped instead,
			   so it is still read. */
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}
	/* On a touch screen the keys take the 40px touch line the rest of the site's phone controls
	   keep, rather than the 28px print line. Still under the bar's own 44px reserve, so the row
	   height does not change. */
	/* On a touch screen the bar's keys keep the 28px control line the rest of its chrome uses —
	   they do NOT take the 40px touch size. That size belongs to the FLYOUT now, which is where
	   a phone's controls actually are; the bar is down to two view keys beside a 28px Home and a
	   Beta tag, and a 40px key among them was both oversized and the odd one out. Three different
	   heights in a 42px bar, measured. */
	@media (pointer: coarse) {
		.tb {
			height: 28px;
			padding: 0 var(--space-8);
		}
		.te-mark-key {
			width: 28px;
		}
	}
</style>
