// The Markdown engine behind Text Editor ($lib/TextEditor.svelte).
//
// Hand-written, and deliberately so. The app ships as part of a site with three runtime
// dependencies in total, and pulling a 40 kB parser over the wire to render a page of notes
// would cost more than the app weighs. What is here is the subset a person actually types —
// headings, emphasis, links, lists, quotes, rules, fenced code, tables — parsed strictly,
// nothing else recognised. It is NOT CommonMark and does not try to be: an unsupported
// construct comes out as the literal text it was typed as, which is the honest failure for an
// editor whose right-hand pane is a preview rather than a publishing target.
//
// SAFETY. The output is fed to {@html}, so this module is the only thing standing between the
// visitor's keystrokes and the document. Two rules hold it up, and both are absolute:
//
//   1. EVERY source character is HTML-escaped ONCE, up front, before any rule looks at it. No
//      later stage ever un-escapes. So a typed `<script>` is `&lt;script&gt;` by the time the
//      inline rules run, and there is no path by which it becomes a tag again. Raw HTML in the
//      source is therefore NOT passed through — it prints as itself. That is a deliberate
//      feature here, not a missing one.
//   2. Every tag in the output is written by THIS file, from a fixed vocabulary. URLs are the
//      one place source text reaches an attribute, and `safeUrl` gates them to schemes that
//      cannot execute.
//
// Nothing in here touches the DOM or reads a global, so `node --test` exercises it directly
// (test/markdown.test.ts) with no browser and no harness.

/** The tags this module will ever emit. Written down so a review can check the list, not the file. */
export const EMITTED_TAGS = [
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'br',
	'hr',
	'em',
	'strong',
	'del',
	'code',
	'pre',
	'a',
	'img',
	'ul',
	'ol',
	'li',
	'blockquote',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td'
] as const;

/**
 * Rule 1, applied once at the top of `renderMarkdown` and nowhere else. `"` is escaped too
 * because the same escaped text is what lands inside href/src/alt attributes downstream.
 *
 * `>` is deliberately NOT escaped, and that is a correctness fix rather than a shortcut. It is
 * inert either way — with `<` always escaped no tag can ever open, so a lone `>` in a text node
 * or inside a quoted attribute is just the character — while escaping it would turn every
 * blockquote in the document into `&gt; …` before RE_QUOTE ever looked at the line, and
 * blockquotes would silently stop working. Leaving it alone lets the block rules below read
 * escaped text with the same patterns they would read the source with.
 */
function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/**
 * The gate on the one place source text reaches an attribute. An allow-list, not a block-list:
 * a URL passes only if it is relative, or a fragment, or carries a scheme we know cannot run
 * script. `javascript:`, `vbscript:` and bare `data:` fall through to '#'.
 *
 * Two obfuscations of the scheme are flattened before it is read, because a browser flattens
 * them too: a tab inside `java\tscript:` is not part of the scheme, and neither is `&#9;`.
 *
 * The entity arm is BELT AND BRACES, and is documented as such rather than quietly kept. By the
 * time a URL reaches here escapeHtml has already turned any typed `&` into `&amp;`, so the
 * entity form arrives as `java&amp;#9;script:` — inert on its own, since `&` cannot appear in a
 * scheme and a browser reads the whole string as a relative path instead. The strip is kept
 * anyway: it costs one pass, and it is the check that would still hold if the escaping order
 * above were ever rearranged. The control-character arm, by contrast, is LIVE — the link
 * pattern rejects whitespace but not the other C0 characters, so those do arrive here intact.
 */
function safeUrl(escaped: string): string {
	const bare = escaped
		.replace(/&#(?:x0*9|x0*a|x0*d|0*9|0*10|0*13);?/gi, '')
		// (The range is written as escapes so this file stays printable in a terminal.)
		.replace(/[\u0000-\u0020]/g, '')
		.toLowerCase();
	if (/^(?:https?|mailto|tel|ftp):/.test(bare)) return escaped;
	// A data: URL is allowed only for an inline image, and only for the raster/vector-free types.
	if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/.test(bare)) return escaped;
	if (/^[a-z][a-z0-9+.-]*:/.test(bare)) return '#'; // some other scheme — not ours to trust
	return escaped; // relative path, fragment, protocol-relative — no scheme, nothing to run
}

