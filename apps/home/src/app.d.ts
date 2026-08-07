// See https://svelte.dev/docs/kit/types#app.d.ts

// Vite `?raw`: pull a file in as a string at build time. Used for the design system's own
// documentation page — see $lib/docs-content.ts.
declare module '*.html?raw' {
	const content: string;
	export default content;
}

// The design system's untyped script is declared in src/ambient.d.ts, which has to be a script
// rather than a module for that declaration to bind — the reason is written there.

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
