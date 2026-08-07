<script lang="ts">
	// The system, and the documentation's own sheet. See $lib/styles/system.css for why both.
	import '$lib/styles/system.css';
	import { page } from '$app/state';

	let { children } = $props();

	// The superbar's destinations. Home is the mark on the left, so it is not repeated here.
	const NAV = [{ href: '/design-system', title: 'Design System' }];
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

			<!-- NO DESCRIPTOR AFTER THE RULE, and it is the nav that took its job. On the design system's
			     own page the lockup reads "Kashinoga | Design System", because that site is one document
			     and the descriptor is the only thing naming it. Here the bar already lists the pages and
			     marks the one you are on, so a descriptor put "Design System" twice, four centimetres
			     apart, saying the same thing in two weights.

			     The separator went with it. It is a rule, and a rule is only correct when the boundary IS
			     the content — with nothing on the far side of it there is no boundary left for it to
			     be. -->
		</span>

		<!-- TEXT, NOT KEYS. A destination is not a control: pressing a key does something to the page
		     you are on, and following a link replaces it. Dressing the two the same way says they are
		     the same kind of act, and the bar then reads as a row of buttons with one odd one out.
		     Plain words beside the wordmark, with the underline arriving on hover.

		     .docs-nav IS THE DESIGN SYSTEM'S OWN, and it was here before this site was — the bar used
		     to carry the section links this way, until they moved to the left rail and the markup went
		     with them. The rules stayed. Paired with .row, which is what makes it a flex line, this is
		     the markup that used to be in index.html, restored rather than reinvented. -->
		<nav class="row docs-nav" aria-label="Site">
			{#each NAV as item (item.href)}
				<a
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
	/* THE NAV CLAIMS NO FREE SPACE, and that is the only thing this site changes about it. docs.css
	   gives .docs-nav an auto margin from the days when the nav was the LAST thing in the bar and the
	   push had to come from it. The scheme key carries its own auto margin now, so leaving both in
	   place gives the bar two claims on the slack — flexbox splits it between them, and the nav comes
	   to rest in the middle of the bar looking deliberate and wrong. Measured, not guessed.
	 *
	   Beside the wordmark is also where it belongs. The bar reads left to right as: whose site, then
	   where in it, then the controls at the far edge. */
	.docs-nav {
		/* THE BRAND AND THE NAV ARE TWO GROUPS; the nav items are one. So the distance between the
		   wordmark and the first destination has to be larger than the distance between destinations,
		   or the wordmark reads as the first item in the list.
		 *
		   Both were --space. The bar puts one unit between its children and .docs-nav puts one unit
		   between its own, so the two boundaries measured the same and the eye had nothing to sort
		   them with. It does not show with one entry and would have shown badly with three, which is
		   the kind of fault worth fixing before it is visible.
		 *
		   Written as the shortfall rather than as a number, so it stays correct if the bar's own gap
		   is ever retuned: whatever the bar contributes, this makes the total --gap-between. It also
		   replaces the auto margin docs.css sets here — from the days when the nav was the LAST thing
		   in the bar and the push to the far edge had to come from it. The scheme key carries its own
		   auto now, and leaving both in place gave the bar two claims on the free space, which
		   flexbox split between them: the nav came to rest mid-bar looking deliberate and wrong. */
		margin-inline-start: calc(var(--gap-between) - var(--space));

		/* .row centres its items; the bar sets everything else on the baseline. A word beside a word
		   should sit on the same line as the word next to it. */
		--row-align: baseline;
	}

	/* TRIM THE HALF-LEADING, WHICH CHANGES NOTHING ON SCREEN AND ONE THING IN THE INSPECTOR.
	 *
	 * This box measured 106 x 18 and sat two pixels above the bar's centre, which is what an
	 * inspector shows and what it looks like is wrong. It is not: measured off the rendered pixels,
	 * the GLYPHS run 14→29 in a 42px bar — twelve clear above, twelve clear below — and land on the
	 * same rows as the wordmark's, to the pixel. The box is off centre precisely BECAUSE the ink is
	 * centred: a line box is taller than its letters, the leading is split by the face's own metrics
	 * rather than evenly, and this face carries more ascent than descent. Centring the box would have
	 * moved the text off centre to make the rectangle look right.
	 *
	 * So the fix is to make the box say what the ink already does. Trimmed to the cap band the box
	 * becomes 11.2 tall and hugs the letters, and not one pixel of rendering moves — measured before
	 * and after, the ink is 14→29 either way and the baseline still agrees with the wordmark exactly.
	 *
	 * This is the system's own rule reaching a place it had not been applied. base.css trims every
	 * block in the document rhythm, and says why: an untrimmed box makes every spacing value
	 * understate itself, so measured space stops meaning what it says. A bar is not the rhythm, but
	 * the reason travels — the moment anything here takes padding or a fill, an untrimmed box would
	 * put it on unevenly.
	 *
	 * Where it belongs is docs.css, beside the rest of .docs-nav. It is here because it was found
	 * here, and it is the third thing on the list of what should go back to the design system. */
	.docs-nav a {
		text-box: trim-both cap alphabetic;
	}

	/* THE PAGE YOU ARE ON, said with weight. The other two signals are spoken for — the underline
	   means "hovered" and the ink is already the bar's. Weight is what is left, and it is enough. */
	.docs-nav a[aria-current='page'] {
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
