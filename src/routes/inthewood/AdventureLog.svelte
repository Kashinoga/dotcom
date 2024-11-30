<script lang="ts">
	import { tick } from 'svelte';
	import { type Log } from './adventureLogStore';

	export let logs: Log[] = []; // Explicitly define the type of logs
	export let logContainer: HTMLDivElement | null = null;
	export let activeFilter: 'adventure' | 'session' | 'all' = 'all';

	// Filtered messages based on the active filter
	$: filteredMessages = logs.filter((msg) => activeFilter === 'all' || msg.type === activeFilter);

	// Function to scroll to the bottom of the container
	async function scrollToBottom() {
		if (logContainer) {
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	}

	$: {
		filteredMessages;
		// Wait for DOM update before scrolling
		tick().then(() => {
			scrollToBottom(); // Scroll to bottom after the filter change
		});
	}
</script>

<div class="adventure-log-tabs">
	<button
		class="adventure-log-tab {activeFilter === 'all' ? 'active' : ''}"
		on:click={() => {
			activeFilter = 'all';
		}}
		aria-pressed={activeFilter === 'all'}
	>
		All
	</button>
	<button
		class="adventure-log-tab {activeFilter === 'adventure' ? 'active' : ''}"
		on:click={() => {
			activeFilter = 'adventure'; // This triggers the reactive statement
		}}
		aria-pressed={activeFilter === 'adventure'}
	>
		Adventure
	</button>
	<button
		class="adventure-log-tab {activeFilter === 'session' ? 'active' : ''}"
		on:click={() => {
			activeFilter = 'session'; // This triggers the reactive statement
		}}
		aria-pressed={activeFilter === 'session'}
	>
		Session
	</button>
</div>

<div class="log-messages" bind:this={logContainer}>
	{#if filteredMessages.length > 0}
		<div class="paragraphs">
			{#each filteredMessages as message}
				<p>{message.content}</p>
			{/each}
		</div>
	{:else}
		<div class="paragraphs">
			<p>No messages available.</p>
		</div>
	{/if}
</div>

<style>
	.adventure-log-tabs {
		display: flex;
		gap: var(--gap-small);
		padding-bottom: var(--padding-small);
	}

	.adventure-log-tab {
		background-color: transparent;
		color: var(--color-text-faded);
		cursor: pointer;
		padding: 0;
		border-bottom: 0.2em solid transparent;
	}

	.adventure-log-tab.active {
		font-weight: bold;
		color: var(--color-text);
		border-bottom: 0.2em solid var(--yellow);
		border-radius: 0;
	}

	.log-messages {
		align-content: end;
		flex-grow: 1;
		height: 10em;
		overflow-y: auto;
		border-radius: var(--border-radius-small);
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}

	.paragraphs p {
		margin: 0;
	}
</style>
