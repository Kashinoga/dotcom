<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { CAMERA_SVG, EXTERNAL_SVG } from '$lib/icons';

	// THE PHOTO SKY — Bing's wallpaper of the day, and the credit line that doubles as a picker.
	// Fourth and last cut of the sky out of +page.svelte.
	//
	// The split is drawn where the other three drew it, and here it matters most: the page keeps
	// everything about GETTING a photograph — the fetch, the pick of one of the eight at random,
	// the pin in localStorage, and the measurement that decides how much glass the panel needs
	// over this particular picture (that one is about the PANEL, not about the sky, and it reads
	// pixels off a canvas). This file keeps everything about SHOWING it: two layers and a credit.
	//
	// Two layers, not one: the picture, and a veil over it. The panels are opaque so they are
	// fine, but the masthead and nav sit straight on the sky — over a photograph their ink would
	// be unreadable, and a scrim is the cheapest way to give them back their contrast without
	// touching a single token. The credit is NOT optional: these photos are licensed to
	// Microsoft, not to us.
	// The shape the page hands over, stated in full even though this file only draws four of the
	// fields: the page passes whole Photo objects straight back through onChoose, so a narrower
	// type here would make the callback incompatible with the page's own — which is exactly what
	// svelte-check said when `uhd` was left out.
	type Photo = {
		url: string;
		uhd: string;
		thumb: string;
		title: string;
		copyright: string;
		copyrightlink: string;
		date: string;
	};
	let {
		photo,
		photos = [],
		credit = true,
		pinned = false,
		open = $bindable(false),
		onChoose
	}: {
		/* The picture that is up. */
		photo: Photo;
		/* The whole window the route returned — the picker is a choice among them. */
		photos?: Photo[];
		/* Show the credit line and its picker. False while a panel covers the stage: the page
		   owns that judgement (decorHidden), as it does for every other layer. */
		credit?: boolean;
		/* Is the one on screen pinned to come back next visit? Only ever read out, in the picker's
		   heading — the pin itself lives in the page's localStorage. */
		pinned?: boolean;
		/* Is the picker open? Bindable, like the sky console's card. */
		open?: boolean;
		onChoose: (p: Photo) => void;
	} = $props();
</script>

<div
	class="photo-bg"
	aria-hidden="true"
	style:background-image="url('{photo.url}')"
	transition:fade={{ duration: 500 }}
