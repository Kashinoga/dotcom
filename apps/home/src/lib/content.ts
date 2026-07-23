// The site's written copy, and the type it takes.
//
// It used to live in a `defaultPages` literal inside +page.svelte, which made Edit Mode a loop
// that never closed: you edited a paragraph in the browser, Save copied the whole set to the
// clipboard, and the toast asked you to paste it back into the source by hand. Copy is the part
// of this site most likely to change and the part least likely to need a code review, so that
// was the wrong way round.
//
// It is DATA now (./content.json), which is what lets the loop close: in dev, Save writes the
// file back through /api/content, Vite reloads it, and the change is a git diff. In production
// nothing writes anything — the JSON is bundled at build time, exactly as the literal was.
//
// JSON has no comments, so the provenance notes each page carried ("from dotcom-2 card K 202")
// live in a `notes` object beside the pages, and the writer preserves them.

import raw from './content.json';
import { portDescriptions } from './places';

/**
 * A block list, rendered into the content surface. Add `h`, `sub`, `p`, `img`, `quote`, `code`
 * and `email` blocks freely — the panel renders each shape, and Edit Mode makes the text of any
 * of them editable (see EDIT_FIELDS in the page).
 */
export type Block =
	| { h: string }
	| { sub: string }
	| { p: string }
	| { img: string }
	| { quote: string }
	| { code: string }
	| { email: string };

export type Content = {
	notes: Record<string, string>;
	pages: Record<string, Block[]>;
	settings: Record<string, string>;
};

const content = raw as Content;

/**
 * `{blurb}` in a page's copy stands for that place's own one-line blurb, from the register.
 *
 * Work and Projects both open on their tagline, and that tagline is also the text on their card
 * and in their meta description. Writing it out three times is three chances for two of them to
 * drift; the token means there is one.
 */
const expand = (code: string, text: string) =>
	text.replace(/\{blurb\}/g, () => portDescriptions[code] ?? '');

/** The copy each panel opens with, by place code. A place with no entry renders a stub. */
export const defaultPages: Record<string, Block[]> = Object.fromEntries(
	Object.entries(content.pages).map(([code, blocks]) => [
		code,
		blocks.map((block) =>
			Object.fromEntries(
				Object.entries(block).map(([field, text]) => [field, expand(code, text as string)])
			)
		) as Block[]
	])
);

/**
 * The Settings panel's own copy — its section leads and flavour notes. A note may carry a `{}`
 * placeholder that the panel fills with the live value (the current range, say); editing keeps
 * the token, so the note stays a template rather than freezing one reading of it.
 */
export const defaultSettings: Record<string, string> = { ...content.settings };

/** Provenance per page, kept so an edit round trip does not throw it away. */
export const notes: Record<string, string> = { ...content.notes };
