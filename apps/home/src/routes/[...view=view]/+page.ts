import { redirect } from '@sveltejs/kit';
import { slugToView, viewToSlug } from '$lib/views';
import { resolveField, fieldToken } from '$lib/fields';
import {
	resolveRange,
	rangeToken,
	resolveRefresh,
	refreshToken,
	resolveExpanded,
	expandedToken
} from '$lib/scope';
import type { PageLoad } from './$types';

/** Only the Air Traffic board reads `?field=`, `?range=`, `?refresh=` and `?expanded=`. */
const takesParams = (view: ReturnType<typeof slugToView>) =>
	view?.kind === 'port' && view.code === 'ATFC';

// `/` matches the rest param as an empty string and opens no panel; `/apps/air-traffic`
// resolves to the station it names. The `view` matcher already rejected anything that
// isn't a real station or line, so `slugToView` cannot return null here.
export const load: PageLoad = ({ params, url }) => {
	if (!params.view) return { view: null, field: null, range: null, refresh: null, expanded: false };

	const view = slugToView(params.view)!;

	// The board's controls, each mirrored into the query so a link restores the exact
	// board you were looking at:
	//   ?field=    which airport — IATA or ICAO, any casing; canonical is lowercase IATA
	//   ?range=    the radius in NM, from the list of radii the board offers
	//   ?refresh=  the auto-refresh cadence, by label (30s / 1m / 2m / 5m)
	//   ?expanded= the board's size — `1` is the full-viewport board; compact is the default
	// In every case the default carries no param at all, so `?field=grm` (the default field)
	// and `?range=60` normalise away instead of sticking to the URL. A value naming nothing
	// the board has resolves to null and is dropped, same as a default.
	const on = takesParams(view);
	const field = on ? resolveField(url.searchParams.get('field')) : null;
	const range = on ? resolveRange(url.searchParams.get('range')) : null;
	const refresh = on ? resolveRefresh(url.searchParams.get('refresh')) : null;
	const expanded = on ? resolveExpanded(url.searchParams.get('expanded')) : false;

	// Rebuild the query rather than replacing it, so unrelated params (a utm tag, say)
	// survive the redirect. Only our three are ours to normalise.
	const search = new URLSearchParams(url.searchParams);
	if (on) {
		// `range &&` would be wrong here even though no radius is 0 today — a falsy number is
		// not the same as "no value". Compare to null explicitly.
		const tokens: [string, string | null][] = [
			['field', field ? fieldToken(field) : null],
			['range', range !== null ? rangeToken(range) : null],
			['refresh', refresh !== null ? refreshToken(refresh) : null],
			['expanded', expandedToken(expanded)]
		];
		// Delete first, then re-set in this fixed order. `set` on a key that's already there
		// keeps its ORIGINAL position, so `?refresh=30s&field=sfo` would canonicalise to
		// itself — a second spelling of the same board. The client builds the query in this
		// same order (see boardQuery), and it compares the string it builds against the
		// address bar; two orderings would make that comparison always miss.
		for (const [key] of tokens) search.delete(key);
		for (const [key, token] of tokens) if (token) search.set(key, token);
	}

	// The matcher also accepts a station's short code (`/atfc`), its bare leaf name
	// (`/work` for `/about/work`), and any casing (`/ATFC` — what the map's own labels
	// look like). Send all of those, and any non-canonical param, to the one canonical
	// URL, so a link shared onward from here is always the same string.
	const canonical = viewToSlug(view);
	const query = search.toString();
	const target = `/${canonical}${query ? `?${query}` : ''}`;
	if (target !== url.pathname + url.search) redirect(308, target);

	return { view, field: field ? field.iata : null, range, refresh, expanded };
};
