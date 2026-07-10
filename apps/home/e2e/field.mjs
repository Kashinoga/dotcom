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

const chip = (title) => page.locator(`button[role="radio"][title="${title}"]`);
const checked = (title) => chip(title).getAttribute('aria-checked');
const histLen = () => page.evaluate(() => history.length);

// ── deep link opens on the named field ──────────────────────────────────────
await page.goto(`${B}${A}?field=sfo`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
ok('deep link ?field=sfo selects SFO', (await checked('San Francisco')) === 'true');
ok('deep link ?field=sfo not on default', (await checked('Gracemeria')) === 'false');
ok('deep link ?field=sfo titles the field', (await page.title()).includes('San Francisco'));

// ── picking a field rewrites the URL in place (no new history entry) ─────────
const before = await histLen();
const loadsBefore = loads;
await chip('New York JFK').click();
await page.waitForTimeout(900);
ok('pick JFK → URL gains ?field=jfk', page.url() === `${B}${A}?field=jfk`, page.url());
ok('pick JFK → chip is selected', (await checked('New York JFK')) === 'true');
ok('pick JFK → title follows', (await page.title()).includes('New York JFK'));
ok('pick JFK → no page reload', loads === loadsBefore);
ok('pick JFK → replaces, does not push history', (await histLen()) === before, `${before} → ${await histLen()}`);

// ── the default field drops the param entirely ──────────────────────────────
await chip('Gracemeria').click();
await page.waitForTimeout(900);
ok('pick default → param removed', page.url() === `${B}${A}`, page.url());
ok('pick default → generic title', (await page.title()) === 'Air Traffic — Kashinoga');

// ── back from the board leaves the board, not the field ─────────────────────
await page.goto(`${B}/`, { waitUntil: 'networkidle' });
await page.locator('a.node[href="/apps/air-traffic"] circle.hit').click();
await page.waitForURL(`${B}${A}`, { timeout: 5000 });
await page.waitForTimeout(700);
await chip('Denver').click();
await page.waitForTimeout(800);
ok('clicked in, picked DEN', page.url() === `${B}${A}?field=den`, page.url());
await page.goBack();
await page.waitForTimeout(900);
ok('back → returns to overview, not prior field', page.url() === `${B}/`, page.url());
ok('back → panel closed', !(await page.locator('aside.surface').isVisible()));

// ── forward restores the board with its field ───────────────────────────────
await page.goForward();
await page.waitForTimeout(1000);
ok('forward → board with ?field=den', page.url() === `${B}${A}?field=den`, page.url());
ok('forward → DEN still selected', (await checked('Denver')) === 'true');

// ── a fresh open of the board starts on the default ─────────────────────────
await page.locator('aside.surface a.chip[href="/apps"]').first().click();
await page.waitForURL(`${B}/apps`, { timeout: 5000 });
await page.waitForTimeout(700);
await page.locator('aside.surface a.chip[href="/apps/air-traffic"]').first().click();
await page.waitForURL(`${B}${A}`, { timeout: 5000 });
await page.waitForTimeout(800);
ok('re-open board → no stale ?field=', page.url() === `${B}${A}`, page.url());
ok('re-open board → default field', (await checked('Gracemeria')) === 'true');

// ── the field never leaks onto another panel ────────────────────────────────
await chip('Seattle').click();
await page.waitForTimeout(800);
await page.locator('aside.surface a.chip[href="/apps"]').first().click();
await page.waitForURL(`${B}/apps`, { timeout: 5000 });
await page.waitForTimeout(700);
ok('navigate away → no ?field= on /apps', page.url() === `${B}/apps`, page.url());
ok('navigate away → title is Apps', (await page.title()) === 'Apps — Kashinoga');

const real = errors.filter((e) => !/favicon|devtools/i.test(e));
ok('no page errors', real.length === 0, real.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
