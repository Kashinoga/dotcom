<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import cloudFar from '$lib/assets/cloud-far.webp';
	import cloudNear from '$lib/assets/cloud-near.webp';

	// The stage's AMBIENT DECOR — the two layers that are pure weather-and-time atmosphere: the
	// drifting daylit clouds, and the star field with its shooting stars. Lifted out of
	// +page.svelte, which had grown to ~5,950 lines with the whole site inside it; this is the
	// first cut, and the seam is the one place the page's own comments already drew: these layers
	// take no decisions, they only draw what they are told.
	//
	// The page keeps every decision, because every one of them needs state this component has no
	// business holding — the sky mode, the colour scheme, the live weather reading, whether a
	// panel has covered the stage. So the props are the ANSWERS, not the inputs: show clouds or
	// not, thicken them or not, show stars or not, and how long the layers should take to fade.
	// Nothing here reads localStorage, the clock, or the weather.
	let {
		clouds = false,
		overcast = false,
		stars = false,
		fadeMs = 700
	}: {
		/* Draw the cloud strips (the page's cloudsVisible). */
		clouds?: boolean;
		/* Thicken them — an overcast or precipitating reading (fxOvercast). */
		overcast?: boolean;
		/* Draw the star field (starsVisible: dark scheme, opted in, nothing covering the stage). */
		stars?: boolean;
		/* How long a layer takes to arrive or leave. The page sets it, because the reason for a
		   hurry belongs to the page: a panel covering the stage cuts it to nothing on a phone. */
		fadeMs?: number;
	} = $props();

	// Fresh random field each page load (stars only render client-side, so there's
	// no SSR/hydration to keep deterministic). Regenerated on mount to be sure.
	const makeStars = () =>
		Array.from({ length: 72 }, () => ({
			x: Math.random() * 100,
			y: Math.random() * 96,
			size: 0.6 + Math.random() * 1.7,
			tw: Math.random() < 0.5,
			delay: Math.random() * 4,
			dur: 2.4 + Math.random() * 3.2
		}));
	let STARS = $state<ReturnType<typeof makeStars>>([]);
	// A few shooting stars — each streaks across once per long cycle, staggered so at most one or
	// two are visible at a time. Same client-only generation as the field above.
	const makeShooting = () =>
		Array.from({ length: 9 }, (_, i) => ({
			x: Math.random() * 88, // start left %
			y: Math.random() * 58, // start top %
			ang: 6 + Math.random() * 40, // travel angle 6–46° (shallow to steep)
			len: 45 + Math.random() * 120, // streak length 45–165px
			dist: 42 + Math.random() * 34, // travel distance 42–76vw
			peak: 0.55 + Math.random() * 0.45, // brightness at its peak, 0.55–1
			// Long cycle, so each is on-screen for only a short slice and idle the rest; the
			// index-based delay fans their starts out across ~35s so rarely more than one fires
			// at once (drift keeps them de-synced afterward).
			dur: 17 + Math.random() * 13, // 17–30s cycle
			delay: i * 3.4 + Math.random() * 2.6
		}));
	let SHOOT = $state<ReturnType<typeof makeShooting>>([]);

	// Built on mount, not at module scope: these are client-only fields, and building them where
	// the server can see them would put a different random sky in the HTML than the one the
	// browser then draws.
	onMount(() => {
		STARS = makeStars();
		SHOOT = makeShooting();
	});
</script>

