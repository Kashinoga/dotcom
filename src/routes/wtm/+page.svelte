<script>
	import { statesOfAmericaInventory } from './unitedStatesStore';
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<h2>🧭 What's the Move</h2>
				<div class="paragraphs">
					<p>
						A curated selection of <span class="highlight highlight-blue">where to eat</span>,
						<span class="highlight highlight-blue">places to see</span>, and
						<span class="highlight highlight-blue">things to do</span>.
					</p>
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
