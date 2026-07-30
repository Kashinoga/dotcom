import { artifact } from './artifacts.mjs';
import { firefox } from 'playwright';

const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  — got: ' + detail : ''}`);
};

const AC = [
	{
		hex: 'a1b2c3',
		flight: 'GCC201 ',
		t: 'B763',
		r: 'N741CX',
		ownOp: 'GULF & CARIBBEAN CARGO / CONTRACT AIR CARGO',
		desc: 'BOEING 767-300',
		lat: 41.6,
		lon: -93.7,
		alt_baro: 4200,
		gs: 240,
		track: 310,
		baro_rate: -900
	}
];

const browser = await firefox.launch();

// THE LOOK IS PINNED by every caller, never left to the default. The close chip has a different
// recipe per theme and the assertions below are specific to one.
//
// It used to pin `ksh-ui` — flat or bubble — and NOTHING READS `ksh-ui` any more
// (`static/preflight.js` sets `data-ui='bubble'` for Aeropalite alone), so every pass rendered
// Pixelite and the "flat" solid-fill assertions were being asked of a plastic key. The axis IS the
// two themes.
//
// PIXELITE MAKES IT A KEY. `--pixel-key-face` is translucent on purpose — light-dark(rgba(255,255,
// 255,0.5), rgba(255,255,255,0.1)) — and what separates it from the photograph underneath is its
// BORDER and bevel, not an opaque fill. Aeropalite makes it glass and frosts what is behind it.
// Measured values, from the CI run that caught this: light rgba(255,255,255,0.5), dark
// rgba(255,255,255,0.1), no backdrop-filter in either.
const KEY_FACE = {
	light: 'rgba(255, 255, 255, 0.5)',
	dark: 'rgba(255, 255, 255, 0.1)'
};

