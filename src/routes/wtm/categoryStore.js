import { writable } from 'svelte/store';

const categories = [
	{ id: 'eatAndDrink', name: 'Eat and Drink', emoji: '🤤' },
	{
		id: 'entertainment',
		name: 'Entertainment',
		emoji: '🍿'
	}
];

export const categoryInventory = writable(categories);
