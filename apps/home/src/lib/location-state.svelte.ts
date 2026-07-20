// The Intergalactic Park Ranger's Location, lifted out of its component.
//
// It lives here because the deployment is set in one place and drawn in another: the DEPLOYMENT
// control (Planetside / In orbit) is a pill at the edge of the game panel's actions row — the
// panel's BODY — but the backdrop it chooses is scenery painted by the page BEHIND the panel's
// chrome, since the panel sheet is opaque and there's no "behind the panel" the viewer can see.
// The body sets the deployment; the page reads it to know which scene to draw. Neither can own
// state the other needs, so a module of runes holds it between them.
//
// No persistence yet: the PudIdle save doesn't carry deployment, so a reload lands you back at
// Basecamp. A later pass can fold it into that save rather than minting a second storage key.

import { tick } from 'svelte';
import { EXIT_END_MS } from './stage.svelte';

export type Deployment = 'basecamp' | 'orbit';

// `paused` — whether the rigs have downed tools — was PudIdle's own private flag until the PAGE
// grew a control for it: a global play/pause on the panel bar, out beyond the component's reach.
// A bar button up here and a header control down in the body can only share a switch neither of
// them owns — the same bind that put `deployment` in this module in the first place.
// `transit` — a leg of the shuttle's flight, or nothing. It's not WHERE the ranger is (that's
// `deployment`); it's the crossing itself, held only while the white-out plays and the camera
// dives. 'ascend' is the climb to orbit, 'descend' the fall back planetside. The page reads it to
// paint the wipe and to keep the space loop running through both legs; setDeployment sets and
// clears it on the shared clock below.
// `aboard` — whether the ranger has stepped into the shuttle CABIN. It's not a place (that's
// `deployment`) and it's not the crossing (that's `transit`); it's the boarding itself, the
// moment the dashboard clears and the cabin slides in. Deployment can only be CHANGED from
// inside the cabin now — you board, then choose where to fly — so this gate stands between the
// dashboard and the controls that move you. Cleared on arrival: the hatch opens and you step
// back onto the new location's dashboard (see setDeployment).
// `cabin` — whether the cabin itself is on stage. Split from `aboard` because Svelte mounts an
// incoming element into LAYOUT immediately (invisible through its delay, but taking up its box),
// so a cabin gated on `aboard` alone lands in the flow while the dashboard is still flying off —
// the two collide, shoving each other mid-animation. Two bits make it a handoff instead:
// boarding raises `aboard` (cards leave) and only raises `cabin` once the deck has cleared;
// leaving drops `cabin` (the cabin flies off) and only drops `aboard` once it's gone.
export const ranger = $state({
	deployment: 'basecamp' as Deployment,
	paused: false,
	transit: null as 'ascend' | 'descend' | null,
	aboard: false,
	cabin: false
});

// The handoff gaps. BOARD_CLEAR waits out the dashboard's clearing before the cabin mounts;
// CABIN_EXIT waits out the cabin's own departure. Exported beside the transit clock for the same
// reason it is: one copy, nobody drifts.
// BOARD_CLEAR is DERIVED from the stage's shared exit clock (every dashboard exit lands at
// EXIT_END_MS — see stage.svelte.ts) plus 100ms of headroom. The two clocks are now coupled:
// retune the exits and this handoff follows, so the cabin can never mount onto a deck that's
// still clearing.
export const BOARD_CLEAR_MS = EXIT_END_MS + 100;
export const CABIN_EXIT_MS = 340;

// The one pending handoff timer. Board over a half-finished disembark (or vice versa) must
// cancel the other's second phase, or a stale timeout would yank the state mid-choreography.
let seqTimer: ReturnType<typeof setTimeout> | undefined;
// The crossing's own two timers — the flip at COVER, and the settle past the last moving part
// (see setDeployment). Held so a panel that closes MID-CROSSING can cancel them (see leaveShuttle)
// rather than let a stale timeout complete the flight under a dashboard that's already gone.
let flipTimer: ReturnType<typeof setTimeout> | undefined;
let landTimer: ReturnType<typeof setTimeout> | undefined;

// Step into the cabin. Refused mid-flight — you can't board a shuttle that's already in the
// air — so a stray press while the wipe plays does nothing. The dashboard's boarding
// choreography (PudIdle) watches `aboard` and flies the cards offstage; the cabin follows on
// the handoff clock once the deck is clear.
export function board() {
	if (ranger.transit !== null) return;
	clearTimeout(seqTimer);
	ranger.aboard = true;
	if (typeof setTimeout === 'undefined') {
		ranger.cabin = true;
		return;
	}
	seqTimer = setTimeout(() => (ranger.cabin = true), BOARD_CLEAR_MS);
}
// Step back out. Also refused mid-flight: the cabin rides through the crossing (it's the window
// you watch the white-out from), and arrival disembarks you on its own clock (below) — a manual
// disembark is only for backing out BEFORE you commit to a destination. The cabin leaves first;
// the dashboard returns only once it's gone.
export function disembark() {
	if (ranger.transit !== null) return;
	clearTimeout(seqTimer);
	ranger.cabin = false;
	if (typeof setTimeout === 'undefined') {
		ranger.aboard = false;
		return;
	}
	seqTimer = setTimeout(() => (ranger.aboard = false), CABIN_EXIT_MS);
}

