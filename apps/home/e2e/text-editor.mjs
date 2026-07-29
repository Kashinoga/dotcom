// Text Editor — the editing gestures, the margin, the proof and the tally.
//
// This suite exists because almost nothing in Text Editor can be checked without a browser. The
// Markdown engine itself is pure and is covered by `node --test` (test/markdown.test.ts, 40-odd
// cases); what is left is everything the engine does not touch — what a mark key does to a
// selection, whether Enter carries a list, whether undo survives, and above all whether the
// MIRROR still wraps in step with the textarea it sits under, which is a claim about the browser's
// line-breaking and cannot be asserted any other way.
//
// Two things about driving a textarea from Playwright, both learned the hard way here:
//
//   • Modifiers go through ControlOrMeta, never Control. On macOS a bare Control+A in a textarea
//     is "move to the start of the line", so a suite written with Control selects nothing, and
//     every case quietly appends to whatever the case before it left on the sheet. The failures
//     look like editor bugs and are not.
//   • Home does not move the caret in a textarea on macOS either. Where a case needs the caret at
//     a known offset it is set outright with setSelectionRange, so the case tests the editor
//     rather than the platform's idea of a Home key.

import { chromium } from 'playwright';

const B = process.env.BASE || 'http://localhost:5199';
const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  — got: ' + detail : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// The editor keeps its document in localStorage, so a suite that did not clear it would be
// driving whatever the last run left behind the moment it re-navigated.
await page.addInitScript(() => {
	try {
		localStorage.removeItem('ksh:text-editor:v1');
		localStorage.removeItem('ksh:text-editor:v1:mode');
		// The measure is a stored setting too, and the case asserting it is ON BY DEFAULT would
		// read a previous run's leftover rather than the default it means to test.
		localStorage.removeItem('ksh:text-editor:v1:measure');
	} catch {
		/* storage off — the editor copes, and so does this */
	}
});
await page.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
await page.waitForSelector('.te-type');

const ta = page.locator('.te-type');
const key = (k) => page.keyboard.press(k);
const press = (name) => page.getByRole('button', { name }).click();
const selectAll = () => key('ControlOrMeta+a');

/** Put an exact document on the sheet, focused, caret at the end. */
async function reset(to = '') {
	await ta.fill(to);
	await ta.focus();
	await ta.evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
}

async function eq(name, got, want) {
	const g = await got;
	ok(name, g === want, JSON.stringify(g));
}

const value = () => ta.inputValue();

// ── The place opens full-viewport at all ─────────────────────────────────────
// `dense` chrome puts it through the stage's full-viewport path. This is the assertion that
// catches it silently opening at the 680px side-panel width instead — which is exactly what it
// did until the force-expand set stopped being a hand-written list of codes and started asking
// FULL_APPS (see applyView in the catch-all page).
{
	const wide = await page.evaluate(() => {
		const el = document.querySelector('.te');
		return el ? el.getBoundingClientRect().width : 0;
	});
	ok('the editor takes the viewport, not the side panel', wide > 1000, `${Math.round(wide)}px`);
	// The bar carries NO name — it is spent entirely on the keys. The tab, the URL and the
	// favicon already say where you are, and a dense bar has one row to give.
	ok('the bar carries no title', (await page.locator('.head-title').count()) === 0);
	ok('the bar carries the rack instead', await page.locator('.head-row .te-rack').isVisible());
	// The corner holds two keys now — Home and About — so this asks for Home by name rather than
	// for "the icon button", which stopped being one element the moment About arrived.
	ok(
		'and offers the way out',
		await page.getByRole('button', { name: 'Close and go home' }).isVisible()
	);
	// Every key the app has is in that one bar row, and nothing is left in the body. Counted by
	// CLASS rather than by container: the keys live in two clusters now — the scrolling strip and
	// the fixed right-hand tail beside Home — and `.tb` is what they share. Home is `.icon-btn`,
	// so it is not among them.
	ok(
		'every key is in the bar',
		(await page.locator('.head-row .tb').count()) === 18,
		`${await page.locator('.head-row .tb').count()}`
	);
	// The document keys sit at the RIGHT END, parted from Home by a rule: they act on the file
	// rather than on the text, and they must not be able to scroll out of reach with the strip.
	{
		const geo = await page.evaluate(() => {
			const left = (s) =>
				[...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect().left);
			const seps = left('.te-tail .te-sep');
			return {
				lead: left('.te-lead .tb'),
				leadSep: left('.te-lead .te-sep')[0],
				marks: left('.te-rack .te-mark-key'),
				view: left('.te-tail [aria-label="View"] .tb'),
				doc: left('.te-tail [aria-label="The document"] .tb'),
				lastSep: seps[seps.length - 1],
				home: left('.head-actions .icon-btn')[0]
			};
		});
		// Left to right, the bar tells the order of the work: bring a document in, mark it up,
		// choose how to look at it, then take it away.
		ok(
			'the file keys lead the bar, with a rule on their right',
			Math.max(...geo.lead) < geo.leadSep && geo.leadSep < Math.min(...geo.marks),
			JSON.stringify(geo)
		);
		ok(
			'the marks come next, in the only part that scrolls',
			Math.max(...geo.marks) < Math.min(...geo.view),
			JSON.stringify(geo)
		);
		ok(
			'then the view keys, then the document keys',
			Math.max(...geo.view) < Math.min(...geo.doc),
			JSON.stringify(geo)
		);
		ok(
			'with a rule between the document keys and Home',
			Math.max(...geo.doc) < geo.lastSep && geo.lastSep < geo.home,
			JSON.stringify(geo)
		);
	}
	// No KEYS in the body — counted by the key class, not by "any button". The contents rail's
	// links and the workspace's rows are buttons too, and they belong there; what must not be in
	// the body is a second copy of the bar's controls.
	// The WORKSPACE's own three keys are in the body, and belong there — they act on the pane
	// rather than on the document, and the pane is a column of the desk. What must not be in the
	// body is a second copy of the BAR's controls, which is what this counts.
	ok(
		'and none of the bar’s are left in the body',
		(await page.locator('.te .tb:not(.te-work-act)').count()) === 0,
		`${await page.locator('.te .tb:not(.te-work-act)').count()}`
	);
	// The row must not have wrapped: the body reserves a fixed one-row height, so a second row
	// would sit on top of the document's first lines.
	{
		const rows = await page.evaluate(() => {
			const keys = [...document.querySelectorAll('.head-row .te-rack button')];
			return new Set(keys.map((k) => Math.round(k.getBoundingClientRect().top))).size;
		});
		ok('the bar stays one row', rows === 1, `${rows} rows`);
	}
}

// ── The mark keys ────────────────────────────────────────────────────────────
await reset('hello world');
await selectAll();
await press('Bold (⌘B)');
await eq('B wraps the selection', value(), '**hello world**');
await press('Bold (⌘B)');
await eq('B again unwraps it', value(), 'hello world');

await reset('');
await press('Italic (⌘I)');
await ta.type('mid');
await eq('a key with nothing selected leaves the caret between its marks', value(), '*mid*');

// The six levels live behind one key now: two of them in the bar was an arbitrary place to stop.
const setHeading = async (level) => {
	await page.getByRole('button', { name: 'Heading level' }).first().click();
	await page.waitForTimeout(150);
	await page
		.getByRole('menuitem', { name: `Heading ${level}`, exact: false })
		.first()
		.click();
	await page.waitForTimeout(200);
};
await reset('a title');
await setHeading(1);
await eq('the menu sets a first-level heading', value(), '# a title');
await setHeading(3);
await eq('and a level REPLACES the one there rather than nesting', value(), '### a title');
await setHeading(6);
await eq('all six levels are offered', value(), '###### a title');
await setHeading(6);
await eq('asking for the level a line already has takes it off', value(), 'a title');
await setHeading(2);
await page.getByRole('button', { name: 'Heading level' }).first().click();
await page.waitForTimeout(150);
await page.getByRole('menuitem', { name: 'No heading' }).click();
await page.waitForTimeout(200);
await eq('and No heading strips it outright', value(), 'a title');

await reset('the docs');
await selectAll();
await press('Link (⌘K)');
await ta.type('/about');
await eq('the link key parks the caret in the target', value(), '[the docs](/about)');

// ── The keyboard ─────────────────────────────────────────────────────────────
await reset('x');
await selectAll();
await key('ControlOrMeta+b');
await eq('cmd-B is the same verb as the key', value(), '**x**');

await reset('word');
await selectAll();
await press('Bold (⌘B)');
await key('ControlOrMeta+z');
// The reason every edit goes through execCommand rather than assigning .value. If this fails,
// the editor has lost its undo stack and the fix is in `write`, not here.
await eq('undo puts back what a mark key changed', value(), 'word');

await reset('- one');
await key('Enter');
await ta.type('two');
await eq('Enter carries a bullet on', value(), '- one\n- two');
await key('Enter');
await key('Enter');
await eq('Enter on an empty item ends the list', value(), '- one\n- two\n');

await reset('3. three');
await key('Enter');
await ta.type('four');
await eq('an ordered list steps its number', value(), '3. three\n4. four');

await reset('- a');
await ta.evaluate((el) => el.setSelectionRange(0, 0)); // see the note at the top about Home
await key('Tab');
await eq('Tab indents', value(), '  - a');
await key('Shift+Tab');
await eq('Shift-Tab dedents', value(), '- a');

// ── The margin, the proof and the tally ──────────────────────────────────────
await reset('# head\n\n- one\n- two\n\n> quoted');
await page.waitForTimeout(150);
await eq(
	'the margin marks each line by what it opens',
	page.$$eval('.te-mline', (ls) =>
		ls.map((l) => l.querySelector('.te-margin-mark')?.textContent ?? '').join('|')
	),
	'H1||*|*||>'
);
await eq(
	'the proof sets what was typed',
	page.$eval('.te-proof', (el) => el.innerHTML.replace(/<!--[\s\S]*?-->/g, '').trim()),
	'<h1 id="head">head</h1><ul><li>one</li><li>two</li></ul><blockquote><p>quoted</p></blockquote>'
);
await eq(
	'the running foot counts the document',
	page.$eval('.te-tally', (el) => el.textContent.replace(/\s+/g, ' ').trim()),
	'Lines 0006 Words 0008 Chars 0029 Read 0001 min'
);

// ── THE MIRROR ───────────────────────────────────────────────────────────────
// The one assertion this suite is really for. Source line 1 must land where the textarea puts
// it, which after a 400-character line 0 is several rows down — not at visual row 2. If the two
// stop sharing their typography block, this is what notices.
await reset('x'.repeat(400) + '\nsecond line');
await key('ControlOrMeta+ArrowDown');
await page.waitForTimeout(150);
await eq(
	'the lit line is the caret’s SOURCE line, not its visual row',
	page.$$eval('.te-mline', (ls) => ls.findIndex((l) => l.classList.contains('te-here'))),
	1
);
{
	const drop = await page.evaluate(() => {
		const lines = [...document.querySelectorAll('.te-mline')];
		const mirror = document.querySelector('.te-mirror');
		return Math.round(lines[1].getBoundingClientRect().top - mirror.getBoundingClientRect().top);
	});
	ok('the mirror wraps in step with the textarea', drop > 60, `line 1 sits ${drop}px down`);
}

