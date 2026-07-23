// Make the press squash survive a TAP.
//
// The universal button press is a CSS transition on :active, and a transition needs time on the
// clock. A deliberate click holds the button down for a couple hundred milliseconds and the
// squash plays in full; a macOS trackpad tap-to-click releases in well under a frame, so :active
// comes and goes before the 0.1s transition has gone anywhere. Measured on the Park Ranger's
// Extract button (press scale 0.95):
//
//   held 250ms → 0.945   held 80ms → 0.945   held 30ms → 0.957   TAP (0ms) → 1.0, nothing at all
//
// So a tap silently lost the feedback that a click gets. This holds the pressed state on for a
// short floor after pointerdown, so the squash always gets its 0.1s regardless of how briefly
// the finger was actually down. If the press outlasts the floor, :active is still holding it and
// dropping the class changes nothing.
//
// The control is found by the RECIPE'S OWN FINGERPRINT — a transform transition on the app's
// spring curve — rather than by a list of class names. The spring is opt-in by class name in
// four parallel selector lists already; a fifth copy over here in JS would be the one that
// silently drifts, and a control missing from it would look fine under a click and dead under a
// tap. Anything wearing the spring gets this, including panels that build their own chrome.
const SPRING = 'cubic-bezier(0.34, 1.4';
/** How long the squash is held from pointerdown — comfortably past the 0.1s press transition. */
const FLOOR_MS = 140;
/** Controls nest (a mark inside a badge inside a button), so walk a few levels, not one. */
const MAX_DEPTH = 5;

/** Does this element wear the shared button spring? */
function wearsTheSpring(el: Element): boolean {
	const cs = getComputedStyle(el);
	const props = cs.transitionProperty.split(',').map((s) => s.trim());
	const i = props.indexOf('transform');
	if (i < 0) return false;
	// Split on commas that aren't inside cubic-bezier(...)'s own argument list.
	const easings = cs.transitionTimingFunction.split(/,(?![^(]*\))/).map((s) => s.trim());
	return !!easings[i]?.includes(SPRING);
}

/** Install the tap-press floor. Returns a teardown. Safe to call only in the browser. */
export function installTapPress(): () => void {
	if (typeof document === 'undefined') return () => {};
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
	const timers = new WeakMap<Element, number>();

	const onDown = (e: PointerEvent) => {
		// The motion gate is respected here as well as in the CSS: with a preference set there's
		// no squash to hold, so there's nothing to do.
		if (reduced.matches) return;
		let el = e.target instanceof Element ? e.target : null;
		for (let depth = 0; el && depth < MAX_DEPTH; depth++, el = el.parentElement) {
			if ((el as HTMLButtonElement).disabled) return; // a dead control must stay dead
			if (!wearsTheSpring(el)) continue;
			const node = el;
			window.clearTimeout(timers.get(node));
			node.classList.add('btn-tap');
			timers.set(
				node,
				window.setTimeout(() => node.classList.remove('btn-tap'), FLOOR_MS)
			);
			return;
		}
	};

	// Capture, so a control that stops propagation on its own handler still gets its squash.
	document.addEventListener('pointerdown', onDown, true);
	return () => document.removeEventListener('pointerdown', onDown, true);
}
