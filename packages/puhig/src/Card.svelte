<script lang="ts">
	import type { Snippet } from 'svelte';

	export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';
	export type Mana = 'W' | 'U' | 'B' | 'R' | 'G';

	let {
		name = '',
		rarity = 'common',
		// Full-frame (MTG legendary) props — presence of typeLine/rules switches
		// the card into framed mode.
		mana = [],
		typeLine = '',
		art = '',
		rules = [],
		power = '',
		toughness = '',
		collector = '',
		rarityCode = '',
		setCode = '',
		lang = 'EN',
		artist = '',
		copyright = '',
		children
	}: {
		name?: string;
		rarity?: Rarity;
		mana?: Mana[];
		typeLine?: string;
		art?: string;
		rules?: string[];
		power?: string;
		toughness?: string;
		collector?: string;
		rarityCode?: string;
		setCode?: string;
		lang?: string;
		artist?: string;
		copyright?: string;
		children?: Snippet;
	} = $props();

	const holo = $derived(rarity === 'rare' || rarity === 'mythic');
	const framed = $derived(!!(typeLine || rules.length || power));

	// Split a rules line so parenthetical reminder text renders italic.
	function segments(text: string): { t: string; i: boolean }[] {
		const out: { t: string; i: boolean }[] = [];
		const re = /\([^)]*\)/g;
		let last = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(text))) {
			if (m.index > last) out.push({ t: text.slice(last, m.index), i: false });
			out.push({ t: m[0], i: true });
			last = m.index + m[0].length;
		}
		if (last < text.length) out.push({ t: text.slice(last), i: false });
		return out;
	}
</script>

