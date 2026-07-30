import { chromium, firefox, webkit } from 'playwright';
const B = process.env.BASE || 'http://localhost:5199';

// The Apps panel's onward cards, packed into two columns on desktop and one on a phone.
//
// THIS SUITE IS CROSS-ENGINE, and that is the whole point of it. The layout was CSS multicol
// once, and WebKit does not reliably paint a column after the first: Safari left the second
// column's top card as an empty slot and headless WebKit dropped the column entirely, while
// Chromium and Firefox rendered it perfectly. Every other suite here runs Firefox alone, so
// nothing in the repo could have caught it — the bug reached a person looking at Safari.
//
// It also can't be caught by reading the DOM: through the whole failure the cards reported
// correct getBoundingClientRect()s at opacity 1. Geometry was right; only PAINT was missing.
// So the checks below come in two kinds:
//   structural — two real lists, both flush at the top, and NOT multicol (the fix, locked in)
//   painted    — a screenshot of the second column, which must not come back blank
const ENGINES = [
	['chromium', chromium],
	['firefox', firefox],
	['webkit', webkit]
];

const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  — ' + detail : ''}`);
};

const probe = () => {
	const wrap = document.querySelector('.surface-body .app-cols');
	if (!wrap) return { err: 'no .app-cols in the panel body' };
	const wr = wrap.getBoundingClientRect();
	const lists = [...wrap.querySelectorAll(':scope > .app-cards')];
	const box = (e) => e.getBoundingClientRect();
	return {
		lists: lists.length,
		// Offset of each list from the wrapper's own top: both columns must start level.
		tops: lists.map((u) => +(box(u).top - wr.top).toFixed(1)),
		xs: lists.map((u) => Math.round(box(u).left)),
		counts: lists.map((u) => u.querySelectorAll(':scope > li').length),
		// Every card the panel drew, however the columns divided them. Compared against the sum
		// below so the claim is "none was lost", which is what this is actually about.
		total: wrap.querySelectorAll('.app-card').length,
		names: lists.map((u) => [...u.querySelectorAll('.app-name')].map((n) => n.textContent.trim())),
		// The multicol that caused the bug. `auto` means we are not using it.
		columnCount: getComputedStyle(wrap).columnCount,
		listColumnCount: lists.map((u) => getComputedStyle(u).columnCount),
		side: getComputedStyle(wrap).flexDirection
	};
};

