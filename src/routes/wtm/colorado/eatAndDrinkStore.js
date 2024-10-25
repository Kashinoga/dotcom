import { writable } from 'svelte/store';

const inventory = [
	{
		state: 'Colorado',
		roots: 'Local',
		name: 'The Boulder Dushanbe Teahouse',
		type: 'Traditional teahouse',
		address: '1770 13th St, Boulder, CO 80302',
		website: 'https://www.boulderteahouse.com/',
		phone: '+13034424993'
	}
];

export const eatAndDrinkInventory = writable(inventory);
