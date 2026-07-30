<script lang="ts">
	import type { Snippet } from 'svelte';
	import { airports, DOCS_BLEED } from '$lib/places';
	import type { View } from '$lib/views';
	import Densette from '$lib/Densette.svelte';

	// THE PAPER EVERY PIXELITE PAGE IS PRINTED ON. DocsShell owns the chrome around a page — the
	// superbar, the tree, the on-this-page rail, the gutter; this owns what sits IN that gutter: the
	// sheet, the serif cover printed on it, the reading measure inside it, and the two grids that
	// ride on the full-width variants. The page's own content is handed in as `body` and rendered
	// untouched, so an app draws here exactly as it draws in a panel.
	//
	// The seam is the site's usual one — the page decides, the component draws — with one addition
	// worth naming: this component decides the SHAPE from the register (`chrome`, via DOCS_BLEED)
	// and the code, not from a prop. Which of the five arrangements a place gets is a fact about
	// that place, recorded once in `places.ts`; a prop would be a second place to record it and a
	// second place for it to go stale.
	//
	// WHY THE CSS FOLLOWED THE MARKUP HERE, when it did not follow it into DocsShell. Svelte scopes
	// `.a .b` as `.a.svelte-x .b.svelte-x`, so a rule only reaches elements built in the SAME file.
	// While the sheet was built by a snippet in +page.svelte, its rules had to live there too (the
	// note that used to stand over them said so). Moving the markup is what freed them — and it is
	// also why every rule below that reaches PAST the sheet into `body`'s own content is spelled
	// with `:global()`: that content is still the page's, and still carries the page's hash. Each
	// one is marked where it stands. There is no way around this and no cost to it beyond the
	// spelling; the alternative is a rule that silently stops matching, which is exactly the
	// failure `e2e/docs-snap.mjs` was written to catch.
	let { v, body }: { v: View; body: Snippet<[View]> } = $props();
</script>

