<script lang="ts">
	import type { Snippet } from 'svelte';

	let { name = '', children }: { name?: string; children?: Snippet } = $props();
</script>

<article class="card">
	{#if name}
		<header class="card-name">{name}</header>
	{/if}
	<div class="card-art">
		{#if children}{@render children()}{/if}
	</div>
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
</style>
