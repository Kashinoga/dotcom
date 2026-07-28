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
			/**
			 * The Air Traffic board's size (`?expanded=`): true is the full-viewport
			 * board, false the compact panel (the default, which carries no param).
			 * Absent means "whatever `load` resolved".
			 */
			expanded?: boolean;
		}
		// interface Platform {}
	}

	/**
	 * The FILE SYSTEM ACCESS API, declared here because TypeScript's DOM library does not carry
	 * it — it is not a settled standard, which is also why the Text Editor gates every use of it
	 * behind a runtime check rather than assuming it (see `canWrite` in $lib/text-editor-state).
	 *
	 * Only the two pieces this app actually calls are declared. `showDirectoryPicker` is the one
	 * honest detect for "can this browser reach the real file system": the handle interfaces below
	 * it exist in every current engine, but in Safari and Firefox they only ever reach the
	 * sandboxed Origin Private File System, which is no use for editing a folder of notes.
	 */
	interface Window {
		showDirectoryPicker?: (options?: {
			mode?: 'read' | 'readwrite';
			startIn?: string;
			id?: string;
		}) => Promise<FileSystemDirectoryHandle>;
	}
	interface FileSystemFileHandle {
		/** Rename, or move to another directory. Chromium only, at the time of writing. */
		move(name: string): Promise<void>;
		move(directory: FileSystemDirectoryHandle, name?: string): Promise<void>;
	}
}

export {};
