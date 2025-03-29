import { writable } from 'svelte/store';

const categories = [
	{ id: 'eatAndDrink', name: 'Eat and Drink', emoji: '🤤' },
	{
		id: 'entertainment',
		name: 'Entertainment',
		emoji: '🍿'
	},
	{
		id: 'recreation',
		name: 'Recreation',
		emoji: '🌲'
	}
];

export const categoryInventory = writable(categories);
