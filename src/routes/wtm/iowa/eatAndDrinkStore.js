import { writable } from 'svelte/store';

const inventory = [
	{
		state: 'Iowa',
		roots: 'Local',
		name: 'Good Eatins',
		cuisine: 'Southern',
		address: '2811 SE 14th St, Des Moines, IA 50320',
		website: '',
		phone: '+15158035141'
	},
	{
		state: 'Iowa',
		roots: 'Local',
		name: "Maria's Mexican Food",
		cuisine: 'Mexican',
		address: '4100 SW 9th St, Des Moines, IA 50315',
		website: 'https://mariasiowa.com/',
		phone: '+15152853051'
	},
	{
		state: 'Iowa',
		roots: 'Local',
		name: "Tacos Mariana's",
		cuisine: 'Mexican',
		address: '1305 University Ave, Des Moines, IA 50314',
		website: 'http://tacos-marianas.cafes-city.com/',
		phone: '+15152881499'
	}
];

export const eatAndDrinkInventory = writable(inventory);
