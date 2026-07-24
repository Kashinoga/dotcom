<script lang="ts">
	import { fade } from 'svelte/transition';
	import cloudFar from '$lib/assets/cloud-far.webp';

	// THE WEATHER DRESSING — the stage wearing the active city's sky while the Weather panel is
	// open: rain, snow, a fog bank, and the lightning behind a storm. Third cut out of
	// +page.svelte, and the same bargain as $lib/Sky and $lib/SkyConsole: the page decides, this
	// file draws. Which of these belongs on screen depends on the live reading, the hand-picked
	// stage weather and whether a panel has covered the stage — none of which this component can
	// see, and none of which it needs to.
	//
	// Same physics as the clouds and the stars' twinkle: every animation is transform or opacity
	// on small fixed elements, so nothing paints after the first composite.
	let {
		rain = false,
		snow = false,
		fog = false,
		flash = false,
		fadeMs = 500,
		fogFadeMs = 900
	}: {
		rain?: boolean;
		snow?: boolean;
		fog?: boolean;
		/* The lightning layer. No transition: it is a long dark cycle with a two-frame strike in
		   it, so there is nothing to fade in — see .fx-flash. */
		flash?: boolean;
		/* How long precipitation takes to arrive or leave. */
		fadeMs?: number;
		/* The fog is slower on purpose, and has been since it was written: a shower starts, but a
		   bank ROLLS IN. Both collapse together when the page says the stage is covered, which is
		   why they arrive as two answers rather than one duration and a multiplier. */
		fogFadeMs?: number;
	} = $props();

	// The particle fields, built LAZILY on first need (client-only, like the stars) and
	// kept after — closing the panel just unmounts the spans; reopening reuses the field.
	const makeRain = () =>
		Array.from({ length: 44 }, () => ({
			x: Math.random() * 100,
			len: 9 + Math.random() * 8,
			dur: 0.9 + Math.random() * 0.7,
			delay: -Math.random() * 2 // negative: the sky is already mid-rain on arrival
		}));
	let RAIN = $state<ReturnType<typeof makeRain>>([]);
	const makeSnow = () =>
		Array.from({ length: 36 }, () => ({
			x: Math.random() * 100,
			size: 3 + Math.random() * 3,
			dur: 7 + Math.random() * 6,
			drift: -14 + Math.random() * 28, // sideways vw across one fall — the flutter
			delay: -Math.random() * 13
		}));
	let SNOW = $state<ReturnType<typeof makeSnow>>([]);
	$effect(() => {
		if (rain && !RAIN.length) RAIN = makeRain();
	});
	$effect(() => {
		if (snow && !SNOW.length) SNOW = makeSnow();
	});
</script>

