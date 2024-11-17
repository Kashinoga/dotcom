<script>
	import { inTheWood } from './inTheWoodStore';
	import { handsAction, sessionLog } from './sessionLogStore';

	let icon = $inTheWood[0];
	let title = $inTheWood[1];
</script>

<div class="container">
	<div class="sections">
		<div class="section section-100">
			<h1>{icon.content} {title.content}</h1>
		</div>

		<div class="section section-100">
			<div class="logs">
				<div class="log log-adventure">
					<div class="log-title">Adventure Log</div>
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
					<div class="log-title">Session Log</div>
					<div class="log-messages">
						{#each $sessionLog as sessionLogMessage}
							<div class="log-session-message">
								<span>{sessionLogMessage.message}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>

		<div class="section">
			<div class="equipment">
				<div class="equip">
					<div class="equip-title">Hands</div>
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
		flex-grow: 1;
		flex-wrap: wrap;
		gap: var(--gap-small);
	}

	/* @media (min-width: 900px) {
		.log {
			flex-grow: 0;
		}
	} */

	.log {
		display: flex;
		flex-direction: column;
		flex-grow: 1;

		border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding);

		/* background-color: var(--background-color); */
		background-color: var(--white);

		height: 10em;

		align-content: end;
		overflow-y: auto;
	}

	.log-title {
		/* flex-grow: 1; */
		align-content: start;
		font-weight: bold;
		border-bottom: var(--border-dotted);
		padding-bottom: var(--padding);
	}

	.log-messages {
		align-content: end;
		padding-top: var(--padding);
		flex-grow: 1;

		/* display: grid;
		grid-template-columns: 1fr;
		height: 10em;
		width: 100%;
		align-content: end;
		overflow-y: auto;

		border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding);

		background-color: var(--background-color-light); */
	}

	.equipment {
		display: flex;
		/* grid-template-columns: repeat(4, 1fr); */
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

	.equip-title {
		flex-grow: 1;
		font-weight: bold;
		border-bottom: var(--border-dotted);
		padding-bottom: var(--padding);
	}

	.equip-actions {
		display: flex;
		margin-top: var(--margin);
	}

	.actions {
		display: flex;
		gap: var(--gap-small);
		border-right: var(--border-dotted);
		padding-right: var(--padding);
		flex-grow: 1;
	}

	.action {
		/* background-color: white; */
	}

	.items {
		display: flex;
		gap: var(--gap-small);
		align-items: center;
		padding-left: var(--padding);
	}

	button {
		border: var(--border);
		border-radius: var(--border-radius-half);
	}
</style>