/** `Chapter One` → `chapter-one`. Heading anchors, so a long document can be linked into. */
function slug(text: string): string {
	return text
		.replace(/<[^>]*>/g, '')
		.replace(/&[a-z#0-9]+;/gi, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

// ── Inline ────────────────────────────────────────────────────────────────────
// Runs on ALREADY-ESCAPED text. Order matters: code spans are lifted out first so that the
// emphasis and link rules can never reach inside them (`` `**not bold**` `` prints its
// asterisks), and are put back last.

const SENTINEL = '\u0000';

function inline(escaped: string): string {
	const spans: string[] = [];
	let s = escaped.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, _ticks, code: string) => {
		spans.push(`<code>${code.replace(/^ | $/g, '')}</code>`);
		return `${SENTINEL}${spans.length - 1}${SENTINEL}`;
	});

	// Images before links — `![alt](src)` starts with the link pattern, so a link-first pass
	// would eat the `[alt](src)` half and leave a stray `!` in front of an <a>.
	s = s.replace(
		/!\[([^\]]*)\]\(\s*([^\s)]*)(?:\s+&quot;([\s\S]*?)&quot;)?\s*\)/g,
		(_, alt: string, src: string, title?: string) =>
			`<img src="${safeUrl(src)}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy">`
	);
	s = s.replace(
		/\[([^\]]*)\]\(\s*([^\s)]*)(?:\s+&quot;([\s\S]*?)&quot;)?\s*\)/g,
		(_, text: string, href: string, title?: string) => {
			const url = safeUrl(href);
			// An outbound link opens where it was asked to and carries the usual noopener guard;
			// a fragment or relative path stays in the tab.
			const away = /^(?:https?:)?\/\//.test(url);
			const rel = away ? ' target="_blank" rel="noopener noreferrer"' : '';
			return `<a href="${url}"${title ? ` title="${title}"` : ''}${rel}>${text}</a>`;
		}
	);

	// Strong before em, so `***both***` resolves outside-in rather than leaving a loose star.
	s = s
		.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
		.replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
		.replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>')
		// `_` emphasis needs a word boundary on BOTH sides or it would cut snake_case_names in
		// half — the one place this differs from `*`, and the reason both forms exist.
		.replace(/(^|[^\w_])_(?=\S)([^_]*?\S)_(?![\w_])/g, '$1<em>$2</em>')
		.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');

	return s.replace(new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g'), (_, i: string) => spans[+i]);
}

/**
 * A paragraph's worth of lines, joined. A line ending in two spaces or a backslash is a HARD
 * break — the one piece of Markdown whitespace that is load-bearing, and the reason the trim
 * happens per line rather than over the whole block.
 */
function paragraphText(lines: string[]): string {
	return lines
		.map((l, i) => {
			const hard = /(?: {2,}|\\)$/.test(l);
			const text = l.replace(/(?: +|\\)$/, '');
			return i === lines.length - 1 ? text : text + (hard ? '<br>\n' : '\n');
		})
		.join('');
}

// ── Blocks ────────────────────────────────────────────────────────────────────

const RE_FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)\s*$/;
const RE_HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const RE_HR = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const RE_QUOTE = /^ {0,3}>[ \t]?/;
const RE_UL = /^([ \t]*)([-*+])[ \t]+(.*)$/;
const RE_OL = /^([ \t]*)(\d{1,9})[.)][ \t]+(.*)$/;
const RE_TABLE_RULE = /^[ \t]*\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?[ \t]*$/;
/**
 * A SETEXT underline — a line of nothing but `=` (first level) or `-` (second). It only means
 * anything directly under a paragraph, which is why it is not in `startsBlock`: on its own, at
 * the head of a block, a row of dashes is a thematic break and stays one.
 *
 * The `-` form is genuinely ambiguous with a rule, and the ambiguity is resolved in the heading's
 * favour — which is what CommonMark does, and what the writer meant. Left as a rule, typing a
 * heading the older way produced a paragraph AND a stray line across the page: the heading lost
 * its level silently and gained a horizontal rule it never asked for. That is a wrong render
 * rather than an unsupported one, which is the reason this exists at all.
 */
