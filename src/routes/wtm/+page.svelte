<script>
	import MarginNav from '$lib/Margin/MarginNav.svelte';
	import { statesOfAmericaInventory } from './unitedStatesStore';
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<div class="paper">
					<h1>🧭 What's the Move</h1>

					<p>
						A curated selection of <span class="highlight highlight-3">where to eat</span>,
						<span class="highlight highlight-3">places to see</span>, and
						<span class="highlight highlight-3">things to do</span>.
					</p>
				</div>
			</div>

			<div class="section">
				<div class="paper">
					<h2>United States of America<sup>[1, 1a, 1b]</sup> 🇺🇸</h2>
					<p><i>We're trying our best.</i></p>

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
	<div class="margin">
		<div class="marginPills">
			<div class="navPills">
				<MarginNav></MarginNav>
			</div>
			<div class="superPills">
				<p><sub><sup>[1]</sup>The States' emojis are not a generalization. <i>Mostly</i>.</sub></p>
				<p><sub><sup>[1a]</sup>The States without an emoji are coming soon!</sub></p>
				<p>
					<sub
						><sup>[1b]</sup>The States not listed at all are just more exploration opportunities. No
						hard feelings.</sub
					>
				</p>
			</div>
		</div>
	</div>
</div>
