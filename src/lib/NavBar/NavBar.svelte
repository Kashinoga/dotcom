<script>
	import { page } from '$app/stores';
	import { writable } from 'svelte/store';

	function toggleDarkMode() {
		let darkMode = document.documentElement.getAttribute('data-theme');

		if (darkMode == 'light') {
			document.documentElement.setAttribute('data-theme', 'dark');
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
		}
	}

	export const lastActivePath = writable();
</script>

<nav>
	<div class="nav-items">
		<a
			href="/"
			class={$page.url.pathname === '/' || $lastActivePath === '/' ? 'active' : ''}
			onclick={() => lastActivePath.set('/')}>Kashinoga</a
		>

		<button onclick={toggleDarkMode}>Mode</button>

		<a
			href="/menu"
			class={$page.url.pathname === '/menu' || $lastActivePath === '/menu' ? 'active' : ''}
			onclick={() => lastActivePath.set('/menu')}>Menu</a
		>
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
