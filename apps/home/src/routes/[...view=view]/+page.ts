import { redirect } from '@sveltejs/kit';
import { slugToView, viewToSlug } from '$lib/views';
import type { PageLoad } from './$types';

// `/` matches the rest param as an empty string and opens no panel; `/apps/air-traffic`
// resolves to the station it names. The `view` matcher already rejected anything that
// isn't a real station or line, so `slugToView` cannot return null here.
export const load: PageLoad = ({ params, url }) => {
	if (!params.view) return { view: null };

	const view = slugToView(params.view)!;

	// The matcher also accepts a station's short code (`/atfc`), its bare leaf name
	// (`/work` for `/about/work`), and any casing (`/ATFC` — what the map's own labels
	// look like). Send all of those to the one canonical path, so a link shared onward
	// from here is always the same string.
	const canonical = viewToSlug(view);
	if (params.view !== canonical) redirect(308, `/${canonical}${url.search}`);

	return { view };
};
