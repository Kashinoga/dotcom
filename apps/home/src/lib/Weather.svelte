<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import {
		SUN_SVG,
		MOON_SVG,
		CLOUD_SUN_SVG,
		MOON_CLOUD_SVG,
		CLOUD_SVG,
		CLOUD_RAIN_SVG,
		CLOUD_BOLT_SVG,
		CLOUD_SNOW_SVG,
		FOG_SVG,
		WIND_SVG,
		REFRESH_CIRCLE_SVG,
		PLUS_SVG
	} from '$lib/icons';
	// Current conditions from the National Weather Service, for any US city.
	//
	// The place used to be one of the Traffic board's ten fields. It's a search box now: type a city,
	// pick it, and the app reads the sky over it. Two upstreams, both proxied (neither sends CORS):
	// /api/places geocodes the name, /api/weather turns the coordinates into a reading.
	//
	// US only, and that's the API's boundary rather than a shortcut — NWS covers the United States
	// and its territories, full stop. It's free and keyless in exchange, and the search is filtered
	// to match, so it never offers a city the app can't then report on.
	// The panel's header owns the search BUTTON (it sits on the Back row, which this component
	// doesn't render), so the open/closed state is bound from the page. Everything else about the
	// search — the box, the results, what a pick does — lives here.
	let { searchOpen = $bindable(false) }: { searchOpen?: boolean } = $props();

	type Place = { id: string; name: string; state: string; lat: number; lon: number };
	// Somewhere to start, so the panel says something on a first visit rather than an empty box.
	const DEFAULT_PLACE: Place = {
		id: 'default',
		name: 'Des Moines',
		state: 'Iowa',
		lat: 41.601,
		lon: -93.609
	};
	const PLACES_KEY = 'ksh-weather-places';
	const UNIT_KEY = 'ksh-weather-unit';

	type Now = {
		place: string;
		station: { id: string; name: string };
		observedAt: string | null;
		conditions: string;
		night: boolean;
		tempC: number | null;
		tempF: number | null;
		feelsC: number | null;
		feelsF: number | null;
		humidity: number | null;
		windMph: number | null;
		windDir: number | null;
	};

	// Cities are TABS: several at once, one showing. Each keeps its own reading, so flicking between
	// them is instant and doesn't re-ask NWS for a sky it already fetched.
	let places = $state<Place[]>([DEFAULT_PLACE]);
	let activeIdx = $state(0);
	let readings = $state<Record<string, Now>>({});
	let status = $state<Record<string, 'loading' | 'ok' | 'error'>>({});

	const place = $derived(places[activeIdx] ?? DEFAULT_PLACE);
	const now = $derived(readings[place.id] ?? null);
	// Named `phase`, not `state`: a local called `state` shadows the $state rune, and every
	// declaration after it stops compiling.
	const phase = $derived(status[place.id] ?? 'loading');

	// Fahrenheit first — a US-only API reporting on US places, so it's the unit the people reading it
	// use. The toggle is right there, and it's remembered.
	let unit = $state<'F' | 'C'>('F');

	// What a pick does: swap the city showing, or open another beside it.
	let searchMode = $state<'replace' | 'add'>('replace');
	let query = $state('');
	let hits = $state<Place[]>([]);
	let searching = $state(false);
	let active = $state(0); // which result the arrow keys are on
	let searchTimer = 0;
	let searchSeq = 0; // guards against a slow response overwriting a newer one
	let inputEl = $state<HTMLInputElement | undefined>(undefined);

	// Opening the search focuses it — a search you have to click into isn't open, it's just visible.
	$effect(() => {
		if (searchOpen) inputEl?.focus();
	});

	function openSearch(mode: 'replace' | 'add') {
		searchMode = mode;
		query = '';
		hits = [];
		searchOpen = true;
	}

	function onQuery(v: string) {
		query = v;
		clearTimeout(searchTimer);
		if (v.trim().length < 2) {
			hits = [];
			return;
		}
		// Debounced: a keystroke is not a search. 250ms is about the gap between typing and pausing.
		searchTimer = window.setTimeout(() => search(v), 250);
	}

	async function search(v: string) {
		const seq = ++searchSeq;
		searching = true;
		try {
			const r = await fetch(`/api/places?q=${encodeURIComponent(v.trim())}`);
			const data = (await r.json()) as { places?: Place[] };
			// A response that isn't the latest is stale — dropping it stops an older, slower query
			// from clobbering what the user has since typed.
			if (seq !== searchSeq) return;
			hits = data.places ?? [];
			active = 0;
		} catch {
			if (seq === searchSeq) hits = [];
		} finally {
			if (seq === searchSeq) searching = false;
		}
	}

	function choose(p: Place) {
		const already = places.findIndex((q) => q.id === p.id);
		if (already >= 0) {
			// It's already a tab — show it rather than opening a second one of the same city.
			activeIdx = already;
		} else if (searchMode === 'add') {
			places = [...places, p];
			activeIdx = places.length - 1;
		} else {
			places = places.map((q, i) => (i === activeIdx ? p : q));
		}
		searchOpen = false;
		query = '';
		hits = [];
		savePlaces();
		load(places[activeIdx]);
	}

	function closeTab(i: number) {
		if (places.length === 1) return; // the last city stays: an empty panel says nothing
		places = places.filter((_, j) => j !== i);
		if (activeIdx >= places.length) activeIdx = places.length - 1;
		else if (i < activeIdx) activeIdx--;
		savePlaces();
		load(places[activeIdx]);
	}

	function savePlaces() {
		try {
			localStorage.setItem(PLACES_KEY, JSON.stringify({ places, activeIdx }));
		} catch {
			/* storage unavailable — the tabs still hold for this visit */
		}
	}

	function onSearchKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			// Swallowed here so it closes the search, not the whole panel.
			e.stopPropagation();
			searchOpen = false;
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

	async function load(p: Place) {
		status = { ...status, [p.id]: readings[p.id] ? 'ok' : 'loading' };
		try {
			const r = await fetch(`/api/weather?lat=${p.lat}&lon=${p.lon}`);
			if (!r.ok) throw new Error(String(r.status));
			readings = { ...readings, [p.id]: (await r.json()) as Now };
			status = { ...status, [p.id]: 'ok' };
		} catch {
			status = { ...status, [p.id]: readings[p.id] ? 'ok' : 'error' };
		}
	}

	function show(i: number) {
		activeIdx = i;
		savePlaces();
		if (!readings[places[i].id]) load(places[i]);
	}

	function setUnit(u: 'F' | 'C') {
		unit = u;
		try {
			localStorage.setItem(UNIT_KEY, u);
		} catch {
			/* storage unavailable */
		}
	}

	onMount(() => {
		try {
			const saved = localStorage.getItem(PLACES_KEY);
			if (saved) {
				const v = JSON.parse(saved) as { places?: Place[]; activeIdx?: number };
				if (Array.isArray(v.places) && v.places.length) {
					places = v.places.filter((p) => typeof p?.lat === 'number');
					activeIdx = Math.min(Math.max(v.activeIdx ?? 0, 0), places.length - 1);
				}
			}
			const u = localStorage.getItem(UNIT_KEY);
			if (u === 'C' || u === 'F') unit = u;
		} catch {
			/* storage unavailable or malformed — the default city stands */
		}
		load(place);
	});

	// NWS reports the sky as prose, not a code — "Mostly Cloudy", "Light Rain", "Thunderstorm". The
	// order here is the priority: precipitation beats cloud cover, because a rainy overcast day is a
	// rainy day. Anything unrecognised falls back to cloud rather than guessing.
	function conditionIcon(text: string, night: boolean): string {
		const t = text.toLowerCase();
		if (/thunder|tstorm|squall/.test(t)) return CLOUD_BOLT_SVG;
		if (/snow|sleet|ice|freezing|wintry/.test(t)) return CLOUD_SNOW_SVG;
		if (/rain|drizzle|shower/.test(t)) return CLOUD_RAIN_SVG;
		if (/fog|mist|haze|smoke/.test(t)) return FOG_SVG;
		if (/wind/.test(t)) return WIND_SVG;
		if (/clear|fair|sunny/.test(t)) return night ? MOON_SVG : SUN_SVG;
		if (/partly|few|scattered/.test(t)) return night ? MOON_CLOUD_SVG : CLOUD_SUN_SVG;
		return CLOUD_SVG; // cloudy, overcast, and anything the API says that this doesn't know
	}

	const temp = $derived(unit === 'F' ? now?.tempF : now?.tempC);
	const feels = $derived(unit === 'F' ? now?.feelsF : now?.feelsC);
	// "Feels like" is worth the line only when it disagrees with the reading — NWS sends a heat index
	// or wind chill whenever either applies, and within a degree it's just the temperature again.
	const feelsDiffers = $derived(
		typeof temp === 'number' && typeof feels === 'number' && Math.abs(feels - temp) >= 1
	);
	const compass = (deg: number) =>
		['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
	const clock = (iso: string) =>
		new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
</script>

<div class="wx">
	<!-- The cities, as tabs: a sliding row of names, the showing one marked. The + opens the same
	     search the header's button does, but pointed at ADDING a city rather than swapping the one
	     you're looking at. A tab carries an × once there's more than one — the last city stays, since
	     an empty panel would say nothing. -->
	<div class="wx-tabs" role="tablist" aria-label="Cities">
		{#each places as p, i}
			<div class="wx-tab" class:on={i === activeIdx}>
				<button
					type="button"
					class="wx-tab-name"
					role="tab"
					aria-selected={i === activeIdx}
					onclick={() => show(i)}
				>
					{p.name}{#if p.state}<span class="wx-tab-state">{p.state}</span>{/if}
				</button>
				{#if places.length > 1}
					<button
						type="button"
						class="wx-tab-x"
						aria-label="Close {p.name}"
						onclick={() => closeTab(i)}>×</button
					>
				{/if}
			</div>
		{/each}
		<button
			type="button"
			class="wx-add"
			aria-label="Add another city"
			title="Add another city"
			onclick={() => openSearch('add')}>{@html PLUS_SVG}</button
		>
	</div>

	<!-- The search, opened from the panel header (or the +). A plain listbox: arrow keys move, Enter
	     picks, Escape closes it — and only it, never the panel. -->
	{#if searchOpen}
		<div class="wx-search" transition:fly={{ y: -6, duration: 160 }}>
			<input
				bind:this={inputEl}
				type="search"
				class="wx-input"
				placeholder={searchMode === 'add' ? 'Add a US city…' : 'Search a US city…'}
				autocomplete="off"
				spellcheck="false"
				role="combobox"
				aria-expanded={hits.length > 0}
				aria-controls="wx-results"
				aria-label={searchMode === 'add' ? 'Add a US city' : 'Search a US city'}
				value={query}
				oninput={(e) => onQuery(e.currentTarget.value)}
				onkeydown={onSearchKey}
			/>
			{#if hits.length}
				<ul class="wx-results" id="wx-results" role="listbox">
					{#each hits as h, i}
						<li>
							<button
								type="button"
								class="wx-hit"
								class:on={i === active}
								role="option"
								aria-selected={i === active}
								onclick={() => choose(h)}
								onmouseenter={() => (active = i)}
							>
								<span class="wx-hit-name">{h.name}</span>
								<span class="wx-hit-state">{h.state}</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else if query.trim().length >= 2 && !searching}
				<p class="wx-none">
					No US city by that name. The weather here is the National Weather Service's, so it only
					knows the United States.
				</p>
			{/if}
		</div>
	{/if}

	{#if phase === 'error'}
		<p class="wx-msg">
			The National Weather Service isn't answering right now. It's a public service with no key
			and no promises — try again in a minute.
		</p>
	{:else if phase === 'loading' && !now}
		<p class="wx-msg">Reading the sky over {place.name}…</p>
	{:else if now}
		<!-- The reading itself: the mark, the number, and what the sky is doing. -->
		<div class="wx-now" class:stale={phase === 'loading'}>
			<span class="wx-mark" aria-hidden="true">
				{@html conditionIcon(now.conditions, now.night)}
			</span>
			<div class="wx-read">
				{#if typeof temp === 'number'}
					<p class="wx-temp">
						{Math.round(temp)}<span class="wx-unit">°{unit}</span>
					</p>
				{:else}
					<p class="wx-temp wx-temp-none">—</p>
				{/if}
				<p class="wx-cond">{now.conditions || 'No conditions reported'}</p>
				{#if feelsDiffers}
					<p class="wx-feels">Feels like {Math.round(feels as number)}°{unit}</p>
				{/if}
			</div>
			<div class="wx-side">
				<div class="segmented wx-unit-toggle" role="radiogroup" aria-label="Units">
					{#each ['F', 'C'] as u}
						<button
							type="button"
							class="seg"
							class:on={unit === u}
							role="radio"
							aria-checked={unit === u}
							onclick={() => setUnit(u as 'F' | 'C')}>°{u}</button
						>
					{/each}
				</div>
				<button
					type="button"
					class="icon-btn"
					onclick={() => load(place)}
					aria-label="Refresh now"
					title="Refresh now">{@html REFRESH_CIRCLE_SVG}</button
				>
			</div>
		</div>

		<!-- The rest of the reading. Each stat is dropped rather than shown empty: plenty of stations
		     report no humidity, and a dash tells you nothing a missing row wouldn't. -->
		<dl class="wx-stats">
			{#if now.humidity !== null}
				<div class="wx-stat">
					<dt>Humidity</dt>
					<dd>{Math.round(now.humidity)}%</dd>
				</div>
			{/if}
			{#if now.windMph !== null}
				<div class="wx-stat">
					<dt>Wind</dt>
					<dd>
						{Math.round(now.windMph)} mph{now.windDir !== null
							? ` ${compass(now.windDir)}`
							: ''}
					</dd>
				</div>
			{/if}
			{#if now.observedAt}
				<div class="wx-stat">
					<dt>Observed</dt>
					<dd>{clock(now.observedAt)}</dd>
				</div>
			{/if}
		</dl>

		<p class="wx-source">
			{now.place || place.name} · {now.station.name || now.station.id} · National Weather Service
		</p>
	{/if}
</div>

<style>
	.wx {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}


	/* The cities, as tabs. A sliding row: more cities than fit just scroll, they don't wrap and push
	   the reading down the panel. Text, not chips — a tab is a name you're reading, not a button
	   you're hunting for. */
	.wx-tabs {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		overflow-x: auto;
		scrollbar-width: none;
		padding-bottom: 0.15rem;
	}
	.wx-tabs::-webkit-scrollbar {
		display: none;
	}
	.wx-tab {
		flex: none;
		display: flex;
		align-items: center;
		border-radius: 8px;
	}
	.wx-tab-name {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		padding: 0.35rem 0.55rem;
		font: inherit;
		font-size: 1.05rem;
		font-weight: 600;
		white-space: nowrap;
		color: var(--sub);
		background: none;
		border: 0;
		border-radius: 8px;
		cursor: pointer;
	}
	.wx-tab-name:hover {
		color: var(--ink);
	}
	/* The city you're looking at: full ink, and the only one carrying weight. */
	.wx-tab.on .wx-tab-name {
		color: var(--ink);
		font-weight: 700;
	}
	.wx-tab-state {
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--sub);
	}
	.wx-tab-x {
		padding: 0 0.35rem 0 0;
		font: inherit;
		font-size: 1rem;
		line-height: 1;
		color: var(--sub);
		background: none;
		border: 0;
		cursor: pointer;
	}
	.wx-tab-x:hover {
		color: var(--ink);
	}
	.wx-add {
		flex: none;
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		margin-left: 0.15rem;
		padding: 0;
		color: var(--sub);
		background: none;
		border: 1px solid var(--line-edge);
		border-radius: 999px;
		cursor: pointer;
	}
	.wx-add:hover {
		color: var(--ink);
		border-color: var(--line-strong);
	}
	.wx-add :global(svg) {
		display: block;
		width: 0.85rem;
		height: 0.85rem;
	}

	/* The search box, and the results that drop out of it. */
	.wx-search {
		position: relative;
	}
	.wx-input {
		width: 100%;
		padding: 0.6rem 0.85rem;
		font: inherit;
		color: var(--ink);
		background: none;
		border: 1px solid var(--line-edge);
		border-radius: 10px;
	}
	.wx-input:hover {
		border-color: var(--line-strong);
	}
	.wx-input:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	/* Over the reading, not shoving it down the panel — the list is transient. Opaque, like every
	   other surface that floats. */
	.wx-results {
		position: absolute;
		z-index: 3;
		top: calc(100% + 0.35rem);
		left: 0;
		right: 0;
		list-style: none;
		margin: 0;
		padding: 0.3rem;
		background: var(--panel-fill-solid);
		border: 1px solid var(--line);
		border-radius: 10px;
	}
	.wx-hit {
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
	.wx-hit.on {
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	.wx-hit-name {
		font-weight: 600;
	}
	.wx-hit-state {
		font-size: 0.85rem;
		color: var(--sub);
	}
	.wx-none {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--sub);
	}

	/* The reading. The number carries it, so it's set at panel-title scale. */
	.wx-now {
		display: flex;
		align-items: center;
		gap: 1.1rem;
		transition: opacity 0.2s ease;
	}
	/* A refresh in flight: dim what's up, don't tear it down. The old reading is still true. */
	.wx-now.stale {
		opacity: 0.55;
	}
	.wx-mark {
		flex: none;
		display: grid;
		place-items: center;
		width: 3.75rem;
		height: 3.75rem;
		color: var(--accent, var(--ink));
	}
	.wx-mark :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
	.wx-read {
		min-width: 0;
	}
	.wx-temp {
		margin: 0;
		font-size: clamp(2.5rem, 7vw, 3.5rem);
		font-weight: 700;
		line-height: 1;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.wx-temp-none {
		color: var(--sub);
	}
	.wx-unit {
		font-size: 0.42em;
		font-weight: 600;
		color: var(--sub);
		margin-left: 0.1em;
	}
	.wx-cond {
		margin: 0.3rem 0 0;
		font-weight: 600;
	}
	.wx-feels {
		margin: 0.1rem 0 0;
		font-size: 0.9rem;
		color: var(--sub);
	}
	.wx-side {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.wx-unit-toggle {
		display: flex;
		gap: 0.25rem;
	}
	.seg {
		padding: 0.3rem 0.55rem;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--ink);
		background: none;
		border: 1px solid var(--line-edge);
		border-radius: 999px;
		cursor: pointer;
	}
	.seg.on {
		color: var(--paper);
		background: var(--ink);
		border-color: var(--ink);
	}

	.wx-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0 2rem;
		margin: 0;
		padding-top: 1.1rem;
		border-top: 1px solid var(--line);
	}
	.wx-stat dt {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.wx-stat dd {
		margin: 0.15rem 0 0;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.wx-msg,
	.wx-source {
		margin: 0;
		font-size: 0.85rem;
		color: var(--sub);
	}
</style>
