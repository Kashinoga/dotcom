<script lang="ts">
	import { page } from '$app/stores'; // Correct import for $page
	import { scrollToBottom, scrollToTop } from '$lib/utils';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';

	let isAtBottom = writable(false);
	let scrolling = false;

	// Function to update the scroll state
	export function updateScrollState() {
		const scrollTop = window.scrollY;
		const scrollHeight = document.documentElement.scrollHeight;
		const clientHeight = document.documentElement.clientHeight;

		isAtBottom.set(scrollTop + clientHeight >= scrollHeight - 10);
	}

	// Subscribe to the store
	let isAtBottomValue: boolean;
	const unsubscribe = isAtBottom.subscribe((value) => {
		isAtBottomValue = value;
	});

	// Add event listeners for scroll and resize events
	onMount(() => {
		window.addEventListener('scroll', updateScrollState);
		window.addEventListener('resize', updateScrollState);

		// Cleanup on component destroy
		return () => {
			window.removeEventListener('scroll', updateScrollState);
			window.removeEventListener('resize', updateScrollState);
			unsubscribe(); // Unsubscribe when the component is destroyed
		};
	});

	function handleClick() {
		// Action based on the current scroll state
		if (isAtBottomValue) {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} else {
			window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
		}
	}
</script>

<button class="fab" on:click={handleClick}>
	{#if isAtBottomValue}
		⬆️
	{:else}
		⬇️
	{/if}
</button>

<style>
	.fab {
		/* Positioning */
		position: fixed;
		bottom: var(--margin);
		right: var(--margin);
		z-index: 9001;

		/* Box Model */
		padding: var(--padding-small);
		border: var(--border);
		border-radius: 2em;

		/* Aesthetic Styles */
		background-color: color-mix(in srgb, var(--background-color-light) 2%, transparent);
		backdrop-filter: blur(0.2em);

		/* Typography */
		font-size: x-large;

		/* User Interaction */
		cursor: pointer;
	}
</style>
