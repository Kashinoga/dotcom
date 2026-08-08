<svelte:head>
	<!-- Home is the exception to "page first, site last": here the site name IS the page. -->
	<title>Kashinoga</title>
	<meta
		name="description"
		content="Kashinoga — Andrew Nguyen's virtual home, and the mostly fun things found or made there."
	/>
</svelte:head>

<!-- THE SAME SHELL THE DESIGN SYSTEM PAGE USES, with no rails in it.
     Every page on this site is a document in the same desk, so every page is built out of the same
     three elements: .docs-shell inside the frame, .docs-column inside that, <main> inside that. What
     differs between pages is what is placed BESIDE the column, and here that is nothing.

     This page had a wrapper of its own before, and the wrapper was the whole problem: it carried its
     own top spacing, its own claim on the leftover height, and its own idea of how wide the page
     should be — three numbers reinvented next to three that already existed, and they did not agree.
     The gap under the superbar was visibly different from one page to the next. Structure that is
     shared has to be the same structure, not a matching one.

     The shell handles a missing rail itself: docs.css spans a lone .docs-column across every track,
     because the condition is "there is nothing beside it" and :only-child says exactly that. Add a
     rail here later and the grid takes it with no change to this file.

     THE WORDS ARE FROM Notes/Dotcom/Welcome.md, and they are the page rather than a summary of it.
     Two things changed on the way in, both markup rather than writing:

     The wiki-links [[About Me]] and [[Digital Community Services]] name pages that do not exist yet,
     so they are LISTED and not linked. A link that goes nowhere is worse than an entry that says
     "not yet": the first wastes a click and blames the reader, the second is just true.

     The source's second "# What's Around Here" is a heading of the same rank as the first, which is
     what a markdown file has to do — it has one level of top heading and no sections. Here it is a
     real <section>, with the thematic break the design system puts before every section title. -->
<div class="frame docs-shell">
	<div class="docs-column">
		<main id="main" class="stack" style="--stack-gap: var(--gap-section)">
			<header class="prose">
				<h1>My Virtual Home</h1>
				<p class="measure">Hi, my name is Andrew Nguyen.</p>
				<p class="measure">This is Kashinoga, my virtual home.</p>
				<p class="measure">Here, you’ll find the (mostly) fun things that I’ve created or found.</p>
				<p class="measure">I hope you enjoy your time here.</p>
				<p class="measure">Take care.</p>
			</header>

			<!-- h2, because the note writes it as "##" and that is what "##" means: one h1 for the
			     document, headings under it for its parts.

			     NO RULE ABOVE IT. A thematic break belongs above a top-level division and nowhere else —
			     drawn above an h2 as well it stops marking the largest boundary on the page and starts
			     marking every boundary, which is the same as marking none. Space carries this one, which
			     is what --gap-section is for: "between sections — where a rule used to be". -->
			<section class="prose">
				<h2>What’s Around Here</h2>
				<!-- Items of ONE kind, so what groups them is proximity — which is what .flow does. -->
				<ul class="flow measure">
					<li><a href="/about-me">About Me</a></li>
					<li>Digital Community Services&nbsp;<span class="sub">— soon</span></li>
				</ul>
			</section>
		</main>
	</div>
</div>
