<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';
	import {
		ARROW_LEFT_SVG,
		PRESENTATION_SVG,
		FILE_PLUS_SVG,
		FOLDER_OPEN_SVG,
		SAVE_SVG,
		DOWNLOAD_SVG,
		PLUS_SVG,
		COPY_SVG,
		TRASH_SVG,
		ARROW_UP_SVG,
		CLOSE_SVG,
		DRAG_SVG
	} from '$lib/icons';
	import DEMO_DECK from '$lib/decks/kashinoga-demo.html?raw';
	import SplitFlap from '$lib/SplitFlap.svelte';

	// A native Svelte port of the standalone "Presentation Builder" tool: a visual
	// editor for the route-map slide decks. It parses a deck's HTML (`#deck` slides +
	// `stationLabels` + `:root{}` theme vars), lets you edit text in place, recolor the
	// whole deck or a single element, reorder stations, and save back to the SAME file
	// (File System Access API on Chromium; upload/download fallback elsewhere) — so the
	// tool and any deck co-evolve. The builder's own chrome uses the site's puhig tokens
	// and flips with dark mode; the deck being edited keeps its own palette inside the
	// preview iframe (its styles live in its own <head>), so the two never bleed.
	//
	// The parent owns the panel chrome (title, back); everything else is here. The panel is
	// always full-viewport for this app — there is no collapse/unexpanded state.
	let {
		accent = '#f06030',
		title = 'Presentation Builder',
		onback
	}: {
		accent?: string;
		title?: string;
		onback?: () => void;
	} = $props();

	type Slide = { classes: string[]; inner: string; label: string };
	type ThemeVar = { name: string; value: string; isColor: boolean };
	type Variant = { cls: string; name: string; swatch: string };
	type ElVariant = Variant & { on: boolean };
	type ElInfo = {
		tag: string;
		cls: string[];
		families: { label: string; variants: ElVariant[] }[];
	} | null;

	// ── Reactive model (mirrors the original `state`) ──────────────────────
	let slides = $state<Slide[]>([]);
	let current = $state(-1);
	// Bumped every time a fresh deck/template is loaded. The slide rail is keyed on it, so
	// loading a new presentation remounts the rows and replays their staggered entrance
	// (rise + dot pop) rather than swapping the list in place with no motion.
	let loadRev = $state(0);
	let themeVars = $state<ThemeVar[]>([]);
	let themeChanges = $state<Record<string, string>>({});
	let dirty = $state(false);
	let fileName = $state('');
	let toastMsg = $state('');
	let toastKind = $state<'' | 'ok' | 'err'>('');
	const reduce =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	let dragOverIdx = $state(-1);
	// Element inspector — declarative snapshot of the selected element.
	let elInfo = $state<ElInfo>(null);
	let elText = $state('#000000');
	let elBg = $state('#000000');
	// Rail geometry (grey line spans all stations; accent fill runs to the active one).
	// ── Motto ticker ─────────────────────────────────────────────────────────
	// The scrolling strip under the title slide. It lives outside #deck, so it isn't part
	// of a slide's markup and can't be edited in the preview — it gets its own inspector
	// section, and buildOutput writes it back into the file.
	//
	// On disk the phrases are repeated: each `.ticker-group` holds the cycle a few times
	// over, and the whole group is duplicated so the -50% scroll wraps seamlessly. We
	// model only the cycle, plus how many times a group repeats it — both editable.
	let tickerPhrases = $state<string[]>([]);
	let hasTicker = $state(false);
	let tickerRepeat = $state(1);
	// Bounds for the repeat control. A loaded file's own count is trusted as-is, however
	// large — clamping on load would silently rewrite a deck on open. Only edits are bound.
	const REPEAT_MIN = 1;
	const REPEAT_MAX = 24;

	let railTop = $state(0);
	let railH = $state(0);
	let railFgH = $state(0);
	let railLeft = $state(22);

	// ── Non-reactive scratch ───────────────────────────────────────────────
	let originalHTML = ''; // full text of the loaded file — the template for save
	let headHTML = ''; // <head> inner (styles + fonts) for the preview
	let fileHandle: any = null; // FileSystemFileHandle when available
	let frame: HTMLIFrameElement | undefined; // the preview iframe
	let frameReady = false;
	let selectedEl: HTMLElement | null = null; // selected element inside the edit slide
	let listEl: HTMLDivElement | undefined; // slide-list container (rail measuring)
	let fileInput: HTMLInputElement | undefined;
	let dragFrom = -1;
	let toastTimer = 0;

	const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

	const SNIPPETS: Record<string, string> = {
		'Bullet list': `<ul><li>New point</li></ul>`,
		'Numbered list': `<ol><li>New item</li></ol>`,
		Rule: `<div class="rule"></div>`,
		Eyebrow: `<div class="eyebrow">Section</div>`,
		Heading: `<h2>Heading</h2>`,
		'Two columns': `<div class="cols cols-2"><div><ul><li>Left</li></ul></div><div><ul><li>Right</li></ul></div></div>`,
		'Pill row': `<div style="display:flex; gap:0.75rem; flex-wrap:wrap;"><span class="pill pill-blue">Tag</span><span class="pill pill-blue">Tag</span></div>`,
		'Card grid': `<div class="card-grid cg-2"><div class="card"><div class="card-icon">🔹</div><h4>Title</h4><p>Description</p></div><div class="card"><div class="card-icon">🔸</div><h4>Title</h4><p>Description</p></div></div>`,
		'Code block': `<div class="cb"><span class="cm">-- comment</span>\n<span class="kw">SELECT</span> * <span class="kw">FROM</span> table;</div>`,
		Highlight: `<span class="hl">highlighted</span>`
	};

	// Per-element quick recolour families (pill / highlight variants). Swatches use the
	// deck's kashinoga palette (orange accent) rather than the original red.
	const COLOR_FAMILIES: {
		label: string;
		ensure: string | null;
		test: (el: HTMLElement) => boolean;
		variants: Variant[];
	}[] = [
		{
			label: 'Pill color',
			ensure: 'pill',
			test: (el) =>
				el.classList.contains('pill') ||
				['pill-blue', 'pill-green', 'pill-yellow', 'pill-red'].some((c) => el.classList.contains(c)),
			variants: [
				{ cls: 'pill-blue', name: 'Accent', swatch: '#c2410c' },
				{ cls: 'pill-green', name: 'Green', swatch: '#00761b' },
				{ cls: 'pill-yellow', name: 'Amber', swatch: '#a06000' },
				{ cls: 'pill-red', name: 'Danger', swatch: '#c93328' }
			]
		},
		{
			label: 'Highlight color',
			ensure: null,
			test: (el) => ['hl', 'hlg', 'hly', 'hlr'].some((c) => el.classList.contains(c)),
			variants: [
				{ cls: 'hl', name: 'Accent', swatch: '#c2410c' },
				{ cls: 'hlg', name: 'Green', swatch: '#00761b' },
				{ cls: 'hly', name: 'Amber', swatch: '#a06000' },
				{ cls: 'hlr', name: 'Danger', swatch: '#c93328' }
			]
		}
	];

	const PREVIEW_OVERRIDE = `
    <style id="__builderOverride">
      html, body { height: auto !important; overflow: auto !important; }
      body { user-select: text !important; }
      #deck, .slide { position: relative !important; inset: auto !important; }
      .slide { opacity: 1 !important; transform: none !important; pointer-events: auto !important; min-height: 100vh; animation: none !important; }
      .slide *, .slide *::before, .slide *::after { animation: none !important; }
      [contenteditable="true"] { transition: box-shadow 0.12s; }
      [contenteditable="true"]:hover  { box-shadow: inset 0 0 0 1px rgba(240,96,48,0.28); }
      [contenteditable="true"]:focus  { outline: none; box-shadow: inset 0 0 0 2px rgba(240,96,48,0.55); }
      [data-builder-sel] { outline: 2px solid #00687f !important; outline-offset: 2px; border-radius: 3px; }
    </style>`;

	// ── Utilities ──────────────────────────────────────────────────────────
	function toast(msg: string, kind: '' | 'ok' | 'err' = '') {
		toastMsg = msg;
		toastKind = kind;
		clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => (toastMsg = ''), 2600);
	}

	function markDirty(d: boolean) {
		dirty = d;
	}

	const stripText = (html: string) => {
		const d = document.createElement('div');
		d.innerHTML = html;
		return (d.textContent || '').replace(/\s+/g, ' ').trim();
	};

	function slideTitle(s: Slide) {
		const d = document.createElement('div');
		d.innerHTML = s.inner;
		const h = d.querySelector('h1, h2, h3, h4');
		return h ? stripText(h.outerHTML) : stripText(s.inner).slice(0, 40) || '(empty)';
	}

	function rgbToHex(rgb: string) {
		const m = String(rgb).match(/\d+(?:\.\d+)?/g);
		if (!m || m.length < 3) return '#000000';
		return '#' + m.slice(0, 3).map((n) => Math.round(+n).toString(16).padStart(2, '0')).join('');
	}
	function colorToHex(c: string) {
		c = String(c).trim();
		if (/^#[0-9a-f]{6}$/i.test(c)) return c;
		if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map((x) => x + x).join('');
		return rgbToHex(c);
	}

	// ── Parsing ────────────────────────────────────────────────────────────
	// The shortest prefix that, repeated, reproduces the whole list. ['a','b','a','b']
	// → ['a','b']. Falls back to the list itself when nothing repeats, so a hand-edited
	// ticker with no repetition still round-trips unchanged.
	function smallestCycle(items: string[]): string[] {
		for (let k = 1; k < items.length; k++) {
			if (items.length % k !== 0) continue;
			if (items.every((it, i) => it === items[i % k])) return items.slice(0, k);
		}
		return items;
	}

	function parseTicker(doc: Document) {
		const group = doc.querySelector('#ticker .ticker-group');
		if (!group) return { phrases: [], repeat: 1, present: false };
		const items = Array.from(group.querySelectorAll('.ticker-item')).map((el) =>
			(el.textContent ?? '').trim()
		);
		if (!items.length) return { phrases: [], repeat: 1, present: true };
		const phrases = smallestCycle(items);
		return { phrases, repeat: items.length / phrases.length, present: true };
	}

	function parsePresentation(text: string) {
		const doc = new DOMParser().parseFromString(text, 'text/html');
		const deck = doc.getElementById('deck');
		if (!deck) throw new Error('This file has no #deck element — is it a compatible presentation?');

		const slideEls = Array.from(deck.children).filter(
			(el) => el.classList && el.classList.contains('slide')
		);
		if (!slideEls.length) throw new Error('No .slide elements found inside #deck.');

		let labels: string[] = [];
		const m = text.match(/const\s+stationLabels\s*=\s*\[([\s\S]*?)\]/);
		if (m) {
			try {
				labels = new Function('"use strict";return [' + m[1] + ']')();
			} catch {
				labels = (m[1].match(/'([^']*)'|"([^"]*)"/g) || []).map((s) => s.slice(1, -1));
			}
		}

		const parsedSlides: Slide[] = slideEls.map((el, i) => ({
			classes: Array.from(el.classList).filter((c) => c !== 'slide' && c !== 'active'),
			inner: el.innerHTML.trim(),
			label: labels[i] != null ? String(labels[i]) : 'Slide ' + (i + 1)
		}));

		const styleText = Array.from(doc.querySelectorAll('style'))
			.map((s) => s.textContent)
			.join('\n');
		const rootMatch = styleText.match(/:root\s*\{([\s\S]*?)\}/);
		const vars: ThemeVar[] = [];
		if (rootMatch) {
			const re = /--([\w-]+)\s*:\s*([^;]+);/g;
			let vm: RegExpExecArray | null;
			while ((vm = re.exec(rootMatch[1])) !== null) {
				const value = vm[2].trim();
				vars.push({ name: vm[1], value, isColor: COLOR_RE.test(value) });
			}
		}

		const headClone = doc.head.cloneNode(true) as HTMLHeadElement;
		headClone.querySelectorAll('title').forEach((t) => t.remove());

		return {
			slides: parsedSlides,
			themeVars: vars,
			headHTML: headClone.innerHTML,
			ticker: parseTicker(doc)
		};
	}

	// ── Preview iframe ───────────────────────────────────────────────────────
	function buildPreviewDoc() {
		return (
			`<!DOCTYPE html><html><head>${headHTML}${PREVIEW_OVERRIDE}</head>` +
			`<body><div id="deck"><div class="slide active" id="__editSlide"></div></div></body></html>`
		);
	}

	function initFrame(cb?: () => void) {
		if (!frame) return;
		frameReady = false;
		frame.onload = () => {
			frameReady = true;
			cb?.();
		};
		frame.srcdoc = buildPreviewDoc();
	}

	const editSlideEl = () =>
		frame?.contentDocument?.getElementById('__editSlide') as HTMLElement | null;

	function renderCurrentSlide() {
		if (!frameReady || current < 0 || !frame) return;
		const s = slides[current];
		const doc = frame.contentDocument!;
		const el = doc.getElementById('__editSlide');
		if (!el) return;

		el.className = 'slide active ' + s.classes.join(' ');
		el.innerHTML = s.inner;
		el.setAttribute('contenteditable', 'true');
		el.setAttribute('spellcheck', 'false');
		selectedEl = null;
		elInfo = null;

		Object.entries(themeChanges).forEach(([n, v]) =>
			doc.documentElement.style.setProperty('--' + n, v)
		);

		el.oninput = () => {
			captureInner();
			markDirty(true);
		};
		el.onclick = (ev) => selectElement(ev.target as HTMLElement);
	}

	// Give the preview pane an entrance whenever a new template/deck is displayed. The iframe is
	// persistent (its content just reloads), so restart the CSS animation by toggling the class
	// off, forcing a reflow, then on — keyed to loadRev so it replays on every load but not on
	// ordinary slide edits. loadRev 0 is the pre-load empty state, so there's nothing to animate.
	$effect(() => {
		const rev = loadRev;
		const el = frame;
		if (!el || rev === 0) return;
		el.classList.remove('is-entering');
		void el.offsetWidth; // reflow so re-adding the class restarts the animation
		el.classList.add('is-entering');
	});

	// Capture the slide's innerHTML into the model without the selection marker.
	function captureInner() {
		const el = editSlideEl();
		if (!el || current < 0) return;
		const marked = el.querySelector('[data-builder-sel]');
		if (marked) marked.removeAttribute('data-builder-sel');
		slides[current].inner = el.innerHTML.trim();
		if (marked) marked.setAttribute('data-builder-sel', '');
	}

	// ── Slide list / selection ───────────────────────────────────────────────
	function selectSlide(i: number) {
		current = i;
		renderCurrentSlide();
	}

	function addSlide() {
		const idx = current >= 0 ? current + 1 : slides.length;
		slides.splice(idx, 0, {
			classes: [],
			inner: `<div class="eyebrow">Section</div>\n<h2>New Slide</h2>\n<div class="rule"></div>\n<ul><li>New point</li></ul>`,
			label: 'New'
		});
		markDirty(true);
		selectSlide(idx);
	}

	function duplicateSlide() {
		if (current < 0) return;
		const s = slides[current];
		slides.splice(current + 1, 0, { classes: [...s.classes], inner: s.inner, label: s.label });
		markDirty(true);
		selectSlide(current + 1);
	}

	function deleteSlide() {
		if (current < 0) return;
		if (slides.length === 1) {
			toast("Can't delete the last slide.", 'err');
			return;
		}
		if (!confirm(`Delete slide ${current + 1} (“${slides[current].label}”)?`)) return;
		slides.splice(current, 1);
		current = Math.min(current, slides.length - 1);
		markDirty(true);
		selectSlide(current);
	}

	// ── Drag & drop reorder ────────────────────────────────────────────────
	function onDragStart(i: number) {
		dragFrom = i;
	}
	function onDrop(to: number) {
		dragOverIdx = -1;
		if (dragFrom < 0 || dragFrom === to) return;
		const [moved] = slides.splice(dragFrom, 1);
		slides.splice(to, 0, moved);
		current = to;
		dragFrom = -1;
		markDirty(true);
		renderCurrentSlide();
	}

	// ── Inspector: slide fields ──────────────────────────────────────────────
	function setLabel(v: string) {
		if (current < 0) return;
		slides[current].label = v;
		markDirty(true);
	}
	function setClasses(v: string) {
		if (current < 0) return;
		slides[current].classes = v.split(/\s+/).filter((c) => c && c !== 'slide' && c !== 'active');
		markDirty(true);
		renderCurrentSlide();
	}

	function insertSnippet(html: string) {
		if (!frameReady || current < 0 || !frame) return;
		const doc = frame.contentDocument!;
		const el = doc.getElementById('__editSlide')!;
		el.focus();
		const sel = doc.getSelection();
		let inserted = false;
		if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
			inserted = doc.execCommand('insertHTML', false, html);
		}
		if (!inserted) el.insertAdjacentHTML('beforeend', html);
		captureInner();
		markDirty(true);
	}

	// ── Inspector: theme colours (whole deck) ────────────────────────────────
	function applyTheme(name: string, value: string) {
		themeChanges[name] = value;
		markDirty(true);
		if (frameReady && frame)
			frame.contentDocument!.documentElement.style.setProperty('--' + name, value);
	}
	const themeCur = (v: ThemeVar) => (themeChanges[v.name] != null ? themeChanges[v.name] : v.value);

	// ── Inspector: per-element colour ────────────────────────────────────────
	function selectElement(target: HTMLElement | null) {
		const root = editSlideEl();
		if (!root) return;
		if (!target || target === root) {
			deselectElement();
			return;
		}
		if (selectedEl) selectedEl.removeAttribute('data-builder-sel');
		selectedEl = target;
		selectedEl.setAttribute('data-builder-sel', '');
		refreshElInfo();
	}
	function deselectElement() {
		if (selectedEl) selectedEl.removeAttribute('data-builder-sel');
		selectedEl = null;
		refreshElInfo();
	}
	function selectParent() {
		const root = editSlideEl();
		if (!selectedEl || !root) return;
		const p = selectedEl.parentElement;
		if (p && p !== root && root.contains(p)) selectElement(p);
	}

	function refreshElInfo() {
		const root = editSlideEl();
		if (!selectedEl || !root || !root.contains(selectedEl) || !frame) {
			selectedEl = null;
			elInfo = null;
			return;
		}
		const cs = frame.contentWindow!.getComputedStyle(selectedEl);
		elText = selectedEl.style.color ? colorToHex(selectedEl.style.color) : rgbToHex(cs.color);
		elBg = selectedEl.style.backgroundColor
			? colorToHex(selectedEl.style.backgroundColor)
			: rgbToHex(cs.backgroundColor);
		const families = COLOR_FAMILIES.filter((f) => f.test(selectedEl!)).map((f) => ({
			label: f.label,
			variants: f.variants.map((v) => ({ ...v, on: selectedEl!.classList.contains(v.cls) }))
		}));
		elInfo = {
			tag: selectedEl.tagName.toLowerCase(),
			cls: Array.from(selectedEl.classList).filter((c) => c !== 'data-builder-sel'),
			families
		};
	}

	function afterElementEdit() {
		captureInner();
		markDirty(true);
		refreshElInfo();
	}
	function applyVariant(label: string, cls: string) {
		const fam = COLOR_FAMILIES.find((f) => f.label === label);
		if (!selectedEl || !fam) return;
		fam.variants.forEach((v) => selectedEl!.classList.remove(v.cls));
		selectedEl.classList.add(cls);
		if (fam.ensure) selectedEl.classList.add(fam.ensure);
		afterElementEdit();
	}
	// Apply inline colour WITHOUT rebuilding the element section — that would close the
	// native colour picker mid-drag. The bound value already tracks the picker.
	function applyInline(prop: string, value: string) {
		if (!selectedEl) return;
		selectedEl.style.setProperty(prop, value);
		captureInner();
		markDirty(true);
	}
	function clearInline(prop: string) {
		if (!selectedEl) return;
		selectedEl.style.removeProperty(prop);
		afterElementEdit();
	}

	// ── New / Open / Save / Download / Preview ────────────────────────────────
	function loadText(text: string, name: string, handle: any) {
		let parsed;
		try {
			parsed = parsePresentation(text);
		} catch (e: any) {
			toast(e?.message || 'Could not parse this file.', 'err');
			return;
		}
		originalHTML = text;
		headHTML = parsed.headHTML;
		themeVars = parsed.themeVars;
		themeChanges = {};
		tickerPhrases = parsed.ticker.phrases;
		tickerRepeat = parsed.ticker.repeat;
		hasTicker = parsed.ticker.present;
		fileHandle = handle || null;
		fileName = name || 'presentation.html';
		slides = parsed.slides;
		current = 0;
		loadRev++; // replay the rail's entrance for the freshly displayed deck
		markDirty(false);
		initFrame(() => renderCurrentSlide());
		toast(`Loaded ${slides.length} slides`, 'ok');
	}

	function newFromTemplate() {
		if (dirty && !confirm('Discard unsaved changes and start a new presentation from the template?'))
			return;
		loadText(DEMO_DECK, 'untitled-presentation.html', null);
		toast('New presentation from template', 'ok');
	}

	async function openFile() {
		const w = window as any;
		if (w.showOpenFilePicker) {
			try {
				const [handle] = await w.showOpenFilePicker({
					types: [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }]
				});
				const file = await handle.getFile();
				loadText(await file.text(), file.name, handle);
				return;
			} catch (e: any) {
				if (e && e.name === 'AbortError') return;
				// fall through to input fallback
			}
		}
		fileInput?.click();
	}

	function onFileInput(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => loadText(String(reader.result), file.name, null);
		reader.readAsText(file);
		(e.target as HTMLInputElement).value = '';
	}

	async function saveFile() {
		if (!slides.length) return;
		const output = buildOutput();
		const w = window as any;
		try {
			if (fileHandle && fileHandle.createWritable) {
				const wr = await fileHandle.createWritable();
				await wr.write(output);
				await wr.close();
				markDirty(false);
				toast('Saved to ' + fileName, 'ok');
				return;
			}
			if (w.showSaveFilePicker) {
				const handle = await w.showSaveFilePicker({
					suggestedName: fileName,
					types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }]
				});
				const wr = await handle.createWritable();
				await wr.write(output);
				await wr.close();
				fileHandle = handle;
				try {
					fileName = (await handle.getFile()).name;
				} catch {
					/* keep current name */
				}
				markDirty(false);
				toast('Saved to ' + fileName, 'ok');
				return;
			}
			downloadFile();
		} catch (e: any) {
			if (e && e.name === 'AbortError') return;
			toast('Save failed: ' + (e?.message ?? e), 'err');
		}
	}

	function downloadFile() {
		if (!slides.length) return;
		const blob = new Blob([buildOutput()], { type: 'text/html' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName || 'presentation.html';
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		toast('Downloaded copy', 'ok');
	}

	function previewLive() {
		if (!slides.length) return;
		const blob = new Blob([buildOutput()], { type: 'text/html' });
		const url = URL.createObjectURL(blob);
		window.open(url, '_blank');
		setTimeout(() => URL.revokeObjectURL(url), 60000);
	}

	// ── Build output (surgical replace on the loaded template) ────────────────
	function buildOutput() {
		let out = originalHTML;
		const slidesMarkup = slides
			.map((s, i) => {
				const cls = ['slide', ...s.classes];
				if (i === 0) cls.push('active');
				return `  <div class="${cls.join(' ')}">\n${s.inner}\n  </div>`;
			})
			.join('\n\n');
		out = out.replace(
			/<div id="deck">[\s\S]*?<\/div>(\s*)<script>/,
			(_m, ws) => `<div id="deck">\n\n${slidesMarkup}\n\n</div>${ws}<script>`
		);
		const labels = slides.map((s) => JSON.stringify(s.label)).join(', ');
		out = out.replace(
			/const\s+stationLabels\s*=\s*\[[\s\S]*?\];/,
			`const stationLabels = [\n    ${labels}\n  ];`
		);
		out = writeTicker(out);
		for (const [name, val] of Object.entries(themeChanges)) {
			const re = new RegExp('(--' + name.replace(/[-]/g, '\\-') + '\\s*:\\s*)([^;]+)(;)');
			out = out.replace(re, '$1' + val + '$3');
		}
		out = out
			.replace(/\s+contenteditable="true"/g, '')
			.replace(/\s+spellcheck="false"/g, '');
		out = out.replace(/\s+data-builder-sel(?:="[^"]*")?/g, '');
		return out;
	}

	// ── Ticker editing ─────────────────────────────────────────────────────
	function setTickerPhrase(i: number, v: string) {
		tickerPhrases[i] = v;
		markDirty(true);
	}
	function addTickerPhrase() {
		tickerPhrases.push('New phrase');
		markDirty(true);
	}
	function deleteTickerPhrase(i: number) {
		tickerPhrases.splice(i, 1);
		markDirty(true);
	}
	function moveTickerPhrase(i: number, delta: number) {
		const to = i + delta;
		if (to < 0 || to >= tickerPhrases.length) return;
		const [p] = tickerPhrases.splice(i, 1);
		tickerPhrases.splice(to, 0, p);
		markDirty(true);
	}
	// A number input hands back NaN while it's empty or mid-typing ("-", "1e"). Ignore those
	// rather than collapsing the value to the minimum under the user's cursor.
	function setTickerRepeat(n: number) {
		if (!Number.isFinite(n)) return;
		const next = Math.min(REPEAT_MAX, Math.max(REPEAT_MIN, Math.round(n)));
		if (next === tickerRepeat) return;
		tickerRepeat = next;
		markDirty(true);
	}

	const escapeHTML = (s: string) =>
		s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

	// Rewrite each `.ticker-group`'s contents in place, re-expanding the cycle to the
	// current repeat count. Only the innards are touched, so the wrapper's attributes
	// (the second group's aria-hidden) and the file's indentation survive. The regex is
	// global, so both strips get the same expansion — which is what keeps the -50% scroll
	// seamless.
	//
	// Emptying the list writes an empty strip rather than quietly restoring the file's
	// original phrases: the export has to say what the editor says.
	function writeTicker(out: string) {
		if (!hasTicker) return out;
		const phrases = tickerPhrases.map((p) => p.trim()).filter(Boolean);
		const items = Array.from({ length: tickerRepeat }, () => phrases)
			.flat()
			.map((p) => `      <span class="ticker-item">${escapeHTML(p)}</span>`)
			.join('\n');
		return out.replace(
			/(<div class="ticker-group"[^>]*>)[\s\S]*?(<\/div>)/g,
			(_m, open, close) => (items ? `${open}\n${items}\n    ${close}` : `${open}${close}`)
		);
	}

	// ── Rail geometry ──────────────────────────────────────────────────────
	function updateRail() {
		if (!listEl) return;
		const dots = listEl.querySelectorAll<HTMLElement>('.stn-dot');
		if (!dots.length) return;
		const box = listEl.getBoundingClientRect();
		const center = (el: HTMLElement) => {
			const r = el.getBoundingClientRect();
			return r.top - box.top + r.height / 2;
		};
		const first = center(dots[0]);
		const last = center(dots[dots.length - 1]);
		const activeDot = listEl.querySelector<HTMLElement>('.stn-v.active .stn-dot');
		const act = activeDot ? center(activeDot) : first;
		railTop = first;
		railH = last - first;
		railFgH = Math.max(0, act - first);
		// Align the rail to the dots' horizontal centre (measured, not hard-coded) so it
		// tracks the column/padding exactly. RAIL_W is 2px, so offset by 1 to centre it.
		const r0 = dots[0].getBoundingClientRect();
		railLeft = r0.left - box.left + r0.width / 2 - 1;
	}
	// Re-measure whenever the list length or the active index changes.
	$effect(() => {
		current;
		slides.length;
		requestAnimationFrame(updateRail);
	});

	// ── Keyboard + dirty guard ───────────────────────────────────────────────
	function onKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
			e.preventDefault();
			saveFile();
		}
	}
	function beforeUnload(e: BeforeUnloadEvent) {
		if (dirty) {
			e.preventDefault();
			e.returnValue = '';
		}
	}
	function handleBack() {
		if (dirty && !confirm('Discard unsaved changes and leave the Presentation Builder?')) return;
		onback?.();
	}

	onMount(() => {
		window.addEventListener('keydown', onKeydown);
		window.addEventListener('beforeunload', beforeUnload);
		window.addEventListener('resize', updateRail);
	});
	onDestroy(() => {
		if (typeof window === 'undefined') return;
		window.removeEventListener('keydown', onKeydown);
		window.removeEventListener('beforeunload', beforeUnload);
		window.removeEventListener('resize', updateRail);
		clearTimeout(toastTimer);
	});
</script>

<div class="pb" style:--pb-accent={accent}>
	<!-- Panel chrome + toolbar -->
	<header class="pb-head">
		<button class="icon-btn" onclick={handleBack} aria-label="Back to route map" title="Route map"
			>{@html ARROW_LEFT_SVG}</button
		>
		<!-- No brand mark here: the presentation glyph is the tab's favicon while this panel is
		     open, which is where an app's mark belongs. Beta rides at the far right, after the
		     filename. -->
		<div class="pb-brand">
			<span class="brand-title"><SplitFlap text={title} base={160} stagger={45} /></span>
			<!-- Decorative accent dot beside the title (station-sign bullet), matching ATFC. -->
			<span class="accent-dot" aria-hidden="true"></span>
		</div>
		<div class="pb-tools">
			<button class="tb" onclick={newFromTemplate} title="Start a new presentation from the built-in template">{@html FILE_PLUS_SVG}New</button>
			<button class="tb" onclick={openFile} title="Open a presentation HTML file">{@html FOLDER_OPEN_SVG}Open</button>
			<button class="tb primary" onclick={saveFile} disabled={!slides.length} title="Save back to the same file (Ctrl/⌘-S)">{@html SAVE_SVG}Save</button>
			<button class="tb" onclick={downloadFile} disabled={!slides.length} title="Download a copy">{@html DOWNLOAD_SVG}Download</button>
			<button class="tb" onclick={previewLive} disabled={!slides.length} title="Open the live presentation in a new tab">{@html PRESENTATION_SVG}Preview</button>
		</div>
		<span class="pb-file" class:dirty>{dirty ? '● ' : ''}{fileName || 'No file loaded'}</span>
		<span class="beta">Beta</span>
	</header>

	<div class="pb-main">
		<!-- Left: slides = vertical metro line -->
		<section class="pb-col pb-left">
			<div class="col-head">
				<span>Slides</span>
				<button class="chip" onclick={addSlide} disabled={!slides.length} title="Add a new slide" aria-label="Add slide">{@html PLUS_SVG}</button>
			</div>
			<div class="col-body" bind:this={listEl}>
				{#if slides.length}
					<div class="rail-bg" style:top="{railTop}px" style:height="{railH}px" style:left="{railLeft}px"></div>
					<div class="rail-fg" style:top="{railTop}px" style:height="{railFgH}px" style:left="{railLeft}px"></div>
					{#key loadRev}
						{#each slides as s, i (i)}
						<div
							class="stn-v"
							class:active={i === current}
							class:passed={i < current}
							class:dragover={i === dragOverIdx}
							style="--n:{i}"
							draggable="true"
							role="button"
							tabindex="0"
							onclick={() => selectSlide(i)}
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectSlide(i)}
							ondragstart={() => onDragStart(i)}
							ondragover={(e) => {
								e.preventDefault();
								dragOverIdx = i;
							}}
							ondragleave={() => (dragOverIdx === i ? (dragOverIdx = -1) : null)}
							ondrop={(e) => {
								e.preventDefault();
								onDrop(i);
							}}
						>
							<div class="stn-dot"></div>
							<div class="stn-head">
								<span class="stn-num">{String(i + 1).padStart(2, '0')}</span>
								<span class="stn-label">{s.label || '(no label)'}</span>
							</div>
							<div class="stn-drag" title="Drag to reorder">{@html DRAG_SVG}</div>
							<div class="stn-title">{slideTitle(s)}</div>
						</div>
					{/each}
					{/key}
				{:else}
					<p class="hint">No slides yet.</p>
				{/if}
			</div>
		</section>

		<!-- Center: live preview -->
		<section class="pb-col pb-center">
			<div class="preview-bar">
				<span>Live edit — click text to edit in place</span>
				{#if current >= 0}<span class="counter">Slide {current + 1} / {slides.length}</span>{/if}
			</div>
			<iframe class="preview-frame" title="Slide preview" bind:this={frame}></iframe>
			{#if current < 0}
				<div class="empty">
					<h2>No presentation loaded</h2>
					<p>
						Start a new deck from the built-in template, or open an existing presentation
						<code>.html</code> file. Text is editable directly in the preview; use the panels to
						manage slides, labels, and colors.
					</p>
					<div class="empty-actions">
						<button class="tb primary" onclick={newFromTemplate}>New from template</button>
						<button class="tb" onclick={openFile}>Open a presentation</button>
					</div>
				</div>
			{/if}
		</section>

		<!-- Right: inspector -->
		<section class="pb-col pb-right">
			<div class="col-head">
				<span>Inspector</span>
				<div class="head-actions">
					<button class="chip" onclick={duplicateSlide} disabled={current < 0} title="Duplicate slide" aria-label="Duplicate slide">{@html COPY_SVG}</button>
					<button class="chip danger" onclick={deleteSlide} disabled={current < 0} title="Delete slide" aria-label="Delete slide">{@html TRASH_SVG}</button>
				</div>
			</div>
			<div class="col-body">
				{#if current < 0}
					<p class="hint">Select or load a slide to edit its properties.</p>
				{:else}
					<!-- Element colour -->
					<div class="section-title">Element color</div>
					{#if !elInfo}
						<p class="hint">Click any element in the slide (a pill, a highlighted word, a heading…) to change its color.</p>
					{:else}
						<div class="el-desc">
							<span class="el-tag"><b>{elInfo.tag}</b>{elInfo.cls.length ? '.' + elInfo.cls.join('.') : ''}</span>
							<span class="el-actions">
								<button class="mini" onclick={selectParent} title="Select parent element">{@html ARROW_UP_SVG}Parent</button>
								<button class="mini icon-only" onclick={deselectElement} aria-label="Deselect" title="Deselect">{@html CLOSE_SVG}</button>
							</span>
						</div>
						{#each elInfo.families as fam}
							<span class="field-label">{fam.label}</span>
							<div class="swatch-row">
								{#each fam.variants as v}
									<button class="swatch-btn" class:on={v.on} onclick={() => applyVariant(fam.label, v.cls)} title={v.cls}>
										<span class="sw-chip" style:background={v.swatch}></span>{v.name}
									</button>
								{/each}
							</div>
						{/each}
						<span class="field-label">Custom color</span>
						<div class="theme-row">
							<span class="sw"><input type="color" bind:value={elText} oninput={() => applyInline('color', elText)} /></span>
							<span class="tv-name fixed">text</span>
							<input class="tv-val grow" type="text" bind:value={elText} oninput={() => applyInline('color', elText.trim())} spellcheck="false" />
							<button class="mini" onclick={() => clearInline('color')}>reset</button>
						</div>
						<div class="theme-row">
							<span class="sw"><input type="color" bind:value={elBg} oninput={() => applyInline('background-color', elBg)} /></span>
							<span class="tv-name fixed">bg</span>
							<input class="tv-val grow" type="text" bind:value={elBg} oninput={() => applyInline('background-color', elBg.trim())} spellcheck="false" />
							<button class="mini" onclick={() => clearInline('background-color')}>reset</button>
						</div>
					{/if}

					<!-- Slide -->
					<div class="section-title">Slide</div>
					<div class="pb-field">
						<label for="pb-label">Station label (route line)</label>
						<input
							id="pb-label"
							type="text"
							value={slides[current].label}
							oninput={(e) => setLabel(e.currentTarget.value)}
							placeholder="e.g. Intro"
						/>
					</div>
					<div class="pb-field">
						<label for="pb-classes">Slide CSS classes</label>
						<input
							id="pb-classes"
							type="text"
							value={slides[current].classes.join(' ')}
							oninput={(e) => setClasses(e.currentTarget.value)}
							placeholder="e.g. slide-title"
						/>
						<p class="hint sm">Space-separated. <code>slide</code> is added automatically.</p>
					</div>

					<!-- Insert -->
					<div class="section-title">Insert element</div>
					<p class="hint sm">Inserts at the cursor in the preview (click into the slide first).</p>
					<div class="insert-grid">
						{#each Object.keys(SNIPPETS) as k}
							<button class="tb" onclick={() => insertSnippet(SNIPPETS[k])}>{k}</button>
						{/each}
					</div>

					<!-- Ticker -->
					{#if hasTicker}
						<div class="section-title">Motto ticker</div>
						<p class="hint sm">
							The scrolling strip on the title slide. Phrases cycle in order; the deck repeats
							them to fill the strip, so you only list each one once.
						</p>
						{#each tickerPhrases as phrase, i}
							<div class="ticker-row">
								<input
									class="tv-val grow"
									type="text"
									value={phrase}
									oninput={(e) => setTickerPhrase(i, e.currentTarget.value)}
									placeholder="A phrase for the ticker"
									aria-label="Ticker phrase {i + 1}"
								/>
								<button
									class="mini icon-only"
									onclick={() => moveTickerPhrase(i, -1)}
									disabled={i === 0}
									title="Move up"
									aria-label="Move phrase {i + 1} up">↑</button>
								<button
									class="mini icon-only"
									onclick={() => moveTickerPhrase(i, 1)}
									disabled={i === tickerPhrases.length - 1}
									title="Move down"
									aria-label="Move phrase {i + 1} down">↓</button>
								<button
									class="mini icon-only danger"
									onclick={() => deleteTickerPhrase(i)}
									title="Remove phrase"
									aria-label="Remove phrase {i + 1}">{@html CLOSE_SVG}</button>
							</div>
						{:else}
							<p class="hint">No phrases — the strip will export empty.</p>
						{/each}
						<button class="mini" onclick={addTickerPhrase}>+ Add phrase</button>
						<!-- Deliberately NOT a .ticker-row: that class means "a phrase", and both the
						     styles and the reorder/delete affordances key off it. -->
						<div class="repeat-row">
							<label class="repeat-label" for="ticker-repeat">Repeats per strip</label>
							<input
								id="ticker-repeat"
								class="tv-val repeat-val"
								type="number"
								min={REPEAT_MIN}
								max={REPEAT_MAX}
								step="1"
								value={tickerRepeat}
								oninput={(e) => setTickerRepeat(e.currentTarget.valueAsNumber)}
							/>
						</div>
						<p class="hint sm">
							How many times the cycle is written into each strip. The deck lays down two
							identical strips and scrolls them by half, so each one needs enough phrases to
							stay filled edge to edge — widen the deck, or shorten the phrases, and it wants
							more.
						</p>
						<p class="hint sm">
							The ticker sits outside the slide, so it won't show in the preview — open the
							exported deck to see it run.
						</p>
					{/if}

					<!-- Theme -->
					<div class="section-title">Theme colors</div>
					<p class="hint sm">Changes apply to the whole presentation.</p>
					{#if themeVars.length}
						{#each themeVars as v (v.name)}
							<div class="theme-row">
								{#if v.isColor}
									<span class="sw"><input type="color" value={themeCur(v)} oninput={(e) => applyTheme(v.name, e.currentTarget.value)} /></span>
								{:else}
									<span class="sw" style:background={themeCur(v)}></span>
								{/if}
								<span class="tv-name">--{v.name}</span>
								<input class="tv-val" type="text" value={themeCur(v)} oninput={(e) => applyTheme(v.name, e.currentTarget.value)} />
							</div>
						{/each}
					{:else}
						<p class="hint">No theme variables found.</p>
					{/if}
				{/if}
			</div>
		</section>
	</div>

	<input type="file" accept=".html,text/html" bind:this={fileInput} onchange={onFileInput} hidden />
	{#if toastMsg}
		<div
			class="toast {toastKind}"
			role="status"
			in:fly={{ y: reduce ? 0 : -18, duration: reduce ? 140 : 280 }}
			out:fly={{ y: reduce ? 0 : -12, duration: reduce ? 120 : 200 }}
		>
			{toastMsg}
		</div>
	{/if}
</div>

<style>
	.pb {
		display: flex;
		flex-direction: column;
		/* FILLS the scroll box rather than growing past it: the columns' .col-body panes
		   own their own scrolling, so nothing ever passes beneath the header — which is
		   what lets the header go CLEAR, the same bargain the Traffic board makes (its
		   body owns the scroll; the header needs no paint). The phone sheet stacks the
		   columns and goes back to page scroll — see the media block. */
		height: 100%;
		flex: 1;
		position: relative;
		font-size: 0.9rem;
	}

	/* ── Header + toolbar ── */
	.pb-head {
		/* One inset drives both the padding (all sides) and the flex gap, so the back button
		   sits in an evenly-framed pocket — equal space above, below, left, and to the brand. */
		--pb-inset: 0.9rem;
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: var(--pb-inset);
		flex-wrap: wrap;
		padding: var(--pb-inset);
		/* No background: nothing scrolls under this header on desktop (see .pb) — it's the
		   same glass as the body, one surface, exactly like the Traffic board's. The phone
		   sheet, which DOES scroll beneath it, restores the veil in the media block. */
		background: none;
	}
	.pb-brand {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: -0.01em;
	}
	/* Keep the wordmark on one line. (The SplitFlap cell no longer widens mid-flip — the
	   spin-time 0.4em min-width floor that used to shove the accent dot and Beta sideways was
	   retired in the component itself, so every title is rock-steady now — leaving this only to
	   hold the brand to a single row.) */
	.brand-title {
		white-space: nowrap;
	}
	/* Decorative station-sign bullet in the app accent — the same treatment as the ATFC
	   masthead, scaled to this smaller header. */
	.accent-dot {
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: var(--pb-accent);
		flex-shrink: 0;
	}
	@media (prefers-reduced-motion: no-preference) {
		.accent-dot {
			animation: dot-in 0.45s var(--spring) 0.25s backwards;
		}
	}
	@keyframes dot-in {
		from {
			opacity: 0;
			transform: translateX(-0.8rem);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}
	.beta {
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #fff;
		background: var(--pb-accent);
		border-radius: 999px;
		padding: 0.1rem 0.45rem;
		line-height: 1.5;
	}
	/* The Beta pill enters just after the accent dot (same spring, a beat later), so the
	   masthead ornaments cascade in left-to-right on mount. */
	@media (prefers-reduced-motion: no-preference) {
		.beta {
			animation: beta-in 0.45s var(--spring) 0.38s backwards;
		}
	}
	@keyframes beta-in {
		from {
			opacity: 0;
			transform: translateX(-0.5rem) scale(0.85);
		}
		to {
			opacity: 1;
			transform: translateX(0) scale(1);
		}
	}
	.pb-tools {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.pb-file {
		margin-left: auto;
		font-size: 0.78rem;
		color: var(--sub);
		max-width: 30ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pb-file.dirty {
		color: var(--orange);
		font-weight: 600;
	}

	/* ── Entrance cascade — cohesion with the rest of the app (see puhig's --enter-* tokens) ──
	   The Builder rides in on the same panel .surface every board uses (layer 0, the fly), so it
	   owns only the layers ON that sheet: the header toolbar, then the three editor columns. The
	   header chrome ripples left-to-right on the shared btn-in keyframe exactly like the ATFC
	   super bar — Back, then the five tools, then the filename — while the brand's own dot→Beta
	   cascade plays beside it. The columns follow a beat deeper (layer 2), left to right, so the
	   frame draws before the workspace fills.

	   `backwards` is load-bearing here as everywhere: .tb (and the .chip / .mini / .swatch-btn
	   nested inside the columns) are in the universal hover/press list, and a held transform
	   would outrank and freeze their scale(). Lifting the fill on end hands them back untouched. */
	@media (prefers-reduced-motion: no-preference) {
		/* E-ATFC's staging, worn here too: the Builder is always full-page, so its body
		   waits out the WHOLE chrome ripple (rungs to --bn 7 land ≈0.8s in) before the
		   columns deal in — chrome first, then, finally, the workspace. Same move as
		   .tfc.expanded's deepened --enter-layer. */
		.pb {
			--enter-layer: 0.85s;
		}
		/* Layer 1 — the header toolbar, left to right. */
		.pb-head .icon-btn,
		.pb-tools .tb,
		.pb-file {
			animation: btn-in 0.42s var(--spring) backwards;
			animation-delay: calc(var(--enter-lead) + var(--bn, 0) * var(--btn-enter-step));
		}
		/* Back is --bn 0; the tools count up past the brand's gap; the filename lands last. */
		.pb-tools .tb:nth-child(1) {
			--bn: 2;
		}
		.pb-tools .tb:nth-child(2) {
			--bn: 3;
		}
		.pb-tools .tb:nth-child(3) {
			--bn: 4;
		}
		.pb-tools .tb:nth-child(4) {
			--bn: 5;
		}
		.pb-tools .tb:nth-child(5) {
			--bn: 6;
		}
		.pb-file {
			--bn: 7;
		}

		/* Layer 2 — the three editor columns, one --enter-layer deeper, left to right. */
		.pb-col {
			animation: btn-in 0.5s var(--spring) backwards;
			animation-delay: calc(
				var(--enter-lead) + var(--enter-layer) + var(--cn, 0) * var(--enter-step)
			);
		}
		.pb-center {
			--cn: 1;
		}
		.pb-right {
			--cn: 2;
		}
	}

	/* Buttery button interaction: blur + scale + opacity. Translucent controls read as
	   frosted glass, scale a touch toward the viewer on hover, and squash on press.
	   --btn-ease is a gentle spring for the scale; --soft is a symmetric ease-in-out so the
	   blur and shadow ramp in AND out gracefully (never popping) on both enter and leave. */
	/* Transition, hover pop and press squash all come from the universal button interaction
	   in +page.svelte — these buttons used to define their own (and were the only ones in the
	   app that sprang, which is why Back felt dead beside New/Open). Only the frost below is
	   theirs. */
	/* The glassy button material is Bubble's, not Flat's — a flat button is a fill inside a
	   line, with nothing showing through it. */
	:global(html[data-ui='bubble']) .tb,
	:global(html[data-ui='bubble']) .chip,
	:global(html[data-ui='bubble']) .mini,
	:global(html[data-ui='bubble']) .swatch-btn {
		-webkit-backdrop-filter: blur(6px) saturate(1.3);
		backdrop-filter: blur(6px) saturate(1.3);
	}
	/* The pressed state (squash + flood-tint darkening) is the universal one in +page.svelte.
	   It used to be re-declared here, `.pb`-scoped so it would out-specify the :hover rules
	   below — which also made it out-specify the universal rule, and kept these four buttons
	   moving on a different spring from every other button in the app. Reduced-motion is
	   handled there too. */

	.tb {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border: 1.5px solid var(--line-edge);
		border-radius: 999px;
		padding: 0.4rem 0.85rem;
		cursor: pointer;
	}
	.tb :global(svg) {
		width: 14px;
		height: 14px;
		display: block;
		flex-shrink: 0;
	}
	/* Hover = raised: lift toward the viewer via scale + a soft outer drop, matching the
	   other apps' buttons. The fill stays at its resting tint (NOT darkened) — a darker fill
	   read as a pressed-in dent, which belongs to :active, not hover. */
	/* Hover lifts by line and motion — a darker border, a denser fill, a small scale —
	   not by a drop shadow. Bubble reinstates its gloss globally (+page.svelte). */
	.tb:hover:not(:disabled) {
		border-color: var(--line-strong);
		background: color-mix(in srgb, var(--ink) 5%, transparent);
	}
	:global(html[data-ui='bubble']) .tb:hover:not(:disabled) {
		-webkit-backdrop-filter: blur(10px) saturate(1.5);
		backdrop-filter: blur(10px) saturate(1.5);
	}
	.tb:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
	.tb.primary {
		color: var(--paper);
		background: var(--orange);
		border-color: var(--orange);
	}
	/* The primary action brightened by a coloured glow; the glow was a shadow. It lifts on
	   opacity + the shared scale instead. */
	.tb.primary:hover:not(:disabled) {
		opacity: 0.92;
		background: var(--orange);
	}
	.tb:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.chip {
		display: inline-grid;
		place-items: center;
		font: inherit;
		color: var(--sub);
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border: 1.5px solid var(--line-edge);
		border-radius: 8px;
		padding: 0.32rem;
		cursor: pointer;
	}
	.chip :global(svg) {
		width: 15px;
		height: 15px;
		display: block;
	}
	.chip:hover:not(:disabled) {
		color: var(--ink);
		border-color: var(--line-strong);
	}
	.chip.danger:hover:not(:disabled) {
		color: #c93328;
		border-color: #c93328;
	}
	.chip:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* ── Main 3-column layout ── */
	.pb-main {
		flex: 1;
		display: grid;
		grid-template-columns: 250px 1fr 300px;
		min-height: 0;
	}
	.pb-col {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
	}
	.pb-left {
		border-right: 1px solid var(--line);
	}
	.pb-right {
		border-left: 1px solid var(--line);
	}
	.col-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		padding: 0.65rem 0.8rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
		color: var(--sub);
		border-bottom: 1px solid var(--line);
	}
	.head-actions {
		display: flex;
		gap: 0.3rem;
	}
	.col-body {
		flex: 1;
		overflow-y: auto;
		padding: 0.7rem 0.8rem 1.2rem;
		min-height: 0;
	}

	/* ── Slide list = metro line ── */
	.pb-left .col-body {
		position: relative;
	}
	.rail-bg,
	.rail-fg {
		position: absolute;
		/* left is measured to the dot centre in updateRail (style:left) */
		width: 2px;
		border-radius: 1px;
		pointer-events: none;
	}
	.rail-bg {
		background: color-mix(in srgb, var(--ink) 20%, transparent);
	}
	.rail-fg {
		background: var(--pb-accent);
		transition: height 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.stn-v {
		position: relative;
		display: grid;
		grid-template-columns: 30px 1fr auto;
		/* Two EXPLICIT rows — label line, then title line. Explicit so the dot/drag can span the
		   whole cell with `grid-row: 1 / -1` (a negative line counts from the end of the explicit
		   grid; with implicit rows -1 would fold back to line 1 and the span collapse). */
		grid-template-rows: auto auto;
		align-items: start;
		column-gap: 0.55rem;
		row-gap: 0.1rem;
		padding: 0.5rem 0.35rem;
		cursor: pointer;
	}
	.stn-v::before {
		content: '';
		position: absolute;
		inset: 0.1rem 0 0.1rem 26px;
		border-radius: 9px;
		background: transparent;
		transition: background 0.16s;
		z-index: 0;
	}
	.stn-v:hover::before {
		background: color-mix(in srgb, var(--ink) 6%, transparent);
	}
	.stn-v.active::before {
		background: color-mix(in srgb, var(--pb-accent) 14%, transparent);
	}
	.stn-v.dragover::before {
		background: color-mix(in srgb, var(--pb-accent) 20%, transparent);
		box-shadow: inset 0 0 0 1.5px var(--pb-accent);
	}
	.stn-v > * {
		position: relative;
		z-index: 1;
	}
	.stn-dot {
		/* 1 / -1, not span 2: the row auto-places its title into a THIRD grid row (the middle row
		   resolves to 0px), so span 2 only reached the label line + that empty row and left the dot
		   up at the label. Spanning every row and centring lands it mid-way between the label and
		   title lines — the middle of the active row's highlight. The drag handle opposite matches;
		   the rail is measured from the dots, so it follows. */
		grid-row: 1 / -1;
		justify-self: center;
		align-self: center;
		width: 15px;
		height: 15px;
		/* 999px (not 50%) so the active dot's spread box-shadow can't render squared
		   corners under its scale() transform on some GPUs — see the deck's .stn-dot. */
		border-radius: 999px;
		background: var(--paper);
		border: 2px solid var(--line-strong);
		transition: background 0.25s, border-color 0.25s, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.stn-v.passed .stn-dot {
		border-color: var(--pb-accent);
	}
	.stn-v.active .stn-dot {
		background: var(--pb-accent);
		border-color: var(--pb-accent);
		/* No scale() — its box-shadow can rasterise squared/spiky corners under the
		   composited transform on some GPUs. A wider halo ring carries the emphasis. */
		box-shadow: 0 0 0 5px color-mix(in srgb, var(--pb-accent) 22%, transparent);
	}
	.stn-head {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		min-width: 0;
	}
	.stn-num {
		font-size: 0.64rem;
		font-weight: 700;
		color: var(--sub);
		font-variant-numeric: tabular-nums;
	}
	.stn-label {
		font-weight: 600;
		font-size: 0.86rem;
		color: var(--sub);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.stn-v.active .stn-label {
		color: var(--ink);
	}
	.stn-title {
		grid-column: 2 / 3;
		grid-row: 2; /* explicit, so it can't auto-place into a phantom third row */
		font-size: 0.72rem;
		color: var(--sub);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		opacity: 0.85;
	}
	.stn-drag {
		grid-row: 1 / -1; /* span every row (see .stn-dot) so it centres level with the node */
		align-self: center;
		display: flex;
		color: var(--sub);
		cursor: grab;
		opacity: 0;
		transition: opacity 0.12s;
	}
	.stn-drag :global(svg) {
		width: 14px;
		height: 14px;
		display: block;
	}
	.stn-v:hover .stn-drag {
		opacity: 0.55;
	}

	/* ── Slide rail entrance — the deck's route line ─────────────────────────────────────────
	   Mounts when a deck loads (later than the header/columns), so it runs its own cascade the
	   moment it appears: the rail builds station by station, each row rising while its route-line
	   dot pops on the same spring the homepage map's station dots use. Capped with min() so a
	   long deck doesn't trail on. `backwards` — the row is clickable and must not stay pinned. */
	@media (prefers-reduced-motion: no-preference) {
		.stn-v {
			animation: rise 0.5s ease backwards;
			animation-delay: calc(var(--enter-lead) + min(var(--n, 0), 9) * var(--enter-step));
		}
		/* The route-line node pops as its row rises — a slide station coming alive like a map one. */
		.stn-dot {
			animation: pop 0.5s ease-out backwards;
			animation-delay: calc(var(--enter-lead) + min(var(--n, 0), 9) * var(--enter-step));
		}
	}

	/* ── Column interiors — one layer past the columns' own slide ────────────────────────────
	   The header ripples, the three columns slide in (both above), and their contents settle into
	   them a beat later: each column head deals label-then-actions, the empty-state stack rises,
	   the sidebar hints fade up, and the whole Inspector deals out top-to-bottom (its section
	   titles, fields, swatches, the Insert palette, the ticker rows — one uniform run rather than
	   some parts rippling while others sit drawn). Whatever's mounted for the current state runs
	   its own short cascade. `backwards` throughout: chips, tb, minis and swatch buttons nested in
	   here are all in the universal hover/press list, so the fill must lift or it freezes them. */
	@media (prefers-reduced-motion: no-preference) {
		/* Column heads slide in horizontally (like all chrome), label then actions. btn-in, NOT
		   rise: the Add-slide "+" is disabled with no deck loaded, and rise ends at opacity 1 —
		   so it faded fully in, then snapped to its disabled 0.4. btn-in animates toward each
		   element's own resting opacity, so a disabled control fades straight to its faded state. */
		.col-head > * {
			animation: btn-in 0.42s var(--spring) backwards;
			animation-delay: calc(var(--enter-lead) + var(--enter-layer) + min(var(--n, 0), 8) * var(--enter-step));
		}
		.empty > *,
		.pb-left .col-body > .hint,
		.pb-right .col-body > * {
			animation: rise 0.46s ease backwards;
			animation-delay: calc(var(--enter-lead) + var(--enter-layer) + min(var(--n, 0), 8) * var(--enter-step));
		}
		/* Column heads: the label, then its actions. */
		.col-head > *:nth-child(2) {
			--n: 1;
		}
		/* Empty state: heading, blurb, then the action buttons. */
		.empty > *:nth-child(2) {
			--n: 1;
		}
		.empty > *:nth-child(3) {
			--n: 2;
		}
		/* Inspector body: top-to-bottom, capped so a tall panel doesn't trail on. */
		.pb-right .col-body > *:nth-child(1) {
			--n: 0;
		}
		.pb-right .col-body > *:nth-child(2) {
			--n: 1;
		}
		.pb-right .col-body > *:nth-child(3) {
			--n: 2;
		}
		.pb-right .col-body > *:nth-child(4) {
			--n: 3;
		}
		.pb-right .col-body > *:nth-child(5) {
			--n: 4;
		}
		.pb-right .col-body > *:nth-child(6) {
			--n: 5;
		}
		.pb-right .col-body > *:nth-child(7) {
			--n: 6;
		}
		.pb-right .col-body > *:nth-child(n + 8) {
			--n: 7;
		}
	}

	/* ── Preview ── */
	.pb-center {
		background: var(--page);
		position: relative;
	}
	.preview-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.85rem;
		font-size: 0.75rem;
		color: var(--sub);
		border-bottom: 1px solid var(--line);
		background: var(--panel-head);
	}
	.counter {
		margin-left: auto;
	}
	.preview-frame {
		flex: 1;
		width: 100%;
		border: 0;
		background: var(--page);
	}
	/* A freshly displayed template gives the preview PANE its own entrance — the slide's own
	   animations stay disabled in the editor (so text is editable at rest), so this fades and
	   settles the whole pane instead. Restarted from loadRev (see the $effect); the class just
	   lingers between loads. */
	@media (prefers-reduced-motion: no-preference) {
		.preview-frame.is-entering {
			animation: preview-in 0.5s cubic-bezier(0.4, 0, 0.2, 1);
		}
	}
	@keyframes preview-in {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.985);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	.empty {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		text-align: center;
		color: var(--sub);
		padding: 2rem;
		background: var(--page);
	}
	.empty h2 {
		color: var(--ink);
		font-weight: 700;
	}
	.empty p {
		max-width: 44ch;
		line-height: 1.55;
	}
	.empty-actions {
		display: flex;
		gap: 0.6rem;
	}

	/* ── Inspector ── */
	.hint {
		font-size: 0.78rem;
		color: var(--sub);
		line-height: 1.5;
	}
	.hint.sm {
		margin-bottom: 0.5rem;
	}
	.section-title {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--sub);
		font-weight: 700;
		margin: 1.05rem 0 0.6rem;
		border-top: 1px solid var(--line);
		padding-top: 0.95rem;
	}
	.section-title:first-child {
		border-top: 0;
		padding-top: 0;
		margin-top: 0;
	}
	/* NOT `.field`: that name is the ATFC field pill's, and the page's global Bubble rules
	   key on it — a wrapper here wearing it grew the pill's gloss, radius, and hover spring
	   (the "bubble artifact" on Station label / Slide CSS classes). */
	.pb-field {
		margin-bottom: 0.9rem;
	}
	.pb-field label,
	.field-label {
		display: block;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--sub);
		font-weight: 700;
		margin-bottom: 0.35rem;
	}
	.field-label {
		margin-top: 0.5rem;
	}
	input[type='text'] {
		width: 100%;
		font: inherit;
		font-size: 0.86rem;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1.5px solid var(--line);
		border-radius: 8px;
		padding: 0.45rem 0.6rem;
	}
	input[type='text']:focus {
		outline: none;
		border-color: var(--pb-accent);
	}
	code {
		font-family: ui-monospace, 'SF Mono', Consolas, monospace;
		font-size: 0.88em;
		background: color-mix(in srgb, var(--ink) 8%, transparent);
		padding: 0.05rem 0.36rem;
		border-radius: 6px;
	}
	.insert-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}
	.insert-grid .tb {
		justify-content: flex-start;
		text-align: left;
	}

	.theme-row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin-bottom: 0.45rem;
	}
	.sw {
		width: 26px;
		height: 26px;
		border-radius: 7px;
		border: 1px solid var(--line);
		padding: 0;
		overflow: hidden;
		flex-shrink: 0;
	}
	.sw input {
		width: 150%;
		height: 150%;
		margin: -25%;
		cursor: pointer;
		border: 0;
		padding: 0;
		background: none;
	}
	.tv-name {
		font-size: 0.76rem;
		font-family: ui-monospace, monospace;
		color: var(--sub);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tv-name.fixed {
		flex: 0 0 auto;
	}
	.tv-val {
		font-size: 0.72rem !important;
		font-family: ui-monospace, monospace;
		color: var(--ink);
		width: 8.5ch;
		background: color-mix(in srgb, var(--ink) 4%, transparent);
		border: 1.5px solid var(--line);
		border-radius: 6px;
		padding: 0.22rem 0.35rem;
	}
	.tv-val.grow {
		flex: 1;
		width: auto;
	}

	.el-desc {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.82rem;
		font-family: ui-monospace, monospace;
		margin-bottom: 0.7rem;
		overflow: hidden;
	}
	.el-tag {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.el-tag b {
		color: var(--pb-accent);
	}
	.el-actions {
		display: flex;
		gap: 0.3rem;
		flex-shrink: 0;
	}
	.mini {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font: inherit;
		font-size: 0.72rem;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border: 1.5px solid var(--line);
		border-radius: 999px;
		padding: 0.24rem 0.6rem;
		cursor: pointer;
	}
	/* Icon-only minis are a fixed square, so the ticker's Move-up / Move-down / Remove read as
	   one set. They used to share a symmetric padding, but their contents differ — ↑ and ↓ are
	   text glyphs, Remove is a 13px SVG — so each sized to its own content and the three came out
	   visibly different widths. A fixed box (with the glyph/SVG centred) makes them identical. */
	.mini.icon-only {
		width: 1.72rem;
		height: 1.72rem;
		padding: 0;
		justify-content: center;
	}
	.mini.danger:hover:not(:disabled) {
		color: #c93328;
		border-color: #c93328;
	}
	.mini:disabled {
		opacity: 0.38;
		cursor: default;
		transform: none;
	}
	/* One ticker phrase: the text fills the row, its reorder/remove controls sit tight
	   at the end — same rhythm as .theme-row. */
	/* The repeat control sits with the ticker rows but is a labelled scalar, not a phrase —
	   label left, a narrow number field right. */
	.repeat-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.repeat-label {
		font-size: 0.82rem;
		color: var(--sub);
	}
	.repeat-val {
		width: 5.5rem;
		flex: none;
	}
	.ticker-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-bottom: 0.45rem;
	}
	.mini :global(svg) {
		width: 13px;
		height: 13px;
		display: block;
		flex-shrink: 0;
	}
	.mini:hover:not(:disabled) {
		border-color: var(--line-strong);
	}
	.swatch-row {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-bottom: 0.7rem;
	}
	.swatch-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font: inherit;
		font-size: 0.74rem;
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 5%, transparent);
		border: 1.5px solid var(--line);
		border-radius: 999px;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
	}
	.swatch-btn:hover {
		border-color: color-mix(in srgb, var(--pb-accent) 45%, transparent);
	}
	.swatch-btn.on {
		border-color: var(--pb-accent);
		background: color-mix(in srgb, var(--pb-accent) 14%, transparent);
		font-weight: 600;
	}
	.sw-chip {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		display: inline-block;
		border: 1px solid var(--line-strong);
	}

	/* ── Toast ── */
	.toast {
		/* Top centre, dropping in just below the sticky toolbar — the same place, and the same
		   fly in/out, as the site's own .edit-toast. Centred with auto margins, not
		   translateX(-50%), so the transition owns `transform` alone. */
		position: absolute;
		/* Below BOTH bands it would otherwise straddle — the toolbar (0.9rem inset around a
		   ~2.2rem button row) and the preview bar under it — so it floats cleanly on the slide. */
		top: 6.75rem;
		left: 0;
		right: 0;
		margin-inline: auto;
		width: fit-content;
		max-width: min(90%, 420px);
		text-align: center;
		background: var(--panel-head);
		border: 1.5px solid var(--line);
		color: var(--ink);
		padding: 0.55rem 1.1rem;
		border-radius: 999px;
		font-size: 0.85rem;
		/* Floats above the editor on its border and fill alone — the same way the site's own
		   .edit-toast separates itself, by inverting rather than by casting a shadow. */
		z-index: 20;
	}
	.toast.ok {
		border-color: #00761b;
	}
	.toast.err {
		border-color: #c93328;
	}

	/* ── Narrow: stack the columns ── */
	@media (max-width: 860px) {
		.pb-main {
			grid-template-columns: 1fr;
			grid-template-rows: auto minmax(320px, 1fr) auto;
		}
		.pb-left,
		.pb-right {
			border: 0;
			border-bottom: 1px solid var(--line);
		}
		/* Slides on top, then the preview, then the inspector — each a capped scroll
		   region so the preview always stays in view between the two panels. */
		.pb-left .col-body {
			max-height: 30vh;
		}
		.pb-right .col-body {
			max-height: 44vh;
		}
	}

	/* ── Phone: the panel is a full-width bottom sheet. Tame the header so it reads as a
	   tidy stack (back + brand, then a swipeable toolbar rail, then the filename) instead
	   of five ragged wrapped rows, and give the preview room to breathe. ── */
	@media (max-width: 560px) {
		.pb {
			font-size: 0.88rem;
		}
		.pb {
			/* The phone sheet stacks the columns and scrolls the whole page again. */
			height: auto;
			min-height: 100%;
		}
		.pb-head {
			/* Keep the even-pocket inset, a touch tighter for the phone sheet. */
			--pb-inset: 0.7rem;
			/* Content passes beneath here, so the sticky head keeps its veil. */
			background: var(--panel-head);
		}
		/* Back button + brand share the first row; the brand fills the rest of it. */
		.pb-brand {
			flex: 1 1 auto;
			font-size: 1rem;
		}
		/* Toolbar becomes a single horizontally-scrollable rail — swipe to reach Preview —
		   bleeding to the sheet edges so the last button hints it continues off-screen. */
		.pb-tools {
			flex: 1 1 100%;
			flex-wrap: nowrap;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: none;
			margin: 0 calc(-1 * var(--pb-inset));
			padding: 0.1rem var(--pb-inset) 0.15rem;
		}
		.pb-tools::-webkit-scrollbar {
			display: none;
		}
		.pb-tools .tb {
			flex: 0 0 auto;
		}
		/* Filename drops to its own row rather than being flung to a far corner. */
		.pb-file {
			flex: 1 1 100%;
			margin-left: 0;
			max-width: 100%;
		}
		/* Preview gets the lion's share; the two panels stay compact but scrollable. Column
		   headers pin so their add/duplicate/delete controls are always reachable. */
		.pb-main {
			grid-template-rows: auto minmax(300px, 58vh) auto;
		}
		.pb-left .col-body {
			max-height: 34vh;
		}
		.pb-right .col-body {
			max-height: 50vh;
		}
		.col-head {
			position: sticky;
			top: 0;
			z-index: 2;
			background: var(--panel-head);
		}
		/* Roomier tap targets for the toolbar and the swatch/mini controls on touch. */
		.tb {
			padding: 0.5rem 0.9rem;
		}
		.insert-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
