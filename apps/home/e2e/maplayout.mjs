import { artifact } from './artifacts.mjs';
import { firefox } from 'playwright';

// Measures, in SCREEN space, every station label + dot on the mobile portrait map and
// reports which ones collide. Screen space is what matters: the labels are unscaled
// (vector-effect / non-scaling text), so world coords alone can't tell you if two
// labels touch.
const B = process.env.BASE || 'http://localhost:5199';
const SIZES = [
	{ w: 390, h: 844, name: 'iPhone 14' },
	{ w: 360, h: 780, name: 'small android' },
	{ w: 430, h: 932, name: 'iPhone Pro Max' },
	{ w: 412, h: 915, name: 'Pixel 8' },
	{ w: 720, h: 1200, name: 'portrait tablet (breakpoint edge)' }
];

const PAD = 4; // px of breathing room we demand between any two pieces of ink

// The camera zooms into the hub rather than shrinking to fit, so the outer network is
// EXPECTED to run off the edges — you reach those stations by flying to them. What must
// always be fully framed is the hub and its direct neighbours (tier 1); tier 2 may clip.
const TIER1 = new Set(['Home', 'About', 'Settings', 'Apps']);

const browser = await firefox.launch();
const results = [];

for (const { w, h, name } of SIZES) {
	const ctx = await browser.newContext({ viewport: { width: w, height: h } });
	const page = await ctx.newPage();
	await page.goto(`${B}/`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(2600); // let the fly-in + label pop settle

	const items = await page.evaluate(() => {
		const out = [];
		for (const a of document.querySelectorAll('a.node')) {
			const code = a.getAttribute('aria-label').replace('Fly to ', '');
			const label = a.querySelector('text.code');
			const dot = a.querySelector('circle.port');
			const lb = label.getBoundingClientRect();
			const db = dot.getBoundingClientRect();
			out.push({
				code,
				label: { x: lb.x, y: lb.y, w: lb.width, h: lb.height, right: lb.right, bottom: lb.bottom },
				dot: { x: db.x, y: db.y, w: db.width, h: db.height, right: db.right, bottom: db.bottom }
			});
		}
		// Route lines, to check a label never sits on one.
		const legend = document.querySelector('.legend')?.getBoundingClientRect() ?? null;
		const mast = document.querySelector('.masthead')?.getBoundingClientRect() ?? null;
		return { out, legend: legend && { y: legend.y, bottom: legend.bottom, x: legend.x, right: legend.right }, mast: mast && { bottom: mast.bottom } , vw: innerWidth, vh: innerHeight };
	});

	const hit = (a, b, pad = PAD) =>
		a.x < b.right + pad && b.x < a.right + pad && a.y < b.bottom + pad && b.y < a.bottom + pad;
	const gap = (a, b) => {
		const dx = Math.max(0, Math.max(a.x - b.right, b.x - a.right));
		const dy = Math.max(0, Math.max(a.y - b.bottom, b.y - a.bottom));
		return Math.round(Math.hypot(dx, dy));
	};

	const collisions = [];
	const { out } = items;
	const onScreen = (b) => b.right > 0 && b.x < items.vw && b.bottom > 0 && b.y < items.vh;
	for (let i = 0; i < out.length; i++) {
		for (let j = i + 1; j < out.length; j++) {
			const A = out[i], Bn = out[j];
			for (const [ka, kb] of [['label', 'label'], ['label', 'dot'], ['dot', 'label'], ['dot', 'dot']]) {
				if (onScreen(A[ka]) && onScreen(Bn[kb]) && hit(A[ka], Bn[kb])) {
					collisions.push(`${A.code}.${ka} × ${Bn.code}.${kb}  (gap ${gap(A[ka], Bn[kb])}px)`);
				}
			}
		}
	}

	// Only tier-1 clipping is a bug. Tier 2 running off the edge is the intended framing.
	const clipped = (n) =>
		n.label.x < 0 || n.label.right > items.vw || n.label.y < 0 || n.label.bottom > items.vh ||
		n.dot.x < 0 || n.dot.right > items.vw || n.dot.y < 0 || n.dot.bottom > items.vh;
	const offscreen = out.filter((n) => TIER1.has(n.code) && clipped(n)).map((n) => n.code);
	const offTier2 = out.filter((n) => !TIER1.has(n.code) && clipped(n)).map((n) => n.code);

	// Anything colliding with the legend or masthead?
	const chrome = [];
	for (const n of out) {
		if (items.legend && hit(n.label, { ...items.legend, right: items.legend.right, bottom: items.legend.bottom }, 0)) chrome.push(`${n.code}.label × legend`);
		if (items.mast && n.label.y < items.mast.bottom) chrome.push(`${n.code}.label × masthead`);
	}

	const boxesAll = out.filter((n) => TIER1.has(n.code)).flatMap((n) => [n.label, n.dot]);
	const tightAll =
		Math.min(...boxesAll.map((b) => b.x)) < 12 ||
		items.vw - Math.max(...boxesAll.map((b) => b.right)) < 12;
	results.push({ name, w, h, collisions, offscreen, chrome, tight: tightAll });
	console.log(`\n── ${name}  ${w}×${h} ─────────────────────────`);
	for (const n of out) {
		console.log(
			`  ${n.code.padEnd(21)} label x[${Math.round(n.label.x)}..${Math.round(n.label.right)}] y[${Math.round(n.label.y)}..${Math.round(n.label.bottom)}]   dot(${Math.round(n.dot.x + n.dot.w / 2)},${Math.round(n.dot.y + n.dot.h / 2)})`
		);
	}
	// Margins: how close TIER-1 ink gets to each viewport edge, and to the chrome.
	const boxes = out.filter((n) => TIER1.has(n.code)).flatMap((n) => [n.label, n.dot]);
	const left = Math.round(Math.min(...boxes.map((b) => b.x)));
	const right = Math.round(items.vw - Math.max(...boxes.map((b) => b.right)));
	const top = Math.round(Math.min(...boxes.map((b) => b.y)));
	const bottom = Math.round(items.vh - Math.max(...boxes.map((b) => b.bottom)));
	const mastGap = items.mast ? Math.round(top - items.mast.bottom) : null;
	const legGap = items.legend ? Math.round(items.legend.y - Math.max(...boxes.map((b) => b.bottom))) : null;
	console.log(`  margins  left ${left}  right ${right}  top ${top}  bottom ${bottom}   |  below masthead ${mastGap}  above legend ${legGap}`);
	const tight = [];
	if (left < 12) tight.push(`left ${left}`);
	if (right < 12) tight.push(`right ${right}`);
	if (mastGap !== null && mastGap < 8) tight.push(`masthead ${mastGap}`);
	if (legGap !== null && legGap < 8) tight.push(`legend ${legGap}`);
	if (tight.length) console.log(`  ⚠ TIGHT: ${tight.join(', ')}`);
	console.log(collisions.length ? `  ⚠ COLLISIONS:\n    ${collisions.join('\n    ')}` : '  ✓ no collisions');
	if (offscreen.length) console.log(`  ⚠ TIER-1 CLIPPED: ${offscreen.join(', ')}`);
	if (offTier2.length) console.log(`  · tier-2 off-frame (allowed): ${offTier2.join(', ')}`);
	if (chrome.length) console.log(`  ⚠ CHROME: ${chrome.join(', ')}`);

	await page.screenshot({ path: artifact(`map-${w}x${h}.png`) });
	await ctx.close();
}

await browser.close();
const bad = results.filter((r) => r.collisions.length || r.offscreen.length || r.tight);
console.log(`\n${results.length - bad.length}/${results.length} sizes clean`);
process.exit(bad.length ? 1 : 0);
