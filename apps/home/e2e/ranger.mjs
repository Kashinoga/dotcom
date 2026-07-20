import { firefox } from 'playwright';
const B = process.env.BASE || 'http://localhost:5199';

// The Intergalactic Park Ranger's LOCATION / SHUTTLE system — the whole boarding-and-crossing
// choreography that shipped this session. It lives across four hands that can only agree through a
// runes module (location-state.svelte.ts): PudIdle draws the dashboard and the cabin, the page
// paints the scenery, the stage (stage.svelte.ts) hands each section its door, and the module holds
// the bits none of them own. Nothing here type-checks into an answer — every check below is a
// user-visible state a bug this session put on screen, so the suite drives the real DOM and reads
// what a person would see.
//
// TIMING. The choreography is a stack of clocks, and this suite hardcodes the two that gate what's
// on stage — copied from the source, NOT imported, deliberately: a retune that moves them should
// trip a failing suite here rather than slip by, because the whole handoff is built on their exact
// values. Every timed assertion samples a WINDOW well inside a phase, never a single frame, so a
// slow machine that lands a beat late still reads the right state.
const EXIT_END_MS = 460; // stage.svelte.ts — every dashboard section's exit lands here
const BOARD_CLEAR_MS = 560; // location-state.svelte.ts — EXIT_END_MS(460)+100; the cabin mounts here
const TRANSIT_TOTAL_MS = 2750; // location-state.svelte.ts — ASCEND: COVER350+HOLD150+REVEAL450+FLIGHT1800
const DESCEND_TOTAL_MS = 1200; // location-state.svelte.ts — descent's flight flies UNDER the cover: COVER350+HOLD150+REVEAL450+250

const PUD = '/apps/intergalactic-park-ranger';

