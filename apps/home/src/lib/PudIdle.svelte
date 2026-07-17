<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import SplitFlap from '$lib/SplitFlap.svelte';
	import { GEM_SVG } from '$lib/icons';

	// Intergalactic Park Ranger — the Pocket Universe Division's clicker (you're the
	// ranger; PUD is the park service), revived from the standalone pud-idle repo
	// (~/Downloads/Git/pud-idle). The original grew a whole colony — woodcutting,
	// starships, an email client — but its heart was always the loop this panel keeps:
	// EXTRACT Data Shards by hand, buy rigs that extract while you sleep, and overclock
	// the works when you're impatient. The fiction rides along (the foundries, the
	// sacred groves, LPU-1031); the sprawl stays in the museum.
	//
	// Progress persists per browser (localStorage), and the rigs keep working while
	// you're away — credited on return, capped so a year off doesn't mint a fortune.

	const SAVE_KEY = 'ksh-pud';
	const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000; // rigs run 8h unattended, then wait for you
	const BOOST_MS = 30_000; // overclock burns for 30s…
	const BOOST_COOLDOWN_MS = 150_000; // …and the works need 2m to cool after

	type Rig = { id: string; name: string; blurb: string; cps: number; base: number };
	// Costs walk the idle classic ×1.15 per owned; each tier ~an order of magnitude up.
	const RIGS: Rig[] = [
		{
			id: 'probe',
			name: 'Field Probe',
			blurb: 'A handheld probe, sweeping the LPU-1031 shallows.',
			cps: 0.1,
			base: 15
		},
		{
			id: 'relay',
			name: 'Relay Mast',
			blurb: 'Shards drift in on the division band, day and night.',
			cps: 1,
			base: 100
		},
		{
			id: 'foundry',
			name: 'Shard Foundry',
			blurb: 'The pocket-universe foundries, retooled for extraction.',
			cps: 8,
			base: 1100
		},
		{
			id: 'grove',
			name: 'Grove Server',
			blurb: 'Racked deep in the sacred groves, where premium data grows.',
			cps: 47,
			base: 12_000
		},
		{
			id: 'array',
			name: 'Starship Array',
			blurb: 'The old starship’s dish farm, turned inward at last.',
			cps: 260,
			base: 130_000
		}
	];

	let shards = $state(0);
	let lifetime = $state(0); // every shard ever held — the save's bragging number
	let clickLevel = $state(0);
	let owned = $state<Record<string, number>>(Object.fromEntries(RIGS.map((r) => [r.id, 0])));
	let boostUntil = $state(0);
	let boostReadyAt = $state(0);
	let paused = $state(false); // the rigs down tools; the hand extractor still works
	let rigPaused = $state<Record<string, boolean>>({}); // …and any ONE rig can down its own
	let nowMs = $state(0); // ticked by the loop; drives the countdowns
	let awayNote = $state('');
	let lastEvent = $state('');
	let armReset = $state(false); // the two-step abandon

	const perClick = $derived(1 + clickLevel);
	const rigRunning = (id: string) => (owned[id] ?? 0) > 0 && !rigPaused[id];
	const baseCps = $derived(
		RIGS.reduce((s, r) => s + (rigPaused[r.id] ? 0 : r.cps * (owned[r.id] ?? 0)), 0)
	);
	const boosted = $derived(nowMs > 0 && nowMs < boostUntil);
	const cps = $derived(paused ? 0 : baseCps * (boosted ? 2 : 1));
	const canBoost = $derived(nowMs >= boostReadyAt && baseCps > 0 && !paused);

	const rigCost = (r: Rig) => Math.round(r.base * Math.pow(1.15, owned[r.id] ?? 0));
	const clickCost = $derived(Math.round(25 * Math.pow(1.7, clickLevel)));

	// Short-scale formatting: whole numbers under a thousand (the count is a tally, not
	// a reading), one decimal once the units arrive.
	const fmt = (n: number): string => {
		if (n < 1000) return String(Math.floor(n));
		const units = ['k', 'm', 'b', 't', 'q'];
		let u = -1;
		while (n >= 1000 && u < units.length - 1) {
			n /= 1000;
			u++;
		}
		return `${n < 100 ? n.toFixed(1) : Math.floor(n)}${units[u]}`;
	};
	// Rates keep their decimal while they're small — the first probe's 0.1/s is the whole
	// point of the purchase, and the tally's floor read it as nothing at all.
	const fmtRate = (n: number): string => (n > 0 && n < 10 ? String(Math.round(n * 10) / 10) : fmt(n));
	// The HEADLINE tally, split for life: the whole part big, and — while the count is
	// small enough that the fraction still reads — two decimals trailing, dimmed and
	// smaller, so the number visibly climbs between whole shards instead of sitting
	// dead at the extraction rate. Past 1000 the abbreviation takes over (its own one
	// decimal carries the motion) and the trailing pair drops.
	// The headline shows FULL grouped digits as far as the panel can hold them — only past
	// a billion does the short-scale letter appear (b/t/q). Below that, thousands and
	// millions read out in full ("1,284", "45,000", "12,704,918"); the commas ride along
	// as static cells (not in any flap pool), so only the digits turn. The letter, when it
	// finally comes, is its OWN flap segment (see the markup) — so it turns over just on a
	// magnitude crossing, never scrambling alongside an ordinary count-up.
	const BIG = 1_000_000_000; // a billion: the digit count the panel starts to strain at
	function fmtParts(n: number): { num: string; unit: string } {
		if (n < BIG) return { num: Math.floor(n).toLocaleString('en-US'), unit: '' };
		const units = ['b', 't', 'q'];
		let u = 0;
		let v = n / BIG;
		while (v >= 1000 && u < units.length - 1) {
			v /= 1000;
			u++;
		}
		return { num: v < 100 ? v.toFixed(1) : String(Math.floor(v)), unit: units[u] };
	}
	// The board rides the site's Solari flaps, SAMPLED on a calm cadence: it turns over about
	// once a second, a departure sign updating, showing the count as of the last sample. That
	// lag is deliberate — a display chasing the true total five times a second is a jittery,
	// faintly motion-sick thing; a slower board that's a beat behind reads as steady. The unit
	// segment rarely moves, so it sits still between the rare magnitude crossings.
	const FLAP_MS = 900; // ~1.1 turnovers/s — unhurried; the flip below settles well inside it
	let flapNum = $state('0');
	let flapNumPrev = $state(''); // the value being replaced — SplitFlap's `from`, so only changed digits flap
	let flapUnit = $state('');
	let flapAt = 0;
	function syncFlap(now: number) {
		if (now - flapAt < FLAP_MS) return;
		const p = fmtParts(shards);
		if (p.num !== flapNum || p.unit !== flapUnit) {
			flapNumPrev = flapNum;
			flapNum = p.num;
			flapUnit = p.unit;
			flapAt = now;
		}
	}
	const secsLeft = (until: number) => Math.max(0, Math.ceil((until - nowMs) / 1000));

	function extract() {
		shards += perClick;
		lifetime += perClick;
		syncFlap(Date.now()); // a pull that lands in an open window flaps at once
	}
	function buyRig(r: Rig) {
		const cost = rigCost(r);
		if (shards < cost) return;
		shards -= cost;
		owned[r.id] = (owned[r.id] ?? 0) + 1;
		lastEvent = `${r.name} №${owned[r.id]} comes online — +${fmtRate(r.cps)}/s.`;
		syncFlap(Date.now()); // a spend drops the count sharply — flap it if the window's open
		save();
	}
	function buyClick() {
		if (shards < clickCost) return;
		shards -= clickCost;
		clickLevel += 1;
		lastEvent = `Extractor sharpened — ${perClick} shards a pull.`;
		syncFlap(Date.now());
		save();
	}
	function overclock() {
		if (!canBoost) return;
		const now = Date.now();
		boostUntil = now + BOOST_MS;
		boostReadyAt = now + BOOST_COOLDOWN_MS;
		lastEvent = 'Overclock engaged — the whole division hums at ×2.';
		save();
	}
	function togglePause() {
		paused = !paused;
		lastEvent = paused
			? 'All rigs down tools. The division rests; your hands don’t have to.'
			: 'The rigs spin back up — extraction resumes.';
		save();
	}
	function toggleRig(r: Rig) {
		rigPaused[r.id] = !rigPaused[r.id];
		lastEvent = rigPaused[r.id]
			? `The ${r.name.toLowerCase()}s stand down.`
			: `The ${r.name.toLowerCase()}s spin back up.`;
		save();
	}
	function reset() {
		if (!armReset) {
			armReset = true;
			return;
		}
		shards = 0;
		lifetime = 0;
		clickLevel = 0;
		owned = Object.fromEntries(RIGS.map((r) => [r.id, 0]));
		boostUntil = 0;
		boostReadyAt = 0;
		awayNote = '';
		lastEvent = 'The universe is bare again. The probe is in your hand.';
		armReset = false;
		save();
	}

	// ── The loop, and the save ──────────────────────────────────────────────────
	type Save = {
		v: 1;
		shards: number;
		lifetime: number;
		clickLevel: number;
		owned: Record<string, number>;
		boostUntil: number;
		boostReadyAt: number;
		paused?: boolean;
		rigPaused?: Record<string, boolean>;
		savedAt: number;
	};
	function save() {
		try {
			const body: Save = {
				v: 1,
				shards,
				lifetime,
				clickLevel,
				owned: { ...owned },
				boostUntil,
				boostReadyAt,
				paused,
				rigPaused: { ...rigPaused },
				savedAt: Date.now()
			};
			localStorage.setItem(SAVE_KEY, JSON.stringify(body));
		} catch {
			/* storage unavailable — this visit still plays */
		}
	}

	let tickTimer = 0;
	let saveTimer = 0;
	let lastTick = 0;
	onMount(() => {
		try {
			const raw = localStorage.getItem(SAVE_KEY);
			if (raw) {
				const s = JSON.parse(raw) as Save;
				shards = s.shards ?? 0;
				lifetime = s.lifetime ?? 0;
				clickLevel = s.clickLevel ?? 0;
				owned = { ...owned, ...(s.owned ?? {}) };
				boostUntil = s.boostUntil ?? 0;
				boostReadyAt = s.boostReadyAt ?? 0;
				paused = s.paused ?? false;
				rigPaused = { ...(s.rigPaused ?? {}) };
				// The rigs kept working: credit the time away, unboosted, capped — unless
				// they were left DOWN (wholesale or one by one), in which case down they stayed.
				if (!paused) {
					const away = Math.min(Math.max(Date.now() - (s.savedAt ?? Date.now()), 0), OFFLINE_CAP_MS);
					const gain =
						(RIGS.reduce(
							(sum, r) => sum + (rigPaused[r.id] ? 0 : r.cps * (owned[r.id] ?? 0)),
							0
						) *
							away) /
						1000;
					if (gain >= 1) {
						shards += gain;
						lifetime += gain;
						awayNote = `While you were away, the rigs pulled ${fmt(gain)} shards.`;
					}
				}
			}
		} catch {
			/* malformed save — start the universe over */
		}
		nowMs = Date.now();
		lastTick = nowMs;
		// Seed the board on the loaded count (no opening flap-from-zero).
		const seed = fmtParts(shards);
		flapNum = seed.num;
		flapUnit = seed.unit;
		flapAt = nowMs;
		// 200ms is idle-smooth without being a busy loop; dt from the clock, so a
		// throttled background tab catches up honestly on its next tick.
		tickTimer = window.setInterval(() => {
			const now = Date.now();
			const dt = (now - lastTick) / 1000;
			lastTick = now;
			nowMs = now;
			if (baseCps > 0 && !paused) {
				const gain = baseCps * (now < boostUntil ? 2 : 1) * dt;
				shards += gain;
				lifetime += gain;
			}
			syncFlap(now); // turn the board over when its window opens
		}, 200);
		saveTimer = window.setInterval(save, 5000);
		// The interval plus onDestroy misses one exit: a hard reload/close, where no
		// teardown runs. pagehide is the door that always swings on the way out.
		window.addEventListener('pagehide', save);
	});
	onDestroy(() => {
		clearInterval(tickTimer);
		clearInterval(saveTimer);
		if (typeof window !== 'undefined') window.removeEventListener('pagehide', save);
		save();
	});
