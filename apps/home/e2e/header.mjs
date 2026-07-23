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
	'/apps/court-of-public-opinion': 'Court of Public Opinion'
};
// Panels on the DENSE bar (BAR_HEADER): full-viewport apps that spend their vertical space on
// content, so the title sits IN the bar beside the badge and there's no big title below to
// scroll away. They're on the header model — badge, no title row — but they opt OUT of the
// handover, and asserting that is the point: a panel that grew a body title again would be
// giving back the room the dense bar exists to reclaim.
const BAR = {
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

// Back and the badge are one CLUSTER at the left of the control row, so they share a centre
// line. Worth asserting because the board got this wrong in a way that reads as "the favicon
// button is misaligned": Back kept two rules from when it sat ABOVE the title — align-self:
// flex-start and a bottom margin of the header's inset — which stretched the row to 82px and
// pinned Back to the top of it, so the centred badge sat 20px below it.
const clusterAligned = (head) => {
	const back = head?.querySelector('.back');
	const badge = head?.querySelector('.app-badge');
	if (!back || !badge) return null;
	const b = back.getBoundingClientRect();
	const g = badge.getBoundingClientRect();
	return {
		drift: +Math.abs(b.top + b.height / 2 - (g.top + g.height / 2)).toFixed(1),
		sameSize: Math.round(b.height) === Math.round(g.height),
		gap: +(g.left - b.right).toFixed(1)
	};
};

const read = () => {
	const head = document.querySelector('.surface-head');
	const body = document.querySelector('.surface-body');
	const title = body?.querySelector(':scope > .body-title');
	const compact = head?.querySelector('.head-title');
	const back = head?.querySelector('.back');
	const badgeEl = head?.querySelector('.app-badge');
	const cluster =
		back && badgeEl
			? (() => {
					const b = back.getBoundingClientRect();
					const g = badgeEl.getBoundingClientRect();
					return {
						drift: +Math.abs(b.top + b.height / 2 - (g.top + g.height / 2)).toFixed(1),
						sameSize: Math.round(b.height) === Math.round(g.height)
					};
				})()
			: null;
	return {
		cluster,
		compact: compact ? compact.textContent.trim() : null,
		bodyTitleIsFirst: !!title && body.firstElementChild === title,
		headHasBigTitle: !!head?.querySelector('.title-row'),
		badge: !!head?.querySelector('.app-badge'),
		// How much of the big title is still showing above the scroller's top edge.
		visible: title
			? Math.max(0, title.getBoundingClientRect().bottom - body.getBoundingClientRect().top)
			: null,
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
		(t) =>
			new Promise((done) => {
				const el = document.querySelector('.surface-body');
				el.scrollTo({ top: t });
				requestAnimationFrame(() => requestAnimationFrame(done));
			}),
		top
	);
	await page.waitForTimeout(600);
};

const browser = await firefox.launch();
for (const vp of [
	{ width: 1400, height: 820 },
	{ width: 390, height: 844 }
]) {
	console.log(`\n[${vp.width}px]`);
	const ctx = await browser.newContext({ viewport: vp });
	const page = await ctx.newPage();
	await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => {
		localStorage.setItem('ksh-sky', 'off');
		localStorage.setItem('ksh-theme', 'light');
	});

	for (const [path, title] of Object.entries(MODEL)) {
		await page.goto(B + path, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1300);
		const top = await page.evaluate(read);

		ok(`${path}: badge beside Back`, top.badge);
		ok(
			`${path}: Back and the badge share a centre line`,
			!!top.cluster && top.cluster.drift <= 1 && top.cluster.sameSize,
			top.cluster ? `${top.cluster.drift}px drift, sameSize=${top.cluster.sameSize}` : 'no cluster'
		);
		ok(`${path}: the big title is the body's first child`, top.bodyTitleIsFirst);
		ok(`${path}: no title row left in the header`, !top.headHasBigTitle);
		ok(
			`${path}: the bar is unnamed while the big title shows`,
			top.compact === null,
			top.compact ?? ''
		);

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
			ok(
				`${path}: the bar picks up the name once the title clears`,
				down.compact === title,
				`${down.compact ?? 'nothing'} (visible ${down.visible}px, travel ${Math.round(down.travel)}px)`
			);
		} else if (down.visible >= 36) {
			ok(
				`${path}: no handover while the big title is still visible`,
				down.compact === null,
				`visible=${down.visible} compact=${down.compact ?? 'none'}`
			);
		} else {
			console.log(
				`  ---   ${path}: ${down.visible}px of title left — inside the hysteresis band, not asserted`
			);
		}

		// …and back up. The compact title has to LEAVE again, or it sits beside the badge with
		// the big title in full view underneath it.
		await scrollBody(page, 0);
		const up = await page.evaluate(read);
		ok(`${path}: the bar hands the name back at the top`, up.compact === null, up.compact ?? '');
	}

	for (const [path, title] of Object.entries(BAR)) {
		await page.goto(B + path, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1500);
		const g = await page.evaluate(() => {
			const head = document.querySelector('.surface-head');
			const body = document.querySelector('.surface-body');
			return {
				bar: head?.classList.contains('bar'),
				badge: !!head?.querySelector('.app-badge'),
				headTitle: head?.querySelector('.head-title')?.textContent.trim() ?? null,
				titleRow: !!head?.querySelector('.title-row'),
				bodyTitle: !!body?.querySelector(':scope > .body-title'),
				headH: Math.round(head?.getBoundingClientRect().height ?? 0)
			};
		});
		ok(`${path}: wears the dense bar`, g.bar === true);
		ok(`${path}: badge beside Back`, g.badge);
		ok(
			`${path}: the bar carries the name outright`,
			g.headTitle === title,
			g.headTitle ?? 'nothing'
		);
		ok(
			`${path}: no big title anywhere`,
			!g.titleRow && !g.bodyTitle,
			`titleRow=${g.titleRow} bodyTitle=${g.bodyTitle}`
		);
		// The whole point of the dense bar: it's a control row, not a masthead.
		ok(`${path}: the bar stays short`, g.headH > 0 && g.headH < 110, `${g.headH}px`);
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
				compact: head?.querySelector('.head-title')?.textContent.trim() ?? null,
				cluster: (() => {
					const back = head?.querySelector('.back');
					const badge = head?.querySelector('.app-badge');
					if (!back || !badge) return null;
					const b = back.getBoundingClientRect();
					const g = badge.getBoundingClientRect();
					return {
						drift: +Math.abs(b.top + b.height / 2 - (g.top + g.height / 2)).toFixed(1),
						sameSize: Math.round(b.height) === Math.round(g.height),
						rowH: Math.round(head.querySelector('.head-row')?.getBoundingClientRect().height ?? 0)
					};
				})()
			};
		}, spec);
		ok(
			`${path}: builds its own header, not the shared bar`,
			!g.sharedBar,
			`sharedBar=${g.sharedBar}`
		);
		if (spec.head) ok(`${path}: its own header is there`, g.ownHead);

		if (spec.model) {
			// Unexpanded, the board wears the model in its own chrome: badge beside Back, big
			// title in ITS scroller, nothing left in the bar but controls.
			ok(
				`${path}: unexpanded wears the badge`,
				g.badge && g.mark,
				`badge=${g.badge} mark=${g.mark}`
			);
			// The board is where this broke: Back kept its old above-the-title placement rules,
			// which stretched the row and dropped the badge 20px below it.
			ok(
				`${path}: Back and the badge share a centre line`,
				!!g.cluster && g.cluster.drift <= 1 && g.cluster.sameSize,
				g.cluster ? `${g.cluster.drift}px drift, row ${g.cluster.rowH}px` : 'no cluster'
			);
			ok(
				`${path}: the control row is one disc tall`,
				!!g.cluster && g.cluster.rowH <= 46,
				g.cluster ? `${g.cluster.rowH}px` : 'no row'
			);
			ok(
				`${path}: unexpanded moves its title into the body`,
				g.bodyTitleFirst && !g.bigTitleInHead,
				`bodyFirst=${g.bodyTitleFirst} headTitle=${g.bigTitleInHead}`
			);
			ok(`${path}: unexpanded starts unnamed in the bar`, g.compact === null, g.compact ?? '');

			await page.evaluate(
				(sel) =>
					new Promise((done) => {
						const el = document.querySelector(sel);
						el.scrollTo({ top: el.scrollHeight });
						requestAnimationFrame(() => requestAnimationFrame(done));
					}),
				spec.body
			);
			await page.waitForTimeout(700);
			const after = await page.evaluate(
				(sel) =>
					document.querySelector(sel)?.querySelector('.head-title')?.textContent.trim() ?? null,
				spec.head
			);
			ok(
				`${path}: the bar picks up the name once its title clears`,
				after === spec.title,
				after ?? 'nothing'
			);

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
				ok(
					`${path}: expanded keeps its super bar's own title and bullet`,
					exp.identTitle && exp.dot,
					`title=${exp.identTitle} dot=${exp.dot}`
				);
				ok(
					`${path}: expanded grows no badge and no handover`,
					!exp.badge && !exp.bodyTitle && !exp.compact,
					`badge=${exp.badge} bodyTitle=${exp.bodyTitle} compact=${exp.compact}`
				);
			}
		} else {
			ok(
				`${path}: is always full-viewport, so no unexpanded header to move`,
				!g.badge && !g.bodyTitleFirst
			);
		}
	}

	await ctx.close();
}
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
