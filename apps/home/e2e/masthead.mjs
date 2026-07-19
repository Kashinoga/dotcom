import { firefox } from 'playwright';
const B = process.env.BASE || 'http://localhost:5199';

// The homepage masthead: wordmark, bullets, tagline, and the primary station nav.
//
// It had no suite. `hubsize` measured it and was deleted with the map, and nothing replaced it —
// so the one persistent piece of chrome on the site, the thing every page shows, was covered only
// by two suites that click its nav on their way somewhere else. This asserts what the component
// says about itself: the marks it wears, the nav's four stations, what a phone does to them, and
// that it gets out of the way — properly, not just visually — when a panel fills the viewport.
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  — ' + detail : ''}`);
};

const STATIONS = [
	// Home is a real station (KSH) with its own URL, not the bare root — `/` is the map with no
	// panel open, and going Home from a panel lands you on /home.
	{ name: 'Home', href: '/home' },
	{ name: 'About', href: '/about' },
	{ name: 'Apps', href: '/apps' },
	{ name: 'Settings', href: '/settings' }
];

const browser = await firefox.launch();
const open = async (vp) => {
	const ctx = await browser.newContext({ viewport: vp });
	const page = await ctx.newPage();
	await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => { localStorage.setItem('ksh-sky', 'off'); localStorage.setItem('ksh-theme', 'light'); });
	await page.goto(B + '/', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	return { ctx, page };
};

// ── Desktop: the brandline, the tagline, the nav ─────────────────────────────
{
	const { ctx, page } = await open({ width: 1400, height: 900 });

	const brand = await page.evaluate(() => {
		const h1 = document.querySelector('.masthead h1');
		const dots = [...document.querySelectorAll('.masthead .brand-dot')];
		return {
			wordmark: h1?.textContent.replace(/\s+/g, '') ?? '',
			dotCount: dots.length,
			// They unfurl left→right, so they must READ left→right too.
			xs: dots.map((d) => Math.round(d.getBoundingClientRect().left)),
			colors: dots.map((d) => getComputedStyle(d).getPropertyValue('--dot').trim()),
			// Decorative: they must not be announced.
			hidden: dots.every((d) => d.getAttribute('aria-hidden') === 'true')
		};
	});
	// SplitFlap gives every letter a face and a flap, so textContent comes back with each
	// character DOUBLED IN PLACE — "KKaasshhiinnooggaa", not "KashinogaKashinoga". Taking every
	// other character puts the word back; asserting the doubling too means a change to how the
	// flap is built shows up here rather than being quietly absorbed by a looser match.
	const everyOther = [...brand.wordmark].filter((_, i) => i % 2 === 0).join('');
	const doubled = [...'Kashinoga'].map((c) => c + c).join('');
	ok('wordmark reads Kashinoga', everyOther === 'Kashinoga' && brand.wordmark === doubled, brand.wordmark.slice(0, 40));
	ok('three station bullets beside it', brand.dotCount === 3, String(brand.dotCount));
	ok('the bullets are decorative, not announced', brand.hidden);
	ok('the bullets run left to right', brand.xs.every((x, i) => i === 0 || x > brand.xs[i - 1]), brand.xs.join(', '));
	ok('each bullet carries its own colour', new Set(brand.colors).size === 3, brand.colors.join(' '));

	const tagline = await page.evaluate(() => {
		const words = [...document.querySelectorAll('.masthead .tagline .tw')];
		return {
			text: document.querySelector('.masthead .tagline')?.textContent.trim() ?? '',
			styles: words.map((w) => ({
				t: w.textContent.trim(),
				italic: getComputedStyle(w).fontStyle === 'italic',
				bold: parseInt(getComputedStyle(w).fontWeight, 10) >= 600
			}))
		};
	});
	ok('tagline reads "Different, Together"', /Different,\s*Together/.test(tagline.text), tagline.text);
	// Each word carries its own emphasis — "Different" italic, "Together" bold.
	ok('"Different," is italicised', tagline.styles.find((s) => /Different/.test(s.t))?.italic === true);
	ok('"Together" is bolded', tagline.styles.find((s) => /Together/.test(s.t))?.bold === true);

	const nav = await page.evaluate(() => {
		const links = [...document.querySelectorAll('.menubar .menu-btn')];
		return {
			count: links.length,
			items: links.map((a) => ({
				name: a.textContent.trim(),
				href: new URL(a.href).pathname,
				y: Math.round(a.getBoundingClientRect().top)
			})),
			label: document.querySelector('.menubar')?.getAttribute('aria-label')
		};
	});
	ok('four stations in the nav', nav.count === 4, String(nav.count));
	ok('the nav names itself for screen readers', nav.label === 'Destinations', nav.label ?? 'none');
	for (const s of STATIONS) {
		const got = nav.items.find((i) => i.name === s.name);
		ok(`${s.name} links to ${s.href}`, got?.href === s.href, got?.href ?? 'missing');
	}
	ok('desktop keeps the stations on one row', new Set(nav.items.map((i) => i.y)).size === 1,
		nav.items.map((i) => i.y).join(', '));

	// The open destination highlights while its panel is open.
	await page.goto(B + '/apps', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1200);
	const active = await page.evaluate(() => {
		const on = [...document.querySelectorAll('.menubar .menu-btn.active')];
		return { count: on.length, name: on[0]?.textContent.trim() ?? null };
	});
	ok('the open station is the only one highlighted', active.count === 1 && active.name === 'Apps',
		`${active.count} active (${active.name})`);
	await ctx.close();
}

