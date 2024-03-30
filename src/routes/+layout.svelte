<script>
	import '../app.css';

	import { onMount } from 'svelte';

	import NavBar from '$lib/NavBar/NavBar.svelte';
	import FloatingActionButton from '$lib/FloatingActionButton/FloatingActionButton.svelte';

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
<FloatingActionButton></FloatingActionButton>
<slot />
