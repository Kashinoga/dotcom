import { writable } from 'svelte/store';

const sessionLogInitial = [
	{ id: 0, message: 'You wake up feeling refreshed.' },
	{ id: 1, message: 'You are filled with hope.' }
];

export const sessionLog = writable(sessionLogInitial);
