<script lang="ts">
	import { combinedLogs, type Log } from './adventureLogStore';
	import { get } from 'svelte/store';

	// import { adventureLogStore } from './adventureLogStore';
	// export let logs = $adventureLogStore; // Use the Svelte `$` syntax to make it reactive

	// export let logs: { type: 'adventure' | 'session'; content: string }[] = [];

	export let logs: Log[] = []; // Explicitly define the type of logs

	// let logs = get(combinedLogs);

	let activeFilter: 'adventure' | 'session' = 'adventure';
	$: filteredMessages = logs.filter((msg) => msg.type === activeFilter);
</script>

<div class="adventure-log-tabs">
	<button
		class="adventure-log-tab {activeFilter === 'adventure' ? 'active' : ''}"
		onclick={() => (activeFilter = 'adventure')}
		aria-pressed={activeFilter === 'adventure'}
	>
		Adventure
	</button>
	<button
		class="adventure-log-tab {activeFilter === 'session' ? 'active' : ''}"
		onclick={() => (activeFilter = 'session')}
		aria-pressed={activeFilter === 'session'}
	>
		Session
	</button>
</div>

<div class="log-messages">
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
	}

	.adventure-log-tab {
		background-color: transparent;
		color: var(--color-text);
		cursor: pointer;
		padding: 0;
	}

	.adventure-log-tab.active {
		font-weight: bold;
		border-bottom: none;
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
