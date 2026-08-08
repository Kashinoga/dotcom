/**
 * THE ABOUT ME GROUP — one page and its parts, written down once.
 *
 * The rail beside every page in this group is read off this list, so a page cannot be in the group
 * and missing from the rail, and renaming one is a single edit. Four copies of a four-line list —
 * one per page — is exactly the shape of thing that rots.
 *
 * ABOUT ME COMES FIRST, ahead of its own parts. It is the page the others hang off, and a reader
 * arriving on Work should be able to see what Work is part of without going looking for it.
 */

export type Place = { href: string; title: string };

export const ABOUT_PAGES: Place[] = [
	{ href: '/about-me', title: 'About Me' },
	{ href: '/about-me/work', title: 'Work' },
	{ href: '/about-me/education', title: 'Education' },
	{ href: '/about-me/contact', title: 'Contact' }
];
