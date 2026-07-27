// The register of places. ONE entry per place, and nothing about a place lives anywhere else.
//
// This file replaced eleven separate lists, and the module ($lib/network) that held four of them.
// A place used to be assembled from `airports`, `children`, `accent` and `portDescriptions` over
// there, plus `APP_CARDS`, `APP_ICONS`, `NEW_HEADER`, `FULL_APPS`, `DOCS_BLEED`, `BAR_HEADER` and
// a favicon ternary in the page — eleven edits across two files to add one app. Missing one did
// not fail the build and did not fail a test: the app simply had no icon in the rail, or no card
// in the Apps panel, or took the wrong chrome. A silent fault, found by looking at the site.
//
// That was the same class of bug the transit lines caused before them. The map is long gone (its
// stations, legs and camera with it), and the tables that replaced the lines were an improvement
// — but they still spread one place's definition across the codebase, so the fault survived the
// refactor that was supposed to end it. Declaring a place ONCE is what actually ends it.
//
// Everything the rest of the app asks about a place is DERIVED below. The derived tables keep the
// names and shapes they had before, so their readers did not change; what changed is that there
// is now one place to add a place.
//
// Nothing in here knows about the camera, panels, or Svelte.

import {
	HOME_SVG,
	USER_SVG,
	BRIEFCASE_SVG,
	CODE_SVG,
	GRID_SVG,
	GEAR_SVG,
	AIRPLANE_SVG,
	PRESENTATION_SVG,
	CLOUD_SUN_SVG,
	STARS_SVG,
	GAVEL_SVG,
	PLANET_SVG,
	SMILE_SVG,
	WAND_SVG,
	NIB_SVG
} from './icons';
import faviconAtfc from './assets/favicon-atfc.svg';
import faviconPres from './assets/favicon-pres.svg';
import faviconWeather from './assets/favicon-weather.svg';
import faviconStar from './assets/favicon-star.svg';
import faviconAita from './assets/favicon-aita.svg';
import faviconPud from './assets/favicon-pud.svg';
import faviconEmoji from './assets/favicon-emoji.svg';
import faviconTextEditor from './assets/favicon-text-editor.svg';

/**
 * How a panel is framed. The four values are not a style scale — they name which chrome the
 * panel gets, and three separate booleans used to say the same thing less clearly.
 *
 *   'hub'    the map, not a panel. Only the home hub. Reaches none of the panel branches.
 *   'panel'  the shared super bar over a column of prose. The ordinary case.
 *   'bleed'  the shared super bar, but under Pixelite the body lays itself out FULL-BLEED on
 *            the gutter — no docs chapter head, no measure wrapper. For readings that title
 *            and arrange themselves.
 *   'dense'  full-viewport, and the shared bar in its one-row form with the title in it. A
 *            full-viewport app wants the vertical space; a wordmark that scrolls away is a
 *            luxury only a panel with prose under it can afford.
 *   'own'    builds its whole interior INCLUDING its header, so there is no shared bar here to
 *            put a badge in. Always full-viewport. Moving one of these onto the shared bar
 *            means editing that component, not this register.
 */
export type Chrome = 'hub' | 'panel' | 'bleed' | 'dense' | 'own';

export type Place = {
	/** Display name, AND the source of the URL slug. See $lib/views. */
	title: string;
	/** The place this one hangs off. Absent on the hub, and only on the hub. */
	parent?: string;
	/** Its dot, its chip, its card. */
	accent: string;
	/** One line, used as the shared-link preview description and on the cards. */
	blurb: string;
	/** The mark it wears in the Related rail, on its card, and in its badge. */
	icon: string;
	/** The mark that flies in the browser tab while it is open. Absent falls back to the site heart. */
	favicon?: string;
	/** Which chrome the panel takes. */
	chrome: Chrome;
	/** Does this panel lay its children into its body as cards, instead of ending on prose? */
	cards?: true;
};

/** The home hub. Roots the URL hierarchy: it contributes no path segment of its own. */
export const HUB = 'KSH';

