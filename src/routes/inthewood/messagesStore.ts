import { writable } from 'svelte/store';

// Define the Message type
interface Message {
	id: number;
	message: string;
}

// Initial messages data
const messagesInitial: Message[] = [
	{ id: 0, message: 'You wake up feeling refreshed.' },
	{ id: 1, message: 'You are filled with hope.' },
	{ id: 2, message: 'The sun is shining brightly.' },
	{ id: 3, message: 'You hear birds chirping outside.' }
];

// Create the messages store with the Message type
export const messages = writable<Message[]>(messagesInitial);
