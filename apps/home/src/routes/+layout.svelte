<script lang="ts">
	// The system, and the documentation's own sheet. See $lib/styles/system.css for why both.
	import '$lib/styles/system.css';
	import { page } from '$app/state';

	let { children } = $props();

	// The superbar's destinations. Home is the mark on the left, so it is not repeated here.
	const NAV = [{ href: '/design-system', title: 'Design System' }];

	// What the bar shows to the right of the rule: the page you are on. On the design system's own
	// site this is a fixed descriptor, because that site is one document. Here it names the page,
	// because this site has more than one.
	const here = $derived(NAV.find((n) => page.url.pathname.startsWith(n.href))?.title ?? '');
</script>

<!-- EVERY CLASS BELOW IS THE DESIGN SYSTEM'S OWN, and that is the point of this file rather than an
     accident of it. The bar, the rails, the sheet and the footer are all worked out in docs.css —
     the arithmetic, the sticky behaviour, the reason the footer sits outside the shell. Writing a
     second set here that looked similar would be a second copy of a hard-won layout. This file
     supplies the STRUCTURE those rules expect and no styling of its own. -->
<a class="visually-hidden" href="#main">Skip to content</a>

<header class="docs-bar">
	<div class="frame row">
		<!-- The mark, the name and the descriptor are ONE lockup, so they are one element with their
		     own spacing. The bar's gap then separates the lockup from the controls, which is the only
		     boundary left in here that space has to carry. -->
		<span class="docs-lockup">
			<!-- The mark and the name are one thing — the mark says nothing the name does not, so a
			     screen reader announcing both would announce the site twice. alt="" makes the image
			     decorative, which is what it is. Here the wordmark is also the way home, which it is
			     not on the design system's own page: that site is one document and has nowhere to go. -->
			<a class="docs-wordmark" href="/">
				<img class="docs-mark" src="/favicon.svg" alt="" width="24" height="24" />
				Kashinoga
			</a>

			{#if here}
				<!-- A drawn rule, and one of the three places this page draws one. It is the third step
				     of the escalation used where the third step is actually correct: the boundary here IS
				     the content. A separator has no other job. -->
				<span class="docs-sep" aria-hidden="true"></span>
				<span class="sub">{here}</span>
			{/if}
		</span>

		<nav class="docs-bar__nav" aria-label="Site">
			{#each NAV as item (item.href)}
				<a
					class="docs-key"
					href={item.href}
					aria-current={page.url.pathname.startsWith(item.href) ? 'page' : undefined}
				>
					{item.title}
				</a>
			{/each}
		</nav>

		<!-- THE SCHEME CONTROL, AND IT IS NOT OPTIONAL FURNITURE. It is wired by the design system's
		     own script, which reaches for #scheme-toggle at module scope and calls addEventListener on
		     it without a guard. Leaving it out of the bar did not produce a bar without a button — it
		     threw "Cannot read properties of null", aborted the rest of that module, and took the
		     on-this-page rail down with it, because the rail is built further down the same file.

		     The failure looked nothing like its cause: the swatches and the three foundation tables
		     rendered correctly, since they are built ABOVE the throw. A rail that is simply empty reads
		     as "this page has no headings", not as "a script died". Worth remembering when the next
		     piece of that page's apparatus goes quiet. -->
		<button
			type="button"
			id="scheme-toggle"
			class="docs-key"
			aria-pressed="false"
			data-tip-align="end"
		>
			<span id="scheme-label">Auto</span>
		</button>
	</div>
</header>

<!-- The bar sits OUTSIDE this element, so the scrollbar belongs to the region that actually scrolls
     and starts below the bar rather than running the full height of the window past chrome that
     never moves. -->
<div class="docs-scroll">
	{@render children()}

	<!-- OUTSIDE the shell, not merely outside the column, and that is what makes the rails let go. A
	     sticky rail is clamped by its grid CONTAINER rather than by its grid area, so a footer given a
	     row inside the shell slides underneath two rails that stay pinned to the top of the window.
	     As a sibling, the shell's box ends before this, and the rails ride up and out as it arrives.

	     Outside .frame as well, so the band spans the window; the content inside goes back on .frame
	     to line up with the desk above. -->
	<footer class="docs-footer">
		<div class="frame">
			<p class="sub">Hand-built. No tracking, no cookies, nothing to accept.</p>
		</div>
	</footer>
</div>

<style>
	/* EVERY RULE IN THIS BLOCK EXISTS FOR ONE REASON: this bar has navigation in it and the design
	   system's own bar does not. That site is a single document, so its bar carries a wordmark and one
	   control, and neither is a link. Put links in the same bar and they meet the system's link rules
	   — accent ink and an underline — which are right for prose and wrong for chrome.
	 *
	   So: no new objects, no second look. The nav keys are the same .docs-key the scheme toggle wears,
	   so the two kinds of control in the bar stay one kind of object, and the rules below only undo
	   the treatment a link picks up by being a link. */

	/* NO AUTO MARGIN HERE, and the reason is that the system already supplies one. docs.css says
	   `.docs-bar .docs-key { margin-inline-start: auto }` so its single control sits at the far end.
	   Adding a second auto margin on this nav did not move the nav to the end — it gave the bar TWO
	   free-space claims, flexbox split the slack between them, and the nav came to rest in the middle
	   of the bar looking deliberate and wrong.
	 *
	   So the nav claims nothing. It sits beside the lockup, where site navigation belongs, and the
	   scheme key's own auto margin still carries it to the far edge. */
	.docs-bar__nav {
		display: flex;
		align-items: baseline;
		gap: var(--space-12);
	}

	/* A KEY IS A CONTROL, NOT A CITATION. .docs-key is worn by a <button> on the design system's own
	   page, so it never met the link rules; worn by an <a> it picks up the accent and the underline,
	   and the bar ends up with a key that is also a footnote. The fill and the border already say
	   "pressable" — an underline inside a button-shaped box says it a third time. */
	.docs-bar__nav .docs-key {
		color: var(--ink);
		text-decoration: none;
	}

	/* THE PAGE YOU ARE ON, said with weight. Every other signal on this key is already carrying
	   something: the fill says "hovered", the border says "pressable". Weight is free. */
	.docs-bar__nav a[aria-current='page'] {
		font-weight: var(--weight-strong);
	}

	/* THE WORDMARK IS A LINK HERE AND IS NOT ONE ON THE DESIGN SYSTEM'S OWN PAGE — that site is a
	   single document with nowhere to go, so its wordmark is a <span> and never met the link rules.
	   Made an <a>, it picked them up: accent ink and an underline, so the site's own name read as a
	   citation in its own bar.
	 *
	   KDS underlines links deliberately, so a reader scanning a technical document for references
	   does not have to hover to find them. A wordmark is not a reference. It is the site saying its
	   own name, and it is understood as the way home by being the mark in the top-left corner, which
	   is the one place on a page where that needs no marking at all. */
	.docs-wordmark {
		color: var(--ink);
		text-decoration: none;
	}
</style>
