<script lang="ts">
	import { SEARCH_SVG } from '$lib/icons';
	import { wx, choose, type Place } from '$lib/weather.svelte';

	// The Weather panel's search, drawn in the panel's HEADER (on the Back row) rather than its body.
	//
	// It is one control in two states, not a button that reveals a field: the disc grows sideways
	// into the field, from the same spot, and shrinks back into a disc when it closes. So the width
	// animates on one element and the input lives inside it the whole time — a second element
	// appearing next to the button would slide, not morph.
	let query = $state('');
	let hits = $state<Place[]>([]);
	let searching = $state(false);
	let active = $state(0); // which result the arrow keys are on
	let timer = 0;
	let seq = 0; // guards against a slow response overwriting a newer one
	let inputEl = $state<HTMLInputElement | undefined>(undefined);
	let rootEl = $state<HTMLElement | undefined>(undefined);

	// Opening focuses the field — a search you have to click into isn't open, it's just visible.
	// Closing clears it, so it never reopens holding the last query's stale results.
	$effect(() => {
		if (wx.searchOpen) {
			inputEl?.focus();
		} else {
			query = '';
			hits = [];
		}
	});

	function onQuery(v: string) {
		query = v;
		clearTimeout(timer);
		if (v.trim().length < 2) {
			hits = [];
			return;
		}
		// Debounced: a keystroke is not a search. 250ms is about the gap between typing and pausing.
		timer = window.setTimeout(() => search(v), 250);
	}

	async function search(v: string) {
		const mine = ++seq;
		searching = true;
		try {
			const r = await fetch(`/api/places?q=${encodeURIComponent(v.trim())}`);
			const data = (await r.json()) as { places?: Place[] };
			// A response that isn't the latest is stale — dropping it stops an older, slower query from
			// clobbering what has since been typed.
			if (mine !== seq) return;
			hits = data.places ?? [];
			active = 0;
		} catch {
			if (mine === seq) hits = [];
		} finally {
			if (mine === seq) searching = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			// Swallowed: Escape closes the search, never the panel behind it.
			e.stopPropagation();
			wx.searchOpen = false;
			return;
		}
		if (!hits.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = (active + 1) % hits.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active - 1 + hits.length) % hits.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			choose(hits[active]);
		}
	}

	// Clicking away closes it — but not a click INSIDE it, which would shut the thing mid-search.
	function onFocusOut(e: FocusEvent) {
		const next = e.relatedTarget as Node | null;
		if (next && rootEl?.contains(next)) return;
		wx.searchOpen = false;
	}
</script>

<div class="cs" class:open={wx.searchOpen} bind:this={rootEl} onfocusout={onFocusOut}>
	<button
		type="button"
		class="cs-icon"
		aria-label={wx.searchOpen ? 'Close search' : 'Search a city'}
		title={wx.searchOpen ? 'Close' : 'Search a city'}
		aria-expanded={wx.searchOpen}
		onclick={() => (wx.searchOpen = !wx.searchOpen)}
	>
		{@html SEARCH_SVG}
	</button>
	<input
		bind:this={inputEl}
		type="search"
		class="cs-input"
		placeholder={wx.searchMode === 'add' ? 'Add a US city…' : 'Search a US city…'}
		autocomplete="off"
		spellcheck="false"
		role="combobox"
		aria-expanded={hits.length > 0}
		aria-controls="cs-results"
		aria-label={wx.searchMode === 'add' ? 'Add a US city' : 'Search a US city'}
		tabindex={wx.searchOpen ? 0 : -1}
		value={query}
		oninput={(e) => onQuery(e.currentTarget.value)}
		onkeydown={onKey}
	/>

	{#if wx.searchOpen && hits.length}
		<ul class="cs-results" id="cs-results" role="listbox">
			{#each hits as h, i}
				<li>
					<button
						type="button"
						class="cs-hit"
						class:on={i === active}
						role="option"
						aria-selected={i === active}
						onclick={() => choose(h)}
						onmouseenter={() => (active = i)}
					>
						<span class="cs-hit-name">{h.name}</span>
						<span class="cs-hit-state">{h.state}</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else if wx.searchOpen && query.trim().length >= 2 && !searching}
		<p class="cs-none">
			No US city by that name — the National Weather Service only knows the United States.
		</p>
	{/if}
</div>

<style>
	/* One element, two shapes. Closed it's a 32px disc, matching every other panel control; open it
	   is a field of the same height, grown leftward from where the disc was (the row lays it out from
	   the right, so widening pushes its own left edge out and the icon never moves). */
	.cs {
		position: relative;
		display: flex;
		align-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--ink) 62%, transparent);
		color: var(--paper);
		border: 1px solid transparent;
		overflow: visible;
		transition:
			width 0.24s cubic-bezier(0.4, 0, 0.2, 1),
			background 0.2s ease,
			color 0.2s ease,
			border-color 0.2s ease;
	}
	.cs.open {
		width: min(20rem, 55vw);
		background: none;
		color: var(--ink);
		border-color: var(--line-strong);
	}
	.cs:not(.open):hover {
		background: var(--ink);
	}
	/* The icon is the button while closed, and the field's ornament (still clickable, to close) once
	   open. It never moves: it's the anchor the width grows away from. */
	.cs-icon {
		flex: none;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		padding: 0;
		color: inherit;
		background: none;
		border: 0;
		border-radius: 999px;
		cursor: pointer;
	}
	.cs-icon :global(svg) {
		display: block;
		width: 1.05rem;
		height: 1.05rem;
	}
	.cs-input {
		flex: 1 1 auto;
		min-width: 0;
		width: 0;
		height: 100%;
		padding: 0;
		font: inherit;
		font-size: 0.95rem;
		color: var(--ink);
		background: none;
		border: 0;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.18s ease;
	}
	.cs.open .cs-input {
		padding: 0 0.85rem 0 0.15rem;
		opacity: 1;
		pointer-events: auto;
	}
	.cs-input:focus-visible {
		outline: none; /* the field's own border is the focus affordance */
	}
	/* The results hang under the field, aligned to it. Opaque: it sits over the panel's content. */
	.cs-results {
		position: absolute;
		z-index: 5;
		top: calc(100% + 0.4rem);
		right: 0;
		width: min(20rem, 55vw);
		list-style: none;
		margin: 0;
		padding: 0.3rem;
		background: var(--panel-fill-solid);
		border: 1px solid var(--line);
		border-radius: 10px;
		text-align: left;
	}
	.cs-hit {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		padding: 0.45rem 0.55rem;
		font: inherit;
		text-align: left;
		color: var(--ink);
		background: none;
		border: 0;
		border-radius: 7px;
		cursor: pointer;
	}
	/* One highlight, driven by `active` — the arrow keys and the pointer set the same thing, so the
	   keyboard and the mouse can't disagree about which row is next. */
	.cs-hit.on {
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	.cs-hit-name {
		font-weight: 600;
	}
	.cs-hit-state {
		font-size: 0.85rem;
		color: var(--sub);
	}
	.cs-none {
		position: absolute;
		z-index: 5;
		top: calc(100% + 0.4rem);
		right: 0;
		width: min(20rem, 55vw);
		margin: 0;
		padding: 0.6rem 0.7rem;
		font-size: 0.85rem;
		color: var(--sub);
		background: var(--panel-fill-solid);
		border: 1px solid var(--line);
		border-radius: 10px;
		text-align: left;
	}
</style>
