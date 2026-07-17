import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Same-origin proxy for a reddit post + its verdicts — what the Court of Public Opinion
// reads from. Reddit's .json endpoints send no CORS header, so the page can't ask
// directly (the same reason /api/weather and /api/places exist); and the tallying
// belongs server-side anyway, so the page receives a verdict sheet, not a comment dump.
//
// Free and keyless, but reddit blocks anonymous default UAs — identify like the NWS
// proxy does.
const UA = 'kashinoga.com (contact@kashinoga.com)';

// The canonical verdicts, in the order the reveal lists them. YWBTA/YWNBTA (the
// hypothetical forms) fold into their plain cousins.
const VERDICTS = ['YTA', 'NTA', 'ESH', 'NAH', 'INFO'] as const;
type Verdict = (typeof VERDICTS)[number];

// Uppercase on purpose: the canonical votes are shouted, and a lowercase "info" in
// prose is not a ballot.
function verdictOf(body: string): Verdict | null {
	const m = body.match(/\b(YTA|YWBTA|NTA|YWNBTA|ESH|NAH|INFO)\b/);
	if (!m) return null;
	if (m[1] === 'YWBTA') return 'YTA';
	if (m[1] === 'YWNBTA') return 'NTA';
	return m[1] as Verdict;
}

/** The post id out of whatever shape of reddit link a person pastes. */
function idFrom(url: string): string | null {
	const m =
		url.match(/reddit\.com\/(?:r\/[^/]+\/)?comments\/([a-z0-9]{4,10})/i) ??
		url.match(/redd\.it\/([a-z0-9]{4,10})/i);
	return m ? m[1].toLowerCase() : null;
}

// A post's verdicts drift for hours after it lands, but a reader session is minutes —
// ten of them per id is fresh enough and keeps repeat reads (or a shared link making
// the rounds) off reddit's back.
const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 10 * 60 * 1000;

type Fetcher = typeof globalThis.fetch;
type Sourced = { post: any; comments: any[] };

async function fromReddit(id: string, f: Fetcher): Promise<Sourced> {
	const r = await f(
		`https://www.reddit.com/comments/${id}.json?limit=100&depth=1&sort=top&raw_json=1`,
		{ headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
	);
	if (!r.ok) throw new Error(String(r.status));
	const d = (await r.json()) as any[];
	return {
		post: d?.[0]?.data?.children?.[0]?.data,
		// Top-level comments only — a reply arguing with a ballot is not itself a ballot.
		// AutoModerator's sticky is court procedure, not a juror.
		comments: (d?.[1]?.data?.children ?? [])
			.filter((c: any) => c.kind === 't1' && !c.data?.stickied && typeof c.data?.body === 'string')
			.map((c: any) => c.data)
	};
}

const ARCTIC = 'https://arctic-shift.photon-reddit.com/api';
async function fromArctic(id: string, f: Fetcher): Promise<Sourced> {
	const opts = { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10000) };
	const [pr, cr] = await Promise.all([
		f(`${ARCTIC}/posts/ids?ids=${id}`, opts),
		f(`${ARCTIC}/comments/search?link_id=${id}&limit=100`, opts)
	]);
	if (!pr.ok) throw new Error(String(pr.status));
	const post = ((await pr.json()) as any)?.data?.[0];
	const comments = cr.ok
		? (((await cr.json()) as any)?.data ?? []).filter(
				(c: any) =>
					typeof c?.body === 'string' &&
					c.parent_id?.startsWith('t3_') && // top-level only, as above
					!c.stickied &&
					c.author !== 'AutoModerator'
			)
		: [];
	return { post, comments };
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const raw = (url.searchParams.get('url') ?? '').trim();
	if (!raw) return json({ msg: 'no url' }, { status: 400 });

	let id = idFrom(raw);
	if (!id && /reddit\.com\/r\/[^/]+\/s\//i.test(raw)) {
		// A share link (/s/…) is an opaque token — follow its redirect to the real path.
		try {
			const r = await fetch(raw, {
				headers: { 'user-agent': UA },
				redirect: 'follow',
				signal: AbortSignal.timeout(6000)
			});
			id = idFrom(r.url);
		} catch {
			/* fall through to the no-id error */
		}
	}
	if (!id) return json({ msg: 'not a reddit post link' }, { status: 400 });

	const hit = cache.get(id);
	// fresh=1 is the page's Update button: the reader wants the jury as it stands NOW,
	// so the TTL read is skipped (the fetch still refills the cache for everyone else).
	const fresh = url.searchParams.get('fresh') === '1';
	if (!fresh && hit && Date.now() - hit.at < TTL) {
		return json(hit.body, { headers: { 'cache-control': 'public, max-age=300' } });
	}

	try {
		// Reddit first — canonical and freshest — but reddit 403s anonymous JSON from most
		// non-residential networks these days, so the Arctic Shift archive (a public,
		// keyless reddit mirror) is the fallback that actually answers. Archive lag means
		// a very fresh post may show only its earliest ballots; AITA is usually read
		// settled, which is exactly when the archive is complete.
		const { post, comments } = await fromReddit(id, fetch).catch(() => fromArctic(id, fetch));
		if (!post?.title) throw new Error('no post');

		const tally = Object.fromEntries(VERDICTS.map((v) => [v, { n: 0, w: 0 }])) as Record<
			Verdict,
			{ n: number; w: number }
		>;
		const voted: { v: Verdict; score: number; author: string; body: string }[] = [];
		for (const c of comments) {
			const v = verdictOf(c.body);
			if (!v) continue;
			tally[v].n += 1;
			tally[v].w += Math.max(c.score ?? 0, 0); // a downvoted ballot still counts once, but carries no weight
			voted.push({ v, score: c.score ?? 0, author: c.author ?? '', body: c.body });
		}
		// The crowd's verdict is the WEIGHTED winner — reddit's own mechanism (the top
		// comment decides the flair) approximated from what one page of comments shows.
		const crowd =
			voted.length === 0
				? null
				: VERDICTS.reduce((a, b) => (tally[b].w > tally[a].w ? b : a), 'YTA' as Verdict);

		const body = {
			id,
			title: post.title as string,
			author: post.author as string,
			sub: (post.subreddit_name_prefixed as string) ?? 'r/AmItheAsshole',
			body: (post.selftext as string) ?? '',
			score: post.score as number,
			numComments: post.num_comments as number,
			created: (post.created_utc as number) ?? null, // epoch seconds — the page words the age
			tally,
			crowd,
			// The three loudest ballots, one glance each — the reveal quotes them.
			top: voted
				.sort((a, b) => b.score - a.score)
				.slice(0, 3)
				.map((c) => ({ ...c, body: c.body.length > 420 ? c.body.slice(0, 420) + '…' : c.body }))
		};
		if (!body.body) throw new Error('no story'); // a link post has nothing to read aloud

		cache.set(id, { at: Date.now(), body });
		return json(body, { headers: { 'cache-control': 'public, max-age=300' } });
	} catch {
		if (hit) return json(hit.body, { headers: { 'cache-control': 'public, max-age=60' } });
		return json({ msg: 'reddit is not answering (or that post has no story text)' }, { status: 502 });
	}
};
