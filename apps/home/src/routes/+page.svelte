<script lang="ts">
	// No script. Home is prose, and prose is markup.
	//
	// The old home page was a MAP: an isometric transit diagram of the site, with the places as
	// stops on coloured lines. It is in _TO_MIGRATE and it is not coming back in that form. The
	// reason is not that it was bad — it is that KDS has no map in it, and building one on top of a
	// document system would be the first thing on this site the system did not answer for.
	//
	// A home page's job is to say what this is and where to go. A list of places does that, reads on
	// a phone, survives being printed, and can be navigated by a screen reader in one pass. The map
	// did none of those and was the better thing to look at. That is a real trade, made deliberately
	// and once, in favour of the system.
	//
	// .prose AND NOT .document, WHICH IS A DISTINCTION WORTH GETTING RIGHT ONCE.
	//
	// KDS has both, and they are not two sizes of the same thing. `.document` is the RESEARCH
	// structure — an article with a banner, divisions, a table of contents rail and sidenotes — and
	// inside it <aside> MEANS sidenote: a note floated into the margin beside the line that raises
	// it. `.prose` is the page structure: a run of blocks at one rhythm, which is what a site page
	// is. KDS's own documentation page uses .prose throughout and mentions .document only inside a
	// code sample showing what it is for.
	//
	// This was learnt the expensive way. Home was built on .document first, and the callout below —
	// which is a notice about the whole page, not a note about a line — was floated into the margin
	// and out of the frame, giving the page a sideways scrollbar. The system was not misbehaving. It
	// was reading <aside> exactly as it promises to, in a structure this page had no business using.
</script>

<svelte:head>
	<!-- Page first, site last. A tab strip truncates from the RIGHT, so the word that survives being
	     one of twenty open tabs should be the one naming the page — not the one that repeats on every
	     page of the site. Home is the exception that proves it: here the site name IS the page. -->
	<title>Kashinoga</title>
	<meta name="description" content="A hand-built site, and the design system it is built on." />
</svelte:head>

<header class="prose">
	<h1>Different, Together</h1>
	<p class="measure">
		A hand-built site and a small shelf of live apps, rebuilt on one design system. The writing is
		the point; the apps are what the writing is about.
	</p>

	<!-- A callout, not a paragraph with a bold word at the front. The label says what KIND of note
	     this is, and a kind is not emphasis: bold would make the first word loud and still leave the
	     reader to work out that the sentence after it has a different status from the prose around
	     it. The label and the fill say it outright. The kind sits in a header bar, the same one a
	     code block wears to name its language — both say what the block below them is, so both say it
	     the same way. -->
	<aside class="callout measure">
		<p class="callout__head">Rebuild</p>
		<div class="callout__body">
			<p>
				This site is being rebuilt on the Kashinoga Design System, one page at a time. The apps —
				the text editor, the star map, the weather board and the rest — are not reachable yet. They
				were built against the old look and are waiting their turn.
			</p>
		</div>
	</aside>
</header>

<section class="prose">
	<!-- The id is what the on-this-page rail links to. It is declared alongside the rail's entry in
	     +page.ts, and the two have to agree by hand — see the note there. -->
	<h2 id="where-to-go">Where to go</h2>
	<!-- A plain list, and it is plain on purpose. These are items of ONE kind — places on this site —
	     so what groups them is proximity, which is what .flow does. A card grid would make them look
	     like a set of unrelated products, and a table would promise columns of facts that do not
	     exist. -->
	<ul class="flow measure">
		<li><a href="/about">About</a> — who built this, and why it reads the way it does.</li>
		<li>
			<a href="/design-system">Design system</a> — the foundations, and the reasoning behind each one.
		</li>
	</ul>
</section>

<style>
	/* THE CALLOUT, LIVING HERE FOR NOW AND NOT FOR LONG.
	 *
	 * This is the callout from the design system's own documentation page, which is where it
	 * currently lives — in docs.css, a sheet that explicitly never ships with the system. KDS's
	 * components.css is still empty by design.
	 *
	 * So this block is a MARKER, not a home. It is the first thing this site has needed that the
	 * system does not yet provide, which makes it the first entry on the list of what should migrate
	 * INTO components.css. When it does, this <style> block goes and the markup above stays exactly
	 * as it is — that is the test of whether the component was extracted correctly.
	 *
	 * The reasoning behind the design is written where the design lives, in docs.css. Repeating it
	 * here would put the same argument in two files and let them drift. */
	.callout {
		background-color: color-mix(in srgb, var(--accent) 8%, transparent);
		border-radius: var(--radius-sheet);
		color: color-mix(in srgb, var(--accent) 75%, var(--ink));
	}

	.callout__head {
		display: flex;
		align-items: center;
		gap: var(--gap-within);
		padding-inline: var(--space-16);
		padding-block: var(--gap-tight);
		background-color: color-mix(in srgb, var(--accent) 8%, transparent);
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: var(--weight-strong);
		border-start-start-radius: var(--radius-sheet);
		border-start-end-radius: var(--radius-sheet);
	}

	.callout__body {
		padding: var(--space-16);
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}
</style>
