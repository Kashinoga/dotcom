<script module lang="ts">
	// The scene that lives inside the Canvas. It has to be its own component:
	// Threlte's hooks (useTask, useThrelte) read the Canvas context, and only a
	// real child component sits inside it — a snippet would run in the parent's
	// context and find nothing there. LocaleSpace.svelte is the public face; this
	// is the orbit it holds.
	//
	// The star field is built once, at module load, and shared by every mount —
	// fixed points on a shell around the origin. Math.random() here is a one-time
	// scatter, not a per-frame cost.
	//
	// The shell radius (16–30) keeps the camera — pulled back to z≈12.2 for the
	// long lens — comfortably interior, so stars wrap the view rather than crowd in
	// front or clip the near plane. The narrow 30° lens sees a smaller cone than the
	// old wide one, so the count is raised to keep the frame lush behind the glass.
	import { BackSide, BufferGeometry, Float32BufferAttribute } from 'three';

	const STAR_COUNT = 1800;
	const SHELL_MIN = 16;
	const SHELL_SPAN = 14; // radius spans 16–30

	function makeStarField(): BufferGeometry {
		const positions = new Float32Array(STAR_COUNT * 3);
		const colors = new Float32Array(STAR_COUNT * 3);

		for (let i = 0; i < STAR_COUNT; i += 1) {
			// A random direction on the unit sphere, pushed out to a shell so the
			// stars wrap the camera rather than crowd a plane behind the planet.
			const u = Math.random() * 2 - 1; // cos(phi)
			const theta = Math.random() * Math.PI * 2;
			const r = Math.sqrt(1 - u * u);
			const radius = SHELL_MIN + Math.random() * SHELL_SPAN; // 16–30

			positions[i * 3] = Math.cos(theta) * r * radius;
			positions[i * 3 + 1] = u * radius;
			positions[i * 3 + 2] = Math.sin(theta) * r * radius;

			// Near-white, nudged a touch warm or cool so the field isn't clinical.
			const warm = Math.random();
			colors[i * 3] = 1; // r
			colors[i * 3 + 1] = 0.96 + warm * 0.04; // g
			colors[i * 3 + 2] = 0.9 + (1 - warm) * 0.1; // b
		}

		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
		geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
		return geometry;
	}

	const starGeometry = makeStarField();
</script>

