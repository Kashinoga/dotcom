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
 *     v0.8.306
 *      │ │ └── COMMITS. Counted, not chosen — see `commits` below.
 *      │ └──── FEATURES. One whole feature, finished, is one bump. The workspace was a bump;
 *      │       giving the workspace a tree was not — that is the same feature, better.
 *      └────── COLLECTIONS. Bumped when enough features have landed that the app is a
 *              different proposition from the one the last collection described.
 *
 * The major NEVER reaches 1 while an app is in beta — 1.0 is the claim that the thing is
 * finished, and a beta tag is the claim that it is not. Both cannot be true, so the guard at the
 * foot of this file throws on a build that tries.
 */

/** One thing the app learned to do, and the version it learned it in. */
export type Feature = {
	/**
	 * The WHOLE version it landed in — `0.8.307`, not `0.8`. Written out rather than counted,
	 * because a commit count can only ever be counted for HEAD: the number for something that
	 * landed forty commits ago is history, and history is data.
	 *
	 * It has to be the whole triple. Several features land in one minor, so a list keyed on the
	 * first two numbers is a column of identical `0.8`s that says nothing about which came
	 * first — which is the one thing a list of recent work is for.
	 */
	at: string;
	/** What it does, in one line, from the visitor's side rather than the code's. */
	what: string;
};

export type AppRelease = {
	major: number;
	minor: number;
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
		minor: 8,
		commits: 313,
		recent: [
			{ at: '0.8.313', what: 'Save files a scratch note in the folder; the shelf is remembered' },
			{ at: '0.8.312', what: 'New makes a scratch note; drag a document onto a folder to move it' },
			{
				at: '0.8.311',
				what: 'A shelf above the tree for documents opened from outside the folder'
			},
			{ at: '0.8.310', what: 'The workspace names itself and its keys on one row' },
			{ at: '0.8.309', what: 'Rename and Delete moved onto a document’s right-click menu' },
			{ at: '0.8.309', what: 'The workspace browses folders as a tree you can shut' },
			{ at: '0.8.309', what: 'Code blocks are numbered inside the heading they sit under' },
			{ at: '0.8.306', what: 'A contents rail, built from the source so it is there in Write' },
			{ at: '0.8.305', what: 'Six heading levels behind one key in the bar' },
			{ at: '0.7.304', what: 'The editor remembers the folder you opened last time' },
			{ at: '0.7.302', what: 'Rename, delete and save in place, where the browser allows it' },
			{ at: '0.6.301', what: 'A workspace: a folder kept open beside the document' }
		]
	}
};

/** `v0.8.306` — the whole triple, which is the only form this is ever shown in. */
export function versionOf(code: string): string {
	const r = RELEASES[code];
	if (!r) return '';
	return `v${r.major}.${r.minor}.${countedCommits || r.commits}`;
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
