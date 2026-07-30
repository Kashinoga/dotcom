import { firefox } from 'playwright';

const B = process.env.BASE || 'http://localhost:5199';
const A = '/apps/air-traffic';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let loads = 0;
page.on('load', () => loads++);

// THE FIELD IS PICKED FROM THE PILL ROW. It used to be picked from the `select[aria-label="Airport"]`
// dropdown, on the reasoning that the pills only lived in the expanded bar and this was the compact
// board — but the board is ALWAYS expanded now (it is one of the four apps built to fill the
// viewport, and the generic expand toggle is gone), so at this width the pills are the control and
// the select is the phone's. It is still in the DOM at 1500px, which is why this failed the way it
// did: the locator resolved, the element was `display: inline-block` with a width of ZERO, and
// `selectOption` waited out its full timeout on something no pointer could reach.
//
// The pills READ as ICAO codes — GRM, DSM, ORD — and carry the field's full name in `title`. So
// they are located by that attribute and not by role+name: a button's accessible name comes from
// its text, which here is "JFK", and `getByRole('button', { name: 'New York JFK' })` matches
// nothing. The assertions below keep the full names they were written with. The current pill
// wears `.on`.
// THE URL WITHOUT `expanded`. The board renders its own fill-the-viewport toggle and keeps that
// choice in the URL, so it opens at `?expanded=1` and every comparison here picked it up. This
// suite is about ONE param — which field is showing — so the panel's layout state is normalised
// out rather than written into each expectation.
const at = (u) => {
	const x = new URL(u);
	x.searchParams.delete('expanded');
	return x.origin + x.pathname + (x.search || '');
};
const pickField = (name) => page.locator(`button.field[title="${name}"]`).click();
const field = () =>
	page
		.locator('button.field.on')
		.first()
		.evaluate((el) => el.title || '');
const histLen = () => page.evaluate(() => history.length);

// AEROPALITE. This suite is about ONE thing — that `?field=` follows the board and never leaks —
// and that is true in both looks. What is not theme-independent is how it gets BETWEEN places: it
// leaves the board for the Apps panel and comes back, and the masthead nav plus `aside.surface`
// and its cards are Aeropalite's chrome.
await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
	localStorage.setItem('ksh-look', 'aeropalite');
	localStorage.setItem('ksh-sky', 'off');
	localStorage.setItem('ksh-theme', 'light');
});