// THE TRANSIT CLOCK — one set of timings shared by all three hands that draw the crossing (this
// module fires the flip on it, the page's wipe keyframes are computed from it, and the scene's
// camera flight paces itself by it). Exported so nobody keeps a private copy that could drift.
//   COVER  — white climbs from nothing to fully over the screen
//   HOLD   — it sits opaque; the world is swapped UNSEEN inside this window
//   REVEAL — white fades back off, the new sky underneath it
//   FLIGHT — the camera's ease down from the planet-filling close-up to the resting view
export const WIPE_COVER_MS = 350; // white fully covers
export const WIPE_HOLD_MS = 150;
export const WIPE_REVEAL_MS = 450; // white fades off
export const FLIGHT_MS = 1800;
// A clear point well past the last moving part: the wipe is done at COVER+HOLD+REVEAL, and the
// flight runs its own FLIGHT after the reveal begins, so the sum is the safe moment to drop
// `transit` and let the scene settle to its resting render.
export const TRANSIT_TOTAL_MS = WIPE_COVER_MS + WIPE_HOLD_MS + WIPE_REVEAL_MS + FLIGHT_MS;

// The bar's button can't call into PudIdle to flip the bit, so the flip lives here where both
// sides can reach it. It only turns the switch; the ledger note is narrated by PudIdle's own
// $effect watching this value, so however the flip arrives — bar, header, or a restored save —
// there's exactly one place that decides whether it's worth a line in the log.
export function togglePaused() {
	ranger.paused = !ranger.paused;
}

// Deploying between Basecamp and orbit doesn't just swap two cards — whole sections mount and
// unmount, and the ones that STAY (the ledger column, the places) would snap into their new boxes
// the instant their neighbours left. So the flip runs inside a same-document View Transition: the
// browser snapshots every named element's old box, applies the change, then FLIP-morphs each to
// its new box — the survivors glide instead of jumping, and the recolour (orbit re-themes the
// chrome) crossfades in the same pass. Feature-gated and reduced-motion-gated; where the API is
// missing (older Firefox) or calm is asked for, it falls straight through to the bare assignment,
// which is exactly the pre-transition behaviour. startViewTransition is in the DOM lib, so the
// callback (returning a Promise) needs no cast; the `in` check is the runtime guard for browsers
// whose types have it but whose engine doesn't yet.
export function setDeployment(d: Deployment) {
	// Already there — nothing to cross. And no boarding a shuttle mid-flight: a second press while
	// a transit is in the air is dropped, so the wipe and the camera dive can't be re-triggered
	// halfway and tear.
	if (ranger.deployment === d || ranger.transit !== null) return;
	const flip = () => {
		// The flip is wrapped in a same-document View Transition so the surviving sections morph
		// rather than snap (see the note above the module). On the cinematic path this fires while
		// the white fully covers the screen — the DASHBOARD morphs in plain view under nothing, but
		// the WORLD behind the glass only changes while the sky is washed out, so the scene swap
		// itself is never seen.
		if (typeof document !== 'undefined' && 'startViewTransition' in document) {
			document.startViewTransition(async () => {
				ranger.deployment = d;
				await tick();
			});
		} else {
			ranger.deployment = d;
		}
	};
	const reduce =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	// Calm asked for, or no window to schedule against (SSR-ish safety): keep the CURRENT behaviour
	// exactly — the flip, with its View Transition where available — and set no transit. No wipe,
	// no camera flight; the scene just crossfades as it always has.
	if (reduce || typeof setTimeout === 'undefined') {
		flip();
		// Instant arrival: no wipe to ride, so the hatch opens the moment the world flips. Both
		// bits drop together — calm motion doesn't sequence a handoff it won't watch.
		ranger.cabin = false;
		ranger.aboard = false;
		return;
	}
	// The cinematic path. Raise the leg first so the wipe overlay mounts and the space loop starts
	// running; flip the world at COVER, once the white has the screen; clear the leg past the last
	// moving part so the scene settles to its resting render.
	ranger.transit = d === 'orbit' ? 'ascend' : 'descend';
	// Committing to the crossing DROPS the cabin: travel belongs to the window, not the seat.
	// The card's 280ms exit clears the glass just before the cover has it at 350, so the whole
	// flight — wipe, world-swap, camera — plays over nothing but the chrome and the sky.
	// `aboard` stays raised, keeping the dashboard offstage until landing.
	clearTimeout(seqTimer);
	ranger.cabin = false;
	flipTimer = setTimeout(flip, WIPE_COVER_MS);
	landTimer = setTimeout(() => {
		ranger.transit = null;
		// Arrival opens the hatch straight onto the deck: the cabin already left at boarding
		// commit, so there's nothing to wait out — the destination's dashboard slides in as the
		// flight settles.
		ranger.aboard = false;
	}, TRANSIT_TOTAL_MS);
}

// Leaving the panel ENDS the boarding. board()/disembark() and the crossing are LIVE gestures —
// they belong to a dashboard the viewer is watching. But `ranger` is a module: aboard, cabin and
// transit outlive the component, and the handoff/transit timers above keep ticking after it
// unmounts. Close the panel mid-boarding — or mid-crossing — and those bits stay true with their
// timers still pending, so REOPENING lands you strapped in the cabin, and a half-finished crossing
// then completes UNDER the fresh dashboard: it flips the cabin off and the deck back on, and the
// Shuttle card reveals TWICE — once as the stale cabin, again as the returning place-card.
// So when the dashboard goes away (PudIdle's onDestroy), step off the shuttle: cancel every pending
// timer and clear the transient in-cabin state, leaving the ranger standing on whichever location's
// dashboard they were deployed to. Deployment itself stays put — that's WHERE you are, not the
// boarding, so you come back to the same sky, just no longer in the cabin.
export function leaveShuttle() {
	clearTimeout(seqTimer);
	clearTimeout(flipTimer);
	clearTimeout(landTimer);
	ranger.transit = null;
	ranger.cabin = false;
	ranger.aboard = false;
}
