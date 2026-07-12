import { firefox } from 'playwright';

const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const PREF_KEYS = ['ksh-stop-names', 'ksh-theme', 'ksh-sky', 'ksh-stars', 'ksh-ui'];
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
const checkedIn = (page, group) =>
	page
		.locator(`[role="radiogroup"][aria-label="${group}"] [aria-checked="true"]`)
		.first()
		.innerText()
		.then((t) => t.trim().split('\n')[0]);
const storage = (page) => page.evaluate(() => ({ ...localStorage }));
const resetBtn = (page) => page.getByRole('button', { name: 'Reset to defaults' });

// Seed an explicit sky phase so "reset restored the default (Auto)" is distinguishable from
// "nothing changed" — reset should drop the override and go back to following the clock.
const seedPhase = 'night';

const DEFAULTS = {
	// ('Station label style' was here; the codes/full-names toggle is gone — stops are always named
	// in full. The key is still seeded below, because a reset must still wipe a stale saved one.)
	'Display mode': 'System',
	'Button style': 'Flat',
	'Sky background': 'Auto',
	Stars: 'On'
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
		'ksh-theme': 'dark',
		'ksh-ui': 'bubble',
		'ksh-sky': seedPhase,
		'ksh-stars': '0',
		// an unrelated key that must survive
		'ksh-panel-expanded': '1',
		'ksh-content': '{"x":1}'
	});
	let loads = 0;
	page.on('load', () => loads++);

	ok('button enabled when settings differ', await resetBtn(page).isEnabled());
	ok('dark theme applied to <html>', (await page.locator('html').getAttribute('data-theme')) === 'dark');
	ok('bubble ui applied to <html>', (await page.locator('html').getAttribute('data-ui')) === 'bubble');
	ok(`seeded sky applied to <html> (${seedPhase})`, (await page.locator('html').getAttribute('data-sky')) === seedPhase);

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
	ok('reset → data-theme removed', (await page.locator('html').getAttribute('data-theme')) === null);
	ok('reset → data-ui removed', (await page.locator('html').getAttribute('data-ui')) === null);
	// Sky resets to Off (the new default) — the override attribute is removed entirely.
	// Auto is the default, so a reset does NOT strip data-sky — it repaints it with whatever phase
	// the clock is in. What must go is the stored override (checked with the other PREF_KEYS below).
	const skyNow = await page.locator('html').getAttribute('data-sky');
	const PHASES = ['dawn', 'morning', 'noon', 'dusk', 'night'];
	ok('reset → sky follows the clock again (Auto)', PHASES.includes(skyNow), String(skyNow));
	// (The "reset → map is the train map" and "Route map style = Train" checks were removed with
	// the transit-map motif — the map and its rail/air Settings toggle no longer exist.)
	ok('reset → settings panel still open', await page.locator('aside.surface').isVisible());
	ok('reset → URL unchanged', page.url() === `${B}/settings`, page.url());
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
	ok('after reload → still System', (await checkedIn(page, 'Display mode')) === 'System');
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
