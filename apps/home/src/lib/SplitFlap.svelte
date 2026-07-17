<script module lang="ts">
	// Reduced-motion is a device-level setting, identical for every cell — evaluate it
	// once at module load rather than in each of the (up to ~180) SplitFlap instances a
	// full board spins up. Client-only (matchMedia is undefined during SSR → false, which
	// is fine: the scramble is driven from onMount, so it never runs on the server).
	const reduceMotion =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	// One shared requestAnimationFrame loop drives EVERY animating cell, instead of each
	// SplitFlap owning a setInterval — a full board fill spins up ~180 cells at once, so
	// that's ~180 timers collapsed into a single rAF. Each subscriber receives the real
	// ms elapsed since the last frame and returns false when its flap has settled, at
	// which point it's dropped; the loop stops once the last cell finishes. rAF also
	// parks the whole animation while the tab is hidden, for free.
	type FlapTick = (dtMs: number) => boolean; // return false when this cell is done
	const flapSubs = new Set<FlapTick>();
	let flapRaf = 0;
	let flapPrev = 0;

	function flapFrame(now: number) {
		const dt = now - flapPrev;
		flapPrev = now;
		for (const sub of flapSubs) {
			if (!sub(dt)) flapSubs.delete(sub);
		}
		flapRaf = flapSubs.size ? requestAnimationFrame(flapFrame) : 0;
	}
	// Register a per-frame handler; returns an unsubscribe for the instance's cleanup.
	function flapSubscribe(sub: FlapTick): () => void {
		flapSubs.add(sub);
		if (!flapRaf) {
			flapPrev = performance.now();
			flapRaf = requestAnimationFrame(flapFrame);
		}
		return () => flapSubs.delete(sub);
	}
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';

	// Split-flap / Solari departures-board text. Each letter cell shuffles through
	// same-type glyphs and settles left-to-right. Flat-forward: the "flap" is a 2D
	// tick (translateY + opacity), no 3D rotate. Each cell is sized by an invisible
	// copy of its FINAL letter, with the shuffling glyph centred on top, so the
	// wordmark never reflows or jitters while it spins.
	let {
		text,
		label,
		from,
		delay = 150,
		tick = 50,
		stagger = 75,
		base = 280,
		start = 0
	}: {
		text: string;
		/** Accessible name, when `text` is a visually truncated form of a longer string
		 *  (the Operator column). Defaults to `text`, so the flaps read as they render. */
		label?: string;
		/** The PREVIOUS text this flap is replacing. When given and the same length, cells
		 *  whose character is unchanged from `from` show at once and never spin — only the
		 *  positions that actually differ flap. A live counter passes its last value here so
		 *  only the digits that turned over move (a real Solari board); omit it for a fresh
		 *  arrival, where every cell should scramble. */
		from?: string;
		delay?: number;
		tick?: number;
		stagger?: number;
		base?: number;
		start?: number;
	} = $props();

	const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	const LO = 'abcdefghijklmnopqrstuvwxyz';
	const NUM = '0123456789';
	// The board label is set once per instance; snapshot it without reactivity.
	const chars = untrack(() => [...text]);
	const pools = chars.map((c) =>
		/[a-z]/.test(c) ? LO : /[A-Z]/.test(c) ? UP : /[0-9]/.test(c) ? NUM : null
	);
	// Which cells carry over unchanged from the previous value — same length, same char at
	// the same slot. Those don't flap; only the rest do. Length change (a comma appears, a
	// digit is added) means the columns shifted, so nothing is "held" and it all flaps.
	const held = untrack(() => {
		const prev = from === undefined ? null : [...from];
		if (!prev || prev.length !== chars.length) return chars.map(() => false);
		return chars.map((c, i) => prev[i] === c);
	});
	// Per-cell settle time, measured from the moment this instance's flap BEGINS (which
	// itself is deferred by `start`, the caller's cascade offset). So a board flaps row
	// by row: each row's cells hold blank until their turn, then flap and settle.
	const settleAt = chars.map((_, i) => delay + base + i * stagger);

	// Group into words so per-char cells never wrap mid-word.
	type Group = { space: true } | { idx: number[] };
	const groups: Group[] = [];
	{
		let cur: number[] | null = null;
		chars.forEach((c, i) => {
			if (c === ' ') {
				if (cur) {
					groups.push({ idx: cur });
					cur = null;
				}
				groups.push({ space: true });
			} else {
				(cur ??= []).push(i);
			}
		});
		if (cur) groups.push({ idx: cur });
	}

	// Start on the final text (deterministic → SSR-safe), then scramble on mount.
	let glyphs = $state([...chars]);
	let spinning = $state(chars.map(() => false));

	const rand = (s: string) => s[Math.floor(Math.random() * s.length)];

	onMount(() => {
		if (reduceMotion) return;
		let unsubscribe = () => {};
		// Run the scramble → settle. `elapsed` is measured from here (the flap start),
		// so settleAt needn't include `start`. The shared clock ticks every frame; a cell
		// only re-picks a glyph once its own `tick` interval has passed (keeping the flip
		// speed), but settles precisely on time regardless of frame cadence.
		const begin = () => {
			spinning = pools.map((p, i) => p !== null && !held[i]);
			glyphs = chars.map((c, i) => (pools[i] && !held[i] ? rand(pools[i]!) : c));
			let elapsed = 0;
			let sinceShuffle = 0;
			unsubscribe = flapSubscribe((dt) => {
				elapsed += dt;
				sinceShuffle += dt;
				const shuffle = sinceShuffle >= tick;
				if (shuffle) sinceShuffle = 0;
				const g = [...glyphs];
				const sp = [...spinning];
				let any = false;
				let changed = false;
				for (let i = 0; i < chars.length; i++) {
					if (!sp[i]) continue;
					if (elapsed >= settleAt[i]) {
						g[i] = chars[i];
						sp[i] = false;
						changed = true;
					} else if (shuffle) {
						g[i] = rand(pools[i]!);
						any = true;
						changed = true;
					} else {
						any = true; // still spinning, just not re-picked this frame
					}
				}
				if (changed) {
					glyphs = g;
					spinning = sp;
				}
				return any; // keep this cell subscribed while any glyph is still spinning
			});
		};
		// With a cascade offset, hold the cells BLANK until this instance's turn, then
		// flap — so a staggered board fills row by row and no cell shows its finished
		// value before it flaps (blank during the wait, not the answer). start === 0
		// (e.g. the header wordmark) flaps immediately.
		if (start > 0) {
			glyphs = chars.map(() => '');
			const timeoutId = setTimeout(begin, start);
			return () => {
				clearTimeout(timeoutId);
				unsubscribe();
			};
		}
		begin();
		return () => unsubscribe();
	});
