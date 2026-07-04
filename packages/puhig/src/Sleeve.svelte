<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tilt } from './tilt';

	let { children, tilt: tiltable = true }: { children?: Snippet; tilt?: boolean } = $props();
</script>

<div class="sleeve" use:tilt={{ enabled: tiltable }}>
	{@render children?.()}
	<div class="sheen" aria-hidden="true"></div>
</div>

<style>
	/* Clear see-through plastic sleeve. NO backdrop-filter — the look is a
	 * near-transparent tint + edge highlight + diagonal glare, so the grid
	 * shows straight through the lip and over the card. */
	.sleeve {
		/* The card sits flat inside; the sleeve carries the resting lift, so
		 * quiet the card's own ambient shadow (it would smear into the clear
		 * lip). Custom props inherit through the component boundary. */
		--card-shadow: 0 1px 1px rgba(0, 0, 0, 0.12);

		position: relative;
		width: fit-content;
		padding: var(--sleeve-lip, 6px);
		border-radius: var(--sleeve-radius, 16px);
		background-color: var(--sleeve-bg, rgba(255, 255, 255, 0.05));
		/* Plastic edge: hairline rim, a bright top lip (light catching the
		 * plastic), a faint bottom shade, then a soft drop onto the table. */
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.1),
			inset 0 1px 0 rgba(255, 255, 255, 0.4),
			inset 0 -1px 0 rgba(0, 0, 0, 0.06),
			0 1px 2px rgba(0, 0, 0, 0.05),
			0 12px 30px rgba(0, 0, 0, 0.12);
	}

	.sheen {
		position: absolute;
		inset: 0;
		z-index: 3;
		border-radius: inherit;
		pointer-events: none;
		background-image: var(--sleeve-streak);
	}
</style>
