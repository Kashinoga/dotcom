<script lang="ts">
	import { onMount } from 'svelte';
	import { inTheWood } from './inTheWoodStore';
	import { writable } from 'svelte/store';
	import type { Backpack } from './BackpackInterface';
	import Drawer from './Drawer.svelte';
	import AdventureLog from './AdventureLog.svelte';
	import { combinedLogs } from './adventureLogStore';

	let showModal = $state(false);
	let isOpen = $state(false);

	let icon = $inTheWood[0];
	let title = $inTheWood[1];

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

			<div class="section">
				<div class="adventure-log-container">
					<div class="title">Adventure Log</div>
					<div class="adventure-log">
						<!-- <AdventureLog logs={$adventureLogStore} /> -->
						<AdventureLog logs={$combinedLogs} />
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

	.location {
		border-top: var(--border);
		padding: var(--padding);
		border: var(--border);
		border-radius: var(--border-radius);
		background-color: var(--background-color-glass);
		backdrop-filter: var(--backdrop-filter-glass);
	}

	.adventure-log-container {
		padding: var(--padding);
		border: var(--border);
		border-radius: var(--border-radius);
		background-color: var(--background-color-glass);
		backdrop-filter: var(--backdrop-filter-glass);
	}
</style>
