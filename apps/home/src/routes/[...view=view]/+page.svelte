<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { browser, dev } from '$app/environment';
	import { page } from '$app/state';
	import { pushState, replaceState } from '$app/navigation';
	import SplitFlap from '$lib/SplitFlap.svelte';
	import Masthead from '$lib/Masthead.svelte';
	import TrafficBoard from '$lib/TrafficBoard.svelte';
	import PresentationBuilder from '$lib/PresentationBuilder.svelte';
	import Weather from '$lib/Weather.svelte';
	import CitySearch from '$lib/CitySearch.svelte';
	import {
		CLOUD_SVG,
		BACK_CIRCLE_SVG,
		AIRPLANE_SVG,
		PRESENTATION_SVG,
		CAMERA_SVG,
		HOME_SVG,
		USER_SVG,
		BRIEFCASE_SVG,
		CODE_SVG,
		GRID_SVG,
		GEAR_SVG,
		EXTERNAL_SVG,
		CLOUD_SUN_SVG
	} from '$lib/icons';
	import faviconSite from '$lib/assets/favicon.svg';
	import faviconDev from '$lib/assets/favicon-dev.svg';
	import faviconAtfc from '$lib/assets/favicon-atfc.svg';
	import cloudFar from '$lib/assets/cloud-far.webp';
	import cloudNear from '$lib/assets/cloud-near.webp';
	import { wx, weatherKind, type WeatherKind } from '$lib/weather-state.svelte';
	import faviconPres from '$lib/assets/favicon-pres.svg';
	import faviconWeather from '$lib/assets/favicon-weather.svg';
	import { airports, accent, connections, portDescriptions, HUB } from '$lib/network';
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


	// Stops are named in full ("Work"), never coded ("WRK"). This used to be a Settings toggle; the
	// codes option is gone and full names are simply what the site does. The key is still listed in
	// the reset/clear sets so a stale saved choice gets wiped rather than lingering in storage.
	const NAMES_KEY = 'ksh-stop-names';
	const showStopNames = true;

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

	// The sky behind the panels. Three kinds, and they're alternatives to each other:
	//   • a TIME-OF-DAY gradient — Auto (follows the clock) or a phase pinned by hand. data-sky on
	//     <html> drives the tokens (see puhig's base.css), and dusk/night pin a dark colour-scheme.
	//   • PHOTO — Bing's wallpaper of the day, fetched through /api/wallpaper. It's a picture, not a
	//     palette: it can't say what time of day it is, so it leaves the colour scheme to the display
	//     mode and sets no data-sky.
	//   • OFF — the solid pure-white / pure-black background.
	const SKY_KEY = 'ksh-sky';
	type SkyPhase = 'dawn' | 'morning' | 'noon' | 'dusk' | 'night';
	type SkyMode = 'off' | 'auto' | 'photo' | SkyPhase;
	const SKY_PHASES: SkyPhase[] = ['dawn', 'morning', 'noon', 'dusk', 'night'];
	const SKY_MODES: SkyMode[] = ['off', 'auto', 'photo', ...SKY_PHASES];
	const skyOptions: { id: SkyMode; label: string }[] = [
		{ id: 'off', label: 'Off' },
		{ id: 'auto', label: 'Auto' },
		{ id: 'photo', label: 'Photo' },
		{ id: 'dawn', label: 'Dawn' },
		{ id: 'morning', label: 'Morning' },
		{ id: 'noon', label: 'Noon' },
		{ id: 'dusk', label: 'Dusk' },
		{ id: 'night', label: 'Night' }
	];
	// Auto by DEFAULT: a first-ever visitor gets the time-of-day sky, following the clock. 'off' is
	// the opt-OUT (a solid background). Four places have to agree on this — here, the pre-paint
	// script in app.html (so there's no flash before hydration), settingsAreDefault, and
	// resetSettings — which is why changing only one of them silently does nothing.
	// Seeded synchronously on the client, not in onMount: by the time onMount runs, the first client
	// render has already happened, and a Photo-mode visitor would have had the decor (in dark,
	// the star field) built underneath the picture for that frame. Reading the key here means the
	// very first render already knows. On the server there's no storage, so it's the plain default.
	const savedSky = (): SkyMode => {
		if (!browser) return 'auto';
		try {
			const v = localStorage.getItem(SKY_KEY) as SkyMode | null;
			return v && SKY_MODES.includes(v) ? v : 'auto';
		} catch {
			return 'auto';
		}
	};
	let skyMode = $state<SkyMode>(savedSky());
	let skyPhase = $state<SkyPhase>('morning'); // the phase actually painted (for the note)
	let skyTimer = 0;
	// Season-aware: fixed boundaries called 18:00 in July "dusk" when it's broad daylight.
	// Sunrise/sunset are approximated by a solstice-anchored cosine for mid-northern
	// latitudes (the app's home turf) — Jun 21 ≈ 4:40/20:50, Dec 21 ≈ 7:40/16:40, Des
	// Moines-ish — without asking anyone's location. MUST match the pre-paint script in
	// app.html, which stamps the same phase before hydration; if the two disagree the sky
	// flips a beat after load.
	function currentPhase(): SkyPhase {
		const d = new Date();
		const doy =
			(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) /
			86400000;
		const w = Math.cos(((doy - 172) / 365) * 2 * Math.PI); // 1 at the June solstice, -1 in December
		const sunrise = 6.1 - 1.55 * w;
		const sunset = 18.75 + 2.1 * w;
		const h = d.getHours() + d.getMinutes() / 60;
		if (h < sunrise - 1 || h >= sunset + 1.25) return 'night';
		if (h < sunrise + 1.5) return 'dawn';
		if (h < 11) return 'morning';
		if (h < sunset - 1.5) return 'noon';
		return 'dusk';
	}
	function applySky() {
		// data-sky-photo is what stops any server-rendered decor (the star field) painting under a
		// photo before hydration — see app.html. It's stamped pre-paint from storage, so it MUST be
		// cleared here when the sky changes to anything else: leaving it set hid the stars for the
		// rest of the session the moment anyone switched from Photo to a night sky.
		document.documentElement.toggleAttribute('data-sky-photo', skyMode === 'photo');
		// The measured veil belongs to a photograph. Any other sky takes the theme's own.
		if (skyMode !== 'photo') resetVeil();
		// Off and Photo both carry no phase: Off has nothing to paint, and a photograph can't tell the
		// tokens what time it is. Only the gradients set data-sky.
		if (skyMode === 'off' || skyMode === 'photo') {
			document.documentElement.removeAttribute('data-sky');
			if (skyMode === 'photo') loadPhoto();
			return;
		}
		skyPhase = skyMode === 'auto' ? currentPhase() : skyMode;
		document.documentElement.dataset.sky = skyPhase;
	}

	// Bing's wallpaper archive. The metadata comes through our own route (the upstream sends no CORS
	// header); the picture itself is loaded straight from Bing's CDN, which does. Fetched once per
	// visit, and only when Photo is actually chosen — an unused sky costs nothing.
	//
	// ONE PHOTO PER LOAD, drawn at random from the eight days the route returns: the sky is a
	// different picture each time you come back, and a stable one while you're reading. Deliberately
	// not a timer — cross-fading a full-viewport image every few minutes is exactly the kind of idle
	// repaint the rest of this page goes out of its way not to do.
	function setSkyMode(m: SkyMode) {
		skyMode = m;
		try {
			localStorage.setItem(SKY_KEY, m);
		} catch {
			/* storage unavailable — keep the in-memory choice */
		}
		applySky();
	}

	type Photo = {
		url: string;
		uhd: string;
		thumb: string;
		title: string;
		copyright: string;
		copyrightlink: string;
		date: string;
	};
	// The whole window is kept, not just the one being shown: the credit line doubles as a picker
	// (see the .photo-pick flyout), so the other seven have to be there to choose from.
	let photos = $state<Photo[]>([]);
	let photo = $state<Photo | null>(null);
	let photoPending = false;
	let photoOpen = $state(false); // is the picker flyout showing?
	// A hand-picked photo sticks; clearing the key goes back to a fresh one each visit. Stored by
	// date, which is the one field that survives Bing rotating its archive under us.
	const PHOTO_KEY = 'ksh-photo';

	async function loadPhoto() {
		if (photos.length || photoPending) return;
		photoPending = true;
		try {
			// `?v=3` is a cache-buster, and it earns its keep: v1 of this route answered with a single
			// `{ url, … }` and a one-hour max-age. When the body became `{ photos: [...] }`, every
			// browser still holding that cached v1 response read `photos` as undefined and painted NO
			// sky at all — silently, until the cache aged out. A new URL key sidesteps the stale copy;
			// the shape check below means a stale one couldn't blank the sky even if it were served.
			// (v3 adds `thumb`, so the picker isn't left with a cached v2 body that has none.)
			const r = await fetch('/api/wallpaper?v=3');
			if (!r.ok) return;
			const data = (await r.json()) as { photos?: Photo[] } & Partial<Photo>;
			const list = Array.isArray(data.photos) ? data.photos : data.url ? [data as Photo] : [];
			if (!list.length) return;
			photos = list;
			const saved = localStorage.getItem(PHOTO_KEY);
			const pick = list.find((p) => p.date === saved) ?? list[Math.floor(Math.random() * list.length)];
			await showPhoto(pick);
		} catch {
			/* offline / upstream down — the solid background stands in */
		} finally {
			photoPending = false;
		}
	}

	// Decode before painting, so a picture never flashes in half-drawn. A failure here just leaves
	// whatever sky is already up (or the solid background, on the first load).
	async function showPhoto(p: Photo) {
		const img = new Image();
		// Same-origin rules for READING pixels are stricter than for showing them: without this the
		// canvas below is tainted and getImageData throws. Bing's CDN sends `access-control-allow-
		// origin: *`, so asking for CORS costs nothing and buys the measurement.
		img.crossOrigin = 'anonymous';
		img.src = p.url;
		await img.decode().catch(() => {});
		photo = p;
		// The panel's blurred copy of the picture reads it from here (a CSS var, so no second
		// download — the browser has this exact URL in cache already).
		document.documentElement.style.setProperty('--photo-url', `url("${p.url}")`);
		measureVeil(img);
	}

	// How much glass the panel needs over THIS photograph.
	//
	// The panel is see-through by design, which is lovely over a gradient sky and a liability over a
	// picture: a photo is busy and unpredictable, so one fixed transparency is legible over one image
	// and unreadable over the next. So don't pick a number — measure the picture and solve for one.
	//
	// Two things make text hard to read through glass, and each sets a floor on the veil:
	//   • the backdrop's BRIGHTNESS fighting the ink (dark ink on a dark photo), and
	//   • the backdrop's BUSYNESS — texture behind letterforms, which no amount of "average
	//     brightness is fine" will fix.
	// Washing the page's own paper over the photo at alpha α pulls the mean toward the paper AND
	// flattens the variation by (1 − α). Solve both for α, take the larger, and clamp: never so thin
	// that the text is at risk, never so thick that the photograph is gone.
	const VEIL_MIN = 0.28;
	const VEIL_MAX = 0.9;
	function measureVeil(img: HTMLImageElement) {
		try {
			const c = document.createElement('canvas');
			c.width = 64;
			c.height = 36;
			const ctx = c.getContext('2d', { willReadFrequently: true });
			if (!ctx || !img.naturalWidth) return resetVeil();
			const lumOf = (w: number, h: number) => {
				c.width = w;
				c.height = h;
				ctx.drawImage(img, 0, 0, w, h);
				const { data } = ctx.getImageData(0, 0, w, h);
				const out: number[] = [];
				for (let i = 0; i < data.length; i += 4) {
					out.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
				}
				return out;
			};
			// The picture, sampled COARSELY (8×5). Downsampling is a blur, and the panel blurs what's
			// behind it — so these 40 cells stand in for the tones that actually survive behind a
			// letterform. Measuring the sharp image would have the panel pay for detail no reader sees.
			const coarse = lumOf(8, 5).sort((x, y) => x - y);
			c.width = 1;
			c.height = 1;

			// Solve for the CONTRAST the text needs, against the WORST tone it will land on — not the
			// average (a photo's mean says nothing about the dark corner the panel happens to cover)
			// and not "wash it toward the paper" (an earlier pass aimed for 86% of the way to white
			// and measured 13:1 where the bar is 4.5:1 — an opaque panel for no reason).
			//
			// The compositing is done in ENCODED sRGB, because that's what the browser does when it
			// lays a translucent fill over an image. Contrast, though, is defined on LINEAR luminance.
			// Conflating the two is not a rounding error: it predicted 6:1 for a panel that rendered
			// 2.3:1. So: solve in encoded space, convert to linear only to state the target.
			const toLinear = (e: number) =>
				e <= 0.04045 ? e / 12.92 : ((e + 0.055) / 1.055) ** 2.4;
			const toEncoded = (l: number) =>
				l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055;

			const at = (q: number) => coarse[Math.min(coarse.length - 1, Math.floor(q * coarse.length))];
			// Aim past the bar, not at it: the sample is 40 cells, the blur is approximate, and the panel
			// can sit anywhere over the picture. Measured across all eight photos, aiming at 5.5 left one
			// at 4.2:1 — just under. Aiming at 6.5 keeps every one of them clear of 4.5:1.
			const TARGET = 6.5;
			const inkL = toLinear(darkScheme ? 0.949 : 0.039); // --ink, light-dark(#0a0a0a, #f2f2ee)

			let alpha: number;
			if (darkScheme) {
				// Paper is black (encoded 0): the veil pulls the backdrop DOWN, away from light ink, so
				// the BRIGHTEST tone is the one that fights it.
				const worst = at(0.95);
				const needL = (inkL + 0.05) / TARGET - 0.05; // composite must be no brighter than this
				const needE = toEncoded(Math.max(needL, 0));
				alpha = 1 - needE / Math.max(worst, 0.001);
			} else {
				// Paper is white (encoded 1): the veil pulls the backdrop UP, away from dark ink, so the
				// DARKEST tone is the one that fights it.
				const worst = at(0.05);
				const needL = TARGET * (inkL + 0.05) - 0.05; // composite must be at least this bright
				const needE = toEncoded(Math.min(needL, 1));
				alpha = (needE - worst) / Math.max(1 - worst, 0.001);
			}
			document.documentElement.style.setProperty(
				'--panel-veil',
				Math.min(VEIL_MAX, Math.max(VEIL_MIN, alpha)).toFixed(3)
			);
		} catch {
			// Tainted canvas, or an image that never decoded: fall back to a veil thick enough to be
			// safe over anything, rather than leaving the text to chance.
			document.documentElement.style.setProperty('--panel-veil', '0.82');
		}
	}

	function resetVeil() {
		document.documentElement.style.removeProperty('--panel-veil');
	}

	// Picked from the flyout: paint it, and remember it. Picking the one already showing is how you
	// clear the choice — it hands the sky back to "a different one each visit".
	//
	// The flyout deliberately STAYS OPEN: choosing is how you browse these, and a picker that shut
	// on every pick would make comparing two photos a matter of reopening it each time. Escape or a
	// click anywhere off it closes it.
	async function choosePhoto(p: Photo) {
		const sticky = photo?.date !== p.date;
		try {
			if (sticky) localStorage.setItem(PHOTO_KEY, p.date);
			else localStorage.removeItem(PHOTO_KEY);
		} catch {
			/* storage unavailable — the choice still applies to this visit */
		}
		if (sticky) await showPhoto(p);
	}
	const photoPinned = $derived(
		typeof localStorage !== 'undefined' && !!photo && localStorage.getItem(PHOTO_KEY) === photo.date
	);

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

	// Button style: 'bubble' (the default) gives every panel button a glossy, gel-like,
	// pops-forward look borrowed from the presentation deck's controls; 'flat' opts out
	// to minimal chrome. data-ui="bubble" on the html element drives the global button
	// CSS (see the :global bubble block in the style section); app.html ships the
	// attribute on <html> itself and its pre-paint script strips it for a saved 'flat',
	// so there's no flash on load either way.
	const UI_KEY = 'ksh-ui';
	type UiStyle = 'flat' | 'bubble';
	const uiOptions: { id: UiStyle; label: string; sub: string }[] = [
		{ id: 'bubble', label: 'Bubble', sub: 'glossy & springy' },
		{ id: 'flat', label: 'Flat', sub: 'clean & minimal' }
	];
	let uiStyle = $state<UiStyle>('bubble');
	function setUiStyle(s: UiStyle) {
		uiStyle = s;
		if (typeof document !== 'undefined') {
			if (s === 'bubble') document.documentElement.dataset.ui = s;
			else document.documentElement.removeAttribute('data-ui');
		}
		try {
			if (s === 'flat') localStorage.setItem(UI_KEY, s);
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
	// Metro was retired as a choice — Lab is the site's look. The 'metro' branch of setLook and the
	// metro token set stay put, so re-listing it here is all it would take to bring it back.
	const lookOptions: { id: Look; label: string; sub: string }[] = [
		{ id: 'lab', label: 'Lab', sub: 'the new default' }
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
		theme === 'system' &&
			uiStyle === 'bubble' &&
			look === 'lab' &&
			skyMode === 'auto' &&
			starsOn
	);

	function resetSettings() {
		skyMode = 'auto';
		starsOn = true;
		setTheme('system'); // also strips data-theme and its key
		setUiStyle('bubble'); // also restores data-ui and drops the key
		setLook('lab'); // also strips data-look and its key
		applySky();
		// Forget the stored picks rather than saving the defaults over them, so a reset
		// leaves exactly the state a first-ever visitor has.
		try {
			for (const k of PREF_KEYS) localStorage.removeItem(k);
		} catch {
			/* storage unavailable — the in-memory reset above still stands */
		}
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
	// Which colour scheme is actually in use — the same decision base.css makes with `color-scheme`,
	// mirrored here so the DOM can follow it. An opted-into sky wins over the display mode (dusk and
	// night are the dark phases); otherwise it's the display mode, with 'system' asking the OS.
	let osDark = $state(false);
	const darkScheme = $derived(
		skyMode !== 'off' && skyMode !== 'photo'
			? skyPhase === 'dusk' || skyPhase === 'night'
			: theme === 'dark' || (theme === 'system' && osDark)
	);
	// A photograph IS the decoration — the star field (or the clouds) would just litter it, so under
	// the Photo sky none of it is built (same bargain as everywhere else: if it can't be seen, or
	// shouldn't be, it isn't rendered).
	//
	// Keyed on the MODE, not on the photo having arrived. It used to wait for the image, which meant
	// that for the second or two it took to fetch and decode, the page still built the star field
	// (and its 47 endless animations) only to throw it away the moment the picture landed. Choosing
	// Photo is the decision; nothing underneath it should ever be built.
	const photoSky = $derived(skyMode === 'photo');

	// Stars ride along with dark mode, not the sky: they show on a solid black background, a
	// manual/OS dark theme, and the dusk/night skies alike.
	//
	// See starsVisible, below — it needs the panel state to be declared first.
	// (The light scheme once had concentric rings radiating from the wordmark's "o" as its
	// counterpart; they were retired — first squeezed out of the skybox phases in favour of
	// the sky itself, then out of the solid background too.)

	// Live values the Settings notes interpolate into their `{}` placeholder.
	const displayValue = $derived(
		theme === 'system' ? 'Following your device setting' : `Always ${theme}`
	);
	const skyStatus = $derived(
		skyMode === 'off'
			? 'Off — a solid background: black in dark mode, white in light.'
			: skyMode === 'auto'
				? `Auto (the default) — following the clock, currently ${skyPhase}.`
				: skyMode === 'photo'
					? 'Photo — Bing’s wallpaper of the day. The display mode above still sets the palette.'
					: `Fixed to ${skyMode}.`
	);
	const uiStatus = $derived(
		uiStyle === 'bubble'
			? 'Bubble (the default) — glossy, airy buttons that pop forward across the site.'
			: 'Flat — minimal buttons, no gloss.'
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
			{ p: 'A collection of apps that I’ve built for personal use, shared with you.' },
			{ quote: 'There’s an app for that?' }
		],
		// About / intro — dotcom-2 About card K 201.
		ABT: [
			{ h: 'Andrew Nguyen' },
			{ p: 'I enjoy nature, literature, and video games — and heightened experiences.' },
			{ p: 'I’m based in the Midwestern United States, with occasional visits to Southeast Asia for friends and family.' },
			{ email: 'contact@kashinoga.com' }
		]
	};
	// The apps the Apps panel shows as CARDS in its body — so they must not also appear as chips in
	// its Related rail. Everywhere else the rail is unchanged, and the hub stays in it either way.
	const APP_CARDS = ['ATFC', 'PRES', 'WTHR'];
	const APP_ICONS: Record<string, string> = {
		ATFC: AIRPLANE_SVG,
		PRES: PRESENTATION_SVG,
		WTHR: CLOUD_SUN_SVG
	};
	// A mark per destination, worn by its chip in the Related rail. It replaced a plain accent dot:
	// the dot named the LINE a stop sits on and nothing about the stop itself. The mark says what the
	// place is — and keeps the line's colour, so the rail reads the same at a glance.
	const PORT_ICONS: Record<string, string> = {
		KSH: HOME_SVG,
		ABT: USER_SVG,
		WRK: BRIEFCASE_SVG,
		PRJ: CODE_SVG,
		APP: GRID_SVG,
		STG: GEAR_SVG,
		...APP_ICONS
	};
	// A panel's Related rail: the place above it and the places below it (see $lib/network). The
	// Apps panel is the exception — its apps are cards in the body, so they'd be listed twice.
	const relatedTo = (code: string) => {
		const all = connections(code);
		return code === 'APP' ? all.filter((c) => !APP_CARDS.includes(c)) : all;
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
		// Apply staged drafts onto the live pages.
		for (const [k, val] of Object.entries(drafts)) {
			const [code, iStr, f] = k.split('.');
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
			for (const k of Object.keys(settings)) {
				if (settings[k] !== defaultSettings[k]) overrides[settingsKey(k)] = settings[k];
			}
			if (Object.keys(overrides).length) localStorage.setItem(CONTENT_KEY, JSON.stringify(overrides));
			else localStorage.removeItem(CONTENT_KEY);
		} catch {
			/* storage unavailable — the clipboard copy is still the source of truth */
		}
		// Hand the full edited copy back: copy JSON to the clipboard (and log it).
		const json = JSON.stringify({ pages, settings }, null, 2);
		console.log('[Kashinoga] edited panel copy:\n' + json);
		try {
			await navigator.clipboard.writeText(json);
			showToast('Saved. Content copied — paste it to Claude to make it permanent.');
		} catch {
			showToast('Saved locally. Copy the JSON from the console to make it permanent.');
		}
	}
	// Apply any saved overrides from this browser onto the live pages.
	function applySavedContent() {
		try {
			const raw = localStorage.getItem(CONTENT_KEY);
			if (!raw) return;
			const ov = JSON.parse(raw) as Record<string, string>;
			if (!ov || typeof ov !== 'object') return;
			for (const [k, val] of Object.entries(ov)) {
				if (typeof val !== 'string') continue;
				const [code, iStr, f] = k.split('.');
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

	// Editable Settings-panel copy — the section descriptions. Same Edit-Mode
	// machinery, under a SETTINGS.<key> draft namespace.
	// Section descriptions and the flavor notes. Notes use a `{}` placeholder that
	// renders the live value (e.g. the current map style); editing keeps the token.
	const defaultSettings: Record<string, string> = {
		displayLead: 'Display Mode',
		displayNote: 'Inside of you, there are two wolves.',
		skyLead: 'Skybox Theme',
		skyNote: '',
		starsLead: 'Starry Night',
		starsNote: '',
		resetLead: 'Start Over',
		uiLead: 'Button Style',
		uiNote: '',
		lookLead: 'Base Theme',
		lookNote: '',
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

	// ─── The open panel ─────────────────────────────────────────────────────────
	// `data.view` is read once, on purpose: from here on the open panel is local state (clicks
	// mutate it directly, and the panel-slide animation defers the swap), and the URL is
	// reconciled against it rather than the other way round.
	// svelte-ignore state_referenced_locally
	let view = $state<View | null>(data.view); // eslint-disable-line svelte/no-reactive-reassign -- read ONCE, deliberately: see above
	// Navigating panel→panel slides the whole panel off before its content swaps.
	let panelLeaving = $state(false);
	// Expand the panel to fill the viewport (handy for the wide Traffic board). Remembered across
	// panels and reloads.
	const EXPAND_KEY = 'ksh-panel-expanded';
	let panelExpanded = $state(false);
	// Nothing decorative is BUILT unless it can be seen: the stars are dark-only, and
	// everything goes when a panel covers the whole viewport (expanded on desktop, or any
	// panel on mobile, where it's a full-screen sheet).
	const backdropHidden = $derived(!!view && (panelExpanded || isMobile));
	// … but the DECOR follows that cover on a DELAY, past the panel's own geometry
	// animation (width 260ms, slide 300ms). Tearing the stage down in the same frames
	// Safari is animating the panel's width made the expand stutter: the backdrop blur
	// had to re-sample a scene that was being dismantled while its own surface grew. So
	// the decor holds perfectly still while the panel moves and leaves only once the
	// cover has settled — instantly then, since it's behind the panel with nothing to
	// see. The reveal waits the same beat: the collapse animates over a bare sky, and
	// the decor fades back in after.
	// With a COMPACT panel open the decor stays — but CLIPPED to the uncovered stage.
	// Through the glass's 18px of frost a cloud was never legible anyway, and WebKit
	// re-filters the panel's whole backdrop every frame anything moves beneath it (the
	// measured ring-arc lesson in TrafficBoard, but continuous: a drifting cloud or a
	// falling drop under the glass kept Safari re-rasterising the blur forever). Clipped,
	// the panel stands over a static gradient and the blur rasterises ONCE. Applied the
	// moment the view opens, so even the panel's entrance slides over clean sky.
	// !panelLeaving: a panel→panel swap slides the sheet off for a beat, and a clip with
	// no panel over it read as a hole cut out of the sky — the clip lifts while the stage
	// is bare and glides back in with the arriving sheet (the transition rides the
	// clipped state, so the lift itself is instant, behind the departing panel).
	const decorClipped = $derived(!!view && !isMobile && !panelExpanded && !panelLeaving);
	let decorHidden = $state(false);
	let decorTimer = 0;
	$effect(() => {
		const covered = backdropHidden;
		clearTimeout(decorTimer);
		// Cover on DESKTOP is immediate: the expanded arrival holds back (the zoom's first
		// half is a hold — see zoomTransform) while the skybox visibly bows out first, on an
		// open stage. Mobile keeps the delay (the sheet slides over the decor; hiding early
		// would pop a void behind it). Reveal waits out the promotion's full round trip.
		decorTimer = window.setTimeout(() => (decorHidden = covered), covered ? (isMobile ? 380 : 0) : 720);
	});
	const starsVisible = $derived(starsOn && darkScheme && !decorHidden && !photoSky);
	// Clouds belong to the DAYLIT skybox — the gradient's own weather. They're baked bitmaps
	// drifting on transform alone (compositor-only; the softness was painted once, offline),
	// so the frame cost is a couple of cached layers — but the same bargain still applies:
	// not built when a panel covers the viewport, under a dark phase (dusk/night belong to
	// the stars), on a solid background, or over a photograph.
	const cloudsVisible = $derived(
		skyMode !== 'off' && skyMode !== 'photo' && !darkScheme && !decorHidden
	);

	// ── Weather dressing ── With the Weather panel open, the stage wears the ACTIVE CITY's
	// sky: rain falls, snow drifts, fog banks in, a storm flashes, an overcast day thickens
	// the clouds. Read straight from $lib/weather-state — the same reading the panel shows,
	// keyed by weatherKind so the stage and the panel's icon can't disagree. Same bargains
	// as every other decor: nothing while a panel covers the viewport, nothing over a
	// photograph, and none of it BUILT unless its condition is actually up.
	const wxReading = $derived(
		view?.code === 'WTHR' ? wx.readings[wx.places[wx.activeIdx]?.id] : undefined
	);
	// The stage's own weather dial (the homepage sky console): a hand-picked kind that
	// dresses the skybox with no panel open. A live reading still wins while Weather is
	// up — the dial is scene-setting, not a forecast.
	const STAGE_WX_KEY = 'ksh-stage-wx';
	// The console folds into ONE chip; the rows live in a popout above it. Closes on
	// Escape or any stage click (the stage's own click handler runs on empty sky).
	let skyConsoleOpen = $state(false);
	let stageWx = $state<WeatherKind | null>(null);
	function setStageWx(k: WeatherKind | null) {
		stageWx = k;
		try {
			if (k) localStorage.setItem(STAGE_WX_KEY, k);
			else localStorage.removeItem(STAGE_WX_KEY);
		} catch {
			/* storage unavailable — keep the in-memory choice */
		}
	}
	const wxKind = $derived(wxReading ? weatherKind(wxReading.conditions) : stageWx);
	const fxOn = $derived(!decorHidden && !photoSky);
	const fxRain = $derived(fxOn && (wxKind === 'rain' || wxKind === 'storm'));
	const fxSnow = $derived(fxOn && wxKind === 'snow');
	const fxFog = $derived(fxOn && wxKind === 'fog');
	const fxFlash = $derived(fxOn && wxKind === 'storm');
	// Cloudy (and every precipitating sky) thickens the drifting clouds — a class on the
	// layer that already exists, not a new one.
	const fxOvercast = $derived(
		fxOn && (wxKind === 'cloudy' || wxKind === 'rain' || wxKind === 'storm' || wxKind === 'snow')
	);

	// The particle fields, built LAZILY on first need (client-only, like the stars) and
	// kept after — closing the panel just unmounts the spans; reopening reuses the field.
	const makeRain = () =>
		Array.from({ length: 44 }, () => ({
			x: Math.random() * 100,
			len: 9 + Math.random() * 8,
			dur: 0.9 + Math.random() * 0.7,
			delay: -Math.random() * 2 // negative: the sky is already mid-rain on arrival
		}));
	let RAIN = $state<ReturnType<typeof makeRain>>([]);
	const makeSnow = () =>
		Array.from({ length: 36 }, () => ({
			x: Math.random() * 100,
			size: 3 + Math.random() * 3,
			dur: 7 + Math.random() * 6,
			drift: -14 + Math.random() * 28, // sideways vw across one fall — the flutter
			delay: -Math.random() * 13
		}));
	let SNOW = $state<ReturnType<typeof makeSnow>>([]);
	$effect(() => {
		if (fxRain && !RAIN.length) RAIN = makeRain();
	});
	$effect(() => {
		if (fxSnow && !SNOW.length) SNOW = makeSnow();
	});
	// Expanding is a PROMOTION, not a resize. Every attempt to animate the panel between
	// widths — width transitions, then a FLIP scaleX — stuttered in Safari, because WebKit
	// re-rasterises the backdrop blur whenever the blurred surface's on-screen geometry
	// changes (Firefox shrugged every time). So the geometry never changes on screen:
	// the compact sheet DEPARTS and the full-page version ARRIVES — the same
	// slide-off/slide-back choreography destination navigation uses (see navigate), with
	// the width snapping while the panel is off-stage. Slides are pure transforms on a
	// constant-size surface, the one move Safari demonstrably handles well here.
	let expandTimer = 0;
	function toggleExpand() {
		const flip = () => {
			panelExpanded = !panelExpanded;
			try {
				localStorage.setItem(EXPAND_KEY, panelExpanded ? '1' : '0');
			} catch {
				/* storage unavailable — keep the in-memory choice */
			}
		};
		if (reduce || isMobile) return flip(); // no choreography — just the new size
		clearTimeout(expandTimer);
		panelLeaving = true;
		expandTimer = window.setTimeout(() => {
			flip(); // resized while off-stage — the blur never sees it happen
			panelLeaving = false;
			holdContentForArrival(); // expanded: the surface lands empty, content follows
			requestAnimationFrame(playOpenBounce);
		}, PANEL_SLIDE);
	}
	// "The background appears from the back, then the elements start their entrances":
	// during an expanded arrival the panel's content is HELD (not mounted at all — the
	// empty surface is what zooms in), and when the surface lands it mounts fresh under a
	// bumped key, so every entrance animation plays from zero on a settled stage. Desktop
	// expanded only; compact panels keep their slide-with-content arrival.
	let contentHeld = $state(false);
	let arriveRev = $state(0);
	let arriveTimer = 0;
	function holdContentForArrival() {
		if (isMobile || !panelExpanded || reduce) return;
		clearTimeout(arriveTimer);
		contentHeld = true;
		arriveTimer = window.setTimeout(() => {
			contentHeld = false;
			arriveRev++;
		}, ZOOM_MS + 40);
	}
	// The panel element, for the slide transition.
	let panelEl = $state<HTMLElement | undefined>(undefined);

	// The last panel the visitor CLOSED — a port code, so the homepage can float a reopen
	// bubble at the right edge (where the panel went). Watched from `view` rather than set
	// inside home() so every close path counts: Back, the stage click, and the browser's
	// own history. In-memory on purpose — "give me back what I just closed" is a gesture
	// about this visit, not a bookmark, so it doesn't persist.
	let lastClosed = $state<string | null>(null);
	let prevOpenCode: string | null = null;
	$effect(() => {
		const code = view?.code ?? null;
		if (!code && prevOpenCode) lastClosed = prevOpenCode;
		prevOpenCode = code;
	});
	const reduce =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Panel OPEN: the fly slide plus a slight overgrow — as the panel lands it swells a
	// touch past its resting size and settles, on the same beat as the buttons' spring.
	// A scale, not a translate overshoot, deliberately: the panel is pinned to a viewport
	// edge (right on desktop, bottom on the phone sheet), and overshooting its POSITION
	// would peel that edge back and flash a sliver of sky behind it. Growing from the
	// anchored edge swells past on the far side only — full-bleed the whole way. Close
	// keeps the plain fly (a swell makes sense arriving, not departing).
	//
	// 4% is deliberately more than a button's landing would take: the panel's own content
	// is entering with its own animations at the same moment (title flip, chrome ripple),
	// and a subtler swell got lost against them.
	//
	// One transform for BOTH entrances — the mount (in:panelIn) and the panel→panel return
	// leg (playOpenBounce), so the two are one gesture.
	function openTransform(t: number, x: number, y: number) {
		const slide = 1 - cubicOut(t);
		// The swell rides only the landing tail (t 0.5→1), peaking mid-tail and closing
		// back to exactly 1 so there's no snap at the end.
		const u = Math.max(0, (t - 0.5) / 0.5);
		const grow = 1 + (reduce ? 0 : 0.04) * Math.sin(Math.PI * u);
		return `translate(${slide * x}px, ${slide * y}px) ${y ? `scaleY(${grow})` : `scaleX(${grow})`}`;
	}
	// The EXPANDED arrival comes from the BACK, not from the right: a full-page surface
	// sliding in reads as a sheet, but the promoted board is its own app — it surfaces
	// toward the viewer (scale from 96.5%, opacity riding along; both compositor
	// currency) and only then lets its elements make their entrances (see contentHeld).
	// The timeline HOLDS for its first half — the skybox's 420ms farewell owns the stage
	// (see decorHidden) — then the board simply FADES IN through the second. No scale, no
	// travel: the promoted app appears in place, opacity being the cheapest thing any
	// compositor can animate.
	const ZOOM_MS = 760;
	const zoomT = (t: number) => Math.max(0, (t - 0.5) / 0.5); // 0 through the hold, then 0→1
	const fadeInAt = (t: number) => Math.min(1, zoomT(t) / 0.75);
	function panelIn(
		node: HTMLElement,
		p: { x?: number; y?: number; duration?: number; zoom?: boolean }
	) {
		const { x = 0, y = 0, duration = 380 } = p;
		if (p.zoom)
			return {
				duration: p.duration ?? ZOOM_MS,
				css: (t: number) => `opacity: ${fadeInAt(t)};`
			};
		return {
			duration,
			css: (t: number) =>
				`transform-origin: ${y ? 'center bottom' : 'right center'}; transform: ${openTransform(t, x, y)};`
		};
	}
	// A panel→panel move never unmounts the panel (its content swaps off-screen), so
	// in:panelIn can't fire — the return leg replays the same landing by hand, over the
	// .leaving class's plain transition (WAAPI wins while it runs, and both settle at rest).
	function playOpenBounce() {
		if (!panelEl || reduce) return;
		if (!isMobile && panelExpanded) {
			// The promoted board fades in in place — the WAAPI twin of panelIn's zoom mode.
			const frames = Array.from({ length: 49 }, (_, i) => ({ opacity: String(fadeInAt(i / 48)) }));
			panelEl.animate(frames, { duration: ZOOM_MS, easing: 'linear' });
			return;
		}
		const x = isMobile ? 0 : panelExpanded ? vw : 680;
		const y = isMobile ? panelEl.clientHeight : 0;
		const frames = Array.from({ length: 25 }, (_, i) => {
			const t = i / 24;
			return {
				transform: openTransform(t, x, y),
				transformOrigin: y ? 'center bottom' : 'right center'
			};
		});
		panelEl.animate(frames, { duration: 380, easing: 'linear' });
	}

	const PANEL_SLIDE = 300;
	let navTimer = 0;
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
		else {
			pushState(path, state);
			ownPushes++;
		}
	}

	// How many history entries WE pushed this visit. It's what lets Back step back through the site
	// instead of always slamming shut: with one of ours behind us, Back is the browser's Back.
	// Without one — a deep link opened cold, a reload — there is nothing of ours to return to, so it
	// closes the panel and goes home. (A count, not `history.length`: that includes entries from
	// before the visitor ever reached this site, and stepping into those would leave it.)
	let ownPushes = $state(0);
	function goBack() {
		if (ownPushes > 0) history.back();
		else home();
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
	// The tab's mark follows the open panel: each app flies its own, and everything else wears the
	// site heart (orange while developing, so a dev tab is obvious at a glance).
	const favicon = $derived(
		view?.kind === 'port' && view.code === 'ATFC'
			? faviconAtfc
			: view?.kind === 'port' && view.code === 'PRES'
				? faviconPres
				: view?.kind === 'port' && view.code === 'WTHR'
					? faviconWeather
					: dev
						? faviconDev
						: faviconSite
	);
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
		// A fresh open starts the board on its defaults — the previous visit's `?field=` and
		// friends belong to the history entry we left, not to this new one. On a history-driven
		// open (`push` false) the reconciler has already set them.
		if (push) {
			field = null;
			range = null;
			refresh = null;
			syncUrl(nv, NO_PARAMS);
		}
		// Only the Air Traffic board and the Presentation Builder are designed to fill the viewport.
		// PRES forces the full layout on open (its compact form is a fallback); every other panel is
		// compact-only, so clear any lingering expand intent (e.g. from a previous ATFC visit) —
		// that keeps panelExpanded true to what's shown, so the panel renders AND slides out at the
		// right width. ATFC keeps whatever the user last toggled.
		if (nv.code === 'PRES') panelExpanded = true;
		else if (nv.code !== 'ATFC') panelExpanded = false;
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
				holdContentForArrival(); // no-op unless this arrival is expanded (PRES)
				// After the class flip lands in the DOM: replay the open landing (see
				// playOpenBounce — the panel never unmounted, so in:panelIn won't).
				requestAnimationFrame(playOpenBounce);
			}, PANEL_SLIDE);
		} else {
			const wasOpen = !!view;
			applyView(nv, push);
			// A fresh open that lands expanded (ATFC's remembered toggle, PRES always)
			// surfaces from the back — the in:panelIn zoom — with its content held.
			if (!wasOpen) holdContentForArrival();
		}
	}
	function board(code: string) {
		// Already showing this station: clicking it again (its nav item is the active one, or an
		// onward chip points back to it) shouldn't tear the panel down and rebuild it. No-op.
		if (view?.kind === 'port' && view.code === code) return;
		navigate({ kind: 'port', code });
	}
	function home(push = true) {
		clearTimeout(navTimer);
		panelLeaving = false;
		// Keep panelExpanded set so the panel slides out at its current width in one clean move
		// (it's reset on the next fresh open, not mid-close).
		view = null;
		if (push) {
			// The overview map has no board; leaving these set would linger in the head tags.
			field = null;
			range = null;
			refresh = null;
			syncUrl(null);
		}
		// Drop focus off whatever was selected, so its :focus-visible ring doesn't linger when the
		// panel closes via Escape or a click on the bare stage.
		if (typeof document !== 'undefined') {
			(document.activeElement as HTMLElement | null)?.blur?.();
		}
	}
	// Escape closes an open panel; on the overview map it opens Settings.
	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		e.preventDefault();
		// The picker is the innermost thing open, so Escape closes it first and nothing else.
		if (photoOpen) {
			photoOpen = false;
			return;
		}
		if (view) home();
		else board('STG');
	}


	// Shared by every in-app link (the masthead's nav, Related chips, the Apps cards).
	//
	// Left-click with no modifier is ours: cancel the navigation and open the panel in place.
	// Anything else — ⌘/ctrl (new tab), shift (new window), alt (download), middle-click — is the
	// browser's, so the link behaves like a link.
	function onNodeClick(e: MouseEvent, run: () => void) {
		if (e.defaultPrevented) return; // a pan just ended; onClickCapture killed it
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		e.preventDefault();
		run();
	}

	// Click the exposed background beside an unexpanded panel to dismiss it — the "click off
	// the panel" affordance the map's catch-rect used to give. Gated to a click that lands on
	// the stage itself (`target === currentTarget`), so the masthead, its nav, and the panel
	// are untouched; and to an open, unexpanded panel (expanded fills the viewport, leaving no
	// background to click). The Back button remains the keyboard-accessible way to close.
	function onStageClick(e: MouseEvent) {
		// Anywhere off the picker closes it. The credit and the flyout stop their own clicks getting
		// here (the picker's own buttons handle those), so this only fires on the bare sky.
		photoOpen = false;
		skyConsoleOpen = false; // the sky console makes the same bargain
		if (view && !panelExpanded && e.target === e.currentTarget) home();
	}
	// The open station's code (or null) — drives the masthead nav's active highlight. A plain
	// string so <Masthead> stays free of the View union.
	const activeCode = $derived(view?.code ?? null);

	let wasMobile = false;
	function onResize() {
		vw = window.innerWidth;
		vh = window.innerHeight;
		wasMobile = isMobile;
	}

	onMount(() => {
		vw = window.innerWidth;
		vh = window.innerHeight;
		wasMobile = isMobile;
		const th = localStorage.getItem(THEME_KEY);
		if (th === 'light' || th === 'dark') theme = th;
		if (localStorage.getItem(EXPAND_KEY) === '1') panelExpanded = true;
		const sky = localStorage.getItem(SKY_KEY);
		if (sky && SKY_MODES.includes(sky as SkyMode)) skyMode = sky as SkyMode; // else default 'auto'
		applySky();
		// Follow the OS scheme, and keep following it: with the display mode on 'system', this is
		// what decides whether the stars get built at all.
		const osq = matchMedia('(prefers-color-scheme: dark)');
		osDark = osq.matches;
		const onOsScheme = (e: MediaQueryListEvent) => (osDark = e.matches);
		osq.addEventListener('change', onOsScheme);
		cleanups.push(() => osq.removeEventListener('change', onOsScheme));
		STARS = makeStars(); // fresh random field per load (client-side)
		SHOOT = makeShooting(); // and a few shooting stars to cross it
		starsOn = localStorage.getItem(STARS_KEY) !== '0'; // default on
		const swx = localStorage.getItem(STAGE_WX_KEY);
		if (swx && ['storm', 'snow', 'rain', 'fog', 'cloudy'].includes(swx))
			stageWx = swx as WeatherKind;
		if (localStorage.getItem(UI_KEY) === 'flat') setUiStyle('flat'); // else default bubble
		if (localStorage.getItem(LOOK_KEY) === 'metro') setLook('metro'); // else default lab
		// While on Auto, keep the phase current if the tab is left open across a boundary.
		skyTimer = window.setInterval(() => skyMode === 'auto' && applySky(), 5 * 60 * 1000);
		if (dev) applySavedContent();
		// Arrived on a deep link (/apps/weather, /about/work, …): the panel already rendered on the
		// server, so re-apply it locally without pushing — this URL is already the current entry.
		if (view) applyView(view, false);
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
			// History moved without us — a Back or Forward. Keep the count of our own entries
			// honest, or Back would keep stepping past the site's own first page.
			if (ownPushes > 0) ownPushes--;
			if (nextView) navigate(nextView, false);
			else home(false);
		});
	});

	// Listeners registered in onMount that have to be torn down with the page.
	const cleanups: (() => void)[] = [];

	onDestroy(() => {
		clearTimeout(navTimer);
		clearTimeout(toastTimer);
		clearInterval(skyTimer);
		for (const off of cleanups) off();
	});