// ── The margin marks sit on their lines ──────────────────────────────────────
// Two claims, and the second is the one that took three goes to get right.
//
// The mark is out of flow (it has to be — in flow it would join the first row's text and change
// the very wrap it exists to annotate), so it inherits no baseline from the line. Two typefaces
// at two sizes never share a baseline unless they share a line box, and these cannot. The mark's
// box is therefore stretched over the WHOLE logical line and its glyph centred in that, which is
// both what a copy-editor does — the annotation belongs to the line, not to its first row — and
// the only placement that does not depend on either face's metrics.
await reset('- a\n' + '# ' + 'w '.repeat(90) + '\n> q');
await page.waitForTimeout(200);
{
	const marks = await page.evaluate(() => {
		const row = 25.5; // one visual row: --te-type-size * --te-leading
		const out = [];
		for (const l of document.querySelectorAll('.te-mline')) {
			const m = l.querySelector('.te-margin-mark');
			if (!m) continue;
			const lb = l.getBoundingClientRect();
			const mb = m.getBoundingClientRect();
			out.push({
				mark: m.textContent,
				rows: Math.round(lb.height / row),
				delta: +(mb.top + mb.height / 2 - (lb.top + lb.height / 2)).toFixed(2)
			});
		}
		return out;
	});
	ok(
		'every mark centres on its own line',
		marks.length > 0 && marks.every((m) => Math.abs(m.delta) < 0.5),
		JSON.stringify(marks)
	);
	// The heading here is 180 characters, so it MUST have wrapped — if it did not, the case
	// above proved nothing about multi-row lines and this says so rather than passing quietly.
	const wrapped = marks.find((m) => m.rows > 1);
	ok(
		'a wrapped line carries its mark against the middle of the whole block',
		!!wrapped && Math.abs(wrapped.delta) < 0.5,
		JSON.stringify(marks)
	);
}

// ── Clearing asks first ──────────────────────────────────────────────────────
await reset('keep me');
const clear = page.getByRole('button', { name: /Clear|Sure/ });
await clear.click();
await eq('the first press arms rather than clears', value(), 'keep me');
await eq(
	'the key becomes the question',
	clear.textContent().then((t) => t.trim()),
	'Sure?'
);
await clear.click();
await eq('the second press clears the sheet', value(), '');

// ── The About key ────────────────────────────────────────────────────────────
// It puts the app's own manual page back on the sheet — the document a first visit opens with,
// and the only documentation this app has. It stands with Home in the bar's right-hand corner
// rather than in the rack, because it is the panel's chrome: every key in the rack acts on the
// document, and this one replaces it.
{
	const about = page.getByRole('button', { name: /^About Text Editor/ });
	ok('the bar offers an About key', (await about.count()) === 1);

	// Typed, not filled: this case is about the UNDO stack, and `reset` sets the value outright.
	await ta.click();
	await selectAll();
	await page.keyboard.type('scribble');
	await about.click();
	const doc = await value();
	ok(
		'it opens with the manual page',
		doc.startsWith('# Text Editor\n'),
		JSON.stringify(doc.slice(0, 20))
	);
	ok(
		'and the whole of it, not just the title',
		doc.includes('## The marks') && doc.includes('```js')
	);
	await eq(
		'the caret is put at the top, so it reads from the start',
		ta.evaluate((el) => el.selectionStart),
		0
	);
	ok(
		'the proof sets it',
		(await page.locator('.te-proof h1').first().innerText()) === 'Text Editor'
	);

	// The whole reason it does not have to ask the way Clear does.
	await ta.click();
	await key('ControlOrMeta+z');
	await eq('one undo brings back what was on the sheet', value(), 'scribble');

	await about.click();

	// Order in the corner: out, then about, then the tag. Read left to right, the door comes first.
	const corner = await page.evaluate(() =>
		[...document.querySelectorAll('.surface-head .head-actions > *')].map(
			(el) => el.getAttribute('aria-label') ?? el.className.split(' ')[0]
		)
	);
	ok(
		'it sits to the right of Home, before the beta tag',
		corner.length === 3 &&
			/home/i.test(corner[0]) &&
			/^About/.test(corner[1]) &&
			/is in beta/.test(corner[2]),
		JSON.stringify(corner)
	);

	// ── THE BETA TAG ─────────────────────────────────────────────────────────
	// It was a label with nothing to press. It has something to say now — the version, what the
	// four numbers mean, and what landed recently — so it is a button that opens a card.
	{
		const tag = page.getByRole('button', { name: /is in beta/ });
		ok(
			'the tag says which version this is',
			/v0\.\d+\.\d+\.\d+/.test(await tag.getAttribute('aria-label')),
			await tag.getAttribute('aria-label')
		);
		ok('and is shut to begin with', (await tag.getAttribute('aria-expanded')) === 'false');
		await tag.click();
		await page.waitForTimeout(300);
		ok('pressing it opens the version card', (await page.locator('.beta-card').count()) === 1);
		ok(
			'which carries all four positions',
			/^v0\.\d+\.\d+\.\d+$/.test((await page.locator('.beta-ver').textContent()).trim()),
			await page.locator('.beta-ver').textContent()
		);
		// The legend is what makes the number readable, and it has to name every position it
		// explains — a fourth figure with three words under it is worse than no legend at all.
		const scheme = (await page.locator('.beta-scheme').textContent()).trim();
		ok(
			'and a legend naming each of the four in order',
			scheme === 'collections · features · fixes · commits',
			JSON.stringify(scheme)
		);
		// Every line of the list carries the WHOLE version it landed in. Several features land in
		// one minor, so a column keyed on the first two numbers is a column of identical `0.8`s.
		const ats = await page.locator('.beta-at').allTextContents();
		ok(
			'and every recent line is dated to a full version',
			ats.length > 0 && ats.every((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a.trim())),
			JSON.stringify(ats)
		);
		// The column has to hold the whole version on ONE line: the list is read down the
		// figures, and a version that wraps takes its line's text with it.
		const wrapped = await page.evaluate(() =>
			[...document.querySelectorAll('.beta-at')].some((el) => el.scrollWidth > el.clientWidth + 1)
		);
		ok('the version column is wide enough for the fourth figure', !wrapped);
		// The card is a POPOVER — puhig's shared one, the same surface the workspace's row menu
		// uses. Portalled to <body>, because `position: fixed` inside the panel's header is fixed
		// to the header rather than to the window and the app painted straight over it.
		ok(
			'the card is portalled clear of the panel',
			await page.evaluate(
				() => document.querySelector('.beta-card')?.parentElement === document.body
			)
		);
		await page.keyboard.press('Escape');
		await page.waitForTimeout(250);
		ok('Escape shuts the card', (await page.locator('.beta-card').count()) === 0);
		ok('and leaves the editor open behind it', (await page.locator('.te').count()) === 1);
	}
}

// ── THE CARET ────────────────────────────────────────────────────────────────
// The editor draws its own. A textarea's native caret is sized by the FONT — the full ascent and
// descent, 22px for Space Mono at 15px — against an 11px cap band, so on this sheet's 26px rows
// it towered over the letters and started well above their tops. CSS has no lever for the size,
// only the colour, so the native one is hidden on fine pointers and this one takes its place.
await reset('# Text Editor\nsecond line here');
await ta.evaluate((el) => el.setSelectionRange(9, 9));
await page.dispatchEvent('.te-type', 'select');
await page.waitForTimeout(150);
{
	const m = await page.evaluate(() => {
		const c = document.querySelector('.te-caret');
		const ta = document.querySelector('.te-type');
		const cs = getComputedStyle(ta);
		if (!c) return { drawn: false };
		const cr = c.getBoundingClientRect();
		const line = document.querySelectorAll('.te-mline')[0].getBoundingClientRect();
		return {
			drawn: true,
			nativeHidden: getComputedStyle(ta).caretColor === 'rgba(0, 0, 0, 0)',
			h: +cr.height.toFixed(1),
			row: parseFloat(cs.lineHeight),
			font: parseFloat(cs.fontSize),
			// Where the caret sits inside its row, and where the row is.
			offsetInRow: +(cr.top - line.top).toFixed(1),
			centredInRow: +(cr.top + cr.height / 2 - (line.top + parseFloat(cs.lineHeight) / 2)).toFixed(
				2
			)
		};
	});
	ok('the editor draws its own caret', m.drawn, JSON.stringify(m));
	ok('and the browser is told not to draw one', m.nativeHidden, JSON.stringify(m));
	// The point of the exercise: SHORTER than the row, and about the height of the type. The
	// native caret was 22px on a 26px row; anything back near that has regressed.
	ok(
		'the caret is sized to the type, not to the face’s full ascent and descent',
		m.h < m.row * 0.75 && m.h >= m.font * 0.9 && m.h <= m.font * 1.2,
		`${m.h}px caret, ${m.font}px type, ${m.row}px row`
	);
	ok('and is centred in its row', Math.abs(m.centredInRow) < 0.6, `${m.centredInRow}px off`);
}

// It goes where the caret goes. On a monospace face the x is arithmetic: N characters along the
// line is N advances from the line's left edge, so this checks the POSITION and not merely that
// something moved.
{
	const step = await page.evaluate(async () => {
		const ta = document.querySelector('.te-type');
		const at = (n) => {
			ta.setSelectionRange(n, n);
			ta.dispatchEvent(new Event('select'));
		};
		const x = () => document.querySelector('.te-caret')?.getBoundingClientRect().left ?? null;
		at(0);
		await new Promise((r) => setTimeout(r, 80));
		const x0 = x();
		at(10);
		await new Promise((r) => setTimeout(r, 80));
		const x10 = x();
		// One character's advance, measured from the page itself.
		const probe = document.createElement('span');
		const cs = getComputedStyle(ta);
		probe.style.cssText = `position:absolute;left:-9999px;white-space:pre;font:${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily};letter-spacing:${cs.letterSpacing}`;
		probe.textContent = '0123456789';
		document.body.appendChild(probe);
		const ten = probe.getBoundingClientRect().width;
		probe.remove();
		return {
			x0,
			x10,
			ten: +ten.toFixed(2),
			moved: x10 === null || x0 === null ? null : +(x10 - x0).toFixed(2)
		};
	});
	ok(
		'the caret lands where the tenth character does',
		step.moved !== null && Math.abs(step.moved - step.ten) < 1.5,
		JSON.stringify(step)
	);
}

// A BLANK line still has a caret, and this is the case that was missing. A blank line's text
// node is empty, so a collapsed range inside it reports a zero-height rect — which is not a
// failure to measure, it is the correct answer for a line with nothing in it. Reading it as a
// failure left every empty line in the document with no caret at all.
await reset('first\n\n\nlast');
{
	const seen = [];
	for (const [n, at] of [
		['line 0, has text', 2],
		['line 1, blank', 6],
		['line 2, blank', 7],
		['line 3, has text', 8]
	]) {
		await page.evaluate((pos) => {
			const ta = document.querySelector('.te-type');
			ta.focus();
			ta.setSelectionRange(pos, pos);
			ta.dispatchEvent(new Event('select'));
		}, at);
		await page.waitForTimeout(90);
		const r = await page.evaluate(() => {
			const c = document.querySelector('.te-caret');
			if (!c) return null;
			const cr = c.getBoundingClientRect();
			const stack = document.querySelector('.te-stack').getBoundingClientRect();
			return { top: +(cr.top - stack.top).toFixed(1), left: +(cr.left - stack.left).toFixed(1) };
		});
		seen.push({ n, r });
	}
	ok(
		'every line has a caret, blank ones included',
		seen.every((s) => s.r !== null),
		JSON.stringify(seen)
	);
	// A blank line's caret sits at the same x as the first character of a line that has one, and
	// steps down by exactly one row per line.
	const rowPx = await page.evaluate(() =>
		parseFloat(getComputedStyle(document.querySelector('.te-mirror')).lineHeight)
	);
	const tops = seen.map((s) => s.r?.top ?? NaN);
	ok(
		'and each blank line’s caret is one row below the last',
		Math.abs(tops[1] - tops[0] - rowPx) < 0.6 && Math.abs(tops[2] - tops[1] - rowPx) < 0.6,
		JSON.stringify({ tops, rowPx })
	);
	const lefts = seen.map((s) => s.r?.left ?? NaN);
	ok(
		'and sits at the line’s left edge, where its first character would be',
		Math.abs(lefts[1] - lefts[3]) < 0.6 && Math.abs(lefts[2] - lefts[3]) < 0.6,
		JSON.stringify(lefts)
	);
}

