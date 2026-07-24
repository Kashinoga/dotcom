<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tilt } from './tilt';

	let { children, tilt: tiltable = true }: { children?: Snippet; tilt?: boolean } = $props();
</script>

<div class="sleeve" use:tilt={{ enabled: tiltable }}>
	{@render children?.()}
</div>

<style>
	/* Clear see-through plastic sleeve. NO backdrop-filter — the look is a
	 * near-transparent tint + edge highlight + diagonal glare, so the grid
	 * shows straight through the lip and over the card. */
	.sleeve {
		/* The card sits flat inside; the sleeve carries the resting lift, so
		 * quiet the card's own ambient shadow (it would smear into the clear
		 * lip). Custom props inherit through the component boundary. */
		--card-shadow: 0 1px 1px rgba(0, 0, 0, 0.07);

		position: relative;
		width: fit-content;
		padding: var(--sleeve-lip, 6px);
		border-radius: var(--sleeve-radius, 16px);
		background-color: var(--sleeve-bg, rgba(255, 255, 255, 0.05));
		/* Premium plastic edge: a bright sealed rim with a hairline seam (two
		 * sheets), a beveled top-light / bottom-shade, an inner pocket shadow so
		 * the card reads as tucked inside, then a soft drop onto the table. */
		box-shadow:
			inset 0 0 0 1px var(--sleeve-rim-hi, rgba(255, 255, 255, 0.5)),
			inset 0 0 0 2px rgba(0, 0, 0, 0.035),
			inset 0 1px 0 var(--sleeve-rim-hi, rgba(255, 255, 255, 0.55)),
			inset 0 -1px 1px rgba(0, 0, 0, 0.06),
			inset 0 0 9px rgba(0, 0, 0, 0.035),
			var(--sleeve-drop, 0 1px 2px rgba(0, 0, 0, 0.04), 0 14px 36px rgba(0, 0, 0, 0.07));
	}

	/* Fresnel rim — clear plastic reflects more at grazing angles, so the outer
	 * edge is brighter than the flat centre. Static (a property of the plastic). */
	.sleeve::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 2;
		border-radius: inherit;
		pointer-events: none;
		background: radial-gradient(
			115% 115% at 50% 50%,
			transparent 72%,
			rgba(255, 255, 255, 0.05) 92%,
			rgba(255, 255, 255, 0.1) 100%
		);
	}
</style>
