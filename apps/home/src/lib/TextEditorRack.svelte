<script lang="ts">
	import { editor, shownMode, type Mode } from '$lib/text-editor-state.svelte';
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

	// THE RACK — Text Editor's keys, rendered INSIDE the panel's dense bar.
	//
	// It is its own component for one reason: the bar is drawn by the catch-all page and the
	// editor is drawn in the body below it, so the keys cannot be markup inside the editor and
	// still land in the bar. What crosses between them is $lib/text-editor-state — the mode, the two
	// confirmation lamps, and the table of verbs the editor registers while it is mounted.
	//
	// ONE ROW, ALWAYS, and that is a constraint rather than a preference. The bar is positioned
	// absolutely over the scroller and the body reserves its height with a fixed calc
	// (`.surface-head.bar + .surface-body`, padding-top: 44px + insets). A rack that wrapped to a
	// second row would slide straight under that reserve and sit on top of the first lines of the
	// document. So the strip SCROLLS sideways instead: on any window wide enough it never moves,
	// and on a phone it is swiped. The bar keeps the one-row promise `dense` chrome makes, and
	// nothing about the page's layout arithmetic has to change.
	//
	// The keys wear the shared .tb class, so each theme dresses them — under Pixelite they come
	// out as the manual's plastic keys with no rule of ours. What is set below is only the
	// geometry the theme has no opinion about.

	// The mark keys. A table rather than ten copies of the same markup.
	//
	// Each key carries EITHER a glyph from the shared icon set or a word — never a typographic
	// stand-in for a glyph. The rack used to spell every mark by hand ("B", "I", "<>", "❝", "*",
	// "1.", "—") and it read as seven different optical weights sitting in a row with three real
	// icons; the marks are $lib/icons now, so the whole strip is drawn in one hand.
	//
	// H1 and H2 keep their WORDS, and that is the considered exception rather than the leftover.
	// No icon set distinguishes heading LEVELS — reicon's nearest glyph is a single hashtag — so
	// the pair would have to be the same picture twice, which says less than two letters do. Every
	// editor worth copying labels these in type for the same reason.
	const MARKS: { label?: string; svg?: string; title: string; run: () => void }[] = [
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

	const MODES: { id: Mode; label: string }[] = [
		{ id: 'write', label: 'Write' },
		{ id: 'split', label: 'Split' },
		{ id: 'proof', label: 'Proof' }
	];

	const shown = $derived(shownMode());
</script>

<div class="te-rack" role="toolbar" aria-label="Text Editor">
	<div class="te-group" role="group" aria-label="View">
		{#each MODES as m (m.id)}
			<!-- SPLIT simply is not offered on a narrow window; see shownMode. -->
			{#if !(editor.narrow && m.id === 'split')}
				<button
					type="button"
					class="tb"
					class:on={shown === m.id}
					aria-pressed={shown === m.id}
					onclick={() => (editor.mode = m.id)}>{m.label}</button
				>
			{/if}
		{/each}
	</div>

	{#if shown !== 'proof'}
		<!-- The marks are only offered when there is a sheet to put them on. In PROOF there is
		     nothing to mark up, and ten dead keys would say otherwise. -->
		<span class="te-sep" aria-hidden="true"></span>
		<div class="te-group" role="group" aria-label="Marks">
			{#each MARKS as mark (mark.title)}
				<button
					type="button"
					class="tb te-mark-key"
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
	{/if}

	<span class="te-sep" aria-hidden="true"></span>
	<div class="te-group" role="group" aria-label="The document">
		<button
			type="button"
			class="tb"
			onclick={() => editor.cmd?.copy()}
			title="Copy the whole document"
		>
			<span class="te-key-ico" aria-hidden="true">{@html COPY_SVG}</span>
			<!-- The word goes on a narrow bar and the glyph carries the key — EXCEPT while a key is
			     saying something back. "Copied" and "Sure?" are state, not a label, and state that
			     only shows on a wide window is state half the visitors never see. -->
			<span class="te-key-word" class:te-say={editor.copied}
				>{editor.copied ? 'Copied' : 'Copy'}</span
			>
		</button>
		<button
			type="button"
			class="tb"
			onclick={() => editor.cmd?.download()}
			title="Download it as a .md file"
		>
			<span class="te-key-ico" aria-hidden="true">{@html DOWNLOAD_SVG}</span>
			<span class="te-key-word">.md</span>
		</button>
		<button
			type="button"
			class="tb"
			class:on={editor.armed}
			onclick={() => editor.cmd?.clear()}
			title={editor.armed ? 'Press again to clear the sheet' : 'Clear the sheet'}
		>
			<span class="te-key-ico" aria-hidden="true">{@html TRASH_SVG}</span>
			<span class="te-key-word" class:te-say={editor.armed}>{editor.armed ? 'Sure?' : 'Clear'}</span
			>
		</button>
	</div>
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
		gap: 0.4rem;
		overflow-x: auto;
		overflow-y: hidden;
		/* No visible scrollbar: a bar of controls with a track under it reads as a scrolling
		   pane, and the bar has a fixed height that a classic scrollbar would eat into. The
		   fade at the right edge (below) is what says there is more. */
		scrollbar-width: none;
		/* Room for the keys' focus ring and the press bevel, which would otherwise be clipped by
		   the scroller's own box. */
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
		gap: 0.4rem;
		flex: none;
	}
	/* A hairline between the groups — the manual's own way of parting a row of keys, and the
	   thing that makes a long strip readable as three clusters instead of sixteen buttons. */
	.te-sep {
		flex: none;
		width: 1px;
		align-self: stretch;
		margin-inline: 0.25rem;
		background: var(--pixel-hairline, var(--line-edge, rgba(0, 0, 0, 0.2)));
	}

	/* The shared control class at this app's measure. Everything about how a .tb LOOKS — face,
	   border, bevel, the mono uppercase label, the cobalt hover and the sunken press — comes from
	   the theme (pixelite.css dresses .tb globally at 0,2,1, which outranks these scoped rules). */
	.tb {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		box-sizing: border-box;
		flex: none;
		height: 28px; /* the manual's one control line */
		padding: 0 0.7rem;
		font: inherit;
		font-size: 0.78rem;
		font-weight: 600;
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
	@media (pointer: coarse) {
		.tb {
			height: 40px;
			padding: 0 0.75rem;
		}
		.te-mark-key {
			width: 40px;
		}
	}
</style>
