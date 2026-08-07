<script lang="ts">
	// The whole stylesheet of the site. See $lib/styles/system.css for why it is one line.
	import '$lib/styles/system.css';

	let { children } = $props();
</script>

<!-- THE SKIP LINK IS THE FIRST FOCUSABLE THING ON THE PAGE, and it has to be, because that is the
     only position from which it does its job: somebody tabbing into the document reaches it before
     the masthead's links rather than after them. `.visually-hidden` in KDS un-hides on :focus, so it
     is invisible until it is the thing you are on. -->
<a class="visually-hidden" href="#main">Skip to content</a>

<!-- ONE `banner` LANDMARK ON THE PAGE, and this is it. KDS's layout notes are explicit that a site
     header and a document header are the same job done twice: <header> as a child of <body> becomes
     the `banner` landmark, and two of them leaves a reader navigating by landmark unable to say
     which is the site. So the masthead is the banner, and a page's own title lives inside its
     <article>, where it belongs to the document rather than to the site. -->
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

<!-- .stack at the region tier, which is what separates one .prose block from the next. KDS's own
     documentation page is built the same way, and it is the reason a page here is a run of
     <header>/<section class="prose"> siblings rather than one nested tree: the rhythm INSIDE a block
     is the prose rule, and the distance BETWEEN blocks is the stack's. Two jobs, two owners. -->
<main id="main" class="frame stack" style="--stack-gap: var(--gap-section)">
	{@render children()}
</main>

<!-- The gap between the bar and the first line of the document is a REGION boundary — chrome above,
     reading below — so it takes the region tier rather than a rung picked by eye. -->

<footer class="colophon">
	<div class="frame">
		<p class="sub">Hand-built. No tracking, no cookies, nothing to accept.</p>
	</div>
</footer>

<style>
	/* THE MASTHEAD IS CHROME, AND CHROME IS NOT THE DOCUMENT. The one thing it must say is "the page
	   starts below here", and it says it the way this system says everything first: with space, then
	   with colour if space cannot. Space alone cannot, because the bar stays while the text scrolls
	   under it — so the surface changes, and that is the second step, used where the second step is
	   correct.

	   NO BORDER UNDER IT. The fill already supplies the edge. A rule as well would be the same
	   boundary stated twice, which is the rule this system runs on. */
	.masthead {
		background-color: var(--surface);
		padding-block: var(--space-12);
	}

	/* The lockup. `--row-gap` is the knob KDS's .row exposes, so the gap is retuned per instance
	   without a modifier class or a specificity fight. */
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

	main {
		/* See the note above the element. The bar and the document are two regions, so the distance
		   between them is the region tier — not a rung chosen because it looked about right. */
		padding-block-start: var(--gap-region);
	}

	/* THE FOOTER IS THE PAGE ENDING, NOT A SECTION OF IT — so what separates it from the text above
	   is a section's worth of space, and nothing else. It takes the page's own ground rather than
	   the sheet's, which is what says it is outside the reading. */
	.colophon {
		margin-block-start: var(--gap-section);
		padding-block: var(--space-24);
	}
</style>
