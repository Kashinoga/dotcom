<script lang="ts">
	import { onMount, onDestroy, untrack, type Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import SplitFlap from '$lib/SplitFlap.svelte';
	import {
		EXTERNAL_SVG,
		BACK_CIRCLE_SVG,
		REFRESH_CIRCLE_SVG,
		FULLSCREEN_CIRCLE_SVG,
		EXIT_FULLSCREEN_CIRCLE_SVG
	} from '$lib/icons';
	import { AIRPORTS, DEFAULT_FIELD, fieldByIata, type Airport } from '$lib/fields';
	import { RANGES, DEFAULT_RANGE, INTERVALS, DEFAULT_POLL_MS } from '$lib/scope';

	// A live "what's in the air around <airport>" board. Same keyless, CORS-open
	// stack as the dotcom-2 atc app: airplanes.live for live ADS-B traffic near a
	// point, adsbdb to resolve a callsign to its origin/destination (→ arriving /
	// departing / overflight, relative to the selected field). No API key, no
	// backend. Only polls while this panel is mounted.

	// This board owns the whole ATFC panel interior (header + scrolling body) so that,
	// in the expanded wide layout, its controls + a live summary can sit beside the
	// "Air Traffic" title in the fixed header instead of leaving that space empty. The
	// parent passes the panel chrome it can't reach from here: title, station code, the
	// back handler, the expanded flag, and the Connections nav (as a snippet).
	let {
		accent = '#f06030',
		code = '',
		title = '',
		expanded = false,
		onback,
		onToggleExpand,
		connections,
		edit = false,
		copyText,
		onCopyEdit,
		initialField = null,
		onFieldChange,
		initialRange = null,
		onRangeChange,
		initialRefresh = null,
		onRefreshChange
	}: {
		accent?: string;
		code?: string;
		title?: string;
		expanded?: boolean;
		onback?: () => void;
		onToggleExpand?: () => void;
		connections?: Snippet;
		// The field this board opens on, as an IATA code, resolved from `?field=` by the
		// page. Null means the default. `onFieldChange` reports a pick back so the page can
		// put it in the URL — the board doesn't touch history itself. (Named `initialField`
		// because `field` is taken by the API-record mapper further down.)
		initialField?: string | null;
		onFieldChange?: (picked: Airport) => void;
		// Same contract for the board's other two controls, from `?range=` and `?refresh=`.
		// Null means the default. Range is NM; refresh is milliseconds.
		initialRange?: number | null;
		onRangeChange?: (nm: number) => void;
		initialRefresh?: number | null;
		onRefreshChange?: (ms: number) => void;
		// Edit Mode (dev authoring): `copyText(key)` reads the current/staged copy and
		// `onCopyEdit(key, value)` stages an edit — both delegate to the page's Settings
		// store so the board's prose saves/exports with the rest of the site copy.
		edit?: boolean;
		copyText?: (key: string) => string;
		onCopyEdit?: (key: string, value: string) => void;
	} = $props();

	// The dense header deck is worth it only when the panel is both expanded AND wide
	// enough to lay controls + summary beside the title; otherwise (compact panel, or a
	// phone bottom-sheet that's "expanded" by persisted preference) fall back to the
	// stacked controls in the body.
	let wide = $state(false);
	const showDeck = $derived(expanded && wide);

	// `AIRPORTS` (the field selector) now lives in $lib/fields.ts, so `?field=` resolves
	// against the same list these chips render from.

	// ICAO type code → Wikipedia article title (from the dotcom-2 atc app). Only
	// mapped types get a clickable photo; the lookup resolves the article's lead
	// image via Wikimedia (CORS-open with origin=*).
	const TYPE_TITLES: Record<string, string> = {
		A319: 'Airbus A319',
		A320: 'Airbus A320',
		A321: 'Airbus A321',
		A20N: 'Airbus A320neo',
		A21N: 'Airbus A321neo',
		A332: 'Airbus A330-200',
		A333: 'Airbus A330-300',
		A359: 'Airbus A350',
		B737: 'Boeing 737',
		B738: 'Boeing 737-800',
		B739: 'Boeing 737-900',
		B73G: 'Boeing 737-700',
		B752: 'Boeing 757-200',
		B763: 'Boeing 767-300',
		B77W: 'Boeing 777-300ER',
		B788: 'Boeing 787-8',
		B789: 'Boeing 787-9',
		B38M: 'Boeing 737 MAX 8',
		B39M: 'Boeing 737 MAX 9',
		CRJ2: 'Bombardier CRJ200',
		CRJ7: 'Bombardier CRJ700 series',
		CRJ9: 'Bombardier CRJ700 series',
		CRJ: 'Bombardier CRJ700 series',
		E75L: 'Embraer 175',
		E75S: 'Embraer 175',
		E170: 'Embraer 170',
		E190: 'Embraer 190',
		E45X: 'Embraer ERJ family',
		E145: 'Embraer ERJ family',
		E135: 'Embraer ERJ family',
		DH8D: 'Bombardier Dash 8',
		AT72: 'ATR 72',
		C172: 'Cessna 172',
		C152: 'Cessna 152',
		C182: 'Cessna 182',
		C208: 'Cessna 208 Caravan',
		PC12: 'Pilatus PC-12',
		BE20: 'Beechcraft Super King Air',
		B350: 'Beechcraft Super King Air',
		SR22: 'Cirrus SR22',
		SR20: 'Cirrus SR20',
		P28A: 'Piper PA-28 Cherokee',
		// Fast jets — flown by the fictional demo field's traffic (and real enough that a
		// tapped row still resolves a genuine Wikipedia photo, cached like any other type).
		F22: 'Lockheed Martin F-22 Raptor',
		F14: 'Grumman F-14 Tomcat',
		F15: 'McDonnell Douglas F-15 Eagle',
		F18: 'McDonnell Douglas F/A-18 Hornet',
		EUFI: 'Eurofighter Typhoon',
		RFAL: 'Dassault Rafale',
		SU27: 'Sukhoi Su-27',
		SU37: 'Sukhoi Su-37',
		// Exotics — the "boss plane" energy: forward-swept and stealth-prototype airframes
		// that star in Ace Combat and, being real, still resolve a genuine Wikipedia photo.
		SU47: 'Sukhoi Su-47',
		SU57: 'Sukhoi Su-57',
		YF23: 'Northrop YF-23',
		X29: 'Grumman X-29',
		E3: 'Boeing E-3 Sentry'
	};
	type Photo = { src: string; credit: string; url: string };
	// type → resolved photo (or null when Wikipedia has none). Caching the PROMISE also
	// collapses concurrent taps of the same type onto one request. Module-lived, and
	// mirrored to localStorage: a type→photo mapping is effectively permanent, so a
	// reload should reuse it rather than re-query Wikipedia for the same 40 airframes.
	const imgCache = new Map<string, Promise<Photo | null>>();
	const PHOTO_LS_KEY = 'ksh-actype-photos';

	function readPhotoStore(): Record<string, Photo | null> {
		if (typeof localStorage === 'undefined') return {};
		try {
			return JSON.parse(localStorage.getItem(PHOTO_LS_KEY) || '{}');
		} catch {
			return {};
		}
	}
	// Seed the in-memory cache from a prior session (called once on mount).
	function loadPersistedPhotos() {
		for (const [type, val] of Object.entries(readPhotoStore())) {
			if (!imgCache.has(type)) imgCache.set(type, Promise.resolve(val));
		}
	}
	function persistPhoto(type: string, val: Photo | null) {
		if (typeof localStorage === 'undefined') return;
		try {
			const store = readPhotoStore();
			store[type] = val;
			localStorage.setItem(PHOTO_LS_KEY, JSON.stringify(store));
		} catch {
			/* private mode / quota — the in-memory cache still covers this session */
		}
	}

	function stripHtml(html: string) {
		const d = document.createElement('div');
		d.innerHTML = html || '';
		return (d.textContent || '').replace(/\s+/g, ' ').trim();
	}
	function loadTypeImage(type: string): Promise<Photo | null> {
		const title = TYPE_TITLES[type];
		if (!title) return Promise.resolve(null);
		const cached = imgCache.get(type);
		if (cached) return cached; // resolved OR in-flight — never a duplicate fetch
		const base =
			'https://en.wikipedia.org/w/api.php?origin=*&format=json&redirects=1&action=query&titles=';
		const req = (async (): Promise<Photo | null> => {
			const r = await fetch(
				base + encodeURIComponent(title) + '&prop=pageimages&piprop=thumbnail%7Cname&pithumbsize=480'
			);
			const d = await r.json();
			const pages = d?.query?.pages ?? {};
			const pg = pages[Object.keys(pages)[0]];
			if (!pg || !pg.thumbnail) {
				persistPhoto(type, null); // genuinely no lead image — remember that too
				return null;
			}
			const info: Photo = { src: pg.thumbnail.source, credit: '', url: '' };
			try {
				const r2 = await fetch(
					base + encodeURIComponent('File:' + pg.pageimage) + '&prop=imageinfo&iiprop=extmetadata'
				);
				const d2 = await r2.json();
				const p2 = d2.query.pages;
				const ii = p2[Object.keys(p2)[0]].imageinfo[0].extmetadata;
				const artist = ii.Artist && stripHtml(ii.Artist.value);
				const lic = ii.LicenseShortName && ii.LicenseShortName.value;
				info.credit = [artist, lic].filter(Boolean).join(' · ');
				info.url =
					(ii.LicenseUrl && ii.LicenseUrl.value) ||
					'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(pg.pageimage);
			} catch {
				/* keep the photo even without a full credit */
			}
			persistPhoto(type, info);
			return info;
		})().catch(() => {
			imgCache.delete(type); // transient network/API error — allow a later retry
			return null;
		});
		imgCache.set(type, req);
		return req;
	}

	type Field = { icao: string; iata: string; city: string; name: string };
	type Airline = { name: string; iata: string; callsign: string };
	type Route = { o: Field; d: Field; airline: Airline | null } | null;
	// callsign → route (null = adsbdb knows none). Module-lived so reopening the
	// panel doesn't refetch. `undefined` (absent key) = not looked up yet.
	const routeCache = new Map<string, Route>();

	type Plane = {
		hex: string;
		call: string;
		type: string;
		reg: string; // tail / registration (airplanes.live `r`)
		op: string; // operator (airplanes.live `ownOp`)
		desc: string; // full type name (airplanes.live `desc`)
		year: number | null; // build year
		alt: number | 'ground' | null;
		gs: number | null;
		track: number | null;
		vrate: number | null; // vertical rate, fpm (baro_rate ?? geom_rate)
		distNm: number;
	};

	// RANGES / INTERVALS now live in $lib/scope, so the URL layer resolves `?range=` and
	// `?refresh=` against the very lists these controls render from.
	const MAX_ROWS = 18;
	const MAX_LOOKUPS_PER_POLL = 8;
	// Snappy split-flap timing for the board cells (the Home header's Solari flip).
	const FLAP = { base: 70, stagger: 24, tick: 40, delay: 0 };
	const ROW_STEP = 55; // per-row start delay so the board flips top row → bottom
	// Per-row transition timing (all ms). Rows transition ONE AT A TIME, and within a
	// row the flap and the open/close MOTION never overlap:
	//   enter: row opens (OPEN_MS) → cells flap → hold (HOLD_MS) → flap to real route
	//   leave: hold the route → flap into the reason at its turn → hold → collapse (CLOSE_MS)
	const OPEN_MS = 500; // row open motion, before the entering row's cells flap
	const HOLD_MS = 1200; // reason held on screen before the value flap / collapse
	const CLOSE_MS = 400; // row collapse motion

	// Seeded from the URL's `?field=` (via the page) so a shared link opens on that field
	// server-side, with no flash of the default. Read once — from here the board owns it,
	// and history changes arrive as a remount.
	// svelte-ignore state_referenced_locally
	// Seeded from the URL (via the page), falling back to each control's default. Reading the
	// initial value is the point — the effect further down is what keeps these following the
	// props afterwards.
	let sel = $state<Airport>(fieldByIata(initialField) ?? DEFAULT_FIELD);
	// svelte-ignore state_referenced_locally
	let radiusNm = $state(initialRange ?? DEFAULT_RANGE);
	// svelte-ignore state_referenced_locally
	let pollMs = $state(initialRefresh ?? DEFAULT_POLL_MS);
	let planes = $state<Plane[]>([]);
	let status = $state<'loading' | 'ok' | 'empty' | 'error'>('loading');
	let updatedAt = $state<number | null>(null);
	let routeVer = $state(0); // bump when the route cache fills, to re-derive rows
	// Route lookups run one-at-a-time against adsbdb (a volunteer API), so a cold field
	// can spend a second or two resolving callsigns. This surfaces that wait as a
	// determinate meter; null when nothing is in flight. `enrichGen` cancels a stale
	// run's meter writes when a newer poll / field change supersedes it.
	let routeProgress = $state<{ done: number; total: number } | null>(null);
	let enrichGen = 0;
	// True while a *user-initiated* live fetch is in flight (the manual refresh button) so
	// the activity bar shows over the existing board without blanking it. Auto-refreshes
	// leave this false — the countdown ring already signals those, and a bar flashing every
	// poll would be noise. Field/range switches use `status === 'loading'` instead.
	let polling = $state(false);
	let nowTs = $state(Date.now()); // ticks so the refresh ring can count down
	let paused = $state(false); // auto-refresh on/off
	// reicon play / pause (outline).
	const PLAY_SVG =
		'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.23832 3.04445C5.65196 2.1818 3.75 3.31957 3.75 5.03299L3.75 18.9672C3.75 20.6806 5.65196 21.8184 7.23832 20.9557L20.0503 13.9886C21.6499 13.1188 21.6499 10.8814 20.0503 10.0116L7.23832 3.04445ZM2.25 5.03299C2.25 2.12798 5.41674 0.346438 7.95491 1.72669L20.7669 8.6938C23.411 10.1317 23.411 13.8685 20.7669 15.3064L7.95491 22.2735C5.41674 23.6537 2.25 21.8722 2.25 18.9672L2.25 5.03299Z" fill="currentColor"/></svg>';
	const PAUSE_SVG =
		'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.948 1.25H6.052C6.95048 1.24997 7.6997 1.24995 8.29448 1.32991C8.92228 1.41432 9.48908 1.59999 9.94455 2.05546C10.4 2.51093 10.5857 3.07773 10.6701 3.70552C10.7501 4.30031 10.75 5.04953 10.75 5.94801V18.052C10.75 18.9505 10.7501 19.6997 10.6701 20.2945C10.5857 20.9223 10.4 21.4891 9.94455 21.9445C9.48908 22.4 8.92228 22.5857 8.29448 22.6701C7.6997 22.7501 6.95048 22.75 6.052 22.75H5.94801C5.04953 22.75 4.30031 22.7501 3.70552 22.6701C3.07773 22.5857 2.51093 22.4 2.05546 21.9445C1.59999 21.4891 1.41432 20.9223 1.32991 20.2945C1.24995 19.6997 1.24997 18.9505 1.25 18.052V5.948C1.24997 5.04952 1.24995 4.3003 1.32991 3.70552C1.41432 3.07773 1.59999 2.51093 2.05546 2.05546C2.51093 1.59999 3.07773 1.41432 3.70552 1.32991C4.3003 1.24995 5.04952 1.24997 5.948 1.25ZM3.90539 2.81654C3.44393 2.87858 3.24644 2.9858 3.11612 3.11612C2.9858 3.24644 2.87858 3.44393 2.81654 3.90539C2.7516 4.38843 2.75 5.03599 2.75 6V18C2.75 18.964 2.7516 19.6116 2.81654 20.0946C2.87858 20.5561 2.9858 20.7536 3.11612 20.8839C3.24644 21.0142 3.44393 21.1214 3.90539 21.1835C4.38843 21.2484 5.03599 21.25 6 21.25C6.96401 21.25 7.61157 21.2484 8.09461 21.1835C8.55607 21.1214 8.75357 21.0142 8.88389 20.8839C9.0142 20.7536 9.12143 20.5561 9.18347 20.0946C9.24841 19.6116 9.25 18.964 9.25 18V6C9.25 5.03599 9.24841 4.38843 9.18347 3.90539C9.12143 3.44393 9.0142 3.24644 8.88389 3.11612C8.75357 2.9858 8.55607 2.87858 8.09461 2.81654C7.61157 2.7516 6.96401 2.75 6 2.75C5.03599 2.75 4.38843 2.7516 3.90539 2.81654ZM17.948 1.25H18.052C18.9505 1.24997 19.6997 1.24995 20.2945 1.32991C20.9223 1.41432 21.4891 1.59999 21.9445 2.05546C22.4 2.51093 22.5857 3.07773 22.6701 3.70552C22.7501 4.30031 22.75 5.04953 22.75 5.94801V18.052C22.75 18.9505 22.7501 19.6997 22.6701 20.2945C22.5857 20.9223 22.4 21.4891 21.9445 21.9445C21.4891 22.4 20.9223 22.5857 20.2945 22.6701C19.6997 22.7501 18.9505 22.75 18.052 22.75H17.948C17.0495 22.75 16.3003 22.7501 15.7055 22.6701C15.0777 22.5857 14.5109 22.4 14.0555 21.9445C13.6 21.4891 13.4143 20.9223 13.3299 20.2945C13.2499 19.6997 13.25 18.9505 13.25 18.052V5.94801C13.25 5.04953 13.2499 4.3003 13.3299 3.70552C13.4143 3.07773 13.6 2.51093 14.0555 2.05546C14.5109 1.59999 15.0777 1.41432 15.7055 1.32991C16.3003 1.24995 17.0495 1.24997 17.948 1.25ZM15.9054 2.81654C15.4439 2.87858 15.2464 2.9858 15.1161 3.11612C14.9858 3.24644 14.8786 3.44393 14.8165 3.90539C14.7516 4.38843 14.75 5.03599 14.75 6V18C14.75 18.964 14.7516 19.6116 14.8165 20.0946C14.8786 20.5561 14.9858 20.7536 15.1161 20.8839C15.2464 21.0142 15.4439 21.1214 15.9054 21.1835C16.3884 21.2484 17.036 21.25 18 21.25C18.964 21.25 19.6116 21.2484 20.0946 21.1835C20.5561 21.1214 20.7536 21.0142 20.8839 20.8839C21.0142 20.7536 21.1214 20.5561 21.1835 20.0946C21.2484 19.6116 21.25 18.964 21.25 18V6C21.25 5.03599 21.2484 4.38843 21.1835 3.90539C21.1214 3.44393 21.0142 3.24644 20.8839 3.11612C20.7536 2.9858 20.5561 2.87858 20.0946 2.81654C19.6116 2.7516 18.964 2.75 18 2.75C17.036 2.75 16.3884 2.7516 15.9054 2.81654Z" fill="currentColor"/></svg>';
	// maximize / minimize (the expand-panel toggle) are shared with the page masthead,
	// so they live in $lib/icons. This board owns its copy of the control so the icon
	// sits as the super bar's right end-cap, aligned with back.

	// Countdown-ring geometry + progress toward the next poll.
	const RING_R = 15.5;
	const RING_C = 2 * Math.PI * RING_R;
	// Human label for the current cadence ("1m", "30s") — falls back to raw seconds.
	const pollLabel = $derived(INTERVALS.find((i) => i.ms === pollMs)?.label ?? `${Math.round(pollMs / 1000)}s`);
	const ringFrac = $derived(
		updatedAt ? Math.min(1, Math.max(0, (nowTs - updatedAt) / pollMs)) : 0
	);
	const ringDash = $derived(RING_C * ringFrac);
	// Seconds until the next poll — shown as a plain count (e.g. 60, not 1:00).
	const ringRemain = $derived(Math.max(0, Math.ceil((pollMs * (1 - ringFrac)) / 1000)));

	let timer = 0;
	let ringTimer = 0;
	let destroyed = false;

	function haversineNm(aLat: number, aLon: number, bLat: number, bLon: number) {
		const R = 3440.065; // nautical miles
		const dLat = ((bLat - aLat) * Math.PI) / 180;
		const dLon = ((bLon - aLon) * Math.PI) / 180;
		const la1 = (aLat * Math.PI) / 180;
		const la2 = (bLat * Math.PI) / 180;
		const h =
			Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
		return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
	}

	const field = (a: Record<string, unknown>): Field => ({
		icao: (a.icao_code as string) || '',
		iata: (a.iata_code as string) || '',
		city: (a.municipality as string) || '',
		name: (a.name as string) || ''
	});

	async function enrichRoutes(list: Plane[]) {
		const gen = ++enrichGen;
		// The callsigns still needing a route (unique, uncached), capped at the per-poll
		// budget — that count is what the progress meter fills toward.
		const queue: string[] = [];
		const seen = new Set<string>();
		for (const p of list) {
			const cs = p.call.toUpperCase();
			if (!cs || seen.has(cs) || routeCache.has(cs)) continue;
			seen.add(cs);
			queue.push(cs);
			if (queue.length >= MAX_LOOKUPS_PER_POLL) break;
		}
		if (!queue.length) {
			routeProgress = null; // everything already cached — no wait to show
			return;
		}
		routeProgress = { done: 0, total: queue.length };
		for (const cs of queue) {
			try {
				const r = await fetch('https://api.adsbdb.com/v0/callsign/' + encodeURIComponent(cs));
				if (destroyed || gen !== enrichGen) return; // superseded — drop this run
				if (r.ok) {
					const j = await r.json();
					const fr = j?.response?.flightroute;
					const al = fr?.airline;
					const airline: Airline | null =
						al && al.name ? { name: al.name, iata: al.iata || '', callsign: al.callsign || '' } : null;
					const route: Route =
						fr && fr.origin && fr.destination
							? { o: field(fr.origin), d: field(fr.destination), airline }
							: null;
					routeCache.set(cs, route);
					routeVer++;
				}
				// !r.ok → leave uncached so a later poll retries
			} catch {
				/* transient — leave uncached so a later poll retries */
			}
			// Count every attempt (resolved or not) so the meter always reaches full.
			if (gen === enrichGen && routeProgress) {
				routeProgress = { done: routeProgress.done + 1, total: routeProgress.total };
			}
		}
		// Hold at a full bar briefly before hiding: the last increment and the hide would
		// otherwise batch into one render, so the meter would slide away still showing the
		// second-to-last step. The pause lets 100% paint (and its width transition finish)
		// so the fill visibly completes. Guarded again in case a newer run supersedes us mid-hold.
		if (gen === enrichGen) {
			await new Promise((r) => setTimeout(r, 500));
			if (gen === enrichGen) routeProgress = null;
		}
	}

	// ── Demo field (fictional, no APIs) ─────────────────────────────────────────
	// Canned "traffic" for GRACEMERIA so a first visit can explore the board — tags,
	// routes, the flap cascade, even a tapped photo — without polling the live feeds.
	// Callsigns and fields are Ace Combat's Strangereal; a light per-refresh jitter on
	// alt/speed/heading keeps the split-flaps ticking so it still feels alive.
	const demoField = (icao: string, iata: string, city: string, name: string): Field => ({
		icao,
		iata,
		city,
		name
	});
	const DF = {
		GRM: demoField('EMGR', 'GRM', 'Gracemeria', 'Gracemeria Intl'),
		FAR: demoField('ERFB', 'FAR', 'Farbanti', 'Farbanti Intl'),
		OUR: demoField('OSOU', 'OUR', 'Oured', 'Oured Intl'),
		SIB: demoField('OSSI', 'SIB', 'Sand Island', 'Sand Island AFB'),
		NOV: demoField('OSNC', 'NOV', 'November City', 'November City Intl'),
		SUD: demoField('ESSU', 'SUD', 'Sudentor', 'Sudentor Intl'),
		GBH: demoField('ESGB', 'GBH', 'Gündbach', 'Gündbach'),
		NDV: demoField('NNND', 'NDV', 'Nordennavic', 'Nordennavic'),
		DIR: demoField('EMDR', 'DIR', 'Directus', 'Directus')
	};
	type DemoSpec = {
		hex: string;
		call: string;
		type: string;
		reg: string;
		op: string;
		year: number;
		alt: number | 'ground';
		gs: number;
		track: number;
		vrate: number;
		distNm: number;
		o: keyof typeof DF;
		d: keyof typeof DF;
	};
	// origin → destination: a leg touching GRM (EMGR) reads as arr/dep, otherwise over.
	const DEMO_SPECS: DemoSpec[] = [
		{ hex: 'ACE001', call: 'GARUDA1', type: 'F15', reg: 'AWE-01', op: 'Emmeria Air Force', year: 2015, alt: 24000, gs: 430, track: 95, vrate: -1200, distNm: 12, o: 'FAR', d: 'GRM' },
		{ hex: 'ACE002', call: 'TALISMAN', type: 'EUFI', reg: 'AWE-02', op: 'Emmeria Air Force', year: 2016, alt: 8000, gs: 320, track: 270, vrate: 1800, distNm: 6, o: 'GRM', d: 'DIR' },
		{ hex: 'ACE003', call: 'MOBIUS1', type: 'F22', reg: 'ISF-118', op: 'ISAF', year: 2004, alt: 36000, gs: 480, track: 210, vrate: 0, distNm: 33, o: 'FAR', d: 'OUR' },
		{ hex: 'ACE004', call: 'GALM1', type: 'F15', reg: 'UST-06', op: 'Ustio Air Force', year: 1995, alt: 21000, gs: 410, track: 120, vrate: -900, distNm: 21, o: 'OUR', d: 'GRM' },
		{ hex: 'ACE005', call: 'RAZGRIZ', type: 'F14', reg: 'OMD-01', op: 'Osean Maritime Defense', year: 2010, alt: 3200, gs: 260, track: 300, vrate: 2200, distNm: 9, o: 'GRM', d: 'SIB' },
		{ hex: 'ACE006', call: 'YELLOW13', type: 'SU37', reg: 'ERU-13', op: 'Erusean Air Force', year: 2004, alt: 34000, gs: 470, track: 20, vrate: 0, distNm: 52, o: 'SUD', d: 'FAR' },
		{ hex: 'ACE007', call: 'WARDOG3', type: 'F18', reg: 'OAD-108', op: 'Osean Air Defense Force', year: 2010, alt: 17500, gs: 390, track: 150, vrate: -1500, distNm: 44, o: 'NDV', d: 'GRM' },
		{ hex: 'ACE008', call: 'STRIDER1', type: 'F22', reg: 'OAD-003', op: 'Osean Air Defense Force', year: 2019, alt: 28000, gs: 450, track: 265, vrate: 500, distNm: 18, o: 'GRM', d: 'NOV' },
		{ hex: 'ACE009', call: 'GRYPHUS1', type: 'RFAL', reg: 'EMM-01', op: 'Emmeria Air Force', year: 2011, alt: 30000, gs: 460, track: 60, vrate: 0, distNm: 118, o: 'FAR', d: 'SUD' },
		{ hex: 'ACE010', call: 'PIXY', type: 'F15', reg: 'GLM-02', op: 'Galm Team', year: 1995, alt: 15000, gs: 370, track: 130, vrate: -1000, distNm: 74, o: 'GBH', d: 'GRM' },
		{ hex: 'ACE011', call: 'CIPHER', type: 'F15', reg: 'UST-01', op: 'Ustio Air Force', year: 1995, alt: 'ground', gs: 0, track: 0, vrate: 0, distNm: 2, o: 'GRM', d: 'SIB' },
		// Boss-tier aces, in real exotics (so a tapped row still shows a real photo).
		{ hex: 'ACE012', call: 'MIHALY', type: 'SU57', reg: 'ERU-01', op: 'Erusean Air Force', year: 2020, alt: 41000, gs: 520, track: 200, vrate: 0, distNm: 28, o: 'FAR', d: 'OUR' },
		{ hex: 'ACE013', call: 'BERKUT', type: 'SU47', reg: 'GRU-47', op: 'Gründer Industries', year: 2006, alt: 26000, gs: 440, track: 85, vrate: 900, distNm: 40, o: 'SUD', d: 'GRM' },
		// A fuller board — enough within range to fill it and make the panel scroll.
		{ hex: 'ACE014', call: 'THUNDERHEAD', type: 'E3', reg: 'OAD-767', op: 'Osean Air Defense Force', year: 2005, alt: 31000, gs: 300, track: 90, vrate: 0, distNm: 26, o: 'SUD', d: 'GRM' },
		{ hex: 'ACE015', call: 'EDGE', type: 'F14', reg: 'OMD-04', op: 'Osean Maritime Defense', year: 2010, alt: 19000, gs: 400, track: 110, vrate: -800, distNm: 15, o: 'OUR', d: 'GRM' },
		{ hex: 'ACE016', call: 'CHOPPER', type: 'F14', reg: 'OMD-05', op: 'Osean Maritime Defense', year: 2010, alt: 22000, gs: 410, track: 100, vrate: 0, distNm: 37, o: 'FAR', d: 'GRM' },
		{ hex: 'ACE017', call: 'ARCHER', type: 'F15', reg: 'OAD-21', op: 'Osean Air Defense Force', year: 2012, alt: 12000, gs: 350, track: 280, vrate: 1500, distNm: 24, o: 'GRM', d: 'NOV' },
		{ hex: 'ACE018', call: 'SWORDSMAN', type: 'F15', reg: 'EMM-07', op: 'Emmeria Air Force', year: 2013, alt: 27000, gs: 440, track: 200, vrate: 0, distNm: 48, o: 'FAR', d: 'OUR' },
		{ hex: 'ACE019', call: 'WISEMAN', type: 'F18', reg: 'OAD-115', op: 'Osean Air Defense Force', year: 2014, alt: 16000, gs: 380, track: 130, vrate: -1000, distNm: 33, o: 'NDV', d: 'GRM' },
		{ hex: 'ACE020', call: 'COUNT', type: 'F22', reg: 'OAD-004', op: 'Osean Air Defense Force', year: 2019, alt: 34000, gs: 470, track: 70, vrate: 0, distNm: 51, o: 'SUD', d: 'FAR' },
		{ hex: 'ACE021', call: 'SCARFACE1', type: 'F14', reg: 'USE-01', op: 'Usean Allied Forces', year: 2004, alt: 8000, gs: 300, track: 260, vrate: 1200, distNm: 11, o: 'GRM', d: 'SIB' }
	];
	// Prime the route cache once so rows derive arr/dep/over exactly like a live field.
	const DEMO_ROUTES = new Map<string, Route>(
		DEMO_SPECS.map((s) => [s.call, { o: DF[s.o], d: DF[s.d], airline: null }])
	);
	let demoRoutesPrimed = false;
	function primeDemoRoutes() {
		if (demoRoutesPrimed) return;
		for (const [cs, r] of DEMO_ROUTES) routeCache.set(cs, r);
		demoRoutesPrimed = true;
		routeVer++;
	}
	// A little life: nudge alt/speed/heading/climb each refresh. Distance stays put, so
	// range filtering — and thus which rows are on the board — is stable between polls.
	const jit = (base: number, amp: number, step = 1) =>
		Math.round((base + (Math.random() * 2 - 1) * amp) / step) * step;
	function demoPlanes(): Plane[] {
		return DEMO_SPECS.map((s) => {
			const grounded = s.alt === 'ground';
			return {
				hex: s.hex,
				call: s.call,
				type: s.type,
				reg: s.reg,
				op: s.op,
				desc: TYPE_TITLES[s.type] || '',
				year: s.year,
				alt: grounded ? 'ground' : jit(s.alt as number, 300, 25),
				gs: grounded ? 0 : jit(s.gs, 12),
				track: grounded ? s.track : (((jit(s.track, 6) % 360) + 360) % 360),
				vrate: grounded ? 0 : jit(s.vrate, 120, 50),
				distNm: s.distNm
			};
		});
	}
	function loadDemo() {
		primeDemoRoutes();
		const all = demoPlanes()
			.filter((p) => p.distNm <= radiusNm)
			.sort((a, b) => a.distNm - b.distNm);
		prevInRange = inRangeHexes;
		inRangeHexes = new Set(all.map((p) => p.hex));
		planes = all.slice(0, MAX_ROWS);
		status = planes.length ? 'ok' : 'empty';
		updatedAt = Date.now();
	}

	async function poll(showBusy = false) {
		const at = sel;
		if (at.demo) {
			loadDemo(); // fictional field — canned traffic, no live feeds
			return;
		}
		if (showBusy) polling = true; // manual refresh: show the activity bar over the live board
		try {
			// Same-origin proxy (src/routes/api/traffic) — it fans out to airplanes.live
			// with an adsb.lol fallback server-side, dodging the mirrors' missing CORS.
			const url = `/api/traffic?lat=${at.lat}&lon=${at.lon}&dist=${radiusNm}`;
			const r = await fetch(url);
			if (destroyed || at.icao !== sel.icao) return;
			if (!r.ok) throw new Error('bad response');
			const data = await r.json();
			if (destroyed || at.icao !== sel.icao) return;
			const ac: Record<string, unknown>[] = Array.isArray(data?.ac) ? data.ac : [];
			// Everything actually in range, nearest first. We keep the full set (not just
			// the shown top rows) so a row dropping off the board can be explained: still
			// in range → bumped by closer traffic; gone entirely → left / landed.
			const all: Plane[] = ac
				.filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number')
				.map((a) => ({
					hex: ((a.hex as string) || '').toUpperCase(),
					call: ((a.flight as string) || '').trim(),
					type: (a.t as string) || '',
					reg: ((a.r as string) || '').trim(),
					op: ((a.ownOp as string) || '').trim(),
					desc: ((a.desc as string) || '').trim(),
					year: a.year != null && Number.isFinite(Number(a.year)) ? Number(a.year) : null,
					alt: (a.alt_baro as number | 'ground') ?? null,
					gs: typeof a.gs === 'number' ? a.gs : null,
					track: typeof a.track === 'number' ? a.track : null,
					vrate:
						typeof a.baro_rate === 'number'
							? a.baro_rate
							: typeof a.geom_rate === 'number'
								? a.geom_rate
								: null,
					distNm: haversineNm(at.lat, at.lon, a.lat as number, a.lon as number)
				}))
				.sort((x, y) => x.distNm - y.distNm);
			prevInRange = inRangeHexes;
			inRangeHexes = new Set(all.map((p) => p.hex));
			const list = all.slice(0, MAX_ROWS);
			planes = list;
			status = list.length ? 'ok' : 'empty';
			updatedAt = Date.now();
			enrichRoutes(list);
		} catch {
			if (!destroyed && at.icao === sel.icao) status = planes.length ? 'ok' : 'error';
		} finally {
			polling = false; // fetch done (or aborted) — enrichment now owns the bar, if any
		}
	}

	// (Re)start the auto-poll interval — unless paused, in which case it stays off.
	function restartInterval() {
		clearInterval(timer);
		timer = paused ? 0 : window.setInterval(poll, pollMs);
	}
	// Poll now and re-sync the cadence (a one-off refresh while paused stays paused).
	// `showBusy` surfaces the activity bar for user-initiated refreshes (the manual button).
	function kick(showBusy = false) {
		poll(showBusy);
		restartInterval();
	}
	// The manual "refresh now" button, throttled so mashing it can't spam the volunteer
	// ADS-B mirrors — at most one on-demand fetch every few seconds. (Field/range changes
	// call kick() directly since each is a genuinely different query.)
	let lastManual = 0;
	function manualRefresh() {
		const now = Date.now();
		if (now - lastManual < 3000) return;
		lastManual = now;
		kick(true); // surface the activity bar so the click has visible feedback
	}
	// Switch auto-refresh cadence; adopt it immediately (stays off while paused).
	function setPollMs(ms: number) {
		if (ms === pollMs) return;
		pollMs = ms;
		onRefreshChange?.(ms); // let the page mirror the pick into `?refresh=`
		restartInterval();
	}
	function togglePause() {
		paused = !paused;
		if (paused) {
			clearInterval(timer);
			timer = 0;
			clearInterval(ringTimer);
			ringTimer = 0;
		} else {
			ringTimer = window.setInterval(() => (nowTs = Date.now()), 200);
			kick();
		}
	}
	function select(a: Airport) {
		if (a.icao === sel.icao) return;
		sel = a;
		onFieldChange?.(a); // let the page mirror the pick into `?field=`
		planes = [];
		resetTracks(); // a new field is a fresh board — don't animate the old rows out
		enrichGen++; // cancel any in-flight enrichment from the old field
		routeProgress = null;
		status = 'loading';
		updatedAt = null;
		closePhoto();
		kick();
	}
	function setRange(r: number) {
		if (r === radiusNm) return;
		radiusNm = r;
		onRangeChange?.(r); // let the page mirror the pick into `?range=`
		planes = [];
		resetTracks();
		enrichGen++; // cancel any in-flight enrichment for the old range
		routeProgress = null;
		status = 'loading';
		updatedAt = null;
		kick();
	}

	// Follow the URL when it moves under us. The panel is keyed on the station code, so a
	// back/forward (or a real navigation) that only changes `?field=` / `?range=` /
	// `?refresh=` re-runs `load` and updates these props without remounting the board —
	// without this, the address bar and the board would disagree.
	//
	// No feedback loop: each setter early-returns when the value already matches, and the
	// onChange it fires writes the same value back into the prop, so the effect re-runs at
	// most once and finds nothing to do. `untrack` keeps the board's own state off the
	// dependency list — only the props may drive this.
	$effect(() => {
		const wantField = fieldByIata(initialField) ?? DEFAULT_FIELD;
		const wantRange = initialRange ?? DEFAULT_RANGE;
		const wantRefresh = initialRefresh ?? DEFAULT_POLL_MS;
		untrack(() => {
			select(wantField);
			setRange(wantRange);
			setPollMs(wantRefresh);
		});
	});

	// A tapped row's photo card: a snapshot of the aircraft + its type photo.
	type Selected = {
		call: string;
		hex: string;
		type: string;
		reg: string;
		desc: string;
		op: string;
		year: number | null;
		title: string;
		route: Route;
		tag: Row['tag'];
		alt: Plane['alt'];
		gs: number | null;
		vrate: number | null;
		distNm: number;
	};
	let selected = $state<Selected | null>(null);
	let photo = $state<Photo | 'loading' | null>(null);
	let photoToken = 0; // guards against a slow photo landing after another pick

	function openPhoto(p: Row) {
		const title = TYPE_TITLES[p.type] || '';
		selected = {
			call: p.call,
			hex: p.hex,
			type: p.type,
			reg: p.reg,
			desc: p.desc,
			op: p.opLabel,
			year: p.year,
			title,
			route: p.route,
			tag: p.tag,
			alt: p.alt,
			gs: p.gs,
			vrate: p.vrate,
			distNm: p.distNm
		};
		const token = ++photoToken;
		if (!title) {
			photo = null;
			return;
		}
		photo = 'loading';
		loadTypeImage(p.type).then((info) => {
			if (token === photoToken) photo = info;
		});
	}
	function closePhoto() {
		selected = null;
		photo = null;
		photoToken++;
	}

	// `opLabel` is the resolved operator display string, `opShort` the same name cut to
	// the column's flaps. Computing them here (once per row when the data changes) rather
	// than in the template keeps the tidy/title-case/truncate regexes off the hot path —
	// the row's cells re-render on every transition tick during a cascade, and opLabel was
	// otherwise recomputed twice per row on each of those.
	type Row = Plane & {
		tag: 'arr' | 'dep' | 'over' | null;
		route: Route;
		opLabel: string;
		opShort: string;
	};
	const rows = $derived.by<Row[]>(() => {
		routeVer; // dependency: re-derive when the route cache fills
		opFlaps; // …and when the board crosses a width tier, re-cutting every operator
		return planes.map((p) => {
			const route = routeCache.get(p.call.toUpperCase()) ?? null;
			let tag: Row['tag'] = null;
			if (route) tag = route.d.icao === sel.icao ? 'arr' : route.o.icao === sel.icao ? 'dep' : 'over';
			const opLabel = opName({ op: p.op, route });
			return { ...p, route, tag, opLabel, opShort: fitFlaps(opLabel, opFlaps) };
		});
	});

	// Direction tally across the shown rows — the header summary's Arr · Dep · Ovr line.
	const counts = $derived.by(() => {
		let arr = 0, dep = 0, ovr = 0;
		for (const r of rows) {
			if (r.tag === 'arr') arr++;
			else if (r.tag === 'dep') dep++;
			else if (r.tag === 'over') ovr++;
		}
		return { arr, dep, ovr };
	});

	// Board intro copy, Edit-Mode aware. The live variant substitutes {} with the range
	// (NM); while editing, the raw template shows so the token stays editable (mirrors
	// the Settings panel's note handling).
	const leadKey = $derived(sel.demo ? 'atfcLeadDemo' : 'atfcLead');
	function leadText() {
		const raw = copyText?.(leadKey) ?? '';
		return edit || sel.demo ? raw : raw.replace('{}', String(radiusNm));
	}

	const fmtAlt = (a: Plane['alt']) => {
		if (a === 'ground') return 'GND';
		if (typeof a !== 'number') return '—';
		return a >= 18000 ? 'FL' + Math.round(a / 100) : Math.round(a).toLocaleString() + ' ft';
	};
	const fmtSpd = (g: number | null) => (g == null ? '—' : Math.round(g) + ' kt');
	const fmtHdg = (t: number | null) => (t == null ? '—' : String(Math.round(t)).padStart(3, '0') + '°');
	const fmtDist = (d: number) => Math.round(d) + ' NM';
	// Vertical rate → climb ▲ / descent ▼ with fpm (level or unknown → dash). The
	// arrow is a static glyph in the split-flap (only A–Z/0–9 shuffle).
	const fmtVs = (v: number | null) => {
		if (v == null || Math.abs(v) < 64) return '—';
		return (v > 0 ? '▲ ' : '▼ ') + Math.round(Math.abs(v) / 50) * 50;
	};
	// Operator label: prefer adsbdb's tidy airline name; else title-case the raw
	// ownOp and drop trailing corporate suffixes (AMERICAN AIRLINES INC → American
	// Airlines) so the column reads cleanly.
	const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());
	function tidyOp(s: string) {
		const t = s
			.replace(/\b(INC|LLC|LLP|LTD|CORP|CO|PLC|GMBH|DBA|AG|SA|NV|BV|THE)\b\.?/gi, '')
			.replace(/\s+/g, ' ')
			.trim();
		return t || s;
	}
	const opName = (p: { op: string; route: Route }) =>
		p.route?.airline?.name || (p.op ? titleCase(tidyOp(p.op)) : '');
	// A physical Solari board has a fixed number of flaps per column; a name that runs
	// past them simply doesn't fit. Operators are the one free-text column here and they
	// get long ("Gulf & Caribbean Cargo / Contract Air Cargo" — 42 chars), so cap what
	// the flaps show. The full name stays on the row: as the cell's tooltip, as the
	// flap's accessible name, and on the photo card.
	//
	// Truncating the STRING (rather than clipping the rendered cell with text-overflow)
	// is what keeps the column honest: the split-flap lays out one inline-block per
	// letter, so the table's auto layout sizes this column from the letters it's given.
	// A CSS max-width here is simply ignored — which is how the untruncated name came to
	// overflow `visible` and paint on top of the Alt column.
	//
	// How many flaps the column gets depends on how wide the board is. Quantised into tiers
	// rather than computed continuously from `bodyW`, for two reasons: the cell is keyed on
	// its text (`{#key p.opShort}`), so every change to the budget re-mounts the flap and
	// re-runs its scramble — a continuous budget would make the column shimmer through a
	// whole window drag; and the truncation feeds back into the column's own width, so a
	// width→chars→width loop would need damping. Tiers only cross on a real size change.
	//
	// Thresholds are CONTAINER widths, the same units the .x2 breakpoints below use — so 940
	// here is the same 940 that reveals the column. Measured off `.scroll`, a plain block
	// child of `.tfc-body`: its clientWidth is the container's content box. (`.tfc-body`
	// itself would give the padding box, and its padding is `clamp(1.5rem, 4vw, 2.75rem)` —
	// it varies with the viewport, so there's no constant to subtract.)
	const OP_TIERS = [
		{ at: 1510, flaps: 40 }, // expanded on a wide desktop; fits all but the longest names
		{ at: 1280, flaps: 32 },
		{ at: 1080, flaps: 26 },
		{ at: 940, flaps: 22 }, // the narrowest the column is ever seen at
		{ at: 0, flaps: 18 } // unreachable while .x2 hides the column — a floor, not a tier
	];
	let boardW = $state(0);
	const opFlaps = $derived(OP_TIERS.find((t) => boardW >= t.at)!.flaps);

	function fitFlaps(s: string, max: number) {
		if (s.length <= max) return s;
		const hard = s.slice(0, max - 1);
		// Prefer to break on a word, but not when backing up guts the label: for a long
		// final word, the partial ("Air Transport Internati…") carries more than the word
		// before it ("Air Transport…").
		const sp = hard.lastIndexOf(' ');
		const cut = sp > 0 && sp >= (max - 1) * 0.6 ? hard.slice(0, sp) : hard;
		// Never leave the ellipsis hanging off a separator ("Gulf & Caribbean Cargo /…").
		return cut.replace(/[\s/,.&–—-]+$/, '') + '…';
	}
	const fmtClock = (t: number | null) => {
		if (t == null) return '—';
		const d = new Date(t);
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
	};
	const TAG_LABEL = { arr: 'Arr', dep: 'Dep', over: 'Ovr' } as const;

	// ─── Entry / exit choreography ──────────────────────────────────────────────
	// `rows` is the live top-N. `tracks` is what we actually render: the same rows,
	// but a row that vanishes is held in a `leave` state (with a deduced reason)
	// long enough to play its exit before being dropped, and a fresh row plays an
	// `enter` before settling to `live`.
	// `stagger` is the row's slot in a top-to-bottom cascade among the rows that
	// enter (or leave) together on one refresh, so a busy ORD poll ripples down the
	// board instead of every row animating at the same instant. It drives both the
	// CSS animation-delay and the promote/remove timers so they stay in lockstep.
	type Track = Row & {
		status: 'enter' | 'live' | 'leave';
		reason: string;
		kind: '' | 'enter' | 'leave';
		stagger: number;
		active: boolean; // a leaving row: true once it's this row's turn to flap its reason
	};
	let tracks = $state<Track[]>([]);
	// Per-row step. Sized to a whole row's transition so only ONE row animates at a
	// time — row 0 flaps+opens/closes, then row 1 starts, and so on down the board.
	// (Also means never more than ~1 collapse in flight, which is what keeps Safari
	// smooth on a heavy landing wave.)
	const STAGGER_MS = 700;
	const rowTimers = new Map<string, number>(); // hex → promote/remove timeout
	let inRangeHexes = new Set<string>(); // every aircraft in range this poll
	let prevInRange = new Set<string>(); // …and last poll, to explain arrivals
	// False until the first fill has cascaded in; afterwards a Route cell flapping
	// from its reason to the real route does so immediately (start 0) rather than
	// waiting out the row's cascade delay, so the reason visibly flaps INTO the route.
	let booted = $state(false);
	// Split-flap start delay. Live/initial rows cascade top-to-bottom (i × ROW_STEP).
	// An ENTERING row flaps only AFTER its open motion (turn + OPEN_MS), so the flap
	// and the open never run together. A LEAVING row's cells are frozen; its reason
	// flap is driven separately (start 0 the moment it's activated at its turn).
	const flapStart = (p: Track, idx: number) =>
		p.status === 'enter'
			? p.stagger * STAGGER_MS + OPEN_MS
			: p.status === 'leave'
				? p.stagger * STAGGER_MS
				: idx * ROW_STEP;

	// Why did this aircraft drop off the board? Still in range → the shown rows are
	// capped and closer traffic pushed it past the cut. Gone from range → it left
	// the area (or, if last seen on the ground, it landed).
	// Short, uppercase board tokens — they flap into the Route column like a Solari
	// status ("LANDED", "BUMPED") instead of a coloured pill.
	function leaveReason(t: Track): string {
		if (inRangeHexes.has(t.hex)) return 'BUMPED';
		if (t.alt === 'ground') return 'LANDED';
		return 'EXITED';
	}
	// Why did it appear? On the ground near the field, or previously in range but
	// off the bottom of the board (now close enough to show), or brand new.
	function enterReason(r: Row): string {
		if (r.alt === 'ground') return 'GROUNDED';
		if (prevInRange.has(r.hex)) return 'MOVED UP';
		return 'IN RANGE';
	}

	function clearRowTimer(hex: string) {
		const id = rowTimers.get(hex);
		if (id) clearTimeout(id);
		rowTimers.delete(hex);
	}
	// Drive a row through its phases with chained timers (one live timer per hex).
	// ENTER: opens (CSS) → cells flap (start delay) → after OPEN_MS+HOLD_MS, go live so
	//        the Route cell flaps on to the real route.
	// LEAVE: at its turn, flip `active` so the Route flaps route→reason; after
	//        HOLD_MS+CLOSE_MS (reason held, then the CSS collapse), drop the row.
	function scheduleTransition(hex: string, stagger: number, kind: 'enter' | 'leave') {
		clearRowTimer(hex);
		const base = stagger * STAGGER_MS;
		if (kind === 'enter') {
			rowTimers.set(
				hex,
				window.setTimeout(() => {
					// After the open motion: flap the reason IN (Route cell was blank).
					tracks = tracks.map((t) => (t.hex === hex ? { ...t, active: true } : t));
					rowTimers.set(
						hex,
						window.setTimeout(() => {
							rowTimers.delete(hex);
							tracks = tracks.map((t) =>
								t.hex === hex && t.status === 'enter'
									? { ...t, status: 'live', reason: '', kind: '', stagger: 0, active: false }
									: t
							);
						}, HOLD_MS)
					);
				}, base + OPEN_MS)
			);
		} else {
			rowTimers.set(
				hex,
				window.setTimeout(() => {
					// The row's turn: flap the reason in (route → LANDED/BUMPED/…).
					tracks = tracks.map((t) => (t.hex === hex ? { ...t, active: true } : t));
					rowTimers.set(
						hex,
						window.setTimeout(() => {
							rowTimers.delete(hex);
							tracks = tracks.filter((t) => t.hex !== hex);
						}, HOLD_MS + CLOSE_MS)
					);
				}, base)
			);
		}
	}
	function resetTracks() {
		for (const id of rowTimers.values()) clearTimeout(id);
		rowTimers.clear();
		tracks = [];
		inRangeHexes = new Set();
		prevInRange = new Set();
	}

	// Fold a fresh set of live rows into `tracks`, opening/closing rows as needed.
	function reconcile(next: Row[]) {
		const byHex = new Map(next.map((r) => [r.hex, r]));
		const prev = untrack(() => tracks);
		const prevByHex = new Map(prev.map((t) => [t.hex, t]));
		const firstLoad = prev.length === 0;
		const out: Track[] = [];
		// Rows first transitioning THIS reconcile — their timers + cascade stagger get
		// assigned after the sort, once we know their top-to-bottom order.
		const entering = new Set<string>();
		const leaving = new Set<string>();
		// Carry existing tracks forward: refresh data, or begin a leave if it's gone.
		for (const t of prev) {
			const nr = byHex.get(t.hex);
			if (nr) {
				if (t.status === 'leave') {
					// It came back before it finished leaving — cancel the exit.
					clearRowTimer(t.hex);
					out.push({ ...nr, status: 'live', reason: '', kind: '', stagger: 0, active: false });
				} else if (t.status === 'enter') {
					// Keep animating in; hold its stagger so the delay doesn't shift.
					out.push({
						...nr,
						status: 'enter',
						reason: t.reason,
						kind: t.kind,
						stagger: t.stagger,
						active: false
					});
				} else {
					out.push({ ...nr, status: 'live', reason: '', kind: '', stagger: 0, active: false });
				}
			} else if (t.status === 'leave') {
				out.push(t); // already leaving — keep its stagger, active flag, and timer
			} else {
				leaving.add(t.hex);
				out.push({ ...t, status: 'leave', reason: leaveReason(t), kind: 'leave', stagger: 0, active: false });
			}
		}
		// New arrivals. On the very first fill, drop them straight in as `live` so the
		// board just flips into place (the split-flap already staggers the entrance).
		for (const nr of next) {
			if (prevByHex.has(nr.hex)) continue;
			if (firstLoad) {
				out.push({ ...nr, status: 'live', reason: '', kind: '', stagger: 0, active: false });
			} else {
				entering.add(nr.hex);
				out.push({ ...nr, status: 'enter', reason: enterReason(nr), kind: 'enter', stagger: 0, active: false });
			}
		}
		// Nearest first; a leaving row keeps its last distance, so it collapses in place.
		out.sort((a, b) => a.distNm - b.distNm);
		// One shared sequence top-to-bottom, so enters and leaves take turns down the
		// board (never two at once) — a lone row is slot 0 and doesn't wait.
		let seq = 0;
		for (const t of out) {
			if (entering.has(t.hex)) {
				t.stagger = seq++;
				scheduleTransition(t.hex, t.stagger, 'enter');
			} else if (leaving.has(t.hex)) {
				t.stagger = seq++;
				scheduleTransition(t.hex, t.stagger, 'leave');
			}
		}
		if (!firstLoad) booted = true; // first fill has cascaded; later flaps are immediate
		tracks = out;
	}

	// Drive reconciliation whenever the live rows change (a poll, or routes filling
	// in). Reads `tracks` via untrack so writing it back doesn't re-trigger us.
	$effect(() => {
		reconcile(rows);
	});

	// Is the viewport wide enough for the beside-the-title deck? (Expanded fills the
	// viewport, so viewport width ≈ panel width.)
	let mq: MediaQueryList | undefined;
	const onMq = (e: MediaQueryListEvent) => (wide = e.matches);

	onMount(() => {
		loadPersistedPhotos(); // reuse last session's aircraft-type photos
		poll();
		timer = window.setInterval(poll, pollMs);
		ringTimer = window.setInterval(() => (nowTs = Date.now()), 200);
		mq = window.matchMedia('(min-width: 900px)');
		wide = mq.matches;
		mq.addEventListener('change', onMq);
	});
	onDestroy(() => {
		destroyed = true;
		clearInterval(timer);
		clearInterval(ringTimer);
		mq?.removeEventListener('change', onMq);
		for (const id of rowTimers.values()) clearTimeout(id);
		rowTimers.clear();
	});
