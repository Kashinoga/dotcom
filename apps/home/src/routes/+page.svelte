<svelte:head>
	<!-- Home is the exception to "page first, site last": here the site name IS the page. -->
	<title>Kashinoga</title>
	<meta name="description" content="A hand-built site." />
</svelte:head>

<!-- BLANK ON PURPOSE, AND NOT A PLACEHOLDER FOR NOTHING. The site is being rebuilt a page at a time,
     and this one has not been written yet — so it says one line and stops, rather than standing in
     with a list of things that do not exist. The way on is the superbar.

     No shell and no rails. Those belong to the DESIGN SYSTEM page, which is a document and has
     sections to list. A blank page wearing a contents rail with nothing in it and an on-this-page
     rail with nothing to jump to would be furniture pretending to be a document. -->
<div class="frame home">
	<main id="main" class="prose">
		<h1>Kashinoga</h1>
		<p class="measure">
			A hand-built site, being rebuilt on its own design system. Start with the
			<a href="/design-system">design system</a>.
		</p>
	</main>
</div>

<style>
	.home {
		/* The bar and the page are two REGIONS — chrome above, reading below — so the distance between
		   them is the region tier rather than a rung picked by eye. The design system page gets this
		   from .docs-shell's own padding; this page has no shell, so it says it itself. */
		padding-block-start: var(--gap-region);

		/* CLAIM THE SLACK, or the footer comes to rest wherever the text happens to end. .docs-scroll
		   is a flex column holding the page and then the footer, and docs.css gives the shell
		   `flex: 1 0 auto` so a short document still pushes the colophon to the bottom edge. This page
		   is not a shell and inherited none of that: two lines of text left the footer floating a
		   third of the way down the window with bare page beneath it.

		   Grow, never a fixed basis: a long page must still grow past the region and scroll, and a
		   ceiling here would clip it. */
		flex: 1 0 auto;
	}
</style>
