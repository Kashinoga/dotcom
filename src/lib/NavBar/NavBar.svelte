<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { get, writable } from 'svelte/store';

	// Check if we're running in the browser (client-side)
	const isBrowser = typeof window !== 'undefined';

	// Define the store to hold the theme value
	const theme = writable<'light' | 'dark'>('light'); // Default to light

	// Use onMount to execute the document-related code only in the browser
	onMount(() => {
		const themeColorMeta = document.querySelector('meta[name="theme-color"]');
		const statusBarMeta = document.querySelector(
			'meta[name="apple-mobile-web-app-status-bar-style"]'
		);

		// Apply theme color meta tags
		if ($theme === 'dark') {
			if (themeColorMeta) themeColorMeta.setAttribute('content', '#292b2c');
			if (statusBarMeta) statusBarMeta.setAttribute('content', 'black-translucent');
		} else {
			if (themeColorMeta) themeColorMeta.setAttribute('content', '#f2f2f2');
			if (statusBarMeta) statusBarMeta.setAttribute('content', 'default');
		}
	});

	// Apply the theme to the DOM
	function applyTheme(currentTheme: 'light' | 'dark') {
		if (typeof document !== 'undefined') {
			document.documentElement.setAttribute('data-theme', currentTheme);
			const metaTag = document.querySelector('meta[name="theme-color"]');
			if (metaTag) {
				metaTag.setAttribute('content', currentTheme === 'dark' ? '#292b2c' : '#f2f2f2');
			}
		}
	}

	// Function to toggle theme
	function toggleDarkMode() {
		const newTheme = get(theme) === 'dark' ? 'light' : 'dark';
		theme.set(newTheme);
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('theme', newTheme);
		}
	}

	// Check for saved theme in localStorage
	onMount(() => {
		if (typeof localStorage !== 'undefined') {
			const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
			if (savedTheme) {
				theme.set(savedTheme); // Use the saved theme
			} else {
				// Fallback to system theme if no preference is stored
				const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				theme.set(systemPrefersDark ? 'dark' : 'light');
			}

			// Apply the theme to the page on mount
			applyTheme(get(theme));

			// Listen for system theme changes
			const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
			mediaQuery.addEventListener('change', (e) => {
				if (!localStorage.getItem('theme')) {
					theme.set(e.matches ? 'dark' : 'light');
				}
			});
		}
	});

	// Subscribe to theme changes to update the DOM when it changes
	$: applyTheme($theme);

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

			<button class="darkModeToggle" onclick={toggleDarkMode}>
				{#if $theme === 'dark'}🌙{:else}☀️{/if}
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
			display: flex;
			overflow-x: hidden;
		}
	}

	.ticker {
		display: flex;
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

	/* .ticker-text {
		white-space: nowrap;
		padding-right: var(--padding-small);
		color: var(--color-text-ticker);
	} */

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
