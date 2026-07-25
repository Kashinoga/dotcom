<script lang="ts">
	import FloatingKey from '$lib/FloatingKey.svelte';

	// THE RANGER'S MOBILE CONTROLS KEY — on a phone the Park Ranger's dense bar has no room for
	// the global controls, so pause, Home and the gear leave it and gather in the floating key at
	// the bottom-left.
	//
	// The KEY is $lib/FloatingKey now. ATFC wanted the same shape, which made it the third caller
	// after the docs shell and this one — and a third copy of a hundred lines of CSS is one copy
	// too many. What stays here is the only part that was ever the ranger's: which three buttons,
	// in which order, saying what.
	//
	// Same bargain as before: the page decides. Whether this is on screen at all (PUD, and only
	// on a phone), what pausing means, where Home goes, and whether the division settings card is
	// up — all of that is the page's, and arrives as props.
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

{#snippet buttons()}
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
{/snippet}

<FloatingKey bind:open {icon} label="Controls" {buttons} />
