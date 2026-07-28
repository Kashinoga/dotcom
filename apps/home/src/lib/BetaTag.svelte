<script lang="ts">
	import { RELEASES, versionOf } from '$lib/versions';

	// THE BETA TAG, and what is behind it.
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

	const release = $derived(RELEASES[code]);
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

{#if open && release}
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
		<header class="beta-head">
			<span class="beta-name">{title}</span>
			<span class="beta-ver">{version}</span>
		</header>
		<!-- What the three numbers mean, said once. A version nobody can read is a serial number.
		     One run of text with real spaces in it rather than three spans held apart by a flex
		     gap: a gap is not a space, and a screen reader read the legend as one word. -->
		<p class="beta-scheme">collections · features · commits</p>
		<h3 class="beta-sub">Recently</h3>
		<ul class="beta-list">
			{#each release.recent.slice(0, 5) as feature (feature.what)}
				<li class="beta-item">
					<span class="beta-at">{feature.at}</span>
					<span class="beta-what">{feature.what}</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	/* The tag itself keeps puhig's `.beta` entirely — this file adds only its fit and the state
	   it can now be in.
	   FIT: standing among the panel's actions it has to match the CONTROLS beside it rather than
	   shrink to its own type. `align-self: stretch` rather than a height, so it follows whatever
	   the row is — 28px of Pixelite's control line, 42px of Aeropalite's disc — instead of
	   picking one and being wrong in the other theme. It was 19.6px against a 28px Home,
	   measured. (This rule came out of the catch-all page with the element.) */
	.beta {
		align-self: stretch;
		display: inline-flex;
		align-items: center;
		flex: none;
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
	.beta-head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.beta-name {
		flex: 1 1 auto;
		min-width: 0;
		font-family: var(--font-mono, monospace);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* The version is the one figure on this card, so it is set in the figure face the rest of
	   the manual keeps for numbers — the section numerals, the listing tags, the workspace
	   tallies. */
	.beta-ver {
		flex: none;
		font-family: var(--font-pixel, var(--font-mono, monospace));
		font-size: 1.05rem;
		line-height: 1;
		color: var(--orange);
	}
	/* The legend sits directly under the number and is spaced to read AGAINST it — three words
	   in the order of the three figures. It is not aligned to them character by character: the
	   figures are proportional to their own values and any alignment would be a lie by the
	   second release. */
	.beta-scheme {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono, monospace);
		font-size: 0.6rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.beta-sub {
		margin: 0.7rem 0 0.35rem;
		font-family: var(--font-mono, monospace);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.beta-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	/* Each line carries the version it landed in, in the figure face, so the list reads as a
	   short history rather than as a feature list — you can see where one release ends. */
	.beta-item {
		display: flex;
		gap: 0.9rem;
		align-items: baseline;
	}
	/* The version each line landed in, in its own column. Wide enough for the WHOLE triple —
	   `0.8.307`, not `0.8`: several features land in one minor, and a column of identical `0.8`s
	   says nothing about which came first, which is the one thing this list is for. The gap to
	   the text is the item's, and it is generous — these are two different kinds of thing and a
	   tight gap read them as one wrapped sentence. */
	.beta-at {
		flex: none;
		width: 3.6rem;
		font-family: var(--font-pixel, var(--font-mono, monospace));
		font-size: 0.8rem;
		line-height: 1.3;
		color: var(--sub);
		font-variant-numeric: tabular-nums;
	}
	.beta-what {
		flex: 1 1 auto;
		font-size: 0.76rem;
		line-height: 1.4;
	}
</style>
