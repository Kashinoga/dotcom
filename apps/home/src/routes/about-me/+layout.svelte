<script lang="ts">
	import { page } from '$app/state';
	import { ABOUT_PAGES } from '$lib/about';

	let { children } = $props();
</script>

<!-- THE SHELL IS THE GROUP'S, NOT EACH PAGE'S. About Me and its three parts are one document split
     across four routes, so the furniture around them is written once here and each page supplies
     only its own words. Four copies of this markup would be four things to keep in agreement, and
     the rail is the one that would silently fall out of it.

     ONE RAIL, ON THE LEFT, and it lists the group's PAGES rather than a page's headings. That is the
     job a rail does here: these four are short and have no internal divisions, so a second rail
     saying "on this page" would have nothing to put in it. The design system's page keeps two
     because that document goes three levels deep and genuinely has both to say. -->
<div class="frame docs-shell">
	<nav class="docs-rail docs-global" aria-label="Sections">
		<!-- The BAND is the <nav>; the list inside it is what sticks. A sticky box is only as tall as
		     its contents, so a painted band that also sticks stops level with the last link and reads as
		     a card floating on the page rather than as the stock the sheet is laid beside. -->
		<div class="docs-rail__inner">
			<p class="docs-rail__title">Sections</p>
			<ul role="list">
				{#each ABOUT_PAGES as entry (entry.href)}
					<li>
						<!-- aria-current on the link, and the styling hangs off THAT rather than a class of its
						     own: the state is one the platform already knows how to say, so saying it twice is
						     two things that can fall out of step. `page` because these ARE pages — the design
						     system's rail uses `location` for a heading within one, which is a different
						     claim. -->
						<a
							href={entry.href}
							aria-current={page.url.pathname === entry.href ? 'page' : undefined}
						>
							{entry.title}
						</a>
					</li>
				{/each}
			</ul>
		</div>
	</nav>

	<div class="docs-column">
		<main id="main" class="stack" style="--stack-gap: var(--gap-section)">
			{@render children()}
		</main>
	</div>
</div>
