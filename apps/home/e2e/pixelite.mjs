import { firefox } from 'playwright';

// THE PIXELITE DOCS SHELL — the chrome every visitor gets, because Pixelite is the default and the
// theme that goes on getting updates.
//
// WHY THIS SUITE EXISTS. Nineteen browser suites and, before this one, thirteen of the shell's
// sixteen core `docs-*` classes had no assertion anywhere: the sidebar tree, the crumb trail, the
// on-this-page rail, the cover, the settings grid, the scroller. Six suites are now explicitly
// seeded to Aeropalite (`cards`, `deeplink`, `dots`, `field`, `header`, `masthead`) because the
// chrome they test only exists there — so their coverage says nothing about what ships.
//
// WHAT IT DELIBERATELY DOES NOT DO. It asserts BEHAVIOUR, not the cascade. `e2e/docs-snap.mjs`
// already records every resolved property and rect of the docs bodies across sixteen states and is
// far better at that than any assertion here would be; re-checking paddings and measures would be
// two harnesses disagreeing about one thing. Nothing below reads a computed style unless the value
// IS the behaviour (the phone's screen-reader-only cover, the zeroed gutter).
//
// NO LOOK IS SEEDED, anywhere in this file, and that is the point: Pixelite is what you get.

const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  — ' + detail : ''}`);
};

// TEXT, COMPARED WITHOUT REGARD TO CASE. `innerText` reports text AS RENDERED and this theme
// uppercases nearly every label it draws — a crumb reads "Work" in the markup and "WORK" here.
// That is a `text-transform`, not the words being different, and no assertion below is about it.
// (The same trap `settings` and `reset` hit; documented, and still easy to walk into.)
const said = async (loc) => (await loc.innerText()).trim().toLowerCase();
const allSaid = async (loc) => (await loc.allInnerTexts()).map((t) => t.trim().toLowerCase());

