import { firefox } from 'playwright';

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
		.innerText();

// ── 1. A first-ever visitor sees the six requested defaults ─────────────────
{
	const { ctx, page } = await firstVisit();
	const want = {
		'Route map style': 'Train',
		'Station label style': 'Full names',
		'Display mode': 'System',
		'Button style': 'Flat',
		'Sky background': 'Auto',
		Stars: 'On'
	};
	for (const [group, expected] of Object.entries(want)) {
		let got = '';
		try {
			got = (await checkedIn(page, group)).trim().split('\n')[0];
		} catch (e) {
			got = '<none checked>';
		}
		ok(`default ${group} = ${expected}`, got === expected, got);
	}

	// The map itself must actually be the train map, not just the radio.
	const label = await page.locator('svg[role="img"]').getAttribute('aria-label');
	ok('map renders as the train map', /train route map/.test(label), label);

	// And station labels must be full names, not codes.
	const codes = await page
		.locator('a.node text')
		.evaluateAll((els) => els.map((e) => e.textContent.trim()));
	ok('stations show full names', codes.includes('Air Traffic'), codes.join(','));
	ok('stations do not show codes', !codes.includes('ATFC'), codes.join(','));
	await ctx.close();
}

// ── 2. Server-rendered HTML already says "train" (no SSR→client flip) ───────
{
	const res = await fetch(`${B}/`);
	const html = await res.text();
	ok('SSR html is the train map', /a train route map/.test(html));
	ok('SSR html is not the airline map', !/an airline route map/.test(html));
	ok('SSR html shows full station names', html.includes('>Air Traffic</text>'));
}

// ── 3. A saved preference still wins over the new defaults ──────────────────
{
	const { ctx, page } = await firstVisit({
		'ksh-map-mode': 'air',
		'ksh-stop-names': '0',
		'ksh-theme': 'dark',
		'ksh-ui': 'bubble',
		'ksh-sky': 'off',
		'ksh-stars': '0'
	});
	const want = {
		'Route map style': 'Airline',
		'Station label style': 'Codes',
		'Display mode': 'Dark',
		'Button style': 'Bubble',
		'Sky background': 'Off',
		Stars: 'Off'
	};
	for (const [group, expected] of Object.entries(want)) {
		let got = '';
		try {
			got = (await checkedIn(page, group)).trim().split('\n')[0];
		} catch {
			got = '<none checked>';
		}
		ok(`saved ${group} = ${expected} still wins`, got === expected, got);
	}
	await ctx.close();
}

// ── 4. Full names is now the default in airline mode too ───────────────────
{
	const { ctx, page } = await firstVisit({ 'ksh-map-mode': 'air' });
	const labels = await page
		.locator('a.node text')
		.evaluateAll((els) => els.map((e) => e.textContent.trim()));
	ok('airline mode also defaults to full names', labels.includes('Air Traffic'), labels.join(','));
	await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
