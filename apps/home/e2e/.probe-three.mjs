import { chromium } from 'playwright';
const B = 'http://localhost:5174';
let fails = 0;
const ok = (n, c, extra = '') => {
	if (!c) fails++;
	console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' — ' + extra}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const texts = (s) =>
	page
		.locator(s)
		.allTextContents()
		.then((t) => t.join(','));
await page.addInitScript(() => {
	window.__seed = async () => {
		const root = await navigator.storage.getDirectory();
		const dir = await root.getDirectoryHandle('notes', { create: true });
		for (const n of ['alpha.md', 'beta.md']) {
			const h = await dir.getFileHandle(n, { create: true });
			const f = await h.createWritable();
			await f.write('# ' + n);
			await f.close();
		}
		const sub = await dir.getDirectoryHandle('drafts', { create: true });
		const g = await sub.getFileHandle('gamma.md', { create: true });
		const f = await g.createWritable();
		await f.write('# Gamma');
		await f.close();
		window.showDirectoryPicker = async () => dir;
	};
});
// Cleared ONCE, before the run — not in an init script, which would also run on the reload
// below and wipe the very thing that reload is meant to prove survives.
await page.goto(`${B}/apps/text-editor`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => window.__seed());
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Folder' }).click();
await page.waitForTimeout(900);

const TREE = '.te-work-list:not(.te-loose-list)';

// ── NEW makes a scratch note ────────────────────────────────────────────────
await page.getByRole('button', { name: 'New', exact: true }).click();
await page.waitForTimeout(400);
ok('New asks for no name at all', (await page.locator('.te-work-field').count()) === 0);
ok('a Scratch shelf appears', (await texts('.te-loose-name')) === 'Scratch');
ok('holding Ephemeral 1', (await texts('.te-loose .te-work-file')) === 'Ephemeral 1');
ok(
	'marked as the one on the sheet',
	(await page.locator('.te-loose .te-work-row.on').count()) === 1
);
ok('the sheet is blank and ready', (await page.locator('.te-type').inputValue()) === '');
ok('the foot names it', (await page.locator('.te-lamp').textContent()).trim() === 'Ephemeral 1');

await page.locator('.te-type').fill('first scratch words');
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'New', exact: true }).click();
await page.waitForTimeout(400);
ok(
	'a second is Ephemeral 2',
	(await texts('.te-loose .te-work-file')) === 'Ephemeral 1,Ephemeral 2'
);
ok('and the sheet is blank again', (await page.locator('.te-type').inputValue()) === '');
await page.locator('.te-type').fill('second scratch words');
await page.waitForTimeout(500);

// Switching back must not lose the first one's words.
await page.locator('.te-loose .te-work-row').first().click();
await page.waitForTimeout(500);
ok(
	'going back to the first keeps its words',
	(await page.locator('.te-type').inputValue()) === 'first scratch words'
);
await page.locator('.te-loose .te-work-row').last().click();
await page.waitForTimeout(500);
ok(
	'and the second keeps its own',
	(await page.locator('.te-type').inputValue()) === 'second scratch words'
);

// Opening a real file, then back.
await page.getByRole('treeitem', { name: 'alpha.md' }).click();
await page.waitForTimeout(600);
ok('a tree row still opens', (await page.locator('.te-type').inputValue()) === '# alpha.md');
ok(
	'and the scratch shelf stands, unmarked',
	(await page.locator('.te-loose .te-work-row.on').count()) === 0
);
await page.locator('.te-loose .te-work-row').last().click();
await page.waitForTimeout(600);
ok(
	'back to scratch, words intact',
	(await page.locator('.te-type').inputValue()) === 'second scratch words'
);

// It survives a reload.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
console.log(
	'  DEBUG',
	await page.evaluate(() => ({
		scratch: localStorage.getItem('ksh:text-editor:v1:scratch'),
		work: !!document.querySelector('.te-work'),
		shut: !!document.querySelector('.te-work-shut'),
		loose: document.querySelectorAll('.te-loose').length
	}))
);
ok(
	'the scratch list survives a reload',
	(await texts('.te-loose .te-work-file')) === 'Ephemeral 1,Ephemeral 2',
	await texts('.te-loose .te-work-file')
);
ok(
	'with the sheet still on the one it was',
	(await page.locator('.te-type').inputValue()) === 'second scratch words'
);

