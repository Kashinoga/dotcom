// The Air Traffic board's two other controls: how far it looks, and how often.
//
// Lifted out of TrafficBoard.svelte for the same reason as $lib/fields.ts — the URL layer
// resolves `?range=` and `?refresh=` against the same lists the board renders its controls
// from, so a shared link can't name a range or a cadence the board doesn't offer.

/** Nautical miles. 250 is the airplanes.live maximum. */
export const RANGES = [40, 60, 100, 150, 250] as const;

/** Where the board starts when the URL says nothing. */
export const DEFAULT_RANGE = 60;

/**
 * Auto-refresh cadence options. 1 minute is the default — ADS-B positions barely move
 * between polls and it's easy on the upstream feeds.
 *
 * The `label` doubles as the URL token: `?refresh=30s` reads as what it does, where
 * `?refresh=30000` would make the reader convert milliseconds in their head.
 */
export const INTERVALS = [
	{ ms: 30000, label: '30s' },
	{ ms: 60000, label: '1m' },
	{ ms: 120000, label: '2m' },
	{ ms: 300000, label: '5m' }
] as const;

export const DEFAULT_POLL_MS = 60000;

/**
 * The `?range=` token for a radius — the plain number of nautical miles (`100`). The
 * default carries no token: it's what you get with no param, so spelling it out is noise.
 */
export function rangeToken(nm: number): string | null {
	return nm === DEFAULT_RANGE ? null : String(nm);
}

/**
 * Resolve a `?range=` value. Only the radii the board actually offers — an arbitrary
 * `?range=137` would send the upstream feed a distance no control could then show as
 * selected. Null when it names no range we have.
 */
export function resolveRange(token: string | null | undefined): number | null {
	if (!token) return null;
	const nm = Number(token.trim());
	return RANGES.includes(nm as (typeof RANGES)[number]) ? nm : null;
}

/**
 * The `?refresh=` token for a cadence — its label (`30s`). The default carries no token.
 */
export function refreshToken(ms: number): string | null {
	if (ms === DEFAULT_POLL_MS) return null;
	return INTERVALS.find((i) => i.ms === ms)?.label ?? null;
}

/**
 * Resolve a `?refresh=` value, by label, any casing (`30S`, `1m`). Returns milliseconds.
 * Null when it names no cadence we have.
 */
export function resolveRefresh(token: string | null | undefined): number | null {
	if (!token) return null;
	const t = token.trim().toLowerCase();
	return INTERVALS.find((i) => i.label === t)?.ms ?? null;
}

/**
 * The board's size, as the URL sees it: `?expanded=1` is the full-viewport board;
 * compact is the default and carries no param. In the URL so a shared link is
 * deterministic — it opens at the size it names for everyone, instead of at
 * whatever the recipient's own remembered toggle happens to say.
 */
export function expandedToken(on: boolean): string | null {
	return on ? '1' : null;
}

/** Resolve a `?expanded=` value. Only `1` counts; anything else is the default. */
export function resolveExpanded(token: string | null | undefined): boolean {
	return token?.trim() === '1';
}
