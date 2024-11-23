<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';

	// Check if we're running in the browser (client-side)
	const isBrowser = typeof window !== 'undefined';
	let darkMode = false;

	function changeAddressBarColor(color: 'light' | 'dark') {
		const metaTags = document.querySelectorAll('meta[name="theme-color"]');
		metaTags.forEach((metaTag) => {
			const meta = metaTag as HTMLMetaElement; // Assert the type to HTMLMetaElement
			if (meta.media === '(prefers-color-scheme: light)' && color === 'light') {
				meta.setAttribute('content', '#f2f2f2');
			} else if (meta.media === '(prefers-color-scheme: dark)' && color === 'dark') {
				meta.setAttribute('content', '#292b2c');
			}
		});
	}

	function toggleDarkMode() {
		let dataTheme = document.documentElement.getAttribute('data-theme');
		darkMode = !darkMode;

		if (dataTheme == 'light') {
			document.documentElement.setAttribute('data-theme', 'dark');
			changeAddressBarColor('dark');
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
			changeAddressBarColor('light');
		}
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
		const savedTheme = localStorage.getItem('theme') || 'dark'; // Default to light if no saved theme
		document.documentElement.setAttribute('data-theme', savedTheme);
		lastActivePath.set($page.url.pathname); // Sync the store with the current path

		// Set address bar color based on the theme
		if (savedTheme === 'dark') {
			changeAddressBarColor('dark'); // Dark mode address bar color
		} else {
			changeAddressBarColor('light'); // Light mode address bar color
		}
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
		/* display: flex; */
		background-color: var(--background);
		/* margin: 0 auto; */

		padding: var(--padding);

		/* border-bottom: var(--border); */
	}

	@media (min-width: 900px) {
		nav {
			/* position: unset; */

			/* margin-bottom: 0; */

			/* padding-bottom: var(--padding); */
			/* padding-top: var(--padding); */

			/* border: 0; */
			/* border-radius: 0; */
			/* border-bottom: var(--border); */
		}
	}

	.nav-items {
		display: flex;
		gap: var(--gap);
		margin: 0 auto;

		max-width: 1060px;

		/* padding-left: 0.4em; */
		/* padding-right: 0.4em; */
	}

	@media (min-width: 900px) {
		.nav-items {
			/* margin: 0 auto; */
		}
	}

	.nav-items-left {
		display: flex;
		flex-grow: 1;
		gap: var(--gap);
	}

	a,
	button {
		display: inline-flex; /* Ensure consistency */
		align-items: center; /* Vertically aligns content inside */
		text-decoration: none; /* Remove underline for links */
		font: inherit; /* Use the same font for both */
		padding: 0; /* Normalize padding */
		margin: 0; /* Normalize margin */
		border: none; /* Remove button borders */
		background: none; /* Remove button background */

		padding-bottom: var(--padding-small);
		/* min-width: fit-content;
		min-height: fit-content; */

		border-bottom: 0.2em solid transparent;
	}

	.active {
		border-bottom: 0.2em solid var(--nav-blue);
	}
</style>
