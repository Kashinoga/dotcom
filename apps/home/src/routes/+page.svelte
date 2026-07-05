<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import SplitFlap from '$lib/SplitFlap.svelte';

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
		SFO: { at: [150, 240], title: 'Now' },
		NRT: { at: [360, 60], title: 'Writing' },
		JFK: { at: [800, 180], title: 'Log' },
		DXB: { at: [760, 430], title: 'Contact' },
		SYD: { at: [520, 560], title: 'Photos' },
		LAX: { at: [200, 470], title: 'Notes' },
		// About splits into its own two stops — Work and Projects.
		ABT: { at: [450, 55], title: 'About' },
		WRK: { at: [503, -143], title: 'Work' },
		PRJ: { at: [653, 7], title: 'Projects' },
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
		{ name: 'Verde', color: '#12a150', legs: [['KSH', 'JFK'], ['JFK', 'BOS'], ['KSH', 'ABT'], ['ABT', 'PRJ'], ['ABT', 'WRK']] },
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
	const worldMinX = Math.min(...bx);
	const worldMaxX = Math.max(...bx);
	const worldMinY = Math.min(...by);
	const worldMaxY = Math.max(...by);

	// ─── Page content per destination ───────────────────────────────────────────
	// A block list rendered into the content surface. Swap the placeholder copy for
	// real writing; add { h }, { p }, { img }, { quote } blocks freely.
	type Block =
		| { h: string }
		| { sub: string }
		| { p: string }
		| { img: string }
		| { quote: string };
	const pages: Record<string, Block[]> = {
		// Welcome — the home hub greeting, from dotcom-2 card K 001.
		KSH: [
			{ p: 'This is Kashinoga, my virtual home. Here you’ll find the (mostly) fun things I’ve created or found.' },
			{ p: 'I hope you enjoy your time here.' },
			{ quote: 'Take care.' }
		],
		NRT: [
			{ p: 'Writing collects essays, notes, and longer pieces — the slow, considered end of the network.' },
			{ h: 'Recent' },
			{ p: 'Placeholder copy: a list or paragraph pointing at recent pieces. Each could itself become a destination on the map.' },
			{ img: 'A cover image for the latest piece.' },
			{ p: 'Body text continues here with room to breathe and a comfortable reading measure.' }
		],
		// Work — a stop off About, from dotcom-2 About card K 202.
		WRK: [
			{ p: 'A digital infrastructure engineer for U.S. energy companies.' },
			{ p: 'Formerly a software engineering consultant for Midwestern U.S. companies and the State of Iowa.' },
			{ p: 'B.S. in Computer Science, Iowa State University; general education from Drake University.' },
			{ quote: 'Midwest-made.' }
		],
		// Projects — a stop off About, from dotcom-2 About card K 203.
		PRJ: [
			{ p: 'Things I have created and operate.' },
			{ sub: 'Digital Community Services' },
			{ p: 'Matrix, Nextcloud, and Open WebUI — for a better digital well-being.' },
			{ sub: 'Digital Play Services' },
			{ p: 'Casual, community, and competitive gaming for friends.' },
			{ sub: 'SDKK' },
			{ p: 'A safe, friendly Discord community.' },
			{ quote: 'For friends and family.' }
		],
		// About / intro — dotcom-2 About card K 201.
		ABT: [
			{ h: 'Andrew Nguyen' },
			{ p: 'I enjoy nature, literature, and video games — and heightened experiences.' },
			{ p: 'Based in the Midwestern United States, with occasional visits to Southeast Asia for friends and family.' },
			{ p: 'Say hello: contact@kashinoga.com' }
		]
	};
	const stub = (t: string): Block[] => [
		{
			p: `“${t}” is a placeholder destination. This surface scrolls and holds headings, paragraphs, images, and quotes — drop the real ${t.toLowerCase()} content here.`
		}
	];

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

	// ─── Camera: crop the world, fly between crops to "move pages" ───────────────
	const ASPECT = 1.5; // viewBox w/h
	// Home is zoomed to the hub so routes bleed off every edge; a node focus keeps
	// the node in the left-of-panel area (biasX) with its neighbours in view.
	function crop(cx: number, cy: number, w: number, biasX = 0.5, biasY = 0.5) {
		const h = w / ASPECT;
		return { x: cx - w * biasX, y: cy - h * biasY, w, h };
	}
	// Home framing: the whole left column is UI (masthead top-left, legend
	// bottom-left), so bias the network to the centre-right — hub past centre,
	// spokes fanning right — keeping the left clear of routes and nodes.
	const HOME = crop(P.KSH[0], P.KSH[1], 860, 0.66, 0.56);

	let cam = $state({ ...HOME });
	// A destination page, a highlighted airline line, or neither.
	type View = { kind: 'port'; code: string } | { kind: 'line'; idx: number };
	let view = $state<View | null>(null);
	let target = { ...HOME };
	let raf = 0;

	// Drag-to-pan.
	let svgEl: SVGSVGElement;
	let panning = $state(false);
	let dragMoved = false;
	const drag = { camX: 0, camY: 0, x: 0, y: 0, id: -1 };

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
		view = { kind: 'port', code };
		flyTo(crop(P[code][0], P[code][1], 720, 0.3));
	}
	function openLine(idx: number) {
		view = { kind: 'line', idx };
		flyTo(fitLine(idx));
	}
	function home() {
		view = null;
		flyTo(HOME);
	}
	// Escape: close an open panel, or (if none) fly back to the KSH home view.
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') home();
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
		const r = svgEl.getBoundingClientRect();
		const s = Math.min(r.width / cam.w, r.height / cam.h); // uniform meet scale
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
	function nodeDim(code: string) {
		if (!view) return false;
		return view.kind === 'port' ? view.code !== code : !lineOf[view.idx].has(code);
	}
	function arcDim(airlineIdx: number) {
		if (!view) return false;
		return view.kind === 'port' ? true : view.idx !== airlineIdx;
	}

	onDestroy(() => raf && cancelAnimationFrame(raf));

	const viewBox = $derived(
		`${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${cam.w.toFixed(1)} ${cam.h.toFixed(1)}`
	);
