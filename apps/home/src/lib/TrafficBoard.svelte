<script lang="ts">
	import { onMount, onDestroy, untrack, type Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import SplitFlap from '$lib/SplitFlap.svelte';

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
		connections
	}: {
		accent?: string;
		code?: string;
		title?: string;
		expanded?: boolean;
		onback?: () => void;
		onToggleExpand?: () => void;
		connections?: Snippet;
	} = $props();

	// The dense header deck is worth it only when the panel is both expanded AND wide
	// enough to lay controls + summary beside the title; otherwise (compact panel, or a
	// phone bottom-sheet that's "expanded" by persisted preference) fall back to the
	// stacked controls in the body.
	let wide = $state(false);
	const showDeck = $derived(expanded && wide);

	type Airport = { icao: string; iata: string; name: string; lat: number; lon: number; demo?: boolean };
	// A small curated field list — the selector. The default is GRACEMERIA, a fictional
	// Ace Combat field whose traffic is canned (see the demo block below) — so a first
	// visit exercises the whole board without touching the live ADS-B / route APIs. Pick
	// any real field to go live.
	const AIRPORTS: Airport[] = [
		{ icao: 'EMGR', iata: 'GRM', name: 'Gracemeria', lat: 0, lon: 0, demo: true },
		{ icao: 'KDSM', iata: 'DSM', name: 'Des Moines', lat: 41.534, lon: -93.6631 },
		{ icao: 'KORD', iata: 'ORD', name: 'Chicago O’Hare', lat: 41.9742, lon: -87.9073 },
		{ icao: 'KMSP', iata: 'MSP', name: 'Minneapolis', lat: 44.8848, lon: -93.2223 },
		{ icao: 'KDEN', iata: 'DEN', name: 'Denver', lat: 39.8561, lon: -104.6737 },
		{ icao: 'KDFW', iata: 'DFW', name: 'Dallas–Fort Worth', lat: 32.8998, lon: -97.0403 },
		{ icao: 'KATL', iata: 'ATL', name: 'Atlanta', lat: 33.6407, lon: -84.4277 },
		{ icao: 'KJFK', iata: 'JFK', name: 'New York JFK', lat: 40.6413, lon: -73.7781 },
		{ icao: 'KLAX', iata: 'LAX', name: 'Los Angeles', lat: 33.9416, lon: -118.4085 },
		{ icao: 'KSFO', iata: 'SFO', name: 'San Francisco', lat: 37.6213, lon: -122.379 },
		{ icao: 'KSEA', iata: 'SEA', name: 'Seattle', lat: 47.4502, lon: -122.3088 }
	];

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
		SU37: 'Sukhoi Su-37'
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

	const RANGES = [40, 60, 100, 150, 250]; // NM; 250 is the airplanes.live max
	// Auto-refresh cadence options. 1 minute is the default — ADS-B positions barely
	// move between polls and it's easy on the upstream feeds. Also selectable in-UI,
	// alongside a manual "refresh now".
	const INTERVALS = [
		{ ms: 30000, label: '30s' },
		{ ms: 60000, label: '1m' },
		{ ms: 120000, label: '2m' },
		{ ms: 300000, label: '5m' }
	];
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

	let sel = $state<Airport>(AIRPORTS[0]);
	let radiusNm = $state(60);
	let pollMs = $state(60000); // auto-refresh cadence; default 1 minute
	let planes = $state<Plane[]>([]);
	let status = $state<'loading' | 'ok' | 'empty' | 'error'>('loading');
	let updatedAt = $state<number | null>(null);
	let routeVer = $state(0); // bump when the route cache fills, to re-derive rows
	let nowTs = $state(Date.now()); // ticks so the refresh ring can count down
	let paused = $state(false); // auto-refresh on/off
	// reicon play / pause (outline).
	const PLAY_SVG =
		'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.23832 3.04445C5.65196 2.1818 3.75 3.31957 3.75 5.03299L3.75 18.9672C3.75 20.6806 5.65196 21.8184 7.23832 20.9557L20.0503 13.9886C21.6499 13.1188 21.6499 10.8814 20.0503 10.0116L7.23832 3.04445ZM2.25 5.03299C2.25 2.12798 5.41674 0.346438 7.95491 1.72669L20.7669 8.6938C23.411 10.1317 23.411 13.8685 20.7669 15.3064L7.95491 22.2735C5.41674 23.6537 2.25 21.8722 2.25 18.9672L2.25 5.03299Z" fill="currentColor"/></svg>';
	const PAUSE_SVG =
		'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.948 1.25H6.052C6.95048 1.24997 7.6997 1.24995 8.29448 1.32991C8.92228 1.41432 9.48908 1.59999 9.94455 2.05546C10.4 2.51093 10.5857 3.07773 10.6701 3.70552C10.7501 4.30031 10.75 5.04953 10.75 5.94801V18.052C10.75 18.9505 10.7501 19.6997 10.6701 20.2945C10.5857 20.9223 10.4 21.4891 9.94455 21.9445C9.48908 22.4 8.92228 22.5857 8.29448 22.6701C7.6997 22.7501 6.95048 22.75 6.052 22.75H5.94801C5.04953 22.75 4.30031 22.7501 3.70552 22.6701C3.07773 22.5857 2.51093 22.4 2.05546 21.9445C1.59999 21.4891 1.41432 20.9223 1.32991 20.2945C1.24995 19.6997 1.24997 18.9505 1.25 18.052V5.948C1.24997 5.04952 1.24995 4.3003 1.32991 3.70552C1.41432 3.07773 1.59999 2.51093 2.05546 2.05546C2.51093 1.59999 3.07773 1.41432 3.70552 1.32991C4.3003 1.24995 5.04952 1.24997 5.948 1.25ZM3.90539 2.81654C3.44393 2.87858 3.24644 2.9858 3.11612 3.11612C2.9858 3.24644 2.87858 3.44393 2.81654 3.90539C2.7516 4.38843 2.75 5.03599 2.75 6V18C2.75 18.964 2.7516 19.6116 2.81654 20.0946C2.87858 20.5561 2.9858 20.7536 3.11612 20.8839C3.24644 21.0142 3.44393 21.1214 3.90539 21.1835C4.38843 21.2484 5.03599 21.25 6 21.25C6.96401 21.25 7.61157 21.2484 8.09461 21.1835C8.55607 21.1214 8.75357 21.0142 8.88389 20.8839C9.0142 20.7536 9.12143 20.5561 9.18347 20.0946C9.24841 19.6116 9.25 18.964 9.25 18V6C9.25 5.03599 9.24841 4.38843 9.18347 3.90539C9.12143 3.44393 9.0142 3.24644 8.88389 3.11612C8.75357 2.9858 8.55607 2.87858 8.09461 2.81654C7.61157 2.7516 6.96401 2.75 6 2.75C5.03599 2.75 4.38843 2.7516 3.90539 2.81654ZM17.948 1.25H18.052C18.9505 1.24997 19.6997 1.24995 20.2945 1.32991C20.9223 1.41432 21.4891 1.59999 21.9445 2.05546C22.4 2.51093 22.5857 3.07773 22.6701 3.70552C22.7501 4.30031 22.75 5.04953 22.75 5.94801V18.052C22.75 18.9505 22.7501 19.6997 22.6701 20.2945C22.5857 20.9223 22.4 21.4891 21.9445 21.9445C21.4891 22.4 20.9223 22.5857 20.2945 22.6701C19.6997 22.7501 18.9505 22.75 18.052 22.75H17.948C17.0495 22.75 16.3003 22.7501 15.7055 22.6701C15.0777 22.5857 14.5109 22.4 14.0555 21.9445C13.6 21.4891 13.4143 20.9223 13.3299 20.2945C13.2499 19.6997 13.25 18.9505 13.25 18.052V5.94801C13.25 5.04953 13.2499 4.3003 13.3299 3.70552C13.4143 3.07773 13.6 2.51093 14.0555 2.05546C14.5109 1.59999 15.0777 1.41432 15.7055 1.32991C16.3003 1.24995 17.0495 1.24997 17.948 1.25ZM15.9054 2.81654C15.4439 2.87858 15.2464 2.9858 15.1161 3.11612C14.9858 3.24644 14.8786 3.44393 14.8165 3.90539C14.7516 4.38843 14.75 5.03599 14.75 6V18C14.75 18.964 14.7516 19.6116 14.8165 20.0946C14.8786 20.5561 14.9858 20.7536 15.1161 20.8839C15.2464 21.0142 15.4439 21.1214 15.9054 21.1835C16.3884 21.2484 17.036 21.25 18 21.25C18.964 21.25 19.6116 21.2484 20.0946 21.1835C20.5561 21.1214 20.7536 21.0142 20.8839 20.8839C21.0142 20.7536 21.1214 20.5561 21.1835 20.0946C21.2484 19.6116 21.25 18.964 21.25 18V6C21.25 5.03599 21.2484 4.38843 21.1835 3.90539C21.1214 3.44393 21.0142 3.24644 20.8839 3.11612C20.7536 2.9858 20.5561 2.87858 20.0946 2.81654C19.6116 2.7516 18.964 2.75 18 2.75C17.036 2.75 16.3884 2.7516 15.9054 2.81654Z" fill="currentColor"/></svg>';
	// reicon "refresh" (outline) — the manual refresh-now button.
	const REFRESH_SVG =
		'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M2.93077 11.2003C3.00244 6.23968 7.07619 2.25 12.0789 2.25C15.3873 2.25 18.287 3.99427 19.8934 6.60721C20.1103 6.96007 20.0001 7.42199 19.6473 7.63892C19.2944 7.85585 18.8325 7.74565 18.6156 7.39279C17.2727 5.20845 14.8484 3.75 12.0789 3.75C7.8945 3.75 4.50372 7.0777 4.431 11.1982L4.83138 10.8009C5.12542 10.5092 5.60029 10.511 5.89203 10.8051C6.18377 11.0991 6.18191 11.574 5.88787 11.8657L4.20805 13.5324C3.91565 13.8225 3.44398 13.8225 3.15157 13.5324L1.47176 11.8657C1.17772 11.574 1.17585 11.0991 1.46759 10.8051C1.75933 10.5111 2.2342 10.5092 2.52824 10.8009L2.93077 11.2003ZM19.7864 10.4666C20.0786 10.1778 20.5487 10.1778 20.8409 10.4666L22.5271 12.1333C22.8217 12.4244 22.8245 12.8993 22.5333 13.1939C22.2421 13.4885 21.7673 13.4913 21.4727 13.2001L21.0628 12.7949C20.9934 17.7604 16.9017 21.75 11.8825 21.75C8.56379 21.75 5.65381 20.007 4.0412 17.3939C3.82366 17.0414 3.93307 16.5793 4.28557 16.3618C4.63806 16.1442 5.10016 16.2536 5.31769 16.6061C6.6656 18.7903 9.09999 20.25 11.8825 20.25C16.0887 20.25 19.4922 16.9171 19.5625 12.7969L19.1546 13.2001C18.86 13.4913 18.3852 13.4885 18.094 13.1939C17.8028 12.8993 17.8056 12.4244 18.1002 12.1333L19.7864 10.4666Z" fill="currentColor"/></svg>';
	// reicon "arrow-left2" (chevron) — the super bar's left end-cap, paired with expand.
	const BACK_SVG =
		'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M15.4881 4.43057C15.8026 4.70014 15.839 5.17361 15.5694 5.48811L9.98781 12L15.5694 18.5119C15.839 18.8264 15.8026 19.2999 15.4881 19.5695C15.1736 19.839 14.7001 19.8026 14.4306 19.4881L8.43056 12.4881C8.18981 12.2072 8.18981 11.7928 8.43056 11.5119L14.4306 4.51192C14.7001 4.19743 15.1736 4.161 15.4881 4.43057Z" fill="currentColor"/></svg>';
	// reicon maximize / minimize — the expand-panel toggle (this board owns it so the
	// icon sits as the super bar's right end-cap, aligned with back, rather than the
	// parent's absolute button floating loose against the short bar).
	const MAXIMIZE_SVG =
		'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.1429 1.25C15.7286 1.25 15.3929 1.58579 15.3929 2C15.3929 2.41421 15.7286 2.75 16.1429 2.75H20.1893L14.4697 8.46967C14.1768 8.76256 14.1768 9.23744 14.4697 9.53033C14.7626 9.82322 15.2374 9.82322 15.5303 9.53033L21.25 3.81066V7.85714C21.25 8.27136 21.5858 8.60714 22 8.60714C22.4142 8.60714 22.75 8.27136 22.75 7.85714V2C22.75 1.58579 22.4142 1.25 22 1.25H16.1429Z" fill="currentColor"/><path d="M7.85714 22.75C8.27136 22.75 8.60714 22.4142 8.60714 22C8.60714 21.5858 8.27136 21.25 7.85714 21.25H3.81066L9.53033 15.5303C9.82322 15.2374 9.82322 14.7626 9.53033 14.4697C9.23744 14.1768 8.76256 14.1768 8.46967 14.4697L2.75 20.1893V16.1429C2.75 15.7286 2.41421 15.3929 2 15.3929C1.58579 15.3929 1.25 15.7286 1.25 16.1429V22C1.25 22.4142 1.58579 22.75 2 22.75H7.85714Z" fill="currentColor"/></svg>';
	const MINIMIZE_SVG =
		'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.8571 9.75C21.2714 9.75 21.6071 9.41421 21.6071 9C21.6071 8.58579 21.2714 8.25 20.8571 8.25H16.8107L22.5303 2.53033C22.8232 2.23744 22.8232 1.76256 22.5303 1.46967C22.2374 1.17678 21.7626 1.17678 21.4697 1.46967L15.75 7.18934V3.14286C15.75 2.72864 15.4142 2.39286 15 2.39286C14.5858 2.39286 14.25 2.72864 14.25 3.14286V9C14.25 9.41421 14.5858 9.75 15 9.75H20.8571Z" fill="currentColor"/><path d="M3.14286 14.25C2.72864 14.25 2.39286 14.5858 2.39286 15C2.39286 15.4142 2.72864 15.75 3.14286 15.75H7.18934L1.46967 21.4697C1.17678 21.7626 1.17678 22.2374 1.46967 22.5303C1.76256 22.8232 2.23744 22.8232 2.53033 22.5303L8.25 16.8107V20.8571C8.25 21.2714 8.58579 21.6071 9 21.6071C9.41421 21.6071 9.75 21.2714 9.75 20.8571V15C9.75 14.5858 9.41421 14.25 9 14.25H3.14286Z" fill="currentColor"/></svg>';

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
		let budget = MAX_LOOKUPS_PER_POLL;
		for (const p of list) {
			const cs = p.call.toUpperCase();
			if (!cs || routeCache.has(cs)) continue;
			if (budget-- <= 0) break;
			try {
				const r = await fetch('https://api.adsbdb.com/v0/callsign/' + encodeURIComponent(cs));
				if (destroyed) return;
				if (!r.ok) continue; // leave uncached → retry next poll
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
			} catch {
				/* transient — leave uncached so a later poll retries */
			}
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
		{ hex: 'ACE011', call: 'CIPHER', type: 'F15', reg: 'UST-01', op: 'Ustio Air Force', year: 1995, alt: 'ground', gs: 0, track: 0, vrate: 0, distNm: 2, o: 'GRM', d: 'SIB' }
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

	async function poll() {
		const at = sel;
		if (at.demo) {
			loadDemo(); // fictional field — canned traffic, no live feeds
			return;
		}
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
		}
	}

	// (Re)start the auto-poll interval — unless paused, in which case it stays off.
	function restartInterval() {
		clearInterval(timer);
		timer = paused ? 0 : window.setInterval(poll, pollMs);
	}
	// Poll now and re-sync the cadence (a one-off refresh while paused stays paused).
	function kick() {
		poll();
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
		kick();
	}
	// Switch auto-refresh cadence; adopt it immediately (stays off while paused).
	function setPollMs(ms: number) {
		if (ms === pollMs) return;
		pollMs = ms;
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
		planes = [];
		resetTracks(); // a new field is a fresh board — don't animate the old rows out
		status = 'loading';
		updatedAt = null;
		closePhoto();
		kick();
	}
	function setRange(r: number) {
		if (r === radiusNm) return;
		radiusNm = r;
		planes = [];
		resetTracks();
		status = 'loading';
		updatedAt = null;
		kick();
	}

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
			op: opName(p),
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

	type Row = Plane & { tag: 'arr' | 'dep' | 'over' | null; route: Route };
	const rows = $derived.by<Row[]>(() => {
		routeVer; // dependency: re-derive when the route cache fills
		return planes.map((p) => {
			const route = routeCache.get(p.call.toUpperCase()) ?? null;
			let tag: Row['tag'] = null;
			if (route) tag = route.d.icao === sel.icao ? 'arr' : route.o.icao === sel.icao ? 'dep' : 'over';
			return { ...p, route, tag };
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
	{#each AIRPORTS as a}
		<button
			type="button"
			class="field"
			class:on={a.icao === sel.icao}
			role="radio"
			aria-checked={a.icao === sel.icao}
			title={a.name}
			onclick={() => select(a)}
		>
			{a.iata}
		</button>
	{/each}
{/snippet}
{#snippet rangeButtons()}
	{#each RANGES as r}
		<button
			type="button"
			class="field"
			class:on={r === radiusNm}
			role="radio"
			aria-checked={r === radiusNm}
			aria-label={`${r} nautical miles`}
			onclick={() => setRange(r)}
		>
			{r}
		</button>
	{/each}
{/snippet}
{#snippet refreshButtons()}
	{#each INTERVALS as iv}
		<button
			type="button"
			class="field"
			class:on={iv.ms === pollMs}
			role="radio"
			aria-checked={iv.ms === pollMs}
			aria-label={`Auto-refresh every ${iv.label}`}
			onclick={() => setPollMs(iv.ms)}
		>
			{iv.label}
		</button>
	{/each}
{/snippet}
{#snippet ringButtons()}
	<button type="button" class="manual" aria-label="Refresh now" title="Refresh now" onclick={manualRefresh}>
		{@html REFRESH_SVG}
	</button>
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
	{#if onToggleExpand && !showDeck}
		<!-- Compact panel: the expand toggle sits top-right (the super bar hosts its own
		     collapse cap, so this only shows when there's no bar). -->
		<button
			type="button"
			class="expand-compact"
			onclick={onToggleExpand}
			aria-label={expanded ? 'Collapse panel' : 'Expand panel to fill'}
			title={expanded ? 'Collapse' : 'Expand to fill'}
		>
			{@html expanded ? MINIMIZE_SVG : MAXIMIZE_SVG}
		</button>
	{/if}
	<header class="tfc-head" class:bar={showDeck}>
		{#if showDeck}
			<!-- Expanded: ONE super bar. The far edges are global app controls — back at the
			     left cap, collapse at the right — framing the identity, controls, and summary. -->
			{#if onback}
				<button
					type="button"
					class="nav-edge"
					onclick={onback}
					aria-label="Back to route map"
					title="Route map"
				>
					{@html BACK_SVG}
				</button>
			{/if}
			<div class="ident">
				<p class="eyebrow">Now arriving &middot; <span class="eyebrow-code">{code}</span></p>
				<h2 class="dest">{#key title}<SplitFlap text={title} base={160} stagger={45} />{/key}</h2>
			</div>
			<div class="deck">
				<div class="deck-controls">
					<div class="ctl" role="radiogroup" aria-label="Airport">
						<span class="ctl-label">Field</span>{@render fieldButtons()}
					</div>
					<div class="ctl" role="radiogroup" aria-label="Radar range">
						<span class="ctl-label">Range</span>{@render rangeButtons()}<span class="range-unit">NM</span>
					</div>
					<div class="ctl" role="radiogroup" aria-label="Auto-refresh interval">
						<span class="ctl-label">Refresh</span>{@render refreshButtons()}<span class="ring-wrap"
							>{@render ringButtons()}</span
						>
					</div>
				</div>
				<dl class="deck-summary" aria-label="Board summary">
					<div class="stat">
						<dt>In range</dt>
						<dd>{status === 'loading' || status === 'error' ? '—' : rows.length}</dd>
					</div>
					<div class="stat">
						<dt>Arr · Dep · Ovr</dt>
						<dd>{counts.arr} · {counts.dep} · {counts.ovr}</dd>
					</div>
					<div class="stat">
						<dt>Updated</dt>
						<dd>{updatedAt ? fmtClock(updatedAt) : '—'}</dd>
					</div>
				</dl>
			</div>
			{#if onToggleExpand}
				<button
					type="button"
					class="nav-edge cap-right"
					onclick={onToggleExpand}
					aria-label="Collapse panel"
					title="Collapse"
				>
					{@html MINIMIZE_SVG}
				</button>
			{/if}
		{:else}
			{#if onback}<button type="button" class="back" onclick={onback}>&larr; route map</button>{/if}
			<p class="eyebrow">Now arriving &middot; <span class="eyebrow-code">{code}</span></p>
			<div class="title-row">
				<h2 class="dest">{#key title}<SplitFlap text={title} base={160} stagger={45} />{/key}</h2>
			</div>
		{/if}
	</header>

	<div class="tfc-body">
		<p class="lead">
			{#if sel.demo}Sample traffic around a fictional field — a self-contained demo (no live
				data) so you can explore the board. Range and refresh still work; pick a real airport
				above for live ADS-B.
			{:else}Live traffic within {radiusNm} NM of a field — arriving, departing, or passing over.{/if}
		</p>

		{#if !showDeck}
			<div class="fields" role="radiogroup" aria-label="Airport">{@render fieldButtons()}</div>

			<div class="fields ranges" role="radiogroup" aria-label="Radar range">
				<span class="range-label">Range</span>{@render rangeButtons()}<span class="range-unit">NM</span>
			</div>

			<div class="fields ranges" role="radiogroup" aria-label="Auto-refresh interval">
				<span class="range-label">Refresh</span>{@render refreshButtons()}
			</div>

			<div class="board-head">
				<h3>{sel.name} <span class="mono">· {sel.icao}</span></h3>
				<div class="status">
					<span class="upd" aria-live="polite">
						{#if status === 'loading'}Loading…
						{:else if status === 'error'}Feed unavailable
						{:else}{rows.length} in range · {fmtClock(updatedAt)}{/if}
					</span>
					{@render ringButtons()}
				</div>
			</div>
		{/if}

		<div class="key" aria-label="Tag key">
			<span class="key-item"><span class="tag arr">Arr</span> Arriving</span>
			<span class="key-item"><span class="tag dep">Dep</span> Departing</span>
			<span class="key-item"><span class="tag over">Ovr</span> Overflight</span>
		</div>

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
				<p class="pc-sub mono">
					{selected.call || selected.hex || '—'}{#if selected.reg} · {selected.reg}{/if}{#if selected.type}
						· {selected.type}{/if}
				</p>
				{#if selected.op}
					<p class="pc-op">{selected.op}{#if selected.year} · built {selected.year}{/if}</p>
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
								>{photo.credit}</a
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
		<div class="scroll">
			<table class="board">
				<thead>
					<tr>
						<th title="Direction relative to this field — arriving, departing, or passing overhead"></th>
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
							style="--stagger:{p.stagger}"
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
							<td class="mono op x2">
								<div class="ci">{#key opName(p)}<SplitFlap {...FLAP} start={flapStart(p, i)} text={opName(p) || '—'} />{/key}</div>
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

		{@render connections?.()}
	</div>
</div>

<style>
	/* The board owns the whole panel interior: a header + a body that grows to the
	   table's natural height (the panel itself scrolls when the data runs long, rather
	   than boxing the table into its own inner scroller). */
	.tfc {
		display: flex;
		flex-direction: column;
		min-height: 100%;
		position: relative; /* anchors the compact expand toggle */
	}
	/* Expand/collapse toggle for the compact panel (the super bar hosts its own). Matches
	   the generic panel button so it reads identically to every other destination. */
	.expand-compact {
		position: absolute;
		top: calc(clamp(1.5rem, 4vw, 2.5rem) + 2px);
		right: clamp(1.5rem, 4vw, 2.75rem);
		z-index: 3;
		display: inline-grid;
		place-items: center;
		width: 34px;
		height: 34px;
		padding: 0;
		color: var(--sub);
		background: color-mix(in srgb, var(--paper) 70%, transparent);
		border: 1.5px solid color-mix(in srgb, var(--ink) 14%, transparent);
		border-radius: 8px;
		cursor: pointer;
		transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
	}
	.expand-compact:hover {
		color: var(--ink);
		border-color: color-mix(in srgb, var(--ink) 30%, transparent);
	}
	.expand-compact:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	.expand-compact :global(svg) {
		width: 15px;
		height: 15px;
		display: block;
	}
	@media (max-width: 720px) {
		.expand-compact {
			display: none; /* phone bottom-sheet is already full width */
		}
	}
	.tfc-head {
		flex: none;
		/* Keep the top inset matching the parent's pinned expand button; tighten below. */
		padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1.5rem, 4vw, 2.75rem) 1rem;
		border-bottom: 1px solid color-mix(in srgb, var(--ink) 10%, transparent);
	}
	.tfc-body {
		/* Grow to fill a short panel, but never shrink below the data's height. */
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: clamp(1.25rem, 3vw, 1.75rem) clamp(1.5rem, 4vw, 2.75rem) 2rem;
		/* Query against the body's own width so extra columns appear only when the
		   panel is wide (expanded on a big viewport) — the compact panel is untouched. */
		container-type: inline-size;
	}
	/* Panel chrome, matched to the generic .surface-head so ATFC reads like every other
	   destination panel (this board just renders it itself). */
	.back {
		align-self: flex-start;
		margin-bottom: 1rem;
		padding: 0.4rem 0.85rem;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--ink);
		background: transparent;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		cursor: pointer;
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.eyebrow-code {
		color: var(--accent);
	}
	.dest {
		margin: 0;
		font-size: clamp(2rem, 6vw, 3rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--ink);
	}
	/* The title's own row: "Air Traffic" on the left, the control deck filling the
	   whole band to its right. Wraps to stacked only if it ever gets tight (the deck
	   renders past 900px, so that's a safety net). */
	.title-row {
		display: flex;
		align-items: center;
		gap: 1rem clamp(1.5rem, 4vw, 3rem);
		flex-wrap: wrap;
	}
	.title-row .dest {
		flex: none;
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
	.ring-wrap {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		margin-left: 0.4rem;
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
	   title is still the largest thing, then stat values, then labels/eyebrow. */
	.tfc-head.bar {
		display: flex;
		align-items: center;
		gap: clamp(0.85rem, 2vw, 1.75rem);
		padding-block: 0.55rem;
		padding-inline: clamp(0.9rem, 1.6vw, 1.4rem);
	}
	/* The deck grows to push the collapse cap to the far-right edge, opposite back. */
	.cap-right {
		margin-left: auto;
	}
	/* Global-control end caps — matched to the parent's expand button so back/expand
	   read as one set framing the bar. */
	.nav-edge {
		flex: none;
		display: inline-grid;
		place-items: center;
		width: 34px;
		height: 34px;
		padding: 0;
		color: var(--sub);
		background: color-mix(in srgb, var(--paper) 70%, transparent);
		border: 1.5px solid color-mix(in srgb, var(--ink) 14%, transparent);
		border-radius: 8px;
		cursor: pointer;
		transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
	}
	.nav-edge:hover {
		color: var(--ink);
		border-color: color-mix(in srgb, var(--ink) 30%, transparent);
	}
	.nav-edge:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	.nav-edge :global(svg) {
		width: 16px;
		height: 16px;
		display: block;
	}
	.ident {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
	}
	.bar .eyebrow {
		margin: 0;
	}
	.bar .dest {
		font-size: clamp(1.15rem, 1.5vw, 1.5rem);
		line-height: 1.05;
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
	.op {
		max-width: 18ch;
	}
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
	.fields {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.ranges {
		align-items: center;
	}
	.range-label {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--sub);
		margin-right: 0.15rem;
	}
	.range-unit {
		font-size: 0.8rem;
		color: var(--sub);
	}
	.field {
		padding: 0.35rem 0.6rem;
		font: inherit;
		font-weight: 700;
		font-size: 0.85rem;
		letter-spacing: 0.03em;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1.5px solid color-mix(in srgb, var(--ink) 15%, transparent);
		border-radius: 8px;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
	}
	.field:hover {
		border-color: color-mix(in srgb, var(--ink) 32%, transparent);
	}
	.field.on {
		color: var(--paper);
		background: var(--accent);
		border-color: var(--accent);
	}
	.field:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	.board-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
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
		width: 30px;
		height: 30px;
		flex: none;
		padding: 0;
		background: none;
		border: 0;
		cursor: pointer;
	}
	.refresh:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
		border-radius: 50%;
	}
	/* Manual "refresh now" — a plain icon button beside the countdown ring. */
	.manual {
		display: inline-grid;
		place-items: center;
		width: 28px;
		height: 28px;
		flex: none;
		padding: 0;
		color: var(--sub);
		background: none;
		border: 0;
		border-radius: 50%;
		cursor: pointer;
		transition: color 0.15s ease, transform 0.15s ease;
	}
	.manual:hover {
		color: var(--ink);
	}
	.manual:active {
		transform: rotate(-90deg);
	}
	.manual:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	.manual :global(svg) {
		width: 15px;
		height: 15px;
		display: block;
	}
	.ring {
		width: 30px;
		height: 30px;
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
		transition: stroke-dashoffset 0.2s linear;
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
		background: color-mix(in srgb, var(--ink) 92%, transparent);
		border-radius: 8px;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
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
		min-width: 2.4em;
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
	/* Key for the arriving / departing / overflight tags. */
	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 1rem;
		font-size: 0.78rem;
		color: var(--sub);
	}
	.key-item {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
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
		outline: 2px solid var(--ink);
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
		border: 1.5px solid color-mix(in srgb, var(--ink) 12%, transparent);
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
		padding-right: 1.2rem;
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
	.pc-credit {
		margin: 0.3rem 0 0;
		font-size: 0.72rem;
		color: var(--sub);
	}
	.pc-credit a {
		color: inherit;
		text-decoration: underline;
	}
	.pc-close {
		position: absolute;
		top: 0.35rem;
		right: 0.45rem;
		width: 24px;
		height: 24px;
		padding: 0;
		line-height: 1;
		font-size: 1.15rem;
		color: var(--sub);
		background: none;
		border: 0;
		border-radius: 6px;
		cursor: pointer;
	}
	.pc-close:hover {
		color: var(--ink);
	}
	.pc-close:focus-visible {
		outline: 2px solid var(--ink);
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
	}
	.src {
		margin: 0.2rem 0 0;
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--sub);
	}
</style>
