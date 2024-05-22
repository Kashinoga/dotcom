<script>
	function toggleDarkMode() {
		let darkMode = document.documentElement.getAttribute('data-theme');

		if (darkMode == 'light') {
			document.documentElement.setAttribute('data-theme', 'dark');
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
		}
	}
</script>

<nav>
	<div class="nav-items">
		<a href="/">💖 Kashinoga</a>

		<button on:click={toggleDarkMode}>💡Mode</button>

		<a href="/menu">🍔 Menu</a>
	</div>
</nav>

<style>
	nav {
		margin-bottom: var(--margin);

		padding-bottom: var(--padding);

		border-bottom: var(--border);
	}

	@media (min-width: 900px) {
		nav {
			position: unset;
			max-width: var(--width-larger);

			background: none;

			margin-bottom: 0;

			padding-bottom: 0;

			border: 0;
			border-radius: 0;
			border-bottom: var(--border);
		}
	}

	.nav-items {
		display: flex;
		gap: var(--gap-small);
	}

	@media (min-width: 900px) {
		.nav-items {
			width: fit-content;
			padding: var(--padding);
			padding-top: 0;
			padding-left: 0;
			padding-right: 0;
			border: 0;
			border-radius: 0;
		}
	}

	nav a {
		background: none;
		background-color: var(--background-color-light);

		color: var(--text-color);

		border: var(--border);
		border-radius: var(--border-radius);

		padding-block: 0;
		padding-inline: 0;
		padding: var(--padding-small);

		text-decoration: none;
	}

	nav button {
		background: none;
		background-color: var(--background-color-light);

		color: var(--text-color);

		border: var(--border);
		border-radius: var(--border-radius);

		padding-block: 0;
		padding-inline: 0;
		padding: var(--padding-small);

		font-size: unset;
		font-weight: unset;
		text-decoration: none;
	}
</style>
