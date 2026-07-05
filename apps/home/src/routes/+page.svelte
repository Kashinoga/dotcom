<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fly, fade } from 'svelte/transition';

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
	const airports: Record<string, { at: Pt; title: string }> = {
		KSH: { at: [480, 300], title: 'Home' },
		// tier 1 — the leaders you see from home
		SFO: { at: [150, 240], title: 'Work' },
		NRT: { at: [360, 60], title: 'Writing' },
		JFK: { at: [800, 180], title: 'Projects' },
		DXB: { at: [760, 430], title: 'Contact' },
		SYD: { at: [520, 560], title: 'Photos' },
		LAX: { at: [200, 470], title: 'Notes' },
		// tier 2 — off-screen, each reached through its leader
		SEA: { at: [-150, 150], title: 'Résumé' },
		HND: { at: [300, -200], title: 'Essays' },
		BOS: { at: [1140, 90], title: 'Code' },
		SIN: { at: [1010, 560], title: 'Elsewhere' },
		AKL: { at: [560, 830], title: 'Film' },
		HNL: { at: [-100, 650], title: 'Links' }
	};

	const airlines: { name: string; color: string; legs: [string, string][] }[] = [
		{ name: 'Aka Air', color: '#e02f3f', legs: [['KSH', 'SFO'], ['SFO', 'SEA']] },
		{ name: 'Bluebird', color: '#1e73d8', legs: [['KSH', 'NRT'], ['NRT', 'HND'], ['NRT', 'JFK']] },
		{ name: 'Verde', color: '#12a150', legs: [['KSH', 'JFK'], ['JFK', 'BOS']] },
		{ name: 'Sunlines', color: '#f2a71b', legs: [['KSH', 'DXB'], ['DXB', 'SIN']] },
		{ name: 'Nova', color: '#8b46e0', legs: [['KSH', 'SYD'], ['SYD', 'AKL'], ['SFO', 'LAX']] },
		{ name: 'Tealjet', color: '#08a8b8', legs: [['KSH', 'LAX'], ['LAX', 'HNL'], ['LAX', 'SYD']] }
	];

	// Isometric (true 30°) projection: grid → screen. Pure 2D affine, no perspective.
	const COS = Math.cos(Math.PI / 6);
	const SIN = Math.sin(Math.PI / 6);
	const iso = ([x, y]: Pt): Pt => [(x - y) * COS, (x + y) * SIN];

	const P: Record<string, Pt> = Object.fromEntries(
		Object.entries(airports).map(([k, v]) => [k, iso(v.at)])
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

	const arcs = airlines.flatMap((a, i) =>
		a.legs.map(([f, t]) => ({ color: a.color, d: arc(P[f], P[t]), i }))
	);
	const nodes = Object.entries(P).map(([code, [x, y]]) => ({
		code,
		x,
		y,
		hub: code === 'KSH',
		title: airports[code].title
	}));

	// A background catch-rect (fly home on empty click) sized well past the world.
	const bx = nodes.map((n) => n.x);
	const by = nodes.map((n) => n.y);
	const worldPad = 600;
	const bg = {
		x: Math.min(...bx) - worldPad,
		y: Math.min(...by) - worldPad,
		w: Math.max(...bx) - Math.min(...bx) + worldPad * 2,
		h: Math.max(...by) - Math.min(...by) + worldPad * 2
	};

	// ─── Camera: crop the world, fly between crops to "move pages" ───────────────
	const ASPECT = 1.5; // viewBox w/h
	// Home is zoomed to the hub so routes bleed off every edge; a node focus keeps
	// the node in the left-of-panel area (biasX) with its neighbours in view.
	function crop(cx: number, cy: number, w: number, biasX = 0.5) {
		const h = w / ASPECT;
		return { x: cx - w * biasX, y: cy - h / 2, w, h };
	}
	const HOME = crop(P.KSH[0], P.KSH[1], 840);

	let cam = $state({ ...HOME });
	let selected = $state<string | null>(null);
	let target = { ...HOME };
	let raf = 0;

	const reduce =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	function step() {
		const s = 0.17;
		for (const k of ['x', 'y', 'w', 'h'] as const) cam[k] += (target[k] - cam[k]) * s;
		if ((['x', 'y', 'w', 'h'] as const).every((k) => Math.abs(target[k] - cam[k]) < 0.4)) {
			cam = { ...target };
			raf = 0;
			return;
		}
		raf = requestAnimationFrame(step);
	}
	function flyTo(t: typeof HOME) {
		target = t;
		if (reduce) {
			cam = { ...t };
			return;
		}
		if (!raf) raf = requestAnimationFrame(step);
	}

	function board(code: string) {
		if (code === 'KSH') return home();
		selected = code;
		flyTo(crop(P[code][0], P[code][1], 660, 0.37));
	}
	function home() {
		selected = null;
		flyTo(HOME);
	}

	onDestroy(() => raf && cancelAnimationFrame(raf));

	const viewBox = $derived(
		`${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${cam.w.toFixed(1)} ${cam.h.toFixed(1)}`
	);
</script>

<div class="stage">
	<svg {viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Kashinoga — airline route map">
		<!-- empty-space click flies home -->
		<rect class="bg" x={bg.x} y={bg.y} width={bg.w} height={bg.h} onclick={home} role="presentation" />

		{#each arcs as a}
			<path
				class="arc"
				class:dim={selected !== null}
				d={a.d}
				stroke={a.color}
				pathLength="1"
				style="--i:{a.i}"
			/>
		{/each}

		{#each nodes as n}
			<g
				class="node"
				class:active={selected === n.code}
				class:dim={selected !== null && selected !== n.code}
				role="button"
				tabindex="0"
				aria-label="Fly to {n.title}"
				onclick={() => board(n.code)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), board(n.code))}
			>
				<circle class="hit" cx={n.x} cy={n.y} r="26" />
				{#if n.hub}
					<circle class="port hub-ring" cx={n.x} cy={n.y} r="15" />
					<circle class="port hub-dot" cx={n.x} cy={n.y} r="6" />
				{:else}
					<circle class="port" cx={n.x} cy={n.y} r="6.5" />
				{/if}
				<text class="code" class:code-hub={n.hub} x={n.x + (n.hub ? 22 : 12)} y={n.y + 5}>{n.code}</text>
			</g>
		{/each}
	</svg>

	<header class="masthead" class:hidden={selected !== null}>
		<h1>Kashinoga</h1>
		<p class="tagline">an airline route map of one person&rsquo;s internet</p>
	</header>

	<ul class="legend" class:hidden={selected !== null}>
		{#each airlines as a}
			<li><span class="swatch" style="background:{a.color}"></span>{a.name}</li>
		{/each}
	</ul>

	{#if selected}
		{@const port = airports[selected]}
		<aside class="page" in:fly={{ x: 40, duration: 380 }} out:fade={{ duration: 160 }}>
			<button class="back" onclick={home}>&larr; route map</button>
			<p class="boarding">Now arriving</p>
			<h2>{port.title}</h2>
			<p class="dest-code">{selected} &middot; {port.at[0]},{port.at[1]}</p>
			<p class="stub">This destination is a stub. Drop the real {port.title.toLowerCase()} content here.</p>
		</aside>
	{/if}
</div>

<style>
	.stage {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: var(--page);
	}

	/* The stage never scrolls; the camera (viewBox) crops a world larger than the
	 * screen, so routes run off the edges. */
	.stage svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}
	.bg {
		fill: transparent;
	}

	.arc {
		fill: none;
		stroke-width: 5.5;
		stroke-linecap: round;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation: draw 1.6s cubic-bezier(0.6, 0, 0.3, 1) forwards;
		animation-delay: calc(var(--i) * 0.12s);
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
	.hit {
		fill: transparent;
	}
	.port {
		fill: var(--paper);
		stroke: var(--ink);
		stroke-width: 3;
		transition: stroke-width 0.15s ease;
	}
	.node:hover .port,
	.node:focus-visible .port {
		stroke-width: 5;
	}
	.node:focus-visible {
		outline: none;
	}
	.hub-ring {
		stroke-width: 4;
	}
	.hub-dot {
		fill: var(--ink);
		stroke: none;
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
	.port,
	.code {
		opacity: 0;
		animation: appear 0.4s ease forwards;
		animation-delay: 1.5s;
	}
	@keyframes appear {
		to {
			opacity: 1;
		}
	}

	/* Overlays — upright, outside the camera, so they never skew or scroll. */
	.masthead {
		position: absolute;
		top: clamp(1.5rem, 5vw, 3.5rem);
		left: clamp(1.5rem, 5vw, 3.5rem);
		max-width: min(90vw, 640px);
		transition: opacity 0.4s ease, transform 0.4s ease;
	}
	.masthead h1 {
		margin: 0;
		font-weight: 700;
		font-size: clamp(2.25rem, 9vw, 5.5rem);
		line-height: 0.95;
		letter-spacing: -0.02em;
		color: var(--ink);
	}
	.tagline {
		margin: 0.5rem 0 0;
		font-size: clamp(0.95rem, 2.2vw, 1.15rem);
		color: var(--sub);
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
		transition: opacity 0.4s ease, transform 0.4s ease;
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		color: var(--ink);
	}
	.swatch {
		width: 1.05rem;
		height: 1.05rem;
		border-radius: 3px;
		flex: none;
	}

	.masthead.hidden {
		opacity: 0;
		transform: translateY(-8px);
		pointer-events: none;
	}
	.legend.hidden {
		opacity: 0;
		transform: translateY(8px);
		pointer-events: none;
	}

	/* Page panel — the "arrived" view. Narrow, so the map stays explorable beside it. */
	.page {
		position: absolute;
		top: 0;
		right: 0;
		height: 100%;
		width: min(88vw, 360px);
		padding: clamp(1.75rem, 5vw, 3rem);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.35rem;
		background: color-mix(in srgb, var(--paper) 86%, transparent);
		backdrop-filter: blur(8px);
		border-left: 2px solid var(--ink);
	}
	.back {
		align-self: flex-start;
		margin-bottom: 1.25rem;
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
	.boarding {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.page h2 {
		margin: 0;
		font-size: clamp(2rem, 7vw, 3.25rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--ink);
	}
	.dest-code {
		margin: 0.15rem 0 1rem;
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		color: var(--sub);
	}
	.stub {
		margin: 0;
		max-width: 32ch;
		color: var(--sub);
		line-height: 1.55;
	}
</style>
