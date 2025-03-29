import { get } from 'svelte/store';
import { statesOfAmericaInventory } from './unitedStatesStore';

/**
 * Get the page's state name from the URL.
 * @param pathname - The URL pathname that includes the state name (e.g., /wtm/minnesota)
 * @returns Capitalized state name (e.g., Minnesota) or an empty string if not found
 */
export function getStateName(pathname: string): string {
	const parts = pathname.split('/'); // Split by slashes
	const lastSegment = parts[parts.length - 1]; // Get the last part

	// Get the current state of the store
	const states = get(statesOfAmericaInventory);

	// Find the state that matches the URL
	const state = states.find((state) => state.url === lastSegment);

	// Return the state name if found, otherwise return an empty string
	return state ? state.name : '';
}