const RE_SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;

/** How wide a leading indent reads, with a tab counting as four columns. */
const indentOf = (s: string) => (s.match(/^[ \t]*/)?.[0] ?? '').replace(/\t/g, '    ').length;

const isBlank = (l: string) => /^[ \t]*$/.test(l);

/** Does this line open a block of its own? Decides where a loose paragraph has to stop. */
function startsBlock(l: string): boolean {
	return (
		RE_FENCE.test(l) ||
		RE_HEADING.test(l) ||
		RE_HR.test(l) ||
		RE_QUOTE.test(l) ||
		RE_UL.test(l) ||
		RE_OL.test(l)
	);
}

/** Split a table row on unescaped pipes, dropping the optional leading/trailing ones. */
function tableCells(line: string): string[] {
	return line
		.trim()
		.replace(/^\||\|$/g, '')
		.split(/(?<!\\)\|/)
		.map((c) => c.trim().replace(/\\\|/g, '|'));
}

/**
 * The block loop. Takes already-escaped lines and returns HTML. Recurses for anything with a
 * body of its own — a quote, a list item — so nesting comes out of the same code path rather
 * than a second, shallower one.
 */
function blocks(lines: string[]): string {
	const out: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (isBlank(line)) {
			i++;
			continue;
		}

		// Fenced code. Everything up to the closing fence is verbatim — no inline pass, which is
		// the whole point of a fence. An unclosed fence runs to the end of the document rather
		// than falling back to paragraphs: a half-typed fence should look like the code block it
		// is on its way to being.
		const fence = line.match(RE_FENCE);
		if (fence) {
			const [, mark, lang] = fence;
			const body: string[] = [];
			i++;
			const closer = new RegExp(`^ {0,3}${mark[0]}{${mark.length},}\\s*$`);
			while (i < lines.length && !closer.test(lines[i])) body.push(lines[i++]);
			if (i < lines.length) i++; // step over the closing fence
			const cls = lang ? ` class="language-${lang.replace(/[^\w-]/g, '')}"` : '';
			out.push(`<pre><code${cls}>${body.join('\n')}</code></pre>`);
			continue;
		}

		const heading = line.match(RE_HEADING);
		if (heading) {
			const level = heading[1].length;
			const text = inline(heading[2]);
			const id = slug(text);
			out.push(`<h${level}${id ? ` id="${id}"` : ''}>${text}</h${level}>`);
			i++;
			continue;
		}

		if (RE_HR.test(line)) {
			out.push('<hr>');
			i++;
			continue;
		}

		if (RE_QUOTE.test(line)) {
			// A quote runs while its lines are marked, and through unmarked non-blank lines too
			// (lazy continuation — the way people actually type a wrapped quote).
			const body: string[] = [];
			while (i < lines.length && !isBlank(lines[i])) {
				if (RE_QUOTE.test(lines[i])) body.push(lines[i].replace(RE_QUOTE, ''));
				else if (startsBlock(lines[i])) break;
				else body.push(lines[i]);
				i++;
			}
			out.push(`<blockquote>${blocks(body)}</blockquote>`);
			continue;
		}

		const bullet = line.match(RE_UL) ?? line.match(RE_OL);
		if (bullet) {
			const ordered = RE_OL.test(line) && !RE_UL.test(line);
			const baseIndent = indentOf(line);
			const items: string[][] = [];
			let loose = false; // a blank line INSIDE the list makes every item a paragraph
			let sawBlank = false;

			while (i < lines.length) {
				const l = lines[i];
				if (isBlank(l)) {
					// Look ahead: a blank followed by more of this list keeps it going, loosely.
					let j = i + 1;
					while (j < lines.length && isBlank(lines[j])) j++;
					if (j >= lines.length) break;
					const next = lines[j];
					const continues =
						indentOf(next) > baseIndent ||
						((ordered ? RE_OL : RE_UL).test(next) && indentOf(next) === baseIndent);
					if (!continues) break;
					sawBlank = true;
					i = j;
					continue;
				}
				const m = l.match(ordered ? RE_OL : RE_UL);
				if (m && indentOf(l) === baseIndent) {
					if (sawBlank) loose = true;
					sawBlank = false;
					items.push([m[3]]);
					i++;
					continue;
				}
				// Anything more indented belongs to the item above — a nested list, a second
				// paragraph, a fenced block. It is dedented by the marker's width and handed to
				// the recursion, which is how nesting gets the full grammar rather than a subset.
				if (items.length && indentOf(l) > baseIndent) {
					if (sawBlank) {
						loose = true;
						items[items.length - 1].push('');
						sawBlank = false;
					}
					items[items.length - 1].push(l.replace(/^[ \t]{1,4}/, ''));
					i++;
					continue;
				}
				break;
			}

			const rendered = items.map((body) => {
				const html = blocks(body).trim();
				// A tight list drops the <p> the recursion put round the item's own text, so the
				// bullets sit on their own leading instead of paragraph spacing. Only the LEADING
				// paragraph is unwrapped, not the whole item: an item that carries a nested list
				// under its text is still tight, and stripping only the first block is what keeps
				// `- outer / ␣␣- inner` from growing paragraph space around the word "outer".
				return `<li>${loose ? html : html.replace(/^<p>([\s\S]*?)<\/p>/, '$1')}</li>`;
			});
			const tag = ordered ? 'ol' : 'ul';
			const start = ordered ? Number(line.match(RE_OL)![2]) : 1;
			const attr = ordered && start !== 1 ? ` start="${start}"` : '';
			out.push(`<${tag}${attr}>${rendered.join('')}</${tag}>`);
			continue;
		}

		// A table is recognised by its SECOND line: a header row alone is just a paragraph with
		// pipes in it, and that ambiguity is why the rule row is required.
		if (
			line.includes('|') &&
			i + 1 < lines.length &&
			RE_TABLE_RULE.test(lines[i + 1]) &&
			lines[i + 1].includes('-')
		) {
			const head = tableCells(line);
			const align = tableCells(lines[i + 1]).map((c) => {
				const left = c.startsWith(':');
				const right = c.endsWith(':');
				return right && left ? 'center' : right ? 'right' : left ? 'left' : '';
			});
			i += 2;
			const body: string[][] = [];
			while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
				body.push(tableCells(lines[i]));
				i++;
			}
			const cell = (tag: string, text: string, n: number) => {
				const a = align[n] ? ` style="text-align:${align[n]}"` : '';
				return `<${tag}${a}>${inline(text)}</${tag}>`;
			};
			const thead = `<thead><tr>${head.map((c, n) => cell('th', c, n)).join('')}</tr></thead>`;
			const tbody = body.length
				? `<tbody>${body
						.map((r) => `<tr>${head.map((_, n) => cell('td', r[n] ?? '', n)).join('')}</tr>`)
						.join('')}</tbody>`
				: '';
			out.push(`<table>${thead}${tbody}</table>`);
			continue;
		}

		// Paragraph — everything else, running until a blank line or the start of a real block.
		// It may also end as a SETEXT HEADING: a line of `=` or `-` under it retitles everything
		// gathered so far, however many lines that is. The check has to live in here rather than
		// beside the other block rules, because an underline is only an underline when there is a
		// paragraph above it to underline — the same characters at the head of a block are a rule.
		const para: string[] = [];
		let underlined = 0;
		while (i < lines.length && !isBlank(lines[i])) {
			if (para.length) {
				const underline = lines[i].match(RE_SETEXT);
				if (underline) {
					underlined = underline[1][0] === '=' ? 1 : 2;
					i++;
					break;
				}
				if (startsBlock(lines[i])) break;
			}
			para.push(lines[i]);
			i++;
		}
		const body = inline(paragraphText(para));
		if (underlined) {
			const id = slug(body);
			out.push(`<h${underlined}${id ? ` id="${id}"` : ''}>${body}</h${underlined}>`);
		} else {
			out.push(`<p>${body}</p>`);
		}
	}

	return out.join('');
}