// ── OPENING ──────────────────────────────────────────────────────────────────
// A file, and a folder of them. `webkitdirectory` is a prefixed de-facto standard rather than a
// specified one, so what the picker LOOKS like is the platform's business — but what it hands
// back, and what the editor does with it, is ours and is testable.
{
	const dir = await import('node:fs');
	const os = await import('node:os');
	const path = await import('node:path');
	const folder = dir.mkdtempSync(path.join(os.tmpdir(), 'te-e2e-'));
	dir.writeFileSync(path.join(folder, 'alpha.md'), '# Alpha\n\nFirst note.');
	dir.writeFileSync(path.join(folder, 'beta.markdown'), '# Beta\n\nSecond note.');
	dir.writeFileSync(path.join(folder, 'notes.txt'), 'plain text note');
	// Not openable — a Markdown editor handed a binary would put mojibake on the sheet.
	dir.writeFileSync(path.join(folder, 'ignore.png'), 'not text at all');
	dir.mkdirSync(path.join(folder, 'sub'));
	dir.writeFileSync(path.join(folder, 'sub', 'gamma.md'), '# Gamma\n\nNested.');

	await reset('the sheet as it was');
	await page.setInputFiles('.te-picker >> nth=0', path.join(folder, 'alpha.md'));
	await page.waitForTimeout(400);
	await eq('opening a file puts it on the sheet', value(), '# Alpha\n\nFirst note.');
	ok(
		'and the running foot names it',
		(await page.locator('.te-lamp').textContent()).trim() === 'alpha.md'
	);

	// The reason opening does not have to ask first: it goes through the same `write` every other
	// edit does, so the document it replaced is one Cmd-Z away.
	await ta.focus();
	await key('ControlOrMeta+z');
	await page.waitForTimeout(250);
	await eq('and opening the wrong one is undoable', value(), 'the sheet as it was');

	// ── THE WORKSPACE ────────────────────────────────────────────────────────
	// A folder opened ALONGSIDE the document, the way an editor keeps one — not a picker that
	// appears and goes. Picking from it leaves it standing; that is the difference.
	await page.setInputFiles('.te-picker >> nth=1', folder);
	await page.waitForTimeout(500);
	// The tree's own rows. There is a SECOND list in this pane now — the shelf above it — and both
	// draw `.te-work-file`, so every claim about the tree has to say which list it means.
	const TREE = '.te-work-list:not(.te-loose-list)';
	// A TREE, not a path list: sub-folders are rows of their own, folders before documents, and
	// what is inside one is indented under it rather than spelled out as a path on every line.
	// The folder's own name is stripped from the paths — it is the heading above the list, and
	// leaving it on would indent everything by a level to say it again.
	await eq(
		'a folder opens as a workspace tree, folders first',
		page.$$eval(`${TREE} .te-work-file`, (ns) => ns.map((n) => n.textContent).join(',')),
		'sub,gamma.md,alpha.md,beta.markdown,notes.txt'
	);
	ok(
		'and leaves out what it cannot',
		!(await page.locator('.te-work').textContent()).includes('ignore.png')
	);
	ok(
		'a nested document is indented under its folder',
		await page.evaluate((sel) => {
			const rows = [...document.querySelectorAll(`${sel} .te-work-row`)];
			const pad = (i) => parseFloat(getComputedStyle(rows[i]).paddingLeft);
			return pad(1) > pad(0) && pad(2) === pad(0);
		}, TREE)
	);
	ok(
		'and the folder says how many documents are under it',
		(await page.locator('.te-work-tally').textContent()) === '1'
	);

	// ── THE HEAD IS ONE ROW ──────────────────────────────────────────────────
	// Name, keys, tally. The name had the row to itself for a while, because sharing it with
	// three keys ellipsised any long name after a few characters; it shares again, and the
	// ellipsis is answered by a reveal rather than accepted.
	{
		// By CENTRE, not by top edge: a word, three plastic keys and a figure are different
		// heights, so a shared row shows as a shared middle.
		const mids = await page.evaluate(() =>
			[...document.querySelectorAll('.te-work-head > *')]
				.filter((e) => !e.classList.contains('te-work-full'))
				.map((e) => {
					const r = e.getBoundingClientRect();
					return Math.round(r.top + r.height / 2);
				})
		);
		ok(
			'the name, the keys and the tally share one row',
			Math.max(...mids) - Math.min(...mids) <= 2,
			JSON.stringify(mids)
		);
		ok('with no second row left behind', (await page.locator('.te-work-acts').count()) === 0);
		// The tally comes LAST, past the keys, because it heads a column: every folder row in the
		// tree carries the same figure at the same right edge.
		const edges = await page.evaluate(() => {
			const r = (s) => Math.round(document.querySelector(s).getBoundingClientRect().right);
			return { head: r('.te-work-count'), row: r('.te-work-tally') };
		});
		ok(
			'and the folder tally lines up with the row tallies',
			Math.abs(edges.head - edges.row) <= 1,
			JSON.stringify(edges)
		);

		// The folder is a mkdtemp name — always long enough to be clipped in a 15rem head, which
		// is what makes this deterministic rather than a case that depends on the machine.
		ok(
			'a name too long for the row is clipped',
			await page.evaluate(() => {
				const el = document.querySelector('.te-work-name');
				return el.scrollWidth > el.clientWidth + 1;
			})
		);
		ok('so a reveal is drawn for it', (await page.locator('.te-work-full').count()) === 1);
		await eq(
			'shut until it is asked for',
			page.locator('.te-work-full').evaluate((e) => getComputedStyle(e).opacity),
			'0'
		);
		await page.locator('.te-work-name').hover();
		await page.waitForTimeout(250);
		await eq(
			'pointing at the name opens it',
			page.locator('.te-work-full').evaluate((e) => getComputedStyle(e).opacity),
			'1'
		);
		ok(
			'showing the whole name',
			(await page.locator('.te-work-full').textContent()).trim() === path.basename(folder),
			await page.locator('.te-work-full').textContent()
		);
		{
			// It hangs BELOW the row on purpose: over the name it would land under the pointer that
			// opened it, take its own hover away, and flicker.
			const head = await page.locator('.te-work-head').boundingBox();
			const full = await page.locator('.te-work-full').boundingBox();
			const pane = await page.locator('.te-work').boundingBox();
			ok(
				'below the row rather than over it',
				full.y >= head.y + head.height - 6,
				JSON.stringify({ head, full })
			);
			ok(
				'and inside the pane, wrapped rather than run off it',
				full.x >= pane.x && full.x + full.width <= pane.x + pane.width,
				JSON.stringify({ pane, full })
			);
		}
		// Pointing at a KEY must not explain the folder.
		await page.locator('.te-work-act').last().hover();
		await page.waitForTimeout(250);
		await eq(
			'pointing at a key does not open it',
			page.locator('.te-work-full').evaluate((e) => getComputedStyle(e).opacity),
			'0'
		);
	}

	// ── THE SHELF ────────────────────────────────────────────────────────────
	// Documents opened from OUTSIDE the folder. Without it a file picked with Open had nowhere to
	// be: the tree cannot list what is not in the folder, so the moment you clicked anything else
	// it was off the screen with no way back but the picker.
	//
	// Anything the Open key picks goes here, folder or not — a single picked File carries no
	// relationship to the workspace at all (no handle to compare, and webkitRelativePath is empty
	// for a one-file pick), so claiming to know it was already in the tree would be a guess.
	{
		const TREE = '.te-work-list:not(.te-loose-list)';
		const outside = dir.mkdtempSync(path.join(os.tmpdir(), 'te-out-'));
		dir.writeFileSync(path.join(outside, 'elsewhere.md'), '# From elsewhere');

		// The suite opened alpha.md by HAND near the top, long before the folder existed. It is
		// still on the shelf and still one click away, which is the whole point of the thing.
		await eq(
			'a file opened by hand is still on the shelf, several acts later',
			page
				.locator('.te-loose .te-work-file')
				.allTextContents()
				.then((t) => t.join(',')),
			'alpha.md'
		);
		await page.setInputFiles('.te-picker >> nth=0', path.join(outside, 'elsewhere.md'));
		await page.waitForTimeout(700);
		await eq(
			'a second one goes to the FRONT — the order is the order you reached for them',
			page
				.locator('.te-loose .te-work-file')
				.allTextContents()
				.then((t) => t.join(',')),
			'elsewhere.md,alpha.md'
		);
		ok(
			'marked as the one on the sheet',
			(await page.locator('.te-loose .te-work-row.on').count()) === 1
		);
		ok('and the tree marks nothing', (await page.locator(`${TREE} .te-work-row.on`).count()) === 0);
		// Above the tree, and a shade off the sheet — that shading is the whole of how it says it
		// is a different kind of list.
		{
			const geo = await page.evaluate(() => ({
				shelf: document.querySelector('.te-loose').getBoundingClientRect().bottom,
				tree: document.querySelector('.te-work-list:not(.te-loose-list)').getBoundingClientRect()
					.top,
				shelfBg: getComputedStyle(document.querySelector('.te-loose')).backgroundColor,
				paneBg: getComputedStyle(document.querySelector('.te-work')).backgroundColor
			}));
			ok('it stands above the tree', geo.shelf <= geo.tree + 1, JSON.stringify(geo));
			ok('shaded off the pane it sits in', geo.shelfBg !== geo.paneBg, JSON.stringify(geo));
		}
		// Opening a tree row leaves the shelf standing — it is a shelf, not a mode.
		await page.getByRole('treeitem', { name: 'beta.markdown' }).click();
		await page.waitForTimeout(700);
		ok('a tree row leaves the shelf standing', (await page.locator('.te-loose').count()) === 1);
		ok(
			'and takes the mark off it',
			(await page.locator('.te-loose .te-work-row.on').count()) === 0
		);
		ok('marking the tree instead', (await page.locator(`${TREE} .te-work-row.on`).count()) === 1);
		// A shelf row opens again by re-READING — the shelf holds where a document came from, not
		// its text. There is one sheet in this editor and these are not buffers.
		await page.locator('.te-loose .te-work-row').first().click();
		await page.waitForTimeout(700);
		await eq('a shelf row opens again', value(), '# From elsewhere');
		// Its menu holds ONE verb, and that verb acts on the list rather than on the disk — which
		// is why it is offered in every browser where Rename and Delete are not.
		await page.locator('.te-loose .te-work-row').first().click({ button: 'right' });
		await page.waitForTimeout(300);
		await eq(
			'a shelf row offers Close, and nothing that touches the disk',
			page
				.locator('.te-file-menu [role=menuitem]')
				.allTextContents()
				.then((t) => t.join(',').trim()),
			'Close'
		);
		await page.locator('.te-file-menu [role=menuitem]').click();
		await page.waitForTimeout(500);
		await eq(
			'Close takes that row off and leaves the rest',
			page
				.locator('.te-loose .te-work-file')
				.allTextContents()
				.then((t) => t.join(',')),
			'alpha.md'
		);
		await eq('and leaves the words on the sheet', value(), '# From elsewhere');
		dir.rmSync(outside, { recursive: true, force: true });
	}

	// Shutting a folder takes its documents off the list and leaves the folder itself.
	await page.getByRole('treeitem', { name: /^sub/ }).click();
	await page.waitForTimeout(250);
	await eq(
		'shutting a folder hides what is inside it',
		page.$$eval(`${TREE} .te-work-file`, (ns) => ns.map((n) => n.textContent).join(',')),
		'sub,alpha.md,beta.markdown,notes.txt'
	);
	await eq(
		'and says so',
		page.getByRole('treeitem', { name: /^sub/ }).getAttribute('aria-expanded'),
		'false'
	);
	await page.getByRole('treeitem', { name: /^sub/ }).click();
	await page.waitForTimeout(250);
	ok(
		'opening it brings them back',
		(await page.locator(`${TREE} .te-work-file`).allTextContents()).join(',') ===
			'sub,gamma.md,alpha.md,beta.markdown,notes.txt'
	);

	await page.getByRole('treeitem', { name: 'beta.markdown' }).click();
	await page.waitForTimeout(700);
	await eq('picking one opens it', value(), '# Beta\n\nSecond note.');
	ok('and the workspace STAYS open', (await page.locator('.te-work').count()) === 1);
	ok(
		'with the open document marked in the list',
		(await page.locator('.te-work-row.on .te-work-file').textContent()) === 'beta.markdown'
	);
	ok(
		'the foot names the picked one',
		(await page.locator('.te-lamp').textContent()).trim() === 'beta.markdown',
		JSON.stringify((await page.locator('.te-lamp').textContent()).trim())
	);

	// With a workspace loaded the Folder key TOGGLES the pane rather than re-picking: once a
	// folder is open, "Folder" is a place you go rather than a thing you choose.
	const folderKey = page.getByRole('button', { name: 'Folder' });
	await folderKey.click();
	await page.waitForTimeout(300);
	ok('the Folder key hides the workspace', (await page.locator('.te-work').count()) === 0);
	await folderKey.click();
	await page.waitForTimeout(300);
	ok('and shows it again', (await page.locator('.te-work').count()) === 1);
	ok(
		'without forgetting which document is open',
		(await page.locator('.te-work-row.on').count()) === 1
	);

	// The About key forgets the file too, and for the same reason: the manual page is not the
	// document that was open, and a name left behind would point Save at a file it would overwrite.
	const aboutKey = page.getByRole('button', { name: /^About Text Editor/ });
	await aboutKey.click();
	await page.waitForTimeout(700);
	ok(
		'About forgets the filename',
		(await page.locator('.te-lamp').textContent()).trim() === '',
		JSON.stringify((await page.locator('.te-lamp').textContent()).trim())
	);
	ok(
		'and unmarks the workspace row with it',
		(await page.locator('.te-work-row.on').count()) === 0
	);
	// Put the file back on the sheet — the clearing case below needs a named document.
	await page.getByRole('treeitem', { name: 'beta.markdown' }).click();
	await page.waitForTimeout(300);

	// Clearing the sheet forgets the name with it — what is on screen is no longer that file.
	const clearKey = page.getByRole('button', { name: /Clear|Sure/ });
	await clearKey.click();
	await clearKey.click();
	await page.waitForTimeout(700);
	ok(
		'clearing forgets the filename',
		(await page.locator('.te-lamp').textContent()).trim() === '',
		JSON.stringify((await page.locator('.te-lamp').textContent()).trim())
	);
	ok('and unmarks the workspace row', (await page.locator('.te-work-row.on').count()) === 0);

	dir.rmSync(folder, { recursive: true, force: true });
}

