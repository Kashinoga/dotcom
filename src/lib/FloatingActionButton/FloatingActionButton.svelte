<script lang="ts">
	import { scrollToTop, scrollToBottom } from '$lib/utils';
	import { onMount } from 'svelte';

	let isAtBottom = false;
	let scrolling = false;

	// Determine if the user is at the bottom of the page
	function checkIfAtBottom() {
		const scrollTop = window.scrollY;
		const scrollHeight = document.documentElement.scrollHeight;
		const clientHeight = document.documentElement.clientHeight;

		isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
	}

	// Monitor scroll events
	onMount(() => {
		window.addEventListener('scroll', handleScroll);
		checkIfAtBottom(); // Initialize state
		return () => window.removeEventListener('scroll', handleScroll);
	});

	function handleScroll() {
		if (!scrolling) checkIfAtBottom();
	}

	// Smoothly scroll and ensure state updates afterward
	async function handleFabClick() {
		scrolling = true;

		if (isAtBottom) {
			await performSmoothScroll(scrollToTop);
		} else {
			await performSmoothScroll(scrollToBottom);
		}

		scrolling = false;
		checkIfAtBottom();
	}

	// Scroll smoothly and resolve once the animation completes
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
