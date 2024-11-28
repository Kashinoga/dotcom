<script>
	import { playerInventory } from './playerInventoryStore';
	let isOpen = false;
</script>

<!-- Drawer -->
<div class="drawer" class:open={isOpen}>
	<div class="title-bar">
		<div class="title">Player's Name</div>
		<button class="toggle-btn" onclick={() => (isOpen = !isOpen)}>
			{isOpen ? 'Close' : 'Open'}
		</button>
	</div>
	<div class="drawer-content">
		{#each $playerInventory as item}
			<button>
				{item.name}
			</button>
		{/each}
	</div>
</div>

<style>
	.title-bar {
		display: flex;
		margin: var(--margin-small);
		margin-bottom: 0;
		padding-bottom: var(--padding-small);
		border-bottom: var(--border-dotted);
	}

	.title-bar .title {
		display: flex;
		flex-grow: 1;
		justify-content: center;
		align-items: center;
		border-bottom: none;
		border-right: var(--border-dotted);
		padding-bottom: 0;
		margin-bottom: 0;
		margin-right: var(--margin-small);
	}

	.title h2 {
		padding: 0;
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
		display: flex;
		flex-direction: row;
		gap: var(--gap-small);
		/* height: 100%; */
		margin: var(--margin-small);
		overflow: hidden; /* Prevent content overflow */
		/* border-top: var(--border-dotted); */
	}

	.drawer button {
		padding: var(--padding-small);
	}

	/* Toggle Button Inside Drawer */
	.toggle-btn {
		/* position: absolute; */
		top: 0;
		right: 0;
		background-color: var(--blue);
		/* margin-top: var(--margin); */
		/* margin-right: var(--margin); */
		border: none;
		cursor: pointer;
		width: 10em;
		z-index: 9001; /* Ensure button stays on top of content */
	}

	.toggle-btn:hover {
		background-color: var(--blue-hover);
	}
</style>
