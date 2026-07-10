import { firefox } from 'playwright';

// ?range= and ?refresh= on the Air Traffic board, mirroring ?field=.
const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  — got: ' + detail : ''}`);
};

const AC = [
	{ hex: 'a1b2c3', flight: 'GCC201 ', t: 'B763', r: 'N741CX', ownOp: 'DELTA', desc: 'B763', lat: 41.55, lon: -93.67, alt_baro: 4200, gs: 240, track: 310, baro_rate: -900 }
];

const browser = await firefox.launch();
const ATFC = '/apps/air-traffic';

async function open(path) {
	const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
	const page = await ctx.newPage();
	const dists = [];
	await page.route('**/api/traffic**', (r) => {
		dists.push(new URL(r.request().url()).searchParams.get('dist'));
		return r.fulfill({ json: { ac: AC } });
	});
	await page.route('**api.adsbdb.com/**', (r) => r.abort());
	await page.goto(B + path, { waitUntil: 'networkidle' });
	await page.waitForTimeout(1800);
	return { ctx, page, dists };
}

const url = (page) => page.url().slice(B.length);
// The range/refresh controls are <select>s in the board's control strip. Target them by
// aria-label, not position: the compact panel also carries a hidden Airport <select> (the
// mobile field dropdown), so `select` order is no longer Range-then-Refresh.
const rangeSel = (page) => page.locator('select[aria-label="Radar range (nautical miles)"]');
const refreshSel = (page) => page.locator('select[aria-label="Auto-refresh interval"]');

// ── 1. Defaults carry no params, and a param spelling a default is stripped ──
{
	const { ctx, page } = await open(ATFC);
	ok('default board has a bare URL', url(page) === ATFC, url(page));
	await ctx.close();
}
{
	const { ctx, page } = await open(`${ATFC}?range=60&refresh=1m`);
	ok('?range=60&refresh=1m (the defaults) normalise away', url(page) === ATFC, url(page));
	await ctx.close();
}

// ── 2. A non-default range/refresh round-trips, and actually drives the board ──
{
	const { ctx, page } = await open(`${ATFC}?range=150`);
	ok('?range=150 survives', url(page) === `${ATFC}?range=150`, url(page));
	ok('?range=150 selects 150 in the control', (await rangeSel(page).inputValue()) === '150', await rangeSel(page).inputValue());
	await ctx.close();
}
{
	// The default field is GRACEMERIA, whose traffic is canned — it never calls /api/traffic.
	// Pick a live field to see the radius actually reach the upstream feed.
	const { ctx, page, dists } = await open(`${ATFC}?field=dsm&range=150`);
	ok('?range= reaches the upstream feed as dist=', dists.includes('150'), dists.join(',') || '(no upstream calls)');
	await ctx.close();
}
{
	const { ctx, page } = await open(`${ATFC}?refresh=5m`);
	ok('?refresh=5m survives', url(page) === `${ATFC}?refresh=5m`, url(page));
	ok('?refresh=5m selects 300000ms in the control', (await refreshSel(page).inputValue()) === '300000', await refreshSel(page).inputValue());
	await ctx.close();
}

// ── 3. Junk values fall back to the default and are dropped from the URL ──
for (const [q, why] of [
	['?range=137', 'a radius the board does not offer'],
	['?range=abc', 'a non-number'],
	['?refresh=7m', 'a cadence the board does not offer'],
	['?refresh=60000', 'milliseconds, not a label']
]) {
	const { ctx, page } = await open(ATFC + q);
	ok(`${q} (${why}) is dropped`, url(page) === ATFC, url(page));
	ok(`${q} leaves the board on its defaults`, (await rangeSel(page).inputValue()) === '60' && (await refreshSel(page).inputValue()) === '60000');
	await ctx.close();
}

// ── 4. Casing is accepted; the canonical spelling is lowercase ──
{
	const { ctx, page } = await open(`${ATFC}?refresh=30S`);
	ok('?refresh=30S canonicalises to 30s', url(page) === `${ATFC}?refresh=30s`, url(page));
	await ctx.close();
}

// ── 5. THE ORDERING TRAP: one board, one URL, whatever order you type ──
{
	const { ctx, page } = await open(`${ATFC}?refresh=30s&range=100&field=sfo`);
	ok(
		'params canonicalise to a fixed field,range,refresh order',
		url(page) === `${ATFC}?field=sfo&range=100&refresh=30s`,
		url(page)
	);
	await ctx.close();
}