</script>

<div class="pud">
	{#if awayNote}
		<p class="pud-away">{awayNote}</p>
	{/if}

	<!-- The tally: the shard mark, the count, and what's flowing in. -->
	<div class="pud-count">
		<span class="pud-gem" class:boosted aria-hidden="true">{@html GEM_SVG}</span>
		<div>
			<div class="pud-num">
				<!-- Two flap segments, keyed apart: the DIGITS re-flap on the throttled
				     turnover, but `from` holds the cells that didn't change so only the digits
				     that actually turned over move. delay 0 / stagger 0: the changed digits
				     flip TOGETHER and settle fast (base 130 + a few tick shuffles), so a flip
				     never overruns the next turnover. The UNIT letter is its own key — it
				     flaps in only when the magnitude crosses, and sits still otherwise. -->
				{#key flapNum}<SplitFlap text={flapNum} from={flapNumPrev} delay={0} base={130} stagger={0} tick={35} />{/key}{#if flapUnit}{#key flapUnit}<SplitFlap text={flapUnit} delay={0} base={130} tick={35} />{/key}{/if}
			</div>
			<div class="pud-sub">
				Data Shards · {paused ? 'paused' : `${fmtRate(cps)}/s${boosted ? ' · overclocked ×2' : ''}`}
			</div>
		</div>
	</div>

	<!-- The works, visibly working: while any rig runs, a sweep crosses the band — the
	     division mining whether or not you're pulling. It runs hot with the overclock,
	     and stands STILL (dimmed, not gone) while the rigs are paused. -->
	{#if baseCps > 0}
		<div class="pud-mining" class:boosted class:paused aria-hidden="true">
			<span class="pud-mining-sweep"></span>
		</div>
	{/if}

	<!-- The hands-on half: the pull, and the overclock beside it. -->
	<div class="pud-actions">
		<button type="button" class="pud-extract" onclick={extract}>
			Extract <span class="pud-per">+{perClick}</span>
		</button>
		<button type="button" class="pud-boost" class:on={boosted} disabled={!canBoost && !boosted} onclick={overclock}>
			{#if boosted}×2 · {secsLeft(boostUntil)}s
			{:else if canBoost}Overclock
			{:else if baseCps === 0 || paused}Overclock
			{:else}Recharging · {secsLeft(boostReadyAt)}s{/if}
		</button>
		<!-- ONE button, two words: it pauses every rig and, paused, offers the way back.
		     Only meaningful once something can run, so it waits for the first rig. -->
		{#if baseCps > 0}
			<button type="button" class="pud-boost" onclick={togglePause}>
				{paused ? 'Resume' : 'Pause'}
			</button>
		{/if}
	</div>

	<!-- The requisition sheet: the click upgrade first (it's the one you feel), then the
	     rigs by price. Each row splits its jobs: the CARD BODY is that rig's own switch
	     (its ring spins while it works; a click stands it down or spins it up), and the
	     COST CHIP at the right is the buy. Unowned rigs have nothing to switch, so their
	     body waits inert until the first unit comes online. -->
	<div class="pud-shop">
		<p class="pud-lead">Division requisitions</p>
		<div class="pud-item">
			<span class="pud-item-main">
				<span class="pud-item-copy">
					<span class="pud-item-name">Sharpen the Extractor<span class="pud-owned">lv {clickLevel + 1}</span></span>
					<span class="pud-item-blurb">One more shard with every pull.</span>
				</span>
			</span>
			<button type="button" class="pud-buy" disabled={shards < clickCost} onclick={buyClick}>
				{fmt(clickCost)}
			</button>
		</div>
		{#each RIGS as r (r.id)}
			<div class="pud-item">
				{#if owned[r.id]}
					<button
						type="button"
						class="pud-item-main pud-item-switch"
						aria-pressed={!rigPaused[r.id]}
						title={rigPaused[r.id] ? `Resume the ${r.name.toLowerCase()}s` : `Pause the ${r.name.toLowerCase()}s`}
						onclick={() => toggleRig(r)}
					>
						<span
							class="pud-ring"
							class:off={rigPaused[r.id] || paused}
							class:boosted={boosted && !rigPaused[r.id] && !paused}
							aria-hidden="true"
						>
							<svg viewBox="0 0 20 20">
								<circle class="pud-ring-track" cx="10" cy="10" r="7.5" />
								<circle class="pud-ring-arc" cx="10" cy="10" r="7.5" />
							</svg>
						</span>
						<span class="pud-item-copy">
							<span class="pud-item-name">{r.name}<span class="pud-owned">×{owned[r.id]}</span></span>
							<span class="pud-item-blurb">{r.blurb} +{fmtRate(r.cps)}/s.</span>
						</span>
					</button>
				{:else}
					<span class="pud-item-main">
						<span class="pud-item-copy">
							<span class="pud-item-name">{r.name}</span>
							<span class="pud-item-blurb">{r.blurb} +{fmtRate(r.cps)}/s.</span>
						</span>
					</span>
				{/if}
				<button type="button" class="pud-buy" disabled={shards < rigCost(r)} onclick={() => buyRig(r)}>
					{fmt(rigCost(r))}
				</button>
			</div>
		{/each}
	</div>

	{#if lastEvent}
		<p class="pud-note" role="status">{lastEvent}</p>
	{/if}

	<!-- The ledger's small print: the lifetime tally, and the way out. Abandon asks
	     twice — the second press is the real one, and clicking anything else disarms. -->
	<div class="pud-foot">
		<span class="pud-lifetime">{fmt(lifetime)} extracted all-time</span>
		<button type="button" class="pud-reset" class:armed={armReset} onclick={reset} onblur={() => (armReset = false)}>
			{armReset ? 'Sure? Every shard.' : 'Abandon universe'}
		</button>
	</div>
</div>

<style>
	.pud {
		display: flex;
		flex-direction: column;
		gap: 1.05rem;
	}
	/* Entrance — the panel's pieces settle top-to-bottom, the Weather/Court cadence. */
	@media (prefers-reduced-motion: no-preference) {
		.pud > * {
			animation: pud-settle 0.45s ease backwards;
		}
		.pud > :nth-child(2) {
			animation-delay: 0.06s;
		}
		.pud > :nth-child(3) {
			animation-delay: 0.12s;
		}
		.pud > :nth-child(4) {
			animation-delay: 0.18s;
		}
		.pud > :nth-child(5) {
			animation-delay: 0.24s;
		}
		.pud > :nth-child(6) {
			animation-delay: 0.3s;
		}
	}
	@keyframes pud-settle {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.pud-away {
		margin: 0;
		font-size: 0.85rem;
		font-style: italic;
		color: var(--sub);
	}

	.pud-count {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}
	.pud-gem :global(svg) {
		width: 44px;
		height: 44px;
		display: block;
		color: var(--accent, #f06030);
	}
	/* Overclocked, the shard itself runs hot — a pulse, not a spin: it's a gem, not a fan. */
	@media (prefers-reduced-motion: no-preference) {
		.pud-gem.boosted :global(svg) {
			animation: pud-hot 0.8s ease-in-out infinite alternate;
		}
	}
	@keyframes pud-hot {
		from {
			transform: scale(1);
		}
		to {
			transform: scale(1.12);
		}
	}
	.pud-num {
		font-size: clamp(2.2rem, 6vw, 3rem);
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		font-family: var(--font-mono);
	}
	.pud-sub {
		margin-top: 0.25rem;
		font-size: 0.85rem;
		color: var(--sub);
		font-variant-numeric: tabular-nums;
	}

	/* The works' heartbeat: a soft accent band with a sweep crossing it while the rigs
	   run — indeterminate on purpose (extraction has no end to progress toward). Twice
	   the pace under overclock. Reduced motion keeps the band, stills the sweep. */
	.pud-mining {
		position: relative;
		height: 6px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent, #f06030) 14%, transparent);
		overflow: hidden;
	}
	.pud-mining-sweep {
		position: absolute;
		inset: 0;
		width: 40%;
		border-radius: 999px;
		background: linear-gradient(90deg, transparent, var(--accent, #f06030), transparent);
	}
	@media (prefers-reduced-motion: no-preference) {
		.pud-mining-sweep {
			animation: pud-sweep 1.9s linear infinite;
		}
		.pud-mining.boosted .pud-mining-sweep {
			animation-duration: 0.85s;
		}
	}
	/* Paused, the band stays but the sweep stands where it stopped, dimmed — downtime
	   should look like held breath, not absence. */
	.pud-mining.paused .pud-mining-sweep {
		animation-play-state: paused;
		opacity: 0.35;
	}
	/* Percentages are of the sweep's OWN width (40% of the track): -100% hides it off the
	   left edge, +250% walks its leading edge clear past the right. */
	@keyframes pud-sweep {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(250%);
		}
	}

	.pud-actions {
		display: flex;
		align-items: stretch;
		gap: 0.6rem;
	}
	/* The pull: the family's chip clothes at working size — this is the button the whole
	   app is about, so it takes the accent when pressed-worthy attention isn't needed
	   elsewhere. The universal spring gives the tap its thock. Overclock wears the SAME
	   cut (padding, size, stretch) so the pair reads as one control rank — only the
	   colour says which is the star. */
	.pud-extract,
	.pud-boost {
		/* The 42px control family (icon-btn, chips, field-select) — a fixed height, not
		   padding-derived, so the three sit in one even row and match every other control
		   the app draws. Width stays the label's own. */
		display: inline-flex;
		align-items: center;
		box-sizing: border-box;
		height: 42px;
		padding: 0 1.4rem;
		font: inherit;
		font-size: 0.95rem;
		border-radius: 999px;
		cursor: pointer;
	}
	.pud-extract {
		flex: none;
		gap: 0.5rem;
		font-weight: 700;
		color: var(--paper);
		background: var(--accent, #f06030);
		border: 1.5px solid var(--accent, #f06030);
	}
	.pud-per {
		font-size: 0.8rem;
		font-weight: 600;
		opacity: 0.85;
		font-variant-numeric: tabular-nums;
	}
	.pud-boost {
		font-weight: 600;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1.5px solid var(--line-edge);
		font-variant-numeric: tabular-nums;
		transition: border-color 0.15s ease, background 0.15s ease;
	}
	.pud-boost:hover:not(:disabled) {
		border-color: var(--line-strong);
	}
	.pud-boost:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.pud-boost.on {
		color: var(--paper);
		background: var(--ink);
		border-color: var(--ink);
	}

	.pud-shop {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding-top: 1.1rem;
		border-top: 1px solid transparent;
		border-image: var(--rule-fade) 1;
	}
	.pud-lead {
		margin: 0 0 0.2rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--sub);
	}
	/* A requisition row: the app cards' shape, holding two jobs — the switch (left, the
	   whole body) and the buy (right, the cost chip). The frame is the row's; each half
	   lights on its own hover. */
	.pud-item {
		display: flex;
		align-items: stretch;
		gap: 0.6rem;
		padding: 0.55rem 0.6rem 0.55rem 0.9rem;
		color: var(--ink);
		background: var(--aero-face);
		border: 1px solid var(--line-edge);
		border-radius: 12px;
	}
	/* The switch half — a rig's own on/off, its ring saying which. As a plain span (the
	   click upgrade, or an unowned rig) it's inert: no ring, no pointer. */
	.pud-item-main {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		font: inherit;
		text-align: left;
		color: inherit;
		background: none;
		border: 0;
		padding: 0;
	}
	.pud-item-switch {
		cursor: pointer;
		border-radius: 8px;
		transition: opacity 0.15s ease;
	}
	.pud-item-switch:hover {
		opacity: 0.8;
	}
	/* The working ring — the mining bar's per-rig echo: an arc chasing round the track
	   while the rig runs, spun twice as fast under overclock, and STOPPED (arc dimmed to
	   a still tick) when the rig is down. */
	.pud-ring {
		flex: none;
		width: 22px;
		height: 22px;
		color: var(--accent, #f06030);
	}
	.pud-ring svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.pud-ring-track {
		fill: none;
		stroke: color-mix(in srgb, var(--ink) 12%, transparent);
		stroke-width: 2.5;
	}
	.pud-ring-arc {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
		/* r=7.5 → circumference ≈ 47.1; show a quarter, chase it round. */
		stroke-dasharray: 12 36;
		transform-origin: center;
	}
	@media (prefers-reduced-motion: no-preference) {
		.pud-ring-arc {
			animation: pud-spin 1.4s linear infinite;
		}
		.pud-ring.boosted .pud-ring-arc {
			animation-duration: 0.6s;
		}
	}
	@keyframes pud-spin {
		to {
			transform: rotate(360deg);
		}
	}
	/* Down tools: the arc stops where it stands, dimmed — the same held-breath the main
	   band wears when paused. */
	.pud-ring.off .pud-ring-arc {
		animation-play-state: paused;
		opacity: 0.3;
	}
	.pud-item-copy {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.pud-item-name {
		font-weight: 700;
		font-size: 0.95rem;
	}
	.pud-owned {
		margin-left: 0.35rem;
		font-weight: 600;
		font-size: 0.78rem;
		color: var(--sub);
		font-variant-numeric: tabular-nums;
	}
	.pud-item-blurb {
		font-size: 0.8rem;
		color: var(--sub);
	}
	/* The buy: the cost as its own chip, dimmed out of reach (not hidden — the price is
	   the goal). */
	.pud-buy {
		flex: none;
		align-self: center;
		padding: 0.5rem 0.85rem;
		font: inherit;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		font-family: var(--font-mono);
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border: 1px solid var(--line-edge);
		border-radius: 8px;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
	}
	.pud-buy:hover:not(:disabled) {
		border-color: var(--line-strong);
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	.pud-buy:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.pud-note {
		margin: 0;
		font-size: 0.85rem;
		color: var(--sub);
	}

	.pud-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.9rem;
		padding-top: 0.9rem;
		border-top: 1px solid transparent;
		border-image: var(--rule-fade) 1;
		font-size: 0.78rem;
		color: var(--sub);
	}
	.pud-lifetime {
		font-variant-numeric: tabular-nums;
	}
	.pud-reset {
		padding: 0;
		font: inherit;
		font-size: 0.78rem;
		color: var(--sub);
		background: none;
		border: 0;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.pud-reset.armed {
		color: var(--orange, #f06030);
		font-weight: 700;
	}

	/* Bubble: the rows, the buy chips, and the boost join the aero family — frost, rim
	   light, drop. */
	:global(html[data-ui='bubble']) .pud-item,
	:global(html[data-ui='bubble']) .pud-buy,
	:global(html[data-ui='bubble']) .pud-boost {
		-webkit-backdrop-filter: blur(6px) saturate(1.3);
		backdrop-filter: blur(6px) saturate(1.3);
		box-shadow: var(--aero-gloss), var(--aero-drop);
	}
	:global(html[data-ui='bubble']) .pud-extract {
		box-shadow: var(--aero-gloss), var(--aero-drop);
	}
</style>
