<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tilt } from './tilt';

	let { children, tilt: tiltable = true }: { children?: Snippet; tilt?: boolean } = $props();
</script>

<div class="sleeve" use:tilt={{ enabled: tiltable }}>
	{@render children?.()}
	<div class="sheen-clip" aria-hidden="true">
		<div class="sheen"></div>
	</div>
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
			inset 0 0 0 1px rgba(255, 255, 255, 0.5),
			inset 0 0 0 2px rgba(0, 0, 0, 0.035),
			inset 0 1px 0 rgba(255, 255, 255, 0.55),
			inset 0 -1px 1px rgba(0, 0, 0, 0.06),
			inset 0 0 9px rgba(0, 0, 0, 0.035),
			0 1px 2px rgba(0, 0, 0, 0.04),
			0 14px 36px rgba(0, 0, 0, 0.07);
	}

	/* Fresnel rim — clear plastic reflects more at grazing angles, so the outer
	 * edge is brighter than the flat centre. Static (a property of the plastic),
	 * sits below the moving specular. */
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

	/* Clips the oversized sheen to the sleeve's rounded rect. Kept separate from
	 * the sleeve so overflow:hidden here never clips the sleeve's drop shadow. */
	.sheen-clip {
		position: absolute;
		inset: 0;
		z-index: 3;
		border-radius: inherit;
		overflow: hidden;
		pointer-events: none;
	}

	/* The glare — a soft radial hot-spot that tracks the cursor (light-follows-
	 * cursor / holographic model): position AND shape read as one light sitting
	 * at the pointer. --tilt-x/y (cursor offset, published by the tilt action)
	 * translate it toward the pointer via transform — the compositor, not a
	 * moving gradient position — so it stays a pure composite and many cards can
	 * glint at once (the entrance deal) without repainting. The spot fades to
	 * transparent, so translating it needs no oversize/edge margin. */
	.sheen {
		position: absolute;
		inset: 0;
		background-image: radial-gradient(
			circle calc(var(--card-w, 240px) * 0.45) at 50% 50%,
			rgba(255, 255, 255, 0.3),
			rgba(255, 255, 255, 0.07) 40%,
			rgba(255, 255, 255, 0) 68%
		);
		transform: translate(calc(var(--tilt-x, 0) * 45%), calc(var(--tilt-y, 0) * 45%));
	}

	/* Give the sheen its own layer only while tilting (class toggled by the tilt
	 * action), then release it — no standing GPU layer per card at rest. */
	.sleeve:global(.puhig-tilting) .sheen {
		will-change: transform;
	}
</style>
