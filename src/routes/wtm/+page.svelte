<script>
	import MarginNav from '$lib/Margin/MarginNav.svelte';
	import { statesOfAmericaInventory } from './unitedStatesStore';
</script>

<div class="container">
	<div class="content">
		<h1>🧭 What's the Move</h1>

		<p>
			A curated selection of <span class="highlight highlight-3">where to eat</span>,
			<span class="highlight highlight-3">places to see</span>, and
			<span class="highlight highlight-3">things to do</span>.
		</p>

		<h2>United States of America 🇺🇸</h2>

		<div class="marginPills">
			<div class="navPills">
				{#each $statesOfAmericaInventory as state}
					{#if state.enabled == 'true'}
						{#if state.emoji != ''}
							<a href="/wtm/{state.name.toLowerCase()}">{state.name} {state.emoji}</a>
						{:else}
							<button disabled class="pill">{state.name} {state.emoji}</button>
						{/if}
					{/if}
				{/each}
			</div>
		</div>
	</div>
	<div class="margin">
		<div class="marginPills">
			<div class="navPills">
				<MarginNav></MarginNav>
			</div>
			<div class="superPills">
				<p><sub><sup>[0]</sup>The States' emojis are not a generalization. <i>Mostly</i>.</sub></p>
				<p><sub><sup>[0a]</sup>The States without an emoji are coming soon!</sub></p>
				<p>
					<sub
						><sup>[0b]</sup>The States not listed at all are just more exploration opportunities. No
						hard feelings.</sub
					>
				</p>
			</div>
		</div>
	</div>
</div>