const res = [];
const ok = (n, p, d = '') => { res.push(p); console.log(`  ${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

// Wait out every FINITE animation, then a settle beat. The forest's drift (240s/150s) and the sky
// are Infinity iterations — awaiting those would never return, so they're excluded. Copied from
// buttons.mjs's settle: the boarding exits/entrances are finite, and measuring one mid-flight reads
// a section still leaving as though it were gone.
const settle = async (p) => {
	await p.evaluate(() =>
		Promise.all(
			document.getAnimations()
				.filter((a) => a.effect?.getTiming().iterations !== Infinity)
				.map((a) => a.finished.catch(() => {}))
		)
	);
	await p.waitForTimeout(150);
};

// The seed a populated dashboard needs: rigs owned so the mining band and Overclock are live (baseCps
// > 0), shards to spare, and ONE ledger row so the rail is present to travel with the ranger. Same
// ksh-pud shape buttons.mjs seeds; the `log` field rides along so `.pud-ledger` (gated on log.length)
// is on stage in both deployments.
const seed = () => localStorage.setItem('ksh-pud', JSON.stringify({
	v: 1, shards: 1e7, lifetime: 1e7, clickLevel: 3, owned: { probe: 2, relay: 1 },
	boostUntil: 0, boostReadyAt: 0, paused: false, rigPaused: {},
	stores: {}, dropAt: 0, rushed: false, fireUntil: 0,
	log: [{ id: 1, kind: 'rig', message: 'Division seeded for the suite.', at: Date.now() }],
	savedAt: Date.now()
}));

// Count the VISIBLE leads reading exactly "Shuttle". This is the spine of the whole suite: the
// dashboard's Shuttle place-card and the cabin BOTH lead with the word, and the double-reveal bug
// (two at once) and the mid-crossing bug (one riding through the wash) were both "the wrong number
// of Shuttle leads on stage". getClientRects() drops an unmounted or hidden node, so an element
// still finishing its out-transition doesn't get counted once we've settled past it.
const shuttleLeads = (p) => p.evaluate(() =>
	[...document.querySelectorAll('.pud-lead')]
		.filter((e) => e.textContent.trim() === 'Shuttle' && e.getClientRects().length > 0).length);
const hasLead = (p, text) => p.evaluate((t) =>
	[...document.querySelectorAll('.pud-lead')]
		.some((e) => e.textContent.trim() === t && e.getClientRects().length > 0), text);
const count = (p, sel) => p.locator(sel).count();

const browser = await firefox.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
const page = await ctx.newPage();

// Seed once — localStorage is per-origin and survives every navigation below (full loads and SPA
// pushes alike). Sky off + light theme is the other suites' baseline: it keeps the scan off the
// endless star field and pins light-dark() so a colour read is decidable.
await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
	localStorage.setItem('ksh-sky', 'off');
	localStorage.setItem('ksh-theme', 'light');
	localStorage.setItem('ksh-ui', 'flat');
});
await page.evaluate(seed);

const openPud = async () => {
	await page.goto(B + PUD, { waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	await settle(page);
};

// ── A. Fresh open, planetside ────────────────────────────────────────────────────────────────
// The ground state: exactly one Shuttle place-card, the Basecamp furniture all present, the Courier
// nowhere (it's orbit-only), the forest painted behind the glass, and no cabin — you haven't boarded.
console.log('\n===== A · fresh open, planetside =====');
await openPud();
ok('planetside: exactly one Shuttle lead', (await shuttleLeads(page)) === 1, String(await shuttleLeads(page)));
ok('planetside: Basecamp place present', await hasLead(page, 'Basecamp'));
ok('planetside: requisitions (.pud-shop) present', (await count(page, '.pud-shop')) === 1);
ok('planetside: forestry (.pud-wood) present', (await count(page, '.pud-wood')) === 1);
ok('planetside: stores (.pud-inv) present', (await count(page, '.pud-inv')) === 1);
ok('planetside: NO Courier place', !(await hasLead(page, 'Courier')));
ok('planetside: forest scenery painted behind the glass', (await count(page, '.locale-scenes .forest')) === 1);
ok('planetside: no cabin on stage', (await count(page, 'section[aria-label="Shuttle cabin"]')) === 0);

// ── B. Enter Shuttle → the cabin ─────────────────────────────────────────────────────────────
// Boarding clears the WHOLE dashboard (the card you just pressed included) and slides the cabin in
// on the handoff clock. After it settles: the sections are gone, the cabin holds its two controls,
// focus has landed on the destination button (a keyboard user would otherwise be dropped on <body>),
// and the only Shuttle lead left is the cabin's own.
console.log('\n===== B · board the shuttle =====');
await page.getByRole('button', { name: 'Enter Shuttle' }).click();
await page.waitForTimeout(BOARD_CLEAR_MS + 250); // cabin mounts at BOARD_CLEAR_MS; give it a beat
await settle(page);
ok('boarded: cabin section is on stage', (await count(page, 'section[aria-label="Shuttle cabin"]')) === 1);
ok('boarded: dashboard sections gone (actions/shop/places/side)',
	(await count(page, '.pud-actions')) === 0 && (await count(page, '.pud-shop')) === 0 &&
	(await count(page, '.pud-places')) === 0 && (await count(page, '.pud-side')) === 0);
ok('boarded: cabin carries the destination control', (await page.getByRole('button', { name: 'Enter Orbit' }).count()) === 1);
ok('boarded: cabin carries Disembark', (await page.getByRole('button', { name: 'Disembark' }).count()) === 1);
ok('boarded: focus lands on the destination button',
	(await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Enter Orbit',
	await page.evaluate(() => document.activeElement?.textContent?.trim() ?? 'none'));
ok('boarded: exactly one Shuttle lead (the cabin\'s)', (await shuttleLeads(page)) === 1, String(await shuttleLeads(page)));

// ── C. Disembark → back to the dashboard ─────────────────────────────────────────────────────
// Backing out before you commit: the cabin leaves first, the dashboard returns behind it, and the
// Shuttle place-card is the one lead again.
console.log('\n===== C · disembark =====');
await page.getByRole('button', { name: 'Disembark' }).click();
await page.waitForTimeout(EXIT_END_MS + 500);
await settle(page);
ok('disembarked: dashboard is back (.pud-shop present)', (await count(page, '.pud-shop')) === 1);
ok('disembarked: Basecamp place present', await hasLead(page, 'Basecamp'));
ok('disembarked: exactly one Shuttle lead', (await shuttleLeads(page)) === 1, String(await shuttleLeads(page)));
ok('disembarked: no cabin left behind', (await count(page, 'section[aria-label="Shuttle cabin"]')) === 0);

// ── D. Board → Enter Orbit → the crossing → arrival in orbit ─────────────────────────────────
// The cinematic path. Committing DROPS the cabin at once and mounts the wipe; the world is swapped
// unseen under the wash; the camera flies; arrival at TRANSIT_TOTAL_MS opens the hatch onto the
// destination's deck. The bug this regression-tests: during the whole crossing NO Shuttle lead may
// be on stage — not the vacated place-card, not a cabin riding along. We sample two points well
// inside the flight and demand zero. The wipe overlay is checked while it plays.
console.log('\n===== D · cross to orbit =====');
await page.getByRole('button', { name: 'Enter Shuttle' }).click();
await page.waitForTimeout(BOARD_CLEAR_MS + 250);
await settle(page);
ok('re-boarded: cabin on stage', (await count(page, 'section[aria-label="Shuttle cabin"]')) === 1);

await page.getByRole('button', { name: 'Enter Orbit' }).click();
const clickT = Date.now();
const afterClick = async (ms) => { const d = ms - (Date.now() - clickT); if (d > 0) await page.waitForTimeout(d); };

await afterClick(200); // early in the cover — the wipe mounts synchronously with the transit leg
ok('transit: the .locale-wipe overlay is playing', (await count(page, '.locale-wipe')) >= 1);
await afterClick(600);
ok('transit ~600ms: zero Shuttle leads on stage', (await shuttleLeads(page)) === 0, String(await shuttleLeads(page)));
await afterClick(1500);
ok('transit ~1500ms: zero Shuttle leads on stage', (await shuttleLeads(page)) === 0, String(await shuttleLeads(page)));

// Past arrival (≥3300ms clears TRANSIT_TOTAL_MS with headroom), then settle the fly-in.
await afterClick(3400);
await settle(page);
ok('orbit: the space scene is shown (.scene-orbit.shown)', (await count(page, '.scene-orbit.shown')) >= 1);
ok('orbit: the bar carries the orbit re-theme class', (await count(page, '.surface-head.orbit')) >= 1);
ok('orbit: the bar re-themes to a dark colour-scheme',
	(await page.locator('.surface-head.orbit').first().evaluate((e) => getComputedStyle(e).colorScheme)) === 'dark');
ok('orbit: exactly one Shuttle lead', (await shuttleLeads(page)) === 1, String(await shuttleLeads(page)));
ok('orbit: Courier place present', await hasLead(page, 'Courier'));
ok('orbit: Division ledger present', (await count(page, '.pud-ledger')) === 1);
ok('orbit: NO Basecamp place', !(await hasLead(page, 'Basecamp')));
ok('orbit: NO requisitions / forestry / stores / actions',
	(await count(page, '.pud-shop')) === 0 && (await count(page, '.pud-wood')) === 0 &&
	(await count(page, '.pud-inv')) === 0 && (await count(page, '.pud-actions')) === 0);

// ── E. Descend the same way → planetside restored ───────────────────────────────────────────
// The Shuttle place stands in both deployments, so it's the door home too. The destination button
// now reads the other way; committing runs the crossing again and lands the planetside dashboard.
console.log('\n===== E · descend to basecamp =====');
await page.getByRole('button', { name: 'Enter Shuttle' }).click();
await page.waitForTimeout(BOARD_CLEAR_MS + 250);
await settle(page);
ok('re-boarded in orbit: cabin destination reads "Descend to Basecamp"',
	(await page.getByRole('button', { name: 'Descend to Basecamp' }).count()) === 1);
await page.getByRole('button', { name: 'Descend to Basecamp' }).click();
// Descent lands on ITS OWN, shorter clock — the ascend total would pass here too, but waiting
// only DESCEND_TOTAL + headroom asserts the improvement itself: a regression back to charging
// descent for ascend's flight (1.8s of a ranger staring at a still forest) fails this wait.
await page.waitForTimeout(DESCEND_TOTAL_MS + 800);
await settle(page);
ok('descended: Basecamp place restored', await hasLead(page, 'Basecamp'));
ok('descended: requisitions back on stage', (await count(page, '.pud-shop')) === 1);
ok('descended: NO Courier place', !(await hasLead(page, 'Courier')));
ok('descended: exactly one Shuttle lead', (await shuttleLeads(page)) === 1, String(await shuttleLeads(page)));
ok('descended: space scene no longer shown', (await count(page, '.scene-orbit.shown')) === 0);
ok('descended: bar drops the orbit class', (await count(page, '.surface-head.orbit')) === 0);

// ── F. The reopen regression ─────────────────────────────────────────────────────────────────
// `ranger` is a MODULE — aboard/cabin/transit outlive the component and their timers keep ticking
// after it unmounts. Close the panel mid-boarding (or mid-crossing) and, without PudIdle's onDestroy
// calling leaveShuttle(), reopening would land you strapped in the cabin, or let a half-finished
// crossing complete under the fresh dashboard and reveal the Shuttle card TWICE. So we close with a
// REAL SPA navigation (the Back cap → history back, module state preserved), then reopen — and demand
// the dashboard, one Shuttle lead, no cabin. A full reload would reset the module and prove nothing.
console.log('\n===== F · reopen after closing mid-state =====');
const openViaCard = async () => {
	await page.locator('a.app-card[href="' + PUD + '"]').click();
	await page.waitForURL(B + PUD, { timeout: 6000 });
	await page.waitForTimeout(1300);
	await settle(page);
};
const backToApps = async () => {
	await page.locator('.surface-head .icon-btn.back').first().click();
	await page.waitForURL(B + '/apps', { timeout: 6000 });
	await page.waitForTimeout(500);
};

// F1 — closed MID-BOARDING (aboard/cabin raised, no crossing).
await page.goto(B + '/apps', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await openViaCard();
await page.getByRole('button', { name: 'Enter Shuttle' }).click();
await page.waitForTimeout(BOARD_CLEAR_MS + 250);
await settle(page);
ok('F1: boarded before closing', (await count(page, 'section[aria-label="Shuttle cabin"]')) === 1);
await backToApps();
await openViaCard();
ok('F1 reopen: lands on the dashboard, no cabin', (await count(page, 'section[aria-label="Shuttle cabin"]')) === 0);
ok('F1 reopen: exactly one Shuttle lead', (await shuttleLeads(page)) === 1, String(await shuttleLeads(page)));

// F2 — closed MID-CROSSING (committed, then away before the flight lands). leaveShuttle must cancel
// the pending flip/land timers so the crossing can't complete under a future panel.
await page.getByRole('button', { name: 'Enter Shuttle' }).click();
await page.waitForTimeout(BOARD_CLEAR_MS + 250);
await settle(page);
await page.getByRole('button', { name: 'Enter Orbit' }).click();
await page.waitForTimeout(250); // mid-crossing — the wipe is up, the flight is in the air
ok('F2: a crossing is in the air', (await count(page, '.locale-wipe')) >= 1);
await backToApps();
await openViaCard();
await page.waitForTimeout(600); // outlast any stale timer that a broken leaveShuttle would let fire
ok('F2 reopen: no cabin, no crossing left behind',
	(await count(page, 'section[aria-label="Shuttle cabin"]')) === 0 && (await count(page, '.locale-wipe')) === 0);
ok('F2 reopen: exactly one Shuttle lead (never two)', (await shuttleLeads(page)) === 1, String(await shuttleLeads(page)));

// ── G. Global pause — the bar disc and the requisitions disc drive one bit ──────────────────
// The pause lives in the module (ranger.paused); the panel bar's disc and the requisitions head's
// .pud-pauseall are two hands on the same switch, and their aria-pressed must stay in lockstep. The
// bar disc is the only aria-pressed control in the head-actions (the gear is aria-expanded).
console.log('\n===== G · pause syncs across both discs =====');
await openPud();
const barDisc = page.locator('.surface-head .head-actions button[aria-pressed]').first();
const shopDisc = page.locator('.pud-pauseall').first();
const pressed = (loc) => loc.getAttribute('aria-pressed');
ok('pause: both discs start unpressed',
	(await pressed(barDisc)) === 'false' && (await pressed(shopDisc)) === 'false',
	`bar=${await pressed(barDisc)} shop=${await pressed(shopDisc)}`);
await barDisc.click();
await page.waitForTimeout(150);
ok('pause: bar disc pressed → .pud-pauseall reads pressed', (await pressed(shopDisc)) === 'true', await pressed(shopDisc));
await shopDisc.click();
await page.waitForTimeout(150);
ok('pause: .pud-pauseall click → both read unpressed',
	(await pressed(barDisc)) === 'false' && (await pressed(shopDisc)) === 'false',
	`bar=${await pressed(barDisc)} shop=${await pressed(shopDisc)}`);

await ctx.close();
await browser.close();
const f = res.filter((x) => !x).length;
console.log(`\n${res.length - f}/${res.length} passed`);
process.exit(f ? 1 : 0);
