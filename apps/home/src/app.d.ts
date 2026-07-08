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
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
