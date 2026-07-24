<script lang="ts">
	import { fade } from 'svelte/transition';
	import { popSpring } from '$lib/pop-spring';
	import { CLOUD_SVG } from '$lib/icons';

	// The SKYBOX'S OWN DIALS — the disc at the stage's bottom-left and the card it opens.
	// Second cut out of +page.svelte, after $lib/Sky took the ambient decor.
	//
	// Unlike the decor, this one TALKS BACK, and the split is drawn at the same place anyway: the
	// page still owns every piece of state (the sky mode is written to localStorage; the stage
	// weather is a page-wide override the Weather panel reads too), and this component owns only
	// the arrangement — which chips exist, what they look like, and how the card springs out of
	// its disc. A press here calls back; nothing is decided in this file.
	//
	// `open` is bindable because the page closes it from the outside: navigating into a panel
	// folds the console away with everything else, and a one-way prop would leave the page and
	// the card disagreeing about what is on screen.
	let {
		open = $bindable(false),
		mode,
		phase,
		wx = null,
		boot = false,
		onMode,
		onWx
	}: {
		/* Is the card up? Bindable — the page folds it away on navigation. */
		open?: boolean;
		/* The chosen sky mode: the pressed chip, and half of the disc's title. */
		mode: string;
		/* The phase actually being painted — only ever read out, as 'auto (morning)'. */
		phase: string;
		/* The hand-picked stage weather, or null for whatever the reading says. */
		wx?: string | null;
		/* One-shot page-load entrance (see .sky-toggle.boot). The page owns the shot, because the
		   console REMOUNTS every time a panel closes and replaying a 1.2s-delayed entrance there
		   would blank the toggle just as the stage returns. */
		boot?: boolean;
		onMode: (m: string) => void;
		onWx: (k: string | null) => void;
	} = $props();

	// The two rows. Kept as data beside the markup that lays them out: they are this component's
	// whole vocabulary, and neither list is derived from anything.
	const PHASES: [string, string][] = [
		['auto', 'Auto'],
		['dawn', 'Dawn'],
		['morning', 'Morning'],
		['noon', 'Noon'],
		['dusk', 'Dusk'],
		['night', 'Night']
	];
	const FEATURES: [string, string][] = [
		['clear', 'Clear'],
		['cloudy', 'Clouds'],
		['rain', 'Rain'],
		['snow', 'Snow'],
		['fog', 'Fog'],
		['storm', 'Storm']
	];
</script>

<!-- Clicks are stopped on the POP and the TOGGLE, not the container: the container's box is as
     wide as the open pop, and swallowing clicks there meant the empty run beside the toggle
     couldn't dismiss (the stage's own click handler is the anywhere-off-the-card close). -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="sky-console"
	transition:fade={{ duration: 300 }}
	role="group"
	aria-label="Sky controls"
	onkeydown={(e) => {
		if (e.key === 'Escape') open = false;
	}}
