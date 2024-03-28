import { writable } from 'svelte/store';

export let majorArcana = writable([
	{ name: 'The Magician', meaning: 'Mastery, Manifestation, Creativity' },
	{ name: 'The High Priestess', meaning: 'Intuition, Wisdom, Secrets' },
	{ name: 'The Empress', meaning: 'Fertility, Abundance, Nurture' },
	{ name: 'The Emperor', meaning: 'Structure, Authority, Leadership' },
	{ name: 'The Hierophant', meaning: 'Tradition, Dogma, Spirituality' },
	{ name: 'The Lovers', meaning: 'Choice, Relationships, Balance' },
	{ name: 'The Chariot', meaning: 'Determination, Willpower, Control' },
	{ name: 'Strength', meaning: 'Courage, Inner Power, Overcoming Challenges' },
	{ name: 'The Hermit', meaning: 'Introspection, Solitude, Wisdom' },
	{ name: 'Wheel of Fortune', meaning: 'Change, Destiny, Luck' },
	{ name: 'Justice', meaning: 'Fairness, Balance, Karma' },
	{ name: 'The Hanged Man', meaning: 'Sacrifice, Surrender, Letting Go' },
	{ name: 'Death', meaning: 'Transformation, Endings and Beginnings' },
	{ name: 'Temperance', meaning: 'Moderation, Balance, Integration' },
	{ name: 'The Devil', meaning: 'Temptation, Materialism, Addiction' },
	{ name: 'The Tower', meaning: 'Destruction, Revelation, Upheaval' },
	{ name: 'The Star', meaning: 'Hope, Inspiration, Renewal' },
	{ name: 'The Moon', meaning: 'Illusion, Intuition, Subconscious' },
	{ name: 'The Sun', meaning: 'Success, Joy, Vitality' },
	{ name: 'Judgement', meaning: 'Rebirth, Accountability, Transformation' },
	{ name: 'The World', meaning: 'Completion, Fulfillment, Integration' },
	{ name: 'The Fool', meaning: 'New Beginnings, Adventure, Spontaneity' }
]);
