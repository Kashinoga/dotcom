<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import NavBar from '$lib/NavBar/NavBar.svelte';
	import FloatingActionButton from '$lib/FloatingActionButton/FloatingActionButton.svelte';
	import { page } from '$app/stores';
	import { derived } from 'svelte/store';

	/** @type {{children?: import('svelte').Snippet}} */
	let { children } = $props();

	export const isInTheWoodPage = derived(page, ($page) => $page.url.pathname === '/inthewood');
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

{#if !isInTheWoodPage}
	<FloatingActionButton />
{/if}

{@render children?.()}
