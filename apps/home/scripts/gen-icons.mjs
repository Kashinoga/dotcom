// Bake the Text Editor's install icons — the PNGs a home screen, a Start menu and a task bar
// draw when the editor is installed as an app.
//
//   node scripts/gen-icons.mjs        (pnpm --filter home gen:icons)
//
// PNG because that is what an installer will render: a manifest may name an SVG and Chromium
// will even accept one, but the platforms downstream of it (the Windows shell, the Android
// launcher, the macOS dock) want raster at known sizes, and an icon that silently falls back to
// a letter in a circle is the one asset nobody notices is broken.
//
// Playwright draws them, for the reason scripts/gen-og.mjs draws the share cards: it is already
// a devDependency, and the mark is DESCRIBED here in the same SVG the tab wears rather than
// redrawn in a second drawing API that would drift from it.
//
// The source is $lib/assets/favicon-text-editor.svg, which carries a dark-scheme rule of its
// own. That rule is deliberately overridden below: an installed icon is stamped once and shown
// against a launcher's own background forever, so it cannot follow a scheme the way a tab's
// favicon can.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..');
const OUT = resolve(APP, 'static/icons');

/** Pixelite's cobalt — the ink the favicon is drawn in, and the site's one accent. */
const COBALT = '#103dff';
/** The sheet. Pixelite is paper, and the icon is a small piece of it. */
const PAPER = '#ffffff';

const MARK = readFileSync(resolve(APP, 'src/lib/assets/favicon-text-editor.svg'), 'utf8');

/**
 * One icon.
 *
 * `inset` is the share of the canvas the MARK takes, and it is the whole of the difference
 * between the two purposes. A plain icon is shown as drawn, so it can run close to its edges.
 * A MASKABLE one is cropped by the platform to whatever shape that platform likes — a circle on
 * Android, a squircle elsewhere — and everything outside the middle 80% can be cut. So the mark
 * shrinks and the paper runs full bleed: the crop then takes background rather than nib.
 */
const icon = (size, inset) => `<!doctype html><html><head><meta charset="utf-8"><style>
	* { margin: 0; padding: 0; box-sizing: border-box; }
	html, body { width: ${size}px; height: ${size}px; }
	body { display: grid; place-items: center; background: ${PAPER}; }
	.mark { width: ${Math.round(size * inset)}px; height: ${Math.round(size * inset)}px; }
	.mark svg { display: block; width: 100%; height: 100%; }
	/* Beats the scheme rule inside the file itself — see the note at the head. */
	.mark svg path { fill: ${COBALT} !important; }
	</style></head><body><div class="mark">${MARK}</div></body></html>`;

/**
 * Every icon this app needs, and who asks for each.
 *
 *   192  the manifest's smallest installable size — Chromium will not offer an install
 *        without one at 192 or better
 *   512  the manifest's large size: splash screens, the Windows Start menu tile
 *   180  apple-touch-icon. iOS reads no manifest icon at all for Add to Home Screen
 *   512  maskable, for the launchers that crop
 */
const ICONS = [
	{ file: 'text-editor-192.png', size: 192, inset: 0.66 },
	{ file: 'text-editor-512.png', size: 512, inset: 0.66 },
	{ file: 'text-editor-180.png', size: 180, inset: 0.66 },
	{ file: 'text-editor-maskable-512.png', size: 512, inset: 0.46 }
];

mkdirSync(OUT, { recursive: true });

// A light scheme, stated rather than assumed: the mark's own stylesheet answers to
// prefers-color-scheme, and a machine set to dark would otherwise bake the pale variant.
const browser = await chromium.launch();
const page = await browser.newPage({ colorScheme: 'light', deviceScaleFactor: 1 });

for (const { file, size, inset } of ICONS) {
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(icon(size, inset), { waitUntil: 'load' });
	const png = await page.screenshot({ type: 'png' });
	writeFileSync(resolve(OUT, file), png);
	console.log(`icons/${file}  ${String(Math.round(png.length / 1024)).padStart(3)} KB`);
}

await browser.close();
