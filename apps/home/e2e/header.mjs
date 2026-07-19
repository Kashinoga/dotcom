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
// Panels that build their own header. They have no shared bar, but that no longer means they're
// off the model — the Traffic board wears it in its own chrome when UNEXPANDED: badge beside
// Back, title in its own scroller (.tfc-body), same handover. The Builder and the Star Map are
// always full-viewport, so they have no unexpanded header to put a badge in at all.
const OWN_HEADER = {
	'/apps/air-traffic': { head: '.tfc-head', body: '.tfc-body', model: true, title: 'Air Traffic' },
	'/apps/star-map': { head: null, body: null, model: false }
};

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

		// Three zones, because the handover is hysteretic and only the ends are decidable:
		//   <= 12px of title left  the bar MUST carry the name (this is the show threshold, and
		//                          the check the short-travel panels were failing)
		//   >= 36px still showing  the big title is plainly doing the naming, so the bar must not
		//   in between             the hysteresis band — either answer is correct depending on
		//                          which way you arrived, so asserting here would be inventing a
		//                          contract the code doesn't have
		if (down.visible <= 12) {
			ok(`${path}: the bar picks up the name once the title clears`, down.compact === title,
				`${down.compact ?? 'nothing'} (visible ${down.visible}px, travel ${Math.round(down.travel)}px)`);
		} else if (down.visible >= 36) {
			ok(`${path}: no handover while the big title is still visible`, down.compact === null,
				`visible=${down.visible} compact=${down.compact ?? 'none'}`);
		} else {
			console.log(`  ---   ${path}: ${down.visible}px of title left — inside the hysteresis band, not asserted`);
		}

		// …and back up. The compact title has to LEAVE again, or it sits beside the badge with
		// the big title in full view underneath it.
		await scrollBody(page, 0);
		const up = await page.evaluate(read);
		ok(`${path}: the bar hands the name back at the top`, up.compact === null, up.compact ?? '');
	}

	// The panels that build their own header keep it — they never grew a shared bar.
	for (const [path, spec] of Object.entries(OWN_HEADER)) {
		await page.goto(B + path, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1600);
		const g = await page.evaluate((s) => {
			const head = s.head ? document.querySelector(s.head) : null;
			const body = s.body ? document.querySelector(s.body) : null;
			return {
				sharedBar: !!document.querySelector('.surface-head'),
				ownHead: s.head ? !!head : null,
				badge: !!head?.querySelector('.app-badge'),
				mark: !!head?.querySelector('.app-badge svg'),
				bigTitleInHead: !!head?.querySelector('.dest'),
				bodyTitleFirst: !!body && body.firstElementChild?.classList.contains('body-title'),
				compact: head?.querySelector('.head-title')?.textContent.trim() ?? null
			};
		}, spec);
		ok(`${path}: builds its own header, not the shared bar`, !g.sharedBar, `sharedBar=${g.sharedBar}`);
		if (spec.head) ok(`${path}: its own header is there`, g.ownHead);

		if (spec.model) {
			// Unexpanded, the board wears the model in its own chrome: badge beside Back, big
			// title in ITS scroller, nothing left in the bar but controls.
			ok(`${path}: unexpanded wears the badge`, g.badge && g.mark, `badge=${g.badge} mark=${g.mark}`);
			ok(`${path}: unexpanded moves its title into the body`, g.bodyTitleFirst && !g.bigTitleInHead,
				`bodyFirst=${g.bodyTitleFirst} headTitle=${g.bigTitleInHead}`);
			ok(`${path}: unexpanded starts unnamed in the bar`, g.compact === null, g.compact ?? '');

			await page.evaluate((sel) => new Promise((done) => {
				const el = document.querySelector(sel);
				el.scrollTo({ top: el.scrollHeight });
				requestAnimationFrame(() => requestAnimationFrame(done));
			}), spec.body);
			await page.waitForTimeout(700);
			const after = await page.evaluate((sel) =>
				document.querySelector(sel)?.querySelector('.head-title')?.textContent.trim() ?? null, spec.head);
			ok(`${path}: the bar picks up the name once its title clears`, after === spec.title, after ?? 'nothing');

			// EXPANDED is a different arrangement and deliberately keeps the old one: one super
			// bar leading with the title and its bullet, no badge, no handover.
			const expandBtn = page.getByRole('button', { name: /Expand panel/i });
			if (await expandBtn.count()) {
				await expandBtn.first().click();
				await page.waitForTimeout(1200);
				const exp = await page.evaluate((s) => {
					const head = document.querySelector(s.head);
					return {
						identTitle: !!head?.querySelector('.ident .dest'),
						dot: !!head?.querySelector('.accent-dot'),
						badge: !!head?.querySelector('.app-badge'),
						bodyTitle: !!document.querySelector(`${s.body} > .body-title`),
						compact: !!head?.querySelector('.head-title')
					};
				}, spec);
				ok(`${path}: expanded keeps its super bar's own title and bullet`,
					exp.identTitle && exp.dot, `title=${exp.identTitle} dot=${exp.dot}`);
				ok(`${path}: expanded grows no badge and no handover`,
					!exp.badge && !exp.bodyTitle && !exp.compact,
					`badge=${exp.badge} bodyTitle=${exp.bodyTitle} compact=${exp.compact}`);
			}
		} else {
			ok(`${path}: is always full-viewport, so no unexpanded header to move`, !g.badge && !g.bodyTitleFirst);
		}
	}

	await ctx.close();
}
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
