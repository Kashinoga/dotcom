// See https://svelte.dev/docs/kit/types#app.d.ts
//
// Emptied with the rest of the site. Every declaration that used to stand here belonged to
// something the rebuild has not reached yet — the panel router's `PageState`, the Air Traffic
// board's query params, and the File System Access API the Text Editor needed and TypeScript's
// DOM library does not carry. They are all in `_TO_MIGRATE/apps/home/src/app.d.ts`, and each one
// should come back WITH the feature that needs it, not before it.

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
