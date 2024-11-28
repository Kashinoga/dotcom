<script>
	import { playerInventory } from './playerInventoryStore';
	export let isOpen = false;
</script>

<!-- Drawer -->
<div class="drawer" class:open={isOpen}>
	<div class="title-bar">
		<!-- <div class="title">Player's Name</div> -->
		<button class="drawer-button" onclick={() => (isOpen = !isOpen)}>
			<!-- {isOpen ? 'Close' : 'Open'} --> Player's Name
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

	.drawer {
		will-change: transform, opacity;
		background-color: var(--background-color-glass);
		backdrop-filter: var(--backdrop-filter-glass);
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		width: auto;
		overflow: hidden;
		z-index: 9001;
		display: flex;
		flex-direction: column;
		transition:
			height 0.1s linear var(--duration),
			transform var(--duration) var(--transform);
		height: 44px;
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
		height: calc(100vh - (0px + var(--margin-small)));
	}

	.drawer-content {
		display: flex;
		flex-direction: row;
		gap: var(--gap-small);
		margin: var(--margin-small);
		overflow: hidden;
	}

	.drawer button {
		padding: var(--padding-small);
	}

	.drawer-button {
		top: 0;
		right: 0;
		background-color: var(--blue);
		border: none;
		cursor: pointer;
		width: 100%;
		z-index: 9001;
	}

	.drawer-button:hover {
		background-color: var(--blue-hover);
	}
</style>