async function openCard({ w, h, dark = false, ui }) {
	const ctx = await browser.newContext({
		viewport: { width: w, height: h },
		colorScheme: dark ? 'dark' : 'light'
	});
	const page = await ctx.newPage();
	await page.route('**/api/traffic**', (r) => r.fulfill({ json: { ac: AC } }));
	await page.route('**api.adsbdb.com/**', (r) => r.abort());
	// The type button only appears once rows land; the photo itself comes from Wikimedia.
	await page.route('**commons.wikimedia.org/**', (r) => r.abort());
	await page.route('**upload.wikimedia.org/**', (r) => r.abort());
	// The site pins color-scheme:dark whenever the sky is night, so prefers-color-scheme
	// alone can't select the light palette — after 21:00 local, Auto sky IS night and a
	// "light" context silently renders dark. Pin the sky and theme explicitly.
	await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
	await page.evaluate(
		([d, u]) => {
			localStorage.setItem('ksh-sky', d ? 'night' : 'noon');
			localStorage.setItem('ksh-theme', d ? 'dark' : 'light');
			if (u) localStorage.setItem('ksh-look', u);
		},
		[dark, ui]
	);
	await page.goto(`${B}/apps/air-traffic?field=dsm`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(2500);
	await page.locator('button.type-btn').first().click();
	await page.waitForTimeout(700);
	return { ctx, page };
}

const geom = (page) =>
	page.locator('.pc-close').evaluate((el) => {
		const card = el.closest('.photo-card');
		const cb = card.getBoundingClientRect();
		const bb = el.getBoundingClientRect();
		const img = card.querySelector('.pc-img').getBoundingClientRect();
		const cs = getComputedStyle(el);
		const stacked = getComputedStyle(card).flexDirection === 'column';
		return {
			w: bb.width,
			h: bb.height,
			fromCardTop: bb.y - cb.y,
			fromCardRight: cb.right - bb.right,
			// When stacked, the button sits over the photo — how far inside the image corner?
			overImage: bb.y < img.bottom && bb.right > img.x,
			fromImgTop: bb.y - img.y,
			fromImgRight: img.right - bb.right,
			bg: cs.backgroundColor,
			// Bubble backs the chip with frost instead of a solid face — see the UI-style blocks.
			backdrop: cs.backdropFilter,
			border: cs.borderTopWidth,
			stacked,
			// Does any info text run under the button?
			infoPadRight: getComputedStyle(card.querySelector('.pc-info')).paddingRight
		};
	});

// ── Phone: stacked card, button lands on the photo ────────────────────────────
{
	const { ctx, page } = await openCard({ w: 390, h: 844, ui: 'pixelite' });
	const g = await geom(page);
	ok('phone: card is stacked', g.stacked);
	ok('phone: button is a 42px touch target', g.w === 42 && g.h === 42, `${g.w}×${g.h}`);
	ok(
		'phone: clears the card corner radius (>=12px)',
		g.fromCardTop >= 12 && g.fromCardRight >= 12,
		`top ${g.fromCardTop} right ${g.fromCardRight}`
	);
	ok('phone: button sits over the photo', g.overImage);
	ok(
		'phone: inset inside the image, not straddling its corner',
		g.fromImgTop >= 4 && g.fromImgRight >= 4,
		`imgTop ${g.fromImgTop} imgRight ${g.fromImgRight}`
	);
	ok(
		'phone: has an opaque backing (not transparent)',
		!/rgba\(0, 0, 0, 0\)|transparent/.test(g.bg),
		g.bg
	);
	// NOT "fully opaque" — under Pixelite the chip is a plastic KEY, and a key's face is meant to
	// be translucent. What keeps it off the photograph is the ring below plus the bevel, which is
	// the same bargain every other key in this theme makes.
	ok('phone: it wears the theme key face', g.bg === KEY_FACE.light, g.bg);
	ok('phone: has a 1.5px ring', parseFloat(g.border) >= 1 && parseFloat(g.border) <= 2, g.border);
	ok(
		'phone: info column reserves no right padding when stacked',
		g.infoPadRight === '0px',
		g.infoPadRight
	);

	// It must actually close the card, and be hittable at its centre.
	await page.locator('.pc-close').click();
	await page.waitForTimeout(500);
	ok('phone: click closes the card', (await page.locator('.photo-card').count()) === 0);
	await ctx.close();
}

// ── Desktop: side-by-side card, button sits on the card background ─────────────
{
	const { ctx, page } = await openCard({ w: 1500, h: 950, ui: 'pixelite' });
	const g = await geom(page);
	ok('desktop: card is side-by-side', !g.stacked);
	ok(
		'desktop: button is 42px (the one control size at every width)',
		g.w === 42 && g.h === 42,
		`${g.w}×${g.h}`
	);
	ok(
		'desktop: clears the card corner radius (>=8px)',
		g.fromCardTop >= 8 && g.fromCardRight >= 8,
		`top ${g.fromCardTop} right ${g.fromCardRight}`
	);
	ok(
		'desktop: info text reserves room for the button',
		parseFloat(g.infoPadRight) >= 40,
		g.infoPadRight
	);

	// No info text may overlap the button box.
	const overlap = await page.locator('.photo-card').evaluate((card) => {
		const b = card.querySelector('.pc-close').getBoundingClientRect();
		return [...card.querySelectorAll('.pc-info p')].some((p) => {
			const r = p.getBoundingClientRect();
			return r.right > b.x && r.x < b.right && r.bottom > b.y && r.y < b.bottom;
		});
	});
	ok('desktop: no text runs under the button', !overlap);
	await ctx.close();
}

// ── Flat, dark: the chip must still be opaque and legible ────────────────────
{
	const { ctx, page } = await openCard({ w: 390, h: 844, dark: true, ui: 'pixelite' });
	const g = await geom(page);
	ok('pixelite dark: chip is not transparent', !/rgba\(0, 0, 0, 0\)/.test(g.bg), g.bg);
	// --panel-fill-solid is pure black in dark now (every app surface is #fff / #000).
	ok('pixelite dark: chip uses the dark key face', g.bg === KEY_FACE.dark, g.bg);
	await page.screenshot({
		path: artifact('pcclose-dark.png'),
		clip: { x: 0, y: 100, width: 390, height: 420 }
	});
	await ctx.close();
}

// ── Bubble: the SAME legibility, bought a different way ──────────────────────
// This is the default UI and had no coverage at all — the blocks above were written for Flat
// and, left unpinned, were reading Bubble's chip and calling it broken. Bubble deliberately
// trades the solid face for the aero family's frost (see .pc-close under html[data-ui='bubble']),
// so the assertion isn't "opaque" here — it's that SOMETHING still separates the chip from an
// arbitrary photograph. A translucent face with no backdrop-filter behind it would be the real
// regression this guards: the × left floating on whatever the image happens to be.
for (const dark of [false, true]) {
	const { ctx, page } = await openCard({ w: 390, h: 844, dark, ui: 'aeropalite' });
	const g = await geom(page);
	const mode = `bubble ${dark ? 'dark' : 'light'}`;
	ok(`${mode}: chip still sits over the photo`, g.overImage);
	ok(
		`${mode}: chip is not fully transparent`,
		!/rgba\(0, 0, 0, 0\)|^transparent$/.test(g.bg),
		g.bg
	);
	ok(
		`${mode}: frost backs the chip (blur, not a solid face)`,
		/blur\(/.test(g.backdrop),
		g.backdrop || 'none'
	);
	ok(`${mode}: keeps its ring`, parseFloat(g.border) >= 1 && parseFloat(g.border) <= 2, g.border);
	ok(`${mode}: still a 42px touch target`, g.w === 42 && g.h === 42, `${g.w}×${g.h}`);
	await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