// ── WRITING TO DISK, WHERE THE BROWSER ALLOWS IT ─────────────────────────────
// Rename, delete and save-in-place need the File System Access API, which is Chromium-only.
// The picker itself is native and cannot be driven — so it is STUBBED with a real directory
// handle from the Origin Private File System. That is not a mock: OPFS hands back genuine
// FileSystemDirectoryHandle and FileSystemFileHandle objects with the same `entries`,
// `createWritable`, `move` and `removeEntry`, so the walk, the save, the rename and the delete
// all run for real. Only the folder they run against is sandboxed.
//
// Every claim below is checked by READING BACK from that filesystem afterwards, not by trusting
// what the list says. A rename that updated the sidebar and not the disk would pass otherwise.
{
	const w = await browser.newContext({ viewport: { width: 1400, height: 900 } });
	const wp = await w.newPage();
	await wp.addInitScript(() => {
		window.__seed = async () => {
			const root = await navigator.storage.getDirectory();
			for (const n of ['alpha.md', 'beta.md', 'notes.txt', 'skip.png']) {
				const h = await root.getFileHandle(n, { create: true });
				const f = await h.createWritable();
				await f.write('# ' + n);
				await f.close();
			}
			const sub = await root.getDirectoryHandle('drafts', { create: true });
			const g = await sub.getFileHandle('gamma.md', { create: true });
			const f = await g.createWritable();
			await f.write('# Gamma');
			await f.close();
			window.showDirectoryPicker = async () => root;
			// The single-file picker is a HANDLE picker where the browser has one — same stub, same
			// reason: what it hands back is what makes a hand-picked file savable and rememberable.
			window.showOpenFilePicker = async () => [await root.getFileHandle('notes.txt')];
		};
	});
	await wp.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
	await wp.evaluate(() => window.__seed());
	await wp.waitForTimeout(300);
	await wp.getByRole('button', { name: 'Folder' }).click();
	await wp.waitForTimeout(700);

	ok(
		'a writable folder walks into its sub-folders and skips what it cannot read',
		(await wp.locator('.te-work-file').allTextContents()).join(',') ===
			'drafts,gamma.md,alpha.md,beta.md,notes.txt',
		JSON.stringify(await wp.locator('.te-work-file').allTextContents())
	);

	await wp.getByRole('treeitem', { name: 'alpha.md' }).click();
	await wp.waitForTimeout(600);
	ok(
		'and a SAVE key appears, which it does not without a handle',
		(await wp.getByRole('button', { name: /^Save/ }).count()) === 1
	);
	ok(
		'with the download reworded to point at it',
		(await wp.getByRole('button', { name: '.md', exact: true }).getAttribute('title')) ===
			'Download a copy — Save writes to the file itself',
		JSON.stringify(await wp.getByRole('button', { name: '.md', exact: true }).getAttribute('title'))
	);

	await wp.locator('.te-type').fill('# Alpha changed');
	await wp.waitForTimeout(200);
	await wp.getByRole('button', { name: /^Save/ }).click();
	await wp.waitForTimeout(500);
	ok(
		'saving writes the sheet back to the file itself',
		(await wp.evaluate(async () => {
			const root = await navigator.storage.getDirectory();
			return (await (await root.getFileHandle('alpha.md')).getFile()).text();
		})) === '# Alpha changed'
	);

	// RENAME AND DELETE ARE ON THE ROW'S CONTEXT MENU, not on the row. Playwright's `click` with
	// button: 'right' fires a real contextmenu event at the row's centre, which is what the
	// workspace listens for — so this drives the menu the same way a pointer does.
	ok(
		'the row draws no verbs of its own',
		(await wp.locator('.te-work-verbs').count()) === 0 &&
			(await wp.locator('.te-work-item').last().locator('button').count()) === 1
	);
	await wp.getByRole('treeitem', { name: 'alpha.md' }).click({ button: 'right' });
	await wp.waitForTimeout(200);
	ok('right-clicking a row opens its menu', (await wp.locator('.te-file-menu').count()) === 1);
	ok(
		'and the menu names the document it is about',
		(await wp.locator('.popover-title').textContent()).trim() === 'alpha.md',
		JSON.stringify(await wp.locator('.popover-title').textContent())
	);
	await wp.locator('.te-file-menu').getByRole('menuitem', { name: 'Rename' }).click();
	await wp.waitForTimeout(200);
	ok('choosing Rename takes the menu down', (await wp.locator('.te-file-menu').count()) === 0);
	await wp.locator('.te-work-field').fill('renamed.md');
	await wp.locator('.te-work-field').press('Enter');
	await wp.waitForTimeout(600);
	ok(
		'renaming renames it on disk',
		await wp.evaluate(async () => {
			const root = await navigator.storage.getDirectory();
			const names = [];
			for await (const [n] of root.entries()) names.push(n);
			return names.includes('renamed.md') && !names.includes('alpha.md');
		})
	);
	ok(
		'and the open document follows its own name',
		(await wp.locator('.te-lamp').textContent()).trim() === 'renamed.md'
	);

	// Delete asks twice, like Clear — the menu holds the question rather than closing on the
	// first press, because a menu item is still one press away from a file that is gone.
	const doomed = () => wp.locator('.te-file-menu').getByRole('menuitem', { name: /Delete|Sure/ });
	// gamma.md, which is INSIDE drafts — so this also proves the menu reaches a nested row and
	// that delete calls `removeEntry` on the folder that actually holds it.
	await wp.getByRole('treeitem', { name: 'gamma.md' }).click({ button: 'right' });
	await wp.waitForTimeout(200);
	ok(
		'the menu names the nested document',
		(await wp.locator('.popover-title').textContent()).trim() === 'gamma.md'
	);
	await doomed().click();
	await wp.waitForTimeout(250);
	ok('deleting asks first', (await doomed().textContent()).trim() === 'Sure?');
	await doomed().click();
	await wp.waitForTimeout(600);
	ok('and the menu goes with it', (await wp.locator('.te-file-menu').count()) === 0);
	ok(
		'and the second press really removes it',
		await wp.evaluate(async () => {
			const root = await navigator.storage.getDirectory();
			const sub = await root.getDirectoryHandle('drafts');
			const names = [];
			for await (const [n] of sub.entries()) names.push(n);
			return names.length === 0;
		})
	);

	// ── A HAND-PICKED FILE IS A REAL FILE ────────────────────────────────────
	// The Open key used to go through a hidden <input type=file>, which hands over a File — a
	// snapshot with nothing behind it. Where the browser has `showOpenFilePicker` it is used
	// instead, exactly as the Folder key already chose between two pickers, and the handle it
	// returns is what makes the document savable and its shelf row rememberable.
	{
		await wp.getByRole('button', { name: 'Open', exact: true }).click();
		await wp.waitForTimeout(700);
		await eq(
			'a hand-picked file lands on the shelf',
			wp.locator('.te-loose').last().locator('.te-work-file').textContent(),
			'notes.txt'
		);
		ok(
			'and can be saved back to, which a picked File never could',
			(await wp.getByRole('button', { name: /^Save/ }).count()) === 1
		);
		await wp.locator('.te-type').fill('picked and edited');
		await wp.waitForTimeout(300);
		await wp.getByRole('button', { name: /^Save/ }).click();
		await wp.waitForTimeout(600);
		ok(
			'and Save writes to the file itself',
			await wp.evaluate(async () => {
				const root = await navigator.storage.getDirectory();
				const f = await (await root.getFileHandle('notes.txt')).getFile();
				return (await f.text()) === 'picked and edited';
			})
		);
		// The shelf is kept in IndexedDB — a handle is a structured-cloneable OBJECT, so
		// JSON.stringify would hand back a row that opens nothing.
		ok(
			'the shelf is remembered, handles and all',
			await wp.evaluate(
				() =>
					new Promise((resolve) => {
						const req = indexedDB.open('ksh:text-editor', 1);
						req.onsuccess = () => {
							const get = req.result
								.transaction('handles', 'readonly')
								.objectStore('handles')
								.get('loose');
							get.onsuccess = () =>
								resolve(
									Array.isArray(get.result) && get.result.some((d) => d.name === 'notes.txt')
								);
							get.onerror = () => resolve(false);
						};
						req.onerror = () => resolve(false);
					})
			)
		);
	}

	// ── NEW MAKES A SCRATCH DOCUMENT ─────────────────────────────────────────
	// It used to ask for a name and create a real file in the folder, which meant it only worked
	// in Chromium, only with a folder open, and asked you to decide what a note was called before
	// you had written a word of it. A new document is named for you and lives on a shelf of its
	// own above Elsewhere — and it is the ONE kind of document this pane holds the text of,
	// because there is nowhere to read it back from.
	{
		await wp.getByRole('button', { name: 'New', exact: true }).click();
		await wp.waitForTimeout(400);
		ok('New asks for no name', (await wp.locator('.te-work-field').count()) === 0);
		ok(
			'and puts a scratch document on a shelf of its own, above Elsewhere',
			(await wp.locator('.te-loose-name').allTextContents()).join(',') === 'Scratch,Elsewhere',
			JSON.stringify(await wp.locator('.te-loose-name').allTextContents())
		);
		ok(
			'named for you',
			(await wp.locator('.te-loose').first().locator('.te-work-file').textContent()) ===
				'Ephemeral 1'
		);
		ok('on a blank sheet', (await wp.locator('.te-type').inputValue()) === '');
		ok(
			'with the foot naming it',
			(await wp.locator('.te-lamp').textContent()).trim() === 'Ephemeral 1'
		);

		// THE CASE THAT MATTERS: a scratch note's words exist nowhere else, so leaving it and
		// coming back must not lose them.
		await wp.locator('.te-type').fill('words that live nowhere else');
		await wp.waitForTimeout(500);
		await wp.getByRole('treeitem', { name: 'renamed.md' }).click();
		await wp.waitForTimeout(600);
		ok('a tree row still opens over it', (await wp.locator('.te-type').inputValue()) !== '');
		await wp.locator('.te-loose').first().locator('.te-work-row').click();
		await wp.waitForTimeout(600);
		ok(
			'and the scratch note still has its words',
			(await wp.locator('.te-type').inputValue()) === 'words that live nowhere else',
			await wp.locator('.te-type').inputValue()
		);
		// Closing one is the end of those words, so it asks twice — exactly as Clear does.
		await wp.locator('.te-loose').first().locator('.te-work-row').click({ button: 'right' });
		await wp.waitForTimeout(300);
		const item = wp.locator('.te-file-menu [role=menuitem]');
		await item.click();
		await wp.waitForTimeout(300);
		ok('closing a scratch note asks first', (await item.textContent()).trim() === 'Sure?');
		await item.click();
		await wp.waitForTimeout(400);

		// ── THE ROW'S OWN × ASKS IN WORDS ──────────────────────────────────────
		// It asked in a SHADE: the same glyph, the accent colour, no other difference. That is not
		// a question — it left you pressing what looked like the control you had just pressed, so
		// two answers read as one double-click. The menu's Close has said `Sure?` all along; this
		// is the same bargain and now says the same word.
		await wp.getByRole('button', { name: 'New', exact: true }).click();
		await wp.waitForTimeout(400);
		{
			const x = wp.locator('.te-loose').first().locator('.te-eph-close').first();
			ok('a scratch row carries a ×', (await x.textContent()).trim() === '×');
			// CENTRED IN ITS OWN BUTTON, which it was not: a <button> carries the UA's `1px 6px`
			// padding, and this rule never reset it — so the content box was 6px wide inside an
			// 18px border-box while the glyph's advance is 8.33px. Nothing can be centred in a box
			// narrower than itself; it clamps to the start edge and overflows the other way, which
			// put the × a pixel right of centre. Measured off the TEXT BOX rather than the ink, so
			// the assertion is about the layout rather than about one font's bearings.
			const centred = () =>
				wp.evaluate(async () => {
					await document.fonts.ready;
					const el = document.querySelector('.te-loose .te-eph-close');
					const r = el.getBoundingClientRect();
					const rg = document.createRange();
					rg.selectNodeContents(el);
					const t = rg.getBoundingClientRect();
					return { left: +(t.x - r.x).toFixed(2), right: +(r.right - t.right).toFixed(2) };
				});
			const shutGaps = await centred();
			ok(
				'and the × stands in the middle of it',
				Math.abs(shutGaps.left - shutGaps.right) < 0.5,
				JSON.stringify(shutGaps)
			);
			const shut = await x.evaluate((el) => Math.round(el.getBoundingClientRect().width));
			await x.click();
			await wp.waitForTimeout(300);
			ok('one press turns it into the question', (await x.textContent()).trim() === 'Sure?');
			// And it has to LOOK like a different control, not a recoloured one — it takes the
			// width of the word, and an edge, so it reads as a key standing over the row.
			const armed = await x.evaluate((el) => ({
				w: Math.round(el.getBoundingClientRect().width),
				edge: getComputedStyle(el).borderTopWidth
			}));
			ok(
				'and grows to the width of it, with an edge of its own',
				armed.w > shut + 8 && parseFloat(armed.edge) >= 1,
				JSON.stringify({ shut, ...armed })
			);
			// The armed pill has padding of its OWN, which is the same trap one line wider: the
			// word has to fit inside it or it clamps left exactly as the × did.
			const armedGaps = await centred();
			ok(
				'the word is centred in it too',
				Math.abs(armedGaps.left - armedGaps.right) < 0.5,
				JSON.stringify(armedGaps)
			);
			// It must not eat the sidebar it stands in.
			const inside = await wp.evaluate(() => {
				const el = document.querySelector('.te-loose .te-eph-close');
				const pane = document.querySelector('.te-work');
				if (!el || !pane) return false;
				const a = el.getBoundingClientRect();
				const b = pane.getBoundingClientRect();
				return a.left >= b.left && a.right <= b.right + 1;
			});
			ok('and stays inside the workspace', inside);
			await x.click();
			await wp.waitForTimeout(400);
			// By the shelf's LABEL, not by position: the Scratch block is not drawn at all when it
			// empties, so `.te-loose` first() would be asking Elsewhere how many rows it has.
			ok(
				'the second press closes the note',
				(await wp.locator('ul[aria-label="Scratch"] .te-work-row').count()) === 0
			);
		}
		// The order of the scratch list is YOURS — the tree is alphabetical because a folder is,
		// and the shelf is by recency because that is what it means, but these are notes you made.
		// Two fresh ones — the first note was closed just above, so its name is free again.
		await wp.getByRole('button', { name: 'New', exact: true }).click();
		await wp.waitForTimeout(300);
		await wp.getByRole('button', { name: 'New', exact: true }).click();
		await wp.waitForTimeout(400);
		await eq(
			'two scratch notes stand in the order they were made',
			wp
				.locator('.te-loose')
				.first()
				.locator('.te-work-file')
				.allTextContents()
				.then((t) => t.join(',')),
			'Ephemeral 1,Ephemeral 2'
		);
		await wp.dragAndDrop('.te-loose >> text=Ephemeral 2', '.te-loose >> text=Ephemeral 1');
		await wp.waitForTimeout(500);
		await eq(
			'and one dragged onto the other takes its place',
			wp
				.locator('.te-loose')
				.first()
				.locator('.te-work-file')
				.allTextContents()
				.then((t) => t.join(',')),
			'Ephemeral 2,Ephemeral 1'
		);
		// Both off again, so the shelf is empty for what follows.
		for (const _ of [0, 1]) {
			await wp
				.locator('.te-loose')
				.first()
				.locator('.te-work-row')
				.first()
				.click({ button: 'right' });
			await wp.waitForTimeout(300);
			await wp.locator('.te-file-menu [role=menuitem]').click();
			await wp.waitForTimeout(200);
			await wp.locator('.te-file-menu [role=menuitem]').click();
			await wp.waitForTimeout(400);
		}

		ok(
			'and the second press takes it, and the empty shelf with it',
			(await wp.locator('.te-loose-name').allTextContents()).join(',') === 'Elsewhere'
		);
	}

	// ── A SCRATCH NOTE BECOMES A FILE ────────────────────────────────────────
	// The one way a document is created on disk now that New makes a note rather than a file —
	// and the right way round: you write the thing first and decide it is worth keeping second.
	{
		await wp.getByRole('button', { name: 'New', exact: true }).click();
		await wp.waitForTimeout(400);
		await wp.locator('.te-type').fill('# worth keeping');
		await wp.waitForTimeout(400);
		ok(
			'a scratch note offers Save once a writable folder is open',
			(await wp.getByRole('button', { name: /^Save/ }).count()) === 1
		);
		await eq(
			'and says where it would go',
			wp.getByRole('button', { name: /^Save/ }).getAttribute('title'),
			'File this note in the folder as Ephemeral 1.md'
		);
		await wp.getByRole('button', { name: /^Save/ }).click();
		await wp.waitForTimeout(700);
		ok(
			'Save files it in the folder',
			await wp.evaluate(async () => {
				const root = await navigator.storage.getDirectory();
				const f = await (await root.getFileHandle('Ephemeral 1.md')).getFile();
				return (await f.text()) === '# worth keeping';
			})
		);
		ok(
			'it leaves the scratch shelf',
			(await wp.locator('.te-loose-name', { hasText: 'Scratch' }).count()) === 0
		);
		ok(
			'and the sheet is holding a real file now',
			(await wp.locator('.te-lamp').textContent()).trim() === 'Ephemeral 1.md'
		);
	}

	// ── AN EMPTY FOLDER IS STILL A FOLDER ───────────────────────────────────
	// The tree was derived from the file paths alone, so a folder with nothing readable in it had
	// no row — which made it the one folder you could never drag anything into. The walk's own
	// directory list is what fills the gap; a `webkitdirectory` pick cannot know them, because an
	// empty directory leaves no File behind to be seen in.
	{
		await wp.evaluate(async () => {
			const root = await navigator.storage.getDirectory();
			await root.getDirectoryHandle('nothing-in-here', { create: true });
		});
		await wp.getByRole('button', { name: 'Change', exact: true }).click();
		await wp.waitForTimeout(900);
		ok(
			'an empty folder gets a row of its own',
			(await wp.getByRole('treeitem', { name: /^nothing-in-here/ }).count()) === 1
		);
		await eq(
			'and says it holds nothing',
			wp
				.getByRole('treeitem', { name: /^nothing-in-here/ })
				.locator('.te-work-tally')
				.textContent(),
			'0'
		);
	}

	// ── A RENAME SAYS SO ─────────────────────────────────────────────────────
	// It is the one write in this pane that changes nothing you can see — the sheet is unchanged
	// and the row simply has a different word in it — so a rename the browser refused looks
	// exactly like one that worked. The row answers in the emerald the Save key uses.
	{
		await wp.getByRole('treeitem', { name: 'renamed.md' }).click({ button: 'right' });
		await wp.waitForTimeout(300);
		await wp.locator('.te-file-menu [role=menuitem]', { hasText: 'Rename' }).click();
		await wp.waitForTimeout(250);
		await wp.locator('.te-work-field').fill('renamed-again.md');
		await wp.locator('.te-work-field').press('Enter');
		await wp.waitForTimeout(400);
		const row = wp.getByRole('treeitem', { name: 'renamed-again.md' });
		ok('the renamed row says Saved', (await wp.locator('.te-work-row.saved').count()) === 1);
		ok(
			'in the emerald, not the accent',
			await row.evaluate((el) => {
				const c = getComputedStyle(el, '::after').color.match(/\d+/g).map(Number);
				return c[1] > c[0] + 30 && c[1] > c[2] + 20;
			})
		);
		// The row's own text must NOT be what fades: animating the row's opacity whited the cell
		// out and brought the filename back at the end, which reads as the row being replaced.
		ok(
			'and the filename does not fade with it',
			await row.locator('.te-work-file').evaluate((el) => getComputedStyle(el).opacity === '1')
		);
		await wp.waitForTimeout(1600);
		ok('and it goes on its own', (await wp.locator('.te-work-row.saved').count()) === 0);
	}

	// ── MOVING A DOCUMENT ────────────────────────────────────────────────────
	// Drag a row onto a folder and the file moves ON DISK. Checked by reading the filesystem back,
	// like every other write in this suite — a sidebar that redrew without the move happening
	// would pass otherwise.
	{
		const TREE = '.te-work-list:not(.te-loose-list)';
		ok(
			'a document can be dragged',
			(await wp
				.locator(`${TREE} .te-work-row`, { hasText: 'beta.md' })
				.first()
				.getAttribute('draggable')) === 'true'
		);
		ok(
			'a folder cannot — only documents move',
			(await wp.locator('.te-work-dir').first().getAttribute('draggable')) !== 'true'
		);
		await wp.dragAndDrop(`${TREE} >> text=beta.md`, '.te-work-dir');
		await wp.waitForTimeout(400);
		// A move ANSWERS too, in the accent rather than the emerald — it is a write you can see,
		// but only if you were looking at the part of the list it landed in.
		ok('the moved row says so', (await wp.locator('.te-work-row.moved').count()) === 1);
		ok(
			'in the accent, not the emerald',
			await wp.locator('.te-work-row.moved').evaluate((el) => {
				const c = getComputedStyle(el, '::after').color.match(/\d+/g).map(Number);
				return c[2] > c[1] + 40;
			})
		);
		await wp.waitForTimeout(500);
		// The whole path is on the row for the hover — indenting says where a document is only
		// while the folder rows above it are still on screen, which stops being true the moment
		// the list scrolls. Asked here because this is the first nested document the suite has.
		await eq(
			'a nested row carries its whole path for the hover',
			wp.getByRole('treeitem', { name: 'beta.md' }).getAttribute('title'),
			'drafts/beta.md'
		);
		ok(
			'dropping one on a folder moves it there on disk',
			await wp.evaluate(async () => {
				const root = await navigator.storage.getDirectory();
				const sub = await root.getDirectoryHandle('drafts');
				const inSub = [];
				for await (const [n] of sub.entries()) inSub.push(n);
				const inTop = [];
				for await (const [n] of root.entries()) inTop.push(n);
				return inSub.includes('beta.md') && !inTop.includes('beta.md');
			})
		);
		// Out again, onto the head — which is the root's drop target, because dragging a document
		// out of a sub-folder has to have somewhere to land.
		await wp.dragAndDrop(`${TREE} >> text=beta.md`, '.te-work-head');
		await wp.waitForTimeout(800);
		ok(
			'dropping one on the head moves it back to the top level',
			await wp.evaluate(async () => {
				const root = await navigator.storage.getDirectory();
				const inTop = [];
				for await (const [n] of root.entries()) inTop.push(n);
				return inTop.includes('beta.md');
			})
		);
		// `move` OVERWRITES silently — the platform will not warn you that the file you dropped
		// has just replaced one of the same name. So the app checks before it acts.
		await wp.evaluate(async () => {
			const root = await navigator.storage.getDirectory();
			const sub = await root.getDirectoryHandle('drafts');
			const h = await sub.getFileHandle('beta.md', { create: true });
			const f = await h.createWritable();
			await f.write('# the one already there');
			await f.close();
		});
		await wp.getByRole('button', { name: 'Change', exact: true }).click();
		await wp.waitForTimeout(900);
		await wp.dragAndDrop(`${TREE} >> text=beta.md >> nth=1`, '.te-work-dir');
		await wp.waitForTimeout(800);
		ok(
			'a name already taken at the destination cancels the move',
			await wp.evaluate(async () => {
				const root = await navigator.storage.getDirectory();
				const sub = await root.getDirectoryHandle('drafts');
				const kept = await (await sub.getFileHandle('beta.md')).getFile();
				const inTop = [];
				for await (const [n] of root.entries()) inTop.push(n);
				return (await kept.text()) === '# the one already there' && inTop.includes('beta.md');
			})
		);
	}

	await w.close();
}