></div>
<div class="photo-veil" aria-hidden="true" transition:fade={{ duration: 500 }}></div>
{#if credit}
	<!-- The credit doubles as the picker: the line names the photo that's up (and links out to
	     Bing's page for it, because the credit is not decoration — these are licensed to
	     Microsoft, not to us), and the button beside it opens the other seven. -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="photo-credit"
		transition:fade={{ duration: 500 }}
		onclick={(e) => e.stopPropagation()}
	>
		{#if open}
			<!-- The flyout, above the credit so it never covers it. Choosing the photo that's
			     already up un-pins it — that's how you get back to a fresh one each visit. -->
			<div class="photo-pick" transition:fly={{ y: 8, duration: 180 }}>
				<p class="photo-pick-head">
					{pinned ? 'Pinned — pick it again to unpin' : 'A different one each visit'}
				</p>
				<ul>
					{#each photos as p (p.date)}
						<li>
							<button
								type="button"
								class="photo-opt"
								class:on={photo?.date === p.date}
								aria-pressed={photo?.date === p.date}
								onclick={() => onChoose(p)}
							>
								<img src={p.thumb} alt="" loading="lazy" width="64" height="38" />
								<span class="photo-opt-copy">
									<span class="photo-opt-title">{p.title}</span>
									<span class="photo-opt-sub">{p.copyright}</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		<div class="photo-credit-row">
			<button
				type="button"
				class="photo-toggle"
				aria-expanded={open}
				aria-label={open ? 'Close the photo picker' : 'Choose a photo'}
				onclick={() => (open = !open)}
			>
				{@html CAMERA_SVG}
			</button>
			<a class="photo-link" href={photo.copyrightlink} target="_blank" rel="noreferrer noopener">
				{photo.copyright}<span class="ext-ico">{@html EXTERNAL_SVG}</span>
			</a>
		</div>
	</div>
{/if}

<style>
	/* ── Photo sky ────────────────────────────────────────────────────────────────────────────── */
	/* Bing's wallpaper of the day, as an alternative to the time-of-day gradients. The picture is a
	   plain background-image on its own layer (the browser can then decode and cache it like any
	   other image), with a veil above it. */
	.photo-bg {
		position: absolute;
		inset: 0;
		background-position: center;
		background-size: cover;
		background-repeat: no-repeat;
		pointer-events: none;
	}
	/* The veil is what keeps the masthead readable. The wordmark, tagline and nav are painted in
	   --ink straight onto the sky; over a photograph they'd be illegible against half the frames.
	   Washing the photo toward the page's own stock — white in light, black in dark — restores the
	   contrast the tokens assume, and costs one flat fill rather than a per-element treatment. */
	/* Aimed, not flat: a flat 62% wash made every photo look like fog. Strong where the text actually
	   is (a band down the top, a thinner one along the bottom for the credit), and barely there
	   across the middle, where the photo is just a photo. */
	.photo-veil {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(
				180deg,
				light-dark(rgba(255, 255, 255, 0.72), rgba(0, 0, 0, 0.74)) 0,
				light-dark(rgba(255, 255, 255, 0.4), rgba(0, 0, 0, 0.46)) 190px,
				transparent 420px
			),
			linear-gradient(
				0deg,
				light-dark(rgba(255, 255, 255, 0.72), rgba(0, 0, 0, 0.72)) 0,
				light-dark(rgba(255, 255, 255, 0.34), rgba(0, 0, 0, 0.36)) 90px,
				transparent 190px
			),
			light-dark(rgba(255, 255, 255, 0.04), rgba(0, 0, 0, 0.12));
		pointer-events: none;
	}
	/* The credit. Bing licenses these photos from Getty/Shutterstock for its own homepage — they are
	   not ours — so the line ships with the picture and links back to Bing's page for it. Bottom
	   left, out of the way of the panel; hidden whenever a panel covers the sky anyway. */
	.photo-credit {
		position: absolute;
		/* The masthead's inset on both axes — see .sky-console. */
		left: clamp(1.5rem, 5vw, 3.5rem);
		bottom: clamp(1.5rem, 5vw, 3.5rem);
		z-index: 3;
		max-width: min(46ch, 60vw);
		font-size: 0.72rem;
		line-height: 1.35;
	}
	.photo-credit-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.photo-link {
		color: color-mix(in srgb, var(--ink) 88%, transparent);
		text-decoration: none;
	}
	.photo-link:hover {
		color: var(--ink);
		text-decoration: underline;
	}
	/* The outbound mark: it rides at the end of the link's last word, so it can't be orphaned onto a
	   line of its own. Sized off the text, not in px, so it tracks whatever the link is set in. */
	.ext-ico {
		display: inline-block;
		vertical-align: -0.1em;
		width: 0.85em;
		height: 0.85em;
		margin-left: 0.3em;
	}
	.ext-ico :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
	/* The disclosure: a camera, because what it opens is a choice of photographs. Built to match the
	   Traffic board's controls, which are reicon's *-circle glyphs — a solid disc with the shape
	   knocked out of it. reicon has no camera in that family (gallery-circle is the inverse: a ring
	   around a solid picture), so the disc is composed here instead — an ink fill with the filled
	   camera punched through it in the page's own stock. Same result, same rules: no ring, no
	   shadow, the disc IS the button. Same 42px as every panel control — it reads as one of them. */
	.photo-toggle {
		flex: none;
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: color-mix(in srgb, var(--ink) 62%, transparent);
		color: var(--paper);
		cursor: pointer;
	}
	/* Hover pop, press squash and the flat press-flood all come from the app's universal button
	   rules — the disc is listed with .icon-btn there, so it springs exactly like a panel control
	   rather than inventing its own feel. All that's left here is the colour it goes to. */
	.photo-toggle:hover,
	.photo-toggle[aria-expanded='true'] {
		background: var(--ink);
	}
	/* Bubble: the camera disc joins the aero family — the frosted face (it floats over a
	   photograph; the frost does the legibility work), hairline, family gloss, and the
	   LIT stack while its flyout is open — open is a selected state. Flat keeps its ink
	   disc above. */
	:global(html[data-ui='bubble']) .photo-toggle {
		background: var(--aero-face);
		color: var(--ink);
		border: 1px solid var(--line-edge);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		box-shadow: var(--aero-gloss), var(--aero-drop);
	}
	:global(html[data-ui='bubble']) .photo-toggle:hover {
		background: color-mix(in srgb, var(--ink) 12%, transparent);
	}
	:global(html[data-ui='bubble']) .photo-toggle[aria-expanded='true'] {
		/* Open is selected — the Settings gray fill, like every selected control (the
		   resting gloss and drop stay; only the face densifies). */
		background: var(--line);
		border-color: color-mix(in srgb, var(--ink) 22%, transparent);
	}
	.photo-toggle:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.photo-toggle :global(svg) {
		width: 1.5rem;
		height: 1.5rem;
		display: block;
	}
	/* The flyout. Opaque, like the panels — it sits on a photograph, so it can't be a tint. */
	.photo-pick {
		margin-bottom: 0.5rem;
		width: min(22rem, 80vw);
		/* Tall enough to show every photo at once whenever the window allows — the cap is what's
		   actually left above the credit, not an arbitrary 24rem, so nothing scrolls unless the
		   viewport genuinely can't fit the set. */
		max-height: calc(100vh - 7rem);
		overflow-y: auto;
		/* Contain overscroll — no chain to the page (the iOS scroll-lock). */
		overscroll-behavior: contain;
		padding: 0.5rem;
		/* The panel's own material — Flat's glass here, Bubble's frost below — so the
		   popout reads as a shard of the same surface the panels are cut from. */
		background: var(--panel-glass);
		border: 1px solid var(--line);
		border-radius: 12px;
	}
	/* The picker's bubble card. The sky console's popout wore this same material from this same
	   rule until the console moved to $lib/SkyConsole and took its own copy along — a bare
	   .sky-pop here would now be given this page's scope class and match nothing. */
	:global(html[data-ui='bubble']) .photo-pick {
		/* The sheen is safe at card size now that it's a fixed-distance edge kiss (see
		   --panel-sheen) — the same material as the panels, worn at any height. */
		background: var(--panel-sheen), var(--panel-fill);
		-webkit-backdrop-filter: var(--panel-blur);
		backdrop-filter: var(--panel-blur);
		border-color: var(--panel-edge);
		/* The family's rim light, on the card itself: the sheen fades out by 20% height
		   and the dark-scheme hairline is 10% white — against a night sky the TOP edge
		   simply vanished. The inset rim is how every bubble control draws its top edge;
		   the drop lifts the card off the sky it's cut from. */
		box-shadow:
			inset 0 1px 0 light-dark(rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.24)),
			0 8px 24px rgba(8, 10, 14, 0.22);
	}
	.photo-pick-head {
		margin: 0.15rem 0 0.4rem;
		padding: 0 0.35rem;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.photo-pick ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.15rem;
	}
	.photo-opt {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.35rem;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		font: inherit;
		text-align: left;
		color: var(--ink);
		cursor: pointer;
	}
	.photo-opt:hover {
		background: color-mix(in srgb, var(--ink) 6%, transparent);
	}
	/* The one that's up. Its border is the affordance — pressing it again unpins. */
	.photo-opt.on {
		border-color: var(--line-strong);
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	.photo-opt img {
		flex: none;
		width: 64px;
		height: 38px;
		object-fit: cover;
		border-radius: 4px;
	}
	.photo-opt-copy {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.photo-opt-title {
		font-weight: 700;
		font-size: 0.78rem;
	}
	/* Two lines at most: some of Bing's credit lines are very long. */
	.photo-opt-sub {
		font-size: 0.68rem;
		color: var(--sub);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	@media (max-width: 960px) {
		/* On a phone the sky is a sliver above the sheet — don't spend it on a credit LINE,
		   but keep the camera disc: Photo mode should still offer its picker. The linked
		   attribution still travels with every entry inside the picker itself. */
		.photo-credit .photo-link {
			display: none;
		}
	}
	/* Pixelite: the stage only mounts as the full apps' floor, and its world is paper — never the
	   sky. Without this the Aeropalite skybox shows on load and around the full apps until their
	   own chrome covers it. .stage stays INSIDE the :global(), because it is still the page's
	   element — left bare it would be given this component's scope class and match nothing. (The
	   star field's arm of this rule went to $lib/Sky with the stars.) */
	:global(html[data-look='pixelite'] .stage) .photo-bg,
	:global(html[data-look='pixelite'] .stage) .photo-veil,
	:global(html[data-look='pixelite'] .stage) .photo-credit {
		display: none;
	}
</style>
