import { firefox } from 'playwright';
const B = process.env.BASE || 'http://localhost:5199';
// Every panel wears its place's accent (see `accent` in $lib/network) — but not all in the same
// place any more, so this suite checks TWO arrangements:
//
//   'badge'  the new header model: the bullet has left the title and become a disc beside Back
//            (.app-badge), and the big title has moved into the SCROLLING body (.body-title).
//            The header holds controls, not a title.
//   'dot'    the older arrangement, still worn by places that aren't on the model: the bullet
//            sits beside the title in the header, resting on its baseline.
//
// Which one a place is on is asserted, not sniffed — a panel silently losing its badge (or
// growing a second bullet) is exactly the regression this is here to catch.
//
// The bullet is NOT a solid disc: it arrives solid, then settles into a 15% wash of the accent
// holding the place's own mark, and the MARK carries the solid colour. This suite compares RGB
// and ignores alpha, so the wash and the mark are both checked against the same accent.
const GREEN = [18, 161, 80],
	PURPLE = [139, 70, 224],
	ORANGE = [240, 96, 48];
const want = {
	'/home': { accent: GREEN, model: 'dot' },
	'/about': { accent: GREEN, model: 'badge' },
	'/about/work': { accent: GREEN, model: 'badge' },
	'/about/projects': { accent: GREEN, model: 'badge' },
	'/settings': { accent: PURPLE, model: 'badge' },
	'/apps': { accent: ORANGE, model: 'badge' },
	'/apps/weather': { accent: ORANGE, model: 'badge' },
	'/apps/emoji-viewer': { accent: ORANGE, model: 'badge' },
	'/apps/court-of-public-opinion': { accent: ORANGE, model: 'badge' },
	// The Park Ranger is on the badge model too, but its bar is DENSE (BAR_HEADER): a full-viewport
	// app spends its vertical room on content, so the title sits IN the bar (.head-title) beside the
	// badge — there's no big body title to scroll away. `bar: true` swaps the body-title assertion
	// for "the bar carries the name", the same split header.mjs makes.
	'/apps/intergalactic-park-ranger': { accent: ORANGE, model: 'badge', bar: true }
};

/** Computed colours come back as `rgb(r, g, b)` or `color(srgb r g b / a)` — normalise to 0-255. */
function rgb(s) {
	const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(s);
	if (srgb) return srgb.slice(1, 4).map((v) => Math.round(parseFloat(v) * 255));
	const plain = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(s);
	return plain ? plain.slice(1, 4).map((v) => Math.round(parseFloat(v))) : null;
}
const sameColor = (s, want) => {
	const got = rgb(s);
	return !!got && got.every((v, i) => Math.abs(v - want[i]) <= 1);
};

const b = await firefox.launch();
let bad = 0,
	n = 0;
