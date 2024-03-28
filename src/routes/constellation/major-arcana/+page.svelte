<script>
	import { scrollToBottom, scrollToTop } from '$lib/utils';
	import { majorArcana } from './majorArcanaStore';
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
				<button on:click={scrollToTop}>Back to Top ⬆️</button>
			</div>
		</div>
	</div>

	<button class="fab" on:click={scrollToBottom}>📑</button>
</div>
