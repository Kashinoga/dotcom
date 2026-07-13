import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Same-origin proxy for the National Weather Service (NOAA) — the Weather app's current conditions.
//
// Why it's a route and not a fetch from the page: getting one temperature out of NWS takes THREE
// hops — /points/{lat},{lon} names the observation-stations list, that list names the nearest
// station, and only then does /stations/{id}/observations/latest carry a reading. Doing that from
// the browser would be three round trips per location, on every visit, with no shared cache. Here
// it's one request out and one small object back.
//
// The API is free, keyless, and public, but it asks callers to identify themselves in the
// User-Agent (its docs say a bare default UA may be blocked) — another thing a page fetch can't do,
// since the browser owns that header.
const UA = 'kashinoga.com (contact@kashinoga.com)';
const NWS = 'https://api.weather.gov';

type Reading = { value: number | null; unitCode?: string };

const get = async (url: string) => {
	const r = await fetch(url, {
		headers: { accept: 'application/geo+json', 'user-agent': UA },
		signal: AbortSignal.timeout(6000)
	});
	if (!r.ok) throw new Error(`${r.status} ${url}`);
	return r.json();
};

// A reading is often present but null (a station that reports no humidity, say) — and NWS gives
// Celsius, km/h and metres regardless of where you are. Convert here so the page holds numbers, not
// unit codes.
const c2f = (c: number) => (c * 9) / 5 + 32;
const kmh2mph = (k: number) => k * 0.621371;
const num = (r: Reading | undefined | null) => (typeof r?.value === 'number' ? r.value : null);

// Cache per rounded lat/lon: conditions are re-reported about hourly, so a few minutes of staleness
// is invisible and it keeps NWS from being hit once per page view. Module scope = per Worker isolate.
const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 5 * 60 * 1000;

export const GET: RequestHandler = async ({ url }) => {
	const lat = Number(url.searchParams.get('lat'));
	const lon = Number(url.searchParams.get('lon'));
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
		return json({ msg: 'bad coordinates' }, { status: 400 });
	}
	const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL) {
		return json(hit.body, { headers: { 'cache-control': 'public, max-age=300' } });
	}

	try {
		// 1. the grid point — it knows the nearest town and which stations serve this spot
		const point = await get(`${NWS}/points/${key}`);
		const rel = point?.properties?.relativeLocation?.properties;
		const place = rel?.city && rel?.state ? `${rel.city}, ${rel.state}` : '';

		// 2. the stations that report for it, nearest first
		const stations = await get(point.properties.observationStations);
		const first = stations?.features?.[0]?.properties;
		if (!first?.stationIdentifier) throw new Error('no station');

		// 3. that station's latest reading
		const obs = await get(`${NWS}/stations/${first.stationIdentifier}/observations/latest`);
		const p = obs?.properties ?? {};
		const tempC = num(p.temperature);
		const feelsC = num(p.heatIndex) ?? num(p.windChill); // NWS reports whichever applies, if either
		const windK = num(p.windSpeed);

		const body = {
			place,
			station: { id: first.stationIdentifier, name: first.name ?? '' },
			observedAt: p.timestamp ?? null,
			// `icon` is a URL into NWS's own icon set — deliberately unused: the app draws its own
			// mark from `conditions` so the weather reads in the site's hand, not NOAA's.
			conditions: p.textDescription ?? '',
			// Night matters to the drawn mark (a clear night is a moon, not a sun). NWS encodes it in
			// the icon path (…/icons/land/night/skc), which is the only place it says so.
			night: typeof p.icon === 'string' && p.icon.includes('/night/'),
			tempC,
			tempF: tempC === null ? null : c2f(tempC),
			feelsC,
			feelsF: feelsC === null ? null : c2f(feelsC),
			humidity: num(p.relativeHumidity),
			windMph: windK === null ? null : kmh2mph(windK),
			windDir: num(p.windDirection)
		};
		if (body.tempC === null && !body.conditions) throw new Error('empty observation');

		cache.set(key, { at: Date.now(), body });
		return json(body, { headers: { 'cache-control': 'public, max-age=300' } });
	} catch {
		// Upstream down, or a station that briefly reports nothing: serve the last good reading for
		// this place rather than blanking the panel. With none, the page says so.
		if (hit) return json(hit.body, { headers: { 'cache-control': 'public, max-age=60' } });
		return json({ msg: 'upstream unavailable' }, { status: 502 });
	}
};
