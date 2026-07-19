import { firefox } from 'playwright';
const B = process.env.BASE || 'http://localhost:5199';

// The panel super bar and its title handover.
//
// On the new header model the bullet leaves the title to become a badge beside Back, and the big
// title moves into the SCROLLING body so it scrolls away. Once it's gone a compact title flies in
// beside the badge, so the bar always names the panel: the wordmark while it's in view, the small
// one after. This suite drives that handover in both directions.
//
// It exists because spreading the model past the Emoji Viewer broke it twice, and both bugs were
// invisible on the one panel it was built against:
//   • the threshold measured offsetTop against scrollTop, but offsetTop is relative to the OFFSET
//     PARENT — the positioned panel, not the scroller — so it carried the header's ~122px. The
//     Emoji Viewer scrolls thousands of px and never noticed. Apps (131px of travel), Weather
//     (142) and the Park Ranger (67) could never reach it: the title scrolled out of sight and
//     the bar stayed unnamed. Hence SHORT_SCROLL below — a panel with barely any travel is the
//     case that matters.
//   • the hysteresis was a flat 36px, TALLER than the title on a phone (~30px) and for a long
//     name (Intergalactic Park Ranger shrinks to ~26px). Once the compact title arrived nothing
//     could dismiss it. Hence every check runs on a phone as well, and scrolls back UP.
const MODEL = {
	'/apps': 'Apps',
	'/apps/emoji-viewer': 'Emoji Viewer',
	'/about': 'About',
	'/about/work': 'Work',
	'/about/projects': 'Projects',
	'/settings': 'Settings',
	'/apps/weather': 'Weather',
	'/apps/court-of-public-opinion': 'Court of Public Opinion',
	'/apps/intergalactic-park-ranger': 'Intergalactic Park Ranger'
};
// Panels that own their whole interior and build their own header — no shared bar to move a
// bullet into, so they are NOT on the model. Asserted, so a half-migration shows up here.
const OFF_MODEL = { '/apps/air-traffic': '.tfc-head', '/apps/star-map': null };

const results = [];
const ok = (name, pass, detail = '') => {
	results.push({ name, pass });
	console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '  — ' + detail : ''}`);
};

const read = () => {
	const head = document.querySelector('.surface-head');
	const body = document.querySelector('.surface-body');
	const title = body?.querySelector(':scope > .body-title');
	const compact = head?.querySelector('.head-title');
	return {
		compact: compact ? compact.textContent.trim() : null,
		bodyTitleIsFirst: !!title && body.firstElementChild === title,
		headHasBigTitle: !!head?.querySelector('.title-row'),
		badge: !!head?.querySelector('.app-badge'),
		// How much of the big title is still showing above the scroller's top edge.
		visible: title ? Math.max(0, title.getBoundingClientRect().bottom - body.getBoundingClientRect().top) : null,
		travel: body ? body.scrollHeight - body.clientHeight : 0
	};
};

// Scroll the PANEL BODY and let it settle. `scrollTo` fires the element's own real scroll event,
// which is what the handover listens to — this is not a synthetic dispatch, and no state is
// poked directly. A mouse wheel was the first instinct and is the wrong tool here: some panels
// (Weather) hold an inner scrollable region, and once the content shifts under the cursor the
// wheel goes to THAT instead, so the body never came back up and the suite reported a handover
// bug that wasn't one.
const scrollBody = async (page, top) => {
	await page.evaluate(
		(t) => new Promise((done) => {
			const el = document.querySelector('.surface-body');
			el.scrollTo({ top: t });
			requestAnimationFrame(() => requestAnimationFrame(done));
		}),
		top
	);
	await page.waitForTimeout(600);
};

const browser = await firefox.launch();
for (const vp of [{ width: 1400, height: 820 }, { width: 390, height: 844 }]) {
	console.log(`\n[${vp.width}px]`);
	const ctx = await browser.newContext({ viewport: vp });
	const page = await ctx.newPage();
	await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => { localStorage.setItem('ksh-sky', 'off'); localStorage.setItem('ksh-theme', 'light'); });

	for (const [path, title] of Object.entries(MODEL)) {
		await page.goto(B + path, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1300);
		const top = await page.evaluate(read);

		ok(`${path}: badge beside Back`, top.badge);
		ok(`${path}: the big title is the body's first child`, top.bodyTitleIsFirst);
		ok(`${path}: no title row left in the header`, !top.headHasBigTitle);
		ok(`${path}: the bar is unnamed while the big title shows`, top.compact === null, top.compact ?? '');

		await scrollBody(page, 1e6);
		const down = await page.evaluate(read);

		if (down.travel > 0 && down.visible === 0) {
			// The title has fully cleared, so the bar MUST have picked up the name — however
			// little travel the panel had. This is the check the short panels were failing.
			ok(`${path}: the bar picks up the name once the title clears`, down.compact === title,
				`${down.compact ?? 'nothing'} (travel ${Math.round(down.travel)}px)`);
		} else {
			// Not enough travel to push the title off — the big one is still doing the naming.
			ok(`${path}: no handover while the big title is still visible`, down.compact === null,
				`visible=${down.visible} compact=${down.compact ?? 'none'}`);
		}

		// …and back up. The compact title has to LEAVE again, or it sits beside the badge with
		// the big title in full view underneath it.
		await scrollBody(page, 0);
		const up = await page.evaluate(read);
		ok(`${path}: the bar hands the name back at the top`, up.compact === null, up.compact ?? '');
	}

	// The panels that build their own header keep it — they never grew a shared bar.
	for (const [path, ownHead] of Object.entries(OFF_MODEL)) {
		await page.goto(B + path, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1300);
		const g = await page.evaluate((sel) => ({
			sharedBar: !!document.querySelector('.surface-head'),
			bodyTitle: !!document.querySelector('.surface-body > .body-title'),
			ownHead: sel ? !!document.querySelector(sel) : null
		}), ownHead);
		ok(`${path}: builds its own header, not the shared bar`, !g.sharedBar && !g.bodyTitle,
			`sharedBar=${g.sharedBar} bodyTitle=${g.bodyTitle}`);
		if (ownHead) ok(`${path}: its own header is there`, g.ownHead);
	}

	await ctx.close();
}
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
