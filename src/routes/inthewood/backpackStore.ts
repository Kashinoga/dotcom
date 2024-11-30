import { writable } from 'svelte/store';
import type { Backpack } from './BackpackInterface';

export const backpack = writable<Backpack[]>([
	{ id: 0, name: 'Blueberry', quantity: 2 },
	{ id: 1, name: 'Blackberry', quantity: 4 },
	{ id: 2, name: 'Basic Pocket Knife', quantity: 1 }
]);