<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { Vector3 } from 'three';
	import type { Group, Points, PerspectiveCamera } from 'three';
	import { ranger, WIPE_COVER_MS, WIPE_HOLD_MS, FLIGHT_MS } from '$lib/location-state.svelte';

	// Orbit vs planetside. When false the scene is invisible behind the parent's
	// opacity fade, so it earns no frame budget (see the $effect below). During a TRANSIT the
	// parent keeps this true through both legs (see the page), so the loop runs while the camera
	// flies even after the deployment has flipped under the white.
	let { active = true }: { active?: boolean } = $props();

	// ── The camera flight ─────────────────────────────────────────────────────────
	// The deployment doesn't just crossfade any more — the shuttle FLIES it. Launch is a white-out
	// to the planet filling the glass, then the fall away to the resting view; descent is the same
	// road driven the other way. The rig rests at REST looking at the origin (the framing the scene
	// has always held); CLOSE is pulled right up to the planet — at ~4.64 units from a sphere of
	// radius 1.8 the planet subtends ≈21°, over the 30° lens's 15° half-angle, so it OVERFILLS the
	// frame. The lookAt target lerps too (origin ↔ the planet's own centre) so the planet stays
	// centred through the dive rather than sliding off the long lens.
	const REST = new Vector3(0, 0, 12.2); // the resting camera (matches the tag below)
	const ORIGIN = new Vector3(0, 0, 0); // the resting lookAt
	const PLANET = new Vector3(-2.6, -1.9, 0); // the planet group's position (matches the tag below)
	const CLOSE = new Vector3(-2.1, -1.6, 4.6); // PLANET + [0.5, 0.3, 4.6] — the planet-filling close-up

	// Two easings, defined inline to keep the scene self-contained: the launch eases OUT (fast off
	// the planet, settling gently into the resting view), the dive eases IN (drifting from rest,
	// then plunging into the wash).
	const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
	const easeIn = (t: number) => t * t * t;

	let camera = $state<PerspectiveCamera>();
	// The flight in the air, or nothing. `startAt` is a performance.now() stamp: before it the rig
	// parks at `fromPos` (the launch's pre-reveal hold at CLOSE), after it the lerp runs to `dur`.
	// A plain let, not $state — it's read and cleared inside the frame task, never in the template.
	let flight: {
		fromPos: Vector3;
		toPos: Vector3;
		fromTgt: Vector3;
		toTgt: Vector3;
		startAt: number;
		dur: number;
		ease: (t: number) => number;
	} | null = null;
	// Scratch vectors, reused every frame so the flight allocates nothing.
	const _pos = new Vector3();
	const _tgt = new Vector3();

	function startFlight(leg: 'ascend' | 'descend') {
		const now = performance.now();
		if (leg === 'ascend') {
			// LAUNCH — the rig is already at the planet (the frame task parks it at `fromPos` through
			// the white cover + hold, all unseen under the wash); it begins falling away just as the
			// white starts to reveal, so the planet-filling view is the first thing the reveal shows.
			flight = {
				fromPos: CLOSE,
				toPos: REST,
				fromTgt: PLANET,
				toTgt: ORIGIN,
				startAt: now + WIPE_COVER_MS + WIPE_HOLD_MS,
				dur: FLIGHT_MS,
				ease: easeOut
			};
		} else {
			// DESCENT — the same road the other way: the resting view dives so the planet fills the
			// glass just as the white finishes covering, and the flip then hides the scene under the
			// wash (the loop keeps rendering, invisibly, until the transit clears and we reset).
			flight = {
				fromPos: REST,
				toPos: CLOSE,
				fromTgt: ORIGIN,
				toTgt: PLANET,
				startAt: now,
				dur: WIPE_COVER_MS,
				ease: easeIn
			};
		}
	}

	// The park planet turns; the stars drift the other way, slower still. Both are
	// refs we nudge each frame — nothing else in the scene moves.
	let planet = $state<Group>();
	let stars = $state<Points>();

	// renderMode is the master switch on the frameloop: 'on-demand' produces frames
	// while the drift task keeps invalidating; 'manual' produces none. invalidate()
	// forces one fresh frame on resume.
	const { renderMode, invalidate } = useThrelte();

	// One read at init. A still sky is a fine sky, so if the viewer asked for calm
	// we simply never register the loop and let the scene hold its pose — `spin`
	// stays undefined, and every start/stop below harmlessly no-ops.
	const reduced =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const spin = reduced
		? undefined
		: useTask((delta) => {
				if (planet) planet.rotation.y += 0.02 * delta;
				if (stars) stars.rotation.y -= 0.004 * delta;
				// The flight rides the same task, so it lives and dies with the loop's active gate
				// below (no camera motion while the scene is parked). Before `startAt` the progress
				// pins to 0 — the rig parks at `fromPos` (CLOSE) through the launch's white cover and
				// hold, unseen under the wash — then eases to `dur` and rests. lerp on both the
				// position and the lookAt target keeps the planet centred through the move.
				if (flight && camera) {
					const now = performance.now();
					const t = now < flight.startAt ? 0 : Math.min(1, (now - flight.startAt) / flight.dur);
					const e = flight.ease(t);
					_pos.copy(flight.fromPos).lerp(flight.toPos, e);
					_tgt.copy(flight.fromTgt).lerp(flight.toTgt, e);
					camera.position.copy(_pos);
					camera.lookAt(_tgt);
					invalidate();
					if (t >= 1) flight = null; // arrived — let the rig rest
				}
			});

	// Set the flight up once per transit leg, off the shared clock (see location-state). This reads
	// ONLY ranger.transit, so it fires on the rise of a leg and again when it clears — the dedupe
	// keeps a re-run for the same leg from re-arming a flight already in the air. Calm never flies;
	// the reset on deactivation (below) is what lands a reduced-motion viewer cleanly at REST.
	let flownFor: 'ascend' | 'descend' | null = null;
	$effect(() => {
		const leg = ranger.transit;
		if (leg === flownFor) return;
		flownFor = leg;
		if (!leg || reduced) return;
		startFlight(leg);
	});

	// Hidden scenery doesn't get a frame budget. The ranger going planetside parks
	// the whole loop: the drift task stops (its callback runs on the main stage every
	// rAF regardless of render mode, so stopping it is what actually saves the work)
	// AND the renderer drops to 'manual' so not a single frame is drawn. The canvas
	// keeps its last presented frame, warming the seat behind the 700ms fade — at
	// 0.02 rad/s the freeze is imperceptible. The prop flips a tick before the
	// fade-in, so resuming render mode and the task on the same tick is plenty.
	$effect(() => {
		if (active) {
			renderMode.set('on-demand');
			spin?.start();
			invalidate();
		} else {
			spin?.stop();
			renderMode.set('manual');
			// Deactivated — always after a transit has fully cleared (active stays true through both
			// legs). Settle the rig back to REST so the next launch's CLOSE hold and the plain
			// resting view both start from a clean camera; abandon any stray flight.
			flight = null;
			if (camera) {
				camera.position.copy(REST);
				camera.lookAt(ORIGIN);
				invalidate();
			}
		}
	});