for (const [name, engine] of ENGINES) {
	let browser;
	try {
		browser = await engine.launch();
	} catch (e) {
		// A missing engine must be LOUD. Reporting nothing here would turn the one suite that
		// covers Safari into a silent no-op — precisely the failure it exists to prevent.
		ok(
			`${name}: browser is installed (pnpm --filter home exec playwright install ${name})`,
			false,
			e.message.split('\n')[0]
		);
		continue;
	}
	console.log(`\n[${name}]`);

	// ── Desktop: two columns, side by side, both starting level ───────────────
	{
		const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
		await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
		await page.evaluate(() => {
			// AEROPALITE, and the seed is the whole reason this suite still means anything. What it
			// guards is a WebKit PAINT bug in the Apps PANEL's two-column card split — and under
			// Pixelite there is no panel: `/apps` is a docs sheet in the shell, where the same cards
			// flow into one auto-fill grid with the two `.app-cards` lists set to `display: contents`
			// (see `.app-page` in $lib/DocsBody). That layout has no second column to drop, so it
			// cannot exercise the bug; asking it to would be testing a different thing under an old
			// name. Pixelite's grid wants its own coverage, in its own suite.
			localStorage.setItem('ksh-look', 'aeropalite');
			localStorage.setItem('ksh-sky', 'off');
			localStorage.setItem('ksh-theme', 'light');
		});
		await page.goto(B + '/apps', { waitUntil: 'networkidle' });
		await page.waitForTimeout(1400);
		const g = await page.evaluate(probe);

		ok(`${name}: the panel body packs cards into columns`, !g.err, g.err);
		if (!g.err) {
			ok(`${name}: two real lists, not one multicol list`, g.lists === 2, `lists=${g.lists}`);
			ok(
				`${name}: neither the wrapper nor a list uses CSS columns`,
				g.columnCount === 'auto' && g.listColumnCount.every((c) => c === 'auto'),
				`wrap=${g.columnCount} lists=${g.listColumnCount.join('/')}`
			);
			ok(`${name}: the columns sit side by side`, g.side === 'row', g.side);
			ok(
				`${name}: both columns start flush at the top`,
				g.tops.every((t) => t === g.tops[0]),
				`tops=${g.tops.join(', ')}`
			);
			ok(
				`${name}: the columns are in different places`,
				new Set(g.xs).size === 2,
				`x=${g.xs.join(', ')}`
			);
			// DERIVED, not written down. This said `=== 7` and the register has nine apps in it now —
			// the number went stale the day one was added, and a hard-coded total has to be re-found
			// by hand every time. What the assertion is really about is that the split lost none of
			// them, so it counts the cards that are there and checks the columns add up to that.
			ok(
				`${name}: every card landed in a column`,
				g.counts.reduce((a, b) => a + b, 0) === g.total && g.total > 0,
				`counts=${g.counts.join('+')} of ${g.total}`
			);
			// The cut is contiguous so the stacked phone order stays alphabetical (see cardSplit).
			const flat = g.names.flat();
			ok(
				`${name}: cards read alphabetically down the columns`,
				JSON.stringify(flat) === JSON.stringify([...flat].sort((a, b) => a.localeCompare(b))),
				flat.join(' | ')
			);

			// ── …and the second column is actually PAINTED ─────────────────────
			// The bug that motivated this suite left correct geometry behind, so the only proof
			// is pixels. This reads the PIXELS THEMSELVES rather than guessing from a PNG's
			// compressed size: a screenshot is decoded on a canvas and the column is checked for
			// ink of its own. Compressed-size was the first attempt and it's a poor instrument —
			// the threshold has to be picked loose enough to survive font and theme differences
			// across three engines, which leaves it far too loose to notice, say, one missing
			// card out of four.
			//
			// Guarded: a hidden or detached column makes .screenshot() THROW rather than return
			// something small, and an uncaught throw here would abandon every engine still to
			// run — including the one engine this suite exists for. A column that can't be
			// photographed is a failure, not a crash.
			let ink = null,
				shotErr = '';
			try {
				const shot = await page
					.locator('.surface-body .app-cols > .app-cards')
					.nth(1)
					.screenshot({ timeout: 5000 });
				ink = await page.evaluate(async (b64) => {
					const img = new Image();
					img.src = 'data:image/png;base64,' + b64;
					await img.decode();
					const c = document.createElement('canvas');
					c.width = img.naturalWidth;
					c.height = img.naturalHeight;
					const ctx = c.getContext('2d', { willReadFrequently: true });
					ctx.drawImage(img, 0, 0);
					const { data } = ctx.getImageData(0, 0, c.width, c.height);
					// The page is pinned to the light theme, so the column's own marks — card
					// edges, the accent squircles, the type — are everything that isn't near-white.
					let inked = 0;
					const total = c.width * c.height;
					for (let i = 0; i < data.length; i += 4) {
						if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) inked++;
					}
					// Rows that carry ink: a card spans the column's width, so a MISSING card
					// leaves a band of blank rows even when its neighbours paint fine.
					let inkedRows = 0;
					for (let y = 0; y < c.height; y++) {
						for (let x = 0; x < c.width; x++) {
							const i = (y * c.width + x) * 4;
							if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) {
								inkedRows++;
								break;
							}
						}
					}
					return {
						pct: +((100 * inked) / total).toFixed(2),
						rowPct: +((100 * inkedRows) / c.height).toFixed(1),
						w: c.width,
						h: c.height
					};
				}, shot.toString('base64'));
			} catch (e) {
				shotErr = e.message.split('\n')[0];
			}
			ok(
				`${name}: the second column has ink of its own`,
				!!ink && ink.pct > 1,
				ink ? `${ink.pct}% of ${ink.w}×${ink.h}px` : shotErr
			);
			// Four cards separated by 12px gaps leave only thin blank bands, so the great
			// majority of rows carry something. A dropped card would take a ~130px bite out of
			// this; a dropped COLUMN takes all of it.
			ok(
				`${name}: the column paints down its whole length`,
				!!ink && ink.rowPct > 85,
				ink ? `${ink.rowPct}% of rows inked` : shotErr
			);
		}
		await page.close();
	}

	// ── Phone: the columns stack, and the reading order survives ──────────────
	{
		const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
		await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
		await page.evaluate(() => {
			// AEROPALITE, and the seed is the whole reason this suite still means anything. What it
			// guards is a WebKit PAINT bug in the Apps PANEL's two-column card split — and under
			// Pixelite there is no panel: `/apps` is a docs sheet in the shell, where the same cards
			// flow into one auto-fill grid with the two `.app-cards` lists set to `display: contents`
			// (see `.app-page` in $lib/DocsBody). That layout has no second column to drop, so it
			// cannot exercise the bug; asking it to would be testing a different thing under an old
			// name. Pixelite's grid wants its own coverage, in its own suite.
			localStorage.setItem('ksh-look', 'aeropalite');
			localStorage.setItem('ksh-sky', 'off');
			localStorage.setItem('ksh-theme', 'light');
		});
		await page.goto(B + '/apps', { waitUntil: 'networkidle' });
		await page.waitForTimeout(1400);
		const g = await page.evaluate(probe);
		if (!g.err) {
			ok(`${name}: phone stacks the columns`, g.side === 'column', g.side);
			ok(
				`${name}: phone puts every list in the same place`,
				new Set(g.xs).size === 1,
				`x=${g.xs.join(', ')}`
			);
			// Stacked, the two contiguous halves must read back as the one alphabetical run.
			const flat = g.names.flat();
			ok(
				`${name}: phone order is still alphabetical`,
				JSON.stringify(flat) === JSON.stringify([...flat].sort((a, b) => a.localeCompare(b))),
				flat.join(' | ')
			);
		}
		await page.close();
	}

	await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
