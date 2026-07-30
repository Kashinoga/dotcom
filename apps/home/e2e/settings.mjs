import { firefox } from 'playwright';

// The Settings panel: what a first-ever visitor sees, and that a saved pick still wins.
//
// This suite used to assert the route map too (its "Route map style" group, its <svg role="img">,
// its station labels). The map is gone — see the homepage's masthead-and-nav — and those checks had
// been failing against a page that no longer has any of it. The map assertions are removed rather
// than repaired: there is nothing left for them to test.
//
// The codes/full-names toggle went the same way. Stops are always named in full now, so there is no
// 'Station label style' group to check; reset.mjs still proves a stale ksh-stop-names gets wiped.

const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await firefox.launch();

/** A brand-new context = empty localStorage = a first-ever visitor. */
async function firstVisit(seed) {
	const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
	const page = await ctx.newPage();
	if (seed) {
		await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
		await page.evaluate((kv) => {
			for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
		}, seed);
	}
	await page.goto(`${B}/settings`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(1200);
	return { ctx, page };
}

/** Which option is checked inside a given radiogroup, compared without regard to CASE.
 *
 * `innerText` reports text as RENDERED, and Pixelite uppercases these labels — so the same
 * checked option reads "System" under Aeropalite and "SYSTEM" under Pixelite. That difference is
 * a `text-transform`, not a different setting, and it is not what any assertion here is about. */
const checkedIn = (page, group) =>
	page
		.locator(`[role="radiogroup"][aria-label="${group}"] [aria-checked="true"]`)
		.first()
		.innerText()
		.then((t) => t.trim().split('\n')[0].toLowerCase())
		.catch(() => '<none checked>');
const groupsOn = (page) =>
	page
		.locator('[role="radiogroup"]')
		.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));

// WHAT SETTINGS OFFERS, PER THEME. Pixelite's is SPARSE by design — it draws no sky, so the two
// sky controls have nothing to act on and are not rendered; and `Button style` is retired
// site-wide, in both looks, with the flat/bubble axis it belonged to. Measured on this tree.
const OFFERED = {
	pixelite: { 'Display mode': 'system', Theme: 'pixelite' },
	aeropalite: {
		'Display mode': 'system',
		Theme: 'aeropalite',
		'Sky background': 'auto',
		Stars: 'on'
	}
};

// ── 1. A first-ever visitor sees the defaults ──────────────────────────────
// Asked of BOTH looks. `Site look` is called `Theme` now and offers Pixelite or Aeropalite rather
// than the single "Lab" it once did; `Button style` is gone with the flat/bubble axis.
for (const look of ['pixelite', 'aeropalite']) {
	const { ctx, page } = await firstVisit({ 'ksh-look': look });
	for (const [group, expected] of Object.entries(OFFERED[look])) {
		const got = await checkedIn(page, group);
		ok(`${look}: default ${group} = ${expected}`, got === expected, got);
	}
	await ctx.close();
}

// ── 2. The retired controls are really gone from the panel ─────────────────
{
	const { ctx, page } = await firstVisit({ 'ksh-look': 'pixelite' });
	const groups = await groupsOn(page);
	ok('no station-label group', !groups.includes('Station label style'), groups.join(','));
	ok('no route-map group', !groups.includes('Route map style'), groups.join(','));
	// BUTTON STYLE went with the flat/bubble axis it belonged to — the two button personalities
	// are the two THEMES now, so a control choosing between them was choosing twice.
	ok('no button-style group', !groups.includes('Button style'), groups.join(','));
	// …and Pixelite's Settings is SPARSE: it draws no sky, so the two sky controls have nothing to
	// act on. Their absence here is the deliberate part — this is not a control that failed to
	// render, it is one that would have nothing to do.
	ok('pixelite: no sky-background group', !groups.includes('Sky background'), groups.join(','));
	ok('pixelite: no stars group', !groups.includes('Stars'), groups.join(','));

	// THE THEME PICKER is what `Site look` became. Derived from the group rather than written
	// down, so adding a third look is a change in one place.
	const looks = await page
		.locator('[role="radiogroup"][aria-label="Theme"] .seg-title')
		.allInnerTexts();
	ok(
		'Theme offers both looks',
		looks.map((t) => t.trim().toLowerCase()).join(',') === 'pixelite,aeropalite',
		looks.join(',')
	);

	// The header's own bottom border draws the first divider; the first group must not add a second.
	const firstBorder = await page
		.locator('.stg-group')
		.first()
		.locator('.seg-lead')
		.evaluate((e) => getComputedStyle(e).borderTopWidth);
	const secondBorder = await page
		.locator('.stg-group')
		.nth(1)
		.locator('.seg-lead')
		.evaluate((e) => getComputedStyle(e).borderTopWidth);
	ok('first group has no top rule', firstBorder === '0px', firstBorder);
	// The rule between groups is AEROPALITE's. Pixelite parts its groups by space instead — its
	// Settings is a sheet of the manual, and a hairline under every heading is the table-with-rules
	// look this theme retired. Measured: 0px in both places under Pixelite.
	ok('later groups keep theirs', secondBorder === '0px', secondBorder);
	await ctx.close();
}

