// The URL layer.
//
// Every panel is addressable, so a place can be linked to directly ("here's the Air Traffic board")
// instead of described ("open the site, then click Apps, then Air Traffic").
//
//   /                            no panel — the homepage
//   /about                       a place one step from the hub
//   /about/work                  a place reached *through* About
//   /apps/air-traffic
//   /apps/weather
//
// A place's path is its chain from the hub, each segment slugified from its title. So the URL
// carries the site's own shape — Work sits under About, and `/about/work` says so — and a glance
// at `/apps/presentation-builder` tells you which app you're getting.
//
// The hub is the root: its children start at the top level (`/about`, not `/home/about`), and the
// hub's own panel lives at `/home`.
//
// Two kinds of alias redirect to the canonical path, because both are things a person plausibly
// types: the place's code (`/atfc`) and its bare leaf name (`/work`, short for `/about/work`).
// Everything matches case-insensitively, and `+page.ts` 308s all of it to the one canonical path,
// so a link shared onward is always the same string.
//
// Slugs derive from `airports[code].title` — the BUILT-IN value, not the editable copy in
// +page.svelte. Renaming a place in Edit Mode must not break links already shared.
//
// (Line panels — /loess, /terminal-way — lived here too, back when the site was drawn as a transit
// map. The map and its motif are gone; see $lib/places. The hierarchy those lines used to imply is
// now stated outright, which is all the URLs ever wanted from them.)

import { airports, children, parentOf, portDescriptions, HUB } from './places';

export type View = { kind: 'port'; code: string };

/** Lowercase, strip apostrophes, collapse everything else to single hyphens. */
export function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/['’`]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Slugs are matched case-insensitively. */
const normalize = (slug: string) => slug.toLowerCase().replace(/^\/+|\/+$/g, '');

const codes = Object.keys(airports);

/** The place's own segment — `ATFC` → `air-traffic`. */
const leaf = (code: string) => slugify(airports[code].title);

/**
 * The canonical path for a place: its chain of steps down from the hub. `WRK` → `about/work`. The
 * hub is the root, so it contributes no prefix and takes its own leaf (`home`). A place that hangs
 * off nothing falls back to its bare leaf.
 */
function portPath(code: string): string {
	const segments: string[] = [];
	for (let at: string | undefined = code; at && at !== HUB; at = parentOf[at]) {
		segments.unshift(leaf(at));
	}
	return segments.length ? segments.join('/') : leaf(code);
}

// ── Lookup tables ───────────────────────────────────────────────────────────
const portPaths = new Map<string, string>(codes.map((code) => [portPath(code), code]));

// Aliases resolve to a place but are not the canonical URL, so they redirect. A leaf that already
// IS its canonical path (e.g. `about`) is skipped — it would otherwise look like an alias of itself
// and provoke a pointless redirect.
const portAliases = new Map<string, string>();
for (const code of codes) {
	const canonical = portPath(code);
	for (const alias of [code.toLowerCase(), leaf(code)]) {
		if (alias !== canonical) portAliases.set(alias, code);
	}
}

function assertSlugsAreDistinct() {
	// A place that isn't in the hierarchy at all would silently land at the top level and could
	// collide with a real path — and, more to the point, would have no Related links and no place in
	// the site's outline. Catch it here, at import, rather than in a panel.
	for (const code of codes) {
		if (code !== HUB && !parentOf[code]) {
			throw new Error(
				`"${code}" hangs off nothing: give it a \`parent\` in $lib/places so it has a parent, ` +
					`a URL, and Related links.`
			);
		}
		for (const kid of children[code] ?? []) {
			if (!airports[kid]) throw new Error(`"${code}" lists an unknown child "${kid}".`);
		}
	}
	// Compare the DERIVED list, not the map keys — a Map silently swallows duplicates, so
	// `portPaths.keys()` can never reveal that two places collided.
	const seen = new Set<string>();
	for (const path of codes.map(portPath)) {
		if (seen.has(path)) {
			throw new Error(
				`Route path collision on "${path}": two panels derive the same path from their title.`
			);
		}
		seen.add(path);
	}
	// An alias that shadows some OTHER panel's canonical path would redirect a real URL away from
	// the panel it names.
	for (const [alias, code] of portAliases) {
		const owner = portPaths.get(alias);
		if (owner !== undefined && owner !== code) {
			throw new Error(
				`Route alias collision on "${alias}": it shadows another panel's canonical path.`
			);
		}
	}
	// Two places must not want the same alias either (e.g. codes WRK and WORK).
	for (const code of codes) {
		for (const alias of [code.toLowerCase(), leaf(code)]) {
			const owners = codes.filter((c) => c.toLowerCase() === alias || leaf(c) === alias);
			if (owners.length > 1) {
				throw new Error(`Route alias collision on "${alias}": claimed by ${owners.join(', ')}.`);
			}
		}
	}
}
assertSlugsAreDistinct();

/** Does this path name a place? Backs the `view` param matcher. */
export function isViewSlug(path: string): boolean {
	const p = normalize(path);
	return portPaths.has(p) || portAliases.has(p);
}

/**
 * `about/work` — or the `wrk` / `work` aliases, in any casing — resolves to
 * `{ kind: 'port', code: 'WRK' }`. Null when the path names nothing.
 */
export function slugToView(path: string): View | null {
	const p = normalize(path);
	const code = portPaths.get(p) ?? portAliases.get(p);
	return code ? { kind: 'port', code } : null;
}

/** The one path a view should ever be linked as, without its leading slash. */
export function viewToSlug(view: View): string {
	return portPath(view.code);
}

/** The path a view lives at. `null` (no panel) is the homepage at `/`. */
export function viewPath(view: View | null): string {
	return view ? `/${viewToSlug(view)}` : '/';
}

/** True when two views point at the same panel. */
export function sameView(a: View | null, b: View | null): boolean {
	if (a === null || b === null) return a === b;
	return a.code === b.code;
}

export const SITE = 'Kashinoga';

/** Document title for a view — what a shared link shows in the tab and the preview card. */
export function viewTitle(view: View | null): string {
	return view ? `${airports[view.code].title} — ${SITE}` : SITE;
}

export function viewDescription(view: View | null): string {
	if (!view) return portDescriptions[HUB];
	return portDescriptions[view.code] ?? airports[view.code].title;
}
