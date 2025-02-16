<script lang="ts">
	export let data;
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<h1>📬 Post</h1>
			</div>
			<div class="section">
				<ul>
					{#each data.posts as post}
						<li>
							<a href="/post/{post.slug}">
								{post.title} - {post.date}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>
</div>
