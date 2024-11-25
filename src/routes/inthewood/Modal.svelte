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

<div class="drawer-container">
	<div class="{isSmallScreen ? 'drawer' : 'modal'} {open ? 'show' : 'hide'}" aria-hidden={!open}>
		<slot></slot>
	</div>
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
		background: var(--color-background);
		padding: var(--padding);
		z-index: 1000;
		display: none;
		transform: translate(-50%, -40%);
		transition:
			visibility 0s linear 0.4s,
			transform 0.4s var(--transform);
	}

	.modal.show {
		visibility: visible;
		display: block;
		transform: translate(-50%, -50%);
		opacity: 1;
		transition:
			visibility 0s linear 0s,
			transform 0.4s var(--transform),
			opacity 0.4s ease-in-out;
	}

	.modal.hide {
		visibility: hidden;
		display: block;
		transform: translate(-50%, -40%);
		opacity: 0;
		transition:
			visibility 0.4s linear 0.4s,
			transform 0.4s var(--transform),
			opacity 0.2s ease-in-out;
	}

	/* Drawer styles */
	.drawer-container {
		position: relative;
		overflow: hidden;
	}

	.drawer {
		visibility: hidden;
		border: var(--border);
		border-bottom: 0;
		border-top-left-radius: var(--border-radius);
		border-top-right-radius: var(--border-radius);
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--color-background);
		margin: var(--margin-small);
		margin-bottom: 0;
		padding: var(--padding);
		z-index: 9001;
		transform: translateY(100%);
		transition:
			visibility 0s linear 0.4s,
			transform 0.4s var(--transform);
	}

	.drawer.show {
		visibility: visible;
		transform: translateY(0);
		transition:
			visibility 0s linear 0s,
			transform 0.4s var(--transform);
	}

	.drawer.hide {
		visibility: hidden;
		border-top: none;
		transform: translateY(100%);
		transition:
			visibility 0s linear 0.4s,
			transform 0.4s var(--transform);
	}
</style>
