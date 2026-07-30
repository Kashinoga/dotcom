import type { Handle } from '@sveltejs/kit';

// THE CONTENT SECURITY POLICY — a list of what a page on this site is allowed to do, enforced by
// the browser rather than by this code. That last part is the whole value of it: it still holds
// after something here has been fooled.
//
// ── Why this site has one now ─────────────────────────────────────────────────
//
// Until the Text Editor grew a drive, there was nothing here worth stealing. There are two things
// now, and both live in the visitor's browser:
//
//   · a PASSWORD to their Nextcloud (sealed under a non-extractable key — see the head of
//     $lib/nextcloud-connections for exactly how little that buys and how much it does not), and
//   · LIVE READ ACCESS to a folder on their disk: the remembered directory handle in IndexedDB,
//     still granted, walked on demand. That one does not expire when a token is revoked.
//
// Anything that manages to run ON the page has exactly the powers this app has. The route worth
// worrying about is not exotic: this app's entire job is displaying documents it did not write, out
// of folders that may be shared. $lib/markdown escapes the whole source before parsing — one lock,
// hand-written, on the path that handles hostile input — and this is the second lock, the one that
// still holds if the first ever has a gap.
//
// ── WHY THE POLICY IS SPLIT IN TWO, which is not a preference ─────────────────
//
// The page's policy is `kit.csp` in vite.config.ts. It has to be: SvelteKit boots the app with an
// INLINE script whose contents differ per page, and only SvelteKit can know its hash. Measured
// rather than assumed — a hand-written `script-src 'self'` blocked hydration on all sixteen routes,
// with two distinct hashes across them.
//
// Two policies on one response are INTERSECTED: a thing has to be allowed by both. So this file
// must not restate anything `kit.csp` says, or the strictest of the two silently wins and the
// hashes stop mattering. It carries exactly what a `<meta http-equiv>` CANNOT express —
// `frame-ancestors` is ignored in meta, and it is the one that says this site is not embeddable —
// plus the two headers that are not CSP at all.
//
// It also reaches responses that are not HTML (the API routes, the manifest, the worker), which a
// meta tag by definition does not.
//
// ── AND `kit.csp` IS LIVE IN DEV, which was assumed otherwise and is worth writing down ────────
//
// The first version of this file gated the whole thing on `!dev`, on the reasoning that Vite needs
// `unsafe-eval` for HMR. That reasoning was about a policy this file no longer sets — `kit.csp`
// applies in `pnpm dev` exactly as it does in a build, and the dev server is fine with it.
//
// Which is much better news than the assumption was: the browser suites drive `vite dev`, so THEY
// enforce the policy. That is how the Presentation Builder's `new Function` and its one inline
// `onclick` were found — by the `ticker` suite, on the branch that introduced the policy, in shipped
// code that predated it. A CSP nothing exercises is a CSP that is wrong in one direction or the
// other and looks fine either way.

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	// APPEND, NEVER SET, and this one very nearly shipped wrong. SvelteKit delivers `kit.csp` as a
	// HEADER on a server-rendered page (the `<meta>` is its fallback for prerendered ones), so
	// `headers.set` replaced the entire page policy with this one directive — and nothing complained,
	// because what was left restricted nothing that anything was doing. A CSP that has been quietly
	// deleted looks exactly like a CSP that is working.
	//
	// Two `content-security-policy` headers are INTERSECTED: a thing has to be allowed by both. So
	// this adds a second, narrow policy naming one directive — which restricts that one thing and
	// leaves the page's own to do the rest.
	response.headers.append('content-security-policy', "frame-ancestors 'none'");
	// The two that travel with it. `nosniff` because this site serves documents somebody else wrote
	// and a browser guessing at their type is a browser choosing to run one; `no-referrer` because a
	// path on this site is a panel somebody was reading, and in the editor it can be a filename.
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'no-referrer');
	return response;
};
