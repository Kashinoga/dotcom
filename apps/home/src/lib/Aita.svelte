<script module lang="ts">
	import SplitFlap from '$lib/SplitFlap.svelte';
	import { EXTERNAL_SVG } from '$lib/icons';

	// The Court of Public Opinion: an r/AmItheAsshole reader built around one rule —
	// you judge BEFORE you see the jury. Paste a reddit link (or the story itself),
	// read it line by line at your own pace, bang the gavel, and only then does the
	// comment section's tally unseal. Reading it all at once with the votes in view
	// is scrolling; this is deliberating.
	//
	// It lives inside the ordinary panel like Weather — a reading, not a workspace.
	//
	// MODULE script, not instance: the panel unmounts this component every time it
	// closes, and a half-read case must survive that (Weather makes the same bargain
	// via $lib/weather-state). Everything below lives for the page, so closing the
	// court and coming back resumes mid-testimony, ruling intact.

	type Verdict = 'YTA' | 'NTA' | 'ESH' | 'NAH' | 'INFO';
	const VERDICTS: { id: Verdict; label: string; color: string }[] = [
		{ id: 'YTA', label: 'You’re the asshole', color: '#c93328' },
		{ id: 'NTA', label: 'Not the asshole', color: '#12a150' },
		{ id: 'ESH', label: 'Everyone sucks here', color: '#f06030' },
		{ id: 'NAH', label: 'No assholes here', color: '#29b0a1' },
		{ id: 'INFO', label: 'More info needed', color: '#8b46e0' }
	];
	const vMeta = (id: Verdict) => VERDICTS.find((v) => v.id === id)!;

	type Tally = Record<Verdict, { n: number; w: number }>;
	type Case = {
		title: string;
		lines: string[];
		sub?: string;
		author?: string;
		numComments?: number;
		created?: number | null; // epoch seconds
		tally?: Tally;
		crowd?: Verdict | null;
		top?: { v: Verdict; score: number; author: string; body: string; created?: number | null }[];
	};

	// input → read → judge → reveal, one direction, with "Another case" looping back.
	let stage = $state<'input' | 'read' | 'judge' | 'reveal'>('input');
	let src = $state('');
	let busy = $state(false);
	let error = $state('');
	let kase = $state<Case | null>(null);
	let idx = $state(0); // lines revealed so far (0 = only the title)
	let myPick = $state<Verdict | null>(null);
	// URL-mode provenance: the link that produced this case, its post id (the cache
	// key), and when its jury sheet was fetched — what the Update button refreshes.
	let caseLink = $state('');
	let caseId = $state('');
	let fetchedAt = $state(0);

	const isLink = (s: string) => /reddit\.com|redd\.it/i.test(s);
	const toLines = (s: string) =>
		s
			.split(/\n+/)
			.map((l) => l.trim())
			.filter(Boolean);
	const idFrom = (s: string) =>
		(s.match(/reddit\.com\/(?:r\/[^/]+\/)?comments\/([a-z0-9]{4,10})/i) ??
			s.match(/redd\.it\/([a-z0-9]{4,10})/i))?.[1]?.toLowerCase() ?? '';

	// ── The case file drawer ── re-opening a link you've already read costs nothing:
	// cases keep in localStorage by post id, newest dozen. Update refetches past it.
	const CASES_KEY = 'ksh-aita-cases';
	type Stored = { at: number; d: any };
	function drawer(): Record<string, Stored> {
		try {
			return JSON.parse(localStorage.getItem(CASES_KEY) ?? '{}');
		} catch {
			return {};
		}
	}
	function file(id: string, d: any) {
		try {
			const all = drawer();
			all[id] = { at: Date.now(), d };
			const keep = Object.entries(all)
				.sort((a, b) => b[1].at - a[1].at)
				.slice(0, 12);
			localStorage.setItem(CASES_KEY, JSON.stringify(Object.fromEntries(keep)));
		} catch {
			/* storage unavailable — every read just fetches */
		}
	}

	const shape = (d: any): Case => ({
		title: d.title,
		lines: toLines(d.body),
		sub: d.sub,
		author: d.author,
		numComments: d.numComments,
		created: d.created,
		tally: d.tally,
		crowd: d.crowd,
		top: d.top
	});

	async function fetchCase(link: string, fresh: boolean): Promise<any> {
		const r = await fetch(`/api/aita?url=${encodeURIComponent(link)}${fresh ? '&fresh=1' : ''}`);
		const d = await r.json();
		if (!r.ok) throw new Error(d?.msg ?? 'fetch failed');
		return d;
	}

	async function start() {
		const s = src.trim();
		if (!s || busy) return;
		error = '';
		if (isLink(s)) {
			caseLink = s;
			const hit = idFrom(s) ? drawer()[idFrom(s)] : undefined;
			if (hit) {
				// Filed already — open the drawer copy instantly; Update re-asks reddit.
				kase = shape(hit.d);
				caseId = hit.d.id;
				fetchedAt = hit.at;
			} else {
				busy = true;
				try {
					const d = await fetchCase(s, false);
					kase = shape(d);
					caseId = d.id;
					fetchedAt = Date.now();
					file(d.id, d);
				} catch (e) {
					error = e instanceof Error ? e.message : 'reddit is not answering';
					busy = false;
					return;
				}
				busy = false;
			}
		} else {
			// Pasted story: everything readable, nothing to unseal — the jury never showed.
			caseLink = '';
			caseId = '';
			const lines = toLines(s);
			// A short first line reads as the post's own title; keep it out of the body.
			const titled = lines.length > 1 && lines[0].length <= 120;
			kase = { title: titled ? lines[0] : 'The case, as pasted', lines: titled ? lines.slice(1) : lines };
		}
		if (!kase?.lines.length) {
			error = 'Nothing to read there.';
			kase = null;
			return;
		}
		idx = 0;
		myPick = null;
		stage = 'read';
	}

	// Refetch the same case past every cache — the jury drifts while a post is live.
	// The stage and your ruling stay put; only the sheet (and any OP edit) updates.
	async function update() {
		if (!caseLink || busy) return;
		busy = true;
		try {
			const d = await fetchCase(caseLink, true);
			kase = shape(d);
			caseId = d.id;
			fetchedAt = Date.now();
			file(d.id, d);
		} catch {
			/* the sheet you have stands */
		}
		busy = false;
	}

	function fmtAge(epochSec: number): string {
		const s = Math.max(0, Date.now() / 1000 - epochSec);
		if (s < 90) return 'just now';
		const steps: [number, string][] = [
			[60, 'm'],
			[3600, 'h'],
			[86400, 'd'],
			[604800, 'w'],
			[2629800, 'mo'],
			[31557600, 'y']
		];
		let div = 60,
			label = 'm';
		for (const [d, l] of steps) if (s >= d) ((div = d), (label = l));
		return `${Math.floor(s / div)}${label} ago`;
	}

	// The newest section stands as its own card for a beat, then folds into the body of
	// evidence above it (see .aita-line.merged) — the read literally accretes.
	let fresh = $state(false);
	let freshTimer = 0;
	function advance() {
		if (!kase) return;
		if (idx >= kase.lines.length) return deliberate();
		idx += 1;
		fresh = true;
		clearTimeout(freshTimer);
		freshTimer = window.setTimeout(() => (fresh = false), 900);
		if (idx >= kase.lines.length) return; // the last line lands; next tap opens court
		// Queried, not bound: this module script outlives the component instance, so it
		// can't hold a bind:this — and there's only ever one court in the DOM.
		queueMicrotask(() =>
			document
				.querySelector('.aita .aita-line.current')
				?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
		);
	}
	const retreat = () => ((idx = Math.max(0, idx - 1)), (fresh = false));
	const deliberate = () => (stage = 'judge');
	function judge(v: Verdict) {
		myPick = v;
		stage = 'reveal';
	}
	function reset() {
		stage = 'input';
		kase = null;
		src = '';
		idx = 0;
		myPick = null;
	}

	// Space/arrows page the read; only while reading, and never out from under a panel
	// that isn't showing this stage.
	function onKey(e: KeyboardEvent) {
		if (stage !== 'read') return;
		if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowRight') {
			e.preventDefault();
			advance();
		} else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
			e.preventDefault();
			retreat();
		}
	}

	// The jury sheet, shaped for bars: weighted share per verdict (weight = upvotes on
	// ballots), falling back to raw counts when a young thread has no weight yet.
	const sheet = $derived.by(() => {
		const t = kase?.tally;
		if (!t) return [];
		const totalW = VERDICTS.reduce((s, v) => s + t[v.id].w, 0);
		const totalN = VERDICTS.reduce((s, v) => s + t[v.id].n, 0);
		if (!totalN) return [];
		return VERDICTS.map((v) => ({
			...v,
			n: t[v.id].n,
			share: totalW ? t[v.id].w / totalW : t[v.id].n / totalN
		})).filter((v) => v.n > 0);
	});
	const fmtScore = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
