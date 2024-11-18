<script>
	import { onMount } from 'svelte';
	import { inTheWood } from './inTheWoodStore';
	import { adventureLog } from './adventureLogStore';
	import { sessionLog } from './sessionLogStore';

	let icon = $inTheWood[0];
	let title = $inTheWood[1];

	let isDisabled = false;

	function handleClick() {
		isDisabled = true; // Disable the button
		setTimeout(() => {
			isDisabled = false; // Re-enable the button after 4 seconds
		}, 4000);
	}

	export function handsAction() {
		const newSessionLogMessage = { id: 2, message: 'You [Gather] with your [Hands]...' };
		sessionLog.update((currentLog) => [...currentLog, newSessionLogMessage]);
		scrollToBottom();
		handleClick();
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
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section section-100">
				<h1>{icon.content} {title.content}</h1>
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
										<option value="axe"> Basic Axe </option></select
									>
								</div>
								<div class="item">
									<select
										><option disabled>Select a Right-Hand Item</option>
										<option value="axe"> Basic Axe </option></select
									>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.content {
		max-width: unset;

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

	.location {
		border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding);

		background-color: var(--background-color-section);
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

	/* .title {
		flex-grow: 1;

		font-weight: bold;

		border-bottom: var(--border-dotted);

		padding-bottom: var(--padding);
	} */

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

	.action:disabled {
		cursor: not-allowed;
		background-color: #6c757d;
	}

	.loading-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		height: 4px;
		background: #00ffcc;
		width: 0;
		transition: width 4s linear;
	}

	.action:disabled .loading-bar {
		width: 100%;
	}

	.action:not(:disabled) .loading-bar {
		transition: width 0.2s linear; /* Instantly resets when button is re-enabled */
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

	.items select {
		width: 100%;
	}

	button {
		border: var(--border);
		border-radius: var(--border-radius-half);
	}
</style>
