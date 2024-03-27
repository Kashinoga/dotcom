<script>
	import ThemeSwitcher from '$lib/ThemeSwitcher/ThemeSwitcher.svelte';
</script>

<nav>
	<div class="nav-items">
		<div class="nav-buttons">
			<button>
				<a href="/" data-sveltekit-replaceState>💖 Kashinoga</a>
			</button>
			<ThemeSwitcher></ThemeSwitcher>
			<button>
				<a href="/menu" data-sveltekit-replaceState>🍔 Menu</a>
			</button>
		</div>
	</div>
</nav>

<style>
	@media (min-width: 760px) {
		nav {
			max-width: var(--width-large);
			border-bottom: var(--border);
		}
	}

	.nav-items {
		width: auto;
		justify-content: center;
		padding: var(--padding-small);
		display: flex;
		border: var(--border);
		border-radius: var(--border-radius);
	}

	@media (min-width: 760px) {
		.nav-items {
			width: fit-content;
			padding: var(--padding);
			padding-top: 0;
			padding-left: 0;
			padding-right: 0;
			border: 0;
		}
	}

	nav button {
		font-size: medium;
	}
</style>
