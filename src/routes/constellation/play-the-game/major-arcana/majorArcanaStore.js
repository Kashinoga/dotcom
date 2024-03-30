import { writable } from 'svelte/store';

export let majorArcana = writable([
	{ name: 'The Magician', meaning: 'Creativity, Manifestation, Mastery' },
	{ name: 'The High Priestess', meaning: 'Intuition, Secrets, Wisdom' },
	{ name: 'The Empress', meaning: 'Abundance, Fertility, Nurture' },
	{ name: 'The Emperor', meaning: 'Authority, Leadership, Structure' },
	{ name: 'The Hierophant', meaning: 'Dogma, Spirituality, Tradition' },
	{ name: 'The Lovers', meaning: 'Balance, Choice, Relationships' },
	{ name: 'The Chariot', meaning: 'Control, Determination, Willpower' },
	{ name: 'Strength', meaning: 'Courage, Inner Power, Overcoming Challenges' },
	{ name: 'The Hermit', meaning: 'Introspection, Solitude, Wisdom' },
	{ name: 'Wheel of Fortune', meaning: 'Change, Destiny, Luck' },
	{ name: 'Justice', meaning: 'Balance, Fairness, Karma' },
	{ name: 'The Hanged Man', meaning: 'Letting Go, Sacrifice, Surrender' },
	{ name: 'Death', meaning: 'Beginnings and Endings, Transformation' },
	{ name: 'Temperance', meaning: 'Balance, Integration, Moderation' },
	{ name: 'The Devil', meaning: 'Addiction, Materialism, Temptation' },
	{ name: 'The Tower', meaning: 'Revelation, Upheaval, Destruction' },
	{ name: 'The Star', meaning: 'Hope, Inspiration, Renewal' },
	{ name: 'The Moon', meaning: 'Illusion, Intuition, Subconscious' },
	{ name: 'The Sun', meaning: 'Joy, Success, Vitality' },
	{ name: 'Judgement', meaning: 'Accountability, Rebirth, Transformation' },
	{ name: 'The World', meaning: 'Completion, Fulfillment, Integration' },
	{ name: 'The Fool', meaning: 'Adventure, New Beginnings, Spontaneity' }
]);