/** Markdown in, HTML out. The only entry point; everything above is private to it. */
export function renderMarkdown(src: string): string {
	if (!src.trim()) return '';
	return blocks(escapeHtml(src.replace(/\r\n?/g, '\n')).split('\n'));
}

// ── The running foot ──────────────────────────────────────────────────────────

export type Tally = {
	lines: number;
	words: number;
	chars: number;
	/** Reading time at 220 wpm, rounded up, floored at 1 for any non-empty document. */
	minutes: number;
};

export function tally(src: string): Tally {
	const words = src.trim() ? (src.trim().match(/\S+/g)?.length ?? 0) : 0;
	return {
		lines: src === '' ? 0 : src.split('\n').length,
		words,
		chars: src.length,
		minutes: words ? Math.max(1, Math.ceil(words / 220)) : 0
	};
}

// ── The margin ────────────────────────────────────────────────────────────────

/**
 * One short mark per SOURCE line, for the text editor's left margin — the running annotation a
 * marked-up proof carries down its edge. It reads the source line by line rather than reusing
 * the block parser, because the margin is about where the writer's CARET is, not about what
 * parses: a half-typed `## ` should show its H2 before the heading has any text.
 *
 * Fence-aware, and that is the only state it keeps: lines inside a fenced block get no mark at
 * all, or every `#` in a shell snippet would claim to be a heading.
 *
 * Kept to two characters — the margin is 3ch wide and the marks are set in the pixel face.
 */
