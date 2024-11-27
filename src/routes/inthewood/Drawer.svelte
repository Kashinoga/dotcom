<script>
	let isOpen = false;
</script>

<!-- Drawer -->
<div class="drawer" class:open={isOpen}>
	<div class="drawer-content">
		<button class="toggle-btn" on:click={() => (isOpen = !isOpen)}>
			{isOpen ? 'Close' : 'Open'}
		</button>
		<p>Drawer Content</p>
	</div>
</div>

<style>
	/* Bottom Peeking Drawer Styles */
	.drawer {
		will-change: transform, opacity;
		background-color: var(--background-color-glass);
		backdrop-filter: var(--backdrop-filter-glass);
		position: fixed;
		bottom: 0;
		left: 0; /* Left margin */
		right: 0; /* Right margin */
		width: 1080px;
		overflow: hidden; /* Hide content when closed */
		z-index: 9001;
		display: flex;
		flex-direction: column;
		/* transform: translateY(-100%); */
		transition:
			height 0.2s linear var(--duration),
			transform var(--duration) var(--transform);
		height: 80px; /* Default height when closed */
		margin: auto;
		border: var(--border);
		border-top-left-radius: var(--border-radius);
		border-top-right-radius: var(--border-radius);
	}

	.drawer.open {
		height: calc(100vh - 80px);
	}

	/* Drawer Content Styling */
	.drawer-content {
		/* background-color: var(--color-background); */
		height: 100%;
		padding: var(--padding);
		overflow: hidden; /* Prevent content overflow */
	}

	/* Toggle Button Inside Drawer */
	.toggle-btn {
		position: absolute;
		top: 0;
		right: 0;
		background-color: var(--blue);
		color: white;
		margin-top: var(--margin);
		margin-right: var(--margin);
		border: none;
		cursor: pointer;
		z-index: 9001; /* Ensure button stays on top of content */
	}

	.toggle-btn:hover {
		background-color: #ff4040;
	}
</style>
