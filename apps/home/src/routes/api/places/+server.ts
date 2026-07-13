import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Same-origin proxy for city search — what the Weather app's search box talks to.
//
// Open-Meteo's geocoder: free, keyless, and it sends no CORS header, so the page can't call it
// directly (the same reason /api/weather and /api/wallpaper exist).
//
// Results are filtered to the UNITED STATES on purpose. It isn't a shortcut — the National Weather
// Service only covers the US and its territories, so a search that happily offered Paris would be
// offering a city the app cannot then report on. Better to not show what we can't answer.
const UPSTREAM = 'https://geocoding-api.open-meteo.com/v1/search';

type Hit = {
	name?: string;
	admin1?: string; // state
	country_code?: string;
	latitude?: number;
	longitude?: number;
	population?: number;
	id?: number;
};

export const GET: RequestHandler = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	// Two characters is where the geocoder starts saying anything useful; below that it's noise.
	if (q.length < 2) return json({ places: [] }, { headers: { 'cache-control': 'no-store' } });

	try {
		const r = await fetch(
			`${UPSTREAM}?name=${encodeURIComponent(q)}&count=20&language=en&format=json`,
			{ headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
		);
		if (!r.ok) throw new Error(String(r.status));
		const data = (await r.json()) as { results?: Hit[] };

		const places = (data.results ?? [])
			.filter((h) => h.country_code === 'US' && typeof h.latitude === 'number')
			.map((h) => ({
				id: String(h.id ?? `${h.latitude},${h.longitude}`),
				name: h.name ?? '',
				state: h.admin1 ?? '',
				lat: h.latitude as number,
				lon: h.longitude as number,
				// Kept only to rank: a search for "Springfield" should put the big one first.
				population: h.population ?? 0
			}))
			.sort((a, b) => b.population - a.population)
			.slice(0, 6);

		// A place's coordinates don't move. Cache hard.
		return json({ places }, { headers: { 'cache-control': 'public, max-age=86400' } });
	} catch {
		return json({ places: [], msg: 'search unavailable' }, { status: 502 });
	}
};
