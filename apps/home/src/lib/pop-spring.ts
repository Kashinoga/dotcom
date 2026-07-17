import { backOut } from 'svelte/easing';

/**
 * A popout card's spring, shared by everything that flies out of a button — the nav's
 * Home/About cards (Masthead) and the sky console's card (+page). The card starts
 * tucked toward its CALLER, then travels away from it into place while swelling from
 * 94% anchored at the caller's corner, on backOut so both overshoot their rest and
 * settle — the same bounce the button family springs with. Played backwards on the way
 * out (Svelte reverses the css ramp) the card gathers itself, then tucks back into its
 * button. Opacity rides ahead of the motion (clamped ×1.8) so the overshoot happens
 * fully drawn, not mid-fade.
 *
 * `y` points from the caller into the card's resting place: -10 for a card hanging
 * BELOW its button (it descends out of it), +10 for one opening ABOVE (it rises).
 * `origin` names the caller's corner, which anchors the swell.
 */
export function popSpring(
	node: HTMLElement,
	p: { y?: number; origin?: string; duration?: number } = {}
) {
	const { y = -10, origin = 'left top', duration = 340 } = p;
	return {
		duration,
		easing: backOut,
		css: (t: number) =>
			`transform-origin: ${origin}; transform: translateY(${(1 - t) * y}px) scale(${0.94 + t * 0.06}); opacity: ${Math.min(1, t * 1.8)};`
	};
}
