import { writable } from 'svelte/store';

export let navMoji = writable([
	{ id: 'emergency', name: 'Emergency', emoji: '🚨' },
	{ id: 'caretaking', name: 'Caretaking', emoji: '💅' }
]);
