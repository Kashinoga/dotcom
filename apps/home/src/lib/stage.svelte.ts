// THE STAGE — the boarding choreography, lifted out of PudIdle so the dashboard's cards all
// leave and return by the same rules instead of hand-copying the same fly/scale objects onto
// six wrappers. When the ranger boards the shuttle the whole dashboard clears; when they step
// back out it returns. This module hands each section the transition params for its own door.
//
// Every law below was earned by a visible bug this session. Break one and the bug comes back.
//
//   1. SHARED EXIT END. Staggered starts, ONE end. An outroing element keeps its layout box
//      only until ITS OWN transition ends — so with ragged ends, each early finisher yanks the
//      still-leaving survivors across the space it just vacated, mid-flight. Every exit builder
//      therefore takes a DELAY and spends what's left of the shared clock: duration =
//      EXIT_END_MS − delay. Start whenever; land together, on an empty stage, in one reflow.
//      (The cabin is the exception that proves it — it exits ALONE, so its fall is a flat time.)
//
//   2. NEAREST DOOR. A thing leaves by the edge it sits nearest. Left things exit left (fly
//      x −90), right things exit right (x +90), things in the middle have no edge to reach so
//      they RECEDE (scale 0.92). Entrances mirror their exits — you come back in the door you
//      left by. The cabin is the odd one: it has no side, so it rises from below (y 28).
//
//   3. REDUCED MOTION. A viewer who asked for calm gets the swap without the travel: the deltas
//      go to zero (x: 0, scale start: 1) and OPACITY alone carries the change. The preference is
//      read ONCE, SSR-guarded — matchMedia is undefined on the server, which reads as "no
//      preference".
//
//   4. FIRST-MOUNT GATE. Directional ENTRANCES stay parked (duration 0) until the stage has been
//      used at least once (`use()` / `used`). The panel plays its own arrival flourish
//      (pud-settle) on first mount, and a live slide-in on top of it stacked two entrances into
//      one jump. Exits are never gated — the first thing the stage ever does is clear.
//
//   5. TWO DOC-ONLY LAWS, for whoever wires a new section to a door:
//      · An incoming element takes its layout box at MOUNT — delay or no delay. Sequence the
//        mount as a two-phase handoff (raise the leaving gate, then mount the arriving one once
//        the deck has cleared), the way location-state's board()/disembark() do. Don't lean on a
//        transition delay to hold an element out of the flow; it won't.
//      · A transition that must fire when an OUTER gate toggles, sitting above an inner
//        conditional, needs |global — or it goes quietly missing. Failing that, put the gate on a
//        bare wrapper whose transition sits directly inside its own {#if}.

import type { FlyParams, ScaleParams } from 'svelte/transition';
import { cubicIn, backOut } from 'svelte/easing';

// The shared clock the exits all land on. Retune this and every exit's duration follows, because
// each is computed from it — the stagger is in the delays, never in the end. location-state's
// BOARD_CLEAR_MS is derived from this too, so the handoff that mounts the cabin waits exactly as
// long as the clearing takes.
export const EXIT_END_MS = 460;
// The directional entrances' flat run, once the stage is live (law 4). Not a shared clock — the
// arrivals stagger by delay and each plays its whole length, there's nothing on stage to collide
// with on the way IN.
export const ENTER_MS = 450;

// The cabin's own y-axis pair. It boards alone, into cleared space, so neither end obeys the
// shared exit clock — these are flat times of their own. Enter is the arrival flourish (a touch
// long, backOut); exit is quicker (cubicIn) because the dashboard is waiting behind it.
const CABIN_ENTER_MS = 450;
const CABIN_EXIT_MS = 280;
const CABIN_Y = 28;

// The side deltas. Left/right things fly this far; the middle recedes to this scale.
const FLY_X = 90;
const RECEDE_TO = 0.92;

export function createStage() {
	// Has the shuttle been boarded once this session? Raised by use(), read by the entrance
	// builders (law 4) and by .pud's class:reboarded, which mutes the pud-settle keyframe once
	// remounts belong to boarding rather than to the panel's first arrival.
	let used = $state(false);

	// Read the motion preference ONCE (law 3), SSR-guarded: matchMedia is undefined on the server,
	// which reads as "no preference" — the same idiom location-state uses.
	const reduced =
		typeof matchMedia !== 'undefined' &&
		matchMedia('(prefers-reduced-motion: reduce)').matches;

	return {
		get used() {
			return used;
		},
		use() {
			used = true;
		},

		// ── The exits. Nearest door, shared end (laws 1 & 2). ──
		// Left edge — flies out to the left. duration spends what's left of the shared clock.
		exitLeft(delay = 0): FlyParams {
			return { x: reduced ? 0 : -FLY_X, duration: EXIT_END_MS - delay, easing: cubicIn, delay };
		},
		// Right edge — flies out to the right.
		exitRight(delay = 0): FlyParams {
			return { x: reduced ? 0 : FLY_X, duration: EXIT_END_MS - delay, easing: cubicIn, delay };
		},
		// The middle — no edge to reach, so it recedes.
		exitBack(delay = 0): ScaleParams {
			return { start: reduced ? 1 : RECEDE_TO, duration: EXIT_END_MS - delay, easing: cubicIn, delay };
		},

		// ── The entrances. Mirror the exits; parked until the stage is used (laws 2 & 4). ──
		enterLeft(delay = 0): FlyParams {
			return { x: reduced ? 0 : -FLY_X, duration: used ? ENTER_MS : 0, easing: backOut, delay };
		},
		enterRight(delay = 0): FlyParams {
			return { x: reduced ? 0 : FLY_X, duration: used ? ENTER_MS : 0, easing: backOut, delay };
		},
		// The receding pair's return. Takes a duration because the two things that recede don't come
		// back at the same speed — the requisitions sheet settles in ENTER_MS, the forestry detail a
		// touch quicker (400); pass it and the parity holds.
		enterBack(delay = 0, duration = ENTER_MS): ScaleParams {
			return { start: reduced ? 1 : RECEDE_TO, duration: used ? duration : 0, easing: backOut, delay };
		},

		// ── The cabin's own pair. Rises from below, falls back the same way. NOT gated on `used`:
		// the cabin only ever mounts by choreography (it doesn't exist on first arrival), so there's
		// no pud-settle to stack with — its fly IS its whole entrance. Flat times, not the shared
		// exit clock (see CABIN_* above). ──
		enterUp(delay = 0): FlyParams {
			return { y: reduced ? 0 : CABIN_Y, duration: CABIN_ENTER_MS, easing: backOut, delay };
		},
		exitDown(delay = 0): FlyParams {
			return { y: reduced ? 0 : CABIN_Y, duration: CABIN_EXIT_MS, easing: cubicIn, delay };
		}
	};
}
