// WHAT THE DAV PROXY IS ALLOWED TO DO. The rules, on their own, so they can be tested without a
// server — `src/routes/api/nextcloud/+server.ts` is the thing that applies them and nothing else.
//
// The proxied mode exists because Nextcloud's WebDAV endpoint sends no `Access-Control-Allow-Origin`
// for a third-party origin, and PROPFIND with a `Depth` header is preflighted — so a browser cannot
// reach it from this site unless the server's owner installs something. That is a fine thing to ask
// of somebody who runs their own instance and an impossible thing to ask of anybody else, which is
// why there are two modes and why this one exists. See `via` in $lib/dav.
//
// AND IT IS A RELAY WITH THIS SITE'S NAME ON IT. That is the honest description and the whole
// reason this file is separate: an endpoint that forwards to whatever URL a header names can be
// pointed anywhere by anyone, and every rule below is about narrowing "anywhere" until what is left
// is a bounded, uninteresting thing to abuse.
//
// What the rules leave possible, stated plainly rather than hidden: somebody can use this worker to
// talk to Nextcloud DAV endpoints on public https hosts, at up to 4 MB a request, with credentials
// they already had. What they cannot do is reach a private network, probe an arbitrary port, use it
// as a general HTTP relay, or get a response cached anywhere.
//
// A CHECK THE CLIENT MAKES IS A CHECK AN ATTACKER SKIPS. Nothing here may move into $lib/dav.

/** How large a document this will carry. These are Markdown notes; a cap is not a hardship. */
export const MAX_BODY = 4 * 1024 * 1024;

/** How long to wait on the upstream before giving up. */
export const TIMEOUT_MS = 20_000;

/**
 * The methods a workspace uses, and no others. PROPFIND lists, GET reads, PUT writes, MOVE renames
 * and moves, DELETE deletes; POST is here for the login flow alone. Anything else — PROPPATCH,
 * MKCOL, LOCK, REPORT, COPY — is not something this editor does, so it is not something this route
 * needs to be able to do on somebody else's behalf.
 */
export const METHODS = new Set(['PROPFIND', 'GET', 'HEAD', 'PUT', 'MOVE', 'DELETE', 'POST']);

/**
 * Request headers that go upstream. An allow-list, so a header this app does not send cannot be
 * relayed through it — `authorization` is NOT in the list because it does not travel under its own
 * name (see the route), and `cookie` is not in it for the reason you would hope.
 */
export const FORWARD_REQ = [
	'depth',
	'destination',
	'overwrite',
	'if-match',
	'if-none-match',
	'content-type',
	'accept',
	'ocs-apirequest'
];

/** Response headers that come back. `etag` is the one that matters — see `write` in $lib/dav. */
export const FORWARD_RES = ['etag', 'content-type', 'dav', 'last-modified', 'www-authenticate'];

/**
 * Paths this will forward to. The DAV tree is the workspace; the two login paths are how the
 * proxied mode gets a token in the first place (Login Flow v2), which cannot itself be done
 * directly for the same CORS reason everything else here exists for.
 */
const ALLOWED_PATHS = [/^\/remote\.php\/dav\//, /^\/index\.php\/login\/v2(\/poll)?$/];

/**
 * Hostnames that are not somebody's cloud.
 *
 * The literal ranges matter MOST IN DEVELOPMENT, which is the opposite of the usual way round: on
 * Cloudflare Workers a fetch goes out to the internet and cannot reach the machine it runs on, but
 * `pnpm dev` runs this on a laptop that is inside somebody's home network and can reach every
 * printer on it.
 *
 * A hostname that RESOLVES to a private address still gets through — this cannot be fixed here,
 * because the name is resolved later by whatever does the fetch. It is worth knowing about and it
 * is not worth pretending otherwise in a comment.
 */
const PRIVATE_HOST =
	/^(localhost|\[?::1\]?|0\.0\.0\.0)$|\.(local|internal|localhost|home|lan)$|^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\.|^\[?(fc|fd|fe80)/i;

export type TargetCheck = { ok: true; url: URL } | { ok: false; why: string };

/**
 * Is this somewhere the route may forward to?
 *
 * The order is deliberate: parse, then scheme, then host, then path. A malformed URL must not reach
 * the host test, and a host test that ran after the path test would let somebody probe which paths
 * exist on a machine they were never allowed to name.
 */
export function checkTarget(raw: string | null): TargetCheck {
	if (!raw) return { ok: false, why: 'no target' };
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return { ok: false, why: 'not a URL' };
	}
	// HTTPS only. A credential and a document both travel through here, and the whole argument for
	// the proxied mode is that somebody trusted it with them.
	if (url.protocol !== 'https:') return { ok: false, why: 'not https' };
	if (url.username || url.password) return { ok: false, why: 'credentials in the URL' };
	if (PRIVATE_HOST.test(url.hostname)) return { ok: false, why: 'not a public host' };
	// A port is how a relay becomes a port scanner. 443 is the only one an https Nextcloud needs
	// that this app has any business reaching.
	if (url.port && url.port !== '443') return { ok: false, why: 'not the https port' };
	if (!ALLOWED_PATHS.some((re) => re.test(url.pathname)))
		return { ok: false, why: 'not a DAV path' };
	return { ok: true, url };
}

/**
 * A MOVE's `Destination` is a second URL and needs every check the first one got — plus one more:
 * it has to be on the SAME server. Without that, a move becomes a way to make one Nextcloud write
 * into another with the first one's credentials.
 */
export function checkDestination(raw: string | null, target: URL): TargetCheck {
	if (!raw) return { ok: false, why: 'no destination' };
	const checked = checkTarget(raw);
	if (!checked.ok) return checked;
	if (checked.url.origin !== target.origin) return { ok: false, why: 'a different server' };
	return checked;
}
