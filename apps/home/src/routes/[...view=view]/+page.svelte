<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { pushState, replaceState } from '$app/navigation';
	import SplitFlap from '$lib/SplitFlap.svelte';
	import Masthead from '$lib/Masthead.svelte';
	import TrafficBoard from '$lib/TrafficBoard.svelte';
	import PresentationBuilder from '$lib/PresentationBuilder.svelte';
	import { BACK_SVG } from '$lib/icons';
	import { airports, airlines, HUB, type Pt } from '$lib/network';
	import { viewPath, sameView, viewTitle, viewDescription, SITE, type View } from '$lib/views';
	import { DEFAULT_FIELD, fieldByIata } from '$lib/fields';
	import { rangeToken, refreshToken } from '$lib/scope';
	import type { PageData } from './$types';

	// Airline route-map homepage. The network is deliberately LARGER than the
	// viewport: routes run off every edge, and visible nodes lead outward to the
	// off-screen parts. You "move pages" by flying the camera (animated viewBox)
	// node to node. Flat-forward — the isometric look is a 2D affine projection
	// baked into coordinates, not a CSS 3D/perspective transform. The stage never
	// scrolls; the camera crops the world.
	//
	// Every panel is addressable — see $lib/views.ts. `data.view` is the panel the
	// incoming URL asked for, so a shared /atfc link renders that board server-side
	// instead of flashing the overview map first.
	let { data }: { data: PageData } = $props();

	// `airports` and `airlines` now live in $lib/network.ts — the URL layer derives its
	// slugs from the same definitions the map draws from, so codes and links can't drift.

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

	// Train mode (mobile, portrait): the network stacked vertically and solved for the ZOOMED home
	// camera — HOME_RAIL_V frames only the hub cluster (Home + About + Settings + Apps, tier 0/1),
	// so the tier-2 leaves are placed FAR out (Work/Projects high above, the Presentation Builder /
	// Air Traffic low below) to run off the top and bottom of that frame, their routes trailing in.
	//
	// Every leaf's label points away from its parent (see labelFor) and labels scale with the map,
	// so this is solved in WORLD units — a label that clears here clears at every phone size. The
	// tight axis is horizontal (portrait): Settings sits down-LEFT of the hub and Apps down-RIGHT,
	// pulled toward centre so their labels keep clear of the frame edges. maplayout.mjs is the
	// guard — it fails if any tier-1 label clips or crowds an edge at any phone size.
	const P_rail_v: Record<string, Pt> = {
		KSH: [230, 450],
		// Loess — ABT up, fanning to Work (left) and Projects (right). Work/Projects sit FAR up so
		// they run off the top when the home camera frames the hub cluster.
		ABT: [230, 345],
		WRK: [148, 175],
		PRJ: [312, 175],
		// Gray's — Settings, down-left of the hub (pulled toward centre so its label clears).
		STG: [165, 560],
		// Apps — orange line down-right of the hub; Air Traffic and the Presentation Builder hang
		// FAR below Apps so they run off the bottom on the home view.
		APP: [298, 560],
		ATFC: [330, 745],
		PRES: [210, 735]
	};

	// Layout mode for the (now-removed) map's coordinates. The rail/air Settings toggle and its
	// persistence were dropped with the transit-map motif; this stays fixed to 'rail' so the
	// dormant camera/framing code below keeps resolving to one coordinate set. The `as` keeps the
	// value's type the full union (control-flow would otherwise narrow the const to 'rail' and
	// flag every dormant `=== 'air'` guard as an impossible comparison).
	const mapMode = 'rail' as 'air' | 'rail';

	// Label style, toggled from Settings: station codes (WRK) or full stop names.
	// Full names by default, in either map mode. Null means "no explicit choice yet";
	// an explicit pick is persisted and wins.
	const NAMES_KEY = 'ksh-stop-names';
	let stopNamesPref = $state<boolean | null>(null);
	const showStopNames = $derived(stopNamesPref ?? true);
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
	let skyMode = $state<SkyMode>('off'); // default: a solid background (no time-of-day sky)
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

	// Named theme (the whole visual identity): 'lab' is the default and carries no
	// attribute; 'metro' opts back into the original transit-map look. data-look on
	// <html> selects the token set (see @kashinoga/puhig themes/*.css); a pre-paint
	// script in app.html applies the saved choice so there's no flash on load.
	const LOOK_KEY = 'ksh-look';
	type Look = 'lab' | 'metro';
	const lookOptions: { id: Look; label: string; sub: string }[] = [
		{ id: 'lab', label: 'Lab', sub: 'the new default' },
		{ id: 'metro', label: 'Metro', sub: 'the transit map' }
	];
	let look = $state<Look>('lab');
	function setLook(l: Look) {
		look = l;
		if (typeof document !== 'undefined') {
			if (l === 'metro') document.documentElement.dataset.look = l;
			else document.documentElement.removeAttribute('data-look');
		}
		try {
			if (l === 'metro') localStorage.setItem(LOOK_KEY, l);
			else localStorage.removeItem(LOOK_KEY);
		} catch {
			/* storage unavailable — keep the in-memory choice */
		}
	}

	// A panel title is sized off the viewport so it reads at the homepage wordmark's scale,
	// but the panel itself caps at 640px. A long title ("Terminal Way") therefore fills the
	// header edge to edge, leaving no room for the accent dot beside it — which then wraps
	// onto its own line. Lower the ceiling in proportion once a title runs past the length
	// that still fits; anything shorter keeps the full wordmark scale.
	const DEST_FITS = 9; // characters that fit at the full 5.5rem with a dot beside them
	const destSize = (title: string) =>
		`clamp(2.25rem, 9vw, ${(5.5 * Math.min(1, DEST_FITS / title.length)).toFixed(2)}rem)`;

	// ── Reset ────────────────────────────────────────────────────────────────
	// The six preferences this panel owns. Deliberately NOT the dev `clearLocalStorage`
	// set: that one also drops authored content drafts (CONTENT_KEY) and the panel's
	// expanded flag, and reloads the page.
	const PREF_KEYS = [NAMES_KEY, THEME_KEY, SKY_KEY, STARS_KEY, UI_KEY, LOOK_KEY];

	// Compared against what's on screen, not against what's stored: an explicit pick of
	// the default value reads as "already default", which is what the button implies.
	const settingsAreDefault = $derived(
		showStopNames &&
			theme === 'system' &&
			uiStyle === 'flat' &&
			look === 'lab' &&
			skyMode === 'off' &&
			starsOn
	);

	function resetSettings() {
		stopNamesPref = null; // null = never chose, which falls back to full names
		skyMode = 'off';
		starsOn = true;
		setTheme('system'); // also strips data-theme and its key
		setUiStyle('flat'); // also strips data-ui and its key
		setLook('lab'); // also strips data-look and its key
		applySky();
		// Forget the stored picks rather than saving the defaults over them, so a reset
		// leaves exactly the state a first-ever visitor has.
		try {
			for (const k of PREF_KEYS) localStorage.removeItem(k);
		} catch {
			/* storage unavailable — the in-memory reset above still stands */
		}
		// The map's coordinates change with the mode, so re-frame on whatever's open.
		if (view) applyView(view, false);
		else flyTo(HOME);
		showToast('Settings reset to defaults');
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
	// A few shooting stars — each streaks across once per long cycle, staggered so at most one or
	// two are visible at a time. Same client-only generation as the field above.
	const makeShooting = () =>
		Array.from({ length: 9 }, (_, i) => ({
			x: Math.random() * 88, // start left %
			y: Math.random() * 58, // start top %
			ang: 6 + Math.random() * 40, // travel angle 6–46° (shallow to steep)
			len: 45 + Math.random() * 120, // streak length 45–165px
			dist: 42 + Math.random() * 34, // travel distance 42–76vw
			peak: 0.55 + Math.random() * 0.45, // brightness at its peak, 0.55–1
			// Long cycle, so each is on-screen for only a short slice and idle the rest; the
			// index-based delay fans their starts out across ~35s so rarely more than one fires
			// at once (drift keeps them de-synced afterward).
			dur: 17 + Math.random() * 13, // 17–30s cycle
			delay: i * 3.4 + Math.random() * 2.6
		}));
	let SHOOT = $state<ReturnType<typeof makeShooting>>([]);
	// Stars ride along with dark mode, not the sky: rendered whenever the toggle is on, then a
	// CSS light-dark() paints them only in dark (transparent in light), so they show on a solid
	// black background, a manual/OS dark theme, and the dusk/night skies alike.
	const starsVisible = $derived(starsOn);

	// LIGHT-mode counterpart to the stars: concentric rings radiating from the "o" of the wordmark.
	// Radii are fixed; only the centre moves — measured from the "o" cell (index 6 of "Kashinoga")
	// and refreshed on resize / font load, since the wordmark clamps with the viewport. A CSS
	// light-dark() stroke shows them in light and hides them in dark.
	const ringRadii = Array.from({ length: 20 }, (_, i) => (i + 1) * 150);
	let ringCx = $state(170);
	let ringCy = $state(120);
	function measureRings() {
		const o = document.querySelectorAll('.masthead .flap .cell')[6]; // K a s h i n [o] g a
		if (!o) return;
		const r = o.getBoundingClientRect();
		ringCx = r.left + r.width / 2;
		ringCy = r.top + r.height / 2;
		measureBandR0();
	}
	// The bands ring the masthead as tightly as they can without touching it — a sun with the
	// wordmark at its centre. The circles are centred on the "o", which sits INSIDE the masthead, so
	// clearing it means out-reaching its farthest corner: any smaller and the ribbon would cut
	// through the wordmark or the nav. Measured, not guessed, because the masthead clamps with the
	// viewport — this re-runs on resize and once the font has loaded.
	function measureBandR0() {
		const m = document.querySelector('.masthead')?.getBoundingClientRect();
		if (!m) return;
		const reach = Math.max(
			Math.hypot(m.left - ringCx, m.top - ringCy),
			Math.hypot(m.right - ringCx, m.top - ringCy),
			Math.hypot(m.left - ringCx, m.bottom - ringCy),
			Math.hypot(m.right - ringCx, m.bottom - ringCy)
		);
		bandR0 = reach + BAND_GAP + BAND_W / 2; // r is the stroke's CENTRE; half of it lies inward
	}
	// ── Ticker bands ──────────────────────────────────────────────────────────────────────────
	// The site's four destinations, painted as concentric coloured bands, each with its own name
	// repeating around it. Click a band and its panel opens — the same destinations, in the same
	// order, as the masthead's nav. Hovering streams the words; at rest they sit still.
	//
	// They're stacked EDGE TO EDGE: the innermost (yellow Home) band sits as close to the masthead
	// as it can without touching it — see measureBandR0 — and the rest lie straight on top of it, one
	// band-width apart, so the four read as a single striped ribbon haloing the wordmark rather than
	// as four separate rings. Each is a whole circle, so it never terminates in open space: it runs
	// off the viewport's edges and the stage's overflow trims it. Streaming is then just a slow
	// rotation of the text about the centre — the band beneath it doesn't move.
	const BAND_W = 30; // band thickness, px — also the step between bands, so their edges meet
	const BAND_GAP = 24; // breathing room between the masthead's corner and the ribbon's inner edge
	const LAP_SECS = 60; // one lap of the Home band; the wider ones take proportionally longer,
	// so every band's words travel at the same speed rather than the outer ones racing.
	let bandR0 = $state(360); // innermost band's radius — measured off the masthead, see above
	const bands = $derived(
		[
			{ code: 'KSH', word: 'HOME', fill: '#e6b93c', ink: '#0a0a0a' },
			{ code: 'ABT', word: 'ABOUT', fill: '#12a150', ink: '#ffffff' },
			{ code: 'APP', word: 'APPS', fill: '#f06030', ink: '#0a0a0a' },
			{ code: 'STG', word: 'SETTINGS', fill: '#8b46e0', ink: '#ffffff' }
		].map((b, i) => {
			const r = bandR0 + i * BAND_W;
			const circumference = 2 * Math.PI * r;
			// Enough repeats to go all the way round: an estimate off the word's length (fitBands trues
			// the rest up), never fewer than one.
			const reps = Math.max(1, Math.round(circumference / ((b.word.length + 3) * 9.5)));
			return {
				...b,
				r,
				// NBSPs, not plain spaces: SVG trims the trailing whitespace off a run of text, which
				// eats the last separator's gap and butts the seam up ("· APPS · APPS ·APPS").
				text: `${b.word}\u00a0·\u00a0`.repeat(reps),
				secs: (LAP_SECS * r) / bandR0
			};
		})
	);
	let bandTextEls = $state<(SVGTextElement | undefined)[]>([]);

	// Splay each band's letters out (or pull them in) until its repeated words measure exactly one
	// lap of its ring, so the last "·" meets the first letter and the loop has no seam and no gap.
	// `textLength` is the obvious tool for this and is the wrong one: Firefox ignores it on a
	// <textPath> (it left 2685px of glyphs on a 2828px track — the gap the first ticker had), so the
	// fit is measured here instead. Iterated, because letter-spacing lands BETWEEN glyphs and a
	// single correction overshoots slightly.
	function fitBands() {
		bandTextEls.forEach((t, i) => {
			const track = document.getElementById(`band-track-${i}`) as SVGPathElement | null;
			if (!t || !track) return;
			const len = track.getTotalLength();
			t.style.letterSpacing = ''; // back to the stylesheet's value before measuring
			for (let pass = 0; pass < 3; pass++) {
				const natural = t.getComputedTextLength();
				const chars = t.getNumberOfChars();
				if (!chars || !natural) return;
				const spacing = parseFloat(getComputedStyle(t).letterSpacing) || 0;
				t.style.letterSpacing = `${spacing + (len - natural) / chars}px`;
			}
		});
	}
	// The radii move with the masthead (mount, resize, font load), and every move changes the
	// circumferences the words have to fill. This runs after the DOM has taken the new radii, so the
	// tracks it measures are the ones actually on screen.
	$effect(() => {
		bands;
		fitBands();
	});
	// Angles run clockwise on screen from 3 o'clock (SVG's y grows downward), so 90° is a ring's
	// lowest point — where each track starts, and so where its words begin. It runs from there back
	// toward 3 o'clock: travelling that way, the text sits the right way up along the bottom of the
	// circle rather than upside down.
	const ptOn = (r: number, a: number): Pt => [
		ringCx + r * Math.cos((a * Math.PI) / 180),
		ringCy + r * Math.sin((a * Math.PI) / 180)
	];
	const arcTo = (r: number, a: number) => `A ${r} ${r} 0 0 0 ${ptOn(r, a)[0]} ${ptOn(r, a)[1]}`;
	// A ring's full circle, as two half-arcs, starting at its low point.
	const bandTrack = (r: number) =>
		`M ${ptOn(r, 90)[0]} ${ptOn(r, 90)[1]} ${arcTo(r, -90)} ${arcTo(r, 90)}`;

	// Live values the Settings notes interpolate into their `{}` placeholder.
	const labelValue = $derived(showStopNames ? 'full stop names' : 'station codes');
	const displayValue = $derived(
		theme === 'system' ? 'Following your device setting' : `Always ${theme}`
	);
	const skyStatus = $derived(
		skyMode === 'off'
			? 'Off — a solid background (the default): black in dark mode, white in light.'
			: skyMode === 'auto'
				? `Auto — following the clock (currently ${skyPhase}).`
				: `Fixed to ${skyMode}.`
	);
	const uiStatus = $derived(
		uiStyle === 'bubble'
			? 'Glossy, bubbly buttons that pop forward across the site.'
			: 'Flat, minimal buttons.'
	);
	const lookStatus = $derived(
		look === 'metro'
			? 'Metro — the original transit-map identity.'
			: 'Lab — the new default look.'
	);
	const starsStatus = $derived(
		starsOn ? 'A field of twinkling stars and a few shooting stars, in dark mode.' : 'Stars off.'
	);

	// Narrow/portrait screens get the vertical train layout (and a portrait camera).
	let vw = $state(1200);
	// Height matters too: the viewBox has a fixed aspect and `preserveAspectRatio` defaults to
	// `meet`, so the map's scale is min(vw/cam.w, vh/cam.h) — a short wide window fits by height.
	let vh = $state(800);
	const isMobile = $derived(vw <= 720);

	// The rings run far past the viewport by design, but the ones that clear it ENTIRELY are pure
	// cost: nothing of them can ever show, and yet Firefox still generates the dash pattern around
	// each of those enormous circumferences on every repaint. At 1400×900 that was 12 of the 20,
	// and it was the whole reason a streaming band juddered — the band's rotation dirties the disc
	// beneath it, so all twenty rings were re-dashed every frame (~34ms/frame; culling → ~17ms).
	// The centre always sits inside the viewport, so a circle shows iff it reaches no farther than
	// the farthest corner.
	const cornerReach = $derived(
		Math.max(
			Math.hypot(ringCx, ringCy),
			Math.hypot(vw - ringCx, ringCy),
			Math.hypot(ringCx, vh - ringCy),
			Math.hypot(vw - ringCx, vh - ringCy)
		)
	);
	const visibleRings = $derived(
		ringRadii.map((r, i) => ({ r, i })).filter(({ r }) => r <= cornerReach)
	);
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
	// Station dot radii, in world units. The hub reads as the hub through its larger dot AND
	// its larger label (.code-hub), so the dot itself doesn't have to shout: at R_HUB = 15 it
	// rendered ~44px wide on a 1400px desktop and ~54px at 1920px — bigger than the masthead's
	// 30px station-sign bullets. 10 lands the home view's hub level with them on a 1400px
	// desktop; DOT_CAP_PX (below) holds that true on wider ones.
	const R_HUB = 10;
	const R_STOP = 6.5;
	// The hub's rendered diameter, ceiling. Matches .theme-dot's 30px.
	const DOT_CAP_PX = 30;
	// Clearance from a dot's EDGE to the near edge of its label, in world units. Kept as a
	// separate term (rather than baked into a literal gap) so changing a radius doesn't
	// silently move the labels in or out. Measured off the UNSCALED radius, so where dotScale
	// shrinks a dot the label simply gains clearance — it never loses any.
	const LABEL_CLEAR_HUB = 19;
	const LABEL_CLEAR_STOP = 8.5;

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
		const gap = code === HUB ? R_HUB + LABEL_CLEAR_HUB : R_STOP + LABEL_CLEAR_STOP;
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
			for (const k of [NAMES_KEY, THEME_KEY, CONTENT_KEY, EXPAND_KEY, SKY_KEY, STARS_KEY, UI_KEY, LOOK_KEY])
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
		labelLead: 'Choose how stations are labelled on the map.',
		labelNote: 'Now showing {}. Remembered next time.',
		displayLead: 'Choose the display mode (also up by the wordmark).',
		displayNote: '{}. Remembered next time.',
		skyLead: 'Paint the map with a time-of-day sky.',
		skyNote:
			'{} The sky sets the palette while on, so the display mode above applies again when it’s off. Remembered next time.',
		starsLead: 'Show tiny stars when the sky is Night.',
		starsNote: '{} Remembered next time.',
		resetLead: 'Start over with the settings this page ships with.',
		uiLead: 'Choose how buttons across the site look and feel.',
		uiNote: '{} Remembered next time.',
		lookLead: 'Choose the overall look of the site.',
		lookNote: '{} Remembered next time.',
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
	// viewBox w/h. Only the portrait train map is tall; everything else is the wide crop.
	const ASPECT_WIDE = 1.5;
	const ASPECT_TALL = 0.64;
	const ASPECT = $derived(mapMode === 'rail' && isMobile ? ASPECT_TALL : ASPECT_WIDE);
	// Home is zoomed to the hub so routes bleed off every edge; a node focus keeps
	// the node in the left-of-panel area (biasX) with its neighbours in view.
	// `aspect` defaults to the live ASPECT — right for a fly-to, which always targets the
	// map as it's currently drawn. The home framings below pass theirs explicitly: each
	// belongs to one (mode, orientation) pair, so it must not be built from whatever
	// ASPECT happened to hold when the module initialised.
	function crop(cx: number, cy: number, w: number, biasX = 0.5, biasY = 0.5, aspect = ASPECT) {
		const h = w / aspect;
		return { x: cx - w * biasX, y: cy - h * biasY, w, h };
	}
	// Home framing: the whole left column is UI (the masthead top-left, with the nav
	// menus — destinations then route lines — stacked directly beneath it), so bias the
	// network to the centre-right — hub past centre, spokes fanning right — keeping the
	// left clear of routes and nodes. Both modes
	// zoom into the hub at a comfortable scale so the outermost stations run off the
	// edges (reached by flying to them), rather than shrinking to fit everything in.
	const HOME_AIR = crop(P_air.KSH[0], P_air.KSH[1], 860, 0.66, 0.56, ASPECT_WIDE);
	// Desktop zooms onto the hub cluster — Home centred with About, Settings and Apps (tier 0
	// and 1) framed, while Work/Projects and the Presentation Builder / Air Traffic run off the
	// edges with their routes trailing into the crop. Centred on the cluster, not the hub.
	const HOME_RAIL = crop(400, 385, 540, 0.5, 0.47, ASPECT_WIDE);
	// Mobile zooms onto the hub cluster — Home with About above and Settings/Apps below (tier 0
	// and 1) filling the frame, while Work/Projects run off the top and the Presentation Builder /
	// Air Traffic off the bottom (the layout above puts them far enough out to clip). Centred on
	// the cluster (y 450), not the hub.
	const HOME_RAIL_V = crop(223, 450, 270, 0.5, 0.5, ASPECT_TALL);
	const HOME = $derived(mapMode === 'air' ? HOME_AIR : isMobile ? HOME_RAIL_V : HOME_RAIL);

	// The whole map, unzoomed: the origin of the load-in fly, and where the masthead's "show full
	// map" button eases out to. Wide enough to frame every node — including the tier-2 leaves the
	// home crop pushes off — with margin. (Air isn't zoomed on home, so its full == its home.)
	const FULL_AIR = HOME_AIR;
	const FULL_RAIL = crop(P_rail.KSH[0], P_rail.KSH[1], 900, 0.62, 0.54, ASPECT_WIDE);
	const FULL_RAIL_V = crop(230, 460, 430, 0.5, 0.5, ASPECT_TALL);
	const FULL = $derived(mapMode === 'air' ? FULL_AIR : isMobile ? FULL_RAIL_V : FULL_RAIL);

	// Dot sizing, decoupled from the camera's zoom.
	//
	// Dot radii are world units, so they'd scale with the map — but the masthead's bullets are
	// a fixed 30px (its wordmark clamps at 5.5rem and stops growing, and the bullets never
	// grew at all). Past ~1400px the map keeps zooming and the masthead doesn't, so the hub
	// pulls ahead of the bullets it's supposed to sit level with: 1.20× at 1920px.
	//
	// So shrink the dots, in world units, by however much the home camera has overshot
	// DOT_CAP_PX — the hub then holds at 30px and every other dot keeps its proportion to it
	// (a stop stays 0.65× the hub, always). Lines and labels still scale; only the dots pin.
	//
	// Measured against HOME rather than the live camera on purpose: pinning to HOME makes this
	// a per-viewport constant, not something that recomputes on every frame of a fly and fights
	// Bubble's `r` transition. (Dormant since the map's dots were removed — kept for an easy
	// restore, along with the rest of the camera/node machinery.)
	const homeScale = $derived(Math.min(vw / HOME.w, vh / HOME.h) || 1);
	const dotScale = $derived(Math.min(1, DOT_CAP_PX / (2 * R_HUB * homeScale)));
	const rHub = $derived(R_HUB * dotScale);
	const rStop = $derived(R_STOP * dotScale);

	// The camera starts on the WHOLE map (the desktop rail full framing the server renders, since
	// `vw` starts at its desktop default); onMount flies it in to the zoomed home. Seeding it at
	// full here — not the home crop — means the server paints the same first frame the load-in
	// animation starts from, so there's no jump between hydration and the fly.
	let cam = $state({ ...FULL_RAIL });
	// The masthead's "show full map" toggle: eases the camera out to the whole map and back. Only
	// reachable on the home view (the masthead hides under a panel), and reset whenever one opens.
	let showFull = $state(false);
	// A destination page, a highlighted airline line, or neither. `View` and the slug
	// mapping live in $lib/views.ts; the incoming URL seeds this so a deep link renders
	// its panel on the server.
	//
	// `data.view` is read once, on purpose: from here on the open panel is local state
	// (clicks mutate it directly, and the panel-slide animation needs to defer the swap).
	// The URL is mirrored onto it by `syncUrl`, and any change coming the other way —
	// back/forward, or a full navigation that swaps `data` — is picked up by the
	// `page.url` effect below. So this staying pinned to the initial value is correct.
	// svelte-ignore state_referenced_locally
	let view = $state<View | null>(data.view);
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
	// The load-in holds on the whole map while the nodes pop in, then flies to the zoomed home.
	let homeFlyTimer = 0;
	const HOME_HOLD = 1000; // ms on the full map before the zoom (≈ when the tier-2 dots have popped)
	let target = { ...HOME_RAIL };
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

	let panelEl = $state<HTMLElement | undefined>(undefined);
	// Dormant since the map was removed: no drag-to-pan surface remains, so this never
	// flips true. Kept (with `class:panning` on the stage) so the cursor plumbing is a
	// one-line restore if the map ever returns.
	let panning = $state(false);

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
	// Where the camera rests with no panel open: the whole map while the "show full map" toggle is
	// on, otherwise the zoomed home framing.
	const restFrame = $derived(showFull ? FULL : HOME);
	// Masthead "show full map" button. Only reachable on the home view, so it just eases the
	// camera between the whole map and the zoomed home.
	function toggleFullMap() {
		// Cancel any still-pending load-in fly, so it can't yank the camera home after this.
		clearTimeout(homeFlyTimer);
		showFull = !showFull;
		flyTo(restFrame);
	}

	// Keep the address bar on the panel that's actually showing.
	//
	// The URL is pushed here, at the moment the content swaps — not when navigation
	// starts — because a panel→panel move holds the old content on screen for
	// PANEL_SLIDE ms while it slides out. Pushing early would leave the URL naming a
	// panel you can't see yet, and would trip the reconciler below.
	//
	// `push` is false when the change *came from* history (a back/forward), which would
	// otherwise re-push the entry we just popped.
	// The Traffic board's controls, as the URL sees them. `null` is the default, which is
	// spelled by leaving the param off entirely.
	type BoardParams = { field: string | null; range: number | null; refresh: number | null };
	const NO_PARAMS: BoardParams = { field: null, range: null, refresh: null };

	// Built with URLSearchParams rather than string concatenation so the ordering is stable
	// and the escaping isn't ours to get wrong. Order matches $lib/scope + the load's
	// canonicalisation, so a URL we push is byte-identical to one the server would redirect
	// to — otherwise `syncUrl`'s address-bar comparison below would never match and every
	// pick would push a duplicate entry.
	function boardQuery({ field: f, range: r, refresh: p }: BoardParams) {
		const q = new URLSearchParams();
		if (f) q.set('field', f.toLowerCase());
		const rt = r === null ? null : rangeToken(r);
		if (rt) q.set('range', rt);
		const pt = p === null ? null : refreshToken(p);
		if (pt) q.set('refresh', pt);
		const s = q.toString();
		return s ? `?${s}` : '';
	}

	function syncUrl(nv: View | null, bp: BoardParams = NO_PARAMS, replace = false) {
		// A panel's URL is its path plus, for the Traffic board, the controls it's set to.
		// Each default carries no param — it's what you get with none. Passed as one object
		// rather than three positional args: with `field`, `range` and `refresh` all
		// nullable, a dropped or transposed argument would be invisible at the call site.
		const path = viewPath(nv) + boardQuery(bp);
		// Compare against the address bar, NOT `page.url`. Shallow routing leaves
		// `page.url` pinned to the last real navigation — `pushState` only assigns
		// `page.state`, and a shallow popstate restores the pre-push URL. So `page.url`
		// would still say `/` long after we'd pushed `/apps/air-traffic`.
		if (location.pathname + location.search === path) return;
		// Shallow: updates the address bar and history without re-running `load`, so the
		// camera, panel, and live board state all survive. Only legal after hydration.
		// View and field ride along in `page.state` so back/forward can restore them —
		// and both must be written every time, or a replace would drop the other.
		//
		// `$state.snapshot` is load-bearing: history entries are structured-cloned, and a
		// `$state` proxy (which `view` is, once assigned) throws DataCloneError. Callers
		// that hand us a fresh object literal are unaffected; `setField` passes `view`.
		const state = {
			view: nv ? ($state.snapshot(nv) as View) : null,
			field: bp.field,
			range: bp.range,
			refresh: bp.refresh
		};
		// Picking a field *replaces* the entry: it's a control on the open panel, not a
		// new place. Otherwise every chip click would need its own press of Back.
		if (replace) replaceState(path, state);
		else pushState(path, state);
	}

	// The panel the current history entry stands for.
	//
	// Shallow entries carry it in `page.state`; entries from a real navigation (the
	// first load, a reload, a link opened in this tab) have no state, so they fall back
	// to what `load` resolved from the URL. `null` is a real value here — the overview
	// map — which is why this tests for `undefined` rather than truthiness.
	const urlView = $derived(page.state.view !== undefined ? page.state.view : data.view);
	const urlField = $derived(page.state.field !== undefined ? page.state.field : data.field);
	const urlRange = $derived(page.state.range !== undefined ? page.state.range : data.range);
	const urlRefresh = $derived(
		page.state.refresh !== undefined ? page.state.refresh : data.refresh
	);

	// The Traffic board's three controls, mirrored into the query. Seeded from the URL; see
	// the note on `view` above for why reading `data` once is right. `null` means "the
	// default", which is exactly what carrying no param means.
	// svelte-ignore state_referenced_locally
	let field = $state<string | null>(data.field);
	// svelte-ignore state_referenced_locally
	let range = $state<number | null>(data.range);
	// svelte-ignore state_referenced_locally
	let refresh = $state<number | null>(data.refresh);

	const boardParams = $derived<BoardParams>({ field, range, refresh });

	// The board changed a control: record it and rewrite the URL in place. A control is a
	// setting on the open panel, not a new place, so these replace the history entry —
	// otherwise every chip click would need its own press of Back.
	function setField(a: { iata: string; icao: string }) {
		field = a.icao === DEFAULT_FIELD.icao ? null : a.iata;
		if (view) syncUrl(view, boardParams, true);
	}
	function setRange(nm: number) {
		range = rangeToken(nm) === null ? null : nm;
		if (view) syncUrl(view, boardParams, true);
	}
	function setRefresh(ms: number) {
		refresh = refreshToken(ms) === null ? null : ms;
		if (view) syncUrl(view, boardParams, true);
	}

	// ── What a shared link says it is ───────────────────────────────────────────
	// A field-specific board names its field, so `?field=sfo` unfurls as San Francisco
	// rather than as the generic board. Gated on the board actually being open, so a
	// stale `field` can never bleed into another panel's title or canonical URL.
	const onBoard = $derived(view?.kind === 'port' && view.code === 'ATFC');
	const selectedField = $derived(onBoard ? fieldByIata(field) : null);
	const headTitle = $derived(
		selectedField ? `Air Traffic · ${selectedField.name} — ${SITE}` : viewTitle(view)
	);
	const headDescription = $derived(
		selectedField
			? `Live traffic around ${selectedField.name} (${selectedField.icao}) — arriving, departing, or passing over.`
			: viewDescription(view)
	);
	// `page.url.origin` is safe where `page.url` is not: shallow routing never changes it.
	const canonicalHref = $derived(
		new URL(
			viewPath(view) + (selectedField ? `?field=${selectedField.iata.toLowerCase()}` : ''),
			page.url.origin
		).href
	);

	// Show a destination/line: fly the camera there and render its panel content.
	function applyView(nv: View, push = true) {
		view = nv;
		// A panel takes over the camera, so drop the "show full map" toggle — closing returns to
		// the zoomed home, not the full map.
		showFull = false;
		// A fresh open starts the board on its defaults — the previous visit's `?field=` and
		// friends belong to the history entry we left, not to this new one. On a
		// history-driven open (`push` false) the reconciler has already set them.
		if (push) {
			field = null;
			range = null;
			refresh = null;
			syncUrl(nv, NO_PARAMS);
		}
		// Only the Air Traffic board and the Presentation Builder are designed to fill the
		// viewport. PRES forces the full layout on open (its compact form is a fallback); every
		// other panel is compact-only, so clear any lingering expand intent (e.g. from a previous
		// ATFC visit) — that keeps panelExpanded true to what's shown, so the panel renders AND
		// slides out at the right width (a stale expand no longer jerks the close). ATFC keeps
		// whatever the user last toggled.
		if (nv.kind === 'port' && nv.code === 'PRES') panelExpanded = true;
		else if (!(nv.kind === 'port' && nv.code === 'ATFC')) panelExpanded = false;
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
	function navigate(nv: View, push = true) {
		clearTimeout(navTimer);
		if (view && !reduce) {
			panelLeaving = true;
			navTimer = window.setTimeout(() => {
				applyView(nv, push);
				panelLeaving = false;
			}, PANEL_SLIDE);
		} else {
			applyView(nv, push);
		}
	}
	function board(code: string) {
		// Already showing this station: clicking it again (its nav item is the active one, or an
		// onward chip points back to it) shouldn't tear the panel down and rebuild it. No-op.
		if (view?.kind === 'port' && view.code === code) return;
		navigate({ kind: 'port', code });
	}
	function openLine(idx: number) {
		if (view?.kind === 'line' && view.idx === idx) return;
		navigate({ kind: 'line', idx });
	}
	function home(push = true) {
		clearTimeout(navTimer);
		clearTimeout(hideTimer);
		panelLeaving = false;
		// Bring the map back so the fly home is visible behind the closing panel.
		mapHidden = false;
		// Keep panelExpanded set so the panel flies out at its current width in one
		// clean slide (it's reset on the next fresh open, not mid-close).
		view = null;
		if (push) {
			// The overview map has no board; leaving these set would linger in the head tags.
			field = null;
			range = null;
			refresh = null;
			syncUrl(null);
		}
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


	// Shared by every in-map link (stations, line legend, onward chips).
	//
	// Left-click with no modifier is ours: cancel the navigation and fly the camera.
	// Anything else — ⌘/ctrl (new tab), shift (new window), alt (download), middle-click —
	// is the browser's, so the link behaves like a link.
	function onNodeClick(e: MouseEvent, run: () => void) {
		if (e.defaultPrevented) return; // a pan just ended; onClickCapture killed it
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		e.preventDefault();
		run();
	}

	// Stations carry an explicit tabindex because SVG <a> is not reliably in the tab
	// order across browsers. Enter needs no handler — the browser fires a click on a
	// focused link, which `onNodeClick` picks up. Space does not, so it's wired here to
	// keep the behaviour the old role="button" nodes had.
	const onNodeKey = (code: string) => (e: KeyboardEvent) => {
		if (e.key !== ' ') return;
		e.preventDefault();
		board(code);
	};
	// Click the exposed background beside an unexpanded panel to dismiss it — the "click off
	// the panel" affordance the map's catch-rect used to give. Gated to a click that lands on
	// the stage itself (`target === currentTarget`), so the masthead, its nav, and the panel
	// are untouched; and to an open, unexpanded panel (expanded fills the viewport, leaving no
	// background to click). The Back button remains the keyboard-accessible way to close.
	function onStageClick(e: MouseEvent) {
		if (view && !panelExpanded && e.target === e.currentTarget) home();
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
	// The open station's code (or null) — drives the masthead nav's active highlight. A plain
	// string so <Masthead> stays free of the View union.
	const activeCode = $derived(view?.kind === 'port' ? view.code : null);
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
		vh = window.innerHeight;
		measureRings(); // the wordmark (and so the "o") shifts as it clamps with the viewport
		// On a desktop⇄mobile crossover the layout swaps; re-frame if idle at home.
		if (isMobile !== wasMobile) {
			wasMobile = isMobile;
			if (!view) flyTo(restFrame);
		}
	}

	onMount(() => {
		vw = window.innerWidth;
		vh = window.innerHeight;
		wasMobile = isMobile;
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
		SHOOT = makeShooting(); // and a few shooting stars to cross it
		// Centre the rings on the wordmark's "o" and size the band ribbon to clear the masthead. The
		// words re-fit themselves off the resulting radii (see the $effect). Again once the wordmark
		// font has loaded: glyph widths move both the "o" and the masthead's own box.
		measureRings();
		document.fonts?.ready.then(() => {
			measureRings();
			fitBands(); // the face changed, so re-fit even if the radii didn't move
		});
		starsOn = localStorage.getItem(STARS_KEY) !== '0'; // default on
		if (localStorage.getItem(UI_KEY) === 'bubble') setUiStyle('bubble'); // else default flat
		if (localStorage.getItem(LOOK_KEY) === 'metro') setLook('metro'); // else default lab
		// While on Auto, keep the phase current if the tab is left open across a boundary.
		skyTimer = window.setInterval(() => skyMode === 'auto' && applySky(), 5 * 60 * 1000);
		if (dev) applySavedContent();
		// Seed the camera at the resolved mode/orientation FULL framing (the whole map), the origin
		// for the load-in fly.
		cam = { ...FULL };
		target = { ...FULL };
		// Arrived on a deep link (/atfc, /terminal-way, …): its panel already rendered on
		// the server, but the camera is still parked at the full map. Fly it in — same motion a
		// click would produce. `push: false` — this URL is already the current entry. On the plain
		// home view, fly the whole map in to the zoomed home framing.
		//
		// This runs after the localStorage reads above because the framing depends on the
		// restored map mode, and after `cam`/`target` are seeded so the fly has an origin.
		if (view) applyView(view, false);
		else if (reduce) flyTo(HOME); // no fly to watch — snap straight to the resting framing
		// Home load: hold on the whole map so the ring-by-ring node pop plays at full framing, then
		// fly in to the hub. The guard covers a click that opens a panel during the hold.
		else homeFlyTimer = window.setTimeout(() => !view && flyTo(HOME), HOME_HOLD);
	});

	// Reconcile the panel when history moves without us — the back/forward buttons
	// popping an entry. A click-driven change lands here too, but as a no-op: `applyView`
	// sets `view` *before* `syncUrl` pushes, so the two already agree by the time this
	// runs.
	//
	// The read of `view` is untracked: this effect must fire on history changes only.
	// Tracking `view` as well would re-run it on every panel open and break the
	// PANEL_SLIDE hand-off, since mid-slide the history entry still names the old panel.
	$effect(() => {
		const nextView = urlView;
		const nextField = urlField;
		const nextRange = urlRange;
		const nextRefresh = urlRefresh;
		untrack(() => {
			if (sameView(nextView, view)) {
				// Same panel, different controls — restored by back/forward, or by a real
				// navigation to the same route with a different query (which re-runs `load`
				// but does not remount). The panel is keyed on the station code, not on these,
				// so the board is not rebuilt: it follows the props instead (see the
				// `initialField` / `initialRange` / `initialRefresh` effect in TrafficBoard).
				if (nextField !== field) field = nextField;
				if (nextRange !== range) range = nextRange;
				if (nextRefresh !== refresh) refresh = nextRefresh;
				return;
			}
			// Set the controls before the panel swaps: the board reads them as props when the
			// keyed block remounts it, and `navigate` defers that swap by PANEL_SLIDE.
			field = nextField;
			range = nextRange;
			refresh = nextRefresh;
			if (nextView) navigate(nextView, false);
			else home(false);
		});
	});

	onDestroy(() => {
		if (raf) cancelAnimationFrame(raf);
		clearTimeout(navTimer);
		clearTimeout(homeFlyTimer);
		clearTimeout(hideTimer);
		clearTimeout(toastTimer);
		clearInterval(skyTimer);
	});

	const viewBox = $derived(
		`${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${cam.w.toFixed(1)} ${cam.h.toFixed(1)}`
	);
</script>

<svelte:window onkeydown={onKey} onresize={onResize} />

<!-- Titled per panel, so a shared /apps/air-traffic link reads as "Air Traffic —
     Kashinoga" in the tab and in the unfurled preview card rather than as a generic
     homepage. These track `view`/`field` (not `data.*`), so they update as you fly around
     the map and switch fields, without a navigation. -->
<svelte:head>
	<title>{headTitle}</title>
	<meta name="description" content={headDescription} />
	<link rel="canonical" href={canonicalHref} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={headTitle} />
	<meta property="og:description" content={headDescription} />
	<meta property="og:url" content={canonicalHref} />
	<meta name="twitter:card" content="summary" />
</svelte:head>

<!-- Decorative station-sign bullet beside a panel title, in the colour of the line the
     station sits on — the same treatment ATFC and the Presentation Builder already give
     their titles, and the same bullets that sit beside the homepage wordmark.

     The wrapper is deliberately not the dot itself: as a flex item, an empty element's
     baseline is synthesized from the wrong edge in Firefox and floats off the title's
     baseline. An inline-block wrapper (font-size:0 to collapse whitespace) takes its
     baseline from the inline-block dot inside it, which is its bottom margin edge — so
     `align-items: baseline` on .title-row rests the dot on the title's baseline. -->
{#snippet accentDot(color: string)}
	<div class="dot-wrap" aria-hidden="true">
		<span class="accent-dot" style:background={color}></span>
	</div>
{/snippet}

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
						<a
							class="chip"
							href={viewPath({ kind: 'port', code: c })}
							data-sveltekit-preload-data="off"
							onclick={(e) => onNodeClick(e, () => board(c))}
						>
							<span class="chip-dot" style:background={accent[c]}></span>
							<span class="chip-title">{airports[c].title}</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="stage" class:panning onclick={onStageClick}>
	<!-- Light-mode concentric rings radiating from the wordmark's "o" (dark mode gets the stars
	     instead; the light-dark() stroke hides these there). Centre tracks the measured "o". -->
	<svg class="rings" aria-hidden="true">
		{#each visibleRings as { r, i } (i)}
			<g class="ring" style="--spin-dur:{150 + i * 9}s; --spin-dir:{i % 2 ? 'reverse' : 'normal'}">
				<circle class="ring-hit" cx={ringCx} cy={ringCy} {r} />
				<circle class="ring-line" cx={ringCx} cy={ringCy} {r} />
			</g>
		{/each}
	</svg>
	<!-- Ticker bands: one destination per ring, each a coloured band with its name repeating around
	     it, streaming while hovered. Each is a real link to its panel — the same four stops, in the
	     same order, as the masthead's nav. Each band is its ring's WHOLE circle, so it runs off the
	     viewport rather than stopping in open space; the stage's overflow is what trims it. -->
	<svg class="ticker">
		<defs>
			{#each bands as b, i}
				<path id="band-track-{i}" d={bandTrack(b.r)} fill="none" />
			{/each}
		</defs>
		{#each bands as b, i}
			<a
				href={viewPath({ kind: 'port', code: b.code })}
				aria-label={airports[b.code].title}
				style:--band-fill={b.fill}
				style:--band-ink={b.ink}
				onclick={(e) => {
					e.stopPropagation(); // not a click on the bare stage, so it must not close the panel
					onNodeClick(e, () => board(b.code));
				}}
			>
				<path class="ticker-band" d={bandTrack(b.r)} stroke-width={BAND_W} />
				<text
					class="ticker-text"
					bind:this={bandTextEls[i]}
					style:transform-origin="{ringCx}px {ringCy}px"
					style:animation-duration="{b.secs}s"
					dominant-baseline="central"
				>
					<textPath href="#band-track-{i}">{b.text}</textPath>
				</text>
			</a>
		{/each}
	</svg>
	{#if starsVisible}
		<div class="stars" aria-hidden="true" transition:fade={{ duration: 700 }}>
			{#each STARS as s}
				<span
					class:tw={s.tw}
					style="left:{s.x}%; top:{s.y}%; width:{s.size}px; height:{s.size}px; animation-duration:{s.dur}s; animation-delay:{s.delay}s"
				></span>
			{/each}
			{#each SHOOT as sh}
				<span
					class="shoot"
					style="left:{sh.x}%; top:{sh.y}%; width:{sh.len}px; --ang:{sh.ang}deg; --dist:{sh.dist}vw; --peak:{sh.peak}; --dur:{sh.dur}s; --delay:{sh.delay}s"
				></span>
			{/each}
		</div>
	{/if}

	<!-- Persistent masthead (wordmark + tagline + station nav) — its own component so a
	     homepage-chrome tweak stays out of this catch-all page. It reports which destination
	     was clicked; the page keeps the modifier-aware click + camera handling. -->
	<Masthead {activeCode} onNavigate={(code, e) => onNodeClick(e, () => board(code))} />

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
			<!-- No generic expand toggle: only the Air Traffic board and Presentation Builder are
			     designed to fill the viewport, and each renders its own control (ATFC toggles;
			     PRES is always full). Every other panel is compact-only. -->

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
							onback={() => home()}
							onToggleExpand={toggleExpand}
							edit={dev && editMode}
							copyText={settingsText}
							onCopyEdit={stageSettings}
							initialField={field}
							onFieldChange={setField}
							initialRange={range}
							onRangeChange={setRange}
							initialRefresh={refresh}
							onRefreshChange={setRefresh}
						>
							{#snippet connections()}
								{@render onward('Connections', conns)}
							{/snippet}
						</TrafficBoard>
					{:else if v.code === 'PRES'}
						<!-- The Presentation Builder owns its whole panel interior (its own toolbar +
						     three-column editor), like the Traffic board. It's always full-viewport —
						     forced expanded on open (applyView), with no collapse toggle. -->
						<PresentationBuilder accent={accent[v.code]} title={port.title} onback={() => home()} />
					{:else}
					<div class="surface-head">
						<button class="icon-btn back" onclick={() => home()} aria-label="Back to home" title="Home">{@html BACK_SVG}</button>
						<div class="title-row">
							<h2 class="dest" style:font-size={destSize(port.title)}><SplitFlap text={port.title} base={160} stagger={45} /></h2>
							{@render accentDot(accent[v.code])}
						</div>
					</div>
					<div class="surface-body" class:settings={v.code === 'STG'}>
						{#if v.code === 'STG'}
							{@const editStg = dev && editMode}
							<div class="stg-group">
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
							</div>
							<div class="stg-group">
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
							</div>
							<div class="stg-group">
							<p
								class="seg-lead"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('lookLead', e.currentTarget.textContent ?? '')
									: undefined}
							>{settingsText('lookLead')}</p>
							<div class="segmented" role="radiogroup" aria-label="Site look">
								{#each lookOptions as o}
									<button
										type="button"
										class="seg"
										class:on={look === o.id}
										role="radio"
										aria-checked={look === o.id}
										onclick={() => setLook(o.id)}
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
									? (e) => stageSettings('lookNote', e.currentTarget.textContent ?? '')
									: undefined}
							>{noteText('lookNote', lookStatus, editStg)}</p>
							</div>
							<div class="stg-group">
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
							</div>
							<div class="stg-group">
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
							</div>
							<div class="stg-group">
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
							</div>
							<div class="stg-group">
							<p
								class="seg-lead"
								class:editable={editStg}
								contenteditable={editStg}
								oninput={editStg
									? (e) => stageSettings('resetLead', e.currentTarget.textContent ?? '')
									: undefined}
							>{settingsText('resetLead')}</p>
							<div class="reset-row">
								<button
									type="button"
									class="edit-enter ghost"
									onclick={resetSettings}
									disabled={settingsAreDefault}
								>
									Reset to defaults
								</button>
							</div>
							<!-- Not editable copy: it states what the button does, and it swaps on state. -->
							<p class="seg-note">
								{settingsAreDefault
									? 'Everything on this page is already at its default.'
									: 'Puts the settings above back to Train, Full names, System, Flat, Auto and On. Saved edits elsewhere are left alone.'}
							</p>
							</div>
							{#if dev}
								<div class="stg-group">
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
								</div>
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
						<button class="icon-btn back" onclick={() => home()} aria-label="Back to home" title="Home">{@html BACK_SVG}</button>
						<div class="title-row">
							{#if editLine}
								<h2
									class="dest editable"
									style:font-size={destSize(lineFieldText(v.idx))}
									contenteditable="true"
									oninput={(e) => stageLineEdit(v.idx, e.currentTarget.textContent ?? '')}
								>{lineFieldText(v.idx)}</h2>
							{:else}
								<h2 class="dest" style:font-size={destSize(lineNames[v.idx])}><SplitFlap text={lineNames[v.idx]} base={160} stagger={45} /></h2>
							{/if}
							<!-- A line's own colour, not a station's accent. -->
							{@render accentDot(a.color)}
						</div>
					</div>
					<div class="surface-body">
						<p
							class:editable={editLine}
							contenteditable={editLine}
							oninput={editLine
								? (e) => stageLineBody(v.idx, e.currentTarget.textContent ?? '')
								: undefined}
						>{lineBodyText(v.idx)}</p>
						{@render onward('Along the way', stops)}
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
		<!-- Drops in from above the top edge and lifts back out the same way. Distances are
		     small — it's a notice, not an entrance — and both collapse to a plain fade under
		     reduced motion. -->
		<div
			class="edit-toast"
			role="status"
			in:fly={{ y: reduce ? 0 : -18, duration: reduce ? 140 : 280 }}
			out:fly={{ y: reduce ? 0 : -12, duration: reduce ? 120 : 200 }}
		>
			{toast}
		</div>
	{/if}
</div>

<style>
	.stage {
		position: fixed;
		inset: 0;
		overflow: hidden;
		/* The default background: pure white in light, pure black in dark — or the time-of-day
		   sky gradient when sky mode is opted into. Kept here (not --page) so the backdrop is a
		   clean white/black the stars and rings sit on, independent of the theme's softer
		   page-field token, and so it matches the panel's own pure stock exactly. */
		background: var(--sky, light-dark(#ffffff, #000000));
	}
	/* Concentric rings radiating from the wordmark's "o" — LIGHT mode only (the light-dark() stroke
	   goes transparent in dark, where the star field takes over). SVG so they can be finely dashed
	   like the inspiration; centred on the measured "o", radii fixed. Behind the chrome, clicks
	   fall through. `overflow: visible` lets the outer rings extend past the stage box. */
	.rings {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		/* The svg passes pointer events through (it paints nothing of its own); only each ring's
		   wide invisible hit-stroke re-enables hover, so empty space still reaches the stage. */
		pointer-events: none;
	}
	.ring {
		/* Rotate the ring about its own centre — fill-box makes transform-origin:center resolve to
		   the group's bbox centre (cx,cy), so it holds as the measured centre moves. */
		transform-box: fill-box;
		transform-origin: center;
	}
	.ring-line {
		fill: none;
		/* Tuned against the pure-white light background — legible dashed rings, still light.
		   Transparent in dark, where the stars take over. */
		stroke: light-dark(rgba(10, 14, 32, 0.26), transparent);
		stroke-width: 1;
		stroke-dasharray: 2.5 7;
		pointer-events: none;
	}
	/* A wide, invisible, gap-free companion stroke — the real hover target, so you don't have to
	   land on the 1px dashed line. */
	.ring-hit {
		fill: none;
		stroke: transparent;
		stroke-width: 18;
		pointer-events: stroke;
	}
	/* Spin ONLY the hovered ring; every other ring's animation stays PAUSED, so idle rings never
	   repaint (that was the perf drain when all 20 ran). Un-hovering freezes it in place. Alternate
	   rings turn opposite ways (--spin-dir) at staggered speeds (--spin-dur). Reduced-motion off.
	   The hovered ring picks up its cruise directly — a wind-up ramp lived here and read as jerky
	   no matter how it was shaped, so it's gone. */
	@media (prefers-reduced-motion: no-preference) {
		.ring {
			animation: ring-spin var(--spin-dur, 180s) linear infinite paused;
			animation-direction: var(--spin-dir, normal);
		}
		.ring:hover {
			animation-play-state: running;
		}
	}
	@keyframes ring-spin {
		to {
			transform: rotate(1turn);
		}
	}

	/* ── Ticker bands ────────────────────────────────────────────────────────────────────────── */
	/* Sit over the rings, so only the bands themselves take the pointer — everywhere else the click
	   falls through to the stage (and to the rings' own hover). Each band's colours arrive as
	   --band-fill / --band-ink from its station. */
	.ticker {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}
	.ticker a {
		pointer-events: auto;
		cursor: pointer;
	}
	.ticker-band {
		fill: none;
		stroke: var(--band-fill);
		stroke-linecap: butt;
		transition: filter 0.2s ease;
	}
	.ticker-text {
		/* Fixed per band, in both themes: the ink rides ON the colour, which doesn't flip. */
		fill: var(--band-ink);
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.14em;
	}
	.ticker a:hover .ticker-band,
	.ticker a:focus-visible .ticker-band {
		filter: brightness(1.12); /* lifts on approach, whatever the band's colour */
	}
	.ticker a:focus-visible {
		outline: none;
	}
	.ticker a:focus-visible .ticker-text {
		text-decoration: underline;
	}
	/* Streaming the words is a slow rotation of the TEXT about its ring's centre; the band beneath
	   stays put, so the words appear to run along it. Only the HOVERED band streams — the others
	   sit still, so an idle homepage animates nothing (the same bargain the rings make). A whole
	   number of words fills each circumference, so a full turn lands exactly back on itself.

	   The turn dirties the whole disc under the band, so everything inside it repaints each frame.
	   That is affordable ONLY because the rings that can't be seen are no longer drawn — see
	   visibleRings. Layer promotion is not an option here: neither will-change nor a 3D transform
	   gets Firefox to composite this, so keeping what's underneath cheap IS the fix. */
	@media (prefers-reduced-motion: no-preference) {
		.ticker-text {
			/* The duration is set per band inline — wider rings take proportionally longer, so every
			   band's words travel at the same speed. */
			animation: ticker-run 60s linear infinite paused;
		}
		.ticker a:hover .ticker-text,
		.ticker a:focus-visible .ticker-text {
			animation-play-state: running;
		}
	}
	@keyframes ticker-run {
		to {
			transform: rotate(1turn);
		}
	}

	/* Stars — shown in DARK mode only. The light-dark() paints them transparent under a light
	   colour-scheme and bright under a dark one, so they appear on the solid black default, a
	   manual/OS dark theme and the dusk/night skies, and vanish in light — no JS dark check. */
	.stars {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.stars span:not(.shoot) {
		position: absolute;
		border-radius: 50%;
		background: light-dark(transparent, #eaf3ff);
		opacity: 0.72;
		box-shadow: 0 0 3px light-dark(transparent, rgba(224, 240, 255, 0.5));
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
	/* Shooting star — a bright head trailing a fading tail (the gradient), streaking across once
	   per long cycle and idle the rest, so only one or two show at a time. `--ang` orients the
	   flight; translateX moves it along that axis (scaleX stretches the streak as it goes). Pure
	   motion, so it stays put (opacity 0) under reduced-motion. Dark-only like the field above. */
	.shoot {
		position: absolute;
		height: 1.5px;
		border-radius: 999px;
		background: linear-gradient(to right, transparent, light-dark(transparent, rgba(234, 243, 255, 0.95)));
		opacity: 0;
	}
	@media (prefers-reduced-motion: no-preference) {
		.shoot {
			animation: shoot var(--dur, 11s) ease-out var(--delay, 0s) infinite;
		}
	}
	@keyframes shoot {
		0% {
			opacity: 0;
			transform: rotate(var(--ang, 20deg)) translateX(0) scaleX(0.4);
		}
		/* Opacity-only stops — they set NO transform, so the streak keeps interpolating its single
		   0 → --dist glide with no mid-flight stutter, while it fades in to its peak, holds, then
		   fades out (the fade finishes as it reaches the far edge, so it's never seen stopping). */
		1% {
			opacity: var(--peak, 1);
		}
		5% {
			opacity: var(--peak, 1);
		}
		8% {
			opacity: 0;
			transform: rotate(var(--ang, 20deg)) translateX(var(--dist, 64vw)) scaleX(1);
		}
		100% {
			opacity: 0;
			transform: rotate(var(--ang, 20deg)) translateX(var(--dist, 64vw)) scaleX(1);
		}
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
		/* The fill lives on .surface-backdrop, not here; the frame only carries the left edge.
		   Flat: a hairline in the same ink as every other divider — the panel is separated
		   from the map by a drawn line. Bubble: a bright Fresnel rim, since there it's a
		   moulded edge catching light. */
		border-left: 1px solid var(--line);
	}
	:global(html[data-ui='bubble']) .surface {
		border-left-color: var(--panel-edge);
	}
	/* The panel's material.
	   Flat — an opaque sheet. No sheen, no backdrop blur: depth comes from the edge above and
	   from the map simply being covered, not from glass you can half-see through. Dropping the
	   blur also retires the Safari big-surface backdrop-filter cost in this mode entirely.
	   Bubble — frosted plastic: a top gloss sheen over a translucent tint, with the map beneath
	   blurred to illegible colour.
	   Either way it's absolutely positioned OUTSIDE the scroller, so it stays pinned to the
	   panel box while content scrolls above it, and it's identical in compact and expanded. */
	.surface-backdrop {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		background: var(--panel-fill-solid);
	}
	:global(html[data-ui='bubble']) .surface-backdrop {
		background: var(--panel-sheen), var(--panel-fill);
		-webkit-backdrop-filter: var(--panel-blur);
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
	}
	.surface-head {
		flex: none;
		/* Cool plastic tint over the frosted backdrop, matching the Traffic board's
		   .tfc-head and the Presentation Builder's toolbar — every panel gets the same
		   darkened header band. Near-opaque, so the map doesn't read through it; the
		   bottom border is the divider. */
		background: var(--panel-head);
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
	/* Title + its accent bullet. Baseline-aligned so the dot rests on the title's text
	   baseline, exactly like the masthead's bullets beside "Kashinoga" and ATFC's dot
	   beside "Air Traffic". */
	.title-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem clamp(0.85rem, 2vw, 1.5rem);
		flex-wrap: wrap;
	}
	.title-row .dest {
		flex: none;
	}
	/* See the accentDot snippet: this wrapper exists to carry a correct baseline. */
	.dot-wrap {
		display: inline-block;
		font-size: 0;
	}
	/* Nonfunctional colour bullet. Empty inline-block → bottom-edge baseline. */
	.accent-dot {
		display: inline-block;
		width: 30px;
		height: 30px;
		border-radius: 999px;
	}
	@media (prefers-reduced-motion: no-preference) {
		/* Rolls in from the left with a little bounce as the title flips — same easing,
		   duration and delay as the masthead dots and ATFC's. */
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

	.dest {
		margin: 0;
		/* Homepage wordmark scale, so every panel's masthead title reads at the same size
		   as "Kashinoga" (matches the ATFC panel's title). */
		font-size: clamp(2.25rem, 9vw, 5.5rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--ink);
		/* One line always — see the ATFC .dest note. A two-word destination would otherwise
		   wrap at narrow panel widths, taking the accent dot beside it down with it. */
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

	/* ── Panel arrival — the depth cascade (see puhig's --enter-* tokens) ─────────────────
	   The sheet flies in first (transition:fly, layer 0). Then the layer sitting on it — the
	   header's eyebrow and chrome — rides in at --enter-lead. Then the layer deeper still, the
	   body content, at one --enter-layer beyond that. The map's overlay always assembled this
	   way (title, then dots, then tagline, then legend); this gives the panel the same reading,
	   where it used to arrive as one rigid slab with every word already at full opacity.

	   The body column deals out top-to-bottom on the `rise` keyframe — the same one the tagline
	   and legend use — so a station's contents settle on the same spring as the words they
	   replaced. It replays on every destination, because the {#key} above rebuilds this subtree:
	   swapping station→station never flies the panel (the aside stays mounted), so before this
	   the new copy simply blinked into place.

	   `backwards`, never `both`. The fill has to lift when the animation ends, or the animated
	   transform would outrank the hover scale() on the buttons nested inside these wrappers and
	   pin them at rest. Direct children of .surface-body are always prose or a wrapper
	   (nav.onward, div.segmented, div.sky-picker) — never a button — so the transform only ever
	   lands on an ancestor; the chrome buttons get their own horizontal entrance below. */
	@media (prefers-reduced-motion: no-preference) {
		/* Layer 1: the eyebrow, on the surface with the chrome. */
		.surface-head .eyebrow {
			animation: rise 0.5s ease backwards;
			animation-delay: var(--enter-lead);
		}
		/* Layer 2: the body content, a beat deeper — it fills the sheet the frame just drew. */
		.surface-body > * {
			animation: rise 0.5s ease backwards;
			animation-delay: calc(var(--enter-lead) + var(--enter-layer) + var(--n, 0) * var(--enter-step));
		}
		/* The beat per item. Settings runs to twenty children, and a delay that kept counting
		   would still be dealing them out most of a second after the panel landed — so the
		   ladder caps, and everything past the eighth arrives with it. */
		.surface-body > *:nth-child(1) {
			--n: 1;
		}
		.surface-body > *:nth-child(2) {
			--n: 2;
		}
		.surface-body > *:nth-child(3) {
			--n: 3;
		}
		.surface-body > *:nth-child(4) {
			--n: 4;
		}
		.surface-body > *:nth-child(5) {
			--n: 5;
		}
		.surface-body > *:nth-child(6) {
			--n: 6;
		}
		.surface-body > *:nth-child(7) {
			--n: 7;
		}
		.surface-body > *:nth-child(n + 8) {
			--n: 8;
		}
	}

	/* Panel chrome slides in horizontally while the content column rises — the two axes read as
	   two groups arriving, not one wall. `backwards` again, and here it is load-bearing in a way
	   the content rule only worried about second-hand: this IS a button in the universal
	   hover/press list, so the fill must lift the moment the entrance ends or the animated
	   translate would pin its scale() — the e2e buttons suite hovers long after, and asserts
	   exactly 1.05. */
	@media (prefers-reduced-motion: no-preference) {
		.surface-head .back {
			animation: btn-in 0.42s var(--spring) backwards;
			animation-delay: calc(var(--enter-lead) + var(--bn, 0) * var(--btn-enter-step));
		}
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
	/* Matches .dev-actions' rhythm, so Reset sits in the column like any other control. */
	.reset-row {
		display: flex;
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
	/* Messages arrive at the TOP centre — the eye starts there, and the bottom of the screen is
	   already the edit bar's. Centred by auto margins rather than translateX(-50%), so the fly
	   transition owns `transform` outright and can't be fought by the centring. */
	.edit-toast {
		position: fixed;
		top: clamp(1rem, 3vh, 1.75rem);
		left: 0;
		right: 0;
		margin-inline: auto;
		width: fit-content;
		z-index: 60;
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
	/* Each settings group — its lead, control and note — is wrapped in a .stg-group so it can be
	   laid out and kept together as a unit. In the normal (compact) panel the wrapper is inert:
	   the group is a block whose children space themselves by the same amount the body's old flex
	   gap gave them, so the stacked look is unchanged. */
	.stg-group > * + * {
		margin-top: 1.05rem;
	}
	/* Expanded settings spread into a grid — a full-viewport panel has far more width than one
	   column of controls needs. Groups flow into as many ~19rem tracks as fit (two or three on a
	   wide desktop). Grid, not multicol: a group is one cell, so it can never split across a
	   column the way multicol's break rules let a note orphan. The Connections nav spans the full
	   width beneath. (The panel can't be expanded on mobile, so this is desktop-only in practice.) */
	.surface.expanded .settings {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
		align-content: start;
		gap: 1.75rem 2.75rem;
	}
	.surface.expanded .settings > .onward {
		grid-column: 1 / -1;
	}
	/* The per-lead divider line reads as a stray rule atop a grid cell, so the groups separate by
	   the grid gap alone; the lead that led each group no longer needs its top border. */
	.surface.expanded .settings .stg-group > .seg-lead,
	.surface.expanded .settings .stg-group > p {
		border-top: none;
		padding-top: 0;
		margin-top: 0;
	}
	/* Level the group headers so the controls beneath them line up across a grid row. Each group's
	   lead is its first child; a one-line description and a two-line one would otherwise push their
	   controls to different heights, and the eye zig-zags reading the row left to right. Flooring
	   every lead at two lines lands all the controls on the same line. */
	.surface.expanded .settings .stg-group > :first-child {
		min-height: 3.25rem;
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
		text-decoration: none;
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
	.chip-title {
		font-weight: 600;
		color: var(--ink);
	}

	/* ══ Universal button interaction ═══════════════════════════════════════════════════
	   Every button in the app springs the same way, in both UI styles: a small pop on hover,
	   a squash + darken on press, on the shared --btn-spring. Amounts live in puhig's tokens
	   so a button's feel is changed in one place, never per component.

	   Why `html:root` and not plain `html`: Svelte scopes a component's own rule to
	   `.seg.svelte-hash` (specificity 0,2,0), which would beat `html .seg` (0,1,1) and drop
	   the transform transition on the floor. `:root` is a pseudo-class, so `html:root .seg`
	   reaches (0,2,1) and wins — the same trick `html[data-ui='bubble'] .seg` gets for free
	   from its attribute. Flat has no attribute to key on, hence `:root`.

	   Exclusions, deliberate: `.manual` spins on press (its own rotate would fight a scale)
	   and `.refresh` is a countdown ring. Both still darken. */
	:global(html:root .seg),
	:global(html:root .sky-opt),
	:global(html:root .icon-btn),
	:global(html:root .edit-enter),
	:global(html:root .edit-btn),
	:global(html:root .chip),
	:global(html:root .legend-btn),
	:global(html:root .field),
	:global(html:root .field-select),
	:global(html:root .type-btn),
	:global(html:root .pc-close),
	:global(html:root .manual),
	:global(html:root .tb),
	:global(html:root .mini),
	:global(html:root .swatch-btn) {
		transition:
			transform 0.3s var(--btn-spring),
			background 0.18s var(--btn-soft),
			background-color 0.18s var(--btn-soft),
			border-color 0.18s var(--btn-soft),
			box-shadow 0.28s var(--btn-soft),
			opacity 0.18s var(--btn-soft),
			color 0.15s ease;
	}
	/* The 30px header icon circles sit flush at the top of a sticky header inside a clipping
	   scroller. Anchoring their scale to the TOP edge means the pop grows only downward, into
	   the header's padding, so it never crosses the clip boundary. */
	:global(html:root .icon-btn),
	:global(html:root .manual) {
		transform-origin: center top;
	}

	/* Press: DARKEN whatever colour the button already is rather than repaint the fill (which
	   turned coloured buttons grey). The black overlay has zero blur — it's a flood tint, a
	   fill, not a bevel — so it darkens a neutral button and the orange primary alike, in both
	   themes, without Flat ever growing a shadow. */
	:global(html:root .seg:active:not(:disabled)),
	:global(html:root .sky-opt:active:not(:disabled)),
	:global(html:root .icon-btn:active:not(:disabled)),
	:global(html:root .field:active:not(:disabled)),
	:global(html:root .field-select:active:not(:disabled)),
	:global(html:root .edit-enter:active:not(:disabled)),
	:global(html:root .edit-btn:active:not(:disabled)),
	:global(html:root .chip:active:not(:disabled)),
	:global(html:root .legend-btn:active:not(:disabled)),
	:global(html:root .type-btn:active:not(:disabled)),
	:global(html:root .pc-close:active:not(:disabled)),
	:global(html:root .refresh:active:not(:disabled)),
	:global(html:root .manual:active:not(:disabled)),
	:global(html:root .tb:active:not(:disabled)),
	:global(html:root .mini:active:not(:disabled)),
	:global(html:root .swatch-btn:active:not(:disabled)) {
		box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.07);
	}

	@media (prefers-reduced-motion: no-preference) {
		:global(html:root .seg:hover:not(:disabled)),
		:global(html:root .sky-opt:hover:not(:disabled)),
		:global(html:root .icon-btn:hover:not(:disabled)),
		:global(html:root .edit-enter:hover:not(:disabled)),
		:global(html:root .edit-btn:hover:not(:disabled)),
		:global(html:root .chip:hover:not(:disabled)),
		:global(html:root .legend-btn:hover:not(:disabled)),
		:global(html:root .field:hover:not(:disabled)),
		:global(html:root .field-select:hover:not(:disabled)),
		:global(html:root .type-btn:hover:not(:disabled)),
		:global(html:root .pc-close:hover:not(:disabled)),
		:global(html:root .manual:hover:not(:disabled)),
		:global(html:root .tb:hover:not(:disabled)),
		:global(html:root .mini:hover:not(:disabled)),
		:global(html:root .swatch-btn:hover:not(:disabled)) {
			transform: scale(var(--btn-hover-scale));
		}
		:global(html:root .seg:active:not(:disabled)),
		:global(html:root .sky-opt:active:not(:disabled)),
		:global(html:root .icon-btn:active:not(:disabled)),
		:global(html:root .field:active:not(:disabled)),
		:global(html:root .field-select:active:not(:disabled)),
		:global(html:root .edit-enter:active:not(:disabled)),
		:global(html:root .edit-btn:active:not(:disabled)),
		:global(html:root .chip:active:not(:disabled)),
		:global(html:root .legend-btn:active:not(:disabled)),
		:global(html:root .type-btn:active:not(:disabled)),
		:global(html:root .pc-close:active:not(:disabled)),
		:global(html:root .tb:active:not(:disabled)),
		:global(html:root .mini:active:not(:disabled)),
		:global(html:root .swatch-btn:active:not(:disabled)) {
			transform: scale(var(--btn-press-scale));
			transition-duration: 0.1s;
		}
	}
	/* NOTE: the universal interaction sits ABOVE the Bubble section on purpose. Its press
	   rule and Bubble's press rule have identical specificity (0,4,1), so whichever comes
	   LAST wins the tie. Bubble must win — its press is a sunken gloss, not a flat tint.
	   Move this block below and Bubble silently stops sinking on click. */

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
		/* Motion (transition, transform-origin, hover pop, press squash) is NOT set here —
		   it's the universal button interaction at the bottom of this file, shared by both UI
		   styles. Bubble only adds its material: the pill radius and the gloss. */
	}
	/* Two-line settings segments stay softly rounded rather than full pill. */
	:global(html[data-ui='bubble'] .seg) {
		border-radius: 16px;
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
	/* Hover pop and press squash used to be duplicated here at 1.05 / 0.94. They now come from
	   the universal interaction block, so Bubble and Flat move identically and only differ in
	   material. */

</style>