// ── deep link opens on the named field ──────────────────────────────────────
await page.goto(`${B}${A}?field=sfo`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
ok('deep link ?field=sfo selects SFO', (await field()) === 'San Francisco');
ok('deep link ?field=sfo not on default', (await field()) !== 'Gracemeria');
ok('deep link ?field=sfo titles the field', (await page.title()).includes('San Francisco'));

// ── picking a field rewrites the URL in place (no new history entry) ─────────
const before = await histLen();
const loadsBefore = loads;
await pickField('New York JFK');
await page.waitForTimeout(900);
ok('pick JFK → URL gains ?field=jfk', at(page.url()) === `${B}${A}?field=jfk`, page.url());
ok('pick JFK → dropdown shows it', (await field()) === 'New York JFK');
ok('pick JFK → title follows', (await page.title()).includes('New York JFK'));
ok('pick JFK → no page reload', loads === loadsBefore);
ok(
	'pick JFK → replaces, does not push history',
	(await histLen()) === before,
	`${before} → ${await histLen()}`
);

// ── the default field drops the param entirely ──────────────────────────────
await pickField('Gracemeria');
await page.waitForTimeout(900);
ok('pick default → param removed', at(page.url()) === `${B}${A}`, page.url());
ok('pick default → generic title', (await page.title()) === 'Air Traffic — Kashinoga');

// ── back from the board leaves the board, not the field ─────────────────────
await page.goto(`${B}/apps`, { waitUntil: 'networkidle' });
// The map is gone: the board is reached from the Apps panel's card (or by URL).
await page.locator('a.app-card[href="/apps/air-traffic"]').click();
await page.waitForURL((u) => u.pathname === new URL(`${B}${A}`).pathname, { timeout: 5000 });
await page.waitForTimeout(700);
await pickField('Denver');
await page.waitForTimeout(800);
ok('clicked in, picked DEN', at(page.url()) === `${B}${A}?field=den`, page.url());
await page.goBack();
await page.waitForTimeout(900);
// The invariant: picking a field REPLACES the history entry, so stepping back never walks you
// through the fields you tried — it leaves the field behind entirely. (Which entry you land on
// depends on how you opened the board; what matters is that it carries no ?field.)
ok('back → no ?field in the entry behind it', !page.url().includes('?field='), page.url());
ok('back → not the prior field (den)', !page.url().includes('den'), page.url());

// ── forward restores the board with its field ───────────────────────────────
await page.goForward();
await page.waitForTimeout(1000);
ok('forward → board with ?field=den', at(page.url()) === `${B}${A}?field=den`, page.url());
ok('forward → DEN still selected', (await field()) === 'Denver');

// ── a fresh open of the board starts on the default ─────────────────────────
// LEAVING THE BOARD GOES THROUGH THE BOARD'S OWN EDGE CONTROL, not the masthead. It used to click
// the nav's Apps link — and the board fills the viewport, so the masthead is COVERED: the link is
// still in the DOM, the locator resolves, and the click then waits out its timeout on something no
// pointer can reach. "Close and go home" is the way out an app that owns its whole interior gives
// you, and it lands on the homepage where the nav is reachable again.
await page.getByRole('button', { name: 'Close and go home' }).click();
await page.waitForURL(`${B}/`, { timeout: 5000 });
await page.waitForTimeout(600);
await page.getByRole('link', { name: 'Apps', exact: true }).click();
await page.waitForURL(`${B}/apps`, { timeout: 5000 });
await page.waitForTimeout(700);
// The apps are CARDS in the Apps panel's body now, not chips in its Related rail.
await page.locator('aside.surface a.app-card[href="/apps/air-traffic"]').first().click();
await page.waitForURL((u) => u.pathname === new URL(`${B}${A}`).pathname, { timeout: 5000 });
await page.waitForTimeout(800);
ok('re-open board → no stale ?field=', at(page.url()) === `${B}${A}`, page.url());
ok('re-open board → default field', (await field()) === 'Gracemeria');

// ── the field never leaks onto another panel ────────────────────────────────
await pickField('Seattle');
await page.waitForTimeout(800);
// Out through the board's own control again, for the reason above, then on to Apps.
await page.getByRole('button', { name: 'Close and go home' }).click();
await page.waitForURL(`${B}/`, { timeout: 5000 });
await page.waitForTimeout(600);
await page.getByRole('link', { name: 'Apps', exact: true }).click();
await page.waitForURL(`${B}/apps`, { timeout: 5000 });
await page.waitForTimeout(700);
ok('navigate away → no ?field= on /apps', page.url() === `${B}/apps`, page.url());
ok('navigate away → title is Apps', (await page.title()) === 'Apps — Kashinoga');

// DEV-SERVER NOISE IS NOT AN APP ERROR. `font` is filtered the way e2e/ticker already filters it —
// Firefox fails the odd woff2 fetch from vite's `@fs` path under load — and the dynamic-import one
// is the same kind of thing: this suite navigates hard and fast, and a chunk request that loses a
// race is reported as "error loading dynamically imported module". The tell is that the MODULE
// NAMED CHANGES between runs (kit's client.js on one, the generated matchers.js on the next); a
// genuinely broken lazy import would name the same file every time. Worth re-reading if this ever
// starts naming one consistently.
const real = errors.filter((e) => !/favicon|devtools|font|dynamically imported module/i.test(e));
ok('no page errors', real.length === 0, real.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
