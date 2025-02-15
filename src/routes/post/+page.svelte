<script lang="ts">
	import { onMount } from 'svelte';
	import Markdown from '$lib/Markdown/Markdown.svelte';

	let posts: { file: string; content: string }[] = [];

	async function fetchPosts() {
		const response = await fetch('/api/posts');
		const postFiles = await response.json();

		posts = await Promise.all(
			postFiles.map(async (file: string) => {
				const postResponse = await fetch(`/posts/${file}`);
				const content = await postResponse.text();
				return { file, content };
			})
		);
	}

	onMount(() => {
		fetchPosts();
	});

	function toInitialCase(str: string) {
		return str.replace(/\w\S*/g, function (txt) {
			return txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase();
		});
	}
</script>

{#if posts.length > 0}
	<div class="container">
		<div class="content">
			<div class="sections">
				{#each posts as { file, content }}
					<div class="section">
						<div>
							<Markdown {content} />
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{:else}
	<p>Loading posts...</p>
{/if}
