import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

/**
 * How many commits this project is. It is the last number in an app's version — see
 * `src/lib/versions.ts` — and it is COUNTED rather than written down, because a number a human
 * has to remember to bump is a number that is wrong by the second week.
 *
 * Zero when it cannot be counted: a shallow CI clone, a tarball with no `.git`, a machine
 * without git. The store treats 0 as "ask me later" and falls back to its own recorded figure,
 * so a build in either place still shows a plausible version rather than `v0.8.0`.
 */
function commitCount(): number {
	try {
		return (
			Number(execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })) || 0
		);
	} catch {
		return 0;
	}
}

export default defineConfig({
	define: {
		__GIT_COMMITS__: commitCount()
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter(),

			// The service worker belongs to the TEXT EDITOR and to nothing else — it is what makes
			// that one app installable and able to open on a plane (see src/service-worker.ts).
			// SvelteKit would register it from whatever page loaded first, which on this site is
			// usually the map, and a worker registered there takes a scope of `/` and starts
			// answering for panels that read live data. So registration is the editor's own, done
			// while it is mounted — see $lib/TextEditor.svelte.
			serviceWorker: { register: false },

			// ── THE CONTENT SECURITY POLICY ───────────────────────────────────────────
			// A list of what a page on this site may do, enforced by the browser rather than by this
			// code — which is the whole value of it, because it still holds after something here has
			// been fooled. See src/hooks.server.ts for WHY this site has one (the editor now holds a
			// Nextcloud password and live access to a folder on somebody's disk) and for the one
			// directive that cannot live here.
			//
			// `mode: 'hash'` because SvelteKit boots the app with an INLINE script and only SvelteKit
			// can know its hash. Measured: a hand-written `script-src 'self'` in a header blocked
			// hydration on all sixteen routes, with two distinct hashes across them.
			//
			// Every entry below is here because something in this repo needs it, and the note says
			// which. An allow-list nobody can account for is an allow-list that only grows.
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					// Nothing inline that SvelteKit did not put there and hash — which is the whole
					// point, and the reason static/preflight.js is a file. No `unsafe-eval` either:
					// the production bundle needs none, and it is the flag that turns a string into
					// code.
					'script-src': ['self'],
					/*
					 * `unsafe-inline`, and it cannot be otherwise: this app draws the caret, the
					 * selection and the tree's depth insets with `style:` directives, which render to
					 * `style="…"` attributes — twenty in the editor alone — and the Presentation
					 * Builder's preview is a `srcdoc` iframe carrying the deck's own <style>, which
					 * inherits this policy.
					 *
					 * Inline STYLE is a far weaker vector than inline script: it can move things and
					 * read nothing. Said plainly rather than dressed up, because the honest version of
					 * a policy is the one somebody still trusts in a year.
					 */
					'style-src': ['self', 'unsafe-inline'],
					/*
					 * `data:` for the assets Vite inlines and the one in the deck's own head; `blob:`
					 * for the download path, which builds an object URL. The two hosts are pictures
					 * the BROWSER fetches rather than the proxies: Bing's photo of the day (the
					 * wallpaper route hands back URLs, not bytes) and Wikipedia's aircraft thumbnails,
					 * which live on upload.wikimedia.org — measured against a live response.
					 */
					'img-src': [
						'self',
						'data:',
						'blob:',
						'https://upload.wikimedia.org',
						'https://www.bing.com'
					],
					// Jost and the rest are bundled out of packages/puhig. No font CDN.
					'font-src': ['self'],
					/*
					 * `https:` — AND THIS IS THE ONE PLACE THE POLICY IS WIDE, deliberately, with a
					 * name on it.
					 *
					 * The Text Editor's DIRECT mode talks to the visitor's own Nextcloud, and that
					 * address cannot be listed: it is not known at build time and not known
					 * per-request either, because connections live only in that browser's IndexedDB
					 * and the server never sees one. Supporting the mode at all therefore means "any
					 * secure host", for every visitor, including the ones who will never connect a
					 * drive. The alternative was dropping the mode where a credential and a document
					 * reach nobody but their own server, which is the worse trade.
					 *
					 * SO SAY WHAT IT COSTS: this policy does NOT stop an app password being sent
					 * somewhere it should not go. What limits that is the non-extractable key in the
					 * vault, and it limits it to "while this tab is open". The tight list, ready for
					 * the day direct mode ever goes, is exactly:
					 *     self https://en.wikipedia.org https://api.adsbdb.com
					 * — the Air Traffic board fetches both from the browser rather than through a
					 * proxy ($lib/TrafficBoard); everything else on this site goes through /api.
					 */
					'connect-src': ['self', 'https:'],
					// The editor's service worker, which is what makes it installable.
					'worker-src': ['self'],
					'manifest-src': ['self'],
					// The Presentation Builder's preview, which is `srcdoc` — same origin.
					'frame-src': ['self'],
					'media-src': ['self'],
					// Nothing here is a plugin, and this is the cheapest directive on the list.
					'object-src': ['none'],
					// So an injection cannot re-point every relative URL on the page elsewhere.
					'base-uri': ['self'],
					// The one form that posts is api/content, and it is dev-only.
					'form-action': ['self']
				}
			}
		})
	],

	server: {
		fs: {
			// SvelteKit narrows Vite's default allow-list to this app's own directories, which
			// leaves the sibling workspace package out in the cold: puhig's tokens.css asks for
			// ../../packages/puhig/src/fonts/jost.woff2, and dev answers 403 — the site quietly
			// falls back to a system font while the production build (which bundles the file)
			// looks correct. Re-allow the workspace root so `pnpm dev` renders in Jost too.
			// Relative to this app's root (apps/home), so `../..` is the repo root.
			allow: ['../..']
		}
	}
});
