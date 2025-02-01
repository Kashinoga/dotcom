import { writable } from 'svelte/store';

const inventory = [
	{
		roots: 'Local',
		name: 'Crescent City - Crescent Seafood',
		type: 'Seafood market and restaurant',
		address: '170 Marine Way, Crescent City, CA 95531',
		website: 'https://www.crescentseafoodcc.net/'
	}
];

export const eatAndDrinkInventory = writable(inventory);
