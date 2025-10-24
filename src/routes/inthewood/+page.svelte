<script lang="ts">
	import { inTheWood } from './inTheWoodStore';
	import { writable } from 'svelte/store';
	import Drawer from './Drawer.svelte';
	import AdventureLog from './AdventureLog.svelte';
	import { combinedLogs } from './adventureLogStore';

	let showModal = $state(false);
	let isOpen = $state(false);

	let icon = $inTheWood[0];
	let title = $inTheWood[1];

	let activeFilter: 'adventure' | 'session' | 'all' = 'all';

	export const adventureLogContainer = writable<HTMLDivElement | null>(null);

	$effect(() => {
		if (showModal || isOpen) {
			document.body.classList.add('no-scroll');
		} else {
			document.body.classList.remove('no-scroll');
		}
		return () => {
			document.body.classList.remove('no-scroll');
		};
	});
</script>

<div class="container">
	<div class="content">
		<div class="sections">
			<div class="section">
				<div class="title">
					<div class="title-emoji">
						<h1>{icon.content}</h1>
					</div>
					<div class="title-text">
						<h1>{title.content}</h1>
						A spacey game, set in space.
					</div>
				</div>
			</div>

			<div class="adventure-log-container">
				<div class="title">Adventure Log</div>
				<div class="adventure-log">
					<AdventureLog
						logs={$combinedLogs}
						bind:logContainer={$adventureLogContainer}
						{activeFilter}
					/>
				</div>
			</div>
		</div>
	</div>
</div>

<Drawer bind:isOpen {adventureLogContainer}></Drawer>

<style>
	.adventure-log-container {
		padding: var(--padding);
		border: var(--border);
		border-radius: var(--border-radius);
		background-color: var(--background-color-glass);
		backdrop-filter: var(--backdrop-filter-glass);
		height: 50vh;
	}
</style>
