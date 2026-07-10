import { firefox } from 'playwright';

// Dot radii are WORLD units, so they'd scale with the camera — but the masthead's bullets are
// a fixed 30px (its wordmark clamps at 5.5rem; the bullets never grew at all). Past ~1400px
// the map keeps zooming and the masthead doesn't. dotScale shrinks the dots by however much
// the home camera overshoots DOT_CAP_PX, pinning the hub at 30px.
const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  — got: ' + detail : ''}`);
};

const CAP = 30; // DOT_CAP_PX, == .theme-dot's width
const HUB_STOP_RATIO = 10 / 6.5; // R_HUB / R_STOP — must hold at every viewport

const SIZES = [
	{ w: 1400, h: 880, name: 'desktop' },
	{ w: 1920, h: 1080, name: 'wide desktop' },
	{ w: 2560, h: 1440, name: 'ultrawide' },
	{ w: 1280, h: 720, name: 'short laptop' },
	{ w: 390, h: 844, name: 'phone' },
	{ w: 430, h: 932, name: 'phone XL' }
];

const browser = await firefox.launch();

for (const { w, h, name } of SIZES) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h } });
	const page = await ctx.newPage();
	await page.goto(`${B}/`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(2600);

	const m = await page.evaluate(() => {
		const width = (sel) => document.querySelector(sel).getBoundingClientRect().width;
		return {
			hubD: width('circle.port.hub'),
			stopD: width('circle.port:not(.hub)'),
			mastDot: width('.theme-dot'),
			hubR: parseFloat(document.querySelector('circle.port.hub').getAttribute('r')),
			stopR: parseFloat(document.querySelector('circle.port:not(.hub)').getAttribute('r')),
			hitD: width('circle.hit')
		};
	});

	const ratio = m.hubD / m.mastDot;
	console.log(
		`\n── ${name} ${w}×${h}   hub ${m.hubD.toFixed(1)}px  stop ${m.stopD.toFixed(1)}px  bullets ${m.mastDot}px   hub/bullet ${ratio.toFixed(2)}`
	);

	// THE FIX: the hub never exceeds the masthead bullets, at any viewport.
	ok(`${name}: hub never exceeds the bullets`, m.hubD <= CAP + 0.5, `${m.hubD.toFixed(1)}px vs ${CAP}px`);
	// …and never collapses either — it should only shrink where the map has zoomed past the cap.
	ok(`${name}: hub is still substantial (>=20px)`, m.hubD >= 20, `${m.hubD.toFixed(1)}px`);
	// Shrinking must be uniform: a stop keeps its proportion to the hub.
	ok(
		`${name}: hub:stop proportion preserved`,
		Math.abs(m.hubR / m.stopR - HUB_STOP_RATIO) < 0.01,
		(m.hubR / m.stopR).toFixed(3)
	);
	ok(`${name}: hub is clearly larger than a stop (>1.4×)`, m.hubD / m.stopD > 1.4, (m.hubD / m.stopD).toFixed(2));
	ok(`${name}: hit target still exceeds the dot`, m.hitD > m.hubD, `${m.hitD.toFixed(0)} vs ${m.hubD.toFixed(0)}`);

	await ctx.close();
}

// ── The focus ring and Bubble swell are calc(var(--r) * k): they must actually resolve ──
for (const [uiStyle, w] of [['flat', 1400], ['bubble', 1400], ['flat', 1920], ['bubble', 1920]]) {
	const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
	const page = await ctx.newPage();
	await page.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
	await page.evaluate((u) => localStorage.setItem('ksh-ui', u), uiStyle);
	await page.goto(`${B}/`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(2400);

	const hub = page.locator('a.node').filter({ has: page.locator('circle.port.hub') }).first();
	const restR = await hub.locator('circle.port').evaluate((el) => parseFloat(getComputedStyle(el).r));
	const cssVar = await hub.locator('circle.port').evaluate((el) => getComputedStyle(el).getPropertyValue('--r').trim());
	ok(`${uiStyle} @${w}: --r is set on the dot`, cssVar !== '', JSON.stringify(cssVar));

	await hub.locator('circle.hit').hover({ force: true });
	await page.waitForTimeout(450);
	const hov = await hub.locator('circle.port').evaluate((el) => ({
		r: parseFloat(getComputedStyle(el).r),
		stroke: parseFloat(getComputedStyle(el).strokeWidth)
	}));

	// The ring is 0.46 × the resting radius, in both styles.
	ok(`${uiStyle} @${w}: focus ring resolves to 0.46×r`, Math.abs(hov.stroke / restR - 0.46) < 0.02, (hov.stroke / restR).toFixed(3));
	ok(`${uiStyle} @${w}: ring width is not zero (calc resolved)`, hov.stroke > 0.5, String(hov.stroke));

	if (uiStyle === 'bubble') {
		ok(`bubble @${w}: hub swells to 1.17×r`, Math.abs(hov.r / restR - 1.17) < 0.02, (hov.r / restR).toFixed(3));
	} else {
		ok(`flat @${w}: hub does not swell`, Math.abs(hov.r - restR) < 0.01, `${hov.r} vs ${restR}`);
	}
	await ctx.close();
}

// ── Flying to a station still zooms; the hub is free to grow once the masthead is gone ──
{
	const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
	const page = await ctx.newPage();
	await page.goto(`${B}/`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(2600);
	const before = await page.locator('circle.port.hub').evaluate((el) => el.getBoundingClientRect().width);
	await page.goto(`${B}/about`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(2200);
	const mastHidden = await page.locator('.masthead').evaluate((el) => el.classList.contains('hidden'));
	const after = await page.locator('circle.port.hub').evaluate((el) => el.getBoundingClientRect().width);
	ok('1920: hub capped at 30px on the home view', Math.abs(before - 30) < 1, before.toFixed(1));
	ok('1920: masthead is hidden once a panel opens', mastHidden);
	ok('1920: flying still zooms the map in (hub grows)', after > before, `${after.toFixed(1)} vs ${before.toFixed(1)}`);
	await ctx.close();
}

// ── "Home" must still clear the hub dot; shrinking the dot can only add clearance ──
{
	const ctx = await browser.newContext({ viewport: { width: 1400, height: 880 } });
	const page = await ctx.newPage();
	await page.goto(`${B}/`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(2600);
	const clear = await page.evaluate(() => {
		const a = [...document.querySelectorAll('a.node')].find((n) => n.getAttribute('aria-label') === 'Fly to Home');
		const dot = a.querySelector('circle.port').getBoundingClientRect();
		const lab = a.querySelector('text.code').getBoundingClientRect();
		const dx = Math.max(0, Math.max(dot.x - lab.right, lab.x - dot.right));
		const dy = Math.max(0, Math.max(dot.y - lab.bottom, lab.y - dot.bottom));
		return Math.hypot(dx, dy);
	});
	ok('1400px: "Home" still clears the hub dot', clear >= 4, `${clear.toFixed(1)}px`);
	await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
