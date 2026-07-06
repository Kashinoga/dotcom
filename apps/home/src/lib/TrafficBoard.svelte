<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { slide } from 'svelte/transition';
	import SplitFlap from '$lib/SplitFlap.svelte';

	// A live "what's in the air around <airport>" board. Same keyless, CORS-open
	// stack as the dotcom-2 atc app: airplanes.live for live ADS-B traffic near a
	// point, adsbdb to resolve a callsign to its origin/destination (→ arriving /
	// departing / overflight, relative to the selected field). No API key, no
	// backend. Only polls while this panel is mounted.

	let { accent = '#f06030' }: { accent?: string } = $props();

	type Airport = { icao: string; iata: string; name: string; lat: number; lon: number };
	// A small curated field list — the selector. KDSM (home) is the default.
	const AIRPORTS: Airport[] = [
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
		P28A: 'Piper PA-28 Cherokee'
	};
	type Photo = { src: string; credit: string; url: string };
	const imgCache = new Map<string, Photo | null>(); // type → photo, or null when none

	function stripHtml(html: string) {
		const d = document.createElement('div');
		d.innerHTML = html || '';
		return (d.textContent || '').replace(/\s+/g, ' ').trim();
	}
	async function loadTypeImage(type: string): Promise<Photo | null> {
		const title = TYPE_TITLES[type];
		if (!title) return null;
		if (imgCache.has(type)) return imgCache.get(type)!;
		const base =
			'https://en.wikipedia.org/w/api.php?origin=*&format=json&redirects=1&action=query&titles=';
		try {
			const r = await fetch(
				base + encodeURIComponent(title) + '&prop=pageimages&piprop=thumbnail%7Cname&pithumbsize=480'
			);
			const d = await r.json();
			const pages = d?.query?.pages ?? {};
			const pg = pages[Object.keys(pages)[0]];
			if (!pg || !pg.thumbnail) {
				imgCache.set(type, null);
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
			imgCache.set(type, info);
			return info;
		} catch {
			return null; // transient — don't cache, allow a later retry
		}
	}

	type Field = { icao: string; iata: string; city: string };
	type Route = { o: Field; d: Field } | null;
	// callsign → route (null = adsbdb knows none). Module-lived so reopening the
	// panel doesn't refetch. `undefined` (absent key) = not looked up yet.
	const routeCache = new Map<string, Route>();

	type Plane = {
		hex: string;
		call: string;
		type: string;
		alt: number | 'ground' | null;
		gs: number | null;
		track: number | null;
		distNm: number;
	};

	const RANGES = [40, 60, 100, 150, 250]; // NM; 250 is the airplanes.live max
	const POLL_MS = 10000;
	const MAX_ROWS = 18;
	const MAX_LOOKUPS_PER_POLL = 8;
	// Snappy split-flap timing for the board cells (the Home header's Solari flip).
	const FLAP = { base: 70, stagger: 24, tick: 40, delay: 0 };
	const ROW_STEP = 55; // per-row start delay so the board flips top row → bottom

	let sel = $state<Airport>(AIRPORTS[0]);
	let radiusNm = $state(60);
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

	// Countdown-ring geometry + progress toward the next poll.
	const POLL_S = Math.round(POLL_MS / 1000);
	const RING_R = 15.5;
	const RING_C = 2 * Math.PI * RING_R;
	const ringFrac = $derived(
		updatedAt ? Math.min(1, Math.max(0, (nowTs - updatedAt) / POLL_MS)) : 0
	);
	const ringDash = $derived(RING_C * ringFrac);
	const ringRemain = $derived(Math.max(0, Math.ceil((POLL_MS * (1 - ringFrac)) / 1000)));

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
		city: (a.municipality as string) || ''
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
				const route: Route =
					fr && fr.origin && fr.destination ? { o: field(fr.origin), d: field(fr.destination) } : null;
				routeCache.set(cs, route);
				routeVer++;
			} catch {
				/* transient — leave uncached so a later poll retries */
			}
		}
	}

	async function poll() {
		const at = sel;
		try {
			const url = `https://api.airplanes.live/v2/point/${at.lat}/${at.lon}/${radiusNm}`;
			const r = await fetch(url);
			if (destroyed || at.icao !== sel.icao) return;
			if (!r.ok) throw new Error('bad response');
			const data = await r.json();
			if (destroyed || at.icao !== sel.icao) return;
			const ac: Record<string, unknown>[] = Array.isArray(data?.ac) ? data.ac : [];
			const list: Plane[] = ac
				.filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number')
				.map((a) => ({
					hex: ((a.hex as string) || '').toUpperCase(),
					call: ((a.flight as string) || '').trim(),
					type: (a.t as string) || '',
					alt: (a.alt_baro as number | 'ground') ?? null,
					gs: typeof a.gs === 'number' ? a.gs : null,
					track: typeof a.track === 'number' ? a.track : null,
					distNm: haversineNm(at.lat, at.lon, a.lat as number, a.lon as number)
				}))
				.sort((x, y) => x.distNm - y.distNm)
				.slice(0, MAX_ROWS);
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
		timer = paused ? 0 : window.setInterval(poll, POLL_MS);
	}
	// Poll now and re-sync the cadence (a one-off refresh while paused stays paused).
	function kick() {
		poll();
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
		status = 'loading';
		updatedAt = null;
		closePhoto();
		kick();
	}
	function setRange(r: number) {
		if (r === radiusNm) return;
		radiusNm = r;
		planes = [];
		status = 'loading';
		updatedAt = null;
		kick();
	}

	// A tapped row's photo card: a snapshot of the aircraft + its type photo.
	type Selected = {
		call: string;
		hex: string;
		type: string;
		title: string;
		route: Route;
		tag: Row['tag'];
		alt: Plane['alt'];
		gs: number | null;
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
			title,
			route: p.route,
			tag: p.tag,
			alt: p.alt,
			gs: p.gs,
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

	const fmtAlt = (a: Plane['alt']) => {
		if (a === 'ground') return 'GND';
		if (typeof a !== 'number') return '—';
		return a >= 18000 ? 'FL' + Math.round(a / 100) : Math.round(a).toLocaleString() + ' ft';
	};
	const fmtSpd = (g: number | null) => (g == null ? '—' : Math.round(g) + ' kt');
	const fmtHdg = (t: number | null) => (t == null ? '—' : String(Math.round(t)).padStart(3, '0') + '°');
	const fmtDist = (d: number) => Math.round(d) + ' NM';
	const fmtClock = (t: number | null) => {
		if (t == null) return '—';
		const d = new Date(t);
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
	};
	const TAG_LABEL = { arr: 'Arr', dep: 'Dep', over: 'Ovr' } as const;

	onMount(() => {
		poll();
		timer = window.setInterval(poll, POLL_MS);
		ringTimer = window.setInterval(() => (nowTs = Date.now()), 200);
	});
	onDestroy(() => {
		destroyed = true;
		clearInterval(timer);
		clearInterval(ringTimer);
	});
</script>

<div class="tfc" style:--accent={accent}>
	<p class="lead">Live traffic within {radiusNm} NM of a field — arriving, departing, or passing over.</p>

	<div class="fields" role="radiogroup" aria-label="Airport">
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
	</div>

	<div class="fields ranges" role="radiogroup" aria-label="Radar range">
		<span class="range-label">Range</span>
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
		<span class="range-unit">NM</span>
	</div>

	<div class="board-head">
		<h3>{sel.name} <span class="mono">· {sel.icao}</span></h3>
		<div class="status">
			<span class="upd" aria-live="polite">
				{#if status === 'loading'}Loading…
				{:else if status === 'error'}Feed unavailable
				{:else}{rows.length} in range · {fmtClock(updatedAt)}{/if}
			</span>
			<button
				type="button"
				class="refresh"
				class:is-paused={paused}
				aria-pressed={paused}
				aria-label={paused
					? 'Auto-refresh paused. Click to resume.'
					: `Auto-refreshing every ${POLL_S} seconds; next in about ${ringRemain} seconds. Click to pause.`}
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
					{:else}Auto-refreshing every {POLL_S}s — the ring counts down to the next update. Click
						to pause.{/if}
				</span>
			</button>
		</div>
	</div>

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
				<p class="pc-title">{selected.title || selected.type || 'Unknown type'}</p>
				<p class="pc-sub mono">
					{selected.call || selected.hex || '—'}{#if selected.type} · {selected.type}{/if}
				</p>
				{#if selected.route}
					<p class="pc-route mono">
						{selected.route.o.iata || selected.route.o.icao} → {selected.route.d.iata ||
							selected.route.d.icao}
					</p>
				{/if}
				<p class="pc-meta mono">
					{fmtAlt(selected.alt)} · {fmtSpd(selected.gs)} · {fmtDist(selected.distNm)}
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
						<th></th>
						<th>Flight</th>
						<th>Type</th>
						<th class="num">Alt</th>
						<th class="num">Spd</th>
						<th class="route">Route</th>
						<th class="num">Dist</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as p, i (p.hex)}
						<tr>
							<td>
								{#if p.tag}<span class="tag {p.tag}">{TAG_LABEL[p.tag]}</span>{/if}
							</td>
							<td class="mono flight">
								{#key p.call || p.hex}<SplitFlap
										{...FLAP}
										start={i * ROW_STEP}
										text={p.call || p.hex || '—'}
									/>{/key}
							</td>
							<td class="mono">
								{#if TYPE_TITLES[p.type]}
									<button type="button" class="type-btn" onclick={() => openPhoto(p)}>
										{#key p.type}<SplitFlap {...FLAP} start={i * ROW_STEP} text={p.type} />{/key}
									</button>
								{:else}{#key p.type}<SplitFlap
										{...FLAP}
										start={i * ROW_STEP}
										text={p.type || '—'}
									/>{/key}{/if}
							</td>
							<td class="mono num">
								{#key fmtAlt(p.alt)}<SplitFlap {...FLAP} start={i * ROW_STEP} text={fmtAlt(p.alt)} />{/key}
							</td>
							<td class="mono num">
								{#key fmtSpd(p.gs)}<SplitFlap {...FLAP} start={i * ROW_STEP} text={fmtSpd(p.gs)} />{/key}
							</td>
							<td class="mono route">
								{#if p.route}{#key `${p.route.o.iata || p.route.o.icao} ${p.route.d.iata || p.route.d.icao}`}<SplitFlap
										{...FLAP}
										start={i * ROW_STEP}
										text={`${p.route.o.iata || p.route.o.icao || '???'} → ${p.route.d.iata ||
											p.route.d.icao ||
											'???'}`}
									/>{/key}
								{:else}<span class="hdg">hdg {fmtHdg(p.track)}</span>{/if}
							</td>
							<td class="mono num">
								{#key fmtDist(p.distNm)}<SplitFlap
										{...FLAP}
										start={i * ROW_STEP}
										text={fmtDist(p.distNm)}
									/>{/key}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<p class="src">
		Live ADS-B via <span class="mono">airplanes.live</span>; routes via
		<span class="mono">adsbdb</span>. Aircraft without a public route show a heading instead.
	</p>
</div>

<style>
	.tfc {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.lead {
		margin: 0;
		max-width: 62ch;
		line-height: 1.55;
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
	.board td {
		padding: 0.34rem 0.6rem 0.34rem 0;
		border-top: 1px solid color-mix(in srgb, var(--ink) 8%, transparent);
		white-space: nowrap;
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
