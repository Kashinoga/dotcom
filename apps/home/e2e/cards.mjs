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
const ENGINES = [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]];

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
		ok(`${name}: browser is installed (pnpm --filter home exec playwright install ${name})`, false, e.message.split('\n')[0]);
		continue;
	}
	console.log(`\n[${name}]`);

	// ── Desktop: two columns, side by side, both starting level ───────────────
	{
		const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
		await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
		await page.evaluate(() => { localStorage.setItem('ksh-sky', 'off'); localStorage.setItem('ksh-theme', 'light'); });
		await page.goto(B + '/apps', { waitUntil: 'networkidle' });
		await page.waitForTimeout(1400);
		const g = await page.evaluate(probe);

		ok(`${name}: the panel body packs cards into columns`, !g.err, g.err);
		if (!g.err) {
			ok(`${name}: two real lists, not one multicol list`, g.lists === 2, `lists=${g.lists}`);
			ok(`${name}: neither the wrapper nor a list uses CSS columns`,
				g.columnCount === 'auto' && g.listColumnCount.every((c) => c === 'auto'),
				`wrap=${g.columnCount} lists=${g.listColumnCount.join('/')}`);
			ok(`${name}: the columns sit side by side`, g.side === 'row', g.side);
			ok(`${name}: both columns start flush at the top`, g.tops.every((t) => t === g.tops[0]), `tops=${g.tops.join(', ')}`);
			ok(`${name}: the columns are in different places`, new Set(g.xs).size === 2, `x=${g.xs.join(', ')}`);
			ok(`${name}: every card landed in a column`, g.counts.reduce((a, b) => a + b, 0) === 7, `counts=${g.counts.join('+')}`);
			// The cut is contiguous so the stacked phone order stays alphabetical (see cardSplit).
			const flat = g.names.flat();
			ok(`${name}: cards read alphabetically down the columns`,
				JSON.stringify(flat) === JSON.stringify([...flat].sort((a, b) => a.localeCompare(b))),
				flat.join(' | '));

			// ── …and the second column is actually PAINTED ─────────────────────
			// The bug that motivated this suite left correct geometry behind, so the only proof
			// is pixels. A blank 270×570 PNG compresses to ~4KB; four rendered cards are many
			// times that. The threshold is deliberately far below a real column and far above an
			// empty one — this is a blank-detector, not a pixel-perfect comparison.
			// Guarded: a hidden or detached column makes .screenshot() THROW rather than return
			// something small, and an uncaught throw here would abandon every engine still to
			// run — including the one engine this suite exists for. A column that can't be
			// photographed is a failure, not a crash.
			let shot = null, shotErr = '';
			try {
				shot = await page.locator('.surface-body .app-cols > .app-cards').nth(1)
					.screenshot({ timeout: 5000 });
			} catch (e) {
				shotErr = e.message.split('\n')[0];
			}
			ok(`${name}: the second column is painted, not blank`,
				!!shot && shot.length > 12000, shot ? `${(shot.length / 1024).toFixed(1)}KB` : shotErr);
		}
		await page.close();
	}

	// ── Phone: the columns stack, and the reading order survives ──────────────
	{
		const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
		await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
		await page.evaluate(() => { localStorage.setItem('ksh-sky', 'off'); localStorage.setItem('ksh-theme', 'light'); });
		await page.goto(B + '/apps', { waitUntil: 'networkidle' });
		await page.waitForTimeout(1400);
		const g = await page.evaluate(probe);
		if (!g.err) {
			ok(`${name}: phone stacks the columns`, g.side === 'column', g.side);
			ok(`${name}: phone puts every list in the same place`, new Set(g.xs).size === 1, `x=${g.xs.join(', ')}`);
			// Stacked, the two contiguous halves must read back as the one alphabetical run.
			const flat = g.names.flat();
			ok(`${name}: phone order is still alphabetical`,
				JSON.stringify(flat) === JSON.stringify([...flat].sort((a, b) => a.localeCompare(b))),
				flat.join(' | '));
		}
		await page.close();
	}

	await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
