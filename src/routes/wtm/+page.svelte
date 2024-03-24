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
							<h4>{inventoryItem.name}</h4>
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
	.states h4 {
		/* margin: 0; */
		border-bottom: var(--border);
	}

	.state {
		border-bottom: var(--border);
		padding-bottom: var(--padding);
	}

	.cards {
		display: flex;
		gap: var(--gap);
	}

	.card {
		width: fit-content;
		padding: var(--padding);
		border: var(--border);
		border-radius: var(--border-radius);
	}

	.card h4,
	.card ul {
		margin: 0;
	}
</style>
