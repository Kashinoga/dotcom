import { writable } from 'svelte/store';

const inventory = [
	{
		name: 'Placeholder',
		type: 'Placeholder',
		address: 'Placeholder',
		roots: 'Placeholder'
	}
];

export const entertainmentInventory = writable(inventory);
