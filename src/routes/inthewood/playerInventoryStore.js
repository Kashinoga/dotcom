import { writable } from 'svelte/store';

const playerInventoryInitial = [{ name: 'Barehanded' }, { name: 'Basic Pocket Knife' }];

export const playerInventory = writable(playerInventoryInitial);
