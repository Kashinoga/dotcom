// The Markdown engine behind Text Editor. Pure functions over strings, so this runs under plain
// `node --test` with no browser and no harness.
//
// Two halves. The first is the grammar — one test per construct the app claims to support, so a
// regex tightened for one of them cannot quietly break another. The second is SAFETY, and it is
// the half that matters: the engine's output goes to {@html}, so every one of these is a claim
// that a specific attack does not survive the round trip. Add to it before touching escapeHtml,
// safeUrl, or the order of the inline pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, tally, lineMarks } from '../src/lib/markdown.ts';

const md = renderMarkdown;

// ── Grammar ───────────────────────────────────────────────────────────────────

test('headings carry their level and an anchor id', () => {
	assert.equal(md('# Title'), '<h1 id="title">Title</h1>');
	assert.equal(md('### Deep Cut'), '<h3 id="deep-cut">Deep Cut</h3>');
	// Closing hashes are decoration, not content.
	assert.equal(md('## Middle ##'), '<h2 id="middle">Middle</h2>');
	// Seven is not a level — it falls through to a paragraph.
	assert.match(md('####### Nope'), /^<p>/);
});

test('a heading needs a space after its hashes', () => {
	assert.equal(md('#tag'), '<p>#tag</p>');
});

test('emphasis, strong, strike and code spans', () => {
	assert.equal(
		md('*a* **b** ~~c~~ `d`'),
		'<p><em>a</em> <strong>b</strong> <del>c</del> <code>d</code></p>'
	);
	assert.equal(md('_a_ __b__'), '<p><em>a</em> <strong>b</strong></p>');
});

test('underscores inside a word are left alone', () => {
	// The whole reason `_` emphasis needs a boundary on both sides.
	assert.equal(md('call snake_case_name here'), '<p>call snake_case_name here</p>');
});

test('a code span protects what is inside it', () => {
	assert.equal(md('`**not bold**`'), '<p><code>**not bold**</code></p>');
	assert.equal(md('`[not](a-link)`'), '<p><code>[not](a-link)</code></p>');
});

test('links and images', () => {
	assert.equal(md('[home](/about)'), '<p><a href="/about">home</a></p>');
	assert.equal(md('![a cat](/cat.png)'), '<p><img src="/cat.png" alt="a cat" loading="lazy"></p>');
	// An outbound link is marked as one; a relative one is not.
	assert.match(md('[out](https://example.com)'), /target="_blank" rel="noopener noreferrer"/);
	assert.doesNotMatch(md('[in](/here)'), /target=/);
});

test('an image is not mistaken for a link', () => {
	// Link-first ordering would leave a stray "!" in front of an <a>.
	assert.doesNotMatch(md('![alt](/x.png)'), /<a /);
	assert.doesNotMatch(md('![alt](/x.png)'), /^<p>!/);
});

test('horizontal rules, in each of their spellings', () => {
	assert.equal(md('---'), '<hr>');
	assert.equal(md('***'), '<hr>');
	assert.equal(md('- - -'), '<hr>');
});

test('a tight list drops the paragraph round each item', () => {
	assert.equal(md('- one\n- two'), '<ul><li>one</li><li>two</li></ul>');
	assert.equal(md('1. one\n2. two'), '<ol><li>one</li><li>two</li></ol>');
});

test('an ordered list that does not start at one says so', () => {
	assert.match(md('3. three\n4. four'), /^<ol start="3">/);
});

test('a loose list keeps its paragraphs', () => {
	const html = md('- one\n\n- two');
	assert.match(html, /<li><p>one<\/p><\/li>/);
});

test('lists nest through the same code path', () => {
	const html = md('- outer\n  - inner');
	assert.match(html, /<ul><li>outer<ul><li>inner<\/li><\/ul><\/li><\/ul>/);
});

