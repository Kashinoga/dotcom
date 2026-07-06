<script lang="ts">
	import { dev } from '$app/environment';
	import '@kashinoga/puhig/tokens.css';
	import favicon from '$lib/assets/favicon.svg';
	import faviconDev from '$lib/assets/favicon-dev.svg';

	let { children } = $props();
	// Orange heart while developing so the dev tab is easy to spot; the black/white
	// theme-aware heart ships in production.
	const icon = dev ? faviconDev : favicon;
</script>

<svelte:head>
	<link rel="icon" href={icon} type="image/svg+xml" />
</svelte:head>

{@render children()}
