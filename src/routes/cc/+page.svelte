<script>
	import MarginNav from '$lib/Margin/MarginNav.svelte';
	import { navMoji } from './ccStore';

	let emergency = $navMoji[0];
	let caretaking = $navMoji[1];
</script>

<div class="container">
	<div class="content">
		<h1>🐈 Cat Care</h1>

		<p>
			Welcome to the caretaking guide for taking care of Andrew's cats, <span
				class="highlight highlight-1">Pluto and Willow</span
			>. Thank you so much for taking the time and effort out of your day(s) to look after these
			children.
		</p>

		<p>These are senior cats, so please take careful consideration! Thank you!!</p>

		<h2 id={emergency.id}>{emergency.emoji} {emergency.name}</h2>

		<div class="cardsContainer">
			<div class="cards">
				<div class="card">
					<div class="cardLabel">
						<h4 class="cardName">Iowa Veterinary Specialties</h4>
						<span class="highlight highlight-red">24 Hour</span>
					</div>
					<ul>
						<li>6110 Creston Ave, Des Moines, IA 50321</li>
						<br />
						<li>Open 24 hours</li>
						<br />
						<li>515-280-3100</li>
					</ul>
				</div>
				<div class="card">
					<div class="cardLabel">
						<h4 class="cardName">Grand Avenue Veterinary Hospital</h4>
						<span class="highlight highlight-2">Preferred</span>
					</div>
					<ul>
						<li>312 Grand Ave, West Des Moines, IA 50265</li>
						<br />
						<li>SUN Closed</li>
						<li>MON - FRI 7:30 AM - 6 PM</li>
						<li>SAT 8 AM - NOON</li>
						<br />
						<li>515-274-3489</li>
					</ul>
				</div>
				<div class="card">
					<div class="cardLabel">
						<h4 class="cardName">Ingersoll Animal Hospital</h4>
					</div>
					<ul>
						<li>3009 Ingersoll Ave, Des Moines, IA 50312</li>
						<br />
						<li>SUN Closed</li>
						<li>MON - FRI 7 AM - 6 PM</li>
						<li>SAT 7 AM - NOON</li>
						<br />
						<li>515-274-3555</li>
					</ul>
				</div>
			</div>
		</div>
		<h2 id={caretaking.id}>{caretaking.emoji} {caretaking.name}</h2>

		<h3>General Considerations</h3>
		<ul>
			<li>Thank you for taking care of the cats!</li>
			<li>They are fed two meals a day</li>
			<ul>
				<li>
					Either (dry) 1/4 cup per bowl or (wet) 1 pouch per bowl, twice a day; once in the morning,
					then in the evening
					<ul>
						<li>Wet food is preferred, but dry food may be used if needed</li>
						<ul>
							<li>Please add two tablespoons of water to each bowl when using dry food</li>
						</ul>
					</ul>
				</li>
			</ul>
			<li>They get one snack a day</li>
			<ul>
				<li>One tube for both cats, once in the afternoon</li>
			</ul>
			<li>
				Their <span class="highlight highlight-2">food bowls</span>,
				<span class="highlight highlight-2">food</span>, and
				<span class="highlight highlight-2">snacks</span>
				are in the
				<span class="highlight highlight-3">kitchen</span>
			</li>
			<li>
				Their <span class="highlight highlight-2">water bowls</span> are in the
				<span class="highlight highlight-3">kitchen</span>
				and in the
				<span class="highlight highlight-3">living room</span>
				<ul>
					<li>Please ensure that each is filled with water</li>
				</ul>
			</li>
			<li>
				Their <span class="highlight highlight-2">litter box</span> is in the
				<span class="highlight highlight-3">bathroom</span>
				<ul>
					<li>Please remove clumps of pee and poop once per day</li>
				</ul>
			</li>
		</ul>

		<br />

		<h3>Special Considerations</h3>
		<ul>
			<li>Pluto needs gastrointestinal accomodations</li>
			<ol>
				<li>Checking for constipation</li>
				<ul>
					<li>Check his asshole, is poop blocking it?</li>
					<li>Is he peeing, has peed, but is still straining to poop?</li>
					<li>Is he yowling, laying on his side, and straining to poop?</li>
				</ul>
				<li>If the answer's "yes" to any of these questions, then Pluto's constipated</li>
				<ul>
					<li>
						See if the medicine helps him within a few hours; if not, please contact me and prepare
						to book a vet visit
					</li>
				</ul>
			</ol>
			<li>Willow has severe anxiety</li>
			<ol>
				<li>She's bored, lethargic, or hiding</li>
				<ul>
					<li>Please play with her; her favorite toy is any string dragging on the ground</li>
					<li>
						Please give her catnip, <span class="highlight">under supervision</span>, as she may
						injure herself; the catnip will wear off in half an hour
					</li>
				</ul>
			</ol>
		</ul>
	</div>

	<div class="margin">
		<div class="marginPills">
			<div class="navPills">
				<MarginNav></MarginNav>
				{#each $navMoji as suite}
					<a href="#{suite.name.toLowerCase()}">{suite.emoji} {suite.name}</a>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.cards {
		display: grid;
		gap: var(--gap);

		margin-top: var(--margin);
		margin-bottom: var(--margin);
	}

	@media (min-width: 900px) {
		.cards {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.card {
		background-color: var(--background-color-light);

		padding: var(--padding);
		border: var(--border);
		border-radius: var(--border-radius);
	}

	.card h4,
	ul {
		margin-top: 0;
		margin-bottom: 0;
	}

	.cardLabel {
		display: flex;
		align-items: center;
	}

	.cardName {
		flex-grow: 1;
	}
</style>
