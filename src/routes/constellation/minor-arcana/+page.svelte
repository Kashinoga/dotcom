<script>
	import MarginNav from '$lib/Margin/MarginNav.svelte';
	import {
		tarotMinorSuites,
		tarotMinorStrength,
		tarotMinorIntelligence,
		tarotMinorWisdom,
		tarotMinorCharisma
	} from './minorArcanaStore';

	let strengthSuite = $tarotMinorSuites[0];
	let intelligenceSuite = $tarotMinorSuites[1];
	let wisdomSuite = $tarotMinorSuites[2];
	let charismaSuite = $tarotMinorSuites[3];
</script>

<div class="container">
	<div class="content">
		<h1 >🤏 Minor Arcana</h1>

		<h2 id={strengthSuite.id}>{strengthSuite.emoji} {strengthSuite.name}</h2>

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
		<h2 id={intelligenceSuite.id}>{intelligenceSuite.emoji} {intelligenceSuite.name}</h2>
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
		<h2 id={wisdomSuite.id}>{wisdomSuite.emoji} {wisdomSuite.name}</h2>
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
		<h2 id={charismaSuite.id}>{charismaSuite.emoji} {charismaSuite.name}</h2>
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
				<MarginNav></MarginNav>
				{#each $tarotMinorSuites as suite}
					<button class="pill">
						<a href="./minor-arcana/#{suite.name.toLowerCase()}">{suite.emoji} {suite.name}</a
						></button
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
