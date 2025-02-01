<script>
	import { page } from '$app/stores';
	import { getStateName } from '../getStateName';
	import { categoryInventory } from '../categoryStore';
	import { eatAndDrinkInventory } from './eatAndDrinkStore';
	import { entertainmentInventory } from './entertainmentStore';
	import { recreationInventory } from './recreationStore';

	let eatAndDrinkCategory = $categoryInventory[0];
	let entertainmentCategory = $categoryInventory[1];
	let recreationCategory = $categoryInventory[2];

	$: stateName = getStateName($page.url.pathname);
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<div class="title">
					<div class="title-emoji"><h2>🧭</h2></div>
					<div class="title-text">
						<h2>What's the Move</h2>
						<h3>for {stateName}</h3>
					</div>
				</div>
				<div class="cardsContainer">
					<h3 id={eatAndDrinkCategory.id}>
						{eatAndDrinkCategory.emoji}
						{eatAndDrinkCategory.name}
					</h3>
					<div class="cards">
						{#each $eatAndDrinkInventory.sort( (a, b) => a.name.localeCompare(b.name) ) as inventoryItem}
							<div class="card">
								<div class="cardInfo">
									<h4 class="cardName">{inventoryItem.name}</h4>
									<ul>
										<li>{inventoryItem.type}</li>
										<li>{inventoryItem.address}</li>
										<li>
											<a href="http://maps.apple.com/?q={inventoryItem.name}">Apple ↗️</a>
											<a href="http://maps.google.com/?q={inventoryItem.name}">Google ↗️</a>
										</li>
									</ul>
								</div>
								<div class="cardLabel">
									{#if inventoryItem.roots == 'Local'}
										<span>{inventoryItem.roots.toUpperCase()}</span>
									{:else}
										<span>{inventoryItem.roots.toUpperCase()}</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
				<div class="cardsContainer">
					<h3 id={recreationCategory.id}>
						{recreationCategory.emoji}
						{recreationCategory.name}
					</h3>
					<div class="cards">
						{#each $recreationInventory.sort( (a, b) => a.name.localeCompare(b.name) ) as inventoryItem}
							<div class="card">
								<div class="cardInfo">
									<h4 class="cardName">{inventoryItem.name}</h4>
									<ul>
										<li>{inventoryItem.type}</li>
										<li>{inventoryItem.address}</li>
										<li>
											<a href="http://maps.apple.com/?q={inventoryItem.name}">Apple ↗️</a>
											<a href="http://maps.google.com/?q={inventoryItem.name}">Google ↗️</a>
										</li>
									</ul>
								</div>
								<div class="cardLabel">
									{#if inventoryItem.roots == 'Local'}
										<span>{inventoryItem.roots.toUpperCase()}</span>
									{:else}
										<span>{inventoryItem.roots.toUpperCase()}</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
