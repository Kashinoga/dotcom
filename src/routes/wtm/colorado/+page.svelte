<script>
	import { page } from '$app/stores';
	import { categoryInventory } from '../categoryStore';
	import { eatAndDrinkInventory } from './eatAndDrinkStore';
	import { entertainmentInventory } from './entertainmentStore';
	import { getStateName } from '../getStateName';

	let eatAndDrinkCategory = $categoryInventory[0];
	let entertainmentCategory = $categoryInventory[1];

	$: stateName = getStateName($page.url.pathname);
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<div class="title">
					<div class="title-emoji">
						<h1>🧭</h1>
					</div>
					<div class="title-text">
						<h1>What's the Move</h1>
						<h2>for {stateName}</h2>
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
					<h3 id={entertainmentCategory.id}>
						{entertainmentCategory.emoji}
						{entertainmentCategory.name}
					</h3>
					<div class="cards">
						{#each $entertainmentInventory.sort( (a, b) => a.name.localeCompare(b.name) ) as inventoryItem}
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
