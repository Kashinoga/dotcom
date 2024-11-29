<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { inTheWood } from './inTheWoodStore';
	import { adventureLog } from './adventureLogStore';
	import {
		addRandomGatherMessageToSessionLog,
		addRandomMessageToSessionLog,
		sessionLog
	} from './sessionLogStore';
	import { playerInventory } from './playerInventoryStore';
	import Modal from './Modal.svelte';
	import type { Backpack } from './BackpackInterface';
	import { writable } from 'svelte/store';
	import Drawer from './Drawer.svelte';

	let showModal = $state(false);
	let isOpen = $state(false);

	const selectedItem = writable<Backpack | null>(null);

	let icon = $inTheWood[0];
	let title = $inTheWood[1];

	let isDisabled = $state(false);
	function handleClick() {
		isDisabled = true; // Disable the button

		setTimeout(() => {
			isDisabled = false;
		}, 1000);
	}

	async function handsAction() {
		addRandomMessageToSessionLog();
		await tick(); // Wait for DOM to update
		scrollToBottom();
		handleClick();
		await delay(1000);
		addRandomGatherMessageToSessionLog();
		await tick(); // Wait for DOM to update
		scrollToBottom();
	}

	/**
	 * @type {HTMLDivElement}
	 */
	let container: HTMLDivElement;

	function scrollToBottom() {
		if (container) {
			container.scrollTop = container.scrollHeight;
		}
	}

	onMount(() => {
		scrollToBottom();
	});

	/**
	 * @param {number | undefined} ms
	 */
	function delay(ms: number | undefined) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	// Add or remove the no-scroll class when modal state changes
	$effect(() => {
		console.log(isOpen);
		if (showModal || isOpen) {
			document.body.classList.add('no-scroll');
		} else {
			document.body.classList.remove('no-scroll');
		}

		// Cleanup to ensure the class is removed
		return () => {
			document.body.classList.remove('no-scroll');
		};
	});
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section section-100">
				<div class="hero">
					<div class="hero-title">
						<h1>{icon.content} {title.content}</h1>
					</div>
					<div class="hero-version">v.0.2-a</div>
				</div>
			</div>

			<div class="section section-100">
				<div class="logs">
					<div class="log log-adventure">
						<div class="title">Adventure Log</div>

						<div class="log-messages">
							{#each $adventureLog as adventureLogMessage}
								<div class="log-adventure-message">
									<span>{adventureLogMessage.message}</span>
								</div>
							{/each}
						</div>
					</div>

					<div class="log log-session">
						<div class="title">Session Log</div>
						<div class="log-messages" bind:this={container}>
							{#each $sessionLog as sessionLogMessage}
								<div class="log-session-message">
									<span>{sessionLogMessage.message}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<div class="section section-100">
				<div class="location">
					<div class="title">Location</div>
					<select>
						<option disabled>Select a Location</option>
						<option>Basecamp</option></select
					>
				</div>
			</div>
		</div>
	</div>
</div>

<Drawer bind:isOpen></Drawer>

<Modal bind:open={showModal}>
	<div class="modal">
		<div class="modal-items">
			<div class="modal-title">Backpack</div>
			{#if $selectedItem}
				<p>Name: {$selectedItem.name}</p>
				<p>Quantity: {$selectedItem.quantity}</p>
			{:else}
				<p>No item selected</p>
			{/if}
			<p>This modal changes into a drawer on small screens.</p>
			<div class="backpack-items">
				{#each $playerInventory as item}
					<button
						class="backpack-item"
						onclick={() => {
							selectedItem.set(item);
							showModal = true;
						}}
					>
						{item.name}
					</button>
				{/each}
			</div>
		</div>
		<div class="modal-button"><button onclick={() => (showModal = false)}>Close</button></div>
	</div>
</Modal>

<style>
	.container {
		margin-bottom: 45px;
	}

	.modal {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		height: 100%;
	}

	.modal-button {
		display: flex;
		flex-direction: column;
	}

	.modal-items {
		flex-grow: 1;
	}

	.modal-title {
		margin-top: 0;
		padding-bottom: var(--padding);
		border-bottom: var(--border-dotted);
		font-weight: bold;
	}

	.content {
		max-width: unset;

		padding-bottom: unset;
		padding-right: unset;

		border-right: none;
	}

	.sections {
		display: flex;
		flex-direction: row;
	}

	.section {
		flex-grow: 1;
	}

	.section-100 {
		flex-basis: 100%;
	}

	.hero {
		display: flex;
		align-items: center;
	}

	.hero-title {
		flex-grow: 1;
		border-right: var(--border-dotted);
		margin-right: var(--margin);
	}

	.hero-version {
		text-align: center;
	}

	.logs {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-wrap: wrap;
		gap: var(--gap);
	}

	@media (min-width: 900px) {
		.logs {
			flex-direction: row;
		}
	}

	.title {
		margin-bottom: var(--margin);
	}

	.log {
		display: flex;
		flex-direction: column;
		flex: 1;
		padding: var(--padding);
		border: var(--border);
		border-radius: var(--border-radius);
		background-color: var(--background-color-glass);
		backdrop-filter: var(--backdrop-filter-glass);
	}

	.log-messages {
		background-color: var(--background);
		align-content: end;
		flex-grow: 1;
		height: 10em;
		overflow-y: auto;
	}

	.backpack-items {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-small);
	}

	.location {
		border-top: var(--border);
		padding: var(--padding);
		border: var(--border);
		border-radius: var(--border-radius);
		background-color: var(--background-color-glass);
		backdrop-filter: var(--backdrop-filter-glass);
	}
</style>
