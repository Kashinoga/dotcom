<script lang="ts">
	import '@kashinoga/puhig/tokens.css';
	// The control family's own sheet — the hover pop, the press squash, the Bubble style. Plain
	// CSS rather than a component's <style>, because every rule in it was already :global(): it
	// dresses controls that live in a dozen different components. Loaded here, after the tokens
	// it reads and before any component style.
	import '$lib/styles/controls.css';
	import { installTapPress } from '$lib/press';
	import { page } from '$app/state';
	import { installThemeColor, refreshThemeColor } from '$lib/theme-color';

	let { children } = $props();
	// Site-wide, because the button spring is site-wide: a trackpad TAP releases before the press
	// transition can play, so without this a tap gets no squash while a click does (see
	// $lib/press). It lives in the layout rather than the page so it also covers the panels that
	// build their own chrome — the Traffic board, the Builder, the Star Map.
	$effect(() => installTapPress());
	// The browser chrome's tint, kept matched to the superbar — see $lib/theme-color, which owns
	// the how and the why. Site-wide for the same reason the press handler is: every app builds
	// its own bar, and the chrome sits above all of them.
	$effect(() => installThemeColor());
	// Re-read on navigation. The module hears scrolling, resizes, the <html> attributes and the
	// OS scheme by itself, but not a change of PAGE: a panel opens by shallow routing, which
	// swaps the bar while touching none of those. Both are read, because the two kinds of move
	// land in different places — a real navigation in `url`, a panel in `state`.
	$effect(() => {
		void page.url.pathname;
		void page.state;
		refreshThemeColor();
	});
	// The favicon is NOT declared here any more. It changes with the open panel — the Air Traffic
	// board and the Presentation Builder each fly their own mark in the tab — and only the page
	// knows which panel that is: a panel opens by pushState, so the layout can't read it off the
	// URL. Emitting a second <link rel="icon"> here would just race the page's. See the
	// <svelte:head> in [...view=view]/+page.svelte, which owns the site heart too.
</script>

{@render children()}
