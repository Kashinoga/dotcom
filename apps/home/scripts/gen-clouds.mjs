// One-off: bake tileable cloud strips. The softness is painted ONCE here — the page then
// animates only transform, so the browser never computes a blur again.
//
// STRATUS, not cumulus: long, flat, horizontally-drawn layers — streaks of x-stretched
// puffs with little vertical wander, layered a couple of decks per streak. The page's
// tile math assumes this stays 1536×384 (exactly 4:1).
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

	function strip({ seed, streaks, scale, alpha }) {
		const c = document.createElement('canvas');
		c.width = W; c.height = H;
		const g = c.getContext('2d');
		const rand = rng(seed);

		// An x-stretched puff — the stratus grain. Drawn thrice (x, x±W) so the strip
		// tiles; the ellipse comes from scaling the context, not the path, so the
		// gradient stretches with it.
		function puff(x, y, r, a, sx) {
			for (const dx of [-W, 0, W]) {
				g.save();
				g.translate(x + dx, y);
				g.scale(sx, 1);
				const grad = g.createRadialGradient(0, 0, r * 0.12, 0, 0, r);
				grad.addColorStop(0, `rgba(255,255,255,${a})`);
				grad.addColorStop(0.7, `rgba(255,255,255,${a * 0.5})`);
				grad.addColorStop(1, 'rgba(255,255,255,0)');
				g.fillStyle = grad;
				g.beginPath();
				g.arc(0, 0, r, 0, Math.PI * 2);
				g.fill();
				g.restore();
			}
		}

		// A streak = a long, mostly-level band with real THICKNESS: a dense core deck, a
		// belly deck beneath it, and a thinner wisp deck above — three decks tall, still
		// barely wandering in y. The ends thin out (alpha eases toward the tips) so the
		// band feathers away instead of stopping.
		for (let i = 0; i < streaks; i++) {
			const cx = rand() * W;
			const baseY = H * (0.22 + rand() * 0.45);
			const size = (0.7 + rand() * 0.6) * scale;
			const halfLen = (220 + rand() * 260) * size; // long: streaks run 440–960px
			const puffs = 14 + Math.floor(rand() * 8);
			for (let j = 0; j < puffs; j++) {
				const t = (j + 0.5) / puffs - 0.5; // -0.5..0.5 across the streak
				const px = cx + t * 2 * halfLen + (rand() - 0.5) * 24;
				const py = baseY + (rand() - 0.5) * 14 * size;
				const tip = 1 - Math.abs(t) * 1.6; // feathered ends
				puff(px, py, (26 + rand() * 14) * size, alpha * Math.max(0.25, tip), 2.4 + rand() * 1.1);
			}
			// the belly deck: as dense as the core, hanging just beneath it
			const belly = 10 + Math.floor(rand() * 5);
			for (let j = 0; j < belly; j++) {
				const t = (j + 0.5) / belly - 0.5;
				const px = cx + t * 1.8 * halfLen + (rand() - 0.5) * 26;
				const tip = 1 - Math.abs(t) * 1.6;
				puff(px, baseY + (20 + rand() * 12) * size, (22 + rand() * 12) * size, alpha * 0.7 * Math.max(0.25, tip), 2.5 + rand() * 1);
			}
			// the wisp deck: sparser, fainter, a shade above
			const wisps = 6 + Math.floor(rand() * 4);
			for (let j = 0; j < wisps; j++) {
				const t = (j + 0.5) / wisps - 0.5;
				const px = cx + t * 1.7 * halfLen + (rand() - 0.5) * 30;
				puff(px, baseY - (24 + rand() * 12) * size, (18 + rand() * 10) * size, alpha * 0.45, 2.8 + rand() * 1.3);
			}
		}
		return c.toDataURL('image/webp', 0.82);
	}

	return {
		// FAR: more, thinner, fainter — the haze sheet the near layer slides over.
		far: strip({ seed: 11, streaks: 7, scale: 0.75, alpha: 0.36 }),
		// NEAR: fewer, longer, more present.
		near: strip({ seed: 47, streaks: 4, scale: 1.2, alpha: 0.5 })
	};
}, [W, H]);

await browser.close();

for (const [name, dataUrl] of Object.entries(draw)) {
	const webp = Buffer.from(dataUrl.split(',')[1], 'base64');
	writeFileSync(`src/lib/assets/cloud-${name}.webp`, webp);
}
console.log('written');