// Declaration order IS the hierarchy's order: `children` is built by walking this register in
// order, so a place's siblings come out in the order they are written here. That matters for the
// Related rail and the site's outline; it does NOT decide card order, which sorts by title.
export const places: Record<string, Place> = {
	KSH: {
		title: 'Home',
		accent: '#12a150',
		blurb: 'A route map of Kashinoga — fly the camera station to station.',
		icon: HOME_SVG,
		chrome: 'hub'
	},

	// ── The About branch ────────────────────────────────────────────────────────
	ABT: {
		title: 'About',
		parent: 'KSH',
		accent: '#12a150',
		blurb: 'Who I am, and the two branches this stop fans out to.',
		icon: USER_SVG,
		chrome: 'panel',
		cards: true
	},
	PRJ: {
		title: 'Projects',
		parent: 'ABT',
		accent: '#12a150',
		blurb: 'The gist of my digital freetime.',
		icon: CODE_SVG,
		chrome: 'panel'
	},
	WRK: {
		title: 'Work',
		parent: 'ABT',
		accent: '#12a150',
		blurb: 'The gist of my professional timeline.',
		icon: BRIEFCASE_SVG,
		chrome: 'panel'
	},

	// ── The Apps branch ─────────────────────────────────────────────────────────
	APP: {
		title: 'Apps',
		parent: 'KSH',
		accent: '#f06030',
		blurb: 'A hub for the little live apps running on this site.',
		icon: GRID_SVG,
		chrome: 'panel',
		cards: true
	},
	ATFC: {
		title: 'Air Traffic',
		parent: 'APP',
		accent: '#f06030',
		blurb: 'A live board of the aircraft arriving, departing, or passing overhead.',
		icon: AIRPLANE_SVG,
		favicon: faviconAtfc,
		chrome: 'own'
	},
	PRES: {
		title: 'Presentation Builder',
		parent: 'APP',
		accent: '#f06030',
		blurb: 'A visual editor for the route-map slide decks.',
		icon: PRESENTATION_SVG,
		favicon: faviconPres,
		chrome: 'own'
	},
	WTHR: {
		title: 'Weather',
		parent: 'APP',
		accent: '#f06030',
		blurb: 'A National Oceanic and Atmospheric Administration data viewer.',
		icon: CLOUD_SUN_SVG,
		favicon: faviconWeather,
		chrome: 'bleed'
	},
	STAR: {
		title: 'Star Map',
		parent: 'APP',
		accent: '#f06030',
		blurb: 'The constellations overhead right now, from wherever you are.',
		icon: STARS_SVG,
		favicon: faviconStar,
		chrome: 'own'
	},
	AITA: {
		title: 'Court of Public Opinion',
		parent: 'APP',
		accent: '#f06030',
		blurb: 'An r/AmItheAsshole reader — judge the story first, then unseal the jury.',
		icon: GAVEL_SVG,
		favicon: faviconAita,
		chrome: 'bleed'
	},
	PUD: {
		title: 'Intergalactic Park Ranger',
		parent: 'APP',
		accent: '#f06030',
		blurb: 'An idle game — ranger the Pocket Universe Division’s parks, gathering Data Shards.',
		icon: PLANET_SVG,
		favicon: faviconPud,
		chrome: 'dense'
	},
	EMOJ: {
		title: 'Emoji Viewer',
		parent: 'APP',
		accent: '#f06030',
		blurb: 'Browse and copy the system emojis, drawn by your own device.',
		icon: SMILE_SVG,
		favicon: faviconEmoji,
		chrome: 'bleed'
	},
	TEXT: {
		title: 'Text Editor',
		parent: 'APP',
		accent: '#f06030',
		blurb: 'A Markdown editor, set as a page of the manual it renders.',
		icon: NIB_SVG,
		favicon: faviconTextEditor,
		// `dense`, not `bleed`, and the choice is the app's whole shape. A reading can afford to
		// scroll its own title away at the top of a docs sheet; an EDITOR cannot give up the
		// vertical space, and its rack and its running foot both have to stay to hand while the
		// sheet under them scrolls. That is what dense buys — the full viewport, and the bar in
		// its one-row form with the name already in it.
		//
		// It keeps the Apps-branch orange rather than following Densette to cobalt. Densette is
		// cobalt because it IS a printed manual under any theme; this one is an app that happens
		// to be dressed as one, and under Pixelite the accent is re-read as the theme's cobalt
		// anyway (see --orange), so the entry says what the place is in the Apps index and lets
		// the theme have its say on top.
		chrome: 'dense'
	},
	DENS: {
		title: 'Densette',
		parent: 'APP',
		// Densette carries its own ink, not the Apps-branch orange: Pixelite cobalt, the one
		// accent of the printed manual it renders as. The card and badge turn cobalt to match.
		accent: '#103dff',
		blurb: 'The Curriculum — a tabletop RPG from The Peaks University, 2172.',
		icon: WAND_SVG,
		chrome: 'panel'
	},

	// ── Settings ────────────────────────────────────────────────────────────────
	STG: {
		title: 'Settings',
		parent: 'KSH',
		accent: '#8b46e0',
		blurb: 'Display mode, the look of the site, the sky behind it.',
		icon: GEAR_SVG,
		chrome: 'panel'
	}
};

export const codes = Object.keys(places);

// ── The shape, derived ────────────────────────────────────────────────────────
// The site's outline: what the URL layer ($lib/views, and the route matcher behind it) reads, and
// what the Related rail and the docs shell walk.

/** Every place, by code. The title is the display name AND the source of the URL slug. */
export const airports: Record<string, { title: string }> = Object.fromEntries(
	codes.map((code) => [code, { title: places[code].title }])
);

