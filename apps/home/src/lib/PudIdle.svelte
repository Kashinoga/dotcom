<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { flip } from 'svelte/animate';
	import { backOut } from 'svelte/easing';
	import { popSpring } from '$lib/pop-spring';
	import SplitFlap from '$lib/SplitFlap.svelte';
	import { GEM_SVG, CLOSE_SVG } from '$lib/icons';

	// The settings popout is opened from the PANEL BAR, which belongs to the catch-all page —
	// so the page owns the open/closed flag and the button, and this component draws the card
	// and the numbers in it. Splitting it that way keeps the tally and the abandon button
	// beside the state they act on instead of passing both up.
	let { settingsOpen = false, onCloseSettings }: {
		settingsOpen?: boolean;
		onCloseSettings?: () => void;
	} = $props();

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
	// Costs walk the idle classic ×1.15 per owned; each tier ~an order of magnitude up. The
	// COSTS are Cookie Clicker's own opening ladder (15 / 100 / 1.1k / 12k / 130k), so the rates
	// are its ladder too — multiplied by ten, which buys the one thing this game needed that
	// Cookie Clicker didn't: EVERY rig earns at least a whole shard a second. At CC's literal
	// rates the first two paid 0.1/s and 1/s, and a tenth of a shard is invisible here — the
	// headline ticks in hundredths, so the first purchase, the one that has to land, felt like a
	// downgrade from clicking.
	//
	// Lifting only those two (1 and 4) fixed the floor and broke the ladder: it left the Field
	// Probe 33× more shard-efficient than the Starship Array, so every tier after the first was
	// a worse buy than the thing you already owned. Scaling the whole curve by the same ten
	// keeps CC's shape — the Relay is the early sweet spot, and efficiency eases off gently
	// after it — and brings the spread from 33× down to 5×.
	const RIGS: Rig[] = [
		{
			id: 'probe',
			name: 'Field Probe',
			blurb: 'A handheld probe, sweeping the LPU-1031 shallows.',
			cps: 1,
			base: 15
		},
		{
			id: 'relay',
			name: 'Relay Mast',
			blurb: 'Shards drift in on the division band, day and night.',
			cps: 10,
			base: 100
		},
		{
			id: 'foundry',
			name: 'Shard Foundry',
			blurb: 'The pocket-universe foundries, retooled for extraction.',
			cps: 80,
			base: 1100
		},
		{
			id: 'grove',
			name: 'Grove Server',
			blurb: 'Racked deep in the sacred groves, where premium data grows.',
			cps: 470,
			base: 12_000
		},
		{
			id: 'array',
			name: 'Starship Array',
			blurb: 'The old starship’s dish farm, turned inward at last.',
			cps: 2600,
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
	let armReset = $state(false); // the two-step abandon

	// ── The ledger ──────────────────────────────────────────────────────────────
	// A rolling log of what the division did, newest first — ported from the older build's
	// activity log (~/Downloads/Git/pud-idle, src/lib/stores/activityLog.ts). It replaces the
	// single line that used to live here, which only ever held the LAST thing that happened:
	// an idle game is a thing you look away from, and coming back to one sentence tells you
	// nothing about the five minutes you missed.
	//
	// Kept in the component rather than a store (the ancestor's shape) because nothing outside
	// this panel writes to it. The ancestor tagged each event with an EMOJI; here a kind maps to
	// a colour instead — dotcom draws its marks as SVG and sets its tone in type, so a row of
	// emoji would read as a foreign object. The colour does the same scanning work.
	type LogKind = 'rig' | 'upgrade' | 'boost' | 'time' | 'away' | 'reset';
	type LogEntry = { id: number; kind: LogKind; message: string; at: number };
	const LOG_MAX = 20; // the ancestor's cap, and about a screenful
	let log = $state<LogEntry[]>([]);
	let logSeq = 0;
	function note(kind: LogKind, message: string) {
		log = [{ id: ++logSeq, kind, message, at: Date.now() }, ...log].slice(0, LOG_MAX);
	}
	// Coarse clock for the "3m ago" stamps. Its own 20s beat, NOT the game loop's 200ms one:
	// the stamps only change by the minute, and re-rendering twenty rows five times a second to
	// move nothing would be the most expensive thing on screen.
	let logNow = $state(Date.now());
	// The ledger's two edges. Each says the same thing in the direction it faces: there are rows
	// past this line. `logScrolled` shades under the heading (the tell the panel's own bar gives
	// when content has gone under it — puhig's .csb.csb-on + *); `logMore` shades the bottom
	// while there's still list below.
	//
	// Both are synced from the ELEMENT, not just from scroll events, because the bottom one has
	// to be right BEFORE anything is scrolled: a full ledger overflows the moment it renders,
	// and a bottom edge that only appeared after you scrolled would be missing exactly when it's
	// most useful — on arrival, when you can't yet tell there's more.
	// The settings card, and its click-away. The card springs out of a button that lives in the
	// PAGE's bar, so "outside" has to spare that button too — otherwise the press that closes
	// the card is the same press the toggle reads as "open", and the card shuts and reopens in
	// one click. `[data-pud-settings]` marks it (see the PUD head-actions in the page).
	let settingsEl = $state<HTMLElement | undefined>(undefined);
	let logEl = $state<HTMLElement | undefined>(undefined);
	let logScrolled = $state(false);
	let logMore = $state(false);
	function syncLogEdges(el: HTMLElement | undefined = logEl) {
		if (!el) return;
		logScrolled = el.scrollTop > 2;
		logMore = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
	}
	// Re-measure whenever the list changes length (a new entry can make it overflow for the
	// first time) and once it mounts. rAF so the rows have been laid out before we measure.
	$effect(() => {
		log.length;
		const el = logEl;
		if (!el) return;
		const raf = requestAnimationFrame(() => syncLogEdges(el));
		return () => cancelAnimationFrame(raf);
	});
	function onAwayPointer(e: PointerEvent) {
		if (!settingsOpen) return;
		const t = e.target;
		if (!(t instanceof Element)) return;
		if (settingsEl?.contains(t) || t.closest('[data-pud-settings]')) return;
		onCloseSettings?.();
	}
	const stamp = (at: number) => {
		const secs = Math.max(0, Math.round((logNow - at) / 1000));
		if (secs < 45) return 'just now';
		const mins = Math.round(secs / 60);
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.round(mins / 60);
		return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
	};

	const perClick = $derived(1 + clickLevel);
	const rigRunning = (id: string) => (owned[id] ?? 0) > 0 && !rigPaused[id];
	const baseCps = $derived(
		RIGS.reduce((s, r) => s + (rigPaused[r.id] ? 0 : r.cps * (owned[r.id] ?? 0)), 0)
	);
	const boosted = $derived(nowMs > 0 && nowMs < boostUntil);
	const cps = $derived(paused ? 0 : baseCps * (boosted ? 2 : 1));
	const canBoost = $derived(nowMs >= boostReadyAt && baseCps > 0 && !paused);

	const rigCost = (r: Rig) => Math.round(r.base * Math.pow(1.15, owned[r.id] ?? 0));
	// Sharpening starts at the price of your first Field Probe — the anchor is deliberate: the
	// two are the things you can afford first, and one pays whenever you pull while the other
	// pays while you're gone.
	//
	// It used to open at 25 and climb ×1.7, which is steeper than the RIGS climb (×1.15) for a
	// reward that stays a flat +1. That compounds badly: the eighth sharpen cost 1,744 shards
	// for one more shard a pull, and getting there cost 4,199 — by which point a Relay Mast at
	// ~115 was paying +10/s and the upgrade was plainly a trap. ×1.4 keeps the same shape (each
	// one dearer than the last, so it can't outrun the rigs forever) at a price that stays worth
	// paying: the eighth is 221 and the whole run to it is 737.
	const clickCost = $derived(Math.round(15 * Math.pow(1.4, clickLevel)));

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
	// Rates keep their decimal while they're small. Every RIG is a whole number now, but the
	// live rate isn't: a single probe overclocked is 2/s, and a paused-then-resumed board can
	// sit on fractions between ticks.
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

	// Each pull bumps this, and the sweep inside the Extract button is keyed on it — a new key
	// means a new node, which is what makes a CSS animation start OVER rather than carry on from
	// wherever it was. That's the whole point here: the pull is instant, so the bar isn't
	// reporting progress through a wait, it's reporting THAT A PULL HAPPENED. Spammed, it has to
	// restart on every press or the button looks dead under a fast hand.
	let pullSeq = $state(0);
	function extract() {
		shards += perClick;
		lifetime += perClick;
		pullSeq += 1;
		syncFlap(Date.now()); // a pull that lands in an open window flaps at once
	}
	function buyRig(r: Rig) {
		const cost = rigCost(r);
		if (shards < cost) return;
		shards -= cost;
		owned[r.id] = (owned[r.id] ?? 0) + 1;
		note('rig', `${r.name} №${owned[r.id]} comes online — +${fmtRate(r.cps)}/s.`);
		syncFlap(Date.now()); // a spend drops the count sharply — flap it if the window's open
		save();
	}
	function buyClick() {
		if (shards < clickCost) return;
		shards -= clickCost;
		clickLevel += 1;
		note('upgrade', `Extractor sharpened — ${perClick} shards a pull.`);
		syncFlap(Date.now());
		save();
	}
	function overclock() {
		if (!canBoost) return;
		const now = Date.now();
		boostUntil = now + BOOST_MS;
		boostReadyAt = now + BOOST_COOLDOWN_MS;
		note('boost', 'Overclock engaged — the whole division hums at ×2.');
		save();
	}
	function togglePause() {
		paused = !paused;
		note(
			'time',
			paused
				? 'All rigs down tools. The division rests; your hands don’t have to.'
				: 'The rigs spin back up — extraction resumes.'
		);
		save();
	}
	function toggleRig(r: Rig) {
		rigPaused[r.id] = !rigPaused[r.id];
		note(
			'time',
			rigPaused[r.id]
				? `The ${r.name.toLowerCase()}s stand down.`
				: `The ${r.name.toLowerCase()}s spin back up.`
		);
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
		log = [];
		note('reset', 'The universe is bare again. The probe is in your hand.');
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
		// The ledger rides along, so a return shows what the division did before you left
		// rather than an empty page. Bounded by LOG_MAX on the way in and on the way out.
		log?: LogEntry[];
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
				log: log.slice(0, LOG_MAX),
				savedAt: Date.now()
			};
			localStorage.setItem(SAVE_KEY, JSON.stringify(body));
		} catch {
			/* storage unavailable — this visit still plays */
		}
	}

	let tickTimer = 0;
	let saveTimer = 0;
	let stampTimer = 0;
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
				// Restore the ledger, defensively: it's the one saved field that's a list of
				// objects, so a hand-edited or half-written save could put anything here.
				log = Array.isArray(s.log)
					? s.log
							.filter((e) => e && typeof e.message === 'string' && typeof e.at === 'number')
							.slice(0, LOG_MAX)
					: [];
				logSeq = log.reduce((m, e) => Math.max(m, e.id ?? 0), 0);
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
						note('away', `The rigs pulled ${fmt(gain)} shards while you were away.`);
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
		// The ledger's stamps ("3m ago") move on their own slow beat — see `stamp`.
		stampTimer = window.setInterval(() => (logNow = Date.now()), 20_000);
		// The interval plus onDestroy misses one exit: a hard reload/close, where no
		// teardown runs. pagehide is the door that always swings on the way out.
		window.addEventListener('pagehide', save);
		document.addEventListener('pointerdown', onAwayPointer, true);
	});
	onDestroy(() => {
		clearInterval(tickTimer);
		clearInterval(saveTimer);
		clearInterval(stampTimer);
		if (typeof window !== 'undefined') {
			window.removeEventListener('pagehide', save);
			document.removeEventListener('pointerdown', onAwayPointer, true);
		}
		save();
	});
