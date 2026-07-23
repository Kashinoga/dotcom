<script lang="ts">
	// Densette — The Curriculum, an in-universe course manual for a tabletop RPG set in the
	// Densette universe (The Peaks University, Denver, 2172, wandcraft). It's the flagship
	// showcase of the Pixelite theme: whatever look the site is wearing, this reads as a
	// printed technical manual — white sheets on a barely-grey gutter, hairline rules, one
	// cobalt ink, mono chrome and a quiet serif — and when the look IS Pixelite it simply
	// comes home, consuming the theme's own print tokens rather than its fallbacks.
	//
	// Everything is static: the copy lives inline (repo convention), the tables are plain
	// arrays down here, and the only motion is a calm rise-and-fade on mount. It rides inside
	// the ordinary panel like Weather and the Court — a reading, not a workspace — so the
	// scroll comes free from .surface-body and the shared big title ("Densette") sits above.

	// FIG 3.1 — the energy chain, reactor to output (Drafts §Energy Flow).
	const FLOW = [
		'Fusion grid',
		'Wireless broadcast',
		'Frame couples + receives',
		'Core stores',
		'Control routines govern draw',
		'Aperture shapes output'
	];

	// 3.3 — the four schools of Peaks, each an allegory of the energies studied.
	const SCHOOLS = [
		{
			num: '3.3.1',
			name: 'The Crossroads',
			motto: 'Parallel, Perpendicular; No Progression Without Intersection',
			desc: 'Prepares students to lead — not through authority, but through presence and precision. Where paths converge, Crossroads students learn to read the moment and move others with it.'
		},
		{
			num: '3.3.2',
			name: 'The Estuaries',
			motto: 'Theory, Trial; No Truth Without Contemplation',
			desc: 'Prepares students to understand — to ask carefully, test rigorously, and hold conclusions until they are earned. Where fresh water meets salt, something new forms.'
		},
		{
			num: '3.3.3',
			name: 'The Highlands',
			motto: 'Effort, Endeavor; No Experience Without Dedication',
			desc: 'Prepares students to endure — to carry weight, sustain pressure, and remain capable when the situation demands it most. The terrain is unforgiving by design. The oldest school at Peaks, it stands tall over campus.'
		},
		{
			num: '3.3.4',
			name: 'The Lowlands',
			motto: 'Practice, Patience; No Proficiency Without Exhaustion',
			desc: 'Prepares students to sustain — to build, craft, and maintain what others depend on. Proficiency here is not given; it is accumulated, slowly and deliberately.'
		}
	];

	// 4 — HIST 101, condensed to a ruled timeline (Drafts §History 101).
	const ERAS: { span: string; title: string; body: string; bullets?: string[] }[] = [
		{
			span: 'Pre-2050',
			title: 'The Energy Problem',
			body: 'Humanity ran on combustion, fission, and early renewables — abundant but inefficient and ecologically costly. The problem was never generation; it was control, storage, and distribution. Energy was produced centrally and consumed passively.'
		},
		{
			span: '2040s–2060s',
			title: 'The Fusion Breakthrough',
			body: 'Sustained net-energy fusion arrived mid-century, enabled by high-temperature superconducting magnets. By 2060 first-generation reactors ran in major population centers; by 2077 fusion was the dominant grid source across settled space.',
			bullets: [
				'Deuterium fuel from seawater — effectively unlimited',
				'No carbon output',
				'Orders of magnitude more energy density than combustion'
			]
		},
		{
			span: '2065–2077',
			title: 'The Broadcast Grid',
			body: 'Fusion solved generation; distribution remained. The answer was wireless broadcast power — resonant frequency transmission scaled alongside fusion. Energy moved from reactor to receiver without physical connection, over licensed, regulated frequencies.'
		},
		{
			span: '2077',
			title: 'The Wand',
			body: 'At the United Stars and Planetary Systems Materials Research Lab, a team built the first functional wand — an instrument for local control of broadcast energy using stored control routines. Wands do not generate energy; they receive, store, shape, and deliver it.'
		},
		{
			span: '2077–2172',
			title: 'Wand Development',
			body: 'Early wands were industrial — large, heavy, high-power. Miniaturization followed battery and aperture advances, bringing medical, manufacturing, and personal wands. Casting disciplines emerged — gesture mastery, voice mastery, and the rare combined masters — and sustained plasma constructs became an advanced application.'
		},
		{
			span: '2172',
			title: 'The Present',
			body: 'Fusion is infrastructure, as mundane as electrical grids once were. Wands are ubiquitous, licensed, and regulated; the broadcast grid spans settled space.'
		}
	];

	// 5 — Wand Systems, the reference appendix (Drafts §Wand Systems Summary). Tables carry
	// their columns as tuples; the header labels ride the markup so each stays legible here.
	const HARDWARE = [
		['Frame', 'Metamaterial resonant structure; couples to the broadcast grid'],
		['Core', 'Solid-state high-density battery; stores and transduces energy'],
		['Aperture', 'Phased-array emitter; shapes and delivers output']
	];
	const PRINCIPLES = [
		['Coherence', 'Output is phase-aligned — focused, not scattered'],
		['Coupling', 'Frame resonates with the grid frequency for efficient draw'],
		['Constraint', 'Aperture bounds and shapes output precisely']
	];
	const INPUTS = [
		['Voice', 'Routine loading, power presets, release triggers, command chaining', 'High'],
		['Gesture', 'Real-time parameter shaping, coherence profiles, draw modulation', 'High'],
		['Combined', 'Full simultaneous control — both spaces at once', 'Highest']
	];
	const GESTURES = [
		['Wrist flick', 'Packet release'],
		['Slow arc', 'Wide dispersal'],
		['Tight jab', 'Focused beam'],
		['Throw + release', 'Ballistic + delayed detonation'],
		['Held still', 'Sustained output'],
		['Rotation speed', 'Draw-rate modulation'],
		['Grip pressure', 'Power scaling']
	];
	const OUTPUTS = [
		[
			'Projectile',
			'High draw dump; coherence collapses on contact, dispersing as heat and pressure'
		],
		['Beam', 'Sustained output; high coherence maintained'],
		['Construct', 'Magnetically confined plasma held in shape; continuous core drain']
	];
	const FORMS = [
		['Blade', 'Flat, elongated, high-coherence edge'],
		['Shield', 'Wide, curved, higher drain'],
		['Spear', 'Narrow, tapered, efficient'],
		['Gauntlet', 'Wand-mounted or embedded'],
		['Net / web', 'Complex routine, high skill']
	];
	const DEPLETION = [
		['Full', 'Bright, sharp, stable', 'Full effectiveness'],
		['Mid', 'Flicker, edge fuzz', 'Minor degradation'],
		['Low', 'Unstable, dimming', 'Reduced effectiveness'],
		['Depleted', 'Instant collapse', 'Construct gone, wand dead']
	];
	const TIERS = [
		['Basic', 'Anyone; light, heat, simple tools'],
		['Intermediate', 'Licensed, school-specific; directed energy, field shaping'],
		['Advanced', 'Credentialed; high-output, area effect'],
		['Restricted', 'Military / research; weapons-grade, antimatter-adjacent']
	];
