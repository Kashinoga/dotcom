<script lang="ts">
	// The Star Map — the constellations overhead RIGHT NOW, from wherever you are.
	//
	// No API. The sky's geometry doesn't change (at this precision, for centuries), so the
	// constellation figures and the naked-eye stars ship as static GeoJSON (see
	// static/sky/README.md — d3-celestial's data, BSD-3). What "right now, from here" adds
	// is pure math: local sidereal time turns a star's fixed RA/Dec into altitude/azimuth,
	// and the dome below projects altitude/azimuth onto a circle. The only network the app
	// ever touches is the same city geocoder the Weather panel uses, and only while typing.
	//
	// The dome is drawn looking UP: north at the top, EAST ON THE LEFT — mirrored from a
	// ground map, the way every planisphere is printed, because you hold it overhead.

	import SplitFlap from '$lib/SplitFlap.svelte';
	import { ARROW_LEFT_SVG, MAXIMIZE_SVG, MINIMIZE_SVG } from '$lib/icons';

	type Place = { name: string; lat: number; lon: number };

	// The map owns its whole panel interior, like the Traffic board: the page hands it the
	// chrome a child can't reach — title, back, expanded, and the toggle. (No Connections
	// rail here, deliberately: the stage is the app, and a footer under an infinite sky
	// read as clutter. Back and the Apps cards cover the navigation.)
	let {
		accent = '#f06030', // the station's colour — the title dot, and North on the map
		title = '',
		expanded = false,
		onback,
		onToggleExpand
	}: {
		accent?: string;
		title?: string;
		expanded?: boolean;
		onback?: () => void;
		onToggleExpand?: () => void;
	} = $props();

	// Is the viewport wide enough for the beside-the-title super bar? (Expanded fills the
	// viewport, so viewport width ≈ panel width — the Traffic board's same test.)
	let wide = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(min-width: 900px)');
		wide = mq.matches;
		const onMq = (e: MediaQueryListEvent) => (wide = e.matches);
		mq.addEventListener('change', onMq);
		return () => mq.removeEventListener('change', onMq);
	});
	const showBar = $derived(expanded && wide);

	// GeoJSON coordinates are [RA°, Dec°] with RA in −180…180 (d3-celestial's convention).
	type LineFeature = { id: string; geometry: { coordinates: [number, number][][] } };
	type NameFeature = {
		properties: { name: string; rank: string };
		geometry: { coordinates: [number, number] };
	};
	type StarFeature = {
		properties: { mag: number; bv?: string };
		geometry: { coordinates: [number, number] };
	};

	// ─── Location ───────────────────────────────────────────────────────────────
	// One remembered place per browser. Des Moines to start — the Air Traffic board's home
	// field, so the two apps open on the same patch of sky.
	const PLACE_KEY = 'ksh-star-place';
	const DEFAULT_PLACE: Place = { name: 'Des Moines, Iowa', lat: 41.5868, lon: -93.625 };
	let place = $state<Place>(loadPlace());
	function loadPlace(): Place {
		try {
			const raw = localStorage.getItem(PLACE_KEY);
			if (raw) {
				const p = JSON.parse(raw) as Place;
				if (typeof p?.lat === 'number' && typeof p?.lon === 'number' && p.name) return p;
			}
		} catch {
			/* storage unavailable — the default place still draws a sky */
		}
		return DEFAULT_PLACE;
	}
	function setPlace(p: Place) {
		place = p;
		try {
			localStorage.setItem(PLACE_KEY, JSON.stringify(p));
		} catch {
			/* fine — it just won't be remembered */
		}
	}

	// ─── The one location field ─────────────────────────────────────────────────
	// A single input takes EITHER a city name OR "lat, lon". Typed coordinates are a
	// complete answer on their own — no list to pick from — so they apply on Enter;
	// anything else debounces into the same /api/places geocoder Weather searches with.
	let query = $state('');
	let hits = $state<(Place & { id: string; state: string })[]>([]);
	let searching = $state(false);
	let active = $state(0);
	let timer = 0;
	let seq = 0; // a slow response must not overwrite a newer query's results
	const COORD_RE = /^\s*([-+]?\d{1,2}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)\s*$/;
	const asCoords = (v: string): Place | null => {
		const m = COORD_RE.exec(v);
		if (!m) return null;
		const lat = +m[1];
		const lon = +m[2];
		if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
		const fmt = (n: number, pos: string, neg: string) =>
			`${Math.abs(n).toFixed(2)}°${n < 0 ? neg : pos}`;
		return { name: `${fmt(lat, 'N', 'S')} ${fmt(lon, 'E', 'W')}`, lat, lon };
	};

	function onQuery(v: string) {
		query = v;
		clearTimeout(timer);
		hits = [];
		if (asCoords(v) || v.trim().length < 2) return;
		timer = window.setTimeout(() => search(v), 250);
	}
	async function search(v: string) {
		const mine = ++seq;
		searching = true;
		try {
			const r = await fetch(`/api/places?q=${encodeURIComponent(v.trim())}`);
			const data = (await r.json()) as { places?: (Place & { id: string; state: string })[] };
			if (mine !== seq) return;
			hits = data.places ?? [];
			active = 0;
		} catch {
			if (mine === seq) hits = [];
		} finally {
			if (mine === seq) searching = false;
		}
	}
	function choose(p: Place & { state?: string }) {
		setPlace({ name: p.state ? `${p.name}, ${p.state}` : p.name, lat: p.lat, lon: p.lon });
		query = '';
		hits = [];
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation(); // clears the field, never closes the panel behind it
			query = '';
			hits = [];
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			const c = asCoords(query);
			if (c) {
				setPlace(c);
				query = '';
			} else if (hits.length) choose(hits[active]);
			return;
		}
		if (!hits.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = (active + 1) % hits.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active - 1 + hits.length) % hits.length;
		}
	}

	// ─── The sky data ───────────────────────────────────────────────────────────
	let lines = $state<LineFeature[] | null>(null);
	let names = $state<NameFeature[] | null>(null);
	let stars = $state<StarFeature[] | null>(null);
	let loadError = $state(false);
	$effect(() => {
		let gone = false;
		Promise.all(
			['constellations.lines.json', 'constellations.json', 'stars.6.json'].map((f) =>
				fetch(`/sky/${f}`).then((r) => {
					if (!r.ok) throw new Error(String(r.status));
					return r.json();
				})
			)
		)
			.then(([l, n, s]) => {
				if (gone) return;
				lines = l.features;
				names = n.features;
				stars = s.features;
			})
			.catch(() => {
				if (!gone) loadError = true;
			});
		return () => {
			gone = true;
		};
	});

	// ─── The clock ──────────────────────────────────────────────────────────────
	// The sky turns 0.25° a minute — a half-minute tick keeps the dome honest without
	// ever being seen to move.
	let now = $state(Date.now());
	$effect(() => {
		const t = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(t);
	});

	// ─── Astronomy ──────────────────────────────────────────────────────────────
	// Textbook spherical astronomy, small enough to not want a library. Angles in degrees
	// at the boundaries, radians inside.
	const RAD = Math.PI / 180;
	/** Days since the J2000.0 epoch. (Unix ms → Julian days − 2451545.0.) */
	const daysJ2000 = (ms: number) => ms / 86_400_000 - 10957.5;
	/** Local sidereal time, in degrees — which right ascension is on the meridian here, now. */
	function localSiderealDeg(ms: number, lonDeg: number): number {
		const g = 280.46061837 + 360.98564736629 * daysJ2000(ms) + lonDeg;
		return ((g % 360) + 360) % 360;
	}
	/** A fixed [RA°, Dec°] as seen from lat at the given sidereal time: [alt°, az° from N through E]. */
	function altAz(ra: number, dec: number, latDeg: number, lstDeg: number): [number, number] {
		const H = (lstDeg - ra) * RAD;
		const d = dec * RAD;
		const lat = latDeg * RAD;
		const alt = Math.asin(
			Math.sin(d) * Math.sin(lat) + Math.cos(d) * Math.cos(lat) * Math.cos(H)
		);
		// atan2 form measures from SOUTH turning west; +180 re-zeros it to north-through-east.
		const az =
			Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(d) * Math.cos(lat)) / RAD +
			180;
		return [alt / RAD, az];
	}
	/** The sun's approximate RA/Dec (NOAA low-precision — fine for "is it dark yet"). */
	function sunRaDec(ms: number): [number, number] {
		const n = daysJ2000(ms);
		const g = (357.528 + 0.9856003 * n) * RAD;
		const lambda = (280.46 + 0.9856474 * n) * RAD + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
		const eps = (23.439 - 0.0000004 * n) * RAD;
		return [
			Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD,
			Math.asin(Math.sin(eps) * Math.sin(lambda)) / RAD
		];
	}

	// A star's tint from its B−V colour index — blue-white the hot end, amber the cool.
	// Five steps, not a formula: at these sizes a hint is all that reads.
	function starTint(bv: string | undefined): string {
		const v = bv === undefined ? 0.6 : +bv;
		if (v < 0) return '#cdd9ff';
		if (v < 0.4) return '#e6edff';
		if (v < 0.8) return '#ffffff';
		if (v < 1.2) return '#ffefd6';
		return '#ffdfb0';
	}

	// ─── The stage ──────────────────────────────────────────────────────────────
	// Full-bleed: the canvas fills its box, and the sky fills the canvas — no circular
	// letterbox. The view opens ZOOMED IN on the zenith; drag pans across the sky, the
	// wheel zooms, and the horizon ring (with the ground beyond it) is simply somewhere
	// out there to pan to.
	let wrap = $state<HTMLDivElement | undefined>(undefined);
	let canvas = $state<HTMLCanvasElement | undefined>(undefined);
	let vw = $state(0);
	let vh = $state(0);
	$effect(() => {
		if (!wrap) return;
		const ro = new ResizeObserver(([e]) => {
			vw = Math.floor(e.contentRect.width);
			vh = Math.floor(e.contentRect.height);
		});
		ro.observe(wrap);
		return () => ro.disconnect();
	});

	// The view: zoom is the horizon radius as a multiple of the fit-the-box radius, and
	// pan is the zenith's offset from the canvas centre, in CSS pixels.
	const ZOOM_MIN = 0.55; // the whole disc, horizon to horizon, with a little air
	const ZOOM_MAX = 4;
	let zoom = $state(1.6);
	let panX = $state(0);
	let panY = $state(0);
	// Pan can't strand the sky: the zenith stays within one horizon-radius of centre.
	const clampPan = () => {
		const lim = (Math.min(vw, vh) / 2) * zoom;
		panX = Math.max(-lim, Math.min(lim, panX));
		panY = Math.max(-lim, Math.min(lim, panY));
	};
	let dragging = $state(false);
	let lastX = 0;
	let lastY = 0;
	function onPointerDown(e: PointerEvent) {
		dragging = true;
		lastX = e.clientX;
		lastY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		panX += e.clientX - lastX;
		panY += e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;
		clampPan();
	}
	function onPointerUp() {
		dragging = false;
	}
	function onWheel(e: WheelEvent) {
		e.preventDefault(); // the wheel zooms the sky, never scrolls the panel under it
		const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
		const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
		// Pan is proportional to the horizon radius, so scaling it with the zoom keeps
		// whatever is at the canvas centre AT the centre while the sky breathes around it.
		panX *= next / zoom;
		panY *= next / zoom;
		zoom = next;
		clampPan();
	}

	// What the caption reports, computed during the same pass that draws.
	let visibleStars = $state(0);
	let skyState = $state(''); // Daylight / Twilight / Dark

	$effect(() => {
		if (!canvas || !vw || !vh || !lines || !names || !stars) return;
		const ms = now;
		const { lat, lon } = place;
		const lst = localSiderealDeg(ms, lon);

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = vw * dpr;
		canvas.height = vh * dpr;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.scale(dpr, dpr);

		// The zenith sits at the canvas centre plus the pan; the horizon radius is the
		// fit-the-box radius times the zoom.
		const cx = vw / 2 + panX;
		const cy = vh / 2 + panY;
		const R = (Math.min(vw, vh) / 2) * zoom;
		// Looking up: r grows away from the zenith, east lands on the LEFT.
		const project = (alt: number, az: number): [number, number] => {
			const r = ((90 - alt) / 90) * R;
			return [cx - r * Math.sin(az * RAD), cy - r * Math.cos(az * RAD)];
		};

		// The ground first — everything beyond the horizon ring — then the bowl of night
		// over it, clipped to the ring. Always night, whatever the site theme: it is a
		// picture of the night sky, the way the Weather panel's photo is a picture.
		ctx.fillStyle = '#04060c';
		ctx.fillRect(0, 0, vw, vh);
		const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
		g.addColorStop(0, '#131a30');
		g.addColorStop(0.7, '#0b1122');
		g.addColorStop(1, '#060a16');
		ctx.beginPath();
		ctx.arc(cx, cy, R, 0, Math.PI * 2);
		ctx.fillStyle = g;
		ctx.fill();

		// Everything on the sky clips to the horizon.
		ctx.save();
		ctx.beginPath();
		ctx.arc(cx, cy, R, 0, Math.PI * 2);
		ctx.clip();

		// Altitude rings at 30° and 60°, and the zenith — the ladder your eye climbs.
		ctx.strokeStyle = 'rgba(150,170,220,0.12)';
		ctx.lineWidth = 1;
		for (const alt of [30, 60]) {
			ctx.beginPath();
			ctx.arc(cx, cy, ((90 - alt) / 90) * R, 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.fillStyle = 'rgba(150,170,220,0.35)';
		ctx.beginPath();
		ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
		ctx.fill();

		// Constellation figures. Each leg is checked on its own: a leg dives below the
		// horizon (or wraps oddly past the projection's edge), only that leg goes.
		ctx.strokeStyle = 'rgba(140,165,235,0.35)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (const f of lines) {
			for (const seg of f.geometry.coordinates) {
				for (let i = 1; i < seg.length; i++) {
					const [a1, z1] = altAz(seg[i - 1][0], seg[i - 1][1], lat, lst);
					const [a2, z2] = altAz(seg[i][0], seg[i][1], lat, lst);
					if (a1 < -6 && a2 < -6) continue;
					const p1 = project(a1, z1);
					const p2 = project(a2, z2);
					if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) > R * 0.9) continue;
					ctx.moveTo(p1[0], p1[1]);
					ctx.lineTo(p2[0], p2[1]);
				}
			}
		}
		ctx.stroke();

		// The stars, brightest largest. Size carries magnitude; the tint carries B−V.
		// The scale follows the zoom (zooming in genuinely enlarges the sky) but is capped:
		// at deep zoom a star should read as a bright point, not a golf ball.
		let count = 0;
		const scale = Math.min(2.2, R / 320);
		for (const s of stars) {
			const [ra, dec] = s.geometry.coordinates;
			const [alt, az] = altAz(ra, dec, lat, lst);
			if (alt < -0.5) continue;
			count++;
			const [x, y] = project(alt, az);
			const r = Math.max(0.6, 2.9 - 0.46 * s.properties.mag) * scale;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fillStyle = starTint(s.properties.bv);
			ctx.globalAlpha = Math.max(0.35, Math.min(1, 1.15 - s.properties.mag * 0.13));
			ctx.fill();
		}
		ctx.globalAlpha = 1;

		// Constellation names, once their centre is comfortably up. Rank sizes them the way
		// the dataset intends: the household names first.
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = 'rgba(190,205,245,0.5)';
		for (const f of names) {
			const [ra, dec] = f.geometry.coordinates;
			const [alt, az] = altAz(ra, dec, lat, lst);
			if (alt < 12) continue;
			const rank = +f.properties.rank || 3;
			const px = (rank === 1 ? 13 : rank === 2 ? 11 : 9.5) * Math.max(scale, 0.85);
			ctx.font = `600 ${px}px Jost, system-ui, sans-serif`;
			const [x, y] = project(alt, az);
			ctx.fillText(f.properties.name, x, y);
		}
		ctx.restore();

		// The horizon ring and the cardinals — the edge of the sky, wherever you've panned
		// it. The letters sit just INSIDE the ring now (there's no letterbox margin to hold
		// them outside), so they arrive with the horizon when you pan out to it.
		ctx.beginPath();
		ctx.arc(cx, cy, R, 0, Math.PI * 2);
		ctx.strokeStyle = 'rgba(150,170,220,0.45)';
		ctx.lineWidth = 1.5;
		ctx.stroke();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = `700 ${Math.max(12, Math.min(20, 13 * scale))}px Jost, system-ui, sans-serif`;
		for (const [label, az] of [
			['N', 0],
			['E', 90],
			['S', 180],
			['W', 270]
		] as const) {
			const r = R - 16;
			ctx.fillStyle = label === 'N' ? accent : 'rgba(150,170,220,0.8)';
			ctx.fillText(label, cx - r * Math.sin(az * RAD), cy - r * Math.cos(az * RAD));
		}

		visibleStars = count;
		const [sra, sdec] = sunRaDec(ms);
		const sunAlt = altAz(sra, sdec, lat, lst)[0];
		skyState = sunAlt > 0 ? 'Daylight' : sunAlt > -18 ? 'Twilight' : 'Dark';
	});

	const timeText = $derived(
		new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
	);
