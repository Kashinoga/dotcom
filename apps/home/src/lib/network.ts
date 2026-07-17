// The site's places, and how they hang off one another.
//
// This used to be a transit network — stations on a grid, joined by named lines (Loess, Gray's,
// Terminal Way), with a route map you flew a camera around. The map went first, then the map's
// motif: what's left is what the site actually needs, which is a NAME, a COLOUR, and a PARENT for
// each place.
//
// The lines are gone for a reason, not just for tidiness. Three things were derived from them —
// a place's URL, its accent colour, and its Related links — so adding a place meant adding it to a
// leg list, an accent-bearing line, AND two dormant coordinate tables, or something broke at a
// distance. (Weather did: it threw inside the retired camera code, which still indexed a station
// table nothing drew.) Each of those three is now stated outright, right here.
//
// Nothing in this module knows about the camera, panels, or Svelte.

/** The home hub. Roots the URL hierarchy: it contributes no path segment of its own. */
export const HUB = 'KSH';

/** Every place on the site. The title is the display name AND the source of the URL slug. */
export const airports: Record<string, { title: string }> = {
	KSH: { title: 'Home' },
	ABT: { title: 'About' },
	WRK: { title: 'Work' },
	PRJ: { title: 'Projects' },
	STG: { title: 'Settings' },
	APP: { title: 'Apps' },
	ATFC: { title: 'Air Traffic' },
	PRES: { title: 'Presentation Builder' },
	WTHR: { title: 'Weather' },
	STAR: { title: 'Star Map' },
	AITA: { title: 'Court of Public Opinion' }
};

// The hierarchy — a place's children. This is the ONE structure the site's shape comes from: it
// builds the URLs (`/about/work`, `/apps/weather`), and it answers what a panel's Related rail
// links to (a place's parent and its children — the stops either side of it).
//
// It reads as the site's outline because that's what it is. Add a place by adding it here.
export const children: Record<string, string[]> = {
	KSH: ['ABT', 'APP', 'STG'],
	ABT: ['WRK', 'PRJ'],
	APP: ['ATFC', 'PRES', 'WTHR', 'STAR', 'AITA']
};

/** A place's parent, inverted from `children`. The hub has none. */
export const parentOf: Record<string, string> = Object.fromEntries(
	Object.entries(children).flatMap(([parent, kids]) => kids.map((k) => [k, parent]))
);

/**
 * What a panel's Related rail links to: the parent above a place and the children below it. The
 * hub lists its children; a leaf lists its parent. It used to be "everything the line touched",
 * which is the same answer by a longer route.
 */
export function connections(code: string): string[] {
	const up = parentOf[code];
	return [...(up ? [up] : []), ...(children[code] ?? [])];
}

// The accent each place carries — its dot, its chip, its card. These were a side effect of which
// line reached a station first, which is a strange thing for a colour to depend on. They're stated
// per place now, and the three colours are the ones the lines used, so nothing on screen moved:
// green for the About branch, purple for Settings, orange for the Apps branch.
export const accent: Record<string, string> = {
	KSH: '#12a150',
	ABT: '#12a150',
	WRK: '#12a150',
	PRJ: '#12a150',
	STG: '#8b46e0',
	APP: '#f06030',
	ATFC: '#f06030',
	PRES: '#f06030',
	WTHR: '#f06030',
	STAR: '#f06030',
	AITA: '#f06030'
};

// A one-line blurb per place, used as the shared-link preview description and on the Apps cards.
export const portDescriptions: Record<string, string> = {
	KSH: 'A route map of Kashinoga — fly the camera station to station.',
	STG: 'Display mode, the look of the site, the sky behind it.',
	ABT: 'Who I am, and the two branches this stop fans out to.',
	WRK: 'The gist of my professional timeline.',
	PRJ: 'The gist of my digital freetime.',
	APP: 'A hub for the little live apps running on this site.',
	ATFC: 'A live board of the aircraft arriving, departing, or passing overhead.',
	PRES: 'A visual editor for the route-map slide decks.',
	WTHR: 'A National Oceanic and Atmospheric Administration data viewer.',
	STAR: 'The constellations overhead right now, from wherever you are.',
	AITA: 'An r/AmItheAsshole reader — judge the story first, then unseal the jury.'
};
