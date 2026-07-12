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

/** Which option is checked inside a given radiogroup. */
const checkedIn = (page, group) =>
	page
		.locator(`[role="radiogroup"][aria-label="${group}"] [aria-checked="true"]`)
		.first()
		.innerText()
		.then((t) => t.trim().split('\n')[0])
		.catch(() => '<none checked>');

// ── 1. A first-ever visitor sees the defaults ──────────────────────────────
{
	const { ctx, page } = await firstVisit();
	const want = {
		'Display mode': 'System',
		'Site look': 'Lab',
		'Button style': 'Flat',
		'Sky background': 'Auto',
		Stars: 'On'
	};
	for (const [group, expected] of Object.entries(want)) {
		const got = await checkedIn(page, group);
		ok(`default ${group} = ${expected}`, got === expected, got);
	}
	await ctx.close();
}

// ── 2. The retired controls are really gone from the panel ─────────────────
{
	const { ctx, page } = await firstVisit();
	const groups = await page
		.locator('[role="radiogroup"]')
		.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
	ok('no station-label group', !groups.includes('Station label style'), groups.join(','));
	ok('no route-map group', !groups.includes('Route map style'), groups.join(','));

	const looks = await page
		.locator('[role="radiogroup"][aria-label="Site look"] .seg-title')
		.allInnerTexts();
	ok('Site look offers Lab only', looks.join(',') === 'Lab', looks.join(','));

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
	ok('later groups keep theirs', secondBorder === '1px', secondBorder);
	await ctx.close();
}

// ── 3. A saved preference still wins over the defaults ─────────────────────
{
	const { ctx, page } = await firstVisit({
		'ksh-theme': 'dark',
		'ksh-ui': 'bubble',
		'ksh-sky': 'off',
		'ksh-stars': '0'
	});
	const want = {
		'Display mode': 'Dark',
		'Button style': 'Bubble',
		'Sky background': 'Off', // seeded 'off' — the saved opt-out beats the Auto default
		Stars: 'Off'
	};
	for (const [group, expected] of Object.entries(want)) {
		const got = await checkedIn(page, group);
		ok(`saved ${group} = ${expected} still wins`, got === expected, got);
	}
	await ctx.close();
}

// ── 4. Decoration is BUILT only when it can be seen ────────────────────────
// The stars are dark-only and the rings light-only. Painting the hidden one transparent left its
// animations running for nothing, so each is now gated on the scheme in use.
//
// The sky is pinned in both cases, not left on the Auto default: an opted-into sky decides the
// colour scheme (dusk and night are dark), so with Auto the wall clock — not the seeded theme —
// would pick which of the two renders, and this suite would pass or fail by time of day.
{
	const { ctx, page } = await firstVisit({ 'ksh-theme': 'light', 'ksh-sky': 'noon' });
	const seen = await page.evaluate(() => ({
		rings: document.querySelectorAll('.ring-line').length,
		stars: document.querySelectorAll('.stars span').length,
		// Only ENDLESS animations matter: entrance flourishes are still winding down at this point
		// and are supposed to be. What must not exist is anything that repaints forever.
		forever: document
			.getAnimations()
			.filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
			.length
	}));
	ok('light: rings drawn', seen.rings > 0, String(seen.rings));
	ok('light: no stars in the DOM', seen.stars === 0, String(seen.stars));
	ok('light: nothing animating forever at idle', seen.forever === 0, String(seen.forever));
	await ctx.close();
}
{
	const { ctx, page } = await firstVisit({ 'ksh-theme': 'dark', 'ksh-sky': 'night' });
	const seen = await page.evaluate(() => ({
		rings: document.querySelectorAll('.ring-line').length,
		stars: document.querySelectorAll('.stars span').length
	}));
	ok('dark: stars drawn', seen.stars > 0, String(seen.stars));
	ok('dark: no rings in the DOM', seen.rings === 0, String(seen.rings));
	await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
