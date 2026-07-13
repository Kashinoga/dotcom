<script lang="ts">
	import { onMount } from 'svelte';
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
		REFRESH_CIRCLE_SVG
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
	let { edit = false }: { edit?: boolean } = $props();

	type Place = { id: string; name: string; state: string; lat: number; lon: number };
	// Somewhere to start, so the panel says something on a first visit rather than an empty box.
	const DEFAULT_PLACE: Place = {
		id: 'default',
		name: 'Des Moines',
		state: 'Iowa',
		lat: 41.601,
		lon: -93.609
	};
	const PLACE_KEY = 'ksh-weather-place';

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

	let place = $state<Place>(DEFAULT_PLACE);
	let now = $state<Now | null>(null);
	let status = $state<'loading' | 'ok' | 'error'>('loading');
	// Fahrenheit first — a US-only API reporting on US places, so it's the unit the people reading it
	// use. The toggle is right there, and it's remembered.
	const UNIT_KEY = 'ksh-weather-unit';
	let unit = $state<'F' | 'C'>('F');

	// ── The search ──────────────────────────────────────────────────────────────
	let query = $state('');
	let hits = $state<Place[]>([]);
	let searching = $state(false);
	let open = $state(false); // is the results list showing?
	let active = $state(0); // which result the arrow keys are on
	let searchTimer = 0;
	let searchSeq = 0; // guards against a slow response overwriting a newer one

	function onQuery(v: string) {
		query = v;
		clearTimeout(searchTimer);
		if (v.trim().length < 2) {
			hits = [];
			open = false;
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
			// A response that isn't the latest one is stale — dropping it stops an older, slower query
			// from clobbering what the user has since typed.
			if (seq !== searchSeq) return;
			hits = data.places ?? [];
			active = 0;
			open = true;
		} catch {
			if (seq === searchSeq) hits = [];
		} finally {
			if (seq === searchSeq) searching = false;
		}
	}

	function choose(p: Place) {
		place = p;
		query = '';
		hits = [];
		open = false;
		try {
			localStorage.setItem(PLACE_KEY, JSON.stringify(p));
		} catch {
			/* storage unavailable — the choice still holds for this visit */
		}
		load(p);
	}

	function onSearchKey(e: KeyboardEvent) {
		if (!open || !hits.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = (active + 1) % hits.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active - 1 + hits.length) % hits.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			choose(hits[active]);
		} else if (e.key === 'Escape') {
			// Swallowed here so it closes the list, not the whole panel.
			e.stopPropagation();
			open = false;
		}
	}

	async function load(p: Place) {
		status = 'loading';
		try {
			const r = await fetch(`/api/weather?lat=${p.lat}&lon=${p.lon}`);
			if (!r.ok) throw new Error(String(r.status));
			now = (await r.json()) as Now;
			status = 'ok';
		} catch {
			status = 'error';
		}
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
			const saved = localStorage.getItem(PLACE_KEY);
			if (saved) {
				const p = JSON.parse(saved) as Place;
				if (p && typeof p.lat === 'number' && typeof p.lon === 'number') place = p;
			}
			const u = localStorage.getItem(UNIT_KEY);
			if (u === 'C' || u === 'F') unit = u;
		} catch {
			/* storage unavailable or malformed — the default place stands */
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
	<!-- The place, as a subtitle under the panel's title: the panel says "Weather", this says whose.
	     NWS's own name for the spot once it answers ("Millbrae, CA" for SFO — the station's town,
	     not always the one you typed), and what you picked until then. -->
	<p class="wx-place">{now?.place || [place.name, place.state].filter(Boolean).join(', ')}</p>

	<!-- Search a US city. The list is a plain listbox: arrow keys move, Enter picks, Escape closes
	     it (and only it — the panel stays put). -->
	<div class="wx-search">
		<input
			type="search"
			class="wx-input"
			placeholder="Search a US city…"
			autocomplete="off"
			spellcheck="false"
			role="combobox"
			aria-expanded={open && hits.length > 0}
			aria-controls="wx-results"
			aria-label="Search a US city"
			value={query}
			oninput={(e) => onQuery(e.currentTarget.value)}
			onkeydown={onSearchKey}
			onfocus={() => (open = hits.length > 0)}
		/>
		{#if open && hits.length}
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
		{:else if open && query.trim().length >= 2 && !searching}
			<p class="wx-none">No US city by that name. The weather here is the National Weather
				Service's, so it only knows the United States.</p>
		{/if}
	</div>

	{#if status === 'error'}
		<p class="wx-msg">
			The National Weather Service isn't answering right now. It's a public service with no key
			and no promises — try again in a minute.
		</p>
	{:else if status === 'loading' && !now}
		<p class="wx-msg">Reading the sky over {place.name}…</p>
	{:else if now}
		<!-- The reading itself: the mark, the number, and what the sky is doing. -->
		<div class="wx-now" class:stale={status === 'loading'}>
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

	/* The place, under the panel title — a subtitle, so it's set below the title's scale but above
	   the body's. */
	.wx-place {
		margin: -0.35rem 0 0;
		font-size: clamp(1.25rem, 3vw, 1.6rem);
		font-weight: 700;
		letter-spacing: -0.01em;
		line-height: 1.15;
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
