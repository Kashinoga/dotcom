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

/** One line of the on-this-page rail. `depth` is the heading level, 1–3. */
export type Entry = { href: string; title: string; depth: number };

/**
 * THE CONTENTS LIST, BUILT AT BUILD TIME so it is in the HTML the server sends.
 *
 * The design system's own page builds this after load, which is right for a single static file —
 * there is no earlier moment there. Here there is one, and not using it costs twice: the rail
 * appears a beat after the text and moves it, and a reader with no JavaScript never gets it at all.
 * Its script now leaves an already-filled list alone, so the two do not both run.
 *
 * IT READS IDS, IT DOES NOT INVENT THEM. Every heading's anchor is written in the design system's
 * markup now, so nothing here needs to know how a slug is spelled — which is the point. A second
 * implementation of that rule would be a second copy of it, and the two would drift the first time
 * one of them learned about an apostrophe.
 *
 * The one structural rule it does apply: a heading with no id of its own anchors to the <section>
 * that contains it. That is not this file's invention either — it is the branch the design system's
 * own builder prefers, because #foundations reading off the section beats #foundations-2 reading off
 * the heading inside it. The four section titles are exactly the headings that rely on it.
 */
function extractContents(html: string): Entry[] {
	const out: Entry[] = [];
	// One pass, in document order, so the section in hand is always the last one opened.
	const token = /<section\b([^>]*)>|<(h[123])\b([^>]*)>([\s\S]*?)<\/\2>/g;
	let section = '';

	for (const m of html.matchAll(token)) {
		if (m[1] !== undefined) {
			section = /id="([^"]+)"/.exec(m[1])?.[1] ?? '';
			continue;
		}
		const [, , tag, attrs, inner] = m;
		const own = /id="([^"]+)"/.exec(attrs)?.[1];
		const href = own ?? section;
		// A heading with neither its own id nor a section around it has nothing to link to. Skipping
		// it silently would drop a line from the rail with no sign; the check below refuses instead.
		if (!href) continue;
		out.push({
			href: `#${href}`,
			title: inner
				.replace(/<[^>]+>/g, '')
				.replace(/\s+/g, ' ')
				.trim(),
			depth: Number(tag[1])
		});
	}

	// The document has twelve headings and has had for some time. An exact number would break on
	// every edit; zero, or a handful, means the markup changed shape and this parse stopped seeing
	// it — which would otherwise show up as a quietly short rail rather than as a failure.
	if (out.length < 6) {
		throw new Error(
			`docs-content: found only ${out.length} headings to list. The documentation's markup ` +
				'changed shape; this parse has to move with it.'
		);
	}

	return out;
}

export const DOCS_CONTENTS = extractContents(DOCS_HTML);
