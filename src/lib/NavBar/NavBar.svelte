<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
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

	// Set the initial theme and address bar color on page load
	onMount(() => {
		// Ensure the savedTheme value is either 'light' or 'dark'
		const savedTheme = (localStorage.getItem('theme') || 'dark') as 'light' | 'dark'; // Type assertion here
		document.documentElement.setAttribute('data-theme', savedTheme);
		lastActivePath.set($page.url.pathname); // Sync the store with the current path

		// Set initial theme color and address bar color
		updateThemeColor(savedTheme);

		// Listen for changes in color scheme
		const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const darkModeListener = () => updateThemeColor(darkModeMediaQuery.matches ? 'dark' : 'light');
		darkModeMediaQuery.addEventListener('change', darkModeListener);

		// Cleanup listener when the component is destroyed
		return () => {
			darkModeMediaQuery.removeEventListener('change', darkModeListener);
		};
	});
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
		</div>
		<div class="nav-item-right">
			<button onclick={toggleDarkMode}>
				{#if darkMode}🌙{:else}☀️{/if}
			</button>
		</div>
	</div>
</nav>

<style>
	nav {
		background-color: var(--background);
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

	.active {
		border-bottom: 0.2em solid var(--nav-blue);
	}
</style>
