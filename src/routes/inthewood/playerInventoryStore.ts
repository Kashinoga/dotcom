import { writable } from 'svelte/store';
import type { Backpack } from './BackpackInterface';

export const playerInventory = writable<Backpack[]>([
	{ id: 0, name: 'Blueberry', quantity: 2 },
	{ id: 0, name: 'Blackberry', quantity: 4 },
	{ id: 0, name: 'Basic Pocket Knife', quantity: 1 }
]);
