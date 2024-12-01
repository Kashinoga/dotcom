<script lang="ts">
	import { adventureLog, sessionLog } from './adventureLogStore';

	import { tick } from 'svelte';
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
		sessionLog.update((log) => [...log, { type: 'session', content: 'You begin gathering.' }]);
		await tick(); // Wait for DOM to update
		scrollToBottom();
		handleClick();
		await delay(1000);
		// addRandomGatherMessageToSessionLog();
		sessionLog.update((log) => [...log, { type: 'session', content: 'You found something.' }]);
		await tick(); // Wait for DOM to update
		scrollToBottom();
	}

	// Sort the items by name
	function sortItemsByName() {
		const items = [...get(backpack)].sort((a, b) => a.name.localeCompare(b.name)); // Sort by name alphabetically
		backpack.set(items); // Update the store
	}
</script>

<!-- Drawer -->
<div class="drawer-container" class:open={isOpen}>
	<div class="drawer-bar">
		<!-- <div class="title">Player's Name</div> -->
		<button class="drawer-button" onclick={() => (isOpen = !isOpen)}>
			<!-- {isOpen ? 'Close' : 'Open'} --> Player's Name
		</button>
	</div>

	<div class="drawer">
		<div class="location-container">
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

		<div class="actions-container">
			<div class="actions">
				<div class="title">Actions</div>
				<div class="actions-buttons">
					<button class="actions-button" onclick={handsAction} disabled={isDisabled}
						>{isDisabled ? 'Gathering...' : 'Gather'}
						<div class="loading-bar"></div></button
					>
					<button class="actions-button">Hunt</button>
				</div>
			</div>
		</div>

		<div class="equipment-container">
			<div class="equipment">
				<div class="title">Equipment</div>
				<div class="equipment-selects">
					<select class="equipment-select"
						><option disabled>Select a Left-Hand Item</option>
						<optgroup label="Starting Items">
							{#each $playerInventory as item}
								<option>
									{item.name}
								</option>
							{/each}
						</optgroup>
					</select>
					<select class="equipment-select"
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

		<div class="backpack-container">
			<div class="title">Backpack</div>
			<div class="backpack">
				<div class="backpack-buttons">
					<button onclick={sortItemsByName}>Sort by Name</button>
					{#each $backpack as item, index (item.id)}
						<button>
							{item.name} ({item.quantity})
						</button>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	/* Drawer */
	.drawer-bar {
		display: flex;
		margin: var(--margin-small);
		margin-bottom: 0;
		padding-bottom: var(--padding-small);
		border-bottom: var(--border-dotted);
	}

	.drawer-container {
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
		.drawer-container {
			/* width: calc(1060px + var(--margin-small)); */
			width: auto;
			max-width: 1058px;
			margin: auto;
		}
	}

	.drawer-container.open {
		/* height: calc(100vh - (0px + var(--margin-small))); */
		height: 50vh;
	}

	@media (min-width: 900px) {
		.drawer-container.open {
			/* height: calc(100vh - (64px + var(--margin))); */
			height: 50vh;
		}
	}

	.drawer {
		display: flex;
		flex-direction: column;
		flex-wrap: nowrap;
		gap: var(--gap-small);
		overflow: auto;
		margin-bottom: var(--margin-small);
	}

	@media (min-width: 900px) {
		.drawer {
			/* flex-direction: row;
			flex-wrap: wrap; */
		}
	}

	.drawer-container button {
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

	.drawer .title {
		padding-bottom: var(--padding-small);
	}

	/* Location */
	.location-container {
		display: flex;
		flex-grow: 1;
		margin-top: var(--margin-small);
		margin-left: var(--margin-small);
		margin-right: var(--margin-small);
	}

	.location {
		flex-grow: 1;
	}

	.location-select {
		margin-top: var(--margin-small);
	}

	/* Actions */
	.actions-container {
		display: flex;
		flex-grow: 1;
		gap: var(--gap-small);
		margin-left: var(--margin-small);
		margin-right: var(--margin-small);
	}

	.actions {
		flex-grow: 1;
	}

	@media (min-width: 900px) {
		.actions {
			flex-direction: row;
		}
	}

	.actions-buttons {
		display: flex;
		flex-direction: column;
		gap: var(--gap-small);
		margin-top: var(--margin-small);
	}

	@media (min-width: 900px) {
		.actions-buttons {
			flex-direction: row;
		}
	}

	.actions-button:disabled {
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

	.actions-button:disabled .loading-bar {
		width: 100%;
	}

	.actions-button:not(:disabled) .loading-bar {
		transition: none;
		width: 0;
	}

	/* Equipment */
	.equipment-container {
		display: flex;
		flex-grow: 1;
		flex-wrap: wrap;
		gap: var(--gap-small);
		margin-left: var(--margin-small);
		margin-right: var(--margin-small);
	}

	.equipment {
		/* flex-wrap: wrap; */
		flex-grow: 1;
		/* position: relative; */
		/* cursor: pointer; */
		/* overflow: hidden; */
	}

	.equipment-selects {
		display: flex;
		gap: var(--gap-small);
		margin-top: var(--margin-small);
	}

	/* Backpack */
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

	.backpack-container {
		display: flex;
		flex-direction: column;
		gap: var(--gap-small);
		margin-left: var(--margin-small);
		margin-right: var(--margin-small);
	}

	.backpack-buttons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-small);
		margin-top: var(--margin-small);
	}
</style>
