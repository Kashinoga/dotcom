// The URL layer for the map.
//
// Every panel the map can open is addressable, so a station or a line can be linked
// to directly ("here's the Air Traffic board") instead of described ("open the site,
// then click Apps, then Air Traffic").
//
//   /                            the overview map, no panel
//   /about                       a station one stop from the hub
//   /about/work                  a station reached *through* About, as the line runs
//   /apps/air-traffic
//   /apps/presentation-builder
//   /terminal-way                a line panel
//
// A station's path is its route from the hub: the chain of stations you'd pass through
// to reach it, each slugified from its title. So the URL carries the same structure the
// map draws — Work sits after About on the Loess line, and `/about/work` says so — and
// a glance at `/apps/presentation-builder` tells you which app you're getting, with
// room for sibling apps under `/apps/` later.
//
// The hub itself is the root: its children start at the top level (`/about`, not
// `/home/about`), and the hub's own panel lives at `/home`.
//
// Two kinds of alias redirect to the canonical path, because both are things a person
// plausibly types:
//   • the station code — `/atfc`, since the map labels stations in code mode
//   • the bare leaf name — `/work`, the short form of `/about/work`
// Everything is matched case-insensitively, and `+page.ts` 308s all of it to the one
// canonical path so a link shared onward is always the same string.
//
// Slugs derive from `airports[code].title` and `airlines[i].name`, the *built-in*
// values — not the editable `lineNames` state in +page.svelte. Renaming a line in Edit
// Mode must not break links that were already shared.

import { airports, airlines, portDescriptions, HUB } from './network';

export type View = { kind: 'port'; code: string } | { kind: 'line'; idx: number };

