<script>
	import { categories } from './categoryStore';
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<h2>📚 Knowledge Base</h2>
				<p>
					A haphazard collection of <span class="highlight highlight-blue">wisdom</span>.
				</p>
				<div class="pills">
					{#each $categories as category}
						<a href="/kb/{category.url}"><div class="pill">{category.name}</div></a>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
