<script lang="ts">
	import { onMount, onDestroy, tick, untrack, type Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { HUB, children, airports, parentOf, PORT_ICONS } from '$lib/places';
	import { viewPath, type View } from '$lib/views';
	import { emojiSearch } from '$lib/emoji-search.svelte';
	import { SEARCH_SVG } from '$lib/icons';
	import FloatingKey from '$lib/FloatingKey.svelte';

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
		barTitle = '',
		onNavigate,
		body
	}: {
		view?: View | null;
		activeCode?: string | null;
		/* The open page's mark (+page's PORT_ICONS) — worn by the mobile floating key. */
		pageIcon?: string;
		/* The open page's name, for the BAR, on a phone only. At that width every page hands its
		   title up here instead of printing it on the sheet, so the first screen is the page
		   itself, not a cover — the arrangement Air Traffic's own bar has, and the same handoff
		   the Emoji page makes with its search. The page keeps its <h1> (screen-reader-only
		   there); this is the visible echo, so it is aria-hidden. Empty on the hub, which is the
		   site's own cover and has no crumbs either. */
		barTitle?: string;
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
					? [...(children[code] ?? [])].sort((a, b) =>
							airports[a].title.localeCompare(airports[b].title)
						)
					: (children[code] ?? [])
		}))
	]);

	// ── The phone's pinned destinations ───────────────────────────────────────────
	// On a phone the shell offers THREE doors, not the whole tree: Home, Apps, Settings. The
	// receipt that used to print the full outline is gone — fourteen rows was a table of contents
	// for a document, and what a thumb wants is a place to go. Everything is still two taps away
	// (Apps carries every app's card; Home is the index), and the tree itself is what the DESKTOP
	// rail is for.
	//
	// CODES, not titles — the register owns the naming, so a rename in places.ts follows here. The
	// filter is the same insurance the rest of the shell keeps: a code that leaves the register
	// drops out of the stack rather than rendering a blank key.
	const PINNED = ['APP', 'STG'];
	const pinned = $derived([HUB, ...PINNED].filter((code) => airports[code]));

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

	// The separator's own fade. Out on a DELAY, so the word leaves and the "/" follows it rather
	// than the two going together; in with none, so it leads on the way back. Wrapped rather than
	// used inline because svelte/transition's fade knows nothing about reduced motion, and under
	// `reduce` a 240ms tail on the separator kept a crumb mounted long after the trail had landed.
	const sepIn = (node: Element) => fade(node, { duration: stillMotion() ? 0 : 120 });
	const sepOut = (node: Element) =>
		fade(node, stillMotion() ? { duration: 0 } : { duration: 120, delay: 120 });

	// ── The trail changes ONE THING AT A TIME ──────────────────────────────────────
	// A swap at a slot reads well because both faces are stacked in the same place: nothing moves
	// sideways, so the eye has one thing to follow. A change of DEPTH did not, because the trail
	// did everything at once — going APPS / WEATHER → SETTINGS, the first slot started widening
	// to hold SETTINGS at the very instant WEATHER began sliding out, so WEATHER was shoved to the
	// right while it fell. Two motions at right angles on the same object, and the width they
	// argue over is the whole trail's, which is why it only showed when the depths differed.
	// The answer is to REFUSE the simultaneity rather than to smooth it: the rendered trail lags
	// the real one and walks to it a step at a time, innermost crumb first —
	//   APPS / WEATHER  →  APPS  →  SETTINGS
	// — so each beat is a single event with nothing else in flight, and by the time the surviving
	// slot changes width there is nothing to its right left to push. Every step is a plain mount
	// or unmount, so the existing face motion does the work unaltered: the beat that "looks great"
	// today is the beat this now plays three times instead of once.
	// Deepening runs the same machine backwards (swap first, then the new crumb arrives), because
	// the steps are derived from the difference, not from a direction.
	const CRUMB_SHRINK = 240; // a crumb leaves: it slides out, then its "/" fades after it
	const CRUMB_SWAP = 220; // a slot's face is exchanged in place
	const CRUMB_GROW = 240; // a crumb arrives
	// Seeded from the derived value rather than from [] so the first paint is the real trail —
	// the machine is for CHANGES, and a page's first crumbs are not one. untrack() states that the
	// one-off read is deliberate (it is also what silences the compiler's warning about it).
	let shownCrumbs = $state<string[]>(untrack(() => crumbs));
	let crumbTimer: ReturnType<typeof setTimeout> | undefined;
	function stepCrumbs(target: string[]) {
		clearTimeout(crumbTimer);
		const shown = untrack(() => shownCrumbs);
		// With motion turned down the faces cross in zero time, so staging the beats would not be a
		// sequence of movements — it would be a sequence of JUMPS, spread over half a second, which
		// is the one thing worse than the collision this machine exists to prevent. Land it whole.
		if (stillMotion()) {
			shownCrumbs = target;
			return;
		}
		// Deepest first, one per beat: a crumb can only leave from the end of the trail.
		if (shown.length > target.length) {
			shownCrumbs = shown.slice(0, -1);
			crumbTimer = setTimeout(() => stepCrumbs(target), CRUMB_SHRINK);
			return;
		}
		// Then the survivors that disagree — all of them together, and that is safe: a swap happens
		// IN its slot, so two of them cannot collide the way an add and a remove can.
		if (shown.some((c, i) => c !== target[i])) {
			shownCrumbs = target.slice(0, shown.length);
			crumbTimer = setTimeout(() => stepCrumbs(target), CRUMB_SWAP);
			return;
		}
		// Then grow, again one per beat.
		if (shown.length < target.length) {
			shownCrumbs = target.slice(0, shown.length + 1);
			crumbTimer = setTimeout(() => stepCrumbs(target), CRUMB_GROW);
			return;
		}
	}
	$effect(() => {
		const target = crumbs;
		stepCrumbs(target);
		// A second navigation mid-sequence abandons the first: stepCrumbs re-enters with the new
		// target from wherever the trail has got to, which is always a valid place to start.
		return () => clearTimeout(crumbTimer);
	});

	// The crumb that is the OPEN PAGE, taken from the real trail and not the rendered one. Mid
	// sequence the two disagree — the trail can be showing APPS alone while the page is already
	// Settings — and keying the full-ink state off the rendered trail made that intermediate APPS
	// light up as "you are here" for a beat before being swapped away. It is a link the whole
	// time now, and the ink moves once, when the last beat lands.
	const currentCrumb = $derived(crumbs.length ? crumbs[crumbs.length - 1] : null);

	// Mobile: the sidebar rail is desktop-only; the floating key discloses the pinned stack.
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

	onMount(() => {
		onDocsScroll();
		// Measure synchronously first — ResizeObserver delivery rides the render frame, which
		// a hidden/background tab suspends, and the first paint shouldn't wait for it anyway.
		if (superbarEl) superbarH = superbarEl.getBoundingClientRect().height;
		const ro = new ResizeObserver(() => {
			if (superbarEl) superbarH = superbarEl.getBoundingClientRect().height;
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
			el.getBoundingClientRect().top -
				sc.getBoundingClientRect().top +
				sc.scrollTop -
				superbarH -
				subH -
				14
		);
		const start = sc.scrollTop;
		const dist = target - start;
		if (Math.abs(dist) < 2) return;
		cancelAnimationFrame(jumpRaf);
		clearTimeout(jumpFallback);
		if (
			typeof matchMedia !== 'undefined' &&
			matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
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

<!-- The phone's pinned stack — the three doors, as labelled keys rather than the bare discs the
     Ranger's stack carries. Its keys are VERBS on a screen you are already looking at ("pause",
     "home"), and a glyph is enough for those; these are DESTINATIONS, and a place on this site is
     read by its name everywhere else — the crumb, the card, the rail. The mark leads, the name
     follows, the way the receipt's rows did.
     Real anchors with real hrefs, so a long-press or a modified click behaves like every other
     link here (nav() hands the plain ones back to the page's own router and folds the stack).
     Order is Home, Apps, Settings — .fkey-stack is column-reverse, so the first one written is the
     one nearest the thumb. -->
{#snippet pinnedKeys()}
	{#each pinned as code}
		<a
			class="docs-key"
			class:active={activeCode === code || (code === HUB && activeCode === null)}
			href={viewPath({ kind: 'port', code })}
			onclick={(e) => nav(e, code)}
			><span class="docs-key-mark" aria-hidden="true">{@html PORT_ICONS[code] ?? ''}</span
			>{airports[code].title}</a
		>
	{/each}
{/snippet}

<div class="docs" style="--superbar-h: {superbarH}px">
	<!-- Full-width superbar over all three columns: the wordmark at its left end, the breadcrumb
	     trail beside it, and (on mobile) a plastic-key MENU that discloses the sidebar. It sticks
	     to the top and blurs once the page scrolls under it. -->
	<header
		class="docs-superbar"
		class:scrolled
		class:has-bar-title={barTitle}
		bind:this={superbarEl}
	>
		<a
			class="docs-wordmark"
			href={viewPath({ kind: 'port', code: HUB })}
			onclick={(e) => nav(e, HUB)}>KASHINOGA</a
		>
		{#if shownCrumbs.length}
			<span class="docs-brand-sep" aria-hidden="true" transition:fade={{ duration: 180 }}></span>
		{/if}
		<!-- The trail is ALWAYS mounted (even empty), so add/remove and swaps both animate.
		     It renders shownCrumbs, NOT crumbs: the rendered trail lags the real one and walks to
		     it a beat at a time, so a change of depth never runs two motions at once (see the
		     trail-changes note in the script).
		     The each is keyed BY POSITION (i), so a unit is a stable SLOT: navigating between
		     siblings/sections swaps the code AT a slot rather than removing one crumb and adding
		     another at the same spot — which is what made the outgoing and incoming crumbs sit
		     side by side and collide. Inside each slot, {#key c} re-mounts the crumb FACE when the
		     code there changes, and the two faces are grid-STACKED (see .docs-crumb-slot), so the
		     old drops out the bottom while the new drops in from the top, IN PLACE — one vertical
		     current, never two crumbs abreast. Adding/removing a slot at the trail's end animates
		     the same way (the face has no sibling to overlap).
		     The separator fades on its own clock, and out LAST: a crumb's word leaves first and its
		     "/" follows it, so the pair reads as one thing withdrawing rather than a word and a
		     mark vanishing together. Coming back it leads, which is the same rule read backwards. -->
		<nav class="docs-crumbs" aria-label="Breadcrumb">
			{#each shownCrumbs as c, i (i)}
				<span class="docs-crumb-unit">
					{#if i > 0}<span
							class="docs-crumb-sep"
							aria-hidden="true"
							in:sepIn|global
							out:sepOut|global>/</span
						>{/if}<span class="docs-crumb-slot">
						{#key c}<span class="docs-crumb-face" in:crumbIn|global out:crumbOut|global
								>{#if c !== currentCrumb}<a
										class="docs-crumb"
										href={viewPath({ kind: 'port', code: c })}
										onclick={(e) => nav(e, c)}>{airports[c].title}</a
									>{:else}<span class="docs-crumb" aria-current="page">{airports[c].title}</span
									>{/if}</span
							>{/key}
					</span>
				</span>
			{/each}
		</nav>
		<!-- The phone's stand-in for the breadcrumb (which hides at this width): the open page's
		     name, in the trail's own voice and full ink — the last crumb, standing alone. Always
		     in the DOM when set, hidden by the media block above 860px, so nothing depends on a
		     measured viewport. aria-hidden: the page's own <h1> is still the heading, it is only
		     screen-reader-only there. -->
		{#if barTitle}
			<span class="docs-sb-title" aria-hidden="true">{barTitle}</span>
		{/if}
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

	<!-- Mobile contents control: $lib/FloatingKey, the same object the Park Ranger and the Traffic
	     board carry — a plastic key at the viewport's bottom-left wearing the OPEN PAGE's mark (so
	     it doubles as a "you are here" badge), disclosing a short stack above it, with a scrim to
	     tap away. It replaces a hand-built key, scrim, frosted cove and full-height receipt that
	     printed the entire site tree: the fourth copy of a shape the shell already had a component
	     for, carrying a table of contents where a thumb wanted a destination.
	     Desktop shows none of it (see the media block); the sidebar rail carries the tree there.
	     The WRAPPER is what does that hiding, and it has to be a wrapper: FloatingKey draws three
	     fixed layers (key, flyout, scrim) and owns their display itself, so there is no single box
	     of its own to switch off from out here — but display:none on an ancestor takes a fixed
	     descendant with it. The app callers gate theirs in the page instead (PUD and ATFC render
	     the component only when isMobile); the shell has no such flag, and a media query is the
	     truer statement anyway — this is about the width, not the device. -->
	<div class="docs-fkey">
		<FloatingKey bind:open={sidebarOpen} icon={pageIcon} label="Contents" buttons={pinnedKeys} />
	</div>

	<!-- The shell's own scroller — the window never scrolls this layout. The superbar
	     OVERLAYS this box, so content passes behind its frost; the styled scrollbar track's
	     top margin keeps the thumb's travel wholly in the content area (see .docs-scroll) —
	     the frost is real AND the scrollbar is never obscured. -->
	<div class="docs-scroll" bind:this={scrollEl} onscroll={onDocsScroll}>
		<div class="docs-cols">
			<!-- Sticky sidebar: the numbered docs TOC (the wordmark now lives in the superbar).
			     DESKTOP ONLY. It used to double as the phone's drawer, which is why it once carried a
			     drag-swallowing pointer-events rule and a tap-to-dismiss handler of its own; the phone
			     has the pinned key stack now, and this box is only ever the rail. -->
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
									><span class="docs-num">{i + 1}.</span><span class="docs-mark" aria-hidden="true"
										>{@html PORT_ICONS[code] ?? ''}</span
									>
									{airports[code].title}</a
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
													<span class="docs-bullet" aria-hidden="true"></span><span
														class="docs-mark"
														aria-hidden="true">{@html PORT_ICONS[kid] ?? ''}</span
													>{airports[kid].title}
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
		/* The paper's own stock — the white (or dark) leaf every sheet in the shell is cut from:
		   the docs sheets in +page.svelte, the homepage cover below, and on a phone the shell
		   itself. Named once here because the phone makes them the SAME surface, and two files
		   restating one colour is how they drift apart. */
		--sheet-stock: light-dark(#ffffff, #202023);
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
	/* The document must not bounce. The shell owns the viewport and nothing overflows the window,
	   so on a desktop the page simply never scrolls — but iOS Safari rubber-bands the document
	   anyway, on any drag it does not otherwise have a use for, and it hauls the entire shell up
	   and down behind the frost. Worse, the same drag runs Safari's URL bar in and out, which
	   changes 100dvh mid-gesture, so anything measured in dvh resizes under the finger.
	   `overscroll-behavior: contain` on the inner boxes cannot reach this: a FIXED layer over the
	   page (the flyout, its scrim) chains to the VIEWPORT, not to the scroller it happens to sit
	   inside, so the chain being cut lower down is not the chain that moves. It has to be stated
	   at the root.
	   Scoped with :has so it is the docs shell asking, not this file quietly changing every page
	   the stylesheet is loaded on — Aeropalite's own full-viewport apps keep their own behaviour. */
	:global(html:has(.docs)),
	:global(body:has(.docs)) {
		overscroll-behavior: none;
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
	/* Both ink changes a crumb can make ride the same 0.15s the rest of the shell's controls use:
	   the hover, and the promotion to full ink when the crumb above becomes the open page (going
	   APPS / WEATHER → APPS, the surviving APPS brightens while WEATHER is still leaving, and a
	   step change there read as a flash going off beside a thing already in motion). */
	.docs-crumb {
		transition: color 0.15s ease;
	}
	@media (prefers-reduced-motion: reduce) {
		.docs-crumb {
			transition: none;
		}
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
	/* The bar's page title (phones only — see the media block, which is the only place it is
	   shown). Desktop keeps the breadcrumb, which already ends in this same name, so printing
	   it here too would say it twice. */
	.docs-sb-title {
		display: none;
	}
	/* The pixel accent for numerals — TOC section numbers, cover numbers. Bumped ~15% to match
	   the optical size of the mono around it. */
	/* The rail is a NUMBERED table of contents; a column of icons beside it would say the same
	   thing twice and cost the tree its typographic hierarchy. (The marks are still rendered —
	   the aside is one box at both widths — they simply have nothing to do here.) */
	.docs-mark {
		display: none;
	}
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
		/* Contain overscroll — a flick down the rail never chains into the page behind it. */
		overscroll-behavior: contain;
		box-sizing: border-box;
		/* The same measure as the content gutter — the three columns share one rhythm. No
		   right-hand rule: the gutter of space between the nav and the sheet is the divide. */
		padding: var(--docs-pad);
		/* …except on the LEFT, where there is no column to be parted from — only the browser's
		   own chrome. One --docs-pad put the tree's ink about 12px off the window edge, close
		   enough to rub against the frame (and against a scrollbar, on the systems that draw
		   one). Doubled, it stops rubbing.
		   Two, and not some new number, because it is the gutter the layout ALREADY uses between
		   ink and ink: on the right of the content column the gap is that column's --docs-pad
		   plus the rail's, and the tree now keeps the same distance from the window that the
		   rail keeps from the reading. The measure still moves with --docs-pad, so the rhythm
		   holds at every width.
		   The wordmark does NOT follow it, and the resulting stagger is deliberate: KASHINOGA
		   leads the whole app and keeps its corner, while the tree is a child of it and steps in.
		   Do not "correct" the two back into a line.
		   Stated as a longhand after the shorthand above, which is all it has to outrank now that
		   the phone no longer re-declares this box. */
		padding-left: calc(2 * var(--docs-pad));
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
		background: var(--sheet-stock);
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
	/* The floating key is the PHONE's control. Off by default, switched on in the media block —
	   the same shape .docs-fab had before it, and the reason this wrapper exists at all. */
	.docs-fkey {
		display: none;
	}
	/* ── The pinned keys ──────────────────────────────────────────────────────────
	   The three destinations in the phone's floating stack. FloatingKey owns the key, the stack,
	   the scrim and how they open; what is left here is the shape of one row.
	   NOT .icon-btn — that class is the stack's 40px disc, and these are labelled. Same height, so
	   a pill and a disc are one family of controls, and the same frost/border/bevel the calling key
	   wears (FloatingKey.fkey, and the superbar's .scrolled recipe before it — keep the three in
	   step). No media query: the stack is only ever laid out on a phone, because that is the only
	   place FloatingKey draws itself. */
	.docs-key {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		box-sizing: border-box;
		height: 40px;
		/* Tighter at the mark's end than at the word's — the glyph carries its own optical margin
		   inside its box, and matched padding read as a word pushed off-centre. */
		padding: 0 0.95rem 0 0.7rem;
		color: var(--ink);
		background: color-mix(in srgb, var(--page) 78%, transparent);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		border: 1px solid var(--pixel-key-border, rgba(0, 0, 0, 0.4));
		border-radius: 4px;
		box-shadow: var(--pixel-bevel);
		/* The trail's voice — these ARE crumbs you can press, and the bar above the flyout says
		   the same names the same way. */
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.72rem;
		text-decoration: none;
		white-space: nowrap;
	}
	.docs-key:active {
		box-shadow: var(--pixel-bevel-press);
	}
	/* You are here — the same orange the calling key takes while its stack is out, and the same
	   the receipt's open row wore. On Home whenever no page is open, so the cover counts. */
	.docs-key.active {
		color: var(--orange);
		border-color: var(--orange);
	}
	.docs-key-mark {
		display: grid;
		place-items: center;
		flex: none;
		width: 1.35rem;
		height: 1.35rem;
	}
	.docs-key-mark :global(svg) {
		display: block;
		width: 1.35rem;
		height: 1.35rem;
	}

	@media (max-width: 860px) {
		/* On a phone the sheet takes the WHOLE column — the content gutter goes to zero on all
		   four sides, so the paper meets the viewport's left and right edges, starts flush under
		   the superbar, and runs to the foot of the scroll. A phone has no room to spend on a
		   frame around the page: the sheet IS the page there, and its own inner padding (the
		   reading's breathing room) is the only inset left.

		   ONE lever does it. --docs-pad is the shell's single measure for that gutter, so zeroing
		   it here also collapses everything that was cancelling it — Densette's bleeding margins,
		   the Emoji wall's full-bleed search bar, the sheets' and cover's negative bottom margin —
		   instead of leaving each to fight the gutter on its own. Densette's inner frame rides the
		   same var, so its grey gutter folds away too and its sheets go edge to edge like the rest.
		   The one gap NOT dropped is the scroller's foot below (see .docs-scroll): that is the
		   floating contents key's safe area, not page furniture. */
		.docs {
			--docs-pad: 0px;
			/* …and the shell is the same stock as the paper on it. With the gutter gone the sheet
			   already runs edge to edge, so the only thing --page still coloured was whatever the
			   sheet did not reach: the strip behind the superbar, and the run below a short page —
			   on the Work page that was a near-black slab about a third of the screen tall, with
			   the floating key sitting on it. A phone has one surface, not a leaf on a table. The
			   sheet keeps its own fill, so nothing here depends on the two staying in step; they
			   simply read as one sheet when they agree. */
			background: var(--sheet-stock);
		}
		/* The bar goes with it. It is opaque --page at rest and a 78% frost once the page scrolls
		   under it; against the sheet that read as a darker band capping the screen — the same
		   mismatch as the slab below, just smaller and at the top. Same stock, same frost recipe,
		   so the bar still tells itself from the reading by its blur when there is something to
		   blur, and by nothing at all when there is not. */
		.docs-superbar {
			background: var(--sheet-stock);
		}
		.docs-superbar.scrolled {
			background: color-mix(in srgb, var(--sheet-stock) 78%, transparent);
		}
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
		/* Unless the page handed its title up here: then the post has something on its far side
		   again, and it does the same work it does on desktop — parting the site's name from the
		   page's. (Only reached when the crumbs exist, which is every page but the cover.) */
		.docs-superbar.has-bar-title .docs-brand-sep {
			display: block;
		}
		/* The title takes the room the breadcrumb had — flex:1, so the Emoji search (margin-left:
		   auto) still sits at the far end — and clips with an ellipsis rather than pushing the bar
		   wider or wrapping its fixed 42px line. Full ink in the trail's mono voice: this IS the
		   trailing crumb, standing alone. */
		.docs-sb-title {
			display: block;
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-family: var(--font-mono);
			text-transform: uppercase;
			letter-spacing: 0.08em;
			font-size: 0.72rem;
			color: var(--ink);
		}
		/* With the breadcrumb gone, its flex:1 no longer pushes the Emoji page's superbar search
		   to the right end — it would sit against the wordmark. Auto left margin sends it back to
		   the bar's right edge. */
		.docs-sb-search {
			margin-left: auto;
		}
		/* `contents`, not `block`: the wrapper is a gate and nothing else, and a box of its own
		   inside the shell's flex column would be one more thing to reason about. Its children are
		   all fixed anyway — they never wanted a parent box. */
		.docs-fkey {
			display: contents;
		}
		/* The site tree is the DESKTOP rail and nothing else now. This same aside used to double
		   as the phone's drawer — a fixed, full-height receipt of every place in the register, with
		   its own scroll shades, scrollbar track margins, overscroll containment, iOS touch rules and
		   a tap-to-dismiss handler, because a list that covers the screen has to answer for every
		   gesture that lands on it. The phone has three pinned keys instead (see .docs-key and the
		   FloatingKey in the markup), so all of that goes: what a thumb wanted was a destination, not
		   a table of contents. Plain display:none — nothing here has to animate any more. */
		.docs-sidebar {
			display: none;
		}
		/* Both margins fold away — the content column takes the whole width. */
		.docs-rail {
			display: none;
		}
		/* The cover is capped to its reading measure on desktop; on a phone that cap would strand
		   it short of the right edge while every other sheet runs full width, so it drops. (Its
		   old negative bottom margin went with the gutter — there is nothing left to cancel.) */
		.docs-cover {
			max-width: none;
		}
	}
</style>
