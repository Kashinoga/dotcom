<script lang="ts">
	import { page } from '$app/stores'; // Correct import for $page
	import { scrollToBottom, scrollToTop } from '$lib/utils';
	import { onMount } from 'svelte';

	let isAtBottom = false;
	let scrolling = false;

	// Determine if the user is at the bottom of the page
	function checkIfAtBottom() {
		const scrollTop = window.scrollY;
		const scrollHeight = document.documentElement.scrollHeight;
		const clientHeight = document.documentElement.clientHeight;

		// Check if we're near the bottom of the page (within a small buffer)
		isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
	}

	// Monitor scroll events
	onMount(() => {
		// Ensure the initial scroll position is checked when the page loads
		checkIfAtBottom();

		// Add event listener to detect scroll position
		window.addEventListener('scroll', handleScroll);

		// Recalculate the scroll position whenever the page changes
		const unsubscribe = page.subscribe(() => {
			checkIfAtBottom();
		});

		// Cleanup the event listener on component destroy
		return () => {
			window.removeEventListener('scroll', handleScroll);
			unsubscribe();
		};
	});

	// Handle scroll events
	function handleScroll() {
		if (!scrolling) checkIfAtBottom(); // Only check if not in the middle of scrolling
	}

	// Smoothly scroll and ensure state updates afterward
	async function handleFabClick() {
		scrolling = true;

		// Depending on whether we're at the bottom or not, scroll accordingly
		if (isAtBottom) {
			await performSmoothScroll(scrollToTop);
		} else {
			await performSmoothScroll(scrollToBottom);
		}

		scrolling = false;
		checkIfAtBottom(); // Re-check the scroll state after the scroll operation
	}

	// Perform smooth scrolling and resolve once the scrolling completes
	function performSmoothScroll(scrollFn: () => void): Promise<void> {
		return new Promise((resolve) => {
			scrollFn();
			const onStop = () => {
				// Scroll is complete when no further changes occur
				if (
					window.scrollY === 0 ||
					window.scrollY + window.innerHeight >= document.documentElement.scrollHeight
				) {
					window.removeEventListener('scroll', onStop);
					resolve();
				}
			};
			window.addEventListener('scroll', onStop);
		});
	}
</script>

<button class="fab" on:click={handleFabClick}>
	{#if isAtBottom}
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
