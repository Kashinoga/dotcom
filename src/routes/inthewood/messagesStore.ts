import { writable } from 'svelte/store';
import type { Message } from './MessageInterface';

export const gatherActionMessages = writable<Message[]>([
	{ id: 0, message: 'You wake up feeling refreshed.' },
	{ id: 1, message: 'You are filled with hope.' },
	{ id: 2, message: 'The sun is shining brightly.' },
	{ id: 3, message: 'You hear birds chirping outside.' }
]);

export const gatheredItemMessages = writable<Message[]>([
	{ id: 0, message: 'You found a blueberry.' },
	{ id: 1, message: 'You found a blackberry.' }
]);
