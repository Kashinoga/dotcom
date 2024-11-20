import { writable } from 'svelte/store';
import type { Message } from './MessageInterface';

export const adventureLog = writable<Message[]>([
	{ id: 0, message: 'Hi.' },
	{ id: 1, message: 'Welcome to InTheWood!' },
	{ id: 2, message: 'This game is in its very early preview release.' },
	{ id: 3, message: 'Thank you for your curiosity.' }
]);