test('blockquotes recurse, so a quote can hold real blocks', () => {
	assert.equal(md('> quoted'), '<blockquote><p>quoted</p></blockquote>');
	assert.match(md('> # heading'), /<blockquote><h1 id="heading">heading<\/h1><\/blockquote>/);
	assert.match(md('> - a\n> - b'), /<blockquote><ul><li>a<\/li><li>b<\/li><\/ul><\/blockquote>/);
});

test('a blockquote survives escaping', () => {
	// The regression this guards: escaping ">" to &gt; before the block pass would have made
	// every blockquote on the site a paragraph, silently.
	assert.match(md('> still a quote'), /^<blockquote>/);
});

test('fenced code is verbatim — no inline pass inside it', () => {
	assert.equal(md('```\n**stars**\n```'), '<pre><code>**stars**</code></pre>');
	assert.match(md('```js\nlet a = 1;\n```'), /<code class="language-js">/);
	assert.equal(md('~~~\nx\n~~~'), '<pre><code>x</code></pre>');
});

test('an unclosed fence runs to the end rather than falling apart', () => {
	assert.equal(md('```\nhalf typed'), '<pre><code>half typed</code></pre>');
});

test('a fence keeps its own hashes and dashes out of the block parser', () => {
	assert.equal(
		md('```\n# not a heading\n---\n```'),
		'<pre><code># not a heading\n---</code></pre>'
	);
});

test('tables need their rule row', () => {
	const html = md('| a | b |\n|---|---|\n| 1 | 2 |');
	assert.match(html, /<table><thead><tr><th>a<\/th><th>b<\/th><\/tr><\/thead>/);
	assert.match(html, /<tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody>/);
	// Without the rule row it is only a paragraph with pipes in it.
	assert.match(md('| a | b |'), /^<p>/);
});

test('table alignment comes off the rule row', () => {
	const html = md('| l | c | r |\n|:--|:-:|--:|\n| 1 | 2 | 3 |');
	assert.match(html, /<th style="text-align:left">l<\/th>/);
	assert.match(html, /<th style="text-align:center">c<\/th>/);
	assert.match(html, /<th style="text-align:right">r<\/th>/);
});

test('a short table row is padded, not dropped', () => {
	const html = md('| a | b |\n|---|---|\n| 1 |');
	assert.match(html, /<td>1<\/td><td><\/td>/);
});

test('a paragraph stops where a block starts', () => {
	assert.equal(md('text\n# head'), '<p>text</p><h1 id="head">head</h1>');
});

test('two trailing spaces are a hard break; one is not', () => {
	assert.equal(md('a  \nb'), '<p>a<br>\nb</p>');
	assert.equal(md('a\nb'), '<p>a\nb</p>');
	assert.equal(md('a\\\nb'), '<p>a<br>\nb</p>');
});

test('an empty document renders nothing at all', () => {
	assert.equal(md(''), '');
	assert.equal(md('   \n\n  '), '');
});

test('CRLF input parses the same as LF', () => {
	assert.equal(md('# a\r\n\r\ntext'), md('# a\n\ntext'));
});

// ── Safety ────────────────────────────────────────────────────────────────────
// The output is handed to {@html}. Each of these is a claim about a specific attack.

