<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import NavBar from '$lib/NavBar/NavBar.svelte';
	import FloatingActionButton from '$lib/FloatingActionButton/FloatingActionButton.svelte';

	/** @type {{children?: import('svelte').Snippet}} */
	let { children } = $props();

	// onMount(() => {
	// 	const preferredDarkMode = window.matchMedia('(prefers-color-scheme: dark)');

	// 	if (preferredDarkMode.matches) {
	// 		document.documentElement.setAttribute('data-theme', 'dark');
	// 	} else {
	// 		document.documentElement.setAttribute('data-theme', 'light');
	// 	}
	// });
</script>

<svelte:head>
	<script>
		(function () {
			const preferredDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
			document.documentElement.setAttribute('data-theme', preferredDarkMode ? 'dark' : 'light');
		})();
	</script>

	<title>Kashinoga</title>
</svelte:head>

<NavBar></NavBar>
<FloatingActionButton></FloatingActionButton>
{@render children?.()}

<footer class="footer"></footer>

<style>
	.footer {
		height: var(--height-nav); /* Assuming you have a CSS variable for the nav height */
		background-color: var(--color-background);
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
