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
	let {
		activeCode = null,
		onNavigate
	}: {
		activeCode?: string | null;
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

<header class="masthead">
	<div class="brandline">
		<h1><SplitFlap text="Kashinoga" /></h1>
		<!-- Decorative station-sign bullets beside the wordmark, like the route icons beside a
		     station name on a transit sign. Nonfunctional; they unfurl left→right on load. -->
		<div class="theme">
			<span class="theme-dot" aria-hidden="true" style="--n:0; --dot:#e6b93c"></span>
			<span class="theme-dot" aria-hidden="true" style="--n:1; --dot:#29b0a1"></span>
			<span class="theme-dot" aria-hidden="true" style="--n:2; --dot:#e05a4e"></span>
		</div>
	</div>
	<p class="tagline">{#each taglineWords as word, i}<span
			class="tw"
			class:em={word.em}
			class:strong={word.strong}
			style="--n:{i}">{word.text}</span
		>{' '}{/each}</p>
	<!-- Primary nav: the top-level stations as a horizontal menu bar below the wordmark. Each
	     link is the station's real URL; the active destination highlights while its panel is open. -->
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
	.masthead .theme-dot {
		transition-property: color, background, border-color, opacity, transform;
		transition-duration: 0.15s, 0.15s, 0.15s, 0.4s, 0.4s;
		transition-timing-function: ease, ease, ease, ease, var(--spring);
		transition-delay: 0s, 0s, 0s, calc(var(--n, 0) * 0.07s), calc(var(--n, 0) * 0.07s);
	}
	@media (prefers-reduced-motion: no-preference) {
		.theme-dot {
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
	.theme-dot {
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
	.theme-dot + .theme-dot {
		margin-left: 0.35rem;
	}
	.tagline {
		/* Sit just below the wordmark (top) and indent to the "K"'s optical left edge — the
		   SplitFlap centres each glyph in its cell, so the "K" is inset from the wordmark's
		   box edge by ~0.05em. Both scale with the wordmark. The small positive top keeps
		   the tagline clear of the wordmark's descenders. (Coefficients are optical.) */
		margin: calc(var(--wordmark) * 0.05) 0 0 calc(var(--wordmark) * 0.05);
		font-size: clamp(0.95rem, 2.2vw, 1.15rem);
		color: var(--sub);
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
	/* Current section — the masthead persists while a panel is open, so the active
	   destination stays highlighted in the nav. */
	.menu-btn.active {
		color: var(--orange);
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
</style>
