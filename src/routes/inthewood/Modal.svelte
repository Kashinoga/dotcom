<script>
	import { onMount } from 'svelte';

	export let open = false;
	export const selectedItem = ''; // Prop for the selected item's name

	let isSmallScreen = false;

	onMount(() => {
		const checkSize = () => (isSmallScreen = window.innerWidth < 900);
		checkSize();
		window.addEventListener('resize', checkSize);
		return () => window.removeEventListener('resize', checkSize);
	});
</script>

<div class="{isSmallScreen ? 'drawer' : 'modal'} {open ? 'show' : 'hide'}">
	<slot></slot>
</div>

<style>
	/* Modal styles */
	.modal {
		visibility: hidden;
		border: var(--border);
		border-radius: var(--border-radius);
		position: fixed;
		top: 50%;
		left: 50%;
		padding: var(--padding);
		z-index: 9001;
		display: none;
		transform: translate(-50%, -40%);
		transition:
			visibility 0s linear var(--duration),
			transform var(--duration) var(--transform);
	}

	.modal.show {
		will-change: transform, opacity;
		background-color: var(--background-color-glass);
		backdrop-filter: var(--backdrop-filter-glass);
		visibility: visible;
		display: block;
		transform: translate(-50%, -50%);
		opacity: 1;
		transition:
			visibility 0s linear 0s,
			transform var(--duration) var(--transform),
			opacity var(--duration) ease-in-out;
	}

	.modal.hide {
		visibility: hidden;
		display: block;
		transform: translate(-50%, -40%);
		opacity: 0;
		transition:
			visibility var(--duration) linear var(--duration),
			transform var(--duration) var(--transform),
			opacity var(--duration) ease-in-out;
	}

	/* Drawer styles */
	.drawer {
		visibility: hidden;
		border: var(--border);
		border-bottom: 0;
		border-top-left-radius: var(--border-radius);
		border-top-right-radius: var(--border-radius);
		position: fixed;
		top: 0;
		bottom: 0;
		left: 0;
		right: 0;
		margin: var(--margin-small);
		margin-bottom: 0;
		padding: var(--padding);
		z-index: 9001;
		transform: translateY(100%);
		transition:
			visibility 0s linear var(--duration),
			transform var(--duration) var(--transform);
	}

	.drawer.show {
		background-color: var(--background-color-glass);
		backdrop-filter: var(--backdrop-filter-glass);
		visibility: visible;
		transform: translateY(0);
		transition:
			visibility 0s linear 0s,
			transform var(--duration) var(--transform);
	}

	.drawer.hide {
		visibility: hidden;
		border-top: none;
		transform: translateY(100%);
		transition:
			visibility 0s linear var(--duration),
			transform var(--duration) var(--transform);
	}
</style>
