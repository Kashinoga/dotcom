import { writable } from 'svelte/store';
import type { Backpack } from './BackpackInterface';

export const backpack = writable<Backpack[]>([
	{ id: 0, item: 'Blueberry', quantity: 2 },
	{ id: 0, item: 'Blackberry', quantity: 4 }
]);