// Close asks twice — those words are nowhere else.
await page.locator('.te-loose .te-work-row').first().click({ button: 'right' });
await page.waitForTimeout(300);
const item = page.locator('.te-file-menu [role=menuitem]');
await item.click();
await page.waitForTimeout(300);
ok('closing a scratch note asks first', (await item.textContent()).trim() === 'Sure?');
await item.click();
await page.waitForTimeout(400);
ok('and the second press takes it', (await texts('.te-loose .te-work-file')) === 'Ephemeral 2');

// ── MOVING A DOCUMENT ───────────────────────────────────────────────────────
await page.evaluate(() => window.__seed());
await page.waitForTimeout(200);
ok(
	'a tree document can be dragged',
	(await page.locator(`${TREE} .te-work-row`).nth(2).getAttribute('draggable')) === 'true'
);
ok(
	'a folder row cannot',
	(await page.locator('.te-work-dir').getAttribute('draggable')) !== 'true'
);

// alpha.md → drafts
await page.dragAndDrop(`${TREE} >> text=alpha.md`, '.te-work-dir');
await page.waitForTimeout(800);
ok(
	'dropping a document on a folder moves it there',
	await page.evaluate(async () => {
		const root = await navigator.storage.getDirectory();
		const dir = await root.getDirectoryHandle('notes');
		const sub = await dir.getDirectoryHandle('drafts');
		const inSub = [];
		for await (const [n] of sub.entries()) inSub.push(n);
		const inTop = [];
		for await (const [n] of dir.entries()) inTop.push(n);
		return inSub.includes('alpha.md') && !inTop.includes('alpha.md');
	})
);
ok(
	'and the tree redraws it under that folder',
	(await texts(`${TREE} .te-work-file`)) === 'drafts,alpha.md,gamma.md,beta.md',
	await texts(`${TREE} .te-work-file`)
);

// …and back out, onto the head.
await page.dragAndDrop(`${TREE} >> text=alpha.md`, '.te-work-head');
await page.waitForTimeout(800);
ok(
	'dropping on the head moves it back to the root',
	await page.evaluate(async () => {
		const root = await navigator.storage.getDirectory();
		const dir = await root.getDirectoryHandle('notes');
		const inTop = [];
		for await (const [n] of dir.entries()) inTop.push(n);
		return inTop.includes('alpha.md');
	})
);
ok(
	'and the tree agrees',
	(await texts(`${TREE} .te-work-file`)) === 'drafts,gamma.md,alpha.md,beta.md',
	await texts(`${TREE} .te-work-file`)
);

// A name already taken cancels the move rather than overwriting it.
await page.evaluate(async () => {
	const root = await navigator.storage.getDirectory();
	const dir = await root.getDirectoryHandle('notes');
	const sub = await dir.getDirectoryHandle('drafts');
	const h = await sub.getFileHandle('alpha.md', { create: true });
	const f = await h.createWritable();
	await f.write('# the one already there');
	await f.close();
});
await page.getByRole('button', { name: 'Change', exact: true }).click();
await page.waitForTimeout(900);
await page.dragAndDrop(`${TREE} >> text=alpha.md >> nth=1`, '.te-work-dir');
await page.waitForTimeout(800);
ok(
	'a name already taken at the destination cancels the move',
	await page.evaluate(async () => {
		const root = await navigator.storage.getDirectory();
		const dir = await root.getDirectoryHandle('notes');
		const sub = await dir.getDirectoryHandle('drafts');
		const kept = await (await sub.getFileHandle('alpha.md')).getFile();
		const inTop = [];
		for await (const [n] of dir.entries()) inTop.push(n);
		return (await kept.text()) === '# the one already there' && inTop.includes('alpha.md');
	})
);

await page.screenshot({ path: 'e2e/.three.png', clip: { x: 0, y: 40, width: 300, height: 330 } });
await page.evaluate(async () => {
	const root = await navigator.storage.getDirectory();
	for await (const [n] of root.entries()) await root.removeEntry(n, { recursive: true });
});
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall green');
process.exit(fails ? 1 : 0);
