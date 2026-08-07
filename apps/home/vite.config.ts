import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter(),

			// ── THE CONTENT SECURITY POLICY ───────────────────────────────────────────
			// A list of what a page on this site may do, enforced by the browser rather than by this
			// code — which is the whole value of it, because it still holds after something here has
			// been fooled.
			//
			// CUT BACK TO WHAT THE SITE ACTUALLY IS. The old policy was long because the old site was:
			// it reached Wikipedia and Bing for pictures, opened a `srcdoc` iframe for the deck
			// preview, registered a service worker for the editor, and allowed `connect-src https:`
			// outright so the editor could talk to a visitor's own Nextcloud at an address no build
			// could know. Every one of those is gone with the code that needed it, so every one of
			// those entries is gone too. The full version, with the reasoning for each line, is in
			// `_TO_MIGRATE/apps/home/vite.config.ts` — take an entry back WITH the feature that needs
			// it, never in advance. An allow-list nobody can account for is one that only grows.
			//
			// `mode: 'hash'` because SvelteKit boots the app with an INLINE script and only SvelteKit
			// can know its hash. Measured on the old site: a hand-written `script-src 'self'` in a
			// header blocked hydration on every route, with two distinct hashes across them.
			//
			// THIS APPLIES IN `pnpm dev` AS WELL AS IN A BUILD, which is worth knowing and was once
			// assumed otherwise.
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					// Nothing inline that SvelteKit did not put there and hash. No `unsafe-eval`
					// either: the production bundle needs none, and it is the flag that turns a
					// string into code. The old site's static/preflight.js existed to keep this
					// line honest; there is no pre-paint script now, so nothing is asking.
					'script-src': ['self'],
					/*
					 * `unsafe-inline`, and here is the reason it was reopened.
					 *
					 * It was closed when the site was rebuilt, on the honest reading that nothing
					 * left set an inline style. Rendering the design system's documentation put it
					 * straight back: that page sets `style="--grid-min: 12rem"` on the swatch grid
					 * and `--stack-gap` on its own main, and its script sets a font-weight on every
					 * heading it puts in the contents rail. Roughly forty violations logged, and
					 * every one of them a knob being turned rather than a rule being written.
					 *
					 * Inline STYLE is a far weaker vector than inline script: it can move things and
					 * read nothing. Said plainly rather than dressed up, because the honest version
					 * of a policy is the one somebody still trusts in a year.
					 *
					 * A hash list is not available here. `mode: 'hash'` covers what SvelteKit emits;
					 * these attributes come from a dependency's markup and a dependency's script, so
					 * their hashes would change with a version bump and the page would break on
					 * upgrade rather than on edit — the worst place for a policy to fail.
					 */
					'style-src': ['self', 'unsafe-inline'],
					// `data:` for the assets Vite inlines. No remote image hosts: nothing here
					// fetches a picture from anywhere else.
					'img-src': ['self', 'data:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					// Nothing here is a plugin, and this is the cheapest directive on the list.
					'object-src': ['none'],
					// So an injection cannot re-point every relative URL on the page elsewhere.
					'base-uri': ['self'],
					'form-action': ['self']
				}
			}
		})
	],

	// THE DESIGN SYSTEM IS NOT PRE-BUNDLED IN DEV, and this is a papercut fix with a real cost
	// behind it. Vite optimises a dependency once and caches the result under node_modules/.vite. A
	// git dependency updated in place does not reliably invalidate that cache, so a running dev
	// server keeps serving the previous copy: the version in package.json is new, the file on disk is
	// new, and the browser gets the old one. It cost an hour — a feature that worked on the design
	// system's own page and appeared broken here, with nothing wrong in either.
	//
	// Excluding it costs nothing to weigh against that. It is plain ESM with no dependencies of its
	// own, so pre-bundling saves no request waterfall; Vite just serves the file. The build is
	// untouched either way — optimizeDeps is a dev-only concern.
	optimizeDeps: {
		exclude: ['@kashinoga/design-system']
	},

	server: {
		fs: {
			// SvelteKit narrows Vite's default allow-list to this app's own directories, which leaves
			// a workspace dependency out in the cold — the design system's CSS asks for files under
			// its own package, and dev answers 403 while a production build (which bundles them)
			// looks correct. Re-allow the workspace root so `pnpm dev` renders like the build.
			// Relative to this app's root (apps/home), so `../..` is the repo root.
			allow: ['../..']
		}
	}
});
