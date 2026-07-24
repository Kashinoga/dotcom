import { airports } from '$lib/places';
import { viewPath } from '$lib/views';
import type { RequestHandler } from './$types';

// The sitemap, derived from the site's own shape.
//
// Every place is already addressable (see $lib/views), but nothing told a crawler that. The
// homepage is a stage that opens panels by pushState, so a crawler that only follows the map
// finds one URL and stops. The panels it never reaches are the work this site exists to show.
//
// The list is COMPUTED from `airports`, not written out. A hand-kept sitemap goes stale the
// first time a place is added and nobody remembers this file. Because the paths come from
// `viewPath`, they are the same canonical strings `+page.ts` redirects to — a crawler is never
// sent to an alias that then 308s.
//
// A static route wins over the `[...view=view]` rest param, so `/sitemap.xml` reaches here and
// is not read as a place name.

/** `&`, `<` and `>` are the three characters that can break an XML document. */
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: RequestHandler = ({ url }) => {
	// `/` is the hub's map and carries no panel; `/home` is the hub's own panel. Both are real
	// addresses a person can land on, so both are listed.
	const paths = ['/', ...Object.keys(airports).map((code) => viewPath({ kind: 'port', code }))];

	// De-duplicated in case a future place ever derives the root path.
	const unique = [...new Set(paths)];

	const body =
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
		unique
			.map(
				(path) =>
					`\t<url>\n\t\t<loc>${xml(new URL(path, url.origin).href)}</loc>\n` +
					// The hub is the entry point; the branches sit below it. Priority is a hint only,
					// but a flat sitemap tells a crawler nothing about the site's shape.
					`\t\t<priority>${path === '/' ? '1.0' : '0.7'}</priority>\n\t</url>`
			)
			.join('\n') +
		`\n</urlset>\n`;

	return new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			// The shape changes when a place is added, which is a deploy — an hour of staleness
			// costs nothing and keeps crawlers off the origin.
			'cache-control': 'public, max-age=3600'
		}
	});
};
