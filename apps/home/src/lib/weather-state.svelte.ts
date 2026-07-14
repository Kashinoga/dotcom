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
export const wx = $state({
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

export const current = (): Place => wx.places[wx.activeIdx] ?? DEFAULT_PLACE;

export async function load(p: Place) {
	wx.status[p.id] = wx.readings[p.id] ? 'ok' : 'loading';
	try {
		const r = await fetch(`/api/weather?lat=${p.lat}&lon=${p.lon}`);
		if (!r.ok) throw new Error(String(r.status));
		wx.readings[p.id] = (await r.json()) as Now;
		wx.status[p.id] = 'ok';
	} catch {
		// A failed refresh keeps the reading that's up: it was true a few minutes ago, which beats
		// blanking the panel. Only a city we've never read fails outright.
		wx.status[p.id] = wx.readings[p.id] ? 'ok' : 'error';
	}
}

function save() {
	try {
		localStorage.setItem(
			PLACES_KEY,
			JSON.stringify({ places: wx.places, activeIdx: wx.activeIdx })
		);
	} catch {
		/* storage unavailable — the tabs still hold for this visit */
	}
}

/** Picked from the search: swap the city showing, or open it as another tab. */
export function choose(p: Place) {
	const already = wx.places.findIndex((q) => q.id === p.id);
	if (already >= 0) {
		// Already a tab — show it rather than opening a second one of the same city.
		wx.activeIdx = already;
	} else if (wx.searchMode === 'add') {
		wx.places = [...wx.places, p];
		wx.activeIdx = wx.places.length - 1;
	} else {
		wx.places = wx.places.map((q, i) => (i === wx.activeIdx ? p : q));
	}
	wx.searchOpen = false;
	save();
	load(current());
}

export function show(i: number) {
	wx.activeIdx = i;
	save();
	if (!wx.readings[current().id]) load(current());
}

export function closeTab(i: number) {
	if (wx.places.length === 1) return; // the last city stays: an empty panel says nothing
	wx.places = wx.places.filter((_, j) => j !== i);
	if (wx.activeIdx >= wx.places.length) wx.activeIdx = wx.places.length - 1;
	else if (i < wx.activeIdx) wx.activeIdx--;
	save();
	load(current());
}

// Move the tab at `from` to sit at `to` — the strip's drag-reorder. The ACTIVE CITY rides
// along: what you're reading is a place, not a slot number, so the index is re-found by id
// after the move rather than left pointing at whatever slid into the old position.
export function reorder(from: number, to: number) {
	const n = wx.places.length;
	if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
	const activeId = wx.places[wx.activeIdx]?.id;
	const places = [...wx.places];
	const [moved] = places.splice(from, 1);
	places.splice(to, 0, moved);
	wx.places = places;
	const idx = places.findIndex((p) => p.id === activeId);
	if (idx >= 0) wx.activeIdx = idx;
	save();
}

export function openSearch(mode: 'replace' | 'add') {
	wx.searchMode = mode;
	wx.searchOpen = true;
}

export function setUnit(u: 'F' | 'C') {
	wx.unit = u;
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
				wx.places = v.places.filter((p) => typeof p?.lat === 'number');
				wx.activeIdx = Math.min(Math.max(v.activeIdx ?? 0, 0), wx.places.length - 1);
			}
		}
		const u = localStorage.getItem(UNIT_KEY);
		if (u === 'C' || u === 'F') wx.unit = u;
	} catch {
		/* storage unavailable or malformed — the default city stands */
	}
	load(current());
}
