// @kashinoga/puhig — design-system entry point.
// Card components, tokens, and movement, ported from the dotcom-2 puhig
// design language into scoped Svelte components.

export { default as Card } from './Card.svelte';
export { default as Sleeve } from './Sleeve.svelte';
export { default as Panel } from './Panel.svelte';
export { gridFit } from './gridFit';
export { tilt } from './tilt';

export const PUHIG_VERSION = '0.0.5';
