/**
 * THE REGISTER — every place on this site, written down once.
 *
 * The old site had one of these and it was the right idea: a page that exists in the router, in the
 * navigation and in a card deck is a page recorded in three places, and the third one is always the
 * one somebody forgets. This is the rebuilt version, and it starts small on purpose. It holds what
 * the rails need and nothing else; a field goes in when something reads it.
 *
 * ORDER IS THE ORDER IT IS WRITTEN IN. Not alphabetical, and not sorted at read time. This is a
 * contents list for a site, and a contents list is a sequence somebody chose — Home first because it
 * is the way in, then the two readings, in the order they make sense to read them.
 */

export type Place = {
	/** The URL, and the thing a rail links to. */
	href: string;
	/** Display name. Written in its own case, never uppercased in CSS — see the rail. */
	title: string;
	/**
	 * False while the page does not exist yet. A rail still LISTS it, because the shape of the site
	 * is a fact about the site and not about how far the rebuild has got — but it lists it as text
	 * rather than as a link, so nobody is sent to a 404.
	 *
	 * This is the whole "hide what is not ported" question, answered in the one place that can
	 * answer it. A link that goes nowhere is worse than an entry that says "not yet": the first
	 * wastes a click and blames the reader, the second is just the truth.
	 */
	ready: boolean;
};

export const PLACES: Place[] = [
	{ href: '/', title: 'Home', ready: true },
	{ href: '/about', title: 'About', ready: false },
	{ href: '/design-system', title: 'Design system', ready: false }
];

/**
 * A heading a page wants listed in its own rail. A page declares these from its `+page.ts` rather
 * than having them read off the DOM after it renders — that way the rail is in the server's HTML,
 * arrives with the page, and never flashes empty on the way in.
 *
 * The `id` must match the id on the heading it names. There is no check for that yet; when a third
 * page has one, there should be.
 */
export type Section = { id: string; title: string };
