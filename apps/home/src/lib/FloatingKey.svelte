<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	// A FLOATING CONTROLS KEY — a plastic key at the phone's bottom-left that discloses a small
	// stack of controls, with a scrim to tap away. The shape started in the Emoji Viewer, became
	// the docs shell's contents key, then the Park Ranger's; ATFC is the third app to want it,
	// and three copies of a hundred lines of CSS is one copy too many. So it lives here, and the
	// callers bring only their own buttons.
	//
	// The key wears the app's own mark, so it doubles as a "you are here" badge — the docs FAB's
	// trick. It is always bottom-LEFT: one corner for this kind of control across the whole site,
	// so a reader crossing from the manual to an app reaches the same place.
	//
	// What it does NOT own: what the buttons are, what they do, or whether the key should exist
	// at all. The caller passes a snippet of buttons and decides when to render it — this file
	// owns the key, the stack, the scrim, and how they open.
	let {
		open = $bindable(false),
		icon = '',
		label = 'Controls',
		buttons
	}: {
		/* Is the stack disclosed? Bindable, so a caller can fold it from outside — opening a
		   panel resets the ranger's, for instance. */
		open?: boolean;
		/* The app's own mark, worn by the key. */
		icon?: string;
		/* What the key is called, for the label and title when shut. */
		label?: string;
		/* The controls themselves. Give them class="icon-btn" and they inherit the stack's
		   touch-sized frosted face. */
		buttons: Snippet;
	} = $props();
</script>

{#if open}
	<button
		class="fkey-scrim"
		aria-label="Close {label.toLowerCase()}"
		transition:fade={{ duration: 180 }}
		onclick={() => (open = false)}
	></button>
{/if}
<div class="fkey-stack" class:open>
	{@render buttons()}
</div>
<button
	type="button"
	class="fkey"
	aria-expanded={open}
	aria-label={open ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
	title={open ? `Hide ${label.toLowerCase()}` : label}
	onclick={() => (open = !open)}>{@html icon}</button
>

<style>
	/* ── The floating key ────────────────────────────────────────────────────────
	   A plastic key at the bottom-left, its stack rising from just above it. Every measure here
	   was the Park Ranger's before it was shared: the 40px touch size, the 1.25rem insets that
	   match the docs shell's contents key, and the superbar's frost worn as the key face. */
	.fkey {
		position: fixed;
		left: 1.25rem;
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
	.fkey:active {
		box-shadow: var(--pixel-bevel-press, inset 0 2px 6px rgba(0, 0, 0, 0.3));
	}
	.fkey[aria-expanded='true'] {
		color: var(--orange);
		border-color: var(--orange);
	}
	.fkey :global(svg) {
		display: block;
		width: 1.35rem;
		height: 1.35rem;
	}
	/* The disclosed stack rises from just above the key; column-reverse seats the pause twin
	   nearest the thumb, the gear at the top. Parked down + faded + non-interactive when shut
	   (visibility drops it from the focus order), springing up on open. */
	.fkey-stack {
		position: fixed;
		left: 1.25rem;
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
	.fkey-stack.open {
		transform: translateY(0);
		opacity: 1;
		visibility: visible;
		transition:
			opacity 0.2s ease,
			transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	/* The stack's keys are touch-sized (40px, off the 28px control line) and wear the key's
	   own frosted face, so the cluster reads as one material with the FAB.
	   :global on the child, because the buttons are the CALLER'S — they arrive through the
	   snippet carrying the caller's scope hash, not this file's, so a bare .icon-btn here would
	   be scoped to a component that never renders one. (svelte-check said exactly that: "Unused
	   CSS selector". Without the fix the ranger's keys would have quietly dropped to the 28px
	   control line with no frost.) The CONTAINER stays scoped — it is this file's element — so
	   the rule still reaches only the buttons inside a stack. */
	.fkey-stack :global(.icon-btn) {
		width: 40px;
		height: 40px;
		background: color-mix(in srgb, var(--page) 78%, transparent);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
	}
	@media (prefers-reduced-motion: reduce) {
		.fkey-stack {
			transition:
				opacity 0.12s ease,
				visibility 0s linear 0.12s;
			transform: none;
		}
		.fkey-stack.open {
			transition: opacity 0.12s ease;
			transform: none;
		}
	}
	/* A faint ink veil while the stack stands, and the tap-anywhere dismissal. Under the stack
	   and the key (17 vs 18/19); over the panel content. */
	.fkey-scrim {
		position: fixed;
		inset: 0;
		z-index: 17;
		padding: 0;
		background: rgba(0, 0, 0, 0.08);
		border: 0;
		cursor: default;
	}
	:global(html.scheme-dark) .fkey-scrim {
		background: rgba(0, 0, 0, 0.55);
	}
</style>
