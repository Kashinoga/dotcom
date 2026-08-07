<script lang="ts">
	import { onMount } from 'svelte';
	import { DOCS_HTML } from '$lib/docs-content';

	// The design system's own page script, run against the markup above once it is in the DOM. It
	// builds the on-this-page rail from the headings, renders the foundation tables and swatches by
	// reading the LIVE computed tokens, wires the copy buttons on each code block, and offsets anchor
	// landings so a heading does not come to rest under the superbar.
	//
	// ON MOUNT, AND IT HAS TO BE. The script queries the document as soon as it is evaluated, so it
	// must not run until this page's markup exists. A module-level import would execute during SSR,
	// where there is no document at all.
	//
	// The tables and the rail are therefore CLIENT-RENDERED, and that is a real cost stated plainly:
	// a visitor with no JavaScript gets the prose and the code samples — the document — and not the
	// generated apparatus. That is the same trade the design system's own page makes, for the same
	// reason: a table of tokens written into the HTML is a second copy of the tokens, and a value
	// copied is a value that will drift.
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

	<!-- LOCAL: this page only, and built from the headings by the design system's own script — a
	     contents list written by hand is a second copy of the document and will fall out of step with
	     it. The <ul> is empty until that script fills it. -->
	<nav class="docs-rail docs-local" aria-label="On this page">
		<div class="docs-rail__inner">
			<p class="docs-rail__title">On this page</p>
			<ul id="docs-toc" role="list"></ul>
		</div>
	</nav>
</div>
