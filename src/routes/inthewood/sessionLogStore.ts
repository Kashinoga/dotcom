import { writable, get } from 'svelte/store';
import { gatherActionMessages, gatheredItemMessages } from './messagesStore';
import type { Message } from './MessageInterface';

export const sessionLog = writable<Message[]>([{ id: 1, message: 'You are filled with hope.' }]);

// Function to add a random message to the sessionLog store
export function addRandomMessageToSessionLog() {
	const allMessages = get(gatherActionMessages);

	if (allMessages.length === 0) {
		return;
	}

	const randomIndex = Math.floor(Math.random() * allMessages.length);
	const randomMessage = allMessages[randomIndex];

	sessionLog.update((sessionLog) => [...sessionLog, randomMessage]);
}

export function addRandomGatherMessageToSessionLog() {
	const allMessages = get(gatheredItemMessages);

	if (allMessages.length === 0) {
		return;
	}

	const randomIndex = Math.floor(Math.random() * allMessages.length);
	const randomMessage = allMessages[randomIndex];
	sessionLog.update((sessionLog) => [...sessionLog, randomMessage]);
}