</script>

<div class="pud">
	<!-- (The "while you were away" banner used to sit here. The ledger carries that line now,
	     as its newest entry — arriving in the accent, so it's still the first thing you see on
	     a return — and printing the same sentence twice on one screen read as a stutter.) -->

	<!-- The GAME column. It's a wrapper rather than a bare run of children so the two-column
	     layout below is a grid of exactly TWO cells. The first attempt left them all as direct
	     children and stretched the ledger down the side with `grid-row: 1 / span 99` — which
	     really does make 99 rows, and .pud's row-gap then charged for every empty one: ~1650px
	     of nothing, and a scrollbar on a panel whose content ended a third of the way down. -->
	<div class="pud-main">
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
		<!-- (The Beta pill moved OUT of here: it's a control now, in the panel bar's right-hand
		     corner with the rest of the global chrome — see the PUD head-actions in the
		     catch-all page. The tally row is a reading, not a place for controls.) -->
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
			{#key pullSeq}
				{#if pullSeq > 0}
					<!-- The pull's own bar, along the bottom edge of the pill. Decorative: the count
					     above is what actually reports the shards, and this is aria-hidden so a
					     screen reader isn't told about a 240ms flourish on every press. -->
					<span class="pud-pull" aria-hidden="true"></span>
				{/if}
			{/key}
			<span class="pud-extract-label">Extract <span class="pud-per">+{perClick}</span></span>
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
	</div>

	{#if log.length}
		<!-- THE LEDGER — the division's log, newest first (see `note`). It replaced a single
		     line that only held the last thing that happened; an idle game is a thing you look
		     away from, and one sentence can't tell you what you missed.
		     Each row keeps its own entrance: `animate:flip` slides the standing rows down as a
		     new one lands, and the newest wears the arrival keyframe (accent, cooling to the
		     note's ink) that the single line used to. aria-live on the list is what the old
		     role="status" was doing — additions get announced, the history doesn't. -->
		<section class="pud-ledger" aria-label="Division ledger">
			<p class="pud-lead">Division ledger</p>
			<ul
				class="pud-log"
				class:scrolled={logScrolled}
				class:more={logMore}
				bind:this={logEl}
				aria-live="polite"
				onscroll={(e) => syncLogEdges(e.currentTarget)}
			>
				{#each log as entry, i (entry.id)}
					<li
						class="pud-log-row"
						class:newest={i === 0}
						data-kind={entry.kind}
						animate:flip={{ duration: 320, easing: backOut }}
					>
						<span class="pud-log-dot" aria-hidden="true"></span>
						<span class="pud-log-msg">{entry.message}</span>
						<time class="pud-log-at" datetime={new Date(entry.at).toISOString()}>{stamp(entry.at)}</time>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- The division's settings: the lifetime tally, and the way out. They used to sit in a foot
	     rule under the shop, where a destructive button lived one mis-click from the buy pills;
	     now they're behind the bar's gear, in a card that springs out of it (popSpring, the same
	     recipe the nav flyouts and the Star Map's story card use).
	     Abandon still asks twice — the second press is the real one, and looking away disarms. -->
	{#if settingsOpen}
		<aside
			class="pud-settings"
			bind:this={settingsEl}
			transition:popSpring={{ y: -10, origin: 'right top' }}
			aria-label="Division settings"
		>
			<div class="pud-settings-head">
				<p class="pud-lead">Division settings</p>
				<button type="button" class="icon-btn" aria-label="Close settings" onclick={() => onCloseSettings?.()}>
					{@html CLOSE_SVG}
				</button>
			</div>
			<p class="pud-lifetime">{fmt(lifetime)} extracted all-time</p>
			<button type="button" class="pud-reset" class:armed={armReset} onclick={reset} onblur={() => (armReset = false)}>
				{armReset ? 'Sure? Every shard.' : 'Abandon universe'}
			</button>
		</aside>
	{/if}
</div>

<style>
	.pud {
		position: relative; /* the settings card pins to this app's top-right corner */
		display: flex;
		flex-direction: column;
		gap: 1.05rem;
	}
	/* The game column carries the stack's own rhythm, so .pud is left holding just two things:
	   this and the ledger. */
	.pud-main {
		display: flex;
		flex-direction: column;
		gap: 1.05rem;
		min-width: 0;
	}
	/* ── Two columns, once there's room ──────────────────────────────────────────
	   Full-viewport, this app has far more width than a stack of rows needs, and the ledger is
	   the piece that wants to be READ ALONGSIDE rather than scrolled down to: it's the answer
	   to "what just happened", and answering that under the shop means scrolling away from the
	   thing you just did. So it takes its own column at the top right and the game stays left.

	   The seam is the app's own mobile seam (960px): below it everything falls back to the
	   single column above, which is the layout the panel has always had. Grid, not flex, because
	   the children are a flat list — assigning them all to column 1 and lifting ONE out to
	   column 2 needs no wrapper element around the rest. */
	@media (min-width: 961px) {
		.pud {
			display: grid;
			/* The ledger's column is fixed-ish: its rows are one line of text, so letting it
			   share the surplus would just stretch the timestamps away from the messages. */
			grid-template-columns: minmax(0, 1fr) clamp(17rem, 24vw, 23rem);
			column-gap: clamp(1.25rem, 2.5vw, 2.25rem);
			align-items: start;
		}
		/* Exactly two cells, so nothing has to span anything: the game column is one child and
		   the ledger is the other. This replaced a `grid-row: 1 / span 99` on the ledger, which
		   generated 99 rows and paid row-gap on all of them — about 1650px of empty grid, and a
		   scrollbar on a panel whose content stopped a third of the way down. */
		.pud-main {
			grid-column: 1;
		}
		.pud-ledger {
			grid-column: 2;
			align-self: start;
		}
		/* Its own frame, so it reads as a panel beside the game rather than a stray list. */
		.pud-ledger {
			padding: 0.9rem 1rem;
			border: 1px solid var(--line-edge);
			border-radius: 14px;
			background: var(--aero-face);
		}
		/* Taller here than in the stacked layout: a column of its own has the height to spend,
		   and the whole point is seeing more than the last thing you did.
		   Scoped through .pud-ledger for WEIGHT, not for reach: the base .pud-log rule is
		   declared later in this stylesheet, so a bare .pud-log here — same specificity, earlier
		   in source — quietly lost, and the ledger kept the stacked layout's 13rem. */
		.pud-ledger .pud-log {
			max-height: 22rem;
		}
	}
	/* Entrance — the panel's pieces settle top-to-bottom, the Weather/Court cadence. */
	@media (prefers-reduced-motion: no-preference) {
		.pud-main > *,
		.pud-ledger {
			animation: pud-settle 0.45s ease backwards;
		}
		/* …but NOT the settings card. It's a child of .pud, so it was picking this up on top of
		   its own popSpring and playing two entrances at once — springing out of the gear while
		   also settling down from above. This one is a popout, not part of the page's arrival:
		   it comes and goes on a press, long after the panel has landed. */
		.pud > .pud-settings {
			animation: none;
		}
		.pud-main > :nth-child(2) {
			animation-delay: 0.06s;
		}
		.pud-main > :nth-child(3) {
			animation-delay: 0.12s;
		}
		.pud-main > :nth-child(4) {
			animation-delay: 0.18s;
		}
		.pud-main > :nth-child(5) {
			animation-delay: 0.24s;
		}
		.pud-main > :nth-child(6) {
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
	/* CLEAR, like Overclock and Pause beside it — the accent isn't the button's resting state
	   any more, it's what happens WHEN YOU PULL. A permanently orange button says "this is the
	   important one"; a clear one that floods orange on every press says "that worked", which is
	   the thing worth saying on a control you hit a hundred times. It keeps the heavier weight
	   so it still reads as the primary of the three.
	   The sweep is pinned inside the pill, and the pill is a 999px capsule — overflow clips the
	   sweep's ends to that curve so it can't square off the corners. */
	.pud-extract {
		position: relative;
		overflow: hidden;
		flex: none;
		gap: 0.5rem;
		font-weight: 700;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1.5px solid var(--line-edge);
		transition: border-color 0.15s ease, background 0.15s ease;
	}
	.pud-extract:hover {
		border-color: var(--line-strong);
	}
	/* Above the sweep, so an accent flood passes BEHIND the words rather than washing them. */
	.pud-extract-label {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	/* THE PULL BAR — feedback for a thing that takes no time. Extract is instant, so there's no
	   wait to report; what this says is "that press landed", which matters most exactly when the
	   button is being hammered and the count is a blur. It runs left to right along the bottom
	   edge and fades as it completes, quick enough (240ms) to finish inside a fast press and
	   still restart cleanly on the next one (see pullSeq).
	   It rests at scaleX(0) and opacity 0, so with a motion preference set — where the animation
	   never runs — there's simply nothing drawn, rather than a bar stuck at full width. */
	.pud-pull {
		position: absolute;
		/* FULL BLEED — the wash crosses the whole face rather than riding a 3px rail at the
		   bottom. At button size that rail was a detail you had to be looking for; the whole
		   pill lighting up is the thing you catch out of the corner of your eye while your
		   attention is on the count. */
		inset: 0;
		transform-origin: left center;
		transform: scaleX(0);
		opacity: 0;
		/* THE ACCENT — the button's clear face floods orange as the pull lands. It sits at z-index
		   0, under .pud-extract-label, so the flood passes behind the words instead of over
		   them: at full strength an accent wash across ink text would take the label with it. */
		z-index: 0;
		background: var(--accent, #f06030);
		pointer-events: none;
	}
	@media (prefers-reduced-motion: no-preference) {
		.pud-pull {
			animation: pud-pull 0.24s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
		}
	}
	/* Strong on the way across, gone by the end: the flood is the whole feedback now that the
	   button doesn't rest in the accent, so it reads at full strength rather than the quarter a
	   wash over an already-orange face could afford. */
	@keyframes pud-pull {
		0% {
			transform: scaleX(0);
			opacity: 0.9;
		}
		70% {
			opacity: 0.9;
		}
		100% {
			transform: scaleX(1);
			opacity: 0;
		}
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
		/* This one is a full-width ROW, not a pill: the family's 5% pop would swing its far edge
		   tens of px and shove the price chip beside it. Same softening the Apps cards take, for
		   the same reason — the spring itself is shared, only the amounts shrink. */
		--btn-hover-scale: 1.01;
		--btn-press-scale: 0.995;
		/* A row scales from its own left edge, so its text doesn't drift toward the middle. */
		transform-origin: left center;
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

	/* ── The ledger ──────────────────────────────────────────────────────────────
	   A quiet list, not a feed: small type, one line a row, the time right-aligned so the
	   messages keep a clean left edge to scan down. It caps its own height and scrolls, so a
	   full twenty entries can't push the foot off the panel. */
	.pud-ledger {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	/* BOTH edges shade, each saying the same thing in the direction it faces: there are rows past
	   this line. Said the way the panel's bar says it — an inset breath on the SCROLLER, pinned
	   to its box (an inset shadow on a scroller pins to the BOX, not the content), same values as
	   puhig's folded-bar shade so every edge in the app reads as one idea.
	   Composed through two custom properties rather than three combined rules, so top and bottom
	   are independent: either, both, or neither can be lit, and each transitions on its own. */
	.pud-log.scrolled {
		--log-shade-top: inset 0 26px 22px -22px light-dark(rgba(8, 10, 14, 0.15), rgba(0, 0, 0, 0.35));
	}
	.pud-log.more {
		--log-shade-bottom: inset 0 -26px 22px -22px light-dark(rgba(8, 10, 14, 0.15), rgba(0, 0, 0, 0.35));
	}
	.pud-log {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		max-height: 13rem;
		overflow-y: auto;
		/* Rounded all round: the rows are cut at BOTH ends of this box — the top under the
		   heading, the bottom against the ledger's own edge — and a hard square cut inside a
		   14px frame read as a torn strip either way. The radius rides the overflow, so the
		   shades curve with it.
		   The shades default to nothing and are lit by .scrolled / .more above; declaring both
		   slots here (rather than in each state rule) is what lets them compose. */
		border-radius: 10px;
		--log-shade-top: 0 0 0 0 transparent;
		--log-shade-bottom: 0 0 0 0 transparent;
		box-shadow: var(--log-shade-top), var(--log-shade-bottom);
		transition: box-shadow 0.25s ease;
		/* The rows scroll under the heading, so reserve the bar's lane rather than letting it
		   appear and shove the times sideways when the twentieth entry lands. */
		scrollbar-gutter: stable;
	}
	.pud-log-row {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.3rem 0;
		font-size: 0.85rem;
		color: var(--sub);
	}
	.pud-log-row + .pud-log-row {
		border-top: 1px solid transparent;
		border-image: var(--rule-fade) 1;
	}
	/* The kind, said in colour rather than an emoji (see the LogKind note in the script): a
	   dot in the app's accent for the things you DID, and a dimmer one for what merely
	   happened — time passing, rigs standing down, the universe being abandoned. */
	.pud-log-dot {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--accent, #f06030);
		/* Nudge it onto the text's own line rather than its baseline box. */
		transform: translateY(-1px);
	}
	.pud-log-row[data-kind='time'] .pud-log-dot,
	.pud-log-row[data-kind='reset'] .pud-log-dot,
	.pud-log-row[data-kind='away'] .pud-log-dot {
		background: color-mix(in srgb, var(--ink) 30%, transparent);
	}
	.pud-log-msg {
		flex: 1;
		min-width: 0;
	}
	.pud-log-at {
		flex: none;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: color-mix(in srgb, var(--ink) 40%, transparent);
	}
	/* The newest row announces itself the way the single line used to: it rises a few px and
	   arrives in the accent, cooling to the note's own ink. */
	@media (prefers-reduced-motion: no-preference) {
		.pud-log-row.newest {
			animation: pud-note-in 1.1s var(--spring, ease) backwards;
		}
	}
	/* NO opacity ramp — deliberately, and this took a trace to see. Buying does real work on the
	   main thread (the headline re-flaps, the save writes), so the new row's animation doesn't
	   get its first tick for ~250ms. With `backwards` fill the element sits on the 0% frame until
	   then, and a 0% frame that includes a low opacity means the newest line reads BLANK for a
	   quarter second after the click — the animation making the app look like it hitched, which
	   is worse than not animating at all. Held frames are only safe if they're legible, so the
	   arrival is carried by a short rise and the accent instead. */
	@keyframes pud-note-in {
		0% {
			transform: translateY(6px);
			color: var(--accent, #f06030);
		}
		18% {
			transform: translateY(0);
			color: var(--accent, #f06030);
		}
		55% {
			color: var(--accent, #f06030);
		}
		100% {
			color: var(--sub);
		}
	}

	/* The settings card. It hangs from the bar's gear at the top RIGHT, so it's pinned to this
	   corner of the app and springs out of the button (popSpring anchors the swell at the
	   caller's corner — see the transition on the element).
	   Positioned against .pud, which the grid rule below makes a positioning context; the panel
	   body scrolls, so anchoring to the app rather than the viewport keeps it with its button
	   instead of floating over the page. */
	.pud-settings {
		position: absolute;
		z-index: 5;
		top: 0;
		/* Lined up with the GEAR, not with this column. The card lives in the body, which is
		   inset further from the edge than the bar its button sits in, so `right: 0` left it
		   ~29px shy of the button and read as floating near it rather than hanging off it.
		   Reaching out by the difference between the two insets (both published by the page on
		   this body) puts the card's right edge exactly under the button's at every width — the
		   pixel gap changes with the viewport, since both insets are clamps, so a fixed nudge
		   would have been right at one size and wrong everywhere else. */
		right: calc(var(--bar-inset, 1rem) - var(--app-inset, 2.75rem));
		width: min(20rem, calc(100% - 1rem));
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.9rem 1rem 1rem;
		border: 1px solid var(--line-edge);
		border-radius: 14px;
		background: var(--panel-fill-solid, var(--paper));
		box-shadow: var(--aero-drop, 0 18px 40px -24px rgba(8, 10, 14, 0.45));
	}
	.pud-settings-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	/* Solid, not the ink wash the rest of the app wears: this card floats OVER the shop, and a
	   translucent face let the rows read straight through the abandon button. */
	.pud-settings .pud-lifetime {
		margin: 0;
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
	/* The FLOOD is aero too. The pill wears the family's gloss whatever it's filled with, but
	   that gloss is on the button — once the orange sweeps across at full strength it covers it,
	   and the accent read as flat paint sliding under a glass rim. Giving the sweep its own
	   inset rim light keeps the material consistent all the way through the pull: the button is
	   aero, and so is the thing filling it. Inset only (edge-hugging), never a sheen wash across
	   the face — the bubble-gloss rule, same as the badge's arrival disc. */
	:global(html[data-ui='bubble']) .pud-pull {
		box-shadow: var(--aero-gloss);
	}
</style>
