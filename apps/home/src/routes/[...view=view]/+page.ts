import { redirect } from '@sveltejs/kit';
import { slugToView, viewToSlug } from '$lib/views';
import { resolveField, fieldToken } from '$lib/fields';
import type { PageLoad } from './$types';

/** Only the Air Traffic board reads `?field=`. */
const takesField = (view: ReturnType<typeof slugToView>) =>
	view?.kind === 'port' && view.code === 'ATFC';

// `/` matches the rest param as an empty string and opens no panel; `/apps/air-traffic`
// resolves to the station it names. The `view` matcher already rejected anything that
// isn't a real station or line, so `slugToView` cannot return null here.
export const load: PageLoad = ({ params, url }) => {
	if (!params.view) return { view: null, field: null };

	const view = slugToView(params.view)!;

	// `?field=` picks the Air Traffic board's airport: IATA or ICAO, any casing. The
	// canonical form is the lowercase IATA code, and the default field carries no param
	// at all — so `?field=KSFO`, `?field=sfo`, and a stray `?field=grm` all normalise.
	const raw = takesField(view) ? url.searchParams.get('field') : null;
	const field = resolveField(raw);
	const token = field ? fieldToken(field) : null;

	// Rebuild the query rather than replacing it, so unrelated params (a utm tag, say)
	// survive the redirect. Only `field` is ours to normalise.
	const search = new URLSearchParams(url.searchParams);
	if (takesField(view)) {
		if (token) search.set('field', token);
		else search.delete('field'); // default field, or a token naming no field we have
	}

	// The matcher also accepts a station's short code (`/atfc`), its bare leaf name
	// (`/work` for `/about/work`), and any casing (`/ATFC` — what the map's own labels
	// look like). Send all of those, and any non-canonical `?field=`, to the one
	// canonical URL, so a link shared onward from here is always the same string.
	const canonical = viewToSlug(view);
	const query = search.toString();
	const target = `/${canonical}${query ? `?${query}` : ''}`;
	if (target !== url.pathname + url.search) redirect(308, target);

	return { view, field: field ? field.iata : null };
};
