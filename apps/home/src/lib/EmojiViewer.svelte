<script lang="ts">
	import { EMOJI_GROUPS } from '$lib/emoji';
	import { emojiSearch } from '$lib/emoji-search.svelte';
	import { SEARCH_SVG } from '$lib/icons';

	// Emoji Viewer — browse the SYSTEM emoji set (bare Unicode, drawn by the visitor's own
	// platform font) and copy one with a tap. No images shipped; the OS does the drawing.
	// The search shares its query through $lib/emoji-search and narrows the wall by name across
	// every group. Under AEROPALITE it's the panel-header disc (EmojiSearch); under PIXELITE docs
	// mode there's no panel header, so this component grows its own sticky search bar instead —
	// gated on `docs`, so Aeropalite is untouched (it never renders the bar).
	let { docs = false }: { docs?: boolean } = $props();

	let copied = $state(''); // the emoji just copied — echoed back for a beat
	let copiedTimer = 0;

	function onSearchKey(e: KeyboardEvent) {
		if (e.key === 'Escape') emojiSearch.query = '';
	}

	// Filter within each group, then drop groups the search emptied — so a query collapses
	// the view to just the groups that still have a hit, headers and all.
	const groups = $derived.by(() => {
		const q = emojiSearch.query.trim().toLowerCase();
		if (!q) return EMOJI_GROUPS;
		return EMOJI_GROUPS.map((g) => ({
			name: g.name,
			emojis: g.emojis.filter(([, name]) => name.toLowerCase().includes(q))
		})).filter((g) => g.emojis.length);
	});
	const total = $derived(groups.reduce((n, g) => n + g.emojis.length, 0));

	async function copy(char: string) {
		try {
			await navigator.clipboard.writeText(char);
		} catch {
			// Clipboard API blocked (insecure context, denied permission): fall back to the
			// old execCommand path so a tap still copies rather than silently failing.
			const ta = document.createElement('textarea');
			ta.value = char;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			try {
				document.execCommand('copy');
			} catch {
				/* nothing more to try — leave `copied` unset so no false confirmation */
				ta.remove();
				return;
			}
			ta.remove();
		}
		copied = char;
		clearTimeout(copiedTimer);
		copiedTimer = window.setTimeout(() => (copied = ''), 1400);
	}
</script>

