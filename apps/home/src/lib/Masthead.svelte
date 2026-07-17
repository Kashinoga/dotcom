<script lang="ts">
	import type { Snippet } from 'svelte';
	import { backOut } from 'svelte/easing';
	import SplitFlap from '$lib/SplitFlap.svelte';
	import { airports } from '$lib/network';
	import { viewPath } from '$lib/views';
	import { HOME_SVG, USER_SVG, GRID_SVG, GEAR_SVG } from '$lib/icons';

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
	// `popCodes`/`popCode`/`navPop` — desktop's nav flyouts: some destinations (Home's
	// greeting, About's bio) are a reading, not a workspace, so instead of a whole panel
	// they open as a card under their own nav button (the sky console's popout, at nav
	// scale). The page owns which codes fly out (`popCodes`), which one is open
	// (`popCode`), and authors the card's content as a snippet taking the code (so the
	// copy and its styles stay with the page); this component owns the anchor — the card
	// hangs off the clicked button's <li>.
	let {
		activeCode = null,
		covered = false,
		popCodes = [],
		popCode = null,
		navPop,
		onNavigate
	}: {
		activeCode?: string | null;
		covered?: boolean;
		popCodes?: string[];
		popCode?: string | null;
		navPop?: Snippet<[string]>;
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
	// stay reachable via each station's onward links. Codes → titles from $lib/network; each
	// carries its station mark (the Related-rail glyphs) — on a phone the mark IS the button
	// and the name goes visually-hidden (see the media block).
	const menuNodes = [
		{ code: 'KSH', icon: HOME_SVG },
		{ code: 'ABT', icon: USER_SVG },
		{ code: 'APP', icon: GRID_SVG },
		{ code: 'STG', icon: GEAR_SVG }
	];

	// The flyout's spring: it POPS out of its button — starting 10px UP, tucked toward
	// the button that called it, then DESCENDING into place while swelling from 94%
	// anchored top-left (the button's corner), on backOut so both overshoot their rest
	// and settle — the same bounce the button family springs with. The motion must point
	// away from the button, downward: an upward arrival read as rising from the bottom
	// left, from nothing. Played backwards on the way out (Svelte reverses the css ramp)
	// the card gathers itself, then tucks back up into its button. Opacity rides ahead
	// of the motion (clamped ×1.8) so the overshoot happens fully drawn, not mid-fade.
	function popSpring(node: HTMLElement, p: { duration?: number } = {}) {
		return {
			duration: p.duration ?? 340,
			easing: backOut,
			css: (t: number) =>
				`transform-origin: left top; transform: translateY(${(1 - t) * -10}px) scale(${0.94 + t * 0.06}); opacity: ${Math.min(1, t * 1.8)};`
		};
	}
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
	     On a phone the words hand over to their station marks (see the media query below) —
	     four worded pills never fit a ~375px line, but four glyphs do, one row. -->
	<nav class="menubar" aria-label="Destinations">
		<ul>
			{#each menuNodes as { code, icon }, i}
				<li style="--n:{i}" class:has-pop={popCodes.includes(code)}>
					<a
						class="menu-btn"
						class:active={code === activeCode}
						href={viewPath({ kind: 'port', code })}
						data-sveltekit-preload-data="off"
						aria-expanded={popCodes.includes(code) && navPop ? popCode === code : undefined}
						onclick={(e) => onNavigate(code, e)}
					><span class="menu-ico" aria-hidden="true">{@html icon}</span><span class="menu-word">{airports[code].title}</span></a>
					{#if code === popCode && navPop}
						<!-- The card springs out of its button (see popSpring); clicks inside stay
						     inside (the stage's anywhere-off dismiss must not see them). -->
						<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
						<div
							class="nav-pop"
							transition:popSpring
							onclick={(e) => e.stopPropagation()}
						>
							{@render navPop(code)}
						</div>
					{/if}
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
		   the line like the letters' bottom strokes. Gap: the mastheads' shared
		   0.75rem beat (the panel .title-rows keep the same). */
		align-items: baseline;
		gap: 0.75rem;
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
	/* Bubble: the dots join the aero family as TRANSLUCENT glass, not opaque enamel —
	   the colour poured into the disc (the toast's food-colouring move) with the family
	   frost behind it, so the sky reads through each bullet. Rim light and drop as every
	   disc wears. Flat keeps the solid paint above: flat is colour, not glass. */
	:global(html[data-ui='bubble']) .brand-dot {
		background: color-mix(in srgb, var(--dot) 60%, transparent);
		-webkit-backdrop-filter: blur(6px) saturate(1.3);
		backdrop-filter: blur(6px) saturate(1.3);
		box-shadow: var(--aero-gloss), var(--aero-drop);
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
	/* The landing word ("Together") answers in the SITE'S voice — Jost, upright, bold —
	   against the motto's Fraunces italic: the two words differ, together. */
	.tw.strong {
		font-family: var(--font-body);
		font-style: normal;
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
		transition: opacity 0.25s ease;
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
	/* A flyout hangs off its own button. */
	.menubar li.has-pop {
		position: relative;
	}
	/* The card: the sky console popout's material and motion, at nav scale — a "larger
	   bubble" under the clicked button instead of a whole panel. It hangs at the NAV's
	   own spacing (1.5rem for Flat's text nav; Bubble tightens below, like the pills do),
	   so button and card read on the masthead's grid. */
	.nav-pop {
		position: absolute;
		top: calc(100% + 1.5rem);
		left: 0;
		z-index: 4;
		width: max-content;
		max-width: min(26rem, 80vw);
		padding: 1.1rem 1.3rem;
		background: var(--panel-glass);
		border: 1px solid var(--line);
		border-radius: 12px;
	}
	:global(html[data-ui='bubble']) .nav-pop {
		top: calc(100% + 0.6rem);
		/* The panels' own material — sheen, frost, rim light and drop (the sky-pop's
		   exact dress), so the card reads as a shard of the same surface. */
		background: var(--panel-sheen), var(--panel-fill);
		-webkit-backdrop-filter: var(--panel-blur);
		backdrop-filter: var(--panel-blur);
		border-color: var(--panel-edge);
		box-shadow:
			inset 0 1px 0 light-dark(rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.24)),
			0 8px 24px rgba(8, 10, 14, 0.22);
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
	   plain names, hover by opacity. A FIXED 42px height (the phone discs' size), not
	   padding-derived: the clamped font made the pills shorter exactly where fingers do
	   the pressing; width stays the name's own. */
	:global(html[data-ui='bubble']) .menu-btn {
		display: inline-flex;
		align-items: center;
		box-sizing: border-box;
		height: 42px;
		padding: 0 1rem;
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
	   it the way every selected control does — the Settings GRAY FILL (the denser
	   var(--line) face; the lit ring it used to wear read as barely-on), text staying ink. */
	.menu-btn.active {
		color: var(--orange);
	}
	:global(html[data-ui='bubble']) .menu-btn.active {
		color: var(--ink);
		background: var(--line);
		border-color: color-mix(in srgb, var(--ink) 22%, transparent);
	}
	.menu-btn:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 3px;
	}
	/* The station mark inside each nav button — desktop is typographic, so the mark only
	   appears on the phone (below); the word carries the button everywhere else. */
	.menu-ico {
		display: none;
	}
	.menu-ico :global(svg) {
		width: 20px;
		height: 20px;
		display: block;
	}
	/* Page-load entrance: the same rise as the tagline, staggered. `backwards` so items
	   aren't pinned afterward. */
	@media (prefers-reduced-motion: no-preference) {
		.menubar li {
			animation: rise 0.5s ease backwards;
			animation-delay: calc(0.95s + var(--n, 0) * 0.07s);
		}
	}

	/* ── Phone: the nav speaks in station marks ─────────────────────────────────────
	   Four worded pills never fit a ~375px line (they used to stack into a column);
	   four glyphs do, one row. Each button becomes its mark — home, user, grid, gear —
	   at the 42px family size, the name going screen-reader-only rather than leaving
	   the DOM. Bubble's pill turns disc; Flat keeps its bare-ink language, the glyph
	   standing where the word stood, with the same invisible 42px touch box. */
	@media (max-width: 560px) {
		.menu-ico {
			display: block;
		}
		.menu-word {
			/* Visually gone, still the link's accessible name. */
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.menu-btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			box-sizing: border-box;
			width: 42px;
			height: 42px;
		}
		:global(html[data-ui='bubble']) .menu-btn {
			padding: 0;
		}
		.menubar ul {
			gap: 0.5rem 0.9rem;
		}
		:global(html[data-ui='bubble']) .menubar ul {
			gap: 0.5rem 0.6rem;
		}
	}
</style>
