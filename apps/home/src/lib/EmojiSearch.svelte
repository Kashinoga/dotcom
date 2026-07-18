<script lang="ts">
	import { SEARCH_SVG, CLOSE_SVG } from '$lib/icons';
	import { emojiSearch } from '$lib/emoji-search.svelte';

	// The Emoji Viewer's search, drawn in the panel HEADER (right edge) rather than its body —
	// Weather's arrangement (see CitySearch): one control in two states. Closed it's a 42px
	// disc; open it grows leftward into a field, from the same spot, and shrinks back on close.
	// No results list — it filters the wall in the body live, through $lib/emoji-search.
	let inputEl = $state<HTMLInputElement | undefined>(undefined);
	let rootEl = $state<HTMLElement | undefined>(undefined);

	// Opening focuses the field. Closing clears the query, so the wall returns to the full
	// set and the field never reopens holding a stale filter.
	$effect(() => {
		if (emojiSearch.open) inputEl?.focus();
		else emojiSearch.query = '';
	});

	function toggle() {
		emojiSearch.open = !emojiSearch.open;
	}
	// Close when focus leaves the control — unless a query is in flight, so a click on the
	// wall (to copy a hit) doesn't fold the search away mid-browse.
	function onFocusOut(e: FocusEvent) {
		if (rootEl && !rootEl.contains(e.relatedTarget as Node) && !emojiSearch.query.trim()) {
			emojiSearch.open = false;
		}
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			emojiSearch.query = '';
			emojiSearch.open = false;
		}
	}
</script>

<div class="es" class:open={emojiSearch.open} bind:this={rootEl} onfocusout={onFocusOut}>
	<button
		type="button"
		class="es-icon"
		aria-label={emojiSearch.open ? 'Close search' : 'Search emoji'}
		title={emojiSearch.open ? 'Close' : 'Search'}
		aria-expanded={emojiSearch.open}
		onclick={toggle}
	>
		{@html emojiSearch.open ? CLOSE_SVG : SEARCH_SVG}
	</button>
	<input
		bind:this={inputEl}
		class="es-input"
		type="search"
		placeholder="Search emoji…"
		autocomplete="off"
		spellcheck="false"
		aria-label="Search emoji by name"
		tabindex={emojiSearch.open ? 0 : -1}
		bind:value={emojiSearch.query}
		onkeydown={onKey}
	/>
</div>

<style>
	/* One element, two shapes — CitySearch's morph, restyled here (scoped styles can't be
	   shared). Closed: a 42px disc in the control family. Open: a field of the same height,
	   grown LEFTWARD (the row lays it out from the right, so widening pushes its own left
	   edge and the icon never moves). */
	.es {
		position: relative;
		display: flex;
		align-items: center;
		/* Shrink-to-fit (never grow): where the row runs out of room mid-spring, the field
		   gives back width rather than poking past the panel's right edge — see .head-actions
		   in +page. With room, its set width wins and nothing shrinks. */
		flex: 0 1 auto;
		min-width: 0;
		width: 42px;
		height: 42px;
		border-radius: 999px;
		background: var(--aero-face);
		color: var(--ink);
		border: 1px solid transparent;
		overflow: visible;
		transition:
			width 0.38s var(--spring),
			transform 0.3s var(--btn-spring),
			background 0.2s ease,
			border-color 0.2s ease;
		will-change: transform;
	}
	@media (prefers-reduced-motion: no-preference) {
		.es:not(.open):hover {
			transform: scale(var(--btn-hover-scale));
		}
		.es:not(.open):active {
			transform: scale(var(--btn-press-scale));
			transition-duration: 0.1s;
		}
	}
	.es.open {
		width: min(18rem, 60vw);
		background: none;
		border-color: var(--line-strong);
	}
	.es:not(.open):hover {
		background: color-mix(in srgb, var(--ink) 12%, transparent);
	}
	/* Aero in BOTH states — the closed disc AND the grown field with its close button wear
	   the frost, rim light and drop. Open, the aero face returns (base .es.open clears it),
	   and the field's border stays as its focus affordance. */
	:global(html[data-ui='bubble']) .es {
		-webkit-backdrop-filter: blur(6px) saturate(1.3);
		backdrop-filter: blur(6px) saturate(1.3);
		box-shadow: var(--aero-gloss), var(--aero-drop);
	}
	:global(html[data-ui='bubble']) .es.open {
		background: var(--aero-face);
	}
	/* The icon: the button while closed, the field's ornament (still clickable, to close)
	   once open. It never moves — it's the anchor the width grows away from. */
	.es-icon {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		padding: 0;
		color: inherit;
		background: none;
		border: 0;
		border-radius: 999px;
		cursor: pointer;
	}
	.es-icon :global(svg) {
		display: block;
		width: 1.35rem;
		height: 1.35rem;
	}
	.es-input {
		flex: 1 1 auto;
		min-width: 0;
		width: 0;
		height: 100%;
		padding: 0;
		font: inherit;
		/* 16px, not smaller: iOS Safari ZOOMS the whole page when you focus an input under
		   16px, then zooms back on blur — on a right-anchored field that reads as the right
		   edge lunging out on open and snapping back on close ("as if unexpanded"). At 16px
		   iOS leaves the viewport alone, so mobile grows/shrinks exactly like desktop. */
		font-size: 16px;
		color: var(--ink);
		background: none;
		border: 0;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.18s ease;
	}
	.es.open .es-input {
		padding: 0 0.85rem 0 0.15rem;
		opacity: 1;
		pointer-events: auto;
	}
	.es-input:focus-visible {
		outline: none; /* the grown field's border is the focus affordance */
	}
</style>