</script>

<!-- A long lens, not a wide one: wide angles stretch a sphere parked off-axis into an
     egg, so at 30° the planet stays a planet wherever it sits in frame. The camera is
     pulled back to z≈12.2 (7 × tan25°/tan15°) so the frame at the z=0 plane — where the
     planet sits — keeps the size and placement it had at fov 50 / z 7.
     bind:ref hands the flight (above) the rig to fly. oncreate still seats it at REST looking at
     the origin, which is also the safe landing for the lazy-mount race: on the FIRST ascent this
     module may still be downloading three.js while the wipe plays. If it mounts after the transit
     has already cleared, the flight effect finds no leg and never runs — the rig simply rests here,
     at REST, rather than being stranded at CLOSE. If it mounts mid-'ascend', a (late but honest)
     CLOSE→REST flight still plays; a late first flight is fine, a camera stuck at the planet is not. -->
<T.PerspectiveCamera
	bind:ref={camera}
	makeDefault
	position={[0, 0, 12.2]}
	fov={30}
	oncreate={(ref) => ref.lookAt(0, 0, 0)}
/>

<T.DirectionalLight position={[4, 3, 5]} intensity={2.2} color="#fff4e6" />
<T.AmbientLight intensity={0.3} />

<!-- The forest planet, low-left of frame: a lit crescent and a slow slide into shade. -->
<T.Group bind:ref={planet} position={[-2.6, -1.9, 0]}>
	<T.Mesh>
		<T.SphereGeometry args={[1.8, 48, 48]} />
		<T.MeshStandardMaterial color="#2f6b57" roughness={0.9} />
	</T.Mesh>
	<!-- A cheap atmosphere: a paler back-faced shell catching light only at the rim. -->
	<T.Mesh>
		<T.SphereGeometry args={[1.854, 48, 48]} />
		<T.MeshBasicMaterial
			color="#8fd6c0"
			transparent
			opacity={0.12}
			side={BackSide}
			depthWrite={false}
		/>
	</T.Mesh>
</T.Group>

<T.Points bind:ref={stars}>
	<T is={starGeometry} />
	<T.PointsMaterial size={0.035} sizeAttenuation vertexColors transparent depthWrite={false} />
</T.Points>