// ── AND WHERE IT DOES NOT ────────────────────────────────────────────────────
// The rule this app already keeps for the folder picker: a key that cannot do what its label
// says should not be drawn. In a browser with no File System Access API the write keys are
// ABSENT, not disabled, and the workspace says once why.
{
	const { webkit: wk } = await import('playwright');
	let ro;
	try {
		ro = await wk.launch();
	} catch {
		ok('a read-only browser draws no write keys', false, 'webkit not installed');
	}
	if (ro) {
		const rp = await (await ro.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
		await rp.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
		await rp.waitForTimeout(400);
		ok(
			'a browser without the API is detected as read-only',
			(await rp.evaluate(() => typeof window.showDirectoryPicker)) === 'undefined'
		);
		ok('so no SAVE key is drawn', (await rp.getByRole('button', { name: /^Save/ }).count()) === 0);
		// …and the one way out says what it actually does. A download writes a NEW file to the
		// Downloads folder; somebody who pressed it here and saw no complaint could reasonably
		// believe they had saved over the one they opened.
		ok(
			'and the download says it is a copy, not a save',
			(await rp.getByRole('button', { name: '.md', exact: true }).getAttribute('title')) ===
				'Download a copy — this browser cannot save in place',
			JSON.stringify(
				await rp.getByRole('button', { name: '.md', exact: true }).getAttribute('title')
			)
		);
		await ro.close();
	}
}

// ── THE CONTENTS RAIL ────────────────────────────────────────────────────────
// A fourth column indexing the SOURCE rather than the proof, so it is there in WRITE where there
// is no proof to read — and carrying the same section numbers the proof prints, so the two never
// disagree about what section 02 is.
await reset(
	'# Chapter One\n\n## Alpha\n\n## Beta\n\n# Chapter Two\n\n## Gamma\n\n### Deeper\n\n## Delta'
);
await page.waitForTimeout(300);
{
	await eq(
		'the rail lists every heading',
		page.$$eval('.te-toc-link', (ls) => ls.length),
		7
	);
	// The numbers restart under each first-level heading, exactly as the proof does.
	await eq(
		'and numbers sections within their chapter',
		page.$$eval('.te-toc-num', (ns) => ns.map((n) => n.textContent).join(',')),
		'01,02,01,02'
	);
	// Headings inside a fence are not headings — the engine owns that rule and the rail asks it.
	await reset('# Real\n\n```\n# Fake\n```');
	await page.waitForTimeout(300);
	await eq(
		'a hash inside a fence is not indexed',
		page.$$eval('.te-toc-link', (ls) => ls.map((l) => l.textContent.trim()).join(',')),
		'Real'
	);

	// Clicking one puts the caret on it — in an editor, "go to" means "start typing here".
	await reset('# One\n\nbody\n\n## Two\n\nbody');
	await page.waitForTimeout(300);
	await page.locator('.te-toc-link').nth(1).click();
	await page.waitForTimeout(300);
	await eq(
		'clicking one takes the caret to that heading',
		page.$eval('.te-type', (t) => t.value.slice(t.selectionStart, t.selectionStart + 6)),
		'## Two'
	);
	ok(
		'and the rail marks where you are',
		(await page.locator('.te-toc-link.on').textContent()).includes('Two')
	);

	// ONE CLICK, not two. Focusing a text control scrolls its current selection into view, and
	// this textarea is not its own scroller — so a focus taken after the row was scrolled to threw
	// the sheet back to wherever the caret had been left. Every jump landed on the PREVIOUS
	// heading's position, and the second press, with the caret now in the right place, looked like
	// it had worked. The order in `goTo` is what holds this.
	await reset(
		Array.from(
			{ length: 16 },
			(_, i) =>
				`# Chapter ${i + 1}\n\n` +
				Array.from({ length: 10 }, (_, j) => `Line ${i + 1}.${j + 1} of filler.`).join('\n\n')
		).join('\n\n')
	);
	await page.waitForTimeout(400);
	// How far the heading's own row sits from the middle of the sheet, which is where the jump
	// puts it. Measured off the mirror, because that is what the scroll actually moved.
	const offMiddle = (n) =>
		page.evaluate((line) => {
			const paper = document.querySelector('.te-paper');
			const row = document.querySelector('.te-mirror').children[line];
			const p = paper.getBoundingClientRect();
			const r = row.getBoundingClientRect();
			return Math.round(r.top + r.height / 2 - (p.top + p.height / 2));
		}, n);
	for (const chapter of [9, 2, 13]) {
		await page.locator('.te-paper').evaluate((el) => (el.scrollTop = 0));
		await page.waitForTimeout(200);
		await page.getByRole('button', { name: `Chapter ${chapter}`, exact: true }).click();
		await page.waitForTimeout(350);
		// 1 heading line + 10 paragraphs, a blank line between each: 22 lines per chapter.
		const off = await offMiddle((chapter - 1) * 22);
		ok(
			`one click centres Chapter ${chapter} on the sheet`,
			Math.abs(off) < 30,
			`${off}px from the middle`
		);
	}
}

// ── THE MEASURE ──────────────────────────────────────────────────────────────
// Held to a reading measure by default, in WRITE and in PROOF alike. A line set to the width of a
// wide window runs to about 160 characters, and the eye loses the return to the left edge long
// before that; the full width stays available for a wide table or a listing.
{
	await page.getByRole('button', { name: 'Write' }).click();
	await page.waitForTimeout(250);
	const key = page.getByRole('button', { name: /Measure|reading measure|full width/ });

	const width = () =>
		page.evaluate(() => {
			const st = document.querySelector('.te-stack').getBoundingClientRect();
			const pa = document.querySelector('.te-paper').getBoundingClientRect();
			return {
				stack: Math.round(st.width),
				pane: Math.round(pa.width),
				left: Math.round(st.left - pa.left)
			};
		});

	ok('the measure is held by default', (await page.locator('.te.te-measured').count()) === 1);
	const held = await width();
	ok(
		'so the column is narrower than the pane it sits in',
		held.stack < held.pane - 40,
		JSON.stringify(held)
	);
	// Centred, not hugging one edge: the margin rule and the marks travel with the column, which
	// is why the rule is drawn on the stack rather than on the scroller behind it.
	ok(
		'and is centred in it',
		Math.abs(held.left - (held.pane - held.stack) / 2) < 12,
		JSON.stringify(held)
	);

	await key.click();
	await page.waitForTimeout(250);
	const full = await width();
	ok(
		'turning it off lets the text run the full width',
		full.stack > held.stack + 40,
		JSON.stringify(full)
	);

	await key.click();
	await page.waitForTimeout(250);
	ok('and it comes back', (await width()).stack === held.stack);

	// It survives a reload — a setting that forgets is a preference nobody sets twice.
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForSelector('.te-type');
	ok('the setting is remembered', (await page.locator('.te.te-measured').count()) === 1);

	// PROOF takes its own, narrower measure: the same pixel width is fewer characters in the
	// body face than in the mono one.
	await page.getByRole('button', { name: 'Proof' }).click();
	await page.waitForTimeout(300);
	const proof = await page.evaluate(() => {
		const el = document.querySelector('.te-proof > *');
		const pane = document.querySelector('.te-proof').getBoundingClientRect();
		return { block: Math.round(el.getBoundingClientRect().width), pane: Math.round(pane.width) };
	});
	ok('the proof is held to a measure too', proof.block < proof.pane - 40, JSON.stringify(proof));
	// The measure key stays offered in PROOF, where the mark keys are not — it changes the layout
	// rather than the text.
	ok('and the measure key is still offered there', (await key.count()) === 1);
	await page.getByRole('button', { name: 'Write' }).click();
	await page.waitForTimeout(250);
}

// ── THE SELECTION BAND ───────────────────────────────────────────────────────
// It had the caret's fault exactly: the native band is the FONT's box, not the line's — 22px in
// WebKit, 23px in Firefox, against a 26px row — so it sat two pixels inside the row and stopped
// short of the bottom. One line reads as merely tight; SEVERAL read as striped, each band parted
// from the next by a gap it cannot fill. Ours is a rect per visual row, exactly one row tall.
await reset('alpha line one here\nbeta line two here\n\ndelta line four here');
{
	const m = await page.evaluate(async () => {
		const ta = document.querySelector('.te-type');
		ta.focus();
		ta.setSelectionRange(2, ta.value.length - 2);
		ta.dispatchEvent(new Event('select'));
		// Only visible rows are drawn, so make sure the selection is on screen before measuring.
		document.querySelectorAll('.te-mline')[0].scrollIntoView({ block: 'center' });
		await new Promise((r) => setTimeout(r, 250));
		const rects = [...document.querySelectorAll('.te-sel')]
			.map((s) => s.getBoundingClientRect())
			.sort((a, b) => a.top - b.top);
		const row = parseFloat(getComputedStyle(document.querySelector('.te-mirror')).lineHeight);
		return {
			count: rects.length,
			row,
			heights: [...new Set(rects.map((r) => +r.height.toFixed(2)))],
			// The gap between one band and the next. Anything but zero is the stripe.
			gaps: rects.slice(1).map((r, i) => +(r.top - (rects[i].top + rects[i].height)).toFixed(2)),
			nativeHidden: getComputedStyle(ta, '::selection').backgroundColor === 'rgba(0, 0, 0, 0)'
		};
	});
	ok('the editor draws its own selection band', m.count >= 4, JSON.stringify(m));
	ok(
		'every band is exactly one row tall',
		m.heights.length === 1 && Math.abs(m.heights[0] - m.row) < 0.5,
		JSON.stringify(m)
	);
	// THE defect: consecutive rows must tile with no seam.
	ok(
		'and consecutive bands tile with no gap between them',
		m.gaps.every((g) => Math.abs(g) < 0.5),
		JSON.stringify(m.gaps)
	);
	// A blank line inside the selection is still selected, and says so with a small tail rather
	// than vanishing from the band.
	ok('a blank line inside the selection is still marked', m.count >= 4, JSON.stringify(m));
}

// The band goes when the selection does.
{
	await page.evaluate(() => {
		const ta = document.querySelector('.te-type');
		ta.setSelectionRange(3, 3);
		ta.dispatchEvent(new Event('select'));
	});
	await page.waitForTimeout(150);
	ok('no band once the selection collapses', (await page.locator('.te-sel').count()) === 0);
}

// A selection has its own highlight; a second marker inside it says nothing. And an unfocused
// sheet shows no caret at all — a blinking bar in a field you are not typing in is a lie.
{
	await page.evaluate(() => {
		const ta = document.querySelector('.te-type');
		ta.setSelectionRange(0, 6);
		ta.dispatchEvent(new Event('select'));
	});
	await page.waitForTimeout(120);
	ok('no caret while there is a selection', (await page.locator('.te-caret').count()) === 0);

	await page.evaluate(() => document.querySelector('.te-type').blur());
	await page.waitForTimeout(120);
	ok('no caret while the sheet is not focused', (await page.locator('.te-caret').count()) === 0);
}

// ── Touch keeps the browser's caret ──────────────────────────────────────────
// The drawn caret is a fine-pointer affordance. On a touch screen the platform draws selection
// handles and a magnifier against the NATIVE caret; taking the bar away and leaving its furniture
// behind would be a worse trade than the oversized bar this replaces.
{
	const touch = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true
	});
	const p = await touch.newPage();
	await p.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
	await p.waitForSelector('.te-type');
	await p.locator('.te-type').tap();
	await p.waitForTimeout(200);
	ok('touch draws no caret of ours', (await p.locator('.te-caret').count()) === 0);
	ok(
		'and keeps the browser’s',
		(await p.$eval('.te-type', (el) => getComputedStyle(el).caretColor)) !== 'rgba(0, 0, 0, 0)'
	);
	// Same for the selection: the platform's drag handles are drawn against the native band, and
	// taking the band away while leaving the handles would be worse than the band being tight.
	await p.evaluate(() => {
		const ta = document.querySelector('.te-type');
		ta.focus();
		ta.setSelectionRange(0, 12);
		ta.dispatchEvent(new Event('select'));
	});
	await p.waitForTimeout(200);
	ok('touch draws no selection band of ours', (await p.locator('.te-sel').count()) === 0);
	// The switch itself, rather than the painted result. `getComputedStyle(el, '::selection')`
	// reports a transparent background whether or not an author rule applies, so it cannot tell
	// the two apart — but `(pointer: fine)` is the single condition that gates BOTH the stylesheet
	// and the script, so asserting it is asserting the thing that decides.
	ok(
		'because the fine-pointer switch is off, which is what gates both',
		(await p.evaluate(() => matchMedia('(pointer: fine)').matches)) === false
	);
	await touch.close();
}

