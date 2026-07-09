// The Air Traffic board's field selector.
//
// Lifted out of TrafficBoard.svelte so the URL layer can resolve `?field=sfo` against
// the same list the board renders its chips from — a link can't name a field the board
// doesn't have.

export type Airport = {
	icao: string;
	iata: string;
	name: string;
	lat: number;
	lon: number;
	demo?: boolean;
};

// A small curated field list — the selector. The default is GRACEMERIA, a fictional
// Ace Combat field whose traffic is canned (see the demo block in TrafficBoard) — so a
// first visit exercises the whole board without touching the live ADS-B / route APIs.
// Pick any real field to go live.
export const AIRPORTS: Airport[] = [
	{ icao: 'EMGR', iata: 'GRM', name: 'Gracemeria', lat: 0, lon: 0, demo: true },
	{ icao: 'KDSM', iata: 'DSM', name: 'Des Moines', lat: 41.534, lon: -93.6631 },
	{ icao: 'KORD', iata: 'ORD', name: 'Chicago O’Hare', lat: 41.9742, lon: -87.9073 },
	{ icao: 'KMSP', iata: 'MSP', name: 'Minneapolis', lat: 44.8848, lon: -93.2223 },
	{ icao: 'KDEN', iata: 'DEN', name: 'Denver', lat: 39.8561, lon: -104.6737 },
	{ icao: 'KDFW', iata: 'DFW', name: 'Dallas–Fort Worth', lat: 32.8998, lon: -97.0403 },
	{ icao: 'KATL', iata: 'ATL', name: 'Atlanta', lat: 33.6407, lon: -84.4277 },
	{ icao: 'KJFK', iata: 'JFK', name: 'New York JFK', lat: 40.6413, lon: -73.7781 },
	{ icao: 'KLAX', iata: 'LAX', name: 'Los Angeles', lat: 33.9416, lon: -118.4085 },
	{ icao: 'KSFO', iata: 'SFO', name: 'San Francisco', lat: 37.6213, lon: -122.379 },
	{ icao: 'KSEA', iata: 'SEA', name: 'Seattle', lat: 47.4502, lon: -122.3088 }
];

/** Where the board starts when the URL says nothing. */
export const DEFAULT_FIELD = AIRPORTS[0];

/**
 * The `?field=` token for a field — its IATA code, lowercased (`sfo`). The default field
 * has no token: it's what you get with no param, so spelling it out would be noise.
 */
export function fieldToken(field: Airport): string | null {
	return field.icao === DEFAULT_FIELD.icao ? null : field.iata.toLowerCase();
}

/**
 * Resolve a `?field=` value. Accepts IATA (`sfo`) or ICAO (`ksfo`), any casing — both
 * are things a person reading the board might type. Null when it names no field.
 */
export function resolveField(token: string | null | undefined): Airport | null {
	if (!token) return null;
	const t = token.trim().toLowerCase();
	return AIRPORTS.find((a) => a.iata.toLowerCase() === t || a.icao.toLowerCase() === t) ?? null;
}

/** Look a field up by the IATA code carried in page data / page state. */
export function fieldByIata(iata: string | null | undefined): Airport | null {
	if (!iata) return null;
	const t = iata.toLowerCase();
	return AIRPORTS.find((a) => a.iata.toLowerCase() === t) ?? null;
}
