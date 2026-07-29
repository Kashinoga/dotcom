/**
 * WHAT VERSION AN APP IS, and what it has just learned to do.
 *
 * One entry per app that wears a Beta tag, keyed by the same code `$lib/places` uses. The tag
 * reads the entry and opens on it: a version, what the version MEANS, and the short list of
 * things that landed recently. An app in beta that will not say what changed asks for patience
 * without saying what for.
 *
 * ── The scheme ────────────────────────────────────────────────────────────────
 *
 *     v0.8.1.314
 *      │ │ │ └── COMMITS. Counted, not chosen — see `commits` below.
 *      │ │ └──── FIXES. One bump per thing that was BROKEN and now is not. A feature resets it
 *      │ │       to zero, which is what makes it readable: it counts the repairs to the app as
 *      │ │       it currently stands, not the repairs of all time.
 *      │ └────── FEATURES. One whole feature, finished, is one bump. The workspace was a bump;
 *      │         giving the workspace a tree was not — that is the same feature, better.
 *      └──────── COLLECTIONS. Bumped when enough features have landed that the app is a
 *                different proposition from the one the last collection described.
 *
 * The FIXES position was added late, and it earns its place by separating two things the third
 * position used to run together. A version that moves only because commits happened cannot say
 * whether the app got bigger or merely got better, and "the proof follows the workspace now" is
 * not a feature — the workspace was already there and was already meant to do this. A fix is the
 * app catching up with what it already claimed, and it deserves a number that says so.
 *
 * Entries recorded before it existed carry a `0` in that position. That is not a backfill: no
 * fix had been counted at the time, so zero is what was true.
 *
 * The major NEVER reaches 1 while an app is in beta — 1.0 is the claim that the thing is
 * finished, and a beta tag is the claim that it is not. Both cannot be true, so the guard at the
 * foot of this file throws on a build that tries.
 */

/** One thing that landed — a feature or a repair — and the version it landed in. */
export type Feature = {
	/**
	 * The WHOLE version it landed in — `0.8.0.307`, not `0.8`. Written out rather than counted,
	 * because a commit count can only ever be counted for HEAD: the number for something that
	 * landed forty commits ago is history, and history is data.
	 *
	 * All four positions. Several features land in one minor, so a list keyed on the first two
	 * numbers is a column of identical `0.8`s that says nothing about which came first — which is
	 * the one thing a list of recent work is for. The fix position earns its place on the same
	 * argument: without it, two lines a repair apart are indistinguishable.
	 */
	at: string;
	/** What it does, in one line, from the visitor's side rather than the code's. */
	what: string;
};

export type AppRelease = {
	major: number;
	minor: number;
	/**
	 * Repairs since the last feature landed. Set back to 0 by the next `minor` bump — by hand,
	 * because this file is the record and a number that reset itself would be a number nobody
	 * had to think about.
	 */
	fixes: number;
	/**
	 * The repo's commit count, injected at BUILD time (see `vite.config.ts`) so it can never
	 * drift from the truth by being forgotten. This number is the fallback for the builds where
	 * it cannot be counted — a shallow CI clone, or a tarball with no `.git` — where a stale
	 * number is better than a zero that looks like a bug.
	 */
	commits: number;
	/** Newest first. The tag shows the first few; this is not a full changelog. */
	recent: Feature[];
};

/**
 * Injected by Vite at build time as a literal. Declared rather than imported, because it is a
 * define — there is no module behind it, and reading it in a context Vite did not transform
 * (a plain `node --test` run) would throw, which is what the `typeof` guard below is for.
 */
declare const __GIT_COMMITS__: number;

/** The counted commit total, or 0 where it could not be counted. */
export const countedCommits: number =
	typeof __GIT_COMMITS__ === 'number' && __GIT_COMMITS__ > 0 ? __GIT_COMMITS__ : 0;

export const RELEASES: Record<string, AppRelease> = {
	TEXT: {
		major: 0,
		minor: 9,
		// Two repairs since the install feature landed: a hover that cut instead of fading on
		// every word key in the app, and a rule in the bar that doubled once the group between
		// the two of them could be empty. The rearrangement they arrived with is not counted —
		// nothing became possible that was not possible before, and the scheme counts what the
		// app can DO rather than where it keeps it.
		// Three: the two visual repairs above, and the sheet that could hold a document with no row
		// behind it — which made that one document the exception to every verb the workspace has.
		fixes: 3,
		commits: 319,
		recent: [
			{ at: '0.9.3.319', what: 'There is always a scratch note, and Scratch is always shown' },
			{ at: '0.9.3.319', what: 'New, Change and Hide are behind the Workspace key' },
			{ at: '0.9.2.318', what: 'One Settings key holds Apps, About, Install and the version' },
			{
				at: '0.9.2.318',
				what: 'Copy, Save a copy and Clear moved onto a document’s own right-click menu'
			},
			{ at: '0.9.2.318', what: 'The bar’s word keys fade on hover, like the discs beside them' },
			{
				at: '0.9.0.317',
				what: 'Install it as an app: its own window, offline, and .md files open in it'
			},
			{ at: '0.8.3.316', what: 'Menus and flyouts lose their white outline in dark mode' },
			{ at: '0.8.2.315', what: 'On a phone the flyout holds every key, Home and About with them' },
			{
				at: '0.8.2.315',
				what: 'The running foot is a desk affordance; the phone gets those rows back'
			},
			{ at: '0.8.1.314', what: 'Proof follows the workspace: pick a document there and it is set' },
			{
				at: '0.8.0.313',
				what: 'Save files a scratch note in the folder; the shelf is remembered'
			},
			{
				at: '0.8.0.312',
				what: 'New makes a scratch note; drag a document onto a folder to move it'
			},
			{
				at: '0.8.0.311',
				what: 'A shelf above the tree for documents opened from outside the folder'
			},
			{ at: '0.8.0.310', what: 'The workspace names itself and its keys on one row' },
			{ at: '0.8.0.309', what: 'Rename and Delete moved onto a document’s right-click menu' },
			{ at: '0.8.0.309', what: 'The workspace browses folders as a tree you can shut' },
			{ at: '0.8.0.309', what: 'Code blocks are numbered inside the heading they sit under' },
			{ at: '0.8.0.306', what: 'A contents rail, built from the source so it is there in Write' },
			{ at: '0.8.0.305', what: 'Six heading levels behind one key in the bar' },
			{ at: '0.7.0.304', what: 'The editor remembers the folder you opened last time' },
			{ at: '0.7.0.302', what: 'Rename, delete and save in place, where the browser allows it' },
			{ at: '0.6.0.301', what: 'A workspace: a folder kept open beside the document' }
		]
	}
};

/** `v0.8.1.314` — all four positions, which is the only form this is ever shown in. */
export function versionOf(code: string): string {
	const r = RELEASES[code];
	if (!r) return '';
	return `v${r.major}.${r.minor}.${r.fixes}.${countedCommits || r.commits}`;
}

// A beta that has reached 1.0 is not a beta. Thrown at import, like the register's own guards,
// so it is a build failure rather than a thing somebody notices in a screenshot.
for (const [code, r] of Object.entries(RELEASES)) {
	if (r.major >= 1) {
		throw new Error(
			`versions: ${code} is v${r.major}.${r.minor} — a beta cannot reach 1.0. ` +
				'Take the Beta tag off the app first, then version it however you like.'
		);
	}
}
