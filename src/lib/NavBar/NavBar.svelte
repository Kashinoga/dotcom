<script>
	import ThemeSwitcher from '$lib/ThemeSwitcher/ThemeSwitcher.svelte';
</script>

<nav>
	<div class="nav-hero">
		<button>
			<a href="/" data-sveltekit-replaceState>💖 Kashinoga</a>
		</button>
	</div>

	<div class="nav-buttons">
		<ThemeSwitcher></ThemeSwitcher>
		<button>
			<a href="/menu" data-sveltekit-replaceState>🍔 Menu</a>
		</button>
	</div>
</nav>