{#if rain}
	<div class="fx-rain" aria-hidden="true" transition:fade={{ duration: fadeMs }}>
		{#each RAIN as d}
			<span
				style="left:{d.x}%; height:{d.len}px; animation-duration:{d.dur}s; animation-delay:{d.delay}s"
			></span>
		{/each}
	</div>
{/if}
{#if snow}
	<div class="fx-snow" aria-hidden="true" transition:fade={{ duration: fadeMs }}>
		{#each SNOW as f}
			<span
				style="left:{f.x}%; width:{f.size}px; height:{f.size}px; --drift:{f.drift}vw; animation-duration:{f.dur}s; animation-delay:{f.delay}s"
			></span>
		{/each}
	</div>
{/if}
{#if fog}
	<!-- The fog reuses the far cloud strip, stretched tall and slowed — the same baked
	     softness at bank scale, one layer rolling against the other. The veil beneath
	     flattens the contrast the way real fog does. -->
	<div class="fx-fog" aria-hidden="true" transition:fade={{ duration: fogFadeMs }}>
		<div class="fog-veil"></div>
		<div class="fog-band fog-a" style="background-image: url({cloudFar})"></div>
		<div class="fog-band fog-b" style="background-image: url({cloudFar})"></div>
		<div class="fog-band fog-c" style="background-image: url({cloudFar})"></div>
		<div class="fog-band fog-d" style="background-image: url({cloudFar})"></div>
	</div>
{/if}
{#if flash}
	<div class="fx-flash" aria-hidden="true"></div>
{/if}

<style>
	/* ── Weather dressing ── the ACTIVE CITY's sky, worn by the stage while its panel is
	   open. Same physics as the clouds and the stars' twinkle: every animation is
	   transform or opacity on small fixed elements — no paint after first composite. */
	.fx-rain,
	.fx-snow,
	.fx-fog,
	.fx-flash {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.fx-rain span {
		position: absolute;
		top: -24px;
		width: 1.5px;
		border-radius: 1px;
		/* Blue-gray on the daylit sky, pale on the dark phases — same light-dark() trick
		   as the stars, so no JS scheme check. */
		background: light-dark(rgba(60, 82, 110, 0.38), rgba(200, 220, 245, 0.42));
		animation: fx-fall linear infinite;
		will-change: transform;
	}
	@keyframes fx-fall {
		to {
			transform: translate3d(0, 108vh, 0);
		}
	}
	.fx-snow span {
		position: absolute;
		top: -10px;
		border-radius: 50%;
		background: light-dark(rgba(178, 196, 220, 0.9), rgba(235, 242, 255, 0.85));
		animation: fx-snow-fall linear infinite;
		will-change: transform;
	}
	@keyframes fx-snow-fall {
		to {
			transform: translate3d(var(--drift), 108vh, 0);
		}
	}
	/* Fog: the far cloud strip at bank scale — same drift keyframes as the clouds, three
	   bands rolling against each other; the veil flattens contrast the way real fog does.
	   The bands are three DISTINCT DEPTH PLANES, not one texture thrice: each has its own
	   height (background-size ties the tile's wavelength to it, so each rolls at its own
	   scale), its own blur (soft far, defined near — one uniform blur read as a flat
	   low-res smear), its own weight, and its own speed (nearest fastest: parallax).
	   Static filters, rasterised once; only transform animates. */
	.fog-veil {
		position: absolute;
		inset: 0;
		/* Graded, not flat: fog pools — denser at the ground, thinner up high. */
		background: linear-gradient(
			to top,
			light-dark(rgba(233, 238, 245, 0.78), rgba(24, 30, 42, 0.72)),
			light-dark(rgba(233, 238, 245, 0.42), rgba(24, 30, 42, 0.38))
		);
	}
	.fog-band {
		position: absolute;
		left: 0;
		height: var(--ch);
		width: calc(100% + var(--ch) * 4);
		background-repeat: repeat-x;
		background-size: auto 100%;
		will-change: transform;
	}
	/* Four planes, INTERLEAVED: the baked strip carries transparent margins inside its
	   tile, so bands laid end to end left clear horizontal stripes between their cloud
	   belts. These overlap by half their height — each band's belt sits over its
	   neighbours' margins — and the last is BOTTOM-ANCHORED, so the sky console's row is
	   always inside the fog whatever the viewport's height. */
	/* Farthest: a soft, faint ceiling across the whole sky. */
	.fog-a {
		--ch: 90vh;
		top: -20vh;
		opacity: 0.55;
		filter: blur(22px);
	}
	.fog-b {
		--ch: 75vh;
		top: 5vh;
		opacity: 0.7;
		filter: blur(14px);
	}
	.fog-c {
		--ch: 60vh;
		top: 35vh;
		opacity: 0.85;
		filter: blur(8px);
	}
	/* Nearest: low, dense, defined enough to keep real texture in the picture. */
	.fog-d {
		--ch: 55vh;
		top: auto;
		bottom: -15vh;
		opacity: 0.95;
		filter: blur(5px);
	}
	/* Lightning: one full-stage white layer, dark the vast majority of a long cycle with a
	   double blink near the middle — opacity only, and rare. */
	.fx-flash {
		background: #fff;
		opacity: 0;
	}
	@media (prefers-reduced-motion: no-preference) {
		/* Depth-ordered speeds: the near bank rolls past while the ceiling barely moves. */
		.fog-a {
			animation: cloud-drift 380s linear infinite;
		}
		.fog-b {
			animation: cloud-drift 260s linear infinite reverse;
		}
		.fog-c {
			animation: cloud-drift 180s linear infinite;
		}
		.fog-d {
			animation: cloud-drift 120s linear infinite reverse;
		}
		.fx-flash {
			animation: fx-flash 9s linear infinite;
		}
	}
	@keyframes fx-flash {
		0%,
		55.9%,
		57.3%,
		58.6%,
		100% {
			opacity: 0;
		}
		56.3% {
			opacity: 0.5;
		}
		56.8% {
			opacity: 0.08;
		}
		57.9% {
			opacity: 0.35;
		}
	}
	/* Reduced motion: precipitation frozen mid-air reads as broken glass, so it's simply
	   not shown; the fog just sits, which is also weather. */
	@media (prefers-reduced-motion: reduce) {
		.fx-rain span,
		.fx-snow span {
			display: none;
		}
	}
</style>
