import { writable } from 'svelte/store';

const sessionLogInitial = [
	{ id: 0, message: 'Test.' },
	{ id: 1, message: 'Test 2.' }
];

export const sessionLog = writable(sessionLogInitial);

export function handsAction() {
	const newSessionLogMessage = { id: '2', message: 'Test 3.' };
	// @ts-ignore
	sessionLog.update((currentLog) => [...currentLog, newSessionLogMessage]);
}
