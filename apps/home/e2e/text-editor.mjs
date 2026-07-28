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
	ok('and offers the way out', await page.locator('.head-actions .icon-btn').isVisible());
	// Every key the app has is in that one bar row, and nothing is left in the body.
	ok(
		'every key is in the bar',
		(await page.locator('.head-row .te-rack button').count()) === 17,
		`${await page.locator('.head-row .te-rack button').count()}`
	);
	ok('and none are left in the body', (await page.locator('.te button').count()) === 0);
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

await reset('a title');
await press('Heading, first level');
await eq('H1 marks the line', value(), '# a title');
await press('Heading, second level');
await eq('H2 replaces H1 rather than nesting inside it', value(), '## a title');
await press('Heading, second level');
await eq('H2 again takes it off', value(), 'a title');

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
	await phone.close();
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
			for (const held of [true, false]) {
				await p.evaluate(async (want) => {
					const key = (label) =>
						[...document.querySelectorAll('.te-rack button')].find(
							(b) => b.textContent.trim() === label
						);
					if (!document.querySelector('.te').classList.contains('te-write')) key('Write').click();
					await new Promise((r) => setTimeout(r, 150));
					if (document.querySelector('.te').classList.contains('te-measured') !== want)
						key('Measure').click();
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
