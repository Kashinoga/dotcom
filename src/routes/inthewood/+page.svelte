<script>
	import { inTheWood } from './inTheWoodStore';

	let icon = $inTheWood[0];
	let title = $inTheWood[1];
</script>

<div class="container">
	<div class="sections">
		<div class="section section-100">
			<h1>{icon.content} {title.content}</h1>
		</div>

		<div class="log-adventure">
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

		<div class="equipment">
			<div class="equip">
				<h1>Hands</h1>
				<div class="actions">
					<button class="action">Gather</button>
					<button class="action">Hunt</button>
				</div>
			</div>
			<div class="items">
				<div class="item">
					<select
						><option disabled>Select an Item</option>
						<option value="axe"> Basic Axe </option></select
					>
				</div>
				<div class="item">
					<select
						><option disabled>Select an Item</option>
						<option value="axe"> Basic Axe </option></select
					>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.sections {
		flex-grow: 1;

		padding-top: var(--padding);
	}

	.section-100 {
		flex-basis: 100%;
	}

	.log-adventure {
		display: grid;
		grid-template-columns: 1fr;
		height: 10em;
		width: 100%;
		align-content: end;
		overflow-y: auto;
		

		border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding);

		background-color: var(--background-color-light);
	}

	.equipment {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--gap-small);

		border: var(--border);
		border-radius: var(--border-radius);

		padding: var(--padding);

		background-color: var(--background-color-light);
	}

	.equip {
		grid-column: span 3;
		grid-row: 1 / -1;
		border-right: var(--border-dotted);
	}

	.actions {
		display: flex;
		gap: var(--gap-small);
	}

	.items {
		display: flex;
		gap: var(--gap-small);
		align-items: center;
	}
</style>
