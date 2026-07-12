<script lang="ts">
	import '@kashinoga/puhig/tokens.css';

	let { children } = $props();
	// The favicon is NOT declared here any more. It changes with the open panel — the Air Traffic
	// board and the Presentation Builder each fly their own mark in the tab — and only the page
	// knows which panel that is: a panel opens by pushState, so the layout can't read it off the
	// URL. Emitting a second <link rel="icon"> here would just race the page's. See the
	// <svelte:head> in [...view=view]/+page.svelte, which owns the site heart too.
</script>

{@render children()}
