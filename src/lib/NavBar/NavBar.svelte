<script>
	import ThemeSwitcher from '$lib/ThemeSwitcher/ThemeSwitcher.svelte';
</script>

<nav>
	<div class="nav-items">
		<button>
			<a href="/" data-sveltekit-replaceState>💖 Kashinoga</a>
		</button>
		<ThemeSwitcher></ThemeSwitcher>
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
		/* position: sticky; */
		/* top: var(--margin); */
		background-color: var(--background-color);
	}

	@media (min-width: 900px) {
		nav {
			position: unset;
			max-width: var(--width-large);
			border: 0;
			border-radius: 0;
			border-bottom: var(--border);
		}
	}

	.nav-items {
		justify-content: space-evenly;
		padding: var(--padding-small);
		display: flex;
		gap: var(--gap-small);
		border: var(--border);
		border-radius: var(--border-radius);
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