// ── 6. Unrelated params survive the canonicalisation ──
{
	const { ctx, page } = await open(`${ATFC}?utm_source=x&range=100`);
	ok('an unrelated param survives', url(page).includes('utm_source=x'), url(page));
	ok('…alongside the normalised one', url(page).includes('range=100'), url(page));
	await ctx.close();
}

// ── 7. Picking a control rewrites the URL in place (replace, not push) ──
{
	const { ctx, page } = await open(ATFC);
	const before = await page.evaluate(() => history.length);
	await rangeSel(page).selectOption('100');
	await page.waitForTimeout(700);
	ok('picking a range writes ?range=100', url(page) === `${ATFC}?range=100`, url(page));
	await refreshSel(page).selectOption('120000');
	await page.waitForTimeout(700);
	ok('picking a refresh adds ?refresh=2m', url(page) === `${ATFC}?range=100&refresh=2m`, url(page));
	const after = await page.evaluate(() => history.length);
	ok('control picks replace rather than push', after === before, `${before} → ${after}`);

	// Returning a control to its default drops the param entirely.
	await rangeSel(page).selectOption('60');
	await page.waitForTimeout(700);
	ok('returning range to its default drops ?range=', url(page) === `${ATFC}?refresh=2m`, url(page));
	await ctx.close();
}

// ── 8. Back out of the panel and the params go with it ──
{
	const { ctx, page } = await open(ATFC);
	await rangeSel(page).selectOption('250');
	await page.waitForTimeout(700);
	ok('range applied', url(page) === `${ATFC}?range=250`, url(page));
	await page.getByRole('button', { name: 'Back to route map' }).click();
	await page.waitForTimeout(900);
	ok('closing the panel clears the query', url(page) === '/', url(page));
	await ctx.close();
}

// ── 9. A same-view query change must reach the MOUNTED board (no remount happens) ──
// The panel is keyed on the station code, so `load` re-runs and the props change while the
// board stays mounted. Without the follow-the-props effect the URL and board disagree.
{
	const { ctx, page, dists } = await open(`${ATFC}?field=dsm&range=100`);
	ok('starts at 100', (await rangeSel(page).inputValue()) === '100');
	await page.goto(`${B}${ATFC}?field=dsm&range=250`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(1800);
	ok('a real navigation re-seeds the board to 250', (await rangeSel(page).inputValue()) === '250', await rangeSel(page).inputValue());
	ok('and re-polls upstream at dist=250', dists.includes('250'), dists.join(',') || '(no upstream calls)');
	await ctx.close();
}

// ── 10. Back/forward across a pick restores both URL and board ──
{
	const { ctx, page } = await open(ATFC);
	await rangeSel(page).selectOption('100');
	await page.waitForTimeout(700);
	await page.getByRole('button', { name: 'Back to route map' }).click(); // pushes '/'
	await page.waitForTimeout(900);
	ok('at the map', url(page) === '/', url(page));
	await page.goBack();
	await page.waitForTimeout(1600);
	ok('back restores the board URL with its range', url(page) === `${ATFC}?range=100`, url(page));
	ok('back restores the range control itself', (await rangeSel(page).inputValue()) === '100', await rangeSel(page).inputValue());
	await ctx.close();
}

// ── 11. Only the Air Traffic board READS these params. On any other panel they are
// indistinguishable from a utm tag, so they ride along untouched — exactly as ?field=
// already does. Nothing consumes them, and nothing rewrites them.
{
	const { ctx, page } = await open('/settings?range=100&refresh=5m');
	ok('another panel leaves the board params alone', url(page) === '/settings?range=100&refresh=5m', url(page));
	await ctx.close();
}
{
	const { ctx, page } = await open('/settings?field=sfo');
	ok('…the same way it already treats ?field=', url(page) === '/settings?field=sfo', url(page));
	await ctx.close();
}

// ── 12. Aliases still redirect, params intact ──
{
	const { ctx, page } = await open('/atfc?range=100');
	ok('/atfc?range=100 → canonical path, param kept', url(page) === `${ATFC}?range=100`, url(page));
	await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
