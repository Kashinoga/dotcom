import { writable } from 'svelte/store';

const inventory = [
	{
		state: 'Minnesota',
		roots: 'Local',
		name: 'The Parkway Theater',
		type: 'Theater',
		address: '4814 Chicago Ave, Minneapolis, MN 55417',
		website: 'https://theparkwaytheater.com/',
		phone: '+16128228080'
	}
];

export const entertainmentInventory = writable(inventory);