// ── The narrow window drops SPLIT rather than squeezing it ───────────────────
{
	const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const p = await phone.newPage();
	await p.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
	await p.waitForSelector('.te-type');
	ok('a phone is not offered SPLIT', !(await p.getByRole('button', { name: 'Split' }).count()));
	ok('and falls back to one pane', (await p.locator('.te-pane').count()) === 1);

	// ── AND DROPS THE RUNNING FOOT ─────────────────────────────────────────────
	// The tally is a desk affordance. On a phone the same rows are wanted by the sheet, the
	// software keyboard takes the bottom third the moment anybody types, and the flyout key
	// already stands in that corner. Not rendered rather than hidden — a `display: none` foot
	// still costs a subtree and still keeps the counts derived for something nobody can read.
	ok('a phone does not draw the running foot', (await p.locator('.te-foot').count()) === 0);
	ok('nor any part of it', (await p.locator('.te-tally, .te-lamp').count()) === 0);
	// The sheet takes the rows back. Measured against the desk rather than a fixed number: what
	// matters is that nothing is reserved below the panes.
	const bottoms = await p.evaluate(() => {
		const te = document.querySelector('.te').getBoundingClientRect();
		const desk = document.querySelector('.te-desk').getBoundingClientRect();
		return { left: Math.round(te.bottom - desk.bottom) };
	});
	ok('and the desk runs to the bottom of the app', bottoms.left <= 1, JSON.stringify(bottoms));
	// The key keeps FloatingKey's own inset now that there is nothing under it to clear. This is
	// the assertion that catches the old lift coming back with a stale measurement behind it.
	const keyOff = await p.evaluate(() => {
		const k = document.querySelector('.fkey');
		return k ? Math.round(innerHeight - k.getBoundingClientRect().bottom) : -1;
	});
	ok('the floating key sits at its own inset', keyOff >= 16 && keyOff <= 24, `${keyOff}px`);

	// ── The phone's flyout ─────────────────────────────────────────────────────
	// Seventeen keys will not sit in a 390px bar without becoming a strip you swipe to reach
	// anything. The bar keeps the VIEW keys; the rest go to the shared floating key at the
	// bottom-left, where every other app on the site puts its phone controls.
	// Counted by class: the strip is EMPTY on a phone (the marks are in the flyout), and the two
	// view keys live in the fixed tail beside Home.
	ok(
		'the phone bar keeps only the view keys',
		(await p.locator('.head-row .tb').count()) === 2,
		`${await p.locator('.head-row .tb').count()}`
	);
	ok('and a floating key holds the rest', (await p.locator('.fkey').count()) === 1);
	// THE BAR'S CHROME CORNER EMPTIES TOO. Home and About go down to the flyout on a phone; the
	// beta tag stays, because it is the one of the three that has to be SEEN rather than reached.
	const corner = await p.evaluate(() =>
		[...document.querySelectorAll('.surface-head .head-actions > *')].map(
			(el) => el.getAttribute('aria-label') ?? el.className.split(' ')[0]
		)
	);
	ok(
		'the phone bar keeps only the beta tag in its corner',
		corner.length === 1 && /is in beta/.test(corner[0]),
		JSON.stringify(corner)
	);
	// THE TAG STANDS ALONE NOW, and that is exactly when its height broke: it was fitted with
	// `align-self: stretch`, which only ever worked because a 28px Home was setting the height of
	// the row it stretched into. Left by itself it stretched to its own type — 19.6px against
	// 28px keys, measured. It states the control line itself now.
	const heights = await p.evaluate(() => {
		const tag = document.querySelector('.beta')?.getBoundingClientRect().height ?? 0;
		const key = document.querySelector('.head-row .tb')?.getBoundingClientRect().height ?? 0;
		return { tag: +tag.toFixed(1), key: +key.toFixed(1) };
	});
	ok(
		'and the tag stands at the same height as the keys beside it',
		Math.abs(heights.tag - heights.key) < 0.6 && heights.key > 0,
		JSON.stringify(heights)
	);
	// Neither may be drawn TWICE — the bar dropping them and the flyout adding them is one move,
	// and a stale copy left in the bar is the failure this catches. Counted in the DOM rather
	// than by role: the flyout is parked and hidden while it is shut, and an accessibility query
	// cannot see either of them until it opens.
	const drawn = (label) =>
		p.evaluate(
			(l) =>
				[...document.querySelectorAll('button')].filter((el) =>
					(el.getAttribute('aria-label') || '').startsWith(l)
				).length,
			label
		);
	ok('Home is drawn once, in the flyout', (await drawn('Close and go home')) === 1);
	ok('and About once, beside it', (await drawn('About Text Editor')) === 1);
	ok(
		'both inside the stack rather than the bar',
		(await p.locator('.fkey-stack .icon-btn[aria-label^="Close and go home"]').count()) === 1 &&
			(await p.locator('.fkey-stack .icon-btn[aria-label^="About Text Editor"]').count()) === 1
	);
	// The flyout is PARKED rather than unmounted when shut (FloatingKey keeps it in the DOM and
	// slides it away), so its contents are always present. `aria-expanded` on the key is the state
	// that actually says whether it is disclosed — counting the marks would pass either way.
	const shown = () => p.locator('.fkey[aria-expanded="true"]').count();
	ok('which is shut to begin with', (await shown()) === 0);

	await p.locator('.fkey').click();
	await p.waitForTimeout(350);
	ok('it opens', (await shown()) === 1);
	ok('the marks are a grid', (await p.locator('.te-fly-mark').count()) === 9);
	ok(
		'with the document keys as a stack',
		(await p.locator('.fkey-stack .icon-btn').count()) === 8,
		`${await p.locator('.fkey-stack .icon-btn').count()} discs`
	);
	// 17 of the 19 — everything but the two view keys, which is the point of the exercise.
	ok(
		'so all but the view keys are in the flyout',
		(await p.locator('.te-fly-mark').count()) +
			(await p.locator('.fkey-stack .icon-btn').count()) ===
			17
	);
	// ORDER. The stack is column-reverse, so the LAST disc written is the top one — and Home is
	// last on purpose: it is the only key in the app that leaves it, it asks nothing first, and
	// the bottom of the stack is where a thumb lands. About sits just under it.
	const discs = await p.evaluate(() =>
		[...document.querySelectorAll('.fkey-stack .icon-btn')].map(
			(el) => (el.getAttribute('aria-label') || '').split(' —')[0]
		)
	);
	ok(
		'Home is furthest from the thumb, with About under it',
		discs.at(-1) === 'Close and go home' && discs.at(-2) === 'About Text Editor',
		JSON.stringify(discs)
	);
	const rise = await p.evaluate(() => {
		const d = [...document.querySelectorAll('.fkey-stack .icon-btn')];
		return d.map((el) => Math.round(el.getBoundingClientRect().top));
	});
	ok(
		'and the stack rises, so last written is highest on screen',
		rise.every((t, i) => i === 0 || t < rise[i - 1]),
		JSON.stringify(rise)
	);

	// ABOUT WORKS FROM HERE, and folds the flyout behind it the way every key that finishes its
	// job does. Home is not pressed in this suite: it would close the panel and take the rest of
	// the phone cases with it.
	await p.locator('.te-type').fill('scribble');
	await p.getByRole('button', { name: /^About Text Editor/ }).click();
	await p.waitForTimeout(350);
	ok(
		'About puts the manual on the sheet from the flyout',
		(await p.locator('.te-type').inputValue()).startsWith('# Text Editor'),
		JSON.stringify((await p.locator('.te-type').inputValue()).slice(0, 20))
	);
	ok('and folds the flyout behind it', (await shown()) === 0);
	await p.locator('.fkey').click();
	await p.waitForTimeout(350);

	// A MARK leaves the flyout standing, so a run of them costs one open rather than one each.
	await p.locator('.te-type').fill('word');
	await p.evaluate(() => {
		const t = document.querySelector('.te-type');
		t.focus();
		t.setSelectionRange(0, 4);
	});
	await p.getByRole('button', { name: 'Bold (⌘B)' }).click();
	await p.waitForTimeout(250);
	ok('a mark applies from the flyout', (await p.locator('.te-type').inputValue()) === '**word**');
	ok('and leaves it standing', (await shown()) === 1);

	// A DOCUMENT key finishes the job and folds it — except Clear, which asks first, and would
	// otherwise hide its own question.
	const clear = p.locator('.fkey-stack .icon-btn').nth(2);
	await clear.click();
	await p.waitForTimeout(250);
	ok('Clear asks without folding the flyout', (await shown()) === 1);
	await clear.click();
	await p.waitForTimeout(350);
	ok('and folds it once it has cleared', (await shown()) === 0);
	ok('having cleared the sheet', (await p.locator('.te-type').inputValue()) === '');

	await phone.close();
}

