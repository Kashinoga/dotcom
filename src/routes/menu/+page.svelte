<script>
	import MarginNav from '$lib/Margin/MarginNav.svelte';
</script>

<div class="container">
	<div class="content">
		<div class="items">
			<a href="/wtm">
				<div class="item">
					<h1>🧭 What's the Move</h1>

					<p>
						A curated selection of <span class="highlight highlight-3">where to eat</span>,
						<span class="highlight highlight-3">places to see</span>, and
						<span class="highlight highlight-3">things to do</span>.
					</p>
				</div></a
			>
			<a href="/wx">
				<div class="item">
					<h1>🌦️ WX</h1>

					<p>A simple<sup>[2]</sup> <span class="highlight highlight-2">weather app</span>.</p>
				</div>
			</a>
		</div>
	</div>
	<div class="margin">
		<div class="marginPills">
			<div class="navPills">
				<MarginNav></MarginNav>
			</div>
			<div class="superPills">
				<p><sub><sup>[α]</sup>Initial alpha release.</sub></p>
				<p><sub><sup>[1]</sup>Third place, third place, third place!</sub></p>
				<p><sub><sup>[2]</sup>Nothing to it. <i>Mostly</i>.</sub></p>
			</div>
		</div>
	</div>
</div>

<style>
	a {
		color: var(--text-color);
		text-decoration: none;
	}

	.item {
		padding: var(--padding);
		background-color: var(--background-color-light);
		border: var(--border);
		border-radius: var(--border-radius);
	}

	.items {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap);
	}

	.items a {
		flex-grow: 1;
	}

	.item h1 {
		margin: 0;
	}
</style>
