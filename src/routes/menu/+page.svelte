<script>
	import MarginNav from '$lib/Margin/MarginNav.svelte';
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<a href="/wtm">
					<h2>🧭 What's the Move</h2>
					<p>
						A curated selection of <span class="highlight highlight-3">where to eat</span>,
						<span class="highlight highlight-3">places to see</span>, and
						<span class="highlight highlight-3">things to do</span>.
					</p>
				</a>
				<a href="/wx">
					<h2>🌦️ WX</h2>
					<p>A simple<sup>[2]</sup> <span class="highlight highlight-2">weather app</span>.</p>
				</a>
			</div>
		</div>
	</div>
</div>

<style>
	a {
		text-decoration: none;
	}

	.section a h2 {
		margin-top: var(--margin);
	}

	.section a:first-of-type h2 {
		margin-top: 0;
	}
</style>
