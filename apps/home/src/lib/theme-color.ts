// THE BROWSER CHROME'S COLOUR — what iOS Safari paints behind the Dynamic Island, the address
// bar and the home indicator, and what Android Chrome tints its bar with. It is `<meta
// name="theme-color">`, and Safari has honoured it since iOS 15.
//
// Left unset, Safari samples the page itself and guesses. It guesses well most of the time,
// which is why this was never obviously broken — and badly the rest of the time, which is why
// it is worth saying outright.
//
// WHAT COLOUR? The superbar's. That is the band the chrome actually abuts: the docs shell's
// bar, the Star Map's, the ranger's, the board's. Get it right and the browser's furniture
// reads as the top of the page rather than as a lid resting on it.
//
// So this MEASURES rather than deciding. A table of "this app, that colour" would be four
// entries wrong the day a fifth app lands, and it could not answer the harder half anyway: the
// bars are FROSTED. Their painted colour is a wash at 78%, and what you see is that wash
// composited over whatever is passing beneath — which changes as the page scrolls, and differs
// between a docs sheet and a starfield. There is no constant to write down.
//
// The measurement is the browser's own answer to "what is at this pixel": elementsFromPoint at
// the top edge gives the whole stack under it, and a 1×1 canvas composites their backgrounds in
// paint order. Canvas source-over IS the alpha maths, so the frost comes out right for free, and
// `fillStyle` parses every colour syntax the page can produce — including the color-mix() output
// that computed style hands back as `color(srgb …)`, which no hand-rolled rgb() parser survives.
//
// What it cannot see is a PICTURE: a canvas or an <img> reports no background colour, so a bar
// over the Star Map's starfield composites against the panel fill behind it rather than the
// stars. The answer stays in the right family — it is the bar's own wash that dominates either
// way — and the alternative is reading pixels back off a WebGL canvas every scroll frame.
//
// A blurred backdrop is likewise approximated by the colour under it, which is what a blur of a
// broadly flat region is.

/** The point sampled: the middle of the viewport's top edge, just inside it. */
const SAMPLE_Y = 3;

// The live installation's scheduler, so a caller that knows something changed can say so —
// see refreshThemeColor. Module-level because there is only ever one browser chrome.
let scheduled: (() => void) | null = null;

/**
 * Re-read the bar, because something this file cannot observe has changed. The layout calls it
 * on navigation: a panel opens by SHALLOW routing (pushState → page.state, see the page's
 * syncUrl), which swaps the whole bar without touching an attribute on <html> or scrolling
 * anything, so none of the listeners below would ever hear it.
 */
export function refreshThemeColor(): void {
	scheduled?.();
}

export function installThemeColor(): (() => void) | void {
	if (typeof document === 'undefined') return;
	const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
	// No tag, nothing to say. It ships in app.html with a pre-paint value (see the script there),
	// so its absence means someone removed it deliberately.
	if (!meta) return;

	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 1;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return;

	let queued = 0;
	let trailing = 0;
	let last = '';

	const read = (): string => {
		// Opaque white base: the colour a browser shows through a page that paints nothing, so a
		// fully transparent stack lands on the truth rather than on black.
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, 1, 1);
		// elementsFromPoint is TOPMOST FIRST; painting order is the reverse.
		const stack = document.elementsFromPoint(Math.round(window.innerWidth / 2), SAMPLE_Y);
		for (let i = stack.length - 1; i >= 0; i--) {
			const bg = getComputedStyle(stack[i]).backgroundColor;
			// Skip the fully transparent, which is most elements — and skip anything the canvas
			// refuses, rather than letting a bad value poison the accumulator: an invalid
			// fillStyle assignment is IGNORED by the spec, which would silently repaint the
			// previous layer a second time.
			if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') continue;
			const before: string | CanvasGradient | CanvasPattern = ctx.fillStyle;
			ctx.fillStyle = bg;
			if (ctx.fillStyle === before && bg !== before) continue;
			ctx.fillRect(0, 0, 1, 1);
		}
		const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
		return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
	};

	const sample = () => {
		queued = 0;
		const next = read();
		// Only on a real change. Writing the attribute every scroll frame makes Safari re-evaluate
		// its chrome tint, and the same value written repeatedly can flicker it.
		if (next !== last) {
			last = next;
			meta.content = next;
		}
	};

	// One sample per frame at most. Scroll fires far faster than the bar can change, and the read
	// costs a hit-test plus a getImageData.
	const schedule = () => {
		if (!queued) queued = requestAnimationFrame(sample);
	};

	// SOME CHANGES ARE NOT INSTANT. Switching Display Mode does not repaint the bar, it
	// TRANSITIONS it — so a sample taken on the next frame reads the colour the bar is leaving,
	// and the chrome sits one step behind the page for as long as nobody scrolls. (Measured: the
	// bar at rgb(32,32,35) with the meta still on #ffffff, then the reverse on the way back.)
	// So a change that can animate samples twice: once now, so a jump is instant, and once after
	// the longest of the family's colour transitions has landed. transitionend would be exact,
	// but the tokens are inherited — the property that animates is on a dozen descendants, and
	// several of the bars cross-fade rather than transition a colour at all.
	const SETTLE_MS = 500;
	const settle = () => {
		schedule();
		clearTimeout(trailing);
		trailing = window.setTimeout(sample, SETTLE_MS);
	};

	// SCROLL, capturing: the thing that scrolls is not the window. The docs shell owns its own
	// scroller (.docs-scroll) and every full app owns another, so the only listener that hears
	// all of them is one on the way DOWN. Scroll does not bubble; capture is the whole trick.
	// Scrolling moves content behind the frost immediately — no transition to wait out.
	document.addEventListener('scroll', schedule, { capture: true, passive: true });
	window.addEventListener('resize', settle, { passive: true });
	// The look, the display mode and the sky all land as attributes on <html> — set pre-paint by
	// app.html and kept in step by the page. Watching the element is cheaper than subscribing to
	// each of the three, and it cannot fall out of step with a fourth.
	const attrs = new MutationObserver(settle);
	attrs.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-look', 'data-theme', 'data-sky', 'data-sky-photo', 'class']
	});
	// The OS scheme, for a visitor who has not forced one.
	const mq = window.matchMedia('(prefers-color-scheme: dark)');
	mq.addEventListener('change', settle);

	// The first read waits a frame: called from an effect, the DOM is up but styles for a
	// just-navigated view may not have settled, and a bar measured mid-swap is a colour nobody
	// ever sees.
	scheduled = settle;
	settle();

	return () => {
		scheduled = null;
		if (queued) cancelAnimationFrame(queued);
		clearTimeout(trailing);
		document.removeEventListener('scroll', schedule, { capture: true });
		window.removeEventListener('resize', settle);
		attrs.disconnect();
		mq.removeEventListener('change', settle);
	};
}
