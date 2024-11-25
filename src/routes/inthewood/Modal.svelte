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
	/* Keyframes */
	@keyframes slideInModal {
		0% {
			transform: translate(-50%, -40%);
			opacity: 0;
		}
		100% {
			transform: translate(-50%, -50%);
			opacity: 1;
		}
	}

	@keyframes slideOutModal {
		0% {
			transform: translate(-50%, -50%);
			opacity: 1;
		}
		100% {
			transform: translate(-50%, -40%);
			opacity: 0;
		}
	}

	@keyframes slideInDrawer {
		0% {
			transform: translateY(100%);
		}
		100% {
			transform: translateY(0);
		}
	}

	@keyframes slideOutDrawer {
		0% {
			transform: translateY(0);
		}
		100% {
			transform: translateY(100%);
		}
	}

	/* Modal styles */
	.modal {
		border: var(--border-dotted);
		border-radius: var(--border-radius);
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--color-background);
		padding: var(--padding);
		z-index: 1000;
		display: none;
		opacity: 0;
		transition: transform 1s var(--transition);
	}

	.modal.show {
		display: block;
		animation: slideInModal 0.2s var(--animation) forwards;
	}

	.modal.hide {
		display: block; /* Ensure it's visible during animation */
		animation: slideOutModal 0.2s var(--animation) forwards;
	}

	/* Drawer styles */
	.drawer-container {
		position: relative; /* Needed for overflow to work */
		overflow: hidden; /* Hides any child overflow (e.g., shadow) */
	}

	.drawer {
		border: var(--border-dotted);
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
		transform: translateY(100%);
		z-index: 9001;
		transition: transform 1s var(--transition);
	}

	.drawer.show {
		transform: translateY(0);
		animation: slideInDrawer 0.4s var(--animation);
	}

	.drawer.hide {
		border-top: none;
		transform: translateY(100%);
		animation: slideOutDrawer 0.4s var(--animation);
	}
</style>
