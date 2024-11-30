<script lang="ts">
	import { adventureLogs, sessionLogs } from './adventureLogStore';

	import { onDestroy, onMount, tick } from 'svelte';
	import { playerInventory } from './playerInventoryStore';
	import { get, type Writable } from 'svelte/store';
	import { backpack } from './backpackStore';

	let { isOpen = $bindable(), adventureLogContainer } = $props<{
		isOpen: boolean;
		adventureLogContainer: Writable<HTMLDivElement | null>;
	}>();

	function delay(ms: number | undefined) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	function scrollToBottom() {
		const container = get(adventureLogContainer); // Get the container

		// Use type guard to ensure it's an HTMLDivElement
		if (container instanceof HTMLDivElement) {
			container.scrollTop = container.scrollHeight; // Scroll to the bottom
		} else {
			console.warn('Container is not an HTMLDivElement:', container);
		}
	}

	function handleClick() {
		isDisabled = true; // Disable the button

		setTimeout(() => {
			isDisabled = false;
		}, 1000);
	}

	let isDisabled = $state(false);
	async function handsAction() {
		// addRandomMessageToSessionLog();
		sessionLogs.update((logs) => [...logs, { type: 'session', content: 'You begin gathering.' }]);
		await tick(); // Wait for DOM to update
		scrollToBottom();
		handleClick();
		await delay(1000);
		// addRandomGatherMessageToSessionLog();
		sessionLogs.update((logs) => [...logs, { type: 'session', content: 'You found something.' }]);
		await tick(); // Wait for DOM to update
		scrollToBottom();
	}

	let draggingIndex: number | null = null;

	// Handle the start of the drag (for mouse and touch)
	function handleDragStart(index: number, event: MouseEvent | TouchEvent) {
		draggingIndex = index;

		// Check for touch event
		if (event instanceof TouchEvent) {
			event.preventDefault(); // Prevents touch-specific behavior like scrolling
		}
	}

	// Handle the dragover event (required for drop to work)
	function handleDragOver(event: MouseEvent | TouchEvent) {
		event.preventDefault();
	}

	// Handle the drop event to swap items
	function handleDrop(index: number, event: MouseEvent | TouchEvent) {
		if (draggingIndex !== null && draggingIndex !== index) {
			const items = [...get(backpack)]; // Clone the array to maintain reactivity
			const draggedItem = items[draggingIndex];
			items.splice(draggingIndex, 1);
			items.splice(index, 0, draggedItem);
			backpack.set(items);
		}
	}

	// Reset draggingIndex after drop
	function handleDragEnd() {
		draggingIndex = null;
	}

	// Use onMount to ensure the DOM is available before accessing it
	onMount(() => {
		const backpackElement = document.getElementById('backpack');

		if (backpackElement) {
			const buttons = backpackElement.querySelectorAll('.backpack-item');

			buttons.forEach((button, index) => {
				// Attach mouse event listeners
				button.addEventListener('mousedown', (event) =>
					handleDragStart(index, event as MouseEvent)
				);
				button.addEventListener('mousemove', (event) => handleDragOver(event as MouseEvent));
				button.addEventListener('mouseup', handleDragEnd);

				// Attach touch event listeners
				button.addEventListener('touchstart', (event) =>
					handleDragStart(index, event as TouchEvent)
				);
				button.addEventListener('touchmove', (event) => handleDragOver(event as TouchEvent));
				button.addEventListener('touchend', handleDragEnd);
			});
		}

		// Cleanup listeners on component destroy
		onDestroy(() => {
			if (backpackElement) {
				const buttons = backpackElement.querySelectorAll('.backpack-item');

				buttons.forEach((button, index) => {
					button.removeEventListener('mousedown', (event) =>
						handleDragStart(index, event as MouseEvent)
					);
					button.removeEventListener('mousemove', (event) => handleDragOver(event as MouseEvent));
					button.removeEventListener('mouseup', handleDragEnd);

					button.removeEventListener('touchstart', (event) =>
						handleDragStart(index, event as TouchEvent)
					);
					button.removeEventListener('touchmove', (event) => handleDragOver(event as TouchEvent));
					button.removeEventListener('touchend', handleDragEnd);
				});
			}
		});
	});

	// Sort the items by name
	function sortItemsByName() {
		const items = [...get(backpack)].sort((a, b) => a.name.localeCompare(b.name)); // Sort by name alphabetically
		backpack.set(items); // Update the store
	}
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
		<div class="locations">
			<div class="location">
				<div class="title">Location</div>
				<div class="location-select">
					<select>
						<option disabled>Select a Location</option>
						<option>Basecamp</option></select
					>
				</div>
			</div>
		</div>

		<div class="equipment">
			<div class="equip">
				<div class="title">Equipment</div>
				<div class="equip-actions">
					<div class="actions">
						<button class="action" onclick={handsAction} disabled={isDisabled}
							>{isDisabled ? 'Gathering...' : 'Gather'}
							<div class="loading-bar"></div></button
						>
						<button class="action">Hunt</button>
					</div>
					<div class="items">
						<div class="item">
							<select
								><option disabled>Select a Left-Hand Item</option>
								<optgroup label="Starting Items">
									{#each $playerInventory as item}
										<option>
											{item.name}
										</option>
									{/each}
								</optgroup>
							</select>
						</div>
						<div class="item">
							<select
								><option disabled>Select a Right-Hand Item</option>
								<optgroup label="Starting Items">
									{#each $playerInventory as item}
										<option>
											{item.name}
										</option>
									{/each}
								</optgroup>
							</select>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="backpack" id="backpack">
			<div class="title">Backpack</div>
			<div class="backpack-items">
				<button onclick={sortItemsByName}>Sort by Name</button>
				{#each $backpack as item, index (item.id)}
					<button class="backpack-item">
						{item.name} ({item.quantity})
					</button>
				{/each}
			</div>
		</div>
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

	.drawer {
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
			width: calc(1060px + var(--margin));
			margin: auto;
		}
	}

	.drawer.open {
		/* height: calc(100vh - (0px + var(--margin-small))); */
		height: 50vh;
	}

	@media (min-width: 900px) {
		.drawer.open {
			/* height: calc(100vh - (64px + var(--margin))); */
			height: 50vh;
		}
	}

	.drawer-content {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--gap-small);
		overflow: auto;
	}

	@media (min-width: 900px) {
		.drawer-content {
			flex-direction: column;
			flex-wrap: nowrap;
		}
	}

	.drawer button {
		padding: var(--padding-small);
	}

	.drawer-button {
		background-color: var(--blue);
		border: none;
		cursor: pointer;
		width: 100%;
		z-index: 9001;
	}

	.drawer-button:hover {
		background-color: var(--blue-hover);
	}

	.locations {
		display: flex;
		flex-grow: 1;
		padding: var(--padding);
	}

	.location {
		flex-grow: 1;
	}

	.location-select {
		margin-top: var(--margin);
	}

	.equipment {
		display: flex;
		flex-grow: 1;
		gap: var(--gap-small);
		padding: var(--padding);
	}

	.equip {
		display: flex;
		flex-grow: 1;
		flex-direction: column;
	}

	.equip-actions {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		margin-top: var(--margin);
	}

	@media (min-width: 900px) {
		.equip-actions {
			flex-direction: row;
		}
	}

	.actions {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-wrap: wrap;
		gap: var(--gap-small);
	}

	@media (min-width: 900px) {
		.actions {
			flex-direction: row;
			border-right: var(--border-dotted);
		}
	}

	.action {
		position: relative;
		cursor: pointer;
		overflow: hidden;
	}

	@media (min-width: 900px) {
		.action {
			width: 8em;
		}
	}

	.action:disabled {
		cursor: not-allowed;
		background-color: var(--blue-hover);
	}

	.loading-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		height: 4px;
		background: var(--green);
		width: 0;
		transition: width 1s cubic-bezier(0.785, 0.135, 0.15, 0.86);
	}

	.action:disabled .loading-bar {
		width: 100%;
	}

	.action:not(:disabled) .loading-bar {
		transition: none;
		width: 0;
	}

	.items {
		display: flex;
		flex-direction: column;
		gap: var(--gap-small);
	}

	@media (min-width: 900px) {
		.items {
			flex-direction: row;
		}
	}

	.backpack {
		display: flex;
		flex-direction: column;
		gap: var(--gap-small);
		padding: var(--padding);
	}

	.backpack-items {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-small);
		margin-top: var(--margin);
	}
</style>