// ── PROOF FOLLOWS THE WORKSPACE TOO ──────────────────────────────────────────
// The workspace is drawn in all three modes, so a row picked in PROOF has to change what the
// proof sets — and it did not. Everything that replaces the sheet went through the textarea, and
// the textarea is NOT MOUNTED in proof (`{#if shown !== 'proof'}`), so `load`, About and Clear
// all gave up at their `if (!ta)` guard. Picking a document marked its row and left the previous
// document set; Clear was worse, taking the name off a sheet it then failed to empty.
//
// Nothing here can be checked from the sheet, because in this mode there is no sheet — every
// assertion reads the PROOF, which is the only thing the visitor can see.
{
	const rows = page.locator('ul[aria-label="Scratch"] .te-work-row');
	const proofText = () => page.locator('.te-proof').innerText();

	// Two scratch notes, so there is something to pick BETWEEN. New needs no folder, which is why
	// this case is here rather than in the OPFS one.
	await press('New');
	await reset('# alpha\n\nthe first note');
	await press('New');
	await reset('# bravo\n\nthe second note');
	// The open note's words go back to its row on a debounce — this is the one document the pane
	// holds the text of, so a case that raced it would be picking an empty note.
	await page.waitForTimeout(600);

	await page.getByRole('button', { name: 'Proof' }).click();
	await page.waitForTimeout(250);
	ok('proof opens on the document that was open', (await proofText()).includes('bravo'));
	ok('and the sheet is not mounted at all', (await page.locator('.te-type').count()) === 0);

	await rows.filter({ hasText: 'Ephemeral 1' }).first().click();
	await page.waitForTimeout(250);
	const picked = await proofText();
	ok(
		'picking a row in PROOF sets the document picked',
		picked.includes('alpha') && !picked.includes('bravo'),
		JSON.stringify(picked.slice(0, 60))
	);

	await page.getByRole('button', { name: /^About Text Editor/ }).click();
	await page.waitForTimeout(250);
	ok('About puts the manual on it in PROOF', (await proofText()).includes('The marks'));

	const clearKey = page.getByRole('button', { name: /Clear|Sure/ });
	await clearKey.click();
	await clearKey.click();
	await page.waitForTimeout(250);
	ok(
		'and Clear empties it rather than only taking the name off',
		(await proofText()).trim() === 'Nothing set yet.',
		JSON.stringify(await proofText())
	);

	// Back to WRITE: the textarea is built fresh and filled from `text`, so the two cannot come
	// back disagreeing. This is also why the proof-mode path costs no undo — the stack it would
	// have preserved was destroyed on the way in.
	await page.getByRole('button', { name: 'Write' }).click();
	await page.waitForSelector('.te-type');
	await eq('the sheet comes back holding what the proof showed', value(), '');
	await rows.filter({ hasText: 'Ephemeral 1' }).first().click();
	await page.waitForTimeout(250);
	ok('and a note picked in proof kept its words', (await value()).includes('alpha'));
}