// …and under Aeropalite the sky controls ARE there. The absences above only mean something
// alongside the presences here; without this, deleting both controls outright would still pass.
{
	const { ctx, page } = await firstVisit({ 'ksh-look': 'aeropalite' });
	const groups = await groupsOn(page);
	ok(
		'aeropalite: sky-background group is offered',
		groups.includes('Sky background'),
		groups.join(',')
	);
	ok('aeropalite: stars group is offered', groups.includes('Stars'), groups.join(','));
	await ctx.close();
}

// ── 3. A saved preference still wins over the defaults ─────────────────────
{
	// AEROPALITE, because two of the three controls asked about here are only drawn there. `ksh-ui`
	// is not seeded any more: nothing reads it, and `Button style` — the control it drove — is gone.
	const { ctx, page } = await firstVisit({
		'ksh-look': 'aeropalite',
		'ksh-theme': 'dark',
		'ksh-sky': 'off',
		'ksh-stars': '0'
	});
	const want = {
		'Display mode': 'dark',
		'Sky background': 'off', // seeded 'off' — the saved opt-out beats the Auto default
		Stars: 'off'
	};
	for (const [group, expected] of Object.entries(want)) {
		const got = await checkedIn(page, group);
		ok(`saved ${group} = ${expected} still wins`, got === expected, got);
	}
	await ctx.close();
}

// ── 4. Decoration is BUILT only when it can be seen ────────────────────────
// Each scheme has its own sky decoration — clouds drift in a light one, stars twinkle in a dark
// one — and the point of this section is that the hidden one is NOT IN THE DOM. Painting it
// transparent instead left its animations running for nothing.
//
// The light decoration used to be static rings, and this suite asserted "nothing animates
// forever". Both facts have moved on: `.ring-line` no longer exists anywhere in the source, and
// the light sky's clouds drift endlessly BY DESIGN (as the night sky's stars twinkle and shoot).
// So the endless-animation count is no longer the measure — the measure is that the animations
// running belong to the scheme you're actually looking at. Asserting "nothing repaints forever"
// today would be asserting the motion away.
//
// The sky is pinned in both cases, not left on the Auto default: an opted-into sky decides the
// colour scheme (dusk and night are dark), so with Auto the wall clock — not the seeded theme —
// would pick which of the two renders, and this suite would pass or fail by time of day.
const decoration = () => ({
	clouds: document.querySelectorAll('.cloud-layer').length,
	stars: document.querySelectorAll('.stars span').length,
	// Endless animations, by the decoration they belong to. Entrance flourishes are finite and
	// still winding down at this point — they're supposed to be, so they're not counted.
	forever: [...document.getAnimations()]
		.filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
		.map((a) => a.animationName ?? '')
});
{
	// AEROPALITE IS THE ONLY LOOK THAT DRAWS A SKY. Under Pixelite there are no clouds and no stars
	// to build or withhold, so the whole claim below — that the decoration you cannot see is not in
	// the DOM — has nothing to be about.
	const { ctx, page } = await firstVisit({
		'ksh-look': 'aeropalite',
		'ksh-theme': 'light',
		'ksh-sky': 'noon'
	});
	const seen = await page.evaluate(decoration);
	ok('light: clouds drawn', seen.clouds > 0, String(seen.clouds));
	ok('light: no stars in the DOM', seen.stars === 0, String(seen.stars));
	ok(
		'light: the clouds are the thing drifting',
		seen.forever.some((n) => /cloud-drift/.test(n)),
		seen.forever.join(', ') || 'nothing'
	);
	ok(
		'light: no star animation running',
		!seen.forever.some((n) => /twinkle|shoot/.test(n)),
		seen.forever.join(', ')
	);
	await ctx.close();
}
{
	const { ctx, page } = await firstVisit({
		'ksh-look': 'aeropalite',
		'ksh-theme': 'dark',
		'ksh-sky': 'night'
	});
	const seen = await page.evaluate(decoration);
	ok('dark: stars drawn', seen.stars > 0, String(seen.stars));
	ok('dark: no clouds in the DOM', seen.clouds === 0, String(seen.clouds));
	ok(
		'dark: the stars are the thing twinkling',
		seen.forever.some((n) => /twinkle/.test(n)),
		seen.forever.join(', ') || 'nothing'
	);
	ok(
		'dark: no cloud animation running',
		!seen.forever.some((n) => /cloud-drift/.test(n)),
		seen.forever.join(', ')
	);
	await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