>
	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
		<!-- The card springs out of its toggle — the nav flyouts' popSpring, mirrored: this card
		     opens ABOVE its caller, so it starts tucked down toward the disc and rises, the swell
		     anchored at the disc's corner (left bottom). Each group still rises in bottom-first
		     (--n counts up from the group nearest the toggle the card grows out of). -->
		<div
			class="sky-pop"
			transition:popSpring={{ y: 10, origin: 'left bottom' }}
			onclick={(e) => e.stopPropagation()}
		>
			<div class="sky-group" role="group" aria-labelledby="sky-lab-time" style="--n:1">
				<span class="sky-lab" id="sky-lab-time">Time of Day</span>
				<div class="sky-row">
					{#each PHASES as [id, label] (id)}
						<button
							type="button"
							class="chip sky-chip"
							class:on={mode === id}
							aria-pressed={mode === id}
							onclick={() => onMode(id)}>{label}</button
						>
					{/each}
				</div>
			</div>
			<div class="sky-group" role="group" aria-labelledby="sky-lab-wx" style="--n:0">
				<span class="sky-lab" id="sky-lab-wx">Weather Feature</span>
				<div class="sky-row">
					<!-- Clear is a CHOICE, not the absence of one: it empties the sky (see the page's
					     cloudsVisible), where no selection keeps the ambient drift. Clicking the active
					     chip again deselects back to ambient. -->
					{#each FEATURES as [id, label] (label)}
						<button
							type="button"
							class="chip sky-chip"
							class:on={wx === id}
							aria-pressed={wx === id}
							onclick={() => onWx(wx === id ? null : id)}>{label}</button
						>
					{/each}
				</div>
			</div>
		</div>
	{/if}
	<!-- The toggle wears reicon's cloud on the shared disc (.icon-btn), so the bubble gloss and
	     the universal spring come for free — the current phase/weather read lives in the title
	     instead of a label. -->
	<button
		type="button"
		class="icon-btn sky-toggle"
		class:boot
		aria-expanded={open}
		aria-label="Sky controls"
		title={`Sky · ${mode === 'auto' ? `auto (${phase})` : mode}${wx ? ` · ${wx}` : ''}`}
		onclick={(e) => {
			e.stopPropagation(); // or the stage's dismiss undoes the open on the way up
			open = !open;
		}}
	>
		{@html CLOUD_SVG}
	</button>
</div>

<style>
	/* ── The sky console ── bottom-left (the photo credit's perch — the two never share
	   a sky). Two rows of small chips; the active one wears full ink. */
	.sky-console {
		position: absolute;
		/* The MASTHEAD's inset, exactly, on BOTH axes: the wordmark tops the column and
		   this disc closes it, so they hang on one plumb line, one frame-width off every
		   edge. (The photo credit, which takes this corner in Photo mode, wears the same;
		   so does the reopen bubble's right edge.) */
		left: clamp(1.5rem, 5vw, 3.5rem);
		bottom: clamp(1.5rem, 5vw, 3.5rem);
		z-index: 3;
		display: flex;
		flex-direction: column;
		/* The card hangs off its toggle at the NAV's spacing — the gap between Home,
		   About and friends (1.5rem for Flat's text nav; Bubble tightens below, like
		   the nav pills do) — so the console reads on the same grid as the masthead. */
		gap: 1.5rem;
	}
	:global(html[data-ui='bubble']) .sky-console {
		gap: 0.6rem;
	}
	/* The popout: the two rows on a solid card above the toggle (it overlays sky, so it
	   gets the opaque panel stock, like the city search's results). */
	.sky-pop {
		display: flex;
		flex-direction: column;
		/* Air between the groups and around them: the chips shouldn't kiss the card's
		   chrome — the popout is a small panel, and it breathes like one. */
		gap: 0.75rem;
		padding: 0.85rem;
		/* The panel's own material — Flat's glass here, Bubble's frost below — so the
		   popout reads as a shard of the same surface the panels are cut from. */
		background: var(--panel-glass);
		border: 1px solid var(--line);
		border-radius: 12px;
	}
	:global(html[data-ui='bubble']) .sky-pop {
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
	.sky-group {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	/* The caption, in the same small-caps voice as the stats' dt labels. */
	.sky-lab {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--sub);
	}
	.sky-row {
		/* Three chips per row — a fixed grid, not a wrap: six choices always read as two
		   even rows of three, the chips sharing one width instead of each its name's own. */
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}
	/* Entrance: the Star Map constellation card's exact language (see .sm-story) — the
	   card itself flies 10px/180ms both ways (the transition directive in the markup),
	   and each GROUP rises in bottom-first, --n counting up from the group nearest the
	   toggle the card grows out of. Replays every open — the {#if} remounts the card. */
	@media (prefers-reduced-motion: no-preference) {
		.sky-pop > .sky-group {
			animation: rise 0.4s ease backwards;
			animation-delay: calc(var(--n, 0) * 0.06s);
		}
	}
	.sky-toggle {
		align-self: flex-start;
		/* Size comes wholly from .icon-btn — the same 42px disc and 24px glyph as the
		   panel's Back and Refresh. */
	}
	/* Page-load entrance: the toggle rises in on the masthead nav's own beat, one step
	   past its last pill (the nav runs 0.95s + n×0.07s) — the sky's dial arriving as the
	   fifth member of the row, just in its own corner. `.boot` is one-shot (page state):
	   the console remounts on every panel close, and this must not replay there. */
	@media (prefers-reduced-motion: no-preference) {
		.sky-toggle.boot {
			animation: rise 0.5s ease backwards;
			animation-delay: 1.23s;
		}
	}
	.sky-chip {
		/* Grid-stretched to a shared column width (see .sky-row), so the label centres in
		   the pill rather than hugging its left edge. */
		justify-content: center;
		text-align: center;
		padding: 0.22rem 0.6rem;
		font-size: 0.78rem;
	}
	/* FLAT keeps the ink-filled selection; Bubble says "on" with the Settings segments'
	   LIGHT (the lit lists in the bubble section — sky chips ride those). */
	:global(html:not([data-ui='bubble'])) .sky-chip.on,
	:global(html:not([data-ui='bubble'])) .sky-chip.on:hover {
		color: var(--paper);
		background: var(--ink);
		border-color: transparent;
	}
	/* The console shows on phones too (it used to hide there, dodging the reopen bubble —
	   which has since moved to bottom-CENTRE, leaving this corner free): the sky is the
	   homepage's one act, and its dials belong wherever the sky is. The chips take the
	   42px height from the shared .chip rule, and the rows wrap.

	   Open, the phone popout wears the Star Map story card's exact clothes — a
	   full-width frosted night pane with the night-ink tokens re-declared for its chips
	   (the masthead nav tucks away, so the card takes the room it's been given). The
	   html-anchored selector outranks the bubble panel-material rule above. */
	@media (max-width: 960px) {
		:global(html) .sky-console .sky-pop {
			--ink: #f2f2ee;
			--sub: #9aa4bd;
			--line-edge: rgba(255, 255, 255, 0.16);
			--aero-face: rgba(255, 255, 255, 0.07);
			width: calc(100vw - 2 * clamp(1.5rem, 5vw, 3.5rem));
			padding: 0.85rem 1rem;
			gap: 0.75rem;
			color: var(--ink);
			background: rgba(8, 12, 24, 0.92);
			border: 1px solid rgba(255, 255, 255, 0.14);
			border-radius: 14px;
			-webkit-backdrop-filter: blur(8px);
			backdrop-filter: blur(8px);
			box-shadow: 0 8px 24px rgba(4, 7, 15, 0.5);
		}
	}

	/* The chip, the console's one control shape. It came over with the console because the
	   console is the only thing that has ever worn it — the page's other controls are discs,
	   segments and fields. The universal hover and press rules still reach it: they are stated
	   :global(html:root .chip) in the page's button-interaction block, so they never cared which
	   file the element lives in. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		/* The 42px control family — height fixed, width still the name's own. */
		box-sizing: border-box;
		height: 42px;
		padding: 0 0.85rem;
		font: inherit;
		font-size: 0.9rem;
		color: var(--ink);
		background: var(--aero-face);
		border: 1px solid var(--line-edge);
		border-radius: 999px;
		cursor: pointer;
		text-decoration: none;
	}
	.chip:hover {
		background: var(--line);
	}
</style>
