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
	},
	{
		state: 'New York',
		roots: 'Local',
		name: 'Brooklyn Paramount',
		type: 'Live music venue',
		address: '385 Flatbush Ave Ext, Brooklyn, NY 11201',
		website: 'https://www.brooklynparamount.com/',
		phone: '+17182815850'
	}
];

export const entertainmentInventory = writable(inventory);
