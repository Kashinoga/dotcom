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
