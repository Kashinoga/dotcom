// gridFit — Svelte action for the .puhig-grid background.
//
// The grid is a pure-CSS gradient (no DOM nodes). The one thing CSS can't do
// is size the tile so a WHOLE number fits its box — that needs a tile count,
// and calc() can't divide a length by a length. So this action does the single
// arithmetic CSS lacks: tile = box / round(box / target), an exact whole-tile
// fit on both axes, written as two CSS custom properties. No DOM, no rebuild —
// the browser re-tiles the gradient on the GPU.
//
// Crucially it measures THE ELEMENT IT'S ON (via ResizeObserver), not the
// viewport — so whole tiles hold whether the grid is full-bleed or inside an
// inset/bordered panel. Measuring the window instead would size tiles to the
// viewport while painting into a smaller panel, and the remainder shows as
// partial tiles at the right/bottom edges.

export function gridFit(node: HTMLElement, target = 32) {
	let t = target;
	let raf = 0;

	function fit() {
		// clientWidth/Height = the padding box (border + scrollbar excluded),
		// which is exactly the background positioning area the grid paints into.
		const w = node.clientWidth;
		const h = node.clientHeight;
		if (!w || !h) return;
		const cols = Math.max(1, Math.round(w / t));
		const rows = Math.max(1, Math.round(h / t));
		node.style.setProperty('--grid-tile-x', `${w / cols}px`);
		node.style.setProperty('--grid-tile-y', `${h / rows}px`);
	}

	function schedule() {
		if (!raf) raf = requestAnimationFrame(() => ((raf = 0), fit()));
	}

	// One observer covers every resize source (viewport, layout, URL bar) and
	// reports the element's own box — no window listener needed.
	const ro = new ResizeObserver(schedule);
	ro.observe(node);
	fit();

	return {
		update(next: number) {
			t = next ?? target;
			fit();
		},
		destroy() {
			if (raf) cancelAnimationFrame(raf);
			ro.disconnect();
		}
	};
}
