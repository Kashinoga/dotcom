<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { flip } from 'svelte/animate';
	import { fade, fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { popSpring } from '$lib/pop-spring';
	import SplitFlap from '$lib/SplitFlap.svelte';
	import { GEM_OPAL_SVG, CLOSE_SVG, PLAY_SVG, PAUSE_SVG } from '$lib/icons';
	import { ranger, togglePaused, setDeployment, board, disembark, leaveShuttle } from '$lib/location-state.svelte';
	import { createStage } from '$lib/stage.svelte';

	// The settings popout is opened from the PANEL BAR, which belongs to the catch-all page —
	// so the page owns the open/closed flag and the button, and this component draws the card
	// and the numbers in it. Splitting it that way keeps the tally and the abandon button
	// beside the state they act on instead of passing both up.
	let { settingsOpen = false, onCloseSettings }: {
		settingsOpen?: boolean;
		onCloseSettings?: () => void;
	} = $props();

	// THE STAGE — the boarding choreography, its rules and its motion-preference read now living in
	// one module (stage.svelte.ts). Every dashboard section asks it for the transition params for
	// its own door; the six laws that shape them (shared exit end, nearest door, reduced motion,
	// the first-mount gate) are documented there. `stage.used` is what everAboard used to be.
	const stage = createStage();

	// Does this browser drive the deployment swap with a View Transition (see setDeployment)? Still
	// read, still true where the API lives: the transit machinery (the bar, the scenes, the tally
	// and the surviving named boxes) morphs on it. But the DASHBOARD sections no longer animate on
	// a deployment swap at all — deployment can only change from inside the cabin now, so the
	// sections are always unmounted when a swap fires (see the boarding gates below). Their motion
	// is BOARDING's, not the swap's, and boarding is deliberately outside the View Transition. Read
	// once; capability doesn't change mid-session.
	const viewTransitions = typeof document !== 'undefined' && 'startViewTransition' in document;

	// A11y — where focus stands once you're aboard. Boarding UNMOUNTS the whole dashboard, the
	// shuttle card the ranger just pressed included, so focus would fall back to <body> and a
	// keyboard user would lose their place. This effect catches the element as the cabin mounts
	// (the bind is live only while aboard) and moves focus onto the destination button — the
	// first thing you'd reach for in there. SSR-guarded by the element itself: cabinDestEl is
	// undefined on the server and until the cabin renders, so focus() only fires client-side once
	// the button is really in the DOM. It settles focus even while the in:fly is still playing,
	// which is fine — the transform doesn't move the focus ring off the control.
	// Mark the stage used the first time the ranger boards. From then on the entrances play live
	// (until now they were parked at duration 0 — the first-mount gate, law 4 in stage.svelte.ts)
	// and .pud wears .reboarded, which mutes the pud-settle arrival flourish on the remounts that
	// now belong to boarding.
	$effect(() => {
		if (ranger.aboard) stage.use();
	});
	let cabinDestEl = $state<HTMLButtonElement | undefined>(undefined);
	$effect(() => {
		if (ranger.cabin && cabinDestEl) cabinDestEl.focus();
	});

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

	// ── Woodcutting ─────────────────────────────────────────────────────────────
	// The first of the ancestor build's SKILLS to come over (~/Downloads/Git/pud-idle,
	// WoodcuttingView.svelte). It's the other half of an idle game from the rigs: those pay
	// while you're gone, this pays attention — you pick a stand, it takes real seconds, and
	// you watch it fill. Same three the ancestor cut, same forest (LPU-1031's fast-grown
	// timber), at times that suit a panel you visit rather than a page you live in.
	//
	// One axe, one tree: starting a cut while another runs is refused rather than queued, which
	// is the ancestor's rule and the reason the progress bar can be a single CSS animation
	// instead of a scheduler.
	type Tree = { id: string; name: string; blurb: string; ms: number; yield: number };
	const TREES: Tree[] = [
		{
			id: 'kindling',
			name: 'Kindling',
			blurb: 'Dry twigs off the forest floor. Quick work, and it catches at a spark.',
			ms: 1600,
			yield: 1
		},
		{
			id: 'timber',
			name: 'Timber',
			blurb: 'Living stands, grown fast and light in the long LPU-1031 daylight.',
			ms: 3400,
			yield: 1
		},
		{
			id: 'deadfall',
			name: 'Deadfall',
			blurb: 'Fallen giants, slow to break. The fungal floor has been at them for years.',
			ms: 5600,
			yield: 2
		}
	];

	// ── The courier ─────────────────────────────────────────────────────────────
	// Ported from the ancestor's starship store (~/Downloads/Git/pud-idle,
	// src/lib/stores/starship.ts), which had the fiction and the shape — a named courier in
	// orbit, a transit window, a supply drop on a clock, and a request-priority action that cut
	// the wait — but no working parts: the drop never landed and the manifest never arrived.
	// Here the clock runs, the drop lands, and the manifest goes into the stores.
	// ── Basecamp ────────────────────────────────────────────────────────────────
	// The ancestor listed Basecamp beside Home and the Starship as one of the LOCATIONS, and its
	// activity log already carried a 'campfire' event type — the camp was planned, never built.
	// It's built here as the thing the forestry detail was missing: a use for the timber.
	//
	// A fire is lit with what you cut, burns for a minute, and the whole division works warmer
	// while it does. That closes the loop the stands opened — cut, burn, extract faster — and
	// stacks with Overclock rather than replacing it: one is what you pay shards for, the other
	// is what you cut wood for.
	const FIRE_MS = 60_000;
	const FIRE_MULT = 1.5;
	const FIRE_COST: { id: string; n: number }[] = [
		{ id: 'kindling', n: 2 },
		{ id: 'timber', n: 1 }
	];

	const SHIP = { name: 'IPR Courier — Vanta', where: 'Densette Gateway' };
	const DROP_MS = 120_000; // a drop every two minutes…
	const DROP_RUSH_MS = 15_000; // …or fifteen seconds, if you pay the freight
	const RUSH_COST = 250;
	// What a drop can carry. Small counts: the courier is a supply line, not a windfall.
	const SUPPLIES = [
		{ id: 'rations', name: 'Rations', max: 4 },
		{ id: 'medkits', name: 'Medkits', max: 2 },
		{ id: 'toolkits', name: 'Toolkits', max: 1 }
	];

	let shards = $state(0);
	// Everything the division holds — timber from the stands, crates from the courier. It was
	// `wood` when only the forestry detail filled it; saves written under that name are still
	// read (see the load), so nobody's timber disappears.
	let stores = $state<Record<string, number>>({});
	let dropAt = $state(0);
	let rushed = $state(false);
	let fireUntil = $state(0);
	// The cut in progress, or nothing. `ms` rides along so the bar can animate for exactly as
	// long as the award is going to take, from one source of truth.
	let chop = $state<{ id: string; ms: number } | null>(null);
	let chopTimer = 0;
	let lifetime = $state(0); // every shard ever held — the save's bragging number
	let clickLevel = $state(0);
	let owned = $state<Record<string, number>>(Object.fromEntries(RIGS.map((r) => [r.id, 0])));
	let boostUntil = $state(0);
	let boostReadyAt = $state(0);
	// The wholesale pause moved up to location-state (ranger.paused) so the panel bar's global
	// play/pause and this component's own switch drive one bit — see that module. Any ONE rig can
	// still down its own tools, and that stays local: it's a per-rig thing nothing outside touches.
	let rigPaused = $state<Record<string, boolean>>({});
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
	type LogKind =
		| 'rig'
		| 'upgrade'
		| 'boost'
		| 'time'
		| 'away'
		| 'reset'
		| 'wood'
		| 'supply'
		| 'campfire';
	type LogEntry = { id: number; kind: LogKind; message: string; at: number };
	const LOG_MAX = 20; // the ancestor's cap, and about a screenful
	let log = $state<LogEntry[]>([]);
	let logSeq = 0;
	function note(kind: LogKind, message: string) {
		log = [{ id: ++logSeq, kind, message, at: Date.now() }, ...log].slice(0, LOG_MAX);
	}
	// The pause bit lives in location-state now, and any of three hands can flip it: this
	// component's header switch, the panel bar's global twin, or a restored save. None of them
	// narrates the change — this single effect does, so the ledger gets exactly one line per real
	// flip no matter who threw the switch. `pausePrev` is a sentinel (undefined until first read):
	// the effect's first pass ADOPTS whatever value it finds without logging, which is how a
	// reload that comes back paused doesn't announce a pause you did a week ago. restore() also
	// seeds it (below), so even if that first pass lands before onMount the adopted value is the
	// restored one — the note only fires on a change made AFTER the board has settled.
	let pausePrev: boolean | undefined;
	$effect(() => {
		const down = ranger.paused;
		if (pausePrev === undefined) {
			pausePrev = down;
			return;
		}
		if (down === pausePrev) return;
		pausePrev = down;
		note(
			'time',
			down
				? 'All rigs down tools. The division rests; your hands don’t have to.'
				: 'The rigs spin back up — extraction resumes.'
		);
	});
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

	// What's actually in the stores, in the order the stands are listed — so the card reads down
	// in the same order as the detail above it rather than by whatever arrived first.
	const held = $derived(
		[...TREES, ...SUPPLIES]
			.map((t) => ({ id: t.id, name: t.name, count: stores[t.id] ?? 0 }))
			.filter((h) => h.count > 0)
	);
	// Whole seconds until the courier is overhead; the tick already moves nowMs, so this needs
	// no clock of its own.
	const dropIn = $derived(Math.max(0, Math.ceil((dropAt - nowMs) / 1000)));
	const canRush = $derived(!rushed && shards >= RUSH_COST && dropIn > DROP_RUSH_MS / 1000);
	const perClick = $derived(1 + clickLevel);
	const rigRunning = (id: string) => (owned[id] ?? 0) > 0 && !rigPaused[id];
	const baseCps = $derived(
		RIGS.reduce((s, r) => s + (rigPaused[r.id] ? 0 : r.cps * (owned[r.id] ?? 0)), 0)
	);
	const boosted = $derived(nowMs > 0 && nowMs < boostUntil);
	const lit = $derived(nowMs > 0 && nowMs < fireUntil);
	// The fire and the overclock MULTIPLY rather than override: they're bought with different
	// things (timber and shards), so stacking them is the reward for running both.
	const cps = $derived(ranger.paused ? 0 : baseCps * (boosted ? 2 : 1) * (lit ? FIRE_MULT : 1));
	// Enough in the stores for a fire, and nothing already burning. Kept as its own derived so
	// the button can say WHY it's out — the cost is listed either way.
	const canLight = $derived(!lit && FIRE_COST.every((c) => (stores[c.id] ?? 0) >= c.n));
	const canBoost = $derived(nowMs >= boostReadyAt && baseCps > 0 && !ranger.paused);

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
	function startChop(t: Tree) {
		// Clicking the tree you're already cutting calls it off — the ancestor simply ignored a
		// second click, but a cut you can't stop is a five-second lockout on a panel someone
		// might be leaving. Nothing is awarded for a cancelled cut.
		if (chop?.id === t.id) {
			clearTimeout(chopTimer);
			chop = null;
			return;
		}
		if (chop) return; // one axe, one tree
		chop = { id: t.id, ms: t.ms };
		chopTimer = window.setTimeout(() => {
			stores[t.id] = (stores[t.id] ?? 0) + t.yield;
			note('wood', `Felled ${t.yield > 1 ? `${t.yield}× ` : ''}${t.name}.`);
			chop = null;
			save();
		}, t.ms);
	}
	function lightFire() {
		if (!canLight) return;
		for (const c of FIRE_COST) stores[c.id] = (stores[c.id] ?? 0) - c.n;
		fireUntil = Date.now() + FIRE_MS;
		note('campfire', `The camp fire is lit — the division works warm for a minute.`);
		save();
	}
	// The drop lands: a crate or two into the stores, a line in the ledger, and the next window
	// set. Deterministic enough to be fair — one guaranteed item, a second sometimes — because a
	// supply line that can deliver nothing reads as broken rather than unlucky.
	function landDrop(now: number) {
		const roll = Math.floor(Math.random() * SUPPLIES.length);
		const picked = [SUPPLIES[roll]];
		if (Math.random() < 0.45) {
			const second = SUPPLIES[(roll + 1 + Math.floor(Math.random() * (SUPPLIES.length - 1))) % SUPPLIES.length];
			if (second.id !== picked[0].id) picked.push(second);
		}
		const manifest = picked.map((it) => {
			const n = 1 + Math.floor(Math.random() * it.max);
			stores[it.id] = (stores[it.id] ?? 0) + n;
			return `${n}× ${it.name}`;
		});
		note('supply', `${SHIP.name} drops ${manifest.join(' and ')}.`);
		dropAt = now + DROP_MS;
		rushed = false;
		save();
	}
	function requestRush() {
		if (!canRush) return;
		shards -= RUSH_COST;
		dropAt = Math.min(dropAt, Date.now() + DROP_RUSH_MS);
		rushed = true;
		note('supply', `Freight paid — ${SHIP.name} brings the window forward.`);
		syncFlap(Date.now()); // the spend drops the count sharply
		save();
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
	// Deployment used to be flipped from a pair of pills on the shuttle card, through a local
	// `deploy()` that logged the move. It's a place you BOARD now: the choice lives inside the
	// cabin (see the .pud-cabin section) and goes straight through setDeployment, which owns the
	// no-op guard and the transit cinema. The old wrapper — and its ledger line — retired with the
	// pills; boarding is its own visible event, and the crossing tells its own story on screen.
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
		stores = {};
		dropAt = Date.now() + DROP_MS;
		rushed = false;
		fireUntil = 0;
		clearTimeout(chopTimer);
		chop = null;
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
		wood?: Record<string, number>; // pre-courier name for `stores`; still read, never written
		stores?: Record<string, number>;
		dropAt?: number;
		rushed?: boolean;
		fireUntil?: number;
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
				paused: ranger.paused,
				rigPaused: { ...rigPaused },
				log: log.slice(0, LOG_MAX),
				stores: { ...stores },
				dropAt,
				rushed,
				fireUntil,
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
				ranger.paused = s.paused ?? false;
				// Seed the effect's sentinel to the restored value, so the pause we're coming back
				// INTO isn't narrated as a pause you just made — this holds whichever side of the
				// effect's first run this assignment lands on (see the $effect above).
				pausePrev = ranger.paused;
				rigPaused = { ...(s.rigPaused ?? {}) };
				stores = { ...(s.stores ?? s.wood ?? {}) };
				dropAt = s.dropAt ?? 0;
				rushed = s.rushed ?? false;
				fireUntil = s.fireUntil ?? 0;
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
				if (!ranger.paused) {
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
		// A courier that was overhead while you were gone unloads once on your return — not once
		// per window missed, which after a night away would be a screenful of crates.
		if (!dropAt) dropAt = nowMs + DROP_MS;
		else if (nowMs >= dropAt) landDrop(nowMs);
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
			if (baseCps > 0 && !ranger.paused) {
				const gain = baseCps * (now < boostUntil ? 2 : 1) * dt;
				shards += gain;
				lifetime += gain;
			}
			if (dropAt && now >= dropAt) landDrop(now);
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
		clearTimeout(chopTimer); // a cut in flight doesn't outlive the panel
		if (typeof window !== 'undefined') {
			window.removeEventListener('pagehide', save);
			document.removeEventListener('pointerdown', onAwayPointer, true);
		}
		// Step off the shuttle as the dashboard leaves: cancels any pending handoff/transit timers
		// and clears the transient in-cabin state, so reopening lands on the dashboard rather than
		// mid-boarding — and a crossing left in the air can't complete under a future panel and
		// reveal the Shuttle card a second time (see leaveShuttle in location-state).
		leaveShuttle();
		save();
	});
</script>

<div class="pud" class:reboarded={stage.used}>
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
		<span class="pud-gem" class:boosted aria-hidden="true">{@html GEM_OPAL_SVG}</span>
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
				Data Shards · {ranger.paused
					? 'paused'
					: `${fmtRate(cps)}/s${boosted ? ' · overclocked ×2' : ''}${lit ? ` · fire ×${FIRE_MULT}` : ''}`}
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
		<div class="pud-mining" class:boosted class:paused={ranger.paused} aria-hidden="true">
			<span class="pud-mining-sweep"></span>
		</div>
	{/if}

	<!-- THE CABIN — where the dashboard's heart is once you're aboard. It stands right under the
	     persistent chrome (the tally and the mining band, which never leave), in the space the
	     actions row, the band, and the forestry detail vacate as they board away. For now it holds
	     the one thing a shuttle is for — the destination — and a quiet way back out; more controls
	     will strap in beside these later.
	     It MOUNTS late, not just animates late: an incoming element takes its box in the layout
	     the moment it mounts, delay or no delay, and a cabin gated on `aboard` alone landed in
	     the flow while the cards were still flying off — the two shoved each other mid-move. So
	     the cabin waits on `ranger.cabin`, raised by the module's handoff clock only once the
	     deck has cleared (BOARD_CLEAR_MS), and dropped FIRST on the way out, with the dashboard
	     returning only after CABIN_EXIT_MS. Neither ever shares the floor with the other.
	     COMMITTING DROPS THE CABIN — the moment a destination is chosen, setDeployment lowers
	     `cabin` and this card flies off (280ms), clearing the glass just before the wipe covers
	     it at 350: the crossing plays as pure window — chrome, sky, camera — with no furniture
	     riding along. `aboard` stays raised through the flight so the dashboard holds offstage,
	     and arrival opens the hatch straight onto the destination's deck. -->
	{#if ranger.cabin}
		<section
			class="pud-place pud-cabin-sec"
			in:fly={stage.enterUp()}
			out:fly={stage.exitDown()}
			aria-label="Shuttle cabin"
		>
			<p class="pud-lead">Shuttle</p>
			<div class="pud-cabin">
				<div class="pud-ship-id">
					<span class="pud-item-name">Division shuttle</span>
					<span class="pud-item-blurb">Strapped in. The pad hums.</span>
				</div>
				<div class="pud-cabin-controls">
					<!-- The destination: one press flies you the other way. It goes straight through
					     setDeployment, which runs the transit cinema and, on arrival, disembarks you.
					     Disabled while a crossing is already in the air. Focus lands here on board. -->
					<button
						type="button"
						class="pud-boost"
						bind:this={cabinDestEl}
						disabled={ranger.transit !== null}
						onclick={() => setDeployment(ranger.deployment === 'basecamp' ? 'orbit' : 'basecamp')}
					>
						{ranger.deployment === 'basecamp' ? 'Enter Orbit' : 'Descend to Basecamp'}
					</button>
					<!-- The way back out, before you commit to a destination. Also refused mid-flight —
					     once the shuttle's in the air, arrival is the only way off. -->
					<button type="button" class="pud-boost" disabled={ranger.transit !== null} onclick={disembark}>
						Disembark
					</button>
				</div>
			</div>
		</section>
	{/if}

	<!-- The hands-on half: the pull, and the overclock beside it. Both are BASECAMP verbs — you
	     work the extractor and clock the works with your hands on the ground. In orbit the row is
	     gone ENTIRELY — nothing in it survives leaving the surface now that the shuttle keeps its
	     own pad down in the places column. The rigs go on earning while you're aboard, and an
	     overclock already lit keeps burning to its timer: the gate hides the controls, it doesn't
	     stop the works.
	     TWO gates now. The INNER one is the same deployment gate — Extract and Overclock are
	     planetside-only, so the row lives and dies with Basecamp. The OUTER `!aboard` gate is the
	     BOARDING choreography: deployment can only change from inside the cabin, so this row is
	     always unmounted when a deployment swap fires — its old VT-aware fly/fade was dead weight
	     drawing nothing. What moves it now is boarding: it leaves by the LEFT door with the places
	     (these controls sit on the panel's left edge) and returns the same way — see the stage's
	     exitLeft/enterLeft (stage.svelte.ts). -->
	{#if !ranger.aboard}
		{#if ranger.deployment === 'basecamp'}
		<div class="pud-actions" in:fly|global={stage.enterLeft(60)} out:fly|global={stage.exitLeft()}>
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
				{:else if baseCps === 0 || ranger.paused}Overclock
				{:else}Recharging · {secsLeft(boostReadyAt)}s{/if}
			</button>
			<!-- (Pause moved OUT of here. It stops the RIGS, so it now rides the requisitions head
			     where the rigs are listed — see .pud-shop-head below — with a global twin up on the
			     panel bar. The hands-on row is left to the things your hands do. Deployment moved out
			     too — it's a place you board now, not a switch on this row: see the Shuttle below.) -->
		</div>
		{/if}
	{/if}

	<!-- The requisition sheet: the click upgrade first (it's the one you feel), then the
	     rigs by price. Each row splits its jobs: the CARD BODY is that rig's own switch
	     (its ring spins while it works; a click stands it down or spins it up), and the
	     COST CHIP at the right is the buy. Unowned rigs have nothing to switch, so their
	     body waits inert until the first unit comes online. -->
	<!-- Requisitions and the courier sit side by side: both are places you spend, and neither
	     fills a whole panel's width on its own. Stacks below the app's own seam. In orbit the
	     requisitions column is gone, so the band drops to one column (class:orbit below). -->
	<div class="pud-cols" class:orbit={ranger.deployment === 'orbit'}>
		<!-- THE PLACES — Basecamp and the Courier. One shows at a time now: where you are is what
		     you see, so a planetside ranger gets the camp and a ranger aboard gets the courier. The
		     other place still runs (the camp fire burns to its clock either way); deployment sets
		     the view, not the world. Requisitions sits beside them, at Basecamp only.
		     BOARDING GATE — the whole left column, shuttle card included, is the FIRST thing to
		     leave the stage when you board: it slides out to the left (it's the leftmost column, so
		     it exits the way it sits) and slides back from the left when you disembark. Attached to
		     .pud-places ITSELF, no wrapper — it's a grid child of .pud-cols, and a div around it
		     would become the grid cell and break the band. The `view-transition-name` stays for the
		     bar/scene machinery, but boarding isn't VT-wrapped, so on a swap this just unmounts
		     plainly. It leaves and returns by the LEFT door — see the stage's exitLeft/enterLeft
		     (stage.svelte.ts), which handles the reduced-motion case too. -->
		{#if !ranger.aboard}
		<div
			class="pud-places"
			out:fly|global={stage.exitLeft()}
			in:fly|global={stage.enterLeft(60)}
		>
			<!-- BASECAMP — where the timber goes. Cut, burn, extract faster. Shown planetside. The
			     inner deployment gate stays, but its own fly/fade is gone: this element is always
			     unmounted when a swap happens (deployment only changes from the cabin), so it never
			     animated visibly — the boarding slide on .pud-places above is what moves it now. -->
			{#if ranger.deployment === 'basecamp'}
			<div class="pud-place">
				<p class="pud-lead">Basecamp</p>
				<div class="pud-camp" class:lit>
					<div class="pud-ship-id">
						<span class="pud-item-name">Camp fire</span>
						<span class="pud-item-blurb">
							{lit
								? `Burning — the division works at ×${FIRE_MULT} for ${Math.max(0, Math.ceil((fireUntil - nowMs) / 1000))}s.`
								: `Costs ${FIRE_COST.map((c) => `${c.n}× ${TREES.find((t) => t.id === c.id)?.name}`).join(', ')}. Burns a minute.`}
						</span>
					</div>
					<button type="button" class="pud-boost" disabled={!canLight} onclick={lightFire}>
						{lit ? 'Burning' : 'Light the fire'}
					</button>
				</div>
			</div>
			{/if}

			<!-- THE COURIER — the ancestor's starship panel with its clock running: a named ship in
			     orbit, a transit window, and a supply drop that actually lands (see landDrop). Shown
			     in orbit: you're aboard, and the rush is the one verb you have out here. -->
			{#if ranger.deployment === 'orbit'}
			<div class="pud-place">
				<p class="pud-lead">Courier</p>
				<div class="pud-ship">
					<div class="pud-ship-id">
						<span class="pud-item-name">{SHIP.name}</span>
						<span class="pud-item-blurb">In orbit · {SHIP.where}</span>
					</div>
					<dl class="pud-ship-stat">
						<div>
							<dt>Next drop</dt>
							<dd>{dropIn > 0 ? `${dropIn}s` : 'overhead'}</dd>
						</div>
						<div>
							<dt>Priority</dt>
							<dd>{rushed ? 'Expedited' : 'Standard'}</dd>
						</div>
					</dl>
					<button
						type="button"
						class="pud-boost"
						disabled={!canRush}
						onclick={requestRush}
						title={rushed ? 'The window is already forward' : `Costs ${fmt(RUSH_COST)} shards`}
					>
						{rushed ? 'Expedited' : `Request priority · ${fmt(RUSH_COST)}`}
					</button>
				</div>
			</div>
			{/if}

			<!-- THE SHUTTLE — the way BETWEEN the places became a place of its own, and now a DOOR
			     rather than a switch. It stood in both deployments with a pair of pills that set the
			     backdrop in place; the segmented control is gone, replaced by one verb: Enter Shuttle.
			     Pressing it doesn't move you — it BOARDS you (see board()), clearing the dashboard and
			     sliding the cabin in, where the choice of destination actually lives. The card is a
			     plain door now, so no role=group, no aria-pressed pair to name — just a button.
			     Disabled mid-flight: you can't board a shuttle already in the air. It rides the
			     .pud-places boarding slide out with its siblings the instant it's pressed. -->
			<div class="pud-place">
				<p class="pud-lead">Shuttle</p>
				<div class="pud-shuttle">
					<div class="pud-ship-id">
						<span class="pud-item-name">Division shuttle</span>
						<span class="pud-item-blurb">Ferries the ranger between the surface and the Courier.</span>
					</div>
					<button type="button" class="pud-boost" disabled={ranger.transit !== null} onclick={board}>Enter Shuttle</button>
				</div>
			</div>
		</div>
		{/if}

		<!-- Requisitions live at Basecamp: buying and standing rigs down is a planetside job, and
		     its pause disc goes with it. In orbit the whole column lifts out — the rigs keep
		     running, the bar's global pause still reaches them, you just can't shop from up here.
		     BOARDING GATE — the shop sits in the dashboard's CENTRE, between the places and the
		     rail, so it doesn't pick a side: it recedes, the same shrink Forestry leaves by, a
		     touch after the columns start (delay 40) — the stage's exitBack/enterBack
		     (stage.svelte.ts). Inner deployment gate kept. -->

		{#if !ranger.aboard}
		{#if ranger.deployment === 'basecamp'}
		<div
			class="pud-shop"
			out:scale|global={stage.exitBack(40)}
			in:scale|global={stage.enterBack(100)}
		>
		<!-- The pause lives HERE, in the requisitions head, because the rigs are what it stops and
		     this is where the rigs are listed. The hand extractor never pauses, so it stays out of
		     the actions row above; and the panel bar carries the same switch (see the page's PUD
		     head-actions) for when the shop has scrolled away. Icon only — the state is the label. -->
		<div class="pud-shop-head">
			<p class="pud-lead">Division requisitions</p>
			<button
				type="button"
				class="pud-pauseall"
				class:on={ranger.paused}
				aria-pressed={ranger.paused}
				aria-label={ranger.paused ? 'Resume the works' : 'Pause the works'}
				title={ranger.paused ? 'Resume the works' : 'Pause the works'}
				onclick={togglePaused}
			>{@html ranger.paused ? PLAY_SVG : PAUSE_SVG}</button>
		</div>
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
							class:off={rigPaused[r.id] || ranger.paused}
							class:boosted={boosted && !rigPaused[r.id] && !ranger.paused}
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
		{/if}
		{/if}
		</div>

		<!-- WOODCUTTING — the active half. The rigs pay while you're away; this pays attention.
		     One stand at a time (see startChop): pressing the one that's running calls it off,
		     pressing another while one runs is refused. Planetside work: shown at Basecamp. A cut
		     in progress keeps cutting after you deploy — the axe swings on, you just don't watch.
		     BOARDING GATE — the forestry detail is the MIDDLE of the dashboard (a full-width band
		     under the two-column places/requisitions), so it doesn't slide off an edge; it scales
		     away and back, fading with scale's own opacity — the stage's exitBack/enterBack
		     (stage.svelte.ts), which holds the scale at 1 under reduced motion. It returns a touch
		     quicker than the shop (enterBack's 400), so the override is passed. Inner deployment
		     gate kept, its dead fly/fade dropped. -->
		{#if !ranger.aboard}
		{#if ranger.deployment === 'basecamp'}
		<div class="pud-wood" in:scale|global={stage.enterBack(100, 400)} out:scale|global={stage.exitBack(40)}>
			<p class="pud-lead">Forestry detail</p>
			{#each TREES as t (t.id)}
				{@const busy = chop?.id === t.id}
				<button
					type="button"
					class="pud-item pud-tree"
					class:busy
					disabled={!!chop && !busy}
					onclick={() => startChop(t)}
					aria-label={busy ? `Stop cutting ${t.name}` : `Cut ${t.name}`}
				>
					{#if busy}
						<!-- The cut itself, drawn once and left to the compositor: the bar's duration IS
						     the action's duration, so nothing has to tick it. No {#key} needed — the
						     block unmounts when the cut ends, so the next one gets a fresh node and the
						     animation starts from zero on its own. -->
						<span class="pud-tree-fill" style:--chop-ms="{t.ms}ms" aria-hidden="true"></span>
					{/if}
					<span class="pud-tree-copy">
						<span class="pud-item-name">
							{t.name}
							{#if (stores[t.id] ?? 0) > 0}<span class="pud-owned">×{fmt(stores[t.id])}</span>{/if}
						</span>
						<span class="pud-item-blurb">{t.blurb}</span>
					</span>
					<span class="pud-tree-time">{busy ? 'cutting…' : `${(t.ms / 1000).toFixed(1)}s`}</span>
				</button>
			{/each}
		</div>
		{/if}
		{/if}
	</div>

	<!-- The SIDE column: what the division has to show for itself. Wrapped, like .pud-main, so
	     the two-column grid stays exactly two cells — assigning both cards to column 2 and
	     letting auto-flow find rows for them is how the last layout ended up paying row-gap on
	     99 empty rows.
	     BOARDING GATE — on the WRAPPER, not the sections. The per-section gates sat above inner
	     conditionals (log.length, the deployment), and their transitions went quietly missing on
	     the swap; the places column never misbehaved because its transition sits on a bare
	     element directly inside its own gate. Same shape here now: the whole rail leaves by the
	     RIGHT door as one piece, ledger and stores riding together — the stage's
	     exitRight/enterRight (stage.svelte.ts). -->
	{#if !ranger.aboard}
	<div
		class="pud-side"
		out:fly={stage.exitRight(40)}
		in:fly={stage.enterRight(100)}
	>
		<!-- THE LEDGER — the division's log, newest first (see `note`). It replaced a single
		     line that only held the last thing that happened; an idle game is a thing you look
		     away from, and one sentence can't tell you what you missed.
		     Each row keeps its own entrance: `animate:flip` slides the standing rows down as a
		     new one lands, and the newest wears the arrival keyframe (accent, cooling to the
		     note's ink) that the single line used to. aria-live on the list is what the old
		     role="status" was doing — additions get announced, the history doesn't.
		     (Boarding is the WRAPPER's job now — see .pud-side above; the per-section gate's
		     transitions went missing above inner conditionals, so the rail travels whole.) -->
		{#if log.length}
		<section class="pud-ledger" aria-label="Division ledger">
			<p class="pud-lead">Division ledger</p>
			<div class="pud-ledger-card">
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
			</div>
		</section>
		{/if}

		<!-- THE STORES — what the forestry detail has actually brought in. Only what you HAVE is
		     listed: an inventory of zeroes is a list of things you haven't done, and the stands
		     above already say what's out there to cut. Shelved at Basecamp: it's the planetside
		     stores, so it travels with the camp. Crates keep landing while you're in orbit (the
		     courier's drops don't wait on your eyes) — you'll find them here on your return.
		     (Boarding is the WRAPPER's job now — see .pud-side above.) -->
		{#if ranger.deployment === 'basecamp'}
		<section class="pud-inv" aria-label="Division stores">
			<p class="pud-lead">Division stores</p>
			<div class="pud-inv-card">
				{#if held.length}
					<ul class="pud-inv-list">
						{#each held as h (h.id)}
							<li class="pud-inv-row">
								<span class="pud-inv-name">{h.name}</span>
								<span class="pud-inv-count">{fmt(h.count)}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="pud-inv-empty">Nothing in the stores. The forestry detail is idle.</p>
				{/if}
			</div>
		</section>
		{/if}
	</div>
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
	/* The two columns carry their own stacks, so .pud is left holding exactly two children. */
	.pud-side {
		display: flex;
		flex-direction: column;
		gap: 1.05rem;
		min-width: 0;
	}
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
		.pud-side {
			grid-column: 2;
			align-self: start;
		}
		/* The frame sits on the CARD, not the section: the lead names the panel from its own
		   edge, the way the shop's and the places' leads do, and the card below holds the list. */
		.pud-ledger-card,
		.pud-inv-card {
			padding: 0.9rem 1rem;
			border: 1px solid var(--line-edge);
			border-radius: 14px;
			background: var(--aero-face);
			/* A SECTION card, so it earns true glass — face, rim light, air, AND the backdrop
			   blur. The four big cards are few enough to afford it (settings-card values); the
			   rows can't (see .pud-item). */
			box-shadow: var(--aero-gloss), var(--aero-drop);
			-webkit-backdrop-filter: blur(6px) saturate(1.3);
			backdrop-filter: blur(6px) saturate(1.3);
			/* Recolour beat, same as the camp and courier (see .pud-item). */
			transition: background-color 0.45s ease, color 0.45s ease, border-color 0.45s ease;
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
		.pud-side > * {
			animation: pud-settle 0.45s ease backwards;
		}
		/* …but only on the panel's ARRIVAL. The settle is an entrance flourish, and it re-fired
		   on every boarding remount for the sections that are DIRECT children here (the actions
		   row, the forestry detail) — its backwards-filled, nth-child-delayed keyframes held
		   them off their mark and dropped them a step AFTER the boarding slide had already
		   landed them. Once the shuttle's been used (stage.used raises .reboarded — see
		   stage.svelte.ts), remounts belong to the boarding choreography alone. */
		.pud.reboarded .pud-main > *,
		.pud.reboarded .pud-side > * {
			animation: none;
		}
		/* …but NOT the settings card. It's a child of .pud, so it was picking this up on top of
		   its own popSpring and playing two entrances at once — springing out of the gear while
		   also settling down from above. This one is a popout, not part of the page's arrival:
		   it comes and goes on a press, long after the panel has landed. */
		.pud > .pud-settings {
			animation: none;
		}
		/* …and NOT the cabin. It's a .pud-main child, so it caught pud-settle on TOP of its own
		   in:fly — the same double-entrance the settings card had, a -6px settle fighting the 28px
		   arrival. The cabin comes and goes on a board/disembark, long after the panel landed; its
		   fly is its whole entrance. */
		.pud-main > .pud-cabin-sec {
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


	/* VIEW-TRANSITION NAMES — the dashboard's moving parts, one name each. When a deployment swaps
	   sections (see setDeployment), the browser FLIP-morphs every named box from its old place to
	   its new one, so the survivors glide while the leavers fade. Only the SECTIONS are named, and
	   each name is unique (a duplicate silently kills the whole transition — these are all
	   singletons, so that holds): the sections travel as whole UNITS. Nothing inside them is named
	   — a name per row or pill would blow the snapshot count up into the dozens over a live scene
	   for no gain, since a section and its contents move together anyway. The settings card is left
	   out on purpose: it's absolutely positioned, a popout, and has no business morphing. */
	.pud-count {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		view-transition-name: pud-count;
	}
	.pud-gem :global(svg) {
		width: 44px;
		height: 44px;
		display: block;
	}
	/* The shard is cut as OPALITE now — reicon's gem-sparkle geometry, painted from the
	   gradient baked into GEM_OPAL_SVG rather than the accent. The stones are tuned HERE,
	   not in the icon: the stops carry classes for exactly this, so theming stays in CSS
	   the way currentColor keeps it for every other glyph. Light theme wears milky
	   pastels; dark lifts the same run a little so the gem reads lit, not dusty. */
	.pud-gem :global(.op1) {
		stop-color: light-dark(#a8cbe8, #7fa8d9);
	}
	.pud-gem :global(.op2) {
		stop-color: light-dark(#c9b5e4, #a08ed6);
	}
	.pud-gem :global(.op3) {
		stop-color: light-dark(#eab8d4, #d290bb);
	}
	.pud-gem :global(.op4) {
		stop-color: light-dark(#a8d9c3, #7fc4a6);
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
		/* Rides the recolour beat too — the tally ink flips with the scheme (see the fallback note
		   on .pud-item); only its colour changes, so that's all it transitions. */
		transition: color 0.45s ease;
	}

	/* The works' heartbeat: a soft accent band with a sweep crossing it while the rigs
	   run — indeterminate on purpose (extraction has no end to progress toward). Twice
	   the pace under overclock. Reduced motion keeps the band, stills the sweep. */
	.pud-mining {
		position: relative;
		height: 6px;
		border-radius: 999px;
		/* AEROPALITE, not the flat accent wash: the trough drinks the panel's shared --opalite
		   (the page defines it for the ranger's chrome — the same stone as the shard, the
		   cards, the bar's pill), so the heartbeat stops being a plain orange stripe and joins
		   the material. Accent stays as the fallback for any context outside the panel. */
		background: color-mix(in srgb, var(--opalite, var(--accent, #f06030)) 20%, transparent);
		/* …and the family's LIGHT, scaled to a 6px capsule: the hairline edge is most of what
		   "aero" means at this size, and the gloss's top rim + glow read as a sheen along the
		   trough. Without them the pour was the right colour lying flat. */
		border: 1px solid var(--line-edge);
		box-shadow: var(--aero-gloss), var(--aero-drop);
		overflow: hidden;
		view-transition-name: pud-mining;
		/* Running ↔ paused is a state change worth SEEING happen: the band warms from accent to
		   yellow and back rather than cutting between them. */
		transition: background-color 0.45s ease;
	}
	.pud-mining-sweep {
		position: absolute;
		inset: 0;
		width: 40%;
		border-radius: 999px;
		/* The travelling peak IS the opal now — the gem's three stops crossing the band in
		   order (iced blue, lilac, pink), day arms by day and night arms by night, so the
		   sweep reads as the shard's glint running the trough rather than a hot accent line.
		   Paused overrides below still swap the whole thing to the idle yellow — a STATE has
		   to outrank a material. */
		background: linear-gradient(
			90deg,
			transparent 0%,
			light-dark(#a8cbe8, #7fa8d9) 28%,
			light-dark(#c9b5e4, #a08ed6) 46%,
			/* the GLINT — a near-white hairline riding the peak's centre, the shard's own
			   sparkle crossing the band; narrow on purpose (46→50→54) so it reads as a catch
			   of light, not a white stripe */
			light-dark(#ffffff, #e8f0ff) 50%,
			light-dark(#c9b5e4, #a08ed6) 54%,
			light-dark(#eab8d4, #d290bb) 72%,
			transparent 100%
		);
		/* The travelling peak spreads into a full-width line as the works stop, and gathers back
		   into a peak as they start. Transform is left out on purpose — the sweep animation owns
		   it while running, and transitioning a property an animation is driving fights it. */
		transition: opacity 0.45s ease, width 0.45s ease;
	}
	@media (prefers-reduced-motion: no-preference) {
		.pud-mining-sweep {
			animation: pud-sweep 1.9s linear infinite;
		}
		.pud-mining.boosted .pud-mining-sweep {
			animation-duration: 0.85s;
		}
		/* Only the pulse — the travel isn't paused here, it's not running at all. */
		.pud-mining.paused .pud-mining-sweep {
			animation: pud-idle-pulse 2.8s ease-in-out infinite;
		}
	}
	/* Slow, and never all the way out — a line that vanished would read as nothing there. */
	@keyframes pud-idle-pulse {
		0%,
		100% {
			opacity: 0.28;
		}
		50% {
			opacity: 0.85;
		}
	}
	/* Paused, the works go YELLOW and breathe. The band and its sweep keep their shape — same
	   faded field, same bright peak where the sweep stood when it stopped — but the accent gives
	   way to the masthead's own yellow (#e6b93c, the first of the brand dots) and the whole line
	   pulses slowly. Downtime should look like held breath rather than absence, and a colour
	   that isn't the running colour says "stopped" from across the panel, where a dimmed orange
	   just looked like a quiet moment.
	   The sweep's TRAVEL stays paused while the pulse runs — two animations on one element with
	   their own play states, so the peak holds its position and only the light moves. */
	.pud-mining.paused {
		background: color-mix(in srgb, var(--pud-idle, #e6b93c) 14%, transparent);
	}
	/* COLOUR only in here. The play states live with the animations in the motion block below —
	   a single `animation-play-state: paused` at this level outranked the two-value one there
	   and stopped the pulse along with the travel, which is how this first shipped: a yellow
	   line that didn't breathe. With a motion preference set nothing animates anyway, so the
	   resting opacity has to be legible on its own. */
	.pud-mining.paused .pud-mining-sweep {
		background: linear-gradient(90deg, transparent, var(--pud-idle, #e6b93c), transparent);
		/* FULL WIDTH, and no travel. Holding the travel animation paused was the first attempt
		   and it had a hole in it: the peak stops wherever it happened to be, and on a fresh
		   mount it has never moved — so it sat at the keyframe's start, translateX(-100%),
		   outside a band that clips its overflow. Reload while paused and the line was simply
		   gone. Spanning the band needs no travel to have happened, so it reads the same whether
		   you paused a moment ago or a week ago, and the gradient still gives the faded ends and
		   the bright middle. */
		width: 100%;
		transform: none;
		opacity: 0.55;
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
		view-transition-name: pud-actions;
	}
	/* (.pud-deploy retired with the segmented place-pills. Deployment is a door you board now,
	   not a two-capsule toggle on the shuttle card — the single Enter Shuttle button wears the
	   plain .pud-boost, and the choice of destination moved inside the cabin.) */
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
		/* Aero pill: rim light + air. No blur — see .pud-item. */
		box-shadow: var(--aero-gloss), var(--aero-drop);
		transition: border-color 0.15s ease, background 0.15s ease;
	}
	.pud-boost:hover:not(:disabled) {
		border-color: var(--line-strong);
	}
	.pud-boost:disabled {
		opacity: 0.55;
		cursor: default;
	}
	/* Lit, the pill fills with INK, and puhig's selected state (--aero-lit stays unworn; the
	   app says "on" with the fill) never wears the gloss — a top-glow rim light over a dark
	   fill reads as a smudge, not glass. So the on state drops the shadow entirely. */
	.pud-boost.on {
		color: var(--paper);
		background: var(--ink);
		border-color: var(--ink);
		box-shadow: none;
	}

	/* No top rule. It divided the shop from the actions row above it back when the shop was the
	   next thing down the page; the shop is a COLUMN in a band now, sitting beside Basecamp and
	   the Courier with nothing above it to be divided from — the rule was drawing a line under
	   empty space, and only on one of the two columns. */
	.pud-shop {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		view-transition-name: pud-shop;
	}
	.pud-lead {
		margin: 0 0 0.2rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--sub);
	}
	/* The requisitions head is a ROW now: the lead on the left, the pause-the-works disc on the
	   right. The lead keeps its own bottom margin (it sets the gap to the first row); the row
	   just lays the two out and pulls them to opposite ends. */
	.pud-shop-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	/* The wholesale pause, as a compact disc in the same aero material as .pud-boost — clear
	   face, line-edge ring, ink glyph — sized down to a 28px icon button so it reads as a
	   control ON the header rather than another requisition. Paused, only the GLYPH changes —
	   same glass both ways (see the note below). The lead's own bottom margin would push the
	   disc down with it, so the disc shrugs it off to stay centred. */
	.pud-pauseall {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		flex: none;
		width: 28px;
		height: 28px;
		margin-bottom: 0.2rem;
		padding: 0;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1.5px solid var(--line-edge);
		border-radius: 999px;
		cursor: pointer;
		/* Same aero disc as .pud-boost — gloss + air, no blur. No transition here: the disc is
		   enrolled in the page's universal button spring (the html:root roster, which outranks
		   component rules by design), so its press thock, hover pop and colour eases all come
		   from there — a local list would be dead CSS pretending to run. */
		box-shadow: var(--aero-gloss), var(--aero-drop);
	}
	.pud-pauseall:hover {
		border-color: var(--line-strong);
	}
	/* Paused, the disc STAYS AERO and stays QUIET — an ink fill made the play glyph the
	   panel's one flat control, and an amber face shouted a state the glyph swap and the
	   yellowed mining band beside it already tell. Same glass both ways; the icon is the
	   message. */
	.pud-pauseall :global(svg) {
		width: 16px;
		height: 16px;
		display: block;
	}
	/* A requisition row: the app cards' shape, holding two jobs — the switch (left, the
	   whole body) and the buy (right, the cost chip). The frame is the row's; each half
	   lights on its own hover. */
	/* Over scenery the cards stopped being drawn ON anything — the paper page that used to sit
	   under them is gone — so they wear the bubble material proper: face, rim light, air. A ROW
	   takes the cheap half only, gloss + drop and no backdrop-filter. Real glass (the blur) is
	   reserved for the four big section cards; a blur region on every row and pill — a dozen of
	   them over the live WebGL orbit scene, which never stops recompositing — is the one
	   expensive version of this. The rows stay cheap because there are so many of them.
	   (.pud-tree wears .pud-item, so a forestry stand inherits this same cheap gloss.) */
	.pud-item {
		display: flex;
		align-items: stretch;
		gap: 0.6rem;
		padding: 0.55rem 0.6rem 0.55rem 0.9rem;
		color: var(--ink);
		background: var(--aero-face);
		border: 1px solid var(--line-edge);
		border-radius: 12px;
		box-shadow: var(--aero-gloss), var(--aero-drop);
		/* A deployment RECOLOURS the whole chrome — in orbit the panel flips to the ship's night
		   world (see +page's .orbit re-theme), and every card's face, ink and edge change with it.
		   The controls ease that change on the same 0.45s the mining band already speaks, so the
		   swap reads as the LIGHT changing, not the UI being replaced. On browsers that drive the
		   swap with a View Transition the morph crossfade carries the recolour instead and these
		   never run; they're the glide for the fallback path (and for a plain theme toggle). */
		transition: background-color 0.45s ease, color 0.45s ease, border-color 0.45s ease;
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
		/* The cost chip wears the same face value as --aero-face (5% ink), so it joins the aero
		   family too — gloss + air, no blur. Its hover/disabled states touch background and
		   opacity, never box-shadow, so the rim light rides through every state. */
		box-shadow: var(--aero-gloss), var(--aero-drop);
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

	/* ── The requisitions/courier band ───────────────────────────────────────────
	   Two columns once there's room, and the requisitions take the greater share: their rows
	   carry a name, a blurb AND a cost chip, where the courier is a short status block. Below
	   the app's seam it's one column again, courier under shop, like everything else here. */
	.pud-cols {
		display: flex;
		flex-direction: column;
		gap: 1.05rem;
		min-width: 0;
	}
	/* Basecamp and the Courier are the two PLACES, but only one stands here at a time now —
	   where you are is what you see. The column holds whichever the deployment shows; it kept
	   the flex stack from when both sat together, and it costs nothing with a single child. */
	.pud-places {
		display: flex;
		flex-direction: column;
		gap: 1.05rem;
		min-width: 0;
		/* The real mover of the band: when the requisitions and forestry cells leave, this column
		   slides from its two-column slot to the single capped one — so it's named, not .pud-cols. */
		view-transition-name: pud-places;
	}
	/* Each place is header-then-card, the way the shop and the forestry detail read: the
	   label names the section from its edge, and the card below it is the place itself. */
	.pud-place {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		min-width: 0;
	}
	@media (min-width: 961px) {
		.pud-cols {
			display: grid;
			/* Places first, requisitions beside them and wider: the shop's rows carry a name, a
			   blurb AND a cost chip, where a place is a short status block with one button. */
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
			gap: 1.05rem;
			align-items: start;
		}
		/* In orbit the requisitions cell is gone and only the courier stands in the places
		   column — the two-column grid would leave it half-width beside an empty 1.5fr void.
		   Drop to a single column and cap it: one card alone shouldn't wear the whole band's
		   width, so the courier reads as a modest card, not a full-bleed slab. */
		.pud-cols.orbit {
			grid-template-columns: minmax(0, 1fr);
			max-width: 28rem;
		}
	}
	/* The camp wears the courier's card, because it's the same kind of thing: a place, its
	   state, and the one thing you can do there. */
	.pud-camp {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 0.9rem 1rem 1rem;
		border: 1px solid var(--line-edge);
		border-radius: 12px;
		background: var(--aero-face);
		/* A section card: true glass, like the ledger and stores. The .lit state only swaps the
		   border to accent — the face keeps its rim light and blur. */
		box-shadow: var(--aero-gloss), var(--aero-drop);
		-webkit-backdrop-filter: blur(6px) saturate(1.3);
		backdrop-filter: blur(6px) saturate(1.3);
		/* Keep the .lit border on its own 0.2s beat; add the face and ink to the recolour beat. */
		transition: border-color 0.2s ease, background-color 0.45s ease, color 0.45s ease;
	}
	/* Lit, the camp says so in its edge — the fire is a state you should be able to see from
	   across the panel, not something you have to read. */
	.pud-camp.lit {
		border-color: var(--accent, #f06030);
	}
	.pud-camp .pud-boost {
		align-self: flex-start;
	}
	/* The courier: a status block, framed like the cards in the side column so it reads as a
	   panel rather than a stray list, with its figures on their own line. */
	.pud-ship {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 0.9rem 1rem 1rem;
		border: 1px solid var(--line-edge);
		border-radius: 12px;
		background: var(--aero-face);
		/* A section card: true glass, same as the camp it stands in for. */
		box-shadow: var(--aero-gloss), var(--aero-drop);
		-webkit-backdrop-filter: blur(6px) saturate(1.3);
		backdrop-filter: blur(6px) saturate(1.3);
		/* Recolour beat, same as the camp. */
		transition: background-color 0.45s ease, color 0.45s ease, border-color 0.45s ease;
	}
	.pud-ship-id {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.pud-ship-stat {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.4rem;
		margin: 0;
	}
	.pud-ship-stat div {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.pud-ship-stat dt {
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: color-mix(in srgb, var(--ink) 45%, transparent);
	}
	.pud-ship-stat dd {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}
	/* The freight button is a .pud-boost — same clear pill as Overclock and Pause, because it's
	   the same kind of thing: an occasional spend, not the button you live on. */
	.pud-ship .pud-boost {
		align-self: flex-start;
	}
	/* The shuttle wears the courier's card too — it's the same kind of thing, a place with its
	   identity and the one control it holds. Mirrors .pud-ship exactly (it has no .lit state of
	   its own, so there's nothing to add): same glass, same recolour beat. The CABIN wears the
	   very same recipe — it IS the shuttle, seen from inside — so it's grouped here rather than
	   copied, one place to tune the whole ride. */
	.pud-shuttle,
	.pud-cabin {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 0.9rem 1rem 1rem;
		border: 1px solid var(--line-edge);
		border-radius: 12px;
		background: var(--aero-face);
		/* A section card: true glass, same as the camp and courier it stands beside. */
		box-shadow: var(--aero-gloss), var(--aero-drop);
		-webkit-backdrop-filter: blur(6px) saturate(1.3);
		backdrop-filter: blur(6px) saturate(1.3);
		/* Recolour beat, same as the camp and courier. */
		transition: background-color 0.45s ease, color 0.45s ease, border-color 0.45s ease;
	}
	/* The shuttle card's one control (Enter Shuttle) sits left, like the camp's and courier's
	   buttons — it was a .pud-deploy inline row before the pills retired to one door. */
	.pud-shuttle .pud-boost {
		align-self: flex-start;
	}
	/* THE CABIN section stands in .pud-main, full-width like the actions row — but a lone card
	   shouldn't wear the whole panel's width, so it's capped the way the orbit band caps the
	   courier standing alone (max-width: 28rem). The lead + card stack is .pud-place's, shared. */
	.pud-cabin-sec {
		max-width: 28rem;
	}
	/* The cabin's controls sit in a row and wrap if the panel's narrow — the destination first
	   (the reason you boarded), Disembark beside it. */
	.pud-cabin-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	/* ── Woodcutting ─────────────────────────────────────────────────────────────
	   The stands read as the requisition rows do — a name, a blurb, and a figure at the right —
	   because they ARE the same kind of thing: a row you press. What's different is that this
	   one takes time, so the row itself is the progress bar. */
	.pud-wood {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		view-transition-name: pud-wood;
	}
	/* A stand IS a requisition row — it wears .pud-item for the card itself (face, border,
	   radius, padding) so the two lists read as one kind of thing, which they are: a row you
	   press. What's left here is only what a requisition row doesn't need — it's a <button>,
	   it clips a progress fill, and it can be busy or waiting its turn. */
	.pud-tree {
		position: relative;
		overflow: hidden; /* the fill is clipped to the card's own corners */
		align-items: center;
		width: 100%;
		text-align: left;
		font: inherit;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
	}
	.pud-tree:hover:not(:disabled) {
		border-color: var(--line-strong);
	}
	/* Another stand is being cut: this one isn't refusing you, it's waiting its turn. */
	.pud-tree:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.pud-tree.busy {
		border-color: var(--accent, #f06030);
	}
	/* The blurb is dimmed ink, which is fine on the card's own face and weak once the accent
	   sweeps under it. While a cut runs it comes up to full ink — legible on both halves of the
	   row, since the fill passes across rather than covering it all at once. */
	.pud-tree.busy .pud-item-blurb {
		color: var(--ink);
	}
	.pud-tree-copy {
		position: relative;
		z-index: 1; /* above the fill, so the sweep passes behind the words */
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		flex: 1;
	}
	.pud-tree-time {
		position: relative;
		z-index: 1;
		flex: none;
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		color: color-mix(in srgb, var(--ink) 45%, transparent);
	}
	/* THE CUT. One animation, running for exactly the action's duration — the award lands on a
	   timer of the same length, so the bar reaching the end and the log line appearing are the
	   same moment. Linear, because this one IS reporting progress through a wait: an eased bar
	   would lie about how much is left. */
	.pud-tree-fill {
		position: absolute;
		inset: 0;
		z-index: 0;
		transform-origin: left center;
		transform: scaleX(0);
		/* The SAME indicator Extract floods with — solid accent, not a tint, so a cut and a pull
		   read as the same material doing the same job at different speeds. Its opacity is
		   static here and the animation drives only the transform: Extract's flash fades out
		   because it's over in 240ms, but a cut is a wait you watch, and a bar that dimmed as it
		   filled would be reporting the opposite of what's happening. */
		opacity: 0.9;
		background: var(--accent, #f06030);
		pointer-events: none;
	}
	/* …aeroified with it. Same reasoning as the pull: the card wears the family's gloss, and once
	   the fill covers the card it covers that gloss, so the fill carries its own inset rim light
	   and the material holds all the way across. */
	:global(html[data-ui='bubble']) .pud-tree-fill {
		box-shadow: var(--aero-gloss);
	}
	@media (prefers-reduced-motion: no-preference) {
		.pud-tree-fill {
			animation: pud-chop var(--chop-ms, 3s) linear forwards;
		}
	}
	/* With a motion preference set the bar doesn't sweep, so the row says it another way: the
	   whole stand tints for as long as the cut runs. Something has to mark the wait. */
	@media (prefers-reduced-motion: reduce) {
		.pud-tree.busy {
			background: color-mix(in srgb, var(--accent, #f06030) 16%, transparent);
		}
	}
	@keyframes pud-chop {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}

	/* ── The stores ──────────────────────────────────────────────────────────────
	   A short tally under the ledger: what the forestry detail has brought in, in the order the
	   stands are listed. Quiet by design — the ledger beside it is the thing with news. */
	.pud-inv {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		view-transition-name: pud-inv;
	}
	.pud-inv-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.pud-inv-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.3rem 0;
		font-size: 0.85rem;
	}
	.pud-inv-row + .pud-inv-row {
		border-top: 1px solid transparent;
		border-image: var(--rule-fade) 1;
	}
	.pud-inv-name {
		color: var(--ink);
	}
	.pud-inv-count {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		color: var(--accent, #f06030);
	}
	.pud-inv-empty {
		margin: 0;
		font-size: 0.8rem;
		font-style: italic;
		color: color-mix(in srgb, var(--ink) 45%, transparent);
	}

	/* ── The ledger ──────────────────────────────────────────────────────────────
	   A quiet list, not a feed: small type, one line a row, the time right-aligned so the
	   messages keep a clean left edge to scan down. It caps its own height and scrolls, so a
	   full twenty entries can't push the foot off the panel. */
	.pud-ledger {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		view-transition-name: pud-ledger;
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

	/* The rows, the buy chips, and the boosts used to join the aero family only under
	   data-ui='bubble', with a backdrop-blur each. That's the expensive version — a dozen blur
	   regions over the live orbit scene — and it's now moved to the base rules WITHOUT the blur
	   (gloss + air only): those surfaces float over scenery in every ui mode, so the material is
	   no longer bubble's alone. What's left bubble-only is the extract pill's gloss and its
	   flood — the one control that keeps its own bubble flourish. */
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

	/* HOUSE CADENCE for the morph. A view-transition group animates for ~0.25s by default; the
	   panel speaks 0.45s, so every named section morphs on that same beat — the swap reads as one
	   motion, not a fast crossfade under a slow everything-else. These pseudo-elements are
	   document-level (they live outside any component's scope), so :global, and each is pinned by
	   NAME rather than a universal ::view-transition-group so no other app's transitions are
	   touched. setDeployment already skips the transition under reduced motion, but the media guard
	   makes that belt-and-braces. */
	@media (prefers-reduced-motion: no-preference) {
		:global(::view-transition-group(pud-count)),
		:global(::view-transition-group(pud-mining)),
		:global(::view-transition-group(pud-actions)),
		:global(::view-transition-group(pud-places)),
		:global(::view-transition-group(pud-shop)),
		:global(::view-transition-group(pud-wood)),
		:global(::view-transition-group(pud-ledger)),
		:global(::view-transition-group(pud-inv)) {
			animation-duration: 0.45s;
			animation-timing-function: ease;
		}
	}
</style>
