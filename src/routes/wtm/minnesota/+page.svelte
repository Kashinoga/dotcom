<script>
	import '../wtm.css';
	import BackToTop from '$lib/Margin/BackToTop.svelte';
	import { categoryInventory } from '../categoryStore';
	import { eatAndDrinkInventory } from './eatAndDrinkStore';
	import { entertainmentInventory } from './entertainmentStore';
</script>

<div class="container">
	<div class="content">
		<h1 class="h1-first">🧭 What's the Move</h1>

		<p>
			A curated selection of <span class="highlight highlight-3">where to eat</span>,
			<span class="highlight highlight-3">places to see</span>, and
			<span class="highlight highlight-3">things to do</span>.
		</p>

		<h2>Minnesota ❄️</h2>

		<div class="cardsContainer">
			<h3 id="eatAndDrink">Eat and Drink</h3>
			<div class="cards">
				{#each $eatAndDrinkInventory.sort((a, b) => a.name.localeCompare(b.name)) as inventoryItem}
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
			<h3 id="entertainment">Entertainment</h3>
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
	<div class="margin">
		<div class="marginPills">
			<div class="navPills">
				<BackToTop></BackToTop>
				{#each $categoryInventory as category}
					<button class="pill">
						<a href="#{category.id}">
							{category.name}
							{category.emoji}
						</a>
					</button>
				{/each}
			</div>
			<div class="superPills">
				<p><sub><sup>[0]</sup>The States' emojis are not a generalization. <i>Mostly</i>.</sub></p>
			</div>
		</div>
	</div>
</div>
