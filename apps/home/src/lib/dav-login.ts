// LOGIN FLOW V2 — getting an app password without anybody typing one.
//
// Nextcloud's own hand-off. Three steps and a wait:
//
//   1. POST /index.php/login/v2, unauthenticated. The server answers with a URL to send somebody to
//      and a poll token to wait on.
//   2. That URL opens in a tab of their own browser, on their own server, where they log in the way
//      they always do — including whatever second factor they have — and press Grant.
//   3. POST to the poll endpoint until it stops answering 404. It then hands over an APP PASSWORD
//      the server made, named for this app, revocable from Devices & sessions like any other.
//
// THE PASSWORD IS NEVER TYPED HERE, and that is the whole point. Nothing in this app ever sees an
// account password, no field can be shoulder-surfed or autofilled from the wrong entry, and what
// arrives is already the narrow, revocable kind of credential the app should be holding anyway.
//
// ── Why this is the PROXIED mode's, and only the proxied mode's ───────────────
//
// Both steps 1 and 3 are requests from this page to somebody's server, so both need CORS, and
// WebAppPassword — the app that makes the DIRECT mode possible at all — is about the WebDAV
// endpoints. Whether it covers `/index.php/login/v2` is not something this app should be guessing
// about, and a sign-in button that silently does nothing is worse than no button.
//
// Routing it through the proxy regardless would be worse still: direct mode's entire promise is
// that the credential reaches nobody but their server, and a login flow that quietly borrowed the
// proxy would break that promise once, at the exact moment the credential is created.
//
// So direct mode keeps the paste, which costs somebody who owns their server about twenty seconds
// in a settings page they already know. The button is offered where it is certain to work.

import { DAV_PROXY } from '$lib/dav';

/** What step 1 hands back, once it has been read and checked. */
export type LoginFlow = {
	/** Where to send the visitor. Opened in a tab of their own. */
	login: string;
	/** What step 3 posts, and where it posts it. */
	pollToken: string;
	pollEndpoint: string;
};

/** What step 3 hands over when they have granted it. */
export type Granted = { user: string; token: string };

/**
 * Read step 1's answer, refusing anything that does not name the SAME SERVER the flow was started
 * on. A server that answered with a poll endpoint somewhere else would be pointing this app at a
 * third party while somebody watches a login page they trust — and the response is JSON from a host
 * that has not authenticated itself to us yet, since step 1 is the unauthenticated one.
 *
 * Pure, so the shape can be checked without a network. Everything below it needs one.
 */
export function readFlow(body: unknown, base: string): LoginFlow | null {
	if (!body || typeof body !== 'object') return null;
	const it = body as { login?: unknown; poll?: { token?: unknown; endpoint?: unknown } };
	const login = typeof it.login === 'string' ? it.login : '';
	const endpoint = typeof it.poll?.endpoint === 'string' ? it.poll.endpoint : '';
	const pollToken = typeof it.poll?.token === 'string' ? it.poll.token : '';
	if (!login || !endpoint || !pollToken) return null;
	const sameServer = (url: string) => {
		try {
			return new URL(url).origin === new URL(base).origin;
		} catch {
			return false;
		}
	};
	if (!sameServer(login) || !sameServer(endpoint)) return null;
	return { login, pollToken, pollEndpoint: endpoint };
}

/** Read step 3's answer. `loginName` is the user the DAV path is built from, so it must be there. */
export function readGranted(body: unknown): Granted | null {
	if (!body || typeof body !== 'object') return null;
	const it = body as { loginName?: unknown; appPassword?: unknown };
	if (typeof it.loginName !== 'string' || !it.loginName) return null;
	if (typeof it.appPassword !== 'string' || !it.appPassword) return null;
	return { user: it.loginName, token: it.appPassword };
}

/** How long to wait for somebody to finish signing in, and how often to ask. */
export const POLL_EVERY_MS = 2000;
export const POLL_FOR_MS = 5 * 60 * 1000;

/**
 * Through the proxy, always — see the note at the head of this file. The route allows the two
 * login paths and nothing else about them is special: no authorization header, because this is the
 * step that exists to create one.
 */
async function viaProxy(target: string, body?: string): Promise<Response | null> {
	try {
		return await fetch(DAV_PROXY, {
			method: 'POST',
			headers: {
				'x-dav-target': target,
				...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
			},
			body
		});
	} catch {
		return null;
	}
}

/** Step 1. Null if the server would not start a flow — an old Nextcloud, or not one at all. */
export async function startLogin(base: string): Promise<LoginFlow | null> {
	const res = await viaProxy(`${base.replace(/\/+$/, '')}/index.php/login/v2`);
	if (!res?.ok) return null;
	try {
		return readFlow(await res.json(), base);
	} catch {
		return null;
	}
}

/**
 * Step 3, once. `pending` is the ordinary answer and is not an error: Nextcloud sends 404 for as
 * long as nobody has granted it, which is most of the time somebody is looking at a login page.
 */
export async function pollOnce(flow: LoginFlow): Promise<Granted | 'pending' | null> {
	const res = await viaProxy(flow.pollEndpoint, `token=${encodeURIComponent(flow.pollToken)}`);
	if (!res) return null;
	if (res.status === 404) return 'pending';
	if (!res.ok) return null;
	try {
		return readGranted(await res.json());
	} catch {
		return null;
	}
}
