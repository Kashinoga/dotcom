// The Weather app's state, lifted out of its component.
//
// It lives here because the app is drawn in two places: the READING (tabs, temperature, stats) is
// the panel's body, and the SEARCH is a control in the panel's header — the header being the page's,
// not the component's. Both need the same cities, so neither can own them. A module of runes is the
// smallest thing that lets a header control and a body component be the same app.

export type Place = { id: string; name: string; state: string; lat: number; lon: number };

export type Now = {
	place: string;
	station: { id: string; name: string };
	observedAt: string | null;
	conditions: string;
	night: boolean;
	tempC: number | null;
	tempF: number | null;
	feelsC: number | null;
	feelsF: number | null;
	humidity: number | null;
	windMph: number | null;
	windDir: number | null;
};

// Somewhere to start, so a first visit says something rather than showing an empty panel.
const DEFAULT_PLACE: Place = {
	id: 'default',
	name: 'Des Moines',
	state: 'Iowa',
	lat: 41.601,
	lon: -93.609
};
const PLACES_KEY = 'ksh-weather-places';
const UNIT_KEY = 'ksh-weather-unit';

// Cities are TABS: several at once, one showing. Each keeps its own reading, so flicking between
// them is instant and doesn't re-ask NWS for a sky it already has.
export const weather = $state({
	places: [DEFAULT_PLACE] as Place[],
	activeIdx: 0,
	readings: {} as Record<string, Now>,
	status: {} as Record<string, 'loading' | 'ok' | 'error'>,
	unit: 'F' as 'F' | 'C',
	// Is the header's search open? The header draws it; the body's tabs open it too (the +).
	searchOpen: false,
	// What a pick does: swap the city showing, or open another beside it.
	searchMode: 'replace' as 'replace' | 'add'
});

export const current = (): Place => weather.places[weather.activeIdx] ?? DEFAULT_PLACE;

// What the sky is DOING, as a coarse kind. NWS reports conditions as prose ("Mostly
// Cloudy", "Light Rain"), and two places need the same reading of it: the panel's icon
// and the homepage's weather dressing — so the keyword list lives here, once. The order
// is the priority: precipitation beats cloud cover, because a rainy overcast day is a
// rainy day. Anything unrecognised falls back to cloud rather than guessing.
export type WeatherKind =
	| 'storm'
	| 'snow'
	| 'rain'
	| 'fog'
	| 'wind'
	| 'clear'
	| 'partly'
	| 'cloudy';
export function weatherKind(text: string): WeatherKind {
	const t = text.toLowerCase();
	if (/thunder|tstorm|squall/.test(t)) return 'storm';
	if (/snow|sleet|ice|freezing|wintry/.test(t)) return 'snow';
	if (/rain|drizzle|shower/.test(t)) return 'rain';
	if (/fog|mist|haze|smoke/.test(t)) return 'fog';
	if (/wind/.test(t)) return 'wind';
	if (/clear|fair|sunny/.test(t)) return 'clear';
	if (/partly|few|scattered/.test(t)) return 'partly';
	return 'cloudy';
}

export async function load(p: Place) {
	weather.status[p.id] = weather.readings[p.id] ? 'ok' : 'loading';
	try {
		const r = await fetch(`/api/weather?lat=${p.lat}&lon=${p.lon}`);
		if (!r.ok) throw new Error(String(r.status));
		weather.readings[p.id] = (await r.json()) as Now;
		weather.status[p.id] = 'ok';
	} catch {
		// A failed refresh keeps the reading that's up: it was true a few minutes ago, which beats
		// blanking the panel. Only a city we've never read fails outright.
		weather.status[p.id] = weather.readings[p.id] ? 'ok' : 'error';
	}
}

function save() {
	try {
		localStorage.setItem(
			PLACES_KEY,
			JSON.stringify({ places: weather.places, activeIdx: weather.activeIdx })
		);
	} catch {
		/* storage unavailable — the tabs still hold for this visit */
	}
}

/** Picked from the search: swap the city showing, or open it as another tab. */
export function choose(p: Place) {
	const already = weather.places.findIndex((q) => q.id === p.id);
	if (already >= 0) {
		// Already a tab — show it rather than opening a second one of the same city.
		weather.activeIdx = already;
	} else if (weather.searchMode === 'add') {
		weather.places = [...weather.places, p];
		weather.activeIdx = weather.places.length - 1;
	} else {
		weather.places = weather.places.map((q, i) => (i === weather.activeIdx ? p : q));
	}
	weather.searchOpen = false;
	save();
	load(current());
}

export function show(i: number) {
	weather.activeIdx = i;
	save();
	if (!weather.readings[current().id]) load(current());
}

export function closeTab(i: number) {
	if (weather.places.length === 1) return; // the last city stays: an empty panel says nothing
	weather.places = weather.places.filter((_, j) => j !== i);
	if (weather.activeIdx >= weather.places.length) weather.activeIdx = weather.places.length - 1;
	else if (i < weather.activeIdx) weather.activeIdx--;
	save();
	load(current());
}

// Move the tab at `from` to sit at `to` — the strip's drag-reorder. The ACTIVE CITY rides
// along: what you're reading is a place, not a slot number, so the index is re-found by id
// after the move rather than left pointing at whatever slid into the old position.
export function reorder(from: number, to: number) {
	const n = weather.places.length;
	if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
	const activeId = weather.places[weather.activeIdx]?.id;
	const places = [...weather.places];
	const [moved] = places.splice(from, 1);
	places.splice(to, 0, moved);
	weather.places = places;
	const idx = places.findIndex((p) => p.id === activeId);
	if (idx >= 0) weather.activeIdx = idx;
	save();
}

export function openSearch(mode: 'replace' | 'add') {
	weather.searchMode = mode;
	weather.searchOpen = true;
}

export function setUnit(u: 'F' | 'C') {
	weather.unit = u;
	try {
		localStorage.setItem(UNIT_KEY, u);
	} catch {
		/* storage unavailable */
	}
}

/** Restore the tabs and the unit, then read the sky over whichever city was showing. */
export function restore() {
	try {
		const saved = localStorage.getItem(PLACES_KEY);
		if (saved) {
			const v = JSON.parse(saved) as { places?: Place[]; activeIdx?: number };
			if (Array.isArray(v.places) && v.places.length) {
				weather.places = v.places.filter((p) => typeof p?.lat === 'number');
				weather.activeIdx = Math.min(Math.max(v.activeIdx ?? 0, 0), weather.places.length - 1);
			}
		}
		const u = localStorage.getItem(UNIT_KEY);
		if (u === 'C' || u === 'F') weather.unit = u;
	} catch {
		/* storage unavailable or malformed — the default city stands */
	}
	load(current());
}