</script>

<svelte:window onkeydown={onKey} />

<div class="stage" class:panning>
	<svg
		bind:this={svgEl}
		{viewBox}
		preserveAspectRatio="xMidYMid meet"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onclickcapture={onClickCapture}
		role="img"
		aria-label="Kashinoga — airline route map"
	>
		<!-- empty-space click flies home -->
		<rect class="bg" x={bg.x} y={bg.y} width={bg.w} height={bg.h} onclick={home} role="presentation" />

		{#each arcs as a}
			<path
				class="arc"
				class:dim={arcDim(a.i)}
				d={a.d}
				stroke={a.color}
				pathLength="1"
				style="--i:{a.i}"
			/>
		{/each}

		{#each nodes as n}
			<g
				class="node"
				class:active={isActive(n.code)}
				class:dim={nodeDim(n.code)}
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

	<header class="masthead" class:hidden={view !== null}>
		<h1><SplitFlap text="Kashinoga" /></h1>
		<p class="tagline">an airline route map of one person&rsquo;s internet</p>
	</header>

	<ul class="legend" class:hidden={view !== null}>
		{#each airlines as a, i}
			<li style="--n:{i}">
				<button class="legend-btn" onclick={() => openLine(i)}>
					<span class="swatch" style="background:{a.color}"></span>{a.name}
				</button>
			</li>
		{/each}
	</ul>

	{#if view}
		{@const v = view}
		{#key v.kind === 'port' ? 'p' + v.code : 'l' + v.idx}
			<aside class="surface" in:fly={{ x: 60, duration: 420 }} out:fade={{ duration: 160 }}>
				{#if v.kind === 'port'}
					{@const port = airports[v.code]}
					{@const blocks = pages[v.code] ?? stub(port.title)}
					{@const conns = [...new Set(adj[v.code] ?? [])]}
					<div class="surface-strip" style:background={accent[v.code]}></div>
					<div class="surface-head">
						<button class="back" onclick={home}>&larr; route map</button>
						<p class="eyebrow">Now arriving &middot; <span style:color={accent[v.code]}>{v.code}</span></p>
						<h2 class="dest"><SplitFlap text={port.title} base={160} stagger={45} /></h2>
					</div>
					<div class="surface-body">
						{#each blocks as b}
							{#if 'h' in b}
								<h3>{b.h}</h3>
							{:else if 'sub' in b}
								<h4>{b.sub}</h4>
							{:else if 'quote' in b}
								<blockquote>{b.quote}</blockquote>
							{:else if 'img' in b}
								<figure class="img">
									<div class="img-ph" style:--tint={accent[v.code]}><span>image</span></div>
									<figcaption>{b.img}</figcaption>
								</figure>
							{:else if 'p' in b}
								<p>{b.p}</p>
							{/if}
						{/each}

						{#if conns.length}
							<nav class="onward">
								<p class="eyebrow">Connecting flights</p>
								<ul>
									{#each conns as c}
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
					</div>
				{:else}
					{@const a = airlines[v.idx]}
					{@const stops = [...lineOf[v.idx]]}
					<div class="surface-strip" style:background={a.color}></div>
					<div class="surface-head">
						<button class="back" onclick={home}>&larr; route map</button>
						<p class="eyebrow">Route line</p>
						<h2 class="dest"><SplitFlap text={a.name} base={160} stagger={45} /></h2>
					</div>
					<div class="surface-body">
						<p>
							The <strong>{a.name}</strong> line calls at {stops.length} destinations across
							the network — tap a station to fly there.
						</p>
						<nav class="onward">
							<p class="eyebrow">Stations on this line</p>
							<ul>
								{#each stops as c}
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
					</div>
				{/if}
			</aside>
		{/key}
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
		touch-action: none;
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
	@media (prefers-reduced-motion: no-preference) {
		.tagline {
			animation: rise 0.6s ease 1.05s both;
		}
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: none;
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
		transition: opacity 0.4s ease, transform 0.4s ease;
	}
	.legend li {
		display: flex;
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
		outline: 2px solid var(--ink);
		outline-offset: 3px;
	}
	/* Same rise as the tagline, staggered so the bottom bar populates in sequence.
	 * On the li (not the ul, which owns the show/hide transform for navigation). */
	@media (prefers-reduced-motion: no-preference) {
		.legend li {
			animation: rise 0.5s ease both;
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
		opacity: 0;
		transform: translateY(-8px);
		pointer-events: none;
	}
	.legend.hidden {
		opacity: 0;
		transform: translateY(8px);
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
		background: color-mix(in srgb, var(--paper) 94%, transparent);
		backdrop-filter: blur(10px);
		border-left: 1.5px solid color-mix(in srgb, var(--ink) 18%, transparent);
		box-shadow: -24px 0 60px rgba(0, 0, 0, 0.08);
	}
	.surface-strip {
		flex: none;
		height: 5px;
	}
	.surface-head {
		flex: none;
		padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1.5rem, 4vw, 2.75rem) 1.25rem;
		border-bottom: 1px solid color-mix(in srgb, var(--ink) 10%, transparent);
	}
	.back {
		align-self: flex-start;
		margin-bottom: 1.4rem;
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
		margin: 0 0 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.dest {
		margin: 0;
		font-size: clamp(2rem, 6vw, 3rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--ink);
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
	.onward {
		margin-top: 1.4rem;
		padding-top: 1.25rem;
		border-top: 1px solid color-mix(in srgb, var(--ink) 10%, transparent);
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
		background: color-mix(in srgb, var(--ink) 10%, transparent);
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
</style>
