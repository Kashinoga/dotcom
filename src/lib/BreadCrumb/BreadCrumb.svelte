<script lang="ts">
	import { page } from '$app/stores';

	let crumbs: Array<{ label: string; href: string }> = [];

	$: {
		// Remove zero-length tokens.
		const tokens = $page.url.pathname.split('/').filter((t) => t !== '');

		// Create { label, href } pairs for each token.
		let tokenPath = '';
		crumbs = tokens.map((t) => {
			tokenPath += '/' + t;
			console.log(t);
			t = t.charAt(0) + t.slice(1);
			return {
				label: $page.data.label || t,
				href: tokenPath
			};
		});

		// Add a way to get home too.
		crumbs.unshift({ label: 'Home', href: '/' });
	}
</script>

<div class="breadcrumb">
	{#each crumbs as c, i}
		{#if i == crumbs.length - 1}
			<span class="label">
				{c.label}
			</span>
		{:else}
			<a href={c.href}>{c.label}</a> ➡️
		{/if}
	{/each}
</div>

<style>
	.breadcrumb {
		width: auto;
		justify-content: center;
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-small);
		font-size: small;
		padding: var(--padding-small);
		border-left: var(--border);
		border-right: var(--border);
		border-bottom: var(--border);
		border-bottom-left-radius: var(--border-radius);
		border-bottom-right-radius: var(--border-radius);
	}

	@media (min-width: 760px) {
		.breadcrumb {
			width: fit-content;
			padding: var(--padding);
		}
	}

	/* .breadcrumb a {

	} */

	.breadcrumb .label {
		background-color: var(--highlight-3);
	}
</style>