/**
 * Is line `n` a setext underline — a row of `=` or `-` with paragraph text directly above it?
 * The line above has to be ordinary prose: blank, and there is nothing to underline; a heading,
 * a quote, a list, a fence or a table row, and it opened its own block that the dashes cannot
 * retitle. This mirrors what the block parser does when a paragraph runs into an underline.
 */
function setextUnder(lines: string[], n: number): boolean {
	if (n === 0 || !RE_SETEXT.test(lines[n])) return false;
	const above = lines[n - 1];
	return !isBlank(above) && !startsBlock(above) && !/^[ \t]*\|/.test(above);
}

export function lineMarks(src: string): string[] {
	const lines = src.split('\n');
	const marks: string[] = [];
	let inFence = false;
	let fenceMark = '';

	for (const [n, line] of lines.entries()) {
		const fence = line.match(RE_FENCE);
		if (fence) {
			if (!inFence) {
				inFence = true;
				fenceMark = fence[1][0];
				marks.push('<>');
			} else if (fence[1][0] === fenceMark) {
				inFence = false;
				marks.push('<>');
			} else {
				marks.push('');
			}
			continue;
		}
		if (inFence) {
			marks.push('');
			continue;
		}
		const heading = line.match(/^ {0,3}(#{1,6})(?:[ \t]|$)/);
		if (heading) marks.push(`H${heading[1].length}`);
		// A SETEXT underline, which is the one mark that needs to look at its neighbour. Everything
		// else here is decided by the line alone — deliberately, so the margin follows the caret
		// rather than the parse — but a row of dashes is a rule or a heading depending entirely on
		// whether there are words directly above it, and marking it `--` when it is really an H2
		// would be the margin telling the writer the opposite of what the proof is about to show.
		// The UNDERLINE carries the mark, not the words above it: the mark names what the line IS,
		// and this line is the thing that makes a heading a heading.
		else if (setextUnder(lines, n))
			marks.push(lines[n][lines[n].search(/\S/)] === '=' ? 'H1' : 'H2');
		else if (RE_HR.test(line)) marks.push('--');
		else if (RE_QUOTE.test(line)) marks.push('>');
		else if (RE_UL.test(line)) marks.push('*');
		else if (RE_OL.test(line)) marks.push(`${line.match(RE_OL)![2].slice(-1)}.`);
		else if (/^[ \t]*\|/.test(line)) marks.push('|');
		else marks.push('');
	}
	return marks;
}
