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

	import { fade } from 'svelte/transition';
	import SplitFlap from '$lib/SplitFlap.svelte';
	import { ARROW_LEFT_SVG, PIN_SVG } from '$lib/icons';

	type Place = { name: string; lat: number; lon: number };

	// The map owns its whole panel interior, like the Traffic board: the page hands it the
	// chrome a child can't reach — title and back. It's always full-viewport, like the
	// Presentation Builder: forced expanded on open (applyView), with no collapse toggle.
	// (No Connections rail here, deliberately: the stage is the app, and a footer under an
	// infinite sky read as clutter. Back and the Apps cards cover the navigation.)
	let {
		accent = '#f06030', // the station's colour — the title dot, and North on the map
		title = '',
		onback
	}: {
		accent?: string;
		title?: string;
		onback?: () => void;
	} = $props();

	// Is the viewport wide enough for the beside-the-title super bar? (The panel fills the
	// viewport, so viewport width ≈ panel width — the Traffic board's same test.) Narrower
	// than this, the header falls back to a stacked title-and-search arrangement.
	let wide = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(min-width: 900px)');
		wide = mq.matches;
		const onMq = (e: MediaQueryListEvent) => (wide = e.matches);
		mq.addEventListener('change', onMq);
		return () => mq.removeEventListener('change', onMq);
	});
	const showBar = $derived(wide);

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
	// "41.59°N 93.63°W" — names typed coordinates, and captions the current centre (a city
	// name says roughly where you are; this says exactly).
	const fmtCoords = (lat: number, lon: number) => {
		const fmt = (n: number, pos: string, neg: string) =>
			`${Math.abs(n).toFixed(2)}°${n < 0 ? neg : pos}`;
		return `${fmt(lat, 'N', 'S')} ${fmt(lon, 'E', 'W')}`;
	};
	const asCoords = (v: string): Place | null => {
		const m = COORD_RE.exec(v);
		if (!m) return null;
		const lat = +m[1];
		const lon = +m[2];
		if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
		return { name: fmtCoords(lat, lon), lat, lon };
	};
	const coordText = $derived(fmtCoords(place.lat, place.lon));
	// A place NAMED by its coordinates would caption itself twice.
	const showCoords = $derived(place.name !== coordText);

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
	// Every touch on the sky, by pointer id. One finger turns your head; two pinch the
	// field of view (their midpoint still turns, so a pinch that drifts also pans — the
	// sky stays pinned under the fingers instead of jumping when the second one lands).
	const pointers = new Map<number, { x: number; y: number }>();
	const clampFov = (f: number) => Math.max(FOV_MIN, Math.min(FOV_MAX, f));
	const pinch = () => {
		const [a, b] = [...pointers.values()];
		return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
	};
	// Degrees per dragged pixel, matched to what's on screen so a drag feels like grabbing
	// the sky: the visible field divided by the visible pixels.
	const degPerPx = () => fov / Math.max(1, Math.min(vw, vh));
	// Dragging moves the SKY with the pointer: pull it right and you turn to face what
	// was on your left; pull it down and your gaze climbs.
	function look(dx: number, dy: number) {
		const k = degPerPx();
		viewAz = (((viewAz - dx * k) % 360) + 360) % 360;
		viewAlt = Math.max(-PITCH_LIM, Math.min(PITCH_LIM, viewAlt + dy * k));
	}
	function onPointerDown(e: PointerEvent) {
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		dragging = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		const p = pointers.get(e.pointerId);
		if (!p) return;
		if (pointers.size >= 2) {
			// Pinch: spreading fingers narrows the field (magnifies), closing widens it —
			// measured against where the fingers just were, so it composes with the pan.
			const before = pinch();
			p.x = e.clientX;
			p.y = e.clientY;
			const after = pinch();
			if (before.d > 20 && after.d > 20) fov = clampFov((fov * before.d) / after.d);
			look(after.mx - before.mx, after.my - before.my);
		} else {
			look(e.clientX - p.x, e.clientY - p.y);
			p.x = e.clientX;
			p.y = e.clientY;
		}
	}
	function onPointerUp(e: PointerEvent) {
		pointers.delete(e.pointerId);
		dragging = pointers.size > 0;
	}
	function onWheel(e: WheelEvent) {
		e.preventDefault(); // the wheel zooms the sky, never scrolls the panel under it
		const factor = e.deltaY < 0 ? 1 / 1.12 : 1.12;
		fov = clampFov(fov * factor);
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
		// wash leans with your gaze — brighter toward the zenith end of the view — and it
		// leans CONTINUOUSLY: a hard flip at 0° read as the sky snapping while panning
		// across the horizon.
		const g = ctx.createLinearGradient(0, 0, 0, vh);
		const upness = viewAlt / 90; // 1 looking straight up, −1 straight down
		const t = (upness + 1) / 2; // 0 at the nadir, 1 at the zenith
		const mix = (down: string, up: string) => {
			const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
			const c = (i: number) => Math.round(ch(down, i) + (ch(up, i) - ch(down, i)) * t);
			return `rgb(${c(1)},${c(3)},${c(5)})`;
		};
		g.addColorStop(0, mix('#0a0f1f', '#111830'));
		g.addColorStop(1, mix('#04070f', '#070b16'));
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
	     sideways from the same spot (see CitySearch for the two-shapes-one-element notes).
	     It wears the `cs` class so the page's bubble rules dress it exactly like every other
	     disc — the same resting face and hairline the Back button gets. -->
	<div class="sm-cs cs" class:open={searchOpen} bind:this={searchEl} onfocusout={onSearchFocusOut}>
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

<div class="sm" class:bar-mode={showBar} style:--accent={accent}>
	<header class="sm-head" class:bar={showBar}>
		{#if showBar}
			<!-- Wide: ONE super bar, the Traffic board's shape. Back caps the left edge, framing
			     identity, the location control, and a glanceable summary. -->
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
						<dd>
							{place.name}
							{#if showCoords}<span class="stat-coords">{coordText}</span>{/if}
						</dd>
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
		{:else}
			<!-- Narrow: the location disc rides the Back row's far right — it acts on the whole
			     panel, so it belongs with the panel's own controls (the Weather header's same
			     arrangement). No title line here: the name signs the map itself, bottom right
			     (see .sm-brand on the stage), so the header stays one slim row of controls. -->
			<div class="head-row">
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
				{@render locationField()}
			</div>
		{/if}
	</header>

	<!-- The sky is the panel's own background: edge to edge, no frame, no footer, filling
	     the WHOLE panel in both layouts — the super bar's frosted strip and the narrow
	     layout's transparent disc row both float over it. -->
	<div class="sm-stage" bind:this={wrap}>
		{#if !showBar}
			<!-- Narrow, the app SIGNS its own picture: the name rides the sky's bottom-right
			     corner at caption size — the whole viewport is the map, so the title belongs
			     on it, not on a header line spending vertical room over it. -->
			<h2 class="sm-brand">
				{#key title}<SplitFlap text={title} base={160} stagger={45} />{/key}
				{@render accentDot()}
			</h2>
		{/if}
		{#if !showBar && stars}
			<!-- The caption lives ON the sky, top left — where/when/exactly-where, written in
			     night ink whatever the site theme (the canvas beneath is always night). It
			     doesn't catch the pointer: the whole stage is for dragging. It waits for the
			     sky itself (gated on the data, fading in with the first drawn frame): a
			     caption over "Charting the sky…" would describe a picture that isn't there. -->
			<div class="sm-where" in:fade={{ duration: 400 }}>
				<p class="sm-place">
					Skies over <strong>{place.name}</strong>
					<span class="sm-time">· {timeText}</span>
					{#if showCoords}<span class="sm-coords">{coordText}</span>{/if}
				</p>
			</div>
		{/if}
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
			aria-label="Standing under the sky at {place.name} right now: {visibleStars} naked-eye stars above the horizon. Drag to look around — below the bright horizon line lies the sky beneath your feet — and scroll or pinch to zoom."
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
		position: relative;
		/* The narrow header is one row of 42px discs wearing an EVEN inset all round —
		   shared as tokens so the caption below knows where the header ends. */
		--head-inset: clamp(0.85rem, 2.5vw, 1.25rem);
		--head-h: calc(42px + 2 * var(--head-inset));
	}
	.sm-head {
		flex: none;
		/* TRANSPARENT, floating over the sky (the stage fills the whole panel behind it):
		   the map is the background, and the bar is just its two controls. Even padding —
		   with no title line left, the discs sit in a uniform pocket. The strip itself
		   passes the pointer through, so the sky stays draggable between the discs; the
		   controls opt back in below. */
		position: relative;
		z-index: 1;
		padding: var(--head-inset);
	}
	.sm-head:not(.bar) {
		pointer-events: none;
	}
	.sm-head:not(.bar) .head-row > * {
		pointer-events: auto;
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
	/* The canvas is ALWAYS night and now underlies the chrome in BOTH layouts, so the
	   whole subtree wears night ink in both schemes: the tokens are re-declared here,
	   and every control inside re-reads them. */
	.sm {
		--ink: #f2f2ee;
		--sub: #9aa4bd;
		--line-edge: rgba(255, 255, 255, 0.16);
		--line-strong: rgba(255, 255, 255, 0.34);
		--aero-face: rgba(255, 255, 255, 0.07);
	}
	/* Panel chrome, matched to the generic .surface-head (this map just renders it itself).
	   Back caps the left of the row, the location disc the right. No bottom margin: this
	   is the narrow header's ONLY row now (the title signs the map instead), so the
	   header's own padding is the separation. */
	.head-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.head-row .sm-cs {
		margin-left: auto; /* right-caps the row even when Back is absent */
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
	/* ── Wide: one super bar (the board's shape) ──────────────────────────────── */
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
	/* The exact centre, captioned under the name — for whoever needs WHERE, precisely. */
	.stat-coords {
		display: block;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--sub);
	}

	/* The narrow layout's signature, bottom right ON the sky: the app's name at caption
	   size with its accent bullet — the header gave up its title line for map room. Same
	   night-ink treatment as the caption. */
	.sm-brand {
		position: absolute;
		z-index: 1;
		right: var(--head-inset);
		bottom: var(--head-inset);
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0;
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		color: #f2f2ee;
		pointer-events: none;
		text-shadow: 0 1px 3px rgba(4, 7, 15, 0.85);
	}
	.sm-brand .accent-dot {
		width: 14px;
		height: 14px;
	}

	/* The narrow-viewport caption, laid ON the sky at the stage's top left. It wears fixed
	   night ink, not the theme tokens — the canvas beneath is always night — with a soft
	   drop so it stays legible over stars. pointer-events off: the stage is for dragging,
	   and the caption is a reading, not a control. */
	.sm-where {
		position: absolute;
		z-index: 1;
		/* The stage now starts at the panel's very top, so "top left" means "just under
		   the floating disc row" — its height is shared as --head-h. */
		top: calc(var(--head-h) + 0.3rem);
		left: var(--head-inset);
		pointer-events: none;
		text-shadow: 0 1px 3px rgba(4, 7, 15, 0.85);
	}
	.sm-place {
		margin: 0;
		font-size: 1.05rem;
		color: #f2f2ee;
	}
	.sm-place strong {
		font-weight: 700;
	}
	.sm-time,
	.sm-coords {
		color: #9aa4bd;
	}
	/* The exact centre on its own line under the place, the super bar's same stack. */
	.sm-coords {
		display: block;
		font-size: 0.9rem;
		font-variant-numeric: tabular-nums;
	}
	/* One element, two shapes — CitySearch's exact morph. The MATERIAL comes from the page:
	   the element wears the `cs` class, so the page's bubble rules (gloss, the light-scheme
	   clear-pill face, the open field's family clothes) reach it directly, keeping it
	   pixel-identical to the Back disc beside it. Only the morph mechanics and the Flat
	   resting look live here. Closed it's a 32px pin disc; open it's the field of the same
	   height, the pin staying put as the anchor the width grows away from. */
	.sm-cs {
		position: relative;
		display: flex;
		align-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 999px;
		/* The Back button's exact resting clothes (base.css .icon-btn): the family face
		   under a line-edge hairline — the two discs share a row, so they share a look. */
		background: var(--aero-face);
		color: var(--ink);
		border: 1px solid var(--line-edge);
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
	/* Phone: keep step with .icon-btn's 42px touch target (see puhig base.css) — the pin
	   shares a row with Back, so they share a size. */
	@media (max-width: 960px) {
		.sm-cs {
			width: 42px;
			height: 42px;
		}
		.sm-cs-icon {
			width: 40px;
			height: 40px;
		}
		.sm-cs-icon :global(svg) {
			width: 1.35rem;
			height: 1.35rem;
		}
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
	/* Full bleed, truly: no frame, no radius, no footer. The stage fills the WHOLE panel
	   in both layouts — the sky is the background the chrome floats on (the super bar's
	   frosted strip, the narrow layout's transparent disc row). */
	.sm-stage {
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
