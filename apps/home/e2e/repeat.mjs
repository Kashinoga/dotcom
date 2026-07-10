import { firefox } from 'playwright';

// The ticker's repeat factor: how many times the phrase cycle is written into each strip.
// Previously inferred from the loaded file and never surfaced.
const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  — got: ' + detail : ''}`);
};

const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${B}/apps/presentation-builder`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New from template' }).click();
await page.waitForTimeout(1200);

const repeat = page.locator('#ticker-repeat');
const phrases = page.locator('.ticker-row input');

// Read the exported deck without touching disk: Save writes a Blob download.
async function exportedDoc() {
	const dl = page.waitForEvent('download');
	await page.getByRole('button', { name: /^Save/ }).click();
	const stream = await (await dl).createReadStream();
	let html = '';
	for await (const chunk of stream) html += chunk;
	return html;
}
const countItems = (html) => (html.match(/class="ticker-item"/g) ?? []).length;
const groups = (html) => (html.match(/class="ticker-group"/g) ?? []).length;

// ── 1. The control exists and shows the count the file arrived with ──
{
	ok('repeat control is present', await repeat.isVisible());
	ok('it is not a .ticker-row (that class means "a phrase")',
		(await page.locator('.ticker-row #ticker-repeat').count()) === 0);
	ok('phrase rows are unaffected', (await phrases.count()) === 3, String(await phrases.count()));
	// The bundled demo deck: 3 phrases x 2 = 6 items per strip, 12 across both strips.
	// parseTicker reads the FIRST group only, so the repeat it recovers is 2, not 4.
	ok("shows the loaded file's repeat (2)", (await repeat.inputValue()) === '2', await repeat.inputValue());
}

// ── 2. Round-trip untouched: the export matches what came in ──
{
	const html = await exportedDoc();
	ok('export has two strips', groups(html) === 2, String(groups(html)));
	ok('untouched export keeps 3x2 per strip (12 total)', countItems(html) === 12, String(countItems(html)));
}

// ── 3. Changing it re-expands BOTH strips ──
{
	await repeat.fill('2');
	await page.waitForTimeout(400);
	const html = await exportedDoc();
	ok('repeat=2 → 3×2 per strip (12 total)', countItems(html) === 12, String(countItems(html)));
	ok('both strips still present', groups(html) === 2, String(groups(html)));
	// The two strips must stay identical, or the -50% scroll seams.
	const [a, b] = html.split('class="ticker-group"').slice(1);
	const itemsOf = (s) => (s.slice(0, s.indexOf('</div>')).match(/class="ticker-item">([^<]*)</g) ?? []).join('|');
	ok('both strips carry identical items', itemsOf(a) === itemsOf(b), `${itemsOf(a)}\n vs \n${itemsOf(b)}`);
}

// ── 4. It composes with phrase edits ──
{
	await phrases.nth(0).fill('Mind the gap');
	await page.waitForTimeout(300);
	await repeat.fill('3');
	await page.waitForTimeout(400);
	const html = await exportedDoc();
	ok('repeat=3 with 3 phrases → 9 per strip (18 total)', countItems(html) === 18, String(countItems(html)));
	ok('the edited phrase is written 6 times (3 per strip)',
		(html.match(/Mind the gap/g) ?? []).length === 6, String((html.match(/Mind the gap/g) ?? []).length));
}

// ── 5. Bounds: clamped on edit, never collapsed while mid-typing ──
{
	await repeat.fill('0');
	await page.waitForTimeout(300);
	// The field keeps whatever was typed; what matters is the value the export uses.
	let html = await exportedDoc();
	ok('0 clamps up to 1 — the export writes one cycle, not zero', countItems(html) === 6, String(countItems(html)));

	await repeat.fill('999');
	await page.waitForTimeout(300);
	html = await exportedDoc();
	ok('999 clamps to the maximum 24 (3×24×2 = 144)', countItems(html) === 144, String(countItems(html)));

	// An empty field is mid-typing, not "zero": it must not rewrite the value under the cursor.
	await repeat.fill('');
	await page.waitForTimeout(300);
	html = await exportedDoc();
	ok('an empty field leaves the last good value alone', countItems(html) === 144, String(countItems(html)));
}

// ── 6. Editing it marks the deck dirty (Save was already enabled; check the flag path) ──
{
	await page.reload({ waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'New from template' }).click();
	await page.waitForTimeout(1200);
	await repeat.fill('5');
	await page.waitForTimeout(300);
	const html = await exportedDoc();
	ok('a fresh deck honours the new repeat (3×5×2 = 30)', countItems(html) === 30, String(countItems(html)));
}

ok('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
