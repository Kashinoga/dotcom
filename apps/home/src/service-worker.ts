/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/**
 * THE TEXT EDITOR'S SERVICE WORKER — and nothing else's.
 *
 * The editor is the one app on this site that can be installed (see static/text-editor.webmanifest),
 * and it is the only one worth installing: every other place here is a reader of something live —
 * aircraft, weather, the sky — and a copy of one held offline shows yesterday's world with no way
 * to say so. The editor is the opposite. Its documents are on the visitor's own disk, and the only
 * thing standing between it and a plane is this file.
 *
 * It is NOT registered site-wide. `serviceWorker: { register: false }` in vite.config.ts turns
 * SvelteKit's automatic registration off, and the editor registers this itself while it is mounted
 * (see $lib/TextEditor.svelte). A worker registered from the front page would take a scope of `/`
 * and start answering for panels that have no business being cached.
 *
 * ── Why nothing is precached but the page ──────────────────────────────────────
 *
 * The obvious install step is to walk `build` and put the lot in the cache. That is what most
 * examples do, and it is wrong here: `build` is EVERY route's JavaScript, this site's routes
 * include a WebGL star map, and an install would pull megabytes nobody asked for down a phone's
 * connection to make an editor work offline.
 *
 * So the shell is fetched as it is USED — the first online visit populates the cache with exactly
 * the chunks the editor loads, and the visit after that can be on a plane. The one thing taken at
 * install is the page itself, because a worker installed from a browser tab and then LAUNCHED from
 * a Start menu offline has never navigated anywhere and would otherwise open on the browser's own
 * error page.
 */

import { build, version } from '$service-worker';

// `self` in a module worker is typed as the window otherwise, and every one of the events below
// would be an error on a type that has never heard of them.
const sw = self as unknown as ServiceWorkerGlobalScope;

/**
 * One cache per BUILD. The name carries `version` (SvelteKit's build id), so a deploy cannot be
 * served a mix of old chunks and new ones — the new worker fills a new cache and the old one is
 * dropped whole at activation. That matters more than it sounds: the hashed chunks are immutable
 * and safe to keep forever, but the HTML that names them is not.
 */
const CACHE = `text-editor-${version}`;

/** Where the app lives. Everything this worker answers for is under here, or is an asset of it. */
const APP = '/apps/text-editor';

/** The hashed, immutable build output — safe to serve from the cache without asking. */
const IMMUTABLE = new Set(build);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			// `reload` rather than a plain fetch: an install that quietly copied a stale HTTP-cached
			// page would pin the previous deploy's HTML into a cache named for this one.
			try {
				await cache.add(new Request(APP, { cache: 'reload' }));
			} catch {
				// Offline at install, or the page 404'd behind a proxy. Not fatal — the first online
				// navigation fills this in, and there is nothing useful to do about it here.
			}
			// The editor is the only thing this worker serves and there is no half-installed state
			// worth preserving, so it takes over rather than waiting for every tab to close.
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				// Only this app's own caches. A key that is not ours belongs to something else on the
				// origin, and deleting by prefix is how a worker eats a neighbour's data.
				if (key.startsWith('text-editor-') && key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;

	const url = new URL(req.url);
	// Same origin only. The share cards, the fonts and the chunks are all here; anything else is
	// somebody else's server and none of this worker's business.
	if (url.origin !== sw.location.origin) return;
	// The API proxies are LIVE readings — aircraft, weather, a geocode. A cached answer to one of
	// those is not a stale asset, it is a wrong fact, and the editor does not call them anyway.
	if (url.pathname.startsWith('/api/')) return;

	// A NAVIGATION to the editor: network first, cache second. The other way round would pin a
	// deploy — the HTML names hashed chunks, so an old page served from a cache asks for files the
	// new build no longer has.
	if (req.mode === 'navigate') {
		if (!url.pathname.startsWith(APP)) return;
		event.respondWith(
			(async () => {
				try {
					const fresh = await fetch(req);
					const cache = await caches.open(CACHE);
					cache.put(APP, fresh.clone());
					return fresh;
				} catch {
					// Offline. The page as it was last seen, or the copy taken at install — matched
					// against APP rather than the request, so `/apps/text-editor?anything` still opens.
					const cached = await caches.match(APP, { cacheName: CACHE });
					if (cached) return cached;
					throw new Error('offline, and the editor has never been opened here');
				}
			})()
		);
		return;
	}

	// An ASSET. The build's own output is content-hashed, so a hit is definitionally current and
	// there is no reason to ask the network about it. Everything else same-origin (the icons, the
	// manifest) is checked against the network first and falls back to whatever was kept.
	const immutable = IMMUTABLE.has(url.pathname);
	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			if (immutable) {
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
			}
			try {
				const res = await fetch(req);
				// Only a real answer is worth keeping. A 404 or a redirect cached here would outlive
				// the mistake that caused it.
				if (res.ok && res.type === 'basic') cache.put(req, res.clone());
				return res;
			} catch {
				const hit = await cache.match(req);
				if (hit) return hit;
				throw new Error(`offline, and ${url.pathname} was never cached`);
			}
		})()
	);
});
