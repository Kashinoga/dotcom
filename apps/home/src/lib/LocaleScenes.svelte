<script lang="ts">
	import { ranger } from '$lib/location-state.svelte';
	import LocaleForest from '$lib/LocaleForest.svelte';

	// THE PARK RANGER'S SCENERY — the forest, the space above it, and the wipe that hides the swap
	// between them. It sits behind the ranger's own chrome inside the panel, and it was written out
	// in the catch-all page: a hundred lines of one app's backdrop in the file that draws every
	// place on the site.
	//
	// IT TAKES NOTHING. There is nothing for the page to decide here — every question the scenery
	// asks is about the deployment, and that is `$lib/location-state`, which this reads directly.
	// Contrast the sky, where the page has to work out whether a layer belongs on screen at all
	// (see $lib/Sky and the note by it): there the props are ANSWERS to questions the sky must not
	// hold. Here there are no such questions.

	// HAS THE RANGER EVER GONE UP THIS VISIT? The space scene mounts on the first orbit and then
	// stays — a mounted-once layer just turns its opacity, so later deployments cannot race a
	// snapshot the way mount/unmount fades did. Until then three.js stays unpaid-for.
	// It lived on the page and was read in exactly one place: here. It is the scenery's own memory.
	let everOrbited = $state(false);
	$effect(() => {
		if (ranger.deployment === 'orbit') everOrbited = true;
	});
</script>

<!-- The Location backdrop — scenery behind the ranger's chrome.
     It lives INSIDE the panel because the sheet is opaque: there is no "behind the
     panel" the viewer can see. The space scene is imported lazily so three.js is
     never paid for until the ranger first goes up.
     NOTHING MOUNTS OR UNMOUNTS on a deployment. Svelte in/out fades here raced the
     view transition's snapshots — the capture caught scenes mid-intro and the sheet
     flashed through every swap. So the forest is the PERMANENT base layer, always
     opaque beneath everything, and the space scene above it is the only thing that
     moves: one CSS opacity transition, compositor-driven, nothing for a snapshot to
     catch half-dressed. Either direction, the fade happens over an opaque scene. -->
<!-- The wrapper is an ISOLATED stacking context: space pins itself over the forest
     with a z-index that must never escape to outrank the chrome, which sits above
     these scenes by DOM order alone. -->
