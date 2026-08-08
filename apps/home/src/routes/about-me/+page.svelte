<script lang="ts">
	import { onMount } from 'svelte';

	// ONE LIST, TWO RAILS. The sections are written down once here and both rails are read off it, so
	// a section cannot appear in one and not the other, and renaming one is one edit. Writing each
	// rail out by hand would make three copies of the same list — the markup and two navs — and the
	// two that are not the markup would be the ones to rot.
	//
	// The `id`s match the <section id> attributes below. There is no check tying them together; with
	// five entries in one file a check would be more machinery than the thing it checks. With a
	// second page like this, write one.
	const SECTIONS = [
		{ id: 'work', title: 'Work' },
		{ id: 'education', title: 'Education' },
		{ id: 'physical-fun', title: 'Physical Fun' },
		{ id: 'digital-fun', title: 'Digital Fun' },
		{ id: 'contact', title: 'Contact' }
	];

	// The design system's rail behaviour: underline the entry whose heading you are reading. It lives
	// in a file of its own precisely so a page like this can have it — docs.js would throw here,
	// because four of the five things it does assume a page with token tables on it.
	//
	// ON MOUNT, because it reads the DOM as soon as it runs and there is no document during SSR. The
	// rail itself is server-rendered, so nothing about the page's CONTENT waits for this; only the
	// marking does.
	onMount(async () => {
		const { markCurrentEntry } = await import('@kashinoga/design-system/docs-rail.js');
		markCurrentEntry();
	});
</script>

<svelte:head>
	<!-- Page first, site last. A tab strip truncates from the RIGHT, so the word that survives being
	     one of twenty open tabs is the one naming the page. -->
	<title>About Me | Kashinoga</title>
	<meta
		name="description"
		content="Andrew Nguyen — work, education, and the things he created or operates."
	/>
</svelte:head>

<!-- THE FULL SHELL: contents on the left, the document, its own contents on the right. The page has
     five sections now, which is what a rail is for — a flat page with one heading would be wearing
     apparatus it had no use for.

     THE WORDS ARE FROM Notes/Dotcom/About Me.md, unedited. -->
