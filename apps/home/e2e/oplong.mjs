import { artifact } from './artifacts.mjs';
import { firefox } from 'playwright';

const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	// Detail only on failure — printing it on PASS reads like the assertion is complaining.
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  — got: ' + detail : ''}`);
};

const LONG = 'GULF & CARIBBEAN CARGO / CONTRACT AIR CARGO'; // the real DSM entry
const LONGWORD = 'AIR TRANSPORT INTERNATIONAL'; // long final word → hard cut
const SHORT = 'SOUTHWEST AIRLINES CO'; // tidyOp strips CO → 18 chars, untouched

const AC = [
	{
		hex: 'a1b2c3',
		flight: 'GCC201 ',
		t: 'B763',
		r: 'N741CX',
		ownOp: LONG,
		desc: 'BOEING 767-300',
		lat: 41.6,
		lon: -93.7,
		alt_baro: 4200,
		gs: 240,
		track: 310,
		baro_rate: -900
	},
	{
		hex: 'd4e5f6',
		flight: 'ATN15  ',
		t: 'B752',
		r: 'N123AA',
		ownOp: LONGWORD,
		desc: 'BOEING 757-200',
		lat: 41.7,
		lon: -93.6,
		alt_baro: 21000,
		gs: 410,
		track: 90,
		baro_rate: 1200
	},
	{
		hex: '112233',
		flight: 'SWA88  ',
		t: 'B738',
		r: 'N8600F',
		ownOp: SHORT,
		desc: 'BOEING 737-800',
		lat: 41.4,
		lon: -93.5,
		alt_baro: 'ground',
		gs: 12,
		track: 180,
		baro_rate: null
	},
	{
		hex: '445566',
		flight: 'N771QS ',
		t: 'C68A',
		r: 'N771QS',
		ownOp: '',
		desc: 'CESSNA 680A',
		lat: 41.45,
		lon: -93.55,
		alt_baro: 8000,
		gs: 300,
		track: 45,
		baro_rate: 400
	}
];

// The flap renders a hidden sizer + a visible glyph per letter, so textContent doubles
// every character. Read the accessible name instead, and the *visible* glyphs separately.
const flapVisible = (td) =>
	td.evaluate((el) =>
		// .sp and .glyph in document order == exactly the glyphs the eye sees.
		[...el.querySelectorAll('.flap .sp, .flap .glyph')]
			.map((n) => (n.classList.contains('sp') ? ' ' : n.textContent))
			.join('')
			.replace(/ /g, ' ')
	);
const flapLabel = (td) =>
	td.evaluate((el) => el.querySelector('.flap')?.getAttribute('aria-label'));

// Rows are sorted nearest-first, so never address them by index.
const opCellFor = (page, callsign) =>
	page
		.locator('tbody tr', { has: page.locator(`td.flight .flap[aria-label="${callsign}"]`) })
		.locator('td.op');

const browser = await firefox.launch();

