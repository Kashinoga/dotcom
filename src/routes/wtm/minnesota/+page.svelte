<script>
	import MarginNav from '$lib/Margin/MarginNav.svelte';
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
				<div class="paper">
					<h1>🧭 What's the Move for Minnesota</h1>
					<h2><i>You think about us a lot.</i></h2>
				</div>
			</div>

			<div class="section">
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
			</div>

			<div class="section">
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
	<div class="margin">
		<div class="marginPills">
			<div class="navPills">
				<MarginNav></MarginNav>
				{#each $categoryInventory as category}
					<a href="#{category.id}">
						{category.emoji}
						{category.name}
					</a>
				{/each}
			</div>
			<div class="superPills">
				<p><sub><sup>[0]</sup>The States' emojis are not a generalization. <i>Mostly</i>.</sub></p>
			</div>
		</div>
	</div>
</div>
