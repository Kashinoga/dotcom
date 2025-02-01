import { writable } from 'svelte/store';

const inventory = [
	{
		state: 'New York',
		roots: 'Local',
		name: 'Comedy Cellar',
		type: 'Comedy club',
		address: '117 MacDougal St, New York, NY 10012',
		website: 'http://comedycellar.com/',
		phone: '+12122543480'
	}
];

export const entertainmentInventory = writable(inventory);