{#if v.code === 'DENS'}
	<!-- Densette draws its own paper (gutter + sheets), so it renders bare — no wrapper. -->
	<Densette />
{:else if DOCS_BLEED.includes(v.code)}
	<!-- Self-chrome readings — Weather, the Court, the Emoji wall — each ride a SHEET OF PAPER
	     (Densette's): their title prints ON the sheet as a cover rather than floating on the
	     grey gutter above it, so the head goes INSIDE the sheet. Keyed so navigation replays
	     the entrance. (On a phone the head stays in the DOM as the page's heading but comes off
	     the sheet — the superbar carries the name there; see the .docs-page-head mobile rule.) -->
	{#key v.code}
		<div class="docs-sheet">
			<header class="docs-page-head">
				<h1 class="docs-page-title">{airports[v.code].title}</h1>
			</header>
			{@render body(v)}
		</div>
	{/key}
{:else if v.code === 'APP'}
	<!-- Apps rides a FULL-WIDTH sheet (unlike the block pages): its shelf of app cards flows
	     into a responsive grid (see .app-page — the cards' two-column split flattens into one
	     auto-fill grid whose column count follows the viewport). The short intro runs above.
	     The serif title still prints on the sheet as a cover. -->
	{#key v.code}
		<div class="docs-sheet app-page">
			<div class="docs-prose">
				<header class="docs-page-head">
					<h1 class="docs-page-title">{airports[v.code].title}</h1>
				</header>
				{@render body(v)}
			</div>
		</div>
	{/key}
{:else if v.code === 'STG'}
	<!-- Settings rides a FULL-WIDTH sheet (unlike the block pages): its controls want the
	     room, so the groups flow into the same auto-fill grid the expanded panel uses
	     (.docs-settings). The serif title still prints on the sheet as a cover. -->
	{#key v.code}
		<div class="docs-sheet">
			<header class="docs-page-head">
				<h1 class="docs-page-title">{airports[v.code].title}</h1>
			</header>
			<div class="docs-settings">
				{@render body(v)}
			</div>
		</div>
	{/key}
{:else}
	<!-- Block pages: a SHEET OF PAPER (Densette's) capped to the reading measure, so a short
	     page is a tidy card — the serif title prints on the sheet as a cover, the body held to
	     a readable measure below it and hugging the sheet's left. Keyed so page-to-page
	     navigation remounts the column and replays the entrance. (The cover comes off the sheet
	     on a phone — the superbar carries the name; see the .docs-page-head mobile rule.) -->
	{#key v.code}
		<div class="docs-sheet prose">
			<div class="docs-prose">
				<header class="docs-page-head">
					<h1 class="docs-page-title">{airports[v.code].title}</h1>
				</header>
				{@render body(v)}
			</div>
		</div>
	{/key}
{/if}

<style>
	/* These render INSIDE DocsShell's content gutter, and only ever in the look === 'pixelite'
	   branch, so Aeropalite never sees them. Tokens are Pixelite's (pixelite.css); the sheet's
	   stock and the gutter width are DocsShell's, published as custom properties and inherited. */

	/* Prose column — held to a readable measure inside its paper sheet (.docs-sheet.prose caps
	   the sheet to this same measure plus its padding, so the prose fills the sheet's content
	   box). The self-chrome readings (Weather, the Court, the Emoji wall) ride a FULL-WIDTH
	   sheet instead, their content filling the column. */
	.docs-prose {
		display: block;
		max-width: 72ch;
		/* Left-aligned within the sheet — the measure hugs the sheet's left edge (after
		   makingsoftware), never centred. The sheet's padding is the only inset. */
		margin: 0;
	}
	/* The prose/Settings sheet is capped to the reading measure (plus its own padding), so a
	   short block page is a tidy card on the grey gutter rather than a wide sheet with an empty
	   right half. The readings keep the un-capped full-width .docs-sheet. Left-aligned (block,
	   no auto margins), hugging the column's left like the prose it wraps. */
	.docs-sheet.prose {
		max-width: calc(72ch + 2 * clamp(1.25rem, 3vw, 2.25rem));
	}
	/* Docs chapter head — the serif page title alone, parted from the body by air (no
	   rule). Stands in for the panel's big flap title. (The mono running-head above it
	   was a metro-era motif and came off with the map.) The air is a beat, not a gulf:
	   1.75rem read as a hole under the title, and the Emoji page had taken to swallowing
	   it with a negative margin rather than living with it. */
	.docs-page-head {
		margin: 0 0 0.75rem;
		padding-bottom: 0.5rem;
	}
	/* The self-chrome readings' paper: Weather, the Court and the Emoji wall each lay their
	   reading AND their title (a printed cover) on a white sheet over the grey gutter —
	   Densette's paper, brought to the full-bleed readings. --page is already Densette's grey
	   (light-dark(#fbfbfb, #0e0e10)), so the sheet is just the white fill, the ink hairline,
	   the 2px cut and the print shadow. The head sits inside its padding, so it prints on the
	   sheet rather than bleeding out. Its own settle (it lives outside .docs-prose): the sheet
	   carries head + content in as one, with each app's own section cascade playing within —
	   Densette's recipe exactly. */
	.docs-sheet {
		/* No border, no drop shadow: the sheet is told from the page by its FILL alone — a white
		   (or dark-stock) leaf on the greyer page — not by a hairline or a lifted edge. Space and
		   colour mark the sheet; hard lines are retired. Its inner padding stays — the reading
		   keeps its breathing room; only the outer gutter around the sheet is gone (see .docs-body). */
		/* The shell's own stock (DocsShell publishes --sheet-stock on .docs). The literal stays as
		   a fallback for a sheet rendered outside the shell, which nothing does today. */
		background: var(--sheet-stock, light-dark(#ffffff, #202023));
		border-radius: 2px;
		padding: clamp(1.25rem, 3vw, 2.25rem);
	}
	/* The Emoji wall's in-flow search bar bleeds to the docs GUTTER by --docs-pad (its recipe
	   for the old full-bleed layout); on the sheet that pulls it out of the padded measure and
	   past the sheet's edge. Neutralise the bleed so it sits flush in the sheet like the wall
	   below it. (Only EMOJ carries .ev-searchbar, so this reaches nothing else.)
	   Global because the bar is the PAGE's element, handed in through `body` — as it always was;
	   this one rule was spelled with :global() even while the whole block lived in +page.svelte,
	   because the bar comes from the Emoji viewer's own component either way. */
	.docs-sheet :global(.ev-searchbar) {
		margin-inline: 0;
		padding-inline: 0;
	}
	@media (prefers-reduced-motion: no-preference) {
		.docs-sheet {
			animation: docs-settle 0.45s ease backwards;
		}
	}
	/* On a phone the sheet is the page: DocsShell zeroes --docs-pad there, so the gutter around
	   it is already gone on all four sides (and with it the negative bottom margin that used to
	   cancel that gutter). The reading measure is the last thing holding a block page short of
	   the right edge — between ~620px and 860px the cap left a band of bare gutter beside a page
	   that has no gutter anywhere else — so it comes off too. The measure still governs the PROSE
	   inside (.docs-prose keeps its 72ch); only the paper under it runs full width. The blank
	   foot below every page is the scroller's own, the floating key's safe area. */
	@media (max-width: 860px) {
		.docs-sheet.prose {
			max-width: none;
		}
		/* Every sheet's printed cover comes off on a phone: the superbar carries the page's name at
		   this width (DocsShell's barTitle — see the note by it in the script), so each page opens
		   on what it is for — Weather's city tabs, the emoji search, a block page's prose — the way
		   Air Traffic's board opens under its own bar. Screen-reader-only rather than display:none:
		   the page keeps its <h1>, and its echo in the bar is aria-hidden, so the heading is spoken
		   once and the document still has an outline. (Masthead's menu words go the same way at
		   560px.) The head's bottom padding goes with it — an invisible box must not hold air.
		   The descendant selector reaches both arrangements: the head sits directly on the sheet
		   for the self-chrome readings, and inside .docs-prose on the block, Apps and Settings
		   pages. Densette isn't touched — its cover is printed inside its own paper, not here. */
		.docs-sheet .docs-page-head {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		/* …and the line that now leads the page loses its top margin. That margin is the air a
		   paragraph or a sub-head keeps from what came BEFORE it — with the head lifted out of
		   flow there is nothing before it, so the air became a gap between the sheet's top padding
		   and its first word: an inset of 20 + 16 where every other edge of the sheet keeps 20.
		   The pages whose body opens with its own root (Weather's .wx, the Emoji wall, Settings'
		   group grid) already sat right at the padding — this brings the prose pages in line with
		   them. Adjacent-sibling, so it reaches exactly the one element the head used to sit on
		   top of and nothing deeper down the page.
		   GLOBAL because that one element is the PAGE's — the first thing `body` renders. */
		.docs-sheet .docs-page-head + :global(*) {
			margin-top: 0;
		}
	}
	.docs-page-title {
		margin: 0;
		font-family: var(--font-motto);
		font-weight: 400;
		font-size: clamp(2rem, 4.5vw, 2.9rem);
		letter-spacing: -0.02em;
		line-height: 1.05;
		color: color-mix(in srgb, var(--ink) 88%, transparent);
	}
	/* ── The prose voice ──────────────────────────────────────────────────────────────────────
	   Everything below dresses elements the PAGE builds and hands in through `body`, so every
	   selector below is global past .docs-prose. The wrapper is this component's; a blockquote
	   inside it is not, and a plain descendant selector would be scoped to this file and match
	   nothing. */
	/* Quotes in the manual voice: serif italic between two hairline rules, the same
	   treatment as Densette's pull-quotes, left-aligned to the measure. */
	.docs-prose :global(blockquote) {
		margin: 1.75rem 0;
		padding: 1rem 0;
		border-top: 1px solid var(--pixel-hairline);
		border-bottom: 1px solid var(--pixel-hairline);
		font-family: var(--font-motto);
		font-style: italic;
		font-size: 1.15rem;
		line-height: 1.6;
		color: color-mix(in srgb, var(--ink) 75%, transparent);
	}
	/* Code sets in the data voice on a faint ink wash — a printed listing, not a terminal:
	   hairline border, the theme's 2px cut, and its own horizontal scroll when wide. */
	.docs-prose :global(pre) {
		margin: 1.5rem 0;
		padding: 1rem 1.15rem;
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1px solid var(--pixel-hairline);
		border-radius: 2px;
		overflow-x: auto;
		/* Contain overscroll — no chain to the page (the iOS scroll-lock). */
		overscroll-behavior: contain;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.65;
		color: var(--ink);
	}
	.docs-prose :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		padding: 0.1em 0.35em;
		background: color-mix(in srgb, var(--ink) 6%, transparent);
		border: 1px solid var(--pixel-hairline);
		border-radius: 2px;
	}
	/* Inside a listing the inline chrome comes back off — the block already carries it. */
	.docs-prose :global(pre code) {
		padding: 0;
		background: none;
		border: none;
		font-size: inherit;
	}
	/* ── The Apps shelf ───────────────────────────────────────────────────────────────────────
	   The Apps docs page (.docs-sheet.app-page): a full-width sheet, so the shelf of cards fills
	   it as a responsive grid. The panel's two-column split (the page's appCards snippet → two
	   .app-cards lists) is flattened with display:contents, so every card becomes a direct grid
	   item of .app-cols and the column count follows purely from how many ~17rem tracks the
	   viewport fits — one on a phone, up to three or four on a wide desktop. align-items:start
	   lets each card keep its natural height. The short intro prose above stays at a readable
	   measure. A card's OWN dress (.app-card, .app-ico, .app-blurb) stays in +page.svelte with
	   the snippet that builds it — a card looks the same in the panel as it does on this sheet,
	   and only its LAYOUT on the sheet is this file's business. */
	.app-page .docs-prose {
		max-width: none;
	}
	/* The intro text stays at a readable measure; the pull-quote opts out so its hairline rules
	   run the full sheet width — a divider over the card grid, not a short line floating left. */
	.app-page .docs-prose > :global(:not(.app-cols):not(blockquote)) {
		max-width: 72ch;
	}
	.app-page :global(.app-cols) {
		display: grid;
		/* min(17rem, 100%), not a bare 17rem: a bare track minimum won't shrink below 17rem, so
		   on a phone narrower than that the card overran the sheet's right edge. min(…, 100%)
		   lets the single column collapse to the container width instead of overflowing it. */
		grid-template-columns: repeat(auto-fill, minmax(min(17rem, 100%), 1fr));
		gap: 0.75rem;
		align-items: start;
	}
	.app-page :global(.app-cols > .app-cards) {
		display: contents;
	}
	/* ── The Settings grid ────────────────────────────────────────────────────────────────────
	   The Pixelite docs sheet (.docs-settings) and the full-viewport panel (.surface.expanded
	   .settings, in +page.svelte) lay Settings out the same way: it has more width than a single
	   column of controls needs, so the groups flow into as many ~19rem tracks as fit (two or
	   three on a wide desktop). Grid, not multicol: a group is one cell, so it can never split
	   across a column the way multicol's break rules let a note orphan. Both collapse to one
	   track on a narrow measure.
	   The two used to share one selector list. They are written twice now because they live in
	   two files — and they were never quite one rule anyway: the four rules below tune this grid
	   AGAINST the panel's, which is the more honest reading of two arrangements that agree about
	   their tracks and about nothing else. If you change the track recipe, change both. */
	.docs-settings {
		display: grid;
		/* min(19rem, 100%) so a single track collapses to the container on a narrow phone rather
		   than overflowing it (a bare 19rem minimum can't shrink); no effect on the wide panel. */
		grid-template-columns: repeat(auto-fill, minmax(min(19rem, 100%), 1fr));
		align-content: start;
		gap: 1.75rem 2.75rem;
		/* Groups top-align in their row so single-line leads keep their controls level without the
		   panel's min-height floor (the panel levels leads to a two-line floor so controls line up
		   even when one lead wraps; the docs leads are all one line, and the floor only opened a
		   gap under each header). */
		align-items: start;
	}
	/* The per-lead divider line reads as a stray rule atop a grid cell, so the groups separate by
	   the grid gap alone; the lead that led each group no longer needs its top border. */
	.docs-settings :global(.stg-group > .seg-lead) {
		border-top: none;
		padding-top: 0;
		margin-top: 0;
	}
	/* Each control sits close under its lead — a small section label — rather than at the group's
	   default 1.05rem step. */
	.docs-settings :global(.stg-group > .seg-lead + *) {
		margin-top: 0.5rem;
	}
	/* The grid's row-gap parts the groups, so cancel the pixelite theme's stacked-column margin
	   (puhig pixelite.css: html[data-look=pixelite] .stg-group + .stg-group). Left in, it lands on
	   every group but the first — so within a row the second cell was pushed 2.75rem below the
	   first, and Display Mode / Theme (and every pair) fell out of alignment. */
	.docs-settings :global(.stg-group + .stg-group) {
		margin-top: 0;
	}
	/* Entrance — docs pages settle top-to-bottom in the Weather/Court cadence: the head
	   leads, the next blocks follow, everything deeper arrives on the last beat. Global on the
	   child, because all but the head are the page's; the head is this file's and a global
	   selector reaches it too. */
	@media (prefers-reduced-motion: no-preference) {
		.docs-prose > :global(*) {
			animation: docs-settle 0.45s ease backwards;
		}
		.docs-prose > :global(:nth-child(2)) {
			animation-delay: 0.06s;
		}
		.docs-prose > :global(:nth-child(3)) {
			animation-delay: 0.12s;
		}
		.docs-prose > :global(:nth-child(n + 4)) {
			animation-delay: 0.18s;
		}
	}
	@keyframes docs-settle {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