</script>

<!-- The manual. A single white sheet on a barely-grey gutter; every section is one
     chapter, numbered like the printed thing it imitates — all flowing down ONE long page,
     no breaks. Chapters carry an --i so the mount stagger settles them top-to-bottom. -->
<article class="dens">
	<div class="sheet">
		<!-- ── Cover ─────────────────────────────────────────────────────────────────── -->
		<section class="chap masthead" style="--i:0">
			<div class="col">
				<header class="runhead">
					<span class="rh-mark">Densette</span>
					<span class="rh-doc">The Curriculum</span>
				</header>
				<div class="ticks" aria-hidden="true"></div>
				<p class="meta">A Tabletop Roleplaying Game &#9474; Densette Universe</p>
				<h1 class="cover-title">The Curriculum</h1>
				<p class="cover-sub">Always Humane; Digital Forward, Analog First</p>
			</div>
		</section>

		<!-- ── 1. Welcome to Adventure ──────────────────────────────────────────────── -->
		<section class="chap" style="--i:1">
			<div class="col">
				<header class="ch-head">
					<h2 class="ch-title"><span class="ch-num">1.</span> Welcome to Adventure</h2>
				</header>
				<p class="body">
					In the 1970s, two people came together and created The World&rsquo;s Greatest Roleplaying
					Game, fusing rules with storytelling. I would play it myself, for my very first time —
					with the 5th edition — in the early 2010s.
				</p>
				<p class="body">
					Years following, I would rack up numerous games, as both player and Dungeon Master, under
					my belt. There was always bad and good rolls. There was always scheduling conflicts and
					snack duties. And there was always rules rulings and house rules.
				</p>
				<p class="body">
					This game is an accumulation of all of these years and more to come. My focus is towards
					accessibility, camaraderie, and reliability. And of course, fun overall. The numerous
					house rules, homebrews, and memorable moments will have informed a vast majority of this
					game.
				</p>
				<p class="body">
					I hope to help recreate the moments that stirred the creation of this game and to develop
					them into new and memorable moments for you and your group. Thank you for taking the time
					to try my game, and take care.
				</p>
				<p class="sign">&mdash; Andrew Nguyen</p>
			</div>
		</section>

		<!-- ── 2. The Peaks University ──────────────────────────────────────────────── -->
		<section class="chap" style="--i:2">
			<div class="col">
				<header class="ch-head">
					<h2 class="ch-title"><span class="ch-num">2.</span> The Peaks University</h2>
				</header>
				<p class="meta-row">
					Denver, Colorado &mdash; President&rsquo;s Office, Quiet Forest Terrace, Northern Plaza
				</p>
				<p class="body">
					We welcome you to our university, and we hope that your journey proves eventful, fruitful,
					and bears you the opportunities and the experiences to grow as a student of learning,
					teaching, and enhancing the quality of life for yourself and for your peers.
				</p>
				<p class="body">
					Established in 2051, The Peaks University strives to uphold, promote, and to improve the
					quality of life for all, through education, experience, and endurance. We hope to imbue
					the necessary lessons that will prepare students for the unpredictable future, with the
					vigor and vigilance for the care of life of their own and of theirs held closely.
				</p>
				<p class="body">
					Please enjoy your time at The Peaks, and we hope that hope will always find a way through.
				</p>
				<p class="sign">&mdash; Amahia Mallea, President</p>
			</div>
		</section>

		<!-- ── 3. LBRY 101 — Orientation ────────────────────────────────────────────── -->
		<section class="chap" style="--i:3">
			<div class="col">
				<header class="ch-head">
					<h2 class="ch-title"><span class="ch-num">3.</span> LBRY 101 &mdash; Orientation</h2>
					<p class="course-meta">Taught by Ana Bakunawa</p>
				</header>

				<h3 class="sub-head"><span class="sub-num">3.1</span> The Year is 2172</h3>
				<p class="body">
					Our reach is terribly vast, though not without greatly scarred lengths. The journey-so-far
					has enabled us to draw upon the infinite energies of the universe. We have made our
					everyday extraordinary, underneath all of the materials and the manufacturing, and
					underneath all of the research and the development. Undeniably, we have also made our
					everyday quietly fragile. As united as we have ever been, the factions still dominate our
					allegiance and discourse. It is the hope that we continue to explore the unknown, without
					too much trouble.
				</p>

				<h3 class="sub-head"><span class="sub-num">3.2</span> The Wand is It</h3>
				<p class="body">
					In 2077, a group of scientists at the United Stars and Planetary Systems, Materials
					Research Lab, developed what we call today: wandcraft. With breakthroughs in coherence,
					coupling, and constraint, we created the wand. An instrument with three distinct
					components: the aperture, the core, and the frame. This wand enabled local control of
					ambient energy using stored control routines.
				</p>
				<p class="body">
					Over time, we would scale up wands for use in industry, manufacturing, and as our
					crown-jewel as engines in spacefaring ships. Today, further development is being made
					towards miniaturizing the technology for use in delicate manufacturing, medicine, and
					other applications where being able to manipulate energies at smaller scales would prove
					assistive and enabling.
				</p>

				<!-- FIG 3.1 — the energy chain as a real diagram: hairline boxes, mono labels, a
			     leader line and a cobalt arrowhead between each step. -->
				<figure class="fig">
					<div class="flow">
						{#each FLOW as step, i (i)}
							{#if i > 0}<span class="flow-arrow" aria-hidden="true"></span>{/if}
							<div class="flow-node">
								<span class="flow-num">{i + 1}</span>
								<span class="flow-label">{step}</span>
							</div>
						{/each}
					</div>
					<figcaption class="fig-cap">
						<span class="fig-tick" aria-hidden="true"></span>Fig 3.1 &mdash; Energy Flow
					</figcaption>
				</figure>

				<h3 class="sub-head"><span class="sub-num">3.3</span> The Path You Choose</h3>
				<p class="body">
					Peaks offers four primary schools for students, each with a distinct focus ascribed by an
					allegoric feature of the energies we study.
				</p>
				<div class="schools">
					{#each SCHOOLS as s (s.num)}
						<div class="school">
							<span class="school-num">{s.num}</span>
							<h4 class="school-name">{s.name}</h4>
							<p class="school-motto">{s.motto}</p>
							<p class="school-desc">{s.desc}</p>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<!-- ── 4. HIST 101 — Timeline ───────────────────────────────────────────────── -->
		<section class="chap" style="--i:4">
			<div class="col">
				<header class="ch-head">
					<h2 class="ch-title"><span class="ch-num">4.</span> HIST 101 &mdash; Timeline</h2>
					<p class="course-meta">Taught by Hyacinth Altair</p>
				</header>
				<div class="timeline">
					{#each ERAS as era (era.span)}
						<div class="era">
							<span class="era-date">{era.span}</span>
							<div class="era-main">
								<h3 class="era-title">{era.title}</h3>
								<p class="body">{era.body}</p>
								{#if era.bullets}
									<ul class="era-list">
										{#each era.bullets as b (b)}<li>{b}</li>{/each}
									</ul>
								{/if}
							</div>
						</div>
					{/each}
				</div>
				<p class="body">
					Antimatter is the current frontier. Total mass-energy conversion offers output that dwarfs
					fusion by orders of magnitude, but production costs and containment remain unsolved at
					scale. Research is active; deployment is not. The stakes of success &mdash; and failure
					&mdash; are significant.
				</p>
				<blockquote class="pull"><p>The factions watch closely.</p></blockquote>
			</div>
		</section>

		<!-- ── 5. Wand Systems ──────────────────────────────────────────────────────── -->
		<section class="chap" style="--i:5">
			<div class="col">
				<header class="ch-head">
					<h2 class="ch-title"><span class="ch-num">5.</span> Wand Systems</h2>
					<p class="course-meta">Reference Appendix</p>
				</header>

				<!-- TABLE 5.1 — Hardware -->
				<p class="tbl-cap"><span class="tbl-cap-tag">Table 5.1</span> Hardware</p>
				<div class="tbl-wrap">
					<table class="tbl">
						<thead><tr><th>Component</th><th>Function</th></tr></thead>
						<tbody>
							{#each HARDWARE as [c, f] (c)}<tr><td class="k">{c}</td><td>{f}</td></tr>{/each}
						</tbody>
					</table>
				</div>

				<!-- 5.2 — the three founding principles, as small cards -->
				<h3 class="sub-head"><span class="sub-num">5.2</span> Founding Principles</h3>
				<div class="cards3">
					{#each PRINCIPLES as [name, meaning] (name)}
						<div class="card3">
							<span class="card3-name">{name}</span>
							<p class="card3-body">{meaning}</p>
						</div>
					{/each}
				</div>

				<!-- TABLE 5.3 — Input methods -->
				<p class="tbl-cap"><span class="tbl-cap-tag">Table 5.3</span> Input Methods</p>
				<div class="tbl-wrap">
					<table class="tbl">
						<thead><tr><th>Method</th><th>Controls</th><th>Ceiling</th></tr></thead>
						<tbody>
							{#each INPUTS as [m, ctrl, ceil] (m)}<tr
									><td class="k">{m}</td><td>{ctrl}</td><td class="num">{ceil}</td></tr
								>{/each}
						</tbody>
					</table>
				</div>
				<ul class="mastery">
					<li>
						<b>Voice mastery</b> &mdash; rapid chaining, complex conditionals, granular verbal precision,
						hands-free invocation.
					</li>
					<li>
						<b>Gesture mastery</b> &mdash; real-time shaping, sub-parameter control, hardware-limit efficiency,
						multi-wand technique.
					</li>
					<li>
						<b>Combined mastery</b> &mdash; both tracks at once: sustain a construct via gesture while
						voice-invoking a secondary routine.
					</li>
				</ul>

				<!-- TABLE 5.4 — Gesture to parameter -->
				<p class="tbl-cap"><span class="tbl-cap-tag">Table 5.4</span> Gesture &rarr; Parameter</p>
				<div class="tbl-wrap">
					<table class="tbl">
						<thead><tr><th>Gesture</th><th>Effect</th></tr></thead>
						<tbody>
							{#each GESTURES as [g, e] (g)}<tr><td class="k">{g}</td><td>{e}</td></tr>{/each}
						</tbody>
					</table>
				</div>

				<!-- TABLE 5.5 — Output types -->
				<p class="tbl-cap"><span class="tbl-cap-tag">Table 5.5</span> Output Types</p>
				<div class="tbl-wrap">
					<table class="tbl">
						<thead><tr><th>Output</th><th>Mechanism</th></tr></thead>
						<tbody>
							{#each OUTPUTS as [o, mech] (o)}<tr><td class="k">{o}</td><td>{mech}</td></tr>{/each}
						</tbody>
					</table>
				</div>

				<!-- TABLE 5.6 — Construct forms -->
				<p class="body">
					Constructs are not hard light but magnetically confined plasma &mdash; shaped by the
					aperture, held by the frame&rsquo;s magnetic field, and sustained by continuous core draw.
					They collapse on depletion.
				</p>
				<p class="tbl-cap"><span class="tbl-cap-tag">Table 5.6</span> Construct Forms</p>
				<div class="tbl-wrap">
					<table class="tbl">
						<thead><tr><th>Form</th><th>Notes</th></tr></thead>
						<tbody>
							{#each FORMS as [form, notes] (form)}<tr><td class="k">{form}</td><td>{notes}</td></tr
								>{/each}
						</tbody>
					</table>
				</div>

				<!-- TABLE 5.7 — Depletion states -->
				<p class="tbl-cap"><span class="tbl-cap-tag">Table 5.7</span> Depletion States</p>
				<div class="tbl-wrap">
					<table class="tbl">
						<thead><tr><th>State</th><th>Visual</th><th>Effect</th></tr></thead>
						<tbody>
							{#each DEPLETION as [state, vis, eff] (state)}<tr
									><td class="k">{state}</td><td>{vis}</td><td>{eff}</td></tr
								>{/each}
						</tbody>
					</table>
				</div>
				<p class="footnote">Depletion is visible to all &mdash; tactically significant.</p>

				<!-- TABLE 5.8 — Licensing tiers -->
				<p class="tbl-cap"><span class="tbl-cap-tag">Table 5.8</span> Licensing Tiers</p>
				<div class="tbl-wrap">
					<table class="tbl">
						<thead><tr><th>Tier</th><th>Access</th></tr></thead>
						<tbody>
							{#each TIERS as [tier, access] (tier)}<tr
									><td class="k">{tier}</td><td>{access}</td></tr
								>{/each}
						</tbody>
					</table>
				</div>

				<!-- The control-routines note: an aside, hairline-ruled off the left margin. -->
				<aside class="note">
					<p class="note-label">Note &mdash; Control Routines</p>
					<ul class="note-list">
						<li>Firmware stored in the core.</li>
						<li>
							Govern draw rate, discharge curve, output type, delivery mode, and safety cutoffs.
						</li>
						<li>Issued, updated, and revoked by the licensing authority.</li>
						<li>Unlicensed modification is illegal.</li>
						<li>Scaling is routine rating plus core size, not different physics.</li>
					</ul>
				</aside>
			</div>
		</section>

		<!-- ── 6. Colophon ──────────────────────────────────────────────────────────── -->
		<section class="chap" style="--i:6">
			<div class="col">
				<header class="ch-head">
					<h2 class="ch-title"><span class="ch-num">6.</span> Colophon</h2>
				</header>
				<!-- The narrative implications kept as the designer's marginalia — what all the
			     above means at the table (Drafts §Narrative Implications). -->
				<aside class="note">
					<p class="note-label">Designer&rsquo;s Notes</p>
					<ul class="note-list">
						<li>
							Casting style is legible &mdash; masters identify training by gesture and voice
							pattern.
						</li>
						<li>Construct color signals school, faction, or individual.</li>
						<li>Wrist, hand, or voice injury carries real mechanical consequence.</li>
						<li>Unlicensed routine modification is illegal &mdash; and interesting.</li>
						<li>A depleted core in combat is a genuine crisis.</li>
						<li>Combined masters are rare, and awe-inspiring.</li>
					</ul>
				</aside>
				<div class="ticks" aria-hidden="true"></div>
				<p class="colophon">Densette &mdash; The Curriculum &middot; Draft</p>
				<p class="colophon">Set in Cobalt Ink on Paper &middot; Pixelite</p>
				<p class="colophon">The Peaks University Press, 2172</p>
			</div>
		</section>
	</div>
</article>

<style>
	/* The manual reads as Pixelite under ANY look: the ink, paper, sheet, accent and type
	   are hardcoded to Pixelite's own values so nothing about Aeropalite leaks in. The SHARED
	   print tokens (the paper shadow, the ink hairline) are consumed from the theme WITH those
	   same values as fallbacks — so under Pixelite the manual harmonises with the panels around
	   it, and under Aeropalite it still prints true. */
	.dens {
		--dens-ink: light-dark(#000000, #f2f2f2);
		--dens-sub: light-dark(rgba(0, 0, 0, 0.4), rgba(242, 242, 242, 0.4));
		--dens-sheet: light-dark(#ffffff, #202023);
		--dens-paper: light-dark(#fbfbfb, #0e0e10);
		--dens-accent: light-dark(#103dff, #607ffd);
		--dens-hairline: var(
			--pixel-hairline,
			light-dark(rgba(0, 0, 0, 0.2), rgba(255, 255, 255, 0.2))
		);
		/* Densette's own type, the site's Pixelite trio (it prints as a Pixelite manual under any
		   theme, so the stacks are stated outright, not borrowed from --font-* which move by theme):
		   Space Mono chrome, Iowan Old Style serif, IBM Plex Sans body, VT323 pixel numerals. */
		--dens-mono: 'Space Mono', ui-monospace, 'SF Mono', Consolas, monospace;
		--dens-serif: 'Iowan Old Style', Georgia, 'Times New Roman', serif;
		--dens-body: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		--dens-pixel: var(--font-pixel, 'VT323', 'Space Mono', monospace);

		/* Bleed the barely-grey gutter to the panel's own padding edges (the body's
		   clamp(1.5rem,4vw,2.75rem) sides and 3rem foot), then re-inset so the sheets sit
		   padded on the grey. The manual thus reads as sheets laid on a page, not boxes
		   floating in the panel. */
		/* In the docs shell this rides the shared --docs-pad so the sheet's top edge lands
		   exactly on the ruler's first tick; the clamp is the panel-mode fallback. */
		--dens-pad: var(--docs-pad, clamp(1.5rem, 4vw, 2.75rem));
		/* Bleed the gutter clean to the container's edges so nothing stacks: in the docs
		   shell that's --docs-pad on all four sides (published by .docs-body); in the
		   Aeropalite panel it's no top padding, the panel's side clamp, and the 3rem foot. */
		margin: calc(-1 * var(--docs-pad, 0px)) calc(-1 * var(--docs-pad, var(--dens-pad)))
			calc(-1 * var(--docs-pad, 3rem));
		/* An even frame: the sheet sits the same distance from every gutter edge. */
		padding: var(--dens-pad);
		background: var(--dens-paper);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		color: var(--dens-ink);
		font-family: var(--dens-body);
	}
	/* ONE white sheet of paper — told from the barely-grey gutter by its FILL alone now: no
	   hairline edge, no print shadow (the docs sheets went the same way). Its inner padding
	   stays, so the reading keeps its breathing room. The chapters flow down it as a single long
	   page — no per-chapter breaks; a hairline and air part one chapter from the next. */
	.sheet {
		background: var(--dens-sheet);
		border-radius: 2px;
		padding: clamp(1.25rem, 3vw, 2.25rem);
	}
	.chap + .chap {
		margin-top: 2.75rem;
		padding-top: 2.75rem;
		border-top: 1px solid var(--dens-hairline);
	}
	.col {
		max-width: 62ch;
		margin-inline: auto;
	}

	/* Calm entrance: the sheet settles onto the gutter first, then its chapters drop
	   in from above and settle — the same top-to-bottom cadence as every other page.
	   Only the cover and the first two chapters
	   play — the document is LONG, and everything below the fold would animate unseen
	   (or flash its tail at a fast scroller), so deeper chapters simply stand. Off
	   entirely for reduced motion. */
	@media (prefers-reduced-motion: no-preference) {
		.sheet {
			animation: dens-settle 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
		}
		.chap:nth-child(-n + 3) {
			animation: dens-settle 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
			animation-delay: calc(0.08s + var(--i, 0) * 0.07s);
		}
	}
	@keyframes dens-settle {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* ── Mono chrome ──────────────────────────────────────────────────────────────
	   Every scrap of chrome — running heads, section numbers, figure captions, table
	   headers, metadata — speaks the pixel mono in uppercase, 10–12px, letter-spaced. */
	.runhead {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 11px;
	}
	.rh-mark {
		color: var(--dens-accent);
		font-weight: 700;
	}
	.rh-doc {
		color: var(--dens-sub);
	}

	/* The tick-mark ruler: a repeating hairline flourish, the manual's margin rule laid flat.
	   Kept faint — a texture, not a line. */
	.ticks {
		/* Round the ruler's width DOWN to a whole number of 7px tick periods (1px tick + 6px
		   gap), so the repeating gradient always ends on a complete period and the last tick is
		   never sliced by a width that lands mid-tick. Left-aligned, so any remainder (< 7px)
		   falls off the right edge, keeping the first tick on the content's left line. round() is
		   ignored where unsupported, harmlessly falling back to the full auto width. */
		width: round(down, 100%, 7px);
		height: 8px;
		margin: 0.85rem 0;
		background-image: repeating-linear-gradient(
			to right,
			var(--dens-hairline) 0,
			var(--dens-hairline) 1px,
			transparent 1px,
			transparent 7px
		);
		opacity: 0.7;
	}

	.meta,
	.meta-row {
		margin: 0.85rem 0 0;
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 10.5px;
		line-height: 1.5;
		color: var(--dens-sub);
	}

	/* ── Cover ──────────────────────────────────────────────────────────────────── */
	.masthead .col {
		text-align: center;
	}
	.masthead .runhead {
		text-align: left;
	}
	.masthead .meta {
		margin-top: 1.5rem;
	}
	.cover-title {
		margin: 0.5rem 0 0;
		font-family: var(--dens-serif);
		font-weight: 400;
		font-size: clamp(2rem, 8vw, 3.1rem);
		letter-spacing: -0.015em;
		line-height: 1.05;
		color: color-mix(in srgb, var(--dens-ink) 88%, transparent);
	}
	.cover-sub {
		margin: 0.7rem 0 0;
		font-size: 0.95rem;
		font-style: italic;
		color: var(--dens-sub);
	}

	/* ── Chapter heads ──────────────────────────────────────────────────────────── */
	.ch-head {
		margin-bottom: 1.1rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--dens-hairline);
	}
	.ch-title {
		margin: 0;
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 700;
		font-size: clamp(0.95rem, 3.4vw, 1.2rem);
		line-height: 1.25;
		color: var(--dens-ink);
	}
	.ch-num {
		font-family: var(--dens-pixel);
		font-size: 1.15em; /* VT323 runs small — match the serif title's optical size */
		color: var(--dens-accent);
	}
	.course-meta {
		margin: 0.5rem 0 0;
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 10.5px;
		color: var(--dens-sub);
	}

	/* Sub-heads: a cobalt mono number prefix, then the title in the quiet serif. */
	.sub-head {
		margin: 1.9rem 0 0.7rem;
		font-family: var(--dens-serif);
		font-weight: 400;
		font-size: clamp(1.15rem, 4vw, 1.5rem);
		letter-spacing: -0.01em;
		line-height: 1.2;
		color: color-mix(in srgb, var(--dens-ink) 88%, transparent);
	}
	.sub-num {
		font-family: var(--dens-mono);
		font-size: 0.62em;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--dens-accent);
		margin-right: 0.5rem;
		vertical-align: 0.12em;
	}

	/* ── Body prose ─────────────────────────────────────────────────────────────── */
	.body {
		margin: 0.85rem 0 0;
		font-size: 0.96rem;
		line-height: 1.62;
		color: color-mix(in srgb, var(--dens-ink) 82%, var(--dens-sub));
	}
	.sign {
		margin: 1.1rem 0 0;
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 11px;
		text-align: right;
		color: var(--dens-ink);
	}

	/* ── FIG 3.1 — energy flow ──────────────────────────────────────────────────── */
	.fig {
		margin: 1.6rem 0 0;
	}
	.flow {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}
	.flow-node {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--dens-hairline);
		border-radius: 2px;
		padding: 0.6rem 0.8rem;
		background: color-mix(in srgb, var(--dens-accent) 4%, transparent);
	}
	.flow-num {
		flex: none;
		width: 1.6rem;
		height: 1.6rem;
		display: grid;
		place-items: center;
		font-family: var(--dens-mono);
		font-size: 11px;
		font-weight: 700;
		color: var(--dens-accent);
		border: 1px solid color-mix(in srgb, var(--dens-accent) 45%, transparent);
		border-radius: 2px;
	}
	.flow-label {
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: clamp(10px, 2.6vw, 12px);
		line-height: 1.3;
		color: var(--dens-ink);
	}
	/* The leader line between steps, tipped with a cobalt arrowhead — aligned under the
	   number chip's centre (0.8rem pad + half of the 1.6rem chip). */
	.flow-arrow {
		flex: none;
		width: 2px;
		height: 1.35rem;
		margin-left: calc(1.6rem - 1px);
		background: var(--dens-hairline);
		position: relative;
	}
	.flow-arrow::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -1px;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 4px solid transparent;
		border-right: 4px solid transparent;
		border-top: 6px solid var(--dens-accent);
	}
	.fig-cap {
		margin: 0.9rem 0 0;
		text-align: center;
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-size: 10px;
		color: var(--dens-sub);
	}
	.fig-tick {
		display: block;
		width: 16px;
		height: 1px;
		margin: 0 auto 0.5rem;
		background: var(--dens-accent);
	}

	/* ── 3.3 schools — a 2×2 grid of sheet-cards, one column on a phone ──────────── */
	.schools {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.9rem;
		margin-top: 1.1rem;
	}
	@media (max-width: 560px) {
		.schools {
			grid-template-columns: 1fr;
		}
	}
	.school {
		border: 1px solid var(--dens-hairline);
		border-radius: 2px;
		padding: 1rem;
	}
	.school-num {
		font-family: var(--dens-pixel);
		font-size: 13px; /* VT323 runs small — bumped from the mono's 10px to match */
		font-weight: 700;
		letter-spacing: 0;
		color: var(--dens-accent);
	}
	.school-name {
		margin: 0.25rem 0 0;
		font-family: var(--dens-serif);
		font-weight: 400;
		font-size: 1.3rem;
		letter-spacing: -0.01em;
		color: var(--dens-ink);
	}
	.school-motto {
		margin: 0.4rem 0 0;
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 9.5px;
		line-height: 1.5;
		color: var(--dens-accent);
	}
	.school-desc {
		margin: 0.7rem 0 0;
		font-size: 0.9rem;
		line-height: 1.55;
		color: color-mix(in srgb, var(--dens-ink) 80%, var(--dens-sub));
	}

	/* ── 4 timeline — ruled, with cobalt node ticks down a hairline ─────────────── */
	.timeline {
		margin-top: 0.4rem;
	}
	.era {
		display: grid;
		grid-template-columns: 6rem 1fr;
		column-gap: 1.25rem;
	}
	.era-date {
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 11px;
		font-weight: 700;
		color: var(--dens-ink);
		padding-top: 0.15rem;
	}
	.era-main {
		border-left: 1px solid var(--dens-hairline);
		padding: 0 0 1.5rem 1.25rem;
		position: relative;
	}
	.era:last-child .era-main {
		padding-bottom: 0.25rem;
	}
	/* The node: a small cobalt dot punched through the connector with a sheet-coloured ring. */
	.era-main::before {
		content: '';
		position: absolute;
		left: -4.5px;
		top: 0.35rem;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--dens-accent);
		box-shadow: 0 0 0 3px var(--dens-sheet);
	}
	.era-title {
		margin: 0;
		font-family: var(--dens-serif);
		font-weight: 400;
		font-size: 1.2rem;
		letter-spacing: -0.01em;
		line-height: 1.2;
		color: var(--dens-ink);
	}
	.era-main .body {
		margin-top: 0.4rem;
		font-size: 0.9rem;
	}
	.era-list {
		margin: 0.6rem 0 0;
		padding-left: 1.1rem;
		font-size: 0.88rem;
		line-height: 1.55;
		color: color-mix(in srgb, var(--dens-ink) 80%, var(--dens-sub));
	}
	.era-list li {
		margin: 0.15rem 0;
	}
	@media (max-width: 480px) {
		.era {
			grid-template-columns: 4.5rem 1fr;
			column-gap: 0.8rem;
		}
		.era-date {
			font-size: 10px;
		}
		.era-main {
			padding-left: 1rem;
		}
	}

	/* The pull-quote: the timeline's last line, set off in serif italic between two rules. */
	.pull {
		margin: 1.6rem 0 0;
		padding: 1rem 0;
		border-top: 1px solid var(--dens-hairline);
		border-bottom: 1px solid var(--dens-hairline);
		text-align: center;
	}
	.pull p {
		margin: 0;
		font-family: var(--dens-serif);
		font-style: italic;
		font-size: clamp(1.15rem, 4vw, 1.45rem);
		color: color-mix(in srgb, var(--dens-ink) 80%, transparent);
	}

	/* ── 5 tables — hairline manual style ───────────────────────────────────────── */
	.tbl-cap {
		margin: 1.7rem 0 0.55rem;
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 11px;
		color: var(--dens-ink);
	}
	.tbl-cap-tag {
		color: var(--dens-accent);
		font-weight: 700;
	}
	/* Wide tables scroll inside their own lane rather than the page. */
	.tbl-wrap {
		overflow-x: auto;
		/* Contain overscroll — no chain to the page (the iOS scroll-lock). */
		overscroll-behavior: contain;
	}
	.tbl {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	.tbl th {
		text-align: left;
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 10px;
		font-weight: 700;
		color: var(--dens-sub);
		padding: 0 0.7rem 0.5rem;
		/* the 2px ink rule under the header */
		border-bottom: 2px solid var(--dens-ink);
		white-space: nowrap;
	}
	.tbl td {
		padding: 0.65rem 0.7rem;
		border-bottom: 1px solid var(--dens-hairline);
		vertical-align: top;
		line-height: 1.5;
		color: color-mix(in srgb, var(--dens-ink) 82%, var(--dens-sub));
	}
	.tbl tbody tr:last-child td {
		border-bottom: 0;
	}
	.tbl td:first-child {
		padding-left: 0;
	}
	.tbl th:first-child {
		padding-left: 0;
	}
	/* First column is the key — mono, ink, the manual's row label. */
	.tbl td.k {
		font-family: var(--dens-mono);
		font-size: 0.82rem;
		color: var(--dens-ink);
		white-space: nowrap;
	}
	.tbl td.num {
		font-family: var(--dens-mono);
		font-size: 0.82rem;
		color: var(--dens-accent);
		white-space: nowrap;
	}

	/* 5.2 principles — three small cards */
	.cards3 {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.8rem;
		margin-top: 0.4rem;
	}
	@media (max-width: 560px) {
		.cards3 {
			grid-template-columns: 1fr;
		}
	}
	.card3 {
		border: 1px solid var(--dens-hairline);
		border-radius: 2px;
		padding: 0.85rem;
	}
	.card3-name {
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 11px;
		font-weight: 700;
		color: var(--dens-accent);
	}
	.card3-body {
		margin: 0.5rem 0 0;
		font-size: 0.86rem;
		line-height: 1.5;
		color: color-mix(in srgb, var(--dens-ink) 80%, var(--dens-sub));
	}

	.mastery {
		margin: 0.9rem 0 0;
		padding-left: 1.1rem;
		font-size: 0.9rem;
		line-height: 1.55;
		color: color-mix(in srgb, var(--dens-ink) 80%, var(--dens-sub));
	}
	.mastery li {
		margin: 0.35rem 0;
	}
	.mastery b {
		color: var(--dens-ink);
	}

	/* The tactical footnote: a mono aside under the depletion table. */
	.footnote {
		margin: 0.7rem 0 0;
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 10px;
		color: var(--dens-sub);
	}

	/* ── Note / designer's asides — ruled off the left margin ───────────────────── */
	.note {
		margin: 1.8rem 0 0;
		padding: 0.35rem 0 0.35rem 1rem;
		border-left: 2px solid var(--dens-hairline);
	}
	.note-label {
		margin: 0;
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 11px;
		font-weight: 700;
		color: var(--dens-accent);
	}
	.note-list {
		margin: 0.55rem 0 0;
		padding-left: 1.1rem;
		font-size: 0.88rem;
		line-height: 1.55;
		color: color-mix(in srgb, var(--dens-ink) 80%, var(--dens-sub));
	}
	.note-list li {
		margin: 0.2rem 0;
	}

	/* ── Colophon ───────────────────────────────────────────────────────────────── */
	.colophon {
		margin: 0.3rem 0 0;
		font-family: var(--dens-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 10px;
		color: var(--dens-sub);
	}
</style>