</script>

<!-- Control-pill groups, shared between the compact body layout and the expanded
     header deck (same handlers + state, just re-parented by width). -->
{#snippet fieldButtons()}
	{#each AIRPORTS as a, i}
		<!-- --bn: the pill's place in the chrome's left-to-right entrance ripple. The field row
		     is the same horizontal run of pills in both the compact panel and the expanded super
		     bar, so it rides right behind the Back cap (--bn 0) in either — Range/Refresh/Expand
		     pick up the count past the last pill (see the .tfc-head chrome rule). -->
		<button
			type="button"
			class="field"
			class:on={a.icao === sel.icao}
			role="radio"
			aria-checked={a.icao === sel.icao}
			title={a.name}
			style="--bn:{1 + i}"
			onclick={() => select(a)}
		>
			{a.iata}
		</button>
	{/each}
{/snippet}
{#snippet fieldSelect()}
	<!-- The compact panel's field control: a dropdown of the fields by name, so it costs one line
	     instead of the pills' several and lets the three controls share a row. Its option value is
	     the icao (what select() and sel.icao key on). The expanded super bar keeps the pills. -->
	<select
		class="field-select"
		aria-label="Airport"
		value={sel.icao}
		onchange={(e) => {
			const a = AIRPORTS.find((x) => x.icao === e.currentTarget.value);
			if (a) select(a);
		}}
	>
		{#each AIRPORTS as a}
			<option value={a.icao}>{a.name}</option>
		{/each}
	</select>
{/snippet}
{#snippet rangeButtons()}
	<select
		class="field-select"
		aria-label="Radar range (nautical miles)"
		value={radiusNm}
		onchange={(e) => setRange(Number(e.currentTarget.value))}
	>
		<!-- Unit lives on the group header so it shows once, not repeated per option. -->
		<optgroup label="NM">
			{#each RANGES as r}
				<option value={r}>{r}</option>
			{/each}
		</optgroup>
	</select>
{/snippet}
{#snippet refreshButtons()}
	<select
		class="field-select"
		aria-label="Auto-refresh interval"
		value={pollMs}
		onchange={(e) => setPollMs(Number(e.currentTarget.value))}
	>
		{#each INTERVALS as iv}
			<option value={iv.ms}>{iv.label}</option>
		{/each}
	</select>
{/snippet}
{#snippet manualButton()}
	<!-- Keep {@html} flush with the tags: surrounding whitespace becomes an in-flow text
	     node, which would give this inline-block a line box and pull its baseline up off
	     its bottom edge (see .manual). -->
	<button type="button" class="manual icon-btn" aria-label="Refresh now" title="Refresh now" onclick={manualRefresh}>{@html REFRESH_CIRCLE_SVG}</button>
{/snippet}
{#snippet accentDot()}
	<!-- Decorative, nonfunctional: the app's accent colour as a station-sign bullet beside
	     the title. The live refresh control lives up in the top-right corner. -->
	<span class="accent-dot" aria-hidden="true"></span>
{/snippet}
{#snippet ringButton()}
	<button
		type="button"
		class="refresh"
		class:is-paused={paused}
		aria-pressed={paused}
		aria-label={paused
			? 'Auto-refresh paused. Click to resume.'
			: `Auto-refreshing every ${pollLabel}; next in about ${ringRemain} seconds. Click to pause.`}
		onclick={togglePause}
	>
		<svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
			<circle class="ring-track" cx="18" cy="18" r={RING_R} />
			<circle
				class="ring-arc"
				cx="18"
				cy="18"
				r={RING_R}
				stroke-dasharray={RING_C}
				stroke-dashoffset={ringDash}
			/>
		</svg>
		<span class="ring-num" aria-hidden="true">{ringRemain}</span>
		<span class="ring-ico" aria-hidden="true">{@html paused ? PLAY_SVG : PAUSE_SVG}</span>
		<span class="tip" role="tooltip">
			{#if paused}Auto-refresh paused — click to resume.
			{:else}Auto-refreshing every {pollLabel} — the ring counts down to the next update. Click to
				pause.{/if}
		</span>
	</button>
{/snippet}

<div class="tfc" class:expanded style:--accent={accent}>
	<header class="tfc-head" class:bar={showDeck}>
		{#if showDeck}
			<!-- Expanded: ONE super bar. The far edges are global app controls — back at the
			     left cap, collapse at the right — framing the identity, controls, and summary. -->
			{#if onback}
				<!-- --bn 0: the left cap leads the chrome's entrance ripple; the field pills
				     (--bn 1…11), then Range, Refresh, and the right cap fall in behind it. -->
				<button
					type="button"
					class="icon-btn nav-edge"
					style="--bn:0"
					onclick={onback}
					aria-label="Back to route map"
					title="Route map"
				>
					{@html BACK_CIRCLE_SVG}
				</button>
			{/if}
			<div class="ident">
				<h2 class="dest">{#key title}<SplitFlap text={title} base={160} stagger={45} />{/key}</h2>
				<div class="head-refresh">{@render accentDot()}</div>
			</div>
			<div class="deck">
				<div class="deck-controls">
					<!-- --bn 1: the "Field" caption rides in with the first pill (the pills self-index
					     from 1); the pills override it with their own 1…11 to keep the ripple. -->
					<div class="ctl" role="radiogroup" aria-label="Airport" style="--bn:1">
						<span class="ctl-label">Field</span>{@render fieldButtons()}
					</div>
					<!-- --bn set on the wrapper; the <select> inside inherits it (custom props
					     cascade), so Range and Refresh land just past the last field pill. -->
					<div class="ctl" style="--bn:12">
						<span class="ctl-label">Range</span>{@render rangeButtons()}
					</div>
					<div class="ctl" style="--bn:13">
						<span class="ctl-label">Refresh</span>{@render refreshButtons()}
					</div>
				</div>
				<!-- The readout lands just past Refresh; its label/value pairs stagger 14→17 (see the
				     .deck-summary dt/dd rules), so In range and Updated deal in one after another. -->
				<dl class="deck-summary" aria-label="Board summary">
					<div class="stat">
						<dt>In range</dt>
						<dd>{status === 'loading' || status === 'error' ? '—' : rows.length}</dd>
					</div>
					<div class="stat">
						<dt>Updated</dt>
						<dd>{updatedAt ? fmtClock(updatedAt) : '—'}</dd>
					</div>
				</dl>
			</div>
			<!-- Right end-cap: the live refresh control paired with the collapse toggle. --bn on
			     the wrapper (manual inherits it); the collapse cap takes the last beat, so the
			     ripple finishes where the eye ends up — at the far right of the bar. -->
			<div class="corner corner-bar" style="--bn:18">
				{@render manualButton()}
				{#if onToggleExpand}
					<button
						type="button"
						class="icon-btn nav-edge"
						style="--bn:19"
						onclick={onToggleExpand}
						aria-label="Collapse panel"
						title="Collapse"
					>
						{@html EXIT_FULLSCREEN_CIRCLE_SVG}
					</button>
				{/if}
			</div>
		{:else}
			{#if onback}<button type="button" class="icon-btn back" style="--bn:0" onclick={onback} aria-label="Back to route map" title="Route map">{@html BACK_CIRCLE_SVG}</button>{/if}
			<div class="title-row">
				<h2 class="dest">{#key title}<SplitFlap text={title} base={160} stagger={45} />{/key}</h2>
				<!-- Decorative accent dot beside the title (station-sign bullet). -->
				<div class="head-refresh">{@render accentDot()}</div>
			</div>
			<!-- Top-right corner: the live refresh control paired with the expand toggle. Sits
			     inside the header, which stays put while the body scrolls. --bn keeps it
			     a beat behind the Back cap so the two ends of the header don't snap in together. -->
			<div class="corner corner-compact" style="--bn:2">
				{@render manualButton()}
				{#if onToggleExpand}
					<button
						type="button"
						class="icon-btn expand-compact"
						onclick={onToggleExpand}
						aria-label={expanded ? 'Collapse panel' : 'Expand panel to fill'}
						title={expanded ? 'Collapse' : 'Expand to fill'}
					>
						{@html expanded ? EXIT_FULLSCREEN_CIRCLE_SVG : FULLSCREEN_CIRCLE_SVG}
					</button>
				{/if}
			</div>
		{/if}
	</header>

	<!-- `booting` (= not yet booted) gates the body's one-time entrance: the summary, the table
	     headers, the row rules, and the legend animate in on the first fill, then the flag clears
	     on the next poll so a live update never re-runs the assembly. -->
	<div class="tfc-body" class:booting={!booted}>
		<!-- Live-data activity meter, covering the whole wait so there's feedback BEFORE and
		     DURING, not just after. Two phases share one bar (so it never disappears between
		     them): while the board is first loading a field, the ADS-B fetch is in flight and
		     the bar is indeterminate; once rows land, route lookups run one-at-a-time against
		     adsbdb (a polite, sequential API) and the bar becomes a determinate meter that
		     fills as each route resolves and its Route cell flaps in. Background refreshes keep
		     status 'ok', so this doesn't flash every poll — only on a fresh field/range/mount. -->
		{#if (status === 'loading' && !sel.demo) || polling || routeProgress}
			<div
				class="route-prog"
				role="status"
				aria-label={routeProgress
					? `Resolving routes: ${routeProgress.done} of ${routeProgress.total}`
					: 'Loading live traffic'}
				transition:slide={{ duration: 180 }}
			>
				<div class="rp-track">
					{#if routeProgress}
						<div class="rp-fill" style:width="{(routeProgress.done / routeProgress.total) * 100}%"></div>
					{:else}
						<div class="rp-fill rp-indef"></div>
					{/if}
				</div>
				<span class="rp-text mono">
					{#if routeProgress}Resolving routes {routeProgress.done}/{routeProgress.total}…{:else}Loading live traffic…{/if}
				</span>
			</div>
		{/if}
		{#if edit || leadText().trim()}
			<p
				class="lead"
				class:editable={edit}
				contenteditable={edit}
				oninput={edit ? (e) => onCopyEdit?.(leadKey, e.currentTarget.textContent ?? '') : undefined}
			>{leadText()}</p>
		{/if}

		{#if !showDeck}
			<!-- Compact controls. On a wide panel these stack as three labelled rows, the field a
			     row of pills. On mobile (bottom sheet) the pills would wrap to several lines, so the
			     field collapses to a dropdown and all three sit on one row — see the media query. -->
			<div class="controls-compact">
				<!-- The compact panel (any width) uses the field DROPDOWN, not the pills — the pill
				     row wrapped to several lines even on desktop, and one dropdown lets Airport,
				     Range and Refresh sit on a single row. The pills live on in the expanded super
				     bar, where there's width to lay them out. -->
				<div class="fields ranges" style="--bn:1">
					<span class="range-label">Airport</span>
					{@render fieldSelect()}
				</div>

				<!-- --bn continues the ripple past the field pills (which self-index 1…11), so the
				     compact rows populate top-to-bottom after the pills settle, select inheriting it. -->
				<div class="fields ranges" style="--bn:12">
					<span class="range-label">Range</span>{@render rangeButtons()}
				</div>

				<div class="fields ranges" style="--bn:13">
					<span class="range-label">Refresh</span>{@render refreshButtons()}
				</div>
			</div>

			<div class="board-head">
				<h3>{sel.name} · <span class="mono">{sel.icao}</span></h3>
				<div class="status">
					<span class="upd" aria-live="polite">
						{#if status === 'loading'}Loading…
						{:else if status === 'error'}Feed unavailable
						{:else}{rows.length} in range · {fmtClock(updatedAt)}{/if}
					</span>
				</div>
			</div>
		{/if}

	{#if selected}
		<div class="photo-card" transition:slide={{ duration: 220 }}>
			<div class="pc-img">
				{#if photo === 'loading'}
					<div class="pc-ph">Loading photo…</div>
				{:else if photo}
					<img src={photo.src} alt={selected.title || selected.type} loading="lazy" />
				{:else}
					<div class="pc-ph">No photo for {selected.type || 'this type'}</div>
				{/if}
			</div>
			<div class="pc-info">
				<p class="pc-title">{selected.title || selected.desc || selected.type || 'Unknown type'}</p>
				<!-- Joined in JS, not stitched together from inline {#if}s. The markup version wrapped a
				     branch onto its own line, and the indent that followed swallowed the space before
				     the separator — the card read "MIHALY· ERU-01· SU57". A separator is punctuation
				     between values, so let the values be a list and put the punctuation between them. -->
				<p class="pc-sub mono">
					{[selected.call || selected.hex || '—', selected.reg, selected.type]
						.filter(Boolean)
						.join(' · ')}
				</p>
				{#if selected.op}
					<p class="pc-op">
						{[selected.op, selected.year ? `built ${selected.year}` : ''].filter(Boolean).join(' · ')}
					</p>
				{/if}
				{#if selected.route}
					<p class="pc-route mono">
						{selected.route.o.iata || selected.route.o.icao} → {selected.route.d.iata ||
							selected.route.d.icao}
					</p>
					{#if selected.route.o.city || selected.route.d.city}
						<p class="pc-route-full">
							{selected.route.o.name || selected.route.o.city || '—'} → {selected.route.d.name ||
								selected.route.d.city ||
								'—'}
						</p>
					{/if}
				{/if}
				<p class="pc-meta mono">
					{fmtAlt(selected.alt)} · {fmtSpd(selected.gs)}{#if fmtVs(selected.vrate) !== '—'}
						· {fmtVs(selected.vrate)}{/if} · {fmtDist(selected.distNm)}
				</p>
				{#if photo && photo !== 'loading' && photo.credit}
					<p class="pc-credit">
						Photo:
						{#if photo.url}<a href={photo.url} target="_blank" rel="noopener noreferrer"
								>{photo.credit}<span class="ext-ico">{@html EXTERNAL_SVG}</span></a
							>{:else}{photo.credit}{/if} · Wikimedia
					</p>
				{/if}
			</div>
			<button type="button" class="pc-close" onclick={closePhoto} aria-label="Close photo">×</button>
		</div>
	{/if}

	{#if status === 'loading'}
		<p class="msg">Tuning the scope…</p>
	{:else if status === 'error'}
		<p class="msg">Couldn’t reach the traffic feed. Retrying…</p>
	{:else if status === 'empty'}
		<p class="msg">No aircraft in range right now. Quiet skies over {sel.iata}.</p>
	{:else}
		<div class="scroll" bind:clientWidth={boardW}>
			<table class="board">
				<thead>
					<tr>
						<th class="dir-head" title="Direction relative to this field — arriving, departing, or passing overhead"><span class="dir-timer">{@render ringButton()}</span></th>
						<th title="Callsign (or Mode-S hex code when no callsign is broadcast)">Flight</th>
						<th class="x1" title="Registration / tail number">Reg</th>
						<th title="ICAO aircraft type — tap a row to see a photo">Type</th>
						<th class="x2" title="Airline, or owner / operator">Operator</th>
						<th class="num" title="Barometric altitude — FL### is flight level (hundreds of feet); GND is on the ground">Alt</th>
						<th class="num x1" title="Vertical speed — ▲ climbing, ▼ descending, in feet per minute">V/S</th>
						<th class="num" title="Ground speed, in knots">Spd</th>
						<th class="num x1" title="Heading / ground track, in degrees">Hdg</th>
						<th class="route" title="Origin → destination (falls back to current heading when the route is unknown)">Route</th>
						<th class="num" title="Distance from the field, in nautical miles">Dist</th>
					</tr>
				</thead>
				<tbody>
					{#each tracks as p, i (p.hex)}
						<tr
							class="row"
							class:enter={p.status === 'enter'}
							class:leave={p.status === 'leave'}
							style="--stagger:{p.stagger}; --ri:{i}"
							animate:flip={{ duration: 360, easing: cubicOut }}
						>
							<td>
								<div class="ci">{#if p.tag}<span class="tag {p.tag}">{TAG_LABEL[p.tag]}</span>{/if}</div>
							</td>
							<td class="mono flight">
								<div class="ci">{#key p.call || p.hex}<SplitFlap
											{...FLAP}
											start={flapStart(p, i)}
											text={p.call || p.hex || '—'}
										/>{/key}</div>
							</td>
							<td class="mono x1">
								<div class="ci">{#key p.reg}<SplitFlap {...FLAP} start={flapStart(p, i)} text={p.reg || '—'} />{/key}</div>
							</td>
							<td class="mono">
								<div class="ci">{#if TYPE_TITLES[p.type]}<button
											type="button"
											class="type-btn"
											onclick={() => openPhoto(p)}
										>{#key p.type}<SplitFlap {...FLAP} start={flapStart(p, i)} text={p.type} />{/key}</button
										>{:else}{#key p.type}<SplitFlap {...FLAP} start={flapStart(p, i)} text={p.type || '—'} />{/key}{/if}</div>
							</td>
							<!-- Tooltip only when the flaps ran out — a tooltip that repeats the text
							     you can already read is just noise. -->
							<td class="mono op x2" title={p.opShort !== p.opLabel ? p.opLabel : undefined}>
								<div class="ci">{#key p.opShort}<SplitFlap {...FLAP} start={flapStart(p, i)} text={p.opShort || '—'} label={p.opLabel || '—'} />{/key}</div>
							</td>
							<td class="mono num">
								<div class="ci">{#key fmtAlt(p.alt)}<SplitFlap {...FLAP} start={flapStart(p, i)} text={fmtAlt(p.alt)} />{/key}</div>
							</td>
							<td class="mono num x1 vs">
								<div class="ci">{#key fmtVs(p.vrate)}<SplitFlap {...FLAP} start={flapStart(p, i)} text={fmtVs(p.vrate)} />{/key}</div>
							</td>
							<td class="mono num">
								<div class="ci">{#key fmtSpd(p.gs)}<SplitFlap {...FLAP} start={flapStart(p, i)} text={fmtSpd(p.gs)} />{/key}</div>
							</td>
							<td class="mono num x1">
								<div class="ci">{#key fmtHdg(p.track)}<SplitFlap {...FLAP} start={flapStart(p, i)} text={fmtHdg(p.track)} />{/key}</div>
							</td>
							<td class="mono route">
								<!-- Enter: blank while the row opens, then the reason flaps IN (active), then
								     flaps on to the real route once live. Leave: hold the real route until this
								     row's turn, then flap route → reason (LANDED/…). -->
								<div class="ci">{#if p.status === 'enter' && !p.active}{:else if p.active}{#key p.reason}<SplitFlap
											{...FLAP}
											start={0}
											text={p.reason}
										/>{/key}{:else if p.route}{#key `${p.route.o.iata || p.route.o.icao} ${p.route.d.iata || p.route.d.icao}`}<SplitFlap
											{...FLAP}
											start={booted ? 0 : i * ROW_STEP}
											text={`${p.route.o.iata || p.route.o.icao || '???'} → ${p.route.d.iata ||
												p.route.d.icao ||
												'???'}`}
										/>{/key}{:else}<span class="hdg">hdg {fmtHdg(p.track)}</span>{/if}</div>
							</td>
							<td class="mono num">
								<div class="ci">{#key fmtDist(p.distNm)}<SplitFlap
											{...FLAP}
											start={flapStart(p, i)}
											text={fmtDist(p.distNm)}
										/>{/key}</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="key" aria-label="Tag key">
			<span class="key-item"><span class="tag arr">Arr</span> <span class="key-label">Arriving</span> <span class="key-count">({counts.arr})</span></span>
			<span class="key-item"><span class="tag dep">Dep</span> <span class="key-label">Departing</span> <span class="key-count">({counts.dep})</span></span>
			<span class="key-item"><span class="tag over">Ovr</span> <span class="key-label">Overflight</span> <span class="key-count">({counts.ovr})</span></span>
		</div>
	{/if}

		<p class="src">
			{#if sel.demo}
				Demo field — fictional traffic from Ace Combat's Strangereal, served locally with no
				API calls. Real fields use live ADS-B via <span class="mono">airplanes.live</span>
				(<span class="mono">adsb.lol</span> fallback) and routes via <span class="mono">adsbdb</span>.
			{:else}
				Live ADS-B via <span class="mono">airplanes.live</span> (<span class="mono">adsb.lol</span>
				fallback); routes via <span class="mono">adsbdb</span>. Aircraft without a public route show
				a heading instead.
			{/if}
		</p>

		<!-- The Connections nav is authored in +page (the onward snippet), so its .onward markup
		     carries +page's scope, not this component's — hence the wrapper, which this board CAN
		     style, to give the area the same rise-in the generic panel's body content gets (the
		     board renders its own .tfc-body, so it misses the .surface-body entrance). -->
		<div class="tfc-connections">{@render connections?.()}</div>
	</div>
</div>

<style>
	/* The board owns the whole panel interior: a header that stays put, over a body that
	   scrolls (same shape as the generic .surface-head/.surface-body pair). It used to be
	   the other way — the whole panel scrolled under a sticky header — but that leaned on
	   the header PAINTING over the rows, and a glass header has no paint to cover them
	   with: rows read straight through the wash. So the body clips them at its top edge
	   instead, and the header needs no background at all. */
	.tfc {
		display: flex;
		flex-direction: column;
		height: 100%;
		position: relative; /* anchors the compact expand toggle */
	}
	/* Back / super-bar end caps / compact expand toggle all use the shared .icon-btn (in
	   tokens.css) so every panel control reads the same; only per-button placement differs
	   (below, near each usage). */
	@media (max-width: 900px) {
		.expand-compact {
			display: none; /* phone bottom-sheet is already full width */
		}
	}
	/* Top-right corner: the live refresh control paired with the expand/collapse toggle. */
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
		/* The deck (flex:1) pushes this to the far-right edge, opposite the back cap. */
		margin-left: auto;
	}
	.tfc-head {
		flex: none;
		/* No background: the header is the same glass as the body — one surface (see
		   .surface-head). It stays put because the BODY owns the scroll, not because it's
		   sticky; the rows never pass beneath it, so there's nothing to cover. (The compact
		   expand button is anchored to .tfc, whose top edge this header shares.) */
		/* No rule, and a tighter bottom — same as every other panel's header (see .surface-head).
		   The old bottom room existed to hold the title's descenders off that rule. */
		padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1.5rem, 4vw, 2.75rem) clamp(0.85rem, 1.5vw, 1.25rem);
	}
	.tfc-body {
		/* The panel's scroller: rows clip at this box's top edge — under the glass header
		   they never go. */
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		/* Safari repaints exposed strips as the board scrolls; without containment each
		   strip's invalidation walks the whole table. contain lets it stop at the box. */
		contain: layout style;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: clamp(1.25rem, 3vw, 1.75rem) clamp(1.5rem, 4vw, 2.75rem) 2rem;
	}
	/* The body's children keep their natural height and OVERFLOW the box — that's what makes
	   the body scroll. Left shrinkable, flex would squeeze the table into the box instead and
	   hand the scrolling to .scroll's own overflow, headlessly. */
	.tfc-body > * {
		flex-shrink: 0;
		/* Query against the body's own width so extra columns appear only when the
		   panel is wide (expanded on a big viewport) — the compact panel is untouched. */
		container-type: inline-size;
	}
	/* Panel chrome, matched to the generic .surface-head so ATFC reads like every other
	   destination panel (this board just renders it itself). */
	/* Back is an icon circle on the left, matching the refresh control (shared styling
	   in the .icon-circle group above; only its placement is set here). */
	.back {
		align-self: flex-start;
		/* Match the header's top/left edge inset so the back button is evenly framed rather
		   than crowding the title below it (mirrors the generic .surface-head). */
		margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
	}
	.dest {
		margin: 0;
		/* Exact homepage wordmark scale, so the title dominates the 30px refresh circle the
		   same way "Kashinoga" dominates its control dots. */
		font-size: clamp(2.25rem, 9vw, 5.5rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--ink);
		/* One line always. A two-word title ("Terminal Way") has a hard time at this scale, and
		   the wordmark shares the super bar with the deck — so it must never reflow, wrapped or
		   otherwise. The flap itself no longer widens mid-flip (see SplitFlap's .cell); this
		   keeps the title off a second line when the bar simply runs out of room. */
		white-space: nowrap;
	}
	/* The title's own row: "Air Traffic" on the left, the control deck filling the
	   whole band to its right. Wraps to stacked only if it ever gets tight (the deck
	   renders past 900px, so that's a safety net). */
	.title-row {
		display: flex;
		/* Rest the refresh controls' bottoms on the title's text baseline (an icon-only
		   button synthesizes its baseline at its bottom edge) — like the masthead's
		   quick-settings bullets sitting on the wordmark baseline. */
		align-items: baseline;
		gap: 0.5rem clamp(0.85rem, 2vw, 1.5rem);
		flex-wrap: wrap;
	}
	.title-row .dest {
		flex: none;
	}
	/* Decorative accent dot beside the title — mirrors the homepage masthead's dots sitting
	   next to the wordmark. Deliberately NOT a flex container: as a plain inline-block the
	   dot keeps its true bottom-edge baseline so `align-items: baseline` on the row rests it
	   on the title's text baseline (a flex item's baseline synthesizes from the wrong edge in
	   Firefox and floats it). font-size:0 collapses whitespace so nothing perturbs that. */
	.head-refresh {
		display: inline-block;
		font-size: 0;
	}
	/* Nonfunctional station-sign bullet in the app's accent colour (the live refresh control
	   lives in the top-right corner). Empty inline-block → bottom-edge baseline. */
	.accent-dot {
		display: inline-block;
		width: 30px;
		height: 30px;
		border-radius: 999px;
		background: var(--accent);
	}
	@media (prefers-reduced-motion: no-preference) {
		/* Roll + fade in on mount, matching the homepage masthead dots (same easing, duration,
		   and delay) — it slides in from the left with a little bounce as the title flips. */
		.accent-dot {
			animation: dot-in 0.45s var(--spring) 0.5s backwards;
		}
	}
	@keyframes dot-in {
		from {
			opacity: 0;
			transform: translateX(-1.2rem);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	/* Chrome entrance. The board's controls slide up-from-the-left in placement order, on the
	   shared btn-in keyframe — Back, then the field pills, then Range, Refresh, and the
	   collapse cap in the expanded bar; the same run stacked into the compact panel. Each
	   element's --bn (set on the markup, or inherited from a wrapper) is its rung on the
	   ripple; the beat is the tight --btn-enter-step, since a dozen-plus controls end to end
	   want to populate briskly, not deal out like prose.

	   The group LABELS ride along on the same beat as the controls they head — the
	   Field/Range/Refresh captions, the summary readout. A label inherits its --bn from the
	   same wrapper its control does, so "Field" arrives with the first pill and "Range" with its
	   select, rather than sitting there fully drawn while the buttons beside it slide in under it.

	   It replays on every expand/collapse, because {#if showDeck} swaps the whole header — the
	   controls remount and re-run, so the bar assembles itself each time it changes shape.

	   `backwards` is mandatory for the buttons, not stylistic: every one is in the universal
	   hover/press list, whose scale() lives on a transition. A held (`both`) animation transform
	   would outrank that transition and freeze the pop; lifting the fill the instant the entrance
	   ends hands the buttons back to their hover spring untouched. The labels don't hover, but
	   they share the rule for one timing, so they take the same fill. */
	@media (prefers-reduced-motion: no-preference) {
		.tfc-head .icon-btn,
		.tfc-head .field,
		.tfc-head .field-select,
		.tfc-head .manual,
		.tfc-head .ctl-label,
		.tfc-head .deck-summary dt,
		.tfc-head .deck-summary dd,
		.fields .field-select,
		.fields .range-label {
			animation: btn-in 0.42s var(--spring) backwards;
			animation-delay: calc(var(--enter-lead) + var(--bn, 0) * var(--btn-enter-step));
		}
		/* The readout deals in label-then-value, In range before Updated — four beats past
		   Refresh (13), before the right end-cap (18/19). */
		.deck-summary .stat:nth-child(1) dt {
			--bn: 14;
		}
		.deck-summary .stat:nth-child(1) dd {
			--bn: 15;
		}
		.deck-summary .stat:nth-child(2) dt {
			--bn: 16;
		}
		.deck-summary .stat:nth-child(2) dd {
			--bn: 17;
		}
		/* The Connections nav closes the board's body — it rises in like any panel's content,
		   one layer-beat after the header chrome, so the interior reads top (title) to bottom
		   (onward links) rather than the links sitting there fully drawn on arrival. */
		.tfc-connections {
			animation: rise 0.5s ease backwards;
			animation-delay: calc(var(--enter-lead) + var(--enter-layer));
		}
	}

	/* ── Board body entrance — first fill only (.booting) ────────────────────────────────────
	   The header assembles via the chrome ripple above; the body follows the same idea a layer
	   deeper. The compact summary rises, the table headers slide in left-to-right, then each
	   row's top rule draws and its cells rise into it — the lines visibly emerging the rows —
	   and the Arr/Dep/Ovr legend deals in. Keyed off the column order or the row index (--ri),
	   capped so a long board doesn't trail on. `backwards` throughout: the type buttons nested
	   in the rows are in the universal hover/press list. */
	/* EXPANDED, the body waits its turn: the super bar's full ripple runs to rung 19
	   (≈0.12s lead + 19 × 0.035s + the 0.42s slide ≈ 1.2s), and data drawing under a
	   still-assembling chrome read as two scenes talking over each other. Deepening
	   --enter-layer holds the table (and the closing Connections nav, which shares the
	   token) until the bar has landed — chrome first, then, finally, the data. Compact
	   keeps the stock beat: its chrome is a short stack, not a 19-rung bar. */
	.tfc.expanded {
		--enter-layer: 1.1s;
	}
	@media (prefers-reduced-motion: no-preference) {
		.booting .board-head {
			animation: rise 0.5s ease backwards;
			animation-delay: var(--enter-lead);
		}
		.booting thead th {
			animation: btn-in 0.42s var(--spring) backwards;
			animation-delay: calc(var(--enter-lead) + var(--bn, 0) * var(--btn-enter-step));
		}
		.booting thead th:nth-child(1) {
			--bn: 0;
		}
		.booting thead th:nth-child(2) {
			--bn: 1;
		}
		.booting thead th:nth-child(3) {
			--bn: 2;
		}
		.booting thead th:nth-child(4) {
			--bn: 3;
		}
		.booting thead th:nth-child(5) {
			--bn: 4;
		}
		.booting thead th:nth-child(6) {
			--bn: 5;
		}
		.booting thead th:nth-child(7) {
			--bn: 6;
		}
		.booting thead th:nth-child(8) {
			--bn: 7;
		}
		.booting thead th:nth-child(9) {
			--bn: 8;
		}
		.booting thead th:nth-child(10) {
			--bn: 9;
		}
		.booting thead th:nth-child(11) {
			--bn: 10;
		}
		/* Each row's top rule draws in, then its cells rise into it — line, then row. A tight
		   per-row beat one layer past the headers, capped since a full board runs to a couple
		   dozen rows. The cells' flaps run inside, so the row keeps materialising after it lands. */
		.booting tbody td {
			animation: line-in 0.3s ease backwards;
			animation-delay: calc(
				var(--enter-lead) + var(--enter-layer) + min(var(--ri, 0), 14) * 0.028s
			);
		}
		.booting tbody .ci {
			animation: rise 0.44s ease backwards;
			animation-delay: calc(
				var(--enter-lead) + var(--enter-layer) + min(var(--ri, 0), 14) * 0.028s + 0.05s
			);
		}
		.booting .key-item {
			animation: btn-in 0.42s var(--spring) backwards;
			animation-delay: calc(var(--enter-lead) + var(--enter-layer) + var(--bn, 0) * var(--btn-enter-step));
		}
		.booting .key-item:nth-child(1) {
			--bn: 0;
		}
		.booting .key-item:nth-child(2) {
			--bn: 1;
		}
		.booting .key-item:nth-child(3) {
			--bn: 2;
		}
	}
	/* The row rule fades up from nothing to its resting hairline (omitting `to` animates toward
	   the base border-top-color) — the line drawing itself in ahead of the cells that rise into it. */
	@keyframes line-in {
		from {
			border-top-color: transparent;
		}
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
	/* Field / Range / Refresh share one row, each group bumping to its own line only
	   when the band gets too narrow to hold them side by side. */
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
		gap: 0.4rem;
	}
	.ctl-label {
		flex: none;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--sub);
	}
	/* Glanceable live stats, right end of the deck. */
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

	/* ── Expanded: one super bar ───────────────────────────────────────────────
	   A single top band. Far edges are reserved for global app controls — back at
	   the left cap; the parent's absolute expand button at the right (padding-right
	   keeps clear of it). Identity → controls → summary ride in between, centred.
	   Fonts step down from the compact header but keep the same hierarchy: the
	   title is still the largest thing, then stat values, then labels. */
	.tfc-head.bar {
		/* Same stay-put glass header as .tfc-head; this just re-lays the bar.
		   One inset drives the padding (all four sides) AND the flex gap, so the back cap sits
		   in an evenly-framed pocket — equal space above, below, left, and to the title — and
		   the right collapse cap mirrors it. */
		--bar-inset: clamp(0.7rem, 1.3vw, 1rem);
		display: flex;
		align-items: center;
		gap: var(--bar-inset);
		padding: var(--bar-inset);
	}
	/* With no rule under the bar, the body's old top gap had nothing to hold itself off, and the
	   table read as adrift from the header. Halve it: the bar's own bottom inset already separates
	   them, and the table's first row is a header of its own. (Compact keeps the roomier value — its
	   header is a full-height title block, not a strip.) */
	.expanded .tfc-body {
		padding-top: clamp(0.6rem, 1.2vw, 0.9rem);
	}
	/* Global-control end caps — matched to the parent's expand button so back/expand
	   read as one set framing the bar (shared styling in the .icon-circle group above). */
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
	/* Scale the decorative dot down to match the dense bar title, so it reads as a small
	   accent beside "Air Traffic" rather than towering over it. */
	.bar .accent-dot {
		width: 20px;
		height: 20px;
	}
	/* In the dense bar the small title's baseline would leave the (relatively large) dot
	   poking above the caps; centre it on the text instead so it reads as aligned. */
	.bar .head-refresh {
		align-self: center;
	}
	/* Denser, lighter pills + labels in the bar — the table is the focus, so the
	   surrounding controls read quietly (regular weight, not bold). */
	.bar .field {
		padding: 0.25rem 0.5rem;
		font-size: 0.8rem;
		font-weight: 500;
	}
	.bar .field.on {
		font-weight: 600;
	}
	.bar .field-select {
		padding: 0.25rem 1.5rem 0.25rem 0.5rem;
		font-size: 0.8rem;
		background-size: 0.75rem;
	}
	.bar .ctl-label {
		font-size: 0.66rem;
		font-weight: 600;
	}
	.bar .deck-summary {
		gap: 1.1rem;
	}
	.bar .stat dt {
		font-size: 0.64rem;
	}
	.bar .stat dd {
		font-size: 1rem;
	}
	/* Extra board columns, revealed by width. x1 = narrow (reg / vertical rate /
	   heading); x2 = the wide operator column, held back until there's real room. */
	.board :is(th, td).x1,
	.board :is(th, td).x2 {
		display: none;
	}
	@container (min-width: 720px) {
		.board :is(th, td).x1 {
			display: table-cell;
		}
	}
	@container (min-width: 940px) {
		.board :is(th, td).x2 {
			display: table-cell;
		}
	}
	/* The operator column's width is capped by truncating the name (OP_FLAPS), not here:
	   under auto table layout a max-width on a cell is ignored, so the rule that used to
	   live here never held the column and long names overflowed onto Alt. */
	/* Climb green / descent muted, echoing the arriving-tag colour language. */
	.vs {
		color: color-mix(in srgb, var(--ink) 80%, var(--sub));
	}
	.lead {
		margin: 0;
		max-width: 62ch;
		line-height: 1.5;
		color: color-mix(in srgb, var(--ink) 82%, var(--sub));
	}
	/* Edit Mode affordance, matched to the page's .editable. */
	.editable {
		outline: 1px dashed color-mix(in srgb, var(--ink) 35%, transparent);
		outline-offset: 3px;
		border-radius: 3px;
		cursor: text;
		transition: outline-color 0.15s ease, background 0.15s ease;
	}
	.editable:hover {
		background: color-mix(in srgb, var(--ink) 4%, transparent);
	}
	.editable:focus {
		outline: var(--focus-ring);
		background: color-mix(in srgb, var(--ink) 5%, transparent);
	}
	/* The compact panel's controls, at every width: Airport, Range and Refresh on ONE row, each a
	   labelled column with its dropdown below. (The field is a <select> here — the pills only
	   appear in the expanded super bar.) */
	.controls-compact {
		display: flex;
		flex-direction: row;
		align-items: flex-start;
		gap: 0.5rem;
	}
	.controls-compact .fields.ranges {
		flex: 1;
		min-width: 0;
		flex-direction: column;
		align-items: stretch;
		gap: 0.25rem;
	}
	.controls-compact .range-label {
		min-width: 0; /* no fixed column width — the label just caps its control */
	}
	.controls-compact .field-select {
		width: 100%;
		box-sizing: border-box;
	}
	.fields {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.ranges {
		align-items: flex-start;
	}
	.range-label {
		/* Fixed width so the three rows' controls line up in a column, with room for the
		   longest label ("Airport" / "Refresh"). */
		flex: none;
		min-width: 4.5rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.field {
		padding: 0.35rem 0.6rem;
		font: inherit;
		font-weight: 500;
		font-size: 0.85rem;
		letter-spacing: 0.03em;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1.5px solid var(--line-edge);
		border-radius: 8px;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
	}
	.field:hover {
		border-color: var(--line-strong);
	}
	.field.on {
		color: var(--paper);
		background: var(--accent);
		border-color: var(--accent);
	}
	.field:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	/* Range / Refresh are dropdowns — styled to echo the .field pills, with a custom
	   chevron (neutral grey reads on both themes) since a native arrow can't be themed. */
	.field-select {
		appearance: none;
		-webkit-appearance: none;
		padding: 0.35rem 1.7rem 0.35rem 0.6rem;
		font: inherit;
		font-weight: 500;
		font-size: 0.85rem;
		letter-spacing: 0.03em;
		color: var(--ink);
		background-color: color-mix(in srgb, var(--ink) 4%, transparent);
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.5rem center;
		background-size: 0.8rem;
		border: 1.5px solid var(--line-edge);
		border-radius: 8px;
		cursor: pointer;
		transition: border-color 0.15s ease, background-color 0.15s ease;
	}
	.field-select:hover {
		border-color: var(--line-strong);
	}
	.field-select:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.board-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		border-bottom: 1px solid var(--line-edge);
		padding-bottom: 0.4rem;
	}
	.board-head h3 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 700;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}
	.upd {
		font-size: 0.82rem;
		color: var(--sub);
		font-variant-numeric: tabular-nums;
	}
	/* Refresh countdown ring — doubles as the play/pause toggle. */
	.refresh {
		position: relative;
		display: inline-grid;
		place-items: center;
		width: 32px;
		height: 32px;
		flex: none;
		padding: 0;
		background: none;
		border: 0;
		cursor: pointer;
	}
	.refresh:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
		border-radius: 50%;
	}
	/* Manual "refresh now" — an icon button beside the title, circled like the homepage
	   masthead's control dots (subtle fill + ring around the glyph). The glyph is
	   ABSOLUTELY positioned (centred via inset:0 + margin:auto) so the button has no
	   in-flow content: as a flex item its baseline is then synthesized from the bottom
	   border edge, which is what `align-items: baseline` rests on the title's text
	   baseline. (If the glyph were in flow, the button would inherit the glyph's own
	   baseline — mid-circle — and float up off the line.) */
	.manual {
		position: relative;
	}
	/* Spin on press — the flourish it always had. There's no fill to darken any more: the disc is
	   the icon, so the press reads on the glyph itself (see .icon-btn:active in puhig). */
	.manual:active {
		transform: rotate(-90deg);
	}
	.ring {
		width: 32px;
		height: 32px;
		transform: rotate(-90deg);
	}
	.ring-track {
		fill: none;
		stroke: color-mix(in srgb, var(--ink) 12%, transparent);
		stroke-width: 3;
	}
	.ring-arc {
		fill: none;
		stroke: var(--accent);
		stroke-width: 3;
		stroke-linecap: round;
		/* NO transition on stroke-dashoffset, and it matters more than it looks: the timer
		   ticks every 200ms, so a 0.2s transition here meant the arc was ANIMATING ON EVERY
		   FRAME, forever — and each frame's repaint forced the panel's backdrop blur (Bubble's
		   glass, now the default) to re-filter its full surface. Measured at idle on the
		   board: ~20% of frames blown past budget, entirely recovered by removing this line.
		   The un-smoothed step is ~0.3% of the circumference per tick — invisible. */
	}
	.is-paused .ring-arc {
		stroke: color-mix(in srgb, var(--ink) 28%, transparent);
	}
	.ring-num {
		position: absolute;
		font-size: 0.62rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--sub);
	}
	/* Center action glyph: pause (playing) or play (paused). Shown on hover/focus
	   while playing, always while paused; the number hides to make room. */
	.ring-ico {
		position: absolute;
		display: none;
		place-items: center;
		color: var(--ink);
	}
	.ring-ico :global(svg) {
		width: 11px;
		height: 11px;
		display: block;
	}
	.refresh:hover .ring-num,
	.refresh:focus-visible .ring-num,
	.is-paused .ring-num {
		display: none;
	}
	.refresh:hover .ring-ico,
	.refresh:focus-visible .ring-ico,
	.is-paused .ring-ico {
		display: grid;
	}
	.tip {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 5;
		width: max-content;
		max-width: 220px;
		padding: 0.5rem 0.7rem;
		font-size: 0.78rem;
		line-height: 1.45;
		color: var(--paper);
		/* Reads above the board by inverting — near-solid ink on a light panel — the same
		   device the site's .edit-toast uses. No drop shadow. */
		background: color-mix(in srgb, var(--ink) 92%, transparent);
		border-radius: 8px;
		opacity: 0;
		transform: translateY(-3px);
		pointer-events: none;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}
	.refresh:hover .tip,
	.refresh:focus-visible .tip {
		opacity: 1;
		transform: translateY(0);
	}
	.msg {
		margin: 0.4rem 0;
		color: var(--sub);
	}
	/* Live-data activity meter — a slim accent bar. Determinate (width fills) while route
	   lookups land one by one; indeterminate (a segment sweeps) while the ADS-B fetch is in
	   flight before any rows exist. Auto-hides (slides away) once everything's resolved. */
	.route-prog {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.rp-track {
		position: relative; /* anchors the sweeping indeterminate segment */
		flex: 1;
		height: 3px;
		border-radius: 999px;
		background: var(--line);
		overflow: hidden;
	}
	.rp-fill {
		height: 100%;
		border-radius: 999px;
		background: var(--accent);
		transition: width 0.3s ease;
	}
	/* Indeterminate: a 40%-wide segment sweeping left→right, for the pre-results fetch when
	   there's no count to fill toward yet. */
	.rp-indef {
		position: absolute;
		inset: 0 auto 0 0;
		width: 40%;
		animation: rp-sweep 1.1s ease-in-out infinite;
	}
	@keyframes rp-sweep {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(250%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rp-indef {
			position: static;
			width: 100%;
			opacity: 0.55;
			animation: none;
		}
	}
	.rp-text {
		flex: none;
		font-size: 0.72rem;
		color: var(--sub);
		font-variant-numeric: tabular-nums;
	}
	.scroll {
		overflow-x: auto;
	}
	.board {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	.board th {
		text-align: left;
		/* The direction column's header holds the countdown timer (taller than the text
		   labels), so centre every header in the row. */
		vertical-align: middle;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--sub);
		padding: 0 0.6rem 0.4rem 0;
		white-space: nowrap;
	}
	/* Each header carries a title tooltip explaining its abbreviation. */
	.board th[title] {
		cursor: help;
	}
	/* Direction column header — the refresh countdown timer lives here, with a little
	   breathing room above the first row's tag pill. */
	.board th.dir-head {
		padding-bottom: 0.55rem;
		line-height: 0;
	}
	/* Box the timer to a tag pill's width and centre it inside, so it sits directly over
	   the left-aligned ARR/DEP/OVR pills regardless of how wide the column stretches. */
	.dir-timer {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3.4em;
		font-size: 0.68rem;
	}
	/* At the left edge, open the timer's tooltip rightward so it isn't clipped. */
	.board th.dir-head .tip {
		right: auto;
		left: 0;
	}
	.board td {
		--row-line: color-mix(in srgb, var(--ink) 8%, transparent);
		padding: 0.34rem 0.6rem 0.34rem 0;
		border-top: 1px solid var(--row-line);
		white-space: nowrap;
	}

	/* ── Row entry / exit ──────────────────────────────────────────────────────
	   Each cell's content sits in a .ci wrapper that can collapse to nothing, so an
	   entering or leaving row animates its full height and the rows below reflow
	   smoothly instead of popping. .ci is only clipped mid-animation, so a settled
	   row never crops a split-flap descender. Timings mirror the ENTER_/LEAVE_ ms. */
	.ci {
		display: block;
	}
	.row.enter .ci,
	.row.leave .ci {
		overflow: hidden;
	}
	/* Per-row offset: the row's slot × 700ms (== STAGGER_MS). Because that's a whole
	   row's duration, each row opens/closes entirely before the next one starts. */
	.row {
		--sd: calc(var(--stagger, 0) * 700ms);
	}
	.row.enter .ci {
		animation: ciIn 0.45s cubic-bezier(0.33, 1, 0.68, 1) both;
		animation-delay: var(--sd);
	}
	.row.enter td {
		animation: padIn 0.45s cubic-bezier(0.33, 1, 0.68, 1) both;
		animation-delay: var(--sd);
	}
	.row.leave .ci {
		/* 1.2s = HOLD_MS: the reason flaps in at the row's turn and lingers, THEN the
		   row eases shut — the collapse never overlaps the flap. */
		animation: ciOut 0.4s cubic-bezier(0.65, 0, 0.35, 1) both;
		animation-delay: calc(1.2s + var(--sd));
	}
	.row.leave td {
		animation: padOut 0.4s cubic-bezier(0.65, 0, 0.35, 1) both;
		animation-delay: calc(1.2s + var(--sd));
	}
	/* Collapse the real content height (max-height sits just above a single line, so
	   there's no dead zone before it starts moving). Opacity lives on the td below,
	   not here, so the row's top border fades out in step with the collapse instead
	   of staying solid and snapping onto the next row's border. */
	@keyframes ciIn {
		from {
			max-height: 0;
		}
		to {
			max-height: 1.5rem;
		}
	}
	@keyframes ciOut {
		from {
			max-height: 1.5rem;
		}
		to {
			max-height: 0;
		}
	}
	@keyframes padIn {
		from {
			padding-top: 0;
			padding-bottom: 0;
			opacity: 0;
			border-top-color: transparent;
		}
		to {
			padding-top: 0.34rem;
			padding-bottom: 0.34rem;
			opacity: 1;
			border-top-color: var(--row-line);
		}
	}
	@keyframes padOut {
		from {
			padding-top: 0.34rem;
			padding-bottom: 0.34rem;
			opacity: 1;
			border-top-color: var(--row-line);
		}
		to {
			padding-top: 0;
			padding-bottom: 0;
			opacity: 0;
			border-top-color: transparent;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.row.enter .ci,
		.row.leave .ci,
		.row.enter td,
		.row.leave td {
			animation: none;
		}
		.row.enter .ci,
		.row.leave .ci {
			overflow: visible;
			max-height: none;
		}
	}
	.mono {
		font-variant-numeric: tabular-nums;
		font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
	}
	.num {
		text-align: right;
	}
	/* Right-align the numeric headers too — `.board th` would otherwise force them
	   left, so header and values drift apart in the wide expanded panel. Extra
	   right padding keeps a right-aligned number off the next (left-aligned) column. */
	.board th.num,
	.board td.num {
		text-align: right;
		padding-right: 1.5rem;
	}
	.flight {
		font-weight: 700;
	}
	.route {
		white-space: nowrap;
	}
	.hdg {
		color: var(--sub);
	}
	.tag {
		display: inline-block;
		/* Wide enough that all 3-letter tags sit inside it, so every pill is identical
		   width regardless of the letters' natural widths. */
		box-sizing: border-box;
		width: 3.4em;
		text-align: center;
		padding: 0.05rem 0.35rem;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		border-radius: 5px;
		color: var(--paper);
	}
	.tag.arr {
		background: #12a150;
	}
	.tag.dep {
		background: var(--accent);
	}
	.tag.over {
		background: color-mix(in srgb, var(--ink) 45%, transparent);
	}
	/* The direction chip springs in whenever it mounts — which, once the board has booted, is on
	   a field switch: the table re-keys, the cells flap, and the tags used to just appear beside
	   them. Staggered down the board by row (--ri). On the first fill and on a live arrival the
	   row's own reveal (the .booting .ci rise, or .enter's padIn) holds the whole cell at opacity
	   0 across this pop, so it's masked there and only actually shows on a field switch. */
	@media (prefers-reduced-motion: no-preference) {
		.tag {
			animation: pop 0.4s ease-out backwards;
			animation-delay: calc(min(var(--ri, 0), 14) * 0.028s);
		}
	}
	/* Key for the arriving / departing / overflight tags — one row. */
	.key {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 1rem;
		font-size: 0.78rem;
		color: var(--sub);
	}
	.key-item {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.key-count {
		font-variant-numeric: tabular-nums;
		color: color-mix(in srgb, var(--sub) 75%, transparent);
	}
	/* Clickable aircraft type → opens the photo card. */
	.type-btn {
		font: inherit;
		color: var(--ink);
		background: none;
		border: 0;
		padding: 0;
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, var(--ink) 35%, transparent);
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.type-btn:hover {
		color: var(--accent);
	}
	.type-btn:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
		border-radius: 3px;
	}
	/* Photo card that slides in when a type is tapped. */
	.photo-card {
		position: relative;
		display: flex;
		gap: 0.9rem;
		padding: 0.7rem;
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1.5px solid var(--line-edge);
		border-radius: 12px;
	}
	.pc-img {
		flex: none;
		width: 40%;
		max-width: 240px;
		aspect-ratio: 3 / 2;
		border-radius: 8px;
		overflow: hidden;
		background: color-mix(in srgb, var(--ink) 6%, transparent);
		display: grid;
		place-items: center;
	}
	.pc-img img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.pc-ph {
		font-size: 0.8rem;
		color: var(--sub);
		text-align: center;
		padding: 0.5rem;
	}
	.pc-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		/* Clears the close button (0.6rem inset + 32px) so text never runs under it. */
		padding-right: 2.6rem;
	}
	.pc-title {
		margin: 0;
		font-weight: 700;
		font-size: 1.02rem;
	}
	.pc-sub,
	.pc-route,
	.pc-meta {
		margin: 0;
		font-size: 0.85rem;
		color: var(--sub);
	}
	.pc-op {
		margin: 0.1rem 0 0;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--ink);
	}
	.pc-route-full {
		margin: 0;
		font-size: 0.8rem;
		color: var(--sub);
	}
	/* The outbound mark, same as the site's — see .ext-ico in +page.svelte. */
	.ext-ico {
		display: inline-block;
		vertical-align: -0.1em;
		width: 0.85em;
		height: 0.85em;
		margin-left: 0.3em;
	}
	.ext-ico :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
	.pc-credit {
		margin: 0.3rem 0 0;
		font-size: 0.72rem;
		color: var(--sub);
	}
	.pc-credit a {
		color: inherit;
		text-decoration: underline;
	}
	/* Sits over the photo once the card stacks (see the phone breakpoint below), so it
	   carries its own opaque chip rather than relying on whatever the image happens to be
	   behind it. Inset past the card's 12px corner radius, and sized to a real touch
	   target — at 24px it was both hard to hit and visually jammed into the corner. */
	.pc-close {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		padding: 0;
		line-height: 1;
		font-size: 1.15rem;
		color: var(--sub);
		background: var(--panel-fill-solid);
		/* A 1.5px ring, matching the card's own border — a line, not a shadow. */
		border: 1.5px solid var(--line-edge);
		border-radius: 8px;
		cursor: pointer;
	}
	.pc-close:hover {
		color: var(--ink);
		border-color: var(--line-strong);
	}
	.pc-close:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	@media (max-width: 520px) {
		.photo-card {
			flex-direction: column;
		}
		.pc-img {
			width: 100%;
			max-width: none;
		}
		/* Stacked, the photo runs the full width and the close button lands on it. Inset it
		   far enough to sit clear of the image's own 8px corner instead of straddling it,
		   and give it a phone-sized target. */
		.pc-close {
			top: 1rem;
			right: 1rem;
			width: 36px;
			height: 36px;
		}
		/* The info column is below the photo now — nothing to reserve space for. */
		.pc-info {
			padding-right: 0;
		}
	}
	.src {
		margin: 0.2rem 0 0;
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--sub);
	}
</style>