// THE BOARD OPENS EXPANDED. This used to take a `expand` flag and click "Expand panel to fill" to
// widen the container — and THAT CONTROL IS GONE: only the apps designed to fill the viewport do,
// and they arrive that way. Measured, `/apps/air-traffic` lands with `aside.surface.expanded` and
// no button on the page matches /expand/i, so the click waited out its full timeout and took the
// suite down before assertion one. The flag went with it; no caller ever passed false.
async function board({ width = 1600, reduce = false } = {}) {
	const ctx = await browser.newContext({
		viewport: { width, height: 1000 },
		reducedMotion: reduce ? 'reduce' : 'no-preference'
	});
	const page = await ctx.newPage();
	await page.route('**/api/traffic**', (r) => r.fulfill({ json: { ac: AC } }));
	await page.route('**api.adsbdb.com/**', (r) => r.abort()); // no enrichment → raw ownOp path
	await page.goto(`${B}/apps/air-traffic?field=dsm`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(1400);
	await page.waitForTimeout(3000);
	return { ctx, page };
}

// The flap budget is now a function of the board's container width (OP_TIERS), so every
// expectation below names the width it was measured at. 1600px viewport, expanded → a
// 1512px container → the 40-flap tier.

// ── 1. The long name is truncated at a word boundary, with the full name on hover ──
{
	const { ctx, page } = await board();
	const cells = page.locator('td.op');
	ok('four operator cells', (await cells.count()) === 4, String(await cells.count()));

	const c0 = opCellFor(page, 'GCC201');
	const vis0 = await flapVisible(c0);
	ok(
		'long name is truncated',
		vis0 === 'Gulf & Caribbean Cargo / Contract Air…',
		JSON.stringify(vis0)
	);
	ok('truncated to <= 40 flaps (wide tier)', [...vis0].length <= 40, String([...vis0].length));
	ok('no ellipsis dangling off a separator', !/[\s/,.&-]…$/.test(vis0), vis0);
	ok(
		'full name is the cell tooltip',
		(await c0.getAttribute('title')) === 'Gulf & Caribbean Cargo / Contract Air Cargo',
		String(await c0.getAttribute('title'))
	);
	ok(
		'full name is the accessible name',
		(await flapLabel(c0)) === 'Gulf & Caribbean Cargo / Contract Air Cargo',
		String(await flapLabel(c0))
	);

	// ── 2. A long FINAL word hard-cuts rather than losing the word entirely ──
	// 27 chars fits inside the 40-flap tier untouched — the hard-cut path is exercised at
	// the narrow tier in section 7 instead.
	const c1 = opCellFor(page, 'ATN15');
	const vis1 = await flapVisible(c1);
	ok(
		'a 27-char name fits the wide tier whole',
		vis1 === 'Air Transport International',
		JSON.stringify(vis1)
	);
	ok(
		'untruncated name has no tooltip',
		(await c1.getAttribute('title')) === null,
		String(await c1.getAttribute('title'))
	);

	// ── 3. A short name is untouched and gets NO tooltip (no redundant noise) ──
	const c2 = opCellFor(page, 'SWA88');
	ok(
		'short name untouched',
		(await flapVisible(c2)) === 'Southwest Airlines',
		await flapVisible(c2)
	);
	ok(
		'short name has no tooltip',
		(await c2.getAttribute('title')) === null,
		String(await c2.getAttribute('title'))
	);
	ok(
		'short name accessible name matches what is shown',
		(await flapLabel(c2)) === 'Southwest Airlines',
		String(await flapLabel(c2))
	);

	// ── 4. Missing operator still shows the em-dash placeholder ──
	const c3 = opCellFor(page, 'N771QS');
	ok('empty operator → em dash', (await flapVisible(c3)) === '—', await flapVisible(c3));
	ok(
		'em dash has no tooltip',
		(await c3.getAttribute('title')) === null,
		String(await c3.getAttribute('title'))
	);

	// ── 5. THE BUG: no cell may paint outside its own box, or over its neighbour ──
	for (let i = 0; i < 4; i++) {
		const td = cells.nth(i);
		const m = await td.evaluate((el) => {
			const ink = el.querySelector('.flap').getBoundingClientRect();
			const next = el.nextElementSibling.getBoundingClientRect();
			return {
				inkRight: ink.right,
				nextLeft: next.left,
				scrollW: el.scrollWidth,
				clientW: el.clientWidth
			};
		});
		ok(
			`row ${i}: content fits its cell`,
			m.scrollW <= m.clientW + 1,
			`scrollW=${m.scrollW} clientW=${m.clientW}`
		);
		ok(
			`row ${i}: ink never reaches the Alt column`,
			m.inkRight <= m.nextLeft + 0.5,
			`inkRight=${m.inkRight.toFixed(1)} nextLeft=${m.nextLeft.toFixed(1)}`
		);
	}

	// ── 6. The table itself no longer overflows the board ──
	const bd = await page
		.locator('.board')
		.first()
		.evaluate((el) => ({ c: el.clientWidth, s: el.scrollWidth }));
	ok('board does not scroll horizontally', bd.s <= bd.c, `${bd.s} > ${bd.c}`);
	const doc = await page.evaluate(() => ({
		c: document.documentElement.clientWidth,
		s: document.documentElement.scrollWidth
	}));
	ok('page does not scroll horizontally', doc.s <= doc.c, `${doc.s} > ${doc.c}`);

	await page.screenshot({ path: artifact('oplong-after.png') });
	await ctx.close();
}

// ── 7. The narrowest width where the column appears: a 957px container → 22-flap tier ──
{
	const { ctx, page } = await board({ width: 1040 });
	const cells = page.locator('td.op');
	const visible = await cells.first().isVisible();
	ok('operator column present near its 940px breakpoint', visible);
	if (visible) {
		const containerW = await page.locator('.scroll').evaluate((el) => el.clientWidth);
		ok(
			'narrow: container is just past the 940px breakpoint',
			containerW >= 940 && containerW < 1080,
			String(containerW)
		);
		const nv0 = await flapVisible(opCellFor(page, 'GCC201'));
		ok('narrow: budget shrinks with the board', nv0 === 'Gulf & Caribbean…', JSON.stringify(nv0));
		ok('narrow: within the 22-flap tier', [...nv0].length <= 22, String([...nv0].length));
		// Backtracking to a word boundary is preferred while it keeps >=60% of the budget:
		// at 22 flaps the cut lands mid-"International" and "Air Transport" (13 of 21) clears
		// the bar, so the partial word is dropped rather than shown as "Interna…".
		const nv1 = await flapVisible(opCellFor(page, 'ATN15'));
		ok('narrow: backs up to a word boundary', nv1 === 'Air Transport…', JSON.stringify(nv1));
		ok('narrow: never exceeds the budget', [...nv1].length <= 22, String([...nv1].length));
		ok(
			'narrow: truncated name is tooltipped',
			(await opCellFor(page, 'ATN15').getAttribute('title')) === 'Air Transport International'
		);
	}
	if (visible) {
		for (let i = 0; i < 4; i++) {
			const m = await cells.nth(i).evaluate((el) => {
				const ink = el.querySelector('.flap').getBoundingClientRect();
				const next = el.nextElementSibling.getBoundingClientRect();
				return { inkRight: ink.right, nextLeft: next.left };
			});
			ok(
				`narrow row ${i}: ink never reaches Alt`,
				m.inkRight <= m.nextLeft + 0.5,
				`${m.inkRight.toFixed(1)} vs ${m.nextLeft.toFixed(1)}`
			);
		}
		const bd = await page
			.locator('.board')
			.first()
			.evaluate((el) => ({ c: el.clientWidth, s: el.scrollWidth }));
		ok('narrow board does not scroll horizontally', bd.s <= bd.c, `${bd.s} > ${bd.c}`);
	}
	await page.screenshot({ path: artifact('oplong-narrow.png') });
	await ctx.close();
}

// ── 8. Reduced motion: no flap scramble, but truncation + tooltip still hold ──
{
	const { ctx, page } = await board({ reduce: true });
	const c0 = opCellFor(page, 'GCC201');
	ok(
		'reduced motion: still truncated',
		(await flapVisible(c0)) === 'Gulf & Caribbean Cargo / Contract Air…',
		await flapVisible(c0)
	);
	ok(
		'reduced motion: still tooltipped',
		(await c0.getAttribute('title')) === 'Gulf & Caribbean Cargo / Contract Air Cargo',
		String(await c0.getAttribute('title'))
	);
	await ctx.close();
}

// ── 9. The photo card keeps the FULL operator (truncation is a column concern) ──
{
	const { ctx, page } = await board();
	await page
		.locator('tbody tr', { has: page.locator('td.flight .flap[aria-label="GCC201"]') })
		.locator('button.type-btn')
		.click();
	await page.waitForTimeout(900);
	const card = await page.locator('.photo-card').first().innerText();
	ok(
		'photo card shows the full operator',
		card.includes('Gulf & Caribbean Cargo / Contract Air Cargo'),
		card.slice(0, 200).replace(/\n/g, ' | ')
	);
	await ctx.close();
}

// ── 10. Every tier: more board width buys more flaps, and nothing ever overflows ──
{
	let prev = 0;
	for (const width of [1040, 1200, 1400, 1600, 1920, 2560]) {
		const { ctx, page } = await board({ width });
		const cell = opCellFor(page, 'GCC201');
		const vis = await flapVisible(cell);
		const containerW = await page.locator('.scroll').evaluate((el) => el.clientWidth);
		const geom = await page.locator('.scroll').evaluate((el) => ({
			overflow: el.scrollWidth > el.clientWidth,
			docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
		}));
		const ink = await cell.evaluate((el) => {
			const f = el.querySelector('.flap').getBoundingClientRect();
			const n = el.nextElementSibling.getBoundingClientRect();
			return f.right - n.left;
		});
		const n = [...vis].length;
		ok(`@${width}: shown chars never shrink as the board grows`, n >= prev, `${n} < ${prev}`);
		ok(`@${width}: board never scrolls horizontally`, !geom.overflow && !geom.docOverflow);
		ok(`@${width}: operator ink never reaches the Alt column`, ink <= 0.5, ink.toFixed(1));
		ok(
			`@${width}: full name always available as a tooltip when cut`,
			n === 'Gulf & Caribbean Cargo / Contract Air Cargo'.length
				? (await cell.getAttribute('title')) === null
				: (await cell.getAttribute('title')) === 'Gulf & Caribbean Cargo / Contract Air Cargo'
		);
		console.log(`      container ${containerW}px → ${n} flaps: "${vis}"`);
		prev = n;
		await ctx.close();
	}
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
