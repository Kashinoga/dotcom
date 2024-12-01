import { derived, writable } from 'svelte/store';

export type Log = {
	type: 'adventure' | 'session';
	content: string;
};

export const adventureLog = writable<Log[]>([
	{ type: 'adventure', content: 'Hi. 👋' },
	{ type: 'adventure', content: 'Welcome to ⛺ InTheWood!' },
	{ type: 'adventure', content: 'This game is in its very early preview release. 🕐' },
	{ type: 'adventure', content: 'Thank you for your curiosity. 🙏' }
]);

export const sessionLog = writable<Log[]>([{ type: 'session', content: 'Session started.' }]);

export const combinedLogs = derived([adventureLog, sessionLog], ([$adventureLog, $sessionLog]) => [
	...$adventureLog,
	...$sessionLog
]);