<div class="locale-scenes" aria-hidden="true">
	<div class="locale-scene">
		<LocaleForest />
	</div>
	{#if everOrbited}
		<!-- class:instant kills the 0.7s opacity fade WHILE a transit is in the air: the
     scene swap is timed to land at WIPE_COVER_MS, when the white owns the screen,
     so it must be INSTANT — a fade would still be crossing when the white lifts
     and the seam would show. Either direction, the swap happens unseen. And the
     space loop must keep running through BOTH legs (the descend dives while
     deployment has already flipped planetside under the wash), so `active` reads
     the transit too, not just the resting deployment. -->
		<div
			class="locale-scene scene-orbit"
			class:shown={ranger.deployment === 'orbit'}
			class:instant={ranger.transit !== null}
		>
			{#await import('$lib/LocaleSpace.svelte') then m}
				<m.default active={ranger.deployment === 'orbit' || ranger.transit !== null} />
			{/await}
		</div>
	{/if}
	<!-- THE WIPE — an atmosphere flash over both scenes (z above them, inside the isolated
     wrapper), mounted only for the length of a transit. One keyframes animation
     (fill-mode forwards) covers, holds, then reveals; the world is swapped under it
     during the hold, so the change is never seen. See .locale-wipe for the phasing. -->
	{#if ranger.transit}
		<div class="locale-wipe"></div>
	{/if}
</div>

<style>
	/* The scenery's own dress, moved out of the catch-all page with the markup it belongs to —
	   Svelte scopes `.a .b` as `.a.svelte-x .b.svelte-x`, so these rules could only follow the
	   elements they name. The one rule LEFT BEHIND is `.surface-head.bar, .surface-body.ranger {
	   position: relative }`: those are the PAGE's elements, and the rule exists so that among
	   positioned siblings with auto z-index the DOM order wins — scene first, chrome after. It is
	   about the chrome, so it stays with the chrome, and the note beside it now points here. */
	.locale-scenes {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		/* The scenes' z-order is a private argument: isolate keeps space's z-index from ever
	   outranking the chrome, which beats this wrapper by DOM order alone. */
		isolation: isolate;
		/* Its own view-transition group: snapshotted apart from the root, old and new scenery
	   crossfade in an isolated image pair (the UA's plus-lighter blend — dip-free) instead
	   of riding the root's crossfade alongside the recoloring chrome. */
		view-transition-name: pud-scenes;
	}
	.locale-scene {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	/* Space rides above the always-opaque forest and is the only layer that fades — one
   opacity turn on a mounted-once element, so no deployment ever shows the sheet. */
	.locale-scene.scene-orbit {
		z-index: 1;
		opacity: 0;
	}
	.locale-scene.scene-orbit.shown {
		opacity: 1;
	}
	/* While a transit is in the air the scene swap must be INSTANT: it's timed to land at
   WIPE_COVER_MS, when the white fully covers the screen, so a lingering 0.7s opacity fade would
   still be crossing as the white lifts and the seam between the two skies would show. This kills
   the transition just for the swap under the wash; the RESTING fade (a plain planetside↔orbit
   change with no transit — reduced motion, say) keeps it. Higher specificity than the base rule,
   so it wins wherever it applies. */
	.locale-scene.scene-orbit.instant {
		transition: none;
	}
	/* THE WIPE — the atmosphere, absolute over BOTH scenes inside the isolated wrapper
   (z-index 2, above space's z-index 1), mounted only for the length of a transit.
   A FULL-BLEED FADE, not a directional slide: the cover is the whole glass brightening at
   once, because what it plays against is the CAMERA — descending, the dive to closest
   approach runs exactly the cover's 350ms (see LocaleSpaceScene), so the planet swelling
   up and the air thickening over the lens arrive together and read as entering the
   atmosphere; ascending, the reveal fades off the planet-filling close-up just as the
   FLIGHT starts pulling the camera away, the air thinning as you leave it. An edge-wipe
   said "slide"; a bleed timed to the zoom says "through".
   It follows the viewer's theme — by day the air is bright haze, by night a deep indigo
   sky, indigo rather than pure black so it still reads as SKY. (This layer sits outside
   the orbit re-theme's color-scheme scope, so light-dark() answers to the user's theme,
   not the ship's.)
   One keyframes animation carries all three phases, so nothing can drift from a missed
   timer the way separate setTimeouts could. The clock is location-state's: COVER 350 +
   HOLD 150 + REVEAL 450 = 950ms total; the percentages are those milestones over the
   total — cover 350/950 = 36.842%, hold-end 500/950 = 52.632% — so this animation and the
   module's setTimeout(flip, WIPE_COVER_MS) read the same clock: the swap lands exactly
   inside the hold, fully covered. fill-mode forwards holds the cleared end until the
   element unmounts at TRANSIT_TOTAL_MS. */
	.locale-wipe {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		background: light-dark(#eef2f6, #0b1120);
		animation: locale-wipe 950ms linear forwards;
	}
	@keyframes locale-wipe {
		0% {
			opacity: 0;
			animation-timing-function: ease-in;
		}
		36.842% {
			opacity: 1;
		}
		52.632% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: no-preference) {
		.locale-scene.scene-orbit {
			transition: opacity 0.7s ease;
		}
		/* The deployment's view transition is the only one this site starts, so the root's
	   crossfade (the recoloring chrome) and the scenes' own group ride the panel's 0.45s
	   like the named sections do — the browser's 0.25s default finished ahead of everything
	   else and the mismatch read as a flicker. */
		:global(::view-transition-group(root)),
		:global(::view-transition-group(pud-scenes)),
		:global(::view-transition-group(pud-bar)) {
			animation-duration: 0.45s;
			animation-timing-function: ease;
		}
	}
</style>
