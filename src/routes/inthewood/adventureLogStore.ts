import { derived, writable } from 'svelte/store';
import type { Message } from './MessageInterface';

export const adventureLogMessages = writable<Message[]>([
	{ id: 0, message: 'Hi.' },
	{ id: 1, message: 'Welcome to InTheWood!' },
	{ id: 2, message: 'This game is in its very early preview release.' },
	{ id: 3, message: 'Thank you for your curiosity.' }
]);

// Define the correct type for logs
export type Log = {
	type: 'adventure' | 'session'; // This restricts 'type' to either 'adventure' or 'session'
	content: string;
};

export const adventureLogs = writable<Log[]>([
	{ type: 'adventure', content: 'Hi.' },
	{ type: 'adventure', content: 'Welcome to InTheWood!' },
	{ type: 'adventure', content: 'This game is in its very early preview release.' },
	{ type: 'adventure', content: 'Thank you for your curiosity.' }
]);

export const sessionLogs = writable<Log[]>([{ type: 'session', content: 'Session started.' }]);

export const combinedLogs = derived(
	[adventureLogs, sessionLogs],
	([$adventureLogs, $sessionLogs]) => [...$adventureLogs, ...$sessionLogs]
);
