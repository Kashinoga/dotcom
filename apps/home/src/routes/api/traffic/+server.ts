import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Same-origin proxy for the live ADS-B feed.
//
// Why this exists: the board used to fetch airplanes.live directly from the
// browser, but in mid-2026 `api.airplanes.live/v2/point/*` started returning 404
// (the free host went away; the replacement `rest.api.airplanes.live` is
// key-gated). The keyless mirrors (adsb.lol, adsb.fi) serve the identical schema
// but send no CORS headers, so the browser can't call them directly. Proxying
// server-side (on the Cloudflare Worker) sidesteps CORS entirely and lets one
// source fall back to another instead of blanking the board.
//
// Sources are tried in order: airplanes.live first because it's richer (it adds
// ownOp / desc / year, which feed the Operator column and photo card) and so the
// board upgrades itself automatically if/when that host recovers; adsb.lol is the
// keyless fallback with the same fields minus that enrichment.
const SOURCES = ['https://api.airplanes.live/v2/point', 'https://api.adsb.lol/v2/point'];

const NUM = /^-?\d+(?:\.\d+)?$/;

export const GET: RequestHandler = async ({ url }) => {
	const lat = url.searchParams.get('lat') ?? '';
	const lon = url.searchParams.get('lon') ?? '';
	const dist = url.searchParams.get('dist') ?? '';
	if (!NUM.test(lat) || !NUM.test(lon) || !/^\d{1,4}$/.test(dist)) {
		return json({ ac: [], msg: 'bad params' }, { status: 400 });
	}

	for (const base of SOURCES) {
		try {
			const r = await fetch(`${base}/${lat}/${lon}/${dist}`, {
				headers: { accept: 'application/json' },
				signal: AbortSignal.timeout(6000)
			});
			if (!r.ok) continue;
			const data = (await r.json()) as { ac?: unknown };
			if (!data || !Array.isArray(data.ac)) continue;
			// Same-origin response — no CORS needed; just keep it uncached (live data).
			return json(data, { headers: { 'cache-control': 'no-store' } });
		} catch {
			// network error / timeout / bad JSON — fall through to the next source
		}
	}
	return json({ ac: [], msg: 'upstream unavailable' }, { status: 502 });
};
