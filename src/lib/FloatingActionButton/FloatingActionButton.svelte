<script>
	import { scrollToBottom } from '$lib/utils';
</script>

<button class="fab" onclick={scrollToBottom}>📑</button>

<style>
	.fab {
		background-color: color-mix(in srgb, var(--background-color-light) 2%, transparent);
		backdrop-filter: blur(0.2em);

		padding: var(--padding-small);

		border: var(--border);
		border-radius: 2em;

		position: fixed;

		bottom: var(--margin);
		right: var(--margin);

		font-size: x-large;

		cursor: pointer;

		z-index: 9001;
	}
</style>
