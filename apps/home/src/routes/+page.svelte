<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fly, fade } from 'svelte/transition';

	// Airline route-map homepage. The map IS the navigation: destinations are
	// pages, and you "move pages" by flying the camera along the network to an
	// airport. Fit-to-screen at all times (preserveAspectRatio meet), and flat-
	// forward — the isometric look is baked into coordinates, motion is 2D camera
	// pan/zoom over the viewBox. No perspective, no tilt, no GPU-layer-per-card.
	type Pt = [number, number];

	// Airports on a 60px grid (grid space, pre-projection). KSH = home hub. Each
	// maps to a page/section of the site — rename freely.
	const airports: Record<string, { at: Pt; title: string }> = {
		KSH: { at: [480, 300], title: 'Home' },
		SFO: { at: [130, 190], title: 'Work' },
		LAX: { at: [180, 370], title: 'Notes' },
		NRT: { at: [210, 80], title: 'Writing' },
		HKG: { at: [260, 300], title: 'Links' },
		SIN: { at: [340, 520], title: 'Play' },
		SYD: { at: [560, 560], title: 'Photos' },
		GRU: { at: [630, 120], title: 'Music' },
		JFK: { at: [770, 160], title: 'Projects' },
		LHR: { at: [850, 210], title: 'About' },
		CDG: { at: [880, 340], title: 'Talks' },
		DXB: { at: [720, 450], title: 'Contact' }
	};

	const airlines: { name: string; color: string; legs: [string, string][] }[] = [
		{ name: 'Aka Air', color: '#e02f3f', legs: [['KSH', 'SFO'], ['KSH', 'NRT'], ['KSH', 'JFK']] },
		{ name: 'Bluebird', color: '#1e73d8', legs: [['KSH', 'LHR'], ['KSH', 'CDG'], ['KSH', 'SIN']] },
		{ name: 'Verde', color: '#12a150', legs: [['KSH', 'SYD'], ['KSH', 'DXB'], ['KSH', 'GRU']] },
		{ name: 'Sunlines', color: '#f2a71b', legs: [['KSH', 'LAX'], ['KSH', 'HKG']] },
		{ name: 'Nova', color: '#8b46e0', legs: [['SFO', 'JFK'], ['LAX', 'SYD']] },
		{ name: 'Tealjet', color: '#08a8b8', legs: [['LHR', 'CDG'], ['NRT', 'HKG'], ['SIN', 'SYD']] }
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

	// Full-map viewBox: fit projected airports + padding for arcs & codes.
	const xs = nodes.map((n) => n.x);
	const ys = nodes.map((n) => n.y);
	const PAD = 120;
	const full = {
		x: Math.min(...xs) - PAD,
		y: Math.min(...ys) - PAD,
		w: Math.max(...xs) - Math.min(...xs) + PAD * 2,
		h: Math.max(...ys) - Math.min(...ys) + PAD * 2
	};

	// ─── Camera: animate the viewBox to "move pages" ────────────────────────────
	let cam = $state({ ...full });
	let selected = $state<string | null>(null);
	let target = { ...full };
	let raf = 0;

	const reduce =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	function step() {
		const s = 0.17;
		for (const k of ['x', 'y', 'w', 'h'] as const) cam[k] += (target[k] - cam[k]) * s;
		const settled = (['x', 'y', 'w', 'h'] as const).every((k) => Math.abs(target[k] - cam[k]) < 0.4);
		if (settled) {
			cam = { ...target };
			raf = 0;
			return;
		}
		raf = requestAnimationFrame(step);
	}
	function flyTo(t: typeof full) {
		target = t;
		if (reduce) {
			cam = { ...t };
			return;
		}
		if (!raf) raf = requestAnimationFrame(step);
	}

	// Board a destination: fly the camera to that airport and open its page.
	function board(code: string) {
		selected = code;
		const [nx, ny] = P[code];
		const w = full.w * 0.42;
		const h = full.h * 0.42;
		flyTo({ x: nx - w / 2, y: ny - h / 2, w, h });
	}
	function home() {
		selected = null;
		flyTo({ ...full });
	}

	onDestroy(() => raf && cancelAnimationFrame(raf));

	const viewBox = $derived(`${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${cam.w.toFixed(1)} ${cam.h.toFixed(1)}`);
</script>

<div class="stage">
	<svg {viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Kashinoga — airline route map">
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

	/* Fit-to-screen at all times: meet scales the viewBox to fit the viewport. */
	.stage svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
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

	/* Page panel — the "arrived" view for a destination. */
	.page {
		position: absolute;
		top: 0;
		right: 0;
		height: 100%;
		width: min(92vw, 420px);
		padding: clamp(1.75rem, 5vw, 3rem);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.35rem;
		background: color-mix(in srgb, var(--paper) 88%, transparent);
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
