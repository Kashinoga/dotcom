<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { Snippet } from 'svelte';
	import { refreshThemeColor } from '$lib/theme-color';

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
		buttons,
		card,
		row
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
		/* Optional: anything that will not fit a 40px disc — a row of fields, a set of choices.
		   It rides in a card ABOVE the key column, on the same frosted material, and opens and
		   closes with it. ATFC puts its Airport/Range/Refresh controls here, which is the whole
		   reason the flyout has two shapes rather than one. */
		card?: Snippet;
		/* Optional: ONE control that belongs on the key's own row, running out to its right and
		   filling the width left over. For a thing that is wide rather than tall — the Star Map's
		   location field — where a card above the column would spend a whole band of screen on a
		   single line of input while the row beside the key sat empty. It is the caller's to
		   dress; this file only seats it, and opens and closes it with everything else. */
		row?: Snippet;
	} = $props();

	// Tell the browser chrome. Standing up puts a full-screen SCRIM over the page, and every bar on
	// the site sits BELOW that scrim — so the bar the chrome is matched to is genuinely dimmed
	// while the stack is out, and undimmed when it folds. Nothing else would notice: opening
	// scrolls nothing, navigates nowhere, and touches no attribute on <html>, which is every signal
	// $lib/theme-color listens for on its own.
	$effect(() => {
		void open;
		refreshThemeColor();
	});
</script>

{#if open}
	<button
		class="fkey-scrim"
		aria-label="Close {label.toLowerCase()}"
		transition:fade={{ duration: 180 }}
		onclick={() => (open = false)}
	></button>
{/if}
<!-- ONE anchored flyout, so the card and the keys rise and fall as a single object and the
     card never has to know how tall the key column is. Column-reverse inside the stack seats
     the first button nearest the thumb; the card sits above the lot. -->
<div class="fkey-flyout" class:open>
	{#if card}
		<div class="fkey-card">{@render card()}</div>
	{/if}
	<div class="fkey-stack">
		{@render buttons()}
	</div>
</div>
<!-- The key's own row, to its right. Outside the flyout above on purpose: that box is anchored
     ABOVE the key and stacks upward, and this one has to sit level with the key itself. -->
{#if row}
	<div class="fkey-row" class:open>{@render row()}</div>
{/if}
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
	/* The disclosed flyout rises from just above the key. Parked down + faded + non-interactive
	   when shut (visibility drops it from the focus order), springing up on open. The card and
	   the key column live inside it, so one transform carries both and the card never needs to
	   know how tall the column below it is. */
	.fkey-flyout {
		position: fixed;
		left: 1.25rem;
		bottom: calc(1.25rem + 40px + 0.5rem);
		z-index: 18;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
		transform: translateY(0.5rem);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 0.2s ease,
			transform 0.24s ease,
			visibility 0s linear 0.24s;
	}
	.fkey-flyout.open {
		transform: translateY(0);
		opacity: 1;
		visibility: visible;
		transition:
			opacity 0.2s ease,
			transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	/* column-reverse seats the FIRST button nearest the thumb (the ranger's pause twin, the
	   board's refresh) and works up from there. */
	.fkey-stack {
		display: flex;
		flex-direction: column-reverse;
		gap: 0.5rem;
	}
	/* The key's row: level with the key, starting where the key ends and running to the far inset.
	   The measures restate the key's own — its 1.25rem insets, its 40px, and the 0.5rem the stack
	   above keeps — so the row's left edge lands exactly one gap past the key's right edge.
	   It runs OUT SIDEWAYS from behind the key rather than rising, because that is where it came
	   from: the key is at its left, and a thing on the key's row has no reason to arrive from
	   below. Same clock and same easing as the flyout, so the two read as one movement. */
	.fkey-row {
		position: fixed;
		left: calc(1.25rem + 40px + 0.5rem);
		right: 1.25rem;
		bottom: 1.25rem;
		z-index: 18;
		display: flex;
		align-items: center;
		transform: translateX(-0.5rem);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 0.2s ease,
			transform 0.24s ease,
			visibility 0s linear 0.24s;
	}
	.fkey-row.open {
		transform: translateX(0);
		opacity: 1;
		visibility: visible;
		transition:
			opacity 0.2s ease,
			transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	@media (prefers-reduced-motion: reduce) {
		.fkey-row {
			transition:
				opacity 0.12s ease,
				visibility 0s linear 0.12s;
			transform: none;
		}
		.fkey-row.open {
			transition: opacity 0.12s ease;
			transform: none;
		}
	}
	/* The card: the key's own frosted material at panel size, held to the viewport with the same
	   1.25rem insets the key keeps. Its CONTENTS are the caller's — styled by the caller, which
	   is why there is nothing here about fields or labels. */
	.fkey-card {
		box-sizing: border-box;
		width: calc(100vw - 2 * 1.25rem);
		max-width: 24rem;
		padding: 0.75rem;
		color: var(--ink);
		background: color-mix(in srgb, var(--page) 92%, transparent);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		/* The OVERLAY edge, not the key border, though the card wears the key's face: this is a
		   surface that opened over the app, and at night the key's white/42 rule drew a bright
		   halo around it. The keys inside the stack keep their own border — they are keys, and
		   they should go on looking like the ones in the bar. */
		border: 1px solid var(--popover-edge, var(--pixel-key-border, rgba(0, 0, 0, 0.4)));
		border-radius: 4px;
		box-shadow: var(--pixel-bevel, 0 3px 10px rgba(4, 7, 15, 0.28));
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
		.fkey-flyout {
			transition:
				opacity 0.12s ease,
				visibility 0s linear 0.12s;
			transform: none;
		}
		.fkey-flyout.open {
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
