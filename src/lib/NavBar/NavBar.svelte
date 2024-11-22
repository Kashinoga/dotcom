<script>
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';

	// Check if we're running in the browser (client-side)
	const isBrowser = typeof window !== 'undefined';
	let darkMode2 = false;

	function toggleDarkMode() {
		let darkMode = document.documentElement.getAttribute('data-theme');
		darkMode2 = !darkMode2;

		if (darkMode == 'light') {
			document.documentElement.setAttribute('data-theme', 'dark');
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
		}
	}

	// export const lastActivePath = writable();

	// Initialize store with either the value from localStorage (if available) or default to '/'
	const savedPath = isBrowser ? localStorage.getItem('activePath') || '/' : '/';
	export const lastActivePath = writable(savedPath);

	// Update localStorage whenever the active path changes, but only on the client
	if (isBrowser) {
		lastActivePath.subscribe(($lastActivePath) => {
			localStorage.setItem('activePath', $lastActivePath);
		});
	}

	// onMount(() => {
	// 	const currentPath = $page.url.pathname;
	// 	// Update the last active path only if it's not already set or differs from current
	// 	if ($lastActivePath !== currentPath) {
	// 		lastActivePath.set(currentPath);
	// 	}
	// });
</script>

<nav>
	<div class="nav-items">
		<div class="nav-items-left">
			<a
				href="/"
				class={$page.url.pathname === '/' || $lastActivePath === '/' ? 'active' : ''}
				onclick={() => lastActivePath.set('/')}>Kashinoga</a
			>

			<a
				href="/menu"
				class={$page.url.pathname === '/menu' || $lastActivePath === '/menu' ? 'active' : ''}
				onclick={() => lastActivePath.set('/menu')}>Menu</a
			>
		</div>

		<div class="nav-item-right">
			<button onclick={toggleDarkMode}>
				{#if darkMode2}☀️{:else}🌙{/if}
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
