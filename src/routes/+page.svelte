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

		if (diffInMinutes < 60) {
			return `${diffInMinutes} minutes ago`;
		} else if (diffInHours < 24) {
			return `${diffInHours} hours ago`;
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
				<h2>✨ Hi.</h2>
				<div class="paragraphs">
					<p>My name is <span class="highlight">Andrew</span>.</p>
					<p>
						This is <span class="highlight">Kashinoga</span>. My virtual
						<span class="highlight">home</span>.
					</p>
					<p>
						Here, you'll find a <span class="highlight">gallery of the fun things</span>
						that I've built. You'll also find a
						<span class="highlight"
							>curation of the
							<i>fun</i> things</span
						>
						that I've found <span class="highlight">elsewhere</span>.
					</p>
					<p>I hope you enjoy your time.</p>
				</div>
			</div>
			<div class="section">
				<h2>☝️ Look up!</h2>
				<div class="paragraphs">
					<p>
						<span class="highlight highlight-quote">"I will root for you, all the time."</span>
						—<span class="highlight">Anime Girl</span>, Moments in the Universe
					</p>
				</div>
			</div>
			<div class="section">
				<h2>📢 Updates</h2>
				<div class="paragraphs">
					{#each commits as commit}
						<p>{commit.date} ({commit.relativeTime}) - {commit.message}</p>
						<div class="cardsContainer">
							<div class="card">
								<div class="cardInfo">
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
