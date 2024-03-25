<script>
	import { eatAndDrinkInventory } from '../eatAndDrinkStore';
	import { entertainmentInventory } from '../entertainmentStore';
</script>

<div class="container">
	<div class="content">
		<h1>🧭 What's the Move for Iowa 🌽</h1>

		<p>
			A curated selection of <span class="highlight highlight-3">where to eat</span>,
			<span class="highlight highlight-3">places to see</span>, and
			<span class="highlight highlight-3">things to do</span>.
		</p>

		<div class="tableOfContents">
			<a class="contentItem" href="/wtm">👈 Back</a>
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
				<h3>Entertainment 🍿</h3>
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
	</div>
	<div class="margin">
		<p><sub><sup>[0]</sup>The States' emojis are not a generalization. <i>Mostly</i>.</sub></p>
	</div>
</div>
