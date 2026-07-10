import { artifact } from './artifacts.mjs';
import { firefox } from 'playwright';

const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  — got: ' + detail : ''}`);
};

const AC = [
	{ hex: 'a1b2c3', flight: 'GCC201 ', t: 'B763', r: 'N741CX', ownOp: 'GULF & CARIBBEAN CARGO / CONTRACT AIR CARGO', desc: 'BOEING 767-300', lat: 41.6, lon: -93.7, alt_baro: 4200, gs: 240, track: 310, baro_rate: -900 }
];

const browser = await firefox.launch();

async function openCard({ w, h, dark = false }) {
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
	await page.evaluate((d) => {
		localStorage.setItem('ksh-sky', d ? 'night' : 'noon');
		localStorage.setItem('ksh-theme', d ? 'dark' : 'light');
	}, dark);
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
			border: cs.borderTopWidth,
			stacked,
			// Does any info text run under the button?
			infoPadRight: getComputedStyle(card.querySelector('.pc-info')).paddingRight
		};
	});

// ── Phone: stacked card, button lands on the photo ────────────────────────────
{
	const { ctx, page } = await openCard({ w: 390, h: 844 });
	const g = await geom(page);
	ok('phone: card is stacked', g.stacked);
	ok('phone: button is a 36px touch target', g.w === 36 && g.h === 36, `${g.w}×${g.h}`);
	ok('phone: clears the card corner radius (>=12px)', g.fromCardTop >= 12 && g.fromCardRight >= 12, `top ${g.fromCardTop} right ${g.fromCardRight}`);
	ok('phone: button sits over the photo', g.overImage);
	ok('phone: inset inside the image, not straddling its corner', g.fromImgTop >= 4 && g.fromImgRight >= 4, `imgTop ${g.fromImgTop} imgRight ${g.fromImgRight}`);
	ok('phone: has an opaque backing (not transparent)', !/rgba\(0, 0, 0, 0\)|transparent/.test(g.bg), g.bg);
	ok('phone: backing is fully opaque', !/rgba\([^)]+,\s*0?\.\d+\)/.test(g.bg), g.bg);
	ok('phone: light theme uses the light panel fill', g.bg === 'rgb(243, 245, 249)', g.bg);
	ok('phone: has a 1.5px ring', parseFloat(g.border) >= 1 && parseFloat(g.border) <= 2, g.border);
	ok('phone: info column reserves no right padding when stacked', g.infoPadRight === '0px', g.infoPadRight);

	// It must actually close the card, and be hittable at its centre.
	await page.locator('.pc-close').click();
	await page.waitForTimeout(500);
	ok('phone: click closes the card', (await page.locator('.photo-card').count()) === 0);
	await ctx.close();
}

// ── Desktop: side-by-side card, button sits on the card background ─────────────
{
	const { ctx, page } = await openCard({ w: 1500, h: 950 });
	const g = await geom(page);
	ok('desktop: card is side-by-side', !g.stacked);
	ok('desktop: button is 32px', g.w === 32 && g.h === 32, `${g.w}×${g.h}`);
	ok('desktop: clears the card corner radius (>=8px)', g.fromCardTop >= 8 && g.fromCardRight >= 8, `top ${g.fromCardTop} right ${g.fromCardRight}`);
	ok('desktop: info text reserves room for the button', parseFloat(g.infoPadRight) >= 40, g.infoPadRight);

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

// ── Dark mode: the chip must still be opaque and legible ──────────────────────
{
	const { ctx, page } = await openCard({ w: 390, h: 844, dark: true });
	const g = await geom(page);
	ok('dark: chip is opaque', !/rgba\(0, 0, 0, 0\)/.test(g.bg), g.bg);
	ok('dark: chip uses the dark panel fill', g.bg === 'rgb(33, 35, 42)', g.bg);
	await page.screenshot({ path: artifact('pcclose-dark.png'), clip: { x: 0, y: 100, width: 390, height: 420 } });
	await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
