<script>
	import '../app.css';
	import NavBar from '$lib/NavBar/NavBar.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		const preferredDarkMode = window.matchMedia('(prefers-color-scheme: dark)');

		if (preferredDarkMode.matches) {
			document.documentElement.setAttribute('data-theme', 'dark');
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
		}
	});
</script>

<NavBar></NavBar>

<slot />
