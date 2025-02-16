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
						<h3><i>A scroll of well-articulated thoughts.</i></h3>
					</div>
				</div>

				<div class="paragraphs">
					<p>
						Post is my collection of writings that I'm willing to make public. I hope they offer
						some useful or comedic insight into my perspective of life.
					</p>
				</div>

				<ul>
					{#each data.posts as post}
						<li>
							<a href="/post/{post.slug}">
								{post.title}, {post.date}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>
</div>
