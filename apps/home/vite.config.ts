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

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
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
