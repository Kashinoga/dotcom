<script lang="ts">
	import { onMount } from 'svelte';
	import {
		SUN_SVG,
		MOON_SVG,
		CLOUD_SUN_SVG,
		MOON_CLOUD_SVG,
		CLOUD_SVG,
		CLOUD_RAIN_SVG,
		CLOUD_BOLT_SVG,
		CLOUD_SNOW_SVG,
		FOG_SVG,
		WIND_SVG,
		PLUS_SVG
	} from '$lib/icons';
	import {
		weather,
		current,
		load,
		show,
		closeTab,
		openSearch,
		restore,
		reorder,
		weatherKind
	} from '$lib/weather-state.svelte';
	import CitySearch from '$lib/CitySearch.svelte';
	import { flip } from 'svelte/animate';

	// Current conditions from the National Weather Service, for any US city.
	//
	// The cities and the reading live in $lib/weather, not here: the SEARCH is drawn in the panel's
	// header (see CitySearch), which is the page's, not this component's — so neither can own the
	// state they share. This component is the body: the tabs, and the reading of whichever is up.
	//
	// US only, and that's the API's boundary rather than a shortcut — NWS covers the United States
	// and its territories, full stop. It's free and keyless in exchange, and the city search is
	// filtered to match, so it never offers a place the app can't then report on.
	// Pixelite docs mode fills the current-conditions row with a pixel "sky window" on the right
	// (the wide full-bleed layout otherwise leaves that third empty). Aeropalite renders Weather in
	// a ~640px panel with no empty third, so it passes docs=false and gets its arrangement unchanged.
	let { docs = false }: { docs?: boolean } = $props();

	const place = $derived(current());
	const now = $derived(weather.readings[place.id] ?? null);
	// Named `phase`, not `state`: a local called `state` shadows the $state rune.
	const phase = $derived(weather.status[place.id] ?? 'loading');

	// ── The pixel sky window (Pixelite docs mode) ──────────────────────────────────────────────
	// A small framed viewport that paints the CITY's sky, REUSING the homepage stage's per-phase
	// gradient palette (packages/puhig base.css :root[data-sky=…] → --sky) and the stage's day/night
	// phase idea — but at a coarse pixel scale on our own tiny canvas, with chunky particles driven
	// by the current condition. The stage's DOM (full-viewport layer + star field) isn't reused;
	// its PALETTE and phase logic are.
	type Phase = 'dawn' | 'morning' | 'noon' | 'dusk' | 'night';
	// The gradient stops lifted verbatim from base.css's --sky per phase (top → mid → bottom).
	const SKY_STOPS: Record<Phase, [number, number, number][]> = {
		dawn: [
			[246, 205, 184],
			[231, 211, 228],
			[219, 230, 242]
		],
		morning: [
			[188, 216, 241],
			[216, 232, 246],
			[234, 242, 251]
		],
		noon: [
			[158, 201, 239],
			[196, 224, 246],
			[230, 242, 252]
		],
		dusk: [
			[124, 74, 94],
			[74, 58, 106],
			[28, 24, 48]
		],
		night: [
			[22, 32, 58],
			[13, 20, 36],
			[9, 13, 24]
		]
	};
	// The CITY's local hour, read straight off the forecast ISO string (…T22:00:00-05:00): the wall
	// clock is written in the city's own offset, so new Date() (which renormalises to the viewer's
	// timezone) would give the wrong hour. now.night (the API's day/night flag) picks the dark
	// phases; the hour refines the light ones.
	function cityHour(): number {
		const iso = now?.hours?.[0]?.t ?? now?.observedAt ?? '';
		const m = iso.match(/T(\d{2}):/);
		return m ? +m[1] : 12;
	}
	const skyPhase = $derived.by<Phase>(() => {
		if (!now) return 'noon';
		const h = cityHour();
		if (now.night) return h >= 17 && h < 21 ? 'dusk' : 'night';
		if (h < 8) return 'dawn';
		if (h < 11) return 'morning';
		return 'noon';
	});
	const skyKind = $derived(now ? weatherKind(now.conditions) : 'cloudy');
	const cityClockLabel = $derived.by(() => {
		const m = now?.hours?.[0]?.t?.match(/T(\d{2}):/);
		if (!m) return '';
		let h = +m[1];
		const ap = h >= 12 ? 'PM' : 'AM';
		h = h % 12 || 12;
		return `${h} ${ap}`;
	});
	const skyCaption = $derived(['Local sky', cityClockLabel, skyPhase].filter(Boolean).join(' · '));

	// The canvas is a fixed, DPR-independent pixel grid — that's the point; CSS upscales it with
	// image-rendering: pixelated, so the pixels stay chunky at any size.
	// Doubled from the first 64×36 to 128×72 (still 16:9): more pixels for finer art — twice the
	// gradient steps, longer rain, denser stars, and room for real pixel silhouettes (lumpy
	// clouds, a notched sun, a crescent moon) rather than the old plain rects.
	const CW = 128;
	const CH = 72;
	let skyCanvas = $state<HTMLCanvasElement | undefined>(undefined);
	let skyFrame = $state<HTMLElement | undefined>(undefined);
	type Particle = {
		x?: number;
		y?: number;
		v?: number;
		len?: number;
		ph?: number;
		amp?: number;
		w?: number;
		h?: number;
		sun?: boolean;
		moon?: boolean;
		star?: boolean;
		tw?: boolean;
		big?: boolean;
		cloud?: boolean;
		ghost?: boolean;
		/* A stratus deck cloud's lumps: [dx, dy, r] per disc, rolled once in seed() so the
		   band's shape holds frame to frame (the render loop must stay deterministic). */
		lumps?: [number, number, number][];
	};
	let particles: Particle[] = [];
	let flash = 0;
	// The storm's lightning: a jagged 1px path, re-carved fresh each time the flash fires so no
	// two strikes land alike. Drawn only through the bright half of the flash's decay.
	let bolt: [number, number][] = [];
	let raf = 0;
	let looping = false;
	let inView = false;
	const skyReduceMotion = () =>
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	// A field of particles per condition — counts (and speeds) roughly double with the doubled grid,
	// so the scene reads as finer art rather than the old one stretched: more rain and stars, longer
	// streaks, bigger clouds. Cheap to run, charming to watch.
	function seed() {
		const rnd = Math.random;
		const kind = skyKind;
		const night = !!now?.night;
		const p: Particle[] = [];
		if (kind === 'rain' || kind === 'storm' || kind === 'snow') {
			// Precipitation FALLS FROM somewhere: a deck of STRATA along the top — three long
			// bands, each a run of overlapping discs with per-lump jitter (rolled here, held
			// through the loop), drifting slowly at slightly different speeds. The first cut
			// pinned lumpy pxClouds half off the frame, and what survived the clip was their
			// flat slab: a bar with circles on top. These live wholly inside the frame, so the
			// ragged tops and shaded undersides are the silhouette. Pushed first so the falling
			// particles draw over their base — leaving the deck, not the frame's edge.
			// The deck wears the CLOUDY blobs' construction (the shapes that earned it): SIX
			// sine-arched masses of dense overlapping discs — big lumps mid-cloud, tapering
			// ends — two per depth layer, overlapping along the top so real valleys open
			// between cloud masses. h carries each blob's DEPTH LAYER (0 far … 2 near): its
			// own tone pair in render(), sitting a step lower and drifting a touch faster
			// when nearer. Pushed LAYER BY LAYER (far first) so paint order is depth order;
			// the slots interleave across the width so each layer still spans the frame.
			// render() also lays a far-tone CEILING band under all of them, so the valleys
			// between blob tops reveal the layer behind — never bare sky through the top. */
			for (let layer = 0; layer < 3; layer++) {
				for (let k = 0; k < 2; k++) {
					const slot = k * 3 + layer;
					const w = 34 + ((rnd() * 16) | 0);
					const ch = 12 + ((rnd() * 4) | 0);
					const lumps: [number, number, number][] = [];
					const ln = Math.max(8, (w / 4) | 0);
					for (let j = 0; j < ln; j++) {
						const t = j / (ln - 1);
						const arc = Math.sin(Math.PI * t);
						lumps.push([
							t * w + (rnd() * 4 - 2),
							-(arc * ch * 0.35) + (rnd() * 2 - 1),
							3 + arc * ch * 0.4 + rnd() * 1.5
						]);
					}
					p.push({
						cloud: true,
						h: layer,
						x: -8 + slot * (CW / 6) + rnd() * 8,
						y: 4 + layer * 2 + rnd() * 3,
						v: 0.03 + layer * 0.025 + rnd() * 0.02,
						w,
						lumps
					});
				}
			}
		}
		if (kind === 'rain' || kind === 'storm') {
			const n = kind === 'storm' ? 40 : 28;
			for (let i = 0; i < n; i++)
				p.push({
					x: rnd() * CW,
					y: 12 + rnd() * (CH - 12),
					v: 1.6 + rnd() * 1.5,
					len: 6 + ((rnd() * 4) | 0)
				});
		} else if (kind === 'snow') {
			// A few fatter flakes (a stubby pixel plus) among the fine ones.
			for (let i = 0; i < 30; i++)
				p.push({
					x: rnd() * CW,
					y: 10 + rnd() * (CH - 10),
					v: 0.3 + rnd() * 0.4,
					ph: rnd() * 6.28,
					amp: 0.8 + rnd() * 1.4,
					big: rnd() < 0.25
				});
		} else if (kind === 'fog') {
			// The sun (or moon) first, as a pale ghost the haze half-swallows; then the banks,
			// bottom-up — amp carries each bank's density, thinning with height. Each bank
			// rolls a CREST line (the cloud lumps' idiom, halved): hump positions/radii along
			// its top, spaced with small gaps so the edge reads as wisps, not a dashed rule.
			p.push({ ghost: true, x: CW * 0.72, y: CH * 0.2 });
			for (let i = 0; i < 6; i++) {
				const crests: [number, number, number][] = [];
				for (let cx = 0; cx < CW + 12; cx += 6 + ((rnd() * 5) | 0))
					crests.push([cx, 0, 2 + ((rnd() * 3) | 0)]);
				p.push({
					x: rnd() * CW,
					y: CH - 8 - i * 9,
					v: (rnd() < 0.5 ? -1 : 1) * (0.08 + rnd() * 0.1),
					ph: rnd() * 6.28,
					amp: 1 - i * 0.11,
					lumps: crests
				});
			}
		} else if (kind === 'wind') {
			for (let i = 0; i < 16; i++)
				p.push({
					x: rnd() * CW,
					y: 6 + rnd() * (CH - 12),
					v: 1.1 + rnd() * 1.5,
					len: 8 + ((rnd() * 6) | 0)
				});
		} else if (kind === 'cloudy' || kind === 'partly') {
			const n = kind === 'partly' ? 4 : 6;
			for (let i = 0; i < n; i++) {
				const w = 22 + ((rnd() * 16) | 0);
				const h = 9 + ((rnd() * 5) | 0);
				// The deck strata's lump construction, arched into a free blob: dense overlapping
				// discs whose radius and lift follow a sine across the width — big in the middle,
				// tapering to the ends — so the cloud reads as one rounded mass, not a slab with
				// bumps (the old pxCloud) and not a row of separate circles.
				const lumps: [number, number, number][] = [];
				const ln = Math.max(6, (w / 4) | 0);
				for (let j = 0; j < ln; j++) {
					const t = j / (ln - 1);
					const arc = Math.sin(Math.PI * t);
					lumps.push([
						t * w + (rnd() * 4 - 2),
						-(arc * h * 0.35) + (rnd() * 2 - 1),
						3 + arc * h * 0.4 + rnd() * 1.5
					]);
				}
				p.push({ x: rnd() * CW, y: 6 + rnd() * (CH * 0.5), v: 0.06 + rnd() * 0.09, w, h, lumps });
			}
			if (kind === 'partly' && !night) p.push({ sun: true, x: CW * 0.22, y: CH * 0.26 });
			if (kind === 'partly' && night) {
				// The night half of "partly": the moon where the day's sun stands, and a thinner
				// star field than clear night's (the clouds own part of the sky).
				p.push({ moon: true, x: CW * 0.22, y: CH * 0.26 });
				for (let i = 0; i < 18; i++)
					p.push({
						star: true,
						x: rnd() * CW,
						y: rnd() * CH * 0.6,
						ph: rnd() * 6.28,
						tw: rnd() < 0.5,
						big: rnd() < 0.1
					});
			}
		} else {
			// clear
			if (night) {
				p.push({ moon: true, x: CW * 0.74, y: CH * 0.24 });
				// A few four-point "big" stars among the field — the same one-in-eight sparkle the
				// sun's rays give the day.
				for (let i = 0; i < 32; i++)
					p.push({
						star: true,
						x: rnd() * CW,
						y: rnd() * CH * 0.72,
						ph: rnd() * 6.28,
						tw: rnd() < 0.55,
						big: rnd() < 0.12
					});
			} else p.push({ sun: true, x: CW * 0.72, y: CH * 0.28 });
		}
		particles = p;
	}

	// The precipitation deck's depth-layer tones, far → near (index = a blob's p.h). Shared
	// by the blobs AND the ceiling band render() lays under them, so the sealed top edge is
	// exactly the farthest layer's light.
	const DECK_TONES: Record<string, [string, string][]> = {
		storm: [
			['rgb(110 118 140)', 'rgb(84 92 112)'],
			['rgb(92 100 124)', 'rgb(66 74 96)'],
			['rgb(74 82 106)', 'rgb(52 58 80)']
		],
		snow: [
			['rgb(214 222 234)', 'rgb(184 192 208)'],
			['rgb(200 208 222)', 'rgb(166 176 194)'],
			['rgb(184 194 210)', 'rgb(148 158 178)']
		],
		rain: [
			['rgb(152 162 182)', 'rgb(124 134 156)'],
			['rgb(132 144 168)', 'rgb(102 112 136)'],
			['rgb(112 124 150)', 'rgb(82 92 118)']
		]
	};

	const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
	function bandColor(stops: [number, number, number][], pos: number) {
		const [s0, s1, s2] = stops;
		const [c0, c1, tt] = pos < 0.5 ? [s0, s1, pos / 0.5] : [s1, s2, (pos - 0.5) / 0.5];
		return [
			Math.round(lerp(c0[0], c1[0], tt)),
			Math.round(lerp(c0[1], c1[1], tt)),
			Math.round(lerp(c0[2], c1[2], tt))
		];
	}

	// ── Pixel-art drawing helpers ── a handful of shape routines the render loop leans on, so the
	// silhouettes are real (round disc, notched sun, crescent moon, lumpy cloud) instead of plain
	// rects. All draw in whole pixels on the fixed buffer; the current fillStyle is the caller's.
	type Ctx = CanvasRenderingContext2D;
	// A filled disc, drawn as horizontal spans — the bounding box's corners fall outside the radius,
	// so the circle is naturally corner-notched, exactly the pixel-art read we want.
	function disc(ctx: Ctx, cx: number, cy: number, r: number) {
		cx |= 0;
		cy |= 0;
		for (let dy = -r; dy <= r; dy++) {
			const span = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
			ctx.fillRect(cx - span, cy + dy, span * 2 + 1, 1);
		}
	}
	// A stubby half-disc rising from a flat baseline — one hump of a cloud.
	function hump(ctx: Ctx, cx: number, base: number, r: number) {
		cx |= 0;
		base |= 0;
		for (let dy = -r; dy <= 0; dy++) {
			const span = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
			ctx.fillRect(cx - span, base + dy, span * 2 + 1, 1);
		}
	}
	// The sun: a soft double halo, a bright notched disc, a paler core, and four short rays.
	function pxSun(ctx: Ctx, cx: number, cy: number, r: number, halo: boolean) {
		cx |= 0;
		cy |= 0;
		if (halo) {
			ctx.fillStyle = 'rgba(255,236,170,0.14)';
			disc(ctx, cx, cy, r + 4);
			ctx.fillStyle = 'rgba(255,240,190,0.20)';
			disc(ctx, cx, cy, r + 2);
			ctx.fillStyle = 'rgba(255,236,170,0.55)';
			for (const [dx, dy] of [
				[0, -1],
				[0, 1],
				[-1, 0],
				[1, 0]
			] as const) {
				ctx.fillRect(cx + dx * (r + 3), cy + dy * (r + 3), dx ? 2 : 1, dy ? 2 : 1);
			}
		}
		ctx.fillStyle = 'rgba(255,243,200,0.97)';
		disc(ctx, cx, cy, r);
		ctx.fillStyle = 'rgba(255,250,225,0.95)';
		disc(ctx, cx - 1, cy - 1, Math.max(1, r - 2));
	}
	// The moon, built to the sun's standard: a cool double halo (moonlight, so dimmer), the
	// crescent face, and crater pixels. The face is drawn per-pixel as the SET DIFFERENCE of the
	// disc and the offset carve circle — not by overpainting the carve in sky colour, which wiped
	// a flat notch through the halo behind it. The buffer is tiny; the loop is nothing.
	function pxMoon(ctx: Ctx, cx: number, cy: number, r: number) {
		cx |= 0;
		cy |= 0;
		ctx.fillStyle = 'rgba(214,224,245,0.10)';
		disc(ctx, cx, cy, r + 4);
		ctx.fillStyle = 'rgba(222,230,248,0.16)';
		disc(ctx, cx, cy, r + 2);
		const ox = cx + Math.round(r * 0.6);
		const oy = cy - Math.round(r * 0.35);
		ctx.fillStyle = 'rgba(232,236,245,0.96)';
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (dx * dx + dy * dy > r * r) continue;
				const ex = cx + dx - ox,
					ey = cy + dy - oy;
				if (ex * ex + ey * ey <= r * r) continue;
				ctx.fillRect(cx + dx, cy + dy, 1, 1);
			}
		}
		// Craters, kept to the lower-left so they stay on the lit face, clear of the carve.
		ctx.fillStyle = 'rgba(203,210,226,0.9)';
		ctx.fillRect(cx - 1, cy + 1, 1, 1);
		ctx.fillRect(cx - 2, cy - 1, 1, 1);
		ctx.fillRect(cx, cy + 3, 1, 1);
	}
	// (pxCloud — the slab with three humps — retired: every cloud is drawn from per-particle
	// LUMPS now, seeded once and painted as two disc passes; see the cloud branches in render.
	// hump() lives on as the fog banks' crest.)

	function render(ts: number, animate: boolean) {
		const ctx = skyCanvas?.getContext('2d');
		if (!ctx) return;
		const stops = SKY_STOPS[skyPhase];
		const kind = skyKind;
		const night = !!now?.night;
		// Fine horizontal bands of the phase gradient — 3px on the 72px buffer, so the sky steps
		// through ~24 shades (twice the old count) and reads as a smoother wash while staying banded.
		const BAND = 3;
		for (let y = 0; y < CH; y += BAND) {
			const [r, g, b] = bandColor(stops, Math.min(1, (y + BAND / 2) / CH));
			ctx.fillStyle = `rgb(${r} ${g} ${b})`;
			ctx.fillRect(0, y, CW, BAND);
		}
		const t = ts / 1000;
		// The precipitation deck's sealed CEILING: the farthest layer's light, laid under
		// every blob, so the valleys between cloud tops open onto the layer behind — never
		// bare sky peeking through the frame's top edge.
		if (kind === 'rain' || kind === 'storm' || kind === 'snow') {
			ctx.fillStyle = DECK_TONES[kind][0][0];
			ctx.fillRect(0, 0, CW, 6);
		}
		for (const p of particles) {
			if (p.star) {
				const a = p.tw ? 0.35 + 0.5 * Math.abs(Math.sin(t * 1.4 + (p.ph ?? 0))) : 0.85;
				const x = p.x! | 0,
					y = p.y! | 0;
				ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
				ctx.fillRect(x, y, 1, 1);
				if (p.big) {
					// a four-point star: dim arms off the core, twinkling with it
					ctx.fillStyle = `rgba(255,255,255,${(a * 0.45).toFixed(2)})`;
					ctx.fillRect(x, y - 1, 1, 1);
					ctx.fillRect(x, y + 1, 1, 1);
					ctx.fillRect(x - 1, y, 1, 1);
					ctx.fillRect(x + 1, y, 1, 1);
				}
			} else if (p.sun) {
				pxSun(ctx, p.x!, p.y!, 4, true);
			} else if (p.moon) {
				pxMoon(ctx, p.x!, p.y!, 5);
			} else if (p.ghost) {
				// The fog's sun/moon: a bare pale coin — the haze flattens halo, rays and all.
				ctx.fillStyle = night ? 'rgba(232,236,245,0.32)' : 'rgba(255,244,205,0.4)';
				disc(ctx, p.x!, p.y!, 4);
			} else if (p.cloud) {
				// The precipitation deck: the shade pass first, nudged down, then the lit pass
				// over it — every lump carries a shaded underside. Tones are OPAQUE (overcast
				// owns its light) so overlapping discs merge seamlessly, and each DEPTH LAYER
				// (p.h, set in seed) wears its own pair from DECK_TONES — far pale, near dark —
				// so overlapping blobs read as stacked masses. Storm darkest, snow palest.
				const [light, shade] = (DECK_TONES[kind] ?? DECK_TONES.rain)[Math.min(2, p.h ?? 0)];
				// The cloudy blobs' two-pass draw, no core band needed: the sine arc keeps each
				// mass cohesive on its own.
				const lumps = p.lumps ?? [];
				ctx.fillStyle = shade;
				for (const [dx, dy, r] of lumps) disc(ctx, p.x! + dx, p.y! + dy + 2, r | 0);
				ctx.fillStyle = light;
				for (const [dx, dy, r] of lumps) disc(ctx, p.x! + dx, p.y! + dy, r | 0);
				if (animate) {
					p.x! += p.v!;
					if (p.x! > CW) p.x = -(p.w ?? 46);
				}
			} else if (kind === 'rain' || kind === 'storm') {
				const x = p.x! | 0,
					y = p.y! | 0,
					len = p.len ?? 6;
				// two-tone drop: dim body, bright leading head — the streak reads as falling
				ctx.fillStyle = 'rgba(188,214,255,0.7)';
				ctx.fillRect(x, y, 1, len - 1);
				ctx.fillStyle = 'rgba(226,240,255,0.95)';
				ctx.fillRect(x, y + len - 1, 1, 1);
				if (animate) {
					p.y! += p.v!;
					// storm rain drives sideways; recycled drops re-enter at the cloud deck's base
					if (kind === 'storm') {
						p.x! += 0.35;
						if (p.x! > CW) p.x! -= CW;
					}
					if (p.y! > CH) {
						p.y = 12 - len;
						p.x = Math.random() * CW;
					}
				}
			} else if (kind === 'snow') {
				const x = (p.x! + Math.sin(t + (p.ph ?? 0)) * (p.amp ?? 0.5)) | 0;
				const y = p.y! | 0;
				ctx.fillStyle = 'rgba(255,255,255,0.9)';
				if (p.big) {
					// a stubby pixel plus — a fatter flake among the fine ones
					ctx.fillRect(x, y, 1, 1);
					ctx.fillRect(x, y - 1, 1, 1);
					ctx.fillRect(x, y + 1, 1, 1);
					ctx.fillRect(x - 1, y, 1, 1);
					ctx.fillRect(x + 1, y, 1, 1);
				} else ctx.fillRect(x, y, 1, 1);
				if (animate) {
					p.y! += p.v!;
					if (p.y! > CH) {
						p.y = 12;
						p.x = Math.random() * CW;
					}
				}
			} else if (kind === 'fog') {
				// A bank: the body band, a ragged dashed top edge, and a denser lump riding along
				// at double speed — the lump is what makes the drift visible on a full-width band.
				// amp (from seed) thins the banks with height, so the fog pools at the ground.
				const dense = p.amp ?? 1;
				const a = (0.2 + 0.12 * Math.abs(Math.sin(t * 0.6 + (p.ph ?? 0)))) * dense;
				const y = p.y! | 0;
				const off = Math.round(p.x!);
				ctx.fillStyle = `rgba(226,230,235,${a.toFixed(2)})`;
				ctx.fillRect(0, y, CW, 4);
				// The crest: half-disc humps riding the bank's top edge (base y−1, so they never
				// overlap the band and double the alpha), drifting with it — wisps, not dashes.
				ctx.fillStyle = `rgba(226,230,235,${(a * 0.85).toFixed(2)})`;
				for (const [dx, , r] of p.lumps ?? []) {
					const hx = ((((off + dx) % (CW + 12)) + CW + 12) % (CW + 12)) - 12;
					hump(ctx, hx, y - 1, r);
				}
				ctx.fillStyle = `rgba(232,236,240,${(a * 0.7).toFixed(2)})`;
				const lx = ((((off * 2) % (CW + 40)) + CW + 40) % (CW + 40)) - 40;
				ctx.fillRect(lx, y + 1, 34, 2);
				if (animate) {
					p.x! += p.v!;
					p.ph = (p.ph ?? 0) + 0.008;
				}
			} else if (kind === 'wind') {
				const x = p.x! | 0,
					y = p.y! | 0,
					len = p.len ?? 8;
				// two-tone streak: a dim tail behind a brighter head (the streak flies +x)
				ctx.fillStyle = 'rgba(230,236,244,0.3)';
				ctx.fillRect(x, y, len, 1);
				ctx.fillStyle = 'rgba(242,246,252,0.7)';
				ctx.fillRect(x + len - 3, y, 3, 1);
				if (animate) {
					p.x! += p.v!;
					if (p.x! > CW) {
						p.x = -(p.len ?? 8);
						p.y = 6 + Math.random() * (CH - 12);
					}
				}
			} else {
				// fair-weather cloud (cloudy / partly): the deck's same two-pass lump draw —
				// shade nudged down, light over it — in OPAQUE tones so overlaps merge clean.
				const [light, shade] = night
					? ['rgb(64 72 96)', 'rgb(40 46 66)']
					: ['rgb(252 253 255)', 'rgb(212 222 238)'];
				const lumps = p.lumps ?? [];
				ctx.fillStyle = shade;
				for (const [dx, dy, r] of lumps) disc(ctx, p.x! + dx, p.y! + dy + 2, r | 0);
				ctx.fillStyle = light;
				for (const [dx, dy, r] of lumps) disc(ctx, p.x! + dx, p.y! + dy, r | 0);
				if (animate) {
					p.x! += p.v!;
					if (p.x! > CW) p.x = -(p.w ?? 24);
				}
			}
		}
		if (kind === 'storm') {
			if (animate && Math.random() < 0.004) {
				flash = 1;
				// Carve this strike's path: 1px steps jittering down from the cloud deck. Step
				// heights run 3–5 against 4px segments, so the occasional 1px break reads electric.
				bolt = [];
				let bx = 16 + Math.random() * (CW - 32);
				for (let by = 10; by < CH - 8; by += 3 + ((Math.random() * 3) | 0)) {
					bolt.push([bx | 0, by]);
					bx += (Math.random() - 0.5) * 7;
				}
			}
			if (flash > 0) {
				ctx.fillStyle = `rgba(255,255,255,${(flash * 0.4).toFixed(2)})`;
				ctx.fillRect(0, 0, CW, CH);
				// the bolt burns through the bright half of the decay, then leaves the wash to fade
				if (flash > 0.45) {
					ctx.fillStyle = 'rgba(255,246,196,0.6)';
					for (const [x, y] of bolt) ctx.fillRect(x + 1, y, 1, 4);
					ctx.fillStyle = 'rgba(255,255,255,0.95)';
					for (const [x, y] of bolt) ctx.fillRect(x, y, 1, 4);
				}
				if (animate) flash = Math.max(0, flash - 0.08);
			}
		}
	}

	function loop(ts: number) {
		if (!looping) return;
		render(ts, true);
		raf = requestAnimationFrame(loop);
	}
	function startLoop() {
		if (looping) return;
		looping = true;
		raf = requestAnimationFrame(loop);
	}
	function stopLoop() {
		looping = false;
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	}
	// Run only when the window is on-screen, the tab is visible, motion is welcome, and there's a
	// reading to paint. Otherwise a single static frame stands (also the whole story under
	// prefers-reduced-motion — one frame, no loop).
	function syncLoop() {
		const should = inView && !document.hidden && !skyReduceMotion() && !!now && !!skyCanvas;
		if (should) startLoop();
		else {
			stopLoop();
			if (skyCanvas && now) render(performance.now(), false);
		}
	}

	// Reseed + repaint whenever the city or its sky changes (a static repaint even while paused).
	$effect(() => {
		if (!docs) return;
		// deps:
		skyKind;
		skyPhase;
		place.id;
		now;
		if (!skyCanvas) return;
		seed();
		render(performance.now(), false);
		syncLoop();
	});

	// Pause the loop when the window scrolls off-screen or the tab is hidden; resume on return.
	onMount(() => {
		if (!docs) return;
		const io = new IntersectionObserver(
			(entries) => {
				inView = entries[0]?.isIntersecting ?? false;
				syncLoop();
			},
			{ threshold: 0.05 }
		);
		if (skyFrame) io.observe(skyFrame);
		const onVis = () => syncLoop();
		document.addEventListener('visibilitychange', onVis);
		seed();
		render(performance.now(), false);
		return () => {
			io.disconnect();
			document.removeEventListener('visibilitychange', onVis);
			stopLoop();
		};
	});

	onMount(restore);

	// The strip scrolls, but nothing could scroll it. A mouse wheel scrolls VERTICALLY, the panel
	// swallowed that, and the scrollbar was hidden — so a fourth city sat cut off at the edge with no
	// way to reach it (a trackpad's sideways swipe worked, which is exactly the kind of "works for
	// me" that hides this). Now: the wheel moves it sideways, and the edges fade to show there's
	// more, which is the affordance the scrollbar used to be.
	let tabsEl = $state<HTMLElement | undefined>(undefined);
	let atStart = $state(true);
	let atEnd = $state(true);

	function measureTabs() {
		const el = tabsEl;
		if (!el) return;
		atStart = el.scrollLeft <= 1;
		atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
	}

	// The hours rail fades only toward the side that still hides content — the same
	// contract as the city tabs. A permanent left fade lied at scroll start, dimming
	// the first hour when there was nothing to scroll back to.
	let hoursEl = $state<HTMLElement | undefined>(undefined);
	let hoursAtStart = $state(true);
	let hoursAtEnd = $state(true);

	function measureHours() {
		const el = hoursEl;
		if (!el) return;
		hoursAtStart = el.scrollLeft <= 1;
		hoursAtEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
	}

	function onTabsWheel(e: WheelEvent) {
		const el = tabsEl;
		if (!el || el.scrollWidth <= el.clientWidth) return; // nothing hidden — let the panel scroll
		// A vertical wheel is the only wheel most mice have; treat it as "move along the strip".
		// Whichever axis is larger wins, so a trackpad's sideways swipe still works untouched.
		const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
		if (!delta) return;
		e.preventDefault();
		el.scrollLeft += delta;
	}

	// Drag the strip, too — the other way people move a row like this, and the only one that works
	// on a touchscreen without a fling. The catch is that the strip is made of BUTTONS: a drag that
	// ends on a tab would otherwise also click it and switch cities. So a press only becomes a drag
	// after it has actually moved (4px), and if it did, the click that follows is swallowed.
	let dragFrom = 0; // pointer x where the press started
	let dragScroll = 0; // where the strip was scrolled to then
	let dragging = $state(false);
	let dragged = false; // did this press ever move? (the click-swallowing flag)

	// HOLD a tab to carry it — the third gesture, and the reorder. It can't share the drag's
	// trigger (both are "press and move sideways"), so time disambiguates where distance can't:
	// a press that moves is the scroll, a press that HOLDS (280ms, still) lifts the tab, and
	// from there movement reorders instead of scrolling. Crossing a neighbour's midpoint swaps
	// the tabs (the FLIP on the strip slides them around the carried one); the drop is already
	// saved, because reorder() persists per swap like every other mutation in $lib/weather-state.
	let lift = $state<number | null>(null); // index of the tab being carried
	let holdTimer = 0;
	let pressX = 0;
	let pressY = 0;
	// The GHOST — a floating copy of the carried tab riding under the cursor, free in BOTH
	// axes even though the reorder only reads x: the hand sees what it's holding, and a drift
	// off the row doesn't snatch it away. It CANNOT live in the panel: .surface-body is a
	// scroller, and no z-index wins against an ancestor's overflow clip — carried up over the
	// masthead the ghost just vanished at the body's top edge. And the panel itself is no
	// better a home (its backdrop-filter makes it the containing block for any fixed child),
	// so the node is PORTALED to <body>: fixed, viewport coords, clipped by nothing.
	let ghostX = $state(0);
	let ghostY = $state(0);
	let ghostW = $state(0);
	let grabDX = 0; // where inside the tab the press landed — the ghost keeps that grip
	let grabDY = 0;

	function placeGhost(cx: number, cy: number) {
		ghostX = cx - grabDX;
		ghostY = cy - grabDY;
	}

	// The portal: the ghost's DOM node moves to <body> for its lifetime (Svelte still owns
	// it — scoped styles ride along on the element's own class, and teardown removes it).
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}
	// The swap slide's length — 0 under reduced motion: the entrance animations gate themselves
	// in CSS, but a JS-driven FLIP can't, so the preference is read here. (window-guarded: the
	// panel SSRs, and the sniff can be static — flipping the OS setting mid-visit is not a case
	// worth re-subscribing for.)
	const flipMs =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
			? 0
			: 220;

	function onTabsDown(e: PointerEvent) {
		const el = tabsEl;
		if (!el || e.button !== 0) return;
		dragged = false;
		pressX = e.clientX;
		pressY = e.clientY;
		// Arm the lift — only on a tab's name (the × keeps its own meaning), and only when
		// there's another tab to trade places with.
		const t = e.target as Element;
		const tab = t.closest?.('.wx-tab');
		if (tab && !t.closest('.wx-tab-x') && weather.places.length > 1) {
			const idx = Array.prototype.indexOf.call(el.querySelectorAll('.wx-tab'), tab);
			const rect = (tab as HTMLElement).getBoundingClientRect();
			const pid = e.pointerId;
			holdTimer = window.setTimeout(() => {
				holdTimer = 0;
				lift = idx;
				dragging = false; // the press is a carry now, never a scroll
				dragged = true; // and the click it would fire on release is swallowed
				// The ghost lifts from exactly where the tab sat, held by the point you pressed —
				// measured at the press, which is where the tab still is (holding still for 280ms
				// is what a hold IS).
				grabDX = pressX - rect.left;
				grabDY = pressY - rect.top;
				ghostW = rect.width;
				placeGhost(pressX, pressY);
				try {
					el.setPointerCapture(pid);
				} catch {
					/* pointer already gone — the up handler clears the lift */
				}
			}, 280);
		}
		if (el.scrollWidth <= el.clientWidth) return; // nothing to scroll to
		dragFrom = e.clientX;
		dragScroll = el.scrollLeft;
		dragging = true;
		// NOT captured here, deliberately. Capturing on press redirects the whole gesture to the
		// strip, so the click never reaches the tab underneath and a plain click stopped selecting a
		// city. Capture only once the press has actually become a drag (below).
	}

	function onTabsMove(e: PointerEvent) {
		if (lift !== null) return carry(e);
		// A press that wanders was never a hold — disarm the lift; this move is a scroll (or a
		// finger drifting on its way to a click, which the 4px floor below still forgives).
		if (holdTimer && Math.hypot(e.clientX - pressX, e.clientY - pressY) > 5) {
			clearTimeout(holdTimer);
			holdTimer = 0;
		}
		if (!dragging || !tabsEl) return;
		const dx = e.clientX - dragFrom;
		if (!dragged && Math.abs(dx) < 4) return; // still a click, not yet a drag
		if (!dragged) tabsEl.setPointerCapture(e.pointerId); // now it IS a drag — keep it on the strip
		dragged = true;
		tabsEl.scrollLeft = dragScroll - dx;
	}

	// The carry itself. The pointer is compared against the OTHER tabs' midpoints in the strip's
	// content space — offsetLeft, not getBoundingClientRect, because the FLIP animation is a
	// transform and a transformed rect would report the tab mid-slide: the midpoint chases the
	// swap and the pair oscillates under a stationary pointer. Layout positions hold still.
	function carry(e: PointerEvent) {
		const el = tabsEl;
		if (!el || lift === null) return;
		placeGhost(e.clientX, e.clientY); // the ghost follows the hand, both axes
		// Carrying against the faded edge walks the strip along — without this, a tab could
		// never be carried to a slot that's currently scrolled out of reach.
		const r = el.getBoundingClientRect();
		if (e.clientX < r.left + 28) el.scrollLeft -= 10;
		else if (e.clientX > r.right - 28) el.scrollLeft += 10;
		const x = e.clientX - r.left + el.scrollLeft;
		const kids = el.querySelectorAll('.wx-tab') as NodeListOf<HTMLElement>;
		let to = lift;
		for (let j = 0; j < kids.length; j++) {
			if (j === lift) continue;
			const mid = kids[j].offsetLeft + kids[j].offsetWidth / 2;
			if (j < lift && x < mid) to = Math.min(to, j);
			else if (j > lift && x > mid) to = Math.max(to, j);
		}
		if (to !== lift) {
			reorder(lift, to);
			lift = to;
		}
	}

	function onTabsUp(e: PointerEvent) {
		clearTimeout(holdTimer);
		holdTimer = 0;
		if (lift !== null) {
			// The drop. Order is already saved (reorder() persists per swap); just set it down.
			lift = null;
			if (tabsEl?.hasPointerCapture(e.pointerId)) tabsEl.releasePointerCapture(e.pointerId);
			return;
		}
		if (!dragging) return;
		dragging = false;
		if (tabsEl?.hasPointerCapture(e.pointerId)) tabsEl.releasePointerCapture(e.pointerId);
		// A drag that ends on a tab may or may not fire a click, depending on where it started and
		// finished. `dragged` is cleared by the click that follows if there is one, and by the next
		// press if there isn't — so a stray true can never swallow a later, genuine click.
	}

	function onTabsClick(e: MouseEvent) {
		if (!dragged) return;
		// The press moved: it was a drag, so it must not also pick a city.
		e.stopPropagation();
		e.preventDefault();
		dragged = false;
	}

	// Re-measure whenever the cities change (a tab added or closed changes what's hidden).
	$effect(() => {
		weather.places.length;
		requestAnimationFrame(measureTabs);
	});
	// Same for the hours rail: a city switch or fresh fetch changes how much it hides.
	$effect(() => {
		now?.hours?.length;
		requestAnimationFrame(measureHours);
	});

	// On touch, the strip's touch-action: pan-x hands horizontal panning to the browser — which
	// would cancel the pointer stream mid-carry and drop the tab. Once lifted, the native pan is
	// vetoed by preventDefault on touchmove; that needs a NON-passive listener, and Svelte
	// attaches ontouchmove passively, so this one is wired by hand.
	$effect(() => {
		const el = tabsEl;
		if (!el) return;
		const veto = (e: TouchEvent) => {
			if (lift !== null) e.preventDefault();
		};
		el.addEventListener('touchmove', veto, { passive: false });
		return () => el.removeEventListener('touchmove', veto);
	});

	// The prose→kind reading (keywords, priority, fallbacks) lives in $lib/weather-state's
	// weatherKind — shared with the homepage's weather dressing, so the two can't disagree
	// about what "Light Rain" means. This is just the kind→glyph half.
	function conditionIcon(text: string, night: boolean): string {
		switch (weatherKind(text)) {
			case 'storm':
				return CLOUD_BOLT_SVG;
			case 'snow':
				return CLOUD_SNOW_SVG;
			case 'rain':
				return CLOUD_RAIN_SVG;
			case 'fog':
				return FOG_SVG;
			case 'wind':
				return WIND_SVG;
			case 'clear':
				return night ? MOON_SVG : SUN_SVG;
			case 'partly':
				return night ? MOON_CLOUD_SVG : CLOUD_SUN_SVG;
			default:
				return CLOUD_SVG; // cloudy, overcast, and anything the API says that this doesn't know
		}
	}

	const temp = $derived(weather.unit === 'F' ? now?.tempF : now?.tempC);
	const feels = $derived(weather.unit === 'F' ? now?.feelsF : now?.feelsC);
	// "Feels like" is worth the line only when it disagrees with the reading — NWS sends a heat index
	// or wind chill whenever either applies, and within a degree it's just the temperature again.
	const feelsDiffers = $derived(
		typeof temp === 'number' && typeof feels === 'number' && Math.abs(feels - temp) >= 1
	);
	const compass = (deg: number) =>
		['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
	const clock = (iso: string) =>
		new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

	// ── "Is it nice out?" ── an honest verdict from what the sky is doing plus what it
	// feels like. Precedence: active precipitation speaks first (a lovely temperature in a
	// thunderstorm is not lovely), then heat, then imminent rain, then cold; only the quiet
	// middle earns "lovely". Bands are °F internally regardless of the display unit.
	const verdict = $derived.by(() => {
		if (!now) return '';
		const f = now.feelsF ?? now.tempF;
		if (f === null) return '';
		const kind = weatherKind(now.conditions || '');
		const wind = now.windMph ?? 0;
		const pop = now.hours?.[0]?.pop ?? 0;
		if (kind === 'storm') return 'Storming — not the hour for a walk';
		if (kind === 'snow')
			return f <= 20 ? 'Snow on real cold — bundle hard' : 'Snowing — boots and layers';
		if (kind === 'rain') return 'Raining — take a shell';
		if (f >= 103) return 'Dangerous heat — stay in the cool';
		if (f >= 92) return 'Hot out — shade and water';
		if (f >= 84) return 'Warm, on the sticky side';
		if (pop >= 55) return 'Dry for now, but rain is coming';
		if (f >= 62) return wind >= 20 ? 'Nice out, if blustery' : 'Lovely out';
		if (f >= 48) return wind >= 20 ? 'Brisk wind — layer up' : 'Cool — light-jacket weather';
		if (f >= 33) return 'Cold — coat weather';
		if (f >= 16) return 'Freezing — bundle up';
		return 'Bitter cold — keep it brief';
	});

	// ── The next hours ── helpers for the rail. Temps arrive in °F from the proxy; the
	// display unit converts at the last moment, same as the big number.
	const toUnit = (f: number) => (weather.unit === 'F' ? f : ((f - 32) * 5) / 9);
	const hourLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric' });
	// ── The days ahead ── Tomorrow leads, the rest by name; NWS's daily forecast runs
	// about a week. Today drops out — the big number and the hours rail already tell it —
	// so the first row is genuinely tomorrow. "Today" is the LOCATION's calendar date
	// (the first forecast hour carries its offset), not this browser's clock.
	const days = $derived.by(() => {
		const all = now?.days ?? [];
		const today = now?.hours?.[0]?.t?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
		return all.filter((d) => d.t > today && (d.hiF !== null || d.loF !== null));
	});
	const dayLabel = (t: string, i: number) =>
		i === 0 ? 'Tomorrow' : new Date(t + 'T12:00:00').toLocaleDateString([], { weekday: 'long' });
	// Each row carries a RANGE BAR — the day's lo→hi span, placed on one shared scale
	// (the week's coldest to warmest), so a mild day reads as a short bar sitting where
	// it belongs against its neighbours, the way a column of days should compare.
	const weekSpan = $derived.by(() => {
		const temps = days.flatMap((d) => [d.hiF, d.loF]).filter((n): n is number => n !== null);
		if (temps.length < 2) return null;
		const min = Math.min(...temps);
		return { min, span: Math.max(Math.max(...temps) - min, 1) };
	});
	// Temperature wears its colour — each bar a gradient from its lo's colour to its
	// hi's, so a big swing visibly crosses the spectrum. The walk is PIECEWISE, not
	// linear: freezing and below holds blue, the mild band walks blue→green→yellow,
	// and everything past 70°F lives in yellow→amber→ember — a straight walk parked
	// the whole summer in greens.
	const tempHue = (f: number) => {
		if (f <= 32) return 220;
		if (f <= 70) return 220 - ((f - 32) / 38) * 150; // → 70 (yellow-green) at 70°F
		return 70 - (Math.min(f - 70, 30) / 30) * 55; // → 15 (ember) at 100°F+
	};
	const tempColor = (f: number) => `hsl(${tempHue(f)} 72% 55%)`;
	// Wheel-over-the-rail scrolls it sideways (the city strip's move): most mice only have
	// a vertical wheel, and the rail is the only thing under the pointer that scrolls.
	function hoursWheel(e: WheelEvent) {
		const el = e.currentTarget as HTMLElement;
		if (el.scrollWidth <= el.clientWidth) return;
		const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
		if (!delta) return;
		e.preventDefault();
		el.scrollLeft += delta;
	}

	const reduceMotion =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	// When the shown city changes, glide its tab fully into view — picking one half-hidden
	// under the edge fade (or adding a city, which lands at the end of the strip) would
	// otherwise leave the SELECTED name cut off.
	//
	// By scrolling THE STRIP's own scrollLeft, never scrollIntoView: that walks every
	// scrollable ancestor, and overflow:hidden boxes count in Chrome — the panel mounts
	// while it's still translated off-screen (a panel→panel move swaps content mid-slide),
	// so chasing the tab dragged the page's own .stage sideways and the whole homepage
	// wiggled behind the opening panel. The strip can't overshoot anything: it's the only
	// thing that moves. On mount the reveal is a JUMP, not a glide — the entrance cascade
	// owns that moment.
	let glidedIdx = -1;
	$effect(() => {
		const i = weather.activeIdx;
		const strip = tabsEl;
		if (!strip) return;
		const first = glidedIdx === -1;
		if (glidedIdx === i) return;
		glidedIdx = i;
		const el = strip.children[i] as HTMLElement | undefined;
		if (!el) return;
		const pad = 44; // clear the edge fade, so "visible" means readable
		const left = el.offsetLeft - pad;
		const right = el.offsetLeft + el.offsetWidth + pad;
		const target =
			left < strip.scrollLeft
				? left
				: right > strip.scrollLeft + strip.clientWidth
					? right - strip.clientWidth
					: null;
		if (target !== null)
			strip.scrollTo({
				left: Math.max(0, target),
				behavior: first || reduceMotion ? 'auto' : 'smooth'
			});
	});
</script>

<div class="wx">
	<!-- The cities, as tabs: a sliding row of names, the showing one in full ink. The + opens the
	     header's search pointed at ADDING a city rather than swapping the one you're looking at. A
	     tab carries an × once there's more than one — the last city stays, since an empty panel would
	     say nothing. The + sits OUTSIDE the scroller, pinned past its end fade: however many
	     cities the strip hides, adding another is never scrolled out of reach. -->
	<div class="wx-tabrow">
		<div
			class="wx-tabs"
			class:fade-start={!atStart}
			class:fade-end={!atEnd}
			role="tablist"
			aria-label="Cities"
			tabindex="-1"
			class:dragging
			class:carrying={lift !== null}
			bind:this={tabsEl}
			onwheel={onTabsWheel}
			onscroll={measureTabs}
			onpointerdown={onTabsDown}
			onpointermove={onTabsMove}
			onpointerup={onTabsUp}
			onpointercancel={onTabsUp}
			onclickcapture={onTabsClick}
			oncontextmenu={(e) => {
				// A long-press is the LIFT here, so the browser's long-press menu can't also fire.
				if (lift !== null || holdTimer) e.preventDefault();
			}}
		>
			<!-- Keyed by the place, so a reorder MOVES a tab rather than rewriting every label in
		     place — that's what animate:flip animates. -->
			{#each weather.places as p, i (p.id)}
				<div
					class="wx-tab"
					class:on={i === weather.activeIdx}
					class:carried={lift === i}
					style="--n:{i}"
					animate:flip={{ duration: flipMs }}
				>
					<button
						type="button"
						class="wx-tab-name"
						role="tab"
						aria-selected={i === weather.activeIdx}
						onclick={() => show(i)}
					>
						{p.name}{#if p.state}<span class="wx-tab-state">{p.state}</span>{/if}
					</button>
					{#if weather.places.length > 1}
						<button
							type="button"
							class="wx-tab-x"
							aria-label="Close {p.name}"
							onclick={() => closeTab(i)}>×</button
						>
					{/if}
				</div>
			{/each}
		</div>
		{#if docs}
			<!-- Docs mode draws no panel header, so the search lives HERE, always mounted, wearing
		     the + as its closed key (addHere): one element morphing key ⇄ field on its own
		     width transition — the Emoji superbar's smoothness. (A previous arrangement
		     swapped a separate + for a freshly-mounted field; the exchange always jumped.) -->
			<div class="wx-add-search" style="--n:{weather.places.length}"><CitySearch addHere /></div>
		{:else}
			<button
				type="button"
				class="wx-add"
				style="--n:{weather.places.length}"
				aria-label="Add another city"
				title="Add another city"
				onclick={() => openSearch('add')}>{@html PLUS_SVG}</button
			>
		{/if}
	</div>

	<!-- The carried tab's ghost: what the hand is holding, floating free of the strip while
	     the dimmed placeholder below marks the slot it will drop into. Inert — pointer events
	     pass through to the strip, which owns the whole gesture. Portaled to <body>: see the
	     note on placeGhost — inside the panel it clipped against the body scroller and
	     disappeared under the masthead. -->
	{#if lift !== null && weather.places[lift]}
		<div
			use:portal
			class="wx-ghost"
			aria-hidden="true"
			style="left:{ghostX}px; top:{ghostY}px; width:{ghostW}px"
		>
			<span class="wx-tab-name">
				{weather.places[lift].name}{#if weather.places[lift].state}<span class="wx-tab-state"
						>{weather.places[lift].state}</span
					>{/if}
			</span>
		</div>
	{/if}

	<!-- Keyed on the ACTIVE PLACE, so showing a different city remounts the reading and its
	     entrance rise replays — the new city's numbers land the way the first one's did,
	     instead of the old ones snapping into new values in place. The place object, not
	     activeIdx: the header search REPLACES the city at the same index, and an index key
	     would let that swap slip by unanimated. The tabs stay outside: they're the control
	     you're using, and must not jump under the pointer. -->
	{#key place}
		{#if phase === 'error'}
			<p class="wx-msg">
				The National Weather Service isn't answering right now. It's a public service with no key
				and no promises — try again in a minute.
			</p>
		{:else if phase === 'loading' && !now}
			<p class="wx-msg">Reading the sky over {place.name}…</p>
		{:else if now}
			<!-- The current-conditions row. Default it's just the reading (.wx-hero is display:contents,
		     so Aeropalite/narrow is byte-identical). In Pixelite docs mode, once the column is wide
		     enough, .wx-hero becomes a two-column row and the pixel sky window fills the right. -->
			<div class="wx-hero">
				<!-- The reading itself: the mark, the number, and what the sky is doing. -->
				<div class="wx-now" class:stale={phase === 'loading'}>
					<span class="wx-mark" aria-hidden="true">
						{@html conditionIcon(now.conditions, now.night)}
					</span>
					<div class="wx-read">
						{#if typeof temp === 'number'}
							<p class="wx-temp">
								{Math.round(temp)}<span class="wx-unit">°{weather.unit}</span>
							</p>
						{:else}
							<p class="wx-temp wx-temp-none">—</p>
						{/if}
						<p class="wx-cond">{now.conditions || 'No conditions reported'}</p>
						{#if feelsDiffers}
							<p class="wx-feels">Feels like {Math.round(feels as number)}°{weather.unit}</p>
						{/if}
						{#if verdict}
							<p class="wx-verdict">{verdict}</p>
						{/if}
					</div>
					<!-- No unit control here any more: °F/°C folded into ONE disc and moved up to the
				     panel header's action row (the page's), beside Refresh and Search. -->
				</div>
				{#if docs}
					<!-- The pixel sky window: the city's sky, in the stage's phase palette, framed like a
				     manual figure. Beside the reading whenever both fit; wrapped below it when not. -->
					<figure class="wx-skywin">
						<div class="wx-sky-frame" bind:this={skyFrame}>
							<canvas
								class="wx-sky-canvas"
								bind:this={skyCanvas}
								width={CW}
								height={CH}
								aria-hidden="true"
							></canvas>
						</div>
						<figcaption class="wx-sky-cap">{skyCaption}</figcaption>
					</figure>
				{/if}
			</div>

			<!-- The rest of the reading. Each stat is dropped rather than shown empty: plenty of stations
		     report no humidity, and a dash tells you nothing a missing row wouldn't. -->
			<dl class="wx-stats">
				{#if now.humidity !== null}
					<div class="wx-stat">
						<dt>Humidity</dt>
						<dd>{Math.round(now.humidity)}%</dd>
					</div>
				{/if}
				{#if now.windMph !== null}
					<div class="wx-stat">
						<dt>Wind</dt>
						<dd>
							{Math.round(now.windMph)} mph{now.windDir !== null ? ` ${compass(now.windDir)}` : ''}
						</dd>
					</div>
				{/if}
				{#if now.observedAt}
					<div class="wx-stat">
						<dt>Observed</dt>
						<dd>{clock(now.observedAt)}</dd>
					</div>
				{/if}
			</dl>

			<!-- The next hours, as a glance rail: hour, drawn mark, temperature — with the
		     feels-like beneath whenever it meaningfully disagrees, and rain odds once
		     they're worth carrying an umbrella over. Absent hours (an older cached
		     reading, or the forecast upstream sulking) just drop the rail. -->
			{#if now.hours?.length}
				<div
					class="wx-hours"
					class:fade-start={!hoursAtStart}
					class:fade-end={!hoursAtEnd}
					role="list"
					aria-label="The next hours"
					bind:this={hoursEl}
					onscroll={measureHours}
					onwheel={hoursWheel}
				>
					{#each now.hours as h, i (h.t)}
						<div class="wx-hour" role="listitem" style="--n:{i}">
							<span class="wxh-time">{hourLabel(h.t)}</span>
							<span class="wxh-mark" aria-hidden="true"
								>{@html conditionIcon(h.label, h.night)}</span
							>
							<span class="wxh-temp">
								{h.tempF === null ? '—' : `${Math.round(toUnit(h.tempF))}°`}
							</span>
							{#if h.feelsF !== null && h.tempF !== null && Math.abs(h.feelsF - h.tempF) >= 3}
								<span class="wxh-sub">feels {Math.round(toUnit(h.feelsF))}°</span>
							{/if}
							{#if h.pop >= 15}
								<span class="wxh-sub wxh-pop">{h.pop}%</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<!-- The days ahead: Tomorrow, then the rest of the week the way NWS tells it — the
		     day's drawn mark, rain odds once they're worth planning around, and hi/lo. A
		     LIST, not a rail: a week is a reading, not a glance, and rows keep the
		     temperatures in columns the eye can run down. -->
			{#if days.length}
				<div class="wx-days" role="list" aria-label="The days ahead">
					{#each days as d, i (d.t)}
						<div class="wx-day" role="listitem">
							<span class="wxd-name">{dayLabel(d.t, i)}</span>
							<span class="wxd-mark" aria-hidden="true" title={d.label}
								>{@html conditionIcon(d.label, false)}</span
							>
							<span class="wxd-pop">{d.pop >= 15 ? `${d.pop}%` : ''}</span>
							<span class="wxd-range" aria-hidden="true">
								{#if weekSpan && d.hiF !== null && d.loF !== null}
									<span
										class="wxd-range-fill"
										style:left="{((d.loF - weekSpan.min) / weekSpan.span) * 100}%"
										style:width="{(Math.max(d.hiF - d.loF, 1) / weekSpan.span) * 100}%"
										style:background="linear-gradient(90deg, {tempColor(d.loF)}, {tempColor(
											d.hiF
										)})"
									></span>
								{/if}
							</span>
							<span class="wxd-temps">
								<span class="wxd-hi" class:empty={d.hiF === null}
									>{d.hiF === null ? '—' : `${Math.round(toUnit(d.hiF))}°`}</span
								>
								<span class="wxd-lo" class:empty={d.loF === null}
									>{d.loF === null ? '—' : `${Math.round(toUnit(d.loF))}°`}</span
								>
							</span>
						</div>
					{/each}
				</div>
			{/if}

			<p class="wx-source">
				{now.place || place.name} · {now.station.name || now.station.id} · National Weather Service
			</p>
		{/if}
	{/key}
</div>

<style>
	.wx {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	/* Entrance — the panel's sections settle in on a stagger, top-to-bottom (`backwards`
	   so nothing stays pinned after). Order tells the story: WHERE first (the tabs, each
	   city a beat behind the last), then WHAT (the reading), then the detail rows. The
	   motion DESCENDS — `settle` below, the global rise mirrored — because the cascade
	   starts at the city selector at the TOP: content entering upward pointed away from
	   the control that drives it. The reading remounts when the shown city changes (the
	   #key in the markup), so its part of the cascade replays and a new city LANDS
	   rather than snapping in. */
	@media (prefers-reduced-motion: no-preference) {
		/* The row settles as ONE unit; the tabs fade in on beats inside it. Not a
		   translate per tab: the strip is an overflow-x scroller with no vertical slack,
		   so a translating tab clips against its edges mid-overshoot. Opacity carries
		   the stagger without ever leaving the box. */
		.wx-tabrow {
			animation: settle 0.45s ease backwards;
		}
		.wx-tab,
		.wx-add {
			animation: tab-in 0.35s ease backwards;
			animation-delay: calc(0.08s + var(--n, 0) * 0.05s);
		}
		/* Docs mode: the search key joins the tab cascade on the +'s old beat. */
		.wx-add-search {
			animation: tab-in 0.35s ease backwards;
			animation-delay: calc(0.08s + var(--n, 0) * 0.05s);
		}
		/* Reordering rewrites each tab's --n, which rewrites this entrance delay — and a
		   changed delay RESTARTS the entrance. Mid-carry that read as tabs flashing awake on
		   every swap, and the replay fought the placeholder's dim. The strip is not entering
		   while you're holding it. */
		.wx-tabs.carrying .wx-tab {
			animation: none;
		}
		.wx-msg,
		.wx-now,
		.wx-stats,
		.wx-hours,
		.wx-days,
		.wx-source {
			animation: settle 0.45s ease backwards;
		}
		.wx-msg,
		.wx-now {
			animation-delay: 0.1s;
		}
		.wx-stats {
			animation-delay: 0.18s;
		}
		.wx-hours {
			animation-delay: 0.25s;
		}
		.wx-days {
			animation-delay: 0.32s;
		}
		.wx-source {
			animation-delay: 0.39s;
		}
	}
	@keyframes tab-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	/* The global `rise`, mirrored: drops in from a short offset ABOVE, overshoots past
	   its resting spot, and settles — same beats, opposite direction. */
	@keyframes settle {
		0% {
			opacity: 0;
			transform: translateY(-8px);
		}
		60% {
			opacity: 1;
			transform: translateY(2px);
		}
		82% {
			transform: translateY(-0.8px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* The cities, as tabs. A sliding row: more cities than fit just scroll, they don't wrap and push
	   the reading down the panel. Text, not chips — a tab is a name you're reading, not a button
	   you're hunting for. */
	/* The row: the scroller takes what width it needs (and shrinks when it must), the +
	   is pinned after it — however many cities the strip hides, adding one never scrolls
	   out of reach. */
	.wx-tabrow {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		min-width: 0;
		/* The tabs are the panel's SECOND HEADER LINE, not body copy: seated directly on the
		   header's own bottom air (no beat of their own), and pulled left by the first tab's
		   text inset so the city's letterforms align with the title's left edge. */
		margin-left: -0.55rem;
	}
	.wx-tabs {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		/* The strip SCROLLS rather than wrapping or clipping. `min-width: 0` is the load-bearing bit:
		   a flex item won't shrink below its content by default, so with four cities the row stayed
		   as wide as its contents and simply overflowed the panel — the fourth was cut off with no
		   way to reach it. Zeroing the floor lets the row take the panel's width and scroll inside
		   it. The scrollbar is hidden; the cut-off edge of the next tab is the affordance. */
		min-width: 0;
		overflow-x: auto;
		/* Contain the overscroll so this inner strip never chains to the page — the chain is what
		   locks up scrolling on iOS after you drag an inner box then the page. */
		overscroll-behavior: contain;
		scrollbar-width: none;
		padding-bottom: 0.15rem;
		/* The edge that still hides a tab fades out — with the scrollbar gone, this is what says
		   "there's more this way". Both edges can fade at once when you're in the middle of the row. */
		--fade: 2.5rem;
		mask-image: none;
		/* Drag to scroll — and don't let the browser turn the drag into a text selection. */
		touch-action: pan-x;
		user-select: none;
		/* The tabs' offsetLeft is measured against the strip (the carry's midpoint math) — and a
		   long-press LIFTS a tab here, so iOS's own long-press callout stays out of it. */
		position: relative;
		-webkit-touch-callout: none;
	}
	.wx-tabs.dragging,
	.wx-tabs.carrying {
		cursor: grabbing;
	}
	/* While carried, the tab's own slot dims to a placeholder — the hole the ghost drops
	   into. The wrapper keeps its transform free for the FLIP that walks the slot along as
	   the ghost trades places; the LIFT visual lives on the ghost, not here. */
	.wx-tab.carried {
		opacity: 0.3;
		transition: opacity 0.15s ease;
	}
	/* The ghost itself: the carried tab's copy in the hand — a solid face slightly proud of
	   the page (scale + drop), free in both axes even though the reorder reads only x. Inert:
	   pointer events pass through to the strip, which owns the gesture. Lives in <body> (see
	   the portal), so it's FIXED in viewport space and outranks the panel's chrome — the
	   app's fixed elements top out at z-index 60, and a thing in the hand rides over all of
	   it. Scoped styles still reach it: the scoping class travels with the node. */
	.wx-ghost {
		position: fixed;
		z-index: 70;
		pointer-events: none;
		display: flex;
		align-items: center;
		background: var(--panel-fill-solid);
		border: 1px solid var(--line);
		border-radius: 8px;
		transform: scale(1.05);
		box-shadow:
			0 1px 2px rgba(8, 10, 14, 0.1),
			0 6px 18px rgba(8, 10, 14, 0.18);
	}
	/* Bubble: the ghost joins the family — the pill, the 1px line-edge, and the shared
	   rim-light gloss riding above the carry's own drop shadows. The face is the family's
	   ink mix over a FROSTED pane rather than the flat solid: the ghost floats over whatever
	   the carry crosses, and the blur does the legibility work the way it does for every
	   glass surface here. (Restated locally like the Masthead's bubble rules — the ghost
	   lives in <body>, but the html[data-ui] key reaches it anywhere.) Flat keeps the plain
	   card above. */
	:global(html[data-ui='bubble']) .wx-ghost {
		border-radius: 999px;
		border-color: var(--line-edge);
		background: var(--aero-face);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		box-shadow:
			var(--aero-gloss),
			0 1px 2px rgba(8, 10, 14, 0.1),
			0 6px 18px rgba(8, 10, 14, 0.18); /* the family gloss over a carried thing's lift */
	}
	.wx-tabs.fade-end {
		mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent 100%);
	}
	.wx-tabs.fade-start {
		mask-image: linear-gradient(to left, #000 calc(100% - var(--fade)), transparent 100%);
	}
	.wx-tabs.fade-start.fade-end {
		mask-image: linear-gradient(
			to right,
			transparent 0,
			#000 var(--fade),
			#000 calc(100% - var(--fade)),
			transparent 100%
		);
	}
	.wx-tabs::-webkit-scrollbar {
		display: none;
	}
	.wx-tab {
		flex: none;
		display: flex;
		align-items: center;
		border-radius: 8px;
	}
	.wx-tab-name {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		padding: 0.35rem 0.55rem;
		font: inherit;
		/* Bigger than a label, smaller than the title: WHERE the weather is is the second thing the
		   panel says, after what it is. */
		font-size: 1.35rem;
		font-weight: 600;
		white-space: nowrap;
		color: var(--sub);
		background: none;
		border: 0;
		border-radius: 8px;
		cursor: pointer;
		/* Selection moves as a crossfade: the leaving city dims to sub while the arriving
		   one takes the ink, instead of both snapping. (The weight change stays a cut —
		   the loaded faces are static, so there's nothing between 600 and 700 to show.) */
		transition: color 0.25s ease;
	}
	.wx-tab-name:hover {
		color: var(--ink);
	}
	/* The city you're looking at: full ink, and the only one carrying weight. */
	.wx-tab.on .wx-tab-name {
		color: var(--ink);
		font-weight: 700;
	}
	.wx-tab-state {
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--sub);
	}
	.wx-tab-x {
		padding: 0 0.35rem 0 0;
		font: inherit;
		font-size: 1rem;
		line-height: 1;
		color: var(--sub);
		background: none;
		border: 0;
		cursor: pointer;
	}
	.wx-tab-x:hover {
		color: var(--ink);
	}
	.wx-add {
		flex: none;
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		margin-left: 0.15rem;
		padding: 0;
		color: var(--sub);
		background: none;
		border: 1px solid var(--line-edge);
		border-radius: 999px;
		cursor: pointer;
	}
	/* Docs mode: the always-mounted CitySearch key sits where the + disc sat, and its own
	   width transition carries the whole key ⇄ field morph — no wrapper animation, nothing
	   mounted or unmounted at the seam. */
	.wx-add-search {
		flex: none;
		margin-left: 0.15rem;
		display: flex;
		align-items: center;
	}
	.wx-add:hover {
		color: var(--ink);
		border-color: var(--line-strong);
	}
	/* Bubble: the + joins the family — the chips' ink-mix face and the shared rim-light
	   gloss over airy drops (restated locally, like the ghost's rules: the depth list in
	   the page can't know about this component's classes). Flat keeps the bare outline. */
	:global(html[data-ui='bubble']) .wx-add {
		background: var(--aero-face);
		box-shadow: var(--aero-gloss), var(--aero-drop);
		will-change: transform;
		transition:
			transform 0.3s var(--btn-spring),
			background 0.18s var(--btn-soft),
			border-color 0.18s var(--btn-soft),
			color 0.15s ease;
	}
	@media (prefers-reduced-motion: no-preference) {
		:global(html[data-ui='bubble']) .wx-add:hover {
			transform: scale(var(--btn-hover-scale));
		}
		:global(html[data-ui='bubble']) .wx-add:active {
			transform: scale(var(--btn-press-scale));
			transition-duration: 0.1s;
		}
	}
	.wx-add :global(svg) {
		display: block;
		width: 0.85rem;
		height: 0.85rem;
	}

	/* The reading. The number carries it, so it's set at panel-title scale. */
	.wx-now {
		display: flex;
		align-items: center;
		gap: 1.1rem;
		transition: opacity 0.2s ease;
	}

	/* ── Pixel sky window (Pixelite docs mode) ───────────────────────────────────────────────
	   The hero row is display:contents by default, so Aeropalite renders exactly as before (the
	   window is never even rendered there — it's behind {#if docs}). Under Pixelite the .wx root
	   becomes a query container (its inline size feeds the row gap's cqi) and the hero becomes
	   the wrapping row below. */
	.wx-hero {
		display: contents;
	}
	.wx-skywin {
		display: none;
		margin: 0;
	}
	:global(html[data-look='pixelite']) .wx {
		container-type: inline-size;
	}
	/* Pixelite always shows the window (it used to vanish below a 720px column even with room
	   to spare), and PREFERS the reading and the window on one row: a wrapping flex row where
	   each side states its floor as its flex-basis — the reading ~240px, the window 150px
	   (about 1.2× the buffer, the least width where the pixels still read) — so they share the
	   row whenever both floors fit and the window drops below only when the column truly can't
	   seat them. No breakpoint to tune: the wrap point IS the sum of the floors. */
	:global(html[data-look='pixelite']) .wx-hero {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1.1rem clamp(1.25rem, 4cqi, 3rem);
	}
	:global(html[data-look='pixelite']) .wx-now {
		flex: 1 1 240px;
		min-width: 0;
	}
	/* Growth is shared with the reading; the cap keeps the 16:9 frame a figure, not a banner —
	   and when the window does wrap to its own line, the same cap holds it. */
	:global(html[data-look='pixelite']) .wx-skywin {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex: 1 1 150px;
		max-width: 340px;
	}
	/* The frame: a manual figure — hairline border, 2px radius, the canvas upscaled with chunky
	   pixels. Fixed 128×72 aspect so the pixels stay square at any width. */
	.wx-sky-frame {
		width: 100%;
		aspect-ratio: 128 / 72;
		border: 1px solid var(--pixel-hairline, rgba(0, 0, 0, 0.2));
		border-radius: 2px;
		overflow: hidden;
		background: #0d1424;
	}
	.wx-sky-canvas {
		display: block;
		width: 100%;
		height: 100%;
		image-rendering: pixelated;
	}
	.wx-sky-cap {
		font-family: var(--font-mono, ui-monospace, monospace);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.66rem;
		color: color-mix(in srgb, var(--ink) 45%, transparent);
	}
	/* A refresh in flight: dim what's up, don't tear it down. The old reading is still true. */
	.wx-now.stale {
		opacity: 0.55;
	}
	.wx-mark {
		flex: none;
		display: grid;
		place-items: center;
		width: 3.75rem;
		height: 3.75rem;
		color: var(--accent, var(--ink));
	}
	.wx-mark :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
	.wx-read {
		min-width: 0;
	}
	.wx-temp {
		margin: 0;
		font-size: clamp(2.5rem, 7vw, 3.5rem);
		font-weight: 700;
		line-height: 1;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.wx-temp-none {
		color: var(--sub);
	}
	.wx-unit {
		font-size: 0.42em;
		font-weight: 600;
		color: var(--sub);
		margin-left: 0.1em;
	}
	.wx-cond {
		margin: 0.3rem 0 0;
		font-weight: 600;
	}
	.wx-feels {
		margin: 0.1rem 0 0;
		font-size: 0.9rem;
		color: var(--sub);
	}
	/* The verdict speaks in the motto's voice — an editorial aside about the sky, not
	   another instrument reading, so it takes Fraunces italic like the tagline. */
	.wx-verdict {
		margin: 0.35rem 0 0;
		font-family: var(--font-motto);
		font-style: italic;
		font-size: 0.95rem;
		color: var(--ink);
	}
	/* ── The next hours: a glance rail ── cells slide under permanent edge fades (the
	   dissolving edge is the rail's material — this band scrolls); the scrollbar hides,
	   the fade is the affordance. No frosted children inside, so the mask composites
	   cleanly everywhere (see the Builder's rails for the Chromium trap). */
	.wx-hours {
		display: flex;
		gap: 1.15rem;
		min-width: 0;
		overflow-x: auto;
		/* Contain overscroll — no chain to the page (the iOS scroll-lock). */
		overscroll-behavior: contain;
		scrollbar-width: none;
		padding: 0.1rem 0.3rem;
		--fade: 2rem;
		/* Like the tabs: no mask at rest — an edge fades only while it still hides hours. */
		mask-image: none;
	}
	.wx-hours::-webkit-scrollbar {
		display: none;
	}
	.wx-hours.fade-end {
		mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent 100%);
	}
	.wx-hours.fade-start {
		mask-image: linear-gradient(to left, #000 calc(100% - var(--fade)), transparent 100%);
	}
	.wx-hours.fade-start.fade-end {
		mask-image: linear-gradient(
			to right,
			transparent 0,
			#000 var(--fade),
			#000 calc(100% - var(--fade)),
			transparent 100%
		);
	}
	.wx-hour {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.28rem;
		min-width: 3.2rem;
	}
	.wxh-time {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--sub);
	}
	.wxh-mark :global(svg) {
		width: 20px;
		height: 20px;
		display: block;
		color: var(--ink);
	}
	.wxh-temp {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}
	.wxh-sub {
		font-size: 0.68rem;
		color: var(--sub);
		font-variant-numeric: tabular-nums;
		margin-top: -0.15rem;
	}
	/* (The °F/°C control lives in the panel header now — one .unit-btn disc beside
	   Refresh and Search, styled with the page's head-actions.) */

	.wx-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0 2rem;
		margin: 0;
		padding-top: 1.1rem;
		border-top: 1px solid transparent;
		border-image: var(--rule-fade) 1;
	}
	.wx-stat dt {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.wx-stat dd {
		margin: 0.15rem 0 0;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	/* The days ahead — rows under the same thin rule the stats wear, temperatures in
	   columns at the right (hi leading, lo in the sub ink). */
	.wx-days {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding-top: 1.1rem;
		border-top: 1px solid transparent;
		border-image: var(--rule-fade) 1;
	}
	.wx-day {
		display: grid;
		/* The name column is minmax(0, …), not a fixed 6.2rem, so it can give ground when the
		   sheet is narrow — otherwise the fixed name + mark + pop + content-sized temps summed
		   past a small phone's width and pushed the last column (the hi/lo temps) off the sheet.
		   Now the name shrinks first (truncating with an ellipsis as a last resort — see .wxd-name),
		   the range bar collapses to nothing, and the temps stay in bounds at any width. */
		grid-template-columns: minmax(0, 6.2rem) 1.6rem 2.6rem 1fr auto;
		align-items: center;
		/* Column gap tightens on a narrow sheet (down to 0.4rem) so the fixed mark/pop/temps and
		   their four gaps still clear the smallest phones once the name has fully given way. */
		gap: clamp(0.4rem, 2vw, 0.6rem);
	}
	/* The lo→hi span on the week's shared scale — a track in the hairline ink, the day's
	   own reach in temperature colour. (No overflow clip: the fill is bounded by
	   construction, and clipping would shave the aero drop below.) */
	.wxd-range {
		position: relative;
		height: 6px;
		border-radius: 999px;
		background: var(--line);
	}
	.wxd-range-fill {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 999px;
	}
	/* Bubble: the bars join the aero family — the glass face for the track, and the fill
	   wearing the same rim light and airy drop the brand dots do. Gloss lives in the
	   edge-hugging insets, never a wash over the temperature gradient; Flat keeps the
	   bars ink-flat. */
	:global(html[data-ui='bubble']) .wxd-range {
		background: var(--aero-face);
	}
	:global(html[data-ui='bubble']) .wxd-range-fill {
		box-shadow: var(--aero-gloss), var(--aero-drop);
	}
	.wxd-name {
		font-weight: 600;
		/* Let the name's grid column actually shrink below its text (grid items floor at their
		   content width unless min-width:0), truncating with an ellipsis on a tiny sheet rather
		   than spilling into the mark beside it. On any normal phone there's room for the full
		   day name — this only bites on the very smallest widths. */
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.wxd-mark :global(svg) {
		width: 20px;
		height: 20px;
		display: block;
		color: var(--ink);
	}
	.wxd-pop {
		font-size: 0.72rem;
		color: var(--sub);
		font-variant-numeric: tabular-nums;
	}
	.wxd-temps {
		justify-self: end;
		display: flex;
		gap: 0.7rem;
		font-variant-numeric: tabular-nums;
	}
	/* Fixed-width, right-aligned cells: the whole pair is end-justified, so a missing
	   temperature ("—", narrower than "68°") would otherwise shove its neighbour out of
	   column with the rows above and below. 4ch seats up to "100°" and "-10°". */
	.wxd-hi,
	.wxd-lo {
		min-width: 4ch;
		text-align: right;
	}
	/* A missing temperature's "—" reads as a mark, not a number — centre it in the cell. */
	.wxd-hi.empty,
	.wxd-lo.empty {
		text-align: center;
	}
	.wxd-hi {
		font-weight: 700;
	}
	.wxd-lo {
		font-weight: 600;
		color: var(--sub);
	}

	.wx-msg,
	.wx-source {
		margin: 0;
		font-size: 0.85rem;
		color: var(--sub);
	}
	.wx-source {
		text-align: right;
	}
</style>
