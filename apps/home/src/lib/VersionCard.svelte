<script lang="ts">
	import { RELEASES, versionOf } from '$lib/versions';

	// WHAT VERSION AN APP IS, drawn — the head, the legend, and the short list of what landed.
	//
	// Its own component because two things show it now and they are not the same shape: the Beta
	// TAG ($lib/BetaTag), which is a word in a bar that opens a card of its own, and the Text
	// Editor's SETTINGS flyout, where the version is one block among several and there is no tag
	// at all. The card is the part they share; the surface it stands on is each one's own.
	//
	// Everything here reads $lib/versions, keyed by the same code $lib/places uses. It draws no
	// popover, takes no position and opens nothing — whoever renders it decides all of that.

	let { code, title }: { code: string; title: string } = $props();

	const release = $derived(RELEASES[code]);
	const version = $derived(versionOf(code));
</script>

{#if release}
	<header class="ver-head">
		<span class="ver-name">{title}</span>
		<span class="ver-num">{version}</span>
	</header>
	<!-- What the four numbers mean, said once. A version nobody can read is a serial number.
	     One run of text with real spaces in it rather than four spans held apart by a flex
	     gap: a gap is not a space, and a screen reader read the legend as one word. -->
	<p class="ver-scheme">collections · features · fixes · commits</p>
	<h3 class="ver-sub">Recently</h3>
	<ul class="ver-list">
		{#each release.recent.slice(0, 5) as feature (feature.what)}
			<li class="ver-item">
				<span class="ver-at">{feature.at}</span>
				<span class="ver-what">{feature.what}</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.ver-head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.ver-name {
		flex: 1 1 auto;
		min-width: 0;
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.7rem;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* The version is the one figure on this card, so it is set in the figure face the rest of
	   the manual keeps for numbers — the section numerals, the listing tags, the workspace
	   tallies. */
	.ver-num {
		flex: none;
		font-family: var(--font-pixel, var(--font-mono, monospace));
		font-size: 1.05rem;
		line-height: 1;
		color: var(--orange);
	}
	/* The legend sits directly under the number and is spaced to read AGAINST it — one word per
	   figure, in the figures' own order. It is not aligned to them character by character: the
	   figures are proportional to their own values and any alignment would be a lie by the
	   second release. A fourth word is why the letter-spacing came off — at four words the line
	   wrapped inside `collections`, and a legend that breaks mid-word explains nothing. (The
	   REMAINING tracking came off with the uppercase in the type pass, which only helps that:
	   initial case at 0.6rem fits the four words with more room than the tracked caps did.) */
	.ver-scheme {
		margin: 0.2rem 0 0;
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.6rem;
		color: var(--sub);
	}
	.ver-sub {
		margin: 0.7rem 0 0.35rem;
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 0.62rem;
		font-weight: 700;
		color: var(--sub);
	}
	.ver-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	/* Each line carries the version it landed in, in the figure face, so the list reads as a
	   short history rather than as a feature list — you can see where one release ends. */
	.ver-item {
		display: flex;
		gap: 0.9rem;
		align-items: baseline;
	}
	/* The version each line landed in, in its own column. Wide enough for ALL FOUR positions —
	   `0.9.0.317`, not `0.9`: several features land in one minor, and a column of identical
	   `0.9`s says nothing about which came first, which is the one thing this list is for. The
	   gap to the text is the item's, and it is generous — these are two different kinds of thing
	   and a tight gap read them as one wrapped sentence. */
	.ver-at {
		flex: none;
		width: 4.6rem;
		font-family: var(--font-pixel, var(--font-mono, monospace));
		font-size: 0.8rem;
		line-height: 1.3;
		color: var(--sub);
		font-variant-numeric: tabular-nums;
	}
	.ver-what {
		flex: 1 1 auto;
		font-size: 0.76rem;
		line-height: 1.4;
	}
</style>
