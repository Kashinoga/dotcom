<script lang="ts">
	import { onMount } from 'svelte';

	let commits: { message: string; date: string; relativeTime: string; files: string[] }[] = [];

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		const options = {
			day: '2-digit' as '2-digit',
			month: 'short' as 'short',
			year: 'numeric' as 'numeric',
			hour: '2-digit' as '2-digit',
			minute: '2-digit' as '2-digit',
			second: '2-digit' as '2-digit',
			hour12: false as const
		};
		const formattedDate = new Intl.DateTimeFormat('en-GB', options).format(date);
		return formattedDate.replace(',', '').replace(' ', ' ').toUpperCase();
	}

	function formatRelativeTime(dateString: string) {
		const date = new Date(dateString);
		const now = new Date();
		const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
		const diffInMinutes = Math.floor(diffInSeconds / 60);
		const diffInHours = Math.floor(diffInMinutes / 60);
		const diffInDays = Math.floor(diffInHours / 24);

		if (diffInSeconds < 60) {
			return `${diffInSeconds} ${diffInSeconds === 1 ? 'second' : 'seconds'} ago`;
		} else if (diffInMinutes < 60) {
			return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
		} else if (diffInHours < 24) {
			return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
		} else if (diffInDays === 1) {
			return `1 day ago`;
		} else {
			return `${diffInDays} days ago`;
		}
	}

	onMount(async () => {
		const response = await fetch('https://api.github.com/repos/Kashinoga/dotcom/commits');
		const data = await response.json();
		const commitDetails = await Promise.all(
			data.slice(0, 4).map(async (commit: any) => {
				const commitResponse = await fetch(commit.url);
				const commitData = await commitResponse.json();
				return {
					message: commit.commit.message,
					date: formatDate(commit.commit.author.date),
					relativeTime: formatRelativeTime(commit.commit.author.date),
					files: commitData.files.map((file: any) => file.filename)
				};
			})
		);
		commits = commitDetails;
	});
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<h1>✨ Hi.</h1>
				<h2>My name is Andrew.</h2>
				<div class="paragraphs">
					<p>My name is Andrew.</p>
					<p>This is Kashinoga. My virtual home.</p>
					<p>
						Here, you'll find a gallery of the fun things that I've built. You'll also find a
						curation of the fun things that I've found elsewhere.
					</p>

					<p>
						You can also check out Kashinoga (on Obsidian) for a slightly faster and hotter
						experience.
					</p>
					<p>I hope you enjoy your time.</p>
				</div>
			</div>

			<div class="section">
				<h1>☝️ Look up!</h1>
				<h2>It's easy to forget to.</h2>
				<div class="paragraphs">
					<p>"I will root for you, all the time." —Anime Girl, Moments in the Universe</p>
				</div>
			</div>

			<div class="section">
				<h1>📢 Updates</h1>
				<h2>Proof that I do stuff.</h2>
				<div class="paragraphs">
					{#each commits as commit}
						<p>{commit.date} ({commit.relativeTime})</p>
						<div class="cardsContainer">
							<div class="card">
								<div class="cardInfoBorderless">
									<p>{commit.message}</p>
									<ul>
										{#each commit.files as file}
											<li>{file}</li>
										{/each}
									</ul>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.cardInfoBorderless p {
		margin-top: 0;
	}
</style>
