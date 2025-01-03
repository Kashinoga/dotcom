import { writable } from 'svelte/store';

const statesOfAmerica = [
	{ name: 'Alabama', abbreviation: 'AL', emoji: '', enabled: 'true' },
	{ name: 'Alaska', abbreviation: 'AK', emoji: '', enabled: 'true' },
	{ name: 'Arizona', abbreviation: 'AZ', emoji: '', enabled: 'true' },
	{ name: 'Arkansas', abbreviation: 'AR', emoji: '', enabled: 'true' },
	{ name: 'California', abbreviation: 'CA', emoji: '', enabled: 'true' },
	{ name: 'Colorado', abbreviation: 'CO', emoji: '🏔️', enabled: 'true' },
	{ name: 'Connecticut', abbreviation: 'CT', emoji: '', enabled: 'true' },
	{ name: 'Delaware', abbreviation: 'DE', emoji: '', enabled: 'true' },
	{ name: 'Florida', abbreviation: 'FL', emoji: '', enabled: 'true' },
	{ name: 'Georgia', abbreviation: 'GA', emoji: '', enabled: 'true' },
	{ name: 'Hawaii', abbreviation: 'HI', emoji: '', enabled: 'true' },
	{ name: 'Idaho', abbreviation: 'ID', emoji: '', enabled: 'true' },
	{ name: 'Illinois', abbreviation: 'IL', emoji: '', enabled: 'true' },
	{ name: 'Indiana', abbreviation: 'IN', emoji: '', enabled: 'true' },
	{ name: 'Iowa', abbreviation: 'IA', emoji: '🌽', enabled: 'true' },
	{ name: 'Kansas', abbreviation: 'KS', emoji: '', enabled: 'true' },
	{ name: 'Kentucky', abbreviation: 'KY', emoji: '', enabled: 'true' },
	{ name: 'Louisiana', abbreviation: 'LA', emoji: '', enabled: 'true' },
	{ name: 'Maine', abbreviation: 'ME', emoji: '', enabled: 'true' },
	{ name: 'Maryland', abbreviation: 'MD', emoji: '', enabled: 'true' },
	{ name: 'Massachusetts', abbreviation: 'MA', emoji: '', enabled: 'true' },
	{ name: 'Michigan', abbreviation: 'MI', emoji: '', enabled: 'true' },
	{ name: 'Minnesota', abbreviation: 'MN', emoji: '❄️', enabled: 'true' },
	{ name: 'Mississippi', abbreviation: 'MS', emoji: '', enabled: 'true' },
	{ name: 'Missouri', abbreviation: 'MO', emoji: '', enabled: 'true' },
	{ name: 'Montana', abbreviation: 'MT', emoji: '', enabled: 'true' },
	{ name: 'Nebraska', abbreviation: 'NE', emoji: '', enabled: 'true' },
	{ name: 'Nevada', abbreviation: 'NV', emoji: '', enabled: 'true' },
	{ name: 'New Hampshire', abbreviation: 'NH', emoji: '', enabled: 'true' },
	{ name: 'New Jersey', abbreviation: 'NJ', emoji: '', enabled: 'true' },
	{ name: 'New Mexico', abbreviation: 'NM', emoji: '', enabled: 'true' },
	{ name: 'New York', abbreviation: 'NY', emoji: '', enabled: 'true' },
	{ name: 'North Carolina', abbreviation: 'NC', emoji: '', enabled: 'true' },
	{ name: 'North Dakota', abbreviation: 'ND', emoji: '', enabled: 'true' },
	{ name: 'Ohio', abbreviation: 'OH', emoji: '', enabled: 'true' },
	{ name: 'Oklahoma', abbreviation: 'OK', emoji: '', enabled: 'true' },
	{ name: 'Oregon', abbreviation: 'OR', emoji: '', enabled: 'true' },
	{ name: 'Pennsylvania', abbreviation: 'PA', emoji: '', enabled: 'true' },
	{ name: 'Rhode Island', abbreviation: 'RI', emoji: '', enabled: 'true' },
	{ name: 'South Carolina', abbreviation: 'SC', emoji: '', enabled: 'true' },
	{ name: 'South Dakota', abbreviation: 'SD', emoji: '', enabled: 'true' },
	{ name: 'Tennessee', abbreviation: 'TN', emoji: '', enabled: 'true' },
	{ name: 'Texas', abbreviation: 'TX', emoji: '', enabled: 'true' },
	{ name: 'Utah', abbreviation: 'UT', emoji: '', enabled: 'true' },
	{ name: 'Vermont', abbreviation: 'VT', emoji: '', enabled: 'true' },
	{ name: 'Virginia', abbreviation: 'VA', emoji: '', enabled: 'true' },
	{ name: 'Washington', abbreviation: 'WA', emoji: '', enabled: 'true' },
	{ name: 'West Virginia', abbreviation: 'WV', emoji: '', enabled: 'true' },
	{ name: 'Wisconsin', abbreviation: 'WI', emoji: '', enabled: 'true' },
	{ name: 'Wyoming', abbreviation: 'WY', emoji: '', enabled: 'true' }
];

export const statesOfAmericaInventory = writable(statesOfAmerica);