{#if clouds}
	<!-- The fade is for SKY changes. When the hide is panel-driven the page passes a 0 duration
	     (see fadeMs) and it happens AFTER the panel's own animation has settled: the panel already
	     covers the stage, so there is nothing to see, and Safari never has to blur a dissolving
	     scene while animating the panel's width. -->
	<div class="clouds" class:overcast aria-hidden="true" transition:fade={{ duration: fadeMs }}>
		<div class="cloud-layer cloud-far" style="background-image: url({cloudFar})"></div>
		<div class="cloud-layer cloud-near" style="background-image: url({cloudNear})"></div>
	</div>
{/if}
{#if stars}
	<div class="stars" aria-hidden="true" transition:fade={{ duration: fadeMs }}>
		{#each STARS as s}
			<span
				class:tw={s.tw}
				style="left:{s.x}%; top:{s.y}%; width:{s.size}px; height:{s.size}px; animation-duration:{s.dur}s; animation-delay:{s.delay}s"
			></span>
		{/each}
		{#each SHOOT as sh}
			<span
				class="shoot"
				style="left:{sh.x}%; top:{sh.y}%; width:{sh.len}px; --ang:{sh.ang}deg; --dist:{sh.dist}vw; --peak:{sh.peak}; --dur:{sh.dur}s; --delay:{sh.delay}s"
			></span>
		{/each}
	</div>
{/if}

<style>
	/* ── Daylit clouds ── Two baked, tileable strips over the sky gradient. Each strip is
	   200% wide with the tile sized to exactly HALF of it (background-size: 50% 100%), so
	   the drift's translate3d(-50%) lands precisely one tile later and the loop is
	   seamless. transform is the ONLY thing that ever animates: the softness was painted
	   once, offline, into the bitmaps — the compositor just slides two cached layers, no
	   paint, no main thread (the budget the stars' spans live in). will-change pins the
	   layers up front, same flash-avoidance as the bubble depth rule. */
	.clouds {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		/* Density changes EASE rather than snap: the overcast thickening, the per-phase
		   values below, and the hand-off when a Weather reading lands mid-entrance all
		   move this one opacity — un-eased it jerked right as the panel was arriving. */
		transition: opacity 0.7s ease;
	}
	/* The tile keeps the ARTWORK's aspect (the strips are 1536×384 — exactly 4:1), sized
	   off the layer's height: auto 100%. It used to be 50% of the strip — a tile as wide
	   as the viewport — so resizing the window stretched the clouds. The strip runs one
	   tile past the box so the drift (exactly one tile, see cloud-drift) never shows an
	   edge, and the loop lands on the same pixels. */
	.cloud-layer {
		position: absolute;
		left: 0;
		height: var(--ch);
		width: calc(100% + var(--ch) * 4);
		background-repeat: repeat-x;
		background-size: auto 100%;
		will-change: transform;
	}
	.cloud-far {
		--ch: clamp(200px, 32vh, 360px);
		top: 1vh;
		opacity: 0.55;
	}
	.cloud-near {
		--ch: clamp(280px, 44vh, 520px);
		top: 9vh;
		opacity: 0.68;
	}
	/* Sun through-glow: at the low-sun phases the clouds catch light on their EDGES —
	   drop-shadow follows the artwork's alpha silhouette, so every puff gets a rim
	   without touching the art. Dawn wears one soft gold halo; dusk layers a tight
	   ember edge under a wider pink bloom. High-sun phases and night carry none (the
	   sun is overhead or gone), and skipping the filter there keeps those frames
	   cheapest. A pixel of downward offset leans the light toward the horizon the sun
	   sits on. (This is scene light, not chrome depth — Flat's no-shadow rule governs
	   the control language, and the sky isn't a control.) */
	:global(html[data-sky='dawn']) .cloud-layer {
		filter: drop-shadow(0 1px 14px rgba(255, 176, 118, 0.5));
	}
	:global(html[data-sky='dusk']) .cloud-layer {
		filter: drop-shadow(0 1px 10px rgba(255, 128, 82, 0.75))
			drop-shadow(0 2px 30px rgba(255, 92, 130, 0.45));
	}
	/* The drift — the near layer faster than the far one: parallax without a z-axis. Gated
	   like every other motion here; without it the clouds simply hang, which is also weather. */
	@media (prefers-reduced-motion: no-preference) {
		.cloud-far {
			animation: cloud-drift 380s linear infinite;
		}
		.cloud-near {
			animation: cloud-drift 300s linear infinite;
		}
	}
	/* One tile per cycle — the tile is 4× the layer height (the art's 4:1), so the loop
	   closes on identical pixels. Durations retuned to keep the old px/s drift. */
	@keyframes cloud-drift {
		to {
			transform: translate3d(calc(var(--ch) * -4), 0, 0);
		}
	}
	/* Phase sets the mood: dawn wears its clouds thin (the gradient is the show), noon a
	   touch lighter than morning's full value. */
	:global(html[data-sky='dawn']) .clouds {
		opacity: 0.6;
	}
	:global(html[data-sky='noon']) .clouds {
		opacity: 0.85;
	}
	/* An overcast reading thickens whatever sky is up — full-strength clouds, any phase.
	   (0,2,0 with the class beats the phase rules' 0,2,0 by order: this sits after.) */
	:global(html[data-sky]) .clouds.overcast,
	.clouds.overcast {
		opacity: 1;
	}
	/* NIGHT clouds — only ever summoned (see wxCloudy: the ambient dark sky belongs to
	   the stars), and dimmer for it: white sheets under no sun. These sit after the
	   overcast rule so the caps win the tie. */
	:global(html[data-sky='dusk']) .clouds {
		opacity: 0.5;
	}
	:global(html[data-sky='night']) .clouds {
		opacity: 0.38;
	}
	:global(html[data-sky='dusk']) .clouds.overcast {
		opacity: 0.6;
	}
	:global(html[data-sky='night']) .clouds.overcast {
		opacity: 0.45;
	}
	/* Stars — shown in DARK mode only. The light-dark() paints them transparent under a light
	   colour-scheme and bright under a dark one, so they appear on the solid black default, a
	   manual/OS dark theme and the dusk/night skies, and vanish in light — no JS dark check. */
	.stars {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.stars span:not(.shoot) {
		position: absolute;
		border-radius: 50%;
		background: light-dark(transparent, #eaf3ff);
		opacity: 0.72;
		box-shadow: 0 0 3px light-dark(transparent, rgba(224, 240, 255, 0.5));
	}
	@media (prefers-reduced-motion: no-preference) {
		.stars span.tw {
			animation-name: twinkle;
			animation-timing-function: ease-in-out;
			animation-iteration-count: infinite;
		}
	}
	@keyframes twinkle {
		0%,
		100% {
			opacity: 0.15;
		}
		50% {
			opacity: 0.85;
		}
	}
	/* Shooting star — a bright head trailing a fading tail (the gradient), streaking across once
	   per long cycle and idle the rest, so only one or two show at a time. `--ang` orients the
	   flight; translateX moves it along that axis (scaleX stretches the streak as it goes). Pure
	   motion, so it stays put (opacity 0) under reduced-motion. Dark-only like the field above. */
	.shoot {
		position: absolute;
		height: 1.5px;
		border-radius: 999px;
		background: linear-gradient(
			to right,
			transparent,
			light-dark(transparent, rgba(234, 243, 255, 0.95))
		);
		opacity: 0;
	}
	@media (prefers-reduced-motion: no-preference) {
		.shoot {
			animation: shoot var(--dur, 11s) ease-out var(--delay, 0s) infinite;
		}
	}
	@keyframes shoot {
		0% {
			opacity: 0;
			transform: rotate(var(--ang, 20deg)) translateX(0) scaleX(0.4);
		}
		/* Opacity-only stops — they set NO transform, so the streak keeps interpolating its single
		   0 → --dist glide with no mid-flight stutter, while it fades in to its peak, holds, then
		   fades out (the fade finishes as it reaches the far edge, so it's never seen stopping). */
		1% {
			opacity: var(--peak, 1);
		}
		5% {
			opacity: var(--peak, 1);
		}
		8% {
			opacity: 0;
			transform: rotate(var(--ang, 20deg)) translateX(var(--dist, 64vw)) scaleX(1);
		}
		100% {
			opacity: 0;
			transform: rotate(var(--ang, 20deg)) translateX(var(--dist, 64vw)) scaleX(1);
		}
	}
	/* Two rules the PAGE used to carry, because the elements they hide used to be the page's.
	   Both keep the descendant inside :global(): .stage belongs to +page.svelte, so left bare it
	   would be given THIS component's scope class and match nothing. The selectors are otherwise
	   unchanged — same elements, same specificity. */
	/* Pixelite: the stage only mounts as the full apps' floor, and its world is paper — never
	   the sky. Without this the Aeropalite skybox shows on load and around the full apps until
	   their own chrome covers it. (The photo layers' half of this rule stays with the photo
	   sky, in the page.) */
	:global(html[data-look='pixelite'] .stage) .stars {
		display: none;
	}
	/* Photo mode, before hydration: the server can't know what the visitor chose, so any decor in
	   its HTML would paint for a frame or two underneath the picture. The pre-paint script in
	   app.html stamps data-sky-photo, so it never gets a frame at all. */
	:global(html[data-sky-photo]) .stars {
		display: none;
	}
</style>
