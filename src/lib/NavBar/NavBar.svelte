<script lang="ts">
	import { page } from '$app/stores';
	import { writable } from 'svelte/store';

	// Check if we're running in the browser (client-side)
	const isBrowser = typeof window !== 'undefined';
	let darkMode = false;

	// Function to update both theme color and address bar color
	function updateThemeColor(color: 'light' | 'dark') {
		const metaTags = document.querySelectorAll('meta[name="theme-color"]');
		metaTags.forEach((metaTag) => {
			const meta = metaTag as HTMLMetaElement;
			if (meta.media === `(prefers-color-scheme: ${color})`) {
				meta.setAttribute('content', color === 'dark' ? '#292b2c' : '#f2f2f2');
			}
		});
	}

	function toggleDarkMode() {
		const currentTheme = document.documentElement.getAttribute('data-theme');
		darkMode = currentTheme === 'light'; // Toggle dark mode based on current theme

		document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
		updateThemeColor(darkMode ? 'dark' : 'light');
	}

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
				class={$page.url.pathname === '/' || !['/', '/menu'].includes($page.url.pathname)
					? 'active'
					: ''}
				onclick={() => lastActivePath.set('/')}>Kashinoga</a
			>
			<a
				href="/menu"
				class={$page.url.pathname === '/menu' ? 'active' : ''}
				onclick={() => lastActivePath.set('/menu')}>Menu</a
			>

			<div class="ticker-container">
				<div class="ticker">
					<span class="ticker-text"
						>Do you know about Anna's Archive? It's 📚 the largest truly open library in human
						history. ⭐️ They mirror Sci-Hub and LibGen. They scrape and open-source Z-Lib, DuXiu,
						and more. 📈 38,079,795+ books, 106,532,454+ papers — preserved forever. All their code
						and data are completely open source.</span
					>
				</div>
			</div>

			<button class="darkModeToggle" onclick={toggleDarkMode}>
				{#if darkMode}🌙{:else}☀️{/if}
			</button>
		</div>
	</div>
</nav>

<style>
	nav {
		background-color: var(--color-background);
		padding: var(--padding);
	}

	.nav-items {
		display: flex;
		gap: var(--gap);
		margin: 0 auto;
		max-width: 1060px;
	}

	.nav-items-left {
		display: flex;
		flex-grow: 1;
		gap: var(--gap);
		overflow: hidden;
	}

	.darkModeToggle {
		flex-shrink: 0;
		margin-left: auto;
	}

	a,
	button {
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
	}

	@media (min-width: 900px) {
		.ticker-container {
			display: unset;
			overflow: hidden;
		}
	}

	.ticker {
		display: flex;
		animation: ticker 12s linear infinite;
	}

	.ticker:hover {
		animation-play-state: paused;
	}

	.ticker-text {
		white-space: nowrap;
		padding-right: 1rem;
		color: var(--color-text-ticker);
	}

	@keyframes ticker {
		0% {
			transform: translatex(100%);
		}
		100% {
			transform: translatex(-300%);
		}
	}
</style>
