<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import NavBar from '$lib/NavBar/NavBar.svelte';
	import FloatingActionButton from '$lib/FloatingActionButton/FloatingActionButton.svelte';

	/** @type {{children?: import('svelte').Snippet}} */
	let { children } = $props();

	onMount(() => {
		const preferredDarkMode = window.matchMedia('(prefers-color-scheme: dark)');

		if (preferredDarkMode.matches) {
			document.documentElement.setAttribute('data-theme', 'dark');
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
		}
	});
</script>

<svelte:head>
	<title>Kashinoga</title>
</svelte:head>

<NavBar></NavBar>
<FloatingActionButton></FloatingActionButton>
{@render children?.()}
