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
			<div class="section section-100">
				<div class="hero">
					<div class="hero-title">
						<h1>{icon.content} {title.content}</h1>
					</div>
					<div class="hero-version">v.0.2-a</div>
				</div>
			</div>

			<div class="section">
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
</div>

<Drawer bind:isOpen {adventureLogContainer}></Drawer>

<style>
	.container {
		margin-bottom: 45px;
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

	.title {
		margin-bottom: var(--margin);
	}

	.adventure-log-container {
		padding: var(--padding);
		border: var(--border);
		border-radius: var(--border-radius);
		background-color: var(--background-color-glass);
		backdrop-filter: var(--backdrop-filter-glass);
	}
</style>
