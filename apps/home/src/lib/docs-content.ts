import source from '@kashinoga/design-system/docs.html?raw';

/**
 * THE DOCUMENTATION'S BODY TEXT, TAKEN FROM THE DESIGN SYSTEM RATHER THAN COPIED OUT OF IT.
 *
 * The pages this site renders are written in the design system's own repository, in its index.html.
 * Vite's `?raw` pulls that file in as a string at BUILD time, and the slice below takes the one
 * region of it that is the document: everything inside <main>.
 *
 * WHY NOT HAND-PORT IT INTO SVELTE. Because there would then be two copies of the same document —
 * one where it is written and one here — and the second would be wrong within a week. The rule this
 * repo already runs on is that a value copied is a value that will drift, and a page is a large
 * value. Pulling the source means a change over there arrives here on the next dependency bump, and
 * the two pages cannot disagree.
 *
 * WHAT IS NOT TAKEN: the superbar, the rails and the footer. Those are the SITE's chrome, and this
 * site has its own — a bar with more than one destination in it, because this site has more than one
 * page. The document is what is shared; the furniture around it is not.
 *
 * THE SEAM IS <main>, and it is a real seam rather than a lucky one. The design system's page puts
 * exactly the document inside it and every piece of apparatus outside it, so the tag is already the
 * line between the two things. The slice is checked at build time — see below — because a silent
 * empty page is the failure mode worth spending five lines to avoid.
 */
function extractMain(html: string): string {
	const open = html.indexOf('<main');
	const start = open === -1 ? -1 : html.indexOf('>', open);
	const end = html.lastIndexOf('</main>');

	if (open === -1 || start === -1 || end === -1 || end <= start) {
		throw new Error(
			'docs-content: no <main> found in @kashinoga/design-system/docs.html. The documentation ' +
				'page changed shape; this seam has to move with it.'
		);
	}

	const inner = html.slice(start + 1, end).trim();

	// A <main> that parsed but holds nothing is the same failure with a friendlier face. It would
	// render as a blank page under a working superbar, which reads as "the docs are empty" rather
	// than "the build is broken".
	if (inner.length < 500) {
		throw new Error(
			`docs-content: <main> held only ${inner.length} characters. That is not the document.`
		);
	}

	return inner;
}

export const DOCS_HTML = extractMain(source);
