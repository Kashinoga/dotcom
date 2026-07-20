<script lang="ts">
	// One of two Location backdrops — the ranger's Courier ship in orbit over the
	// park planet. It rides full-viewport behind the app's glass panels, so it's
	// built to be half-seen: the backdrop-filter above it blurs every detail into
	// mood, which is licence to keep the scene sparse and slow. A star field, a
	// planet, the faintest drift. Nothing here asks to be looked at directly.
	//
	// The CSS gradient is the deep-space floor; the transparent Canvas floats the
	// stars and planet over it. Even in light theme the void stays dark — just
	// lifted off pure black, since the translucent white panels need something to
	// read against.
	import { Canvas } from '@threlte/core';
	import LocaleSpaceScene from './LocaleSpaceScene.svelte';

	// `active` is orbit-vs-planetside: the parent keeps this layer mounted and only
	// turns its opacity, so when the ranger is planetside the scene is invisible but
	// still costs frames unless we say otherwise. Threaded down to the scene, which
	// parks the frameloop when it's false.
	let { active = true }: { active?: boolean } = $props();
</script>

<div class="space" aria-hidden="true">
	<Canvas dpr={[1, 1.5]}>
		<LocaleSpaceScene {active} />
	</Canvas>
</div>

<style>
	.space {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		color-scheme: light dark;
		background:
			radial-gradient(
				135% 120% at 72% 18%,
				light-dark(#182842, #0a1020) 0%,
				light-dark(#101d33, #06070f) 62%,
				light-dark(#0b1626, #030409) 100%
			);
	}

	.space :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
