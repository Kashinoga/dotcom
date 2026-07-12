import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Same-origin proxy for Bing's daily wallpaper — the Photo sky.
//
// Why this exists: the image files themselves are CORS-open (`www.bing.com/th?id=…` answers with
// `access-control-allow-origin: *`), so the browser loads those directly and none of the heavy bytes
// pass through here. But the METADATA endpoint sends no CORS header at all, so the page can't ask it
// which photo today is. That one small JSON call is all this route proxies.
//
// The endpoint is undocumented — it is what KDE's Picture-of-the-Day plugin and every other "Bing
// daily wallpaper" tool has used for years. `idx` is how many days back to start, `n` how many days
// to return (8 is the ceiling; Bing keeps about a week), `mkt` the locale.
const UPSTREAM = 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US';

type BingImage = {
	urlbase?: string;
	title?: string;
	copyright?: string;
	copyrightlink?: string;
	startdate?: string;
};

// The photo changes once a day, so a miss is cheap and a hit is free. Held in module scope: on the
// Worker that's per-isolate, which is exactly the granularity we want (no cross-request staleness
// beyond the day it's keyed on).
let cached: { day: string; body: unknown } | null = null;

export const GET: RequestHandler = async () => {
	try {
		const r = await fetch(UPSTREAM, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(6000)
		});
		if (!r.ok) throw new Error(String(r.status));
		const data = (await r.json()) as { images?: BingImage[] };
		const img = data.images?.[0];
		if (!img?.urlbase) throw new Error('no image');

		// urlbase is a path like `/th?id=OHR.Foo_EN-US123`; the size is a suffix on it. 1080p is
		// ~330KB and is what actually gets painted; UHD is ~3.7MB and is offered as an upgrade the
		// client may or may not take.
		const body = {
			url: `https://www.bing.com${img.urlbase}_1920x1080.jpg`,
			uhd: `https://www.bing.com${img.urlbase}_UHD.jpg`,
			title: img.title ?? '',
			// Bing's own line, e.g. "Katahdin Woods…, Maine (© Cavan Images/Offset/Shutterstock)".
			// These photos are licensed to Microsoft, not to us — so the credit always ships with the
			// picture, and the page renders it.
			copyright: img.copyright ?? '',
			copyrightlink: img.copyrightlink ?? '',
			date: img.startdate ?? ''
		};
		cached = { day: body.date, body };
		// A day of browser cache, and let a shared cache serve a stale copy while it revalidates.
		return json(body, {
			headers: { 'cache-control': 'public, max-age=3600, stale-while-revalidate=86400' }
		});
	} catch {
		// Upstream hiccup: serve the last photo we saw rather than blanking the sky. The client falls
		// back to the solid background if there's nothing at all.
		if (cached) {
			return json(cached.body, { headers: { 'cache-control': 'public, max-age=300' } });
		}
		return json({ msg: 'upstream unavailable' }, { status: 502 });
	}
};
