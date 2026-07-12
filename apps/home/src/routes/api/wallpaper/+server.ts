import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Same-origin proxy for Bing's wallpaper archive — the Photo sky.
//
// Why this exists: the image files themselves are CORS-open (`www.bing.com/th?id=…` answers with
// `access-control-allow-origin: *`), so the browser loads those directly and none of the heavy bytes
// pass through here. But the METADATA endpoint sends no CORS header at all, so the page can't ask it
// which photos there are. That one small JSON call is all this route proxies.
//
// The endpoint is undocumented — it is what KDE's Picture-of-the-Day plugin and every other "Bing
// daily wallpaper" tool has used for years. `idx` is how many days back to start, `n` how many days
// to return, `mkt` the locale.
//
// We take the whole window rather than just today: Windows Spotlight rotates through a handful of
// pictures, and eight days of Bing gives the sky the same variety from a source we're already using
// — no second upstream, and every photo still arrives with its own credit line. The PAGE picks one
// (see loadPhoto); this route just serves the set.
const DAYS = 8; // Bing's ceiling — it keeps about a week
const UPSTREAM = `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${DAYS}&mkt=en-US`;

type BingImage = {
	urlbase?: string;
	title?: string;
	copyright?: string;
	copyrightlink?: string;
	startdate?: string;
};

// The archive changes once a day, so a miss is cheap and a hit is free. Held in module scope: on the
// Worker that's per-isolate, which is the granularity we want.
let cached: unknown = null;

export const GET: RequestHandler = async () => {
	try {
		const r = await fetch(UPSTREAM, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(6000)
		});
		if (!r.ok) throw new Error(String(r.status));
		const data = (await r.json()) as { images?: BingImage[] };
		// urlbase is a path like `/th?id=OHR.Foo_EN-US123`; the size is a suffix on it. 1080p is
		// ~330KB and is what actually gets painted; UHD is ~3.7MB and is offered as an upgrade the
		// client may or may not take.
		const photos = (data.images ?? [])
			.filter((i): i is BingImage & { urlbase: string } => !!i.urlbase)
			.map((i) => ({
				url: `https://www.bing.com${i.urlbase}_1920x1080.jpg`,
				uhd: `https://www.bing.com${i.urlbase}_UHD.jpg`,
				title: i.title ?? '',
				// Bing's own line, e.g. "Katahdin Woods…, Maine (© Cavan Images/Offset/Shutterstock)".
				// These photos are licensed to Microsoft, not to us — so the credit always ships with
				// the picture, and the page renders it.
				copyright: i.copyright ?? '',
				copyrightlink: i.copyrightlink ?? '',
				date: i.startdate ?? ''
			}));
		if (!photos.length) throw new Error('no images');

		const body = { photos };
		cached = body;
		// A day of browser cache, and let a shared cache serve a stale copy while it revalidates.
		return json(body, {
			headers: { 'cache-control': 'public, max-age=3600, stale-while-revalidate=86400' }
		});
	} catch {
		// Upstream hiccup: serve the last set we saw rather than blanking the sky. The client falls
		// back to the solid background if there's nothing at all.
		if (cached) return json(cached, { headers: { 'cache-control': 'public, max-age=300' } });
		return json({ msg: 'upstream unavailable' }, { status: 502 });
	}
};
