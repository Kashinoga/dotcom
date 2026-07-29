<script lang="ts">
	import { versionOf } from '$lib/versions';
	import VersionCard from '$lib/VersionCard.svelte';

	// THE BETA TAG, and what is behind it.
	//
	// THE TEXT EDITOR NO LONGER WEARS ONE. Its version moved into the Settings flyout, with Apps
	// and About — a one-row bar cannot spend four controls on chrome, and of the four the tag was
	// the only one that was not even a control. What is left here is the TAG pattern itself: a
	// word in a bar that opens the card. The card is $lib/VersionCard, shared with the flyout, so
	// the next app to wear a tag gets the same one rather than a copy that has drifted.
	//
	// It used to be a <span>: a label with nothing to press, because a button that does nothing is
	// a promise to a keyboard and a screen reader that the app cannot keep. It has something to
	// say now — which version this is and what has just landed — so it is a button again, and the
	// promise is kept.
	//
	// Its own component rather than markup in the catch-all page for two reasons: the page is
	// already the whole site and this is the sort of thing that should be leaving it, and three
	// apps wear this tag. The store in $lib/versions is keyed by the same code $lib/places uses,
	// so a second app opts in by adding an entry there and swapping its span for this.

	let { code, title, accent }: { code: string; title: string; accent?: string } = $props();

	const version = $derived(versionOf(code));

	let open = $state(false);
	let at = $state({ x: 0, y: 0 });
	let tagEl: HTMLButtonElement | null = $state(null);
	let cardEl: HTMLDivElement | null = $state(null);

	function toggle() {
		if (open) return close();
		// Measured off the tag and drawn FIXED, for the reason the editor's own menus are: this
		// tag sits at the end of a bar that can scroll and whose row is one control high, so a
		// popover parented to it would be clipped by the bar rather than standing over the app.
		const box = tagEl?.getBoundingClientRect();
		if (box) at = { x: box.right, y: box.bottom + 6 };
		open = true;
	}

	function close(refocus = false) {
		open = false;
		if (refocus) tagEl?.focus();
	}

	/**
	 * The scrim and the card move to <body> for as long as they exist. `position: fixed` is
	 * fixed to the nearest ancestor that has made a stacking context, not to the window, and this
	 * tag lives deep inside the panel's header — so the card was laid over the app and the app's
	 * own textarea still took the clicks. Measured: Playwright named the element that was eating
	 * them. Out at the body there is nothing above them.
	 *
	 * Svelte still owns both nodes — the scoped styles ride on the element's own class, and
	 * teardown removes them. Same portal Weather uses for its dragged ghost.
	 */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	$effect(() => {
		if (!open || !cardEl) return;
		// Right-ALIGNED to the tag, which is in the bar's right-hand corner — so the card is laid
		// out from its own right edge and then pulled back inside the window if it overhangs.
		const box = cardEl.getBoundingClientRect();
		const left = Math.max(8, Math.min(at.x - box.width, window.innerWidth - box.width - 8));
		const top = Math.min(at.y, Math.max(8, window.innerHeight - box.height - 8));
		if (Math.abs(left - box.left) > 0.5) cardEl.style.left = `${left}px`;
		cardEl.style.top = `${top}px`;
		// The card takes focus, which is what makes Escape reach the handler on it rather than
		// the panel's — and what puts a screen reader inside the thing that just opened.
		if (!cardEl.contains(document.activeElement)) cardEl.focus();
	});
</script>

<button
	type="button"
	class="beta"
	class:open
	bind:this={tagEl}
	style:--accent={accent}
	aria-expanded={open}
	aria-label="{title} is in beta — {version}"
	title="{title} {version} — in beta, expect it to change"
	onclick={toggle}>Beta</button
>

{#if open}
	<!-- The scrim is a button so a click anywhere shuts the card, the same way every other
	     popover in this app closes. -->
	<button
		class="popover-scrim"
		use:portal
		aria-label="Close the version card"
		onclick={() => close()}
	></button>
	<div
		class="popover beta-card"
		role="dialog"
		aria-label="{title} {version}"
		tabindex="-1"
		use:portal
		bind:this={cardEl}
		style:left="{at.x}px"
		style:top="{at.y}px"
		onkeydown={(e) => {
			// Stopped here as well as handled: Escape is how the panel around this closes, and one
			// press should shut the card rather than the card and the app together.
			if (e.key === 'Escape') {
				e.stopPropagation();
				close(true);
			}
		}}
	>
		<VersionCard {code} {title} />
	</div>
{/if}

<style>
	/* The tag itself keeps puhig's `.beta` entirely — this file adds only its fit and the state
	   it can now be in.
	   FIT: standing among the panel's actions it has to match the CONTROLS beside it rather than
	   shrink to its own type. It was 19.6px against a 28px Home, measured.
	   `align-self: stretch` did that job for as long as a taller SIBLING was setting the height of
	   the actions row — which is a dependency on the company the tag keeps, and the day the
	   editor's Home and About went down to the phone's flyout the tag was left alone in that row,
	   stretching to its own 19.6px content and nothing else. So the control line is stated here
	   instead: 42px is the base disc, 28px is Pixelite's one control line (puhig `.icon-btn`, and
	   the rack's own `.tb` — the third place this number is written, each with this note). Stretch
	   stays, so a row that is somehow taller still wins; the min-height is the floor for a tag
	   standing on its own.
	   Measured after, at both widths: 28px against 28px keys under Pixelite, which is the theme
	   this ships in. Under Aeropalite the tag is 42px — level with the disc row it stands in on a
	   desk, and taller than the rack's keys on a phone, where that row now holds nothing else.
	   That gap is Aeropalite's own: its dense bar mixes 42px discs with the rack's 28px keys, and
	   it did so before any of this. Not worth a fourth copy of the 820px breakpoint to paper
	   over. */
	.beta {
		align-self: stretch;
		min-height: 42px;
		display: inline-flex;
		align-items: center;
		flex: none;
	}
	:global(html[data-look='pixelite']) .beta {
		min-height: 28px;
	}
	/* Open, it takes the accent it already borrows on hover, so the card reads as belonging to
	   the thing that opened it. */
	.beta.open {
		color: var(--orange);
		border-color: var(--orange);
	}

	/* The shared popover — puhig's .popover, the same surface the editor's context menu and its
	   heading picker are cut from. This card is WIDER than a menu and better inset, because it
	   holds prose rather than a column of choices; everything else about the material (the sheet,
	   its edge, the paper drop, the scrim in front of the page) is the recipe's. */
	.beta-card {
		width: min(23rem, calc(100vw - 1rem));
		padding: 0.7rem 0.85rem 0.8rem;
	}
</style>
