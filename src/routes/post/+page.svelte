<script lang="ts">
	export let data;
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<div class="title">
					<div class="title-emoji">
						<h1>📬</h1>
					</div>
					<div class="title-text">
						<h1>Post</h1>
						<h2>A personal, curated collection of writings made public.</h2>
					</div>
				</div>

				<div class="paragraphs">
					<p>
						I hope these writings offer some useful or comedic insight into this perspective of
						life.
					</p>
				</div>

				<ul>
					{#each data.posts as post}
						<li>
							<a href="/post/{post.slug}">
								{post.date}: {post.title}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>
</div>
