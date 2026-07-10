// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

// Vite `?raw` import: pull a file in as a string at build time (used for the
// bundled demo deck — src/lib/decks/kashinoga-demo.html).
declare module '*.html?raw' {
	const content: string;
	export default content;
}

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/**
			 * The panel a shallow-routed history entry stands for — see $lib/views.ts.
			 * `null` is the overview map; absent means the entry came from a real
			 * navigation, so the panel is whatever that route's `load` returned.
			 */
			view?: import('$lib/views').View | null;
			/**
			 * The Air Traffic board's selected field, as an IATA code (`?field=`).
			 * `null` is the default field. Absent means "whatever `load` resolved".
			 */
			field?: string | null;
			/**
			 * The Air Traffic board's radius in NM (`?range=`), and its auto-refresh
			 * cadence in milliseconds (`?refresh=`). `null` is the default; absent means
			 * "whatever `load` resolved". Both are stored as values, not tokens — the
			 * board takes numbers, and $lib/scope owns the token spelling.
			 */
			range?: number | null;
			refresh?: number | null;
		}
		// interface Platform {}
	}
}

export {};
