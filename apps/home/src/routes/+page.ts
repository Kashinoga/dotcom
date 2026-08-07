import type { Section } from '$lib/places';

/**
 * What the on-this-page rail lists. Declared here rather than read off the rendered headings, so
 * the rail is in the HTML the server sends and does not appear a frame late.
 *
 * It must stay in step with the `id`s in +page.svelte by hand, which is a seam and is named as one.
 * With one page and one heading, a check would be more machinery than the thing it checks. With
 * three, write the check.
 */
export const load = (): { sections: Section[] } => ({
	sections: [{ id: 'where-to-go', title: 'Where to go' }]
});