<div class="ev" class:ev-docs={docs}>
	{#if docs}
		<!-- Pixelite docs mode: a full-width search bar under the chapter head. In FLOW, not
		     sticky — once it scrolls away, the shell's superbar reveals its own search control
		     (see DocsShell). Bound to the SAME shared query as the Aeropalite header disc and
		     the superbar's field — one search, several mouths. -->
		<div class="ev-searchbar">
			<div class="ev-search-field">
				<span class="ev-search-ico" aria-hidden="true">{@html SEARCH_SVG}</span>
				<input
					class="ev-search"
					type="search"
					placeholder="Search emoji by name"
					autocomplete="off"
					spellcheck="false"
					aria-label="Search emoji by name"
					bind:value={emojiSearch.query}
					onkeydown={onSearchKey}
				/>
				{#if emojiSearch.query}
					<button
						type="button"
						class="ev-search-clear"
						aria-label="Clear search"
						onclick={() => (emojiSearch.query = '')}>×</button
					>
				{/if}
			</div>
		</div>
	{/if}
	<!-- One-line note, fixed height (see .ev-note) so swapping the hint for the copy
	     confirmation never nudges the grid below it. -->
	{#if copied}
		<p class="ev-note" role="status"><span class="ev-note-em">{copied}</span> copied to your clipboard.</p>
	{:else}
		<p class="ev-note ev-note-dim">Tap any emoji to copy it.</p>
	{/if}

	{#if total === 0}
		<p class="ev-empty">No emoji named “{emojiSearch.query}”. Try a plainer word.</p>
	{:else}
		{#each groups as g (g.name)}
			<section class="ev-group">
				<h3 class="ev-group-name">{g.name}</h3>
				<div class="ev-grid">
					{#each g.emojis as [char, name] (char + name)}
						<button
							type="button"
							class="ev-cell"
							class:just-copied={copied === char}
							title={name}
							aria-label="{name} — tap to copy"
							onclick={() => copy(char)}
						>
							<span class="ev-em">{char}</span>
						</button>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>

<style>
	.ev {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* ── Docs-mode search bar (Pixelite only; never rendered under Aeropalite) ────────────────
	   Full width of the content column: it negative-margins back out of the .docs-body gutter
	   (--docs-pad, published by the shell) to the column's true SIDE edges, then re-pads its
	   own inner content to the gutter so the field lines up over the wall. Seated directly
	   below the chapter head (the negative top margin swallows the head's 1.75rem bottom
	   margin) and stays IN FLOW — no sticky, no rules of its own: once it scrolls away the
	   shell's superbar reveals its search control instead (see DocsShell). */
	.ev-searchbar {
		/* No bottom margin of its own — the .ev column's gap already parts it from the note. */
		margin: -1.75rem calc(-1 * var(--docs-pad)) 0;
		padding: 0.55rem var(--docs-pad) 0;
	}
	/* The keyed field material (same tokens as .field under Pixelite): white/50 face, ink rule,
	   the plastic bevel, cobalt on focus. */
	.ev-search-field {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		/* 28px: the manual's one control line (pixelite.css .icon-btn note). */
		height: 28px;
		padding: 0 0.7rem;
		background: var(--pixel-key-face);
		border: 1px solid var(--pixel-key-border);
		border-radius: 4px;
		box-shadow: var(--pixel-bevel);
	}
	.ev-search-field:focus-within {
		border-color: var(--orange);
	}
	.ev-search-ico {
		flex: none;
		display: grid;
		place-items: center;
		color: var(--sub);
	}
	.ev-search-ico :global(svg) {
		display: block;
		width: 1.05rem;
		height: 1.05rem;
	}
	.ev-search {
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		padding: 0;
		border: 0;
		background: none;
		font-family: var(--font-mono, ui-monospace, monospace);
		/* 16px so iOS Safari doesn't zoom the page on focus. */
		font-size: 16px;
		color: var(--ink);
	}
	.ev-search::placeholder {
		color: var(--sub);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.74rem;
	}
	.ev-search:focus-visible {
		outline: none; /* the field's focus-within border is the affordance */
	}
	/* Hide the native search clear (WebKit) — the bar carries its own mono × instead. */
	.ev-search::-webkit-search-cancel-button {
		display: none;
	}
	.ev-search-clear {
		flex: none;
		display: grid;
		place-items: center;
		width: 1.4rem;
		height: 1.4rem;
		padding: 0;
		font-family: var(--font-mono, monospace);
		font-size: 1.1rem;
		line-height: 1;
		color: var(--sub);
		background: none;
		border: 0;
		border-radius: 3px;
		cursor: pointer;
	}
	.ev-search-clear:hover {
		color: var(--orange);
	}
	/* Entrance — the pieces settle top-to-bottom, the Weather/Court/game cadence. */
	@media (prefers-reduced-motion: no-preference) {
		.ev > * {
			animation: ev-settle 0.45s ease backwards;
		}
		.ev > :nth-child(2) {
			animation-delay: 0.06s;
		}
		.ev > :nth-child(3) {
			animation-delay: 0.12s;
		}
		.ev > :nth-child(n + 4) {
			animation-delay: 0.18s;
		}
	}
	@keyframes ev-settle {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.ev-note {
		margin: 0;
		/* Fixed height, contents centred: the copy confirmation carries a 1.05rem emoji
		   taller than the plain hint, and swapping the two must not change the row's height
		   and jerk the grid below. Both states sit in this reserved line. */
		display: flex;
		align-items: center;
		min-height: 1.6rem;
		font-size: 0.85rem;
		color: var(--ink);
	}
	.ev-note-dim {
		color: var(--sub);
	}
	.ev-note-em {
		font-size: 1.05rem;
		line-height: 1;
		margin-right: 0.15rem;
	}
	.ev-empty {
		margin: 0;
		font-size: 0.9rem;
		color: var(--sub);
	}

	.ev-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.ev-group-name {
		margin: 0;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--sub);
	}
	/* A tight grid of square cells — as many across as fit, so the wall reflows to the
	   panel's width (compact, expanded, or the phone sheet). */
	.ev-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(2.6rem, 1fr));
		gap: 0.35rem;
	}
	/* Each emoji is a button; the glyph is the whole affordance, so the cell is a bare
	   square that lights on hover/press and flashes the accent the instant it's copied. */
	.ev-cell {
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 10px;
		background: none;
		cursor: pointer;
		transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
	}
	.ev-cell:hover {
		background: var(--aero-face);
		border-color: var(--line-edge);
	}
	.ev-cell:active {
		transform: scale(0.9);
	}
	.ev-cell:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.ev-cell.just-copied {
		background: color-mix(in srgb, var(--accent, #f06030) 16%, transparent);
		border-color: var(--accent, #f06030);
	}
	.ev-em {
		/* The emoji itself. A hair larger than body text so the wall reads at a glance; the
		   emoji font is the system's, so it renders in the platform's own hand. line-height
		   1 keeps the cell square. */
		font-size: 1.5rem;
		line-height: 1;
	}
</style>
