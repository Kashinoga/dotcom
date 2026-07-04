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
		display: flex;
		flex-direction: column;
		width: var(--card-w, 240px);
		aspect-ratio: var(--card-ratio, 5 / 7);
		background-color: var(--surface, #ffffff);
		border-radius: var(--card-radius, 10px);
		box-shadow: var(--card-shadow, 0 8px 24px rgba(0, 0, 0, 0.08));
		overflow: hidden;
	}

	.card-name {
		/* Sized off the card width so type + padding scale with the card. */
		padding: calc(var(--card-w, 240px) * 0.047) calc(var(--card-w, 240px) * 0.06);
		font-size: calc(var(--card-w, 240px) * 0.07);
		font-weight: 500;
		letter-spacing: 0.01em;
	}

	.card-art {
		flex: 1;
		min-height: 0;
	}
</style>
