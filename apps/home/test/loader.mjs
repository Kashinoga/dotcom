// A resolve hook, so `node --test` can import this app's TypeScript modules directly.
//
// Node strips types on its own (`--experimental-strip-types`). What it will not do is guess at
// the two things a bundler does for us in the app:
//
//   1. EXTENSIONLESS specifiers. TypeScript source says `from './places'`; Node's ESM resolver
//      wants a real filename. We append `.ts` and try again.
//   2. ASSET imports. `$lib/places` imports seven favicon SVGs, which Vite turns into URL
//      strings. Node has no idea what an SVG module is. We answer with a stub that exports a
//      recognisable string — the tests here care about which favicon a place gets, not what is
//      drawn in it, so a distinct string per path is enough to tell them apart.
//
// This is deliberately the whole of the test infrastructure. The alternative is a test runner
// that reuses vite.config.ts, which is a dependency and a second build path to keep in step
// with the real one, to run assertions over four modules that are pure functions.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const ASSET = /\.(svg|webp|png|jpg|jpeg|avif|woff2?|css)$/;

export async function resolve(specifier, context, next) {
	// An asset resolves to a data: module exporting its own path, so a test can assert that (say)
	// PUD's favicon is the Park Ranger's file and not the Weather one.
	if (ASSET.test(specifier)) {
		const from = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : process.cwd();
		const path = specifier.startsWith('.') ? resolvePath(from, specifier) : specifier;
		return {
			url: `data:text/javascript,export default ${JSON.stringify(path)}`,
			shortCircuit: true
		};
	}

	// `$lib/x` is SvelteKit's alias for src/lib/x. Only a handful of modules use it, but leaving
	// it out would make the failure look like a missing file rather than a missing alias.
	if (specifier.startsWith('$lib/')) {
		const lib = resolvePath(fileURLToPath(import.meta.url), '../../src/lib');
		return resolve(pathToFileURL(resolvePath(lib, specifier.slice(5))).href, context, next);
	}

	// Extensionless relative specifier: try `.ts`, then let Node's own resolver have it (so a
	// genuine typo still reports as a missing module, at the right path).
	if (/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) {
		try {
			return await next(`${specifier}.ts`, context);
		} catch {
			/* not a .ts module — fall through to the default resolution below */
		}
	}

	return next(specifier, context);
}