await browser.close();

// ── THE MIRROR INVARIANT, CROSS-ENGINE ───────────────────────────────────────
// The load-bearing claim of the whole margin: every source line wraps to the same number of rows
// in the mirror as it does in the textarea. If one line disagrees by a single row, every mark
// below it is off by a row — the gutter looks "drifted", and it drifts further the longer the
// document. It is the failure this app is most likely to have and the one least likely to be
// noticed in review, because it depends on the engine, the width and the exact text.
//
// So this runs in ALL THREE ENGINES, like `cards` does, and for the same reason: the bug is a
// line-breaking difference, and a Firefox-only suite has nothing to say about Safari. A missing
// engine FAILS loudly rather than skipping — a silent pass here would be worse than no test.
//
// The reference is a DETACHED textarea carrying the live one's computed typography at its content
// width, so the browser's own textarea line-breaker is what we compare against rather than a
// second guess at it. Getting that width right is the whole trick: getComputedStyle().width
// reports the BORDER-box width for a border-box element, and using it made the probe wrap at a
// wider measure and report mismatches that were purely the probe's own. clientWidth minus the
// horizontal padding is the reading that is correct in every engine.
{
	const { chromium: cr, webkit: wk, firefox: ff } = await import('playwright');
	// Lines engineered to end at many different measures, so at least some of them finish flush
	// against the edge at any given width — the case where one extra break opportunity in the
	// mirror (a stray trailing character, say) spills an empty row the textarea never makes.
	const STRESS = [
		'# A heading that runs on for a while to be sure it wraps at the wider measures too',
		'',
		'> A quotation of a length chosen to end very near the edge of a middling column here',
		'- a bullet whose text is long enough to wrap twice at the narrower widths under test',
		'1. an ordered item, also long, also wrapping, with punctuation — dashes, and “quotes”',
		'',
		'```js',
		'const flush = "a code line that is quite long and ends near the measure edge too!!";',
		'```',
		...Array.from({ length: 12 }, (_, i) => 'w'.repeat(i + 40) + ' tail ' + 'x'.repeat(i * 3))
	].join('\n');

	for (const [name, engine] of [
		['chromium', cr],
		['webkit', wk],
		['firefox', ff]
	]) {
		let b;
		try {
			b = await engine.launch();
		} catch {
			ok(
				`the mirror wraps like the textarea in ${name}`,
				false,
				'engine not installed — run: pnpm --filter home exec playwright install firefox chromium webkit'
			);
			continue;
		}
		for (const width of [1440, 1180, 900, 700, 420]) {
			const c = await b.newContext({ viewport: { width, height: 900 } });
			const p = await c.newPage();
			await p.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
			await p.waitForSelector('.te-type');
			await p.evaluate(() => document.fonts.ready);
			await p.locator('.te-type').fill(STRESS);
			await p.waitForTimeout(150);
			// BOTH measure states, and in WRITE — the cap only bites when the pane is the whole
			// window, and holding the text to a measure re-wraps it, which is precisely the kind of
			// change that could put the mirror and the textarea on different line breaks.
			// Below the phone breakpoint the Measure key is not in the bar at all — it has moved to
			// the flyout — and the cap cannot bind there anyway, because the pane is already
			// narrower than the measure. So the narrow widths test the default state only, and say
			// so rather than reaching for a control that is not there.
			for (const held of width > 820 ? [true, false] : [true]) {
				await p.evaluate(async (want) => {
					const key = (label) =>
						[...document.querySelectorAll('.te-rack button')].find(
							(b) => b.textContent.trim() === label
						);
					key('Write')?.click();
					await new Promise((r) => setTimeout(r, 150));
					if (document.querySelector('.te').classList.contains('te-measured') !== want)
						key('Measure')?.click();
					await new Promise((r) => setTimeout(r, 200));
				}, held);

				const r = await p.evaluate(() => {
					const ta = document.querySelector('.te-type');
					const cs = getComputedStyle(ta);
					const row = parseFloat(cs.lineHeight);
					const content = ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
					const probe = document.createElement('textarea');
					for (const k of [
						'fontFamily',
						'fontSize',
						'fontWeight',
						'lineHeight',
						'letterSpacing',
						'whiteSpace',
						'overflowWrap',
						'wordBreak',
						'tabSize',
						'textTransform',
						'fontKerning',
						'fontVariantLigatures',
						'textRendering',
						'wordSpacing'
					])
						probe.style[k] = cs[k];
					probe.style.cssText += `;box-sizing:content-box;width:${content}px;padding:0;border:0;height:0;position:absolute;left:-9999px;top:0;overflow:auto;resize:none;`;
					document.body.appendChild(probe);

					const lines = ta.value.split('\n');
					const mlines = [...document.querySelectorAll('.te-mline')];
					const bad = [];
					let prev = 0;
					for (let n = 1; n <= lines.length; n++) {
						probe.value = lines.slice(0, n).join('\n');
						const h = probe.scrollHeight;
						const taRows = Math.round((h - prev) / row);
						prev = h;
						const miRows = Math.round(mlines[n - 1].getBoundingClientRect().height / row);
						if (taRows !== miRows) bad.push({ n, textarea: taRows, mirror: miRows });
					}
					probe.remove();
					// The row must be a WHOLE number of pixels. On a fractional row the mirror's block
					// stack and the textarea's internal row stepping round to device pixels
					// independently, and the disagreement accumulates down the document.
					return { row, bad, integerRow: Number.isInteger(row) };
				});
				ok(
					`${name} @${width} ${held ? 'measured' : 'full width'}: every line wraps the same in the mirror as in the textarea`,
					r.bad.length === 0,
					JSON.stringify(r.bad)
				);
				if (held)
					ok(`${name} @${width}: the row is a whole number of pixels`, r.integerRow, `${r.row}px`);
			}
			await c.close();
		}
		await b.close();
	}
}

// An empty line still occupies a full row. It holds no text at all now — it used to carry a
// zero-width space for exactly this, and that character was one break opportunity the textarea
// did not have, so `min-height` does the job instead and the mirror's content matches the
// textarea's character for character.
{
	const b = await chromium.launch();
	const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
	await p.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
	await p.waitForSelector('.te-type');
	await p.locator('.te-type').fill('a\n\n\nb');
	await p.waitForTimeout(150);
	const hs = await p.$$eval('.te-mline', (ls) => ls.map((l) => l.getBoundingClientRect().height));
	ok(
		'an empty line still occupies a full row',
		hs.length === 4 && hs.every((h) => Math.abs(h - hs[0]) < 0.5),
		JSON.stringify(hs)
	);
	const zwsp = await p.$eval('.te-mirror', (el) => el.textContent.includes('​'));
	ok('and the mirror holds no characters the textarea lacks', !zwsp);
	await b.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
