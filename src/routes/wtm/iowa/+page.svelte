<script>
	import { categoryInventory } from '../categoryStore';
	import { eatAndDrinkInventory } from './eatAndDrinkStore';
	import { entertainmentInventory } from './entertainmentStore';

	let eatAndDrinkCategory = $categoryInventory[0];
	let entertainmentCategory = $categoryInventory[1];
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<h2>🧭 What's the Move for Iowa</h2>
				<div class="cardsContainer">
					<h3 id={eatAndDrinkCategory.id}>
						{eatAndDrinkCategory.emoji}
						{eatAndDrinkCategory.name}
					</h3>
					<div class="cards">
						{#each $eatAndDrinkInventory.sort( (a, b) => a.name.localeCompare(b.name) ) as inventoryItem}
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
									<li>
										<a href="http://maps.apple.com/?q={inventoryItem.name}">Apple ↗️</a>
										<a href="http://maps.google.com/?q={inventoryItem.name}">Google ↗️</a>
									</li>
								</ul>
							</div>
						{/each}
					</div>
				</div>
				<div class="cardsContainer">
					<h3 id={entertainmentCategory.id}>
						{entertainmentCategory.emoji}
						{entertainmentCategory.name}
					</h3>
					<div class="cards">
						{#each $entertainmentInventory.sort( (a, b) => a.name.localeCompare(b.name) ) as inventoryItem}
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
									<li>
										<a href="http://maps.apple.com/?q={inventoryItem.name}">Apple ↗️</a>
										<a href="http://maps.google.com/?q={inventoryItem.name}">Google ↗️</a>
									</li>
								</ul>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