</script>

<span class="flap" aria-label={label ?? text}>
	{#each groups as grp}
		{#if 'space' in grp}<span class="sp">&nbsp;</span>{:else}
			<span class="word">
				{#each grp.idx as i}
					<span class="cell">
						<span class="sizer" aria-hidden="true">{chars[i]}</span>
						<span class="glyph" class:spin={spinning[i]} aria-hidden="true">{glyphs[i]}</span>
					</span>
				{/each}
			</span>
		{/if}
	{/each}
</span>

<style>
	.flap {
		display: inline;
	}
	.word {
		display: inline-block;
		white-space: nowrap;
	}
	.sp {
		white-space: pre;
	}
	.cell {
		position: relative;
		display: inline-block;
		/* Sized to the FINAL letter, at every moment of the flap — the whole point of the
		 * hidden .sizer. Nothing may widen a cell while it spins: the flap is laid out in
		 * normal flow, so a cell that grows pushes the rest of the wordmark, and the wordmark
		 * pushes whatever sits beside it. That is not theoretical. Narrow cells used to floor
		 * to a 0.4em min-width while spinning, which grew "Air Traffic" by 10px and slid the
		 * ATFC super bar's Field/Range/Refresh controls left, one step per letter, as they
		 * settled.
		 *
		 * The floor bought little anyway: a shuffle glyph wider than its cell is clipped to
		 * the cell regardless, so an "m" in an "i" slot went from 33% visible to 51% — a slab
		 * either way. And the clip cannot simply be relaxed to let it show: cells settle
		 * left-to-right, so a glyph allowed past its own box would paint over the finished
		 * letter next to it.
		 *
		 * So: clip wider shuffle glyphs HORIZONTALLY to the cell, leaving top/bottom free so
		 * descenders and ascenders like "g" aren't cut off. Narrow cells flicker as clipped
		 * slabs mid-flip, which is what a real split-flap does, and the settled wordmark keeps
		 * its exact spacing because the box never moved. */
		clip-path: inset(-100% 0 -100% 0);
		text-align: center;
	}
	.sizer {
		visibility: hidden;
	}
	.glyph {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transform-origin: center;
	}
	/* Vertical squash (not a slide) so the mechanical tick stays inside the clipped
	 * cell. */
	.glyph.spin {
		animation: flap 0.1s ease-in-out infinite;
	}
	@keyframes flap {
		0% {
			transform: scaleY(0.55);
			opacity: 0.5;
		}
		55% {
			opacity: 1;
		}
		100% {
			transform: scaleY(1);
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.glyph {
			animation: none;
		}
	}
</style>
