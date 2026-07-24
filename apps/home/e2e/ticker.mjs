import { firefox } from 'playwright';
import { readFile } from 'node:fs/promises';

const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await firefox.launch();
const page = await browser.newPage({
	viewport: { width: 1600, height: 1000 },
	acceptDownloads: true
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`${B}/apps/presentation-builder`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New from template' }).click();
await page.waitForTimeout(1200);

const rows = page.locator('.ticker-row');
const inputs = page.locator('.ticker-row input');

// ── the cycle is recovered, not the repeated markup ─────────────────────────
const n = await rows.count();
ok('ticker section appears', n > 0, `${n} rows`);
ok('cycle deduped to 3 phrases (file has 12 items)', n === 3, `${n}`);
const readAll = () =>
	page.locator('.ticker-row input').evaluateAll((els) => els.map((e) => e.value));
const initial = await readAll();
ok(
	'phrases parsed in order',
	initial[0] === 'A route map of my internet' &&
		initial[1] === 'Publicly available data, made good to look at' &&
		initial[2] === 'Take care',
	JSON.stringify(initial)
);

// ── edit, reorder, add, delete ──────────────────────────────────────────────
await inputs.nth(2).fill('Mind the gap');
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Move phrase 3 up' }).click();
await page.waitForTimeout(200);
let after = await readAll();
ok('move up reorders', after[1] === 'Mind the gap', JSON.stringify(after));

await page.getByRole('button', { name: '+ Add phrase' }).click();
await page.waitForTimeout(200);
await page.locator('.ticker-row input').nth(3).fill('Ad astra');
await page.waitForTimeout(200);
ok('add appends a phrase', (await rows.count()) === 4);

await page.getByRole('button', { name: 'Remove phrase 1' }).click();
await page.waitForTimeout(300);
after = await readAll();
ok(
	'remove drops the right phrase',
	after.length === 3 && !after.includes('A route map of my internet'),
	JSON.stringify(after)
);
ok(
	'final order',
	JSON.stringify(after) ===
		JSON.stringify(['Mind the gap', 'Publicly available data, made good to look at', 'Ad astra']),
	JSON.stringify(after)
);

// ── disabled edges ──────────────────────────────────────────────────────────
ok(
	'first row cannot move up',
	await page.getByRole('button', { name: 'Move phrase 1 up' }).isDisabled()
);
ok(
	'last row cannot move down',
	await page.getByRole('button', { name: 'Move phrase 3 down' }).isDisabled()
);

// ── export and inspect the file ─────────────────────────────────────────────
const dl = await Promise.all([
	page.waitForEvent('download', { timeout: 10000 }),
	page.locator('button[title="Download a copy"]').click()
]).then((r) => r[0]);
const path = await dl.path();
const out = await readFile(path, 'utf8');

const count = (s) =>
	(out.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

// repeat=2 per group × 2 groups = 4 occurrences of each phrase
ok('new phrase written 4×', count('>Mind the gap<') === 4, `${count('>Mind the gap<')}`);
ok('added phrase written 4×', count('>Ad astra<') === 4, `${count('>Ad astra<')}`);
ok(
	'kept phrase written 4×',
	count('>Publicly available data, made good to look at<') === 4,
	`${count('>Publicly available data, made good to look at<')}`
);
ok(
	'deleted phrase is gone',
	count('A route map of my internet') === 0,
	`${count('A route map of my internet')}`
);
ok('removed old phrase "Take care" gone', count('>Take care<') === 0);

// structure preserved
ok(
	'two ticker-group divs remain',
	count('class="ticker-group"') === 2,
	`${count('class="ticker-group"')}`
);
ok('second group keeps aria-hidden', /<div class="ticker-group" aria-hidden="true">/.test(out));
ok('ticker wrapper intact', /<div id="ticker" aria-hidden="true">/.test(out));
ok('ticker-track intact', count('class="ticker-track"') === 1);
ok(
	'item count is phrases × repeat × groups',
	count('class="ticker-item"') === 3 * 2 * 2,
	`${count('class="ticker-item"')}`
);

// rest of the deck untouched
ok('deck still present', /<div id="deck">/.test(out));
ok('confetti canvas survives', /<canvas id="confetti-canvas">/.test(out));
ok('stationLabels survive', /const stationLabels = \[/.test(out));
ok('slides survive', count('class="slide') >= 3, `${count('class="slide')}`);
ok('no contenteditable leaked', count('contenteditable') === 0);

const real = errors.filter((e) => !/favicon|devtools|font/i.test(e));
ok('no page errors', real.length === 0, real.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
