<script>
	import { onMount } from 'svelte';

	export let open = false;
	export let selectedItem = ''; // Prop for the selected item's name

	let isSmallScreen = false;

	onMount(() => {
		const checkSize = () => (isSmallScreen = window.innerWidth < 768);
		checkSize();
		window.addEventListener('resize', checkSize);
		return () => window.removeEventListener('resize', checkSize);
	});
</script>

<!-- Use a slot for parent content -->
<!-- <div class="{isSmallScreen ? 'drawer' : 'modal'} {open ? 'show' : ''}">
	<slot />
</div> -->

<div class="{isSmallScreen ? 'drawer' : 'modal'} {open ? 'show' : ''}">
	<slot></slot>
</div>

<style>
	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--color-background);
		padding: var(--padding);
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
		z-index: 1000;
		display: none;
		transition: transform 1s ease-in-out;
		border: var(--border);
		border-radius: var(--border-radius);
	}

	.modal.show {
		display: block;
		transition: transform 1s ease-in-out;
	}

	.drawer {
		position: fixed;
		bottom: 0;
		background: var(--color-background);
		padding: 1rem;
		box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.2);
		transform: translateY(100%);
		z-index: 9001;
		transition: transform 0.3s ease-in-out;
		border-top-left-radius: var(--border-radius);
		border-top-right-radius: var(--border-radius);
	}

	.drawer.show {
		transform: translateY(0);
	}
</style>
