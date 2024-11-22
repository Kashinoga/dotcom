<script>
	import { statesOfAmericaInventory } from './unitedStatesStore';
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<div class="paper">
					<h2>🧭 What's the Move</h2>

					<p>
						A curated selection of <span class="highlight highlight-3">where to eat</span>,
						<span class="highlight highlight-3">places to see</span>, and
						<span class="highlight highlight-3">things to do</span>.
					</p>
				</div>
			</div>

			<div class="section">
				<div class="paper">
					<h3>United States of America</h3>
					<div class="marginPills">
						<div class="navPills">
							{#each $statesOfAmericaInventory as state}
								{#if state.enabled == 'true'}
									{#if state.emoji != ''}
										<a href="/wtm/{state.name.toLowerCase()}">{state.emoji} {state.name} </a>
									{:else}
										<button disabled class="pill">{state.emoji} {state.name} </button>
									{/if}
								{/if}
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
