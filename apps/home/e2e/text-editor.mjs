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

/**
 * The WORKSPACE MENU — New, a different folder, and the pane's own hide. All three were keys on
 * the pane's head; they are behind the bar key that already means the workspace.
 */
/**
 * Reach one of the folder's own verbs. They were behind the bar's Workspace key, which held a menu
 * of three; that key is a TOGGLE for the pane now and the verbs are on the folder's own head, where
 * a file manager keeps them — so this right-clicks the head instead of pressing a key.
 *
 * `New note` is the exception and no longer lives on a menu at all: it is the Scratch head's `+`.
 */
async function fromWorkspace(name, pg = page) {
	if (/New note/i.test(name)) {
		await pg.locator('ul[aria-label="Scratch"]').first().waitFor();
		await pg.locator('.te-shelves .te-loose-add').first().click();
		await pg.waitForTimeout(250);
		return;
	}
	await pg.locator('.te-local .te-work-head').click({ button: 'right' });
	await pg.waitForTimeout(250);
	// `/^Open a/` rather than `/folder/` at the call sites, because the root's menu holds THREE
	// folder verbs now — open, make, close — and a loose match picks whichever is first in the DOM.
	await pg.locator('.popover-item').filter({ hasText: name }).first().click();
	await pg.waitForTimeout(250);
}

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
	// The corner holds ONE key now: Settings. Home, About, Install and the beta tag all went
	// behind it — none of them acts on the document, and a one-row bar cannot spend four
	// controls on chrome. The way out is inside it, and it leads to Apps.
	ok(
		'and offers the settings key',
		await page.locator('.icon-btn[aria-label="Settings"]').isVisible()
	);
	ok(
		'the corner is one key wide',
		(await page.locator('.head-actions .icon-btn').count()) === 1,
		`${await page.locator('.head-actions .icon-btn').count()}`
	);
	// Every key the app has is in that one bar row, and nothing is left in the body. Counted by
	// CLASS rather than by container: the keys live in two clusters — the scrolling strip and the
	// fixed right-hand tail — and `.tb` is what they share. The settings gear is `.icon-btn`, so
	// it is not among them.
	// FIFTEEN, down from eighteen: Copy, .md and Clear are on a document's own right-click menu
	// now, and .md is drawn in the bar only where the browser cannot write in place at all (this
	// engine can, so it is absent here — see the picker-less run further down, where it is back).
	ok(
		'every key is in the bar',
		(await page.locator('.head-row .tb').count()) === 15,
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
				marks: left('.te-rack .te-mark-key'),
				view: left('.te-tail [aria-label="View"] .tb'),
				doc: left('.te-tail [aria-label="The document"] .tb'),
				lastSep: seps[seps.length - 1],
				settings: left('.head-actions .icon-btn')[0]
			};
		});
		// Left to right, the bar tells the order of the work: bring a document in, mark it up,
		// choose how to look at it, then take it away.
		ok(
			// No rule after them any more: these two wear words and the strip beside them is
			// glyphs, which is already the whole of the difference.
			'the file keys lead the bar, ahead of the marks',
			Math.max(...geo.lead) < Math.min(...geo.marks),
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
			'with a rule between the document keys and the settings key',
			(!geo.doc.length || Math.max(...geo.doc) < geo.lastSep) && geo.lastSep < geo.settings,
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

// ── Clearing asks first, on the document's own menu ─────────────────────────
// Clear used to be a key in the bar acting on the sheet. It is a DOCUMENT'S verb now, on the
// right-click menu of the row it belongs to, so it can say which document it is about to empty.
// A scratch note is the case that works in every browser: it has no file behind it, so no
// permission and no handle stand between the menu item and the words.
{
	// No New needed: there is ALWAYS a scratch note, and at mount it is `Ephemeral 0` with the
	// sheet already on it. That is the point of the standing note — every document on the sheet
	// is a document in the pane, so every document on the sheet has these three verbs.
	//
	// The Scratch head carries a + as well, which is the short road to the same New that the
	// Workspace menu holds — at the head of the list it adds to. ELSEWHERE does not get one:
	// that shelf is a record of what you reached for, not a list you can ask to grow.
	{
		const heads = page.locator('.te-loose-head');
		ok(
			'the Scratch head offers a + and the Local shelf does not',
			(await page.locator('ul[aria-label="Scratch"]').count()) === 1 &&
				(await heads.first().locator('.te-loose-add').count()) === 1,
			`${await heads.count()} shelves`
		);
		await heads.first().locator('.te-loose-add').click();
		await page.waitForTimeout(300);
		await eq(
			'and it makes a note, on a blank sheet',
			page.locator('.te-work-row.on .te-work-file').textContent(),
			'Ephemeral 1'
		);
		await eq('with nothing on it', value(), '');
		// Back to the standing note for the cases below, which are about it. The LAST row is the
		// one the + just made — closing the first would take `Ephemeral 0` and leave its own
		// replacement behind, which is the same list with different words in it.
		await page.locator('ul[aria-label="Scratch"] .te-work-row').last().click({ button: 'right' });
		await page.waitForTimeout(200);
		await page.locator('.te-file-menu .popover-item', { hasText: /^Close$/ }).click();
		await page.waitForTimeout(200);
		await page.locator('.te-file-menu .popover-item', { hasText: /^Sure\?$/ }).click();
		await page.waitForTimeout(400);
	}

	await reset('keep me');
	await page.waitForTimeout(450); // the debounce that follows the sheet into the note

	const row = page.locator('.te-work-list .te-work-row').first();
	await eq('the pane opens with a standing scratch note', row.textContent(), 'Ephemeral 0');
	const item = () => page.locator('.te-file-menu .popover-item', { hasText: /^(Clear|Sure\?)$/ });
	await row.click({ button: 'right' });
	await page.waitForTimeout(150);
	ok('a document\u2019s menu offers Clear', (await item().count()) === 1);
	await item().click();
	await eq('the first press arms rather than clears', value(), 'keep me');
	await eq(
		'the item becomes the question',
		item()
			.textContent()
			.then((t) => t.trim()),
		'Sure?'
	);
	await item().click();
	await page.waitForTimeout(200);
	await eq('the second press empties the document', value(), '');
	ok('and the menu closes behind it', (await page.locator('.te-file-menu').count()) === 0);
	// The row says so. Every write in this pane you cannot otherwise see answers on the row —
	// renamed, moved, copied, cleared — and they all go through one mechanism now.
	ok(
		'the row says what happened',
		(await row.getAttribute('data-said')) === 'Cleared',
		JSON.stringify(await row.getAttribute('data-said'))
	);

	// COPY and SAVE A COPY stand with it. They are offered on every row in every browser —
	// reading a document needs no permission — where Clear is a write and is drawn only where
	// the platform will take one.
	await row.click({ button: 'right' });
	await page.waitForTimeout(150);
	const verbs = await page.locator('.te-file-menu .popover-item').allTextContents();
	ok(
		'the menu carries the three document verbs',
		verbs.slice(0, 3).join('|') === 'Copy|Save a copy|Clear',
		JSON.stringify(verbs)
	);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(150);
	// And none of the three is left in the bar.
	for (const gone of ['Copy', 'Clear']) {
		ok(
			`the bar no longer carries ${gone}`,
			(await page.getByRole('button', { name: gone, exact: true }).count()) === 0
		);
	}

	// CLOSING THE LAST ONE brings a standing note back rather than leaving an empty list. Closing
	// the only scratch note reads as clearing it, and the pane always has one.
	await row.click({ button: 'right' });
	await page.waitForTimeout(150);
	const close = () => page.locator('.te-file-menu .popover-item', { hasText: /^(Close|Sure\?)$/ });
	await close().click();
	await close().click();
	await page.waitForTimeout(300);
	ok(
		'closing the last note leaves a standing one behind it',
		(await page.locator('.te-work-list .te-work-row').allTextContents()).join(',') ===
			'Ephemeral 0',
		JSON.stringify(await page.locator('.te-work-list .te-work-row').allTextContents())
	);
	// AND THE SHEET IS THAT NOTE'S, not the closed one's. The standing note was MARKED open
	// without being put on the sheet: the row said `Ephemeral 0`, the sheet still held the words
	// of the note that had just been destroyed, and clicking the row did nothing at all — the app
	// thought that note was already open, because by its own markers it was.
	await eq('the standing note is on the sheet, not merely marked', value(), '');
	await eq('and the foot names it', page.locator('.te-lamp').textContent(), 'Ephemeral 0');
	ok(
		'with the row marked to match',
		(await page.locator('.te-work-row.on .te-work-file').textContent()) === 'Ephemeral 0'
	);
	await reset('');
}

// ── The settings flyout ──────────────────────────────────────────────────────
// Home, About, Install and the beta tag stood in the bar's corner as four separate things. None
// of them acts on the document and a dense bar has one row, so they are behind ONE key now — and
// the flyout it opens is drawn by the editor, from two keys that cannot own it (the gear here on
// a desk, the gear in the floating stack on a phone).
{
	// By CLASS and label rather than by role: the site's own Settings PLACE is a nav item called
	// Settings too, and a role query matches both.
	const gear = page.locator('.icon-btn[aria-label="Settings"]');
	ok('the corner offers a settings key', (await gear.count()) === 1);
	ok('and is shut to begin with', (await gear.getAttribute('aria-expanded')) === 'false');

	// Typed, not filled: this case is about the UNDO stack, and `reset` sets the value outright.
	await ta.click();
	await selectAll();
	await page.keyboard.type('scribble');

	await gear.click();
	await page.waitForTimeout(250);
	ok('pressing it opens the card', (await page.locator('.te-set-card').count()) === 1);
	ok('and the key says it is open', (await gear.getAttribute('aria-expanded')) === 'true');
	// The card is a POPOVER — puhig's shared one, the same surface the workspace's row menu uses.
	// Portalled to <body>, because `position: fixed` inside the panel's header is fixed to the
	// header rather than to the window and the app painted straight over it.
	ok(
		'the card is portalled clear of the panel',
		await page.evaluate(
			() => document.querySelector('.te-set-card')?.parentElement === document.body
		)
	);

	// ABOUT — the app's own manual page, put back on the sheet. It is the only documentation
	// this app has, which is why it is one press away rather than a link to somewhere else.
	const about = page.locator('.te-set-card .popover-item', { hasText: /^About$/ });
	ok('the flyout offers About', (await about.count()) === 1);
	await about.click();
	await page.waitForTimeout(200);
	ok('and closes behind it', (await page.locator('.te-set-card').count()) === 0);
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

	// APPS — the door out. It leads to the place this app is IN rather than to the front of the
	// site, and it is written LAST so it is furthest from where a hand starts.
	await gear.click();
	await page.waitForTimeout(250);
	const items = await page.locator('.te-set-card .popover-item').allTextContents();
	ok(
		'the flyout holds About and Apps, in that order',
		items[0].trim() === 'About' && items[items.length - 1].trim() === 'Apps',
		JSON.stringify(items)
	);
	ok(
		'and the bar no longer carries a way home of its own',
		(await page.getByRole('button', { name: 'Close and go home' }).count()) === 0
	);

	// ── THE VERSION ──────────────────────────────────────────────────────────
	// It was the beta tag's card, opened from a word in the bar. The tag is gone and the card is
	// a block at the foot of this flyout — the same component ($lib/VersionCard), so the two
	// cannot drift.
	ok(
		'the flyout carries all four positions',
		/^v0\.\d+\.\d+\.\d+$/.test((await page.locator('.ver-num').textContent()).trim()),
		await page.locator('.ver-num').textContent()
	);
	// The legend is what makes the number readable, and it has to name every position it
	// explains — a fourth figure with three words under it is worse than no legend at all.
	const scheme = (await page.locator('.ver-scheme').textContent()).trim();
	ok(
		'and a legend naming each of the four in order',
		scheme === 'collections · features · fixes · commits',
		JSON.stringify(scheme)
	);
	// Every line of the list carries the WHOLE version it landed in. Several features land in
	// one minor, so a column keyed on the first two numbers is a column of identical `0.9`s.
	const ats = await page.locator('.ver-at').allTextContents();
	ok(
		'and every recent line is dated to a full version',
		ats.length > 0 && ats.every((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a.trim())),
		JSON.stringify(ats)
	);
	// The column has to hold the whole version on ONE line: the list is read down the figures,
	// and a version that wraps takes its line's text with it.
	const wrapped = await page.evaluate(() =>
		[...document.querySelectorAll('.ver-at')].some((el) => el.scrollWidth > el.clientWidth + 1)
	);
	ok('the version column is wide enough for the fourth figure', !wrapped);
	ok(
		'and no beta tag is left in the bar',
		(await page.getByRole('button', { name: /is in beta/ }).count()) === 0
	);

	await page.keyboard.press('Escape');
	await page.waitForTimeout(250);
	ok('Escape shuts the flyout', (await page.locator('.te-set-card').count()) === 0);
	ok('and leaves the editor open behind it', (await page.locator('.te').count()) === 1);
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
	// The prefix is deliberately long. This folder's NAME is what the head shows, and one of the
	// cases below is the reveal that answers a clipped name — which needs a name that clips. The
	// head has more room since New, Change and Hide left it for the bar key's menu, and a short
	// `te-e2e-` name stopped clipping the day they went.
	const folder = dir.mkdtempSync(path.join(os.tmpdir(), 'te-e2e-a-workspace-with-a-long-name-'));
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
	// SCOPED ON THE POSITIVE CLASS. It used to be `.te-work-list:not(.te-loose-list)` — every list in
	// the pane draws `.te-work-list`, so the tree had to be described by what it is not. Four lists
	// draw it now (the folder, the drive and the two shelves) and a chain of exclusions is one
	// list away from being wrong every time. Each says what it IS: `.te-local-list`, `.te-drive-list`,
	// `.te-shelf-list`.
	const TREE = '.te-local-list';
	// A TREE, not a path list: sub-folders are rows of their own, folders before documents, and
	// what is inside one is indented under it rather than spelled out as a path on every line.
	// The folder's own name is stripped from the paths — it is the heading above the list, and
	// leaving it on would indent everything by a level to say it again.
	await eq(
		'a folder opens as a workspace tree, folders first',
		page.$$eval(`${TREE} .te-work-file`, (ns) => ns.map((n) => n.textContent).join(',')),
		'sub,gamma.md,alpha.md,beta.markdown,ignore.png,notes.txt'
	);
	// IT LISTS WHAT IT CANNOT OPEN, greyed out and inert — it used to drop those rows, and a folder
	// of eleven things shown as a folder of three left the reader unable to tell whether the app
	// had failed or the files were never there. The claim is no longer "it is absent" but "it is
	// present and plainly does nothing".
	ok(
		'and shows what it cannot open, inert',
		await page.evaluate((sel) => {
			const row = [...document.querySelectorAll(`${sel} .te-work-row`)].find((r) =>
				r.textContent.includes('ignore.png')
			);
			return (
				!!row &&
				row.classList.contains('inert') &&
				row.getAttribute('aria-disabled') === 'true' &&
				parseFloat(getComputedStyle(row).opacity) < 1
			);
		}, TREE)
	);
	ok(
		'saying why, on the row itself',
		(await page.locator(`${TREE} .te-work-row.inert`).first().getAttribute('title')).includes(
			'only opens text'
		)
	);
	// …and it is not counted. The tally answers "how much is in here for me", and a folder of
	// forty photographs and one note is not a folder of forty-one.
	ok(
		'and never counted in a tally',
		(await page.locator('.te-local .te-work-count').textContent()).trim() === '4',
		await page.locator('.te-local .te-work-count').textContent()
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
		// PER HEAD, not across the pane. There are four lists in here and every one has a head of
		// its own, so a flat query collects children from three rows at three heights and reports
		// a spread that is the pane's layout rather than any head's. The claim is about ONE head:
		// the things in it sit on one line. It is checked of every head there is.
		const spreads = await page.evaluate(() =>
			[...document.querySelectorAll('.te-work-head')].map((head) => {
				// By CENTRE, not by top edge: a word, a figure and a key are different heights, so a
				// shared row shows as a shared middle.
				// OUT-OF-FLOW CHILDREN ARE SKIPPED, and by POSITION rather than by class name. Two of
				// them hang under a head now — the clipped-name reveal and the card saying where the
				// list lives — and naming each one here meant the assertion broke the day a third
				// arrived, reporting "the head is three rows tall" about a head that is 30px.
				const mids = [...head.children]
					.filter((e) => getComputedStyle(e).position !== 'absolute')
					.map((e) => {
						const r = e.getBoundingClientRect();
						return Math.round(r.top + r.height / 2);
					});
				return Math.max(...mids) - Math.min(...mids);
			})
		);
		ok(
			'the name and the tally share one row, in every head there is',
			spreads.length >= 2 && spreads.every((d) => d <= 2),
			JSON.stringify(spreads)
		);
		ok('with no second row left behind', (await page.locator('.te-work-acts').count()) === 0);
		// And no KEYS in it at all. New, Change and Hide moved to the bar key's menu — three
		// controls sharing 250px with the one thing in the row you cannot work out from anywhere
		// else, which is the folder's name.
		ok('and no keys left in the head', (await page.locator('.te-work-head .tb').count()) === 0);
		// The tally comes LAST, past the keys, because it heads a column: every folder row in the
		// tree carries the same figure at the same right edge.
		const edges = await page.evaluate(() => {
			const r = (s) => Math.round(document.querySelector(s).getBoundingClientRect().right);
			// The FOLDER'S head and the folder's rows — scoped, because the shelves have heads and
			// tallies of their own now and an unscoped query would compare one list's head with
			// another list's rows.
			return { head: r('.te-local .te-work-count'), row: r('.te-local-list .te-work-tally') };
		});
		ok(
			'and the folder tally lines up with the row tallies',
			Math.abs(edges.head - edges.row) <= 1,
			JSON.stringify(edges)
		);

		// The folder's name is made long on purpose (see the mkdtemp above), so this is
		// deterministic rather than a case that depends on the machine's temp path.
		ok(
			'a name too long for the row is clipped',
			await page.evaluate(() => {
				// The FOLDER'S name. `Scratch` is a head too and it fits in any row, so an unscoped
				// query answers about the wrong one.
				const el = document.querySelector('.te-local .te-work-name');
				return el.scrollWidth > el.clientWidth + 1;
			})
		);
		ok('so a reveal is drawn for it', (await page.locator('.te-work-full').count()) === 1);
		await eq(
			'shut until it is asked for',
			page.locator('.te-work-full').evaluate((e) => getComputedStyle(e).opacity),
			'0'
		);
		await page.locator('.te-local .te-work-name').hover();
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
			const head = await page.locator('.te-local .te-work-head').boundingBox();
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
		// Pointing at the TALLY must not explain the folder — the reveal belongs to the name, and it
		// hangs below the row, so anything else in the row opening it would be a flicker.
		await page.locator('.te-local .te-work-head .te-work-count').hover();
		await page.waitForTimeout(250);
		await eq(
			'pointing at the tally does not open it',
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
		const TREE = '.te-local-list';
		const outside = dir.mkdtempSync(path.join(os.tmpdir(), 'te-out-'));
		dir.writeFileSync(path.join(outside, 'elsewhere.md'), '# From elsewhere');

		// The suite opened alpha.md by HAND near the top, long before the folder existed. It is
		// still on the shelf and still one click away, which is the whole point of the thing.
		await eq(
			'a file opened by hand is still on the shelf, several acts later',
			page
				.locator('ul[aria-label="Local"] .te-work-file')
				.allTextContents()
				.then((t) => t.join(',')),
			'alpha.md'
		);
		await page.setInputFiles('.te-picker >> nth=0', path.join(outside, 'elsewhere.md'));
		await page.waitForTimeout(700);
		await eq(
			'a second one goes to the FRONT — the order is the order you reached for them',
			page
				.locator('ul[aria-label="Local"] .te-work-file')
				.allTextContents()
				.then((t) => t.join(',')),
			'elsewhere.md,alpha.md'
		);
		ok(
			'marked as the one on the sheet',
			(await page.locator('ul[aria-label="Local"] .te-work-row.on').count()) === 1
		);
		ok('and the tree marks nothing', (await page.locator(`${TREE} .te-work-row.on`).count()) === 0);
		// Above the tree, and a shade off the sheet — that shading is the whole of how it says it
		// is a different kind of list.
		{
			const geo = await page.evaluate(() => ({
				shelf: document.querySelector('.te-loose').getBoundingClientRect().bottom,
				tree: document.querySelector('.te-local-list').getBoundingClientRect().top,
				shelfBg: getComputedStyle(document.querySelector('.te-loose')).backgroundColor,
				paneBg: getComputedStyle(document.querySelector('.te-work')).backgroundColor
			}));
			ok('it stands above the tree', geo.shelf <= geo.tree + 1, JSON.stringify(geo));
			ok('shaded off the pane it sits in', geo.shelfBg !== geo.paneBg, JSON.stringify(geo));
		}
		// Opening a tree row leaves the shelf standing — it is a shelf, not a mode.
		await page.getByRole('treeitem', { name: 'beta.markdown' }).click();
		await page.waitForTimeout(700);
		ok(
			'a tree row leaves the shelf standing',
			(await page.locator('ul[aria-label="Local"]').count()) === 1
		);
		ok(
			'and takes the mark off it',
			(await page.locator('ul[aria-label="Local"] .te-work-row.on').count()) === 0
		);
		ok('marking the tree instead', (await page.locator(`${TREE} .te-work-row.on`).count()) === 1);
		// A shelf row opens again by re-READING — the shelf holds where a document came from, not
		// its text. There is one sheet in this editor and these are not buffers.
		await page.locator('ul[aria-label="Local"] .te-work-row').first().click();
		await page.waitForTimeout(700);
		await eq('a shelf row opens again', value(), '# From elsewhere');
		// Its menu holds the three verbs every document has, and then CLOSE — which acts on the
		// LIST rather than on the disk, and is why it is offered in every browser where Rename and
		// Delete are not.
		await page.locator('ul[aria-label="Local"] .te-work-row').first().click({ button: 'right' });
		await page.waitForTimeout(300);
		await eq(
			'a shelf row offers Close, and nothing that touches the disk',
			page
				.locator('.te-file-menu [role=menuitem]')
				.allTextContents()
				.then((t) => t.join(',').trim()),
			'Copy,Save a copy,Close'
		);
		await page.locator('.te-file-menu [role=menuitem]', { hasText: /^Close$/ }).click();
		await page.waitForTimeout(500);
		await eq(
			'Close takes that row off and leaves the rest',
			page
				.locator('ul[aria-label="Local"] .te-work-file')
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
		'sub,alpha.md,beta.markdown,ignore.png,notes.txt'
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
			'sub,gamma.md,alpha.md,beta.markdown,ignore.png,notes.txt'
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

	// THE WORKSPACE KEY IS A TOGGLE. It held a menu of three and every one of them had a better
	// home: New is the Scratch head's `+`, and the folder's own verbs are on the folder's own row.
	// What is left is the thing the key was named for, with no menu between the press and the result.
	const workKey = page.getByRole('button', { name: 'Workspace', exact: true });
	await workKey.click();
	await page.waitForTimeout(250);
	ok('the Workspace key hides the pane', (await page.locator('.te-work').count()) === 0);
	await workKey.click();
	await page.waitForTimeout(250);
	ok('and shows it again', (await page.locator('.te-work').count()) === 1);
	ok('and holds no menu at all', (await page.locator('.te-work-menu').count()) === 0);
	ok(
		'nor a caret, which would promise one',
		(await page
			.locator('.tb')
			.filter({ hasText: 'Workspace' })
			.locator('.te-caret-down')
			.count()) === 0
	);
	ok(
		'without forgetting which document is open',
		(await page.locator('.te-work-row.on').count()) === 1
	);

	// ABOUT forgets the file too, and for the same reason: the manual page is not the document
	// that was open, and a name left behind would point Save at a file it would overwrite. It is
	// in the settings flyout now, so this goes through the gear.
	await page.locator('.icon-btn[aria-label="Settings"]').click();
	await page.waitForTimeout(250);
	await page.locator('.te-set-card .popover-item', { hasText: /^About$/ }).click();
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
	// Put the file back on the sheet, and check the pane came back to it.
	await page.getByRole('treeitem', { name: 'beta.markdown' }).click();
	await page.waitForTimeout(300);
	ok(
		'the row is marked again',
		(await page.locator('.te-work-row.on .te-work-file').textContent()) === 'beta.markdown'
	);

	// CLEAR is not offered here at all. This workspace came from a `webkitdirectory` pick, which
	// hands over Files and no handles, so there is nothing to write through — and this app does
	// not draw a key that cannot do what it says. (The Chromium run below, against a real
	// directory handle, is where Clear on a tree row is exercised.)
	await page.getByRole('treeitem', { name: 'beta.markdown' }).click({ button: 'right' });
	await page.waitForTimeout(200);
	{
		const verbs = await page.locator('.te-file-menu .popover-item').allTextContents();
		ok(
			'a read-only workspace offers Copy and Save a copy, and no Clear',
			verbs.includes('Copy') && verbs.includes('Save a copy') && !verbs.includes('Clear'),
			JSON.stringify(verbs)
		);
	}
	await page.keyboard.press('Escape');
	await page.waitForTimeout(150);

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
	// Clipboard permission, because the Copy assertion below READS the clipboard back rather than
	// trusting the row's word for it.
	const w = await browser.newContext({
		viewport: { width: 1400, height: 900 },
		permissions: ['clipboard-read', 'clipboard-write']
	});
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
	// The folder's verbs are on the folder's own head now — the bar key is a toggle for the pane.
	await wp.locator('.te-local .te-work-head').click({ button: 'right' });
	await wp.waitForTimeout(200);
	await wp
		.locator('.popover-item')
		.filter({ hasText: /^Open a/ })
		.first()
		.click();
	await wp.waitForTimeout(700);

	// The TREE, scoped: the pane also holds the Scratch shelf, which always has a standing note
	// in it, and a bare `.te-work-file` counts that too.
	const TREE_FILES = '.te-local-list .te-work-file';
	ok(
		'a writable folder walks into its sub-folders and lists what it cannot read',
		(await wp.locator(TREE_FILES).allTextContents()).join(',') ===
			'drafts,gamma.md,alpha.md,beta.md,notes.txt,skip.png',
		JSON.stringify(await wp.locator(TREE_FILES).allTextContents())
	);

	// EVERY HEAD IS THE SAME HEAD. Four lists in this pane, each with one on top of it, and one of
	// them set differently reads as a subheading of whatever is above rather than as the top of its
	// own list. The shelves were the muted running-head voice, which was fine while the folder's
	// name sat at the top of the pane where nothing could be compared to it.
	ok(
		'every list in the pane is headed the same way',
		await wp.evaluate(() => {
			const names = [...document.querySelectorAll('.te-work-head .te-work-name')];
			if (names.length < 2) return false;
			const set = (el) => {
				const c = getComputedStyle(el);
				return [c.fontWeight, c.fontSize, c.color, c.textTransform].join('|');
			};
			return names.every((n) => set(n) === set(names[0]));
		})
	);
	// THE PANE IS THE SCROLLER. Each list scrolling in its own box would be four scrollbars and a
	// folder you could not reach because a list you were not looking at had taken the height.
	ok(
		'the pane scrolls, and its lists do not',
		await wp.evaluate(() => {
			const pane = document.querySelector('.te-work');
			const lists = [...document.querySelectorAll('.te-work-list')];
			return (
				getComputedStyle(pane).overflowY === 'auto' &&
				lists.length > 0 &&
				lists.every((l) => getComputedStyle(l).overflowY === 'visible')
			);
		})
	);
	ok(
		'and it actually reaches the bottom of a workspace taller than it is',
		await wp.evaluate(async () => {
			const pane = document.querySelector('.te-work');
			if (pane.scrollHeight <= pane.clientHeight) return true; // nothing to prove
			pane.scrollTop = pane.scrollHeight;
			await new Promise((r) => requestAnimationFrame(r));
			return pane.scrollTop > 0;
		})
	);

	// PRESSING the verbs, not only counting them. Every assertion about this menu checked what it
	// OFFERED, and none of them pressed anything — so Copy and Save a copy were both broken for as
	// long as they have existed and the suite was green throughout. `{@const doc = menuDoc}` is a
	// derivation rather than a snapshot, so closing the menu before calling the verb handed it a
	// null: nothing on the clipboard, nothing downloaded, nothing said on the row, and a TypeError
	// in a console nobody had open.
	{
		await wp.getByRole('treeitem', { name: 'alpha.md' }).click({ button: 'right' });
		await wp.waitForTimeout(250);
		await wp
			.locator('.popover-item')
			.filter({ hasText: /^Copy$/ })
			.click();
		await wp.waitForTimeout(600);
		await eq(
			'Copy says so on the row it acted on',
			wp.locator('.te-local-list .te-work-row[data-said]').getAttribute('data-said'),
			'Copied'
		);
		// READ BACK, not taken on the row's word: what the seed wrote into that file, which is also
		// proof the verb went to the STORE rather than to whatever happened to be on the sheet.
		await eq(
			'and the document is actually on the clipboard',
			wp.evaluate(() => navigator.clipboard.readText()),
			'# alpha.md'
		);
		// SAVE A COPY hands the browser a download. It is the only way out of an engine that cannot
		// write in place, so "it fired at all" is the whole assertion.
		await wp.getByRole('treeitem', { name: 'alpha.md' }).click({ button: 'right' });
		await wp.waitForTimeout(250);
		const falling = wp.waitForEvent('download', { timeout: 6000 }).catch(() => null);
		await wp
			.locator('.popover-item')
			.filter({ hasText: /Save a copy/ })
			.click();
		const got = await falling;
		ok(
			'Save a copy hands the browser a file',
			!!got && got.suggestedFilename() === 'alpha.md',
			got ? got.suggestedFilename() : 'no download'
		);
	}

	// THE HEAD BELONGS TO ITS LIST. It used to be pinned to the top of the pane, above the shelves
	// and above the drive, while the rows it heads sat at the bottom — so a folder announced itself
	// three lists away from the first thing inside it, and the row under its name belonged to
	// something else entirely.
	ok(
		"the folder's head is inside the folder's own section",
		(await wp.locator('.te-local .te-work-head').count()) === 1 &&
			(await wp.locator('.te-local .te-local-list').count()) === 1
	);
	ok(
		'and stands immediately above its own rows, with nothing between',
		await wp
			.locator('.te-local .te-work-head')
			.evaluate((el) => el.nextElementSibling?.classList.contains('te-local-list') ?? false)
	);

	await wp.getByRole('treeitem', { name: 'alpha.md' }).click();
	await wp.waitForTimeout(600);
	ok(
		'and a SAVE key appears, which it does not without a handle',
		(await wp.getByRole('button', { name: /^Save/ }).count()) === 1
	);
	// The download key is NOT in the bar here. It is drawn only where the browser cannot save in
	// place at all — in Chromium a copy is Save a copy, on the document's own menu — so this
	// engine, with a real handle open, gets Save and nothing beside it.
	ok(
		'and no download key beside it, because Save is the way out here',
		(await wp.getByRole('button', { name: '.md', exact: true }).count()) === 0
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

	// A SAVE THAT DID NOT HAPPEN SAYS SO. This is the one write in the app whose failure leaves
	// nothing on screen to notice — the words are still on the sheet either way — so the key is the
	// only thing that can tell you, and for a long time it said nothing at all.
	//
	// The failure is FORCED by making `createWritable` throw the DOMException the spec defines for
	// a file that is not there. Deleting the file for real does not work and the reason is worth
	// recording: `createWritable` on a handle whose entry has been removed RE-CREATES it in OPFS —
	// measured, right here — so the save succeeds and the file comes back. What is under test is
	// this app's handling of the exception, and that is what is raised.
	await wp.evaluate(() => {
		window.__realWritable = FileSystemFileHandle.prototype.createWritable;
		FileSystemFileHandle.prototype.createWritable = async function () {
			throw new DOMException('no such file', 'NotFoundError');
		};
	});
	await wp.locator('.te-type').fill('# Alpha refused');
	await wp.waitForTimeout(200);
	await wp.getByRole('button', { name: /^Save/ }).click();
	await wp.waitForTimeout(400);
	ok(
		'a refused save says which way it was refused',
		(await wp.locator('.tb.lost').innerText()).trim().toUpperCase() === 'GONE',
		await wp
			.locator('.tb.lost')
			.innerText()
			.catch(() => 'no .lost key at all')
	);
	ok(
		'and wears the refusal ink, not the emerald that means it landed',
		(await wp.locator('.tb.lost').count()) === 1 && (await wp.locator('.tb.done').count()) === 0
	);
	ok(
		'which is the ruby token rather than a colour of its own',
		// `--ruby` is a `light-dark()`, so its DECLARED value cannot be compared against a
		// computed one. It is resolved through a throwaway element that wears it, which is the only
		// way to ask the browser what it actually came out as — and checked against the emerald in
		// the same breath, because the whole claim is that these two are not the same answer.
		await wp.locator('.tb.lost').evaluate((el) => {
			const wear = (value) => {
				const probe = document.createElement('span');
				probe.style.color = value;
				el.append(probe);
				const out = getComputedStyle(probe).color;
				probe.remove();
				return out;
			};
			const got = getComputedStyle(el).color;
			return got === wear('var(--ruby)') && got !== wear('var(--emerald)');
		})
	);
	ok(
		'and nothing was written, which is the whole point of saying so',
		(await wp.evaluate(async () => {
			const root = await navigator.storage.getDirectory();
			return (await (await root.getFileHandle('alpha.md')).getFile()).text();
		})) === '# Alpha changed'
	);
	await wp.evaluate(() => {
		FileSystemFileHandle.prototype.createWritable = window.__realWritable;
	});
	await wp.getByRole('button', { name: /^Save/ }).click();
	await wp.waitForTimeout(400);
	ok(
		'and the next save, which works, says Saved again',
		(await wp.locator('.tb.done').count()) === 1 && (await wp.locator('.tb.lost').count()) === 0
	);
	ok(
		'writing what the refused one could not',
		(await wp.evaluate(async () => {
			const root = await navigator.storage.getDirectory();
			return (await (await root.getFileHandle('alpha.md')).getFile()).text();
		})) === '# Alpha refused'
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
			wp.locator('ul[aria-label="Local"] .te-work-file').last().textContent(),
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
		//
		// OPENED WITHOUT A VERSION, deliberately. A reader wants whatever version is on disk; naming
		// one makes this assertion a second opinion about the schema, and it fails with a
		// VersionError the day the app adds a store — which is exactly what happened when the vault
		// arrived and took the database to 2. The app owns the version. This only reads.
		ok(
			'the shelf is remembered, handles and all',
			await wp.evaluate(
				() =>
					new Promise((resolve) => {
						const req = indexedDB.open('ksh:text-editor');
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
	// own above the Local shelf — and it is the ONE kind of document this pane holds the text of,
	// because there is nowhere to read it back from.
	{
		await fromWorkspace('New note', wp);
		await wp.waitForTimeout(150);
		ok('New asks for no name', (await wp.locator('.te-work-field').count()) === 0);
		// `.te-loose .te-work-name`, not `.te-loose-name`: a shelf's title is set as every other head
		// in this pane is now, so it wears the same class and is told apart by the block it is in.
		ok(
			'and puts a scratch document on a shelf of its own, above the Local shelf',
			(await wp.locator('.te-loose .te-work-name').allTextContents()).join(',') === 'Scratch,Local',
			JSON.stringify(await wp.locator('.te-loose .te-work-name').allTextContents())
		);
		// The LAST row: the shelf opens with a standing `Ephemeral 0`, so what New made is the one
		// under it. Newest last, which is the order this list has always kept.
		ok(
			'named for you',
			(await wp.locator('ul[aria-label="Scratch"] .te-work-file').last().textContent()) ===
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
		await wp.locator('ul[aria-label="Scratch"] .te-work-row').last().click();
		await wp.waitForTimeout(600);
		ok(
			'and the scratch note still has its words',
			(await wp.locator('.te-type').inputValue()) === 'words that live nowhere else',
			await wp.locator('.te-type').inputValue()
		);
		// Closing one is the end of those words, so it asks twice — exactly as Clear does.
		await wp.locator('ul[aria-label="Scratch"] .te-work-row').last().click({ button: 'right' });
		await wp.waitForTimeout(300);
		// Named rather than "the only item": the menu carries Copy, Save a copy and Clear above it
		// now — a scratch note is a document like any other, and Close is what is special about it.
		const item = wp.locator('.te-file-menu [role=menuitem]', { hasText: /^(Close|Sure\?)$/ });
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
		await fromWorkspace('New note', wp);
		await wp.waitForTimeout(150);
		{
			const x = wp.locator('ul[aria-label="Scratch"] .te-eph-close').last();
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
			// By the shelf's LABEL, not by position: two shelves draw the same rows, and asking the
			// first one by position is asking whichever happens to be on top.
			// ONE row left, not none: the pane always keeps a scratch note, so closing the last one
			// leaves a standing `Ephemeral 0` rather than an empty list.
			ok(
				'the second press closes the note',
				(await wp.locator('ul[aria-label="Scratch"] .te-work-file').allTextContents()).join(',') ===
					'Ephemeral 0',
				JSON.stringify(await wp.locator('ul[aria-label="Scratch"] .te-work-file').allTextContents())
			);
		}
		// The order of the scratch list is YOURS — the tree is alphabetical because a folder is,
		// and the shelf is by recency because that is what it means, but these are notes you made.
		// Two fresh ones, under the standing note the list always keeps.
		const scratch = 'ul[aria-label="Scratch"]';
		await fromWorkspace('New note', wp);
		await wp.waitForTimeout(300);
		await fromWorkspace('New note', wp);
		await wp.waitForTimeout(150);
		await eq(
			'two scratch notes stand in the order they were made',
			wp
				.locator(`${scratch} .te-work-file`)
				.allTextContents()
				.then((t) => t.join(',')),
			'Ephemeral 0,Ephemeral 1,Ephemeral 2'
		);
		await wp.dragAndDrop(`${scratch} >> text=Ephemeral 2`, `${scratch} >> text=Ephemeral 1`);
		await wp.waitForTimeout(500);
		await eq(
			'and one dragged onto the other takes its place',
			wp
				.locator(`${scratch} .te-work-file`)
				.allTextContents()
				.then((t) => t.join(',')),
			'Ephemeral 0,Ephemeral 2,Ephemeral 1'
		);
		// Down to the standing note for what follows — closing the last one always leaves that.
		for (const _ of [0, 1, 2]) {
			await wp.locator(`${scratch} .te-work-row`).first().click({ button: 'right' });
			await wp.waitForTimeout(300);
			const closeItem = wp.locator('.te-file-menu [role=menuitem]', {
				hasText: /^(Close|Sure\?)$/
			});
			await closeItem.click();
			await wp.waitForTimeout(200);
			await closeItem.click();
			await wp.waitForTimeout(400);
		}

		// CLOSING THE OPEN ONE LANDS ON ANOTHER NOTE, the way closing a tab does — the sheet used
		// to keep the closed note's words with no row marked anywhere, which is a document the
		// workspace has never heard of and therefore one with no Copy, no Save a copy and no
		// Clear.
		ok(
			'and the second press takes it, leaving the standing note',
			(await wp.locator(`${scratch} .te-work-file`).allTextContents()).join(',') === 'Ephemeral 0',
			JSON.stringify(await wp.locator(`${scratch} .te-work-file`).allTextContents())
		);
	}

	// ── A SCRATCH NOTE BECOMES A FILE ────────────────────────────────────────
	// The one way a document is created on disk now that New makes a note rather than a file —
	// and the right way round: you write the thing first and decide it is worth keeping second.
	{
		await fromWorkspace('New note', wp);
		await wp.waitForTimeout(150);
		await wp.locator('.te-type').fill('# worth keeping');
		await wp.waitForTimeout(400);
		ok(
			'a scratch note offers Save once a writable folder is open',
			(await wp.getByRole('button', { name: /^Save/ }).count()) === 1
		);
		// The NAME IS READ rather than written down. The sequence never reuses a number — a name
		// that came back would open the door to two rows called the same thing — so which
		// `Ephemeral N` this is depends on how many the cases above made, and pinning it here
		// would make every one of them load-bearing for this one.
		const noteName = (await wp.locator('.te-lamp').textContent()).trim();
		await eq(
			'and says where it would go',
			wp.getByRole('button', { name: /^Save/ }).getAttribute('title'),
			`File this note in the folder as ${noteName}.md`
		);
		await wp.getByRole('button', { name: /^Save/ }).click();
		await wp.waitForTimeout(700);
		ok(
			'Save files it in the folder',
			await wp.evaluate(async (name) => {
				const root = await navigator.storage.getDirectory();
				const f = await (await root.getFileHandle(`${name}.md`)).getFile();
				return (await f.text()) === '# worth keeping';
			}, noteName),
			noteName
		);
		// The ROW leaves the scratch list — the shelf itself stays, because it always does now and
		// the standing note is still in it.
		ok(
			'it leaves the scratch shelf',
			!(await wp.locator('ul[aria-label="Scratch"] .te-work-file').allTextContents()).includes(
				noteName
			),
			JSON.stringify(await wp.locator('ul[aria-label="Scratch"] .te-work-file').allTextContents())
		);
		ok(
			'and the sheet is holding a real file now',
			(await wp.locator('.te-lamp').textContent()).trim() === `${noteName}.md`
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
		await fromWorkspace(/^Open a/, wp);
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
		// One mechanism answers for all four verbs now — renamed, moved, copied, cleared — and the
		// word is carried on the row rather than written into a rule per verb.
		ok(
			'the renamed row says Saved',
			(await wp.locator('.te-work-row[data-said="Saved"]').count()) === 1
		);
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
		const TREE = '.te-local-list';
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
		ok(
			'the moved row says so',
			(await wp.locator('.te-work-row[data-said="Moved"]').count()) === 1
		);
		ok(
			'in the accent, not the emerald',
			await wp.locator('.te-work-row[data-said="Moved"]').evaluate((el) => {
				const c = getComputedStyle(el, '::after').color.match(/\d+/g).map(Number);
				return c[2] > c[1] + 40;
			})
		);
		await wp.waitForTimeout(500);
		// The whole path is on the row for the hover — indenting says where a document is only
		// while the folder rows above it are still on screen, which stops being true the moment
		// the list scrolls. Asked here because this is the first nested document the suite has.
		// The whole path, under a LEADING ELLIPSIS and behind the word Local: the File System Access
		// API exposes no absolute path, so `drafts/beta.md` alone read as one and was not. See
		// `whereIs` in $lib/TextEditor.
		await eq(
			'a nested row carries its whole location for the hover',
			wp.getByRole('treeitem', { name: 'beta.md' }).getAttribute('title'),
			'Local · …/drafts/beta.md'
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
		// The FOLDER'S head, which is the root's drop target. The shelves have heads too and neither
		// of them takes a document.
		await wp.dragAndDrop(`${TREE} >> text=beta.md`, '.te-local .te-work-head');
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
		await fromWorkspace(/^Open a/, wp);
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
	// anything, so they all go to the shared floating key at the bottom-left where every other app
	// on the site puts its phone controls.
	// THERE IS NO BAR AT ALL AT THIS WIDTH. It kept the two view keys for a while, which spent the
	// row furthest from the thumbs — with the software keyboard at the opposite end — on two words;
	// they are in the flyout with everything else now, and the sheet has the row back.
	ok('a phone draws no bar at all', (await p.locator('.surface-head').count()) === 0);
	ok('and no rack in one', (await p.locator('.te-rack').count()) === 0);
	ok('and a floating key holds everything', (await p.locator('.fkey').count()) === 1);
	// The desk starts at the very top: with no head there is no adjacent sibling for the body's
	// reserve to match, so the height comes back on its own rather than by a second rule.
	const top = await p.evaluate(() =>
		Math.round(document.querySelector('.te-desk').getBoundingClientRect().top)
	);
	ok('and the desk starts at the top of the app', top <= 1, `${top}px`);
	// EVERY FLYOUT KEY IS NAMED. A column of eleven identical discs is a puzzle, and the marks
	// alone cannot tell Save from Copy from Save a copy. They line up on one floor, so the stack
	// reads as a menu rather than as a ragged pile.
	await p.locator('.fkey').first().click();
	await p.waitForTimeout(400);
	const pills = await p.evaluate(() =>
		[...document.querySelectorAll('.fkey-stack .icon-btn')].map((e) => ({
			word: (e.querySelector('.te-fkey-word')?.textContent ?? '').trim(),
			w: Math.round(e.getBoundingClientRect().width),
			h: Math.round(e.getBoundingClientRect().height)
		}))
	);
	ok(
		'every key in the flyout carries its name',
		pills.length > 0 && pills.every((b) => b.word.length > 0),
		JSON.stringify(pills)
	);
	ok(
		'and they share one width and one row height',
		new Set(pills.map((b) => b.w)).size === 1 && pills.every((b) => b.h === 40),
		JSON.stringify(pills)
	);
	// THE VIEW KEYS ARE AMONG THEM, and NEAREST THE THUMB. Asserted in DOM order, which is not
	// the order they are seen in: the stack is `column-reverse`, so the first child is drawn at
	// the BOTTOM, closest to the key that opened it. Switching between the sheet and the proof is
	// what a phone does most, so it gets the shortest reach.
	ok(
		'the view keys came down into the flyout, nearest the thumb',
		pills
			.slice(0, 2)
			.map((b) => b.word)
			.join(',') === 'Write,Proof',
		JSON.stringify(pills.map((b) => b.word))
	);
	// Folded by pressing the KEY again, not the scrim: the scrim runs under the whole flyout, so a
	// click at its centre lands on whatever mark of the card happens to be there — measured, it hit
	// Italic and Playwright waited thirty seconds for a scrim that was never going to receive it.
	await p.locator('.fkey').first().click();
	await p.waitForTimeout(300);
	// Nothing may be drawn TWICE — the bar dropping a key and the flyout adding it is one move,
	// and a stale copy left in the bar is the failure this catches. Counted in the DOM rather
	// than by role: the flyout is parked and hidden while it is shut, and an accessibility query
	// cannot see anything in it until it opens.
	// Matched on the ACCESSIBLE NAME, which is the visible word now that every flyout key carries
	// one — an aria-label beside visible text is a second name for the same control, and the two
	// drift. So this reads whichever the button actually has.
	const drawn = (label) =>
		p.evaluate(
			(l) =>
				[...document.querySelectorAll('button')].filter((el) =>
					(el.getAttribute('aria-label') || el.textContent || '').trim().startsWith(l)
				).length,
			label
		);
	ok('Settings is drawn once, in the flyout', (await drawn('Settings')) === 1);
	ok(
		'inside the stack rather than the bar',
		(await p.locator('.fkey-stack .icon-btn', { hasText: /^Settings$/ }).count()) === 1
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
	// SIX keys where the browser can write — the two view keys, Open, Workspace, the measure and
	// Settings — and seven where it cannot, which is where `.md` joins them. Copy, .md and Clear
	// left for the row menu; About, Install and the door out went behind the gear.
	const discCount = await p.locator('.fkey-stack .icon-btn').count();
	ok('with every key as a stack', discCount === 6 || discCount === 7, `${discCount} discs`);
	// ORDER. The stack is column-reverse, so the LAST key written is the top one — and Settings
	// is last on purpose: it holds the one key in the app that leaves it, which asks nothing
	// first, and the bottom of the stack is where a thumb lands.
	const discs = await p.evaluate(() =>
		[...document.querySelectorAll('.fkey-stack .icon-btn')].map((el) =>
			(el.querySelector('.te-fkey-word')?.textContent || el.getAttribute('aria-label') || '')
				.split(' —')[0]
				.trim()
		)
	);
	ok('Settings is furthest from the thumb', discs.at(-1) === 'Settings', JSON.stringify(discs));
	const rise = await p.evaluate(() => {
		const d = [...document.querySelectorAll('.fkey-stack .icon-btn')];
		return d.map((el) => Math.round(el.getBoundingClientRect().top));
	});
	ok(
		'and the stack rises, so last written is highest on screen',
		rise.every((t, i) => i === 0 || t < rise[i - 1]),
		JSON.stringify(rise)
	);

	// ABOUT WORKS FROM HERE, through the settings card the gear opens over the stack. Apps is not
	// pressed in this suite: it would close the panel and take the rest of the phone cases with
	// it.
	await p.locator('.te-type').fill('scribble');
	await p.locator('.fkey-stack .icon-btn', { hasText: /^Settings$/ }).click();
	await p.waitForTimeout(300);
	ok('the gear opens the card on a phone too', (await p.locator('.te-set-card').count()) === 1);
	await p.locator('.te-set-card .popover-item', { hasText: /^About$/ }).click();
	await p.waitForTimeout(350);
	ok(
		'About puts the manual on the sheet from the flyout',
		(await p.locator('.te-type').inputValue()).startsWith('# Text Editor'),
		JSON.stringify((await p.locator('.te-type').inputValue()).slice(0, 20))
	);
	// The card closes; the STACK BEHIND IT DOES NOT. The gear is the one disc that does not fold
	// the flyout — its card opens over the stack, and folding the thing underneath would animate
	// a column nobody is looking at.
	ok('the card closes behind it', (await p.locator('.te-set-card').count()) === 0);
	ok('and leaves the flyout standing', (await shown()) === 1);

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

	// WORKSPACE FOLDS THE FLYOUT NOW, because it stopped holding a menu. A key that opens something
	// leaves the stack standing (the gear still does, its card draws over the column); a key that
	// simply acts has finished, and leaving the flyout up over the pane it just revealed would be
	// covering the answer with the question.
	// The stack labels its discs with the KEY'S OWN WORD — the flyout has no room for the bar's full
	// title — so this asks for `Workspace` rather than for a tooltip.
	// By its WORD, not an aria-label: the flyout's keys carry their names visibly now, so the
	// visible text IS the accessible name and a separate label would be a second one.
	const workspaceKey = p.locator('.fkey-stack .icon-btn', { hasText: /^Workspace$/ });
	await workspaceKey.click();
	await p.waitForTimeout(350);
	ok(
		'Workspace opens no menu from the flyout either',
		(await p.locator('.te-work-menu').count()) === 0
	);
	ok('and folds the flyout, having done the thing', (await shown()) === 0);
	ok(
		'and no Clear is left in the stack',
		(await p.locator('.fkey-stack .icon-btn', { hasText: /^Clear/ }).count()) === 0
	);

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
	await fromWorkspace('New note');
	await reset('# alpha\n\nthe first note');
	await fromWorkspace('New note');
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

	await page.locator('.icon-btn[aria-label="Settings"]').click();
	await page.waitForTimeout(250);
	await page.locator('.te-set-card .popover-item', { hasText: /^About$/ }).click();
	await page.waitForTimeout(250);
	ok('About puts the manual on it in PROOF', (await proofText()).includes('The marks'));

	// CLEAR reaches the proof through the row's own menu — and it has to, because in PROOF there
	// is no textarea at all: `putOnSheet` writes straight to `text` on that path, and this is the
	// case that catches it going back to writing through a sheet that is not mounted.
	await rows.filter({ hasText: 'Ephemeral 1' }).first().click();
	await page.waitForTimeout(250);
	const ephRow = rows.filter({ hasText: 'Ephemeral 1' }).first();
	const clearItem = () =>
		page.locator('.te-file-menu .popover-item', { hasText: /^(Clear|Sure\?)$/ });
	await ephRow.click({ button: 'right' });
	await page.waitForTimeout(200);
	await clearItem().click();
	await clearItem().click();
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
	// And the note is EMPTY rather than merely unset. Clear used to take the name off the sheet
	// and leave the note's own words on its row; it empties the document it is opened on now, so
	// the row it was pressed on is the one that lost its words — and only that one.
	await rows.filter({ hasText: 'Ephemeral 1' }).first().click();
	await page.waitForTimeout(250);
	await eq('the cleared note is empty', value(), '');
	await rows.filter({ hasText: 'Ephemeral 2' }).first().click();
	await page.waitForTimeout(250);
	ok('and the note beside it still has its words', (await value()).includes('bravo'));
}

// ── A DRIVE'S FOLDERS ────────────────────────────────────────────────────────
// `+` on the head, a folder made, a folder deleted. Driven against a stub that MUTATES — the drive
// block above answers from a fixed map, which is right for asserting how many PROPFINDs a lazy tree
// makes and useless for asserting that a MKCOL created anything. This one keeps a little server in a
// variable and the assertions read it back, the way the OPFS block reads the filesystem back rather
// than trusting the sidebar.
{
	const c = await browser.newContext({ viewport: { width: 1400, height: 900 } });
	const fp = await c.newPage();
	const errs = [];
	fp.on('pageerror', (e) => errs.push(e.message));
	const ROOT = '/remote.php/dav/files/andrew/Notes';
	const R = (href, dir) =>
		`<d:response><d:href>${href}</d:href><d:propstat><d:prop>` +
		(dir ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/>') +
		'<d:getetag>&quot;e&quot;</d:getetag></d:prop>' +
		'<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>';
	/** The whole server, as a map of folder → what is in it. Every verb below edits this. */
	const tree = { '': { dirs: ['Deep'], files: [] }, Deep: { dirs: [], files: ['a.md', 'b.md'] } };
	await fp.route('**/api/nextcloud', async (route) => {
		const r = route.request();
		const m = r.method();
		const path = decodeURIComponent(new URL(r.headers()['x-dav-target']).pathname).replace(
			/\/$/,
			''
		);
		const rel = path.startsWith(ROOT) ? path.slice(ROOT.length).replace(/^\//, '') : '';
		const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
		const leaf = rel.slice(rel.lastIndexOf('/') + 1);
		if (m === 'PROPFIND') {
			const at = tree[rel];
			if (!at) return route.fulfill({ status: 404 });
			const under = rel ? `${rel}/` : '';
			return route.fulfill({
				status: 207,
				contentType: 'application/xml',
				body:
					'<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">' +
					[
						R(`${ROOT}/${under}`, true),
						...at.dirs.map((d) => R(`${ROOT}/${under}${d}/`, true)),
						...at.files.map((f) => R(`${ROOT}/${under}${f}`, false))
					].join('') +
					'</d:multistatus>'
			});
		}
		if (m === 'GET') return route.fulfill({ status: 200, headers: { etag: '"e"' }, body: '# doc' });
		if (m === 'PUT') {
			// `If-None-Match: *` is how the store creates without clobbering — 412 is "taken".
			if (tree[parent].files.includes(leaf)) return route.fulfill({ status: 412 });
			tree[parent].files.push(leaf);
			return route.fulfill({ status: 201, headers: { etag: '"n"' } });
		}
		if (m === 'MKCOL') {
			if (tree[rel]) return route.fulfill({ status: 405 });
			tree[parent].dirs.push(leaf);
			tree[rel] = { dirs: [], files: [] };
			return route.fulfill({ status: 201 });
		}
		if (m === 'DELETE') {
			// A collection takes everything under it — the protocol's own rule, modelled here so the
			// assertion can prove the app is not quietly leaving orphans behind.
			for (const k of Object.keys(tree)) if (k === rel || k.startsWith(`${rel}/`)) delete tree[k];
			for (const k of Object.keys(tree)) {
				tree[k].dirs = tree[k].dirs.filter((d) => (k ? `${k}/` : '') + d !== rel);
				tree[k].files = tree[k].files.filter((f) => (k ? `${k}/` : '') + f !== rel);
			}
			return route.fulfill({ status: 204 });
		}
		return route.fulfill({ status: 405 });
	});

	await fp.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
	await fp.waitForTimeout(400);
	await fp
		.getByRole('button', { name: /settings/i })
		.first()
		.click();
	await fp.getByRole('button', { name: /Connect a drive/ }).click();
	await fp.waitForTimeout(200);
	const fld = (n) => fp.locator('.te-conn-row input').nth(n);
	await fld(0).fill('cloud.example.com');
	await fld(1).fill('andrew');
	await fld(2).fill('app-password');
	await fld(3).fill('Notes');
	await fp.getByRole('radio', { name: /Through this site/ }).click();
	await fp.getByRole('button', { name: /^(Connect|Trying)/ }).click();
	await fp.waitForTimeout(1500);

	// `+` NUMBERS FROM ZERO AND FROM THE FIRST ONE. `Untitled.md` then `Untitled 2.md` reads as a
	// missing `Untitled 1.md` — the unnumbered name doing an index's job without looking like one.
	// Notepad++'s `new 0` convention, and the lowest FREE index, so closing one frees its name.
	await fp.locator('.te-drive-head .te-loose-add').click();
	await fp.waitForTimeout(900);
	ok(
		'+ on the drive head makes Untitled 0.md',
		tree[''].files.includes('Untitled 0.md'),
		JSON.stringify(tree[''].files)
	);
	ok(
		'and opens it',
		(await fp.locator('.te-drive-list [aria-current=true]').textContent()).includes('Untitled 0.md')
	);
	await fp.locator('.te-drive-head .te-loose-add').click();
	await fp.waitForTimeout(900);
	ok(
		'then Untitled 1.md, not Untitled 2.md',
		tree[''].files.includes('Untitled 1.md'),
		JSON.stringify(tree[''].files)
	);

	// A FOLDER ROW HAS A MENU NOW. It was a twisty and nothing else, so the two gestures a folder
	// needs had nowhere to live.
	await fp.locator('.te-drive-list .te-work-dir').first().click({ button: 'right' });
	await fp.waitForTimeout(300);
	ok(
		'a folder row has its own menu',
		(await fp
			.locator('.popover-item')
			.filter({ hasText: /New folder/ })
			.count()) === 1
	);
	await fp
		.locator('.popover-item')
		.filter({ hasText: /New folder/ })
		.click();
	await fp.waitForTimeout(200);
	// A FOLDER IS NAMED ON PURPOSE — unlike a document, which gets `Untitled 0` and a Rename.
	await fp.locator('#te-dir-new').fill('Inner');
	await fp.locator('.te-dir-keys button[type=submit]').click();
	await fp.waitForTimeout(700);
	ok(
		'MKCOL puts it inside the folder that asked',
		!!tree['Deep/Inner'],
		Object.keys(tree).join(',')
	);

	// DELETING ASKS IN WORDS, because it is recursive and not undoable from here.
	await fp.locator('.te-drive-list .te-work-dir').first().click({ button: 'right' });
	await fp.waitForTimeout(300);
	await fp
		.locator('.popover-item')
		.filter({ hasText: /Delete folder/ })
		.click();
	await fp.waitForTimeout(1400);
	const warn = (await fp.locator('.te-dir-warn').textContent()).replace(/\s+/g, ' ').trim();
	ok(
		'it counts the WHOLE subtree, having read it first',
		warn.includes('2 documents and 1 folder'),
		warn
	);
	ok('and says it cannot be undone', warn.includes('cannot be undone'), warn);
	const kill = fp.locator('.te-dir-kill');
	ok('Delete is refused until the name is typed', await kill.isDisabled());
	await fp.locator('#te-dir-kill').fill('Wrong');
	await fp.waitForTimeout(150);
	ok('and a wrong name is not enough', await kill.isDisabled());
	await fp.locator('#te-dir-kill').fill('Deep');
	await fp.waitForTimeout(150);
	ok('the exact name arms it', !(await kill.isDisabled()));
	await kill.click();
	await fp.waitForTimeout(900);
	ok(
		'and it goes with everything under it',
		!tree.Deep && !tree['Deep/Inner'],
		Object.keys(tree).join(',')
	);
	// A LONG LABEL REVEALS ITSELF, the same way the folder's head does — and the drive needs it more,
	// because its label is a folder AND a host, so it is the longest name in this pane by some way.
	{
		const nm = fp.locator('.te-drive-head .te-work-name');
		const clipped = await nm.evaluate((e) => e.scrollWidth > e.clientWidth + 1);
		// Only asserted when the stub's own name is long enough to clip — `cloud.example.com` may
		// not be, and a reveal that repeats a legible name is a flicker with no information in it.
		if (clipped) {
			await eq(
				'a clipped drive label is shut until it is asked for',
				fp.locator('.te-drive-head .te-work-full').evaluate((e) => getComputedStyle(e).opacity),
				'0'
			);
			await nm.hover();
			await fp.waitForTimeout(300);
			await eq(
				'and hovering the name opens it',
				fp.locator('.te-drive-head .te-work-full').evaluate((e) => getComputedStyle(e).opacity),
				'1'
			);
		}
	}

	// THE HEAD NAMES THE SERVER TOO, because a folder called `Notes` says nothing about where it is
	// — and somebody with a drive open beside a local folder of the same name has two lists wearing
	// one name.
	await eq(
		'the head names the folder and its server',
		fp
			.locator('.te-drive-head .te-work-name')
			.textContent()
			.then((t) => t.trim()),
		'Notes (cloud.example.com)'
	);

	// FETCH UPDATES. A drive is somebody else's disk; something else can change it underneath.
	tree[''].files.push('added-elsewhere.md');
	tree[''].dirs.push('Fresh');
	tree.Fresh = { dirs: [], files: [] };
	await fp.locator('.te-drive-refresh').click();
	await fp.waitForTimeout(1600);
	const after = await fp.locator('.te-drive-list .te-work-file').allTextContents();
	ok(
		'refresh picks up a document made elsewhere',
		after.includes('added-elsewhere.md'),
		after.join(',')
	);
	ok('and a folder made elsewhere', after.includes('Fresh'), after.join(','));
	ok(
		'which arrives SHUT, as any newly-seen folder does',
		(await fp
			.locator('.te-drive-list .te-work-dir')
			.filter({ hasText: 'Fresh' })
			.getAttribute('aria-expanded')) === 'false'
	);
	ok('no page errors anywhere in that', errs.length === 0, errs.join(' | '));
	await c.close();
}

// ── CONNECTING A DRIVE ───────────────────────────────────────────────────────
// The form that sets up a Nextcloud workspace. Nothing here reaches a real server — what is under
// test is the part that runs BEFORE a password goes anywhere, which is the part where a mistake
// costs somebody their credentials rather than their afternoon.
//
// The two failures at the end are the whole reason there are two modes. A blocked CORS preflight
// and a dead network are the same TypeError, so DIRECT cannot know which it hit and says the thing
// it is most likely to be; PROXIED gets a 502 from this site's own route and knows the server was
// unreachable. Two modes, two different pieces of information, and no fallback between them —
// falling back would move a password to a different machine because the wifi dropped.
{
	const c = await browser.newContext({ viewport: { width: 1400, height: 900 } });
	const cp = await c.newPage();
	await cp.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
	await cp.waitForTimeout(400);
	await cp
		.getByRole('button', { name: /settings/i })
		.first()
		.click();
	await cp.waitForTimeout(250);
	ok(
		'Settings is where a drive is connected, not the Workspace menu',
		(await cp.getByRole('button', { name: /Connect a drive/ }).count()) === 1
	);
	await cp.getByRole('button', { name: /Connect a drive/ }).click();
	await cp.waitForTimeout(250);

	const connect = cp.getByRole('button', { name: /^(Connect|Trying)/ });
	const field = (n) => cp.locator('.te-conn-row input').nth(n);
	ok('and Connect is refused until it has been told enough', await connect.isDisabled());

	await field(0).fill('http://cloud.example.com');
	await cp.waitForTimeout(150);
	ok(
		'http is refused OUT LOUD rather than upgraded to https',
		(await cp.locator('.te-conn-warn').textContent()).includes('https only')
	);

	await field(0).fill('nx-nope-9f2a.example');
	await field(1).fill('andrew');
	await field(2).fill('app-password');
	await cp.waitForTimeout(150);
	ok('and offered once it has', !(await connect.isDisabled()));

	await cp.getByRole('radio', { name: /Through this site/ }).click();
	await connect.click();
	await cp.waitForTimeout(4000);
	const proxied = (
		(await cp
			.locator('.te-conn-bad')
			.textContent()
			.catch(() => '')) ?? ''
	).trim();
	ok(
		'a proxied drive that cannot be reached says exactly that',
		proxied === 'Could not reach the server.',
		proxied
	);

	await cp.getByRole('radio', { name: /^Direct/ }).click();
	await connect.click();
	await cp.waitForTimeout(4000);
	const direct = (
		(await cp
			.locator('.te-conn-bad')
			.textContent()
			.catch(() => '')) ?? ''
	).trim();
	ok(
		'and a direct one names the thing it is most likely to be',
		direct.includes('WebAppPassword'),
		direct
	);
	ok(
		'the two modes do not say the same thing, because they do not know the same thing',
		proxied !== direct
	);
	ok(
		'and a drive that never answered was never kept',
		(await cp.locator('.te-set-drive').count()) === 0
	);
	await c.close();
}

// ── SIGNING IN INSTEAD OF TYPING A PASSWORD ──────────────────────────────────
// Login Flow v2: the server makes the app password and hands it over, so nothing about an account
// is ever typed into this app. Three steps and a wait, all of them stubbed here — what is under
// test is that the app opens a tab, waits, reads what comes back, and fills in the two fields
// rather than connecting behind somebody's back.
//
// THE POP-UP IS THE PART MOST LIKELY TO BREAK. `window.open` only makes a tab during a real
// gesture, and starting the flow is a round trip — so the tab is opened EMPTY on the click and
// pointed at the URL afterwards. Opened after the round trip, every browser treats it as a pop-up
// and blocks it, which is a failure nobody sees in development because the dev machine allows them.
{
	const c = await browser.newContext({ viewport: { width: 1400, height: 900 } });
	const lp = await c.newPage();
	let polls = 0;
	await lp.route('**/api/nextcloud', async (route) => {
		const req = route.request();
		const path = new URL(req.headers()['x-dav-target']).pathname;
		if (path === '/index.php/login/v2') {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					poll: {
						token: 'poll-token',
						endpoint: 'https://cloud.example.com/index.php/login/v2/poll'
					},
					login: 'https://cloud.example.com/index.php/login/v2/flow/abc'
				})
			});
		}
		if (path === '/index.php/login/v2/poll') {
			polls += 1;
			// 404 IS THE ORDINARY ANSWER, for as long as nobody has granted it — which is most of the
			// time somebody is looking at a login page. Treating it as a failure would end the flow
			// two seconds after it began.
			if (polls < 2) return route.fulfill({ status: 404 });
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					server: 'https://cloud.example.com',
					loginName: 'granted-user',
					appPassword: 'server-made-password'
				})
			});
		}
		return route.fulfill({ status: 405 });
	});
	// The tab the flow opens goes to a server we do not have, so it is answered with a stub. ON THE
	// CONTEXT, not the page: a route registered on `lp` intercepts `lp`'s requests, and the sign-in
	// tab is a page of its own — the navigation went straight out and landed on a Chrome error page,
	// which reads exactly like the app having failed to point the tab anywhere.
	await c.route('https://cloud.example.com/**', (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: '<p>sign in</p>' })
	);

	await lp.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
	await lp.waitForTimeout(400);
	await lp
		.getByRole('button', { name: /settings/i })
		.first()
		.click();
	await lp.getByRole('button', { name: /Connect a drive/ }).click();
	await lp.waitForTimeout(200);

	const signIn = lp.getByRole('button', { name: /Sign in on your server/ });
	ok('the sign-in key is not offered in direct mode', (await signIn.count()) === 0);
	await lp.getByRole('radio', { name: /Through this site/ }).click();
	await lp.waitForTimeout(150);
	ok(
		'and is offered in the proxied one, where both of its requests can be made',
		(await signIn.count()) === 1
	);
	ok('but not until there is a server to sign in to', await signIn.isDisabled());

	await lp.locator('.te-conn-row input').nth(0).fill('cloud.example.com');
	await lp.waitForTimeout(150);
	ok('and then it is', !(await signIn.isDisabled()));

	const opened = c.waitForEvent('page');
	await signIn.click();
	const tab = await opened;
	// It arrives BLANK and is pointed afterwards, which is the whole trick — see the note above. So
	// the assertion waits for the navigation rather than reading the URL the tab was born with,
	// which is `about:blank` every time and would pass for the wrong reason if it were checked
	// loosely.
	await tab.waitForURL(/\/login\/v2\/flow\//, { timeout: 10000 }).catch(() => {});
	ok(
		'pressing it opens a tab on THEIR server, not a form in this app',
		tab.url().startsWith('https://cloud.example.com/index.php/login/v2/flow/'),
		tab.url()
	);
	await lp.waitForTimeout(5000);
	ok(
		'and it waited through a 404 rather than giving up on the first one',
		polls >= 2,
		`polls: ${polls}`
	);
	await eq(
		'the user comes back from the server',
		lp.locator('.te-conn-row input').nth(1).inputValue(),
		'granted-user'
	);
	await eq(
		'and so does the password, which was never typed here',
		lp.locator('.te-conn-row input').nth(2).inputValue(),
		'server-made-password'
	);
	ok(
		'the fields are FILLED IN, not connected behind your back — the folder is still yours to pick',
		(await lp.locator('.te-conn').count()) === 1 &&
			(await lp.locator('.te-drive-head').count()) === 0
	);
	await c.close();
}

// ── A DRIVE IS A FOURTH LIST ─────────────────────────────────────────────────
// The connected workspace, driven against a STUBBED upstream. `/api/nextcloud` is intercepted and
// answered with real multistatus XML — the route's own rules are exhaustively unit-tested
// (test/dav-proxy), and what is under test here is everything above it: the parser, the store, the
// lazy tree, and the two rules a remote tree keeps that a local one does not.
//
// THOSE TWO RULES ARE THE POINT. A drive's folders arrive SHUT, which is the opposite of the local
// tree's rule and deliberate: arriving open on a remote tree means arriving with a request per
// folder. And a drive's folders carry NO TALLY, because a folder nothing has been fetched from
// holds an unknown number of documents and a confident 0 beside forty of them is worse than
// silence.
{
	const c = await browser.newContext({ viewport: { width: 1400, height: 900 } });
	const dp = await c.newPage();
	// A folder to change TO, so the shelving assertion at the end has something to change to. The
	// same OPFS stub the writable-workspace block uses — see the note there.
	await dp.addInitScript(() => {
		window.__seed = async () => {
			const root = await navigator.storage.getDirectory();
			const h = await root.getFileHandle('local.md', { create: true });
			const f = await h.createWritable();
			await f.write('# Local');
			await f.close();
			window.showDirectoryPicker = async () => root;
		};
	});

	const RESPONSE = (href, dir, etag) =>
		`<d:response><d:href>${href}</d:href><d:propstat><d:prop>` +
		(dir ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/>') +
		(etag ? `<d:getetag>&quot;${etag}&quot;</d:getetag>` : '') +
		'</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>';
	const ROOT = '/remote.php/dav/files/andrew/Notes';
	/** What each folder answers with. The root has one document and one folder; the folder has two. */
	const LEVELS = {
		[`${ROOT}`]: [
			RESPONSE(`${ROOT}/`, true),
			RESPONSE(`${ROOT}/top.md`, false, 'e1'),
			RESPONSE(`${ROOT}/Deeper/`, true)
		],
		[`${ROOT}/Deeper`]: [
			RESPONSE(`${ROOT}/Deeper/`, true),
			RESPONSE(`${ROOT}/Deeper/one.md`, false, 'e2'),
			RESPONSE(`${ROOT}/Deeper/two.md`, false, 'e3')
		]
	};
	let propfinds = 0;
	await dp.route('**/api/nextcloud', async (route) => {
		const req = route.request();
		const target = new URL(req.headers()['x-dav-target']);
		if (req.method() === 'PROPFIND') {
			propfinds += 1;
			const at = LEVELS[decodeURIComponent(target.pathname).replace(/\/$/, '')];
			if (!at) return route.fulfill({ status: 404 });
			// The SUB-FOLDER answers slowly on purpose, so the row's Fetching state is observable.
			// A real server on a real connection takes long enough that somebody sees it; a stub
			// that answers instantly would make the state untestable and, worse, look unnecessary.
			if (decodeURIComponent(target.pathname).includes('Deeper')) {
				await new Promise((r) => setTimeout(r, 1200));
			}
			return route.fulfill({
				status: 207,
				contentType: 'application/xml',
				body: `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${at.join('')}</d:multistatus>`
			});
		}
		if (req.method() === 'GET') {
			// Slowly, for the same reason the sub-folder is slow: a document on a server does not
			// arrive in the frame you pressed the row in, and the row has to say so.
			await new Promise((r) => setTimeout(r, 900));
			return route.fulfill({ status: 200, headers: { etag: '"e1"' }, body: '# From the drive' });
		}
		return route.fulfill({ status: 405 });
	});

	await dp.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
	await dp.evaluate(() => window.__seed());
	await dp.waitForTimeout(400);
	await dp
		.getByRole('button', { name: /settings/i })
		.first()
		.click();
	await dp.getByRole('button', { name: /Connect a drive/ }).click();
	await dp.waitForTimeout(200);
	const field = (n) => dp.locator('.te-conn-row input').nth(n);
	await field(0).fill('cloud.example.com');
	await field(1).fill('andrew');
	await field(2).fill('app-password');
	await field(3).fill('Notes');
	await dp.getByRole('radio', { name: /Through this site/ }).click();
	await dp.getByRole('button', { name: /^(Connect|Trying)/ }).click();
	await dp.waitForTimeout(1200);

	ok(
		'a connected drive is its own section, headed with its folder and its server',
		(await dp.locator('.te-drive-head .te-work-name').textContent()).trim() ===
			'Notes (cloud.example.com)'
	);
	ok(
		'and it does NOT replace the folder — the local tree is still its own list',
		(await dp.locator('.te-local-list').count()) === 1 &&
			(await dp.locator('.te-drive-list').count()) === 1
	);
	await eq(
		'its top level is there, and only its top level',
		dp
			.locator('.te-drive-list .te-work-file')
			.allTextContents()
			.then((n) => n.join(',')),
		'Deeper,top.md'
	);
	ok(
		'a folder arrives SHUT, which is the opposite of the local rule and on purpose',
		(await dp.locator('.te-drive-list .te-work-dir').first().getAttribute('aria-expanded')) ===
			'false'
	);
	ok(
		'and carries NO tally, because how many are in it is not yet known',
		(await dp.locator('.te-drive-list .te-work-tally').count()) === 0
	);
	ok('one folder read so far, not the whole tree', propfinds === 2, `propfinds: ${propfinds}`);

	// OPENING IS READING. The tree arrives a level at a time, so the twisty is also the fetch — and
	// a request is not instant, so the row says it is working. Without that, a slow folder is a row
	// that does nothing for a second or two, which reads as an empty folder or a press that missed.
	await dp.locator('.te-drive-list .te-work-dir').first().click();
	await dp.waitForTimeout(300);
	ok(
		'a folder being read says so, where its tally would be',
		(await dp.locator('.te-drive-list .te-work-dir.fetching .te-work-fetching').count()) === 1
	);
	ok(
		'and says it in topaz — the one ink that means still happening',
		await dp.locator('.te-drive-list .te-work-fetching').evaluate((el) => {
			const probe = document.createElement('span');
			probe.style.color = 'var(--topaz)';
			el.append(probe);
			const want = getComputedStyle(probe).color;
			probe.remove();
			return getComputedStyle(el).color === want;
		})
	);
	ok(
		'with a bar that is actually moving',
		await dp
			.locator('.te-drive-list .te-work-bar')
			.evaluate((el) => getComputedStyle(el, '::after').animationName !== 'none')
	);
	ok(
		'and it is announced, not only drawn',
		(await dp.locator('.te-drive-list .te-work-dir.fetching').getAttribute('aria-busy')) === 'true'
	);
	await dp.waitForTimeout(1600);
	ok(
		'and it stops saying so once the folder is there',
		(await dp.locator('.te-drive-list .te-work-fetching').count()) === 0
	);
	ok('opening a drive folder is what fetches it', propfinds === 3, `propfinds: ${propfinds}`);
	await eq(
		'and its documents arrive under it',
		dp
			.locator('.te-drive-list .te-work-file')
			.allTextContents()
			.then((n) => n.join(',')),
		'Deeper,one.md,two.md,top.md'
	);
	ok(
		'a folder that HAS been read gets its tally back',
		(await dp.locator('.te-drive-list .te-work-tally').first().textContent()).trim() === '2'
	);
	await dp.locator('.te-drive-list .te-work-dir').first().click();
	await dp.waitForTimeout(500);
	await dp.locator('.te-drive-list .te-work-dir').first().click();
	await dp.waitForTimeout(500);
	ok(
		'and shutting and reopening it does not ask again',
		propfinds === 3,
		`propfinds: ${propfinds}`
	);

	await dp.getByRole('treeitem', { name: 'top.md' }).click();
	await dp.waitForTimeout(250);
	ok(
		'a DOCUMENT being read says so as well, not only a folder',
		(await dp.locator('.te-drive-list .te-work-row.fetching .te-work-fetching').count()) === 1
	);
	ok(
		'and it is the same mark, not a second idea about the same state',
		(await dp.locator('.te-drive-list .te-work-row.fetching .te-work-bar').count()) === 1
	);
	await dp.waitForTimeout(1200);
	ok(
		'which goes when the words arrive',
		(await dp.locator('.te-drive-list .te-work-fetching').count()) === 0
	);
	ok(
		'a drive document opens on the sheet like any other',
		(await dp.locator('.te-type').inputValue()) === '# From the drive'
	);
	ok(
		'and Save is offered, in an engine that can never write to a folder on the machine',
		(await dp.getByRole('button', { name: /^Save/ }).count()) === 1
	);

	// A DRIVE DOCUMENT CAN BE SHELVED. It used to be the one document in the pane that could not:
	// the shelf held a File or a handle and a document on a server is neither, so changing the
	// workspace under it took its row away. A row keeps `{ connection, path }` now — plain data, so
	// it can be written down, and no credential, so it is safe to.
	await dp.locator('.te-local .te-work-head').click({ button: 'right' });
	await dp.waitForTimeout(200);
	await dp
		.locator('.popover-item')
		.filter({ hasText: /^Open a/ })
		.first()
		.click();
	await dp.waitForTimeout(900);
	ok(
		'changing the folder shelves the open drive document rather than losing its row',
		(await dp.locator('ul[aria-label="Local"] .te-work-file').allTextContents()).includes('top.md'),
		JSON.stringify(await dp.locator('ul[aria-label="Local"] .te-work-file').allTextContents())
	);
	ok(
		'and it is NOT a scratch note — it is still a document on a server',
		!(await dp.locator('ul[aria-label="Scratch"] .te-work-file').allTextContents()).includes(
			'top.md'
		)
	);
	// The shelf holds where a document came from, never its words. Pressing the row re-reads.
	await dp.locator('.te-type').fill('scribbled over');
	await dp.waitForTimeout(200);
	await dp.locator('ul[aria-label="Local"] .te-work-file').filter({ hasText: 'top.md' }).click();
	await dp.waitForTimeout(1800);
	ok(
		'and the row re-reads from the server, the way a handle row re-reads from disk',
		(await dp.locator('.te-type').inputValue()) === '# From the drive'
	);
	await c.close();
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

// ── SPACING LANDS ON WHOLE PIXELS ───────────────────────────────────────────
// The runtime half of the editor's spacing guard, and the counterpart to `pixelite.mjs` §8 over
// on the docs shell. `test/spacing.test.ts` reads the SOURCE and asks that every value came from a
// `--space-*` rung; it cannot see anything computed, and computed is where the interesting
// failures are — a token that did not resolve, a clamp in its fluid middle, a `calc()` cancelling
// something that has since moved.
//
// WHOLE PIXELS ARE A CORRECTNESS CLAIM HERE MORE THAN ANYWHERE, and this app already says so in
// its own words: `--te-row` is pinned to a whole number because a fractional row lets the mirror's
// block stack and the textarea's internal stepping round to device pixels independently, and the
// disagreement is re-rolled on every line. That reasoning is about type, and it applies to space
// for the same reason — a column of fractional gaps accumulates the same drift down the pane.
//
// BOTH VIEWS, because they are different pages. The rendered document's rhythm — headings, lists,
// listings, quotes — is not mounted at all in WRITE (`{#if shown !== 'proof'}`), so a sweep that
// only ever looks at the sheet walks past every value in the proof.
{
	const b = await chromium.launch();
	const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
	const p = await c.newPage();
	await p.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
	await p.waitForSelector('.te-type');
	const sweep = () =>
		p.evaluate(() => {
			const props = [
				'marginTop',
				'marginBottom',
				'paddingTop',
				'paddingBottom',
				'paddingLeft',
				'paddingRight',
				'rowGap',
				'columnGap'
			];
			// LEFT AND RIGHT MARGINS ARE LEFT OUT, and not from squeamishness: the proof centres its
			// measure with `margin-inline: auto`, and an `auto` margin resolves to whatever width is
			// left over — 201.2px here — which is not a spacing decision and never lands on a rung.
			// The running foot's lamp is pushed to the end the same way.
			//
			// The mark column is skipped by NAME rather than by value: `--te-margin` is the width of
			// the box a margin mark is drawn in, reserved as padding by the sheet beside it, and it
			// feeds the wrap invariant. It is a thing, not a gap. Same argument as the superbar's
			// height over in the docs suite.
			const STRUCTURAL = new Set(['te-type', 'te-mirror', 'te-lamp']);
			const bad = [];
			for (const el of document.querySelectorAll('[class^="te-"], [class*=" te-"]')) {
				const names = [...el.classList].filter((x) => !x.startsWith('svelte-'));
				if (names.some((n) => STRUCTURAL.has(n))) continue;
				const s = getComputedStyle(el);
				for (const prop of props) {
					const v = parseFloat(s[prop]);
					// A hair of tolerance: a browser may report 12.0000001 for an exact value.
					if (!isNaN(v) && v !== 0 && Math.abs(v % 1) > 0.01)
						bad.push(`${names[0]} ${prop}=${s[prop]}`);
				}
			}
			return [...new Set(bad)];
		});
	const inWrite = await sweep();
	ok(
		'WRITE: every spacing in the desk is a whole number of pixels',
		inWrite.length === 0,
		inWrite.slice(0, 4).join(' | ')
	);
	const proofKey = p.getByRole('button', { name: /^PROOF$/i });
	if (await proofKey.count()) {
		await proofKey.first().click();
		await p.waitForTimeout(700);
	}
	ok('and the proof is mounted to be measured', (await p.locator('.te-proof').count()) === 1);
	const inProof = await sweep();
	ok(
		'PROOF: the document rhythm is whole pixels too',
		inProof.length === 0,
		inProof.slice(0, 4).join(' | ')
	);
	// THE DESK GUTTER IS A RUNG, asked directly. It is the most visible spacing in the app — the
	// grey field that makes four panes read as four objects laid out rather than one wide sheet —
	// and it reaches every pane through one token, so a sweep of computed values would report it
	// once per element and never say which knob was wrong.
	//
	// READ OFF THE ELEMENT THAT SPENDS IT, never off the token. `getPropertyValue('--te-gutter')`
	// hands back `0.5rem` — a custom property's computed value is its token stream after var()
	// substitution, NOT a used length, unless it has been registered with `@property`. Asking the
	// token gives a string that has to be re-parsed and re-multiplied by the test, which is the
	// test doing the browser's arithmetic and getting a second opinion on the root font size.
	const gutter = await p.evaluate(() => {
		const s = getComputedStyle(document.querySelector('.te-desk'));
		return { gap: parseFloat(s.columnGap), pad: parseFloat(s.paddingLeft) };
	});
	ok(
		'the desk gutter resolves to a whole 4px step',
		gutter.gap % 4 === 0 && gutter.pad % 4 === 0 && gutter.gap === gutter.pad,
		`gap ${gutter.gap} · pad ${gutter.pad}`
	);
	await b.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
