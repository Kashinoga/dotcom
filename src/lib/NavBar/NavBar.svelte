<script lang="ts">
	import { page } from '$app/state';
	import { writable } from 'svelte/store';

	// Check if we're running in the browser (client-side)
	const isBrowser = typeof window !== 'undefined';

	// Initialize store with either the value from localStorage (if available) or default to '/'
	const savedPath = isBrowser ? localStorage.getItem('activePath') || '/' : '/';
	export const lastActivePath = writable(savedPath);

	// Update localStorage whenever the active path changes, but only on the client
	if (isBrowser) {
		lastActivePath.subscribe(($lastActivePath) => {
			localStorage.setItem('activePath', $lastActivePath);
		});
	}
</script>

<nav>
	<div class="nav-items">
		<div class="nav-items-left">
			<a
				href="/"
				class:active={page.url.pathname === '/' || !['/', '/menu'].includes(page.url.pathname)}
				on:click={() => lastActivePath.set('/')}>Kashinoga</a
			>
			<a
				href="/menu"
				class:active={page.url.pathname === '/menu'}
				on:click={() => lastActivePath.set('/menu')}>Menu</a
			>
			<a href="https://ko-fi.com/kashinoga" on:click={() => lastActivePath.set('/menu')}>Donate</a>

			<div class="ticker-container">
				<div class="ticker">
					<span
						>Do you know about Anna's Archive? It's 📚 the largest truly open library in human
						history. ⭐️ They mirror Sci-Hub and LibGen. They scrape and open-source Z-Lib, DuXiu,
						and more. 📈 38,079,795+ books, 106,532,454+ papers — preserved forever. All their code
						and data are completely open source.</span
					>
				</div>
				<div class="ticker" aria-hidden="true">
					<span
						>Do you know about Anna's Archive? It's 📚 the largest truly open library in human
						history. ⭐️ They mirror Sci-Hub and LibGen. They scrape and open-source Z-Lib, DuXiu,
						and more. 📈 38,079,795+ books, 106,532,454+ papers — preserved forever. All their code
						and data are completely open source.</span
					>
				</div>
			</div>
		</div>
	</div>
</nav>

<style>
	nav {
		display: flex;
		background-color: var(--color-background);
		padding: var(--padding);
		height: var(--height-nav);
		box-sizing: border-box;
	}

	.nav-items {
		display: flex;
		gap: var(--gap);
		margin: unset;
		max-width: var(--min-width);
	}

	@media (min-width: 900px) {
		.nav-items {
			margin: 0 auto;
		}
	}

	.nav-items-left {
		display: flex;
		flex-grow: 1;
		gap: var(--gap);
		overflow: hidden;
	}

	a {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
		font: inherit;
		padding: 0;
		margin: 0;
		border: none;
		background: none;
		padding-bottom: var(--padding-small);
		border-bottom: 0.2em solid transparent;
	}

	a:hover {
		border-bottom: 0.2em solid var(--blue);
	}

	.active {
		border-bottom: 0.2em solid var(--yellow);
	}

	/* Tickers */
	.ticker-container {
		display: none;
		border-bottom: 0.2em solid transparent;
		padding-bottom: var(--padding-small);
		align-items: center;
	}

	@media (min-width: 900px) {
		.ticker-container {
			display: flex;
			overflow-x: hidden;
		}
	}

	.ticker {
		display: flex;
		align-items: center;
		flex: 0 0 auto;
		gap: var(--gap);
		animation-name: ticker;
		animation-duration: 14s;
		animation-timing-function: linear;
		animation-delay: 2s;
		animation-iteration-count: infinite;
		animation-play-state: running;
		animation-direction: normal;
	}

	.ticker-container:hover .ticker {
		animation-play-state: paused;
	}

	.ticker span {
		padding-right: var(--padding-small);
	}

	@keyframes ticker {
		0% {
			transform: translateX(0%);
		}
		100% {
			transform: translateX(-100%);
		}
	}
</style>
