import { firefox } from 'playwright';

const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass, detail });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// WHICH PLACE A URL NAMES, ignoring the query. The Air Traffic board renders its OWN expand
// toggle (it is one of the four apps built to fill the viewport), and that choice is kept in the
// URL as `?expanded=1` so a shared link arrives laid out the way it was sent. So the board's URL
// is `/apps/air-traffic?expanded=1` and not `/apps/air-traffic` — every exact-string comparison
// in here was really asking "and no app state came with it", which is not what any of them mean.
const at = (u, path) => new URL(u).pathname === path;

const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

// Count full document loads, so we can prove in-map navigation is shallow (no reload).
let loads = 0;
page.on('load', () => loads++);

// AEROPALITE, seeded before the first navigation. This suite is about SHALLOW ROUTING through the
// MASTHEAD — it clicks the nav's "Apps" link, then a card, and asserts `aside.surface` opened
// without a full page load. All three of those are Aeropalite's chrome: under Pixelite (the
// default) the homepage is the docs shell, which draws no masthead nav and no panel at all, so the
// link never appears and the suite spent 30s waiting for it before reaching assertion one.
// The claim itself — a URL push renders the place without a reload — is true of both looks. The
// docs shell's own way to it (the superbar's crumbs, the sidebar tree) is a different set of
// controls and belongs in a Pixelite suite of its own.
await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
	localStorage.setItem('ksh-look', 'aeropalite');
	localStorage.setItem('ksh-sky', 'off');
	localStorage.setItem('ksh-theme', 'light');
});

// ── 1. Deep link renders the board directly ─────────────────────────────────
await page.goto(`${B}/apps/air-traffic`, { waitUntil: 'networkidle' });
ok('deep link /apps/air-traffic keeps its URL', at(page.url(), '/apps/air-traffic'), page.url());
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

// The map is gone (with the whole transit motif — see $lib/network): a place is reached from the
// masthead's nav and, for an app, its card on the Apps panel. Same links, same shallow routing.
const loadsBefore = loads;
await page.getByRole('link', { name: 'Apps', exact: true }).click();
await page.waitForURL(`${B}/apps`, { timeout: 5000 });

// ── 3. Panel → panel keeps URL in step with the visible panel ───────────────
// Via the masthead's nav. This used to click a "Connections" chip inside the ATFC panel, but the
// Related rail is gone site-wide (onward destinations are body cards now, see PANEL_CARDS) and
// ATFC — which owns its whole interior — carries no cards of its own.
//
// ASKED BETWEEN TWO COMPACT PANELS, and asked HERE rather than after the board opens. It used to
// leave the board by clicking the nav, and an expanded full-viewport app COVERS the masthead — the
// links are still in the DOM, so the locator resolves and then waits out its timeout on something
// no pointer can reach. That is the app behaving correctly: an app built to fill the viewport
// fills it. So the step runs while a compact panel is open and the chrome is still there.
await page.waitForTimeout(600);
ok('panel → panel: URL becomes /apps', page.url() === `${B}/apps`);
ok('panel → panel: title is Apps', (await page.title()) === 'Apps — Kashinoga', await page.title());
// SETTINGS, not About: on a desktop the masthead's Home and About are FLYOUTS under their own
// buttons rather than panels (see navPop in +page.svelte), so clicking About opens a card and
// navigates nowhere — the wait then sits on a URL that is never going to change.
await page.getByRole('link', { name: 'Settings', exact: true }).click();
await page.waitForURL(`${B}/settings`, { timeout: 5000 });
await page.waitForTimeout(600);
ok('panel → panel: and on to /settings', page.url() === `${B}/settings`, page.url());
ok(
	'panel → panel: title is Settings',
	(await page.title()) === 'Settings — Kashinoga',
	await page.title()
);
ok('panel → panel: no full page reload', loads === loadsBefore, `loads: ${loads - loadsBefore}`);
// …then back to Apps and into the board, which is where the history cases below start from.
await page.getByRole('link', { name: 'Apps', exact: true }).click();
await page.waitForURL(`${B}/apps`, { timeout: 5000 });
await page.locator('a.app-card[href="/apps/air-traffic"]').click();
await page.waitForURL((u) => u.pathname === '/apps/air-traffic', { timeout: 5000 });
ok(
	'click app card → URL becomes /apps/air-traffic',
	at(page.url(), '/apps/air-traffic'),
	page.url()
);
ok('click app card → no full page reload', loads === loadsBefore, `loads: ${loads - loadsBefore}`);
await page.waitForTimeout(600);
ok('click app card → panel is open', await page.locator('aside.surface').isVisible());
ok('click app card → title updates', (await page.title()) === 'Air Traffic — Kashinoga');

// ── 4. Back / forward drive the panel ───────────────────────────────────────
// The board is what is open here — the panel→panel step above no longer ends by navigating away
// from it, so back leads to the Apps panel it was opened from and forward returns to the board.
await page.goBack();
await page.waitForTimeout(700);
ok('back → URL is /apps', page.url() === `${B}/apps`, page.url());
ok('back → panel shows Apps', (await page.title()) === 'Apps — Kashinoga', await page.title());
ok('back → still no reload', loads === loadsBefore, `loads: ${loads - loadsBefore}`);

await page.goForward();
await page.waitForTimeout(700);
ok('forward → URL is the board', at(page.url(), '/apps/air-traffic'), page.url());
ok(
	'forward → panel shows Air Traffic',
	(await page.title()) === 'Air Traffic — Kashinoga',
	await page.title()
);

// ── 5. Back all the way to the homepage closes the panel ────────────────────
// Walked, not counted: reaching an app now takes nav → card (two pushes), so hard-coding the
// number of steps would just bake in today's click path.
for (let i = 0; i < 6 && new URL(page.url()).pathname !== '/'; i++) {
	await page.goBack();
	await page.waitForTimeout(500);
}
await page.waitForTimeout(600);
ok('back to / → URL is /', page.url() === `${B}/`, page.url());
ok('back to / → panel closed', !(await page.locator('aside.surface').isVisible()));
ok('back to / → title is Kashinoga', (await page.title()) === 'Kashinoga');

// ── 6. Escape closes and updates the URL ────────────────────────────────────
await page.goto(`${B}/about`, { waitUntil: 'networkidle' });
// About fans out to Work/Projects as body CARDS (PANEL_CARDS), not the retired chip rail.
await page.locator('aside.surface a.app-card[href="/about/projects"]').first().click();
await page.waitForURL(`${B}/about/projects`, { timeout: 5000 });
await page.waitForTimeout(500);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
ok('escape → URL back to /', page.url() === `${B}/`, page.url());

// ── 8. Ctrl-click opens a new tab instead of flying the camera ──────────────
await page.goto(`${B}/apps`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const ctx = page.context();
const popupPromise = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
await page.locator('a.app-card[href="/apps/air-traffic"]').click({ modifiers: ['ControlOrMeta'] });
const popup = await popupPromise;
if (popup) {
	await popup.waitForLoadState('domcontentloaded');
	ok(
		'ctrl-click opens /apps/air-traffic in a new tab',
		at(popup.url(), '/apps/air-traffic'),
		popup.url()
	);
	await popup.close();
} else {
	ok('ctrl-click opens /apps/air-traffic in a new tab', false, 'no popup fired');
}
ok('ctrl-click left the original tab at /apps', page.url() === `${B}/apps`, page.url());

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
