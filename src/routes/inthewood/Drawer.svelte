<script lang="ts">
	import { adventureLogs, sessionLogs } from './adventureLogStore';

	import { tick } from 'svelte';
	import { playerInventory } from './playerInventoryStore';
	import {
		addRandomGatherMessageToSessionLog,
		addRandomMessageToSessionLog
	} from './sessionLogStore';

	let { isOpen = $bindable() } = $props();

	function delay(ms: number | undefined) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	let container: HTMLDivElement;
	function scrollToBottom() {
		if (container) {
			container.scrollTop = container.scrollHeight;
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
		adventureLogs.update((logs) => [
			...logs,
			{ type: 'adventure', content: 'Discovered a secret passage!' }
		]);
		await tick(); // Wait for DOM to update
		scrollToBottom();
		handleClick();
		await delay(1000);
		// addRandomGatherMessageToSessionLog();
		await tick(); // Wait for DOM to update
		scrollToBottom();
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
		<div class="equipment">
			<div class="equip">
				<div class="title">Hands</div>
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

		<div class="backpack">
			<div class="title">Backpack</div>
			<div class="backpack-items">
				{#each $playerInventory as item}
					<button>
						{item.name}
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
		overflow: hidden;
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
		position: relative; /* Allows positioning of child elements */
		cursor: pointer;
		overflow: hidden; /* Ensures the loading bar stays inside the button */
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
		flex-grow: 1;
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
