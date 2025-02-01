import { writable } from 'svelte/store';

const statesOfAmerica = [
    { name: 'Alabama', abbreviation: 'AL', emoji: '', enabled: 'false', url: 'alabama' },
    { name: 'Alaska', abbreviation: 'AK', emoji: '', enabled: 'false', url: 'alaska' },
    { name: 'Arizona', abbreviation: 'AZ', emoji: '', enabled: 'false', url: 'arizona' },
    { name: 'Arkansas', abbreviation: 'AR', emoji: '', enabled: 'false', url: 'arkansas' },
    { name: 'California', abbreviation: 'CA', emoji: '', enabled: 'false', url: 'california' },
    { name: 'Colorado', abbreviation: 'CO', emoji: '🏔️', enabled: 'true', url: 'colorado' },
    { name: 'Connecticut', abbreviation: 'CT', emoji: '', enabled: 'false', url: 'connecticut' },
    { name: 'Delaware', abbreviation: 'DE', emoji: '', enabled: 'false', url: 'delaware' },
    { name: 'Florida', abbreviation: 'FL', emoji: '', enabled: 'false', url: 'florida' },
    { name: 'Georgia', abbreviation: 'GA', emoji: '', enabled: 'false', url: 'georgia' },
    { name: 'Hawaii', abbreviation: 'HI', emoji: '', enabled: 'false', url: 'hawaii' },
    { name: 'Idaho', abbreviation: 'ID', emoji: '', enabled: 'false', url: 'idaho' },
    { name: 'Illinois', abbreviation: 'IL', emoji: '', enabled: 'false', url: 'illinois' },
    { name: 'Indiana', abbreviation: 'IN', emoji: '', enabled: 'false', url: 'indiana' },
    { name: 'Iowa', abbreviation: 'IA', emoji: '🌽', enabled: 'true', url: 'iowa' },
    { name: 'Kansas', abbreviation: 'KS', emoji: '', enabled: 'false', url: 'kansas' },
    { name: 'Kentucky', abbreviation: 'KY', emoji: '', enabled: 'false', url: 'kentucky' },
    { name: 'Louisiana', abbreviation: 'LA', emoji: '', enabled: 'false', url: 'louisiana' },
    { name: 'Maine', abbreviation: 'ME', emoji: '', enabled: 'false', url: 'maine' },
    { name: 'Maryland', abbreviation: 'MD', emoji: '', enabled: 'false', url: 'maryland' },
    { name: 'Massachusetts', abbreviation: 'MA', emoji: '', enabled: 'false', url: 'massachusetts' },
    { name: 'Michigan', abbreviation: 'MI', emoji: '', enabled: 'false', url: 'michigan' },
    { name: 'Minnesota', abbreviation: 'MN', emoji: '❄️', enabled: 'true', url: 'minnesota' },
    { name: 'Mississippi', abbreviation: 'MS', emoji: '', enabled: 'false', url: 'mississippi' },
    { name: 'Missouri', abbreviation: 'MO', emoji: '', enabled: 'false', url: 'missouri' },
    { name: 'Montana', abbreviation: 'MT', emoji: '', enabled: 'false', url: 'montana' },
    { name: 'Nebraska', abbreviation: 'NE', emoji: '', enabled: 'false', url: 'nebraska' },
    { name: 'Nevada', abbreviation: 'NV', emoji: '', enabled: 'false', url: 'nevada' },
    { name: 'New Hampshire', abbreviation: 'NH', emoji: '', enabled: 'false', url: 'new-hampshire' },
    { name: 'New Jersey', abbreviation: 'NJ', emoji: '', enabled: 'false', url: 'new-jersey' },
    { name: 'New Mexico', abbreviation: 'NM', emoji: '', enabled: 'false', url: 'new-mexico' },
    { name: 'New York', abbreviation: 'NY', emoji: '', enabled: 'true', url: 'new-york' },
    { name: 'North Carolina', abbreviation: 'NC', emoji: '', enabled: 'false', url: 'north-carolina' },
    { name: 'North Dakota', abbreviation: 'ND', emoji: '', enabled: 'false', url: 'north-dakota' },
    { name: 'Ohio', abbreviation: 'OH', emoji: '', enabled: 'false', url: 'ohio' },
    { name: 'Oklahoma', abbreviation: 'OK', emoji: '', enabled: 'false', url: 'oklahoma' },
    { name: 'Oregon', abbreviation: 'OR', emoji: '', enabled: 'false', url: 'oregon' },
    { name: 'Pennsylvania', abbreviation: 'PA', emoji: '', enabled: 'false', url: 'pennsylvania' },
    { name: 'Rhode Island', abbreviation: 'RI', emoji: '', enabled: 'false', url: 'rhode-island' },
    { name: 'South Carolina', abbreviation: 'SC', emoji: '', enabled: 'false', url: 'south-carolina' },
    { name: 'South Dakota', abbreviation: 'SD', emoji: '', enabled: 'false', url: 'south-dakota' },
    { name: 'Tennessee', abbreviation: 'TN', emoji: '', enabled: 'false', url: 'tennessee' },
    { name: 'Texas', abbreviation: 'TX', emoji: '', enabled: 'false', url: 'texas' },
    { name: 'Utah', abbreviation: 'UT', emoji: '', enabled: 'false', url: 'utah' },
    { name: 'Vermont', abbreviation: 'VT', emoji: '', enabled: 'false', url: 'vermont' },
    { name: 'Virginia', abbreviation: 'VA', emoji: '', enabled: 'false', url: 'virginia' },
    { name: 'Washington', abbreviation: 'WA', emoji: '', enabled: 'false', url: 'washington' },
    { name: 'West Virginia', abbreviation: 'WV', emoji: '', enabled: 'false', url: 'west-virginia' },
    { name: 'Wisconsin', abbreviation: 'WI', emoji: '', enabled: 'false', url: 'wisconsin' },
    { name: 'Wyoming', abbreviation: 'WY', emoji: '', enabled: 'false', url: 'wyoming' }
];

export const statesOfAmericaInventory = writable(statesOfAmerica);