// ── Phone: the words hand over to their marks, on ONE row ────────────────────
// The stated reason for the swap is that four worded pills don't fit a ~375px line but four
// glyphs do — so "one row" is the assertion, not a detail.
{
	const { ctx, page } = await open({ width: 390, height: 844 });
	const g = await page.evaluate(() => {
		const links = [...document.querySelectorAll('.menubar .menu-btn')];
		const word = document.querySelector('.menubar .menu-word');
		const wr = word.getBoundingClientRect();
		return {
			rows: new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size,
			// Visually gone…
			wordClipped: wr.width <= 2 && wr.height <= 2,
			// …but still the link's accessible name, so the glyph isn't a mystery button.
			names: links.map((a) => a.textContent.trim()),
			iconShown: getComputedStyle(document.querySelector('.menubar .menu-ico')).display !== 'none',
			// A real touch target, not a glyph you have to aim at.
			sizes: links.map((a) => {
				const r = a.getBoundingClientRect();
				return `${Math.round(r.width)}x${Math.round(r.height)}`;
			}),
			// The whole bar has to stay on screen.
			overflows: links.some((a) => a.getBoundingClientRect().right > window.innerWidth)
		};
	});
	ok('phone keeps all four stations on one row', g.rows === 1, `${g.rows} rows`);
	ok('phone shows the station marks', g.iconShown);
	ok('phone hides the words visually', g.wordClipped);
	ok('phone keeps the words as accessible names', g.names.join(',') === 'Home,About,Apps,Settings', g.names.join(','));
	ok('phone gives each a 42px touch target', g.sizes.every((s) => s === '42x42'), g.sizes.join(' '));
	ok('phone fits the nav on screen', !g.overflows);
	// The accessible name has to survive as a real name, not just as text in the DOM.
	const byRole = await page.getByRole('link', { name: 'Settings', exact: true }).count();
	ok('phone: a station is still reachable by its name', byRole > 0, String(byRole));
	await ctx.close();
}

// ── Covered: a full-viewport panel takes the masthead out entirely ───────────
// Not just faded. The component's note is explicit that it must also leave the TAB ORDER, so
// focus can't land on a link sitting invisible behind a panel — that's the real bug here, and
// an opacity-only check would sail straight past it.
{
	const { ctx, page } = await open({ width: 1400, height: 900 });
	await page.goto(B + '/apps/star-map', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1800);
	const g = await page.evaluate(() => {
		const m = document.querySelector('.masthead');
		const cs = getComputedStyle(m);
		return {
			covered: m.classList.contains('covered'),
			opacity: cs.opacity,
			visibility: cs.visibility,
			pointer: cs.pointerEvents
		};
	});
	ok('a full-viewport panel marks the masthead covered', g.covered);
	ok('covered: it fades out', g.opacity === '0', g.opacity);
	ok('covered: it is not just transparent but invisible', g.visibility === 'hidden', g.visibility);
	ok('covered: it stops taking clicks', g.pointer === 'none', g.pointer);
	// visibility:hidden is what drops it from the tab order — prove the focus actually goes
	// somewhere else rather than into a link nobody can see.
	await page.keyboard.press('Tab');
	await page.waitForTimeout(300);
	const focusInMasthead = await page.evaluate(() => !!document.activeElement?.closest('.masthead'));
	ok('covered: tabbing cannot reach the hidden nav', !focusInMasthead);
	await ctx.close();
}

// ── Uncovered: an ordinary panel leaves it alone ─────────────────────────────
{
	const { ctx, page } = await open({ width: 1400, height: 900 });
	await page.goto(B + '/settings', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1400);
	const g = await page.evaluate(() => {
		const m = document.querySelector('.masthead');
		const cs = getComputedStyle(m);
		return { covered: m.classList.contains('covered'), opacity: cs.opacity, visibility: cs.visibility };
	});
	ok('an ordinary panel leaves the masthead up', !g.covered && g.opacity === '1' && g.visibility === 'visible',
		`covered=${g.covered} opacity=${g.opacity} visibility=${g.visibility}`);
	await ctx.close();
}

// ── The nav flyouts hang off their own button ────────────────────────────────
{
	const { ctx, page } = await open({ width: 1400, height: 900 });
	await page.locator('.menu-btn').filter({ hasText: 'About' }).first().click();
	await page.waitForTimeout(1200);
	const g = await page.evaluate(() => {
		const pop = document.querySelector('.nav-pop');
		if (!pop) return null;
		const li = pop.closest('li');
		const btn = li?.querySelector('.menu-btn');
		const pr = pop.getBoundingClientRect();
		const br = btn.getBoundingClientRect();
		return {
			openOn: btn.textContent.trim(),
			expanded: btn.getAttribute('aria-expanded'),
			// It hangs BELOW its caller, anchored to that button — not centred on the page.
			below: pr.top >= br.bottom - 4,
			alignedLeft: Math.abs(pr.left - br.left) < 80,
			onScreen: pr.right <= window.innerWidth && pr.left >= 0
		};
	});
	ok('clicking About opens a flyout', !!g);
	if (g) {
		ok('the flyout belongs to About', g.openOn === 'About', g.openOn);
		ok('About reports itself expanded', g.expanded === 'true', g.expanded ?? 'unset');
		ok('the flyout hangs below its own button', g.below);
		ok('the flyout is anchored to that button', g.alignedLeft);
		ok('the flyout stays on screen', g.onScreen);
		// Clicks inside must not reach the stage's anywhere-off dismiss.
		await page.locator('.nav-pop').click({ position: { x: 10, y: 10 } });
		await page.waitForTimeout(600);
		ok('clicking inside the flyout keeps it open', (await page.locator('.nav-pop').count()) === 1);
		// …and clicking away closes it.
		await page.mouse.click(1300, 800);
		await page.waitForTimeout(700);
		ok('clicking away closes it', (await page.locator('.nav-pop').count()) === 0);
	}
	await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
