import { writable } from 'svelte/store';

const inventory = [
	{
		state: 'Iowa',
		roots: 'Local',
		name: 'Fleur Cinema & Café',
		type: 'Movie Theater',
		address: '4545 Fleur Dr, Des Moines, IA 50321',
		website: 'http://www.fleurcinema.com/',
		phone: '+15152874545'
	},
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
