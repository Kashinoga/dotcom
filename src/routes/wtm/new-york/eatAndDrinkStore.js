import { writable } from 'svelte/store';

const inventory = [
	{
		state: 'New York',
		roots: 'Local',
		name: 'Hana Makgeolli Brewery & Tasting Room',
		type: 'Korean wine and small plates',
		address: '201 Dupont St, Brooklyn, NY 11222',
		website: 'https://www.hanamakgeolli.com/'
	},
	{
		state: 'New York',
		roots: 'Regional',
		name: 'KazuNori - NoMad',
		type: 'The Original Hand Roll Bar',
		address: ' 15 West 28th Street New York, NY 10001',
		website: 'https://www.handrollbar.com/locations/nomad/'
	}
];

export const eatAndDrinkInventory = writable(inventory);
