<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { dev } from '$app/environment';
	import SplitFlap from '$lib/SplitFlap.svelte';
	import TrafficBoard from '$lib/TrafficBoard.svelte';
	import PresentationBuilder from '$lib/PresentationBuilder.svelte';
	import { MAXIMIZE_SVG, MINIMIZE_SVG, BACK_SVG } from '$lib/icons';

	// Airline route-map homepage. The network is deliberately LARGER than the
	// viewport: routes run off every edge, and visible nodes lead outward to the
	// off-screen parts. You "move pages" by flying the camera (animated viewBox)
	// node to node. Flat-forward — the isometric look is a 2D affine projection
	// baked into coordinates, not a CSS 3D/perspective transform. The stage never
	// scrolls; the camera crops the world.
	type Pt = [number, number];

	// Airports on a 60px grid (grid space, pre-projection). KSH = home hub.
	// Tier 1 sits near the hub (visible from home); tier 2 sits far out (reached by
	// flying to its tier-1 leader). Each maps to a page/section — rename freely.
	// Only real destinations for now — placeholders removed. The map is deliberately
	// sparse until more real sections are added; new stations slot straight in here.
	const airports: Record<string, { at: Pt; title: string }> = {
		KSH: { at: [480, 300], title: 'Home' },
		STG: { at: [620, 360], title: 'Settings' },
		// About splits into its own two stops — Work and Projects.
		ABT: { at: [340, 220], title: 'About' },
		WRK: { at: [240, 180], title: 'Work' },
		PRJ: { at: [460, 160], title: 'Projects' },
		// Apps — a hub for the little live apps, fanning out on the orange line.
		APP: { at: [540, 410], title: 'Apps' },
		// Air Traffic — a live "what's in the air" board; first app off the Apps hub.
		ATFC: { at: [620, 520], title: 'Air Traffic' },
		// Presentation Builder — a visual editor for the route-map slide decks; second app off
		// the Apps hub, branching left-down opposite Air Traffic.
		PRES: { at: [460, 520], title: 'Presentation Builder' }
	};

	const airlines: { name: string; color: string; legs: [string, string][]; body?: string }[] = [
		{
			name: 'Loess',
			color: '#12a150',
			legs: [['KSH', 'ABT'], ['ABT', 'PRJ'], ['ABT', 'WRK']],
			body: 'Named after a trip I took in college, Loess possesses some of my most formative moments.'
		},
		{
			name: 'Gray’s',
			color: '#8b46e0',
			legs: [['KSH', 'STG']],
			body: 'Named after my childhood area, Gray’s holds a special place in my heart.'
		},
		{
			name: 'Terminal Way',
			color: '#f06030',
			legs: [['KSH', 'APP'], ['APP', 'ATFC'], ['APP', 'PRES']],
			body: 'Named after the airport, Terminal Way represents the opportunities taken to expand my horizons.'
		}
	];

	// Two layouts, same station codes; mapMode picks which screen coords are live.
	// Airline mode: an isometric (true 30°) projection of the grid — a skewed
	// in-flight board. Pure 2D affine, no perspective.
	const COS = Math.cos(Math.PI / 6);
	const SIN = Math.sin(Math.PI / 6);
	const iso = ([x, y]: Pt): Pt => [(x - y) * COS, (x + y) * SIN];
	const P_air: Record<string, Pt> = Object.fromEntries(
		Object.entries(airports).map(([k, v]) => [k, iso(v.at)])
	);

	// Train mode (desktop, landscape): a flat, hand-laid transit map. Sparse for now —
	// Loess's About cluster sits left of the hub (ABT fanning to Work/Projects) and
	// Gray's Settings stop sits to the right. New routes slot in around these.
	const P_rail: Record<string, Pt> = {
		KSH: [380, 360],
		// Loess — KSH→ABT, then ABT fans to Work (up) and Projects (down).
		ABT: [250, 300],
		WRK: [120, 200],
		PRJ: [175, 430],
		// Gray's — Settings, east of the hub.
		STG: [560, 375],
		// Apps — orange line dropping south of the hub, then on to Air Traffic (right)
		// and the Presentation Builder (left).
		APP: [430, 500],
		ATFC: [520, 610],
		PRES: [340, 610]
	};

	// Train mode (mobile, portrait): the same sparse network stacked vertically — the
	// About cluster up top, Settings below the hub — so it reads top-to-bottom. Kept
	// compact so the top branch clears the masthead and the bottom clears the legend.
	const P_rail_v: Record<string, Pt> = {
		KSH: [230, 455],
		// Loess — ABT up, fanning to Work (left) and Projects (right).
		ABT: [230, 350],
		WRK: [145, 262],
		PRJ: [315, 262],
		// Gray's — Settings, below the hub.
		STG: [230, 590],
		// Apps — orange line branching down-right of the hub, then on to Air Traffic
		// (right) and the Presentation Builder (left).
		APP: [360, 515],
		ATFC: [450, 615],
		PRES: [270, 615]
	};

	// Route drawing style, toggled from the Settings (STG) stop; persisted so the
	// choice survives reloads (loaded in onMount to avoid SSR skew).
	const MODE_KEY = 'ksh-map-mode';
	let mapMode = $state<'air' | 'rail'>('air');
	function setMapMode(m: 'air' | 'rail') {
		mapMode = m;
		try {
			localStorage.setItem(MODE_KEY, m);
		} catch {
			/* storage unavailable — keep the in-memory choice */
		}
	}
	const mapPhrase = $derived(mapMode === 'air' ? 'an airline route map' : 'a train route map');
	// Tagline split into words so each raises in on a stagger (like the legend).
	const taglineWords = 'a route map of my internet'.split(' ');

	// Label style, toggled from Settings: station codes (WRK) or full stop names.
	// No explicit choice yet: airline mode defaults to codes, train mode to full
	// names. An explicit pick is persisted and wins in either mode.
	const NAMES_KEY = 'ksh-stop-names';
	let stopNamesPref = $state<boolean | null>(null);
	const showStopNames = $derived(stopNamesPref ?? mapMode === 'rail');
	function setShowStopNames(v: boolean) {
		stopNamesPref = v;
		try {
			localStorage.setItem(NAMES_KEY, v ? '1' : '0');
		} catch {
			/* storage unavailable — keep the in-memory choice */
		}
	}

	// Display mode, a quick toggle in the header (light / dark / system). 'system'
	// clears the override so the OS preference wins; the actual re-theming is done
	// by color-scheme + light-dark() tokens. A pre-paint script in app.html applies
	// the saved choice, so restoring it here just syncs the control's state.
	const THEME_KEY = 'ksh-theme';
	type Theme = 'light' | 'dark' | 'system';
	let theme = $state<Theme>('system');
	const themeModes: { id: Theme; label: string; svg: string }[] = [
		{
			id: 'light',
			label: 'Light',
			svg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 1.25C12.4142 1.25 12.75 1.58579 12.75 2V3C12.75 3.41421 12.4142 3.75 12 3.75C11.5858 3.75 11.25 3.41421 11.25 3V2C11.25 1.58579 11.5858 1.25 12 1.25ZM4.39861 4.39861C4.6915 4.10572 5.16638 4.10572 5.45927 4.39861L5.85211 4.79145C6.145 5.08434 6.145 5.55921 5.85211 5.85211C5.55921 6.145 5.08434 6.145 4.79145 5.85211L4.39861 5.45927C4.10572 5.16638 4.10572 4.6915 4.39861 4.39861ZM19.6011 4.39887C19.894 4.69176 19.894 5.16664 19.6011 5.45953L19.2083 5.85237C18.9154 6.14526 18.4405 6.14526 18.1476 5.85237C17.8547 5.55947 17.8547 5.0846 18.1476 4.79171L18.5405 4.39887C18.8334 4.10598 19.3082 4.10598 19.6011 4.39887ZM12 6.75C9.1005 6.75 6.75 9.1005 6.75 12C6.75 14.8995 9.1005 17.25 12 17.25C14.8995 17.25 17.25 14.8995 17.25 12C17.25 9.1005 14.8995 6.75 12 6.75ZM5.25 12C5.25 8.27208 8.27208 5.25 12 5.25C15.7279 5.25 18.75 8.27208 18.75 12C18.75 15.7279 15.7279 18.75 12 18.75C8.27208 18.75 5.25 15.7279 5.25 12ZM1.25 12C1.25 11.5858 1.58579 11.25 2 11.25H3C3.41421 11.25 3.75 11.5858 3.75 12C3.75 12.4142 3.41421 12.75 3 12.75H2C1.58579 12.75 1.25 12.4142 1.25 12ZM20.25 12C20.25 11.5858 20.5858 11.25 21 11.25H22C22.4142 11.25 22.75 11.5858 22.75 12C22.75 12.4142 22.4142 12.75 22 12.75H21C20.5858 12.75 20.25 12.4142 20.25 12ZM18.1476 18.1476C18.4405 17.8547 18.9154 17.8547 19.2083 18.1476L19.6011 18.5405C19.894 18.8334 19.894 19.3082 19.6011 19.6011C19.3082 19.894 18.8334 19.894 18.5405 19.6011L18.1476 19.2083C17.8547 18.9154 17.8547 18.4405 18.1476 18.1476ZM5.85211 18.1479C6.145 18.4408 6.145 18.9157 5.85211 19.2086L5.45927 19.6014C5.16638 19.8943 4.6915 19.8943 4.39861 19.6014C4.10572 19.3085 4.10572 18.8336 4.39861 18.5407L4.79145 18.1479C5.08434 17.855 5.55921 17.855 5.85211 18.1479ZM12 20.25C12.4142 20.25 12.75 20.5858 12.75 21V22C12.75 22.4142 12.4142 22.75 12 22.75C11.5858 22.75 11.25 22.4142 11.25 22V21C11.25 20.5858 11.5858 20.25 12 20.25Z" fill="currentColor"/></svg>'
		},
		{
			id: 'dark',
			label: 'Dark',
			svg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.0174 2.80157C6.37072 3.29221 2.75 7.22328 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C16.7767 21.25 20.7078 17.6293 21.1984 12.9826C19.8717 14.6669 17.8126 15.75 15.5 15.75C11.4959 15.75 8.25 12.5041 8.25 8.5C8.25 6.18738 9.33315 4.1283 11.0174 2.80157ZM1.25 12C1.25 6.06294 6.06294 1.25 12 1.25C12.7166 1.25 13.0754 1.82126 13.1368 2.27627C13.196 2.71398 13.0342 3.27065 12.531 3.57467C10.8627 4.5828 9.75 6.41182 9.75 8.5C9.75 11.6756 12.3244 14.25 15.5 14.25C17.5882 14.25 19.4172 13.1373 20.4253 11.469C20.7293 10.9658 21.286 10.804 21.7237 10.8632C22.1787 10.9246 22.75 11.2834 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12Z" fill="currentColor"/></svg>'
		},
		{
			id: 'system',
			label: 'System',
			svg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.94358 1.25H14.0564C15.8942 1.24998 17.3498 1.24997 18.489 1.40314C19.6614 1.56076 20.6104 1.89288 21.3588 2.64124C22.1071 3.38961 22.4392 4.33856 22.5969 5.51098C22.75 6.65019 22.75 8.10583 22.75 9.94359V11.0549C22.75 11.7174 22.75 12.3176 22.7368 12.8591C22.7455 12.9047 22.75 12.9518 22.75 13C22.75 13.0641 22.7419 13.1264 22.7268 13.1858C22.7103 13.6299 22.682 14.0312 22.6335 14.3918C22.5125 15.2919 22.2536 16.0497 21.6517 16.6517C21.0497 17.2536 20.2919 17.5125 19.3918 17.6335C18.5248 17.75 17.4225 17.75 16.0549 17.75H12.75V21.25H16C16.4142 21.25 16.75 21.5858 16.75 22C16.75 22.4142 16.4142 22.75 16 22.75H8C7.58579 22.75 7.25 22.4142 7.25 22C7.25 21.5858 7.58579 21.25 8 21.25H11.25V17.75H7.94513C6.57754 17.75 5.47522 17.75 4.60825 17.6335C3.70814 17.5125 2.95027 17.2536 2.34835 16.6517C1.74643 16.0497 1.48754 15.2919 1.36652 14.3918C1.31805 14.0312 1.28974 13.6299 1.2732 13.1858C1.25805 13.1264 1.25 13.0641 1.25 13C1.25 12.9518 1.25454 12.9047 1.26323 12.859C1.24998 12.3176 1.24999 11.7174 1.25 11.0549L1.25 9.94358C1.24998 8.10582 1.24997 6.65019 1.40314 5.51098C1.56076 4.33856 1.89288 3.38961 2.64124 2.64124C3.38961 1.89288 4.33856 1.56076 5.51098 1.40314C6.65019 1.24997 8.10582 1.24998 9.94358 1.25ZM2.80673 13.75C2.81924 13.9063 2.83451 14.0533 2.85315 14.1919C2.9518 14.9257 3.13225 15.3142 3.40901 15.591C3.68577 15.8678 4.07435 16.0482 4.80812 16.1469C5.56347 16.2484 6.56458 16.25 8 16.25H16C17.4354 16.25 18.4365 16.2484 19.1919 16.1469C19.9257 16.0482 20.3142 15.8678 20.591 15.591C20.8678 15.3142 21.0482 14.9257 21.1469 14.1919C21.1655 14.0533 21.1808 13.9063 21.1933 13.75H2.80673ZM21.2463 12.25H2.75371C2.75016 11.8736 2.75 11.459 2.75 11V10C2.75 8.09318 2.75159 6.73851 2.88976 5.71085C3.02503 4.70476 3.27869 4.12511 3.7019 3.7019C4.12511 3.27869 4.70476 3.02502 5.71085 2.88976C6.73851 2.75159 8.09318 2.75 10 2.75H14C15.9068 2.75 17.2615 2.75159 18.2892 2.88976C19.2952 3.02502 19.8749 3.27869 20.2981 3.7019C20.7213 4.12511 20.975 4.70476 21.1102 5.71085C21.2484 6.73851 21.25 8.09318 21.25 10V11C21.25 11.459 21.2498 11.8736 21.2463 12.25Z" fill="currentColor"/></svg>'
		}
	];
	function setTheme(t: Theme) {
		theme = t;
		try {
			if (t === 'system') {
				document.documentElement.removeAttribute('data-theme');
				localStorage.removeItem(THEME_KEY);
			} else {
				document.documentElement.dataset.theme = t;
				localStorage.setItem(THEME_KEY, t);
			}
		} catch {
			/* storage unavailable — keep the in-memory choice */
		}
	}

	// Time-of-day sky (opt-in): paints a gradient behind the map and flips the
	// palette per phase. data-sky on <html> drives the tokens (see tokens.css).
	const SKY_KEY = 'ksh-sky';
	type SkyPhase = 'dawn' | 'morning' | 'noon' | 'dusk' | 'night';
	type SkyMode = 'off' | 'auto' | SkyPhase; // off, follow real time, or a fixed phase
	const SKY_PHASES: SkyPhase[] = ['dawn', 'morning', 'noon', 'dusk', 'night'];
	const skyOptions: { id: SkyMode; label: string }[] = [
		{ id: 'off', label: 'Off' },
		{ id: 'auto', label: 'Auto' },
		{ id: 'dawn', label: 'Dawn' },
		{ id: 'morning', label: 'Morning' },
		{ id: 'noon', label: 'Noon' },
		{ id: 'dusk', label: 'Dusk' },
		{ id: 'night', label: 'Night' }
	];
	let skyMode = $state<SkyMode>('auto'); // on (auto) by default
	let skyPhase = $state<SkyPhase>('morning'); // the phase actually painted (for the note)
	let skyTimer = 0;
	function currentPhase(): SkyPhase {
		const h = new Date().getHours();
		if (h < 5 || h >= 21) return 'night';
		if (h < 8) return 'dawn';
		if (h < 11) return 'morning';
		if (h < 17) return 'noon';
		return 'dusk';
	}
	function applySky() {
		if (skyMode === 'off') {
			document.documentElement.removeAttribute('data-sky');
			return;
		}
		skyPhase = skyMode === 'auto' ? currentPhase() : skyMode;
		document.documentElement.dataset.sky = skyPhase;
	}
	function setSkyMode(m: SkyMode) {
		skyMode = m;
		try {
			localStorage.setItem(SKY_KEY, m);
		} catch {
			/* storage unavailable — keep the in-memory choice */
		}
		applySky();
	}

	// Tiny stars on the Night sky (opt-in), some twinkling. Positions come from a
	// seeded PRNG so SSR and client agree (no hydration mismatch).
	const STARS_KEY = 'ksh-stars';
	let starsOn = $state(true);
	function setStars(on: boolean) {
		starsOn = on;
		try {
			localStorage.setItem(STARS_KEY, on ? '1' : '0');
		} catch {
			/* storage unavailable — keep the in-memory choice */
		}
	}

	// Button style (opt-in): 'bubble' gives every panel button a glossy, gel-like,
	// pops-forward look borrowed from the presentation deck's controls; 'flat' is the
	// default minimal chrome. data-ui="bubble" on the html element drives the global
	// button CSS (see the :global bubble block in the style section); a pre-paint script
	// in app.html applies the saved choice so there's no flash on load.
	const UI_KEY = 'ksh-ui';
	type UiStyle = 'flat' | 'bubble';
	const uiOptions: { id: UiStyle; label: string; sub: string }[] = [
		{ id: 'flat', label: 'Flat', sub: 'clean & minimal' },
		{ id: 'bubble', label: 'Bubble', sub: 'glossy & springy' }
	];
	let uiStyle = $state<UiStyle>('flat');
	function setUiStyle(s: UiStyle) {
		uiStyle = s;
		if (typeof document !== 'undefined') {
			if (s === 'bubble') document.documentElement.dataset.ui = s;
			else document.documentElement.removeAttribute('data-ui');
		}
		try {
			if (s === 'bubble') localStorage.setItem(UI_KEY, s);
			else localStorage.removeItem(UI_KEY);
		} catch {
			/* storage unavailable — keep the in-memory choice */
		}
	}
	// Fresh random field each page load (stars only render client-side, so there's
	// no SSR/hydration to keep deterministic). Regenerated on mount to be sure.
	const makeStars = () =>
		Array.from({ length: 72 }, () => ({
			x: Math.random() * 100,
			y: Math.random() * 96,
			size: 0.6 + Math.random() * 1.7,
			tw: Math.random() < 0.5,
			delay: Math.random() * 4,
			dur: 2.4 + Math.random() * 3.2
		}));
	let STARS = $state<ReturnType<typeof makeStars>>([]);
	const starsVisible = $derived(starsOn && skyMode !== 'off' && skyPhase === 'night');

	// Live values the Settings notes interpolate into their `{}` placeholder.
	const labelValue = $derived(showStopNames ? 'full stop names' : 'station codes');
	const displayValue = $derived(
		theme === 'system' ? 'Following your device setting' : `Always ${theme}`
	);
	const skyStatus = $derived(
		skyMode === 'off'
			? 'Off — the map uses the flat background.'
			: skyMode === 'auto'
				? `Auto — following the clock (currently ${skyPhase}).`
				: `Fixed to ${skyMode}.`
	);
	const uiStatus = $derived(
		uiStyle === 'bubble'
			? 'Glossy, bubbly buttons that pop forward across the site.'
			: 'Flat, minimal buttons.'
	);
	const starsStatus = $derived(
		starsOn ? 'Tiny stars twinkle when the sky is Night.' : 'Stars off.'
	);

	// Narrow/portrait screens get the vertical train layout (and a portrait camera).
	let vw = $state(1200);
	const isMobile = $derived(vw <= 720);
	const P: Record<string, Pt> = $derived(
		mapMode === 'air' ? P_air : isMobile ? P_rail_v : P_rail
	);

	// Great-circle-style arc: a quadratic bow perpendicular to the chord, lifted
	// toward the top of the board (the in-flight-map curve).
	function arc([ax, ay]: Pt, [bx, by]: Pt): string {
		const mx = (ax + bx) / 2;
		const my = (ay + by) / 2;
		const dx = bx - ax;
		const dy = by - ay;
		const L = Math.hypot(dx, dy) || 1;
		let nx = -dy / L;
		let ny = dx / L;
		if (ny > 0) {
			nx = -nx;
			ny = -ny;
		}
		const k = 0.2;
		return `M${ax.toFixed(1)},${ay.toFixed(1)} Q${(mx + nx * L * k).toFixed(1)},${(my + ny * L * k).toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
	}

	// Break an airline's legs into the longest continuous runs of track: a walk stops
	// at line ends and junctions (degree ≠ 2), so a through-station stays on one
	// sweeping chain while a junction like NRT/LAX/ABT splits into branches — exactly
	// how a transit line reads as a spine with spurs.
	function chainsOf(legs: [string, string][]): string[][] {
		const adj = new Map<string, string[]>();
		const add = (a: string, b: string) => {
			if (!adj.has(a)) adj.set(a, []);
			adj.get(a)!.push(b);
		};
		for (const [a, b] of legs) {
			add(a, b);
			add(b, a);
		}
		const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
		const used = new Set<string>();
		const codes = [...adj.keys()];
		const seeds = codes.filter((n) => adj.get(n)!.length !== 2);
		const chains: string[][] = [];
		for (const s of seeds.length ? seeds : codes.slice(0, 1)) {
			for (const first of adj.get(s)!) {
				if (used.has(ekey(s, first))) continue;
				const chain = [s];
				let prev = s;
				let cur = first;
				used.add(ekey(prev, cur));
				chain.push(cur);
				while (adj.get(cur)!.length === 2) {
					const nxt = adj.get(cur)!.find((x) => x !== prev);
					if (nxt === undefined || used.has(ekey(cur, nxt))) break;
					used.add(ekey(cur, nxt));
					chain.push(nxt);
					prev = cur;
					cur = nxt;
				}
				chains.push(chain);
			}
		}
		// Any edge left in a pure loop (no degree-≠2 seed) becomes its own segment.
		for (const [a, b] of legs) {
			if (!used.has(ekey(a, b))) {
				used.add(ekey(a, b));
				chains.push([a, b]);
			}
		}
		return chains;
	}

	// Draw a station chain with rounded corners: straight runs joined by a short
	// quadratic sweep at each interior stop — Chicago's soft turns, not sharp miters.
	// The bend's curve is kept within MAX_DEV px of the station point so a through-stop's
	// dot stays visually centred on the line (tighter turns shrink the radius, not the
	// accuracy). Kept well under the node radius (~6.5) so the line never reads off-centre
	// through a dot — even a gentle bend cut a ~1.6px notch at MAX_DEV 2.5.
	const CORNER = 30;
	const MAX_DEV = 0.6;
	function roundedPath(pts: Pt[], r = CORNER): string {
		const f = ([x, y]: Pt) => `${x.toFixed(1)},${y.toFixed(1)}`;
		if (pts.length < 2) return '';
		if (pts.length === 2) return `M${f(pts[0])} L${f(pts[1])}`;
		let d = `M${f(pts[0])}`;
		for (let i = 1; i < pts.length - 1; i++) {
			const [x0, y0] = pts[i - 1];
			const [x1, y1] = pts[i];
			const [x2, y2] = pts[i + 1];
			const l1 = Math.hypot(x1 - x0, y1 - y0) || 1;
			const l2 = Math.hypot(x2 - x1, y2 - y1) || 1;
			// Cap the radius by the bend angle: sin(half-turn) of the direction change
			// bounds how far the quadratic bows off the vertex (≈ 0.5·r·sin(half)).
			const cosTurn = ((x1 - x0) * (x2 - x1) + (y1 - y0) * (y2 - y1)) / (l1 * l2);
			const sinHalf = Math.sqrt(Math.max(0, (1 - cosTurn) / 2));
			const rr = sinHalf > 1e-3 ? Math.min(r, (2 * MAX_DEV) / sinHalf) : r;
			const d1 = Math.min(rr, l1 / 2);
			const d2 = Math.min(rr, l2 / 2);
			const ax = x1 + ((x0 - x1) / l1) * d1;
			const ay = y1 + ((y0 - y1) / l1) * d1;
			const bx = x1 + ((x2 - x1) / l2) * d2;
			const by = y1 + ((y2 - y1) / l2) * d2;
			d += ` L${ax.toFixed(1)},${ay.toFixed(1)} Q${x1.toFixed(1)},${y1.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
		}
		d += ` L${f(pts[pts.length - 1])}`;
		return d;
	}

	// Airline mode bows each leg like an in-flight map; train mode sweeps each line's
	// chain of stations with rounded corners like a printed transit map.
	const arcs = $derived(
		mapMode === 'air'
			? airlines.flatMap((a, i) =>
					a.legs.map(([f, t]) => ({
						color: a.color,
						d: arc(P[f], P[t]),
						i,
						delay: drawDelay([f, t])
					}))
				)
			: airlines.flatMap((a, i) =>
					chainsOf(a.legs).map((chain) => ({
						color: a.color,
						d: roundedPath(chain.map((c) => P[c])),
						i,
						delay: drawDelay(chain)
					}))
				)
	);
	// Place each label in the clear: point it into the widest angular gap between a
	// station's own tracks, so it never lands on a line even at a branch junction.
	function labelFor(code: string, x: number, y: number) {
		const angles = (adj[code] ?? [])
			.map((nb) => {
				const [nx, ny] = P[nb];
				return Math.atan2(ny - y, nx - x);
			})
			.sort((a, b) => a - b);
		let dir = -Math.PI / 2; // no tracks: default upward
		let widest = -1;
		for (let i = 0; i < angles.length; i++) {
			const a = angles[i];
			const b = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
			if (b - a > widest) {
				widest = b - a;
				dir = a + (b - a) / 2;
			}
		}
		const dx = Math.cos(dir);
		const dy = Math.sin(dir);
		// The hub's dot is larger, so its label needs a wider offset to clear it.
		const gap = code === 'KSH' ? 34 : 15;
		const anchor = dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle';
		return { lx: x + dx * gap, ly: y + dy * gap, anchor };
	}
	const nodes = $derived(
		Object.entries(P).map(([code, [x, y]]) => ({
			code,
			x,
			y,
			hub: code === 'KSH',
			title: airports[code].title,
			pop: popDelay(code),
			...labelFor(code, x, y)
		}))
	);

	// World bounds + a background catch-rect (fly home on empty click), sized well
	// past the live layout so a stray click anywhere lands on it.
	const worldPad = 600;
	const worldMinX = $derived(Math.min(...nodes.map((n) => n.x)));
	const worldMaxX = $derived(Math.max(...nodes.map((n) => n.x)));
	const worldMinY = $derived(Math.min(...nodes.map((n) => n.y)));
	const worldMaxY = $derived(Math.max(...nodes.map((n) => n.y)));
	const bg = $derived({
		x: worldMinX - worldPad,
		y: worldMinY - worldPad,
		w: worldMaxX - worldMinX + worldPad * 2,
		h: worldMaxY - worldMinY + worldPad * 2
	});

	// ─── Page content per destination ───────────────────────────────────────────
	// A block list rendered into the content surface. Swap the placeholder copy for
	// real writing; add { h }, { p }, { img }, { quote } blocks freely.
	type Block =
		| { h: string }
		| { sub: string }
		| { p: string }
		| { img: string }
		| { quote: string }
		| { email: string };
	// reicon "mailbox", tucked at the end of the contact address.
	const MAILBOX_SVG =
		'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M18.3715 3.02906C17.9435 2.86413 17.4778 2.82269 17.0274 2.90947L16.75 2.96292V4.61813C17.4742 4.47982 18.2228 4.54702 18.9109 4.8122C19.338 4.97679 19.8019 5.01813 20.25 4.93273V3.27443C19.6437 3.35379 19.025 3.28092 18.4506 3.05957L18.3715 3.02906ZM16.75 6.14572L17.0274 6.09227C17.4778 6.00549 17.9435 6.04692 18.3715 6.21186C19.1193 6.50005 19.9371 6.55389 20.7163 6.36623L20.7829 6.35019C21.3502 6.21354 21.75 5.706 21.75 5.12246V2.90097C21.75 2.13165 21.0305 1.56486 20.2825 1.745C19.8531 1.84845 19.4023 1.81877 18.99 1.65991L18.9109 1.6294C18.2207 1.36345 17.4698 1.29663 16.7436 1.43657L16.2575 1.53023C15.6726 1.64293 15.25 2.15479 15.25 2.75042V6.24956H7C6.95339 6.24956 6.90777 6.25381 6.86352 6.26195C6.74341 6.25373 6.62219 6.24956 6.5 6.24956C3.6005 6.24956 1.25 8.60006 1.25 11.4996V16.767C1.25 18.4142 2.58534 19.7496 4.23256 19.7496H9.75V21.9996C9.75 22.4138 10.0858 22.7496 10.5 22.7496C10.9142 22.7496 11.25 22.4138 11.25 21.9996V19.7496H13.75V21.9996C13.75 22.4138 14.0858 22.7496 14.5 22.7496C14.9142 22.7496 15.25 22.4138 15.25 21.9996V19.7496H19.7931C21.4261 19.7496 22.75 18.4257 22.75 16.7927V11.4996C22.75 8.60006 20.3995 6.24956 17.5 6.24956H16.75V6.14572ZM15.25 7.74956V10.9996C15.25 11.4138 15.5858 11.7496 16 11.7496C16.4142 11.7496 16.75 11.4138 16.75 10.9996V7.74956H17.5C19.5711 7.74956 21.25 9.42849 21.25 11.4996V16.7927C21.25 17.5973 20.5977 18.2496 19.7931 18.2496H11.75V11.4996C11.75 10.0305 11.1466 8.70245 10.1742 7.74956H15.25ZM10.25 18.2496V11.4996C10.25 9.42849 8.57107 7.74956 6.5 7.74956C4.42893 7.74956 2.75 9.42849 2.75 11.4996V16.767C2.75 17.5858 3.41376 18.2496 4.23256 18.2496H10.25ZM4.25 15.9996C4.25 15.5853 4.58579 15.2496 5 15.2496H8C8.41421 15.2496 8.75 15.5853 8.75 15.9996C8.75 16.4138 8.41421 16.7496 8 16.7496H5C4.58579 16.7496 4.25 16.4138 4.25 15.9996Z" fill="currentColor"/></svg>';
	const defaultPages: Record<string, Block[]> = {
		// Welcome — the home hub greeting, from dotcom-2 card K 001.
		KSH: [
			{ p: 'This is Kashinoga, my virtual home.' },
			{ p: 'Here, you’ll find the (mostly) fun things that I’ve created or found.' },
			{ p: 'I hope you enjoy your time here.' },
			{ quote: 'Take care.' }
		],
		// Work — a stop off About, from dotcom-2 About card K 202.
		WRK: [
			{ p: 'I’m a digital infrastructure engineer for U.S. energy companies.' },
			{ p: 'I was formerly a software engineering consultant for the State of Iowa and other midwestern U.S. companies.' },
			{ p: 'I have a B.S. in Computer Science from Iowa State University, and acquired general education from Drake University.' },
			{ quote: 'I do love ranch.' }
		],
		// Projects — a stop off About, from dotcom-2 About card K 203.
		PRJ: [
			{ p: 'Things that I have created and currently operate.' },
			{ sub: 'Digital Community Services' },
			{ p: 'Matrix, Nextcloud, and Open WebUI: for a better digital wellbeing.' },
			{ sub: 'Digital Play Services' },
			{ p: 'Casual, community, and competitive gaming for friends.' },
			{ sub: 'SDKK' },
			{ p: 'A safe, friendly Discord community.' },
			{ quote: ':3dloldeepfried: - IYKYK' }
		],
		// Apps — the hub for the little live apps.
		APP: [
			{ p: 'Little live apps I’ve built — tap one to open it.' },
			{ quote: 'More to come.' }
		],
		// About / intro — dotcom-2 About card K 201.
		ABT: [
			{ h: 'Andrew Nguyen' },
			{ p: 'I enjoy nature, literature, and video games — and heightened experiences.' },
			{ p: 'I’m based in the Midwestern United States, with occasional visits to Southeast Asia for friends and family.' },
			{ email: 'contact@kashinoga.com' }
		]
	};
	const stub = (t: string): Block[] => [
		{
			p: `“${t}” is a placeholder destination. This surface scrolls and holds headings, paragraphs, images, and quotes — drop the real ${t.toLowerCase()} content here.`
		}
	];

	// Live, editable copy of the panel body copy. Edit Mode writes into `drafts`
	// (kept out of reactive state so typing never resets the caret); Save applies
	// them here, persists a sparse override map for this browser, and copies the
	// whole thing to the clipboard so it can be baked back into the source.
	const CONTENT_KEY = 'ksh-content';
	let pages = $state<Record<string, Block[]>>(structuredClone(defaultPages));
	// Editable train-line names (Loess, Gray's, …), same Edit-Mode machinery.
	const defaultLineNames = airlines.map((a) => a.name);
	let lineNames = $state([...defaultLineNames]);
	let editMode = $state(false);
	let editRev = $state(0); // bump to remount panel content (reset DOM after save/discard)
	let toast = $state('');
	let toastTimer = 0;
	// Which block fields are editable text, per the block's shape.
	const EDIT_FIELDS = ['h', 'sub', 'p', 'quote', 'email'] as const;
	type EditField = (typeof EDIT_FIELDS)[number];
	// Non-reactive staging: `${code}.${index}.${field}` → edited text.
	let drafts: Record<string, string> = {};

	const fieldKey = (code: string, i: number, f: EditField) => `${code}.${i}.${f}`;
	// Text to render for a field: a live draft if one is staged, else the saved value.
	function fieldText(code: string, i: number, f: EditField, fallback: string) {
		const k = fieldKey(code, i, f);
		return k in drafts ? drafts[k] : fallback;
	}
	function stageEdit(code: string, i: number, f: EditField, text: string) {
		drafts[fieldKey(code, i, f)] = text;
	}
	// Line names share the drafts buffer under a distinct `LINE.<idx>.name` key.
	const lineKey = (idx: number) => `LINE.${idx}.name`;
	function lineFieldText(idx: number) {
		const k = lineKey(idx);
		return k in drafts ? drafts[k] : lineNames[idx];
	}
	function stageLineEdit(idx: number, text: string) {
		drafts[lineKey(idx)] = text;
	}
	function showToast(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => (toast = ''), 4000);
	}
	function enterEditMode() {
		if (!dev) return; // Edit Mode is a dev-only authoring tool.
		drafts = {};
		editMode = true;
	}
	// Dev-only: wipe this app's saved preferences + edits, then reload to defaults.
	function clearLocalStorage() {
		if (!dev) return;
		try {
			for (const k of [MODE_KEY, NAMES_KEY, THEME_KEY, CONTENT_KEY, EXPAND_KEY, SKY_KEY, STARS_KEY, UI_KEY])
				localStorage.removeItem(k);
		} catch {
			/* storage unavailable — nothing to clear */
		}
		location.reload();
	}
	function discardEdits() {
		drafts = {};
		editMode = false;
		editRev++; // remount so any edited-but-discarded DOM resets to saved text
	}
	async function saveEdits() {
		// Apply staged drafts onto the live pages (and line names).
		for (const [k, val] of Object.entries(drafts)) {
			const [code, iStr, f] = k.split('.');
			if (code === 'LINE') {
				if (f === 'name') lineNames[Number(iStr)] = val;
				else if (f === 'body') lineBodies[Number(iStr)] = val;
				continue;
			}
			if (code === 'SETTINGS') {
				if (iStr in settings) settings[iStr] = val;
				continue;
			}
			const block = pages[code]?.[Number(iStr)] as Record<string, string> | undefined;
			if (block && f in block) block[f] = val;
		}
		drafts = {};
		editMode = false;
		editRev++;
		// Persist a sparse override map for this browser so the work survives reloads.
		try {
			const overrides: Record<string, string> = {};
			for (const code of Object.keys(pages)) {
				pages[code].forEach((b, i) => {
					const def = defaultPages[code]?.[i] as Record<string, string> | undefined;
					for (const f of EDIT_FIELDS) {
						const cur = (b as Record<string, string>)[f];
						if (cur !== undefined && def && cur !== def[f]) overrides[fieldKey(code, i, f)] = cur;
					}
				});
			}
			lineNames.forEach((name, i) => {
				if (name !== defaultLineNames[i]) overrides[lineKey(i)] = name;
			});
			lineBodies.forEach((body, i) => {
				if (body !== defaultLineBodies[i]) overrides[lineBodyKey(i)] = body;
			});
			for (const k of Object.keys(settings)) {
				if (settings[k] !== defaultSettings[k]) overrides[settingsKey(k)] = settings[k];
			}
			if (Object.keys(overrides).length) localStorage.setItem(CONTENT_KEY, JSON.stringify(overrides));
			else localStorage.removeItem(CONTENT_KEY);
		} catch {
			/* storage unavailable — the clipboard copy is still the source of truth */
		}
		// Hand the full edited copy back: copy JSON to the clipboard (and log it).
		const json = JSON.stringify(
			{
				pages,
				lines: airlines.map((_, i) => ({ name: lineNames[i], body: lineBodies[i] })),
				settings
			},
			null,
			2
		);
		console.log('[Kashinoga] edited panel copy:\n' + json);
		try {
			await navigator.clipboard.writeText(json);
			showToast('Saved. Content copied — paste it to Claude to make it permanent.');
		} catch {
			showToast('Saved locally. Copy the JSON from the console to make it permanent.');
		}
	}
	// Apply any saved overrides from this browser onto the live pages and line names.
	function applySavedContent() {
		try {
			const raw = localStorage.getItem(CONTENT_KEY);
			if (!raw) return;
			const ov = JSON.parse(raw) as Record<string, string>;
			if (!ov || typeof ov !== 'object') return;
			for (const [k, val] of Object.entries(ov)) {
				if (typeof val !== 'string') continue;
				const [code, iStr, f] = k.split('.');
				if (code === 'LINE') {
					const idx = Number(iStr);
					if (f === 'name' && idx < lineNames.length) lineNames[idx] = val;
					else if (f === 'body' && idx < lineBodies.length) lineBodies[idx] = val;
					continue;
				}
				if (code === 'SETTINGS') {
					if (iStr in settings) settings[iStr] = val;
					continue;
				}
				const block = pages[code]?.[Number(iStr)] as Record<string, string> | undefined;
				if (block && f in block) block[f] = val;
			}
		} catch {
			/* ignore malformed saved content */
		}
	}

	// Which airline colour serves each airport, and everywhere it connects to.
	const accent: Record<string, string> = {};
	const adj: Record<string, string[]> = {};
	for (const a of airlines) {
		for (const [f, t] of a.legs) {
			accent[f] ??= a.color;
			accent[t] ??= a.color;
			(adj[f] ??= []).push(t);
			(adj[t] ??= []).push(f);
		}
	}
	// Airports on each airline (index → set of codes) for line highlighting.
	const lineOf = airlines.map((a) => new Set<string>(a.legs.flat()));

	// Editable line body copy: a stored blurb per line (defaults to the generated
	// "calls at N destinations" sentence, or an airline's own `body` if set).
	const defaultLineBodies = airlines.map(
		(a, i) =>
			a.body ??
			`The ${defaultLineNames[i]} line calls at ${lineOf[i].size} destinations across the network — tap a station to fly there.`
	);
	let lineBodies = $state([...defaultLineBodies]);
	const lineBodyKey = (idx: number) => `LINE.${idx}.body`;
	function lineBodyText(idx: number) {
		const k = lineBodyKey(idx);
		return k in drafts ? drafts[k] : lineBodies[idx];
	}
	function stageLineBody(idx: number, text: string) {
		drafts[lineBodyKey(idx)] = text;
	}

	// Editable Settings-panel copy — the section descriptions. Same Edit-Mode
	// machinery, under a SETTINGS.<key> draft namespace.
	// Section descriptions and the flavor notes. Notes use a `{}` placeholder that
	// renders the live value (e.g. the current map style); editing keeps the token.
	const defaultSettings: Record<string, string> = {
		routeLead: 'Choose how the network draws its routes between stations.',
		routeNote: 'Now showing {}. The change applies across the whole map and is remembered next time.',
		labelLead: 'Choose how stations are labelled on the map.',
		labelNote: 'Now showing {}. Remembered next time.',
		displayLead: 'Choose the display mode (also up by the wordmark).',
		displayNote: '{}. Remembered next time.',
		skyLead: 'Paint the map with a time-of-day sky.',
		skyNote:
			'{} The sky sets the palette while on, so the display mode above applies again when it’s off. Remembered next time.',
		starsLead: 'Show tiny stars when the sky is Night.',
		starsNote: '{} Remembered next time.',
		uiLead: 'Choose how buttons across the site look and feel.',
		uiNote: '{} Remembered next time.',
		// Air Traffic board intro copy. `atfcLead` uses a `{}` token for the live range
		// (NM); the demo variant has none. Edited via Edit Mode inside the board itself.
		atfcLead: 'Live traffic within {} NM of a field — arriving, departing, or passing over.',
		atfcLeadDemo: ''
	};
	let settings = $state<Record<string, string>>({ ...defaultSettings });
	const settingsKey = (k: string) => `SETTINGS.${k}`;
	function settingsText(k: string) {
		const key = settingsKey(k);
		return key in drafts ? drafts[key] : settings[k];
	}
	function stageSettings(k: string, text: string) {
		drafts[settingsKey(k)] = text;
	}
	// A note renders its raw template while editing (so the `{}` token is visible),
	// or with the live value substituted otherwise.
	const noteText = (k: string, dyn: string, edit: boolean) =>
		edit ? settingsText(k) : settingsText(k).replace('{}', dyn);

	// BFS depth from the hub, so the map reveals in rings: the hub pops first, then
	// its neighbours, then theirs, and so on — each section's lines drawing just after.
	const depth: Record<string, number> = { KSH: 0 };
	{
		const queue = ['KSH'];
		while (queue.length) {
			const cur = queue.shift()!;
			for (const nb of adj[cur] ?? []) {
				if (depth[nb] === undefined) {
					depth[nb] = depth[cur] + 1;
					queue.push(nb);
				}
			}
		}
	}
	// Reveal cadence (seconds): first node, per-ring step, and how far a ring's lines
	// trail its nodes. Node d pops at START + d·STEP; its incoming line draws a beat later.
	const REVEAL_START = 0.2;
	const REVEAL_STEP = 0.35;
	const REVEAL_LINE = 0.12;
	const popDelay = (code: string) => REVEAL_START + (depth[code] ?? 0) * REVEAL_STEP;
	const drawDelay = (codes: string[]) =>
		REVEAL_START + Math.max(...codes.map((c) => depth[c] ?? 0)) * REVEAL_STEP + REVEAL_LINE;

	// ─── Camera: crop the world, fly between crops to "move pages" ───────────────
	// Landscape viewBox on desktop; a portrait one for the vertical mobile train map.
	const ASPECT = $derived(mapMode === 'rail' && isMobile ? 0.64 : 1.5); // viewBox w/h
	// Home is zoomed to the hub so routes bleed off every edge; a node focus keeps
	// the node in the left-of-panel area (biasX) with its neighbours in view.
	function crop(cx: number, cy: number, w: number, biasX = 0.5, biasY = 0.5) {
		const h = w / ASPECT;
		return { x: cx - w * biasX, y: cy - h * biasY, w, h };
	}
	// Home framing: the whole left column is UI (masthead top-left, legend
	// bottom-left), so bias the network to the centre-right — hub past centre,
	// spokes fanning right — keeping the left clear of routes and nodes. Both modes
	// zoom into the hub at a comfortable scale so the outermost stations run off the
	// edges (reached by flying to them), rather than shrinking to fit everything in.
	const HOME_AIR = crop(P_air.KSH[0], P_air.KSH[1], 860, 0.66, 0.56);
	const HOME = $derived(
		mapMode === 'air'
			? HOME_AIR
			: isMobile
				? crop(P_rail_v.KSH[0], P_rail_v.KSH[1], 340, 0.5, 0.55)
				: crop(P_rail.KSH[0], P_rail.KSH[1], 900, 0.62, 0.54)
	);

	// Default mode is airline, so the camera starts on the airline home framing;
	// onMount resets it if a train-mode preference is restored from storage.
	let cam = $state({ ...HOME_AIR });
	// A destination page, a highlighted airline line, or neither.
	type View = { kind: 'port'; code: string } | { kind: 'line'; idx: number };
	let view = $state<View | null>(null);
	// When navigating panel→panel, the whole panel slides off before its content swaps.
	let panelLeaving = $state(false);
	// Expand the panel to fill the viewport (handy for the wide Traffic board).
	// Remembered across panels and reloads.
	const EXPAND_KEY = 'ksh-panel-expanded';
	let panelExpanded = $state(false);
	function toggleExpand() {
		panelExpanded = !panelExpanded;
		// Expanding covers the map, so let it fade once it's rested; un-expanding puts
		// the map back beside the panel, so bring it straight back.
		if (panelExpanded) scheduleHide();
		else {
			clearTimeout(hideTimer);
			mapHidden = false;
		}
		try {
			localStorage.setItem(EXPAND_KEY, panelExpanded ? '1' : '0');
		} catch {
			/* storage unavailable — keep the in-memory choice */
		}
	}
	// maximize / minimize (expand-panel toggle) are shared with the Traffic board, so
	// they live in $lib/icons.
	const PANEL_SLIDE = 300;
	let navTimer = 0;
	let target = { ...HOME_AIR };
	let raf = 0;

	// With an EXPANDED panel the map is fully covered, so it keeps flying to its
	// framing as usual — you see the movement — but once the camera settles there's
	// nothing left to look at behind the panel, so fade the whole map out a beat
	// later. A non-expanded panel sits beside the map, so it always stays visible.
	// Each fresh open, panel→panel nav, un-expand, or close brings it back so the
	// motion replays first.
	let mapHidden = $state(false);
	let hideTimer = 0;
	const HIDE_LINGER = 520; // ms to let the settled map rest before it fades
	function scheduleHide() {
		clearTimeout(hideTimer);
		if (!view || !panelExpanded) return;
		hideTimer = window.setTimeout(() => {
			if (view && panelExpanded) mapHidden = true;
		}, HIDE_LINGER);
	}

	// Drag-to-pan.
	let svgEl: SVGSVGElement;
	let panelEl = $state<HTMLElement | undefined>(undefined);
	let panning = $state(false);
	let dragMoved = false;
	// `scale` (screen px per world unit) is cached at drag start: a pan shifts the camera
	// but never changes cam.w/h or the svg's rect, so it's constant for the whole drag —
	// caching it keeps onPointerMove from forcing a layout (getBoundingClientRect) per move.
	const drag = { camX: 0, camY: 0, x: 0, y: 0, id: -1, scale: 1 };

	const reduce =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	function step() {
		const s = 0.17;
		for (const k of ['x', 'y', 'w', 'h'] as const) cam[k] += (target[k] - cam[k]) * s;
		if ((['x', 'y', 'w', 'h'] as const).every((k) => Math.abs(target[k] - cam[k]) < 0.4)) {
			cam = { ...target };
			raf = 0;
			// Movement's done — if a panel's up, let the resting map fade out shortly.
			if (view && !mapHidden) scheduleHide();
			return;
		}
		raf = requestAnimationFrame(step);
	}
	function flyTo(t: typeof HOME) {
		target = t;
		if (reduce) {
			cam = { ...t };
			// No fly to watch under reduced motion — settle straight into the fade.
			if (view && !mapHidden) scheduleHide();
			return;
		}
		if (!raf) raf = requestAnimationFrame(step);
	}

	// Show a destination/line: fly the camera there and render its panel content.
	function applyView(nv: View) {
		view = nv;
		// The Presentation Builder is a three-column editor — force the full-viewport layout on
		// open (its compact form is a fallback, not the intended experience).
		if (nv.kind === 'port' && nv.code === 'PRES') panelExpanded = true;
		// Reveal the map for this open so the fly is seen; scheduleHide (on settle)
		// fades it again if the panel is expanded.
		clearTimeout(hideTimer);
		mapHidden = false;
		// On mobile the panel is a full-screen sheet, so there's no "beside the panel"
		// to bias toward — panning would just slide the map sideways behind the sheet.
		// Instead dolly straight back from the home framing (further away, centred).
		if (isMobile) {
			const f = 1.3;
			flyTo({
				x: HOME.x - (HOME.w * (f - 1)) / 2,
				y: HOME.y - (HOME.h * (f - 1)) / 2,
				w: HOME.w * f,
				h: HOME.h * f
			});
			return;
		}
		flyTo(nv.kind === 'port' ? crop(P[nv.code][0], P[nv.code][1], 720, 0.3) : fitLine(nv.idx));
	}
	// Reuse the open panel across destinations: slide the whole panel out, swap its
	// content off-screen, then slide it back in. A fresh open (no panel yet) or
	// reduced-motion just applies immediately.
	function navigate(nv: View) {
		clearTimeout(navTimer);
		if (view && !reduce) {
			panelLeaving = true;
			navTimer = window.setTimeout(() => {
				applyView(nv);
				panelLeaving = false;
			}, PANEL_SLIDE);
		} else {
			applyView(nv);
		}
	}
	function board(code: string) {
		navigate({ kind: 'port', code });
	}
	function openLine(idx: number) {
		navigate({ kind: 'line', idx });
	}
	function home() {
		clearTimeout(navTimer);
		clearTimeout(hideTimer);
		panelLeaving = false;
		// Bring the map back so the fly home is visible behind the closing panel.
		mapHidden = false;
		// Keep panelExpanded set so the panel flies out at its current width in one
		// clean slide (it's reset on the next fresh open, not mid-close).
		view = null;
		flyTo(HOME);
		// Drop focus off the selected node so its dot returns to its normal weight
		// (the bolder stroke comes from :focus-visible, which otherwise lingers when
		// the panel closes via Escape or an empty-space click).
		if (typeof document !== 'undefined') {
			(document.activeElement as HTMLElement | null)?.blur?.();
		}
	}
	// Escape closes an open panel; on the overview map it opens Settings.
	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		e.preventDefault();
		if (view) home();
		else board('STG');
	}

	// ─── Drag-to-pan ────────────────────────────────────────────────────────────
	function onPointerDown(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		dragMoved = false;
		drag.camX = cam.x;
		drag.camY = cam.y;
		drag.x = e.clientX;
		drag.y = e.clientY;
		drag.id = e.pointerId;
		// Uniform meet scale, frozen for the drag (cam.w/h and the rect don't change while panning).
		const r = svgEl.getBoundingClientRect();
		drag.scale = Math.min(r.width / cam.w, r.height / cam.h);
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		target = { ...cam };
	}
	function onPointerMove(e: PointerEvent) {
		if (drag.id !== e.pointerId) return;
		const dx = e.clientX - drag.x;
		const dy = e.clientY - drag.y;
		if (!dragMoved) {
			if (Math.hypot(dx, dy) < 4) return;
			// Only now is it a real drag — capture so we keep move/up, and so a plain
			// click on a node is never hijacked away from the node.
			dragMoved = true;
			panning = true;
			svgEl.setPointerCapture(e.pointerId);
		}
		const s = drag.scale; // cached at pointer-down — no layout read per move
		const m = 220; // let the world edge come ~this far past centre, no further
		const cx = Math.min(worldMaxX + m, Math.max(worldMinX - m, drag.camX - dx / s + cam.w / 2));
		const cy = Math.min(worldMaxY + m, Math.max(worldMinY - m, drag.camY - dy / s + cam.h / 2));
		cam = { ...cam, x: cx - cam.w / 2, y: cy - cam.h / 2 };
		target = { ...cam };
	}
	function onPointerUp(e: PointerEvent) {
		if (drag.id !== e.pointerId) return;
		if (svgEl.hasPointerCapture(e.pointerId)) svgEl.releasePointerCapture(e.pointerId);
		drag.id = -1;
		panning = false;
	}
	// If the pointer moved (a pan), swallow the click so it doesn't board a node.
	function onClickCapture(e: MouseEvent) {
		if (dragMoved) {
			e.stopPropagation();
			dragMoved = false;
		}
	}
	// Smallest screen-space shift that fits the dot inside [safeLo, safeHi], then
	// reveals as much of the label as possible without pushing the dot back out.
	function axisDelta(
		dotLo: number,
		dotHi: number,
		labLo: number,
		labHi: number,
		safeLo: number,
		safeHi: number
	) {
		let d = 0;
		if (dotLo < safeLo) d = safeLo - dotLo;
		else if (dotHi > safeHi) d = safeHi - dotHi;
		const lo = Math.min(dotLo, labLo);
		const hi = Math.max(dotHi, labHi);
		if (hi + d > safeHi) {
			// Pull toward the low edge to show the label, but keep the dot's low edge in.
			d += Math.max(safeHi - (hi + d), safeLo - (dotLo + d));
		} else if (lo + d < safeLo) {
			d += Math.min(safeLo - (lo + d), safeHi - (dotHi + d));
		}
		return d;
	}
	// While a panel is open, hovering (or focusing) a node that's tucked behind the
	// panel or off an edge nudges the camera just enough to bring the dot and its
	// whole label into the clear — a small pan, not a re-frame. Measures the actual
	// rendered dot/label rects so a label reaching toward the panel is fully shown.
	function revealNode(e: Event) {
		const g = e.currentTarget as SVGGElement | null;
		if (!view || panning || !svgEl || !g) return;
		const ctm = svgEl.getScreenCTM();
		const dotEl = g.querySelector('.port');
		const labelEl = g.querySelector('.code');
		if (!ctm || !dotEl || !labelEl) return;
		const dot = dotEl.getBoundingClientRect();
		const label = labelEl.getBoundingClientRect();
		const rect = svgEl.getBoundingClientRect();
		const margin = 40;
		let safeL = rect.left + margin;
		let safeR = rect.right - margin;
		let safeT = rect.top + margin;
		let safeB = rect.bottom - margin;
		// Carve the panel out of the safe area: a right-side column on desktop, a
		// bottom sheet on mobile.
		const pr = panelEl?.getBoundingClientRect();
		if (pr && pr.width > 1 && pr.height > 1) {
			const coversBottom = pr.bottom >= rect.bottom - 2;
			const coversRightFull =
				pr.right >= rect.right - 2 && pr.top <= rect.top + 2 && coversBottom;
			if (coversRightFull) safeR = Math.min(safeR, pr.left - margin);
			else if (coversBottom) safeB = Math.min(safeB, pr.top - margin);
		}
		// If the panel leaves too little room on an axis, don't nudge along it.
		if (safeR - safeL < 80) ((safeL = rect.left), (safeR = rect.right));
		if (safeB - safeT < 80) ((safeT = rect.top), (safeB = rect.bottom));
		const needX = axisDelta(dot.left, dot.right, label.left, label.right, safeL, safeR);
		const needY = axisDelta(dot.top, dot.bottom, label.top, label.bottom, safeT, safeB);
		if (Math.hypot(needX, needY) < 3) return;
		// Screen delta → world delta (content shifts opposite the camera origin).
		const nx = target.x - needX / ctm.a;
		const ny = target.y - needY / ctm.d;
		// Clamp so we never pan off into empty world (same slack as drag).
		const m = 220;
		const cx = Math.min(worldMaxX + m, Math.max(worldMinX - m, nx + target.w / 2));
		const cy = Math.min(worldMaxY + m, Math.max(worldMinY - m, ny + target.h / 2));
		flyTo({ ...target, x: cx - target.w / 2, y: cy - target.h / 2 });
	}
	// Frame a whole airline: fit all its airports, biased left of the panel.
	function fitLine(idx: number) {
		const codes = [...lineOf[idx]];
		const pxs = codes.map((c) => P[c][0]);
		const pys = codes.map((c) => P[c][1]);
		const cx = (Math.min(...pxs) + Math.max(...pxs)) / 2;
		const cy = (Math.min(...pys) + Math.max(...pys)) / 2;
		const spanW = Math.max(...pxs) - Math.min(...pxs);
		const spanH = Math.max(...pys) - Math.min(...pys);
		const w = Math.max(spanW, spanH * ASPECT) * 1.3 + 260;
		return crop(cx, cy, w, 0.36);
	}
	function isActive(code: string) {
		return view?.kind === 'port' && view.code === code;
	}
	// Dimming only applies to the expanded panel (where the map fades out behind it anyway).
	// With an unexpanded panel the map sits beside it in full colour — no dimming.
	function nodeDim(code: string) {
		if (!view || !panelExpanded) return false;
		return view.kind === 'port' ? view.code !== code : !lineOf[view.idx].has(code);
	}
	function arcDim(airlineIdx: number) {
		if (!view || !panelExpanded) return false;
		return view.kind === 'port' ? true : view.idx !== airlineIdx;
	}

	let wasMobile = false;
	function onResize() {
		vw = window.innerWidth;
		// On a desktop⇄mobile crossover the layout swaps; re-frame if idle at home.
		if (isMobile !== wasMobile) {
			wasMobile = isMobile;
			if (!view) flyTo(HOME);
		}
	}

	onMount(() => {
		vw = window.innerWidth;
		wasMobile = isMobile;
		const s = localStorage.getItem(MODE_KEY);
		if (s === 'air' || s === 'rail') mapMode = s;
		// First ever load (no saved preference): default to the train map on any
		// device. With no label pref saved either, train mode shows full stop names.
		else mapMode = 'rail';
		const n = localStorage.getItem(NAMES_KEY);
		if (n === '1' || n === '0') stopNamesPref = n === '1';
		const th = localStorage.getItem(THEME_KEY);
		if (th === 'light' || th === 'dark') theme = th;
		if (localStorage.getItem(EXPAND_KEY) === '1') panelExpanded = true;
		const sky = localStorage.getItem(SKY_KEY);
		if (sky === 'off' || sky === 'auto' || (sky && SKY_PHASES.includes(sky as SkyPhase)))
			skyMode = sky as SkyMode; // else default 'auto'
		applySky();
		STARS = makeStars(); // fresh random field per load (client-side)
		starsOn = localStorage.getItem(STARS_KEY) !== '0'; // default on
		if (localStorage.getItem(UI_KEY) === 'bubble') setUiStyle('bubble'); // else default flat
		// While on Auto, keep the phase current if the tab is left open across a boundary.
		skyTimer = window.setInterval(() => skyMode === 'auto' && applySky(), 5 * 60 * 1000);
		if (dev) applySavedContent();
		// Snap to the resolved mode/orientation home framing.
		cam = { ...HOME };
		target = { ...HOME };
	});

	onDestroy(() => {
		if (raf) cancelAnimationFrame(raf);
		clearTimeout(navTimer);
		clearTimeout(hideTimer);
		clearTimeout(toastTimer);
		clearInterval(skyTimer);
	});

	const viewBox = $derived(
		`${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${cam.w.toFixed(1)} ${cam.h.toFixed(1)}`
	);