<div class="frame docs-shell">
	<!-- GLOBAL: the document's divisions, and the one a reader uses to move about a long page. Sticky,
	     so it is reachable from anywhere without scrolling back.

	     The BAND is the <nav>; the list inside it is what sticks. The two cannot be the same element —
	     a sticky box is only as tall as its contents, so a painted band that also sticks stops level
	     with the last link and reads as a card floating on the page rather than as the stock the sheet
	     is laid beside. -->
	<nav class="docs-rail docs-global" aria-label="Sections">
		<div class="docs-rail__inner">
			<p class="docs-rail__title">Sections</p>
			<ul role="list">
				{#each SECTIONS as section (section.id)}
					<li><a href="#{section.id}">{section.title}</a></li>
				{/each}
			</ul>
		</div>
	</nav>

	<div class="docs-column">
		<main id="main" class="stack" style="--stack-gap: var(--gap-section)">
			<!-- The document's own banner. KDS sizes a title with `:is(header.prose, …) h1`, so this is
			     what makes "About Me" a title rather than another section heading — written as a bare h1
			     in a run of prose it came out at the size of the sentence beneath it. -->
			<header class="prose">
				<h1>About Me</h1>
				<p class="measure">My name is Andrew Nguyen.</p>
				<p class="measure">I enjoy nature, literature, and video games.</p>
				<p class="measure">Also heightened experiences.</p>
			</header>

			<!-- A thematic break before each section title: the markdown "---". A SIBLING of the sections
			     rather than a child of one, because the break comes BETWEEN two divisions — one living
			     inside the division it opens would be announcing that division rather than separating it
			     from the one before.

			     SECTION TITLES ARE h2. The note writes them as "##" and that is what "##" means: one h1
			     for the document, headings under it for its parts. They were h1 first, on the design
			     system's own pattern — its sections carry h1 inside <section> — and that reads as one
			     document made of peer documents rather than one document with parts. -->
			<hr />

			<section id="work" class="prose">
				<h2>Work</h2>
				<p class="measure">
					I am a digital infrastructure engineer at multiple Continental U.S. energy companies.
				</p>
				<p class="measure">
					I was a software engineering consultant for various Midwestern U.S. companies and the
					State of Iowa.
				</p>
			</section>

			<hr />

			<section id="education" class="prose">
				<h2>Education</h2>
				<p class="measure">
					I have a Bachelor’s of Science in Computer Science from Iowa State University, with
					general education from Drake University.
				</p>
			</section>

			<hr />

			<section id="physical-fun" class="prose">
				<h2>Physical Fun</h2>
				<p class="measure">
					I currently reside in the Midwestern United States, occasionally visiting various
					countries in Southeast Asia for friends and family.
				</p>
			</section>

			<hr />

			<section id="digital-fun" class="prose">
				<h2>Digital Fun</h2>
				<p class="measure">I created and/or operate:</p>

				<!-- THE EMOJI IS THE MARKER, so the list does not draw a second one. A bullet says "this is
				     an item"; the mark says WHICH item — and a row carrying both states the first fact twice
				     and puts two symbols in front of every line. The nested lists keep their bullets, because
				     they have no mark of their own and something has to hold the level.

				     Marked aria-hidden where it is decoration beside a name that already reads. A screen
				     reader announcing "sparkling heart, Digital Community Services" is reading furniture. -->
				<ul class="flow measure ventures">
					<li>
						<span aria-hidden="true">💖</span> Digital Community Services: a digital community
						service project, offering friends and family various digital resources for a better
						digital well-being
						<ul class="flow">
							<li>Matrix, an open communication platform</li>
							<li>Nextcloud, an open productivity platform</li>
						</ul>
					</li>
					<li>
						<span aria-hidden="true">🎮</span> Digital Play Services: offering friends various
						gaming services for casual, community, and competitive play
						<ul class="flow">
							<li>Deadlock</li>
							<li>The Finals</li>
							<li>Hytale</li>
							<li>Terraria</li>
						</ul>
					</li>
					<li>
						<span aria-hidden="true">💾</span> SDKK: a Discord community offering a safe and friendly
						space for whatever is on our minds
					</li>
				</ul>
			</section>

			<hr />

			<section id="contact" class="prose">
				<h2>Contact</h2>
				<p class="measure">
					If you have any questions, please feel free to contact me at:
					<a href="mailto:contact@kashinoga.com">contact@kashinoga.com</a>.
				</p>
				<p class="measure">Take care,</p>
				<p class="measure">Andrew</p>
			</section>
		</main>
	</div>

	<!-- LOCAL: where you are in the page, marked as it scrolls. It carries the same five entries as
	     the rail on the left and that is not an oversight — this document has no headings beneath its
	     sections, so its outline IS its section list. On the design system's page the two differ
	     because that document goes three levels deep.
	     `data-depth` is what docs.css indents by, so the day a sub-heading is added here it lands
	     already stepped in. -->
	<nav class="docs-rail docs-local" aria-label="On this page">
		<div class="docs-rail__inner">
			<p class="docs-rail__title">On this page</p>
			<ul id="docs-toc" role="list">
				{#each SECTIONS as section (section.id)}
					<li data-depth="2"><a href="#{section.id}">{section.title}</a></li>
				{/each}
			</ul>
		</div>
	</nav>
</div>

<style>
	/* The outer list drops the marker the browser draws, because each row already carries one of its
	   own — see the note in the markup. */
	.ventures {
		list-style: none;
		padding-inline-start: 0;
	}

	/* THE INDENT STAYS, THOUGH, AND IT MOVES ONTO THE ROW. Dropped along with the marker, a row that
	   ran past one line wrapped back level with its own emoji — so the second line of an entry began
	   exactly where a new entry begins, and "digital resources for a better digital well-being" read
	   as a fourth thing operated rather than as the rest of the first.
	 *
	   That indent was never decoration. It is the hanging indent a marker sits IN, and a list that
	   supplies its own marker still needs it; only the drawing of the marker moved. The row is
	   padded, the first line is pulled back out by the same amount, and the emoji lands in the space
	   the padding opened while every following line aligns with the text.
	 *
	   text-indent inherits into block children, so the nested list has to put it back to zero or its
	   own first line is dragged left by the same amount. */
	.ventures > li {
		padding-inline-start: var(--space-24);
		text-indent: calc(-1 * var(--space-24));
	}

	.ventures > li > ul {
		text-indent: 0;
	}

	/* One unit past where the parent's own text begins, which is the distance that reads as "under"
	   rather than "beside". Their bullets stay: these rows carry no mark of their own, and something
	   has to hold the level. */
	.ventures ul {
		margin-block-start: var(--gap-tight);
		padding-inline-start: var(--space-24);
	}
</style>
