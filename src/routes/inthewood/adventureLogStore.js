import { writable } from 'svelte/store';

const adventureLogInitial = [
	{ id: 0, message: 'Hi.' },
	{ id: 1, message: 'Welcome to InTheWood!' }
];

export const adventureLog = writable(adventureLogInitial);
