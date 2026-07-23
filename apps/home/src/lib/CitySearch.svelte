<script lang="ts">
	import { SEARCH_SVG, PLUS_SVG } from '$lib/icons';
	import { weather, choose, openSearch, type Place } from '$lib/weather-state.svelte';

	// addHere: worn in Weather's docs-mode tab row, where this control IS the add-city key —
	// closed it shows the + and opening it points the search at ADDING (openSearch('add')),
	// not swapping. One always-mounted control morphing key ⇄ field (the Emoji superbar
	// lesson): the old arrangement swapped a separate + button for a freshly-mounted field,
	// and no choreography could hide the exchange — something always jumped at the seam.
	let { addHere = false }: { addHere?: boolean } = $props();

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
		if (weather.searchOpen) {
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
			weather.searchOpen = false;
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
		weather.searchOpen = false;
	}
</script>

<div class="cs" class:open={weather.searchOpen} bind:this={rootEl} onfocusout={onFocusOut}>
	<button
		type="button"
		class="cs-icon"
		aria-label={weather.searchOpen
			? 'Close search'
			: addHere
				? 'Add another city'
				: 'Search a city'}
		title={weather.searchOpen ? 'Close' : addHere ? 'Add another city' : 'Search a city'}
		aria-expanded={weather.searchOpen}
		onclick={() => {
			if (weather.searchOpen) weather.searchOpen = false;
			else if (addHere) openSearch('add');
			else weather.searchOpen = true;
		}}
	>
		{@html !weather.searchOpen && addHere ? PLUS_SVG : SEARCH_SVG}
	</button>
	<input
		bind:this={inputEl}
		type="search"
		class="cs-input"
		placeholder={weather.searchMode === 'add' ? 'Add a US city…' : 'Search a US city…'}
		autocomplete="off"
		spellcheck="false"
		role="combobox"
		aria-expanded={hits.length > 0}
		aria-controls="cs-results"
		aria-label={weather.searchMode === 'add' ? 'Add a US city' : 'Search a US city'}
		tabindex={weather.searchOpen ? 0 : -1}
		value={query}
		oninput={(e) => onQuery(e.currentTarget.value)}
		onkeydown={onKey}
	/>

	{#if weather.searchOpen && hits.length}
		<ul class="cs-results" id="cs-results" role="listbox">
			{#each hits as h, i}
				<li>
					<!-- pointerdown is swallowed so the input never blurs: Safari and Firefox on macOS
					     don't focus a button on click, so focusout's relatedTarget is null and the
					     click-away guard (onFocusOut) can't tell this press from one outside — the list
					     unmounted before its own click could land. Keeping focus in the field means
					     focusout never fires, and the click goes through. (Chrome focuses the button,
					     which is why the relatedTarget check alone looked sufficient.) -->
					<button
						type="button"
						class="cs-hit"
						class:on={i === active}
						role="option"
						aria-selected={i === active}
						onpointerdown={(e) => e.preventDefault()}
						onclick={() => choose(h)}
						onmouseenter={() => (active = i)}
					>
						<span class="cs-hit-name">{h.name}</span>
						<span class="cs-hit-state">{h.state}</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else if weather.searchOpen && query.trim().length >= 2 && !searching}
		<p class="cs-none">
			No US city by that name — the National Weather Service only knows the United States.
		</p>
	{/if}
</div>

<style>
	/* One element, two shapes. Closed it's a 42px disc, matching every other panel control; open it
	   is a field of the same height, grown leftward from where the disc was (the row lays it out from
	   the right, so widening pushes its own left edge out and the icon never moves). */
	.cs {
		position: relative;
		display: flex;
		align-items: center;
		flex: none;
		width: 42px;
		height: 42px;
		border-radius: 999px;
		/* The family pill, worn closed (the glyph is a plain icon, so the face is safe). */
		background: var(--aero-face);
		color: var(--ink);
		border: 1px solid transparent;
		overflow: visible;
		/* The morph SPRINGS: the field grows on the app's one overshoot curve (puhig's
		   --spring), landing a touch past its width and settling back — and transform rides
		   the button spring so the closed disc pops and squashes like its .icon-btn kin
		   (it can't join the universal lists in +page: their :not(.open) state would drop
		   this width transition on close, snapping the field shut). */
		transition:
			width 0.38s var(--spring),
			transform 0.3s var(--btn-spring),
			background 0.2s ease,
			color 0.2s ease,
			border-color 0.2s ease;
		/* Pinned to a compositor layer like the universal button family (+page), so the
		   hover pop's promotion doesn't re-rasterize the disc mid-interaction. */
		will-change: transform;
	}
	/* The closed disc's pop and squash — the universal button amounts, stated locally
	   (see the transition note above). Hover/press on the inner icon button reaches the
	   disc: :hover and :active both match ancestors of the target. */
	@media (prefers-reduced-motion: no-preference) {
		.cs:not(.open):hover {
			transform: scale(var(--btn-hover-scale));
		}
		.cs:not(.open):active {
			transform: scale(var(--btn-press-scale));
			transition-duration: 0.1s;
		}
	}
	.cs.open {
		width: min(20rem, 55vw);
		background: none;
		color: var(--ink);
		border-color: var(--line-strong);
	}
	.cs:not(.open):hover {
		background: color-mix(in srgb, var(--ink) 12%, transparent);
	}
	/* The icon is the button while closed, and the field's ornament (still clickable, to close) once
	   open. It never moves: it's the anchor the width grows away from. */
	.cs-icon {
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
	.cs-icon :global(svg) {
		display: block;
		width: 1.35rem;
		height: 1.35rem;
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
	/* ── Pixelite: the frosted pill becomes a plastic key / keyed field ─────────────────
	   StarMap's .sm-cs treatment, restated here (scoped styles can't be shared): the closed
	   disc is a plastic key — white/50 face, ink rule, raised bevel, 4px corners, cobalt on
	   hover with the bevel sinking on press — and the grown field keeps the key's face under
	   a cobalt rule, the Emoji Viewer's field material (.ev-search-field). Only the material
	   and voice change; the one-element morph is untouched. */
	:global(html[data-look='pixelite']) .cs {
		/* 28px: the manual's one control line (pixelite.css .icon-btn note) — closed it's the
		   28px key, open the field keeps the same height. The icon and glyph scale with it. */
		width: 28px;
		height: 28px;
		background: var(--pixel-key-face);
		border: 1px solid var(--pixel-key-border);
		border-radius: 4px;
		box-shadow: var(--pixel-bevel);
		/* The width morphs on the manual's minor bounce (--pixel-pop, pixelite.css): a small
		   landing pop both opening and closing — a whisper of the aero spring, not its
		   overshoot. The press squash keeps its curve; pixelite's tokens still the hover pop. */
		transition:
			width 0.24s var(--pixel-pop, ease),
			transform 0.3s var(--btn-spring),
			background 0.2s ease,
			color 0.2s ease,
			border-color 0.15s ease;
	}
	:global(html[data-look='pixelite']) .cs:not(.open):hover {
		color: var(--orange);
		border-color: var(--orange);
		background: var(--pixel-key-face);
	}
	:global(html[data-look='pixelite']) .cs:not(.open):active {
		box-shadow: var(--pixel-bevel-press);
	}
	:global(html[data-look='pixelite']) .cs.open {
		width: min(20rem, 55vw);
		background: var(--pixel-key-face);
		border-color: var(--orange);
	}
	:global(html[data-look='pixelite']) .cs-icon {
		width: 26px;
		height: 26px;
	}
	:global(html[data-look='pixelite']) .cs-icon :global(svg) {
		width: 1.05rem;
		height: 1.05rem;
	}
	/* The field speaks mono — at 16px, so iOS Safari doesn't zoom the page on focus (the
	   Emoji field's same note) — with the manual's uppercase running-head placeholder. */
	:global(html[data-look='pixelite']) .cs-input {
		font-family: var(--font-mono);
		font-size: 16px;
	}
	:global(html[data-look='pixelite']) .cs-input::placeholder {
		color: var(--sub);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.74rem;
	}
	/* The results hang as a printed sheet, not a frosted pop: near-square corners, the
	   field's own ink rule (so sheet and field read as one control), the sheet's drop
	   (--card-shadow: the paper shadow in light, re-tuned on dark stock — the raw
	   --pixel-paper-shadow's inset white line would glow there). */
	:global(html[data-look='pixelite']) .cs-results,
	:global(html[data-look='pixelite']) .cs-none {
		background: var(--panel-fill-solid);
		border: 1px solid var(--pixel-key-border);
		border-radius: 4px;
		box-shadow: var(--card-shadow);
	}
	:global(html[data-look='pixelite']) .cs-hit {
		border-radius: 3px;
	}
	/* The keyboard/pointer highlight takes the selected-key fill (cobalt-100 / deep cobalt). */
	:global(html[data-look='pixelite']) .cs-hit.on {
		background: var(--pixel-key-on);
	}
	/* Worn inside a collapsed super bar (puhig's .csb recipe): the closed disc drops to
	   the bar's 32px with its .icon-btn kin; the grown field keeps its width, just
	   shorter. Media-gated like the recipe itself — csb-on can be true at any width. */
	@media (max-width: 960px) {
		:global(.csb.csb-on) .cs {
			width: 32px;
			height: 32px;
		}
		:global(.csb.csb-on) .cs.open {
			width: min(20rem, 55vw);
		}
		:global(.csb.csb-on) .cs-icon {
			width: 30px;
			height: 30px;
		}
		:global(.csb.csb-on) .cs-icon :global(svg) {
			width: 1.1rem;
			height: 1.1rem;
		}
	}
	@media (prefers-reduced-motion: no-preference) and (max-width: 960px) {
		.cs-icon,
		.cs-icon :global(svg) {
			transition:
				width 0.28s ease,
				height 0.28s ease;
		}
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