// The dot-model baseline ratio, taken from the first place measured and held across viewports.
let dotRatio = null;
const ok = (label, pass, detail = '') => {
	n++;
	if (!pass) bad++;
	console.log(`  ${pass ? 'PASS' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

for (const vp of [
	{ width: 1400, height: 820 },
	{ width: 1024, height: 800 },
	{ width: 390, height: 844 }
]) {
	const ctx = await b.newContext({ viewport: vp });
	const p = await ctx.newPage();
	await p.goto(B + '/', { waitUntil: 'domcontentloaded' });
	await p.evaluate(() => {
		localStorage.setItem('ksh-sky', 'off');
		localStorage.setItem('ksh-theme', 'light');
	});
	console.log(`\n[${vp.width}px]`);

	for (const [path, exp] of Object.entries(want)) {
		await p.goto(B + path, { waitUntil: 'networkidle' });
		await p.waitForTimeout(1500);
		const g = await p.evaluate(() => {
			const head = document.querySelector('.surface-head');
			const body = document.querySelector('.surface-body');
			const panel = document.querySelector('aside.surface').getBoundingClientRect();
			const badge = head.querySelector('.app-badge');
			const dot = head.querySelector('.accent-dot');
			const headTitle = head.querySelector('.dest');
			const bodyTitle = body?.querySelector(':scope > .body-title');
			const box = (e) => (e ? e.getBoundingClientRect() : null);
			const cs = (e) => (e ? getComputedStyle(e) : null);
			const mark = badge?.querySelector('svg') ?? dot?.querySelector('svg');
			return {
				hasBadge: !!badge,
				hasDot: !!dot,
				hasMark: !!mark,
				wash: cs(badge ?? dot)?.backgroundColor ?? null,
				markColor: mark ? cs(mark).color : null,
				bodyTitle: !!bodyTitle,
				headTitle: !!headTitle,
				// the dense bar names itself in-bar (.head-title), not in a body title that scrolls away
				headBar: !!head.querySelector('.head-title'),
				// dot-model geometry: the bullet rests on its own title's baseline, inside the panel
				ratio:
					dot && headTitle
						? (box(headTitle).bottom - box(dot).bottom) / parseFloat(cs(headTitle).fontSize)
						: null,
				inside: badge || dot ? box(badge ?? dot).right <= panel.right : null,
				titleFits: headTitle ? box(headTitle).right <= panel.right : true,
				// the badge sits between Back and whatever controls the panel keeps on that row
				afterBack:
					badge && head.querySelector('.back')
						? box(badge).left > box(head.querySelector('.back')).right
						: null,
				beforeActions:
					badge && head.querySelector('.head-actions')
						? box(badge).right <= box(head.querySelector('.head-actions')).left + 1
						: 'n/a'
			};
		});

		const tag = `${path} [${exp.model}]`;
		// The two models are mutually exclusive — asserting BOTH sides catches a half-migration.
		ok(
			`${tag} wears the right bullet`,
			exp.model === 'badge' ? g.hasBadge && !g.hasDot : g.hasDot && !g.hasBadge,
			`badge=${g.hasBadge} dot=${g.hasDot}`
		);
		ok(`${tag} bullet holds the place's mark`, g.hasMark);
		ok(`${tag} bullet washes the accent`, sameColor(g.wash, exp.accent), g.wash ?? 'none');
		ok(
			`${tag} mark carries the solid accent`,
			sameColor(g.markColor, exp.accent),
			g.markColor ?? 'none'
		);
		ok(`${tag} bullet stays inside the panel`, g.inside === true && g.titleFits);
		if (exp.model === 'badge') {
			// A dense-bar panel names itself in the bar (.head-title) with no body title to scroll
			// away; every other badge panel moves its big title into the body. Assert the right one.
			if (exp.bar)
				ok(
					`${tag} the dense bar carries the name`,
					g.headBar && !g.bodyTitle,
					`headBar=${g.headBar} body=${g.bodyTitle}`
				);
			else
				ok(
					`${tag} big title lives in the body`,
					g.bodyTitle && !g.headTitle,
					`body=${g.bodyTitle} head=${g.headTitle}`
				);
			// A dense bar (BAR_HEADER) drops its Back cap on a phone — no room for it — so the badge
			// LEADS the row there (afterBack null) rather than following Back. Every other badge panel
			// keeps Back at all widths, so only a bar panel is allowed the missing cap. Either way the
			// badge must still sit before the panel's controls.
			const backOk = g.afterBack === true || (exp.bar && g.afterBack === null);
			ok(
				`${tag} badge leads the control row`,
				backOk && g.beforeActions !== false,
				`afterBack=${g.afterBack} beforeActions=${g.beforeActions}`
			);
		} else {
			ok(`${tag} title stays in the header`, g.headTitle && !g.bodyTitle);
			// The bullet rests on its OWN title's baseline: its bottom sits above the title's by
			// the font's descender. That gap scales with font-size, so the RATIO is the invariant
			// — it must be a descender's worth (positive, and a fraction of the type), and the
			// SAME at every viewport even as the title resizes.
			//
			// This used to be measured against the Traffic board's bullet as an oracle, which was
			// wrong twice over: it's a different component with its own responsive header, and its
			// ratio swings 0.148 → -0.432 → 0.153 across these three viewports (a NEGATIVE drop —
			// the dot below the title's bottom). The old suite never noticed because it crashed on
			// the first badge panel long before reaching the narrow viewports. The invariant is
			// self-contained, so it's asserted directly now.
			ok(
				`${tag} bullet rests on the title's baseline`,
				g.ratio > 0 && g.ratio < 0.35,
				`ratio=${g.ratio?.toFixed(3)}`
			);
			if (dotRatio === null) dotRatio = g.ratio;
			ok(
				`${tag} baseline drop scales with the type`,
				Math.abs(g.ratio - dotRatio) < 0.01,
				`ratio=${g.ratio?.toFixed(3)} vs ${dotRatio.toFixed(3)} at the first viewport`
			);
		}
	}
	await ctx.close();
}
await b.close();
console.log(bad === 0 ? `\nALL GOOD (${n} checks)` : `\n${bad}/${n} failed`);
process.exit(bad ? 1 : 0);
