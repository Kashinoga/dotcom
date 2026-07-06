<script lang="ts">
	import { onMount, untrack } from 'svelte';

	// Split-flap / Solari departures-board text. Each letter cell shuffles through
	// same-type glyphs and settles left-to-right. Flat-forward: the "flap" is a 2D
	// tick (translateY + opacity), no 3D rotate. Each cell is sized by an invisible
	// copy of its FINAL letter, with the shuffling glyph centred on top, so the
	// wordmark never reflows or jitters while it spins.
	let {
		text,
		delay = 150,
		tick = 50,
		stagger = 75,
		base = 280,
		start = 0
	}: {
		text: string;
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
	// Each cell settles at `start` (the caller's cascade offset) + its own ramp. The
	// scramble itself begins at mount — never after `start` — so a delayed cell shows
	// motion, not its finished value, until it settles (no static pre-flash / pop-in).
	const settleAt = chars.map((_, i) => start + delay + base + i * stagger);

	const reduce =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
		if (reduce) return;
		// Scramble from the first frame regardless of `start` — the caller's cascade
		// offset is baked into settleAt, so the cell keeps flapping (never shows its
		// final value) until its scheduled settle. `elapsed` is measured from mount.
		spinning = pools.map((p) => p !== null);
		glyphs = chars.map((c, i) => (pools[i] ? rand(pools[i]!) : c));
		let elapsed = 0;
		const intervalId = setInterval(() => {
			elapsed += tick;
			const g = [...glyphs];
			const sp = [...spinning];
			let any = false;
			for (let i = 0; i < chars.length; i++) {
				if (!sp[i]) continue;
				if (elapsed >= settleAt[i]) {
					g[i] = chars[i];
					sp[i] = false;
				} else {
					g[i] = rand(pools[i]!);
					any = true;
				}
			}
			glyphs = g;
			spinning = sp;
			if (!any) clearInterval(intervalId);
		}, tick);
		return () => clearInterval(intervalId);
	});
</script>

<span class="flap" aria-label={text}>
	{#each groups as grp}
		{#if 'space' in grp}<span class="sp">&nbsp;</span>{:else}
			<span class="word">
				{#each grp.idx as i}
					<span class="cell" style:min-width={spinning[i] ? '0.4em' : undefined}>
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
		/* Sized to the FINAL letter so total width never changes and the settled
		 * wordmark keeps its exact spacing (the spin-time min-width floor for narrow
		 * cells like "i" is applied inline, only while spinning). clip-path clips
		 * wider shuffle glyphs HORIZONTALLY to the cell (no overlap) while leaving
		 * top/bottom free — so descenders/ascenders like "g" aren't cut off. */
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
