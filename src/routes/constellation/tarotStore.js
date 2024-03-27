import { writable } from 'svelte/store';

export let tarotMajor = writable([{ name: 'The Magician', attribute: 'Intelligence, Charisma' }]);

export let tarotMinor = writable([
	{
		name: 'Ace of Swords',
		number: 'Ace',
		suite: 'Swords',
		attribute: 'Strength',
		meaning: 'Unbreakable Will, Focused Power, Decisive Action'
	},
	{
		name: 'Joker of Swords',
		number: 'Joker',
		suite: 'Swords',
		attribute: 'Strength',
		meaning: 'Uncontrolled Force, Raw Potential, Disruptive Change'
	},
	{
		name: 'Two of Swords',
		number: 'Two',
		suite: 'Swords',
		attribute: 'Strength',
		meaning: 'Inner Conflict, Balanced Forces, Stalemate'
	},
	{
		name: 'Three of Swords',
		number: 'Three',
		suite: 'Swords',
		attribute: 'Strength',
		meaning: 'Piercing Pain, Resilience, Strength Through Hardship'
	},
	{
		name: 'Four of Swords',
		number: 'Four',
		suite: 'Swords',
		attribute: 'Strength',
		meaning: 'Fortitude, Regrouping, Renewed Strength'
	},
	{
		name: 'Five of Swords',
		number: 'Five',
		suite: 'Swords',
		attribute: 'Strength',
		meaning: 'Forceful Action, Cunning Tactic, Merciless Victory'
	},
	{
		name: 'Six of Swords',
		number: 'Six',
		suite: 'Swords',
		attribute: 'Strength',
		meaning: 'Courageous Journey, Strength in Transition, Letting Go with Resolve'
	},
	{
		name: 'Seven of Swords',
		number: 'Seven',
		suite: 'Swords',
		attribute: 'Strength',
		meaning: 'Cunning Strategy, Resourcefulness Under Pressure, Mental Fortitude'
	},
	{
		name: 'Eight of Swords',
		number: 'Eight',
		suite: 'Swords',
		attribute: 'Strength',
		meaning: 'Limited Options, Strength in Adaptability, Finding Inner Resolve'
	},
	{
		name: 'Nine of Swords',
		number: 'Nine',
		suite: 'Swords',
		attribute: 'Strength',
		meaning: 'Facing Inner Demons, Mental Resilience, Overcoming Self-Doubt'
	},
	{
		name: 'Ten of Swords',
		number: 'Ten',
		suite: 'Swords',
		attribute: 'Strength',
		meaning: 'Overwhelming Defeat, Crushing Blow, Strength to Rebuild'
	},
	{
		name: 'Queen of Swords',
		number: 'Queen',
		suite: 'Swords',
		attribute: 'Strength',
		strength: 'Unwavering Conviction, Intellectual Strength, Sharpened Judgment'
	},
	{
		name: 'King of Swords',
		number: 'King',
		suite: 'Swords',
		attribute: 'Strength',
		meaning: 'Commanding Presence, Strategic Control, Unrelenting Will'
	}
]);
