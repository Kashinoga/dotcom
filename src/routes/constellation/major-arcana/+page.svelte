<script>
	import { majorArcana } from './majorArcanaStore';
	import MarginNav from '$lib/Margin/MarginNav.svelte';
</script>

<div class="container">
	<div class="content">
		<h1 class="h1-first">🖐️ Major Arcana</h1>
		<table>
			<thead>
				<tr>
					<th scope="col" class="cardHeader">Card, "of Swords"</th>
					<th scope="col">Meaning</th>
				</tr>
			</thead>
			<tbody>
				{#each $majorArcana as card}
					<tr>
						<th scope="row">{card.name}</th>
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
			</div>
		</div>
	</div>
</div>
