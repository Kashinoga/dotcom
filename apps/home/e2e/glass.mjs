import { firefox } from 'playwright';
const B = process.env.BASE || 'http://localhost:5199';
const b = await firefox.launch();
const res = [];
const ok = (n, p, d = '') => {
	res.push(p);
	console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
};

// WHERE FROST IS ALLOWED, and where it is not.
//
// This suite used to run on a `ksh-ui` axis of flat/bubble. NOTHING READS `ksh-ui` any more —
// `static/preflight.js` sets `data-ui='bubble'` for Aeropalite and for nothing else — so both of
// its passes were rendering the same look, and the "flat" pass was quietly asserting Pixelite's
// chrome against Aeropalite's rules. The axis IS the two themes now, so that is what it seeds.
//
// AND THE CLAIM CHANGED WITH IT. The old flat pass asserted NO backdrop-filter anywhere, which was
// true of the flat/bubble split and is not true of Pixelite: Pixelite frosts OVERLAY and STICKY
// chrome — dropdowns, menus, flyouts, the docs key, the superbar — because those sit over content
// that scrolls beneath them, and the frost is what keeps their own labels readable. What Pixelite
// never frosts is the ordinary furniture: a plastic key, a panel's own backing, a card.
//
// So the Pixelite pass is an ALLOW-LIST rather than a count of zero. Measured on this tree at
// 1500×900, light, sky off: `/about` frosts `a.docs-key` and `button.fkey` and nothing else, and
// `/apps/air-traffic` frosts nothing at all.
const OVERLAY = [
	// The docs shell's contents key and the shared floating key — both fixed over a scroller.
	'docs-key',
	'fkey',
	// The shared popover surface: the row menus, the heading picker, the settings card.
	'popover',
	// The superbar, which is sticky by definition.
	'docs-superbar',
	// The phone flyout's own card and stack, which ride above the key.
	'fkey-card',
	'fkey-flyout'
];

const scanBlur = () => {
	const out = [];
	for (const el of document.querySelectorAll('*')) {
		const s = getComputedStyle(el);
		const bf = s.backdropFilter || s.webkitBackdropFilter;
		if (bf && bf !== 'none')
			out.push({
				what:
					el.tagName.toLowerCase() +
					'.' +
					[...el.classList].filter((c) => !c.startsWith('svelte-')).join('.'),
				classes: [...el.classList],
				bf
			});
	}
	return out;
};

for (const look of ['pixelite', 'aeropalite']) {
	const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } });
	const p = await ctx.newPage();
	await p.goto(B + '/', { waitUntil: 'domcontentloaded' });
	await p.evaluate((l) => {
		localStorage.setItem('ksh-look', l);
		localStorage.setItem('ksh-sky', 'off');
		localStorage.setItem('ksh-theme', 'light');
	}, look);
	console.log(`\n--- ${look.toUpperCase()} ---`);
	for (const path of ['/about', '/apps/air-traffic']) {
		await p.goto(B + path, { waitUntil: 'networkidle' });
		await p.waitForTimeout(1800);
		const blurs = await p.evaluate(scanBlur);
		if (look === 'pixelite') {
			// Not "none anywhere" — "none that is not overlay or sticky chrome".
			const stray = blurs.filter((x) => !x.classes.some((c) => OVERLAY.includes(c)));
			ok(
				`pixelite: ${path} frosts only overlay chrome`,
				stray.length === 0,
				stray
					.slice(0, 3)
					.map((x) => `${x.what} → ${x.bf}`)
					.join(' | ')
			);
		} else {
			ok(`aeropalite: ${path} keeps backdrop-filter`, blurs.length > 0, `${blurs.length}`);
		}
		// The panel's material — and only where there IS a panel. Under Pixelite a docs page is a
		// sheet in the shell's gutter with no `aside.surface` behind it at all, so this is asked
		// about the routes that still build one (every app with `own` chrome does, in both looks).
		const backdrop = p.locator('.surface-backdrop');
		if (await backdrop.count()) {
			const bd = await backdrop.evaluate((e) => {
				const s = getComputedStyle(e);
				return {
					bg: s.backgroundColor,
					bi: s.backgroundImage.slice(0, 30),
					bf: s.backdropFilter,
					// An EXPANDED panel fills the viewport, so there is nothing behind it to show
					// through — and Aeropalite makes it opaque on purpose (see the
					// `html[data-ui='bubble'] .surface.expanded .surface-backdrop` rule). Glass over
					// nothing is a blur of the page's own background colour, paid for every frame.
					expanded: !!e.closest('.surface')?.classList.contains('expanded')
				};
			});
			if (look === 'pixelite')
				// Pixelite's panel is PAPER: a solid sheet with no live filter under it. The frost it
				// does spend goes on chrome that floats over a scroller, not on the thing scrolling.
				ok(
					`pixelite: ${path} panel backing takes no live filter`,
					bd.bf === 'none',
					JSON.stringify(bd)
				);
			else if (bd.expanded)
				// Full-viewport: OPAQUE, deliberately. Measured `rgb(255, 255, 255)` here.
				ok(
					`aeropalite: ${path} expanded panel is opaque — nothing behind it to glass`,
					!bd.bg.startsWith('rgba'),
					JSON.stringify(bd)
				);
			else
				// Compact: GLASS — translucent, no sheen (a full-height surface has no lip for the
				// edge kiss to light — see the .surface-backdrop bubble rule).
				ok(
					`aeropalite: ${path} backdrop translucent, no sheen`,
					bd.bg.startsWith('rgba') && bd.bi === 'none',
					JSON.stringify(bd)
				);
		}
	}
	// THE DOCS KEY IS THE POSITIVE CASE, and it only exists under Pixelite — the docs shell is what
	// draws it. Asserted rather than merely tolerated, because "frost is for overlay chrome" is a
	// claim with two halves and the allow-list above only tests one of them.
	if (look === 'pixelite') {
		await p.goto(B + '/about', { waitUntil: 'networkidle' });
		await p.waitForTimeout(1200);
		const key = p.locator('.docs-key');
		ok('pixelite: the docs key is drawn', (await key.count()) > 0);
		if (await key.count()) {
			const kf = await key
				.first()
				.evaluate(
					(e) => getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter
				);
			ok('and it IS frosted — it floats over the reading', kf !== 'none', kf);
		}
	}
	// A PLASTIC KEY IS NEVER FROSTED, in either look: it sits ON the chrome rather than over the
	// content, so there is nothing behind it worth blurring.
	await p.goto(B + '/apps/presentation-builder', { waitUntil: 'networkidle' });
	await p.getByRole('button', { name: 'New from template' }).click();
	await p.waitForTimeout(1400);
	const tb = await p
		.locator('button.tb')
		.first()
		.evaluate((e) => getComputedStyle(e).backdropFilter || 'none');
	if (look === 'pixelite') ok('pixelite: pb .tb no backdrop-filter', tb === 'none', tb);
	else ok('aeropalite: pb .tb has backdrop-filter', tb !== 'none', tb);
	await ctx.close();
}
await b.close();
const f = res.filter((x) => !x).length;
console.log(`\n${res.length - f}/${res.length} passed`);
process.exit(f ? 1 : 0);
