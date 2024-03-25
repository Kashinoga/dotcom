import { writable } from 'svelte/store';

const inventory = [
	{
		state: 'Minnesota',
		roots: 'Local',
		name: 'The Copper Hen Cakery & Kitchen',
		cuisine: 'Farmhouse',
		address: '2515 Nicollet Ave, Minneapolis, MN 55404',
		website: 'http://www.copperhenkitchen.com/',
		phone: '+16128722221'
	}
];

export const eatAndDrinkInventory = writable(inventory);
