<script lang="ts">
	// The page a bad URL lands on.
	//
	// Every real path goes through the `view` matcher, so a typo never reaches `[...view=view]`
	// and never gets the site's chrome. Before this file, SvelteKit answered with its own grey
	// default page: no paper, no ink, no way back to the hub. A shared link that lost a
	// character showed a visitor a blank error and stopped there.
	//
	// This page takes its colours from the theme tokens, so it reads as part of the site in
	// both Pixelite and Aeropalite, and in light and dark. It stays deliberately small: no
	// stage, no camera, no panel machinery. It states the status, names the path, and gives
	// two ways out.
	import { page } from '$app/state';
	import { SITE } from '$lib/views';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Something went wrong.');
	// A 404 is the common case and deserves plain words, not the framework's "Not Found".
	const headline = $derived(status === 404 ? 'No such page' : 'Something went wrong');
	const detail = $derived(
		status === 404
			? 'That address does not name a place on this site. It may have been mistyped, or the link may be old.'
			: message
	);
</script>

<svelte:head>
	<title>{status} — {SITE}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<p class="code">{status}</p>
	<h1>{headline}</h1>
	<p class="detail">{detail}</p>
	{#if status === 404 && page.url.pathname !== '/'}
		<p class="path"><code>{page.url.pathname}</code></p>
	{/if}
	<nav>
		<a class="go" href="/">Home</a>
		<a class="go" href="/apps">Apps</a>
	</nav>
</main>

<style>
	main {
		min-height: 100svh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 2rem 1.25rem;
		text-align: center;
		background: var(--paper, Canvas);
		color: var(--ink, CanvasText);
		font-family: var(--font-body, system-ui, sans-serif);
	}

	.code {
		margin: 0;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.8rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.55;
	}

	h1 {
		margin: 0;
		font-size: clamp(1.6rem, 6vw, 2.4rem);
		font-weight: 600;
		line-height: 1.15;
	}

	.detail {
		margin: 0;
		/* A readable measure, so the sentence does not run the full width of a desktop. */
		max-width: 46ch;
		font-size: 1rem;
		line-height: 1.5;
		opacity: 0.75;
	}

	.path {
		margin: 0;
		max-width: 100%;
	}

	.path code {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.85rem;
		padding: 0.2em 0.5em;
		border: 1px solid var(--line, rgba(128, 128, 128, 0.25));
		border-radius: 6px;
		/* A long path must wrap instead of pushing the page sideways. */
		overflow-wrap: anywhere;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.6rem;
		margin-top: 0.75rem;
	}

	.go {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.85rem;
		text-decoration: none;
		color: inherit;
		padding: 0.5em 1.1em;
		border: 1px solid var(--line-strong, rgba(128, 128, 128, 0.4));
		border-radius: 999px;
		transition:
			transform 0.18s var(--btn-spring, ease),
			background-color 0.18s ease;
	}

	.go:hover {
		background: color-mix(in srgb, currentColor 8%, transparent);
		transform: scale(var(--btn-hover-scale, 1.05));
	}

	.go:active {
		transform: scale(var(--btn-press-scale, 0.95));
	}

	.go:focus-visible {
		outline: var(--focus-ring, 2px solid currentColor);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.go {
			transition: background-color 0.18s ease;
		}
		.go:hover,
		.go:active {
			transform: none;
		}
	}
</style>
