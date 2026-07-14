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
	import { wx, current, load, show, closeTab, openSearch, setUnit, restore, reorder } from '$lib/weather-state.svelte';
	import { flip } from 'svelte/animate';

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

	// The strip scrolls, but nothing could scroll it. A mouse wheel scrolls VERTICALLY, the panel
	// swallowed that, and the scrollbar was hidden — so a fourth city sat cut off at the edge with no
	// way to reach it (a trackpad's sideways swipe worked, which is exactly the kind of "works for
	// me" that hides this). Now: the wheel moves it sideways, and the edges fade to show there's
	// more, which is the affordance the scrollbar used to be.
	let tabsEl = $state<HTMLElement | undefined>(undefined);
	let atStart = $state(true);
	let atEnd = $state(true);

	function measureTabs() {
		const el = tabsEl;
		if (!el) return;
		atStart = el.scrollLeft <= 1;
		atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
	}

	function onTabsWheel(e: WheelEvent) {
		const el = tabsEl;
		if (!el || el.scrollWidth <= el.clientWidth) return; // nothing hidden — let the panel scroll
		// A vertical wheel is the only wheel most mice have; treat it as "move along the strip".
		// Whichever axis is larger wins, so a trackpad's sideways swipe still works untouched.
		const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
		if (!delta) return;
		e.preventDefault();
		el.scrollLeft += delta;
	}

	// Drag the strip, too — the other way people move a row like this, and the only one that works
	// on a touchscreen without a fling. The catch is that the strip is made of BUTTONS: a drag that
	// ends on a tab would otherwise also click it and switch cities. So a press only becomes a drag
	// after it has actually moved (4px), and if it did, the click that follows is swallowed.
	let dragFrom = 0; // pointer x where the press started
	let dragScroll = 0; // where the strip was scrolled to then
	let dragging = $state(false);
	let dragged = false; // did this press ever move? (the click-swallowing flag)

	// HOLD a tab to carry it — the third gesture, and the reorder. It can't share the drag's
	// trigger (both are "press and move sideways"), so time disambiguates where distance can't:
	// a press that moves is the scroll, a press that HOLDS (280ms, still) lifts the tab, and
	// from there movement reorders instead of scrolling. Crossing a neighbour's midpoint swaps
	// the tabs (the FLIP on the strip slides them around the carried one); the drop is already
	// saved, because reorder() persists per swap like every other mutation in $lib/weather.
	let lift = $state<number | null>(null); // index of the tab being carried
	let holdTimer = 0;
	let pressX = 0;
	let pressY = 0;
	// The swap slide's length — 0 under reduced motion: the entrance animations gate themselves
	// in CSS, but a JS-driven FLIP can't, so the preference is read here. (window-guarded: the
	// panel SSRs, and the sniff can be static — flipping the OS setting mid-visit is not a case
	// worth re-subscribing for.)
	const flipMs =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
			? 0
			: 220;

	function onTabsDown(e: PointerEvent) {
		const el = tabsEl;
		if (!el || e.button !== 0) return;
		dragged = false;
		pressX = e.clientX;
		pressY = e.clientY;
		// Arm the lift — only on a tab's name (the × keeps its own meaning), and only when
		// there's another tab to trade places with.
		const t = e.target as Element;
		const tab = t.closest?.('.wx-tab');
		if (tab && !t.closest('.wx-tab-x') && wx.places.length > 1) {
			const idx = Array.prototype.indexOf.call(el.querySelectorAll('.wx-tab'), tab);
			const pid = e.pointerId;
			holdTimer = window.setTimeout(() => {
				holdTimer = 0;
				lift = idx;
				dragging = false; // the press is a carry now, never a scroll
				dragged = true; // and the click it would fire on release is swallowed
				try {
					el.setPointerCapture(pid);
				} catch {
					/* pointer already gone — the up handler clears the lift */
				}
			}, 280);
		}
		if (el.scrollWidth <= el.clientWidth) return; // nothing to scroll to
		dragFrom = e.clientX;
		dragScroll = el.scrollLeft;
		dragging = true;
		// NOT captured here, deliberately. Capturing on press redirects the whole gesture to the
		// strip, so the click never reaches the tab underneath and a plain click stopped selecting a
		// city. Capture only once the press has actually become a drag (below).
	}

	function onTabsMove(e: PointerEvent) {
		if (lift !== null) return carry(e);
		// A press that wanders was never a hold — disarm the lift; this move is a scroll (or a
		// finger drifting on its way to a click, which the 4px floor below still forgives).
		if (holdTimer && Math.hypot(e.clientX - pressX, e.clientY - pressY) > 5) {
			clearTimeout(holdTimer);
			holdTimer = 0;
		}
		if (!dragging || !tabsEl) return;
		const dx = e.clientX - dragFrom;
		if (!dragged && Math.abs(dx) < 4) return; // still a click, not yet a drag
		if (!dragged) tabsEl.setPointerCapture(e.pointerId); // now it IS a drag — keep it on the strip
		dragged = true;
		tabsEl.scrollLeft = dragScroll - dx;
	}

	// The carry itself. The pointer is compared against the OTHER tabs' midpoints in the strip's
	// content space — offsetLeft, not getBoundingClientRect, because the FLIP animation is a
	// transform and a transformed rect would report the tab mid-slide: the midpoint chases the
	// swap and the pair oscillates under a stationary pointer. Layout positions hold still.
	function carry(e: PointerEvent) {
		const el = tabsEl;
		if (!el || lift === null) return;
		// Carrying against the faded edge walks the strip along — without this, a tab could
		// never be carried to a slot that's currently scrolled out of reach.
		const r = el.getBoundingClientRect();
		if (e.clientX < r.left + 28) el.scrollLeft -= 10;
		else if (e.clientX > r.right - 28) el.scrollLeft += 10;
		const x = e.clientX - r.left + el.scrollLeft;
		const kids = el.querySelectorAll('.wx-tab') as NodeListOf<HTMLElement>;
		let to = lift;
		for (let j = 0; j < kids.length; j++) {
			if (j === lift) continue;
			const mid = kids[j].offsetLeft + kids[j].offsetWidth / 2;
			if (j < lift && x < mid) to = Math.min(to, j);
			else if (j > lift && x > mid) to = Math.max(to, j);
		}
		if (to !== lift) {
			reorder(lift, to);
			lift = to;
		}
	}

	function onTabsUp(e: PointerEvent) {
		clearTimeout(holdTimer);
		holdTimer = 0;
		if (lift !== null) {
			// The drop. Order is already saved (reorder() persists per swap); just set it down.
			lift = null;
			if (tabsEl?.hasPointerCapture(e.pointerId)) tabsEl.releasePointerCapture(e.pointerId);
			return;
		}
		if (!dragging) return;
		dragging = false;
		if (tabsEl?.hasPointerCapture(e.pointerId)) tabsEl.releasePointerCapture(e.pointerId);
		// A drag that ends on a tab may or may not fire a click, depending on where it started and
		// finished. `dragged` is cleared by the click that follows if there is one, and by the next
		// press if there isn't — so a stray true can never swallow a later, genuine click.
	}

	function onTabsClick(e: MouseEvent) {
		if (!dragged) return;
		// The press moved: it was a drag, so it must not also pick a city.
		e.stopPropagation();
		e.preventDefault();
		dragged = false;
	}

	// Re-measure whenever the cities change (a tab added or closed changes what's hidden).
	$effect(() => {
		wx.places.length;
		requestAnimationFrame(measureTabs);
	});

	// On touch, the strip's touch-action: pan-x hands horizontal panning to the browser — which
	// would cancel the pointer stream mid-carry and drop the tab. Once lifted, the native pan is
	// vetoed by preventDefault on touchmove; that needs a NON-passive listener, and Svelte
	// attaches ontouchmove passively, so this one is wired by hand.
	$effect(() => {
		const el = tabsEl;
		if (!el) return;
		const veto = (e: TouchEvent) => {
			if (lift !== null) e.preventDefault();
		};
		el.addEventListener('touchmove', veto, { passive: false });
		return () => el.removeEventListener('touchmove', veto);
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

	const reduceMotion =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	// When the shown city changes, glide its tab fully into view — picking one half-hidden
	// under the edge fade (or adding a city, which lands at the end of the strip) would
	// otherwise leave the SELECTED name cut off.
	//
	// By scrolling THE STRIP's own scrollLeft, never scrollIntoView: that walks every
	// scrollable ancestor, and overflow:hidden boxes count in Chrome — the panel mounts
	// while it's still translated off-screen (a panel→panel move swaps content mid-slide),
	// so chasing the tab dragged the page's own .stage sideways and the whole homepage
	// wiggled behind the opening panel. The strip can't overshoot anything: it's the only
	// thing that moves. On mount the reveal is a JUMP, not a glide — the entrance cascade
	// owns that moment.
	let glidedIdx = -1;
	$effect(() => {
		const i = wx.activeIdx;
		const strip = tabsEl;
		if (!strip) return;
		const first = glidedIdx === -1;
		if (glidedIdx === i) return;
		glidedIdx = i;
		const el = strip.children[i] as HTMLElement | undefined;
		if (!el) return;
		const pad = 44; // clear the edge fade, so "visible" means readable
		const left = el.offsetLeft - pad;
		const right = el.offsetLeft + el.offsetWidth + pad;
		const target =
			left < strip.scrollLeft
				? left
				: right > strip.scrollLeft + strip.clientWidth
					? right - strip.clientWidth
					: null;
		if (target !== null)
			strip.scrollTo({
				left: Math.max(0, target),
				behavior: first || reduceMotion ? 'auto' : 'smooth'
			});
	});
</script>

<div class="wx">
	<!-- The cities, as tabs: a sliding row of names, the showing one in full ink. The + opens the
	     header's search pointed at ADDING a city rather than swapping the one you're looking at. A
	     tab carries an × once there's more than one — the last city stays, since an empty panel would
	     say nothing. -->
	<div
		class="wx-tabs"
		class:fade-start={!atStart}
		class:fade-end={!atEnd}
		role="tablist"
		aria-label="Cities"
		tabindex="-1"
		class:dragging
		bind:this={tabsEl}
		onwheel={onTabsWheel}
		onscroll={measureTabs}
		onpointerdown={onTabsDown}
		onpointermove={onTabsMove}
		onpointerup={onTabsUp}
		onpointercancel={onTabsUp}
		onclickcapture={onTabsClick}
		oncontextmenu={(e) => {
			// A long-press is the LIFT here, so the browser's long-press menu can't also fire.
			if (lift !== null || holdTimer) e.preventDefault();
		}}
	>
		<!-- Keyed by the place, so a reorder MOVES a tab rather than rewriting every label in
		     place — that's what animate:flip animates. -->
		{#each wx.places as p, i (p.id)}
			<div
				class="wx-tab"
				class:on={i === wx.activeIdx}
				class:carried={lift === i}
				style="--n:{i}"
				animate:flip={{ duration: flipMs }}
			>
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
			style="--n:{wx.places.length}"
			aria-label="Add another city"
			title="Add another city"
			onclick={() => openSearch('add')}>{@html PLUS_SVG}</button
		>
	</div>

	<!-- Keyed on the ACTIVE PLACE, so showing a different city remounts the reading and its
	     entrance rise replays — the new city's numbers land the way the first one's did,
	     instead of the old ones snapping into new values in place. The place object, not
	     activeIdx: the header search REPLACES the city at the same index, and an index key
	     would let that swap slip by unanimated. The tabs stay outside: they're the control
	     you're using, and must not jump under the pointer. -->
	{#key place}
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
	{/key}
</div>

<style>
	.wx {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	/* Entrance — the panel's sections settle in on a stagger, top-to-bottom (`backwards`
	   so nothing stays pinned after). Order tells the story: WHERE first (the tabs, each
	   city a beat behind the last), then WHAT (the reading), then the detail rows. The
	   motion DESCENDS — `settle` below, the global rise mirrored — because the cascade
	   starts at the city selector at the TOP: content entering upward pointed away from
	   the control that drives it. The reading remounts when the shown city changes (the
	   #key in the markup), so its part of the cascade replays and a new city LANDS
	   rather than snapping in. */
	@media (prefers-reduced-motion: no-preference) {
		/* The strip settles as ONE unit; the tabs fade in on beats inside it. Not a
		   translate per tab: the strip is an overflow-x scroller with no vertical slack,
		   so a translating tab clips against its edges mid-overshoot. Opacity carries
		   the stagger without ever leaving the box. */
		.wx-tabs {
			animation: settle 0.45s ease backwards;
		}
		.wx-tab,
		.wx-add {
			animation: tab-in 0.35s ease backwards;
			animation-delay: calc(0.08s + var(--n, 0) * 0.05s);
		}
		.wx-msg,
		.wx-now,
		.wx-stats,
		.wx-source {
			animation: settle 0.45s ease backwards;
		}
		.wx-msg,
		.wx-now {
			animation-delay: 0.1s;
		}
		.wx-stats {
			animation-delay: 0.18s;
		}
		.wx-source {
			animation-delay: 0.26s;
		}
	}
	@keyframes tab-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	/* The global `rise`, mirrored: drops in from a short offset ABOVE, overshoots past
	   its resting spot, and settles — same beats, opposite direction. */
	@keyframes settle {
		0% {
			opacity: 0;
			transform: translateY(-8px);
		}
		60% {
			opacity: 1;
			transform: translateY(2px);
		}
		82% {
			transform: translateY(-0.8px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
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
		/* The edge that still hides a tab fades out — with the scrollbar gone, this is what says
		   "there's more this way". Both edges can fade at once when you're in the middle of the row. */
		--fade: 2.5rem;
		mask-image: none;
		/* Drag to scroll — and don't let the browser turn the drag into a text selection. */
		touch-action: pan-x;
		user-select: none;
		/* The tabs' offsetLeft is measured against the strip (the carry's midpoint math) — and a
		   long-press LIFTS a tab here, so iOS's own long-press callout stays out of it. */
		position: relative;
		-webkit-touch-callout: none;
	}
	.wx-tabs.dragging {
		cursor: grabbing;
	}
	/* The carried tab: held slightly proud of the row, with the row's own hover tint as its
	   face. The scale rides the inner name, not the wrapper — the wrapper's transform belongs
	   to the FLIP that slides tabs around it. */
	.wx-tab.carried {
		cursor: grabbing;
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	.wx-tab.carried .wx-tab-name {
		cursor: grabbing;
		transform: scale(1.06);
		transition: transform 0.15s ease;
	}
	.wx-tabs.fade-end {
		mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent 100%);
	}
	.wx-tabs.fade-start {
		mask-image: linear-gradient(to left, #000 calc(100% - var(--fade)), transparent 100%);
	}
	.wx-tabs.fade-start.fade-end {
		mask-image: linear-gradient(
			to right,
			transparent 0,
			#000 var(--fade),
			#000 calc(100% - var(--fade)),
			transparent 100%
		);
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
		/* Selection moves as a crossfade: the leaving city dims to sub while the arriving
		   one takes the ink, instead of both snapping. (The weight change stays a cut —
		   the loaded faces are static, so there's nothing between 600 and 700 to show.) */
		transition: color 0.25s ease;
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
		/* One gap for the whole row: °F, °C and the refresh disc are three circles of the
		   same size, and they only read as one set if the space between each pair matches
		   (0.6rem here against the toggle's 0.25rem put visible extra air right of °C). */
		gap: 0.25rem;
	}
	.wx-unit-toggle {
		display: flex;
		gap: 0.25rem;
	}
	/* The °F/°C pair wear the refresh disc's exact clothes (the .photo-toggle recipe: the
	   *-circle discs composed in page stock) — an ink disc with the glyph in paper, not an
	   outline pill sitting beside a filled circle. 32px both ways, same as the disc; sized
	   from padding, °F and °C came out different widths. Rest is the disc's 62% ink; hover
	   and the SELECTED unit go full ink — the unit you're on is the one held down.
	   Compound selector so the fill also beats Bubble's generic .seg paper face (0,2,1). */
	.wx-unit-toggle .seg {
		box-sizing: border-box;
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		padding: 0;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--paper);
		background: color-mix(in srgb, var(--ink) 62%, transparent);
		border: 0;
		border-radius: 999px;
		cursor: pointer;
	}
	.wx-unit-toggle .seg:hover,
	.wx-unit-toggle .seg.on {
		background: var(--ink);
		color: var(--paper);
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
