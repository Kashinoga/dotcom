import type { RequestHandler } from './$types';

// robots.txt.
//
// It is a route and not a file in `static/` for one reason: the sitemap line must carry an
// absolute URL, and only a request knows the origin. A file would have to hard-code the
// production host, which is then wrong on every preview deploy and in dev.
//
// `/api/*` is disallowed. Those endpoints are same-origin proxies for the apps (NOAA, the
// aircraft feed, the geocoder). They return JSON that means nothing on its own, they change
// every few minutes, and each crawl of them is a request against an upstream that asks us to
// be polite. Nothing links to them, but a crawler that guesses paths finds them anyway.

export const GET: RequestHandler = ({ url }) => {
	const body = [
		'User-agent: *',
		'Allow: /',
		'Disallow: /api/',
		'',
		`Sitemap: ${new URL('/sitemap.xml', url.origin).href}`,
		''
	].join('\n');

	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=86400'
		}
	});
};
