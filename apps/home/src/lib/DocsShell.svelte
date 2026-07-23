<script lang="ts">
	import { onMount, onDestroy, tick, type Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { HUB, children, airports, parentOf } from '$lib/network';
	import { viewPath, type View } from '$lib/views';
	import { emojiSearch } from '$lib/emoji-search.svelte';
	import { SEARCH_SVG } from '$lib/icons';

	// The Pixelite shell: a printed-manual documentation site (after makingsoftware.com) that
	// stands in for the whole map/panel world when the look is Pixelite. A full-width SUPERBAR
	// sits above everything (wordmark at its left end, the breadcrumb trail beside it); beneath
	// it, three columns scroll — a sticky left sidebar carrying the site tree as a numbered TOC,
	// the content column, and a right rail carrying an on-this-page table of contents. The page
	// bodies are handed in as a snippet from +page.svelte (`body`), so every app renders here
	// exactly as it does in a panel — the shell owns the chrome, the page owns its content.
	//
	// It derives its tree from network.ts (children/airports), never a hardcoded list: add a
	// place there and it appears here. Navigation goes back through the page's own machinery
	// via onNavigate (a real URL push), so links behave like the rest of the site.
	let {
		view = null,
		activeCode = null,
		pageIcon = '',
		onNavigate,
		body
	}: {
		view?: View | null;
		activeCode?: string | null;
		/* The open page's mark (+page's PORT_ICONS) — worn by the mobile floating key. */
		pageIcon?: string;
		onNavigate: (code: string) => void;
		body: Snippet<[View]>;
	} = $props();

	// The site outline: the hub leads as "1. Home" (the cover), then its children as the
	// numbered sections, each with its own children as sub-entries. One level of nesting
	// is all the tree has, and all a docs TOC needs. The Apps shelf lists alphabetically
	// by title (like the Apps panel's own cards); other sections keep their curated order.
	const sections = $derived([
		{ code: HUB, kids: [] as string[] },
		...(children[HUB] ?? []).map((code) => ({
			code,
			kids:
				code === 'APP'
					? [...(children[code] ?? [])].sort((a, b) => airports[a].title.localeCompare(airports[b].title))
					: (children[code] ?? [])
		}))
	]);

	// Breadcrumb: walk parents up from the open page, drop the hub, title-case → "APPS / DENSETTE".
	const crumbs = $derived.by(() => {
		if (!view || view.kind !== 'port') return [] as string[];
		const chain: string[] = [];
		let c: string | undefined = view.code;
		while (c && c !== HUB) {
			chain.unshift(c);
			c = parentOf[c];
		}
		return chain;
	});

	const nav = (e: MouseEvent, code: string) => {
		// Modified clicks stay the browser's (new tab etc.), like every in-app link.
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		e.preventDefault();
		sidebarOpen = false;
		onNavigate(code);
	};

	// ── Breadcrumb motion ──────────────────────────────────────────────────────────
	// The trail is keyed BY POSITION (index), so each unit is a stable SLOT. Two kinds of change:
	//  • the trail grows/shrinks at its END — deeper nav adds a slot, up-nav removes one; the
	//    slot's face drops in from the top / slides out the bottom.
	//  • a slot's CODE changes (navigating between siblings or sections) — the slot stays and its
	//    face is re-mounted ({#key c}), the old face dropping out while the new drops in.
	// The two faces of a swap are grid-STACKED in the slot (see .docs-crumb-slot), so they run as
	// one vertical current IN PLACE — the old out the bottom, the new in from the top — instead of
	// sitting side by side and colliding, which is what a code-keyed each did (it removed one crumb
	// and added another at the same spot, both in flow at once). No animate:flip: with slots stable
	// and swaps overlaid, nothing needs to slide across the row.
	// The face's transitions are |global: they must fire when an ANCESTOR block toggles (a whole
	// slot added/removed as the trail grows or shrinks — e.g. APPS / COPO → Settings drops the COPO
	// slot), not only when the face's own {#key} re-mounts (a same-slot swap). Local (the default)
	// plays only on the latter, so a removed slot's crumb flashed out with no transition.
	const stillMotion = () =>
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	// A crumb's enter and leave are DIRECTIONAL and opposite, not one motion reversed: a crumb
	// drops IN FROM THE TOP (down into place) and, when it goes, slides OUT TO THE BOTTOM — the
	// trail reads as a current running downward through the slot. Separate in/out (not one
	// transition:) is what lets the two ends point different ways. Both fade. In flow, no flip:
	// a departing crumb slides down where it stands while the survivors to its left hold place.
	function crumbIn(_node: Element, { duration = 220 } = {}) {
		return {
			duration: stillMotion() ? 0 : duration,
			css: (t: number, u: number) => `opacity: ${t}; transform: translateY(${-10 * u}px);`
		};
	}
	function crumbOut(_node: Element, { duration = 220 } = {}) {
		return {
			duration: stillMotion() ? 0 : duration,
			css: (t: number, u: number) => `opacity: ${t}; transform: translateY(${10 * u}px);`
		};
	}

	// Mobile: the sidebar folds away; the superbar's plastic-key discloses it as a dropdown.
	let sidebarOpen = $state(false);

	// The superbar goes translucent-and-blurred only once the page has scrolled under it — at
	// the very top it's a clean edge (makingsoftware's own behaviour). Measured height feeds
	// --superbar-h so the sticky rails start below it and anchor jumps clear it. Measured with
	// a ResizeObserver reading the FRACTIONAL rect height, not bind:clientHeight — the bar's
	// rem paddings land on a sub-pixel height, and the integer round-down left the rails
	// calc(100dvh - h) a hair too tall: the page gained a phantom ~1px scroll range (a
	// scrollbar on pages with nothing to scroll).
	let scrolled = $state(false);
	let superbarEl = $state<HTMLElement | undefined>(undefined);
	let superbarH = $state(52);
	// The shell's OWN scroller (see .docs-scroll): the window never scrolls this layout.
	// The bar overlays the scroller (E-ATFC's recipe), so the scroller's scrollbar runs the
	// full shell height and passes UNDER the bar's frost — the bar's right-end keys sit over
	// the scrollbar lane, matching the traffic and ranger bars. A window scrollbar can never
	// do this: nothing paints over browser chrome.
	let scrollEl = $state<HTMLElement | undefined>(undefined);
	const onDocsScroll = () => (scrolled = (scrollEl?.scrollTop ?? 0) > 4);

	// The scroller's own scrollbar eats into its CONTENT width (the styled 10px webkit bar; 0 with
	// overlay bars on a phone). The mobile contents receipt is position:fixed and sized off 100vw,
	// so without accounting for the gutter its right edge overran the sheet — which lives INSIDE
	// this scroller and is that gutter narrower. Measured (offsetWidth − clientWidth) and fed to
	// --scrollbar-w so the receipt subtracts exactly the gutter that's actually there. It toggles
	// with content height (a short page has no bar), so it's re-read on navigation too, below.
	let scrollbarW = $state(0);
	const measureScrollbar = () => {
		if (scrollEl) scrollbarW = scrollEl.offsetWidth - scrollEl.clientWidth;
	};

	onMount(() => {
		onDocsScroll();
		// Measure synchronously first — ResizeObserver delivery rides the render frame, which
		// a hidden/background tab suspends, and the first paint shouldn't wait for it anyway.
		if (superbarEl) superbarH = superbarEl.getBoundingClientRect().height;
		measureScrollbar();
		const ro = new ResizeObserver(() => {
			if (superbarEl) superbarH = superbarEl.getBoundingClientRect().height;
			measureScrollbar();
		});
		if (superbarEl) ro.observe(superbarEl);
		return () => {
			ro.disconnect();
		};
	});

	// ── On-this-page rail ─────────────────────────────────────────────────────────
	// A quiet table of contents for the current view: the page's own title, then its rendered
	// section headings, in reading order, as smooth-scroll anchors with cobalt hover/active.
	// Detected by querying the content after each render — Densette chapters/sub-heads, prose
	// sub-heads, and Settings group labels — never a hand-kept list, so it can't drift from the
	// page. The rail leads with the page title so EVERY page shows an on-this-page panel: a page
	// with no sub-sections still lists its one heading. Missing ids are slugged in.
	type TocItem = { id: string; text: string; level: number };
	let contentEl = $state<HTMLElement | undefined>(undefined);
	let toc = $state<TocItem[]>([]);
	let activeId = $state<string | null>(null);
	let observer: IntersectionObserver | null = null;

	// The page's own heading, listed FIRST at level 1 so the rail is never empty — a prose page,
	// a bleed reading, or the homepage cover all lead with their title even when nothing sits
	// under it. (Densette draws its own paper without one of these, but always carries chapter
	// titles below, so its rail is populated anyway.)
	const TITLE_SEL = '.docs-page-title, .docs-cover-title';
	// The section headings worth listing beneath the title: Densette's chapter/sub titles, the
	// prose column's own h3/h4 sub-heads, Settings' group leads, and the Emoji Viewer's group
	// names. Deliberately narrow — specific classes, so it lists real sections and never leaks a
	// full-bleed view's internal chrome into the rail.
	const TOC_SEL = '.ch-title, .sub-head, .docs-prose h3, .docs-prose h4, .seg-lead, .ev-group-name';

	const slug = (s: string) =>
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 48) || 'sec';

	async function buildToc() {
		await tick();
		// A new page changes the content height, which can add or drop the scroller's scrollbar —
		// re-read the gutter so the mobile receipt keeps matching the sheet.
		measureScrollbar();
		observer?.disconnect();
		observer = null;
		const root = contentEl;
		if (!root) {
			toc = [];
			return;
		}
		// The page title leads (level 1), then every section heading in DOM order (levels 2/3).
		// The title element always precedes the section headings in the flow, so concatenating
		// keeps the rail in reading order.
		const titleEl = root.querySelector<HTMLElement>(TITLE_SEL);
		const nodes = [
			...(titleEl ? [titleEl] : []),
			...Array.from(root.querySelectorAll<HTMLElement>(TOC_SEL))
		];
		const seen = new Set<string>();
		const items: TocItem[] = [];
		for (const n of nodes) {
			const text = (n.textContent ?? '').trim();
			if (!text) continue;
			let id = n.id;
			if (!id) {
				const base = slug(text);
				let u = base;
				let k = 1;
				while (seen.has(u)) u = `${base}-${k++}`;
				id = u;
				n.id = id;
			}
			seen.add(id);
			// The page title sits at level 1; chapters, top-level prose heads and Settings leads
			// sit flush at level 2; sub-heads indent at level 3.
			const level = n === titleEl ? 1 : n.matches('.sub-head, h4') ? 3 : 2;
			items.push({ id, text, level });
		}
		toc = items;
		if (items.length && typeof IntersectionObserver !== 'undefined') {
			// A heading is "current" once it reaches the top third of the scroller.
			observer = new IntersectionObserver(
				(entries) => {
					for (const e of entries) if (e.isIntersecting) activeId = (e.target as HTMLElement).id;
				},
				{ root: scrollEl ?? null, rootMargin: '0px 0px -70% 0px', threshold: 0 }
			);
			for (const n of nodes) observer.observe(n);
		}
	}

	// Rebuild whenever the open view changes (the body re-renders under it) — and when the Emoji
	// Viewer's live filter changes its heading set, so the rail follows the groups the search
	// leaves standing rather than going stale. (Harmless for every other view: the query never
	// changes there, so this adds no reruns off the Emoji page.)
	$effect(() => {
		view;
		activeCode;
		emojiSearch.query;
		buildToc();
	});

	// ── Superbar search (Emoji page) ─────────────────────────────────────────────
	// The viewer's own search bar sits in flow under the chapter head; once it scrolls out of
	// sight, the superbar reveals a search icon to the right of the breadcrumb that expands
	// into a field — same shared query, so either mouth filters the same wall.
	//
	// THE MODEL for superbar controls on other pages/apps (per the user): a page-owned
	// control lives in flow; when it scrolls away the superbar reveals its stand-in
	// (IntersectionObserver, offset by the superbar's height); the stand-in is ONE element
	// morphing between icon and expanded states (width on one box, contents always mounted —
	// the CitySearch lesson); reveal/retreat are one mirrored Svelte transition; state is
	// SHARED with the in-flow control and survives the retreat; negative block margins keep
	// the superbar's height constant. Copy this shape, not just its idea.
	let evBarGone = $state(false);
	let sbSearchOpen = $state(false);
	let sbInput = $state<HTMLInputElement | undefined>(undefined);
	let evObserver: IntersectionObserver | null = null;
	const onEmojiPage = $derived(view?.kind === 'port' && view.code === 'EMOJ');

	$effect(() => {
		view;
		evObserver?.disconnect();
		evObserver = null;
		evBarGone = false;
		sbSearchOpen = false;
		if (onEmojiPage && typeof IntersectionObserver !== 'undefined') {
			tick().then(() => {
				const bar = contentEl?.querySelector('.ev-searchbar');
				if (!bar) return;
				// The bar counts as gone once it has slipped under the superbar (which overlays
				// the scroller's top), not the scroller's own edge.
				evObserver = new IntersectionObserver(
					(entries) => {
						for (const e of entries) evBarGone = !e.isIntersecting;
					},
					{ root: scrollEl ?? null, rootMargin: `-${Math.ceil(superbarH)}px 0px 0px 0px` }
				);
				evObserver.observe(bar);
			});
		}
	});
	function openSbSearch() {
		sbSearchOpen = true;
		tick().then(() => sbInput?.focus());
	}
	function closeSbSearch() {
		emojiSearch.query = '';
		sbSearchOpen = false;
	}
	function onSbSearchKey(e: KeyboardEvent) {
		if (e.key === 'Escape') closeSbSearch();
	}
	// The whole control's reveal: slides down-and-in when the in-flow bar scrolls away, and
	// plays the same motion in reverse (up-and-out) when it returns — a Svelte transition,
	// since a CSS keyframe can only play the way in. Honors reduced motion.
	function sbReveal(_node: Element, { duration = 200 } = {}) {
		const still =
			typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
		return {
			duration: still ? 0 : duration,
			css: (t: number) => `opacity: ${t}; transform: translateY(${-4 * (1 - t)}px);`
		};
	}
	// Wandering off with nothing typed folds the field back to its icon; a live query keeps
	// it open (the field showing WHAT'S filtering is the point). Focusout on the CONTAINER,
	// so tabbing between the input and the icon never counts as leaving. And a focusout
	// caused by the control SLIDING AWAY (scrolled back to the in-flow bar, evBarGone just
	// flipped false, unmount steals focus) is not the user leaving — skip it, so the
	// expanded state survives the retreat and the control returns still open.
	function onSbFocusOut(e: FocusEvent) {
		if (!evBarGone) return;
		const to = e.relatedTarget as Node | null;
		if (to && (e.currentTarget as HTMLElement).contains(to)) return;
		if (!emojiSearch.query) sbSearchOpen = false;
	}
	onDestroy(() => {
		// onDestroy runs during SSR too, where cancelAnimationFrame doesn't exist — guard it.
		// (jumpRaf/jumpFallback are only ever set client-side in tocJump, so they're 0 here.)
		observer?.disconnect();
		evObserver?.disconnect();
		if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(jumpRaf);
		clearTimeout(jumpFallback);
	});

	// Scroll to a section, clearing the overlaid superbar (scroll-margin can't reach the scoped
	// page headings from here, so the offset is done by hand). The sections live in the shell's
	// OWN scroller now (.docs-scroll — the window never scrolls this layout), so the target is
	// a scroller offset. The tween is hand-rolled on scrollTo(x, y) rather than
	// `behavior: 'smooth'` (the instant two-arg form is universal). A rAF loop eases it for the
	// common case; a setTimeout
	// SAFETY NET then lands it outright if rAF never advanced (a throttled/occluded tab suspends rAF
	// entirely, which would otherwise leave the jump stuck at the start). setTimeout still fires
	// there, so the section is always reached — smooth when it can be, instant when it can't.
	let jumpRaf = 0;
	let jumpFallback = 0;
	function tocJump(e: MouseEvent, id: string) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		e.preventDefault();
		const el = document.getElementById(id);
		const sc = scrollEl;
		if (!el || !sc) return;
		activeId = id;
		// A view can add its own bar that sticks BELOW the superbar (the Emoji Viewer's search),
		// marked with [data-docs-substick]. Fold its live height into the offset so a jump lands
		// clear of it, not tucked underneath. Zero for views without one.
		const sub = contentEl?.querySelector<HTMLElement>('[data-docs-substick]');
		const subH = sub ? sub.getBoundingClientRect().height : 0;
		// The bar overlays the scroller's top, so the landing clears its height (plus any
		// view-owned substick bar).
		const target = Math.max(
			0,
			el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - superbarH - subH - 14
		);
		const start = sc.scrollTop;
		const dist = target - start;
		if (Math.abs(dist) < 2) return;
		cancelAnimationFrame(jumpRaf);
		clearTimeout(jumpFallback);
		if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
			sc.scrollTo(0, target);
			return;
		}
		const dur = 440;
		const t0 = performance.now();
		const ease = (p: number) => 1 - Math.pow(1 - p, 3);
		const step = (now: number) => {
			const p = Math.min(1, (now - t0) / dur);
			sc.scrollTo(0, start + dist * ease(p));
			if (p < 1) jumpRaf = requestAnimationFrame(step);
		};
		jumpRaf = requestAnimationFrame(step);
		// If the eased scroll didn't reach the target (rAF suspended, or interrupted), land it.
		jumpFallback = window.setTimeout(() => {
			if (Math.abs(sc.scrollTop - target) > 4) sc.scrollTo(0, target);
		}, dur + 140);
	}
