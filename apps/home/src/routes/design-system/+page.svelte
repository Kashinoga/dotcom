<script lang="ts">
	import { onMount } from 'svelte';
	import { DOCS_HTML, DOCS_CONTENTS } from '$lib/docs-content';

	// The design system's own page script, run against the markup above once it is in the DOM. It
	// renders the foundation tables and swatches by reading the LIVE computed tokens, wires the copy
	// buttons on each code block, and offsets anchor landings so a heading does not come to rest under
	// the superbar.
	//
	// IT NO LONGER BUILDS THE CONTENTS RAIL. That is rendered on the server now — see the rail's own
	// note below — and the script leaves an already-filled list alone.
	//
	// ON MOUNT, AND IT HAS TO BE. The script queries the document as soon as it is evaluated, so it
	// must not run until this page's markup exists. A module-level import would execute during SSR,
	// where there is no document at all.
	//
	// WHAT IS STILL CLIENT-RENDERED, said plainly: the swatches and the three foundation tables. A
	// visitor with no JavaScript gets the prose, the code samples and the contents rail — the document
	// and the way around it — but not those. That one is not a shortcut: the tables read the tokens as
	// the BROWSER resolved them, so a wrong value shows up as a wrong swatch. Baking them into the
	// HTML would make them a second copy of the tokens, which is the thing they exist to avoid.
	onMount(async () => {
		await import('@kashinoga/design-system/docs.js');
	});
</script>

<svelte:head>
	<!-- Page first, site last. A tab strip truncates from the RIGHT, so the word that survives being
	     one of twenty open tabs is the one that says which page this is. -->
	<title>Design System | Kashinoga</title>
	<meta
		name="description"
		content="The Kashinoga Design System: foundations, components and the reasoning behind them."
	/>
</svelte:head>

<div class="frame docs-shell">
	<!-- GLOBAL: the same on every page of the document. Sticky, so it is reachable from anywhere in a
	     long document without scrolling back.

	     The BAND is the <nav>; the list inside it is what sticks. The two cannot be the same element —
	     a sticky box is only as tall as its contents, so a painted band that also sticks stops level
	     with the last link and reads as a card floating on the page rather than as the stock the sheet
	     is laid beside. -->
	<nav class="docs-rail docs-global" aria-label="Sections">
		<div class="docs-rail__inner">
			<p class="docs-rail__title">Sections</p>
			<ul role="list">
				<li><a href="#foundations">Foundations</a></li>
				<li><a href="#structure">Structure</a></li>
				<li><a href="#components">Components</a></li>
				<li><a href="#principles">Principles</a></li>
			</ul>
		</div>
	</nav>

	<div class="docs-column">
		<!-- The document itself, taken from the design system rather than copied out of it — see
		     $lib/docs-content.ts. {@html} because it IS html: it is a document written as markup, in
		     the repository that owns it, and re-typing it here in Svelte would create the second copy
		     that module exists to avoid.

		     The content is a build-time import from a first-party package, not anything a visitor can
		     reach or influence, so there is no untrusted string in this path. -->
		<main id="main" class="stack" style="--stack-gap: var(--gap-section)">
			{@html DOCS_HTML}
		</main>
	</div>

	<!-- LOCAL: this page only, and read from the headings rather than written by hand — a contents
	     list typed out separately is a second copy of the document and falls out of step with it.

	     RENDERED HERE, ON THE SERVER, and that is the change worth naming. It used to be built by the
	     design system's script after the page loaded, which meant the rail was missing from the HTML,
	     arrived a beat late, and never arrived at all for a reader without JavaScript. That script now
	     leaves a filled list alone, so this one wins and the two do not both run.

	     `data-depth` is the same attribute the script sets, so docs.css's indent rules apply to these
	     rows exactly as they do to generated ones. -->
	<nav class="docs-rail docs-local" aria-label="On this page">
		<div class="docs-rail__inner">
			<p class="docs-rail__title">On this page</p>
			<ul id="docs-toc" role="list">
				{#each DOCS_CONTENTS as entry (entry.href)}
					<li data-depth={entry.depth}>
						<!-- A section title is an h1 and so is the document's own title; the rail leans on
						     weight rather than size, because the rail is small everywhere. Same rule the
						     script applies, and the same reason. -->
						<a
							href={entry.href}
							style:font-weight={entry.depth === 1 ? 'var(--weight-strong)' : null}
						>
							{entry.title}
						</a>
					</li>
				{/each}
			</ul>
		</div>
	</nav>
</div>
