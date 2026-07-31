<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut, backOut } from 'svelte/easing';
	import { browser, dev } from '$app/environment';
	import { page } from '$app/state';
	import { pushState, replaceState } from '$app/navigation';
	import SplitFlap from '$lib/SplitFlap.svelte';
	import Masthead from '$lib/Masthead.svelte';
	import TrafficBoard from '$lib/TrafficBoard.svelte';
	import PresentationBuilder from '$lib/PresentationBuilder.svelte';
	import Weather from '$lib/Weather.svelte';
	import Aita from '$lib/Aita.svelte';
	import PudIdle from '$lib/PudIdle.svelte';
	import LocaleScenes from '$lib/LocaleScenes.svelte';
	import { ranger, togglePaused } from '$lib/location-state.svelte';
	import EmojiViewer from '$lib/EmojiViewer.svelte';
	import EmojiSearch from '$lib/EmojiSearch.svelte';
	import Densette from '$lib/Densette.svelte';
	import TextEditor from '$lib/TextEditor.svelte';
	// The editor's keys, rendered in the dense BAR rather than in the body — see the TEXT branch
	// in the head-row below, and the note at the top of $lib/text-editor-state.
	import TextEditorRack from '$lib/TextEditorRack.svelte';
	// The editor's own scroll state. The dense bar frosts when content goes under it, and this is
	// the only way the bar can know: `surfScrolled` watches `.surface-body`, which in the editor
	// never scrolls — its sheet and its proof scroll inside it instead.
	import { editor as textEditor, openSettings } from '$lib/text-editor-state.svelte';
	import { emojiSearch } from '$lib/emoji-search.svelte';
	import StarMap from '$lib/StarMap.svelte';
	import DocsShell from '$lib/DocsShell.svelte';
	// The paper inside the shell's gutter — the sheet, its printed cover, the reading measure and
	// the two grids that ride on it. The page still builds the CONTENT (appBody, handed in below);
	// DocsBody only decides which of the five arrangements a place gets, and dresses it.
	import DocsBody from '$lib/DocsBody.svelte';
	import Sky from '$lib/Sky.svelte';
	import SkyConsole from '$lib/SkyConsole.svelte';
	import SkyWeather from '$lib/SkyWeather.svelte';
	import SkyPhoto from '$lib/SkyPhoto.svelte';
	import RangerKey from '$lib/RangerKey.svelte';
	import CitySearch from '$lib/CitySearch.svelte';
	import {
		CLOUD_SVG,
		REFRESH_SVG,
		ARROW_LEFT_SVG,
		CAMERA_SVG,
		HOME_SVG,
		// Not a place's mark — the Park Ranger's own gear buttons, which are its UI, not the
		// Settings place. (Every place's icon now comes from PORT_ICONS.)
		GEAR_SVG,
		EXTERNAL_SVG,
		MAXIMIZE_SVG,
		MINIMIZE_SVG,
		PLAY_SVG,
		PAUSE_SVG
		// The Text Editor's corner is one SETTINGS key, and it wears GEAR_SVG — already imported
		// above for the Settings place. About, Install, Apps and the version are all behind it,
		// in a flyout the editor draws ($lib/TextEditorSettings); this file draws only the key.
	} from '$lib/icons';
	import faviconSite from '$lib/assets/favicon.svg';
	import faviconDev from '$lib/assets/favicon-dev.svg';
	import cloudFar from '$lib/assets/cloud-far.webp';
	import cloudNear from '$lib/assets/cloud-near.webp';
	import {
		weather,
		weatherKind,
		current as wxCurrent,
		load as wxLoad,
		setUnit as wxSetUnit,
		type WeatherKind
	} from '$lib/weather-state.svelte';
	// The one register of places — see $lib/places. Everything below that used to be a hand-kept
	// list of codes (which panels take the shared bar, which are full-viewport, which mark each
	// one wears, which favicon flies in the tab) is derived from it.
	import {
		airports,
		accent,
		portDescriptions,
		HUB,
		parentOf,
		PORT_ICONS,
		FAVICONS,
		NEW_HEADER,
		FULL_APPS,
		BAR_HEADER,
		PANEL_CARDS,
		APP_CARDS
	} from '$lib/places';
	// The written copy — see $lib/content. Data, not a literal, so Edit Mode can write it back.
	import { defaultPages, defaultSettings, type Block } from '$lib/content';
	import {
		viewPath,
		viewToSlug,
		sameView,
		viewTitle,
		viewDescription,
		SITE,
		type View
	} from '$lib/views';
	import { DEFAULT_FIELD, fieldByIata } from '$lib/fields';
	import { rangeToken, refreshToken, expandedToken } from '$lib/scope';
	import { popSpring } from '$lib/pop-spring';
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
		if (skyMode !== 'photo') {
			resetVeil();
			delete document.documentElement.dataset.photoGrad;
			document.documentElement.style.removeProperty('--photo-grad');
		}
		// Off and Photo both carry no phase: Off has nothing to paint, and a photograph can't tell the
		// tokens what time it is. Only the gradients set data-sky.
		if (skyMode === 'off' || skyMode === 'photo') {
			document.documentElement.removeAttribute('data-sky');
			if (skyMode === 'photo') loadPhoto();
			return;
		}
		skyPhase = skyMode === 'auto' ? currentPhase() : skyMode;
		// Pixelite renders no sky — and data-sky FORCES color-scheme in base.css, which let a
		// night phase overrule Display Mode → Light with nothing on screen to justify it. The
		// phase math still runs (darkScheme's Aeropalite branch reads it); only the stamp is
		// withheld, so under Pixelite the display mode owns the scheme outright.
		if (look === 'pixelite') document.documentElement.removeAttribute('data-sky');
		else document.documentElement.dataset.sky = skyPhase;
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
			const pick =
				list.find((p) => p.date === saved) ?? list[Math.floor(Math.random() * list.length)];
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
		paintPhotoGradient(img);
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
	// The panel's photo backdrop, GENERATED rather than copied. The blurred photo-copy
	// ::before betrayed itself whenever a resize misaligned its fixed attachment — "the
	// panel is above the photo, except it's holding a photograph of it". Three coarse
	// row-averages (top / middle / bottom — the axis a panel spans) become a gradient the
	// pane paints as its OWN colour; the measured veil above it works unchanged. On a
	// tainted or failed read, the copy recipe stays as the CSS fallback.
	function paintPhotoGradient(img: HTMLImageElement) {
		try {
			const c = document.createElement('canvas');
			const ctx = c.getContext('2d', { willReadFrequently: true });
			if (!ctx || !img.naturalWidth) return;
			c.width = 4;
			c.height = 3;
			ctx.drawImage(img, 0, 0, 4, 3);
			const { data } = ctx.getImageData(0, 0, 4, 3);
			const rows: string[] = [];
			for (let r = 0; r < 3; r++) {
				let R = 0,
					G = 0,
					B = 0;
				for (let x = 0; x < 4; x++) {
					const i = (r * 4 + x) * 4;
					R += data[i];
					G += data[i + 1];
					B += data[i + 2];
				}
				rows.push(`rgb(${Math.round(R / 4)} ${Math.round(G / 4)} ${Math.round(B / 4)})`);
			}
			document.documentElement.style.setProperty(
				'--photo-grad',
				`linear-gradient(180deg, ${rows[0]} 0%, ${rows[1]} 50%, ${rows[2]} 100%)`
			);
			document.documentElement.dataset.photoGrad = '';
		} catch {
			/* tainted canvas or failed decode — the blurred copy stays the fallback */
		}
	}

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
			const toLinear = (e: number) => (e <= 0.04045 ? e / 12.92 : ((e + 0.055) / 1.055) ** 2.4);
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

	// The legacy button-style key. Button style is no longer a choice of its own — the
	// theme owns it now (Aeropalite wears bubble, Pixelite its own plastic keys) — but the
	// key stays named so Reset can still clear a value left behind by an older visit.
	const UI_KEY = 'ksh-ui';

	// Named theme (the whole visual identity, button style and all): 'aeropalite' is the
	// default and carries no attribute; 'pixelite' opts into the print-manual look. data-look
	// on <html> selects the token set (see @kashinoga/puhig themes/*.css); a pre-paint script
	// in app.html applies the saved choice so there's no flash on load. Each theme also owns
	// data-ui (Aeropalite keeps bubble, Pixelite drops it for its own keys), so the legacy
	// standalone ksh-ui key is cleared on every switch.
	const LOOK_KEY = 'ksh-look';
	type Look = 'aeropalite' | 'pixelite';
	// Pixelite is the DEFAULT, so it leads the picker and needs no stored key; Aeropalite is the
	// opt-out that carries one.
	const lookOptions: { id: Look; label: string; sub: string }[] = [
		{ id: 'pixelite', label: 'Pixelite', sub: 'print & pixel — the default' },
		{ id: 'aeropalite', label: 'Aeropalite', sub: 'glossy & springy' }
	];
	// Seeded from the attribute app.html already stamped pre-paint (guarded for SSR, where the
	// document doesn't exist). Pixelite is the default, so it carries no key and is what the
	// SERVER renders: a fresh or Pixelite visitor is 'pixelite' from the first client render, no
	// flash. Only a saved 'aeropalite' opts out — app.html strips data-look for it, so the absence
	// of data-look='pixelite' on the client means Aeropalite; that visitor takes the one-frame
	// map-over-docs flash instead (SSR can't read localStorage). See the report's flash note.
	let look = $state<Look>(
		typeof document !== 'undefined' && document.documentElement.dataset.look !== 'pixelite'
			? 'aeropalite'
			: 'pixelite'
	);
	function setLook(l: Look) {
		look = l;
		if (typeof document !== 'undefined') {
			if (l === 'aeropalite') {
				document.documentElement.removeAttribute('data-look');
				document.documentElement.dataset.ui = 'bubble'; // Aeropalite is the bubble theme
			} else {
				document.documentElement.dataset.look = l;
				document.documentElement.removeAttribute('data-ui'); // Pixelite wears no bubble
			}
			// The sky stamp is look-dependent (Pixelite withholds data-sky so the display mode
			// keeps the scheme) — re-apply it so a theme switch lands on the right rules.
			applySky();
		}
		try {
			// The default (Pixelite) needs no key; only the opt-out (Aeropalite) stores one.
			if (l === 'aeropalite') localStorage.setItem(LOOK_KEY, l);
			else localStorage.removeItem(LOOK_KEY);
			localStorage.removeItem(UI_KEY); // button style is the theme's now, not a saved key
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
	const destSize = (title: string) => {
		const k = Math.min(1, DEST_FITS / title.length);
		if (k === 1) return `clamp(2.25rem, 9vw, 5.5rem)`;
		// A long title must shrink on EVERY term, not just the ceiling: on a phone the
		// 9vw middle is what wins, and "Court of Public Opinion" ran the header off the
		// screen at it. The vw term budgets ~half an em per flap cell against ~85% of
		// the viewport; the floor drops to bar scale so the budget can actually bind.
		return `clamp(1.5rem, ${(150 / title.length).toFixed(2)}vw, ${(5.5 * k).toFixed(2)}rem)`;
	};

	// ── Reset ────────────────────────────────────────────────────────────────
	// The six preferences this panel owns. Deliberately NOT the dev `clearLocalStorage`
	// set: that one also drops authored content drafts (CONTENT_KEY) and the panel's
	// expanded flag, and reloads the page.
	const PREF_KEYS = [NAMES_KEY, THEME_KEY, SKY_KEY, STARS_KEY, UI_KEY, LOOK_KEY];

	// Compared against what's on screen, not against what's stored: an explicit pick of
	// the default value reads as "already default", which is what the button implies.
	const settingsAreDefault = $derived(
		theme === 'system' && look === 'pixelite' && skyMode === 'auto' && starsOn
	);

	function resetSettings() {
		skyMode = 'auto';
		starsOn = true;
		setTheme('system'); // also strips data-theme and its key
		setLook('pixelite'); // the default: stamps data-look, drops data-ui and both keys
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

	// Which colour scheme is actually in use — the same decision base.css makes with `color-scheme`,
	// mirrored here so the DOM can follow it. Under Aeropalite an opted-into sky wins over the
	// display mode (dusk and night are the dark phases); under Pixelite there IS no sky on screen,
	// so the display mode always rules, with 'system' asking the OS.
	let osDark = $state(false);
	const darkScheme = $derived(
		look !== 'pixelite' && skyMode !== 'off' && skyMode !== 'photo'
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
	// Mirror the scheme onto <html> for CSS that styles the schemes differently beyond
	// light-dark() — the night-face bubble buttons. app.html stamps the same class
	// pre-paint; this keeps it true afterwards.
	$effect(() => {
		document.documentElement.classList.toggle('scheme-dark', darkScheme);
	});

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
	const lookStatus = $derived(
		look === 'pixelite'
			? 'Pixelite (the default) — print-manual paper, pixel type, cobalt ink.'
			: 'Aeropalite — glass, gloss, and springy bubble buttons.'
	);
	const starsStatus = $derived(
		starsOn ? 'A field of twinkling stars and a few shooting stars, in dark mode.' : 'Stars off.'
	);

	// Narrow/portrait screens get the vertical train layout (and a portrait camera).
	let vw = $state(1200);
	// Height matters too: the viewBox has a fixed aspect and `preserveAspectRatio` defaults to
	// `meet`, so the map's scale is min(vw/cam.w, vh/cam.h) — a short wide window fits by height.
	let vh = $state(800);
	// 960, not a phone width: it's where the COLUMN MATH stops working — the compact
	// sheet's 340px floor plus the masthead's 620px reserve (see .surface's width; the
	// reserve covers the masthead's WIDEST row, the wordmark + theme dots, which tops out
	// measured at ~592px). Below it the panel would open across the masthead, so it
	// becomes the bottom sheet instead; every "mobile" behaviour keys off the same line,
	// because they all mean "the sheet".
	const isMobile = $derived(vw <= 960);

	// ─── Page content per destination ───────────────────────────────────────────
	// The copy itself lives in $lib/content (backed by content.json) — see that module for why.
	// What stays here is the RENDERING of a block list, and Edit Mode, which is the authoring
	// tool for it.
	// reicon "mailbox", tucked at the end of the contact address.
	const MAILBOX_SVG =
		'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M18.3715 3.02906C17.9435 2.86413 17.4778 2.82269 17.0274 2.90947L16.75 2.96292V4.61813C17.4742 4.47982 18.2228 4.54702 18.9109 4.8122C19.338 4.97679 19.8019 5.01813 20.25 4.93273V3.27443C19.6437 3.35379 19.025 3.28092 18.4506 3.05957L18.3715 3.02906ZM16.75 6.14572L17.0274 6.09227C17.4778 6.00549 17.9435 6.04692 18.3715 6.21186C19.1193 6.50005 19.9371 6.55389 20.7163 6.36623L20.7829 6.35019C21.3502 6.21354 21.75 5.706 21.75 5.12246V2.90097C21.75 2.13165 21.0305 1.56486 20.2825 1.745C19.8531 1.84845 19.4023 1.81877 18.99 1.65991L18.9109 1.6294C18.2207 1.36345 17.4698 1.29663 16.7436 1.43657L16.2575 1.53023C15.6726 1.64293 15.25 2.15479 15.25 2.75042V6.24956H7C6.95339 6.24956 6.90777 6.25381 6.86352 6.26195C6.74341 6.25373 6.62219 6.24956 6.5 6.24956C3.6005 6.24956 1.25 8.60006 1.25 11.4996V16.767C1.25 18.4142 2.58534 19.7496 4.23256 19.7496H9.75V21.9996C9.75 22.4138 10.0858 22.7496 10.5 22.7496C10.9142 22.7496 11.25 22.4138 11.25 21.9996V19.7496H13.75V21.9996C13.75 22.4138 14.0858 22.7496 14.5 22.7496C14.9142 22.7496 15.25 22.4138 15.25 21.9996V19.7496H19.7931C21.4261 19.7496 22.75 18.4257 22.75 16.7927V11.4996C22.75 8.60006 20.3995 6.24956 17.5 6.24956H16.75V6.14572ZM15.25 7.74956V10.9996C15.25 11.4138 15.5858 11.7496 16 11.7496C16.4142 11.7496 16.75 11.4138 16.75 10.9996V7.74956H17.5C19.5711 7.74956 21.25 9.42849 21.25 11.4996V16.7927C21.25 17.5973 20.5977 18.2496 19.7931 18.2496H11.75V11.4996C11.75 10.0305 11.1466 8.70245 10.1742 7.74956H15.25ZM10.25 18.2496V11.4996C10.25 9.42849 8.57107 7.74956 6.5 7.74956C4.42893 7.74956 2.75 9.42849 2.75 11.4996V16.767C2.75 17.5858 3.41376 18.2496 4.23256 18.2496H10.25ZM4.25 15.9996C4.25 15.5853 4.58579 15.2496 5 15.2496H8C8.41421 15.2496 8.75 15.5853 8.75 15.9996C8.75 16.4138 8.41421 16.7496 8 16.7496H5C4.58579 16.7496 4.25 16.4138 4.25 15.9996Z" fill="currentColor"/></svg>';
	// NEW_HEADER, DOCS_BLEED, FULL_APPS, BAR_HEADER, APP_CARDS, APP_ICONS, PORT_ICONS and
	// PANEL_CARDS were eight hand-kept lists here. They are now derived from the one register in
	// $lib/places, and imported at the top of this script — each place declares its `chrome`, its
	// `icon` and whether it deals `cards`, and the lists fall out of that.
	//
	// What each one means still matters when reading the markup below, so, briefly:
	//   NEW_HEADER   renders the SHARED super bar — the accent bullet leaves the title and becomes
	//                a badge beside Back (see .app-badge). Every panel except the three that build
	//                their own header, and the hub, which is the map rather than a panel.
	//   FULL_APPS    self-chrome full-viewport apps: the board, the Builder, the Star Map and the
	//                Park Ranger. They own their whole interior and render through the stage's
	//                full-viewport path in EITHER theme — never inside the docs shell. Under
	//                Pixelite their interior chrome is restyled in-component, via
	//                :global(html[data-look='pixelite']) branches (bars/buttons/labels only —
	//                PUD's stage choreography and scenes are left untouched).
	//   BAR_HEADER   the DENSE bar: one row, the title in it beside the badge, the header's
	//                generous inset traded for the Traffic board's bar inset. Same recipe as
	//                E-ATFC (see .tfc-head.bar): one --bar-inset drives the padding and the gap.
	//   DOCS_BLEED   Pixelite docs mode (read in $lib/DocsBody): readings that title and lay themselves
	//                out, so they render FULL-BLEED on the gutter — no chapter head, no measure
	//                wrapper. Everything else gets a chapter head over a readable measure.
	//   PANEL_CARDS  panels that lay their onward destinations INTO the body as cards. (The
	//                Related chip rail this replaced is gone everywhere: each panel ends on its own
	//                content, and Back/Home already lead out.)
	//
	// Pixelite's one accent — cobalt-600. Passed to the full apps in place of their orange station
	// accent so their internal dots/highlights read cobalt, matching the manual's ink-and-cobalt.
	// It stays here, not in the register: it is a property of the THEME, not of any one place.
	const PIXEL_INK = '#103dff';

	// On a phone EVERY docs page hands its TITLE UP TO THE SUPERBAR (DocsShell's barTitle) instead
	// of printing it on the sheet — see the .docs-page-head rule in the mobile media block, which
	// is the other half of this. The serif cover is a page's whole first screen at that width, and
	// what stands under it always wants the room more than the name does: Weather's city tabs, the
	// Emoji search, a block page's prose. In the bar the name reads the way Air Traffic's own bar
	// carries "Air Traffic", and it is where the Emoji page's search already goes when it scrolls
	// away — one arrangement for the whole page's chrome, not a per-page judgement.
	//
	// This started as a three-page list and became the rule, so there is no list any more: the
	// title follows activeCode. The hub falls out on its own (no activeCode) — it IS the site's
	// cover, not a page under one. Densette keeps both, and they don't collide: the bar says
	// DENSETTE, where you are, while its paper prints "The Curriculum", what you are reading.
	//
	// Desktop is untouched: the breadcrumb ends in this same name there, and the sheet has the
	// room for a printed cover.

	// Where to cut the card list into the two desktop columns (see .app-cols). The cut is
	// CONTIGUOUS — column one takes a prefix, column two the rest — so that when the columns
	// stack on a phone they read back as the original alphabetical run. That rules out the
	// greedy shortest-column packing a masonry board would use; instead we pick the one cut
	// point whose two halves come out closest in height.
	//
	// Height is estimated, not measured: a card is its title plus its blurb, wrapped at a
	// rough character count for the ~270px column. Being a line or two out just makes the
	// columns slightly uneven — it can't break the layout, which is why it isn't worth a
	// measure/reflow pass.
	const cardLines = (c: string) =>
		Math.ceil((airports[c]?.title?.length ?? 0) / 22) +
		Math.ceil((portDescriptions[c]?.length ?? 0) / 34);
	function cardSplit(codes: string[]): number {
		const h = codes.map(cardLines);
		const total = h.reduce((a, b) => a + b, 0);
		let run = 0,
			best = 1,
			bestDelta = Infinity;
		for (let k = 1; k < codes.length; k++) {
			run += h[k - 1];
			const delta = Math.abs(run - (total - run));
			if (delta < bestDelta) ((bestDelta = delta), (best = k));
		}
		return best;
	}

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
	const EDIT_FIELDS = ['h', 'sub', 'p', 'quote', 'code', 'email'] as const;
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
			for (const k of [
				NAMES_KEY,
				THEME_KEY,
				CONTENT_KEY,
				EXPAND_KEY,
				SKY_KEY,
				STARS_KEY,
				UI_KEY,
				LOOK_KEY
			])
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
			if (Object.keys(overrides).length)
				localStorage.setItem(CONTENT_KEY, JSON.stringify(overrides));
			else localStorage.removeItem(CONTENT_KEY);
		} catch {
			/* storage unavailable — the clipboard copy is still the source of truth */
		}
		// Write the edit back to src/lib/content.json, through the dev-only endpoint. This is what
		// makes an edit real: the file changes, Vite reloads it, and the change is a git diff.
		//
		// It used to end at the clipboard — Save copied the whole content object and the toast
		// asked you to paste it back into the source. That step is where an edit gets lost, so
		// the clipboard is now the FALLBACK, for when the write fails (or someone is running a
		// production build locally, where the endpoint 404s by design).
		try {
			const res = await fetch('/api/content', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pages, settings })
			});
			if (!res.ok) throw new Error(String(res.status));
			showToast('Saved to src/lib/content.json.');
			return;
		} catch {
			/* not writable here — fall through to the clipboard */
		}
		const json = JSON.stringify({ pages, settings }, null, 2);
		console.log('[Kashinoga] edited panel copy:\n' + json);
		try {
			await navigator.clipboard.writeText(json);
			showToast('Saved locally. Content copied — paste it into src/lib/content.json.');
		} catch {
			showToast('Saved locally. Copy the JSON from the console into src/lib/content.json.');
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
	// (The values live in content.json's `settings`, beside the page copy — the Air Traffic
	// board's intro is in there too: `atfcLead` uses a `{}` token for the live range in NM, and
	// is edited via Edit Mode inside the board itself.)
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
	// The dense bar's measured height, published to the surface as --bar-h so the body below can
	// reserve exactly it. OFFSET height, not client: the bar wears a 1px border either side (the
	// pill's geometry, kept even while flat) and clientHeight leaves both out, which left the
	// editor's top gutter 2px shy of the three that frame it. See .surface-body.editor.
	let barHeight = $state(0);
	// The Park Ranger's own settings popout, opened from its bar (see the PUD head-actions).
	// The BUTTON lives up here because the bar is the page's; the CARD is drawn by PudIdle,
	// which owns the numbers in it (the lifetime tally, and abandoning the universe).
	let pudSettings = $state(false);
	// On a phone the ranger's global controls (pause, home, the gear) leave the dense bar and
	// gather in a floating key at the bottom-left — the Emoji Viewer's disclosure pattern —
	// so the narrow bar keeps only the name. This flag opens that key's cluster.
	let pudFabOpen = $state(false);
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
	// With a COMPACT panel open the decor simply STAYS, live behind the translucent
	// glass — clouds drift, rain falls, and the panel is a pane you're looking through.
	// (A clip-then-cover machine used to freeze the covered strip so Safari's backdrop
	// blur could rasterise once; every way of hiding its hand-off showed a seam — a
	// racing clip edge, a snapping face, a straight outline on close — and the honest
	// glass was chosen over the optimisation. If Safari's blur cost ever bites, this is
	// where that trade was made.)
	let decorHidden = $state(false);
	let decorTimer = 0;
	$effect(() => {
		const covered = backdropHidden;
		clearTimeout(decorTimer);
		// Cover waits for the slide to land — the panel travels over the decor (from the
		// right on desktop, up from the bottom on a phone), and hiding early would pop a
		// void beside the incoming surface. Reveal waits out the promotion's full round trip.
		decorTimer = window.setTimeout(() => (decorHidden = covered), covered ? 380 : 720);
	});
	const starsVisible = $derived(starsOn && darkScheme && !decorHidden && !photoSky);
	// ── Weather dressing ── With the Weather panel open, the stage wears the ACTIVE CITY's
	// sky: rain falls, snow drifts, fog banks in, a storm flashes, an overcast day thickens
	// the clouds. Read straight from $lib/weather-state — the same reading the panel shows,
	// keyed by weatherKind so the stage and the panel's icon can't disagree. Same bargains
	// as every other decor: nothing while a panel covers the viewport, nothing over a
	// photograph, and none of it BUILT unless its condition is actually up.
	const wxReading = $derived(
		view?.code === 'WTHR' ? weather.readings[weather.places[weather.activeIdx]?.id] : undefined
	);
	// The stage's own weather dial (the homepage sky console): a hand-picked kind that
	// dresses the skybox with no panel open. A live reading still wins while Weather is
	// up — the dial is scene-setting, not a forecast.
	const STAGE_WX_KEY = 'ksh-stage-wx';
	// The console folds into ONE chip; the rows live in a popout above it. Closes on
	// Escape or any stage click (the stage's own click handler runs on empty sky).
	let skyConsoleOpen = $state(false);
	// Desktop's nav flyouts: Home's greeting and About's bio open as cards under their
	// own nav buttons (see the navPop snippet + Masthead's nav-pop) instead of whole
	// panels — they're readings, not workspaces (About's onward cards ride along in
	// its card). Same dismissal bargain as the sky console — Escape, any stage click,
	// or opening a real panel. On a phone both stay panels: there's no room under a
	// nav of glyph discs for a card.
	const NAV_POPS = [HUB, 'ABT'];
	let navPopCode = $state<string | null>(null);
	// One-shot, page-load only: the sky toggle rises in on the masthead nav's beat (see
	// .sky-toggle.boot). The flag drops once that entrance has played, because the
	// console REMOUNTS every time a panel closes — replaying a 1.2s-delayed entrance
	// there would blank the toggle just as the stage returns.
	let skyBoot = $state(true);
	// Phone header tuck for the standard panels — the ATFC board's collapsed super bar,
	// worn by the generic surface: scrolled deep, the header folds to ONE toolbar row
	// (title at bar scale between Back and the panel's actions) and hands its height to
	// the body. Hysteresis for the board's reason: collapsing frees body height, and a
	// single trigger point would let the two states chase each other on a
	// barely-overflowing panel. Reset when the panel changes — a fresh panel opens at
	// scrollTop 0 with no scroll event to say so.
	let surfHeadCollapsed = $state(false);
	// Has the body scrolled at all? Drives the header's scroll shade on mobile — the inset
	// breath of shade under the stay-put header, ATFC's own tell that "content has gone
	// under" (see .surface-body.scrolled). Separate from the fold: it fires at every size.
	let surfScrolled = $state(false);
	// On the new header model the big title does NOT stay put: it lives at the top of the
	// scrolling body (see bodyTitleEl's h2) and scrolls away. Once it's gone, a compact title
	// flies in beside the badge (headTitleShown), so the bar always names the panel — the big
	// title while it's in view, the small one after. `bodyTitleEl` IS the big title, so its
	// own height is the threshold — no magic number, and it re-measures per panel.
	let bodyTitleEl = $state<HTMLElement | undefined>(undefined);
	let headTitleShown = $state(false);
	// Shared by the scroll handler AND a mount-time sync, so a body that opens already
	// scrolled (a refresh mid-scroll restores the inner scroller) shows the right shade and
	// compact title without waiting for the next scroll event.
	function syncSurfaceScroll(scroller: HTMLElement) {
		const y = scroller.scrollTop;
		surfScrolled = y > 2;
		if (bodyTitleEl) {
			// How far the big title's bottom sits ABOVE the scroller's top edge: negative while
			// any of it is still in view, positive once it's fully gone. Measured from live
			// rects rather than `offsetTop + offsetHeight` against scrollTop, because offsetTop
			// is relative to the OFFSET PARENT — the positioned panel, not the scroller — so it
			// carried the header's ~122px and put the handover that much out of reach. The
			// Emoji Viewer never noticed (it scrolls thousands of px), but Apps, Weather and the
			// Park Ranger scroll ~70–140px in total and could never reach the old threshold: the
			// title would scroll clean out of sight and the bar would still be unnamed. Rects
			// also stay honest when the fold changes the header's height mid-scroll.
			const r = bodyTitleEl.getBoundingClientRect();
			const visible = Math.max(0, r.bottom - scroller.getBoundingClientRect().top);
			// A little hysteresis so a hair of scroll near the seam can't flicker it — but
			// scaled to the TITLE, not a flat pixel count. The title is only as tall as its own
			// type, and destSize shrinks that for long names: "Intergalactic Park Ranger" is
			// ~26px on desktop and every title is ~30px on a phone. A flat 36px band was taller
			// than the whole title there, so once the compact title arrived nothing could ever
			// dismiss it — it stayed pinned beside the badge with the big title back in view.
			const hideAt = Math.max(16, Math.min(36, r.height * 0.6));
			headTitleShown = headTitleShown ? visible < hideAt : visible <= 12;
		}
	}
	function onSurfaceScroll(e: Event) {
		const scroller = e.currentTarget as HTMLElement;
		syncSurfaceScroll(scroller);
		const y = scroller.scrollTop;
		// Mobile opts OUT of the fold entirely. The collapse is a scroll-driven layout
		// change — the header (a flex sibling of the scroll body) resizes, and the phantom
		// padding snaps the scrollHeight — and iOS momentum scrolling can't ride over that:
		// the fling stutters and, on Weather, snaps back up. So on a phone the header just
		// stays put (Star Map's mobile answer: floating chrome, no fold) and casts its shade,
		// and the body scrolls clean. Desktop keeps the fold — a mouse has no fling to fight.
		if (isMobile) {
			if (surfHeadCollapsed) surfHeadCollapsed = false;
			return;
		}
		surfHeadCollapsed = surfHeadCollapsed ? y > 8 : y > 64;
	}
	$effect(() => {
		void view;
		void isMobile; // crossing to mobile unfolds the header (the fold is desktop-only now)
		pudSettings = false; // a fresh panel never opens with a popout already up
		pudFabOpen = false; // …nor with the mobile controls key already disclosed
		headTitleShown = false; // a fresh panel opens at the top, big title in view
		surfHeadCollapsed = false;
	});
	// When the big title mounts, sync from the CURRENT scroll — a refresh mid-scroll can
	// restore the inner scroller with no scroll event to say so, which left the compact
	// title hidden until the next scroll. rAF so any restoration has landed and the title's
	// height is measurable. Runs after the reset effect above (later in source), so its
	// value wins on a fresh mount.
	$effect(() => {
		const el = bodyTitleEl;
		if (!el) return;
		const raf = requestAnimationFrame(() => {
			const scroller = el.closest('.surface-body') as HTMLElement | null;
			if (scroller) syncSurfaceScroll(scroller);
		});
		return () => cancelAnimationFrame(raf);
	});
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

	// Clouds belong to the DAYLIT skybox — the gradient's own weather. They're baked bitmaps
	// drifting on transform alone (compositor-only; the softness was painted once, offline),
	// so the frame cost is a couple of cached layers — but the same bargain still applies:
	// not built when a panel covers the viewport, under a dark phase (dusk/night belong to
	// the stars), on a solid background, or over a photograph.
	// wxKind !== 'clear': a CLEAR sky (the console's chip, or a live clear reading while
	// Weather is up) means no clouds at all — 'clear' is weather too, not just the
	// absence of the wet kinds.
	// wxCloudy: the kinds that OVERRULE the dark-phase rule below — an ambient dusk or
	// night belongs to the stars, but asking for clouds (the dial, or a cloudy/wet
	// reading) should get them at night too, dimmed by the phase rules in the CSS.
	const wxCloudy = $derived(
		wxKind === 'cloudy' || wxKind === 'rain' || wxKind === 'storm' || wxKind === 'snow'
	);
	const cloudsVisible = $derived(
		skyMode !== 'off' &&
			skyMode !== 'photo' &&
			(!darkScheme || wxCloudy) &&
			!decorHidden &&
			wxKind !== 'clear'
	);
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
			// Mirror the new size into `?expanded=` in place (a control on the open panel,
			// not a new place), so copying the address bar always shares the board as seen.
			// Only the Traffic board's URL carries params; PRES/STAR reach here never (they
			// have no toggle) but the gate keeps it honest.
			if (view?.kind === 'port' && view.code === 'ATFC') syncUrl(view, boardParams, true);
		};
		if (reduce || isMobile) return flip(); // no choreography — just the new size
		clearTimeout(expandTimer);
		panelLeaving = true;
		expandTimer = window.setTimeout(() => {
			flip(); // resized while off-stage — the blur never sees it happen
			panelLeaving = false;
			holdContentForArrival(); // expanded: the surface lands empty, content follows
			requestAnimationFrame(playOpenLanding);
		}, PANEL_SLIDE);
	}
	// "The surface arrives, then the elements start their entrances": during an expanded
	// arrival the panel's content is HELD (not mounted at all — the empty surface is what
	// slides in), and when the surface lands it mounts fresh under a bumped key, so every
	// entrance animation plays from zero on a settled stage. Desktop expanded only;
	// compact panels keep their slide-with-content arrival.
	let contentHeld = $state(false);
	let arriveRev = $state(0);
	let arriveTimer = 0;
	function holdContentForArrival() {
		// Pixelite has no slide to hold the content out of (see playOpenLanding): the panel
		// fades in where it stands, so a hold would only split one arrival into two — an empty
		// surface, then a pop. The surface and its content come up together there.
		if (isMobile || !panelExpanded || reduce || look === 'pixelite') return;
		clearTimeout(arriveTimer);
		contentHeld = true;
		arriveTimer = window.setTimeout(() => {
			contentHeld = false;
			arriveRev++;
		}, 420); // the 380ms slide, plus a breath for it to settle
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
	// leg (playOpenLanding), so the two are one gesture.
	function openTransform(t: number, x: number, y: number) {
		const slide = 1 - cubicOut(t);
		// The swell rides only the landing tail (t 0.5→1), peaking mid-tail and closing
		// back to exactly 1 so there's no snap at the end.
		const u = Math.max(0, (t - 0.5) / 0.5);
		const grow = 1 + (reduce ? 0 : 0.04) * Math.sin(Math.PI * u);
		return `translate(${slide * x}px, ${slide * y}px) ${y ? `scaleY(${grow})` : `scaleX(${grow})`}`;
	}
	// EVERY panel slides: compact from its 680px offset, an expanded app from the full
	// viewport width, the phone sheet up from the bottom — one gesture at three sizes.
	// (An expanded arrival used to fade in place instead — a workaround for Safari
	// re-rasterising the backdrop blur under a full-screen slide, since alleviated:
	// the expanded backdrop is painted, not filtered — see the .surface-backdrop rule.)
	function panelIn(node: HTMLElement, p: { x?: number; y?: number; duration?: number }) {
		const { x = 0, y = 0, duration = 380 } = p;
		return {
			duration,
			// No offsets means FADE (the pixelite arrival, below): the manual's pages turn,
			// they don't drive in. With offsets it's the aero slide as ever.
			css: (t: number) =>
				x || y
					? `transform-origin: ${y ? 'center bottom' : 'right center'}; transform: ${openTransform(t, x, y)};`
					: `opacity: ${t};`
		};
	}
	// A panel→panel move never unmounts the panel (its content swaps off-screen), so
	// in:panelIn can't fire — the return leg replays the same landing by hand, over the
	// .leaving class's plain transition (WAAPI wins while it runs, and both settle at rest).
	function playOpenLanding() {
		// Not under Pixelite. The landing replays the aero SLIDE, and Pixelite's whole move
		// between places is the crossfade (in:panelIn / out:fly both drop their offsets there,
		// and the docs world dissolves into the stage). Left ungated, this drove a full-viewport
		// translate over that fade — the panel flew in from the right edge while the page it
		// came from was still dissolving underneath it.
		if (!panelEl || reduce || look === 'pixelite') return;
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
	// spelled by leaving the param off entirely; `expanded: false` (compact) likewise.
	type BoardParams = {
		field: string | null;
		range: number | null;
		refresh: number | null;
		expanded: boolean;
	};
	const NO_PARAMS: BoardParams = { field: null, range: null, refresh: null, expanded: false };

	// Built with URLSearchParams rather than string concatenation so the ordering is stable
	// and the escaping isn't ours to get wrong. Order matches $lib/scope + the load's
	// canonicalisation, so a URL we push is byte-identical to one the server would redirect
	// to — otherwise `syncUrl`'s address-bar comparison below would never match and every
	// pick would push a duplicate entry.
	function boardQuery({ field: f, range: r, refresh: p, expanded: x }: BoardParams) {
		const q = new URLSearchParams();
		if (f) q.set('field', f.toLowerCase());
		const rt = r === null ? null : rangeToken(r);
		if (rt) q.set('range', rt);
		const pt = p === null ? null : refreshToken(p);
		if (pt) q.set('refresh', pt);
		const xt = expandedToken(x);
		if (xt) q.set('expanded', xt);
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
			refresh: bp.refresh,
			expanded: bp.expanded
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
	const urlRefresh = $derived(page.state.refresh !== undefined ? page.state.refresh : data.refresh);

	// The Traffic board's three controls, mirrored into the query. Seeded from the URL; see
	// the note on `view` above for why reading `data` once is right. `null` means "the
	// default", which is exactly what carrying no param means.
	// svelte-ignore state_referenced_locally
	let field = $state<string | null>(data.field);
	// svelte-ignore state_referenced_locally
	let range = $state<number | null>(data.range);
	// svelte-ignore state_referenced_locally
	let refresh = $state<number | null>(data.refresh);

	// `expanded` rides only while the board is the open panel — PRES/STAR set
	// panelExpanded too, but their URLs never carry board params.
	const boardParams = $derived<BoardParams>({
		field,
		range,
		refresh,
		expanded: panelExpanded && view?.kind === 'port' && view.code === 'ATFC'
	});

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
	// The tab's mark follows the open panel: each app flies its own (FAVICONS, from the register),
	// and everything else wears the site heart — orange while developing, so a dev tab is obvious
	// at a glance. This was a nine-deep ternary over hard-coded codes; a new app that forgot to
	// join it simply flew the wrong mark, which nothing would ever have told us.
	const favicon = $derived(
		(view?.kind === 'port' ? FAVICONS[view.code] : undefined) ?? (dev ? faviconDev : faviconSite)
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
	// The share card — baked per place by scripts/gen-og.mjs, named by the place's canonical
	// slug with the slashes flattened (`apps/air-traffic` → `apps-air-traffic.png`). The rule is
	// the same one the generator writes by, so a new place gets its card without a second list.
	//
	// ABSOLUTE, and it has to be: an unfurler fetches this URL from its own servers, with no page
	// to resolve a relative path against. `page.url.origin` is what makes it right on a preview
	// deploy as well as in production.
	const ogImage = $derived(
		new URL(`/og/${view ? viewToSlug(view).replace(/\//g, '-') : 'home'}.png`, page.url.origin).href
	);

	// Show a destination/line: fly the camera there and render its panel content.
	function applyView(nv: View, push = true) {
		view = nv;
		// A fresh open starts the board on its defaults — the previous visit's `?field=` and
		// friends belong to the history entry we left, not to this new one. On a history-driven
		// open (`push` false) the reconciler has already set them. ATFC is always full now, so its
		// URL names the expanded board from the first push (it no longer has a compact form to name).
		if (push) {
			field = null;
			range = null;
			refresh = null;
			syncUrl(nv, nv.code === 'ATFC' ? { ...NO_PARAMS, expanded: true } : NO_PARAMS);
		}
		// Only the Air Traffic board, the Star Map, the Presentation Builder, the Court and
		// the Park Ranger are designed to fill the viewport. PRES, STAR and PUD force the
		// full layout on open (their compact forms are fallbacks); every other panel is
		// compact-only, so clear any lingering expand intent (e.g. from a previous ATFC
		// visit) — that keeps panelExpanded true to what's shown, so the panel renders AND
		// slides out at the right width. ATFC and AITA keep whatever the user last toggled.
		//
		// PUD joined that list because it's growing into a full app rather than a clicker you
		// glance at: the ancestor build it's drawing from (~/Downloads/Git/pud-idle) carries an
		// inventory, equipment, skills and an activity log, and none of that fits a 640px
		// column beside the map.
		// ATFC now joins the force-expand set: the board dropped its compact/panel shape, so the
		// full-viewport app is its only form in both themes. AITA is the last panel that keeps
		// whatever the user last toggled; everything else is compact-only.
		//
		// The set is DERIVED, not listed. It used to be spelled out here as four codes — and the
		// four were exactly FULL_APPS, which the register already derives from `chrome` being
		// 'own' or 'dense'. Two lists saying the same thing is the fault $lib/places was written
		// to end, and this one had the quiet failure mode the register's comment describes: a new
		// full-viewport app took the right chrome, took the right bar, passed every test, and
		// then opened at 680px in the side panel because nobody thought to add its code to a
		// condition three thousand lines away. Asking FULL_APPS makes the chrome field the one
		// place that decides.
		if (FULL_APPS.includes(nv.code)) panelExpanded = true;
		else if (nv.code !== 'AITA') panelExpanded = false;
	}
	// Reuse the open panel across destinations: slide the whole panel out, swap its
	// content off-screen, then slide it back in. A fresh open (no panel yet) or
	// reduced-motion just applies immediately.
	function navigate(nv: View, push = true) {
		clearTimeout(navTimer);
		navPopCode = null; // a real panel is taking the stage; any nav card yields
		// Under Pixelite the panel does not slide out and back — the theme's move between places
		// is the crossfade, and the leaving phase has nothing to do there but cost 300ms. Worse,
		// it cost them BLINDLY on the common case: leaving a docs page (Weather) for a full app
		// (the Park Ranger) there is no panel on screen to slide, so the visitor watched the old
		// page sit still for the whole beat before it finally dissolved.
		//
		// The one Pixelite move that still wants a phase is FULL APP → FULL APP: the panel is
		// already standing and stays mounted, so no mount/unmount crossfade can carry it. That
		// one dips to nothing and comes back (the .leaving rule below is a fade, not a slide).
		const pixeliteFade = look === 'pixelite' && !(stageFullApp && FULL_APPS.includes(nv.code));
		if (view && !reduce && !pixeliteFade) {
			panelLeaving = true;
			navTimer = window.setTimeout(() => {
				applyView(nv, push);
				panelLeaving = false;
				holdContentForArrival(); // no-op unless this arrival is expanded (PRES)
				// After the class flip lands in the DOM: replay the open landing (see
				// playOpenLanding — the panel never unmounted, so in:panelIn won't).
				requestAnimationFrame(playOpenLanding);
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
		if (navPopCode) {
			navPopCode = null;
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
		navPopCode = null; // and the nav flyouts
		if (view && !panelExpanded && e.target === e.currentTarget) home();
	}
	// The open station's code (or null) — drives the masthead nav's active highlight. A plain
	// string so <Masthead> stays free of the View union.
	const activeCode = $derived(view?.code ?? null);
	// Is the open view a self-chrome full-viewport app? When true, the stage renders it (its own
	// full-viewport path) in BOTH themes, and the Pixelite docs shell steps aside for it.
	const stageFullApp = $derived(!!view && FULL_APPS.includes(view.code));

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
		// The sky toggle's load entrance has fully played by ~1.8s (1.23s delay + 0.5s
		// rise); drop the flag just after so later remounts appear instantly.
		const skyBootTimer = setTimeout(() => (skyBoot = false), 2000);
		cleanups.push(() => clearTimeout(skyBootTimer));
		const th = localStorage.getItem(THEME_KEY);
		if (th === 'light' || th === 'dark') theme = th;
		// Deep-linked into the Traffic board, the URL names the size (`?expanded=`) and it
		// wins over the remembered toggle — a shared link must open the same for everyone.
		// Everywhere else the remembered toggle seeds as before (and only ATFC reads it:
		// applyView forces PRES/STAR/PUD full and every other panel compact).
		// ATFC is always full now; a deep-linked board opens expanded regardless of any ?expanded.
		if (data.view?.kind === 'port' && data.view.code === 'ATFC') panelExpanded = true;
		else if (localStorage.getItem(EXPAND_KEY) === '1') panelExpanded = true;
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
		starsOn = localStorage.getItem(STARS_KEY) !== '0'; // default on
		const swx = localStorage.getItem(STAGE_WX_KEY);
		if (swx && ['storm', 'snow', 'rain', 'fog', 'cloudy', 'clear'].includes(swx))
			stageWx = swx as WeatherKind;
		// Aeropalite is the only saved look now (Pixelite is the default and carries no key); a
		// saved 'aeropalite' opts out, anything else (absent, legacy 'metro', stale ksh-ui) resolves
		// to the Pixelite default — matching app.html's pre-paint. setLook reconciles keys/attrs.
		if (localStorage.getItem(LOOK_KEY) === 'aeropalite') setLook('aeropalite');
		else setLook('pixelite');
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
		// A board entry always expands now (ATFC dropped its compact shape); it never follows a
		// ?expanded param back to compact, and other panels' entries don't touch panelExpanded here.
		const boardEntry = nextView?.kind === 'port' && nextView.code === 'ATFC';
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
				// ATFC is always full now, so a board entry always expands — a param-less URL (no
				// ?expanded) must not collapse it back to the retired compact shape.
				if (boardEntry && !panelExpanded) panelExpanded = true;
				return;
			}
			// Set the controls before the panel swaps: the board reads them as props when the
			// keyed block remounts it, and `navigate` defers that swap by PANEL_SLIDE.
			field = nextField;
			range = nextRange;
			refresh = nextRefresh;
			if (boardEntry) panelExpanded = true; // ATFC is always full now
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
	<!-- The tab wears the open app's mark — every app flies its own (plane, presentation,
	     cloud, stars, gavel), which is why none shows one in its own header. Everywhere
	     else it's the site heart — orange in dev, so the dev tab is easy to spot. -->
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<title>{headTitle}</title>
	<meta name="description" content={headDescription} />
	<link rel="canonical" href={canonicalHref} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={headTitle} />
	<meta property="og:description" content={headDescription} />
	<meta property="og:url" content={canonicalHref} />
	<meta property="og:site_name" content={SITE} />
	<!-- The share card. Without it, a link to any of these apps unfurled as a grey rectangle —
	     which is how the site looks to everyone who has not visited it yet. `summary_large_image`
	     is the card shape that actually shows a 1200×630 image; plain `summary` crops it to a
	     thumbnail beside the text, which is what this used to be. -->
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={headTitle} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={ogImage} />
	<!-- THE MANIFEST IS THE TEXT EDITOR'S, and it is linked on the editor's own page and nowhere
	     else. That is the whole of how "only this app is installable" is enforced: a browser
	     offers to install the page it is looking at, so a manifest in app.html would put the
	     whole site behind one icon called Text Editor. The editor registers the worker that goes
	     with it, on the same argument — see $lib/TextEditor.
	     iOS reads no manifest icon at all for Add to Home Screen, so the touch icon is stated
	     beside it; both are baked by scripts/gen-icons.mjs. -->
	{#if view?.kind === 'port' && view.code === 'TEXT'}
		<link rel="manifest" href="/text-editor.webmanifest" />
		<link rel="apple-touch-icon" href="/icons/text-editor-180.png" />
		<meta name="apple-mobile-web-app-title" content="Text Editor" />
	{/if}
</svelte:head>

<!-- Decorative station-sign bullet beside a panel title, in the colour of the line the
     station sits on — the same treatment ATFC and the Presentation Builder already give
     their titles, and the same bullets that sit beside the homepage wordmark.

     The wrapper is deliberately not the dot itself: as a flex item, an empty element's
     baseline is synthesized from the wrong edge in Firefox and floats off the title's
     baseline. An inline-block wrapper (font-size:0 to collapse whitespace) takes its
     baseline from the inline-block dot inside it, which is its bottom margin edge — so
     `align-items: baseline` on .title-row rests the dot on the title's baseline. -->
{#snippet accentDot(code: string, titleSize: string)}
	<div class="dot-wrap" aria-hidden="true">
		<!-- The bullet arrives as the SOLID accent dot (the ::before overlay), then settles
		     into a lighter accent circle holding this place's own mark — the app-card icon
		     treatment, at title-bullet scale. Sized to the title's LOWERCASE height: the dot
		     inherits the title's own font-size, and its 1ex width/height is exactly the
		     x-height (the height of the "s" in "Apps"). csb-dot: shrinks to bar proportion
		     inside a collapsed super bar (puhig). -->
		<span class="accent-dot csb-dot" style:--accent={accent[code]} style:font-size={titleSize}>
			<span class="accent-mark">{@html PORT_ICONS[code] ?? ''}</span>
		</span>
	</div>
{/snippet}

<!-- A panel's onward destinations, dealt into two columns on desktop and one everywhere else.
     TWO REAL LISTS, not one multicol list: CSS columns did this in fewer lines, but WebKit
     doesn't reliably paint a column after the first here — Safari left the second column's
     top card as an empty slot, and headless WebKit dropped the whole column, while Chromium
     and Firefox were fine. Flex columns are laid out and painted the same way by all three.
     The cut is contiguous (see cardSplit), so stacked on a phone they read alphabetically. -->
{#snippet appCards(codes: string[])}
	{@const k = codes.length > 1 ? cardSplit(codes) : codes.length}
	<div class="app-cols">
		{#each [codes.slice(0, k), codes.slice(k)] as group}
			{#if group.length}
				<ul class="app-cards">
					{#each group as c}
						<li>
							<a
								class="app-card"
								href={viewPath({ kind: 'port', code: c })}
								data-sveltekit-preload-data="off"
								style:--card-accent={accent[c]}
								onclick={(e) => onNodeClick(e, () => board(c))}
							>
								<span class="app-ico">{@html PORT_ICONS[c]}</span>
								<span class="app-copy">
									<span class="app-name">{airports[c].title}</span>
									<span class="app-blurb">{portDescriptions[c]}</span>
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		{/each}
	</div>
{/snippet}

<!-- A nav flyout's content — the same blocks the destination's panel shows (pages[code],
     so Edit Mode's saved copy carries over), minus the panel chrome: these stops are a
     hello and a bio, not workspaces. About's onward cards (Work, Projects — PANEL_CARDS)
     ride along under its copy, exactly as they do in the panel body. Authored here so
     the copy and its styles stay with the page; Masthead just hangs the card (see its
     .nav-pop). -->
{#snippet navPop(code: string)}
	<div class="pop-copy">
		{#each pages[code] ?? [] as b}
			{#if 'h' in b}
				<h3>{b.h}</h3>
			{:else if 'p' in b}
				<p>{b.p}</p>
			{:else if 'quote' in b}
				<blockquote>{b.quote}</blockquote>
			{:else if 'code' in b}
				<pre><code>{b.code}</code></pre>
			{:else if 'email' in b}
				<p>
					<a class="mail" href="mailto:{b.email}">
						{b.email}<span class="mail-ico">{@html MAILBOX_SVG}</span>
					</a>
				</p>
			{/if}
		{/each}
		{#if PANEL_CARDS[code]}
			{@render appCards(PANEL_CARDS[code])}
		{/if}
	</div>
{/snippet}

{#snippet appBody(v: View)}
	{@const port = airports[v.code]}
	{@const blocks = pages[v.code] ?? stub(port.title)}
	{#if v.code === 'WTHR'}
		<!-- Weather lives INSIDE the ordinary panel — it's a reading, not a workspace, so
							     it doesn't take over the viewport the way the board and the Builder do.
							     Under Pixelite (docs) it grows a pixel sky window beside the reading to fill
							     the wide column; Aeropalite passes docs=false and keeps its arrangement. -->
		<Weather docs={look === 'pixelite'} />
	{:else if v.code === 'AITA'}
		<!-- The Court of Public Opinion makes the same bargain as Weather: a reading
							     inside the ordinary panel, its chrome the panel's own. -->
		<Aita />
	{:else if v.code === 'PUD'}
		<!-- Intergalactic Park Ranger makes it too: the game lives in the ordinary panel — a clicker
							     is a thing you visit, not a workspace that takes the viewport. -->
		<PudIdle settingsOpen={pudSettings} onCloseSettings={() => (pudSettings = false)} />
	{:else if v.code === 'EMOJ'}
		<!-- The Emoji Viewer: a wall of the system's own emojis to browse and copy.
							     Its big title is the shared one above, at the top of the scroll body.
							     Under Pixelite docs mode (docs), the viewer grows its own sticky search
							     bar (the header EmojiSearch disc isn't rendered on the docs path); under
							     Aeropalite that disc stays, so docs is false and no bar is added. -->
		<EmojiViewer docs={look === 'pixelite'} />
	{:else if v.code === 'TEXT'}
		<!-- Text Editor: a Markdown editor. `dense` chrome, so this is the whole viewport under
							     the one-row bar — the component lays out its own rack, sheet, proof and running
							     foot inside it. The one thing it cannot do for itself is leave: on a phone the
							     bar's chrome corner empties into the editor's floating key, and the door out is
							     this page's (see `home`). Same bargain the ranger's key keeps. -->
		<!-- The door out leads to APPS, not to the map: this app sits under Apps, and somebody
		     leaving an editor is usually going to another one. It is in the Settings flyout, which
		     the editor draws — see $lib/TextEditorSettings. -->
		<TextEditor onApps={() => board('APP')} />
	{:else if v.code === 'DENS'}
		<!-- Densette: The Curriculum, an in-universe RPG manual. A reading like Weather
							     and the Court, but printed — it renders as a Pixelite technical manual under
							     any theme, and comes home when the look is set to Pixelite. -->
		<Densette />
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
			>
				{settingsText('displayLead')}
			</p>
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
			>
				{noteText('displayNote', displayValue, editStg)}
			</p>
		</div>
		<div class="stg-group">
			<p
				class="seg-lead"
				class:editable={editStg}
				contenteditable={editStg}
				oninput={editStg
					? (e) => stageSettings('lookLead', e.currentTarget.textContent ?? '')
					: undefined}
			>
				{settingsText('lookLead')}
			</p>
			<div class="segmented" role="radiogroup" aria-label="Theme">
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
			>
				{noteText('lookNote', lookStatus, editStg)}
			</p>
		</div>
		<!-- THE SKY IS AEROPALITE'S. Pixelite draws none — it is a printed manual, and the two
		     groups below (Skybox Theme, Starry Night) were offering to dress a stage that is not
		     on. They still rendered, and still saved, so the default look shipped two controls
		     whose only effect was on a theme you had to leave to see. A setting that does nothing
		     where it is shown is worse than a missing one: it reads as broken rather than absent.
		     Hidden, NOT reset. The chosen sky and stars keep their saved values through a trip
		     into Pixelite and back, so switching looks costs a visitor nothing — and the reset
		     button still speaks for them, since it reverts everything the site remembers. -->
		{#if look !== 'pixelite'}
			<div class="stg-group">
				<p
					class="seg-lead"
					class:editable={editStg}
					contenteditable={editStg}
					oninput={editStg
						? (e) => stageSettings('skyLead', e.currentTarget.textContent ?? '')
						: undefined}
				>
					{settingsText('skyLead')}
				</p>
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
				>
					{noteText('skyNote', skyStatus, editStg)}
				</p>
			</div>
			<div class="stg-group">
				<p
					class="seg-lead"
					class:editable={editStg}
					contenteditable={editStg}
					oninput={editStg
						? (e) => stageSettings('starsLead', e.currentTarget.textContent ?? '')
						: undefined}
				>
					{settingsText('starsLead')}
				</p>
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
				>
					{noteText('starsNote', starsStatus, editStg)}
				</p>
			</div>
		{/if}
		<div class="stg-group">
			<p
				class="seg-lead"
				class:editable={editStg}
				contenteditable={editStg}
				oninput={editStg
					? (e) => stageSettings('resetLead', e.currentTarget.textContent ?? '')
					: undefined}
			>
				{settingsText('resetLead')}
			</p>
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
				{settingsAreDefault ? 'No changes have been made.' : 'Revert all changes.'}
			</p>
		</div>
		{#if dev}
			<div class="stg-group">
				<p class="seg-lead">Other</p>
				<div class="dev-actions">
					<button type="button" class="edit-enter" onclick={enterEditMode} disabled={editMode}>
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
				>
					{fieldText(v.code, i, 'h', b.h)}
				</h3>
			{:else if 'sub' in b}
				<h4
					class:editable={edit}
					contenteditable={edit}
					oninput={edit
						? (e) => stageEdit(v.code, i, 'sub', e.currentTarget.textContent ?? '')
						: undefined}
				>
					{fieldText(v.code, i, 'sub', b.sub)}
				</h4>
			{:else if 'quote' in b}
				<blockquote
					class:editable={edit}
					contenteditable={edit}
					oninput={edit
						? (e) => stageEdit(v.code, i, 'quote', e.currentTarget.textContent ?? '')
						: undefined}
				>
					{fieldText(v.code, i, 'quote', b.quote)}
				</blockquote>
			{:else if 'code' in b}
				<pre
					class:editable={edit}
					contenteditable={edit}
					oninput={edit
						? (e) => stageEdit(v.code, i, 'code', e.currentTarget.textContent ?? '')
						: undefined}><code>{fieldText(v.code, i, 'code', b.code)}</code></pre>
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
							oninput={(e) => stageEdit(v.code, i, 'email', e.currentTarget.textContent ?? '')}
							>{fieldText(v.code, i, 'email', b.email)}</span
						>
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
				>
					{fieldText(v.code, i, 'p', b.p)}
				</p>
			{/if}
		{/each}
	{/if}

	<!-- Onward destinations as cards in the body — each its own icon, name and
						     blurb: the Apps panel's live apps, About's two branches (see PANEL_CARDS).
						     They're the panel's real content, not a rail under it. -->
	{#if PANEL_CARDS[v.code]}
		{@render appCards(PANEL_CARDS[v.code])}
	{/if}
{/snippet}

<!-- The Pixelite page bodies — the sheet, its printed cover and the measure inside it — are
     $lib/DocsBody's, along with the CSS that dresses them. All this snippet does is hand it the
     view and the page's own content: appBody is still built HERE, so every app renders on the
     sheet exactly as it renders in a panel. (That is also why DocsBody spells its content rules
     with :global() — see the note in its script.) -->
{#snippet pixeliteBody(v: View)}
	<DocsBody {v} body={appBody} />
{/snippet}

{#if look === 'pixelite' && !stageFullApp}
	<!-- Docs world and stage crossfade when a full app opens or closes under Pixelite —
	     the stage sits fixed above the flow, so its fade dissolves onto the docs page. -->
	<div transition:fade={{ duration: 200 }}>
		<DocsShell
			{view}
			{activeCode}
			pageIcon={PORT_ICONS[activeCode ?? HUB] ?? HOME_SVG}
			barTitle={activeCode ? airports[activeCode].title : ''}
			onNavigate={(code) => (code === HUB ? home() : board(code))}
			body={pixeliteBody}
		/>
	</div>
{/if}
{#if look !== 'pixelite' || stageFullApp}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<!-- Under Aeropalite the stage never unmounts, so the zero duration keeps it inert there. -->
	<div
		class="stage"
		class:photo={photoSky}
		onclick={onStageClick}
		transition:fade={{ duration: look === 'pixelite' ? 200 : 0 }}
	>
		{#if photoSky && photo}
			<!-- Bing's photo of the day, in $lib/SkyPhoto: the picture, the veil that keeps the
		     masthead readable over it, and the credit line that doubles as the picker. The page
		     keeps everything about GETTING a photograph — the fetch, the random pick, the pin,
		     and the measurement that decides the panel's glass over this particular picture. -->
			<SkyPhoto
				{photo}
				{photos}
				credit={!decorHidden}
				pinned={photoPinned}
				bind:open={photoOpen}
				onChoose={choosePhoto}
			/>
		{/if}
		<!-- The stage's ambient decor — the drifting daylit clouds and the star field, in
	     $lib/Sky. It takes no decisions: the page works out whether each layer belongs on
	     screen (cloudsVisible, starsVisible — they need the sky mode, the colour scheme, the
	     live reading and the panel state) and hands over the answers. The fade is the page's
	     too: it's the SKY-change duration, cut to nothing when the hide is panel-driven
	     (decorHidden) on a phone, because by then the panel already covers the stage and
	     there is nothing to see — and Safari never has to blur a dissolving scene while
	     animating the panel's width. -->
		<Sky
			clouds={cloudsVisible}
			overcast={fxOvercast}
			stars={starsVisible}
			fadeMs={decorHidden ? (isMobile ? 0 : 420) : 700}
		/>

		<!-- The sky console: the skybox's own dials, drawn only on the OPEN stage (no panel)
	     under a gradient sky. Top row picks the time of day (the same modes Settings
	     offers, minus Off/Photo — those belong to Settings); bottom row hand-picks the
	     stage's weather. Chips, like everything else here. -->
		{#if !view && skyMode !== 'off' && skyMode !== 'photo' && !decorHidden}
			<SkyConsole
				bind:open={skyConsoleOpen}
				mode={skyMode}
				phase={skyPhase}
				wx={stageWx}
				boot={skyBoot}
				onMode={(m) => setSkyMode(m as SkyMode)}
				onWx={(k) => setStageWx(k as WeatherKind | null)}
			/>
		{/if}

		<!-- The weather dressing: the ACTIVE CITY's sky while its panel is open (see wxKind), in
	     $lib/SkyWeather. Like the decor above it, it takes no decisions — the page works out
	     which layers the reading calls for, and how fast they should come and go. -->
		<SkyWeather
			rain={fxRain}
			snow={fxSnow}
			fog={fxFog}
			flash={fxFlash}
			fadeMs={decorHidden ? (isMobile ? 0 : 420) : 500}
			fogFadeMs={decorHidden ? (isMobile ? 0 : 420) : 900}
		/>

		<!-- Persistent masthead (wordmark + tagline + station nav) — its own component so a
	     homepage-chrome tweak stays out of this catch-all page. It reports which destination
	     was clicked; the page keeps the modifier-aware click + camera handling. -->
		<Masthead
			{activeCode}
			covered={backdropHidden}
			popCodes={NAV_POPS}
			popCode={navPopCode}
			{navPop}
			onNavigate={(code, e) => {
				// Desktop's Home and About are flyouts under their own buttons (see navPop),
				// not panels. Modified clicks stay the browser's (new tab and friends), like
				// every in-app link; on a phone both open their panels as before.
				if (NAV_POPS.includes(code) && !isMobile) {
					if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
					e.preventDefault();
					e.stopPropagation(); // or the stage's anywhere-off dismiss undoes the open on the way up
					navPopCode = navPopCode === code ? null : code;
					return;
				}
				onNodeClick(e, () => board(code));
			}}
		/>

		{#if view}
			{@const v = view}
			<aside
				bind:this={panelEl}
				class="surface"
				class:leaving={panelLeaving}
				class:expanded={panelExpanded}
				style:--bar-h={barHeight ? `${barHeight}px` : null}
				in:panelIn|global={look === 'pixelite'
					? { duration: 300 }
					: isMobile
						? { y: 900, duration: 380 }
						: { x: panelExpanded ? vw : 680, duration: 380 }}
				out:fly|global={look === 'pixelite'
					? { duration: 300 }
					: isMobile
						? { y: 900, opacity: 1, duration: 380 }
						: { x: panelExpanded ? vw : 680, opacity: 1, duration: 380 }}
			>
				<!-- Frosted glass pane. Held OFF the scroller (a static, non-scrolling layer) so
			     WebKit rasterises the backdrop blur once instead of re-blurring every scroll
			     frame - the fix for Safari big-surface backdrop-filter cost. -->
				<div
					class="surface-backdrop"
					aria-hidden="true"
					class:orbit={v.code === 'PUD' && ranger.deployment === 'orbit'}
				></div>
				<!-- No generic expand toggle: only the Air Traffic board, the Star Map, the
			     Presentation Builder, and the Court are designed to fill the viewport (ATFC
			     and the Court render their own toggles; PRES and STAR are always full).
			     Every other panel is compact-only. -->

				<!-- The panel is reused across destinations: on navigation the whole panel
			     slides out, swaps to the new node's content while off-screen, then
			     slides back in. transition:fly handles the map⇄panel open/close. The
			     inner key (no transition) just remounts content so the arrival-board
			     titles re-flip on each destination. -->
				<div class="surface-scroll">
					<!-- The Park Ranger's scenery — the forest, the space above it, and the wipe that hides
					     the swap between them — in $lib/LocaleScenes. It lives INSIDE the panel because the
					     sheet is opaque: there is no "behind the panel" a viewer can see.
					     IT TAKES NO PROPS. Every question the scenery asks is about the deployment, which is
					     $lib/location-state and which it reads itself — the opposite of the sky, where the
					     page has to decide whether a layer belongs on screen at all and hands over answers. -->
					{#if v?.kind === 'port' && v.code === 'PUD'}
						<LocaleScenes />
					{/if}
					{#if !contentHeld}
						{#key v.code + ':' + editRev + ':' + arriveRev}
							{@const port = airports[v.code]}
							{@const blocks = pages[v.code] ?? stub(port.title)}
							{#if v.code === 'ATFC'}
								<!-- The Traffic board owns its whole panel interior so, when expanded, its
						     controls + a live summary fill the header beside the title. It gets the
						     panel chrome it can't reach from a child: title, code, back, expanded.
						     (No Connections snippet: the Related rail is gone site-wide — onward
						     destinations are body cards now, see PANEL_CARDS.)
						     It's always full-viewport — force-expanded on open (applyView) — so it is
						     handed NO onToggleExpand: the collapse toggle would peel back to a compact
						     shape the board no longer has. Without the callback, TrafficBoard's two
						     {#if onToggleExpand} collapse buttons (the deck super bar's and the compact
						     header's) simply don't render, in either theme. -->
								<TrafficBoard
									accent={look === 'pixelite' ? PIXEL_INK : accent[v.code]}
									code={v.code}
									title={port.title}
									expanded={panelExpanded}
									onhome={() => home()}
									edit={dev && editMode}
									copyText={settingsText}
									onCopyEdit={stageSettings}
									initialField={field}
									onFieldChange={setField}
									initialRange={range}
									onRangeChange={setRange}
									initialRefresh={refresh}
									onRefreshChange={setRefresh}
								/>
							{:else if v.code === 'PRES'}
								<!-- The Presentation Builder owns its whole panel interior (its own toolbar +
						     three-column editor), like the Traffic board. It's always full-viewport —
						     forced expanded on open (applyView), with no collapse toggle. -->
								<PresentationBuilder
									accent={look === 'pixelite' ? PIXEL_INK : accent[v.code]}
									title={port.title}
									onback={goBack}
								/>
							{:else if v.code === 'STAR'}
								<!-- The Star Map owns its interior the same way, and — like the Builder —
						     it's always full-viewport: forced expanded on open (applyView), with no
						     collapse toggle. Its header is the board's super bar, with the location
						     control and a sky summary riding beside the title. -->
								<StarMap
									accent={look === 'pixelite' ? PIXEL_INK : accent[v.code]}
									title={port.title}
									onhome={() => home()}
								/>
							{:else}
								<!-- csb / csb-on: the shared collapsed-super-bar recipe (puhig base.css) —
					     head-collapsed stays for the page's own seasoning (phantom scroll room). -->
								<!-- The bar MEASURES itself, and publishes its height as --bar-h. The body below
						     reserves room for it (the bar is absolutely positioned over the scroller),
						     and that reserve used to be a hard-coded `44px + 2 * inset` — right for a bar
						     holding one 42px cap, and merely near-enough for one holding a row of 28px
						     keys, which is what the text editor's bar is. Near-enough is a band of dead
						     space at the top of a full-viewport app. Measured, the body sits exactly
						     under the bar whatever the bar turns out to hold. The hard-coded calc stays
						     as the fallback for the first paint, before the bind has a number. -->
								<!-- NO BAR AT ALL FOR THE TEXT EDITOR ON A PHONE. It kept the two view keys and
							     nothing else there, which spent a whole row of a 390px screen — the row
							     furthest from the thumbs, with the keyboard at the opposite end — on two
							     words that now sit in the flyout with everything else. The body reclaims the
							     height on its own: the reserve comes from `.surface-head.bar + .surface-body`,
							     and with no head there is no adjacent sibling for it to match.
							     GATED ON `textEditor.narrow`, NEVER ON `isMobile`. Those are 820px and 960px,
							     and the flyout that has to catch the keys is narrow-only — crossing the two
							     thresholds would leave a 140px band with no bar AND no flyout, which is an
							     editor with no controls at all. -->
								{#if !(v.code === 'TEXT' && textEditor.narrow)}
									<div
										class="surface-head csb"
										class:head-collapsed={surfHeadCollapsed}
										class:csb-on={surfHeadCollapsed}
										class:bar={BAR_HEADER.includes(v.code)}
										class:te-bar={v.code === 'TEXT'}
										class:orbit={ranger.deployment === 'orbit'}
										class:court={v.code === 'AITA'}
										class:scrolled={surfScrolled || (v.code === 'TEXT' && textEditor.scrolled)}
										bind:offsetHeight={barHeight}
									>
										<div class="head-row csb-fold">
											{#if BAR_HEADER.includes(v.code)}
												<!-- A dense bar draws NO Back cap at all now (it was already gone on
								     phones, where the cap's 50px squeezed everything to its right) —
								     and no badge either, so the TITLE takes the left end outright.
								     Leaving goes through the bar's Home key (see the PUD head-actions)
								     or the browser's own back gesture, which works because every panel
								     is a real URL (pushState, see applyView). -->
											{:else if v.code === 'AITA' && panelExpanded}
												<!-- E-COPO trades Back for Home, like the other full-viewport apps:
								     expanded has nowhere to peel back to mid-thought, so the left cap
								     goes straight home (the right cap already collapses). -->
												<button
													class="icon-btn back"
													onclick={() => home()}
													aria-label="Close and go home"
													title="Home">{@html HOME_SVG}</button
												>
											{:else}
												<button
													class="icon-btn back"
													onclick={goBack}
													aria-label={ownPushes > 0 ? 'Back' : 'Back to home'}
													title={ownPushes > 0 ? 'Back' : 'Home'}>{@html ARROW_LEFT_SVG}</button
												>
											{/if}
											{#if NEW_HEADER.includes(v.code) && !BAR_HEADER.includes(v.code)}
												<!-- NEW HEADER MODEL: the accent bullet leaves the title and becomes a
								     badge here, right of Back — the app's mark in its accent circle,
								     arriving solid then settling to the marked light wash (see
								     .app-badge).
								     A DENSE BAR CARRIES NO BADGE, and neither does a place that builds
								     its OWN header. Both were `Action TBD` and both are settled: a dense
								     bar is one row, and with the Back cap gone the title takes the left
								     end outright — a badge there is a control competing with the one
								     thing in that row you cannot work out from anywhere else. A panel
								     with its own chrome is not on this model at all, and half-wearing it
								     read as a misalignment rather than as a choice.
								     Both absences are ASSERTED, in e2e/dots and e2e/header, so a badge
								     drifting back into either place is a failure rather than a surprise. -->
												<button
													type="button"
													class="app-badge"
													style:--accent={accent[v.code]}
													aria-label={port.title}
													title={port.title}
												>
													<span class="app-badge-mark">{@html PORT_ICONS[v.code] ?? ''}</span>
												</button>
											{/if}
											{#if v.code === 'TEXT'}
												<!-- THE TEXT EDITOR spends the whole bar on its KEYS, and carries no name in it.
								     A dense bar is one row wide and this app has sixteen controls; the
								     name was the only thing standing between them and the room they
								     needed, and it was the one piece of the bar saying something the tab,
								     the URL and the favicon already say. The rack is $lib/TextEditorRack —
								     it lives out here because the bar is the page's, and it reaches the
								     editor below through the command table in $lib/text-editor-state. -->
												<TextEditorRack />
											{:else if BAR_HEADER.includes(v.code)}
												<!-- A dense bar names itself outright: no big title below to hand over
								     FROM, so the title simply sits here beside the badge. -->
												<span class="head-title">{port.title}</span>
												{#if v.code === 'PUD'}
													<!-- The beta tag reads as part of the NAME — "Intergalactic Park Ranger ‹Beta›"
									     — so it sits right after the title rather than off in the corner with the
									     global controls, where it looked like one more thing to press. Still
									     puhig's .beta, twin of the Presentation Builder's; the head-row's 0.5rem
									     gap sets the space to the title. -->
													<button
														type="button"
														class="beta"
														aria-label="Intergalactic Park Ranger is in beta"
														title="This app is in beta — expect it to change">Beta</button
													>
												{/if}
											{:else if NEW_HEADER.includes(v.code) && headTitleShown && !(v.code === 'EMOJ' && emojiSearch.open && isMobile)}
												<!-- The compact title flies in beside the badge once the big title (in the
								     scrolling body) has gone by — but yields when the Emoji Viewer's grown
								     search would crowd it (on a phone, the field takes most of the row). -->
												<span
													class="head-title"
													in:fly={{ x: -14, duration: 380, easing: backOut }}
													out:fly={{ x: -10, duration: 150 }}>{port.title}</span
												>
											{/if}
											{#if v.code === 'EMOJ'}
												<!-- The Emoji Viewer's search rides the super bar's right edge, Weather's
								     arrangement: a disc that grows into a field, sharing its query with the
								     wall below through $lib/emoji-search. -->
												<div class="head-actions">
													<EmojiSearch />
												</div>
											{/if}
											{#if v.code === 'WTHR'}
												<!-- Weather's search lives up here, on the Back row: it acts on the whole panel, so
								     it belongs with the panel's own controls. It's a disc that GROWS into a field —
								     see CitySearch — and it shares the app's cities with the body through
								     $lib/weather-state, since neither half can own state the other needs. -->
												<!-- …clustered with refresh-now at its left, the same corner ATFC keeps.
								     The reading lives in $lib/weather-state, so the header (the page's) can
								     drive it exactly the way the search does. -->
												<div class="head-actions">
													<!-- Refresh and the unit fold away while the search is open — the
									     grown field wants the whole row, and neither is a thing you do
									     mid-typing. They return when the field folds back to its disc. -->
													{#if !weather.searchOpen}
														<button
															type="button"
															class="icon-btn"
															onclick={() => wxLoad(wxCurrent())}
															aria-label="Refresh now"
															title="Refresh now">{@html REFRESH_SVG}</button
														>
														<!-- ONE disc, not a segmented pair: it shows the unit you're on and
										     flips to the other — there are only two, so the toggle IS the
										     picker. Lives here so the whole reading (body + rail) follows. -->
														<button
															type="button"
															class="icon-btn unit-btn"
															onclick={() => wxSetUnit(weather.unit === 'F' ? 'C' : 'F')}
															aria-label={`Showing °${weather.unit} — switch to °${weather.unit === 'F' ? 'C' : 'F'}`}
															title={`Switch to °${weather.unit === 'F' ? 'C' : 'F'}`}
															>°{weather.unit}</button
														>
													{/if}
													<CitySearch />
												</div>
											{/if}
											{#if v.code === 'AITA'}
												<!-- The Court can be taken full-viewport — a long docket is a reading,
								     and E-COPO centres it as a column (see .surface-body.court). Same
								     corner the other panels keep their global controls in. -->
												<div class="head-actions">
													<button
														type="button"
														class="icon-btn"
														onclick={toggleExpand}
														aria-label={panelExpanded ? 'Collapse panel' : 'Expand panel'}
														title={panelExpanded ? 'Collapse' : 'Expand'}
														>{@html panelExpanded ? MINIMIZE_SVG : MAXIMIZE_SVG}</button
													>
												</div>
											{/if}
											{#if v.code === 'PUD' && !isMobile}
												<!-- DESKTOP: the bar's right-hand corner keeps the GLOBAL controls, the same
								     corner every other panel uses: the pause twin, Home, and the gear. On a
								     PHONE these leave the bar for the floating controls key at the bottom-left
								     (see .pud-fab below) — the narrow bar keeps only the name. (The beta tag
								     used to ride here too; it reads as part of the name, so it moved up beside
								     the title — see the BAR_HEADER block above.) -->
												<div class="head-actions">
													<!-- The global twin of the shop's pause disc — the game's one verb you
									     might reach for mid-scroll, when the requisitions head has slid away.
									     So it rides the bar (shared .icon-btn) beside the gear, driving the
									     same ranger.paused bit the header switch does. -->
													<button
														type="button"
														class="icon-btn"
														aria-pressed={ranger.paused}
														aria-label={ranger.paused ? 'Resume the works' : 'Pause the works'}
														title={ranger.paused ? 'Resume the works' : 'Pause the works'}
														onclick={togglePaused}
														>{@html ranger.paused ? PLAY_SVG : PAUSE_SVG}</button
													>
													<!-- Home rides between the verbs and the gear: with the Back cap gone
									     from the dense bar (see the head-row above), this is the one door
									     out of the ranger's full-viewport world. -->
													<button
														type="button"
														class="icon-btn"
														onclick={() => home()}
														aria-label="Close and go home"
														title="Home">{@html HOME_SVG}</button
													>
													<button
														type="button"
														class="icon-btn"
														data-pud-settings
														aria-expanded={pudSettings}
														onclick={() => (pudSettings = !pudSettings)}
														aria-label={pudSettings
															? 'Close division settings'
															: 'Division settings'}
														title="Division settings">{@html GEAR_SVG}</button
													>
												</div>
											{/if}
											{#if BAR_HEADER.includes(v.code) && v.code !== 'PUD'}
												<!-- EVERY OTHER dense panel gets Home in the bar's right-hand corner, on
								     every viewport. A dense bar draws no Back cap (see the head-row above),
								     so without this there is no door out of a full-viewport app except the
								     browser's own back gesture — which works, because every panel is a real
								     URL, but it is not something a control on screen should rely on.
								     The ranger is the exception above rather than a case here: it needs its
								     pause twin and its gear alongside, and on a phone the three of them
								     leave the bar together for a floating key. -->
												<div class="head-actions">
													{#if v.code !== 'TEXT'}
														<button
															type="button"
															class="icon-btn"
															onclick={() => home()}
															aria-label="Close and go home"
															title="Home">{@html HOME_SVG}</button
														>
													{/if}
													{#if v.code === 'TEXT' && !textEditor.narrow}
														<!-- SETTINGS — and it is the whole of the editor's corner now. Four things
													     stood here: Home, About, Install and the Beta tag. None of them acts on
													     the document, all four cost width in a bar that is one row high, and on
													     a phone three of them had already been pushed down into the floating
													     key's stack, where they sat among the marks looking like more marks.
													     They are behind this one key, in a flyout the EDITOR draws
													     ($lib/TextEditorSettings) — the same surface this key and the phone's
													     own gear both open, through `openSettings` in $lib/text-editor-state.
													     ON A PHONE this corner empties like every other app's: the gear goes
													     down to the floating key's stack, where the marks and the file keys
													     already are, and the bar keeps nothing but the two view keys.
													     The door out is in there too, and it leads to APPS rather than home —
													     see `onApps` on the editor below. -->
														<button
															type="button"
															class="icon-btn"
															class:on={!!textEditor.settingsAt}
															aria-expanded={!!textEditor.settingsAt}
															onclick={openSettings}
															aria-label="Settings"
															title="Settings — About, Install, Apps, and the version"
															>{@html GEAR_SVG}</button
														>
													{/if}
												</div>
											{/if}
										</div>
										{#if !NEW_HEADER.includes(v.code)}
											<!-- Panels off the model keep the old arrangement: the title sits in the
							     header, with the accent bullet beside it. On the model the title moves
							     to the BODY (below) so it scrolls away, and the bullet becomes the
							     badge on the row above. -->
											<div class="title-row csb-row">
												<h2 class="dest csb-title" style:font-size={destSize(port.title)}>
													<SplitFlap text={port.title} base={160} stagger={45} />
												</h2>
												{@render accentDot(v.code, destSize(port.title))}
											</div>
										{/if}
									</div>
								{/if}
								<div
									class="surface-body"
									class:settings={v.code === 'STG'}
									class:court={v.code === 'AITA'}
									class:editor={v.code === 'TEXT'}
									class:ranger={v.code === 'PUD'}
									class:orbit={v.code === 'PUD' && ranger.deployment === 'orbit'}
									class:scrolled={surfScrolled}
									onscroll={onSurfaceScroll}
								>
									{#if NEW_HEADER.includes(v.code) && !BAR_HEADER.includes(v.code)}
										<!-- (A BAR_HEADER panel has none of this: its bar carries the name outright,
							     so there's no big title here to scroll away or hand over.) -->
										<!-- THE BIG TITLE, first thing in the scrolling body — so it scrolls away and
							     hands the naming over to the compact title in the bar (headTitleShown).
							     It's the panel's h2 wherever it sits; only the parent changed, from the
							     header to the scroller. Bound so its own height is the handover threshold. -->
										<h2
											class="dest body-title"
											bind:this={bodyTitleEl}
											style:font-size={destSize(port.title)}
										>
											<SplitFlap text={port.title} base={160} stagger={45} />
										</h2>
									{/if}
									{@render appBody(v)}
								</div>
							{/if}
						{/key}
					{/if}
				</div>
				{#if v.code === 'PUD' && isMobile}
					<!-- IPR mobile controls key, in $lib/RangerKey: the dense bar's global controls
				     gather into a floating key at the bottom-left, because the narrow bar has no
				     room for them. The page still owns all three verbs and the settings card. -->
					<RangerKey
						bind:open={pudFabOpen}
						paused={ranger.paused}
						settingsOpen={pudSettings}
						icon={PORT_ICONS['PUD'] ?? ''}
						pauseIcon={ranger.paused ? PLAY_SVG : PAUSE_SVG}
						homeIcon={HOME_SVG}
						gearIcon={GEAR_SVG}
						onPause={togglePaused}
						onHome={() => home()}
						onSettings={() => (pudSettings = !pudSettings)}
					/>
				{/if}
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
				in:fly={isMobile
					? { y: 24, duration: 250, delay: 400 }
					: { x: 24, duration: 250, delay: 400 }}
				out:fly={isMobile ? { y: 24, duration: 180 } : { x: 24, duration: 180 }}
				aria-label="Reopen {airports[last].title}"
				title="Reopen {airports[last].title}"
				onclick={() => board(last)}>{@html ARROW_LEFT_SVG}</button
			>
		{/if}
	</div>
{/if}

<!-- THE TOAST AND THE EDIT BAR ARE THE PAGE'S, NOT THE STAGE'S — outside both look branches, so
     they are drawn whichever chrome is on screen.
     They used to sit INSIDE the stage, and the toast was therefore unreachable in the one case it
     mattered most: "Reset to defaults" clears `ksh-look` too, so the reset returns the site to
     Pixelite and unmounts the stage in the SAME TICK the toast is raised. Measured at 150ms and at
     4s — it never appeared at all, so a reset gave no confirmation whatever on the default theme.
     Nothing about their placement depended on the stage: both are `position: fixed` with their own
     z-index (50 and 60), so they sit exactly where they did. -->
{#if dev && editMode}
	<div class="edit-bar" role="toolbar" aria-label="Edit mode actions">
		<span class="edit-flag">Edit mode</span>
		<button type="button" class="edit-btn discard" onclick={discardEdits}>Discard &amp; exit</button
		>
		<button type="button" class="edit-btn save" onclick={saveEdits}>Save &amp; exit</button>
	</div>
{/if}
{#if toast}
	<!-- Drops in from above the top edge and lifts back out the same way. Distances are small —
	     it's a notice, not an entrance — and both collapse to a plain fade under reduced motion. -->
	<div
		class="edit-toast"
		role="status"
		in:fly={{ y: reduce ? 0 : -18, duration: reduce ? 140 : 280 }}
		out:fly={{ y: reduce ? 0 : -12, duration: reduce ? 120 : 200 }}
	>
		{toast}
	</div>
{/if}

<style>
	.stage {
		position: fixed;
		inset: 0;
		/* …and sized to the VISIBLE viewport, not the layout one. `inset: 0` alone resolves
		   against the layout viewport, which on iOS is the tall one — the height the page has
		   when Safari's toolbars are collapsed. With them expanded the stage is taller than
		   what you can actually see, so the panel hangs below the fold and its control bar
		   rides up out of view as the toolbar animates: the bar reads as "not sticky" when in
		   fact the whole frame is off. dvh tracks the visible height as the toolbars move.
		   The vh line stays as the fallback for anything without dvh; a browser that
		   understands the second simply takes it. */
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		/* The default background: pure white in light, pure black in dark — or the time-of-day
		   sky gradient when sky mode is opted into. Kept here (not --page) so the backdrop is a
		   clean white/black the stars sit on, independent of the theme's softer
		   page-field token, and so it matches the panel's own pure stock exactly. */
		background: var(--sky, light-dark(#ffffff, #000000));
	}
	/* Pixelite: the stage only mounts as the full apps' floor, and its world is paper — never
	   the sky. Without this the Aeropalite skybox (gradient, photo, stars) shows on load and
	   around the full apps until their own chrome covers it. */
	:global(html[data-look='pixelite']) .stage {
		background: var(--page, light-dark(#fbfbfb, #0e0e10));
	}
	/* …and the document must not bounce under them. Same rule the docs shell states for itself
	   (see DocsShell's :has(.docs) note) and the same reasoning, because the stage makes the same
	   bargain: fixed, inset 0, 100dvh, overflow hidden — it OWNS the visible viewport and nothing
	   overflows the window, so the page never scrolls. iOS Safari rubber-bands the document
	   regardless, on any drag it has no other use for, and every one of these apps is a full
	   screen of things you drag: the board's rows, the Builder's columns and its inspector sheet,
	   the Star Map's sky. When an inner scroller reaches its end, or a pan lands somewhere the app
	   does not claim, the whole frame heaves — and it takes Safari's URL bar with it, which changes
	   dvh mid-gesture and resizes the stage under the finger. The inner scrollers' own
	   `overscroll-behavior: contain` cannot reach this: a chain that ends at the VIEWPORT is not a
	   chain any of them are on.
	   Scoped by data-look AND :has, which together say exactly "a full app is standing": under
	   Pixelite the stage mounts only as a full app's floor (see the block above, and stageFullApp),
	   and under Aeropalite this does not match at all — the map keeps its own behaviour, as it did
	   before this rule existed.
	   Both arms carry the data-look, and on the body arm that is not dressing: .stage exists on
	   EVERY Aeropalite page, so a bare body:has(.stage) would have caught the whole map world —
	   and the body's value is the one the viewport takes when the root's is auto. */
	:global(html[data-look='pixelite']:has(.stage)),
	:global(html[data-look='pixelite'] body:has(.stage)) {
		overscroll-behavior: none;
	}

	/* Content surface — the destination page. Header stays put; body scrolls, so
	 * the surface holds substantial content while the stage height stays locked. */
	.surface {
		position: absolute;
		top: 0;
		right: 0;
		height: 100%;
		/* The masthead keeps ITS OWN COLUMN: on middling desktop widths the old
		   min(94vw, 640px) opened the sheet clear across the masthead. The 620px reserve
		   covers the masthead's WIDEST row — the wordmark plus its theme dots, ~592px at
		   full clamp (the dots are part of the masthead; a 560px reserve sliced the red
		   one). The sheet takes what's left, floored so panel content stays usable; below
		   the floor+reserve (960px) the bottom sheet takes over (isMobile). KEEP IN STEP
		   with the decor clip's inset. */
		width: clamp(340px, calc(100vw - 620px), 640px);
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
	/* Bubble keeps its own material: frosted acrylic — a translucent tint with a real backdrop
	   blur. Flat's glass is a flat wash with no live filter; Bubble's is glass you can tell is
	   glass. (This rule went missing for a moment when the glass landed, and Bubble quietly lost
	   its blur — the `glass` suite caught it.)
	   NO --panel-sheen here, deliberately: the edge-kiss gloss says "here is this surface's lip",
	   and a full-height panel HAS no lip — its top edge is the viewport's. The light read as a
	   stray glow pinned to the top of the screen. The aero feel stays in the blur, the tint, and
	   the family gloss every control wears; the sheen still belongs to the CARDS, whose lips are
	   real. */
	:global(html[data-ui='bubble']) .surface-backdrop {
		background: var(--panel-fill);
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
	/* GENERATED, not copied: once the photo's colours are sampled (paintPhotoGradient),
	   the pane paints its own gradient instead of a blurred copy of the picture — the
	   copy's fixed-attachment alignment betrayed itself on every resize. The rule above
	   stays as the fallback for a photo the canvas can't read. */
	:global(html[data-sky-photo][data-photo-grad]) .surface-backdrop::before {
		background-image: var(--photo-grad);
		background-attachment: scroll;
		filter: none;
		transform: none;
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
	/* The Location backdrop, filling the panel interior behind the ranger's chrome. It's
	   absolutely positioned inside .surface-scroll (already position: relative), so it sits
	   above the panel's own fill — .surface-backdrop is a SIBLING that comes BEFORE .surface-scroll
	   in the DOM, so this scroller's children paint over it. */
	/* THE ONE RULE THE SCENERY LEFT BEHIND, and it belongs here: these are the PAGE's elements.
	   An absolutely-positioned layer paints ABOVE its static in-flow siblings, so left alone the
	   scene ($lib/LocaleScenes, written just before the chrome in the markup) would cover the head
	   and body it is meant to sit behind. Lifting the chrome to position: relative makes them
	   positioned too, and among positioned siblings with auto z-index DOM ORDER wins: the scene is
	   written first (behind), the chrome after (in front). No z-index needed. (PudIdle's settings
	   card pins to .pud, its own relative ancestor, so naming these positioning contexts doesn't
	   disturb it.) */
	.surface-head.bar,
	.surface-body.ranger {
		position: relative;
	}
	/* Scenery pulled the panel's solid ground out from under the glass: 5% ink over a dark
	   scene is a card you can't find, and light-theme ink can't read against space. Mixing
	   the face toward PAPER hands every control back a local page to sit on — both themes,
	   panel-wide, the scene still glowing through the rest. A color swap costs nothing;
	   it's blur that's expensive, and this adds none.
	   Pulled back from the first cut's 62% to 45%: less paper, so the cards give a little
	   contrast back to stay GLASS rather than reading as flat chips. The lost contrast is
	   worth it — it's just a game — and the material below the face now does the separating:
	   the bubble gloss and air on every card, and true backdrop-blur on the four big ones. */
	.surface-head.bar,
	.surface-body.ranger {
		/* THE OPALITE — the shard's own light (GEM_OPAL_SVG's stops: iced blue, lilac, a pink
		   edge — day arms and night arms both), blended once here so every surface that
		   catches it — the cards, the bar's pill, the mining band's aeropalite trough — pours
		   from the same stone and cannot drift. Theme-aware like the gem itself. */
		--opalite: light-dark(
			color-mix(in srgb, color-mix(in srgb, #a8cbe8 55%, #c9b5e4) 75%, #eab8d4),
			color-mix(in srgb, color-mix(in srgb, #7fa8d9 55%, #a08ed6) 75%, #d290bb)
		);
		/* Split by theme, because the mix's BASE differs in what it has to do. Light theme:
		   paper is white, and 45% of it grounds the cards against the daylit forest. Dark
		   theme planetside: paper is pure BLACK, and 45% black glass over a night forest was
		   cards you had to squint for — so the dark arm derives from INK instead, a light
		   frost lifted off the scene (puhig's own 5%-ink face, poured thicker). Orbit is
		   untouched by this: its override below restates the paper mix against its indigo. */
		--aero-face: light-dark(
			color-mix(in srgb, var(--paper) 45%, transparent),
			/* The night face: OPALITE light over night-black glass — the cards drink from the
			   same stone as the shard (GEM_OPAL_SVG's night stops: iced blue, lilac, a pink
			   edge), so the panel's one gem and its glass agree on what light is. The body is
			   a neutral cold black poured deep (68%), the card itself nearly night; the
			   contrast is the opalite's alone, a thin pour (10%) caught in dark glass. Knobs:
			   the stop blend, the 10% pour, the body's 68%. */
			color-mix(in srgb, var(--opalite) 10%, color-mix(in srgb, #05070a 68%, transparent))
		);
	}
	/* The BAR wears a THINNER face than the cards. Its scrolled pill carries real backdrop
	   blur — the one piece of chrome where the glass genuinely frosts what slides beneath —
	   so the blur does the separating and the face only tints; at the cards' strength the
	   night frost read as a lamp across the top of the panel. Mildly translucent instead:
	   the deck moves visibly under the glass. (Orbit's override below still outranks this,
	   so the ship's bar keeps its indigo cut.) */
	.surface-head.bar {
		--aero-face: light-dark(
			color-mix(in srgb, var(--paper) 24%, transparent),
			/* The pill catches the same opalite as the cards, poured THINNER (8% into a 40%
			   night body vs the cards' 10-into-68): the bar is the one glass with real blur
			   behind it, so it stays airier and lets the frosted deck read through. */
			color-mix(in srgb, var(--opalite) 8%, color-mix(in srgb, #05070a 40%, transparent))
		);
	}
	/* IN ORBIT the chrome stops being the PAGE's and becomes the SHIP's. Planetside the panel is
	   a lit page over daylit ground; aboard the courier it hangs in the void, and a white raft
	   against space reads as a mistake — so the panel joins the scene's colour world. One line
	   does it: color-scheme flips every light-dark() token in puhig's family to its NIGHT arm —
	   ink to light, edges and the aero face re-derive from that flipped ink — even when the app's
	   theme is light. Those tokens read --ink at use time (--line-edge, --aero-face are ink
	   mixes), so they follow the scheme with no per-component edits. Then one --paper override
	   hands the dark its cast: not neutral black but the sky's own indigo, so the glass reads as
	   cut FROM the space it floats on rather than laid over it.
	   The backdrop rides along too, and it has to: .surface-backdrop is a SIBLING of the scroll
	   that holds the head and body, so the flip on those two doesn't reach it — and it's the panel's
	   actual FILL (the head and body are transparent, background: none). Left out, its --panel-fill
	   (a light-dark rgba) and --panel-glass (a --paper mix) would stay the light arm under a light
	   theme: dark indigo cards stranded on a 75%-white sheet, the exact raft-against-void this
	   fixes. So it carries the same class and inherits the same two overrides. */
	.surface-head.bar.orbit,
	.surface-body.ranger.orbit,
	.surface-backdrop.orbit {
		color-scheme: dark;
		color: var(--ink);
		/* LocaleSpace's dark-arm gradient at the radial's bright centre (72% 18%, where the panel
		   floats) is #0a1020 — the most indigo of its three stops and a step up from the void-edge
		   #030409. Taking it as paper cuts the glass from exactly the sky behind it. */
		--paper: #0a1020;
		/* And the face restated as the plain paper mix: the planetside rule above splits its
		   face by theme (dark derives from ink so night-forest cards don't drown), but in orbit
		   the indigo paper IS the point — the glass keeps its cast from the sky it floats on. */
		--aero-face: color-mix(in srgb, var(--paper) 45%, transparent);
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
		   layer image. (No --panel-sheen here either — same reasoning as the compact rule:
		   a full-viewport surface has no lip for an edge kiss to light.) */
		background:
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
	/* Pixelite never slides the panel — the manual's pages turn, they don't drive in. The only
	   move that reaches this class there is full app → full app (see navigate's pixeliteFade):
	   the panel stays mounted across it, so there is no in:panelIn / out:fly crossfade to carry
	   the change and the leaving phase does it instead, by dipping to nothing. Both spellings,
	   for the same reason the phone block below needs both: the desktop .surface.expanded.leaving
	   translate outranks a plain .surface.leaving, and every Pixelite full app is expanded. */
	:global(html[data-look='pixelite']) .surface.leaving,
	:global(html[data-look='pixelite']) .surface.expanded.leaving {
		transform: none;
		opacity: 0;
	}
	@media (prefers-reduced-motion: no-preference) {
		.surface {
			/* transform only — width is never animated: expanding SWAPS the size while the
			   panel is off-stage (see toggleExpand), because any on-screen geometry change
			   of the blurred surface makes WebKit re-rasterise the blur per frame. */
			transition: transform 300ms cubic-bezier(0.6, 0, 0.3, 1);
		}
		/* Pixelite's leaving phase is a fade, so opacity is what has to be animated there.
		   transform stays listed: the panel can carry one from a prior look before a swap. */
		:global(html[data-look='pixelite']) .surface {
			transition:
				transform 300ms cubic-bezier(0.6, 0, 0.3, 1),
				opacity 300ms ease;
		}
	}

	/* On phones the panel is a bottom sheet: full width, anchored to the bottom, and
	   it slides down (rather than off to the right) both to close and between stops. */
	@media (max-width: 960px) {
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
		/* Reserve a foot so the ranger's own content never hides beneath the fixed controls
		   key at the bottom-left. */
		.surface-body.ranger {
			padding-bottom: calc(40px + 1.75rem);
		}
		/* Both spellings, because the desktop .surface.expanded.leaving (translateX) outranks
		   a plain .surface.leaving here — without the second selector an EXPANDED panel
		   (Star Map, the Builder) slid off to the right while every other sheet went down. */
		.surface.leaving,
		.surface.expanded.leaving {
			transform: translateY(100%);
		}
		/* The sheet arrives from and leaves through the BOTTOM, so every board's Back arrow
		   points the way the panel will go: down. One rule for all of them — each Back
		   button says what it is in its aria-label. */
		:global(button[aria-label^='Back'] svg) {
			transform: rotate(-90deg);
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
		   ONE clamp on every side, so the header is evenly framed all round. */
		padding: clamp(1.5rem, 4vw, 2.5rem);
	}
	/* ── The DENSE bar (BAR_HEADER) ── E-ATFC's recipe, borrowed wholesale: one --bar-inset
	   drives the padding AND the row's gap, so the Back cap sits in an evenly-framed pocket
	   with equal space above, below, left, and to the title (see .tfc-head.bar).
	   A full-viewport app spends its vertical space on content, so the header's generous
	   2.5rem frame and the wordmark-scale title below it both go: the title moves INTO the row
	   at bar scale, and what it used to occupy goes back to the app. */
	.surface-head.bar {
		--bar-inset: clamp(0.7rem, 1.3vw, 1rem);
		padding: var(--bar-inset);
		/* OVERLAID on the scroller, not stacked above it. In flow, the bar's translucency was a
		   lie the eye caught immediately: nothing ever passed BEHIND the bar — its glass only
		   sampled the panel's static fill, and no face percentage could make content appear
		   where content never went. Absolute over the body (whose padding-top below reserves
		   exactly this bar's height), the rows genuinely slide under the pill and the blur
		   finally has something to frost. */
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 2;
		/* Its own view-transition group, like the dashboard sections have: left to the root
		   snapshot, the bar's recolor between deployments cut hard while everything around it
		   crossfaded — named, its old and new light swap in an isolated pair on the same beat. */
		view-transition-name: pud-bar;
		/* The pill's geometry is worn even while flat — a radius with no face, no edge and no
		   inset is invisible, and a border that's merely transparent holds the box's size — so
		   the scrolled state is a change of MATERIAL, not of layout: nothing pops, the corners
		   are simply revealed. */
		border: 1px solid transparent;
		border-radius: 999px;
		/* The MOVE springs, the MATERIAL fades: margin rides the app's one overshoot curve
		   (puhig --spring) so the pill lands with a small bounce — both lifting off and
		   settling back — while the face, edge and shadow cross on a plain ease; light
		   overshooting reads as a glitch, geometry overshooting reads as weight. */
		transition:
			margin 0.35s var(--spring),
			background-color 0.25s ease,
			border-color 0.25s ease,
			box-shadow 0.25s ease,
			color 0.45s ease;
	}
	/* Scrolled, the bar lifts OFF the panel: it pulls in from the edges, puts on the aero
	   material (face, rim gloss, drop — the bubble family's one light, see puhig base.css),
	   and floats as a long pill over the content sliding by below. The glass blur matches the
	   settings card's, so the two pieces of PUD chrome read as one stock. */
	.surface-head.bar.scrolled {
		/* …and steps DOWN off the viewport edge by the same beat it steps in from the sides: a
		   pill flush against the browser chrome reads as stuck to it, not floating off it. */
		margin-top: var(--bar-inset);
		margin-inline: var(--bar-inset);
		background: var(--aero-face);
		border-color: var(--line-edge);
		box-shadow: var(--aero-gloss), var(--aero-drop);
		-webkit-backdrop-filter: blur(6px) saturate(1.3);
		backdrop-filter: blur(6px) saturate(1.3);
	}
	/* Pixelite: the ranger's bar wears the manual's frost, not the aero pill. Flat and
	   full-width like the docs and traffic superbars — the same page-mix face over the same
	   8px blur once content has scrolled under it, a hairline rule at its bottom edge, and
	   none of the pill's moves: no lift-off margins, no rounded ends, no gloss. (--page is a
	   light-dark pair, so in orbit the same frost cuts from the night side via the subtree's
	   color-scheme flip.) */
	:global(html[data-look='pixelite']) .surface-head.bar {
		border-radius: 0;
		/* The site's ONE bar height — 42px exactly, matching the docs superbar (which pins
		   the same number): fixed, not padding-derived, so no content rounding can drift it.
		   Flex centring seats the row; the horizontal inset stays the slim 0.7rem. */
		--bar-inset: 0.7rem;
		box-sizing: border-box;
		height: 42px;
		padding-block: 0;
		display: flex;
		align-items: center;
		/* The frost is WORN AT REST, not put on at scroll — the bar floats over live scenery
		   (forest, orbit) from the first frame, so there's always something real behind the
		   blur, and a bar that changed material mid-scroll read as two bars. */
		background: color-mix(in srgb, var(--page) 78%, transparent);
		border-bottom: 1px solid var(--pixel-hairline);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		transition:
			background-color 0.2s ease,
			border-color 0.2s ease,
			color 0.45s ease;
	}
	/* The row fills the fixed-height bar and centres its keys — no overhang trims needed
	   now that the height is pinned rather than content-derived. */
	:global(html[data-look='pixelite']) .surface-head.bar .head-row {
		flex: 1;
		min-width: 0;
	}
	/* The bar ARRIVES rather than popping: an expanded arrival mounts content only after
	   the held surface lands (holdContentForArrival), and everything below the bar settles
	   in on the app's own cascade — the bar, with no entrance of its own, just appeared.
	   It takes the docs pages' settle beat. Pixelite-only: the aero bar is transparent at
	   rest, so it never popped. */
	@media (prefers-reduced-motion: no-preference) {
		:global(html[data-look='pixelite']) .surface-head.bar {
			animation: pixel-bar-settle 0.45s ease backwards;
		}
	}
	@keyframes pixel-bar-settle {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	/* Scrolled changes nothing material now — this rule only holds the aero scrolled state's
	   moves at bay (its pill margins, face, gloss and 6px blur share the selector). */
	:global(html[data-look='pixelite']) .surface-head.bar.scrolled {
		margin: 0;
		background: color-mix(in srgb, var(--page) 78%, transparent);
		border-color: transparent;
		border-bottom: 1px solid var(--pixel-hairline);
		box-shadow: none;
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
	}
	/* The row's gap is NOT --bar-inset. E-ATFC spends that inset on its FRAME and on the space
	   between its big groups (ident / deck / corner); the controls inside a cluster sit much
	   closer — 6.4px between field pills, 8px between the Home/collapse/refresh caps. Handing
	   the full 16px to Back↔badge↔title made this bar's buttons sit twice as far apart as the
	   bar it's copying. 0.5rem is the caps' own beat, and matches .head-actions on the right so
	   both ends of the row are spaced alike. */
	.surface-head.bar .head-row {
		gap: 0.5rem;
	}
	/* THE EDITOR'S BAR IS EVENLY INSET, and on one rhythm. Its vertical inset is a consequence
	   of the pinned Pixelite bar height and the 28px control line — (42 − 28) / 2 = 7px — so the
	   horizontal is set to match rather than left at the 11.2px it inherited, which framed the
	   row differently side to side than top to bottom.
	   The row's gap is THE SAME STEP THE KEYS KEEP between themselves inside a group, so the space
	   either side of a separator is the space between two keys. At a wider gap the clusters sat a
	   beat further apart than their own contents.
	   IT MUST NAME THAT STEP RATHER THAN RESTATE IT. This was written as a literal `0.4rem` copied
	   out of the rack, and when the rack moved onto the scale the bar stayed behind — the same
	   copy-instead-of-name fault that put the docs superbar's search key outside its own bar. Both
	   are `--space-8` now, and neither can drift without the other. */
	.surface-head.bar.te-bar {
		/* 6px, not 7, and off the scale on purpose: the bar wears a 1px transparent border (the
		   pill's geometry, kept even while flat), so the inset a control actually gets is the
		   border plus the padding. Vertically that comes to 1 + 6 = 7px, which is itself
		   (42 − 28) / 2 — the bar's height less the control line. The horizontal padding matches at
		   6 so both read as 7. Structural, like the 7px it derives from: it is the arithmetic
		   between two sizes, not a step in a rhythm. */
		padding-inline: 6px;
	}
	.surface-head.bar.te-bar .head-row {
		gap: var(--space-8);
	}
	.surface-head.bar .head-title {
		font-size: clamp(1.15rem, 1.5vw, 1.5rem);
		/* NOT E-ATFC's 1.05, and the difference matters here: that title is a plain .dest, but
		   .head-title carries `overflow: hidden` (puhig) so it can clip before the discs do when
		   the row runs tight. A 1.05 box is shorter than the glyphs are tall, so the overflow
		   took the descenders with it — the "g" in "Intergalactic Park Ranger" came off at the
		   bottom. This leaves room for them. It costs the bar nothing: the row's height is set
		   by the 42px Back and badge, not by this line.
		   1.55, measured, not guessed: Jost's ink box runs ~1.51em (34px of ink in a 22.5px
		   line), so 1.3 still cropped 2.4px off the top and bottom. */
		line-height: 1.55;
		/* The title inherits its ink, and inherited colour doesn't transition on its own — so when
		   orbit flips the bar's scheme the word "Intergalactic Park Ranger" would SNAP light while
		   the cards below eased. On browsers with View Transitions the root snapshot crossfades it;
		   this is the glide for the fallback path, on the panel's 0.45s recolour beat. */
		transition: color 0.45s ease;
	}
	/* The body's own inset — E-ATFC's exact value, so the two apps sit their content the same
	   distance off the edge. Deliberately WIDER than the bar's --bar-inset: the board does the
	   same, keeping its chrome tight to the corner while its rows breathe. */
	.surface-head.bar + .surface-body {
		/* Both insets are published here, because the app inside needs the DIFFERENCE: the
		   settings card is drawn in this body but springs from a button in the bar, and the two
		   sit at different distances from the edge. Naming them lets the card line up with its
		   button at any width instead of guessing a pixel count that only holds at one. */
		--app-inset: clamp(1.5rem, 4vw, 2.75rem);
		--bar-inset: clamp(0.7rem, 1.3vw, 1rem);
		padding-inline: var(--app-inset);
		padding-bottom: 2rem;
		/* The overlaid bar's height, reserved: 42px row + the inset above and below it + the
		   1px border either side. The body starts where the in-flow bar used to end, so the
		   app sits exactly where it always did — until it scrolls, and rows pass under glass. */
		padding-top: calc(44px + 2 * var(--bar-inset));
	}
	/* THE TEXT EDITOR takes the body EDGE TO EDGE. Every other app in here is content laid on the
	   panel and wants the panel's frame around it; an editor is a WORKING SURFACE, and a band of
	   inset around a sheet of paper is a band of screen not being written on. Its own panes carry
	   the padding the words actually need (--te-pad, inside each one), so the inset out here was
	   simply being paid twice — and the bottom padding sat under a running foot that is pinned to
	   the bottom of the app, holding it 2rem clear of the edge for no reason at all.
	   The top reserve is the MEASURED bar rather than the 44px guess above it: this bar holds a row
	   of 28px keys, not a 42px cap, and the difference was a visible strip of dead paper between
	   the keys and the first line of the document. */
	/* KEYED ON THE BODY, NOT ON THE BAR BEING ITS SIBLING. It was `.surface-head.bar + …`, and that
	   held only while a bar was drawn — below 820px the editor's head is not rendered at all now,
	   the adjacent-sibling never matched, and the editor quietly fell back to the panel's own
	   `0 24px 48px`. On a 390px screen that is 48px of width taken off a working surface and 48px
	   of dead paper under it, which is precisely what this rule exists to prevent. The top reserve
	   below still needs the bar, so IT keeps the sibling and this does not.
	   BOTH SELECTORS, and that is not belt-and-braces. `.surface-head.bar + .surface-body` above is
	   (0,3,0) and sets the very padding this is undoing, so the bare `.surface-body.editor` at
	   (0,2,0) loses to it wherever a bar IS drawn — measured, the wide editor came back inset by
	   44px. The sibling form wins there at (0,4,0); the bare form is for the case where no bar is
	   rendered, and there the rule it has to beat does not match either. */
	.surface-head.bar + .surface-body.editor,
	.surface-body.editor {
		padding-inline: 0;
		padding-bottom: 0;
		/* The bar's MEASURED height, reserved. This went back and forth and the reasoning is worth
		   keeping: with no reserve the columns ran under the bar and the frost had something to
		   frost, which is what a superbar is for — but it also meant the gutter that frames every
		   column was invisible along the top, hidden behind the glass, so three of the four sides
		   were framed and the fourth only appeared to be.
		   Reserving it puts the whole desk below the bar, so all four sides of every column are
		   framed alike. The trade is that nothing passes beneath the glass any more: the frost
		   now sits over the gutter rather than over moving text. Even framing was the ask; the
		   frost is what was given up for it. */
	}
	/* …and the top reserve is the BAR'S, so it is the one thing here that still asks whether there
	   is a bar. With no head there is no sibling to match, the editor starts at the top of the
	   panel, and the desk gets the row back — which is the whole point of dropping the bar at this
	   width. */
	.surface-head.bar + .surface-body.editor {
		padding-top: var(--bar-h, calc(44px + 2 * var(--bar-inset)));
	}
	/* The header's control row: Back at the left, a panel's own action (Weather's search) at the
	   right. It replaces the bare Back button, so the gap below it is the one Back used to set.
	   Positioned and raised: the city search's results drop DOWN from this row across the title
	   below it, and the title row — later in the DOM — otherwise paints over the list (the
	   hits' own z-index can't reach; it's scoped inside this row's stacking). */
	.head-row {
		position: relative;
		z-index: 3;
		display: flex;
		align-items: center;
		/* flex-start + a gap, not space-between: the left controls (Back, and — the new
		   header model — the app badge beside it) CLUSTER at the left, while a panel's own
		   right-hand actions push away with margin-left:auto below. Equivalent to the old
		   space-between for panels that only have the two ends, but it also lets a second
		   left-side control sit next to Back. */
		gap: 0.5rem;
	}
	.head-actions {
		margin-left: auto;
	}
	.head-row .back {
		margin-bottom: 0;
	}
	/* The fixed controls NEVER shrink — .icon-btn has no flex-shrink of its own, so when the
	   grown search and the outgoing compact title briefly overflow the row (mid-transition on
	   a phone), the discs got squished. Pin them; the title absorbs the squeeze instead
	   (below). */
	.head-row .back,
	.head-row .app-badge {
		flex: none;
	}
	/* The right-hand actions CAN shrink (but not grow). A growing search field springs open
	   with an overshoot; on a phone its left edge hits the Back+badge cluster mid-spring, and
	   the leftover overshoot used to spill PAST the right edge (an 8px outward bounce). Letting
	   this cluster shrink lets the field itself absorb that overflow instead — right edge stays
	   pinned, discs stay rigid. Harmless where the field is rigid (Weather's stays flex:none)
	   or where there's room (desktop never overflows, so nothing shrinks). */
	.head-row .head-actions {
		flex: 0 1 auto;
		min-width: 0;
	}
	/* …but the DISCS inside it don't shrink. That allowance is for a growing search FIELD, which
	   is elastic by design; an icon button is a circle, and letting it absorb the squeeze turned
	   the Park Ranger's gear into a 28x42 oval on a phone (26x42 at 360px) while everything else
	   stayed round. The field still takes the overflow — it's the only elastic thing left in the
	   cluster, which is what the allowance was always for. */
	.head-actions > .icon-btn {
		flex: none;
	}
	/* The beta chip rides the TITLE now (right after it, part of the name), not the actions
	   cluster — but it must still never shrink: on a tight bar the long title clips first
	   (.head-title's overflow: hidden), and the tag stays whole beside it. */
	.head-row > .beta {
		flex: none;
	}
	/* The panel's own actions, clustered at the right end of the Back row. */
	.head-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	/* (The Beta tag's own sizing among these actions moved with it into $lib/BetaTag, which is
	   where the element is now. It still has to match the CONTROLS it stands beside rather than
	   shrink to its own type — see the note there.) */
	/* The unit disc speaks its unit in type, not a glyph — same 42px disc as its kin. */
	.unit-btn {
		font-size: 0.9rem;
		font-weight: 700;
	}
	/* ── Phone: the collapsed super bar. The fold itself is the SHARED recipe in puhig's
	   base.css (.csb / .csb-on / .csb-fold / .csb-row / .csb-title / .csb-dot — grown on
	   the ATFC board); only this panel's seasoning lives here. */
	@media (max-width: 960px) {
		/* The fold takes ~105px from the header — hand the SAME length back to the body
		   as phantom bottom room. Without it, a barely-overflowing panel collapses, loses
		   most of its scroll range to the taller body, clamps back under the reopen
		   threshold, and the header pulses straight open again (Weather at phone height
		   lived exactly there). With it, collapsing never shrinks what's scrollable, so
		   the hysteresis alone is enough. */
		.head-collapsed + .surface-body {
			padding-bottom: calc(3rem + 106px);
		}
	}

	/* Icon-circle back control (shared .icon-btn); only its placement is set here. The gap
	   below it (to the title) matches the header's top/left edge inset, so the back
	   button sits in an evenly-framed pocket rather than crowding the text below it. */
	.back {
		align-self: flex-start;
		margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
	}
	/* Title + its accent bullet. Baseline-aligned so the dot rests on the title's text
	   baseline, exactly like the masthead's bullets beside "Kashinoga" and ATFC's dot
	   beside "Air Traffic". */
	.title-row {
		display: flex;
		align-items: baseline;
		/* One fixed beat between title and bullet, every masthead the same — the old
		   clamp let the gap swell past a full dot-width on desktop. */
		gap: 0.5rem 0.75rem;
		flex-wrap: wrap;
	}
	.title-row .dest {
		flex: none;
	}
	/* Centred against the title, not baseline-aligned — the same way E-ATFC seats its own
	   bullet beside "Air Traffic" (.bar .head-refresh: align-self center). align-self wins
	   over the title-row's align-items: baseline. */
	.dot-wrap {
		display: inline-block;
		font-size: 0;
		align-self: center;
	}
	/* Station-sign bullet, now a mark-holder. RESTING state (and what reduced-motion
	   shows): a light accent wash holding the place's mark — the app-card icon squircle at
	   bullet scale. inline-block gives the wrapper its bottom-edge baseline; grid centres
	   the mark. */
	.accent-dot {
		position: relative;
		display: inline-grid;
		place-items: center;
		/* Sized to the title's lowercase height: the dot wears the title's font-size (set
		   inline), and 0.47em is Jost's x-height (its "s" measures ~0.455em; the CSS `ex`
		   unit runs larger than the real glyph, so it's spelled as an em fraction here). */
		width: 0.47em;
		height: 0.47em;
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		vertical-align: baseline;
	}
	/* The SOLID accent disc — the bullet's arrival face. It sits over the light wash and
	   fades away as the dot settles (see dot-settle), revealing the wash and the mark. At
	   rest it's gone (opacity 0). */
	.accent-dot::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 999px;
		background: var(--accent);
		opacity: 0;
	}
	.accent-mark {
		display: grid;
		place-items: center;
		width: 62%;
		height: 62%;
		color: var(--accent);
	}
	.accent-mark :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
	/* Bubble: the aero family's rim light and drop — see the masthead's brand dots. */
	:global(html[data-ui='bubble']) .accent-dot {
		box-shadow: var(--aero-gloss), var(--aero-drop);
	}
	@media (prefers-reduced-motion: no-preference) {
		/* Rolls in from the left with a little bounce as the title flips — same easing,
		   duration and delay as the masthead dots and ATFC's. */
		.accent-dot {
			animation: dot-in 0.45s var(--spring) 0.5s backwards;
		}
		/* Then it SETTLES: once the roll-in lands (~0.95s), the solid arrival disc fades
		   out and the mark rises in — a solid dot becoming a marked, lightly-washed circle. */
		.accent-dot::before {
			animation: dot-solid-out 0.4s ease 0.95s backwards;
		}
		.accent-mark {
			animation: dot-mark-in 0.4s var(--spring) 0.95s backwards;
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
	/* The arrival disc holds solid through the roll-in (backwards fill), then fades. */
	@keyframes dot-solid-out {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}
	/* The mark waits out the roll-in blank, then pops in on the family spring. */
	@keyframes dot-mark-in {
		from {
			opacity: 0;
			transform: scale(0.5);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* .app-badge / .head-title / .body-title — the new header model's recipe — moved to puhig's
	   base.css, because the Traffic board builds its own bar and needs the same badge. Only the
	   title bullet's aero arrival face stays here; the bullet itself is still the page's. */
	:global(html[data-ui='bubble']) .accent-dot::before {
		box-shadow: var(--aero-gloss);
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
		/* Trim the line box to the BASELINE at the bottom: at wordmark scale, line-height 1
		   still leaves the font's descent space below the glyphs, so the header's (equal)
		   bottom padding LOOKED bigger than its top. Now the padding is measured from the
		   baseline, so top and bottom read even. Descenders overhang into the pad, as they
		   should. (Progressive: browsers without text-box-trim keep the old, slightly loose
		   bottom — no worse than before.) */
		text-box-trim: trim-end;
		text-box-edge: cap alphabetic;
	}
	.surface-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		/* NO top padding: spacing flows top-down — the header's bottom padding is the gap
		   between masthead and content, and the body doesn't restate it (.tfc-body agrees). */
		padding: 0 clamp(1.5rem, 4vw, 2.75rem) 3rem;
		display: flex;
		flex-direction: column;
		gap: 1.05rem;
		/* The scroll shade's canvas: an inset shadow on a scroller pins to the BOX, so it
		   sits exactly under the stay-put header once content has passed beneath it. */
		transition: box-shadow 0.25s ease;
	}
	/* Content has gone under the header — the ATFC board's own tell (.tfc-body.scrolled),
	   worn by every panel now the header no longer folds to mark the scroll. A breath of
	   shade, not a drawn band: long blur, light hand. At every width. */
	.surface-body.scrolled {
		box-shadow: inset 0 26px 22px -22px light-dark(rgba(8, 10, 14, 0.15), rgba(0, 0, 0, 0.35));
	}
	/* …except under the dense bar, whose scrolled answer is the pill above: the bar itself
	   lifts and floats to say "content has gone under", and a shade beneath a floating pill
	   would be saying it twice. */
	.surface-head.bar + .surface-body.scrolled {
		box-shadow: none;
	}
	/* E-COPO: expanded, the Court reads as a CENTRED column — the docket is prose, and
	   full-viewport line lengths are unreadable. Head and body share the measure so the
	   title sits over its own column. Sized to the content, not generously: the court's
	   prose caps itself at 62ch and holds a shared LEFT edge, so a wider column just
	   accumulated slack on the right (under the expand disc) and the reading sat left of
	   centre. 42rem ≈ that 62ch plus the body's side padding — the column hugs what it
	   holds, so centring the column centres the words. */
	.surface.expanded .surface-head.court,
	.surface.expanded .surface-body.court {
		width: 100%;
		max-width: 42rem;
		margin-inline: auto;
	}
	/* A long docket scrolls; classic scrollbars carve their lane out of one side and
	   would nudge the centred column off by half a bar. Reserve both edges instead. */
	.surface.expanded .surface-body.court {
		scrollbar-gutter: stable both-edges;
	}
	/* The Park Ranger opens full-viewport, and a full viewport stretched its requisition rows
	   to ~1400px — the rig's name at one edge and its price at the other, with a field of
	   nothing between. So it centres a measure, the Court's answer to the same problem.
	   Wider than it was: the app lays out in TWO columns now (the game left, the ledger in its
	   own column at the top right — see .pud), so the cap has to hold both without either being
	   squeezed. It stays a cap rather than full-bleed so the rows don't run the width of an
	   ultrawide display. */
	/* FULL BLEED, like E-ATFC — no centred measure at all. This used to cap at 84rem and centre,
	   which at 1600px put the app's left edge 144px in while the board it's modelled on starts
	   at 40px: nearly four times the inset, and most of it invisible margin rather than breath.
	   The cap made sense when the app was one column of stretched rows; it lays out in two now,
	   so the width goes to the columns instead of to the gutters. The inset is the board's own
	   (clamp(1.5rem, 4vw, 2.75rem), applied below) rather than the bar's tighter one — the same
	   split E-ATFC keeps between its bar and its rows. */
	.surface.expanded .surface-body.ranger {
		scrollbar-gutter: stable both-edges;
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
	/* A code listing in the panel voice — quiet ink wash, the data font, its own scroll. */
	.surface-body pre {
		margin: 0.4rem 0;
		padding: 0.85rem 1rem;
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border: 1px solid var(--line-edge);
		border-radius: 8px;
		overflow-x: auto;
		/* Contain overscroll — no chain to the page (the iOS scroll-lock). */
		overscroll-behavior: contain;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		line-height: 1.6;
		color: var(--ink);
	}
	/* A nav flyout's copy — the panel body's voice at card scale (see navPop). */
	.pop-copy h3 {
		margin: 0 0 0.55rem;
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--ink);
	}
	.pop-copy p {
		margin: 0 0 0.55rem;
		font-size: 0.95rem;
		line-height: 1.5;
		color: var(--ink);
	}
	.pop-copy blockquote {
		margin: 0.8rem 0 0;
		padding-left: 1rem;
		border-left: 3px solid var(--ink);
		font-size: 1.05rem;
		font-style: italic;
		color: var(--ink);
	}
	/* The onward cards sit closer in the card than in a panel body — the pop is already
	   a tight reading, and the body's 1.75rem read as a hole in it. */
	.pop-copy .app-cols {
		margin-top: 1rem;
	}

	/* ── Panel arrival — the depth cascade (see puhig's --enter-* tokens) ─────────────────
	   The sheet flies in first (transition:fly, layer 0). Then the layer sitting on it — the
	   header's chrome — rides in at --enter-lead. Then the layer deeper still, the
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
	   (ul.app-cards, div.segmented, div.sky-picker) — never a button — so the transform only ever
	   lands on an ancestor; the chrome buttons get their own horizontal entrance below. */
	@media (prefers-reduced-motion: no-preference) {
		/* The body content, a layer past the chrome — it fills the sheet the frame just drew. */
		.surface-body > * {
			animation: rise 0.5s ease backwards;
			animation-delay: calc(
				var(--enter-lead) + var(--enter-layer) + var(--n, 0) * var(--enter-step)
			);
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
		/* Every control on the head row rides in on the chrome ripple — Back leads (--bn 0),
		   then the app badge and any right-hand actions fall in behind it, left to right, on
		   the family spring. (The badge's own mark-settle plays a beat later, once it's
		   landed — see .app-badge.) */
		.surface-head .back,
		.surface-head .app-badge,
		.surface-head .head-actions .icon-btn {
			animation: btn-in 0.42s var(--spring) backwards;
			animation-delay: calc(var(--enter-lead) + var(--bn, 0) * var(--btn-enter-step));
		}
		.surface-head .app-badge,
		.surface-head .head-actions .icon-btn {
			--bn: 1;
		}
		/* …EXCEPT on the text editor's dense bar, where this corner is not second from the left but
		   last on the right. Everything between is the rack's, and it rides in on this same ripple
		   (see the entrance block in $lib/TextEditorRack) — so at --bn 1 the Settings key landed
		   while the marks were still arriving, which read as the bar assembling out of order. Past
		   the rack's last index, so the row finishes where it ends. */
		.surface-head.bar.te-bar .head-actions .icon-btn {
			--bn: 8;
		}
	}

	/* Edit Mode — editable copy gets a dashed field; focus firms it up. */
	.editable {
		outline: 1px dashed color-mix(in srgb, var(--ink) 35%, transparent);
		outline-offset: 3px;
		border-radius: 3px;
		cursor: text;
		transition:
			outline-color 0.15s ease,
			background 0.15s ease;
	}
	.editable:hover {
		background: color-mix(in srgb, var(--ink) 4%, transparent);
	}
	.editable:focus {
		outline: var(--focus-ring);
		background: var(--aero-face);
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
		transition:
			opacity 0.15s ease,
			background 0.15s ease;
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
		transition:
			opacity 0.15s ease,
			background 0.15s ease,
			border-color 0.15s ease;
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
		/* Mixed with PAPER, not transparent — the toast floats over page content, and at
		   92% alpha the text beneath read through it (same fix as the board's .tip). */
		background: color-mix(in srgb, var(--ink) 92%, var(--paper));
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
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
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
		border-top: 1px solid transparent;
		border-image: var(--rule-fade) 1;
	}
	/* …but not on the first group: the line above it is already drawn (by the header's own bottom
	   border, or by the big title now sitting at the top of the body), and a second one right
	   beneath reads as a double rule.
	   TWO selectors, because the first group stopped being :first-child when the big title moved
	   into the scrolling body — the title holds that slot now, and the group behind it started
	   drawing a rule it has never had. `.body-title +` covers the panels on the header model;
	   :first-child still covers a body with no title above it. */
	.stg-group:first-child .seg-lead,
	.body-title + .stg-group .seg-lead {
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
	/* The full-viewport panel's Settings grid: settings has more width than a single column of
	   controls needs, so the groups flow into as many ~19rem tracks as fit (two or three on a wide
	   desktop). Grid, not multicol: a group is one cell, so it can never split across a column the
	   way multicol's break rules let a note orphan. Collapses to one track on a narrow measure.
	   The Pixelite docs sheet lays Settings out the same way — .docs-settings in $lib/DocsBody,
	   which is where that copy lives now that the sheet is built there. The track recipe is the
	   only thing the two agree on (the rules under each one tune them against each other), but it
	   IS shared: change one, change the other. */
	.surface.expanded .settings {
		display: grid;
		/* min(19rem, 100%) so a single track collapses to the container on a narrow phone rather
		   than overflowing it (a bare 19rem minimum can't shrink); no effect on the wide panel. */
		grid-template-columns: repeat(auto-fill, minmax(min(19rem, 100%), 1fr));
		align-content: start;
		gap: 1.75rem 2.75rem;
	}
	/* The per-lead divider line reads as a stray rule atop a grid cell, so the groups separate by
	   the grid gap alone; the lead that led each group no longer needs its top border. */
	.surface.expanded .settings .stg-group > .seg-lead,
	.surface.expanded .settings .stg-group > p {
		border-top: none;
		padding-top: 0;
		margin-top: 0;
	}
	/* The panel levels leads to a two-line floor so controls line up across a grid row even when
	   one lead wraps and its neighbour doesn't. The docs grid doesn't need it — its leads are all
	   one line — and the floor only opened a gap under each header, so docs opts out (it top-aligns
	   its groups and tightens the lead→control step instead; see DocsBody). */
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
		transition:
			border-color 0.15s ease,
			background 0.15s ease,
			color 0.15s ease;
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

	/* ── Onward cards ─────────────────────────────────────────────────────────────────────────── */
	/* A panel's onward destinations as its real content (see PANEL_CARDS): one card per stop,
	   each carrying its own mark. Flat, like the panels themselves — an edge and the station's
	   accent, no shadow. */
	/* The columns stack by default — one above the other on a phone and in the narrow nav
	   flyout — which is why the split that fills them has to be contiguous: stacked, they
	   read back as the one alphabetical list (see cardSplit). */
	.app-cols {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1.75rem;
	}
	.app-cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem; /* gap, not margins — nothing to collapse, nothing to trail */
	}
	/* Desktop: the two lists sit side by side, each card its natural height and the shorter
	   column ending where it ends — the Pinterest board the cards had under CSS columns,
	   minus the WebKit paint bug that cost the second column (see the appCards snippet).
	   `align-items: flex-start` keeps the lists from stretching to a common height; scoped
	   to the panel BODY so the flyout (About's Work/Projects) stays stacked. */
	@media (min-width: 961px) {
		.surface-body .app-cols {
			flex-direction: row;
			align-items: flex-start;
		}
		.surface-body .app-cols > .app-cards {
			flex: 1 1 0;
			min-width: 0; /* flex items floor at content width without it; the blurbs would push wide */
		}
	}
	/* A card's own dress. It is worn in two places — the Apps PANEL (two .app-cards columns) and
	   the Apps docs SHEET (one auto-fill grid) — and it is the same card in both, so it is styled
	   here beside the appCards snippet that builds it. Only the sheet's LAYOUT of them is
	   elsewhere: .app-page in $lib/DocsBody, with the sheet it lays them on. */
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
		background: var(--aero-face);
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
		/* The cards ride the universal button spring, but at card size the standard 5%
		   pop is a 30px lurch — soften both amounts; the spring itself is shared. */
		--btn-hover-scale: 1.015;
		--btn-press-scale: 0.99;
	}
	/* FLAT keeps the station-accent hover; Bubble hovers like every aero control — the
	   family gloss brighten and face firming, no orange (see the bubble hover lists). */
	:global(html:not([data-ui='bubble'])) .app-card:focus-visible {
		border-color: var(--card-accent);
		background: color-mix(in srgb, var(--card-accent) 8%, transparent);
	}
	/* Hover accent is fine-pointer only — see the spring note; on touch a scroll
	   would drag this station colour from card to card and leave it stuck. Focus
	   (above) stays universal for the keyboard. */
	@media (hover: hover) {
		:global(html:not([data-ui='bubble'])) .app-card:hover {
			border-color: var(--card-accent);
			background: color-mix(in srgb, var(--card-accent) 8%, transparent);
		}
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
	/* Bubble: the squircle joins the aero family — the same rim light and airy drop the
	   brand dots wear. The GLYPH stays reicon-flat; the material does the aero (that's
	   the deal everywhere: a flat icon pack, moulded by the surface it sits on). */
	:global(html[data-ui='bubble']) .app-ico {
		box-shadow: var(--aero-gloss), var(--aero-drop);
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
		right: clamp(1.5rem, 5vw, 3.5rem); /* the masthead's inset — see .sky-console */
		top: calc(50% - 21px); /* half the 42px disc */
		z-index: 40;
	}
	/* On the phone the panel is a bottom sheet, so its bubble waits where the sheet comes
	   from: bottom-centre, with the arrow turned to point up. */
	@media (max-width: 960px) {
		.icon-btn.reopen {
			top: auto;
			right: auto;
			left: calc(50% - 21px); /* half the 42px disc */
			/* The sky console's exact bottom (its own clamp, not a near-miss): the two
			   discs share the stage's bottom edge, so they share a baseline. */
			bottom: clamp(1.5rem, 5vw, 3.5rem);
		}
		/* reicon has no arrow-up-circle; the back disc turned a quarter IS one (the disc
		   is symmetric). Rotated on the svg, not the button — the hover pop owns the
		   button's transform. */
		.icon-btn.reopen :global(svg) {
			transform: rotate(90deg);
		}
	}
</style>