</script>

<div class="docs" class:sidebar-open={sidebarOpen} style="--superbar-h: {superbarH}px; --scrollbar-w: {scrollbarW}px">
	<!-- Full-width superbar over all three columns: the wordmark at its left end, the breadcrumb
	     trail beside it, and (on mobile) a plastic-key MENU that discloses the sidebar. It sticks
	     to the top and blurs once the page scrolls under it. -->
	<header class="docs-superbar" class:scrolled bind:this={superbarEl}>
		<a class="docs-wordmark" href={viewPath({ kind: 'port', code: HUB })} onclick={(e) => nav(e, HUB)}
			>KASHINOGA</a
		>
		{#if crumbs.length}
			<span class="docs-brand-sep" aria-hidden="true" transition:fade={{ duration: 180 }}></span>
		{/if}
		<!-- The trail is ALWAYS mounted (even empty), so add/remove and swaps both animate.
		     The each is keyed BY POSITION (i), so a unit is a stable SLOT: navigating between
		     siblings/sections swaps the code AT a slot rather than removing one crumb and adding
		     another at the same spot — which is what made the outgoing and incoming crumbs sit
		     side by side and collide. Inside each slot, {#key c} re-mounts the crumb FACE when the
		     code there changes, and the two faces are grid-STACKED (see .docs-crumb-slot), so the
		     old drops out the bottom while the new drops in from the top, IN PLACE — one vertical
		     current, never two crumbs abreast. Adding/removing a slot at the trail's end animates
		     the same way (the face has no sibling to overlap). -->
		<nav class="docs-crumbs" aria-label="Breadcrumb">
			{#each crumbs as c, i (i)}
				<span class="docs-crumb-unit">
					{#if i > 0}<span class="docs-crumb-sep" aria-hidden="true">/</span>{/if}<span class="docs-crumb-slot">
						{#key c}<span class="docs-crumb-face" in:crumbIn|global out:crumbOut|global>{#if i < crumbs.length - 1}<a
									class="docs-crumb"
									href={viewPath({ kind: 'port', code: c })}
									onclick={(e) => nav(e, c)}>{airports[c].title}</a
								>{:else}<span class="docs-crumb" aria-current="page">{airports[c].title}</span>{/if}</span>{/key}
					</span>
				</span>
			{/each}
		</nav>
		{#if onEmojiPage && evBarGone}
			<!-- Right of the breadcrumb: the Emoji page's search, revealed once the in-flow bar
			     scrolls away. ONE control in two states (the CitySearch lesson): the width morphs
			     on a single element, the input lives inside it the whole time, and the icon is the
			     right-edge anchor the field grows away from — never a field swapped for a button. -->
			<span class="docs-sb-search" transition:sbReveal>
				<span class="docs-sb-ctl" class:open={sbSearchOpen} onfocusout={onSbFocusOut}>
					<input
						class="docs-sb-input"
						type="search"
						placeholder="SEARCH EMOJI"
						autocomplete="off"
						spellcheck="false"
						aria-label="Search emoji by name"
						tabindex={sbSearchOpen ? 0 : -1}
						bind:this={sbInput}
						bind:value={emojiSearch.query}
						onkeydown={onSbSearchKey}
					/>
					<button
						type="button"
						class="docs-sb-ico-btn"
						aria-expanded={sbSearchOpen}
						aria-label={sbSearchOpen ? 'Close search' : 'Search emoji'}
						title={sbSearchOpen ? 'Close' : 'Search emoji'}
						onclick={() => (sbSearchOpen ? closeSbSearch() : openSbSearch())}
						>{@html SEARCH_SVG}</button
					>
				</span>
			</span>
		{/if}
	</header>

	<!-- Mobile contents control: a floating plastic key at the viewport's bottom-left wearing
	     the OPEN PAGE's mark (the same glyph its app card and Related chip wear), so the key
	     doubles as a "you are here" badge. It discloses the site tree as a RECEIPT feeding
	     out from under the superbar (see the .docs-sidebar mobile rules), with a scrim
	     behind it so a tap anywhere else folds it away. Desktop never shows any of this
	     (see the media block); the sidebar rail carries the tree there. -->
	{#if sidebarOpen}
		<button
			class="docs-scrim"
			aria-label="Close contents"
			transition:sbReveal={{ duration: 180 }}
			onclick={() => (sidebarOpen = false)}
		></button>
	{/if}
	<button
		type="button"
		class="docs-fab"
		aria-expanded={sidebarOpen}
		aria-label={sidebarOpen ? 'Hide contents' : 'Show contents'}
		onclick={() => (sidebarOpen = !sidebarOpen)}>{@html pageIcon}</button
	>

	<!-- The shell's own scroller — the window never scrolls this layout. The superbar
	     OVERLAYS this box, so content passes behind its frost; the styled scrollbar track's
	     top margin keeps the thumb's travel wholly in the content area (see .docs-scroll) —
	     the frost is real AND the scrollbar is never obscured. -->
	<div class="docs-scroll" bind:this={scrollEl} onscroll={onDocsScroll}>
	<div class="docs-cols">
		<!-- Sticky sidebar: the numbered docs TOC (the wordmark now lives in the superbar). -->
		<aside class="docs-sidebar" aria-label="Site contents">
			<nav class="docs-toc">
				<ol>
					{#each sections as { code, kids }, i}
						<li class="docs-sec" class:no-kids={!kids.length}>
							<a
								class="docs-sec-head"
								class:active={activeCode === code || (code === HUB && activeCode === null)}
								href={viewPath({ kind: 'port', code })}
								onclick={(e) => nav(e, code)}
								><span class="docs-num">{i + 1}.</span> {airports[code].title}</a
							>
							{#if kids.length}
								<ul>
									{#each kids as kid}
										<li>
											<a
												class="docs-leaf"
												class:active={activeCode === kid}
												href={viewPath({ kind: 'port', code: kid })}
												onclick={(e) => nav(e, kid)}
											>
												<span class="docs-bullet" aria-hidden="true"></span>{airports[kid].title}
											</a>
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ol>
			</nav>
		</aside>

		<!-- Content column (grid col 2): the page body. The body owns its own container — a prose
		     sheet, a bare self-sheeting reading (Densette), or a full-width figure. -->
		<main class="docs-content" bind:this={contentEl}>
			<div class="docs-body">
				{#if !view}
					<!-- Homepage under Pixelite: a documentation cover/index rather than the route map. -->
					<div class="docs-cover">
						<h1 class="docs-cover-title">Different, Together</h1>
						<p class="docs-cover-lede">
							A hand-built site and a small shelf of live apps. Pick a chapter from the contents.
						</p>
					</div>
				{:else}
					{@render body(view)}
				{/if}
			</div>
		</main>

		<!-- Right rail (grid col 3, desktop only): an on-this-page table of contents for the current
		     view. Empty on pages with no sections; collapses away on mobile. -->
		<nav class="docs-rail" aria-label="On this page">
			<div class="docs-rail-scroll">
				{#if toc.length}
					<p class="docs-rail-head">On this page</p>
					<ul class="docs-rail-list">
						{#each toc as item}
							<li class="docs-rail-item lvl-{item.level}">
								<a
									class="docs-rail-link"
									class:active={activeId === item.id}
									href={`#${item.id}`}
									onclick={(e) => tocJump(e, item.id)}>{item.text}</a
								>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</nav>
	</div>
	</div>
</div>

<style>
	/* The frame: a full-width superbar stacked over a three-column grid (TOC | content |
	   on-this-page rail, after makingsoftware's 5-col grid). Both rails are desktop-only; the
	   grid collapses to one content column on mobile (see the media block). */
	.docs {
		/* The content gutter, defined at the root so BOTH the body (its padding) and the
		   rails (their vertical insets) share one measure — content ink and rail
		   furniture start on the same line. Also consumed by full-bleed
		   children (the Emoji Viewer's sticky search bar) to margin back out.
		   Tightened now that the columns and the bar carry no borders: this one measure sets the
		   gap BETWEEN the columns (twice it, facing paddings) and the gap under the superbar (the
		   columns' top padding), so a smaller value pulls the whole grid in — the sheets' own inner
		   padding is untouched, so the reading keeps its breathing room. */
		--docs-pad: clamp(0.4rem, 0.9vw, 0.8rem);
		display: flex;
		flex-direction: column;
		/* The shell OWNS the viewport and its scrolling (see .docs-scroll): fixed height,
		   nothing overflows the window, so no window scrollbar ever appears beside the bar. */
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		position: relative;
		background: var(--page);
		color: var(--ink);
	}
	/* The scroller the superbar OVERLAYS (bar absolute, scroller padded under it) — this is
	   what lets content genuinely pass behind the bar and smear through its frost. The
	   scrollbar problem that arrangement caused (the bar frosting over the thumb's top) is
	   solved at the TRACK, not the box: the styled track below carries margin-top by the
	   bar's measure, so the thumb's whole travel lives in the content area while the scroll
	   box still runs behind the frost. Both wants, one scroller. */
	.docs-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		box-sizing: border-box;
		padding-top: var(--superbar-h);
	}
	/* The manual's own scrollbar (styling any ::-webkit-scrollbar part opts out of the
	   native overlay bars, so the whole set is stated): a slim transparent gutter, the
	   thumb an ink wash on the key radius. Firefox has no track margins — scrollbar-color
	   keeps it on-palette there, and its full-height thumb simply shows through the bar's
	   78% frost, dimmed. */
	.docs-scroll::-webkit-scrollbar {
		width: 10px;
	}
	.docs-scroll::-webkit-scrollbar-track {
		background: transparent;
		margin-top: var(--superbar-h);
	}
	/* LITERALS in the scrollbar pseudos — custom properties and color-mix() don't resolve
	   inside ::-webkit-scrollbar parts (the declaration silently dies and the thumb paints
	   NOTHING), so the ink wash is stated raw, with the dark arm keyed to the .scheme-dark
	   root class the way pixelite.css's dark stock is. */
	.docs-scroll::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.28);
		border-radius: 4px;
		border: 2px solid transparent;
		background-clip: padding-box;
	}
	.docs-scroll::-webkit-scrollbar-thumb:hover {
		background: rgba(0, 0, 0, 0.45);
		border: 2px solid transparent;
		background-clip: padding-box;
	}
	:global(html.scheme-dark) .docs-scroll::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.3);
	}
	:global(html.scheme-dark) .docs-scroll::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.5);
	}
	/* Firefox ONLY (no ::-webkit-scrollbar there): scrollbar-color keeps the thumb
	   on-palette. It must NOT reach Chrome — a non-auto scrollbar-color DISABLES every
	   ::-webkit-scrollbar rule above, track margin included, which is the whole trick. */
	@supports not selector(::-webkit-scrollbar) {
		.docs-scroll {
			scrollbar-color: color-mix(in srgb, var(--ink) 30%, transparent) transparent;
		}
	}
	.docs-cols {
		display: grid;
		grid-template-columns: clamp(240px, 22vw, 300px) minmax(0, 1fr) clamp(150px, 15vw, 230px);
		/* Fill the scroller's content box (its height minus the bar's padding-top), so the
		   rail borders run the full visible height even on short pages. */
		min-height: 100%;
	}
	/* ── Superbar ────────────────────────────────────────────────────────────── */
	.docs-superbar {
		/* Absolute over the scroller: content passes BEHIND the bar (the frost is real),
		   while the styled scrollbar track's margin keeps the thumb below it — see
		   .docs-scroll. */
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: clamp(1rem, 3vw, 2rem);
		/* ONE bar height across the site — 42px exactly, not padding-derived: every app bar
		   (traffic, ranger, star map) pins to the same measure, so crossing pages never
		   nudges the chrome. Flex centring seats the content; --superbar-h still reads the
		   real rect, so the rails don't care how the height is made. */
		box-sizing: border-box;
		height: 42px;
		/* Left inset matches the vertical rhythm so the wordmark sits square in the corner. */
		padding: 0 clamp(1rem, 3vw, 2rem) 0 0.7rem;
		/* No hairline under the bar: space and the page/sheet colour tell it from the content,
		   not a drawn line. On scroll the frost alone reads as the bar (see .scrolled). */
		background: color-mix(in srgb, var(--page) 100%, transparent);
		transition:
			background 0.2s ease,
			backdrop-filter 0.2s ease;
	}
	/* Translucent + blurred once the page scrolls under it; a clean edge at the top. */
	.docs-superbar.scrolled {
		background: color-mix(in srgb, var(--page) 78%, transparent);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
	}
	/* The wordmark speaks in the body voice; the pixel accent stays with the numerals.
	   (VT323 ran optically small at 1.4rem — the body face sits right at 1.15rem/600.) */
	.docs-wordmark {
		flex: none;
		font-family: var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-weight: 600;
		font-size: 1.15rem;
		line-height: 1;
		color: var(--orange);
		text-decoration: none;
	}
	/* ── Superbar search (Emoji page): ONE plastic key that morphs into a keyed field. ──
	   The width animates on the single .docs-sb-ctl element — open and closed are the same
	   box, so expanding and folding are one continuous motion (the CitySearch lesson). The
	   icon sits at the RIGHT end, exactly where the closed key stands: it is the anchor the
	   field grows leftward away from, and folds back into. Taller than the bar's text line,
	   so negative block margins let it overhang instead of stretching the superbar (whose
	   height feeds every sticky offset). */
	.docs-sb-search {
		flex: none;
		display: flex;
		align-items: center;
		margin-block: -0.4rem;
		/* Even air around the key's corner: the 28px key sits 7px off the bar's top and
		   bottom edges ((42px bar − 28px key)/2), but the bar's wide right padding — sized
		   for the TEXT row — left it up to 2rem off the right edge. Pull right by the
		   difference so the key's right gap matches its vertical air. */
		margin-right: calc(7px - clamp(1rem, 3vw, 2rem));
	}
	.docs-sb-ctl {
		display: flex;
		align-items: center;
		/* 28px: the manual's one control line (pixelite.css .icon-btn note). */
		width: 28px;
		height: 28px;
		overflow: hidden;
		background: var(--pixel-key-face, rgba(255, 255, 255, 0.5));
		border: 1px solid var(--pixel-key-border, rgba(0, 0, 0, 0.5));
		border-radius: 4px;
		box-shadow: var(--pixel-bevel);
		/* The manual's minor bounce (--pixel-pop, pixelite.css) — the same landing pop the
		   Weather and Star Map fields make, opening and closing alike. */
		transition:
			width 0.24s var(--pixel-pop, ease),
			border-color 0.15s ease;
	}
	.docs-sb-ctl.open {
		width: clamp(10rem, 24vw, 15rem);
	}
	.docs-sb-ctl.open:focus-within {
		border-color: var(--orange);
	}
	/* The icon is the button in both states — open it, or fold it shut. It never moves. */
	.docs-sb-ico-btn {
		flex: none;
		display: grid;
		place-items: center;
		width: calc(28px - 2px);
		height: 100%;
		padding: 0;
		color: var(--ink);
		background: none;
		border: 0;
		cursor: pointer;
	}
	.docs-sb-ico-btn:hover {
		color: var(--orange);
	}
	.docs-sb-ico-btn :global(svg) {
		display: block;
		width: 1.05rem;
		height: 1.05rem;
	}
	/* The input is always mounted — width 0 and silent while closed, so the morph never
	   swaps elements; it just uncovers what was already there. */
	.docs-sb-input {
		flex: 1 1 auto;
		min-width: 0;
		width: 0;
		height: 100%;
		padding: 0;
		border: 0;
		background: none;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		color: var(--ink);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
	}
	.docs-sb-ctl.open .docs-sb-input {
		padding: 0 0.15rem 0 0.6rem;
		opacity: 1;
		pointer-events: auto;
	}
	.docs-sb-input::placeholder {
		color: var(--sub);
		letter-spacing: 0.08em;
	}
	.docs-sb-input:focus-visible {
		outline: none;
	}
	.docs-sb-input::-webkit-search-cancel-button {
		display: none;
	}
	/* The control's reveal/retreat lives in the sbReveal Svelte transition (both directions). */
	@media (prefers-reduced-motion: reduce) {
		.docs-sb-ctl {
			transition: none;
		}
	}
	/* Hairline post between the wordmark and the breadcrumb trail. Its air matches the
	   wordmark's 0.7rem frame (bar padding), overriding the bar's wider flex gap. */
	.docs-brand-sep {
		flex: none;
		align-self: stretch;
		width: 1px;
		/* The bar's block padding used to bound the stretch; with the bar's height now fixed
		   (padding-block 0), the same 0.7rem air is restated as the post's own margins — the
		   full-height line read as a column rule, not a separator. */
		margin-block: 0.7rem;
		margin-inline: calc(0.7rem - clamp(1rem, 3vw, 2rem));
		background: var(--pixel-hairline);
	}
	.docs-crumbs {
		flex: 1;
		min-width: 0;
		/* A flex row of keyed crumb units (was inline text) so each unit can take the transform
		   its add/remove transition sets. Stretched to the full bar height and clipping its
		   overflow, so a crumb's rise-and-fade plays inside the bar without being cut and without
		   spilling toward the search. */
		align-self: stretch;
		display: flex;
		align-items: center;
		overflow: hidden;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.72rem;
		color: color-mix(in srgb, var(--ink) 40%, transparent);
		white-space: nowrap;
	}
	/* One crumb POSITION: its leading "/" and the swap slot. inline-flex, baseline-aligned, so
	   the separator rests on the crumb text's baseline. */
	.docs-crumb-unit {
		flex: none;
		display: inline-flex;
		align-items: baseline;
		white-space: nowrap;
	}
	/* The swap slot: both {#key} faces occupy ONE grid cell, overlaid — so an outgoing crumb and
	   the incoming one run as a vertical current in the same place (old drops out the bottom, new
	   drops in from the top) instead of sitting side by side and colliding. Clipped, so each slide
	   plays inside the slot; the column sizes to the wider face during the brief overlap. */
	.docs-crumb-slot {
		display: grid;
		align-items: baseline;
		overflow: hidden;
	}
	.docs-crumb-face {
		grid-area: 1 / 1;
		min-width: 0;
		white-space: nowrap;
	}
	/* The open page — the trailing crumb — reads in full ink. Keyed on aria-current, not
	   :last-child: every unit now holds a crumb, so :last-child would brighten them all. */
	.docs-crumb[aria-current='page'] {
		color: var(--ink);
	}
	/* Ancestor crumbs navigate — quiet until hovered, then cobalt like every docs link. */
	a.docs-crumb {
		color: inherit;
		text-decoration: none;
	}
	a.docs-crumb:hover,
	a.docs-crumb:focus-visible {
		color: var(--orange);
	}
	.docs-crumb-sep {
		margin: 0 0.5rem;
		font-family: var(--font-pixel);
		font-size: 1.15em;
		color: color-mix(in srgb, var(--ink) 30%, transparent);
	}
	/* The pixel accent for numerals — TOC section numbers, cover numbers. Bumped ~15% to match
	   the optical size of the mono around it. */
	.docs-num {
		font-family: var(--font-pixel);
		font-size: 1.15em;
		letter-spacing: 0;
	}
	/* ── Sidebar ─────────────────────────────────────────────────────────────── */
	.docs-sidebar {
		position: sticky;
		/* top 0, not var(--superbar-h): sticky offsets resolve against the scroller's CONTENT
		   edge, and .docs-scroll's padding-top already clears the bar — the bar-height offset
		   here stacked ON TOP of that padding and shoved the rail (and its column rule) 42px
		   below the bar's hairline on any page tall enough to scroll. */
		top: 0;
		align-self: start;
		height: calc(100vh - var(--superbar-h));
		height: calc(100dvh - var(--superbar-h));
		overflow-y: auto;
		/* Contain overscroll — the sidebar (desktop rail and mobile receipt) never chains its
		   scroll to the page (the iOS scroll-lock). */
		overscroll-behavior: contain;
		box-sizing: border-box;
		/* The same measure as the content gutter — the three columns share one rhythm. No
		   right-hand rule: the gutter of space between the nav and the sheet is the divide. */
		padding: var(--docs-pad);
	}
	.docs-toc ol {
		list-style: none;
		margin: 0;
		padding: 0;
		counter-reset: none;
	}
	.docs-sec {
		margin-bottom: 0.9rem;
	}
	/* A section with no sub-entries (1. Home) is just a line, not a group — no group air
	   below it, so it sits directly over the next section head like consecutive lines. */
	.docs-sec.no-kids {
		margin-bottom: 0;
	}
	.docs-sec.no-kids .docs-sec-head {
		margin-bottom: 0;
	}
	/* The list mirrors the superbar's pairing: parents in the body voice (like the
	   wordmark), children in mono (like the breadcrumbs). */
	.docs-sec-head {
		display: block;
		font-family: var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
		font-size: 0.82rem;
		color: var(--ink);
		text-decoration: none;
		margin-bottom: 0.5rem;
	}
	.docs-sec-head:hover,
	.docs-sec-head.active {
		color: var(--orange);
	}
	.docs-toc ul {
		list-style: none;
		margin: 0;
		/* Leaves step clearly in from their numbered section head. */
		padding: 0 0 0 1.1rem;
	}
	.docs-toc ul li {
		margin: 0.15rem 0;
	}
	.docs-leaf {
		display: flex;
		align-items: baseline;
		gap: 0.55rem;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.75rem;
		line-height: 1.7;
		color: color-mix(in srgb, var(--ink) 80%, transparent);
		text-decoration: none;
	}
	.docs-bullet {
		flex: none;
		width: 4px;
		height: 4px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--ink) 40%, transparent);
		transform: translateY(-0.2em);
	}
	.docs-leaf:hover,
	.docs-leaf.active {
		color: var(--orange);
	}
	.docs-leaf:hover .docs-bullet,
	.docs-leaf.active .docs-bullet {
		background: var(--orange);
	}
	/* ── Content column ──────────────────────────────────────────────────────── */
	.docs-content {
		position: relative;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	/* The content column's gutter. The page body renders its OWN container inside this — a bare
	   .docs-prose column (block pages + Settings), a full-bleed self-chrome reading, or Densette's
	   own paper — all defined with the body in +page.svelte. */
	.docs-body {
		/* The gutter itself — --docs-pad now lives on .docs so the rails share it. */
		flex: 1;
		padding: var(--docs-pad);
	}
	/* ── Homepage cover ──────────────────────────────────────────────────────── */
	/* The cover rides the same SHEET OF PAPER as the docs pages (Densette's) — a white sheet on
	   the grey gutter, capped to the cover's reading measure so it's a title card, not a wide
	   band. --page is already Densette's grey, so the sheet is the white fill, the ink hairline,
	   the 2px cut and the print shadow. (Its children keep their own settle below; the box is
	   static.) */
	.docs-cover {
		/* Same borderless leaf as .docs-sheet: the white fill on the grey gutter is the whole
		   card now — no hairline, no print shadow. Space and colour, not a drawn edge. The inner
		   padding stays; only the outer gutter around the sheet is gone (see .docs-body). */
		max-width: calc(65ch + 2 * clamp(1.25rem, 3vw, 2.25rem));
		background: light-dark(#ffffff, #202023);
		border-radius: 2px;
		padding: clamp(1.25rem, 3vw, 2.25rem);
	}
	/* Entrance — the cover settles top-to-bottom in the same cadence as the docs pages. */
	@media (prefers-reduced-motion: no-preference) {
		.docs-cover > * {
			animation: docs-cover-settle 0.45s ease backwards;
		}
		.docs-cover > :nth-child(2) {
			animation-delay: 0.06s;
		}
		.docs-cover > :nth-child(n + 3) {
			animation-delay: 0.12s;
		}
	}
	@keyframes docs-cover-settle {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.docs-cover-title {
		font-family: var(--font-motto);
		font-weight: 400;
		font-size: clamp(2.4rem, 6vw, 3.6rem);
		letter-spacing: -0.02em;
		line-height: 1.05;
		color: color-mix(in srgb, var(--ink) 88%, transparent);
		margin: 0 0 1rem;
	}
	.docs-cover-lede {
		font-family: var(--font-motto);
		font-size: 1.2rem;
		line-height: 1.6;
		color: color-mix(in srgb, var(--ink) 70%, transparent);
		/* Last line on the sheet — the sheet's own bottom padding is the air, no trailing margin. */
		margin: 0;
	}
	/* ── Right rail (grid col 3): the on-this-page TOC ── */
	.docs-rail {
		position: sticky;
		top: 0; /* the scroller's padding clears the bar — see the sidebar's note */
		align-self: start;
		height: calc(100vh - var(--superbar-h));
		height: calc(100dvh - var(--superbar-h));
		box-sizing: border-box;
		/* The same measure as the content gutter — the three columns share one rhythm. The
		   rail itself never scrolls — the text strip inside owns the scrolling. No left-hand
		   rule: the gutter of space between the sheet and the rail is the divide. */
		padding: var(--docs-pad);
		overflow: hidden;
	}
	.docs-rail-scroll {
		height: 100%;
		min-width: 0;
		overflow-y: auto;
		/* Contain overscroll — the on-this-page rail never chains to the page (the iOS scroll-lock). */
		overscroll-behavior: contain;
	}
	/* Same pairing as the superbar and sidebar: head in the body voice, links in mono. */
	.docs-rail-head {
		margin: 0 0 0.9rem;
		font-family: var(--font-body);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-size: 0.68rem;
		color: color-mix(in srgb, var(--ink) 40%, transparent);
	}
	.docs-rail-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.docs-rail-item {
		margin: 0.1rem 0;
	}
	/* The page-title entry leads the rail; a hair of air below it sets the title off from
	   the section list that follows (when there is one). */
	.docs-rail-item.lvl-1 {
		margin-bottom: 0.35rem;
	}
	.docs-rail-item.lvl-3 {
		padding-left: 0.85rem;
	}
	.docs-rail-link {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1.4;
		letter-spacing: 0.01em;
		padding: 0.15rem 0;
		color: color-mix(in srgb, var(--ink) 55%, transparent);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* The title reads a touch stronger than the sections beneath it — near-full ink and a
	   heavier weight, so it anchors the rail without shouting. */
	.docs-rail-item.lvl-1 .docs-rail-link {
		color: color-mix(in srgb, var(--ink) 78%, transparent);
		font-weight: 600;
	}
	.docs-rail-item.lvl-3 .docs-rail-link {
		color: color-mix(in srgb, var(--ink) 42%, transparent);
	}
	/* The lvl-1/lvl-3 tints above are more specific than .active alone — repeat them here so
	   the title and sub-items light up cobalt exactly like their siblings. */
	.docs-rail-link:hover,
	.docs-rail-link.active,
	.docs-rail-item.lvl-1 .docs-rail-link:hover,
	.docs-rail-item.lvl-1 .docs-rail-link.active,
	.docs-rail-item.lvl-3 .docs-rail-link:hover,
	.docs-rail-item.lvl-3 .docs-rail-link.active {
		color: var(--orange);
	}
	/* ── Mobile contents key (floating) + its scrim ──────────────────────────────
	   Both hidden until the mobile media block shows them. The key floats at the
	   viewport's bottom-LEFT — fixed, so it's reachable and visible at any scroll
	   depth — wearing the open page's mark. 40px, deliberately off the 28px control
	   line: a floating key is hit by a thumb mid-scroll, not a pointer, and 28px is
	   below a comfortable touch target. Same plastic-key material as the family. */
	.docs-fab {
		display: none;
		position: fixed;
		left: 1.25rem;
		bottom: 1.25rem;
		z-index: 19;
		place-items: center;
		box-sizing: border-box;
		width: 40px;
		height: 40px;
		padding: 0;
		color: var(--ink);
		/* The superbar's own frost, worn as the key face: the same page-mix opacity and blur
		   as .docs-superbar.scrolled, so the two floating layers read as one material with
		   content smearing beneath them. */
		background: color-mix(in srgb, var(--page) 78%, transparent);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		border: 1px solid var(--pixel-key-border);
		border-radius: 4px;
		box-shadow: var(--pixel-bevel);
		cursor: pointer;
	}
	.docs-fab:active {
		box-shadow: var(--pixel-bevel-press);
	}
	.docs-fab[aria-expanded='true'] {
		color: var(--orange);
		border-color: var(--orange);
	}
	.docs-fab :global(svg) {
		display: block;
		width: 1.35rem;
		height: 1.35rem;
	}
	/* The scrim: a faint ink veil over the page while the flyout stands, and the tap-anywhere
	   dismissal. Under the flyout and the key; under the superbar too, so the bar stays live. */
	.docs-scrim {
		display: none;
		position: fixed;
		inset: 0;
		z-index: 17;
		padding: 0;
		/* A real DIM in both schemes — a black wash, NOT --ink: --ink is light on a dark page, so
		   mixing it in lightened the backdrop instead of dimming it. Light mode wants only a faint
		   veil; dark mode a firmer one to read as a dim over an already-dark page. */
		background: rgba(0, 0, 0, 0.08);
		border: 0;
		cursor: default;
	}
	:global(html.scheme-dark) .docs-scrim {
		background: rgba(0, 0, 0, 0.55);
	}

	@media (max-width: 860px) {
		.docs-cols {
			grid-template-columns: 1fr;
		}
		/* A blank foot at the bottom of the scroll for the floating contents key to rest in — the
		   key is fixed at the viewport's bottom-left, so without this the last line of a page
		   scrolled up UNDER it. Clears the key's height (40px) plus its 1.25rem inset and a gap.
		   On the scroller (outside Densette's bleeding gutter), so it reads as page background for
		   every page — sheet or bare paper — rather than fighting a component's own margins. */
		.docs-scroll {
			padding-bottom: calc(40px + 2.5rem);
		}
		/* The breadcrumb hides on a phone; the wordmark keeps the bar's left end to itself
		   (the contents control now floats at the bottom-left instead of riding the bar). Its
		   leading separator goes with it — with no crumbs after it, the post was a divider
		   dangling off the wordmark with nothing on its far side. */
		.docs-crumbs,
		.docs-brand-sep {
			display: none;
		}
		/* With the breadcrumb gone, its flex:1 no longer pushes the Emoji page's superbar search
		   to the right end — it would sit against the wordmark. Auto left margin sends it back to
		   the bar's right edge. */
		.docs-sb-search {
			margin-left: auto;
		}
		.docs-fab {
			display: grid;
		}
		.docs-scrim {
			display: block;
		}
		/* The site tree opens as a RECEIPT printing out of the superbar: a fixed paper sheet
		   flush under the bar — NO top border and square top corners, so the bar's own bottom
		   hairline reads as the slot it feeds from — visible at any scroll depth. Below the
		   bar in the stack (18 vs 20), so the motion happens BEHIND it: closed, the sheet is
		   translated fully above the viewport; opening slides it down out of the frost,
		   closing feeds it back up. Transform + visibility, not display — display can't
		   transition, and the sheet must stay laid out to slide both ways. */
		.docs-sidebar {
			display: block;
			position: fixed;
			top: var(--superbar-h);
			/* Line up with the SHEET underneath: inset by --docs-pad each side (the content
			   gutter the sheet sits in), so the receipt's edges match the page's sheet rather
			   than capping at a narrow 300px column. The sheet lives inside the scroller, whose
			   scrollbar gutter (--scrollbar-w, measured) narrows its content — subtract it so the
			   fixed receipt, sized off 100vw, doesn't overrun the sheet's right edge. */
			left: var(--docs-pad);
			z-index: 18;
			height: auto;
			width: calc(100vw - 2 * var(--docs-pad) - var(--scrollbar-w, 0px));
			max-height: calc(100vh - var(--superbar-h) - 5rem);
			max-height: calc(100dvh - var(--superbar-h) - 5rem);
			overflow-y: auto;
			/* Roomier inside than the desktop rail's tight --docs-pad gutter: the receipt is a menu
			   you TAP, so it wants air between its edges and its rows. Independent of --docs-pad
			   (which stayed tight for the desktop columns). */
			padding: clamp(1rem, 5vw, 1.5rem);
			background: var(--page);
			border: 1px solid var(--pixel-hairline);
			border-top: 0;
			border-radius: 0 0 4px 4px;
			/* A drop shadow below, AND a soft TOP INSET shadow: with no top border (the receipt
			   feeds flush from under the bar), the bar and the flyout read as one light plane.
			   The inset shades the flyout's top edge as if the bar casts onto it, telling the two
			   apart. Negative spread keeps it to the top lip, off the sides and bottom. */
			box-shadow:
				0 8px 22px color-mix(in srgb, var(--ink) 10%, transparent),
				inset 0 8px 13px -9px color-mix(in srgb, var(--ink) 15%, transparent);
			/* Parked above the viewport entirely (own height + the bar's), not just behind the
			   bar: the scrolled bar is translucent frost, and a sheet parked behind it would
			   show through. */
			transform: translateY(calc(-100% - var(--superbar-h)));
			visibility: hidden;
			/* Exit: the slide plays first, visibility cuts only after it lands. */
			transition:
				transform 0.28s ease,
				visibility 0s linear 0.28s;
		}
		.docs.sidebar-open .docs-sidebar {
			transform: translateY(0);
			visibility: visible;
			/* Enter: visible at once, then the feed-out plays. */
			transition: transform 0.28s ease;
		}
		@media (prefers-reduced-motion: reduce) {
			.docs-sidebar,
			.docs.sidebar-open .docs-sidebar {
				transition: none;
			}
		}
		/* The rows breathe more in the touch flyout than in the dense desktop rail — bigger gaps
		   between sections, heads and leaves, so each is a comfortable tap target. */
		.docs-sec {
			margin-bottom: 1.35rem;
		}
		.docs-sec-head {
			margin-bottom: 0.7rem;
		}
		.docs-toc ul li {
			margin: 0.4rem 0;
		}
		/* Both margins fold away — the content column takes the whole width. */
		.docs-rail {
			display: none;
		}
		/* The cover bleeds its bottom into the gutter (like the sheets and Densette's paper), so
		   its blank foot below is just the scroller's foot — a uniform 1.25rem above the floating
		   key, not the gutter's --docs-pad on top of it. */
		.docs-cover {
			margin-bottom: calc(-1 * var(--docs-pad));
		}
	}
</style>
