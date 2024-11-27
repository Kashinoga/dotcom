<script>
	let isOpen = false;
</script>

<!-- Drawer -->
<div class="drawer" class:open={isOpen}>
	<div class="drawer-content">
		<!-- <button class="toggle-btn" on:click={() => (isOpen = !isOpen)}>
			{isOpen ? 'Close' : 'Open'}
		</button> -->
		<div class="title-bar">
			<div class="title">Backpack</div>
			<button class="toggle-btn" onclick={() => (isOpen = !isOpen)}>
				{isOpen ? 'Close' : 'Open'}
			</button>
		</div>
		<!-- <p>Backpack</p> -->
	</div>
</div>

<style>
	.title-bar {
		display: flex;
		align-content: start;
		padding-bottom: var(--padding);
		margin-bottom: var(--margin);
		border-bottom: var(--border-dotted);
	}

	.title-bar .title {
		flex-grow: 1;
		border-bottom: none;
		border-right: var(--border-dotted);
		margin-bottom: 0;
		margin-right: var(--margin);
	}

	/* Bottom Peeking Drawer Styles */
	.drawer {
		will-change: transform, opacity;
		background-color: var(--background-color-glass);
		backdrop-filter: var(--backdrop-filter-glass);
		position: fixed;
		bottom: 0;
		left: 0; /* Left margin */
		right: 0; /* Right margin */
		width: auto;
		overflow: hidden; /* Hide content when closed */
		z-index: 9001;
		display: flex;
		flex-direction: column;
		/* transform: translateY(-100%); */
		transition:
			height 0.2s linear var(--duration),
			transform var(--duration) var(--transform);
		height: 80px; /* Default height when closed */
		margin-left: var(--margin-small);
		margin-right: var(--margin-small);
		border: var(--border);
		border-bottom: none;
		border-top-left-radius: var(--border-radius);
		border-top-right-radius: var(--border-radius);
	}

	@media (min-width: 900px) {
		.drawer {
			width: 1080px;
			margin: auto;
		}
	}

	.drawer.open {
		height: calc(100vh - (64px + var(--margin)));
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
		/* position: absolute; */
		top: 0;
		right: 0;
		background-color: var(--blue);
		color: white;
		/* margin-top: var(--margin); */
		/* margin-right: var(--margin); */
		border: none;
		cursor: pointer;
		z-index: 9001; /* Ensure button stays on top of content */
	}

	.toggle-btn:hover {
		background-color: var(--blue-hover);
	}
</style>