</script>

<svelte:window onkeydown={onKey} />

<div class="aita">
	<!-- read and judge share one key: opening court must not remount the story — the
	     full merged section stays exactly where you read it, and the bench simply deals
	     in beneath it. Input and reveal each remount (they're different rooms). -->
	{#key stage === 'read' || stage === 'judge' ? 'case' : stage}
		{#if stage === 'input'}
			<p class="aita-lead" style="--n:0">
				Paste an <span class="mono">r/AmItheAsshole</span> link — or the story itself — and read
				it the way the court intended: one line at a time, verdict withheld until you’ve given
				yours.
			</p>
			<textarea
				class="aita-src"
				style="--n:1"
				rows="4"
				bind:value={src}
				placeholder="https://www.reddit.com/r/AmItheAsshole/comments/… — or paste the whole story"
				spellcheck="false"
				onkeydown={(e) => {
					if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start();
				}}
			></textarea>
			<div class="aita-actions" style="--n:2">
				<button type="button" class="aita-go" onclick={start} disabled={busy || !src.trim()}>
					{busy ? 'Fetching the case…' : 'Open the case'}
				</button>
				{#if error}<span class="aita-err" role="alert">{error}</span>{/if}
			</div>
		{:else if kase && (stage === 'read' || stage === 'judge')}
			<!-- The docket line: where this came from. -->
			{#if kase.sub}
				<p class="aita-meta" style="--n:0">
					{kase.sub} · u/{kase.author}{kase.created ? ` · ${fmtAge(kase.created)}` : ''}
				</p>
			{/if}
			<h3 class="aita-title" style="--n:1">
				{kase.title}{#if caseId}<a
						class="aita-out"
						href={`https://redd.it/${caseId}`}
						target="_blank"
						rel="noopener"
						aria-label="The post on reddit"
						title="The post on reddit">{@html EXTERNAL_SVG}</a
					>{/if}
			</h3>

			<!-- The reading itself: revealed lines dim behind the current one; the rest are
			     simply not there yet. The whole region is the advance button. -->
			<div
				class="aita-lines"
				style="--n:2"
				onclick={stage === 'read' ? advance : undefined}
				role={stage === 'read' ? 'button' : undefined}
				tabindex={stage === 'read' ? 0 : undefined}
				onkeydown={stage === 'read'
					? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), advance())
					: undefined}
				aria-label="The story — click or press space to reveal the next line"
			>
				{#each kase.lines.slice(0, Math.max(idx, 0)) as line, i (i)}
					<!-- merged: everything but the freshly-revealed card during the read —
					     once the beat passes (or the court convenes) the seams dissolve and
					     the sections read as ONE larger card. -->
					<p
						class="aita-line"
						class:current={i === idx - 1 && stage === 'read'}
						class:merged={stage !== 'read' || i < idx - 1 || !fresh}
					>{line}</p>
				{/each}
				{#if stage === 'read'}
					<p class="aita-cue">
						{idx === 0 ? 'Tap to begin reading' : idx < kase.lines.length ? 'Tap for the next section' : ''}
					</p>
				{/if}
			</div>

			{#if stage === 'read'}
				<div class="aita-meter" aria-hidden="true">
					<div class="aita-meter-fill" style:width="{(idx / kase.lines.length) * 100}%"></div>
				</div>
				<div class="aita-readrow">
					<span class="aita-count mono">{idx} / {kase.lines.length}</span>
					<button type="button" class="aita-mini" onclick={() => { idx = kase!.lines.length; deliberate(); }}>
						{idx >= kase.lines.length ? 'Show verdict' : 'Skip to the verdict'}
					</button>
				</div>
			{:else}
				<!-- Court is in session. -->
				<p class="aita-ask" style="--n:0">The story rests. Your verdict?</p>
				<div class="aita-bench" role="group" aria-label="Your verdict" style="--n:1">
					{#each VERDICTS as v (v.id)}
						<button type="button" class="aita-verdict" style:--vc={v.color} onclick={() => judge(v.id)}>
							<b>{v.id}</b> <span>{v.label}</span>
						</button>
					{/each}
				</div>
			{/if}
		{:else if kase && stage === 'reveal'}
			<p class="aita-meta" style="--n:0">{kase.title}</p>
			{#if kase.crowd && myPick}
				<div class="aita-crowd" style="--n:1" style:--vc={vMeta(kase.crowd).color}>
					<span class="aita-crowd-word"><SplitFlap text={kase.crowd} base={200} stagger={70} /></span>
					<p class="aita-crowd-sub">
						{vMeta(kase.crowd).label} — the court’s ruling{kase.numComments
							? `, from ${kase.numComments.toLocaleString()} comments`
							: ''}.
						{#if myPick === kase.crowd}You ruled the same way.{:else}You said {myPick} — the court
							disagrees.{/if}
					</p>
				</div>
				<div class="aita-sheet" style="--n:2">
					{#each sheet as v, i (v.id)}
						<div class="aita-row" style="--n:{3 + i}">
							<span class="aita-row-id mono" style:color={v.color}>{v.id}</span>
							<span class="aita-bar"><span class="aita-bar-fill" style:background={v.color} style:--share={v.share}></span></span>
							<span class="aita-row-n mono">{v.n}</span>
						</div>
					{/each}
				</div>
				{#if kase.top?.length}
					<div class="aita-quotes" style="--n:8">
						{#each kase.top as c, i (i)}
							<blockquote class="aita-quote">
								<p class="aita-quote-meta">
									<b style:color={vMeta(c.v).color}>{c.v}</b> · u/{c.author} ·
									▲{fmtScore(c.score)}{c.created ? ` · ${fmtAge(c.created)}` : ''}
								</p>
								<p class="aita-quote-body">{c.body}</p>
							</blockquote>
						{/each}
					</div>
				{/if}
			{:else}
				<div class="aita-crowd" style="--n:1" style:--vc={myPick ? vMeta(myPick).color : 'var(--sub)'}>
					<span class="aita-crowd-word"><SplitFlap text={myPick ?? '—'} base={200} stagger={70} /></span>
					<p class="aita-crowd-sub">
						{myPick ? vMeta(myPick).label : ''} — your ruling. No jury attached: the case arrived
						without its comments, so the gavel stands alone.
					</p>
				</div>
			{/if}
			<div class="aita-actions aita-again" style="--n:9">
				<!-- Back into the courtroom: the full story, bench still seated — reread the
				     testimony, and re-ring if it changed your mind (a new ruling re-reveals). -->
				<button type="button" class="aita-go" onclick={() => (stage = 'judge')}>Back to the case</button>
				<button type="button" class="aita-go" onclick={reset}>Another case</button>
				{#if caseLink}
					<!-- The jury drifts while a post is live — this refetches past both caches
					     (the drawer's and the server's). Your ruling stands; the tally moves. -->
					<button type="button" class="aita-go" onclick={update} disabled={busy}>
						{busy ? 'Checking…' : 'Check comments'}
					</button>
					<span class="aita-fetched">comments {fmtAge(fetchedAt / 1000)}</span>
				{/if}
			</div>
		{/if}
	{/key}
</div>

<style>
	.aita {
		display: flex;
		flex-direction: column;
		gap: 1.05rem;
	}

	/* ── Entrance: each stage's pieces settle in top-to-bottom, and #key on the stage
	   replays it — a new stage LANDS the way a new city does in Weather. */
	@media (prefers-reduced-motion: no-preference) {
		.aita > :global(*) {
			animation: aita-settle 0.45s ease backwards;
			animation-delay: calc(var(--n, 0) * 0.07s);
		}
		.aita-row .aita-bar-fill {
			animation: aita-bar 0.7s cubic-bezier(0.22, 1, 0.36, 1) backwards;
			animation-delay: calc(var(--n, 0) * 0.07s);
		}
	}
	@keyframes aita-settle {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@keyframes aita-bar {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}

	.aita-lead {
		margin: 0;
		max-width: 62ch;
		line-height: 1.62;
		color: color-mix(in srgb, var(--ink) 82%, var(--sub));
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 0.92em;
	}
	.aita-src {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1.5px solid var(--line);
		border-radius: 8px;
		padding: 0.6rem 0.7rem;
		resize: vertical;
	}
	.aita-src:focus {
		outline: none;
		border-color: var(--accent-strong, var(--orange));
	}
	.aita-actions {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}
	/* The act button — the 42px family, worded. */
	.aita-go {
		display: inline-flex;
		align-items: center;
		box-sizing: border-box;
		height: 42px;
		padding: 0 1.1rem;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--ink);
		background: var(--aero-face);
		border: 1px solid var(--line-edge);
		border-radius: 999px;
		cursor: pointer;
	}
	.aita-go:hover:not(:disabled) {
		background: color-mix(in srgb, var(--ink) 12%, transparent);
	}
	.aita-go:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.aita-err {
		font-size: 0.85rem;
		color: #c93328;
	}

	.aita-meta {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--sub);
	}
	.aita-title {
		margin: 0;
		font-size: 1.35rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		line-height: 1.25;
		color: var(--ink);
		max-width: 34ch;
	}
	/* The outbound mark, riding the title's end — the site's usual "this trip leaves"
	   disc, sized to the title's own type. */
	.aita-out {
		display: inline-block;
		margin-left: 0.4rem;
		color: var(--sub);
		vertical-align: baseline;
	}
	.aita-out :global(svg) {
		width: 0.8em;
		height: 0.8em;
		display: inline-block;
		vertical-align: -0.05em;
	}
	.aita-out:hover {
		color: var(--ink);
	}

	/* ── The reading. The story speaks in the data mono (Space Mono) — testimony being
	   entered into the record, one exhibit at a time. Each section arrives as its OWN
	   card (face + line, the quote cards' material), stands alone for a beat, then its
	   seams dissolve into the card above — the body of evidence grows as one slab.
	   Everything in the merge is animatable (margins, borders, radii), so the fold-in
	   travels instead of snapping. Read lines dim; the current one holds the ink. */
	.aita-lines {
		display: flex;
		flex-direction: column;
		cursor: pointer;
		max-width: 62ch;
	}
	.aita-lines:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 6px;
		border-radius: 6px;
	}
	.aita-line {
		margin: 0.85rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.92rem;
		line-height: 1.7;
		color: var(--sub);
		background: color-mix(in srgb, var(--ink) 3%, transparent);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 0.6rem 0.9rem;
		transition: color 0.35s ease, margin 0.4s ease, border-color 0.4s ease,
			border-radius 0.4s ease;
	}
	.aita-line:first-child {
		margin-top: 0;
	}
	.aita-line.current {
		color: var(--ink);
	}
	/* The seams: a merged card butting a merged card gives up the gap, the doubled rule
	   and the corner radii between them — what remains reads as one card with paragraph
	   air inside. :has() squares the UPPER card's bottom; the sibling combinator squares
	   the lower card's top. */
	.aita-line.merged + .aita-line.merged {
		margin-top: 0;
		border-top: 0;
		border-top-left-radius: 0;
		border-top-right-radius: 0;
		padding-top: 0.2rem;
	}
	.aita-line.merged:has(+ .aita-line.merged) {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		border-bottom: 0;
		padding-bottom: 0.2rem;
	}
	@media (prefers-reduced-motion: no-preference) {
		.aita-line.current {
			animation: aita-settle 0.4s ease backwards;
		}
	}
	.aita-cue {
		margin: 0.85rem 0 0;
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--sub);
		opacity: 0.8;
	}

	/* The read meter — the route-progress track's build, laid flat under the story. */
	.aita-meter {
		height: 3px;
		border-radius: 2px;
		background: color-mix(in srgb, var(--ink) 12%, transparent);
		overflow: hidden;
		max-width: 62ch;
	}
	.aita-meter-fill {
		height: 100%;
		border-radius: 2px;
		background: var(--accent-strong, var(--orange));
		transition: width 0.3s ease;
	}
	.aita-readrow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: 62ch;
	}
	.aita-count {
		font-size: 0.75rem;
		color: var(--sub);
		font-variant-numeric: tabular-nums;
	}
	.aita-mini {
		font: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--sub);
		background: none;
		border: 0;
		padding: 0.2rem 0;
		cursor: pointer;
	}
	.aita-mini:hover {
		color: var(--ink);
	}

	.aita-fetched {
		font-size: 0.75rem;
		color: var(--sub);
	}

	/* ── The bench: five verdicts, each wearing its own colour on the band. */
	.aita-ask {
		margin: 0;
		font-family: var(--font-motto);
		font-style: italic;
		font-size: 1.05rem;
		color: var(--ink);
	}
	.aita-bench {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	/* Aero family pills, a drop of the verdict's colour poured into the face (the
	   toast's food-colouring move) — one 42px line each, the acronym in ink and the
	   plain words riding sub beside it. */
	.aita-verdict {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		box-sizing: border-box;
		height: 42px;
		font: inherit;
		color: var(--ink);
		background: color-mix(in srgb, var(--vc) 14%, var(--aero-face));
		border: 1px solid color-mix(in srgb, var(--vc) 55%, transparent);
		border-radius: 999px;
		padding: 0 1rem;
		cursor: pointer;
		transition: background 0.15s ease, border-color 0.15s ease;
	}
	.aita-verdict:hover {
		background: color-mix(in srgb, var(--vc) 26%, var(--aero-face));
		border-color: var(--vc);
	}
	.aita-verdict b {
		font-size: 0.9rem;
		letter-spacing: 0.02em;
	}
	.aita-verdict span {
		font-size: 0.75rem;
		color: var(--sub);
	}
	/* Bubble: the pills join the family — frost, rim light and drop, like every chip. */
	:global(html[data-ui='bubble']) .aita-verdict,
	:global(html[data-ui='bubble']) .aita-go {
		-webkit-backdrop-filter: blur(6px) saturate(1.3);
		backdrop-filter: blur(6px) saturate(1.3);
		box-shadow: var(--aero-gloss), var(--aero-drop);
	}

	/* Pixelite: the case buttons (Open the case, Back, Another case, Update) become plastic
	   keys — white/50 face, ink border, raised bevel, mono uppercase label; cobalt on hover,
	   the bevel sinking on press. Mirrors the shared control family in pixelite.css. */
	:global(html[data-look='pixelite']) .aita-go {
		/* 28px: the manual's one control line (pixelite.css .icon-btn note), replacing the
		   Aero family's 42px pill height. The verdict pills below match. */
		height: 28px;
		background: var(--pixel-key-face);
		border: 1px solid var(--pixel-key-border);
		border-radius: 4px;
		box-shadow: var(--pixel-bevel);
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	:global(html[data-look='pixelite']) .aita-verdict {
		height: 28px;
	}
	:global(html[data-look='pixelite']) .aita-go:hover:not(:disabled) {
		color: var(--orange);
		border-color: var(--orange);
		background: var(--pixel-key-face);
	}
	:global(html[data-look='pixelite']) .aita-go:active:not(:disabled) {
		box-shadow: var(--pixel-bevel-press);
	}

	/* ── The reveal. The crowd's word flips in on the split-flap — the site's own way
	   of announcing an arrival — wearing the verdict's colour. */
	.aita-crowd {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.aita-crowd-word {
		font-size: clamp(2.25rem, 8vw, 4rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--vc);
	}
	.aita-crowd-sub {
		margin: 0;
		max-width: 56ch;
		line-height: 1.55;
		color: color-mix(in srgb, var(--ink) 82%, var(--sub));
	}
	.aita-sheet {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		max-width: 34rem;
	}
	/* E-COPO: the ballot sheet stretches to the reading column's full measure — in the
	   centred expanded layout a capped chart floated in slack, and the bars are the one
	   piece here that's a gauge, not prose (long bars read better, not worse). */
	:global(.surface.expanded) .aita-sheet {
		max-width: none;
	}
	.aita-row {
		display: grid;
		grid-template-columns: 3.2rem 1fr 2.6rem;
		align-items: center;
		gap: 0.6rem;
	}
	.aita-row-id {
		font-size: 0.78rem;
		font-weight: 700;
	}
	.aita-row-n {
		font-size: 0.78rem;
		color: var(--sub);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.aita-bar {
		display: block;
		height: 10px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--ink) 8%, transparent);
		overflow: hidden;
	}
	.aita-bar-fill {
		display: block;
		height: 100%;
		border-radius: 6px;
		width: calc(var(--share) * 100%);
		transform-origin: left center;
	}

	.aita-quotes {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		max-width: 62ch;
	}
	.aita-quote {
		margin: 0;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: color-mix(in srgb, var(--ink) 3%, transparent);
	}
	.aita-quote-meta {
		margin: 0 0 0.3rem;
		font-size: 0.75rem;
		color: var(--sub);
	}
	.aita-quote-body {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.6;
		color: color-mix(in srgb, var(--ink) 85%, var(--sub));
		white-space: pre-line;
	}
	.aita-again {
		align-self: flex-start;
	}
</style>
