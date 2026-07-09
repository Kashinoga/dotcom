// The network's identity: which stations exist and which lines connect them.
//
// Lifted out of +page.svelte so the URL layer ($lib/views.ts, src/params/view.ts)
// can derive its slugs from the same source the map draws from. Coordinates live
// here too — they're part of a station's definition — but nothing in this module
// knows about the camera, panels, or Svelte.

export type Pt = [number, number];

/** The home hub every line radiates from. Roots the URL hierarchy and the map's reveal rings. */
export const HUB = 'KSH';

// Airports on a 60px grid (grid space, pre-projection). KSH = home hub.
// Tier 1 sits near the hub (visible from home); tier 2 sits far out (reached by
// flying to its tier-1 leader). Each maps to a page/section — rename freely.
// Only real destinations for now — placeholders removed. The map is deliberately
// sparse until more real sections are added; new stations slot straight in here.
export const airports: Record<string, { at: Pt; title: string }> = {
	KSH: { at: [480, 300], title: 'Home' },
	STG: { at: [620, 360], title: 'Settings' },
	// About splits into its own two stops — Work and Projects.
	ABT: { at: [340, 220], title: 'About' },
	WRK: { at: [240, 180], title: 'Work' },
	PRJ: { at: [460, 160], title: 'Projects' },
	// Apps — a hub for the little live apps, fanning out on the orange line.
	APP: { at: [540, 410], title: 'Apps' },
	// Air Traffic — a live "what's in the air" board; first app off the Apps hub.
	ATFC: { at: [620, 520], title: 'Air Traffic' },
	// Presentation Builder — a visual editor for the route-map slide decks; second app off
	// the Apps hub, branching left-down opposite Air Traffic.
	PRES: { at: [460, 520], title: 'Presentation Builder' }
};

export const airlines: { name: string; color: string; legs: [string, string][]; body?: string }[] = [
	{
		name: 'Loess',
		color: '#12a150',
		legs: [['KSH', 'ABT'], ['ABT', 'PRJ'], ['ABT', 'WRK']],
		body: 'Named after a trip I took in college, Loess possesses some of my most formative moments.'
	},
	{
		name: 'Gray’s',
		color: '#8b46e0',
		legs: [['KSH', 'STG']],
		body: 'Named after my childhood area, Gray’s holds a special place in my heart.'
	},
	{
		name: 'Terminal Way',
		color: '#f06030',
		legs: [['KSH', 'APP'], ['APP', 'ATFC'], ['APP', 'PRES']],
		body: 'Named after the airport, Terminal Way represents the opportunities taken to expand my horizons.'
	}
];

// A one-line blurb per station, used as the shared-link preview description.
// Falls back to the station title when a stop has nothing more interesting to say.
export const portDescriptions: Record<string, string> = {
	KSH: 'A route map of Kashinoga — fly the camera station to station.',
	STG: 'Map style, station labels, display mode, and the time-of-day sky.',
	ABT: 'Who I am, and the two branches this stop fans out to.',
	WRK: 'Where I’ve worked and what I built there.',
	PRJ: 'Things I’ve made, on and off the clock.',
	APP: 'A hub for the little live apps running on this site.',
	ATFC: 'A live board of the aircraft arriving, departing, or passing overhead.',
	PRES: 'A visual editor for the route-map slide decks.'
};