/** Lowercase, strip apostrophes, collapse everything else to single hyphens. */
export function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/['’`]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Slugs are matched case-insensitively; the map's own labels are uppercase. */
const normalize = (slug: string) => slug.toLowerCase().replace(/^\/+|\/+$/g, '');

const codes = Object.keys(airports);

// ── The station tree ────────────────────────────────────────────────────────
// Walk the lines outward from the hub. The first line to reach a station claims it as
// a child, which is what makes a station's URL read as a route: KSH → ABT → WRK.
const adjacency: Record<string, string[]> = {};
for (const line of airlines) {
	for (const [a, b] of line.legs) {
		(adjacency[a] ??= []).push(b);
		(adjacency[b] ??= []).push(a);
	}
}

const parent: Record<string, string | undefined> = {};
{
	const seen = new Set([HUB]);
	const queue = [HUB];
	while (queue.length) {
		const cur = queue.shift()!;
		for (const next of adjacency[cur] ?? []) {
			if (seen.has(next)) continue;
			seen.add(next);
			parent[next] = cur;
			queue.push(next);
		}
	}
}

/** The station's own segment — `ATFC` → `air-traffic`. */
const leaf = (code: string) => slugify(airports[code].title);

/**
 * The canonical path for a station: its chain of stops from the hub.
 * `WRK` → `about/work`. The hub is the root, so it contributes no prefix and takes its
 * own leaf (`home`). A station the hub can't reach falls back to its bare leaf.
 */
function portPath(code: string): string {
	const segments: string[] = [];
	for (let at: string | undefined = code; at && at !== HUB; at = parent[at]) {
		segments.unshift(leaf(at));
	}
	return segments.length ? segments.join('/') : leaf(code);
}

const lineSlug = (idx: number) => slugify(airlines[idx].name);

// ── Lookup tables ───────────────────────────────────────────────────────────
const portPaths = new Map<string, string>(codes.map((code) => [portPath(code), code]));
const lineSlugs = new Map<string, number>(airlines.map((_, i) => [lineSlug(i), i]));

// Aliases resolve to a station but are not the canonical URL, so they redirect.
// A leaf that already *is* its canonical path (e.g. `about`) is skipped — it would
// otherwise look like an alias of itself and provoke a pointless redirect.
const portAliases = new Map<string, string>();
for (const code of codes) {
	const canonical = portPath(code);
	for (const alias of [code.toLowerCase(), leaf(code)]) {
		if (alias !== canonical) portAliases.set(alias, code);
	}
}

function assertSlugsAreDistinct() {
	// Compare the *derived* lists, not the map keys — a Map silently swallows duplicates,
	// so `portPaths.keys()` can never reveal that two stations collided.
	const canonical = [...codes.map(portPath), ...airlines.map((_, i) => lineSlug(i))];
	const seen = new Set<string>();
	for (const path of canonical) {
		if (seen.has(path)) {
			throw new Error(
				`Route path collision on "${path}": two panels derive the same path from their ` +
					`title/name. Rename one, or give lines their own URL prefix.`
			);
		}
		seen.add(path);
	}
	// An alias that shadows some *other* panel's canonical path would redirect a real URL
	// away from the panel it names.
	for (const [alias, code] of portAliases) {
		const owner = portPaths.get(alias) ?? (lineSlugs.has(alias) ? alias : undefined);
		if (owner !== undefined && owner !== code) {
			throw new Error(
				`Route alias collision on "${alias}": it shadows another panel's canonical path.`
			);
		}
	}
	// Two stations must not want the same alias either (e.g. codes WRK and WORK).
	const aliasCount = new Map<string, number>();
	for (const code of codes) {
		for (const alias of [code.toLowerCase(), leaf(code)]) {
			aliasCount.set(alias, (aliasCount.get(alias) ?? 0) + 1);
		}
	}
	for (const [alias, n] of aliasCount) {
		// 2 is fine when it's one station contributing both its code and its leaf.
		const owners = new Set(
			codes.filter((c) => c.toLowerCase() === alias || leaf(c) === alias)
		);
		if (n > 1 && owners.size > 1) {
			throw new Error(`Route alias collision on "${alias}": claimed by ${[...owners].join(', ')}.`);
		}
	}
}
assertSlugsAreDistinct();

/** Does this path name a station or a line? Backs the `view` param matcher. */
export function isViewSlug(path: string): boolean {
	const p = normalize(path);
	return portPaths.has(p) || portAliases.has(p) || lineSlugs.has(p);
}

/**
 * `about/work` — or the `wrk` / `work` aliases, in any casing — resolves to
 * `{ kind: 'port', code: 'WRK' }`. Null when the path names nothing.
 */
export function slugToView(path: string): View | null {
	const p = normalize(path);
	const code = portPaths.get(p) ?? portAliases.get(p);
	if (code) return { kind: 'port', code };
	const idx = lineSlugs.get(p);
	if (idx !== undefined) return { kind: 'line', idx };
	return null;
}

/** The one path a view should ever be linked as, without its leading slash. */
export function viewToSlug(view: View): string {
	return view.kind === 'port' ? portPath(view.code) : lineSlug(view.idx);
}

/** The path a view lives at. `null` (no panel) is the overview map at `/`. */
export function viewPath(view: View | null): string {
	return view ? `/${viewToSlug(view)}` : '/';
}

/** True when two views point at the same panel. */
export function sameView(a: View | null, b: View | null): boolean {
	if (a === null || b === null) return a === b;
	if (a.kind === 'port' && b.kind === 'port') return a.code === b.code;
	if (a.kind === 'line' && b.kind === 'line') return a.idx === b.idx;
	return false;
}

const SITE = 'Kashinoga';

/** Document title for a view — what a shared link shows in the tab and the preview card. */
export function viewTitle(view: View | null): string {
	if (!view) return SITE;
	if (view.kind === 'port') return `${airports[view.code].title} — ${SITE}`;
	return `${airlines[view.idx].name} line — ${SITE}`;
}

export function viewDescription(view: View | null): string {
	if (!view) return portDescriptions[HUB];
	if (view.kind === 'port') return portDescriptions[view.code] ?? airports[view.code].title;
	const a = airlines[view.idx];
	return a.body ?? `The ${a.name} line and the stations it calls at.`;
}
