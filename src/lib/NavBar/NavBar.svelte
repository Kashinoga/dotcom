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
		<button>
			<a href="/" data-sveltekit-replaceState>💖 Kashinoga</a>
		</button>
		<button on:click={toggleDarkMode}>💡Mode</button>
		<button>
			<a href="/menu" data-sveltekit-replaceState>🍔 Menu</a>
		</button>
	</div>
</nav>

<style>
	nav a {
		font-family: var(--font-family);
	}

	nav {
		margin-bottom: var(--margin);

		padding-bottom: var(--padding);

		border-bottom: var(--border);
	}

	@media (min-width: 900px) {
		nav {
			position: unset;
			max-width: var(--width-large);

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

	.nav-items button {
		background-color: var(--background-color-light);

		padding: var(--padding-small);

		border: var(--border);
		border-radius: var(--border-radius);

		font-size: small;
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

	nav button {
		font-size: medium;
	}
</style>
