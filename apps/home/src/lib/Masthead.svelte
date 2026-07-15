<script lang="ts">
	import SplitFlap from '$lib/SplitFlap.svelte';
	import { airports } from '$lib/network';
	import { viewPath } from '$lib/views';

	// Persistent homepage masthead: wordmark + tagline + the primary station nav, as a fixed
	// top bar that stays put while a panel is open. Extracted from the catch-all page so a
	// homepage-chrome tweak lands in its own file (and its own test-scope) instead of the
	// mega-page — see the NARROW map in e2e/run.mjs.
	//
	// `activeCode` is the open station's code (or null) — a plain string, so this component
	// needs neither the page's `View` union nor its navigation internals. `onNavigate` wraps the
	// page's modifier-aware click + camera handling; the component just reports the clicked code.
	// `covered` — a panel is filling the viewport over this masthead. It fades out entirely:
	// blurred glass over a photo reads as texture, but blurred TEXT reads as something wrong
	// with your eyes. (Also drops it from the tab order while it can't be seen.)
	let {
		activeCode = null,
		covered = false,
		onNavigate
	}: {
		activeCode?: string | null;
		covered?: boolean;
		onNavigate: (code: string, e: MouseEvent) => void;
	} = $props();

	// Tagline, split into words so each raises in on a stagger. Each word can carry its own
	// emphasis: `em` italicises ("Different" takes the accent of the phrase), `strong` bolds
	// ("Together" lands it).
	const taglineWords: { text: string; em?: boolean; strong?: boolean }[] = [
		{ text: 'Different,', em: true },
		{ text: 'Together', strong: true }
	];

	// The top-level stations, surfaced as the horizontal nav (hub + tier-1). The deeper stops
	// stay reachable via each station's onward links. Codes → titles from $lib/network.
	const menuNodes = ['KSH', 'ABT', 'APP', 'STG'] as const;
</script>

