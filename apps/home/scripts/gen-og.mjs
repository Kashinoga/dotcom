// Bake the share cards — one 1200×630 PNG per place, into static/og/.
//
// Every place already tells a crawler its title and its description (see the <svelte:head> in
// [...view=view]/+page.svelte). None of them carried an IMAGE, so a link to any of the apps
// unfurled as a bare grey rectangle with text beside it — which is the one place a site whose
// whole point is showing work gets seen by people who have not visited it.
//
// Baked, not rendered per request. A share card for a place changes when that place's title,
// blurb, accent or mark changes — which is a deploy — so paying for it once here beats paying
// for it on every crawl, and it keeps the Worker free of an image pipeline.
//
// Playwright draws them, the same way scripts/gen-clouds.mjs bakes the cloud strips: it is
// already a devDependency, it renders the real fonts, and the card is described in the same CSS
// the site is built from rather than in a second drawing API that would drift from it.
//
//   node --experimental-strip-types --import ./test/register.mjs scripts/gen-og.mjs
//
// (The flags are what let a plain Node script import the register, which is TypeScript and pulls
// in SVG assets — see test/loader.mjs. `pnpm --filter home gen:og` wraps it.)

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { places, codes, PORT_ICONS, accent, portDescriptions } from '../src/lib/places.ts';
import { viewToSlug, SITE } from '../src/lib/views.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..');
const FONTS = resolve(APP, '../../packages/puhig/src/fonts');
const OUT = resolve(APP, 'static/og');

// 1200×630 is the size every unfurler crops to. Anything else gets letterboxed or cut.
const W = 1200;
const H = 630;

const font = (file) => readFileSync(resolve(FONTS, file)).toString('base64');
const MONO = font('space-mono.woff2');
const MONO_BOLD = font('space-mono-bold.woff2');
const BODY = font('ibm-plex-sans.woff2');

/** Pixelite's cobalt — the site's one ink accent, worn by the wordmark. */
const COBALT = '#103dff';

const card = (code) => {
	const place = places[code];
	const ink = accent[code];
	// The hub's card is the site's own, so it says the site rather than "Home".
	const title = code === 'KSH' ? SITE.toUpperCase() : place.title;
	const blurb = portDescriptions[code];
	// The path a reader would actually be at. Shown so the card names where it goes.
	const path = code === 'KSH' ? '/' : `/${viewToSlug({ kind: 'port', code })}`;

	return `<!doctype html><html><head><meta charset="utf-8"><style>
	@font-face { font-family: 'Space Mono'; src: url(data:font/woff2;base64,${MONO}) format('woff2'); font-weight: 400; }
	@font-face { font-family: 'Space Mono'; src: url(data:font/woff2;base64,${MONO_BOLD}) format('woff2'); font-weight: 700; }
	@font-face { font-family: 'IBM Plex Sans'; src: url(data:font/woff2;base64,${BODY}) format('woff2'); font-weight: 400; }
	* { margin: 0; padding: 0; box-sizing: border-box; }
	body {
		width: ${W}px; height: ${H}px;
		/* Pixelite's paper, and its 32px grid — the same one base.css renders behind the site. */
		background: #fbfbfb;
		background-image:
			linear-gradient(to right, rgba(16,61,255,.05) 1px, transparent 1px),
			linear-gradient(to bottom, rgba(16,61,255,.05) 1px, transparent 1px);
		background-size: 32px 32px;
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		color: #000;
		display: flex; flex-direction: column;
		padding: 72px 80px;
	}
	/* The masthead rule, as on the site: the wordmark, then the place, hairline under. */
	.top { display: flex; align-items: center; gap: 18px; padding-bottom: 26px; border-bottom: 2px solid rgba(0,0,0,.12); }
	.mark { font-family: 'Space Mono', monospace; font-weight: 700; font-size: 30px; letter-spacing: .06em; color: ${COBALT}; }
	.sep { width: 2px; height: 26px; background: rgba(0,0,0,.15); }
	.crumb { font-family: 'Space Mono', monospace; font-size: 21px; letter-spacing: .12em; text-transform: uppercase; color: rgba(0,0,0,.45); }
	.body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 30px; }
	.icon {
		width: 104px; height: 104px; border-radius: 22px; flex: none;
		display: flex; align-items: center; justify-content: center;
		background: color-mix(in srgb, ${ink} 14%, transparent);
		border: 2px solid color-mix(in srgb, ${ink} 30%, transparent);
		color: ${ink};
	}
	.icon svg { width: 56px; height: 56px; }
	h1 {
		font-family: 'Space Mono', monospace; font-weight: 700;
		font-size: ${title.length > 22 ? 62 : 78}px; line-height: 1.06;
		letter-spacing: -.015em; text-transform: uppercase;
	}
	p { font-size: 32px; line-height: 1.42; color: rgba(0,0,0,.62); max-width: 22ch; max-width: 900px; }
	.foot { display: flex; align-items: center; gap: 14px; font-family: 'Space Mono', monospace; font-size: 22px; color: rgba(0,0,0,.4); }
	.dot { width: 12px; height: 12px; border-radius: 50%; background: ${ink}; }
	</style></head><body>
		<div class="top">
			<span class="mark">KASHINOGA</span>
			<span class="sep"></span>
			<span class="crumb">${code === 'KSH' ? 'Personal site' : place.title}</span>
		</div>
		<div class="body">
			<div class="icon">${PORT_ICONS[code]}</div>
			<h1>${title}</h1>
			<p>${blurb}</p>
		</div>
		<div class="foot"><span class="dot"></span><span>kashinoga.com${path}</span></div>
	</body></html>`;
};

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

for (const code of codes) {
	await page.setContent(card(code), { waitUntil: 'load' });
	await page.evaluate(() => document.fonts.ready);
	// Named by the place's canonical slug, flattened — `apps/air-traffic` becomes
	// `apps-air-traffic`, so the whole set is one flat directory the page can address by rule.
	const slug = code === 'KSH' ? 'home' : viewToSlug({ kind: 'port', code }).replace(/\//g, '-');
	const png = await page.screenshot({ type: 'png' });
	writeFileSync(resolve(OUT, `${slug}.png`), png);
	console.log(
		`og/${slug}.png  ${String(Math.round(png.length / 1024)).padStart(4)} KB  ${places[code].title}`
	);
}

await browser.close();