/**
 * A place's children, in declaration order. This is the site's outline: it builds the URLs
 * (`/about/work`, `/apps/weather`) and it answers what a panel's Related rail links to.
 */
export const children: Record<string, string[]> = (() => {
	const out: Record<string, string[]> = {};
	for (const code of codes) {
		const parent = places[code].parent;
		if (parent) (out[parent] ??= []).push(code);
	}
	return out;
})();

/** A place's parent, inverted from `children`. The hub has none. */
export const parentOf: Record<string, string> = Object.fromEntries(
	codes.filter((code) => places[code].parent).map((code) => [code, places[code].parent as string])
);

/**
 * What a panel's Related rail links to: the parent above a place and the children below it. The
 * hub lists its children; a leaf lists its parent.
 */
export function connections(code: string): string[] {
	const up = parentOf[code];
	return [...(up ? [up] : []), ...(children[code] ?? [])];
}

// ── Presentation, derived ─────────────────────────────────────────────────────

/** The accent each place carries. */
export const accent: Record<string, string> = Object.fromEntries(
	codes.map((code) => [code, places[code].accent])
);

/** A one-line blurb per place. */
export const portDescriptions: Record<string, string> = Object.fromEntries(
	codes.map((code) => [code, places[code].blurb])
);

/**
 * A mark per place, worn by its chip in the Related rail, its card, and its badge. It replaced a
 * plain accent dot: the dot named the LINE a stop sat on and nothing about the stop itself.
 */
export const PORT_ICONS: Record<string, string> = Object.fromEntries(
	codes.map((code) => [code, places[code].icon])
);

/** The tab mark per place. A place with no entry wears the site heart — see the page's `favicon`. */
export const FAVICONS: Record<string, string | undefined> = Object.fromEntries(
	codes.map((code) => [code, places[code].favicon])
);

const withChrome = (...kinds: Chrome[]) =>
	codes.filter((code) => kinds.includes(places[code].chrome));

/**
 * The panels that render the SHARED super bar — everything except the three that build their own
 * header and the hub, which is the map rather than a panel.
 */
export const NEW_HEADER = withChrome('panel', 'bleed', 'dense');

/**
 * The self-chrome full-viewport apps. They own their whole interior and are always full-viewport
 * (force-expanded), so in EITHER theme they render through the stage's full-viewport path —
 * never inside the docs shell.
 */
export const FULL_APPS = withChrome('own', 'dense');

/** The panels whose bar is DENSE: one row, the title in it beside the badge. */
export const BAR_HEADER = withChrome('dense');

/** Pixelite docs mode: the self-chrome readings that title and lay themselves out full-bleed. */
export const DOCS_BLEED = withChrome('bleed');

/** Alphabetical by title — a card's order is presentation, not hierarchy. */
const byTitle = (a: string, b: string) => places[a].title.localeCompare(places[b].title);

/**
 * The panels that lay their onward destinations INTO the body as cards. Apps deals its live
 * apps; About fans out to its two branches. (The Related chip rail this replaced is gone: each
 * panel ends on its own content, and Back/Home already lead out.)
 */
export const PANEL_CARDS: Record<string, string[]> = Object.fromEntries(
	codes
		.filter((code) => places[code].cards)
		.map((code) => [code, [...(children[code] ?? [])].sort(byTitle)])
);

/** The apps the Apps panel shows as cards — the Apps branch, alphabetical. */
export const APP_CARDS = PANEL_CARDS.APP ?? [];

// ── Guards ────────────────────────────────────────────────────────────────────
// A malformed register is caught HERE, at import, rather than as a blank rail or a missing card
// somewhere on the site. $lib/views runs the URL-shaped checks (slug collisions, orphans) over
// the same data.
(function assertRegisterIsWellFormed() {
	const hubs = codes.filter((code) => !places[code].parent);
	if (hubs.length !== 1 || hubs[0] !== HUB) {
		throw new Error(
			`Exactly one place may hang off nothing, and it must be the hub (${HUB}). Found: ${hubs.join(', ') || 'none'}.`
		);
	}
	for (const code of codes) {
		const place = places[code];
		if (place.parent && !places[place.parent]) {
			throw new Error(`"${code}" names an unknown parent "${place.parent}".`);
		}
		if (place.chrome === 'hub' && code !== HUB) {
			throw new Error(`"${code}" claims the hub's chrome, but only ${HUB} is the hub.`);
		}
		if (code === HUB && place.chrome !== 'hub') {
			throw new Error(`The hub (${HUB}) must take the 'hub' chrome — it is the map, not a panel.`);
		}
		// A card panel with nothing under it renders an empty body where its content should be.
		if (place.cards && !(children[code] ?? []).length) {
			throw new Error(`"${code}" is marked \`cards\` but has no children to deal.`);
		}
	}
})();
