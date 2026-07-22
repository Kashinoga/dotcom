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
	import { popSpring } from '$lib/pop-spring';
	import SplitFlap from '$lib/SplitFlap.svelte';
	import {
		ARROW_LEFT_SVG,
		CLOSE_SVG,
		EXTERNAL_SVG,
		HOME_SVG,
		MAXIMIZE_SVG,
		MINIMIZE_SVG,
		PIN_SVG
	} from '$lib/icons';

	type Place = { name: string; lat: number; lon: number };

	// The map owns its whole panel interior, like the Traffic board: the page hands it the
	// chrome a child can't reach — title, back, home. It's always full-viewport, like the
	// Presentation Builder: forced expanded on open (applyView), with no collapse toggle.
	// (No Connections rail here, deliberately: the stage is the app, and a footer under an
	// infinite sky read as clutter. The nav caps and the Apps cards cover the navigation.)
	let {
		accent = '#f06030', // the station's colour — the title dot, and North on the map
		title = '',
		onback,
		onhome
	}: {
		accent?: string;
		title?: string;
		onback?: () => void;
		// The super bar's right-end cap, E-ATFC's arrangement: straight to the homepage —
		// the narrow layout keeps Back instead.
		onhome?: () => void;
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

	// ─── The constellations' stories ────────────────────────────────────────────
	// Tap a constellation's NAME and a card tells you about it: Wikipedia's lead image,
	// its opening lines, and a link out to the full article — the site's usual sourcing
	// (freely licensed, credited, fetched responsibly: one summary per tap, cached for
	// the session). The dataset's names are the Latin ones; many are ambiguous titles on
	// Wikipedia (Orion, Leo, Cancer…), so "{name} (constellation)" is asked first and the
	// bare name is the fallback for the unambiguous rest (Boötes, Cassiopeia…).
	type WikiCard = {
		title: string;
		extract: string;
		thumb?: string;
		thumbBig?: string; // the article's original lead image, for the expanded card
		url?: string;
	};
	const WIKI_TITLE: Record<string, string> = {
		// The dataset splits Serpens into its two halves; Wikipedia keeps one article.
		'Serpens Caput': 'Serpens',
		'Serpens Cauda': 'Serpens'
	};
	let picked = $state<string | null>(null);
	let card = $state<WikiCard | null>(null);
	let cardLoading = $state(false);
	let cardError = $state(false);
	const cardCache = new Map<string, WikiCard>();
	async function wikiSummary(title: string): Promise<WikiCard | null> {
		const r = await fetch(
			`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
		);
		if (!r.ok) return null;
		const d = await r.json();
		if (d.type === 'disambiguation' || !d.extract) return null;
		return {
			// Wikipedia's disambiguator is the URL's problem, not the card's: "Draco", not
			// "Draco (constellation)" — everything on this panel is a constellation.
			title: String(d.title).replace(/ \(constellation\)$/, ''),
			extract: d.extract,
			thumb: d.thumbnail?.source,
			thumbBig: d.originalimage?.source,
			url: d.content_urls?.desktop?.page
		};
	}
	let storyWide = $state(false); // the card's expanded, more-of-the-article form
	function openStory(name: string) {
		picked = name;
		storyWide = false; // every story opens at card size; growing it is a choice
		cardError = false;
		const hit = cardCache.get(name);
		if (hit) {
			card = hit;
			return;
		}
		card = null;
		cardLoading = true;
		const base = WIKI_TITLE[name] ?? name;
		(async () => (await wikiSummary(`${base} (constellation)`)) ?? (await wikiSummary(base)))()
			.then((d) => {
				if (!d) throw new Error('no summary');
				cardCache.set(name, d);
				if (picked === name) card = d; // a slow answer must not fill a newer tap's card
			})
			.catch(() => {
				if (picked === name) cardError = true;
			})
			.finally(() => {
				if (picked === name) cardLoading = false;
			});
	}
	// Escape closes the card, never the panel behind it — captured on window so it wins
	// over the page's own panel-closing Escape.
	$effect(() => {
		if (!picked) return;
		const onEsc = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				picked = null;
			}
		};
		window.addEventListener('keydown', onEsc, true);
		return () => window.removeEventListener('keydown', onEsc, true);
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
	// A TAP — a press that never travelled and never became a pinch — picks the
	// constellation name under it (see openStory); a tap on empty sky puts the card away.
	// The draw pass records each painted name's box in canvas CSS pixels.
	let labelHits: { name: string; x: number; y: number; w: number; h: number }[] = [];
	let tapOk = false;
	let tapX = 0;
	let tapY = 0;
	// Canvas-local coordinates from client ones (offsetX lies for synthetic events, and
	// the canvas fills its stage, so one rect subtraction is the whole mapping).
	const hitName = (e: PointerEvent): string | null => {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = e.clientX - r.left;
		const y = e.clientY - r.top;
		for (const b of labelHits) {
			if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.name;
		}
		return null;
	};
	let overName = $state(false); // hovering a name (desktop): the cursor says "clickable"
	function onPointerDown(e: PointerEvent) {
		tapOk = pointers.size === 0; // only a FIRST finger can begin a tap
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (tapOk) {
			tapX = e.clientX;
			tapY = e.clientY;
		}
		dragging = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		const p = pointers.get(e.pointerId);
		if (!p) {
			overName = hitName(e) !== null;
			return;
		}
		if (pointers.size >= 2) {
			tapOk = false; // it became a pinch
			// Pinch: spreading fingers narrows the field (magnifies), closing widens it —
			// measured against where the fingers just were, so it composes with the pan.
			const before = pinch();
			p.x = e.clientX;
			p.y = e.clientY;
			const after = pinch();
			if (before.d > 20 && after.d > 20) fov = clampFov((fov * before.d) / after.d);
			look(after.mx - before.mx, after.my - before.my);
		} else {
			if (Math.hypot(e.clientX - tapX, e.clientY - tapY) > 6) tapOk = false; // it became a drag
			look(e.clientX - p.x, e.clientY - p.y);
			p.x = e.clientX;
			p.y = e.clientY;
		}
	}
	function onPointerUp(e: PointerEvent) {
		pointers.delete(e.pointerId);
		dragging = pointers.size > 0;
		// pointercancel routes here too, but a cancelled press is not a tap.
		if (e.type === 'pointerup' && tapOk && pointers.size === 0) {
			const name = hitName(e);
			if (name) openStory(name);
			else picked = null;
		}
		if (pointers.size === 0) tapOk = false;
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
		// neither up nor down. Rank sizes them the way the dataset intends. Each painted
		// name records its box (padded to a fingertip) — that's what a tap hits.
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		labelHits = [];
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
			const w = ctx.measureText(f.properties.name).width;
			labelHits.push({
				name: f.properties.name,
				x: p[0] - w / 2 - 8,
				y: p[1] - px / 2 - 8,
				w: w + 16,
				h: px + 16
			});
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
	<!-- Weather's morph, worn here: closed it's a 42px pin disc; open it's the field, grown
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
			<!-- Wide: ONE super bar, the Traffic board's shape — and its arrangement: no Back
			     cap (full-viewport has nowhere to peel back to mid-thought), the title taking
			     the left edge, and the global controls gathered at the right end — Home, then
			     the location disc capping the row. -->
			<div class="ident">
				<h2 class="dest">{#key title}<SplitFlap text={title} base={160} stagger={45} />{/key}</h2>
				<div class="head-refresh">{@render accentDot()}</div>
			</div>
			<div class="deck">
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
			<!-- Right end-cap, the board's arrangement: the location disc, then Home capping
			     the row — the app's own control before the global one, like the board's
			     refresh dial before its caps. --bn 9 on the wrapper (the disc inherits it);
			     Home takes the last beat, so the ripple finishes at the far right. No text
			     label on the disc: the pin glyph and the "Over" stat say what it is; the
			     control keeps its accessible name. -->
			<div class="corner corner-bar" style="--bn:9">
				{@render locationField()}
				{#if onhome}
					<button
						type="button"
						class="icon-btn nav-edge"
						style="--bn:10"
						onclick={onhome}
						aria-label="Close and go home"
						title="Home"
					>
						{@html HOME_SVG}
					</button>
				{/if}
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
			<p class="sm-note" out:fade={{ duration: 250 }}>Charting the sky…</p>
		{/if}
		<!-- The sky FADES up once its data is here (class:ready) — a fully-drawn first
		     frame popping in read as a glitch, not an arrival. -->
		<canvas
			bind:this={canvas}
			class:ready={!!stars}
			class:point={overName}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			onwheel={onWheel}
			aria-label="Standing under the sky at {place.name} right now: {visibleStars} naked-eye stars above the horizon. Drag to look around — below the bright horizon line lies the sky beneath your feet — scroll or pinch to zoom, and tap a constellation's name to read about it."
		></canvas>

		{#if picked}
			<!-- The constellation's story: Wikipedia's lead image and opening lines, and the
			     way out to the full article. It closes on ×, Escape, or a tap on empty sky. -->
			<!-- Each element rises in on its own beat, BOTTOM FIRST (--n counts up from the
			     link): the card springs up from the panel's bottom edge (the popout family's
			     popSpring, anchored at its resting corner — right bottom), so its content
			     lands the way the card travels — nearest the origin, soonest. The expand disc
			     grows the card into a reading panel: the article's ORIGINAL lead image at
			     full card width and the excerpt unclamped, the full-article link staying. -->
			<aside
				class="sm-story"
				class:wide={storyWide}
				transition:popSpring={{ y: 10, origin: 'right bottom' }}
				aria-label="{picked} — from Wikipedia"
			>
				<div class="sm-story-head" style="--n:2">
					<h3>{card?.title ?? picked}</h3>
					<div class="sm-story-acts">
						<button
							type="button"
							class="icon-btn"
							aria-label={storyWide ? 'Shrink the card' : 'Read more here'}
							title={storyWide ? 'Shrink' : 'Read more here'}
							onclick={() => (storyWide = !storyWide)}
						>{@html storyWide ? MINIMIZE_SVG : MAXIMIZE_SVG}</button>
						<button type="button" class="icon-btn" aria-label="Close" onclick={() => (picked = null)}>{@html CLOSE_SVG}</button>
					</div>
				</div>
				{#if cardLoading}
					<p class="sm-story-note" style="--n:1">Looking it up…</p>
				{:else if cardError}
					<p class="sm-story-note" style="--n:1">Wikipedia didn’t answer — try again in a moment.</p>
				{:else if card}
					<div class="sm-story-body" style="--n:1">
						{#if card.thumb}
							<img src={storyWide ? (card.thumbBig ?? card.thumb) : card.thumb} alt={card.title} loading="lazy" />
						{/if}
						<p class="sm-story-extract">{card.extract}</p>
					</div>
					{#if card.url}
						<a class="sm-story-link" style="--n:0" href={card.url} target="_blank" rel="noreferrer noopener">
							Read the full article on Wikipedia<span class="sm-story-ext">{@html EXTERNAL_SVG}</span>
						</a>
					{/if}
				{/if}
			</aside>
		{/if}
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
	/* ── Pixelite: the floating chrome becomes a paper-and-ink toolbar ──────────────────────
	   Same idiom as the bubble branches elsewhere. The starfield/canvas is left ALONE — only
	   the top bar flips from the night-ink frosted strip to the manual's paper sheet with ink
	   text and mono-uppercase labels. Buttons are already plastic keys (the global
	   html[data-look='pixelite'] control rules), and the accent dot is already cobalt (the page
	   passes cobalt in place of the station orange). The bar re-reads paper tokens for its whole
	   subtree, overriding the night ink the .sm block forces above. */
	:global(html[data-look='pixelite']) .sm-head.bar {
		/* The site's ONE bar height — 42px exactly, matching the docs superbar: fixed, not
		   padding-derived. The bar is already a centring flex row, so the keys just seat. */
		--bar-inset: 0.7rem;
		box-sizing: border-box;
		height: 42px;
		padding-block: 0;
		/* The shell superbar's frost, worn at rest (the ranger bar's same reasoning): the bar
		   floats over the live starfield, so there's always sky behind the blur — a solid
		   paper sheet here read as a different bar from the rest of the manual's. */
		background: color-mix(in srgb, var(--page) 78%, transparent);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--pixel-hairline, rgba(0, 0, 0, 0.2));
		--ink: light-dark(#000000, #f2f2f2);
		--sub: light-dark(rgba(0, 0, 0, 0.4), rgba(242, 242, 242, 0.4));
		--line-edge: light-dark(rgba(0, 0, 0, 0.2), rgba(255, 255, 255, 0.2));
		--line-strong: light-dark(rgba(0, 0, 0, 0.45), rgba(255, 255, 255, 0.45));
		--aero-face: rgba(255, 255, 255, 0.5);
		color: var(--ink);
	}
	:global(html[data-look='pixelite']) .sm-head.bar .dest,
	:global(html[data-look='pixelite']) .sm-head.bar .stat dd {
		color: var(--ink);
	}
	/* The FIXED 42px bar seats a two-line stat, not the loose stack the padding-derived bar
	   held: the pair compacts a step (label at 0.6rem — the mono runs optically large —
	   value at 0.95rem, tight lines), and the coords caption folds INLINE after the place
	   name below, so no stat ever stacks a third line the bar has no room for. */
	:global(html[data-look='pixelite']) .sm-head.bar .stat dd {
		font-size: 0.95rem;
		line-height: 1.2;
	}
	:global(html[data-look='pixelite']) .sm-head.bar .stat-coords {
		display: inline;
		margin-left: 0.4rem;
		font-size: 0.66rem;
	}
	/* Room for name + inline coords before the ellipsis cuts in. */
	:global(html[data-look='pixelite']) .sm-head.bar .stat-place dd {
		max-width: 20rem;
	}
	/* Sky-summary labels → the manual's mono uppercase running-head voice. */
	:global(html[data-look='pixelite']) .sm-head.bar .stat dt {
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.6rem;
		line-height: 1.15;
		color: var(--sub);
	}
	/* The location/search disc → a plastic key, matching the Home disc (.icon-btn) beside it:
	   white/50 face, ink border, raised bevel, 4px corners; cobalt on hover, the bevel sinking
	   on press. The morph keeps its white face when opened into the search field. */
	/* The bar's pipes → the manual's separator: solid ink hairlines edge to edge, no gradient
	   fade at the ends (the traffic bar's same pixelite dress). */
	:global(html[data-look='pixelite']) .deck::before,
	:global(html[data-look='pixelite']) .bar .corner-bar::before {
		background: var(--pixel-hairline);
	}
	/* The accent circle comes off the manual's header — it was the station line's bullet, and
	   the printed bar names the place with type alone. (The brand signature's dot, down in
	   the sky's corner, keeps it: that one signs the map, not the bar.) */
	:global(html[data-look='pixelite']) .sm-head .head-refresh {
		display: none;
	}
	/* The constellation's story card → a printed sheet laid on the night sky: paper face
	   (--surface follows dark stock via .scheme-dark), ink rule, square print corners, the
	   sheet's own drop — no frost, no night glass. The .sm block forces night ink on this
	   subtree, so the paper tokens are restated here the same way the bar does above; the
	   discs inside are .icon-btns and already wear the 28px plastic key. */
	:global(html[data-look='pixelite']) .sm-story {
		--ink: light-dark(#000000, #f2f2f2);
		--sub: light-dark(rgba(0, 0, 0, 0.4), rgba(242, 242, 242, 0.4));
		color: var(--ink);
		background: var(--surface);
		border: 1px solid var(--pixel-key-border);
		border-radius: 4px;
		-webkit-backdrop-filter: none;
		backdrop-filter: none;
		box-shadow: var(--card-shadow);
	}
	:global(html[data-look='pixelite']) .sm-story-extract {
		color: color-mix(in srgb, var(--ink) 80%, transparent);
	}
	:global(html[data-look='pixelite']) .sm-story-note {
		color: var(--sub);
	}
	:global(html[data-look='pixelite']) .sm-story-link {
		color: var(--orange);
	}
	/* The bar's 28px keys overhang the slim inset rather than stretch it — the traffic bar's
	   same trim; the title line sets the bar's height. */
	:global(html[data-look='pixelite']) .sm-head.bar .icon-btn,
	:global(html[data-look='pixelite']) .sm-head.bar .sm-cs {
		margin-block: -0.2rem;
	}
	:global(html[data-look='pixelite']) .sm-cs {
		/* 28px: the manual's one control line (pixelite.css .icon-btn note) — the Home key
		   beside it wears the same measure, so the row stays flush. */
		width: 28px;
		height: 28px;
		/* Weather's CitySearch kit, worn whole: the width morphs on the manual's minor
		   bounce (--pixel-pop, pixelite.css), the press squash keeps its curve. */
		transition:
			width 0.24s var(--pixel-pop, ease),
			transform 0.3s var(--btn-spring),
			background 0.2s ease,
			color 0.2s ease,
			border-color 0.15s ease,
			box-shadow 0.2s ease;
		background: var(--pixel-key-face);
		border: 1px solid var(--pixel-key-border);
		border-radius: 4px;
		box-shadow: var(--pixel-bevel);
		color: var(--ink);
	}
	:global(html[data-look='pixelite']) .sm-cs.open {
		width: min(20rem, 55vw);
	}
	:global(html[data-look='pixelite']) .sm-cs-icon {
		width: 26px;
		height: 26px;
	}
	:global(html[data-look='pixelite']) .sm-cs-icon :global(svg) {
		width: 1.05rem;
		height: 1.05rem;
	}
	/* The field speaks mono at 16px (CitySearch's iOS no-zoom note), with the manual's
	   uppercase running-head placeholder. */
	:global(html[data-look='pixelite']) .sm-cs-input {
		font-family: var(--font-mono);
		font-size: 16px;
	}
	:global(html[data-look='pixelite']) .sm-cs-input::placeholder {
		color: var(--sub);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.74rem;
	}
	/* The hits hang as a printed sheet — CitySearch's results treatment: the field's own ink
	   rule so sheet and field read as one control, near-square corners, the sheet's drop. */
	:global(html[data-look='pixelite']) .sm-hits {
		background: var(--panel-fill-solid);
		border: 1px solid var(--pixel-key-border);
		border-radius: 4px;
		box-shadow: var(--card-shadow);
	}
	:global(html[data-look='pixelite']) .sm-hits button {
		border-radius: 3px;
	}
	:global(html[data-look='pixelite']) .sm-hits button.active {
		background: var(--pixel-key-on);
	}
	:global(html[data-look='pixelite']) .sm-cs:not(.open):hover {
		color: var(--orange);
		border-color: var(--orange);
		background: var(--pixel-key-face);
	}
	:global(html[data-look='pixelite']) .sm-cs:not(.open):active {
		box-shadow: var(--pixel-bevel-press);
	}
	:global(html[data-look='pixelite']) .sm-cs.open {
		background: var(--pixel-key-face);
		border-color: var(--orange);
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
	/* Bubble: the aero family's rim light and drop — see the masthead's brand dots. */
	:global(html[data-ui='bubble']) .accent-dot {
		box-shadow: var(--aero-gloss), var(--aero-drop);
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
	/* The right end-cap group: Home, then the location disc. */
	.corner {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	/* The bar's pipes, the Traffic board's same dress: a thin faded separator after the
	   title and before the end caps, each hung mid-gap at the ONE rhythm (0.75rem a
	   side — the boards' 1.5rem group gap, halved). The bar's own gap is the smaller
	   --bar-inset, so both carry a margin topping it up before the pipe is hung. */
	.deck,
	.bar .corner-bar {
		position: relative;
		margin-left: calc(1.5rem - var(--bar-inset));
	}
	.deck::before,
	.bar .corner-bar::before {
		content: '';
		position: absolute;
		left: -0.75rem;
		top: 0;
		bottom: 0;
		width: 1px;
		transform: translateX(-50%);
		background: linear-gradient(
			to bottom,
			transparent,
			var(--line-strong) 32%,
			var(--line-strong) 68%,
			transparent
		);
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
		/* Nearly none: the label and its value are one reading, and the type sizes
		   already separate their roles (the board's summary wears the same). */
		gap: 0.05rem;
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

	/* Chrome entrance — the boards' shared ripple (btn-in, from puhig): Back leads, the
	   location control follows, and the bar's summary readout deals in label-then-value
	   behind them. The header remounts on every open (the panel keys its content), so
	   the ripple replays like the other apps'. `backwards` is mandatory: these are all
	   in the universal hover/press list (see TrafficBoard's same note). */
	@media (prefers-reduced-motion: no-preference) {
		.sm-head .icon-btn,
		.sm-head .sm-cs,
		.sm-head .deck-summary dt,
		.sm-head .deck-summary dd {
			animation: btn-in 0.42s var(--spring) backwards;
			animation-delay: calc(var(--enter-lead) + var(--bn, 0) * var(--btn-enter-step));
		}
		/* Narrow: Back (0) then the pin disc across the row. */
		.head-row .sm-cs {
			--bn: 1;
		}
		/* The bar's summary deals in label-then-value behind the title (its pipe takes
		   beat 1); the right end-cap — the disc (9, off the wrapper), then Home (10) —
		   closes the ripple at the far right. */
		.deck-summary .stat:nth-child(1) dt {
			--bn: 1;
		}
		.deck-summary .stat:nth-child(1) dd {
			--bn: 2;
		}
		.deck-summary .stat:nth-child(2) dt {
			--bn: 3;
		}
		.deck-summary .stat:nth-child(2) dd {
			--bn: 4;
		}
		.deck-summary .stat:nth-child(3) dt {
			--bn: 5;
		}
		.deck-summary .stat:nth-child(3) dd {
			--bn: 6;
		}
		.deck-summary .stat:nth-child(4) dt {
			--bn: 7;
		}
		.deck-summary .stat:nth-child(4) dd {
			--bn: 8;
		}
		/* The pipes join the ripple on the beat of what they introduce (E-ATFC's same
		   dress) — opacity, not btn-in: a sliding separator would read as a control. */
		.deck::before,
		.bar .corner-bar::before {
			animation: fade-in 0.42s ease backwards;
			animation-delay: calc(var(--enter-lead) + var(--bn, 0) * var(--btn-enter-step));
		}
		.deck::before {
			--bn: 1;
		}
	}
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
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
	   resting look live here. Closed it's a 42px pin disc; open it's the field of the same
	   height, the pin staying put as the anchor the width grows away from. */
	.sm-cs {
		position: relative;
		display: flex;
		align-items: center;
		flex: none;
		width: 42px;
		height: 42px;
		border-radius: 999px;
		/* The Back button's exact resting clothes (base.css .icon-btn): the family face
		   under a line-edge hairline — the two discs share a row, so they share a look. */
		background: var(--aero-face);
		color: var(--ink);
		border: 1px solid var(--line-edge);
		overflow: visible;
		/* The morph SPRINGS — CitySearch's exact motion (see its transition note): the
		   field overshoots its width on puhig's --spring, and transform rides the button
		   spring so the closed pin disc pops and squashes with the family. */
		transition:
			width 0.38s var(--spring),
			transform 0.3s var(--btn-spring),
			background 0.2s ease,
			color 0.2s ease,
			border-color 0.2s ease,
			box-shadow 0.2s ease;
		/* Pinned to a compositor layer like the universal button family (+page), so the
		   hover pop's promotion doesn't re-rasterize the disc mid-interaction. */
		will-change: transform;
	}
	@media (prefers-reduced-motion: no-preference) {
		.sm-cs:not(.open):hover {
			transform: scale(var(--btn-hover-scale));
		}
		.sm-cs:not(.open):active {
			transform: scale(var(--btn-press-scale));
			transition-duration: 0.1s;
		}
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
		width: 40px;
		height: 40px;
		padding: 0;
		color: inherit;
		background: none;
		border: 0;
		border-radius: 999px;
		cursor: pointer;
	}
	.sm-cs-icon :global(svg) {
		display: block;
		width: 1.35rem;
		height: 1.35rem;
		/* Optical centring, not geometric: the pin is a TEARDROP — bulb high, tip low —
		   so dead-centre reads high in the disc. A 1px drop rests its visual mass (the
		   bulb) on the disc's centre. */
		transform: translateY(1px);
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
		/* Hidden until the data lands, then a slow fade up — see class:ready. */
		opacity: 0;
		transition: opacity 0.7s ease;
		/* The regular arrow, not a grab hand: the whole surface pans, so a special cursor
		   marks nothing out. The exception is a constellation's NAME — the one thing here
		   you can actually click — which gets the pointer. */
		cursor: default;
		touch-action: none; /* the finger pans the SKY, not the page */
	}
	.sm-stage canvas.ready {
		opacity: 1;
	}
	.sm-stage canvas.point {
		cursor: pointer;
	}
	/* The constellation's story card — night ink on a frosted night pane, in the stage's
	   bottom-RIGHT pocket (the brand's own corner; the card covers the signature while it
	   speaks). Its discs are ordinary .icon-btns, so they measure what every panel control
	   measures — 42px at every width. */
	.sm-story {
		position: absolute;
		z-index: 2;
		right: var(--head-inset);
		bottom: var(--head-inset);
		width: min(24rem, calc(100% - 2 * var(--head-inset)));
		max-height: calc(100% - var(--head-h) - 2 * var(--head-inset));
		overflow-y: auto;
		/* Contain overscroll — no chain to the map/page (the iOS scroll-lock). */
		overscroll-behavior: contain;
		padding: 0.85rem 1rem;
		color: #f2f2ee;
		background: rgba(8, 12, 24, 0.92);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 14px;
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		box-shadow: 0 8px 24px rgba(4, 7, 15, 0.5);
		/* Expanding MORPHS: the card is right-anchored, so a width transition slides its
		   left edge out while the image's own transition (below) grows it in place — the
		   text reflows around it every frame, riding into its resting place. */
		transition: width 0.32s cubic-bezier(0.4, 0, 0.2, 1);
	}
	/* Expanded: a reading panel — wider, capped under the floating disc row, scrolling if
	   the lead outruns it. */
	.sm-story.wide {
		width: min(34rem, calc(100% - 2 * var(--head-inset)));
	}
	.sm-story-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.sm-story-head h3 {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 700;
	}
	.sm-story-acts {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	/* A wrapping row, not a mode switch: compact, the 84px image sits beside the text;
	   wide, the image's max-width transition grows it across the card and the text WRAPS
	   under it — one continuous reflow instead of a flex-direction snap (which nothing
	   could animate). max-width and height are both fixed lengths, so they interpolate. */
	.sm-story-body {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.6rem;
	}
	.sm-story-body img {
		flex: none;
		width: 100%;
		max-width: 84px;
		height: 84px;
		object-fit: cover;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		transition:
			max-width 0.32s cubic-bezier(0.4, 0, 0.2, 1),
			height 0.32s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.sm-story.wide .sm-story-body img {
		max-width: 32rem;
		height: 300px;
	}
	.sm-story-extract {
		flex: 1;
		min-width: 12rem;
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
		color: #c9d2e8;
		/* The opening lines, not the whole lead — the link below is the way to the rest. */
		display: -webkit-box;
		-webkit-line-clamp: 5;
		line-clamp: 5;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.sm-story.wide .sm-story-extract {
		display: block;
		-webkit-line-clamp: none;
		line-clamp: none;
		overflow: visible;
		font-size: 0.95rem;
	}
	/* Entrance: each element rises in bottom-first (--n set in the markup) — the card
	   pops up from the bottom edge, and its content lands the way the card travels. */
	@media (prefers-reduced-motion: no-preference) {
		.sm-story > * {
			animation: rise 0.4s ease backwards;
			animation-delay: calc(var(--n, 0) * 0.06s);
		}
	}
	.sm-story-note {
		margin: 0.6rem 0 0;
		font-size: 0.85rem;
		color: #9aa4bd;
	}
	.sm-story-link {
		display: block;
		margin-top: 0.6rem;
		/* Right-aligned whole: the way OUT sits at the card's far corner, past the text. */
		text-align: right;
		font-size: 0.85rem;
		font-weight: 600;
		color: #a9c0ff;
		text-decoration: none;
	}
	.sm-story-link:hover {
		text-decoration: underline;
	}
	/* The outbound mark rides the link's last word (the photo credit's same arrangement). */
	.sm-story-ext {
		display: inline-block;
		vertical-align: -0.1em;
		width: 0.85em;
		height: 0.85em;
		margin-left: 0.3em;
	}
	.sm-story-ext :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
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
