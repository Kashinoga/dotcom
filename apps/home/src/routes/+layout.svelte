<script lang="ts">
	// The whole stylesheet of the site. See $lib/styles/system.css for why it is one line.
	import '$lib/styles/system.css';
	import { page } from '$app/state';
	import { PLACES, type Section } from '$lib/places';

	let { children } = $props();

	// What the local rail lists, handed up from the page's own load(). A page that declares none
	// gets an empty list and the rail renders its heading over nothing, which is deliberate — see
	// the note on .rail__empty.
	const sections = $derived<Section[]>(page.data.sections ?? []);
</script>

<!-- THE SKIP LINK IS THE FIRST FOCUSABLE THING ON THE PAGE, and it has to be, because that is the
     only position from which it does its job: somebody tabbing into the document reaches it before
     the masthead and both rails rather than after them. `.visually-hidden` in KDS un-hides on
     :focus, so it is invisible until it is the thing you are on. -->
<a class="visually-hidden" href="#main">Skip to content</a>

<!-- ONE `banner` LANDMARK ON THE PAGE, and this is it. KDS's layout notes are explicit that a site
     header and a document header are the same job done twice: <header> as a child of <body> becomes
     the `banner` landmark, and two of them leaves a reader navigating by landmark unable to say
     which is the site. So the masthead is the banner, and a page's own title lives in its own
     <header class="prose">, where it belongs to the page rather than to the site. -->
<header class="masthead">
	<div class="frame row">
		<!-- The mark and the name are ONE element because they say one thing. A screen reader that
		     announced both would announce the site twice, so the image is alt="" — decorative, which
		     is what it is. It is the same file as the favicon rather than a copy: a second copy of a
		     mark is a mark that will drift. -->
		<a class="masthead__wordmark" href="/">
			<img src="/favicon.svg" alt="" width="24" height="24" />
			Kashinoga
		</a>
	</div>
</header>