</script>

{#snippet accentDot()}
	<!-- Decorative: the station's accent as a sign bullet beside the title (the board's same mark). -->
	<span class="accent-dot" aria-hidden="true"></span>
{/snippet}

{#snippet locationField()}
	<div class="sm-search" role="search">
		<input
			class="sm-input"
			type="text"
			placeholder="City, or lat, lon"
			aria-label="Set location: a city name, or latitude, longitude"
			value={query}
			oninput={(e) => onQuery(e.currentTarget.value)}
			onkeydown={onKey}
		/>
		{#if hits.length}
			<ul class="sm-hits" role="listbox">
				{#each hits as h, i (h.id)}
					<li>
						<button
							type="button"
							role="option"
							aria-selected={i === active}
							class:active={i === active}
							onclick={() => choose(h)}
							onmouseenter={() => (active = i)}
						>
							{h.name}<span class="sm-hit-state">{h.state}</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else if searching}
			<p class="sm-searching">Searching…</p>
		{/if}
	</div>
{/snippet}

<div class="sm" class:expanded class:bar-mode={showBar} style:--accent={accent}>
	<header class="sm-head" class:bar={showBar}>
		{#if showBar}
			<!-- Expanded: ONE super bar, the Traffic board's shape. Global app controls cap the
			     far edges — back left, collapse right — framing identity, the location control,
			     and a glanceable summary in between. -->
			{#if onback}
				<button
					type="button"
					class="icon-btn nav-edge"
					onclick={onback}
					aria-label="Back to route map"
					title="Route map"
				>
					{@html ARROW_LEFT_SVG}
				</button>
			{/if}
			<div class="ident">
				<h2 class="dest">{#key title}<SplitFlap text={title} base={160} stagger={45} />{/key}</h2>
				<div class="head-refresh">{@render accentDot()}</div>
			</div>
			<div class="deck">
				<div class="deck-controls">
					<div class="ctl">
						<span class="ctl-label">Location</span>{@render locationField()}
					</div>
				</div>
				<dl class="deck-summary" aria-label="Sky summary">
					<div class="stat stat-place">
						<dt>Over</dt>
						<dd>{place.name}</dd>
					</div>
					<div class="stat">
						<dt>Sky</dt>
						<dd>{skyState || '—'}</dd>
					</div>
					<div class="stat">
						<dt>Stars up</dt>
						<dd>{stars ? visibleStars : '—'}</dd>
					</div>
					<div class="stat">
						<dt>Local</dt>
						<dd>{timeText}</dd>
					</div>
				</dl>
			</div>
			<div class="corner corner-bar">
				{#if onToggleExpand}
					<button
						type="button"
						class="icon-btn nav-edge"
						onclick={onToggleExpand}
						aria-label="Collapse panel"
						title="Collapse"
					>
						{@html MINIMIZE_SVG}
					</button>
				{/if}
			</div>
		{:else}
			{#if onback}
				<button
					type="button"
					class="icon-btn back"
					onclick={onback}
					aria-label="Back to route map"
					title="Route map"
				>
					{@html ARROW_LEFT_SVG}
				</button>
			{/if}
			<div class="title-row">
				<h2 class="dest">{#key title}<SplitFlap text={title} base={160} stagger={45} />{/key}</h2>
				<div class="head-refresh">{@render accentDot()}</div>
			</div>
			<div class="corner corner-compact">
				{#if onToggleExpand}
					<button
						type="button"
						class="icon-btn expand-compact"
						onclick={onToggleExpand}
						aria-label={expanded ? 'Collapse panel' : 'Expand panel to fill'}
						title={expanded ? 'Collapse' : 'Expand to fill'}
					>
						{@html expanded ? MINIMIZE_SVG : MAXIMIZE_SVG}
					</button>
				{/if}
			</div>
		{/if}
	</header>

	{#if !showBar}
		<div class="sm-where">
			<p class="sm-place">
				Skies over <strong>{place.name}</strong>
				<span class="sm-time">· {timeText}</span>
			</p>
			{@render locationField()}
		</div>
	{/if}

	<!-- The sky is the panel's own background: edge to edge, no frame, no footer. In bar
	     mode it sits absolutely under the floating bar; compact, it takes every pixel below
	     the search row. -->
	<div class="sm-stage" bind:this={wrap}>
		{#if loadError}
			<p class="sm-note">The sky data didn’t load. It’s still up there — try a refresh.</p>
		{:else if !stars}
			<p class="sm-note">Charting the sky…</p>
		{/if}
		<canvas
			bind:this={canvas}
			class:dragging
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			onwheel={onWheel}
			aria-label="The night sky over {place.name} right now: {visibleStars} naked-eye stars and the constellations above the horizon, north at the top, east on the left. Drag to pan, scroll to zoom."
		></canvas>
	</div>
</div>

<style>
	/* The map owns the whole panel interior — a header that stays put over a body that
	   scrolls — matched to the Traffic board's arrangement so the two full-viewport apps
	   read as siblings. */
	.sm {
		display: flex;
		flex-direction: column;
		height: 100%;
		position: relative; /* anchors the compact expand toggle */
	}
	.sm-head {
		flex: none;
		/* Same stay-put glass header as every panel: the BODY owns the scroll. */
		padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1.5rem, 4vw, 2.75rem) clamp(0.85rem, 1.5vw, 1.25rem);
	}
	/* Bar mode: the sky IS the panel background, and the bar floats over it — its own
	   frosted strip, so the chrome stays legible over a starfield. The canvas is always
	   night, so the floating chrome wears night ink in BOTH schemes: the tokens are
	   re-declared for this subtree, and every control inside re-reads them. */
	.sm-head.bar {
		position: relative;
		z-index: 1;
		background: rgba(6, 9, 18, 0.55);
		-webkit-backdrop-filter: blur(10px) saturate(1.2);
		backdrop-filter: blur(10px) saturate(1.2);
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.sm.bar-mode {
		--ink: #f2f2ee;
		--sub: #9aa4bd;
		--line-edge: rgba(255, 255, 255, 0.16);
		--line-strong: rgba(255, 255, 255, 0.34);
		--aero-face: rgba(255, 255, 255, 0.07);
	}
	/* Panel chrome, matched to the generic .surface-head (this map just renders it itself). */
	.back {
		align-self: flex-start;
		margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
	}
	.dest {
		margin: 0;
		font-size: clamp(2.25rem, 9vw, 5.5rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--ink);
		white-space: nowrap;
	}
	.title-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem clamp(0.85rem, 2vw, 1.5rem);
		flex-wrap: wrap;
	}
	.title-row .dest {
		flex: none;
	}
	/* The accent bullet beside the title — inline-block so its baseline is its bottom edge
	   (the board's same Firefox-baseline note). */
	.head-refresh {
		display: inline-block;
		font-size: 0;
	}
	.accent-dot {
		display: inline-block;
		width: 30px;
		height: 30px;
		border-radius: 999px;
		background: var(--accent);
	}
	/* Top-right corner: the expand/collapse toggle. */
	.corner {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.corner-compact {
		position: absolute;
		top: calc(clamp(1.5rem, 4vw, 2.5rem) + 2px);
		right: clamp(1.5rem, 4vw, 2.75rem);
		z-index: 3;
	}
	.corner-bar {
		margin-left: auto; /* the deck (flex:1) pushes this to the far-right cap */
	}
	@media (max-width: 960px) {
		.expand-compact {
			display: none; /* phone bottom-sheet is already full width */
		}
	}

	/* ── Expanded: one super bar (the board's shape) ──────────────────────────── */
	.sm-head.bar {
		--bar-inset: clamp(0.7rem, 1.3vw, 1rem);
		display: flex;
		align-items: center;
		gap: var(--bar-inset);
		padding: var(--bar-inset);
	}
	.nav-edge {
		flex: none;
	}
	.ident {
		flex: none;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.bar .dest {
		font-size: clamp(1.15rem, 1.5vw, 1.5rem);
		line-height: 1.05;
	}
	.bar .accent-dot {
		width: 20px;
		height: 20px;
	}
	.bar .head-refresh {
		align-self: center;
	}
	.deck {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem clamp(1.5rem, 3vw, 2.5rem);
		flex-wrap: wrap;
	}
	.deck-controls {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-flow: row wrap;
		align-items: center;
		gap: 0.5rem 1.5rem;
	}
	.ctl {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem 0.6rem;
	}
	.ctl-label {
		flex: none;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.deck-summary {
		flex: none;
		display: flex;
		gap: 1.5rem;
		margin: 0;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.stat dt {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--sub);
		white-space: nowrap;
	}
	.stat dd {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}
	/* The place stat carries a NAME, not a number — cap it so "Truth or Consequences,
	   New Mexico" can't shove the other stats off the bar. */
	.stat-place dd {
		max-width: 14rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* The compact place/search row — it carries the panel's horizontal inset itself now
	   (there's no padded body any more; the stage below runs edge to edge). */
	.sm-where {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		padding: clamp(1rem, 2vw, 1.5rem) clamp(1.5rem, 4vw, 2.75rem) clamp(0.85rem, 1.5vw, 1.25rem);
	}
	.sm-place {
		margin: 0;
		font-size: 1.05rem;
	}
	.sm-place strong {
		font-weight: 700;
	}
	.sm-time {
		color: var(--sub);
	}
	.sm-search {
		position: relative;
		flex: 1 1 14rem;
		max-width: 18rem;
	}
	.sm-input {
		width: 100%;
		padding: 0.45rem 0.85rem;
		font: inherit;
		font-size: 0.9rem;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1px solid var(--line-edge);
		border-radius: 999px;
	}
	.sm-input:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.sm-input::placeholder {
		color: var(--sub);
	}
	/* Bubble: the field joins the family — the ink-mix face with the shared rim-light gloss
	   (restated locally, like Weather's controls: the page's depth list can't know about
	   this component's classes). Flat keeps the plain outline above. */
	:global(html[data-ui='bubble']) .sm-input {
		background: var(--aero-face);
		box-shadow: var(--aero-gloss), var(--aero-drop);
	}
	.sm-hits {
		position: absolute;
		z-index: 5;
		top: calc(100% + 0.35rem);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.3rem;
		list-style: none;
		background: var(--panel-fill-solid, var(--paper));
		border: 1px solid var(--line-edge);
		border-radius: 12px;
		box-shadow:
			0 2px 6px rgba(8, 10, 14, 0.08),
			0 10px 28px rgba(8, 10, 14, 0.14);
	}
	.sm-hits button {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.6rem;
		font: inherit;
		font-size: 0.9rem;
		text-align: left;
		color: var(--ink);
		background: none;
		border: 0;
		border-radius: 8px;
		cursor: pointer;
	}
	.sm-hits button.active {
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	.sm-hit-state {
		color: var(--sub);
		font-size: 0.8rem;
	}
	.sm-searching {
		position: absolute;
		top: calc(100% + 0.35rem);
		margin: 0;
		font-size: 0.85rem;
		color: var(--sub);
	}
	/* Full bleed, truly: no frame, no radius, no footer. Compact, the stage takes every
	   pixel below the search row; in bar mode it fills the whole panel and the bar floats
	   on top of it. */
	.sm-stage {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
	}
	.bar-mode .sm-stage {
		position: absolute;
		inset: 0;
		z-index: 0;
	}
	.sm-stage canvas {
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
		touch-action: none; /* the finger pans the SKY, not the page */
	}
	.sm-stage canvas.dragging {
		cursor: grabbing;
	}
	.sm-note {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		color: var(--sub);
		font-size: 0.95rem;
	}
</style>