</script>

<svelte:window onkeydown={onKey} onresize={onResize} />

<!-- Titled per panel, so a shared /apps/air-traffic link reads as "Air Traffic —
     Kashinoga" in the tab and in the unfurled preview card rather than as a generic
     homepage. These track `view`/`field` (not `data.*`), so they update as you fly around
     the map and switch fields, without a navigation. -->
<svelte:head>
	<!-- The tab wears the open app's mark: the plane for the Traffic board, the presentation glyph
	     for the Builder (which is why neither shows one in its own header any more). Everywhere else
	     it's the site heart — orange in dev, so the dev tab is easy to spot. -->
	<link rel="icon" href={favicon} type="image/svg+xml" />
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
     line's station list, and the Traffic board's Related slot. `label` names the
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
							<span class="chip-ico" style:color={accent[c]}>{@html PORT_ICONS[c] ?? ''}</span>
							<span class="chip-title">{airports[c].title}</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="stage" class:photo={photoSky} class:clip-decor={decorClipped} onclick={onStageClick}>
	{#if photoSky && photo}
		<!-- Bing's photo of the day. Two layers, not one: the picture, and a veil over it. The panels
		     are opaque so they're fine, but the masthead and nav sit straight on the sky — over a
		     photograph their ink would be unreadable, and a scrim is the cheapest way to give them
		     back their contrast without touching a single token. The credit is not optional: these
		     photos are licensed to Microsoft, not to us. -->
		<div
			class="photo-bg"
			aria-hidden="true"
			style:background-image="url('{photo.url}')"
			transition:fade={{ duration: 500 }}
		></div>
		<div class="photo-veil" aria-hidden="true" transition:fade={{ duration: 500 }}></div>
		{#if !decorHidden}
			<!-- The credit doubles as the picker: the line names the photo that's up (and links out to
			     Bing's page for it, because the credit is not decoration — these are licensed to
			     Microsoft, not to us), and the button beside it opens the other seven. -->
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div
				class="photo-credit"
				transition:fade={{ duration: 500 }}
				onclick={(e) => e.stopPropagation()}
			>
				{#if photoOpen}
					<!-- The flyout, above the credit so it never covers it. Choosing the photo that's
					     already up un-pins it — that's how you get back to a fresh one each visit. -->
					<div class="photo-pick" transition:fly={{ y: 8, duration: 180 }}>
						<p class="photo-pick-head">
							{photoPinned ? 'Pinned — pick it again to unpin' : 'A different one each visit'}
						</p>
						<ul>
							{#each photos as p (p.date)}
								<li>
									<button
										type="button"
										class="photo-opt"
										class:on={photo?.date === p.date}
										aria-pressed={photo?.date === p.date}
										onclick={() => choosePhoto(p)}
									>
										<img src={p.thumb} alt="" loading="lazy" width="64" height="38" />
										<span class="photo-opt-copy">
											<span class="photo-opt-title">{p.title}</span>
											<span class="photo-opt-sub">{p.copyright}</span>
										</span>
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
				<div class="photo-credit-row">
					<button
						type="button"
						class="photo-toggle"
						aria-expanded={photoOpen}
						aria-label={photoOpen ? 'Close the photo picker' : 'Choose a photo'}
						onclick={() => (photoOpen = !photoOpen)}
					>
						{@html CAMERA_SVG}
					</button>
					<a class="photo-link" href={photo.copyrightlink} target="_blank" rel="noreferrer noopener">
						{photo.copyright}<span class="ext-ico">{@html EXTERNAL_SVG}</span>
					</a>
				</div>
			</div>
		{/if}
	{/if}
	<!-- Daylit-sky clouds: two baked, tileable strips drifting at different speeds (the near
	     one faster — parallax without a z-axis). All the softness lives in the bitmaps; the
	     only thing that ever changes per frame is each strip's transform, which the
	     compositor slides between two cached layers — no paint, no main-thread work, the
	     budget the stars' spans already live in. -->
	{#if cloudsVisible}
		<!-- The fade is for SKY changes. When the hide is panel-driven (decorHidden), it's
		     instant — and it happens AFTER the panel's own animation has settled (see
		     decorHidden): the panel already covers the stage, so there's nothing to see, and
		     Safari never has to blur a dissolving scene while animating the panel's width.
		     Same guard on every decor layer below. -->
		<div class="clouds" class:overcast={fxOvercast} aria-hidden="true" transition:fade={{ duration: decorHidden ? (isMobile ? 0 : 420) : 700 }}>
			<div class="cloud-layer cloud-far" style="background-image: url({cloudFar})"></div>
			<div class="cloud-layer cloud-near" style="background-image: url({cloudNear})"></div>
		</div>
	{/if}
	{#if starsVisible}
		<div class="stars" aria-hidden="true" transition:fade={{ duration: decorHidden ? (isMobile ? 0 : 420) : 700 }}>
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

	<!-- The sky console: the skybox's own dials, drawn only on the OPEN stage (no panel)
	     under a gradient sky. Top row picks the time of day (the same modes Settings
	     offers, minus Off/Photo — those belong to Settings); bottom row hand-picks the
	     stage's weather. Chips, like everything else here. -->
	{#if !view && skyMode !== 'off' && skyMode !== 'photo' && !decorHidden}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="sky-console"
			transition:fade={{ duration: 300 }}
			role="group"
			aria-label="Sky controls"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape') skyConsoleOpen = false;
			}}
		>
			{#if skyConsoleOpen}
				<div class="sky-pop" transition:fade={{ duration: 150 }}>
					<div class="sky-row" role="group" aria-label="Time of day">
				{#each [['auto', 'Auto'], ['dawn', 'Dawn'], ['morning', 'Morning'], ['noon', 'Noon'], ['dusk', 'Dusk'], ['night', 'Night']] as [id, label] (id)}
					<button
						type="button"
						class="chip sky-chip"
						class:on={skyMode === id}
						aria-pressed={skyMode === id}
						onclick={() => setSkyMode(id as SkyMode)}>{label}</button
					>
					{/each}
					</div>
					<div class="sky-row" role="group" aria-label="Stage weather">
				{#each [[null, 'Clear'], ['cloudy', 'Clouds'], ['rain', 'Rain'], ['snow', 'Snow'], ['fog', 'Fog'], ['storm', 'Storm']] as [id, label] (label)}
					<button
						type="button"
						class="chip sky-chip"
						class:on={stageWx === id}
						aria-pressed={stageWx === id}
						onclick={() => setStageWx(id as WeatherKind | null)}>{label}</button
					>
					{/each}
					</div>
				</div>
			{/if}
			<!-- The toggle wears reicon's cloud on the shared disc (.icon-btn), so the bubble
			     gloss and the universal spring come for free — the current phase/weather read
			     lives in the title instead of a label. -->
			<button
				type="button"
				class="icon-btn sky-toggle"
				aria-expanded={skyConsoleOpen}
				aria-label="Sky controls"
				title={`Sky · ${skyMode === 'auto' ? `auto (${skyPhase})` : skyMode}${stageWx ? ` · ${stageWx}` : ''}`}
				onclick={() => (skyConsoleOpen = !skyConsoleOpen)}
			>
				{@html CLOUD_SVG}
			</button>
		</div>
	{/if}

	<!-- The weather dressing: the ACTIVE CITY's sky while its panel is open (see wxKind).
	     Everything animates transform or opacity only — the same physics as the clouds and
	     the stars' twinkle. -->
	{#if fxRain}
		<div class="fx-rain" aria-hidden="true" transition:fade={{ duration: decorHidden ? (isMobile ? 0 : 420) : 500 }}>
			{#each RAIN as d}
				<span
					style="left:{d.x}%; height:{d.len}px; animation-duration:{d.dur}s; animation-delay:{d.delay}s"
				></span>
			{/each}
		</div>
	{/if}
	{#if fxSnow}
		<div class="fx-snow" aria-hidden="true" transition:fade={{ duration: decorHidden ? (isMobile ? 0 : 420) : 500 }}>
			{#each SNOW as f}
				<span
					style="left:{f.x}%; width:{f.size}px; height:{f.size}px; --drift:{f.drift}vw; animation-duration:{f.dur}s; animation-delay:{f.delay}s"
				></span>
			{/each}
		</div>
	{/if}
	{#if fxFog}
		<!-- The fog reuses the far cloud strip, stretched tall and slowed — the same baked
		     softness at bank scale, one layer rolling against the other. The veil beneath
		     flattens the contrast the way real fog does. -->
		<div class="fx-fog" aria-hidden="true" transition:fade={{ duration: decorHidden ? (isMobile ? 0 : 420) : 900 }}>
			<div class="fog-veil"></div>
			<div class="fog-band fog-a" style="background-image: url({cloudFar})"></div>
			<div class="fog-band fog-b" style="background-image: url({cloudFar})"></div>
		</div>
	{/if}
	{#if fxFlash}
		<div class="fx-flash" aria-hidden="true"></div>
	{/if}

	<!-- Persistent masthead (wordmark + tagline + station nav) — its own component so a
	     homepage-chrome tweak stays out of this catch-all page. It reports which destination
	     was clicked; the page keeps the modifier-aware click + camera handling. -->
	<Masthead {activeCode} covered={backdropHidden} onNavigate={(code, e) => onNodeClick(e, () => board(code))} />

	{#if view}
		{@const v = view}
		<aside
			bind:this={panelEl}
			class="surface"
			class:leaving={panelLeaving}
			class:expanded={panelExpanded}
			in:panelIn|global={isMobile
				? { y: 900, duration: 380 }
				: panelExpanded
					? { zoom: true }
					: { x: 680, duration: 380 }}
			out:fly|global={isMobile
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
			{#if !contentHeld}
			{#key v.code + ':' + editRev + ':' + arriveRev}
					{@const port = airports[v.code]}
					{@const blocks = pages[v.code] ?? stub(port.title)}
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
							onback={goBack}
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
								{@render onward('Related', relatedTo(v.code))}
							{/snippet}
						</TrafficBoard>
					{:else if v.code === 'PRES'}
						<!-- The Presentation Builder owns its whole panel interior (its own toolbar +
						     three-column editor), like the Traffic board. It's always full-viewport —
						     forced expanded on open (applyView), with no collapse toggle. -->
						<PresentationBuilder accent={accent[v.code]} title={port.title} onback={goBack} />
					{:else}
					<div class="surface-head">
						<div class="head-row">
							<button
								class="icon-btn back"
								onclick={goBack}
								aria-label={ownPushes > 0 ? 'Back' : 'Back to home'}
								title={ownPushes > 0 ? 'Back' : 'Home'}>{@html BACK_CIRCLE_SVG}</button
							>
							{#if v.code === 'WTHR'}
								<!-- Weather's search lives up here, on the Back row: it acts on the whole panel, so
								     it belongs with the panel's own controls. It's a disc that GROWS into a field —
								     see CitySearch — and it shares the app's cities with the body through
								     $lib/weather, since neither half can own state the other needs. -->
								<CitySearch />
							{/if}
						</div>
						<div class="title-row">
							<h2 class="dest" style:font-size={destSize(port.title)}><SplitFlap text={port.title} base={160} stagger={45} /></h2>
							{@render accentDot(accent[v.code])}
						</div>
					</div>
					<div class="surface-body" class:settings={v.code === 'STG'}>
						{#if v.code === 'WTHR'}
							<!-- Weather lives INSIDE the ordinary panel — it's a reading, not a workspace, so
							     it doesn't take over the viewport the way the board and the Builder do. -->
							<Weather />
						{:else if v.code === 'STG'}
							{@const editStg = dev && editMode}
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
									Reset to Defaults
								</button>
							</div>
							<!-- Not editable copy: it states what the button does, and it swaps on state. -->
							<p class="seg-note">
								{settingsAreDefault
									? 'No changes have been made.'
									: 'Revert all changes.'}
							</p>
							</div>
							{#if dev}
								<div class="stg-group">
								<p class="seg-lead">Other</p>
								<div class="dev-actions">
									<button
										type="button"
										class="edit-enter"
										onclick={enterEditMode}
										disabled={editMode}
									>
										{editMode ? 'Editing…' : 'Enter Edit Mode'}
									</button>
									<button type="button" class="edit-enter ghost" onclick={clearLocalStorage}>
										Clear Saved Settings
									</button>
								</div>
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

						<!-- Apps: the live apps themselves, promoted out of the Related rail and into the
						     body as cards — each its own icon, name and blurb. They're the panel's real
						     content; the rail below is for everything ELSE you can get to from here. -->
						{#if v.code === 'APP'}
							<ul class="app-cards">
								{#each APP_CARDS as c}
									<li>
										<a
											class="app-card"
											href={viewPath({ kind: 'port', code: c })}
											data-sveltekit-preload-data="off"
											style:--card-accent={accent[c]}
											onclick={(e) => onNodeClick(e, () => board(c))}
										>
											<span class="app-ico">{@html APP_ICONS[c]}</span>
											<span class="app-copy">
												<span class="app-name">{airports[c].title}</span>
												<span class="app-blurb">{portDescriptions[c]}</span>
											</span>
										</a>
									</li>
								{/each}
							</ul>
						{/if}

						{@render onward('Related', relatedTo(v.code))}
					</div>
					{/if}
			{/key}
			{/if}
			</div>
		</aside>
	{/if}

	<!-- The reopen bubble: while no panel is open and one was closed this visit, it floats
	     at the right edge — where the panel went — offering it back. Its entrance waits for
	     the panel's slide-out; leaving is immediate (the opening panel covers that edge). -->
	{#if !view && lastClosed}
		{@const last = lastClosed}
		<button
			type="button"
			class="icon-btn reopen"
			in:fly={isMobile ? { y: 24, duration: 250, delay: 400 } : { x: 24, duration: 250, delay: 400 }}
			out:fly={isMobile ? { y: 24, duration: 180 } : { x: 24, duration: 180 }}
			aria-label="Reopen {airports[last].title}"
			title="Reopen {airports[last].title}"
			onclick={() => board(last)}
		>{@html BACK_CIRCLE_SVG}</button>
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
		   clean white/black the stars sit on, independent of the theme's softer
		   page-field token, and so it matches the panel's own pure stock exactly. */
		background: var(--sky, light-dark(#ffffff, #000000));
	}
	/* Photo mode, before hydration: the server can't know what the visitor chose, so any decor in its
	   HTML would paint for a frame or two underneath the picture. The pre-paint script in app.html
	   stamps data-sky-photo, so it never gets a frame at all. (The server — whose default sky is
	   auto — currently emits no stars anyway, but this stays as the belt for the gap should that
	   ever change.) Once hydrated the page doesn't build them in the first place. */
	:global(html[data-sky-photo]) .stars {
		display: none;
	}

	/* ── Photo sky ────────────────────────────────────────────────────────────────────────────── */
	/* Bing's wallpaper of the day, as an alternative to the time-of-day gradients. The picture is a
	   plain background-image on its own layer (the browser can then decode and cache it like any
	   other image), with a veil above it. */
	.photo-bg {
		position: absolute;
		inset: 0;
		background-position: center;
		background-size: cover;
		background-repeat: no-repeat;
		pointer-events: none;
	}
	/* The veil is what keeps the masthead readable. The wordmark, tagline and nav are painted in
	   --ink straight onto the sky; over a photograph they'd be illegible against half the frames.
	   Washing the photo toward the page's own stock — white in light, black in dark — restores the
	   contrast the tokens assume, and costs one flat fill rather than a per-element treatment. */
	/* Aimed, not flat: a flat 62% wash made every photo look like fog. Strong where the text actually
	   is (a band down the top, a thinner one along the bottom for the credit), and barely there
	   across the middle, where the photo is just a photo. */
	.photo-veil {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(
				180deg,
				light-dark(rgba(255, 255, 255, 0.72), rgba(0, 0, 0, 0.74)) 0,
				light-dark(rgba(255, 255, 255, 0.4), rgba(0, 0, 0, 0.46)) 190px,
				transparent 420px
			),
			linear-gradient(
				0deg,
				light-dark(rgba(255, 255, 255, 0.72), rgba(0, 0, 0, 0.72)) 0,
				light-dark(rgba(255, 255, 255, 0.34), rgba(0, 0, 0, 0.36)) 90px,
				transparent 190px
			),
			light-dark(rgba(255, 255, 255, 0.04), rgba(0, 0, 0, 0.12));
		pointer-events: none;
	}
	/* The credit. Bing licenses these photos from Getty/Shutterstock for its own homepage — they are
	   not ours — so the line ships with the picture and links back to Bing's page for it. Bottom
	   left, out of the way of the panel; hidden whenever a panel covers the sky anyway. */
	.photo-credit {
		position: absolute;
		left: clamp(1rem, 4vw, 2rem);
		bottom: clamp(0.75rem, 3vh, 1.25rem);
		z-index: 3;
		max-width: min(46ch, 60vw);
		font-size: 0.72rem;
		line-height: 1.35;
	}
	.photo-credit-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.photo-link {
		color: color-mix(in srgb, var(--ink) 88%, transparent);
		text-decoration: none;
	}
	.photo-link:hover {
		color: var(--ink);
		text-decoration: underline;
	}
	/* The outbound mark: it rides at the end of the link's last word, so it can't be orphaned onto a
	   line of its own. Sized off the text, not in px, so it tracks whatever the link is set in. */
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
	/* The disclosure: a camera, because what it opens is a choice of photographs. Built to match the
	   Traffic board's controls, which are reicon's *-circle glyphs — a solid disc with the shape
	   knocked out of it. reicon has no camera in that family (gallery-circle is the inverse: a ring
	   around a solid picture), so the disc is composed here instead — an ink fill with the filled
	   camera punched through it in the page's own stock. Same result, same rules: no ring, no
	   shadow, the disc IS the button. Same 32px as every panel control — it reads as one of them. */
	.photo-toggle {
		flex: none;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--ink) 62%, transparent);
		color: var(--paper);
		cursor: pointer;
	}
	/* Hover pop, press squash and the flat press-flood all come from the app's universal button
	   rules — the disc is listed with .icon-btn there, so it springs exactly like a panel control
	   rather than inventing its own feel. All that's left here is the colour it goes to. */
	.photo-toggle:hover,
	.photo-toggle[aria-expanded='true'] {
		background: var(--ink);
	}
	.photo-toggle:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.photo-toggle :global(svg) {
		width: 1.15rem;
		height: 1.15rem;
		display: block;
	}
	/* The flyout. Opaque, like the panels — it sits on a photograph, so it can't be a tint. */
	.photo-pick {
		margin-bottom: 0.5rem;
		width: min(22rem, 80vw);
		/* Tall enough to show every photo at once whenever the window allows — the cap is what's
		   actually left above the credit, not an arbitrary 24rem, so nothing scrolls unless the
		   viewport genuinely can't fit the set. */
		max-height: calc(100vh - 7rem);
		overflow-y: auto;
		padding: 0.5rem;
		background: var(--panel-fill-solid);
		border: 1px solid var(--line);
		border-radius: 12px;
	}
	.photo-pick-head {
		margin: 0.15rem 0 0.4rem;
		padding: 0 0.35rem;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.photo-pick ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.15rem;
	}
	.photo-opt {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.35rem;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		font: inherit;
		text-align: left;
		color: var(--ink);
		cursor: pointer;
	}
	.photo-opt:hover {
		background: color-mix(in srgb, var(--ink) 6%, transparent);
	}
	/* The one that's up. Its border is the affordance — pressing it again unpins. */
	.photo-opt.on {
		border-color: var(--line-strong);
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	.photo-opt img {
		flex: none;
		width: 64px;
		height: 38px;
		object-fit: cover;
		border-radius: 4px;
	}
	.photo-opt-copy {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.photo-opt-title {
		font-weight: 700;
		font-size: 0.78rem;
	}
	/* Two lines at most: some of Bing's credit lines are very long. */
	.photo-opt-sub {
		font-size: 0.68rem;
		color: var(--sub);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	@media (max-width: 720px) {
		/* On a phone the sky is a sliver above the sheet — don't spend it on a credit line. */
		.photo-credit {
			display: none;
		}
	}

	/* A compact panel over the stage: every decor layer stops at the panel's left edge
	   (see decorClipped). clip-path, NOT a narrowed right edge — the cloud strips size
	   their tiles off their container's width, so shrinking the box inward-squeezed the
	   clouds; a clip leaves layout alone and just stops the paint. The 640px must stay
	   in step with .surface's width. */
	.stage.clip-decor .clouds,
	.stage.clip-decor .stars,
	.stage.clip-decor .fx-rain,
	.stage.clip-decor .fx-snow,
	.stage.clip-decor .fx-fog,
	.stage.clip-decor .fx-flash {
		clip-path: inset(0 min(94vw, 640px) 0 0);
	}
	/* The clip edge GLIDES IN, in step with the panel's opening slide (same 380ms, same
	   curve) — snapping it in read as the sky being cut with scissors. On CLOSE it's the
	   old instant un-clip: the transition lives on the CLIPPED state only, so dropping
	   the class falls back to the base rule below — no transition — and the returning
	   decor pops behind the departing panel, which covers it (that already felt right).
	   The resting inset(0) is load-bearing: a transition needs a same-type start value. */
	@media (prefers-reduced-motion: no-preference) {
		.stage.clip-decor .clouds,
		.stage.clip-decor .stars,
		.stage.clip-decor .fx-rain,
		.stage.clip-decor .fx-snow,
		.stage.clip-decor .fx-fog,
		.stage.clip-decor .fx-flash {
			transition: clip-path 380ms cubic-bezier(0.6, 0, 0.3, 1);
		}
	}
	.clouds,
	.stars,
	.fx-rain,
	.fx-snow,
	.fx-fog,
	.fx-flash {
		clip-path: inset(0 0 0 0);
	}
	/* ── Daylit clouds ── Two baked, tileable strips over the sky gradient. Each strip is
	   200% wide with the tile sized to exactly HALF of it (background-size: 50% 100%), so
	   the drift's translate3d(-50%) lands precisely one tile later and the loop is
	   seamless. transform is the ONLY thing that ever animates: the softness was painted
	   once, offline, into the bitmaps — the compositor just slides two cached layers, no
	   paint, no main thread (the budget the stars' spans live in). will-change pins the
	   layers up front, same flash-avoidance as the bubble depth rule. */
	.clouds {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.cloud-layer {
		position: absolute;
		left: 0;
		width: 200%;
		background-repeat: repeat-x;
		background-size: 50% 100%;
		will-change: transform;
	}
	.cloud-far {
		top: 2vh;
		height: clamp(120px, 20vh, 220px);
		opacity: 0.55;
	}
	.cloud-near {
		top: 11vh;
		height: clamp(160px, 26vh, 300px);
		opacity: 0.68;
	}
	/* The drift — the near layer faster than the far one: parallax without a z-axis. Gated
	   like every other motion here; without it the clouds simply hang, which is also weather. */
	@media (prefers-reduced-motion: no-preference) {
		.cloud-far {
			animation: cloud-drift 480s linear infinite;
		}
		.cloud-near {
			animation: cloud-drift 280s linear infinite;
		}
	}
	@keyframes cloud-drift {
		to {
			transform: translate3d(-50%, 0, 0);
		}
	}
	/* Phase sets the mood: dawn wears its clouds thin (the gradient is the show), noon a
	   touch lighter than morning's full value. */
	:global(html[data-sky='dawn']) .clouds {
		opacity: 0.6;
	}
	:global(html[data-sky='noon']) .clouds {
		opacity: 0.85;
	}
	/* An overcast reading thickens whatever sky is up — full-strength clouds, any phase.
	   (0,2,0 with the class beats the phase rules' 0,2,0 by order: this sits after.) */
	:global(html[data-sky]) .clouds.overcast,
	.clouds.overcast {
		opacity: 1;
	}

	/* ── The sky console ── bottom-left (the photo credit's perch — the two never share
	   a sky). Two rows of small chips; the active one wears full ink. */
	.sky-console {
		position: absolute;
		left: clamp(1rem, 4vw, 2rem);
		bottom: clamp(0.75rem, 3vh, 1.25rem);
		z-index: 3;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	/* The popout: the two rows on a solid card above the toggle (it overlays sky, so it
	   gets the opaque panel stock, like the city search's results). */
	.sky-pop {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.5rem;
		background: var(--panel-fill-solid);
		border: 1px solid var(--line);
		border-radius: 12px;
	}
	.sky-row {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.sky-toggle {
		align-self: flex-start;
	}
	.sky-toggle :global(svg) {
		width: 1.05rem;
		height: 1.05rem;
	}
	.sky-chip {
		padding: 0.22rem 0.6rem;
		font-size: 0.78rem;
	}
	.sky-chip.on {
		color: var(--paper);
		background: color-mix(in srgb, var(--ink) 88%, transparent);
		border-color: transparent;
	}
	/* On phones the console would sit under the thumb and over the reopen bubble — the
	   Settings panel already owns these controls there. */
	@media (max-width: 720px) {
		.sky-console {
			display: none;
		}
	}

	/* ── Weather dressing ── the ACTIVE CITY's sky, worn by the stage while its panel is
	   open. Same physics as the clouds and the stars' twinkle: every animation is
	   transform or opacity on small fixed elements — no paint after first composite. */
	.fx-rain,
	.fx-snow,
	.fx-fog,
	.fx-flash {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.fx-rain span {
		position: absolute;
		top: -24px;
		width: 1.5px;
		border-radius: 1px;
		/* Blue-gray on the daylit sky, pale on the dark phases — same light-dark() trick
		   as the stars, so no JS scheme check. */
		background: light-dark(rgba(60, 82, 110, 0.38), rgba(200, 220, 245, 0.42));
		animation: fx-fall linear infinite;
		will-change: transform;
	}
	@keyframes fx-fall {
		to {
			transform: translate3d(0, 108vh, 0);
		}
	}
	.fx-snow span {
		position: absolute;
		top: -10px;
		border-radius: 50%;
		background: light-dark(rgba(178, 196, 220, 0.9), rgba(235, 242, 255, 0.85));
		animation: fx-snow-fall linear infinite;
		will-change: transform;
	}
	@keyframes fx-snow-fall {
		to {
			transform: translate3d(var(--drift), 108vh, 0);
		}
	}
	/* Fog: the far cloud strip at bank scale — same drift keyframes as the clouds, one
	   band rolling against the other; the veil flattens contrast the way real fog does. */
	.fog-veil {
		position: absolute;
		inset: 0;
		background: light-dark(rgba(233, 238, 245, 0.55), rgba(24, 30, 42, 0.5));
	}
	.fog-band {
		position: absolute;
		left: 0;
		width: 200%;
		background-repeat: repeat-x;
		background-size: 50% 100%;
		opacity: 0.75;
		will-change: transform;
	}
	.fog-a {
		top: -5vh;
		height: 60vh;
	}
	.fog-b {
		top: 35vh;
		height: 65vh;
		opacity: 0.6;
	}
	/* Lightning: one full-stage white layer, dark the vast majority of a long cycle with a
	   double blink near the middle — opacity only, and rare. */
	.fx-flash {
		background: #fff;
		opacity: 0;
	}
	@media (prefers-reduced-motion: no-preference) {
		.fog-a {
			animation: cloud-drift 340s linear infinite;
		}
		.fog-b {
			animation: cloud-drift 220s linear infinite reverse;
		}
		.fx-flash {
			animation: fx-flash 9s linear infinite;
		}
	}
	@keyframes fx-flash {
		0%,
		55.9%,
		57.3%,
		58.6%,
		100% {
			opacity: 0;
		}
		56.3% {
			opacity: 0.5;
		}
		56.8% {
			opacity: 0.08;
		}
		57.9% {
			opacity: 0.35;
		}
	}
	/* Reduced motion: precipitation frozen mid-air reads as broken glass, so it's simply
	   not shown; the fog just sits, which is also weather. */
	@media (prefers-reduced-motion: reduce) {
		.fx-rain span,
		.fx-snow span {
			display: none;
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
		/* Glass: the sky reads through the panel, and the panel is told apart by its edge. How much
		   glass is not fixed — over a photograph the page measures the picture and firms this up
		   until the text is safely legible. See --panel-veil / measureVeil. */
		background: var(--panel-glass);
	}
	/* Bubble keeps its own material: frosted acrylic — a sheen over a translucent tint, with a real
	   backdrop blur. Flat's glass is a flat wash with no live filter; Bubble's is glass you can tell
	   is glass. (This rule went missing for a moment when the glass landed, and Bubble quietly lost
	   its blur — the `glass` suite caught it.) */
	:global(html[data-ui='bubble']) .surface-backdrop {
		background: var(--panel-sheen), var(--panel-fill);
		-webkit-backdrop-filter: var(--panel-blur);
		backdrop-filter: var(--panel-blur);
	}

	/* Under the panel, over a PHOTO: the same picture, softened, with the veil laid over it.
	   Two things make text hard to read through glass — the backdrop's brightness and its BUSYNESS.
	   The veil can only fix the first; texture behind letterforms needs the second fixed too, and
	   washing that out means washing the photograph out (measured, it wanted 0.8 — glass in name
	   only). So the busyness is removed at the source: a copy of the photo, blurred, under the panel.
	   `background-attachment: fixed` is what keeps it honest — the copy is framed to the VIEWPORT,
	   not the panel, so it lines up with the sky either side and the panel reads as a pane you're
	   looking through rather than a picture of its own.

	   Two pseudo-elements, in this order, and it matters: the photo on ::before, the veil on ::after.
	   The obvious shape — photo on ::before with z-index:-1, veil as the element's own background —
	   is WRONG, and silently so. .surface-backdrop is a stacking context, and inside one the
	   element's background paints before its negative-z children, so the photo landed on TOP of the
	   veil. It looked plausible and measured 1.7:1. */
	:global(html[data-sky-photo]) .surface-backdrop {
		background: none;
	}
	:global(html[data-sky-photo]) .surface-backdrop::before,
	:global(html[data-sky-photo]) .surface-backdrop::after {
		content: '';
		position: absolute;
		inset: 0;
	}
	:global(html[data-sky-photo]) .surface-backdrop::before {
		background-image: var(--photo-url);
		background-attachment: fixed;
		background-position: center;
		background-size: cover;
		/* No backdrop-filter: that re-filters live on every repaint. This is one static layer. */
		filter: blur(22px) saturate(1.05);
		/* The blur samples from beyond the panel's box; scaling up hides the soft, empty rim it would
		   otherwise leave along the edge. */
		transform: scale(1.06);
	}
	:global(html[data-sky-photo]) .surface-backdrop::after {
		background: var(--panel-glass);
	}
	/* Fills the frame and holds all panel content above the frosted pane. Panels scroll
	   their own body under a stay-put header (.surface-body here; the Traffic board's
	   .tfc-body) — a glass header has no opaque paint, so it can't sit sticky OVER the rows;
	   the body clips them instead. Only the Presentation Builder still scrolls this box,
	   under its own sticky toolbar. */
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
	/* Expanded, the panel IS the app, with its own painted background. Full-viewport,
	   nothing meaningful shows through (the decor behind it is unmounted), so the glass
	   was paying WebKit's dearest price — re-filtering a full-screen backdrop on every
	   frame of the entrance slide — to blur a smooth gradient into itself. Paint the same
	   picture instead: the sky under the panel's own fill and sheen, no filter. A blurred
	   smooth gradient IS that gradient, so the look holds, and the entrance becomes a
	   translating opaque layer — the one move Safari never stumbles on. (Photo mode made
	   this same trade long ago — it paints the picture into the backdrop — so it keeps its
	   own arrangement and is excluded here. Flat mode is already blur-free.) */
	:global(html[data-ui='bubble']:not([data-sky-photo])) .surface.expanded .surface-backdrop {
		/* --panel-fill is a COLOUR, and a colour is only legal in a shorthand's LAST layer —
		   raw in the middle it invalidates the whole declaration (silently: the blur lines
		   below still applied, leaving a see-through pane). The gradient wrapper makes it a
		   layer image. */
		background:
			var(--panel-sheen),
			linear-gradient(var(--panel-fill), var(--panel-fill)),
			var(--sky, light-dark(#ffffff, #000000));
		-webkit-backdrop-filter: none;
		backdrop-filter: none;
	}
	/* Navigation between destinations slides the whole panel off (and back) while its
	   content is swapped off-screen. Open/close is handled by the fly transition,
	   which drives transform via WAAPI and so won't fight this. */
	.surface.leaving {
		transform: translateX(680px);
	}
	@media (prefers-reduced-motion: no-preference) {
		.surface {
			/* transform only — width is never animated: expanding SWAPS the size while the
			   panel is off-stage (see toggleExpand), because any on-screen geometry change
			   of the blurred surface makes WebKit re-rasterise the blur per frame. */
			transition: transform 300ms cubic-bezier(0.6, 0, 0.3, 1);
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
		/* Transparent, NOT the glass token: the panel's own backdrop already lays the glass over the
		   whole surface, and painting a second veil here stacked two of them — the header came out
		   visibly darker than the body it belongs to. (The Traffic board's and the Builder's headers
		   DO keep their own: they're sticky, with rows scrolling under them, so they need to stop
		   what passes beneath from reading through.) */
		background: none;
		/* No rule under the title. The header and the body are the same stock — both are the panel's
		   pure white/black — so the border drew a line between two things that are one thing, and at
		   wordmark scale it read as an underline.
		   The bottom padding TIGHTENS with it. The old value was sized to hold the title's descenders
		   clear of that rule; with no rule to clear, the same gap just left the body adrift from the
		   title it belongs to. */
		padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1.5rem, 4vw, 2.75rem) clamp(0.85rem, 1.5vw, 1.25rem);
	}
	/* The header's control row: Back at the left, a panel's own action (Weather's search) at the
	   right. It replaces the bare Back button, so the gap below it is the one Back used to set. */
	.head-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
	}
	.head-row .back {
		margin-bottom: 0;
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
		border-color: var(--line-strong);
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
		border: 1.5px solid var(--line-edge);
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
		border-color: var(--line-strong);
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
		border: 1.5px solid var(--line-edge);
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
	/* The note is a caption for the control above it, not another line of the stack — give it more
	   air than the group's uniform 1.05rem so it doesn't crowd the buttons it describes. Needs the
	   child combinator to out-specify `.stg-group > * + *`. */
	.stg-group > .seg-note {
		margin-top: 1.6rem;
	}
	/* Several notes are deliberately blank now. An empty <p> still takes its margin and would push
	   the next group down for nothing, so collapse it — but not while editing: Edit Mode has to keep
	   an empty note clickable, or its copy could never be written back. */
	.seg-note:empty:not(.editable) {
		display: none;
	}
	.seg-lead {
		margin-top: 1.4rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--line);
	}
	/* …but not on the first group: the header's own bottom border already draws that line, and a
	   second one right beneath it reads as a double rule. */
	.stg-group:first-child .seg-lead {
		margin-top: 0;
		padding-top: 0;
		border-top: none;
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
		border: 1.5px solid var(--line-edge);
		border-radius: 999px;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
	}
	.sky-opt:hover {
		border-color: var(--line-strong);
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
	/* ── Apps cards ───────────────────────────────────────────────────────────────────────────── */
	/* The Apps panel's real content: one card per live app, each carrying its own mark. Flat, like
	   the panels themselves — an edge and the station's accent, no shadow. */
	.app-cards {
		list-style: none;
		margin: 1.75rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}
	.app-card {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		padding: 1rem 1.1rem;
		border: 1px solid var(--line-edge);
		border-radius: 14px;
		color: var(--ink);
		text-decoration: none;
		/* The chips' exact fill (not 3%): the cards wear the same material as every other
		   control — an ink mix, so it flips with the scheme on its own. */
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		transition: border-color 0.15s ease, background 0.15s ease;
		/* The cards ride the universal button spring, but at card size the standard 5%
		   pop is a 30px lurch — soften both amounts; the spring itself is shared. */
		--btn-hover-scale: 1.015;
		--btn-press-scale: 0.99;
	}
	.app-card:hover,
	.app-card:focus-visible {
		border-color: var(--card-accent);
		background: color-mix(in srgb, var(--card-accent) 8%, transparent);
	}
	/* The mark sits in the station's own accent — the same colour its dot carries everywhere else. */
	.app-ico {
		flex: none;
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 12px;
		color: var(--card-accent);
		background: color-mix(in srgb, var(--card-accent) 12%, transparent);
	}
	.app-ico :global(svg) {
		width: 1.4rem;
		height: 1.4rem;
		display: block;
	}
	.app-copy {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.app-name {
		font-weight: 700;
	}
	.app-blurb {
		font-size: 0.9rem;
		color: var(--sub);
	}
	/* ── The reopen bubble ──────────────────────────────────────────────────────────────
	   Floats at the stage's right edge while no panel is open: the last panel you closed,
	   one click away, wearing the shared disc (.icon-btn) so the bubble gloss and the
	   universal spring come for free — only its perch is set here. Positioned with a calc
	   top rather than a translate, because the hover pop owns `transform`.
	   Doubled selector: Bubble's disc-gloss rule pins `position: relative` on every
	   .icon-btn at (0,2,1), which silently beat a lone scoped .reopen and left the bubble
	   sitting in-flow at the stage's left edge. */
	.icon-btn.reopen {
		position: fixed;
		right: clamp(0.75rem, 2vw, 1.5rem);
		top: calc(50% - 16px);
		z-index: 40;
	}
	/* On the phone the panel is a bottom sheet, so its bubble waits where the sheet comes
	   from: bottom-centre, with the arrow turned to point up. */
	@media (max-width: 720px) {
		.icon-btn.reopen {
			top: auto;
			right: auto;
			left: calc(50% - 16px);
			bottom: clamp(0.9rem, 4vw, 1.5rem);
		}
		/* reicon has no arrow-up-circle; the back disc turned a quarter IS one (the disc
		   is symmetric). Rotated on the svg, not the button — the hover pop owns the
		   button's transform. */
		.icon-btn.reopen :global(svg) {
			transform: rotate(90deg);
		}
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
		border: 1px solid var(--line-edge);
		border-radius: 999px;
		cursor: pointer;
		text-decoration: none;
	}
	.chip:hover {
		background: var(--line);
	}
	/* The station's mark, in its line's colour — see PORT_ICONS. Sized to the dot it replaced, so
	   the chips keep their rhythm. */
	.chip-ico {
		display: grid;
		place-items: center;
		flex: none;
		width: 1rem;
		height: 1rem;
	}
	.chip-ico :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
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
	:global(html:root .photo-toggle),
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
	:global(html:root .swatch-btn),
	:global(html:root .app-card) {
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
	:global(html:root .photo-toggle:active:not(:disabled)),
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
	:global(html:root .swatch-btn:active:not(:disabled)),
	:global(html:root .app-card:active:not(:disabled)) {
		box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.07);
	}

	@media (prefers-reduced-motion: no-preference) {
		:global(html:root .seg:hover:not(:disabled)),
		:global(html:root .sky-opt:hover:not(:disabled)),
		:global(html:root .photo-toggle:hover:not(:disabled)),
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
		:global(html:root .swatch-btn:hover:not(:disabled)),
		:global(html:root .app-card:hover:not(:disabled)) {
			transform: scale(var(--btn-hover-scale));
		}
		:global(html:root .seg:active:not(:disabled)),
		:global(html:root .sky-opt:active:not(:disabled)),
		:global(html:root .photo-toggle:active:not(:disabled)),
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
		:global(html:root .swatch-btn:active:not(:disabled)),
		:global(html:root .app-card:active:not(:disabled)) {
			transform: scale(var(--btn-press-scale));
			transition-duration: 0.1s;
		}
	}
	/* NOTE: the universal interaction sits ABOVE the Bubble section on purpose. Its press
	   rule and Bubble's press rule have identical specificity (0,4,1), so whichever comes
	   LAST wins the tie. Bubble must win — its press is a sunken gloss, not a flat tint.
	   Move this block below and Bubble silently stops sinking on click. */

	/* ── "Bubble" button style (the DEFAULT; Settings → Button style; data-ui="bubble" is
	   shipped on <html> by app.html, stripped only for a saved 'flat') ── Glossy, airy,
	   gel-like buttons across every panel. The look leans on light, not lines: hairline
	   borders, a convex SHEEN riding on top as a background-IMAGE so each button's own
	   background-color still shows through (orange ATFC fields, active segments, …), and
	   depth from stacked inset highlights rather than dark edges. The ATFC Range/Refresh
	   <select>s keep their chevron — we give them depth but never touch their
	   background-image. Kept :global so it reaches the buttons in every panel. */

	/* The Settings segments and sky chips wear the SAME material as every other bubble
	   control (the chips, the pills, the Apps cards): their base ink-mix fill — the sky
	   reads through it, as it does everywhere else — with the border thinned to the same
	   1px line-edge the rest of the family draws. They used to keep a special paper-72
	   face here, and it was the odd one out once the app settled on the symmetric ink mix.
	   Note .sky-opt.on still wins with its ink border (0,3,0 scoped beats this 0,2,1),
	   which is right — there it matches the ink fill. */
	:global(html[data-ui='bubble'] .seg),
	:global(html[data-ui='bubble'] .sky-opt) {
		border-width: 1px;
	}

	/* NO sheen gradient — deliberately. There used to be a white-to-transparent wash here,
	   and on a translucent fill (the ATFC pills over the photo header) it frosted the top
	   half while the bottom half stayed bare glass: the button read as clipped in two, at
	   any stop position, dark or light. The ATFC <select>s never got the wash (their
	   bg-image is the chevron) and always looked right — so every control now gets the
	   select's material: its own uniform fill, with ALL of the gloss carried by the
	   edge-hugging insets in the depth rule below. background-image stays free for the
	   chevron; do not reintroduce a gradient on any of these. */

	/* Depth — every bubble control, selects included, all sharing ONE material. A white
	   rim light along the top, a short top glow hugging that rim (the gloss — an inset,
	   never a gradient, so it stays a highlight instead of a half-frost), and a drop
	   that's more air than ink. NOTHING at the bottom, inset or painted: a bottom inset
	   clips short of the border and leaves a bright rim (the "white underline"), and any
	   wash fading across the face reads as the button being clipped. The bottom edge
	   belongs to the hairline border alone. */
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
	:global(html[data-ui='bubble'] .manual),
	:global(html[data-ui='bubble'] .app-card),
	:global(html[data-ui='bubble'] .menu-btn) {
		border-radius: 999px;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.55),
			inset 0 7px 10px -8px rgba(255, 255, 255, 0.55),
			0 1px 1px rgba(8, 10, 14, 0.04),
			0 3px 8px rgba(8, 10, 14, 0.06);
		/* Stay on a compositor layer. At 100% zoom (dpr exactly 1) the 1px rim light sits
		   on a device-pixel boundary, and the hover spring's layer promotion re-rasterized
		   the button — the rim visibly snapped ("flashed") at hover start and end. At 110%+
		   the rim is already antialiased across pixels, so the artifact only showed at 100%.
		   Pre-promoting makes the rest and in-motion renders identical. Bubble-only cost:
		   these are small controls, and Flat has no shadows for a promotion to snap. */
		will-change: transform;
		/* Motion (transition, transform-origin, hover pop, press squash) is NOT set here —
		   it's the universal button interaction at the bottom of this file, shared by both UI
		   styles. Bubble only adds its material: the pill radius and the gloss. */
	}
	/* Two-line settings segments stay softly rounded rather than full pill. */
	:global(html[data-ui='bubble'] .seg) {
		border-radius: 16px;
	}
	/* The masthead nav springs like the rest of the family — but ONLY in Bubble. In Flat
	   the nav is typographic (plain names, hover by opacity), so it takes none of the
	   universal interaction block; the motion is restated here under the bubble key
	   instead of adding .menu-btn to the shared lists. */
	:global(html[data-ui='bubble'] .menu-btn) {
		transition:
			transform 0.3s var(--btn-spring),
			background 0.18s var(--btn-soft),
			border-color 0.18s var(--btn-soft),
			box-shadow 0.28s var(--btn-soft),
			opacity 0.18s var(--btn-soft),
			color 0.15s ease;
	}
	@media (prefers-reduced-motion: no-preference) {
		:global(html[data-ui='bubble'] .menu-btn:hover) {
			transform: scale(var(--btn-hover-scale));
		}
		:global(html[data-ui='bubble'] .menu-btn:active) {
			transform: scale(var(--btn-press-scale));
			transition-duration: 0.1s;
		}
	}

	/* Pre-promote the SPRING buttons the depth rule doesn't dress (they keep their own
	   faces: the camera disc, the edit bar, the board key, the photo card's close). They
	   still scale on hover, so without a resting layer they'd re-rasterize at hover start
	   and their edges snap at 100% zoom — the same flash the superbar's controls had
	   before the depth rule pinned them (see will-change above).

	   .type-btn is deliberately NOT here any more: it sits in EVERY table row, so the pin
	   put one compositor layer per row inside the board's scroller — and Safari scrolling
	   a layer-per-row table was the jank, far worse than the hover snap the pin bought.
	   The chips take the 100%-zoom flash; the scroll takes the win. */
	:global(html[data-ui='bubble'] .photo-toggle),
	:global(html[data-ui='bubble'] .edit-btn),
	:global(html[data-ui='bubble'] .legend-btn),
	:global(html[data-ui='bubble'] .pc-close) {
		will-change: transform;
	}
	/* The Apps cards join the family: the same material as everything above (fill + hairline,
	   all gloss from the shared edge-hugging insets — no gradient, see the sheen note), at the
	   card's own soft corners rather than the pill. The hover keeps the station accent the
	   Flat card has, mixed into the glassy paper face instead of bare transparency so the
	   card doesn't go see-through mid-hover. */
	:global(html[data-ui='bubble'] .app-card) {
		/* Only the corners are the card's own — everything else IS the chip material. The
		   card's ink-mix fill and hairline (base rule above) already flip with the scheme
		   the way the chips' do, and the chips' bubble reads right on a dark panel as-is:
		   dark face, contrast from the hairline and the shared rim-light insets. No bespoke
		   fills here — one material, worn at card size. */
		border-radius: 14px;
	}

	/* Selected: shown with LIGHT, never a drawn outline. The ink border .seg.on carries in
	   Flat read as a hard black frame here, so Bubble overrides it back to a hairline and
	   says "on" three other ways: a brighter convex sheen, an inner white hairline just
	   inside the edge (the glassy double rim), and a soft halo where the frame used to be. */
	:global(html[data-ui='bubble'] .seg.on) {
		border-color: color-mix(in srgb, var(--ink) 22%, transparent);
	}
	:global(html[data-ui='bubble'] .seg.on),
	:global(html[data-ui='bubble'] .sky-opt.on),
	:global(html[data-ui='bubble'] .field.on) {
		/* No gradient here either (see the sheen note above) — selected reads through its
		   own denser fill plus LIGHT at the edges: a brighter rim and top glow, the inner
		   hairline just inside the edge (the glassy double rim), and the soft halo where
		   Flat's ink frame would be. */
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.6),
			inset 0 8px 12px -8px rgba(255, 255, 255, 0.65),
			inset 0 0 0 1px rgba(255, 255, 255, 0.25),
			0 0 0 3px color-mix(in srgb, var(--ink) 7%, transparent),
			0 2px 5px rgba(8, 10, 14, 0.11),
			0 6px 16px rgba(8, 10, 14, 0.13);
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
	:global(html[data-ui='bubble'] .manual:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .app-card:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .menu-btn:hover:not(:disabled)) {
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.8),
			inset 0 7px 10px -8px rgba(255, 255, 255, 0.7),
			0 2px 5px rgba(8, 10, 14, 0.07),
			0 9px 22px rgba(8, 10, 14, 0.1);
	}
	/* Hovering a SELECTED control: the plain hover rule above out-specifies the selected
	   rule and would strip its halo and inner rim for the duration — so restate the full
	   selected stack here (0,5,1 beats hover's 0,4,1) with the rim brightened and the drop
	   lifted, so an active pill inflates like the rest without losing its "on". */
	:global(html[data-ui='bubble'] .seg.on:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .sky-opt.on:hover:not(:disabled)),
	:global(html[data-ui='bubble'] .field.on:hover:not(:disabled)) {
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.65),
			inset 0 8px 12px -8px rgba(255, 255, 255, 0.75),
			inset 0 0 0 1px rgba(255, 255, 255, 0.3),
			0 0 0 3px color-mix(in srgb, var(--ink) 8%, transparent),
			0 2px 5px rgba(8, 10, 14, 0.09),
			0 9px 22px rgba(8, 10, 14, 0.12);
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
	:global(html[data-ui='bubble'] .manual:active:not(:disabled)),
	:global(html[data-ui='bubble'] .app-card:active:not(:disabled)),
	:global(html[data-ui='bubble'] .menu-btn:active:not(:disabled)) {
		/* Sunken, but still glass: a top inner shade for the dip and a lighter flood than
		   before — the old 0.2/0.08 pairing went ink-dark and broke the airiness right at
		   the most tactile moment. No bottom rim light here either: same white-underline
		   clipping artifact as at rest. */
		box-shadow:
			inset 0 2px 4px rgba(8, 10, 14, 0.14),
			inset 0 0 0 999px rgba(8, 10, 14, 0.05);
	}
	/* Hover pop and press squash used to be duplicated here at 1.05 / 0.94. They now come from
	   the universal interaction block, so Bubble and Flat move identically and only differ in
	   material. */

	/* ── Disc controls (Back / Refresh / Expand / the search disc) ── These wear reicon's
	   *-circle glyphs: the disc IS the icon, painted as svg CONTENT — and inset shadows
	   paint below content, so the gloss the depth rule gives every other control never
	   reaches these. Overlay the same rim light + top glow ABOVE the disc instead, on an
	   ::after clipped to the same circle. Safe to position: every .icon-btn placement rule
	   is flex margins, none set position. The search control (.cs) is a div wearing the
	   identical 32px disc, so it joins the family here — overlay only while it's the disc,
	   never over the opened search field. */
	:global(html[data-ui='bubble'] .icon-btn) {
		position: relative;
	}
	:global(html[data-ui='bubble'] .icon-btn)::after,
	:global(html[data-ui='bubble'] .cs:not(.open))::after {
		content: '';
		position: absolute; /* .cs is already position: relative for its results list */
		inset: 0;
		border-radius: 999px;
		pointer-events: none;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.4),
			inset 0 7px 10px -8px rgba(255, 255, 255, 0.45);
	}
	/* Hover: the disc fills to full ink (base .icon-btn / .cs rules), so brighten the
	   gloss with it — same move as every other bubble control's hover. */
	:global(html[data-ui='bubble'] .icon-btn:hover:not(:disabled))::after,
	:global(html[data-ui='bubble'] .cs:not(.open):hover)::after {
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.6),
			inset 0 7px 10px -8px rgba(255, 255, 255, 0.6);
	}
	/* The search disc is a div, not a button, so the depth rule's airy drops never reached
	   it — hand it the same pair (the overlay above already carries the insets). */
	:global(html[data-ui='bubble'] .cs:not(.open)) {
		box-shadow:
			0 1px 1px rgba(8, 10, 14, 0.04),
			0 3px 8px rgba(8, 10, 14, 0.06);
	}
	/* OPEN, the field joins the family too: the chips' ink-mix face and 1px line-edge in
	   place of its bare glass + drawn outline (Flat keeps that look), with the depth
	   rule's full set carried directly — no ::after needed here, the face is a plain
	   background, not svg content like the disc's glyph. */
	:global(html[data-ui='bubble'] .cs.open) {
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border-color: var(--line-edge);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.55),
			inset 0 7px 10px -8px rgba(255, 255, 255, 0.55),
			0 1px 1px rgba(8, 10, 14, 0.04),
			0 3px 8px rgba(8, 10, 14, 0.06);
	}

</style>
