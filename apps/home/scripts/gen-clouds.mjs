// One-off: bake tileable cloud strips. The softness is painted ONCE here — the page then
// animates only transform, so the browser never computes a blur again.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const W = 1536, H = 384;

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

const draw = await page.evaluate(([W, H]) => {
	// Mulberry32 — seeded, so reruns are reproducible while tuning.
	function rng(seed) {
		return () => {
			seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	function strip({ seed, clusters, scale, alpha }) {
		const c = document.createElement('canvas');
		c.width = W; c.height = H;
		const g = c.getContext('2d');
		const rand = rng(seed);

		// A cluster = a flat-bottomed cumulus: a row of base puffs on a shared baseline,
		// domes stacked above. Every puff is drawn thrice (x, x±W) so the strip tiles.
		function puff(x, y, r, a) {
			for (const dx of [-W, 0, W]) {
				const grad = g.createRadialGradient(x + dx, y, r * 0.15, x + dx, y, r);
				grad.addColorStop(0, `rgba(255,255,255,${a})`);
				grad.addColorStop(0.65, `rgba(255,255,255,${a * 0.55})`);
				grad.addColorStop(1, 'rgba(255,255,255,0)');
				g.fillStyle = grad;
				g.beginPath();
				g.arc(x + dx, y, r, 0, Math.PI * 2);
				g.fill();
			}
		}

		for (let i = 0; i < clusters; i++) {
			const cx = rand() * W;
			const baseY = H * (0.35 + rand() * 0.35);
			const size = (0.6 + rand() * 0.8) * scale;
			const span = 5 + Math.floor(rand() * 4); // base puffs in the row
			// the flat-ish bottom row
			for (let j = 0; j < span; j++) {
				const px = cx + (j - span / 2) * 26 * size + (rand() - 0.5) * 10;
				puff(px, baseY, (26 + rand() * 12) * size, alpha);
			}
			// domes on top, tallest near the middle
			const domes = 3 + Math.floor(rand() * 3);
			for (let j = 0; j < domes; j++) {
				const t = (j + 0.5) / domes; // 0..1 across the cloud
				const px = cx + (t - 0.5) * span * 22 * size;
				const lift = Math.sin(t * Math.PI); // taller centre
				puff(px, baseY - (18 + lift * 26) * size, (24 + rand() * 14) * size, alpha * 0.95);
			}
		}
		return c.toDataURL('image/webp', 0.82);
	}

	return {
		// FAR: more, smaller, fainter — the haze band the near layer floats over.
		far: strip({ seed: 11, clusters: 12, scale: 0.65, alpha: 0.34 }),
		// NEAR: fewer, bigger, more present.
		near: strip({ seed: 47, clusters: 6, scale: 1.15, alpha: 0.5 })
	};
}, [W, H]);

await browser.close();

for (const [name, dataUrl] of Object.entries(draw)) {
	const webp = Buffer.from(dataUrl.split(',')[1], 'base64');
	writeFileSync(`src/lib/assets/cloud-${name}.webp`, webp);
}
console.log('written');
