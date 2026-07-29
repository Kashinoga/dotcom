import type { RequestHandler } from './$types';
import {
	checkDestination,
	checkTarget,
	FORWARD_REQ,
	FORWARD_RES,
	MAX_BODY,
	METHODS,
	TIMEOUT_MS
} from '$lib/dav-proxy';

// The Text Editor's PROXIED Nextcloud mode — one hop to a WebDAV server the browser cannot reach
// on its own. See $lib/dav-proxy for what it is allowed to do and why each rule is there; this
// file applies those rules and forwards, and holds no policy of its own.
//
// UNLIKE THE OTHER API ROUTES HERE, THIS ONE CARRIES A SECRET. `weather`, `traffic`, `places`,
// `wallpaper` and `aita` are same-origin proxies for public, keyless upstreams — the standing note
// about them is "no keys, no secrets", and this route is the exception that note now has to be
// read against. What passes through here is somebody's app password and somebody's documents, so:
//
//   · the credential travels as `x-dav-authorization` and is put back as `authorization` upstream.
//     A header of its own, so nothing in a log pipeline that knows to redact `authorization` is
//     surprised by the name, and so a mis-forward cannot leak it under the header a server logs.
//   · nothing is logged. Not the target, not the path, not a status. A path IS a filename.
//   · `cache-control: no-store` on the way back, and no `vary` games — this is a private document
//     and the platform in front of it must not be given a reason to keep one.
//   · the body is capped and the upstream is given a deadline, so neither a large PUT nor a hung
//     server can hold a worker open.
//
// The alternative to this route is the DIRECT mode, where the credential and the documents never
// touch this site at all and the server's owner installs WebAppPassword instead. Both are offered,
// as a choice made once at connect time. There is deliberately no fallback between them: a blocked
// preflight rejects `fetch` with a bare TypeError indistinguishable from a dead network, so
// "try direct, fall back to proxy" would be a GUESS about where a password goes.

/** Everything comes through here — SvelteKit's method exports plus `fallback` for PROPFIND/MOVE. */
const relay: RequestHandler = async ({ request, fetch }) => {
	const method = request.method.toUpperCase();
	if (!METHODS.has(method)) return refuse(405);

	const target = checkTarget(request.headers.get('x-dav-target'));
	if (!target.ok) return refuse(400);

	const headers = new Headers();
	for (const name of FORWARD_REQ) {
		const value = request.headers.get(name);
		if (value !== null) headers.set(name, value);
	}

	// A MOVE names a second URL, and it gets the same treatment as the first plus a same-server
	// rule. Checked here rather than in the loop above because a bad one must refuse the whole
	// request, not quietly travel without its destination — which the server would read as a
	// malformed MOVE and answer 400 to, from behind this site's name.
	if (method === 'MOVE') {
		const dest = checkDestination(request.headers.get('destination'), target.url);
		if (!dest.ok) return refuse(400);
		headers.set('destination', dest.url.toString());
	}

	const auth = request.headers.get('x-dav-authorization');
	if (auth) headers.set('authorization', auth);

	let body: string | undefined;
	if (method === 'PUT' || method === 'PROPFIND' || method === 'POST') {
		body = await request.text();
		// Measured in BYTES, not characters: a cap counted in code units is not a cap, and these
		// are documents in whatever language somebody writes in.
		if (new TextEncoder().encode(body).length > MAX_BODY) return refuse(413);
	}

	let upstream: Response;
	try {
		upstream = await fetch(target.url.toString(), {
			method,
			headers,
			body,
			redirect: 'manual', // a redirect is where a validated target becomes an unvalidated one
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch {
		// Unreachable, refused, timed out. 502 rather than a message: there is nothing in the
		// failure worth relaying and some of what is in it is the server's own business.
		return refuse(502);
	}

	const out = new Headers({ 'cache-control': 'no-store' });
	for (const name of FORWARD_RES) {
		const value = upstream.headers.get(name);
		if (value !== null) out.set(name, value);
	}
	// The STATUS is the answer — 207 for a listing, 412 for a conflict, 401 for a bad password —
	// and every one of them means something specific to the store on the other end. Passed through
	// exactly, including the ones that are failures.
	return new Response(upstream.body, { status: upstream.status, headers: out });
};

/** A refusal says nothing. What was wrong with the request is the caller's to know, not a stranger's. */
const refuse = (status: number) =>
	new Response(null, { status, headers: { 'cache-control': 'no-store' } });

export const GET = relay;
export const HEAD = relay;
export const PUT = relay;
export const POST = relay;
export const DELETE = relay;
/** PROPFIND and MOVE have no named export in SvelteKit; this is how they arrive. */
export const fallback = relay;
