<script>
	import { onMount } from 'svelte';
	import { inTheWood } from './inTheWoodStore';
	import { sessionLog } from './sessionLogStore';

	let icon = $inTheWood[0];
	let title = $inTheWood[1];

	export function handsAction() {
		const newSessionLogMessage = { id: 2, message: 'Hands: Gather' };
		sessionLog.update((currentLog) => [...currentLog, newSessionLogMessage]);
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
</script>

<div class="container">
	<div class="sections">
		<div class="section section-100">
			<h1>{icon.content} {title.content}</h1>
		</div>

		<div class="section section-100">
			<div class="logs">
				<div class="log log-adventure">
					<div class="title">Adventure Log</div>
					<div class="log-messages">
						<div class="log-adventure-message">
							<span>Hi!</span>
						</div>
						<div class="log-adventure-message">
							<span>Welcome to InTheWood!</span>
						</div>
						<div class="log-adventure-message">
							<span>This is a very early release.</span>
						</div>
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
			</div>
		</div>

		<div class="section section-100">
			<div class="equipment">
				<div class="equip">
					<div class="title">Hands</div>
					<div class="equip-actions">
						<div class="actions">
							<button class="action" on:click={handsAction}>Gather</button>
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

<style>
	.sections {
		display: flex;
		flex-grow: 1;

		padding-top: var(--padding);
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

		background-color: var(--white);

		align-content: end;
	}

	.title {
		flex-grow: 1;
		align-content: start;
		font-weight: bold;
		border-bottom: var(--border-dotted);
		padding-bottom: var(--padding);
	}

	.log-messages {
		align-content: end;
		flex-grow: 1;
		margin-top: var(--margin);

		height: 10em;

		overflow-y: auto;
	}

	.location {
		border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding);

		background-color: var(--white);
	}

	.equipment {
		display: flex;
		gap: var(--gap-small);

		border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding);

		background-color: var(--white);
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

			padding-right: var(--padding);
		}
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
