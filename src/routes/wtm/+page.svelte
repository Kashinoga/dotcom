<script>
	import { statesOfAmericaInventory } from './unitedStatesStore';
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
						<h2>A curated selection of where to eat, places to see, and things to do.</h2>
					</div>
				</div>

				<h3>United States of America</h3>
				<div class="pills">
					{#each $statesOfAmericaInventory as state}
						{#if state.enabled == 'true'}
							<a href="/wtm/{state.url}"><div class="pill">{state.name}</div></a>
						{:else}
							<div class="pill pill-disabled">{state.name}</div>
						{/if}
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
