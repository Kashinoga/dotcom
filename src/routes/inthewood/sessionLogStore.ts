import { writable, derived, get } from 'svelte/store';
import { messages } from './messagesStore';

// Define the Message type
interface Message {
	id: number;
	message: string;
}

// Define some initial messages
const initialMessages: Message[] = [{ id: 0, message: 'You are feeling refreshed.' }];

// Create the sessionLog store with the Message type
export const sessionLog = writable<Message[]>(initialMessages);

// Create a derived store to pull messages from the messages store
export const sessionLogDerived = derived(messages, ($messages) => {
	// You can filter or transform messages here if needed
	return $messages;
});

// Function to add a random message to the sessionLog store
export function addRandomMessageToSessionLog() {
	const allMessages = get(messages);
	if (allMessages.length === 0) {
		return;
	}

	const randomIndex = Math.floor(Math.random() * allMessages.length);
	const randomMessage = allMessages[randomIndex];

	sessionLog.update((sessionLog) => [...sessionLog, randomMessage]);
}
