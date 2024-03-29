<script>
	import FloatingActionButton from '$lib/FloatingActionButton/FloatingActionButton.svelte';
	import BackToTop from '$lib/Margin/BackToTop.svelte';
	import {
		tarotMinorSuites,
		tarotMinorStrength,
		tarotMinorIntelligence,
		tarotMinorWisdom,
		tarotMinorCharisma
	} from './minorArcanaStore';
</script>

<div class="container">
	<div class="content">
		<h1 class="h1-first">🤏 Minor Arcana</h1>

		<h2 id="strength">Strength 💪</h2>

		<table>
			<thead>
				<tr>
					<th scope="col" class="cardHeader">Card, "of Swords"</th>
					<th scope="col">Meaning</th>
				</tr>
			</thead>
			<tbody>
				{#each $tarotMinorStrength as card}
					<tr>
						<th scope="row">{card.name}</th>
						<td>{card.meaning}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<h2 id="intelligence">Intelligence 🧠</h2>
		<table>
			<thead>
				<tr>
					<th scope="col" class="cardHeader">Card, "of Wands"</th>
					<th scope="col">Meaning</th>
				</tr>
			</thead>
			<tbody>
				{#each $tarotMinorIntelligence as card}
					<tr>
						<th scope="row">{card.number}</th>
						<td>{card.meaning}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<h2 id="wisdom">Wisdom 🦉</h2>
		<table>
			<thead>
				<tr>
					<th scope="col" class="cardHeader">Card, "of Cups"</th>
					<th scope="col">Meaning</th>
				</tr>
			</thead>
			<tbody>
				{#each $tarotMinorWisdom as card}
					<tr>
						<th scope="row">{card.number}</th>
						<td>{card.meaning}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<h2 id="charisma">Charisma 🎯</h2>
		<table>
			<thead>
				<tr>
					<th scope="col" class="cardHeader">Card, "of Coins"</th>
					<th scope="col">Meaning</th>
				</tr>
			</thead>
			<tbody>
				{#each $tarotMinorCharisma as card}
					<tr>
						<th scope="row">{card.number}</th>
						<td>{card.meaning}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="margin">
		<div class="marginPills">
			<div class="navPills">
				<BackToTop></BackToTop>
				{#each $tarotMinorSuites as suite}
					<a class="contentItem" href="./minor-arcana/#{suite.name.toLowerCase()}"
						><button>{suite.name} {suite.emoji}</button></a
					>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.cardHeader {
		width: 25%;
	}
</style>
