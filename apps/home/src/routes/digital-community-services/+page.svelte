<script lang="ts">
	import { onMount } from 'svelte';

	// One list, both rails — see the design system page for the same arrangement. The ids match the
	// <section id> attributes below.
	const SECTIONS = [
		{ id: 'available-services', title: 'Available Services' },
		{ id: 'privacy-policy', title: 'Privacy Policy' },
		{ id: 'also-from-me', title: 'Also from me' }
	];

	// Underline the entry whose heading is being read. Lives in a file of its own in the design
	// system so a page like this can have it without the token tables that docs.js assumes.
	onMount(async () => {
		const { markCurrentEntry } = await import('@kashinoga/design-system/docs-rail.js');
		markCurrentEntry();
	});
</script>

<svelte:head>
	<title>Digital Community Services | Kashinoga</title>
	<meta
		name="description"
		content="A digital community service project offering friends and family digital resources for a better digital well-being."
	/>
</svelte:head>

<!-- THE WORDS ARE FROM Notes/Dotcom/Digital Community Services.md, with one addition named below.

     A TOP-LEVEL PAGE, not a part of About Me. It is a project rather than a facet of a person, and
     the home page already lists it beside About Me rather than under it. -->
<div class="frame docs-shell">
	<nav class="docs-rail docs-global" aria-label="Sections">
		<div class="docs-rail__inner">
			<p class="docs-rail__title">Sections</p>
			<ul role="list">
				{#each SECTIONS as section (section.id)}
					<li><a href="#{section.id}">{section.title}</a></li>
				{/each}
			</ul>
		</div>
	</nav>

	<div class="docs-column">
		<main id="main" class="stack" style="--stack-gap: var(--gap-section)">
			<header class="prose">
				<h1>Digital Community Services</h1>
				<p class="measure">
					A digital community service project offering friends and family various digital resources
					for a better digital well-being.
				</p>
			</header>

			<!-- The note writes these as "#", being its own top-level headings. On a page they sit under
			     the page's title, so they are h2 — one h1 for the document, headings under it for its
			     parts. And no rule above them: a thematic break marks the largest boundary on a page, and
			     drawn above every heading it marks none. -->
			<section id="available-services" class="prose">
				<h2>Available Services</h2>
				<ul class="flow measure">
					<li>Matrix, an open communication platform</li>
					<li>Nextcloud, an open productivity platform</li>
					<li>Open WebUI, an open AI interface</li>
				</ul>
			</section>

			<section id="privacy-policy" class="prose">
				<h2>Privacy Policy</h2>
				<!-- AN ORDERED LIST, because the note numbers it and the numbers are referable: "point 1"
				     is a thing somebody can cite in a way "the first bullet" is not. A policy is the one
				     kind of list where that matters. -->
				<ol class="flow measure">
					<li>
						All Digital Community Services (DCS) are hosted locally on hardware I own, unless stated
						otherwise
						<ol class="flow">
							<li>
								Dotcom (<a href="https://www.kashinoga.com">kashinoga.com</a>) is hosted through
								Obsidian
							</li>
						</ol>
					</li>
					<li>
						I don’t care about your data on DCS as long as no one is actively being harmed by it
					</li>
				</ol>
			</section>

			<!-- NOT IN THE NOTE, and here on purpose. About Me's "Digital Fun" list named three things
			     and only one of them is this project; folding that section in without them would have
			     dropped Digital Play Services and SDKK off the site entirely. They are named here, where
			     the rest of that list went, until each has a page or a note of its own.

			     Their descriptions are the note's own words, unchanged. -->
			<section id="also-from-me" class="prose">
				<h2>Also from me</h2>
				<ul class="flow measure">
					<li>
						🎮 Digital Play Services: offering friends various gaming services for casual,
						community, and competitive play — Deadlock, The Finals, Hytale and Terraria
					</li>
					<li>
						💾 SDKK: a Discord community offering a safe and friendly space for whatever is on our
						minds
					</li>
				</ul>
			</section>
		</main>
	</div>

	<nav class="docs-rail docs-local" aria-label="On this page">
		<div class="docs-rail__inner">
			<p class="docs-rail__title">On this page</p>
			<ul id="docs-toc" role="list">
				{#each SECTIONS as section (section.id)}
					<li data-depth="2"><a href="#{section.id}">{section.title}</a></li>
				{/each}
			</ul>
		</div>
	</nav>
</div>

<style>
	/* A CLAUSE UNDER A CLAUSE NEEDS TO LOOK LIKE ONE. The nested item sat one browser-default indent
	   below its parent with no air, which at this measure reads as the parent's second line rather
	   than as a point of its own — and in a policy, "is 1.1 part of 1 or is it the rest of 1" is
	   exactly the question the numbering exists to answer.

	   A unit of space above it and a real step in, which is the same rung every other nested list on
	   this site takes. */
	#privacy-policy ol ol {
		margin-block-start: var(--gap-tight);
		padding-inline-start: var(--space-24);
	}
</style>
