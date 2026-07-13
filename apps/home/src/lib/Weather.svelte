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
		REFRESH_CIRCLE_SVG,
		PLUS_SVG
	} from '$lib/icons';
	import { wx, current, load, show, closeTab, openSearch, setUnit, restore } from '$lib/weather.svelte';

	// Current conditions from the National Weather Service, for any US city.
	//
	// The cities and the reading live in $lib/weather, not here: the SEARCH is drawn in the panel's
	// header (see CitySearch), which is the page's, not this component's — so neither can own the
	// state they share. This component is the body: the tabs, and the reading of whichever is up.
	//
	// US only, and that's the API's boundary rather than a shortcut — NWS covers the United States
	// and its territories, full stop. It's free and keyless in exchange, and the city search is
	// filtered to match, so it never offers a place the app can't then report on.
	const place = $derived(current());
	const now = $derived(wx.readings[place.id] ?? null);
	// Named `phase`, not `state`: a local called `state` shadows the $state rune.
	const phase = $derived(wx.status[place.id] ?? 'loading');

	onMount(restore);

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

	const temp = $derived(wx.unit === 'F' ? now?.tempF : now?.tempC);
	const feels = $derived(wx.unit === 'F' ? now?.feelsF : now?.feelsC);
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
	<!-- The cities, as tabs: a sliding row of names, the showing one in full ink. The + opens the
	     header's search pointed at ADDING a city rather than swapping the one you're looking at. A
	     tab carries an × once there's more than one — the last city stays, since an empty panel would
	     say nothing. -->
	<div class="wx-tabs" role="tablist" aria-label="Cities">
		{#each wx.places as p, i}
			<div class="wx-tab" class:on={i === wx.activeIdx}>
				<button
					type="button"
					class="wx-tab-name"
					role="tab"
					aria-selected={i === wx.activeIdx}
					onclick={() => show(i)}
				>
					{p.name}{#if p.state}<span class="wx-tab-state">{p.state}</span>{/if}
				</button>
				{#if wx.places.length > 1}
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
						{Math.round(temp)}<span class="wx-unit">°{wx.unit}</span>
					</p>
				{:else}
					<p class="wx-temp wx-temp-none">—</p>
				{/if}
				<p class="wx-cond">{now.conditions || 'No conditions reported'}</p>
				{#if feelsDiffers}
					<p class="wx-feels">Feels like {Math.round(feels as number)}°{wx.unit}</p>
				{/if}
			</div>
			<div class="wx-side">
				<div class="segmented wx-unit-toggle" role="radiogroup" aria-label="Units">
					{#each ['F', 'C'] as u}
						<button
							type="button"
							class="seg"
							class:on={wx.unit === u}
							role="radio"
							aria-checked={wx.unit === u}
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
		/* The strip SCROLLS rather than wrapping or clipping. `min-width: 0` is the load-bearing bit:
		   a flex item won't shrink below its content by default, so with four cities the row stayed
		   as wide as its contents and simply overflowed the panel — the fourth was cut off with no
		   way to reach it. Zeroing the floor lets the row take the panel's width and scroll inside
		   it. The scrollbar is hidden; the cut-off edge of the next tab is the affordance. */
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
		padding-bottom: 0.15rem;
		scroll-snap-type: x proximity;
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
		/* Bigger than a label, smaller than the title: WHERE the weather is is the second thing the
		   panel says, after what it is. */
		font-size: 1.35rem;
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
		font-size: 0.95rem;
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
