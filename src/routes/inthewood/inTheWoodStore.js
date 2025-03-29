import { writable } from 'svelte/store';

export let inTheWood = writable([
	{ id: 'icon', content: '☄️' },
	{ id: 'title', content: 'Intergalactic Park Ranger' },
	{ id: 'version', content: 'v.0.4-b' }
]);