{#snippet pip(m: Mana)}
	<span class="pip pip--{m}" aria-hidden="true">
		{#if m === 'W'}
			<svg viewBox="0 0 24 24"
				><circle cx="12" cy="12" r="4.4" /><g
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linecap="round"
					>{#each [0, 45, 90, 135, 180, 225, 270, 315] as a}<line
							x1="12"
							y1="12"
							x2={12 + 8.5 * Math.cos((a * Math.PI) / 180)}
							y2={12 + 8.5 * Math.sin((a * Math.PI) / 180)}
							transform="translate(0,0)"
						/>{/each}</g
				></svg
			>
		{:else if m === 'U'}
			<svg viewBox="0 0 24 24"
				><path d="M12 3C8 9 6 13 6 15.5A6 6 0 0018 15.5C18 13 16 9 12 3Z" /></svg
			>
		{:else if m === 'B'}
			<svg viewBox="0 0 24 24"
				><path
					d="M12 3C7.6 3 4.5 6 4.5 10c0 2.4 1.2 4 2.8 5.2l-.5 2.3 2.4-.6.5 1.7 1.8-1 1.8 1 .5-1.7 2.4.6-.5-2.3c1.6-1.2 2.8-2.8 2.8-5.2C19.5 6 16.4 3 12 3Z"
				/><circle cx="9.3" cy="10.3" r="1.7" fill="var(--pip)" /><circle
					cx="14.7"
					cy="10.3"
					r="1.7"
					fill="var(--pip)"
				/></svg
			>
		{:else if m === 'G'}
			<svg viewBox="0 0 24 24"
				><rect x="10.7" y="12" width="2.6" height="8" rx="0.6" /><path
					d="M12 2.5 18.5 13H5.5Z"
				/><path d="M12 6 16.5 13.5H7.5Z" fill="var(--pip)" opacity="0.35" /></svg
			>
		{:else if m === 'R'}
			<svg viewBox="0 0 24 24"
				><path
					d="M12 3C9 8 7 9 7 13a5 5 0 0010 0c0-1.5-.6-2.7-1.5-3.7C15.5 12 14 12 14 9c0-2-1-4-2-6Z"
				/></svg
			>
		{/if}
	</span>
{/snippet}

<article class="card" class:card--framed={framed} data-rarity={rarity}>
	<div class="card-face">
		{#if framed}
			<div class="titlebar">
				<span class="title">{name}</span>
				{#if mana.length}
					<span class="mana"
						>{#each mana as m}{@render pip(m)}{/each}</span
					>
				{/if}
			</div>

			<div class="artbox">
				{#if art}
					<img class="art" src={art} alt={name} />
				{:else}
					<div class="art art--placeholder" aria-hidden="true"></div>
				{/if}
			</div>

			<div class="typebar">
				<span class="typeline">{typeLine}</span>
				{#if rarityCode}<span class="setsymbol" data-r={rarityCode.toLowerCase()}></span>{/if}
			</div>

			<div class="textbox">
				<div class="rules">
					{#each rules as line}
						<p>
							{#each segments(line) as s}<span class:reminder={s.i}>{s.t}</span>{/each}
						</p>
					{/each}
				</div>
			</div>

			<div class="footer">
				<span class="footer-l">
					<span class="mono">{collector}{rarityCode ? ' ' + rarityCode : ''}</span>
					<span class="footer-credit">
						<span class="mono">{setCode}{setCode ? ' • ' : ''}{lang}</span>
						{#if artist}<span class="artist">✎ {artist}</span>{/if}
					</span>
				</span>
				<span class="stamp" aria-hidden="true"></span>
				{#if copyright}<span class="footer-r">{copyright}</span>{/if}
			</div>

			{#if power}
				<div class="pt"><span>{power}/{toughness}</span></div>
			{/if}
		{:else}
			{#if name}
				<header class="nameplate">
					<span class="nameplate-title">{name}</span>
				</header>
			{/if}
			<div class="card-art">
				{#if children}{@render children()}{/if}
			</div>
		{/if}
		{#if holo}
			<!-- Inside the face so the foil clips to the inner (face) radius, not the
			     card's outer radius — keeps the black border a constant width. -->
			<div class="foil foil--spectrum" aria-hidden="true"></div>
			<div class="foil foil--shine" aria-hidden="true"></div>
			<div class="foil foil--sparkle-a" aria-hidden="true"></div>
			<div class="foil foil--sparkle-b" aria-hidden="true"></div>
		{/if}
	</div>
</article>

<style>
	/* The card = a matte black MTG border framing an inset face. */
	.card {
		position: relative;
		display: flex;
		width: var(--card-w, 240px);
		aspect-ratio: var(--card-ratio, 5 / 7);
		padding: var(--card-border-w, 8px);
		background-color: var(--card-border, #0a0a0a);
		border-radius: var(--card-radius, 10px);
		/* Cut-edge definition: a top-lit hairline + a soft groove darkening the
		 * outer rim, so the border reads as a bevelled edge against the sleeve
		 * rather than a flat plate. Drop shadow (or the sleeve's override) last. */
		box-shadow:
			inset 0 1px 0 var(--card-edge-seam, rgba(255, 255, 255, 0.3)),
			inset 0 0 3px var(--card-edge-groove, rgba(0, 0, 0, 0.14)),
			var(--card-shadow, 0 8px 24px rgba(0, 0, 0, 0.08));
		/* Geometric clip (baked into paint, before any ancestor transform) instead
		 * of relying on overflow:hidden — the compositor clips overflow squarely
		 * under the sleeve's 3D tilt, squaring the corners. clip-path survives it.
		 * It clips at the border box, so the inset bevel is kept; only the soft
		 * outer drop is trimmed (the sleeve carries the grounding shadow anyway). */
		overflow: hidden;
		clip-path: inset(0 round var(--card-radius, 10px));
	}

	/* Under the sleeve's 3D tilt, .card and .card-face are each clip-path'd, so the
	 * compositor rasterises them as two separate layers whose edges snap to
	 * subpixels independently — leaving a hairline gap at the border/face seam that
	 * the page backdrop bleeds through (a bright "seep" that vanishes only once the
	 * card settles flat). Flattening .card onto its own raster layer folds the face
	 * into it, so there's a single edge and nothing shows through. Scoped to the
	 * live-pose flag (see tilt.ts): the layer is held only while tilted — including
	 * a held, cursor-stationary pose — and dropped at rest, per the no-GPU-layer-
	 * per-card-at-rest rule. */
	:global(.puhig-tilted) .card {
		transform: translateZ(0);
		backface-visibility: hidden;
	}

	.card-face {
		position: relative;
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		background-color: var(--surface, #f4f4f5);
		border-radius: var(--card-face-radius, 3px);
		/* Same geometric clip as .card — keeps the foil/art corners rounded under
		 * the tilt where overflow:hidden would square them. */
		overflow: hidden;
		clip-path: inset(0 round var(--card-face-radius, 3px));
	}

	/* Paper tooth (minimal cardstock card only). */
	.card:not(.card--framed) .card-face::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		background-image: var(--card-grain);
		background-size: 140px 140px;
		opacity: 0.4;
		mix-blend-mode: multiply;
	}

	/* Seam between face and border. Instead of a hard line, a soft inner groove:
	 * the inner edge darkens and fades in a couple px, so the face reads as set
	 * into the frame. Above the foil (same z, later in paint order) so holo cards
	 * still show it; below the name (z-index 3). */
	.card-face::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		border-radius: inherit;
		box-shadow:
			inset 0 0 0 1px var(--card-face-seam, rgba(0, 0, 0, 0.05)),
			inset 0 0 3px var(--card-face-groove, rgba(0, 0, 0, 0.13));
	}

	/* ─── Full legendary frame ─────────────────────────────────────────────
	 * The face becomes the metallic gold frame; the art window and text box are
	 * inset panels, and the gold shows through the bars and gaps between them. */
	.card--framed {
		font-family: Georgia, 'Times New Roman', serif;
	}
	.card--framed .card-face {
		gap: calc(var(--card-w, 240px) * 0.012);
		padding: calc(var(--card-w, 240px) * 0.016);
		background-image:
			var(--plate-grain),
			linear-gradient(
				160deg,
				#c9a24c 0%,
				#f0dc94 12%,
				#b78f3d 34%,
				#e6cd80 52%,
				#a67f31 72%,
				#e2c877 88%,
				#9c7529 100%
			);
		background-size:
			120px 120px,
			auto;
		background-blend-mode: overlay, normal;
	}

	.titlebar,
	.typebar {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: calc(var(--card-w, 240px) * 0.02);
		padding: calc(var(--card-w, 240px) * 0.022) calc(var(--card-w, 240px) * 0.03);
		border-radius: calc(var(--card-w, 240px) * 0.012);
		/* raised gold bar */
		background: linear-gradient(180deg, #f2dd90 0%, #cba24e 45%, #9c7529 55%, #d8b45e 100%);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.4),
			inset 0 -1px 0 rgba(0, 0, 0, 0.4),
			inset 0 0 0 1px rgba(60, 45, 18, 0.8),
			0 1px 1px rgba(0, 0, 0, 0.3);
	}

	.title {
		font-size: calc(var(--card-w, 240px) * 0.045);
		font-weight: 700;
		letter-spacing: 0.003em;
		color: #1a1206;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.2);
	}

	.typeline {
		font-size: calc(var(--card-w, 240px) * 0.039);
		font-weight: 700;
		color: #1a1206;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.2);
	}

	/* Mana pips — colored discs with a dark symbol. */
	.mana {
		display: flex;
		gap: calc(var(--card-w, 240px) * 0.008);
		flex: none;
	}
	.pip {
		width: calc(var(--card-w, 240px) * 0.052);
		height: calc(var(--card-w, 240px) * 0.052);
		border-radius: 50%;
		background: radial-gradient(
			circle at 38% 32%,
			color-mix(in srgb, var(--pip) 100%, white 22%),
			var(--pip) 70%
		);
		box-shadow:
			inset 0 0 0 1px rgba(0, 0, 0, 0.55),
			inset 0 -1px 1px rgba(0, 0, 0, 0.35),
			inset 0 1px 1px rgba(255, 255, 255, 0.5),
			0 1px 1px rgba(0, 0, 0, 0.35);
		display: grid;
		place-items: center;
		color: #17140f;
	}
	.pip svg {
		width: 66%;
		height: 66%;
		fill: currentColor;
	}
	.pip--W {
		--pip: #fbf6df;
	}
	.pip--U {
		--pip: #9cc7ec;
	}
	.pip--B {
		--pip: #b0a7a0;
	}
	.pip--R {
		--pip: #ec9d84;
	}
	.pip--G {
		--pip: #9ecb9a;
	}

	/* Art window — dark inset panel. Placeholder gradient when no image. */
	.artbox {
		flex: 42;
		min-height: 0;
		border-radius: calc(var(--card-w, 240px) * 0.006);
		overflow: hidden;
		box-shadow:
			inset 0 0 0 1px rgba(60, 45, 18, 0.9),
			inset 0 1px 3px rgba(0, 0, 0, 0.6);
	}
	.art {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.art--placeholder {
		width: 100%;
		height: 100%;
		background: radial-gradient(120% 80% at 50% 18%, #33414c 0%, #1a2028 45%, #0c0f13 100%);
	}

	/* Text box — parchment inset panel. */
	.textbox {
		position: relative;
		flex: 33;
		min-height: 0;
		display: flex;
		border-radius: calc(var(--card-w, 240px) * 0.006);
		padding: calc(var(--card-w, 240px) * 0.03) calc(var(--card-w, 240px) * 0.032);
		background: linear-gradient(180deg, #f7f1dd 0%, #efe6c9 100%);
		box-shadow:
			inset 0 0 0 1px rgba(60, 45, 18, 0.7),
			inset 0 1px 2px rgba(0, 0, 0, 0.12);
		color: #171310;
	}
	.rules {
		font-size: calc(var(--card-w, 240px) * 0.05);
		line-height: 1.18;
	}
	.rules p {
		margin: 0 0 calc(var(--card-w, 240px) * 0.022);
	}
	.rules p:last-child {
		margin-bottom: 0;
	}
	.reminder {
		font-style: italic;
	}

	/* Power / toughness box — gold nub over the bottom-right, straddling the text
	 * box and the black footer (above the footer via z-index). */
	.pt {
		position: absolute;
		z-index: 4;
		right: calc(var(--card-w, 240px) * 0.02);
		bottom: calc(var(--card-w, 240px) * 0.05);
		min-width: calc(var(--card-w, 240px) * 0.125);
		padding: calc(var(--card-w, 240px) * 0.01) calc(var(--card-w, 240px) * 0.018);
		border-radius: calc(var(--card-w, 240px) * 0.012);
		text-align: center;
		font-weight: 700;
		font-size: calc(var(--card-w, 240px) * 0.052);
		color: #1a1206;
		background: linear-gradient(180deg, #f2dd90 0%, #cba24e 46%, #9c7529 56%, #d8b45e 100%);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.45),
			inset 0 -1px 0 rgba(0, 0, 0, 0.4),
			inset 0 0 0 1px rgba(60, 45, 18, 0.85),
			0 1px 2px rgba(0, 0, 0, 0.4);
	}

	/* Footer — a BLACK collector strip (different framing from the gold above):
	 * it bleeds to the border so the black is continuous, carries white micro-
	 * print, a holo security oval straddling the seam, and the copyright. */
	.footer {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: calc(var(--card-w, 240px) * 0.02);
		/* bleed to the face's padding-box edges (clipped to the rounded bottom by
		 * the face's overflow) so the black meets the black border seamlessly */
		margin: 0 calc(var(--card-w, 240px) * -0.016) calc(var(--card-w, 240px) * -0.016);
		padding: calc(var(--card-w, 240px) * 0.01) calc(var(--card-w, 240px) * 0.026)
			calc(var(--card-w, 240px) * 0.012);
		background: #080808;
		color: rgba(255, 255, 255, 0.82);
		font-size: calc(var(--card-w, 240px) * 0.024);
		line-height: 1.15;
	}
	.footer-l {
		display: flex;
		flex-direction: column;
		gap: calc(var(--card-w, 240px) * 0.004);
	}
	.footer-credit {
		display: flex;
		gap: calc(var(--card-w, 240px) * 0.016);
		align-items: center;
	}
	.footer-r {
		text-align: right;
		white-space: nowrap;
		font-size: calc(var(--card-w, 240px) * 0.02);
		opacity: 0.7;
	}
	.mono {
		font-family: var(--font-mono);
		font-weight: 600;
		letter-spacing: 0.01em;
	}
	.artist {
		font-style: italic;
	}
	/* Holo security oval, straddling the text-box / footer seam. */
	.stamp {
		position: absolute;
		left: 50%;
		top: calc(var(--card-w, 240px) * -0.018);
		transform: translateX(-50%);
		width: calc(var(--card-w, 240px) * 0.1);
		height: calc(var(--card-w, 240px) * 0.05);
		border-radius: 50%;
		background: linear-gradient(115deg, #a7e6d6 0%, #cdb4ec 35%, #efd39a 65%, #a7e6d6 100%);
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.35),
			inset 0 -1px 2px rgba(0, 0, 0, 0.4),
			0 1px 2px rgba(0, 0, 0, 0.5);
		opacity: 0.9;
	}

	/* Rarity/set symbol — a small stamp; colour by rarity code. */
	.setsymbol {
		flex: none;
		width: calc(var(--card-w, 240px) * 0.05);
		height: calc(var(--card-w, 240px) * 0.05);
		border-radius: 2px;
		transform: rotate(45deg);
		background: linear-gradient(135deg, #d98a2b, #7a3d0e);
		box-shadow:
			inset 0 0 0 1px rgba(0, 0, 0, 0.5),
			inset 0 1px 1px rgba(255, 255, 255, 0.4);
	}
	.setsymbol[data-r='c'] {
		background: linear-gradient(135deg, #2b2b2b, #101010);
	}
	.setsymbol[data-r='u'] {
		background: linear-gradient(135deg, #c8d2da, #7d8a94);
	}
	.setsymbol[data-r='r'] {
		background: linear-gradient(135deg, #e6d38a, #9c7c2c);
	}
	.setsymbol[data-r='m'] {
		background: linear-gradient(135deg, #f0862f, #8a2f10);
	}

	/* ─── Minimal cardstock card ──────────────────────────────────────────── */
	/* Plain name — no plate. Kept above the foil (z-index 3 > foil's 2) so it
	 * stays legible on holo cards. */
	.nameplate {
		position: relative;
		z-index: 3;
		margin: calc(var(--card-w, 240px) * 0.04) calc(var(--card-w, 240px) * 0.05) 0;
		display: flex;
		align-items: center;
	}
	.nameplate-title {
		font-size: calc(var(--card-w, 240px) * 0.056);
		font-weight: 600;
		letter-spacing: 0.01em;
		color: var(--ink, #0a0a0a);
	}
	.card-art {
		position: relative;
		z-index: 1;
		flex: 1;
		min-height: 0;
	}

	/* ─── Foil (holo rarities) ────────────────────────────────────────────── */
	.card[data-rarity='rare'] {
		--foil-strength: 0.35;
	}
	.card[data-rarity='mythic'] {
		--foil-strength: 0.6;
	}
	.foil {
		position: absolute;
		inset: -50%;
		z-index: 2;
		pointer-events: none;
		opacity: var(--foil-strength, 0.4);
	}
	.foil--spectrum {
		background: linear-gradient(
			110deg,
			hsl(350, 90%, 72%),
			hsl(45, 95%, 73%),
			hsl(150, 85%, 70%),
			hsl(200, 90%, 72%),
			hsl(265, 85%, 73%),
			hsl(330, 90%, 72%)
		);
		mix-blend-mode: overlay;
		transform: translate(calc(var(--tilt-x, 0) * 20%), calc(var(--tilt-y, 0) * 20%));
	}
	.foil--shine {
		background: linear-gradient(
			102deg,
			transparent 40%,
			rgba(255, 255, 255, 0.55) 48%,
			rgba(255, 255, 255, 0.9) 50%,
			rgba(255, 255, 255, 0.55) 52%,
			transparent 60%
		);
		mix-blend-mode: color-dodge;
		transform: translate(calc(var(--tilt-x, 0) * 24%), calc(var(--tilt-y, 0) * 24%));
	}
	.foil--sparkle-a,
	.foil--sparkle-b {
		inset: 0;
		background-image: var(--foil-sparkle);
		mix-blend-mode: color-dodge;
	}
	.foil--sparkle-a {
		background-size: 120px 120px;
		opacity: calc(var(--foil-strength, 0.4) * (0.3 + 0.7 * (0.5 + 0.5 * var(--tilt-x, 0))));
	}
	.foil--sparkle-b {
		background-size: 94px 94px;
		background-position: 41px 57px;
		opacity: calc(var(--foil-strength, 0.4) * (0.3 + 0.7 * (0.5 + 0.5 * var(--tilt-y, 0))));
	}
	:global(.puhig-tilting) .foil {
		will-change: transform, opacity;
	}

	/* Dark mode: overlay/color-dodge are tuned for the pale cardstock. Over the
	 * dark stock, overlay turns the spectrum muddy (multiply) and color-dodge
	 * blows the shine into a hard white band. Screen is backdrop-safe on dark —
	 * colours read as added light (iridescent glints), the specular stays a soft
	 * streak — and the strength eases off since a dark room reflects less. */
	@media (prefers-color-scheme: dark) {
		.card[data-rarity='rare'] {
			--foil-strength: 0.26;
		}
		.card[data-rarity='mythic'] {
			--foil-strength: 0.44;
		}
		.foil--spectrum,
		.foil--shine,
		.foil--sparkle-a,
		.foil--sparkle-b {
			mix-blend-mode: screen;
		}
		/* The specular streak is the brightest thing on the dark face — pull it
		 * well under the group strength so it reads as a glint, not a bar. */
		.foil--shine {
			opacity: calc(var(--foil-strength, 0.4) * 0.42);
		}
		/* Screen over black dilutes the pastel spectrum toward grey, so give the
		 * dark card a richer, more saturated gradient and let it sit brighter than
		 * the group strength — the colour is the point on a holo, the shine isn't. */
		.foil--spectrum {
			opacity: calc(var(--foil-strength, 0.4) * 1.5);
			background: linear-gradient(
				110deg,
				hsl(350, 95%, 63%),
				hsl(45, 100%, 60%),
				hsl(150, 90%, 56%),
				hsl(200, 95%, 60%),
				hsl(265, 92%, 64%),
				hsl(330, 95%, 63%)
			);
		}
	}
</style>