<header class="masthead" class:covered>
	<div class="brandline">
		<h1><SplitFlap text="Kashinoga" /></h1>
		<!-- Decorative station-sign bullets beside the wordmark, like the route icons beside a
		     station name on a transit sign. Nonfunctional; they unfurl left→right on load. -->
		<div class="theme">
			<span class="brand-dot" aria-hidden="true" style="--n:0; --dot:#e6b93c"></span>
			<span class="brand-dot" aria-hidden="true" style="--n:1; --dot:#29b0a1"></span>
			<span class="brand-dot" aria-hidden="true" style="--n:2; --dot:#e05a4e"></span>
		</div>
	</div>
	<p class="tagline">{#each taglineWords as word, i}<span
			class="tw"
			class:em={word.em}
			class:strong={word.strong}
			style="--n:{i}">{word.text}</span
		>{' '}{/each}</p>
	<!-- Primary nav: the top-level stations as a horizontal menu bar below the wordmark. Each
	     link is the station's real URL; the active destination highlights while its panel is open.
	     On really small viewports the row turns into a COLUMN (see the media query below) —
	     four pills don't fit a ~375px line, and stacked they read as the site's outline. -->
	<nav class="menubar" aria-label="Destinations">
		<ul>
			{#each menuNodes as code, i}
				<li style="--n:{i}">
					<a
						class="menu-btn"
						class:active={code === activeCode}
						href={viewPath({ kind: 'port', code })}
						data-sveltekit-preload-data="off"
						onclick={(e) => onNavigate(code, e)}
					>{airports[code].title}</a>
				</li>
			{/each}
		</ul>
	</nav>
</header>

<style>
	.masthead {
		position: absolute;
		top: clamp(1.5rem, 5vw, 3.5rem);
		left: clamp(1.5rem, 5vw, 3.5rem);
		max-width: min(90vw, 640px);
		/* Shared so the tagline's offsets below scale with the wordmark. */
		--wordmark: clamp(2.25rem, 9vw, 5.5rem);
		transition: opacity 0.3s ease;
	}
	/* A panel is filling the viewport: get out of its way entirely. Its glass would only
	   blur this — and blurred letterforms read as a rendering fault, not as depth.
	   visibility waits for the fade (the delay lives HERE so uncovering flips it back
	   instantly) — once invisible the nav also leaves the tab order, instead of catching
	   focus behind a full-viewport panel. */
	.masthead.covered {
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition: opacity 0.3s ease, visibility 0s 0.3s;
	}
	/* Title and tagline animate on their own so open/close staggers like the entrance:
	   the tagline trails the title coming in, and leads going out. */
	.masthead h1,
	.masthead .tagline {
		transition: opacity 0.4s ease, transform 0.4s ease;
	}
	/* The circles unfurl left→right: the leftmost fades in place (its --roll is 0),
	   the rest roll out from behind it, each a beat later. Same effect on open/close
	   (this transition) and on page load (the keyframe below). Longhand so only
	   opacity/transform get the stagger delay — hover stays instant. */
	.masthead .brand-dot {
		transition-property: color, background, border-color, opacity, transform;
		transition-duration: 0.15s, 0.15s, 0.15s, 0.4s, 0.4s;
		transition-timing-function: ease, ease, ease, ease, var(--spring);
		transition-delay: 0s, 0s, 0s, calc(var(--n, 0) * 0.07s), calc(var(--n, 0) * 0.07s);
	}
	@media (prefers-reduced-motion: no-preference) {
		.brand-dot {
			animation: dot-roll 0.45s var(--spring) backwards;
			animation-delay: calc(0.5s + var(--n, 0) * 0.07s);
		}
	}
	@keyframes dot-roll {
		from {
			opacity: 0;
			transform: translateX(var(--roll));
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}
	.masthead .tagline {
		transition-delay: 0.12s;
	}
	.masthead h1 {
		margin: 0;
		font-weight: 700;
		font-size: var(--wordmark);
		line-height: 0.95;
		letter-spacing: -0.02em;
		color: var(--ink);
	}
	/* Wordmark + the display-mode bullets on one line, bullets riding to its right
	   like the route icons beside a station name on a transit sign. */
	.brandline {
		display: flex;
		/* Rest the bullets' bottoms on the wordmark's text baseline — a button with
		   only an icon synthesizes its baseline at its bottom edge, so they sit on
		   the line like the letters' bottom strokes. */
		align-items: baseline;
		gap: clamp(0.75rem, 2vw, 1.4rem);
		flex-wrap: wrap;
	}
	.theme {
		/* Non-flex, so the dots are ordinary inline-blocks that keep their true bottom-edge
		   baseline and rest on the wordmark's baseline. As flex items their baseline gets
		   synthesized from the glyph (Firefox) and floats them off the line. font-size:0
		   collapses the inter-dot whitespace; the gap is restored with margins below. */
		display: inline-block;
		font-size: 0;
	}
	.brand-dot {
		/* Start offset for the roll-out: each circle begins stacked on the leftmost
		   one (one circle-width + gap per index), then unfurls to the right. */
		--roll: calc(var(--n, 0) * -2.23rem);
		/* Decorative, nonfunctional colour bullet. Empty inline-block → bottom-edge
		   baseline, so it rests on the wordmark's baseline (see .theme). */
		display: inline-block;
		width: 30px;
		height: 30px;
		background: var(--dot);
		border-radius: 999px;
	}
	.brand-dot + .brand-dot {
		margin-left: 0.35rem;
	}
	.tagline {
		/* Sit just below the wordmark (top) and indent to the "K"'s optical left edge — the
		   SplitFlap centres each glyph in its cell, so the "K" is inset from the wordmark's
		   box edge by ~0.05em. Both scale with the wordmark. The small positive top keeps
		   the tagline clear of the wordmark's descenders. (Coefficients are optical.) */
		margin: calc(var(--wordmark) * 0.05) 0 0 calc(var(--wordmark) * 0.05);
		/* The motto speaks in a different voice: Fraunces italic, white against the sky.
		   No shadow — the letterforms stand on their own. */
		font-family: var(--font-motto);
		font-style: italic;
		font-size: clamp(1rem, 2.3vw, 1.25rem);
		color: #ffffff;
	}
	/* Emphasis word ("Different") — italic, carrying the accent of the phrase. */
	.tw.em {
		font-style: italic;
	}
	.tw.strong {
		font-weight: 700;
	}
	@media (prefers-reduced-motion: no-preference) {
		/* Each word raises in on a stagger, trailing the title's flip. `backwards` (not
		   `both`) so words aren't pinned afterward and the whole-tagline transition still
		   works. (`rise` is a global keyframe from puhig's tokens.) */
		.tw {
			display: inline-block;
			animation: rise 0.55s ease backwards;
			animation-delay: calc(0.3s + var(--n, 0) * 0.06s);
		}
	}

	/* Primary nav — the top-level stations as a horizontal menu bar under the tagline; the
	   site's main nav. Reads a touch larger than the tagline and shares its optical-left
	   indent so the whole header column aligns. */
	.menubar {
		margin: clamp(1.1rem, 2.6vw, 1.9rem) 0 0 calc(var(--wordmark) * 0.05);
	}
	.menubar ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 1.5rem;
	}
	.menubar li {
		display: flex;
		transition: opacity 0.4s ease, transform 0.45s cubic-bezier(0.34, 1.5, 0.64, 1);
		transition-delay: calc(var(--n, 0) * 0.05s);
	}
	.menu-btn {
		font-size: clamp(1.05rem, 2.4vw, 1.35rem);
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.1;
		color: var(--ink);
		background: transparent;
		border: 0;
		cursor: pointer;
		text-decoration: none;
		transition: opacity 0.15s ease;
	}
	.menu-btn:hover {
		opacity: 0.6;
	}
	/* Bubble: the nav joins the button family — the chips' material at nav scale (ink-mix
	   fill, 1px line-edge, pill corners; the gloss and spring ride in from the page's
	   shared bubble rules, which list .menu-btn). Flat keeps the typographic nav above:
	   plain names, hover by opacity. */
	:global(html[data-ui='bubble']) .menu-btn {
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border: 1px solid var(--line-edge);
		border-radius: 999px;
	}
	/* The pop is the hover now — dimming a lifting button muddied both gestures. */
	:global(html[data-ui='bubble']) .menu-btn:hover {
		opacity: 1;
	}
	/* Pills carry their own inner air; the wide text-nav gap read as a hole between them. */
	:global(html[data-ui='bubble']) .menubar ul {
		gap: 0.35rem 0.6rem;
	}
	/* Current section — the masthead persists while a panel is open, so the active
	   destination stays highlighted in the nav. Flat says it in accent text; Bubble says
	   it the way the Weather units do — with LIGHT (the lit .seg.on stack: brighter rim,
	   inner hairline, soft halo), the text staying ink. */
	.menu-btn.active {
		color: var(--orange);
	}
	:global(html[data-ui='bubble']) .menu-btn.active {
		color: var(--ink);
		border-color: color-mix(in srgb, var(--ink) 22%, transparent);
		box-shadow: var(--aero-lit);
	}
	.menu-btn:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 3px;
	}
	/* Page-load entrance: the same rise as the tagline, staggered. `backwards` so items
	   aren't pinned afterward. */
	@media (prefers-reduced-motion: no-preference) {
		.menubar li {
			animation: rise 0.5s ease backwards;
			animation-delay: calc(0.95s + var(--n, 0) * 0.07s);
		}
	}

	/* ── Really small viewports (an iPhone SE): the nav stacks ──────────────────────
	   Four pills don't fit a ~375px line and wrapped unevenly; as a COLUMN they read
	   cleanly, like the site's outline. Left-aligned so each pill hugs its name rather
	   than stretching to one width. */
	@media (max-width: 400px) {
		.menubar ul {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}
	}
</style>
