<script>
	import { onMount } from 'svelte';
	import { inTheWood } from './inTheWoodStore';
	import { adventureLog } from './adventureLogStore';
	import {
		addRandomGatherMessageToSessionLog,
		addRandomMessageToSessionLog,
		sessionLog
	} from './sessionLogStore';
	import { playerInventory } from './playerInventoryStore';
	import { backpack } from './backpackStore';

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

		scrollToBottom();
		handleClick();

		await delay(1000);

		addRandomGatherMessageToSessionLog();
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
				<div class="hero paper">
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
							<div class="backpack-item">
								{item.name}
							</div>
						{/each}
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

	button {
		border: var(--border);
		border-radius: var(--border-radius-half);
	}

	.logs {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-wrap: wrap;
		gap: var(--gap-small);
	}

	@media (min-width: 900px) {
		.logs {
			flex-direction: row;
		}
	}

	.log {
		display: flex;
		flex-direction: column;
		flex: 1;

		border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding);

		background-color: var(--background-color-section);

		align-content: end;
	}

	.title {
		flex-grow: 1;
		align-content: start;

		font-weight: bold;

		border-bottom: var(--border-dotted);

		padding-bottom: var(--padding);

		margin-bottom: var(--margin);
	}

	.log-messages {
		align-content: end;
		flex-grow: 1;

		height: 10em;

		overflow-y: auto;
	}

	.equipment {
		display: flex;
		gap: var(--gap-small);

		border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding);

		background-color: var(--background-color-section);
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
		background-color: var(--background-color);
	}

	.loading-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		height: 4px;
		background: var(--green);
		width: 0;
		transition: width 1s linear;
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
		border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding);

		background-color: var(--background-color-section);
	}

	.backpack-items {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-small);
	}

	.backpack-item {
		border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding);
	}

	.location {
		border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding);

		background-color: var(--background-color-section);
	}

	.items select,
	.location select {
		width: 100%;
	}
</style>
