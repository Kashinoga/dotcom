import { firefox } from 'playwright';
import { readFile } from 'node:fs/promises';

const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await firefox.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });

async function freshBuilder() {
	const page = await ctx.newPage();
	await page.goto(`${B}/apps/presentation-builder`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'New from template' }).click();
	await page.waitForTimeout(1200);
	return page;
}
const download = async (page) =>
	readFile(
		await (
			await Promise.all([
				page.waitForEvent('download', { timeout: 10000 }),
				page.locator('button[title="Download a copy"]').click()
			])
		)[0].path(),
		'utf8'
	);

// ── 1. HTML-special characters are escaped, and survive a re-parse ──────────
{
	const page = await freshBuilder();
	const nasty = 'Tom & Jerry <3 "quotes" </span>';
	await page.locator('.ticker-row input').nth(0).fill(nasty);
	await page.waitForTimeout(300);
	const out = await download(page);

	ok('special chars escaped in output', out.includes('Tom &amp; Jerry &lt;3'), );
	ok('no raw </span> injected', !out.includes('<3 "quotes" </span></span>'));
	ok(
		'ticker-item count still 12 (markup not broken)',
		(out.match(/class="ticker-item"/g) || []).length === 12,
		`${(out.match(/class="ticker-item"/g) || []).length}`
	);

	// Re-parse the exported file: the phrase must come back exactly as typed.
	const roundTripped = await page.evaluate((html) => {
		const doc = new DOMParser().parseFromString(html, 'text/html');
		const g = doc.querySelector('#ticker .ticker-group');
		return Array.from(g.querySelectorAll('.ticker-item')).map((e) => e.textContent.trim());
	}, out);
	ok('round-trips back to the typed text', roundTripped[0] === nasty, JSON.stringify(roundTripped[0]));
	ok('cycle intact after escape', roundTripped.length === 6, `${roundTripped.length}`);
	await page.close();
}

// ── 2. Deleting every phrase exports an empty strip, not the originals ──────
{
	const page = await freshBuilder();
	for (let i = 0; i < 3; i++) {
		await page.getByRole('button', { name: 'Remove phrase 1' }).click();
		await page.waitForTimeout(150);
	}
	ok('all rows removed', (await page.locator('.ticker-row').count()) === 0);
	ok('empty hint shown', await page.getByText('the strip will export empty').isVisible());

	const out = await download(page);
	ok('no ticker items exported', (out.match(/class="ticker-item"/g) || []).length === 0);
	ok('original phrases NOT resurrected', !out.includes('A route map of my internet'));
	ok('ticker groups still present', (out.match(/class="ticker-group"/g) || []).length === 2);
	ok('deck otherwise intact', /<div id="deck">/.test(out) && /const stationLabels = \[/.test(out));
	await page.close();
}

// ── 3. A blank phrase is dropped, not exported as an empty span ─────────────
{
	const page = await freshBuilder();
	await page.locator('.ticker-row input').nth(1).fill('   ');
	await page.waitForTimeout(300);
	const out = await download(page);
	const items = (out.match(/class="ticker-item"/g) || []).length;
	ok('blank phrase omitted (2 phrases × 2 × 2 = 8)', items === 8, `${items}`);
	ok('no empty span emitted', !/<span class="ticker-item"><\/span>/.test(out));
	await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
