import { writable } from 'svelte/store';

const inventory = [
	{
		state: 'Iowa',
		name: 'Good Eatins',
		cuisine: 'Southern',
		address: '2811 SE 14th St, Des Moines, IA 50320',
		phone: '+15158035141'
	},
	{
		state: 'Iowa',
		name: "Tacos Mariana's",
		cuisine: 'Mexican',
		address: '1305 University Ave, Des Moines, IA 50314',
		phone: '+15152881499'
	}
];

export const eatAndDrinkInventory = writable(inventory);
