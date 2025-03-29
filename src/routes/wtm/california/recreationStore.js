import { writable } from 'svelte/store';

const inventory = [
	{
		name: 'Crescent City - Battery Point Beach',
		type: 'Beach',
		address: 'Battery Point Vista Area, 235 Lighthouse Way, Crescent City, CA 95531',
		roots: 'Nature'
	},
    {
		name: 'Crescent City - Lighthouse Jetty',
		type: 'Historical landmark',
		address: 'Lighthouse Way, Crescent City, CA 95531',
		roots: 'Landmark'
	}
];

export const recreationInventory = writable(inventory);
