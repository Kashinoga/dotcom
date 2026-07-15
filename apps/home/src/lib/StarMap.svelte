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
	// YOU are the camera, standing inside the celestial sphere: the view looks out from the
	// centre, the way the sky actually looks. Drag turns your head (azimuth and altitude),
	// the wheel narrows or widens your field of view, and the bright horizon line is the
	// thing you orient by — look below it and the sphere keeps going, ghosted, through the
	// earth to the nadir directly beneath your feet.

	import SplitFlap from '$lib/SplitFlap.svelte';
	import { ARROW_LEFT_SVG, MAXIMIZE_SVG, MINIMIZE_SVG, PIN_SVG } from '$lib/icons';

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
	//
	// The control is Weather's morph (see CitySearch): one element, two shapes — a pin
	// DISC that grows sideways into the field, and shrinks back when it closes. The pin,
	// not the magnifying glass: this field sets WHERE.
	let searchOpen = $state(false);
	let inputEl = $state<HTMLInputElement | undefined>(undefined);
	let searchEl = $state<HTMLElement | undefined>(undefined);
	// Opening focuses the field — a search you have to click into isn't open, it's just
	// visible. Closing clears it, so it never reopens holding stale results.
	$effect(() => {
		if (searchOpen) {
			inputEl?.focus();
		} else {
			query = '';
			hits = [];
		}
	});
	// Clicking away closes it — but not a click INSIDE it, which would shut the thing
	// mid-search (CitySearch's same guard).
	function onSearchFocusOut(e: FocusEvent) {
		const next = e.relatedTarget as Node | null;
		if (next && searchEl?.contains(next)) return;
		searchOpen = false;
	}
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
		searchOpen = false; // an answer closes the field; the disc waits for the next trip
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation(); // closes the search, never the panel behind it
			searchOpen = false;
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			const c = asCoords(query);
			if (c) {
				setPlace(c);
				searchOpen = false;
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
	// Full-bleed: the canvas fills its box, and the view fills the canvas — a first-person
	// camera at the sphere's centre. Drag turns your head; the wheel changes the field of
	// view.
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

	// The camera: where you're looking (azimuth from north through east, altitude), and
	// how wide your eyes are open. Pitch stops shy of straight up/down — at ±90° "which
	// way is up on screen" stops meaning anything (the same gimbal squeeze every
	// first-person camera ducks).
	const FOV_MIN = 25; // zoomed in
	const FOV_MAX = 120; // zoomed out — stereographic stays honest this wide
	const PITCH_LIM = 89;
	let viewAz = $state(0); // start facing north…
	let viewAlt = $state(50); // …head comfortably tilted back
	let fov = $state(75);
	let dragging = $state(false);
	let lastX = 0;
	let lastY = 0;
	// Degrees per dragged pixel, matched to what's on screen so a drag feels like grabbing
	// the sky: the visible field divided by the visible pixels.
	const degPerPx = () => fov / Math.max(1, Math.min(vw, vh));
	function onPointerDown(e: PointerEvent) {
		dragging = true;
		lastX = e.clientX;
		lastY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const k = degPerPx();
		// Dragging moves the SKY with the pointer: pull it right and you turn to face what
		// was on your left; pull it down and your gaze climbs.
		viewAz = (((viewAz - (e.clientX - lastX) * k) % 360) + 360) % 360;
		viewAlt = Math.max(-PITCH_LIM, Math.min(PITCH_LIM, viewAlt + (e.clientY - lastY) * k));
		lastX = e.clientX;
		lastY = e.clientY;
	}
	function onPointerUp() {
		dragging = false;
	}
	function onWheel(e: WheelEvent) {
		e.preventDefault(); // the wheel zooms the sky, never scrolls the panel under it
		const factor = e.deltaY < 0 ? 1 / 1.12 : 1.12;
		fov = Math.max(FOV_MIN, Math.min(FOV_MAX, fov * factor));
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

		// ── The camera ── You stand at the sphere's centre. World frame is (North, East,
		// Up); the camera basis comes from where you're looking, with no roll — "up on
		// screen" always leans toward the zenith. The projection is STEREOGRAPHIC about
		// the view direction: like a perspective lens but honest out to very wide fields,
		// so FOV_MAX doesn't smear the corners the way a straight gnomonic would.
		const cx = vw / 2;
		const cy = vh / 2;
		const a0 = viewAlt * RAD;
		const z0 = viewAz * RAD;
		const F = [Math.cos(a0) * Math.cos(z0), Math.cos(a0) * Math.sin(z0), Math.sin(a0)]; // forward
		// right = Up × F, normalised (never degenerate: pitch is clamped shy of ±90°).
		const rl = Math.hypot(F[1], F[0]);
		const Rt = [-F[1] / rl, F[0] / rl, 0];
		// camera-up completes the frame: U = F × right.
		const Up = [
			F[1] * Rt[2] - F[2] * Rt[1],
			F[2] * Rt[0] - F[0] * Rt[2],
			F[0] * Rt[1] - F[1] * Rt[0]
		];
		// Screen scale: half the box spans half the field of view.
		const S = Math.min(vw, vh) / 2 / (2 * Math.tan((fov / 4) * RAD));
		// Project a sky direction. Returns null when it's too far behind you to draw
		// (stereographic sends the antipode to infinity — cut well before that).
		const project = (alt: number, az: number): [number, number] | null => {
			const a = alt * RAD;
			const z = az * RAD;
			const P = [Math.cos(a) * Math.cos(z), Math.cos(a) * Math.sin(z), Math.sin(a)];
			const zc = P[0] * F[0] + P[1] * F[1] + P[2] * F[2];
			if (zc < -0.75) return null;
			const k = (2 * S) / (1 + zc);
			const xc = P[0] * Rt[0] + P[1] * Rt[1] + P[2] * Rt[2];
			const yc = P[0] * Up[0] + P[1] * Up[1] + P[2] * Up[2];
			return [cx + k * xc, cy - k * yc];
		};
		const onScreen = (p: [number, number]) =>
			p[0] > -80 && p[0] < vw + 80 && p[1] > -80 && p[1] < vh + 80;

		// The night, floor to ceiling. Always night, whatever the site theme: it is a
		// picture of the night sky, the way the Weather panel's photo is a picture. The
		// wash leans with your gaze — brighter toward the zenith end of the view.
		const g = ctx.createLinearGradient(0, 0, 0, vh);
		const upness = viewAlt / 90; // 1 looking straight up, −1 straight down
		g.addColorStop(0, upness >= 0 ? '#111830' : '#0a0f1f');
		g.addColorStop(1, upness >= 0 ? '#070b16' : '#04070f');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, vw, vh);

		// A polyline along a constant-altitude circle, projected — the horizon and the
		// altitude ladder. Sampled finely enough that the curve is smooth at any FOV;
		// broken wherever a stretch leaves the projection.
		const altRing = (alt: number) => {
			ctx.beginPath();
			let pen = false;
			for (let az = 0; az <= 360; az += 2) {
				const p = project(alt, az);
				if (!p || !onScreen(p)) {
					pen = false;
					continue;
				}
				if (pen) ctx.lineTo(p[0], p[1]);
				else ctx.moveTo(p[0], p[1]);
				pen = true;
			}
			ctx.stroke();
		};

		// The altitude ladder, above the horizon and below it.
		ctx.lineWidth = 1;
		for (const alt of [60, 30, -30, -60]) {
			ctx.strokeStyle = alt > 0 ? 'rgba(150,170,220,0.12)' : 'rgba(150,170,220,0.06)';
			altRing(alt);
		}
		// Zenith and nadir, so straight-up and straight-down have a landmark.
		for (const [alt, style] of [
			[90, 'rgba(150,170,220,0.4)'],
			[-90, 'rgba(150,170,220,0.2)']
		] as const) {
			const p = project(alt, 0);
			if (p && onScreen(p)) {
				ctx.fillStyle = style;
				ctx.beginPath();
				ctx.arc(p[0], p[1], 2, 0, Math.PI * 2);
				ctx.fill();
			}
		}

		// Constellation figures — whichever legs are in view, above the horizon at full
		// presence, below it ghosted (judged at the leg's midpoint; at leg lengths a hard
		// split is invisible).
		const above = new Path2D();
		const under = new Path2D();
		const maxLeg = Math.min(vw, vh) * 1.5; // a leg past the seam projects absurdly long
		for (const f of lines) {
			for (const seg of f.geometry.coordinates) {
				for (let i = 1; i < seg.length; i++) {
					const [a1, z1] = altAz(seg[i - 1][0], seg[i - 1][1], lat, lst);
					const [a2, z2] = altAz(seg[i][0], seg[i][1], lat, lst);
					const p1 = project(a1, z1);
					const p2 = project(a2, z2);
					if (!p1 || !p2 || (!onScreen(p1) && !onScreen(p2))) continue;
					if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) > maxLeg) continue;
					const path = (a1 + a2) / 2 >= 0 ? above : under;
					path.moveTo(p1[0], p1[1]);
					path.lineTo(p2[0], p2[1]);
				}
			}
		}
		ctx.lineWidth = 1;
		ctx.strokeStyle = 'rgba(140,165,235,0.35)';
		ctx.stroke(above);
		ctx.strokeStyle = 'rgba(140,165,235,0.13)';
		ctx.stroke(under);

		// The stars, brightest largest. Size carries magnitude; the tint carries B−V; the
		// scale follows the zoom (narrowing your view genuinely enlarges the sky) but is
		// capped: zoomed right in, a star should read as a bright point, not a golf ball.
		// Below the horizon they ghost — visible enough to chase, dim enough that up
		// stays up. `visibleStars` still counts what's genuinely risen, view or no view.
		let count = 0;
		const scale = Math.min(2.2, Math.max(0.7, S / 420));
		for (const s of stars) {
			const [ra, dec] = s.geometry.coordinates;
			const [alt, az] = altAz(ra, dec, lat, lst);
			if (alt >= -0.5) count++;
			const p = project(alt, az);
			if (!p || !onScreen(p)) continue;
			const r = Math.max(0.6, 2.9 - 0.46 * s.properties.mag) * scale;
			ctx.beginPath();
			ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
			ctx.fillStyle = starTint(s.properties.bv);
			const a = Math.max(0.35, Math.min(1, 1.15 - s.properties.mag * 0.13));
			ctx.globalAlpha = alt >= 0 ? a : a * 0.3;
			ctx.fill();
		}
		ctx.globalAlpha = 1;

		// Constellation names, above the horizon and (ghosted) below it. The band within
		// ±8° of the horizon stays clear — a name straddling the bright line reads as
		// neither up nor down. Rank sizes them the way the dataset intends.
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		for (const f of names) {
			const [ra, dec] = f.geometry.coordinates;
			const [alt, az] = altAz(ra, dec, lat, lst);
			if (alt > -8 && alt < 8) continue;
			const p = project(alt, az);
			if (!p || !onScreen(p)) continue;
			ctx.fillStyle = alt >= 0 ? 'rgba(190,205,245,0.5)' : 'rgba(190,205,245,0.18)';
			const rank = +f.properties.rank || 3;
			const px = (rank === 1 ? 13 : rank === 2 ? 11 : 9.5) * Math.max(scale, 0.85);
			ctx.font = `600 ${px}px Jost, system-ui, sans-serif`;
			ctx.fillText(f.properties.name, p[0], p[1]);
		}

		// The horizon — the line you orient by, drawn last and brightest. Everything above
		// it is up; everything below is through the earth. The cardinals stand ON it.
		ctx.strokeStyle = 'rgba(150,170,220,0.45)';
		ctx.lineWidth = 1.5;
		altRing(0);
		ctx.textAlign = 'center';
		ctx.textBaseline = 'bottom';
		ctx.font = `700 ${Math.max(12, Math.min(20, 13 * scale))}px Jost, system-ui, sans-serif`;
		for (const [label, az] of [
			['N', 0],
			['E', 90],
			['S', 180],
			['W', 270]
		] as const) {
			const p = project(2, az); // a step above the line, standing on it
			if (!p || !onScreen(p)) continue;
			ctx.fillStyle = label === 'N' ? accent : 'rgba(150,170,220,0.8)';
			ctx.fillText(label, p[0], p[1]);
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
	<!-- Weather's morph, worn here: closed it's a 32px pin disc; open it's the field, grown
	     sideways from the same spot (see CitySearch for the two-shapes-one-element notes). -->
	<div class="sm-cs" class:open={searchOpen} bind:this={searchEl} onfocusout={onSearchFocusOut}>
		<button
			type="button"
			class="sm-cs-icon"
			aria-label={searchOpen ? 'Close location search' : 'Set location'}
			title={searchOpen ? 'Close' : 'Set location'}
			aria-expanded={searchOpen}
			onclick={() => (searchOpen = !searchOpen)}
		>
			{@html PIN_SVG}
		</button>
		<input
			bind:this={inputEl}
			type="search"
			class="sm-cs-input"
			placeholder="City, or lat, lon"
			autocomplete="off"
			spellcheck="false"
			role="combobox"
			aria-expanded={hits.length > 0}
			aria-controls="sm-cs-results"
			aria-label="Set location: a city name, or latitude, longitude"
			tabindex={searchOpen ? 0 : -1}
			value={query}
			oninput={(e) => onQuery(e.currentTarget.value)}
			onkeydown={onKey}
		/>
		{#if searchOpen && hits.length}
			<ul class="sm-hits" id="sm-cs-results" role="listbox">
				{#each hits as h, i (h.id)}
					<li>
						<!-- pointerdown swallowed so the input never blurs — CitySearch's Safari/
						     Firefox lesson: a blur here unmounts the list before its click lands. -->
						<button
							type="button"
							role="option"
							aria-selected={i === active}
							class:active={i === active}
							onpointerdown={(e) => e.preventDefault()}
							onclick={() => choose(h)}
							onmouseenter={() => (active = i)}
						>
							{h.name}<span class="sm-hit-state">{h.state}</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else if searchOpen && searching}
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
			aria-label="Standing under the sky at {place.name} right now: {visibleStars} naked-eye stars above the horizon. Drag to look around — below the bright horizon line lies the sky beneath your feet — and scroll to zoom."
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
		/* Centred, not baseline: the location control is a DISC now, and a disc's synthesized
		   baseline (its bottom edge) would ride it high against the place line. */
		align-items: center;
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
	/* One element, two shapes — CitySearch's exact morph, restated locally (the page's
	   bubble rules dress `.cs`, and can't know this component's classes). Closed it's a
	   32px pin disc wearing the family face; open it's the field of the same height, the
	   pin staying put as the anchor the width grows away from. */
	.sm-cs {
		position: relative;
		display: flex;
		align-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 999px;
		background: var(--aero-face);
		color: var(--ink);
		border: 1px solid transparent;
		overflow: visible;
		transition:
			width 0.24s cubic-bezier(0.4, 0, 0.2, 1),
			background 0.2s ease,
			color 0.2s ease,
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}
	.sm-cs.open {
		width: min(20rem, 55vw);
		background: none;
		color: var(--ink);
		border-color: var(--line-strong);
	}
	.sm-cs:not(.open):hover {
		background: color-mix(in srgb, var(--ink) 12%, transparent);
	}
	/* Bubble: the disc carries the family gloss; OPEN, the field joins the family too — the
	   ink-mix face and 1px line-edge in place of the drawn outline (the page gives `.cs`
	   these same clothes; Flat keeps the plain looks above). */
	:global(html[data-ui='bubble']) .sm-cs:not(.open) {
		box-shadow: var(--aero-gloss), var(--aero-drop);
		will-change: transform;
	}
	:global(html[data-ui='bubble']) .sm-cs.open {
		background: var(--aero-face);
		border-color: var(--line-edge);
		box-shadow: var(--aero-gloss), var(--aero-drop);
	}
	.sm-cs-icon {
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
	.sm-cs-icon :global(svg) {
		display: block;
		width: 1.05rem;
		height: 1.05rem;
	}
	.sm-cs-input {
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
	.sm-cs.open .sm-cs-input {
		padding: 0 0.85rem 0 0.15rem;
		opacity: 1;
		pointer-events: auto;
	}
	.sm-cs-input:focus-visible {
		outline: none; /* the field's own border is the focus affordance */
	}
	.sm-cs-input::placeholder {
		color: var(--sub);
	}
	/* The results hang under the field, aligned to its right edge (the disc end). */
	.sm-hits {
		position: absolute;
		z-index: 5;
		top: calc(100% + 0.4rem);
		right: 0;
		width: min(20rem, 55vw);
		margin: 0;
		padding: 0.3rem;
		list-style: none;
		text-align: left;
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
		z-index: 5;
		top: calc(100% + 0.4rem);
		right: 0;
		margin: 0;
		font-size: 0.85rem;
		color: var(--sub);
		white-space: nowrap;
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
