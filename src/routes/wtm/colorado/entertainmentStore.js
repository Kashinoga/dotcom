import { writable } from 'svelte/store';

const inventory = [
	{
		state: 'Colorado',
		roots: 'Local',
		name: 'Red Rocks Amphitheatre',
		type: 'Amphitheatre',
		address: '18300 West Alameda Parkway Morrison, CO 80465',
		website: 'https://www.redrocksonline.com/',
		phone: '+17208652494 '
	}
];

export const entertainmentInventory = writable(inventory);