test('raw HTML in the source prints as text and never as markup', () => {
	// Note the asymmetry: "<" is escaped, ">" is not, and that is on purpose (see escapeHtml).
	// With every "<" escaped there is no way to open a tag, so a bare ">" is just the character —
	// and leaving it alone is what keeps blockquotes parseable.
	assert.equal(md('<script>alert(1)</script>'), '<p>&lt;script>alert(1)&lt;/script></p>');
	assert.equal(md('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)></p>');
});

test('an ampersand is escaped exactly once', () => {
	// Double-escaping would print "&amp;amp;" on screen; escaping zero times reopens entities.
	assert.equal(md('a & b'), '<p>a &amp; b</p>');
	assert.equal(md('&amp;'), '<p>&amp;amp;</p>');
});

test('a javascript: link is defused', () => {
	assert.equal(md('[x](javascript:alert)'), '<p><a href="#">x</a></p>');
	assert.match(md('[x](javascript:alert(1))'), /href="#"/);
	assert.match(md('[x](JaVaScRiPt:alert)'), /href="#"/);
	assert.match(md('[x](vbscript:msgbox)'), /href="#"/);
});

test('a scheme obfuscated with control characters or entities is still defused', () => {
	// Three different defences, at three different depths, and the test says which is which.
	// A tab fails the link pattern outright, so no anchor is emitted at all.
	assert.doesNotMatch(md('[x](java\tscript:alert)'), /<a /);
	// Another C0 character DOES pass the pattern — and is stripped by safeUrl, which then reads
	// the scheme underneath and refuses it. This is the arm that is doing live work.
	// (Built with fromCharCode rather than typed, so this file stays printable.)
	const soh = String.fromCharCode(1);
	assert.match(md(`[x](java${soh}script:alert)`), /href="#"/);
	// The entity form never even gets that far: escapeHtml has already turned "&" into "&amp;",
	// so what lands in the attribute is the literal text "java&#9;script:" — not a scheme at
	// all, because "&" cannot appear in one. Inert, and emitted as-is.
	assert.equal(md('[x](java&#9;script:alert)'), '<p><a href="java&amp;#9;script:alert">x</a></p>');
});

test('data: URLs are allowed only as inline images', () => {
	assert.match(md('[x](data:text/html;base64,PHN2Zz4=)'), /href="#"/);
	assert.match(md('![x](data:image/png;base64,iVBORw0KGgo=)'), /src="data:image\/png;base64,/);
});

test('an unknown scheme is not trusted', () => {
	assert.match(md('[x](chrome-extension://abc/page.html)'), /href="#"/);
});

test('relative paths, fragments and mail links pass through', () => {
	assert.match(md('[x](/apps/weather)'), /href="\/apps\/weather"/);
	assert.match(md('[x](#section)'), /href="#section"/);
	assert.match(md('[x](mailto:a@b.co)'), /href="mailto:a@b\.co"/);
});

test('a quote cannot break out of an attribute', () => {
	// The payload is still THERE — as text, inside the alt. What matters is that every quote in
	// it is an entity, so the attribute cannot be closed early and `onload` never becomes an
	// attribute of its own. Asserting the whole tag is the honest check: it says exactly which
	// attributes the element ended up with.
	assert.equal(
		md('![" onload="alert(1)](/x.png)'),
		'<p><img src="/x.png" alt="&quot; onload=&quot;alert(1)" loading="lazy"></p>'
	);
});

test('the code-span sentinel cannot be forged from the source', () => {
	// A source that types the placeholder shape must not be able to swap itself for a stored
	// span — the sentinel is a NUL, which no keyboard produces and escapeHtml leaves alone.
	const html = md(' 0  and `real`');
	assert.match(html, /<code>real<\/code>/);
});

// ── The running foot and the margin ───────────────────────────────────────────

test('the tally counts lines, words, characters and reading time', () => {
	assert.deepEqual(tally(''), { lines: 0, words: 0, chars: 0, minutes: 0 });
	assert.deepEqual(tally('one two\nthree'), { lines: 2, words: 3, chars: 13, minutes: 1 });
	// 220 words a minute, rounded up.
	assert.equal(tally('w '.repeat(221)).minutes, 2);
});

test('the margin marks each source line by what it opens', () => {
	assert.deepEqual(lineMarks('# a\n\n- b\n> c\n1. d\n---\n| e |'), [
		'H1',
		'',
		'*',
		'>',
		'1.',
		'--',
		'|'
	]);
});

test('the margin goes quiet inside a fence', () => {
	// Otherwise every "#" in a shell snippet would claim to be a heading.
	assert.deepEqual(lineMarks('```sh\n# a comment\n- not a list\n```'), ['<>', '', '', '<>']);
});

test('the margin marks a heading before its text is typed', () => {
	// The margin follows the caret, not the parse: "## " is an H2 the moment it is typed.
	assert.deepEqual(lineMarks('## '), ['H2']);
});