<div class="frame shell">
	<!-- THE GLOBAL RAIL — where you are in the site. First in the source, which is the correct
	     reading order at every width: somebody who cannot see the rails meets the site's contents,
	     then the page, then the page's own contents. That order is why the narrow form stacks in this
	     sequence and needs no reordering to do it. -->
	<nav class="rail rail--global" aria-label="Sections">
		<div class="rail__inner">
			<p class="rail__title">Sections</p>
			<ul class="rail__list">
				{#each PLACES as place (place.href)}
					<li>
						{#if !place.ready}
							<!-- Listed, not linked. The shape of the site is a fact about the site; how far the
							     rebuild has got is a fact about the rebuild. The rail states both rather than
							     hiding the first to avoid admitting the second. -->
							<!-- The separator is a real non-breaking space, not a margin. A gap would look
							     identical and produce "Aboutsoon" on copy-paste and in the accessibility
							     tree — the same trap KDS names for a figure and its unit. -->
							<span class="rail__pending">{place.title}&nbsp;— soon</span>
						{:else if page.url.pathname === place.href}
							<!-- aria-current on the link, and the styling hangs off THAT rather than off a
							     class of its own. The state is one the platform already knows how to say, so
							     saying it twice is two things that can fall out of step. -->
							<a href={place.href} aria-current="page">{place.title}</a>
						{:else}
							<a href={place.href}>{place.title}</a>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	</nav>

	<main id="main" class="shell__column stack" style="--stack-gap: var(--gap-section)">
		{@render children()}
	</main>

	<!-- THE LOCAL RAIL — where you are in the page. Last in the source, because it is the last thing
	     a reader needs: you cannot want a jump list for a page you have not started. -->
	<nav class="rail rail--local" aria-label="On this page">
		<div class="rail__inner">
			<p class="rail__title">On this page</p>
			{#if sections.length}
				<ul class="rail__list">
					{#each sections as section (section.id)}
						<li><a href="#{section.id}">{section.title}</a></li>
					{/each}
				</ul>
			{:else}
				<p class="rail__empty sub">Nothing to jump to.</p>
			{/if}
		</div>
	</nav>
</div>

<footer class="colophon">
	<div class="frame">
		<p class="sub">Hand-built. No tracking, no cookies, nothing to accept.</p>
	</div>
</footer>

<style>
	/* THE MASTHEAD IS CHROME, AND CHROME IS NOT THE PAGE. The one thing it must say is "the reading
	   starts below here", and it says it the way this system says everything first: with space, then
	   with colour if space cannot. Space alone cannot, because the bar stays while the text scrolls
	   under it — so the surface changes, which is the second step, used where the second step is
	   correct.

	   NO BORDER UNDER IT. The fill already supplies the edge. A rule as well would be the same
	   boundary stated twice, which is the rule this system runs on. */
	.masthead {
		background-color: var(--surface);
		padding-block: var(--space-12);
	}

	.masthead__wordmark {
		--row-gap: var(--gap-tight);

		display: inline-flex;
		align-items: center;
		gap: var(--gap-tight);
		color: var(--ink);
		font-weight: var(--weight-strong);
		/* The one link on the site that is NOT underlined, and it needs the exception written down.
		   KDS underlines every link on purpose — a reader scanning a technical document for citations
		   should not have to hover to find them. A wordmark is not a citation. It is the site saying
		   its own name, and it is recognised as a link by being the mark in the top-left corner,
		   which is the one place on a page where that is already understood. */
		text-decoration: none;
	}

	.masthead__wordmark img {
		/* Block, so the image does not sit on a text baseline and drag half a leading of air under
		   the lockup. Flex alignment is doing the vertical centring already. */
		display: block;
	}

	/* --- THE SHELL: three regions, and they TILE ------------------------------------------------
	 *
	 * A CANDIDATE FOR THE DESIGN SYSTEM, NOT A HOME FOR ONE. The three-region desk is worked out in
	 * KDS's own docs.css — a sheet that explicitly never ships with the system — and the derivation
	 * below is that one, followed rather than reinvented. It belongs in KDS beside the callout, and
	 * this block is the second entry on the list of what should migrate into its empty
	 * components.css.
	 *
	 * NARROW FIRST, AND THE NARROW FORM IS A STACK. One column, three children in source order:
	 * site contents, page, page contents. No query says so, because that is what a grid with one
	 * column already does — and it is the correct reading order, so nothing has to be moved to get
	 * it.
	 *
	 * The rows are NAMED rather than left implicit, and that is not tidiness. Three implicit auto
	 * tracks share spare height equally, so on a short page two thirds of the slack goes to the two
	 * lists and the page content floats in the middle of the window. Only the middle track may
	 * absorb it. */
	.shell {
		--rail-width: var(--rail);

		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto 1fr auto;
		/* The bar and the page are two REGIONS — chrome above, reading below — so the distance
		   between them is the region tier rather than a rung picked by eye. On the shell and not on
		   <main>, because the rails start at the top of this box too and would otherwise begin level
		   with the bar while the text began below it. */
		padding-block-start: var(--gap-region);
	}

	/* minmax(0, 1fr) and not a bare 1fr. A grid item's automatic minimum size is its CONTENT's, so a
	   wide child — a code sample, a table — would push the column past its track and give the page a
	   sideways scrollbar instead of scrolling inside itself. */
	.shell__column {
		min-inline-size: 0;
	}

	/* ONE RAIL, at the width where the frame first holds one. KDS's .frame steps to
	   `--measure + --rail` at exactly this breakpoint, so the pair 224 + 768 IS the frame here: the
	   text sits at its full measure and nothing is left over.

	   FIXED, NOT A FRACTION. A rail holds a list of words, and its width answers to the words rather
	   than to the window. Written as a fraction, the text region comes out fractional too, and every
	   grid nested inside it inherits the fraction.

	   The local rail stays stacked below the text at this step — there is room for one rail, and the
	   one that earns it is the one that says where you are in the SITE. */
	@media (min-width: 64rem) {
		.shell {
			grid-template-columns: var(--rail-width) minmax(0, 1fr);
			/* The text takes the slack; the local rail sits under it at its own height. Get this the
			   other way round and the spare height lands on a list again. */
			grid-template-rows: 1fr auto;
		}

		/* Span both rows, so the global rail starts at the top of the shell BESIDE the text rather
		   than in a row of its own above it. */
		.rail--global {
			grid-row: 1 / -1;
		}

		.rail--global {
			padding-inline-end: var(--gap-region);
		}
	}

	/* BOTH RAILS. 224 + 768 + 224 plus two gutters is --width-page, which is where KDS's .frame
	   stops growing — so again the tracks ARE the frame, with nothing left between them.
	 *
	 * REGIONS TILE: the gap lives inside a region, never between them as a grid gap. Put a
	 * --gap-region between each and the arithmetic does not close — the layout the region sizes
	 * describe cannot be built at all. Taking it out of a region instead keeps every edge where the
	 * derivation puts it and costs that region its gap's worth of content width. The apparatus pays
	 * for the boundary, because the apparatus is what can afford to.
	 *
	 * 224 rather than anything wider, because a rail that sits far from the text reads as belonging
	 * to the window rather than to the page. A nav you have to track across empty space to reach has
	 * stopped being part of what you are reading. */
	@media (min-width: 82rem) {
		.shell {
			grid-template-columns:
				calc(var(--rail-width) - var(--space-8))
				minmax(0, 1fr)
				calc(var(--rail-width) - var(--space-8));
			column-gap: var(--space-8);
			/* All three on ONE row now, so the ladder above is wrong here: it would hand the spare
			   height to an empty second track and size the row holding the page to its content. One
			   track, and it takes everything.
			 *
			   One track is also what lets the rails go at the bottom. A sticky element is clamped by
			   its grid CONTAINER's box, not by its own area — so with the shell ending where this row
			   ends, the rails travel up and out exactly as the footer arrives. */
			grid-template-rows: 1fr;
		}

		.rail--global {
			grid-row: auto;
			/* The gutter is the shell's now, not the rail's. */
			padding-inline-end: 0;
		}
	}

	/* --- The rails -------------------------------------------------------------------------------
	 *
	 * A rail is APPARATUS, not reading. It takes the small size and the muted ink because it says
	 * where things are rather than what they say, and neither is what the reader came for. */
	.rail {
		font-size: var(--text-sm);
	}

	/* A STACKED RAIL IS A BLOCK, AND A BLOCK NEEDS ROOM. While a rail sits above or below the text
	   rather than beside it, it is another region in one column, so the distance to its neighbour is
	   the region tier. Dropped, the local rail came to rest on the last line of the text and the two
	   overlapped.

	   Written as the DEFAULT and unset at the step where each rail moves into a column of its own,
	   rather than the other way round: the stacked form is the form that needs no query, so it is the
	   one that should not have to ask for anything. */
	.rail--global {
		margin-block-end: var(--gap-region);
	}

	.rail--local {
		margin-block-start: var(--gap-region);
	}

	/* The part of pinning that costs nothing when the rail is NOT pinned. `inset-block-start` does
	   nothing to a static box, and the other two are wanted either way — so they are stated once here
	   rather than twice below.

	   ROOM FOR THE DESCENDERS, and it is `overflow` that makes it necessary rather than taste. KDS
	   trims the half-leading off every block in the rhythm, list items included, so a line box now
	   ENDS at the alphabetic baseline and the tails of g, y and p hang below it. That is correct and
	   invisible in normal flow — the next block's gap is where they hang. A scroll container has no
	   next block: it clips at its padding box, and the last entry in each rail lost its tails,
	   rendering "Design system" as "Desian svstem". The trim is not wrong and the overflow is not
	   optional, so the padding is what reconciles them. */
	.rail__inner {
		inset-block-start: var(--space);
		/* A rail that has scrolled to its end must not hand the rest of the gesture to the page
		   behind it. */
		overscroll-behavior: contain;
		padding-block-end: var(--gap-tight);
	}

	/* STICKY, AND ONLY ONCE THERE IS A COLUMN TO STICK IN. A contents list that scrolls away has
	   stopped being a contents list — but a rail that is STACKED has no column to travel in, and
	   pinning it there lifts a block over the text it was sitting under. That is exactly what
	   happened: the rule was written once for both rails at the one-rail step, where the local rail
	   is still stacked, and it came to rest across the last line of the page.

	   So each rail is pinned at the step where it BECOMES a rail, and not before. The global one
	   moves beside the text first, because it is the one that earns the single column the frame can
	   hold at that width; the local one waits for the second.

	   The pair of declarations below is the same in both places on purpose. It is what "pinned"
	   means, and naming it twice is cheaper than a third selector that means nothing on its own. */
	@media (min-width: 64rem) {
		.rail--global {
			margin-block-end: 0;
		}

		.rail--global .rail__inner {
			position: sticky;
			max-block-size: calc(100svb - var(--space-x2));
			overflow-y: auto;
		}
	}

	@media (min-width: 82rem) {
		.rail--local {
			margin-block-start: 0;
		}

		.rail--local .rail__inner {
			position: sticky;
			max-block-size: calc(100svb - var(--space-x2));
			overflow-y: auto;
		}
	}

	.rail__title {
		color: var(--sub);
		font-size: var(--text-xs);
		/* A full unit, not the tight gap. --gap-tight was tried first, on the reading that a title
		   sits ON what it introduces — which is true, and four pixels is still the wrong number here.
		   The blocks are trimmed to the alphabetic baseline, so at this size the descenders hang into
		   the gap and four became nearly nothing. --gap-tight is for a label beside its field. */
		margin-block-end: var(--space);
	}

	/* No bullets and no indent. A rail is a column of destinations, not an enumeration — the marker
	   would be a second thing to read on every line and says nothing the position does not. */
	.rail__list {
		list-style: none;
		padding-inline-start: 0;
		display: flex;
		flex-direction: column;
		/* One unit between entries, which is what KDS's own rail uses. --gap-tight was tried and the
		   list read as a solid block of text rather than a set of destinations: with the leading
		   trimmed off each line there is no half-leading left to stand in for the separation, so the
		   gap has to supply all of it. */
		gap: var(--gap-within);
	}

	/* A RAIL'S LINKS ARE NOT CITATIONS, so they do not wear the citation treatment. KDS underlines
	   every link in prose on purpose — a reader scanning a technical document for references should
	   not have to hover to find them — and a rail is the opposite case: EVERY line is a link, so an
	   underline on each marks nothing and just thickens the column. Position says they are
	   navigable; the underline arrives on hover, when the reader has asked. */
	.rail__list a {
		color: var(--ink);
		text-decoration: none;
	}

	.rail__list a:hover {
		text-decoration: underline;
	}

	/* THE PAGE YOU ARE ON, said with weight. It is the only entry in the rail that differs from its
	   neighbours, and weight is the one signal here that is not already carrying something else. */
	.rail__list a[aria-current='page'] {
		font-weight: var(--weight-strong);
	}

	/* A place that exists in the site and not yet on disk. Muted, and not a link, so it cannot be
	   clicked into a 404. */
	.rail__pending {
		color: var(--sub);
	}

	/* AN EMPTY RAIL STILL SAYS SOMETHING, and that is why this exists rather than the rail hiding
	   itself. The apparatus is part of the page's shape; a page whose furniture appears and
	   disappears with its content teaches a reader nothing they can rely on. So the rail stays, and
	   says plainly that there is nothing in it. */
	.rail__empty {
		font-size: var(--text-sm);
	}

	/* THE FOOTER IS THE PAGE ENDING, NOT A REGION OF IT — so it sits OUTSIDE the shell, and that is
	   load-bearing rather than tidy. A sticky rail is clamped by its grid container's box, so a
	   footer placed in a row inside the shell would have the rails pinned over the top of it. It
	   leaves the grid, and the rails let go exactly where the shell ends. */
	.colophon {
		margin-block-start: var(--gap-section);
		padding-block: var(--space-24);
	}
</style>
