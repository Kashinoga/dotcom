import { writable } from 'svelte/store';

export let inTheWood = writable([
	{ id: 'icon', content: '⛺' },
	{ id: 'title', content: 'InTheWood' }
]);
