<script lang="ts">
	import { fade } from 'svelte/transition';

	// THE RANGER'S MOBILE CONTROLS KEY — the Emoji Viewer's floating-disclosure shape, ported to
	// the Park Ranger's panel. On a phone the dense bar has no room for the global controls
	// (pause, Home, the gear), so they leave it and gather here: a plastic key at the
	// bottom-right that opens a small stack of them, with a scrim to tap away. The key wears the
	// app's own mark, so it doubles as a "you are here" badge — the docs FAB's trick.
	//
	// Same bargain as the sky components: the page decides. Whether this is on screen at all
	// (PUD, and only on a phone), what pausing means, where Home goes, and whether the division
	// settings card is up — all of that is the page's, and arrives as props. This file owns the
	// key, the stack, the scrim, and how they open.
	let {
		open = $bindable(false),
		paused = false,
		settingsOpen = false,
		icon = '',
		pauseIcon = '',
		homeIcon = '',
		gearIcon = '',
		onPause,
		onHome,
		onSettings
	}: {
		/* Is the stack disclosed? Bindable — opening a panel resets it from outside, the way the
		   sky console's card is reset on navigation. */
		open?: boolean;
		paused?: boolean;
		/* Only ever read out, for the gear's label: the card itself is the page's. */
		settingsOpen?: boolean;
		/* The app's own mark, worn by the key. */
		icon?: string;
		/* The stack's three glyphs. Passed rather than imported so this file holds no opinion
		   about which icon set the site uses. */
		pauseIcon?: string;
		homeIcon?: string;
		gearIcon?: string;
		onPause: () => void;
		onHome: () => void;
		onSettings: () => void;
	} = $props();
</script>

{#if open}
	<button
		class="pud-scrim"
		aria-label="Close controls"
		transition:fade={{ duration: 180 }}
		onclick={() => (open = false)}
	></button>
{/if}
<div class="pud-fab-stack" class:open>
	<!-- The pause twin — the game's one verb you might reach for mid-scroll. -->
	<button
		type="button"
		class="icon-btn"
		aria-pressed={paused}
		aria-label={paused ? 'Resume the works' : 'Pause the works'}
		title={paused ? 'Resume the works' : 'Pause the works'}
		onclick={onPause}>{@html pauseIcon}</button
	>
	<!-- Home — the one door out of the ranger's full-viewport world on a phone. -->
	<button
		type="button"
		class="icon-btn"
		aria-label="Close and go home"
		title="Home"
		onclick={onHome}>{@html homeIcon}</button
	>
	<!-- The gear opens the division settings card, and folds the key away so the card has the
	     screen (data-pud-settings keeps the click-away from re-closing it). -->
	<button
		type="button"
		class="icon-btn"
		data-pud-settings
		aria-expanded={settingsOpen}
		aria-label={settingsOpen ? 'Close division settings' : 'Division settings'}
		title="Division settings"
		onclick={() => {
			onSettings();
			open = false;
		}}>{@html gearIcon}</button
	>
</div>
<button
	type="button"
	class="pud-fab"
	aria-expanded={open}
	aria-label={open ? 'Hide controls' : 'Show controls'}
	title={open ? 'Hide controls' : 'Controls'}
	onclick={() => (open = !open)}>{@html icon}</button
>

<style>
	/* ── IPR (PUD) mobile controls key ───────────────────────────────────────────
	   The Emoji Viewer's floating-disclosure shape (DocsShell .docs-fab), ported to the panel
	   for the ranger's phone layout. A plastic key at the bottom-right opens a small stack of
	   the global controls that leave the dense bar on a phone; a scrim taps it away. Rendered
	   only for PUD on a phone (see the {#if} in the panel), so no display toggle is needed. */
	.pud-fab {
		position: fixed;
		right: 1.25rem;
		bottom: 1.25rem;
		z-index: 19;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		width: 40px;
		height: 40px;
		padding: 0;
		color: var(--ink);
		/* The superbar's frost, worn as the key face (docs-fab's material). */
		background: color-mix(in srgb, var(--page) 78%, transparent);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		border: 1px solid var(--pixel-key-border, rgba(0, 0, 0, 0.4));
		border-radius: 4px;
		box-shadow: var(--pixel-bevel, 0 3px 10px rgba(4, 7, 15, 0.28));
		cursor: pointer;
		transition:
			color 0.15s ease,
			border-color 0.15s ease;
	}
	.pud-fab:active {
		box-shadow: var(--pixel-bevel-press, inset 0 2px 6px rgba(0, 0, 0, 0.3));
	}
	.pud-fab[aria-expanded='true'] {
		color: var(--orange);
		border-color: var(--orange);
	}
	.pud-fab :global(svg) {
		display: block;
		width: 1.35rem;
		height: 1.35rem;
	}
	/* The disclosed stack rises from just above the key; column-reverse seats the pause twin
	   nearest the thumb, the gear at the top. Parked down + faded + non-interactive when shut
	   (visibility drops it from the focus order), springing up on open. */
	.pud-fab-stack {
		position: fixed;
		right: 1.25rem;
		bottom: calc(1.25rem + 40px + 0.5rem);
		z-index: 18;
		display: flex;
		flex-direction: column-reverse;
		gap: 0.5rem;
		transform: translateY(0.5rem);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 0.2s ease,
			transform 0.24s ease,
			visibility 0s linear 0.24s;
	}
	.pud-fab-stack.open {
		transform: translateY(0);
		opacity: 1;
		visibility: visible;
		transition:
			opacity 0.2s ease,
			transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	/* The stack's keys are touch-sized (40px, off the 28px control line) and wear the key's
	   own frosted face, so the cluster reads as one material with the FAB. */
	.pud-fab-stack .icon-btn {
		width: 40px;
		height: 40px;
		background: color-mix(in srgb, var(--page) 78%, transparent);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
	}
	@media (prefers-reduced-motion: reduce) {
		.pud-fab-stack {
			transition:
				opacity 0.12s ease,
				visibility 0s linear 0.12s;
			transform: none;
		}
		.pud-fab-stack.open {
			transition: opacity 0.12s ease;
			transform: none;
		}
	}
	/* A faint ink veil while the stack stands, and the tap-anywhere dismissal. Under the stack
	   and the key (17 vs 18/19); over the panel content. */
	.pud-scrim {
		position: fixed;
		inset: 0;
		z-index: 17;
		padding: 0;
		background: rgba(0, 0, 0, 0.08);
		border: 0;
		cursor: default;
	}
	:global(html.scheme-dark) .pud-scrim {
		background: rgba(0, 0, 0, 0.55);
	}
</style>
