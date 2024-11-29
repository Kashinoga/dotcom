import { derived, get, writable } from 'svelte/store';
import type { Message } from './MessageInterface';

import { gatherActionMessages, gatheredItemMessages } from './messagesStore';

export const adventureLogMessages = writable<Message[]>([
	{ id: 0, message: 'Hi.' },
	{ id: 1, message: 'Welcome to InTheWood!' },
	{ id: 2, message: 'This game is in its very early preview release.' },
	{ id: 3, message: 'Thank you for your curiosity.' }
]);

// export const adventureLog = writable<Message[]>([{ id: 1, message: 'You are filled with hope.' }]);

// Define the correct type for logs
export type Log = {
	type: 'adventure' | 'session'; // This restricts 'type' to either 'adventure' or 'session'
	content: string;
};

// export const adventureLogStore = writable<Log[]>([
// 	{ type: 'adventure', content: 'Found a hidden treasure!' },
// 	{ type: 'session', content: 'Session started at 5:00 PM.' },
// 	{ type: 'adventure', content: 'Defeated the dragon.' },
// 	{ type: 'session', content: 'Session ended at 7:00 PM.' }
// ]);

export const adventureLogs = writable<Log[]>([
	{ type: 'adventure', content: 'Found a hidden treasure!' },
	{ type: 'adventure', content: 'Defeated the dragon.' }
]);

export const sessionLogs = writable<Log[]>([
	{ type: 'session', content: 'Session started at 5:00 PM.' },
	{ type: 'session', content: 'Session ended at 7:00 PM.' }
]);

export const combinedLogs = derived(
	[adventureLogs, sessionLogs],
	([$adventureLogs, $sessionLogs]) => [...$adventureLogs, ...$sessionLogs]
);

// Define 'logs' with the correct type
// export const adventureLogStore: Log[] = [
// 	{ type: 'adventure', content: 'Found a hidden treasure!' },
// 	{ type: 'session', content: 'Session started at 5:00 PM.' },
// 	{ type: 'adventure', content: 'Defeated the dragon.' },
// 	{ type: 'session', content: 'Session ended at 7:00 PM.' }
// ];

// export function addLog(log: Log) {
// 	adventureLogStore.update((logs) => [...logs, log]);
// }

// export function addRandomGatherMessageToAdventureLog() {
// 	const allMessages = get(gatherActionMessages);

// 	if (allMessages.length === 0) {
// 		return;
// 	}

// 	const randomIndex = Math.floor(Math.random() * allMessages.length);
// 	const randomMessage = allMessages[randomIndex];
// 	adventureLog.update((adventureLog) => [...adventureLog, randomMessage]);
// }

// export function addRandomMessageToAdventureLog() {
// 	const allMessages = get(gatheredItemMessages);

// 	if (allMessages.length === 0) {
// 		return;
// 	}

// 	const randomIndex = Math.floor(Math.random() * allMessages.length);
// 	const randomMessage = allMessages[randomIndex];

// 	adventureLog.update((adventureLog) => [...adventureLog, randomMessage]);
// }
