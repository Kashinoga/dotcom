<svelte:head>
	<!-- Page first, site last. A tab strip truncates from the RIGHT, so the word that survives being
	     one of twenty open tabs is the one naming the page. -->
	<title>About Me | Kashinoga</title>
	<meta
		name="description"
		content="Andrew Nguyen — work, education, and the things he created or operates."
	/>
</svelte:head>

<!-- THE SAME SHELL EVERY PAGE USES, with no rails in it. See the home page for why that is the whole
     structure rather than a wrapper of this page's own.

     THE WORDS ARE FROM Notes/Dotcom/About Me.md, unedited. The note gained sections since it was
     first brought across — Work, Education, Physical Fun, Digital Fun, Contact — so this page has
     them too, as real <section>s with a thematic break before each title, which is what the design
     system puts between two divisions of a document.

     EVERY SECTION CARRIES ITS OWN id. Nothing on this page links to them yet, and that is not a
     reason to leave them off: an anchor is part of a document, not a decoration added when something
     happens to point at it. Written now, a link to #work works the day it is written — and if this
     page ever earns a contents rail, the rail can be built from the markup instead of from a second
     list kept beside it. -->
<div class="frame docs-shell">
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
			     from the one before. -->
			<hr />

			<section id="work" class="prose">
				<h1>Work</h1>
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
				<h1>Education</h1>
				<p class="measure">
					I have a Bachelor’s of Science in Computer Science from Iowa State University, with
					general education from Drake University.
				</p>
			</section>

			<hr />

			<section id="physical-fun" class="prose">
				<h1>Physical Fun</h1>
				<p class="measure">
					I currently reside in the Midwestern United States, occasionally visiting various
					countries in Southeast Asia for friends and family.
				</p>
			</section>

			<hr />

			<section id="digital-fun" class="prose">
				<h1>Digital Fun</h1>
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
				<h1>Contact</h1>
				<p class="measure">
					If you have any questions, please feel free to contact me at:
					<a href="mailto:contact@kashinoga.com">contact@kashinoga.com</a>.
				</p>
				<p class="measure">Take care,</p>
				<p class="measure">Andrew</p>
			</section>
		</main>
	</div>
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