</script>

<svelte:window onkeydown={onKey} onresize={onResize} />

<!-- Onward-travel chip row, shared by every panel: a destination's connections, a
     line's station list, and the Traffic board's Connections slot. `label` names the
     section; `codes` are the station codes to link to. -->
{#snippet onward(label: string, codes: string[])}
	{#if codes.length}
		<nav class="onward">
			<p class="eyebrow">{label}</p>
			<ul>
				{#each codes as c}
					<li>
						<button class="chip" onclick={() => board(c)}>
							<span class="chip-dot" style:background={accent[c]}></span>
							<span class="chip-code">{c}</span>
							<span class="chip-title">{airports[c].title}</span>
						</button>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}
{/snippet}

<div class="stage" class:panning>
	{#if starsVisible}
		<div class="stars" aria-hidden="true" transition:fade={{ duration: 700 }}>
			{#each STARS as s}
				<span
					class:tw={s.tw}
					style="left:{s.x}%; top:{s.y}%; width:{s.size}px; height:{s.size}px; animation-duration:{s.dur}s; animation-delay:{s.delay}s"
				></span>
			{/each}
		</div>
	{/if}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<svg
		bind:this={svgEl}
		class:map-hidden={mapHidden}
		{viewBox}
		preserveAspectRatio="xMidYMid meet"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onclickcapture={onClickCapture}
		onmousedown={(e) => e.detail > 1 && e.preventDefault()}
		role="img"
		aria-label="Kashinoga — {mapPhrase}"
	>
		<defs>
			<!-- Glossy bead fill for the map nodes in Bubble mode (data-ui="bubble"): a bright
			     top-left highlight fading to a soft cool edge so each white node reads as a raised
			     pearl. objectBoundingBox units, so the one gradient maps to every node + the hub. -->
			<radialGradient id="node-bubble" cx="0.34" cy="0.26" r="0.82">
				<stop offset="0%" stop-color="#ffffff" />
				<stop offset="42%" stop-color="#eef0f5" />
				<stop offset="100%" stop-color="#b9c0cf" />
			</radialGradient>
		</defs>

		<!-- empty-space click flies home -->
		<rect class="bg" x={bg.x} y={bg.y} width={bg.w} height={bg.h} ondblclick={home} role="presentation" />

		<!-- Routes grouped so one soft grounding shadow lifts the whole layer off the map. -->
		<g class="arcs">
			{#each arcs as a}
				<path
					class="arc"
					class:dim={arcDim(a.i)}
					d={a.d}
					stroke={a.color}
					pathLength="1"
					style="--draw:{a.delay}s"
				/>
			{/each}
		</g>

		{#each nodes as n}
			<g
				class="node"
				class:active={isActive(n.code)}
				class:dim={nodeDim(n.code)}
				style="--pop:{n.pop}s"
				role="button"
				tabindex="0"
				aria-label="Fly to {n.title}"
				onclick={() => board(n.code)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), board(n.code))}
				onpointerenter={revealNode}
				onfocus={revealNode}
			>
				<circle class="hit" cx={n.x} cy={n.y} r="26" />
				<!-- Just a white circle; the hub is the same, only larger. -->
				<circle class="port" class:hub={n.hub} cx={n.x} cy={n.y} r={n.hub ? 15 : 6.5} />
				<text
					class="code"
					class:code-hub={n.hub}
					x={n.lx}
					y={n.ly}
					style:transform-origin="{n.lx}px {n.ly}px"
					text-anchor={n.anchor}
					dominant-baseline="central">{showStopNames ? n.title : n.code}</text>
			</g>
		{/each}
	</svg>

	<header class="masthead" class:hidden={view !== null}>
		<div class="brandline">
			<h1><SplitFlap text="Kashinoga" /></h1>
			<!-- Little display-mode bullets, like the route icons on a station sign. -->
			<!-- Decorative station-sign bullets (nonfunctional); theme switching lives in the
			     Settings panel's Display-mode control. -->
			<div class="theme" aria-hidden="true">
				<span class="theme-dot" style="--n:0; --dot:#e6b93c"></span>
				<span class="theme-dot" style="--n:1; --dot:#29b0a1"></span>
				<span class="theme-dot" style="--n:2; --dot:#e05a4e"></span>
			</div>
		</div>
		<p class="tagline">{#each taglineWords as word, i}<span class="tw" style="--n:{i}"
				>{word}</span
			>{' '}{/each}</p>
	</header>

	<ul class="legend" class:hidden={view !== null}>
		{#each airlines as a, i}
			<li style="--n:{i}">
				<button class="legend-btn" onclick={() => openLine(i)}>
					<span class="swatch" style="background:{a.color}"></span>{lineNames[i]}
				</button>
			</li>
		{/each}
	</ul>

	{#if view}
		{@const v = view}
		<aside
			bind:this={panelEl}
			class="surface"
			class:leaving={panelLeaving}
			class:expanded={panelExpanded}
			transition:fly|global={isMobile
				? { y: 900, opacity: 1, duration: 380 }
				: { x: panelExpanded ? vw : 680, opacity: 1, duration: 380 }}
		>
			<!-- Frosted glass pane. Held OFF the scroller (a static, non-scrolling layer) so
			     WebKit rasterises the backdrop blur once instead of re-blurring every scroll
			     frame - the fix for Safari big-surface backdrop-filter cost. -->
			<div class="surface-backdrop" aria-hidden="true"></div>
			{#if !(v.kind === 'port' && (v.code === 'ATFC' || v.code === 'PRES'))}
				<!-- ATFC's TrafficBoard renders its own expand toggle (bar cap when expanded,
				     top-right when compact) so it aligns with the board's back control. -->
				<button
					type="button"
					class="icon-btn expand"
					aria-pressed={panelExpanded}
					aria-label={panelExpanded ? 'Collapse panel' : 'Expand panel to fill'}
					title={panelExpanded ? 'Collapse' : 'Expand to fill'}
					onclick={toggleExpand}
				>
					{@html panelExpanded ? MINIMIZE_SVG : MAXIMIZE_SVG}
				</button>
			{/if}
			<!-- The panel is reused across destinations: on navigation the whole panel
			     slides out, swaps to the new node's content while off-screen, then
			     slides back in. transition:fly handles the map⇄panel open/close. The
			     inner key (no transition) just remounts content so the arrival-board
			     titles re-flip on each destination. -->
			<div class="surface-scroll">
			{#key (v.kind === 'port' ? 'p' + v.code : 'l' + v.idx) + ':' + editRev}
				{#if v.kind === 'port'}
					{@const port = airports[v.code]}
					{@const blocks = pages[v.code] ?? stub(port.title)}
					{@const conns = [...new Set(adj[v.code] ?? [])]}
					{#if v.code === 'ATFC'}
						<!-- The Traffic board owns its whole panel interior so, when expanded, its
						     controls + a live summary fill the header beside the title. It gets the
						     panel chrome it can't reach from a child: title, code, back, expanded, and
						     the Connections nav as a snippet (authored here so it keeps page styling). -->
						<TrafficBoard
							accent={accent[v.code]}
							code={v.code}
							title={port.title}
							expanded={panelExpanded}
							onback={home}
							onToggleExpand={toggleExpand}
							edit={dev && editMode}
							copyText={settingsText}
							onCopyEdit={stageSettings}
						>
							{#snippet connections()}
								{@render onward('Connections', conns)}
							{/snippet}
						</TrafficBoard>
					{:else if v.code === 'PRES'}
						<!-- The Presentation Builder owns its whole panel interior (its own toolbar +
						     three-column editor), like the Traffic board. It's always full-viewport —
						     forced expanded on open (applyView), with no collapse toggle. -->
						<PresentationBuilder accent={accent[v.code]} title={port.title} onback={home} />
					{:else}
					<div class="surface-head">
						<button class="icon-btn back" onclick={home} aria-label="Back to route map" title="Route map">{@html BACK_SVG}</button>
						<p class="eyebrow">Now arriving &middot; <span style:color={accent[v.code]}>{v.code}</span></p>
						<h2 class="dest"><SplitFlap text={port.title} base={160} stagger={45} /></h2>
					</div>
					<div class="surface-body">
						{#if v.code === 'STG'}
							{@const editStg = dev && editMode}
							<p
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('routeLead', e.currentTarget.textContent ?? '')
									: undefined}
							>{settingsText('routeLead')}</p>
							<div class="segmented" role="radiogroup" aria-label="Route map style">
								<button
									type="button"
									class="seg"
									class:on={mapMode === 'air'}
									role="radio"
									aria-checked={mapMode === 'air'}
									onclick={() => setMapMode('air')}
								>
									<span class="seg-title">Airline</span>
									<span class="seg-sub">curved routes</span>
								</button>
								<button
									type="button"
									class="seg"
									class:on={mapMode === 'rail'}
									role="radio"
									aria-checked={mapMode === 'rail'}
									onclick={() => setMapMode('rail')}
								>
									<span class="seg-title">Train</span>
									<span class="seg-sub">transit lines</span>
								</button>
							</div>
							<p
								class="seg-note"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('routeNote', e.currentTarget.textContent ?? '')
									: undefined}
							>{noteText('routeNote', mapPhrase, editStg)}</p>
							<p
								class="seg-lead"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('labelLead', e.currentTarget.textContent ?? '')
									: undefined}
							>{settingsText('labelLead')}</p>
							<div class="segmented" role="radiogroup" aria-label="Station label style">
								<button
									type="button"
									class="seg"
									class:on={!showStopNames}
									role="radio"
									aria-checked={!showStopNames}
									onclick={() => setShowStopNames(false)}
								>
									<span class="seg-title">Codes</span>
									<span class="seg-sub">e.g. WRK</span>
								</button>
								<button
									type="button"
									class="seg"
									class:on={showStopNames}
									role="radio"
									aria-checked={showStopNames}
									onclick={() => setShowStopNames(true)}
								>
									<span class="seg-title">Full names</span>
									<span class="seg-sub">e.g. Work</span>
								</button>
							</div>
							<p
								class="seg-note"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('labelNote', e.currentTarget.textContent ?? '')
									: undefined}
							>{noteText('labelNote', labelValue, editStg)}</p>
							<p
								class="seg-lead"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('displayLead', e.currentTarget.textContent ?? '')
									: undefined}
							>{settingsText('displayLead')}</p>
							<div class="segmented three" role="radiogroup" aria-label="Display mode">
								{#each themeModes as m}
									<button
										type="button"
										class="seg"
										class:on={theme === m.id}
										role="radio"
										aria-checked={theme === m.id}
										onclick={() => setTheme(m.id)}
									>
										<span class="seg-icon">{@html m.svg}</span>
										<span class="seg-title">{m.label}</span>
									</button>
								{/each}
							</div>
							<p
								class="seg-note"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('displayNote', e.currentTarget.textContent ?? '')
									: undefined}
							>{noteText('displayNote', displayValue, editStg)}</p>
							<p
								class="seg-lead"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('uiLead', e.currentTarget.textContent ?? '')
									: undefined}
							>{settingsText('uiLead')}</p>
							<div class="segmented" role="radiogroup" aria-label="Button style">
								{#each uiOptions as o}
									<button
										type="button"
										class="seg"
										class:on={uiStyle === o.id}
										role="radio"
										aria-checked={uiStyle === o.id}
										onclick={() => setUiStyle(o.id)}
									>
										<span class="seg-title">{o.label}</span>
										<span class="seg-sub">{o.sub}</span>
									</button>
								{/each}
							</div>
							<p
								class="seg-note"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('uiNote', e.currentTarget.textContent ?? '')
									: undefined}
							>{noteText('uiNote', uiStatus, editStg)}</p>
							<p
								class="seg-lead"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('skyLead', e.currentTarget.textContent ?? '')
									: undefined}
							>{settingsText('skyLead')}</p>
							<div class="sky-picker" role="radiogroup" aria-label="Sky background">
								{#each skyOptions as o}
									<button
										type="button"
										class="sky-opt"
										class:on={skyMode === o.id}
										role="radio"
										aria-checked={skyMode === o.id}
										onclick={() => setSkyMode(o.id)}
									>
										{o.label}
									</button>
								{/each}
							</div>
							<p
								class="seg-note"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('skyNote', e.currentTarget.textContent ?? '')
									: undefined}
							>{noteText('skyNote', skyStatus, editStg)}</p>
							<p
								class="seg-lead"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('starsLead', e.currentTarget.textContent ?? '')
									: undefined}
							>{settingsText('starsLead')}</p>
							<div class="sky-picker" role="radiogroup" aria-label="Stars">
								<button
									type="button"
									class="sky-opt"
									class:on={!starsOn}
									role="radio"
									aria-checked={!starsOn}
									onclick={() => setStars(false)}
								>
									Off
								</button>
								<button
									type="button"
									class="sky-opt"
									class:on={starsOn}
									role="radio"
									aria-checked={starsOn}
									onclick={() => setStars(true)}
								>
									On
								</button>
							</div>
							<p
								class="seg-note"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('starsNote', e.currentTarget.textContent ?? '')
									: undefined}
							>{noteText('starsNote', starsStatus, editStg)}</p>
							{#if dev}
								<p class="seg-lead">Edit the panel copy right in the app.</p>
								<div class="dev-actions">
									<button
										type="button"
										class="edit-enter"
										onclick={enterEditMode}
										disabled={editMode}
									>
										{editMode ? 'Editing…' : 'Enter edit mode'}
									</button>
									<button type="button" class="edit-enter ghost" onclick={clearLocalStorage}>
										Clear local storage
									</button>
								</div>
								<p class="seg-note">
									Turn on edit mode, then open any station, line, or Settings and type over
									its text. Save copies the result so it can be made permanent; discard drops
									your changes. Clear local storage wipes saved edits and preferences, then
									reloads to the source defaults. (Dev only.)
								</p>
							{/if}
						{:else}
						{@const edit = dev && editMode && !!pages[v.code]}
						{#each blocks as b, i}
							{#if 'h' in b}
								<h3
									class:editable={edit}
									contenteditable={edit}
									oninput={edit
										? (e) => stageEdit(v.code, i, 'h', e.currentTarget.textContent ?? '')
										: undefined}
								>{fieldText(v.code, i, 'h', b.h)}</h3>
							{:else if 'sub' in b}
								<h4
									class:editable={edit}
									contenteditable={edit}
									oninput={edit
										? (e) => stageEdit(v.code, i, 'sub', e.currentTarget.textContent ?? '')
										: undefined}
								>{fieldText(v.code, i, 'sub', b.sub)}</h4>
							{:else if 'quote' in b}
								<blockquote
									class:editable={edit}
									contenteditable={edit}
									oninput={edit
										? (e) => stageEdit(v.code, i, 'quote', e.currentTarget.textContent ?? '')
										: undefined}
								>{fieldText(v.code, i, 'quote', b.quote)}</blockquote>
							{:else if 'img' in b}
								<figure class="img">
									<div class="img-ph" style:--tint={accent[v.code]}><span>image</span></div>
									<figcaption>{b.img}</figcaption>
								</figure>
							{:else if 'email' in b}
								<p>
									Say hello:
									{#if edit}
										<span
											class="editable mail-edit"
											contenteditable="true"
											oninput={(e) =>
												stageEdit(v.code, i, 'email', e.currentTarget.textContent ?? '')}
										>{fieldText(v.code, i, 'email', b.email)}</span>
									{:else}
										<a class="mail" href="mailto:{b.email}">
											{b.email}<span class="mail-ico">{@html MAILBOX_SVG}</span>
										</a>
									{/if}
								</p>
							{:else if 'p' in b}
								<p
									class:editable={edit}
									contenteditable={edit}
									oninput={edit
										? (e) => stageEdit(v.code, i, 'p', e.currentTarget.textContent ?? '')
										: undefined}
								>{fieldText(v.code, i, 'p', b.p)}</p>
							{/if}
						{/each}
						{/if}

						{@render onward('Connections', conns)}
					</div>
					{/if}
				{:else}
					{@const a = airlines[v.idx]}
					{@const stops = [...lineOf[v.idx]]}
					{@const editLine = dev && editMode}
					<div class="surface-head">
						<button class="icon-btn back" onclick={home} aria-label="Back to route map" title="Route map">{@html BACK_SVG}</button>
						<p class="eyebrow">Route line</p>
						{#if editLine}
							<h2
								class="dest editable"
								contenteditable="true"
								oninput={(e) => stageLineEdit(v.idx, e.currentTarget.textContent ?? '')}
							>{lineFieldText(v.idx)}</h2>
						{:else}
							<h2 class="dest"><SplitFlap text={lineNames[v.idx]} base={160} stagger={45} /></h2>
						{/if}
					</div>
					<div class="surface-body">
						<p
							class:editable={editLine}
							contenteditable={editLine}
							oninput={editLine
								? (e) => stageLineBody(v.idx, e.currentTarget.textContent ?? '')
								: undefined}
						>{lineBodyText(v.idx)}</p>
						{@render onward('Stations on this line', stops)}
					</div>
				{/if}
			{/key}
			</div>
		</aside>
	{/if}

	{#if dev && editMode}
		<div class="edit-bar" role="toolbar" aria-label="Edit mode actions">
			<span class="edit-flag">Edit mode</span>
			<button type="button" class="edit-btn discard" onclick={discardEdits}>Discard &amp; exit</button>
			<button type="button" class="edit-btn save" onclick={saveEdits}>Save &amp; exit</button>
		</div>
	{/if}
	{#if toast}
		<div class="edit-toast" role="status">{toast}</div>
	{/if}
</div>

<style>
	.stage {
		position: fixed;
		inset: 0;
		overflow: hidden;
		/* Flat page colour, or the time-of-day sky gradient when sky mode is on. */
		background: var(--sky, var(--page));
	}
	/* Tiny stars on the Night sky — behind the routes (before the svg in DOM). */
	.stars {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.stars span {
		position: absolute;
		border-radius: 50%;
		background: #eaf3ff;
		opacity: 0.72;
		box-shadow: 0 0 3px rgba(224, 240, 255, 0.5);
	}
	@media (prefers-reduced-motion: no-preference) {
		.stars span.tw {
			animation-name: twinkle;
			animation-timing-function: ease-in-out;
			animation-iteration-count: infinite;
		}
	}
	@keyframes twinkle {
		0%,
		100% {
			opacity: 0.15;
		}
		50% {
			opacity: 0.85;
		}
	}

	/* The stage never scrolls; the camera (viewBox) crops a world larger than the
	 * screen, so routes run off the edges. */
	.stage svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		touch-action: none;
		transition: opacity 0.6s ease;
	}
	/* Panel expanded and its fly settled: fade the covered map away (and let clicks
	   fall through to the panel, since the map's no longer there to interact with). */
	.stage svg.map-hidden {
		opacity: 0;
		pointer-events: none;
	}
	.bg {
		fill: transparent;
	}

	.arc {
		fill: none;
		stroke-width: 4.5;
		/* butt (not round) caps: an undrawn arc's dash would otherwise leave a round
		   dot at its endpoint before the line draws. Corners stay round via linejoin,
		   and the flat ends sit under the station circles. */
		stroke-linecap: butt;
		stroke-linejoin: round;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		/* Each ring's lines draw just after its stations pop (--draw set per path). */
		animation: draw 0.9s cubic-bezier(0.6, 0, 0.3, 1) both;
		animation-delay: var(--draw, 0s);
		transition: opacity 0.5s ease;
	}
	.arc.dim {
		opacity: 0.12;
	}
	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}

	.node {
		cursor: pointer;
		transition: opacity 0.5s ease;
	}
	.node.dim {
		opacity: 0.25;
	}
	/* Hovering a dimmed node (panel open) brings it back to full so it reads as
	   the next place you could fly to. */
	.node.dim:hover,
	.node.dim:focus-visible {
		opacity: 1;
	}
	.hit {
		fill: transparent;
	}
	.port {
		/* Just a flat white circle — no rim or shadow at rest (white in both themes, not the
		   theme --paper which goes near-black in dark mode). The ring (masthead yellow) only
		   appears on hover/keyboard focus. */
		fill: #fff;
		stroke: #e6b93c; /* matches the masthead's first station-sign dot */
		stroke-width: 0;
		transition: stroke-width 0.15s ease;
	}
	/* Selected (open) node carries the accent ring persistently — same look as hover/focus. */
	.node:hover .port,
	.node:focus-visible .port,
	.node.active .port {
		stroke-width: 3;
	}
	/* The hub is ~2.3× the radius (15 vs 6.5), so scale its ring up to keep the same
	   ring-to-node proportion as the smaller stations (3 ÷ 6.5 ≈ 7 ÷ 15). */
	.node:hover .port.hub,
	.node:focus-visible .port.hub,
	.node.active .port.hub {
		stroke-width: 7;
	}
	/* No UA focus box around the node group (it frames the dot + label). Keyboard focus
	   is shown via the accent ring on :focus-visible above. */
	.node:focus {
		outline: none;
	}

	/* ── Bubble mode (data-ui="bubble"): the same bubbly pass as the buttons, applied to the
	   map nodes ── Each flat white dot becomes a glossy raised bead: a pearly radial sheen fill
	   plus a soft drop shadow that lifts it off the map, and it swells a touch on hover/focus
	   (via the SVG `r` geometry property, so it doesn't fight the mount `pop` transform). */
	:global(html[data-ui='bubble']) .port {
		fill: url(#node-bubble);
		/* Two shadows: a dark ground shadow (reads in light mode) + a faint light halo so the
		   bead still lifts off a dark map, where a dark shadow alone would vanish. */
		filter: drop-shadow(0 1.4px 1.6px rgba(8, 10, 14, 0.55))
			drop-shadow(0 0 1px rgba(255, 255, 255, 0.5));
		transition: stroke-width 0.15s ease, filter 0.2s ease;
	}
	:global(html[data-ui='bubble']) .node:hover .port,
	:global(html[data-ui='bubble']) .node:focus-visible .port,
	:global(html[data-ui='bubble']) .node.active .port {
		filter: drop-shadow(0 3px 4px rgba(8, 10, 14, 0.6))
			drop-shadow(0 0 1.5px rgba(255, 255, 255, 0.55));
	}
	/* The swell on hover/focus is motion, so it (and its transition) is gated here — under
	   reduced-motion the nodes keep their resting `r` (from the attribute) and just re-shadow. */
	@media (prefers-reduced-motion: no-preference) {
		:global(html[data-ui='bubble']) .port {
			transition: stroke-width 0.15s ease, filter 0.2s ease,
				r 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
		}
		:global(html[data-ui='bubble']) .node:hover .port:not(.hub),
		:global(html[data-ui='bubble']) .node:focus-visible .port:not(.hub) {
			r: 8;
		}
		:global(html[data-ui='bubble']) .node:hover .port.hub,
		:global(html[data-ui='bubble']) .node:focus-visible .port.hub {
			r: 17.5;
		}
	}
	.code {
		fill: var(--ink);
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0.04em;
	}
	.code-hub {
		font-size: 19px;
		font-weight: 700;
	}
	/* Stations pop in by ring (--pop set per node from BFS depth): the dot springs up
	   past full size, dips back with inertia, then settles — a happy little bounce.
	   The label pops in the same way just behind it. */
	.port {
		opacity: 0;
		transform-box: fill-box;
		transform-origin: center;
		animation: pop 0.58s ease-out both;
		animation-delay: var(--pop, 0s);
	}
	.code {
		opacity: 0;
		/* transform-origin set inline to the label's own coords so it scales up from
		   its resting spot (fill-box is unreliable on SVG <text>). */
		animation: pop 0.52s ease-out both;
		animation-delay: calc(var(--pop, 0s) + 0.12s);
	}
	@keyframes pop {
		0% {
			opacity: 0;
			transform: scale(0.3);
		}
		55% {
			opacity: 1;
			transform: scale(1.08);
		}
		74% {
			transform: scale(0.97);
		}
		88% {
			transform: scale(1.015);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Overlays — upright, outside the camera, so they never skew or scroll. */
	.masthead {
		position: absolute;
		top: clamp(1.5rem, 5vw, 3.5rem);
		left: clamp(1.5rem, 5vw, 3.5rem);
		max-width: min(90vw, 640px);
		/* Shared so the tagline's offsets below scale with the wordmark. */
		--wordmark: clamp(2.25rem, 9vw, 5.5rem);
	}
	/* Title and tagline animate on their own so open/close staggers like the entrance:
	   the tagline trails the title coming in, and leads going out. */
	.masthead h1,
	.masthead .tagline {
		transition: opacity 0.4s ease, transform 0.4s ease;
	}
	/* The circles unfurl left→right: the leftmost fades in place (its --roll is 0),
	   the rest roll out from behind it, each a beat later. Same effect on open/close
	   (this transition) and on page load (the keyframe below). Longhand so only
	   opacity/transform get the stagger delay — hover stays instant. */
	.masthead .theme-dot {
		transition-property: color, background, border-color, opacity, transform;
		transition-duration: 0.15s, 0.15s, 0.15s, 0.4s, 0.4s;
		transition-timing-function: ease, ease, ease, ease, cubic-bezier(0.34, 1.4, 0.64, 1);
		transition-delay: 0s, 0s, 0s, calc(var(--n, 0) * 0.07s), calc(var(--n, 0) * 0.07s);
	}
	.masthead.hidden .theme-dot {
		opacity: 0;
		transform: translateX(var(--roll));
	}
	@media (prefers-reduced-motion: no-preference) {
		.theme-dot {
			animation: dot-roll 0.45s cubic-bezier(0.34, 1.4, 0.64, 1) backwards;
			animation-delay: calc(0.5s + var(--n, 0) * 0.07s);
		}
	}
	@keyframes dot-roll {
		from {
			opacity: 0;
			transform: translateX(var(--roll));
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}
	.masthead .tagline {
		transition-delay: 0.12s;
	}
	.masthead h1 {
		margin: 0;
		font-weight: 700;
		font-size: var(--wordmark);
		line-height: 0.95;
		letter-spacing: -0.02em;
		color: var(--ink);
	}
	/* Wordmark + the display-mode bullets on one line, bullets riding to its right
	   like the route icons beside a station name on a transit sign. */
	.brandline {
		display: flex;
		/* Rest the bullets' bottoms on the wordmark's text baseline — a button with
		   only an icon synthesizes its baseline at its bottom edge, so they sit on
		   the line like the letters' bottom strokes. */
		align-items: baseline;
		gap: clamp(0.75rem, 2vw, 1.4rem);
		flex-wrap: wrap;
	}
	.theme {
		/* Non-flex, so the dots are ordinary inline-blocks that keep their true bottom-edge
		   baseline and rest on the wordmark's baseline. As flex items their baseline gets
		   synthesized from the glyph (Firefox) and floats them off the line. font-size:0
		   collapses the inter-dot whitespace; the gap is restored with margins below. */
		display: inline-block;
		font-size: 0;
	}
	.theme-dot {
		/* Start offset for the roll-out: each circle begins stacked on the leftmost
		   one (one circle-width + gap per index), then unfurls to the right. */
		--roll: calc(var(--n, 0) * -2.23rem);
		/* Decorative, nonfunctional colour bullet. Empty inline-block → bottom-edge
		   baseline, so it rests on the wordmark's baseline (see .theme). */
		display: inline-block;
		width: 30px;
		height: 30px;
		background: var(--dot);
		border-radius: 999px;
	}
	.theme-dot + .theme-dot {
		margin-left: 0.35rem;
	}
	.tagline {
		/* Sit just below the wordmark (top) and indent to the "K"'s optical left edge — the
		   SplitFlap centres each glyph in its cell, so the "K" is inset from the wordmark's
		   box edge by ~0.05em. Both scale with the wordmark. The small positive top keeps
		   the tagline's ascenders ("f" in "of") clear of the wordmark's descenders.
		   (Coefficients are optical — nudge to taste.) */
		margin: calc(var(--wordmark) * 0.05) 0 0 calc(var(--wordmark) * 0.05);
		font-size: clamp(0.95rem, 2.2vw, 1.15rem);
		color: var(--sub);
	}
	@media (prefers-reduced-motion: no-preference) {
		/* Each word raises in on a stagger (like the legend), trailing the title's
		   flip. `backwards` (not `both`) so words aren't pinned afterward and the
		   whole-tagline open/close transition above still works. */
		.tw {
			display: inline-block;
			animation: rise 0.55s ease backwards;
			animation-delay: calc(0.3s + var(--n, 0) * 0.06s);
		}
	}
	/* Raise-in with a happy little bounce: rises past its resting spot, dips back
	   with inertia, then settles. */
	@keyframes rise {
		0% {
			opacity: 0;
			transform: translateY(8px);
		}
		60% {
			opacity: 1;
			transform: translateY(-2px);
		}
		82% {
			transform: translateY(0.8px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.legend {
		position: absolute;
		left: clamp(1.5rem, 5vw, 3.5rem);
		bottom: clamp(1.25rem, 4vw, 2.5rem);
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.4rem;
		font-size: 1rem;
		font-weight: 500;
	}
	/* Each item raises/fades on a stagger — on page load (the keyframe below) and
	   on panel open/close (this transition), so the bar populates in sequence both
	   times. Bouncy easing echoes the rise keyframe. */
	.legend li {
		display: flex;
		transition: opacity 0.4s ease, transform 0.45s cubic-bezier(0.34, 1.5, 0.64, 1);
		transition-delay: calc(var(--n, 0) * 0.05s);
	}
	.legend.hidden li {
		opacity: 0;
		transform: translateY(8px);
	}
	.legend-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.2rem 0;
		font: inherit;
		font-weight: 500;
		color: var(--ink);
		background: transparent;
		border: 0;
		border-radius: 6px;
		cursor: pointer;
		transition: opacity 0.15s ease;
	}
	.legend-btn:hover {
		opacity: 0.6;
	}
	.legend-btn:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 3px;
	}
	/* Page-load entrance: same rise as the tagline, staggered. `backwards` (not
	 * `both`) so the item isn't pinned afterward, leaving the open/close transition
	 * above free to run. */
	@media (prefers-reduced-motion: no-preference) {
		.legend li {
			animation: rise 0.5s ease backwards;
			animation-delay: calc(1.1s + var(--n, 0) * 0.07s);
		}
	}
	.swatch {
		width: 1.05rem;
		height: 1.05rem;
		border-radius: 3px;
		flex: none;
	}

	.masthead.hidden {
		pointer-events: none;
	}
	.masthead.hidden h1,
	.masthead.hidden .tagline {
		opacity: 0;
		transform: translateY(-8px);
	}
	/* Going out (panel opening): tagline leaves first, title a beat behind — the
	   reverse of the incoming order, so the header folds up cleanly. */
	.masthead.hidden h1 {
		transition-delay: 0.1s;
	}
	.masthead.hidden .tagline {
		transition-delay: 0s;
	}
	.legend.hidden {
		pointer-events: none;
	}

	/* Content surface — the destination page. Header stays put; body scrolls, so
	 * the surface holds substantial content while the stage height stays locked. */
	.surface {
		position: absolute;
		top: 0;
		right: 0;
		height: 100%;
		width: min(94vw, 640px);
		display: flex;
		flex-direction: column;
		/* The frame itself never scrolls (see .surface-scroll) — this keeps the frosted
		   .surface-backdrop pane static, so WebKit rasterises its blur once rather than
		   re-blurring on every scroll frame (the Safari big-surface cost). */
		overflow: hidden;
		/* The frosted fill + backdrop blur live on .surface-backdrop, not here; the frame
		   only carries the crisp left edge. */
		border-left: 1px solid var(--panel-edge);
	}
	/* Frosted plastic pane: a cool moulded translucent surface (not warm paper). A top gloss
	   sheen over a frosted tint that lets the map's colour bleed through — blurred illegible by
	   the shared backdrop filter. Absolutely positioned and OUTSIDE the scroller, so it stays
	   pinned to the panel box while content scrolls above it. Same fill + blur in every state. */
	.surface-backdrop {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		background: var(--panel-sheen), var(--panel-fill);
		backdrop-filter: var(--panel-blur);
	}
	/* The actual scroller: fills the frame and holds all panel content above the frosted pane.
	   Non-ATFC panels scroll their own .surface-body; the Traffic board grows to its data's
	   natural height and scrolls here (with its sticky header pinned to this box). */
	.surface-scroll {
		position: relative;
		z-index: 1;
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}
	/* Expanded: fill the viewport (desktop) — useful for the wide Traffic board. Same frosted
	   background + backdrop blur as the compact state; only the width and edge treatment change. */
	.surface.expanded {
		width: 100%;
		/* Full-viewport: no left edge to catch light and no cast shadow — let the browser
		   chrome be the frame around the app. */
		border-left: none;
		box-shadow: none;
	}
	.surface.expanded.leaving {
		transform: translateX(100%);
	}
	/* Navigation between destinations slides the whole panel off (and back) while its
	   content is swapped off-screen. Open/close is handled by the fly transition,
	   which drives transform via WAAPI and so won't fight this. */
	.surface.leaving {
		transform: translateX(680px);
	}
	@media (prefers-reduced-motion: no-preference) {
		.surface {
			transition: width 260ms cubic-bezier(0.6, 0, 0.3, 1),
				transform 300ms cubic-bezier(0.6, 0, 0.3, 1);
		}
	}
	/* Expand/collapse toggle (shared .icon-btn), top-right of the panel on the same
	   horizontal line as the back control; only its placement is set here. */
	.expand {
		position: absolute;
		right: clamp(1.5rem, 4vw, 2.75rem);
		/* Aligns with the back circle, which sits at the surface-head's top padding. */
		top: clamp(1.5rem, 4vw, 2.5rem);
		z-index: 3;
	}
	/* On phones the panel is a bottom sheet: full width, anchored to the bottom, and
	   it slides down (rather than off to the right) both to close and between stops. */
	@media (max-width: 720px) {
		.surface {
			top: 0;
			bottom: 0;
			left: 0;
			right: 0;
			width: auto;
			height: 100%;
			border-left: none;
			border-radius: 0;
		}
		.surface.leaving {
			transform: translateY(100%);
		}
		/* The bottom sheet is already full-width, so hide the expand toggle. */
		.expand {
			display: none;
		}
	}
	.surface-head {
		flex: none;
		/* Extra bottom room so the now-large title's descenders ("g", "y") clear the
		   header's bottom border. */
		padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1.5rem, 4vw, 2.75rem) clamp(1.5rem, 2.5vw, 2.25rem);
		border-bottom: 1px solid var(--line);
	}
	/* Icon-circle back control (shared .icon-btn); only its placement is set here. The gap
	   below it (to the eyebrow/title) matches the header's top/left edge inset, so the back
	   button sits in an evenly-framed pocket rather than crowding the text below it. */
	.back {
		align-self: flex-start;
		margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
	}
	.eyebrow {
		margin: 0 0 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.dest {
		margin: 0;
		/* Homepage wordmark scale, so every panel's masthead title reads at the same size
		   as "Kashinoga" (matches the ATFC panel's title). */
		font-size: clamp(2.25rem, 9vw, 5.5rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--ink);
		/* One line always — see the ATFC .dest note (flip animation transiently widens the
		   wordmark and would otherwise wrap a two-word title). */
		white-space: nowrap;
	}
	.surface-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: clamp(1.5rem, 4vw, 2.25rem) clamp(1.5rem, 4vw, 2.75rem) 3rem;
		display: flex;
		flex-direction: column;
		gap: 1.05rem;
	}
	.surface-body h3 {
		margin: 1.1rem 0 -0.2rem;
		font-size: 1.35rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--ink);
	}
	.surface-body h4 {
		margin: 0.5rem 0 -0.35rem;
		font-size: 1rem;
		font-weight: 700;
		color: var(--ink);
	}
	.surface-body p {
		margin: 0;
		max-width: 62ch;
		line-height: 1.62;
		color: color-mix(in srgb, var(--ink) 82%, var(--sub));
	}
	.surface-body blockquote {
		margin: 0.4rem 0;
		padding-left: 1rem;
		border-left: 3px solid var(--ink);
		font-size: 1.2rem;
		font-style: italic;
		color: var(--ink);
	}
	/* Edit Mode — editable copy gets a dashed field; focus firms it up. */
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
	.mail-edit {
		font-weight: 600;
	}
	.dev-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.5rem 0 0.2rem;
	}
	.edit-enter {
		display: inline-flex;
		align-items: center;
		padding: 0.6rem 1.1rem;
		font: inherit;
		font-weight: 700;
		color: var(--paper);
		background: var(--ink);
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		cursor: pointer;
		transition: opacity 0.15s ease, background 0.15s ease;
	}
	.edit-enter:hover {
		opacity: 0.85;
	}
	.edit-enter.ghost {
		color: var(--ink);
		background: transparent;
		border-color: color-mix(in srgb, var(--ink) 26%, transparent);
	}
	.edit-enter.ghost:hover {
		opacity: 1;
		background: color-mix(in srgb, var(--ink) 6%, transparent);
	}
	.edit-enter:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.edit-enter:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	/* Floating action bar, centred at the bottom, above the panel. */
	.edit-bar {
		position: fixed;
		left: 50%;
		bottom: clamp(1rem, 4vh, 2.25rem);
		transform: translateX(-50%);
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.6rem 0.5rem 1rem;
		background: color-mix(in srgb, var(--paper) 88%, transparent);
		backdrop-filter: blur(12px);
		border: 1.5px solid color-mix(in srgb, var(--ink) 16%, transparent);
		border-radius: 999px;
	}
	.edit-flag {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.edit-btn {
		padding: 0.55rem 1.1rem;
		font: inherit;
		font-weight: 700;
		border-radius: 999px;
		border: 1.5px solid transparent;
		cursor: pointer;
		transition: opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease;
	}
	.edit-btn:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.edit-btn.save {
		color: var(--paper);
		background: var(--ink);
		border-color: var(--ink);
	}
	.edit-btn.save:hover {
		opacity: 0.85;
	}
	.edit-btn.discard {
		color: var(--ink);
		background: transparent;
		border-color: color-mix(in srgb, var(--ink) 26%, transparent);
	}
	.edit-btn.discard:hover {
		background: color-mix(in srgb, var(--ink) 6%, transparent);
	}
	.edit-toast {
		position: fixed;
		left: 50%;
		bottom: calc(clamp(1rem, 4vh, 2.25rem) + 3.6rem);
		transform: translateX(-50%);
		z-index: 50;
		max-width: min(90vw, 420px);
		padding: 0.6rem 1rem;
		font-size: 0.9rem;
		text-align: center;
		color: var(--paper);
		background: color-mix(in srgb, var(--ink) 92%, transparent);
		border-radius: 12px;
	}

	/* Contact address — underlined mailto with the mailbox icon riding at its end. */
	.mail {
		color: var(--ink);
		font-weight: 600;
		text-decoration: underline;
		text-decoration-thickness: 1.5px;
		text-underline-offset: 2px;
		white-space: nowrap;
	}
	.mail:hover {
		color: var(--orange);
	}
	.mail:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
		border-radius: 3px;
	}
	.mail-ico {
		display: inline-flex;
		vertical-align: -0.16em;
		margin-left: 0.35em;
	}
	.mail-ico :global(svg) {
		width: 1.05em;
		height: 1.05em;
	}
	figure.img {
		margin: 0.4rem 0;
	}
	.img-ph {
		aspect-ratio: 16 / 10;
		display: grid;
		place-items: center;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, var(--tint, var(--ink)) 30%, transparent);
		background:
			repeating-linear-gradient(
				-45deg,
				color-mix(in srgb, var(--tint, #888) 13%, transparent) 0 10px,
				transparent 10px 20px
			),
			color-mix(in srgb, var(--tint, #888) 8%, var(--paper));
		color: color-mix(in srgb, var(--tint, var(--ink)) 70%, var(--sub));
		font-size: 0.8rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	figcaption {
		margin-top: 0.5rem;
		font-size: 0.85rem;
		color: var(--sub);
	}
	/* Settings — route-style toggle (airline vs train). */
	.segmented {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
		margin: 0.4rem 0 0.2rem;
	}
	.seg {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.85rem 1rem;
		font: inherit;
		text-align: left;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1.5px solid color-mix(in srgb, var(--ink) 16%, transparent);
		border-radius: 12px;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease;
	}
	.seg:hover {
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	.seg.on {
		border-color: var(--ink);
		background: var(--line);
	}
	.seg:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.seg-title {
		font-size: 1.1rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}
	.seg-sub {
		font-size: 0.85rem;
		color: var(--sub);
	}
	/* Display-mode picker: three even columns, icon centred over its label. */
	.segmented.three {
		grid-template-columns: repeat(3, 1fr);
	}
	.segmented.three .seg {
		align-items: center;
		gap: 0.4rem;
		padding: 0.85rem 0.5rem;
		text-align: center;
	}
	.segmented.three .seg-title {
		font-size: 1rem;
	}
	.seg-icon {
		display: grid;
		place-items: center;
		color: var(--sub);
		transition: color 0.15s ease;
	}
	.seg-icon :global(svg) {
		width: 22px;
		height: 22px;
		display: block;
	}
	.seg.on .seg-icon {
		color: var(--ink);
	}
	.seg-note {
		font-size: 0.9rem;
		color: var(--sub) !important;
	}
	.seg-lead {
		margin-top: 1.4rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--line);
	}
	/* Sky picker — Off / Auto / the five phases, as a wrapping chip row. */
	.sky-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0.4rem 0 0.2rem;
	}
	.sky-opt {
		padding: 0.45rem 0.85rem;
		font: inherit;
		font-weight: 700;
		font-size: 0.9rem;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1.5px solid color-mix(in srgb, var(--ink) 16%, transparent);
		border-radius: 999px;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
	}
	.sky-opt:hover {
		border-color: color-mix(in srgb, var(--ink) 32%, transparent);
	}
	.sky-opt.on {
		color: var(--paper);
		background: var(--ink);
		border-color: var(--ink);
	}
	.sky-opt:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}

	.onward {
		margin-top: 1.4rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--line);
	}
	.onward ul {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		font: inherit;
		font-size: 0.9rem;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border: 1px solid color-mix(in srgb, var(--ink) 14%, transparent);
		border-radius: 999px;
		cursor: pointer;
	}
	.chip:hover {
		background: var(--line);
	}
	.chip-dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		flex: none;
	}
	.chip-code {
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	.chip-title {
		color: var(--sub);
	}

	/* ── "Bubble" button style (Settings → Button style; data-ui="bubble" on the html
	   element) ── Opt-in glossy, gel-like buttons across every panel, echoing the deck's
	   bubbly controls. A convex SHEEN rides on top as a background-IMAGE so each button's own
	   background-color still shows through (orange ATFC fields, active segments, …). The ATFC
	   Range/Refresh <select>s keep their chevron — we give them depth but never touch their
	   background-image. Kept :global so it reaches the buttons in every panel. */

	/* Sheen — solid-background controls only (NOT .field-select, whose bg-image IS its
	   chevron arrow). */
	:global(html[data-ui='bubble'] .seg),
	:global(html[data-ui='bubble'] .sky-opt),
	:global(html[data-ui='bubble'] .icon-btn),
	:global(html[data-ui='bubble'] .edit-enter),
	:global(html[data-ui='bubble'] .chip),
	:global(html[data-ui='bubble'] .tb),
	:global(html[data-ui='bubble'] .mini),
	:global(html[data-ui='bubble'] .swatch-btn),
	:global(html[data-ui='bubble'] .field),
	:global(html[data-ui='bubble'] .manual) {
		background-image: linear-gradient(
			to bottom,
			rgba(255, 255, 255, 0.3),
			rgba(255, 255, 255, 0.04) 48%,
			rgba(8, 10, 14, 0.05)
		);
	}

	/* Depth — every bubble control, selects included. A soft top gloss + a light drop;
	   deliberately NO heavy bottom-inset at rest (that read as a too-strong bottom border). */
	:global(html[data-ui='bubble'] .seg),
	:global(html[data-ui='bubble'] .sky-opt),
	:global(html[data-ui='bubble'] .icon-btn),
	:global(html[data-ui='bubble'] .edit-enter),
	:global(html[data-ui='bubble'] .chip),
	:global(html[data-ui='bubble'] .tb),
	:global(html[data-ui='bubble'] .mini),
	:global(html[data-ui='bubble'] .swatch-btn),
	:global(html[data-ui='bubble'] .field),
	:global(html[data-ui='bubble'] .field-select),
	:global(html[data-ui='bubble'] .manual) {
		border-radius: 999px;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.55),
			0 1px 1px rgba(8, 10, 14, 0.05),
			0 3px 8px rgba(8, 10, 14, 0.08);
		transform-origin: center;
		transition:
			transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1),
			box-shadow 0.28s ease,
			background-color 0.18s ease,
			border-color 0.18s ease,
			color 0.15s ease;
	}
	/* Two-line settings segments stay softly rounded rather than full pill. */
	:global(html[data-ui='bubble'] .seg) {
		border-radius: 16px;
	}
	/* The 30px header icon circles (back / expand / refresh) sit flush at the top of a
	   sticky header inside a scroll container that clips vertically. Anchoring their scale to
	   the TOP edge means the hover pop grows only downward (into the header's padding), so the
	   full scale animation is preserved without the top ever crossing the clip boundary. */
	:global(html[data-ui='bubble'] .icon-btn),
	:global(html[data-ui='bubble'] .manual) {
		transform-origin: center top;
	}

	/* Selected controls get the FULL convex bubble: a brighter top sheen with real bottom
	   shading and a deeper drop, so an active pill no longer reads flat. */
	:global(html[data-ui='bubble'] .seg.on),
	:global(html[data-ui='bubble'] .sky-opt.on),
	:global(html[data-ui='bubble'] .field.on) {
		/* Convex shading comes from the SHEEN (light top → dark bottom, reaching the very
		   edge) rather than an inset bottom-shade. An inset shadow is clipped short of the
		   border, so it left a bright rim at the bottom edge — the "white underline". */
		background-image: linear-gradient(
			to bottom,
			rgba(255, 255, 255, 0.4),
			rgba(255, 255, 255, 0.05) 42%,
			rgba(8, 10, 14, 0.16)
		);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.4),
			0 2px 5px rgba(8, 10, 14, 0.13),
			0 7px 18px rgba(8, 10, 14, 0.16);
	}

	/* Hover: brighten the gloss and lift the drop so the button reads as inflating toward
	   you; the scale-forward (motion) is gated on reduced-motion below. */
	:global(html[data-ui='bubble'] .seg:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .sky-opt:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .icon-btn:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .edit-enter:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .chip:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .tb:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .mini:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .swatch-btn:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .field:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .field-select:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .manual:hover:not(:disabled)) {
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.8),
			0 2px 5px rgba(8, 10, 14, 0.09),
			0 9px 22px rgba(8, 10, 14, 0.13);
	}
	/* Pressed: sink the gloss inward for a tactile squash. */
	:global(html[data-ui='bubble'] .seg:active:not(:disabled)),
	:global(html[data-ui='bubble'] .sky-opt:active:not(:disabled)),
	:global(html[data-ui='bubble'] .icon-btn:active:not(:disabled)),
	:global(html[data-ui='bubble'] .edit-enter:active:not(:disabled)),
	:global(html[data-ui='bubble'] .chip:active:not(:disabled)),
	:global(html[data-ui='bubble'] .tb:active:not(:disabled)),
	:global(html[data-ui='bubble'] .mini:active:not(:disabled)),
	:global(html[data-ui='bubble'] .swatch-btn:active:not(:disabled)),
	:global(html[data-ui='bubble'] .field:active:not(:disabled)),
	:global(html[data-ui='bubble'] .field-select:active:not(:disabled)),
	:global(html[data-ui='bubble'] .manual:active:not(:disabled)) {
		box-shadow:
			inset 0 2px 4px rgba(0, 0, 0, 0.2),
			inset 0 0 0 999px rgba(0, 0, 0, 0.08);
	}
	@media (prefers-reduced-motion: no-preference) {
		/* Everything pops forward on hover. The header icon circles (.icon-btn) scale from
		   their top edge (set above) so the pop grows downward and never clips at the top. */
		:global(html[data-ui='bubble'] .seg:hover:not(:disabled)),
		:global(html[data-ui='bubble'] .sky-opt:hover:not(:disabled)),
		:global(html[data-ui='bubble'] .icon-btn:hover:not(:disabled)),
		:global(html[data-ui='bubble'] .edit-enter:hover:not(:disabled)),
		:global(html[data-ui='bubble'] .chip:hover:not(:disabled)),
		:global(html[data-ui='bubble'] .tb:hover:not(:disabled)),
		:global(html[data-ui='bubble'] .mini:hover:not(:disabled)),
		:global(html[data-ui='bubble'] .swatch-btn:hover:not(:disabled)),
		:global(html[data-ui='bubble'] .field:hover:not(:disabled)),
		:global(html[data-ui='bubble'] .field-select:hover:not(:disabled)),
		:global(html[data-ui='bubble'] .manual:hover:not(:disabled)) {
			transform: scale(1.05);
		}
		:global(html[data-ui='bubble'] .seg:active:not(:disabled)),
		:global(html[data-ui='bubble'] .sky-opt:active:not(:disabled)),
		:global(html[data-ui='bubble'] .icon-btn:active:not(:disabled)),
		:global(html[data-ui='bubble'] .edit-enter:active:not(:disabled)),
		:global(html[data-ui='bubble'] .chip:active:not(:disabled)),
		:global(html[data-ui='bubble'] .tb:active:not(:disabled)),
		:global(html[data-ui='bubble'] .mini:active:not(:disabled)),
		:global(html[data-ui='bubble'] .swatch-btn:active:not(:disabled)),
		:global(html[data-ui='bubble'] .field:active:not(:disabled)),
		:global(html[data-ui='bubble'] .field-select:active:not(:disabled)),
		:global(html[data-ui='bubble'] .manual:active:not(:disabled)) {
			transform: scale(0.94);
			transition-duration: 0.1s;
		}
	}

	/* ── Universal pressed state ── Every button visibly pushes IN on click, regardless of the
	   Bubble setting. Rather than repaint the fill (which turned coloured buttons grey), we
	   just DARKEN whatever colour the button already is: the theme-proof black inset overlay
	   darkens the fill in BOTH light and dark, so a neutral button gets a darker neutral and
	   the orange field/primary gets a darker orange. The top inset gives the pushed-in feel;
	   the html-prefixed specificity wins over each control's own :hover. Squash is gated on
	   reduced-motion. */
	:global(html .seg:active:not(:disabled)),
	:global(html .sky-opt:active:not(:disabled)),
	:global(html .icon-btn:active:not(:disabled)),
	:global(html .field:active:not(:disabled)),
	:global(html .field-select:active:not(:disabled)),
	:global(html .edit-enter:active:not(:disabled)),
	:global(html .chip:active:not(:disabled)),
	:global(html .legend-btn:active:not(:disabled)),
	:global(html .edit-btn:active:not(:disabled)),
	:global(html .pc-close:active:not(:disabled)),
	:global(html .refresh:active:not(:disabled)),
	:global(html .manual:active:not(:disabled)) {
		box-shadow:
			inset 0 2px 4px rgba(0, 0, 0, 0.18),
			inset 0 0 0 999px rgba(0, 0, 0, 0.07);
	}
	@media (prefers-reduced-motion: no-preference) {
		/* .manual keeps its own rotate and .refresh is a countdown ring, so they darken but
		   don't squash. */
		:global(html .seg:active:not(:disabled)),
		:global(html .sky-opt:active:not(:disabled)),
		:global(html .icon-btn:active:not(:disabled)),
		:global(html .field:active:not(:disabled)),
		:global(html .field-select:active:not(:disabled)),
		:global(html .edit-enter:active:not(:disabled)),
		:global(html .chip:active:not(:disabled)),
		:global(html .legend-btn:active:not(:disabled)),
		:global(html .edit-btn:active:not(:disabled)),
		:global(html .pc-close:active:not(:disabled)) {
			transform: scale(0.95);
		}
	}
</style>
