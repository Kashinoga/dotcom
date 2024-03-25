import { writable } from 'svelte/store';

const inventory = [
	{
		state: 'Iowa',
		roots: 'Local',
		name: 'Good Eatins',
		type: 'Southern',
		address: '2811 SE 14th St, Des Moines, IA 50320',
		website: 'n/a',
		phone: '+15158035141'
	},
	{
		state: 'Iowa',
		roots: 'Local',
		name: "Maria's Mexican Food",
		type: 'Mexican',
		address: '4100 SW 9th St, Des Moines, IA 50315',
		website: 'https://mariasiowa.com/',
		phone: '+15152853051'
	},
	{
		state: 'Iowa',
		roots: 'Local',
		name: "Tacos Mariana's",
		type: 'Mexican',
		address: '1305 University Ave, Des Moines, IA 50314',
		website: 'http://tacos-marianas.cafes-city.com/',
		phone: '+15152881499'
	},
	{
		state: 'Iowa',
		roots: 'Local',
		name: 'Horizon Line Coffee',
		type: 'Coffee, tea, and mocktails',
		address: '1417 Walnut St B, Des Moines, IA 50309',
		website: 'http://www.horizonlinecoffee.com/',
		phone: 'n/a'
	}
];

export const eatAndDrinkInventory = writable(inventory);
