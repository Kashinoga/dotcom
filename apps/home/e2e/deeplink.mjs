import { firefox } from 'playwright';

const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass, detail });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

// Count full document loads, so we can prove in-map navigation is shallow (no reload).
let loads = 0;
page.on('load', () => loads++);

// The home camera is zoomed onto the hub, so tier-2 stations (Air Traffic, …) sit off-frame.
// Tap the masthead's "show full map" toggle to bring the whole network on screen before
// clicking one. No-op if it's already showing the full map.
async function showFullMap() {
	const btn = page.locator('.map-full');
	if ((await btn.getAttribute('aria-pressed')) === 'false') {
		await btn.click();
		await page.waitForTimeout(900);
	}
}

// ── 1. Deep link renders the board directly ─────────────────────────────────
await page.goto(`${B}/apps/air-traffic`, { waitUntil: 'networkidle' });
ok('deep link /apps/air-traffic keeps its URL', page.url() === `${B}/apps/air-traffic`, page.url());
ok('deep link /apps/air-traffic renders panel', await page.locator('aside.surface').isVisible());
ok(
	'deep link /apps/air-traffic titles the tab',
	(await page.title()) === 'Air Traffic — Kashinoga',
	await page.title()
);

// ── 2. Clicking a station pushes its URL, no page reload ────────────────────
await page.goto(`${B}/`, { waitUntil: 'networkidle' });
ok('overview is at /', page.url() === `${B}/`);
ok('overview shows no panel', !(await page.locator('aside.surface').isVisible()));

const loadsBefore = loads;
await showFullMap();
await page.locator('a.node[href="/apps/air-traffic"] circle.hit').click();
await page.waitForURL(`${B}/apps/air-traffic`, { timeout: 5000 });
ok('click station → URL becomes /apps/air-traffic', page.url() === `${B}/apps/air-traffic`);
ok('click station → no full page reload', loads === loadsBefore, `loads: ${loads - loadsBefore}`);
await page.waitForTimeout(600);
ok('click station → panel is open', await page.locator('aside.surface').isVisible());
ok('click station → title updates', (await page.title()) === 'Air Traffic — Kashinoga');

// ── 3. Panel → panel keeps URL in step with the visible panel ───────────────
// Chip to APP (a "Connections" link inside the ATFC panel).
await page.locator('aside.surface a.chip[href="/apps"]').first().click();
await page.waitForURL(`${B}/apps`, { timeout: 5000 });
await page.waitForTimeout(600);
ok('chip → URL becomes /app', page.url() === `${B}/apps`);
ok('chip → title is Apps', (await page.title()) === 'Apps — Kashinoga', await page.title());

// ── 4. Back / forward drive the panel ───────────────────────────────────────
await page.goBack();
await page.waitForTimeout(700);
ok('back → URL is /apps/air-traffic', page.url() === `${B}/apps/air-traffic`, page.url());
ok('back → panel shows Air Traffic', (await page.title()) === 'Air Traffic — Kashinoga');
ok('back → still no reload', loads === loadsBefore, `loads: ${loads - loadsBefore}`);

await page.goForward();
await page.waitForTimeout(700);
ok('forward → URL is /app', page.url() === `${B}/apps`, page.url());
ok('forward → panel shows Apps', (await page.title()) === 'Apps — Kashinoga');

// ── 5. Back all the way to the overview closes the panel ────────────────────
await page.goBack(); // /apps/air-traffic
await page.waitForTimeout(500);
await page.goBack(); // /
await page.waitForTimeout(800);
ok('back to / → URL is /', page.url() === `${B}/`, page.url());
ok('back to / → panel closed', !(await page.locator('aside.surface').isVisible()));
ok('back to / → title is Kashinoga', (await page.title()) === 'Kashinoga');

// ── 6. Escape closes and updates the URL ────────────────────────────────────
await page.locator('a.node[href="/about/projects"] circle.hit').click();
await page.waitForURL(`${B}/about/projects`, { timeout: 5000 });
await page.waitForTimeout(500);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
ok('escape → URL back to /', page.url() === `${B}/`, page.url());

// ── 7. Line legend links ────────────────────────────────────────────────────
await page.locator('a.legend-btn[href="/terminal-way"]').click();
await page.waitForURL(`${B}/terminal-way`, { timeout: 5000 });
await page.waitForTimeout(500);
ok('legend → /terminal-way', page.url() === `${B}/terminal-way`);
ok('legend → line title', (await page.title()) === 'Terminal Way line — Kashinoga');

// ── 8. Ctrl-click opens a new tab instead of flying the camera ──────────────
await page.goto(`${B}/`, { waitUntil: 'networkidle' });
await showFullMap();
const ctx = page.context();
const popupPromise = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
await page.locator('a.node[href="/apps/air-traffic"] circle.hit').click({ modifiers: ['ControlOrMeta'] });
const popup = await popupPromise;
if (popup) {
	await popup.waitForLoadState('domcontentloaded');
	ok('ctrl-click opens /apps/air-traffic in a new tab', popup.url() === `${B}/apps/air-traffic`, popup.url());
	await popup.close();
} else {
	ok('ctrl-click opens /apps/air-traffic in a new tab', false, 'no popup fired');
}
ok('ctrl-click left the original tab at /', page.url() === `${B}/`, page.url());

// ── 9. Dragging the map must not follow a station link ──────────────────────
await page.goto(`${B}/`, { waitUntil: 'networkidle' });
const node = page.locator('a.node[href="/about/projects"] circle.hit');
const box = await node.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 90, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(600);
ok('drag from a station does not navigate', page.url() === `${B}/`, page.url());

// ── 10. No console/page errors throughout ───────────────────────────────────
const real = errors.filter((e) => !/favicon|Download the Svelte devtools/i.test(e));
ok('no page errors', real.length === 0, real.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
