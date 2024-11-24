<script>
	import { onMount, tick } from 'svelte';
	import { inTheWood } from './inTheWoodStore';
	import { adventureLog } from './adventureLogStore';
	import {
		addRandomGatherMessageToSessionLog,
		addRandomMessageToSessionLog,
		sessionLog
	} from './sessionLogStore';
	import { playerInventory } from './playerInventoryStore';
	import { backpack } from './backpackStore';
	import Modal from './Modal.svelte';

	let showModal = false;

	// Toggle modal visibility
	const toggleModal = () => {
		showModal = !showModal; // Toggle state on each click
	};

	let icon = $inTheWood[0];
	let title = $inTheWood[1];

	let isDisabled = false;

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
	let container;

	function scrollToBottom() {
		if (container) {
			container.scrollTop = container.scrollHeight;
		}
	}

	onMount(() => {
		scrollToBottom();
	});

	// React to updates in $sessionLog
	$: {
		scrollToBottom(); // Ensure scrolling when $sessionLog changes
	}

	/**
	 * @param {number | undefined} ms
	 */
	function delay(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
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
				<div class="equipment">
					<div class="equip">
						<div class="title">Hands</div>
						<div class="equip-actions">
							<div class="actions">
								<button class="action" on:click={handsAction} disabled={isDisabled}
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
			</div>

			<div class="section section-100">
				<div class="backpack">
					<div class="title">Backpack</div>
					<div class="backpack-items">
						{#each $playerInventory as item}
							<button class="backpack-item">
								{item.name}
							</button>
						{/each}
						<button on:click={toggleModal}>Open Modal</button>
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

			<Modal show={showModal} title="My Modal" content="This is the modal content!" />
		</div>
	</div>
</div>

<style>
	.content {
		max-width: unset;

		padding-bottom: unset;
		padding-right: unset;

		border-right: none;
	}

	.sections {
		display: flex;
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
		flex-grow: 1;
		align-content: start;

		font-weight: bold;

		/* border-bottom: var(--border-dotted); */

		padding-bottom: var(--padding);

		margin-bottom: var(--margin);
	}

	.log {
		display: flex;
		flex-direction: column;
		flex: 1;
		padding: var(--padding);
		border: var(--border-dotted);
		border-radius: var(--border-radius);
	}

	.log-messages {
		background-color: var(--background);
		align-content: end;
		flex-grow: 1;
		height: 10em;
		overflow-y: auto;
	}

	.equipment {
		display: flex;
		gap: var(--gap-small);
		border-top: var(--border);
		padding: var(--padding);
		border: var(--border-dotted);
		border-radius: var(--border-radius);
	}

	.equip {
		display: flex;
		flex-grow: 1;
		flex-direction: column;
	}

	.equip-actions {
		display: flex;
		flex-direction: column;
		gap: var(--gap-small);
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

			padding-right: var(--padding);
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
		transition: none; /* Instantly resets when button is re-enabled */
		width: 0; /* Resets width immediately */
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
		border-top: var(--border);
		padding: var(--padding);
		border: var(--border-dotted);
		border-radius: var(--border-radius);
	}

	.backpack-items {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-small);
	}

	.backpack-item {
		/* border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding); */
	}

	.location {
		border-top: var(--border);
		padding: var(--padding);
		border: var(--border-dotted);
		border-radius: var(--border-radius);
	}

	.items select,
	.location select {
		width: 100%;
	}
</style>
