<script>
	import { eatAndDrinkInventory } from './eatAndDrinkStore';
</script>

<div class="container">
	<div class="content">
		<h1>🧭 What's the Move</h1>

		<div class="states">
			<div class="state">
				<h2>Iowa 🌽</h2>
				<h3>Eat and Drink</h3>
				<div class="cards">
					{#each $eatAndDrinkInventory as inventoryItem}
						<div class="card">
							<div class="cardLabel">
								<h4 class="cardName">{inventoryItem.name}</h4>
								<span class="highlight">{inventoryItem.roots}</span>
							</div>
							<ul>
								<li>{inventoryItem.cuisine}</li>
								<li>{inventoryItem.address}</li>
								<li>{inventoryItem.phone}</li>
							</ul>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
	<div class="margin"></div>
</div>

<style>
	.states {
		border-top: var(--border);
	}

	.states h3,
	h4 {
		border-bottom: var(--border);
	}

	.state {
		/* border-bottom: var(--border); */
		padding-bottom: var(--padding);
	}

	.cards {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--gap);
	}

	.card {
		padding: var(--padding);
		border: var(--border);
		border-radius: var(--border-radius);
	}

	.card h4,
	ul {
		margin-top: 0;
		margin-bottom: 0;
	}

	@media (min-width: 760px) {
		.cards {
			flex-wrap: nowrap;
		}
	}

	.cardLabel {
		display: flex;
		align-items: center;
	}

	.cardName {
		flex-grow: 1;
	}
</style>
