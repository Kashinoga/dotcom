<script lang="ts">
	import type { Snippet } from 'svelte';

	export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';

	let {
		name = '',
		rarity = 'common',
		children
	}: { name?: string; rarity?: Rarity; children?: Snippet } = $props();

	// Foil is reserved for the top rarities.
	const holo = $derived(rarity === 'rare' || rarity === 'mythic');
</script>

<article class="card" data-rarity={rarity}>
	{#if name}
		<header class="card-name">{name}</header>
	{/if}
	<div class="card-art">
		{#if children}{@render children()}{/if}
	</div>
	{#if holo}
		<div class="foil foil--spectrum" aria-hidden="true"></div>
		<div class="foil foil--shine" aria-hidden="true"></div>
		<div class="foil foil--sparkle" aria-hidden="true"></div>
	{/if}
</article>

<style>
	/* Barebones static card: surface fill, one moderate shadow, no
	 * backdrop-filter and no 3D-flip machinery (added later when movement
	 * lands). Scoped styles — no global cascade to fight. */
	.card {
		position: relative; /* for the grain overlay */
		display: flex;
		flex-direction: column;
		width: var(--card-w, 240px);
		aspect-ratio: var(--card-ratio, 5 / 7);
		background-color: var(--surface, #faf7f0);
		border-radius: var(--card-radius, 10px);
		/* drop shadow (quieted by the sleeve) + the black-core edge: the thin
		 * dark rim of MTG blue/black-core cardstock. */
		box-shadow:
			var(--card-shadow, 0 8px 24px rgba(0, 0, 0, 0.08)),
			inset 0 0 0 1px var(--card-edge, rgba(0, 0, 0, 0.32));
		overflow: hidden;
	}

	/* Paper tooth — faint grayscale noise multiplied onto the stock so the face
	 * reads as matte cardstock, not a flat screen fill. The card stays matte;
	 * the gloss lives on the plastic sleeve above it. */
	.card::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		background-image: var(--card-grain);
		background-size: 140px 140px;
		opacity: 0.4;
		mix-blend-mode: multiply;
	}

	.card-name {
		/* Sized off the card width so type + padding scale with the card. */
		position: relative;
		z-index: 1; /* above the grain */
		padding: calc(var(--card-w, 240px) * 0.047) calc(var(--card-w, 240px) * 0.06);
		font-size: calc(var(--card-w, 240px) * 0.07);
		font-weight: 500;
		letter-spacing: 0.01em;
	}

	.card-art {
		position: relative;
		z-index: 1; /* above the grain */
		flex: 1;
		min-height: 0;
	}

	/* Holographic foil (layer 2) — a rarity-gated iridescent spectrum over the
	 * matte stock. Oversized and slid with the tilt (--tilt-x/y) so the spectrum
	 * shifts across the card like real foil catching light. Composited via
	 * transform; the card's overflow:hidden clips it to the card shape. */
	.card[data-rarity='rare'] {
		--foil-strength: 0.35;
	}
	.card[data-rarity='mythic'] {
		--foil-strength: 0.6;
	}

	/* Three parallax layers, each a direct child of the card so its blend mode
	 * composites against the stock (a z-index'd wrapper would isolate them).
	 * Different translate rates give the foil depth as it tilts. */
	.foil {
		position: absolute;
		inset: -50%;
		z-index: 2; /* over the card face + content, under the plastic sleeve */
		pointer-events: none;
		opacity: var(--foil-strength, 0.4);
	}

	/* Iridescent spectrum — the base hue wash. Slowest sweep. */
	.foil--spectrum {
		background: linear-gradient(
			110deg,
			hsl(350, 90%, 72%),
			hsl(45, 95%, 73%),
			hsl(150, 85%, 70%),
			hsl(200, 90%, 72%),
			hsl(265, 85%, 73%),
			hsl(330, 90%, 72%)
		);
		mix-blend-mode: overlay;
		transform: translate(calc(var(--tilt-x, 0) * 20%), calc(var(--tilt-y, 0) * 20%));
	}

	/* Shine band — a tight bright diagonal glint. Fastest sweep, so it streaks
	 * across as you tilt. color-dodge blows it toward white for the metallic pop. */
	.foil--shine {
		background: linear-gradient(
			102deg,
			transparent 40%,
			rgba(255, 255, 255, 0.55) 48%,
			rgba(255, 255, 255, 0.9) 50%,
			rgba(255, 255, 255, 0.55) 52%,
			transparent 60%
		);
		mix-blend-mode: color-dodge;
		/* Max 24% × the 200%-of-card layer = 48% of card ≤ the 50% overhang, so
		 * the layer edge never slides into view and chops the band mid-card. */
		transform: translate(calc(var(--tilt-x, 0) * 24%), calc(var(--tilt-y, 0) * 24%));
	}

	/* Sparkle — sparse glitter specks. Slowest sweep of all (deepest layer). */
	.foil--sparkle {
		background-image: var(--foil-sparkle);
		background-size: 120px 120px;
		mix-blend-mode: color-dodge;
		transform: translate(calc(var(--tilt-x, 0) * 12%), calc(var(--tilt-y, 0) * 12%));
	}

	/* Promote the foil layers only while an ancestor (the sleeve) is tilting. */
	:global(.puhig-tilting) .foil {
		will-change: transform;
	}
</style>
