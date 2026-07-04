<script lang="ts">
	import type { Snippet } from 'svelte';
	import { gridFit } from './gridFit';

	let { children, target = 32 }: { children?: Snippet; target?: number } = $props();
</script>

<!-- Inset bordered panel with the grid painted into ITS box (not the viewport),
     so gridFit fits whole tiles to the panel. overflow:hidden clips the outer
     tiles along the rounded corners — the intended frame effect. -->
<section class="panel puhig-grid" use:gridFit={target}>
	{@render children?.()}
</section>

<style>
	.panel {
		position: relative; /* containing block for the absolute grid layer */
		display: flex;
		flex: 1;
		overflow: hidden;
		border: var(--panel-border, 2px) solid var(--ink, #0a0a0a);
		border-radius: var(--panel-radius, 22px);
		background-color: var(--page, #edeef0);
	}
</style>
