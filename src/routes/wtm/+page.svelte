<script>
	import './wtm.css';
	import { statesOfAmericaInventory } from './unitedStatesStore';
</script>

<div class="container">
	<div class="content">
		<h1 class="h1-first">🧭 What's the Move</h1>

		<p>
			A curated selection of <span class="highlight highlight-3">where to eat</span>,
			<span class="highlight highlight-3">places to see</span>, and
			<span class="highlight highlight-3">things to do</span>.
		</p>

		<h2>United States of America 🇺🇸</h2>

		<div class="tableOfContents">
			{#each $statesOfAmericaInventory as state}
				{#if state.enabled == 'true'}
					<a class="contentItem" href="/wtm/{state.name.toLowerCase()}"
						>{state.name} {state.emoji}</a
					>
				{/if}
			{/each}
		</div>
	</div>
	<div class="margin">
		<p><sub><sup>[0]</sup>The States' emojis are not a generalization. <i>Mostly</i>.</sub></p>
	</div>
</div>
