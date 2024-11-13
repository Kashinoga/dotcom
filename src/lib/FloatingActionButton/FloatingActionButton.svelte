<script>
	import { scrollToBottom } from '$lib/utils';
</script>

<button class="fab" onclick={scrollToBottom}>📑</button>

<style>
	.fab {
		background-color: var(--background-color-light);

		padding: var(--padding-small);

		border: var(--border);
		border-radius: var(--border-radius);

		position: fixed;

		bottom: var(--margin);
		right: var(--margin);

		font-size: x-large;

		cursor: pointer;
	}
</style>