const browser = await firefox.launch();
const desk = async (path, { w = 1500, h = 950 } = {}) => {
	const ctx = await browser.newContext({ viewport: { width: w, height: h } });
	const page = await ctx.newPage();
	await page.goto(`${B}${path}`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(1400);
	return { ctx, page };
};

// ── 1. The shell IS the site ────────────────────────────────────────────────
// Every ordinary place renders in the docs shell and NOT in a panel. The panel is Aeropalite's
// object; under Pixelite an `aside.surface` on a prose page would mean the theme had not applied.
{
	const { ctx, page } = await desk('/');
	for (const [sel, what] of [
		['.docs-superbar', 'a superbar'],
		['.docs-sidebar', 'a sidebar'],
		['.docs-content', 'a content column'],
		['.docs-rail', 'an on-this-page rail'],
		['.docs-scroll', 'one scroller']
	])
		ok(`the hub draws ${what}`, (await page.locator(sel).count()) >= 1);
	ok('and no panel', (await page.locator('aside.surface').count()) === 0);
	// The cover is the hub's own page, not a sheet: it leads with a title and a lede.
	ok('the hub is a cover', (await page.locator('.docs-cover-title').count()) === 1);
	ok('with no crumbs — it is the top', (await page.locator('.docs-crumb').count()) === 0);
	await ctx.close();
}

// ── 2. FULL APPS ESCAPE THE SHELL ───────────────────────────────────────────
// Derived from each place's `chrome` via FULL_APPS, never a hand-written list — and CLAUDE.md
// records what a second list cost last time: the editor opened at 680px in the side panel with
// every test still green. These four own their whole interior and render through the stage in
// EITHER theme, so the shell must not be around them.
{
	for (const path of [
		'/apps/air-traffic',
		'/apps/text-editor',
		'/apps/star-map',
		'/apps/intergalactic-park-ranger'
	]) {
		const { ctx, page } = await desk(path, { w: 1500, h: 950 });
		await page.waitForTimeout(600);
		const seen = await page.evaluate(() => ({
			shell: !!document.querySelector('.docs-superbar'),
			stage: !!document.querySelector('.stage')
		}));
		ok(`${path} leaves the shell for the stage`, !seen.shell && seen.stage, JSON.stringify(seen));
		await ctx.close();
	}
	// …and a place with ordinary chrome does NOT, which is what makes the four above a claim about
	// FULL_APPS rather than about apps in general.
	const { ctx, page } = await desk('/apps/densette');
	ok('an ordinary app stays in the shell', (await page.locator('.docs-superbar').count()) === 1);
	await ctx.close();
}

// ── 3. The sidebar is the register, drawn ───────────────────────────────────
{
	const { ctx, page } = await desk('/about/work');
	const secs = await page.locator('.docs-sec-head').allInnerTexts();
	ok('sections are numbered from the hub down', /^1\./.test(secs[0].trim()), secs.join(' | '));
	ok('four top-level sections', secs.length === 4, String(secs.length));
	// The Apps shelf is sorted ALPHABETICALLY by title where the other sections keep their curated
	// order — DocsShell does that specially, and nothing else would notice if it stopped.
	const apps = await page
		.locator('.docs-sec', { has: page.locator('.docs-sec-head', { hasText: 'Apps' }) })
		.locator('.docs-leaf')
		.allInnerTexts();
	const tidy = apps.map((t) => t.trim());
	ok(
		'the Apps shelf is alphabetical',
		JSON.stringify(tidy) === JSON.stringify([...tidy].sort((a, b) => a.localeCompare(b))),
		tidy.join(' | ')
	);
	// WHERE YOU ARE is marked once, on the leaf, and the crumb trail says the same thing.
	ok('exactly one leaf is marked current', (await page.locator('.docs-leaf.active').count()) === 1);
	ok('and it is this page', (await said(page.locator('.docs-leaf.active'))) === 'work');
	ok(
		'the crumbs walk down from the section',
		(await allSaid(page.locator('.docs-crumb'))).join('/') === 'about/work',
		(await page.locator('.docs-crumb').allInnerTexts()).join('/')
	);
	await ctx.close();
}

// ── 4. Navigation through the shell is SHALLOW ──────────────────────────────
// `deeplink` proves this for Aeropalite's masthead. This is the same claim for the way the default
// theme actually moves: the sidebar tree.
{
	const { ctx, page } = await desk('/');
	let loads = 0;
	page.on('load', () => loads++);
	await page.locator('.docs-sidebar a[href="/about/projects"]').click();
	await page.waitForURL(`${B}/about/projects`, { timeout: 5000 });
	await page.waitForTimeout(700);
	ok('a sidebar link pushes its URL', page.url() === `${B}/about/projects`, page.url());
	ok('with no full page reload', loads === 0, `${loads}`);
	ok('the title follows', (await page.title()) === 'Projects — Kashinoga', await page.title());
	ok('and the mark moves with it', (await said(page.locator('.docs-leaf.active'))) === 'projects');
	await page.goBack();
	await page.waitForTimeout(800);
	ok('back returns to the hub', page.url() === `${B}/`, page.url());
	ok('still no reload', loads === 0, `${loads}`);
	await ctx.close();
}

// ── 5. THE ON-THIS-PAGE RAIL ────────────────────────────────────────────────
// The highest-value part of this suite. The rail is driven by an IntersectionObserver and a scroll
// handler, and a mark that stops tracking fails SILENTLY — no error, no visual break, just the
// wrong entry lit. Two real defects were found here while this suite was being written:
//
//   1. The callback recorded the last heading to ENTER a top-third band, which is only right while
//      a heading is inside it. On Densette — the longest page here — the rail lit "3.1 The Year is
//      2172" at scrollTop 1200 and still said so at 2000, 3500, 5000 and 7000.
//   2. An IntersectionObserver samples at frame boundaries, so a heading that goes from below the
//      band to above it in one jump is never seen intersecting and fires NOTHING. The observer
//      cannot be the only trigger.
//
// Densette is the fixture because it is the only page long enough to tell a tracking rail from a
// stuck one: ten headings over a ~7,700px scroller.
{
	const { ctx, page } = await desk('/apps/densette');
	await page.waitForTimeout(800);
	const items = await page.locator('.docs-rail-link').allInnerTexts();
	ok('the rail lists the page', items.length >= 8, String(items.length));
	ok(
		'headed "On this page"',
		(await said(page.locator('.docs-rail-head'))).includes('on this page')
	);

	const activeAt = async (top) => {
		await page.evaluate((t) => {
			const s = document.querySelector('.docs-scroll');
			s.scrollTo({ top: t, behavior: 'instant' });
		}, top);
		await page.waitForTimeout(500);
		return (await page.locator('.docs-rail-link.active').first().innerText()).trim();
	};

	ok('something is marked before you scroll at all', (await activeAt(0)).length > 0);
	// IT MOVES, and keeps moving. Collected as a sequence rather than asserted point by point: the
	// failure this catches is a mark that stops, and one sample cannot see that.
	const walk = [];
	for (const top of [0, 1200, 2000, 3500, 5000]) walk.push(await activeAt(top));
	ok('the mark tracks the reading down the page', new Set(walk).size >= 4, walk.join(' → '));
	ok(
		'and never goes backwards',
		walk.every((_, i) => i === 0 || items.indexOf(walk[i]) >= items.indexOf(walk[i - 1])),
		walk.join(' → ')
	);
	// THE LAST SECTION IS REACHABLE. It can never be scrolled to the reading line — there is no
	// page left beneath it — so without a bottom rule it is the one heading that can never be
	// marked, however long somebody sits reading it.
	await page.evaluate(() => {
		const s = document.querySelector('.docs-scroll');
		s.scrollTo({ top: s.scrollHeight, behavior: 'instant' });
	});
	await page.waitForTimeout(600);
	ok(
		'the bottom of the page marks the last heading',
		(await page.locator('.docs-rail-link.active').innerText()).trim() === items.at(-1).trim(),
		`${(await page.locator('.docs-rail-link.active').innerText()).trim()} vs ${items.at(-1).trim()}`
	);

	// A CLICK MARKS WHAT YOU CLICKED. The reading line sits where a jump LANDS a heading (below the
	// superbar), not at the scroller's top — measured from the top, the line fell above the heading
	// somebody had just jumped to and the rail marked the section before it.
	await page.evaluate(() => document.querySelector('.docs-scroll').scrollTo({ top: 0 }));
	await page.waitForTimeout(400);
	const want = (await page.locator('.docs-rail-link').nth(4).innerText()).trim();
	await page.locator('.docs-rail-link').nth(4).click();
	await page.waitForTimeout(1200);
	ok(
		'clicking a rail entry marks that entry',
		(await page.locator('.docs-rail-link.active').innerText()).trim() === want,
		`${(await page.locator('.docs-rail-link.active').innerText()).trim()} vs ${want}`
	);
	ok(
		'and actually moved the page',
		(await page.evaluate(() => document.querySelector('.docs-scroll').scrollTop)) > 200
	);
	await ctx.close();
}

// ── 6. The superbar answers the scroll ──────────────────────────────────────
{
	const { ctx, page } = await desk('/apps/densette');
	const cls = () => page.locator('.docs-superbar').getAttribute('class');
	ok('the bar rests unscrolled', !(await cls()).includes('scrolled'));
	await page.evaluate(() => document.querySelector('.docs-scroll').scrollTo({ top: 600 }));
	await page.waitForTimeout(500);
	ok('and marks itself once content passes under it', (await cls()).includes('scrolled'));
	await ctx.close();
}

// ── 7. The phone ────────────────────────────────────────────────────────────
// Three rules decide what every page looks like in a hand, and all three are absences or
// transforms — the kind of thing that comes back silently.
{
	const { ctx, page } = await desk('/about', { w: 390, h: 844 });
	ok(
		'the sidebar is not drawn',
		(await page.locator('.docs-sidebar').evaluate((e) => getComputedStyle(e).display)) === 'none'
	);
	ok('a floating key stands in for it', (await page.locator('.docs-fkey .fkey').count()) === 1);
	// The gutter goes to zero, so the sheet IS the page.
	ok(
		'the docs gutter is zeroed',
		(await page
			.locator('.docs')
			.evaluate((e) => getComputedStyle(e).getPropertyValue('--docs-pad').trim())) === '0px'
	);
	ok(
		'and the sheet runs to the edge',
		(await page
			.locator('.docs-sheet')
			.evaluate((e) => Math.round(e.getBoundingClientRect().left))) === 0
	);
	// THE PRINTED COVER COMES OFF, screen-reader-only rather than display:none — the page keeps its
	// <h1> and the outline it gives, while the superbar carries the visible name.
	const head = await page
		.locator('.docs-page-head')
		.evaluate((e) => ({ pos: getComputedStyle(e).position, w: getComputedStyle(e).width }));
	ok(
		'the cover is hidden but still spoken',
		head.pos === 'absolute' && head.w === '1px',
		JSON.stringify(head)
	);
	ok(
		'and the bar carries the name instead',
		(await said(page.locator('.docs-sb-title'))) === 'about'
	);
	// The key opens the contents.
	await page.locator('.docs-fkey .fkey').click();
	await page.waitForTimeout(600);
	ok(
		'the key opens',
		(await page.locator('.docs-fkey .fkey').getAttribute('aria-expanded')) === 'true'
	);
	ok('onto somewhere to go', (await page.locator('.fkey-stack a, .fkey-stack button').count()) > 0);
	await ctx.close();
}

// ── 8. SPACING LANDS ON WHOLE PIXELS ────────────────────────────────────────
// The runtime half of the spacing guard. `test/spacing.test.ts` reads the SOURCE and asks that
// every value came from puhig's `--space-*` scale; it cannot see anything computed, and computed
// is where the interesting failures are — a `clamp()` in its fluid middle, a `calc()` cancelling
// something that has since moved, a token that did not resolve.
//
// WHOLE PIXELS ARE THE CLAIM, and it is a real one rather than a tidiness one: a fractional gap
// rounds independently wherever it lands, so a column of them accumulates disagreement down the
// page — the reasoning behind the text editor's whole-pixel row invariant, applied to space.
//
// Checked at FOUR WIDTHS, and the middle two are the point. At 1500 and 390 every clamp is pinned
// to one of its ends, so those widths would pass on the bounds alone; 1100 and 860 catch the fluid
// middle, which is where `round()` is doing the work.
for (const w of [1500, 1100, 860, 390]) {
	const { ctx, page } = await desk('/about/work', { w, h: 950 });
	const fractional = await page.evaluate(() => {
		const props = [
			'marginTop',
			'marginBottom',
			'marginLeft',
			'marginRight',
			'paddingTop',
			'paddingBottom',
			'paddingLeft',
			'paddingRight',
			'rowGap',
			'columnGap'
		];
		const bad = [];
		for (const el of document.querySelectorAll('[class*="docs-"]')) {
			const s = getComputedStyle(el);
			for (const p of props) {
				const v = parseFloat(s[p]);
				// A hair of tolerance: a browser may report 12.0000001 for an exact value.
				if (!isNaN(v) && v !== 0 && Math.abs(v % 1) > 0.01)
					bad.push(`${[...el.classList].filter((c) => !c.startsWith('svelte-'))[0]} ${p}=${s[p]}`);
			}
		}
		return [...new Set(bad)];
	});
	ok(
		`@${w}px every docs spacing is a whole number of pixels`,
		fractional.length === 0,
		fractional.slice(0, 4).join(' | ')
	);
	await ctx.close();
}

// ── 9. The two columns stand on one pitch ───────────────────────────────────
// The sidebar's leaves and the rail's entries are the same kind of thing — a short name in a
// narrow column — and they are read together, one either side of the page. They drifted apart
// once (26px against 21px: a smaller face on tighter leading, then padding putting it back and
// more), which is the sort of difference nobody can name and everybody can see.
//
// A LINE PITCH IS NOT ON THE SPACING SCALE, and must not be asserted as though it were. It is
// `font-size × line-height` — 12.8 × 1.65 here, so 21.12px — which is TYPE, the same category as
// the inline-code chip's `em` padding that `test/spacing.test.ts` exempts as a unit. Section 8
// asks about margins, padding and gaps for exactly this reason: those are the page's own
// decisions, and a line box is the font's.
//
// This assertion used to round the two pitches before comparing them AND then check the rounded
// number was whole — which it always was, by construction. An assertion that cannot fail reads as
// coverage and is not, and this one was hiding a claim (a 21px pitch) that was never true.
{
	const { ctx, page } = await desk('/apps/densette');
	const pitch = (sel) =>
		page.evaluate((s) => {
			const e = [...document.querySelectorAll(s)];
			// Sampled INSIDE a run of siblings — across a section head the gap is a different fact.
			return e[5].getBoundingClientRect().top - e[4].getBoundingClientRect().top;
		}, sel);
	const leaf = await pitch('.docs-leaf');
	const rail = await pitch('.docs-rail-link');
	// Compared RAW, to a sub-pixel tolerance: the claim is that the two columns are set to one
	// rhythm, and rounding first would let a genuine half-pixel drift pass as agreement.
	ok(
		'the sidebar and the rail share one line pitch',
		Math.abs(leaf - rail) < 0.02,
		`sidebar ${leaf} · rail ${rail}`
	);
	await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
