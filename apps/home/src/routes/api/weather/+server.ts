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

// Feels-like for a FORECAST hour, from the standard NWS formulas: the Rothfusz heat index
// when it's hot, the wind-chill regression when it's cold and blowing, the plain temperature
// between. NWS's own apparentTemperature series says the same thing, but it lives in the raw
// gridpoint endpoint — a few hundred KB of every series they compute — while the hourly
// forecast already carries the three inputs. Computing here trades one large fetch for
// arithmetic the agency itself published.
function apparentF(tF: number, rh: number | null, windMph: number | null): number {
	if (tF >= 80 && rh !== null) {
		return (
			-42.379 +
			2.04901523 * tF +
			10.14333127 * rh -
			0.22475541 * tF * rh -
			0.00683783 * tF * tF -
			0.05481717 * rh * rh +
			0.00122874 * tF * tF * rh +
			0.00085282 * tF * rh * rh -
			0.00000199 * tF * tF * rh * rh
		);
	}
	if (tF <= 50 && windMph !== null && windMph > 3) {
		const v = Math.pow(windMph, 0.16);
		return 35.74 + 0.6215 * tF - 35.75 * v + 0.4275 * tF * v;
	}
	return tF;
}

// One rail's worth. NWS sends ~156 periods; the panel is a glance, not a planner.
const HOURS = 12;

/** The next hours, shaped for the panel's rail. [] on any trouble — hours are a garnish,
 *  and their fetch failing must never take the current conditions down with it. */
async function fetchHours(forecastHourlyUrl: string | undefined) {
	if (!forecastHourlyUrl) return [];
	try {
		const fc = await get(forecastHourlyUrl);
		const periods: any[] = fc?.properties?.periods ?? [];
		const now = Date.now();
		return periods
			.filter((p) => Date.parse(p.endTime) > now) // the period we're inside counts; spent ones don't
			.slice(0, HOURS)
			.map((p) => {
				const tempF = typeof p.temperature === 'number' ? p.temperature : null;
				// windSpeed arrives as prose ("5 mph"); the leading number is the value.
				const windMph = Number.parseFloat(p.windSpeed) || null;
				const rh = num(p.relativeHumidity);
				return {
					t: p.startTime as string,
					tempF,
					feelsF: tempF === null ? null : apparentF(tempF, rh, windMph),
					pop: num(p.probabilityOfPrecipitation) ?? 0,
					windMph,
					label: (p.shortForecast as string) ?? '',
					night: p.isDaytime === false
				};
			});
	} catch {
		return [];
	}
}

// Cache per rounded lat/lon. Module scope = per Worker isolate.
//
// The TTL is derived from the OBSERVATION, not from a clock we picked. A station reports roughly
// hourly, and each reading says when it was taken — so once we hold one, we know there is nothing
// new to fetch until about an hour after that timestamp. Asking again before then would be a request
// we already know the answer to, which is exactly the kind of traffic a free, keyless public service
// shouldn't have to absorb.
//
// FLOOR is the fallback for a reading with no timestamp (or a station reporting more often than
// hourly): never hit the upstream more than once every few minutes for the same place.
const cache = new Map<string, { at: number; body: { observedAt?: string | null } }>();
const FLOOR = 5 * 60 * 1000; // never refetch a place more often than this
const CYCLE = 60 * 60 * 1000; // how often a station takes a reading
const SLACK = 5 * 60 * 1000; // wait a little past the hour before expecting the next one

/** Is the cached reading still the latest one the station has taken? */
function stillCurrent(hit: { at: number; body: { observedAt?: string | null } }): boolean {
	const now = Date.now();
	if (now - hit.at < FLOOR) return true; // just fetched — don't ask again regardless
	const observed = hit.body?.observedAt ? Date.parse(hit.body.observedAt) : NaN;
	if (!Number.isFinite(observed)) return false; // no timestamp to reason from — refetch on FLOOR
	// The next reading isn't due yet, so what we hold IS the current one.
	return now < observed + CYCLE + SLACK;
}

export const GET: RequestHandler = async ({ url }) => {
	const lat = Number(url.searchParams.get('lat'));
	const lon = Number(url.searchParams.get('lon'));
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
		return json({ msg: 'bad coordinates' }, { status: 400 });
	}
	const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
	const hit = cache.get(key);
	if (hit && stillCurrent(hit)) {
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

		// 3. that station's latest reading — and, alongside it, the next hours' forecast
		// (the /points response already named the URL; the two upstreams are independent).
		const [obs, hours] = await Promise.all([
			get(`${NWS}/stations/${first.stationIdentifier}/observations/latest`),
			fetchHours(point?.properties?.forecastHourly)
		]);
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
			windDir: num(p.windDirection),
			hours
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
