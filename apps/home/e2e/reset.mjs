import { firefox } from 'playwright';

const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// `ksh-look` is in here because a reset must forget the THEME too — it is the preference with the
// widest blast radius, and leaving it behind would mean "reset to defaults" left you somewhere
// that is not the default. `ksh-ui` stays on the list even though nothing writes it any more: a
// stale one from an older visit must still be cleared.
const PREF_KEYS = ['ksh-stop-names', 'ksh-theme', 'ksh-sky', 'ksh-stars', 'ksh-ui', 'ksh-look'];
const browser = await firefox.launch();

async function open(seed) {
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
// Lowercased: `innerText` reports text as RENDERED and Pixelite uppercases these labels, so the
// same checked option reads "System" under Aeropalite and "SYSTEM" under Pixelite. That is a
// text-transform, not a different setting.
const checkedIn = (page, group) =>
	page
		.locator(`[role="radiogroup"][aria-label="${group}"] [aria-checked="true"]`)
		.first()
		.innerText()
		.then((t) => t.trim().split('\n')[0].toLowerCase());
const storage = (page) => page.evaluate(() => ({ ...localStorage }));
const resetBtn = (page) => page.getByRole('button', { name: 'Reset to defaults' });

// Seed an explicit sky phase so "reset restored the default (Auto)" is distinguishable from
// "nothing changed" — reset should drop the override and go back to following the clock.
const seedPhase = 'night';

// WHAT A RESET LANDS ON. Two groups, not five — and that is the point of the reset, not a
// shortcoming of it: clearing `ksh-look` returns the site to PIXELITE, whose Settings is sparse.
// Sky background and Stars are Aeropalite's controls and are simply not drawn once you are back on
// the default theme; Button style went with the flat/bubble axis and exists in neither.
// ('Station label style' was here too; the codes/full-names toggle is gone — stops are always
// named in full. The key is still seeded below, because a reset must still wipe a stale saved one.)
const DEFAULTS = {
	'Display mode': 'system',
	Theme: 'pixelite'
};

// ── 1. On a fresh visit the button is present but disabled ──────────────────
{
	const { ctx, page } = await open();
	await resetBtn(page).scrollIntoViewIfNeeded();
	ok('reset button exists', await resetBtn(page).isVisible());
	ok('disabled at defaults', await resetBtn(page).isDisabled());
	ok('note says already default', await page.getByText('No changes have been made.').isVisible());
	await ctx.close();
}

// ── 2. Change everything → reset restores all six, live, no reload ──────────
{
	const { ctx, page } = await open({
		'ksh-stop-names': '0',
		// AEROPALITE, so there is a theme to be reset AWAY from — and so the sky and the panel it
		// brings with it are on screen to be taken away again below.
		'ksh-look': 'aeropalite',
		'ksh-theme': 'dark',
		'ksh-sky': seedPhase,
		'ksh-stars': '0',
		// an unrelated key that must survive
		'ksh-panel-expanded': '1',
		'ksh-content': '{"x":1}'
	});
	let loads = 0;
	page.on('load', () => loads++);

	ok('button enabled when settings differ', await resetBtn(page).isEnabled());
	ok(
		'dark theme applied to <html>',
		(await page.locator('html').getAttribute('data-theme')) === 'dark'
	);
	ok(
		'aeropalite stamps data-ui=bubble on <html>',
		(await page.locator('html').getAttribute('data-ui')) === 'bubble'
	);
	ok('aeropalite draws the panel', await page.locator('aside.surface').isVisible());
	ok(
		`seeded sky applied to <html> (${seedPhase})`,
		(await page.locator('html').getAttribute('data-sky')) === seedPhase
	);

	await resetBtn(page).click();
	await page.waitForTimeout(1200);

	for (const [group, expected] of Object.entries(DEFAULTS)) {
		let got = '';
		try {
			got = await checkedIn(page, group);
		} catch {
			got = '<none>';
		}
		ok(`reset → ${group} = ${expected}`, got === expected, got);
	}

	ok('reset → no page reload', loads === 0, `${loads}`);
	ok(
		'reset → data-theme removed',
		(await page.locator('html').getAttribute('data-theme')) === null
	);
	// PIXELITE IS THE DEFAULT, so a reset STRIPS data-ui — `static/preflight.js` stamps it for
	// Aeropalite and for nothing else. This asserted the opposite back when Bubble was the default.
	ok(
		'reset → data-ui stripped (pixelite default)',
		(await page.locator('html').getAttribute('data-ui')) === null
	);
	ok(
		'reset → the look is back to the default',
		(await page.locator('html').getAttribute('data-look')) === 'pixelite'
	);
	// AND THE SKY GOES ENTIRELY. This expected a clock-driven phase, on the reasoning that Auto is
	// the default and Auto still paints one. That was true while the default theme drew a sky —
	// Pixelite does not, so `data-sky` is removed outright rather than repainted.
	ok(
		'reset → the sky attribute goes with the theme',
		(await page.locator('html').getAttribute('data-sky')) === null,
		String(await page.locator('html').getAttribute('data-sky'))
	);
	// …and the PANEL goes with it: back on the default theme, /settings is a docs page in the
	// shell. It used to assert `aside.surface` was still visible, which was really asserting that
	// the reset had NOT changed the chrome. It should, and it does.
	ok('reset → the chrome is the docs shell now', !(await page.locator('aside.surface').count()));
	ok('reset → still on the settings page', page.url() === `${B}/settings`, page.url());
	// THE TOAST IS ASSERTED AGAIN, and this is the assertion that was missing while the bug lived.
	// It used to be rendered INSIDE the stage — and a reset clears `ksh-look`, so it returns the
	// site to Pixelite and unmounts the stage in the SAME TICK the toast is raised. Measured then
	// at 150ms and at 4s: it never appeared, so a reset confirmed nothing at all on the default
	// theme. The toast is the page's now, outside both look branches.
	ok('reset → toast shown', await page.getByText('Settings reset to defaults').isVisible());
	ok('reset → button now disabled', await resetBtn(page).isDisabled());

	// Storage: prefs forgotten entirely, unrelated keys untouched.
	const ls = await storage(page);
	const leftover = PREF_KEYS.filter((k) => k in ls);
	ok('reset → pref keys removed, not overwritten', leftover.length === 0, leftover.join(','));
	ok('reset → unrelated ksh-content survives', ls['ksh-content'] === '{"x":1}');
	ok('reset → unrelated ksh-panel-expanded survives', ls['ksh-panel-expanded'] === '1');
	await ctx.close();
}

// ── 3. The reset survives a reload (it really cleared storage) ──────────────
{
	const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
	const page = await ctx.newPage();
	await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => {
		localStorage.setItem('ksh-theme', 'dark');
	});
	await page.goto(`${B}/settings`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(1000);
	await resetBtn(page).click();
	await page.waitForTimeout(600);
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(1200);
	ok('after reload → still System', (await checkedIn(page, 'Display mode')) === 'system');
	ok('after reload → button disabled again', await resetBtn(page).isDisabled());
	await ctx.close();
}

// ── 4. An explicit pick of a default value counts as "already default" ──────
{
	const { ctx, page } = await open({ 'ksh-stop-names': '1' });
	ok('explicit-but-default settings disable the button', await resetBtn(page).isDisabled());
	await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
