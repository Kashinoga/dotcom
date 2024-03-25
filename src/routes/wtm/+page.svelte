<script>
	import { eatAndDrinkInventory } from './eatAndDrinkStore';
	import { entertainmentInventory } from './entertainmentStore';
</script>

<div class="container">
	<div class="content">
		<h1>🧭 What's the Move</h1>

		<p>
			A curated selection of <span class="highlight highlight-3">where to eat</span>,
			<span class="highlight highlight-3">places to see</span>, and
			<span class="highlight highlight-3">things to do</span>.
		</p>

		<div class="tableOfContents">
			<a class="contentItem" href="#Iowa">Iowa 🌽<sup>[1]</sup></a>
			<a class="contentItem" href="#Minnesota">Minnesota ❄️<sup>[2]</sup></a>
		</div>

		<div class="states">
			<div class="state">
				<h2 id="Iowa">Iowa 🌽</h2>
				<h3>Eat and Drink 😋</h3>
				<div class="cards">
					{#each $eatAndDrinkInventory as inventoryItem}
						{#if inventoryItem.state == 'Iowa'}
							<div class="card">
								<div class="cardLabel">
									<h4 class="cardName">{inventoryItem.name}</h4>
									{#if inventoryItem.roots == 'Local'}
										<span class="highlight highlight-2">{inventoryItem.roots}</span>
									{:else}
										<span class="highlight highlight-3">{inventoryItem.roots}</span>
									{/if}
								</div>
								<ul>
									<li>{inventoryItem.cuisine}</li>
									<li>{inventoryItem.address}</li>
									<li><a href={inventoryItem.website}>{inventoryItem.website}</a></li>
									<li>{inventoryItem.phone}</li>
								</ul>
							</div>
						{/if}
					{/each}
				</div>
				<h3>Entertainment 🎥</h3>
				<div class="cards">
					{#each $entertainmentInventory as inventoryItem}
						{#if inventoryItem.state == 'Iowa'}
							<div class="card">
								<div class="cardLabel">
									<h4 class="cardName">{inventoryItem.name}</h4>
									{#if inventoryItem.roots == 'Local'}
										<span class="highlight highlight-2">{inventoryItem.roots}</span>
									{:else}
										<span class="highlight highlight-3">{inventoryItem.roots}</span>
									{/if}
								</div>
								<ul>
									<li>{inventoryItem.type}</li>
									<li>{inventoryItem.address}</li>
									<li><a href={inventoryItem.website}>{inventoryItem.website}</a></li>
									<li>{inventoryItem.phone}</li>
								</ul>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</div>

		<div class="states">
			<div class="state">
				<h2 id="Minnesota">Minnesota ❄️</h2>
				<h3>Eat and Drink 😋</h3>
				<div class="cards">
					{#each $eatAndDrinkInventory as inventoryItem}
						{#if inventoryItem.state == 'Minnesota'}
							<div class="card">
								<div class="cardLabel">
									<h4 class="cardName">{inventoryItem.name}</h4>
									{#if inventoryItem.roots == 'Local'}
										<span class="highlight highlight-2">{inventoryItem.roots}</span>
									{:else}
										<span class="highlight highlight-3">{inventoryItem.roots}</span>
									{/if}
								</div>
								<ul>
									<li>{inventoryItem.cuisine}</li>
									<li>{inventoryItem.address}</li>
									<li><a href={inventoryItem.website}>{inventoryItem.website}</a></li>
									<li>{inventoryItem.phone}</li>
								</ul>
							</div>
						{/if}
					{/each}
				</div>
				<h3>Entertainment 🍿</h3>
				<div class="cards">
					{#each $entertainmentInventory as inventoryItem}
						{#if inventoryItem.state == 'Minnesota'}
							<div class="card">
								<div class="cardLabel">
									<h4 class="cardName">{inventoryItem.name}</h4>
									{#if inventoryItem.roots == 'Local'}
										<span class="highlight highlight-2">{inventoryItem.roots}</span>
									{:else}
										<span class="highlight highlight-3">{inventoryItem.roots}</span>
									{/if}
								</div>
								<ul>
									<li>{inventoryItem.type}</li>
									<li>{inventoryItem.address}</li>
									<li><a href={inventoryItem.website}>{inventoryItem.website}</a></li>
									<li>{inventoryItem.phone}</li>
								</ul>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</div>
	</div>
	<div class="margin">
		<p><sub><sup>[1]</sup>This is not a generalization.</sub></p>
		<p><sub><sup>[2]</sup>This is also not a generalization.</sub></p>
	</div>
</div>

<style>
	.tableOfContents {
		display: flex;
		gap: var(--gap);
		margin-bottom: var(--margin);
	}

	.tableOfContents a {
		text-decoration: none;
	}

	.contentItem {
		border: var(--border);
		border-radius: var(--border-radius);
		padding: var(--padding-small);
	}

	.states {
		border-top: var(--border);
	}

	.state {
		/* border-bottom: var(--border); */
		padding-bottom: var(--padding);
	}

	.cards {
		display: grid;
		/* flex-direction: row;
		flex-wrap: wrap; */
		gap: var(--gap);
	}

	@media (min-width: 760px) {
		.cards {
			/* flex-wrap: nowrap; */
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.card {
		padding: var(--padding);
		border: var(--border);
		border-radius: var(--border-radius);
		/* flex-grow: 1; */
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
