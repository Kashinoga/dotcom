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
	import { AIRPORTS, type Airport } from '$lib/fields';

	// Current conditions from the National Weather Service, for one of the site's places.
	//
	// The place list is the Traffic board's field list, on purpose: they're the same set of dots on
	// the same map, and a second, parallel list of cities would be a second thing to keep true.
	// Gracemeria is skipped — it's a fictional field (see $lib/fields), and NWS has no station over
	// a place that doesn't exist.
	//
	// Only US places work, and that's the API's boundary, not a shortcut: NWS covers the United
	// States and its territories, full stop. It's free and keyless in exchange.
	let { edit = false }: { edit?: boolean } = $props();

	const PLACES: Airport[] = AIRPORTS.filter((a) => !a.demo);
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

	let place = $state<Airport>(PLACES[0]);
	let now = $state<Now | null>(null);
	let status = $state<'loading' | 'ok' | 'error'>('loading');
	// Fahrenheit first — this is a US-only API reporting on US places, so it's the unit the people
	// reading it use. The toggle is right there, and it's remembered.
	const UNIT_KEY = 'ksh-weather-unit';
	let unit = $state<'F' | 'C'>('F');

	async function load(p: Airport) {
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

	function setPlace(p: Airport) {
		place = p;
		try {
			localStorage.setItem(PLACE_KEY, p.iata);
		} catch {
			/* storage unavailable — the choice still holds for this visit */
		}
		load(p);
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
			const saved = PLACES.find((p) => p.iata === localStorage.getItem(PLACE_KEY));
			if (saved) place = saved;
			const u = localStorage.getItem(UNIT_KEY);
			if (u === 'C' || u === 'F') unit = u;
		} catch {
			/* storage unavailable — the defaults stand */
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
	<!-- The places: the same fields the Traffic board flies to. -->
	<div class="wx-places" role="radiogroup" aria-label="Place">
		{#each PLACES as p, i}
			<button
				type="button"
				class="field"
				class:on={place.iata === p.iata}
				role="radio"
				aria-checked={place.iata === p.iata}
				style="--bn:{i + 1}"
				onclick={() => setPlace(p)}
				title={p.name}
			>
				{p.iata}
			</button>
		{/each}
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

	/* The place pills — the Traffic board's field row, same control, same feel. */
	.wx-places {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.field {
		padding: 0.35rem 0.7rem;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--ink);
		background: none;
		border: 1px solid var(--line-edge);
		border-radius: 999px;
		cursor: pointer;
	}
	.field:hover {
		border-color: var(--line-strong);
	}
	.field.on {
		color: var(--paper);
		background: var(--ink);
		border-color: var(--ink);
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
