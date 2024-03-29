import { writable } from 'svelte/store';

export let tarotMinorSuites = writable([
	{ name: 'Strength', emoji: '💪' },
	{ name: 'Intelligence', emoji: '🧠' },
	{ name: 'Wisdom', emoji: '🦉' },
	{ name: 'Charisma', emoji: '🎯' }
]);

export let tarotMinorStrength = writable([
	{ name: 'Ace of Swords', meaning: 'Clarity, Intellectual Brilliance, and New Beginnings' },
	{ name: 'Two of Swords', meaning: 'Indecision, Inner Conflict, and Stalemate' },
	{ name: 'Three of Swords', meaning: 'Broken Heart, Betrayal, and Loss' },
	{ name: 'Four of Swords', meaning: 'Meditation, Rest, and Retreat' },
	{ name: 'Five of Swords', meaning: 'Conflict, Defeat, and Competition' },
	{ name: 'Six of Swords', meaning: 'Change, Journey, and Travel' },
	{ name: 'Seven of Swords', meaning: 'Deception, Secrecy, and Betrayal' },
	{ name: 'Eight of Swords', meaning: 'Imprisonment, Limitation, and Restriction' },
	{ name: 'Nine of Swords', meaning: 'Anxiety, Fear, and Nightmares' },
	{ name: 'Ten of Swords', meaning: 'Despair, Pain, and Loss' },
	{ name: 'Page of Swords', meaning: 'Intellect, Messenger, and News' },
	{ name: 'Knight of Swords', meaning: 'Ambition, Competition, and Adventure' },
	{ name: 'Queen of Swords', meaning: 'Intelligence, Independence, and Wisdom' },
	{ name: 'King of Swords', meaning: 'Logic, Reason, and Power' }
]);

// export let tarotMinorStrength = writable([
// 	{
// 		name: 'Ace of Swords',
// 		number: 'Ace',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Unbreakable Will, Focused Power, Decisive Action'
// 	},
// 	{
// 		name: 'Joker of Swords',
// 		number: 'Joker',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Uncontrolled Force, Raw Potential, Disruptive Change'
// 	},
// 	{
// 		name: 'Two of Swords',
// 		number: 'Two',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Inner Conflict, Balanced Forces, Stalemate'
// 	},
// 	{
// 		name: 'Three of Swords',
// 		number: 'Three',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Piercing Pain, Resilience, Strength Through Hardship'
// 	},
// 	{
// 		name: 'Four of Swords',
// 		number: 'Four',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Fortitude, Regrouping, Renewed Strength'
// 	},
// 	{
// 		name: 'Five of Swords',
// 		number: 'Five',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Forceful Action, Cunning Tactic, Merciless Victory'
// 	},
// 	{
// 		name: 'Six of Swords',
// 		number: 'Six',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Courageous Journey, Strength in Transition, Letting Go with Resolve'
// 	},
// 	{
// 		name: 'Seven of Swords',
// 		number: 'Seven',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Cunning Strategy, Resourcefulness Under Pressure, Mental Fortitude'
// 	},
// 	{
// 		name: 'Eight of Swords',
// 		number: 'Eight',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Limited Options, Strength in Adaptability, Finding Inner Resolve'
// 	},
// 	{
// 		name: 'Nine of Swords',
// 		number: 'Nine',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Facing Inner Demons, Mental Resilience, Overcoming Self-Doubt'
// 	},
// 	{
// 		name: 'Ten of Swords',
// 		number: 'Ten',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Overwhelming Defeat, Crushing Blow, Strength to Rebuild'
// 	},
// 	{
// 		name: 'Queen of Swords',
// 		number: 'Queen',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Unwavering Conviction, Intellectual Strength, Sharpened Judgment'
// 	},
// 	{
// 		name: 'King of Swords',
// 		number: 'King',
// 		suite: 'Swords',
// 		attribute: 'Strength',
// 		meaning: 'Commanding Presence, Strategic Control, Unrelenting Will'
// 	}
// ]);

export let tarotMinorIntelligence = writable([
	{
		name: 'Ace of Wands',
		number: 'Ace',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Inspiration, Spark of Genius, Inventive Vision'
	},
	{
		name: 'Joker',
		number: 'Joker',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Unforeseen Inspiration, Erratic Genius, Unpredictable Breakthrough'
	},
	{
		name: 'Two of Wands',
		number: 'Two',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Planning, Weighing Options, Strategic Foresight'
	},
	{
		name: 'Three of Wands',
		number: 'Three',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Exploration, Seeking Knowledge, Expanding Horizons'
	},
	{
		name: 'Four of Wands',
		number: 'Four',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Mastery, Expertise, Refined Skill'
	},
	{
		name: 'Five of Wands',
		number: 'Five',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Debate, Mental Agility, Sharpening Arguments'
	},
	{
		name: 'Six of Wands',
		number: 'Six',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Public Recognition, Spreading Knowledge, Sharing Insights'
	},
	{
		name: 'Seven of Wands',
		number: 'Seven',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Cunning Plan, Intellectual Maneuvering, Outsmarting Others'
	},
	{
		name: 'Eight of Wands',
		number: 'Eight',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Swift Analysis, Quick Thinking, Adaptable Strategies'
	},
	{
		name: 'Nine of Wands',
		number: 'Nine',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Vigilance, Strategic Defense, Foreseeing Challenges'
	},
	{
		name: 'Ten of Wands',
		number: 'Ten',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Overburdened Mind, Resourcefulness Under Pressure, Finding New Solutions'
	},
	{
		name: 'Queen of Wands',
		number: 'Queen',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Visionary Leader, Innovative Spirit, Inspiring Strategies'
	},
	{
		name: 'King of Wands',
		number: 'King',
		suite: 'Wands',
		attribute: 'Intelligence',
		meaning: 'Commanding Intellect, Strategic Brilliance, Mastermind'
	}
]);

export let tarotMinorWisdom = writable([
	{
		name: 'Ace of Cups',
		number: 'Ace',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Intuition, Open Heart, Emotional Intelligence'
	},
	{
		name: 'Joker',
		number: 'Joker',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Unforeseen Connection, Unconventional Empathy, Profound Intuition'
	},
	{
		name: 'Two of Cups',
		number: 'Two',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Harmony, Partnership, Balanced Emotions'
	},
	{
		name: 'Three of Cups',
		number: 'Three',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Compassion, Forgiveness, Understanding'
	},
	{
		name: 'Four of Cups',
		number: 'Four',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Inner Peace, Contentment, Emotional Security'
	},
	{
		name: 'Five of Cups',
		number: 'Five',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Disillusionment, Letting Go, Accepting Loss'
	},
	{
		name: 'Six of Cups',
		number: 'Six',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Shared Memories, Nostalgia, Honoring the Past'
	},
	{
		name: 'Seven of Cups',
		number: 'Seven',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Discernment, Seeing Through Deception, Intuitive Choices'
	},
	{
		name: 'Eight of Cups',
		number: 'Eight',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Following Intuition, Letting Go of the Familiar, Embracing Change'
	},
	{
		name: 'Nine of Cups',
		number: 'Nine',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Faith, Trusting the Universe, Inner Strength'
	},
	{
		name: 'Ten of Cups',
		number: 'Ten',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Overwhelmed Emotions, Finding Balance Through Acceptance, Wholeness'
	},
	{
		name: 'Queen of Cups',
		number: 'Queen',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Deep Empathy, Nurturing Spirit, Emotional Maturity'
	},
	{
		name: 'King of Cups',
		number: 'King',
		suite: 'Cups',
		attribute: 'Wisdom',
		meaning: 'Compassionate Leader, Wise Counselor, Emotional Mastery'
	}
]);

export let tarotMinorCharisma = writable([
	{
		name: 'Ace of Coins',
		number: 'Ace',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Abundance, Prosperity, Confidence'
	},
	{
		name: 'Joker',
		number: 'Joker',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Unexpected Windfall, Unconventional Success, Dazzling Opportunity'
	},
	{
		name: 'Two of Coins',
		number: 'Two',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Balance, Fairness, Skillful Negotiation'
	},
	{
		name: 'Three of Coins',
		number: 'Three',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Mastery, Recognition, Building Success'
	},
	{
		name: 'Four of Coins',
		number: 'Four',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Security, Stability, Resourcefulness'
	},
	{
		name: 'Five of Coins',
		number: 'Five',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Transformation, Adaptability, Resourcefulness Under Pressure'
	},
	{
		name: 'Six of Coins',
		number: 'Six',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Generosity, Sharing, Building Goodwill'
	},
	{
		name: 'Seven of Coins',
		number: 'Seven',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Patience, Calculated Risk, Long-Term Vision'
	},
	{
		name: 'Eight of Coins',
		number: 'Eight',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Diligence, Craftsmanship, Building Expertise'
	},
	{
		name: 'Nine of Coins',
		number: 'Nine',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Contentment, Abundance, Security and Satisfaction'
	},
	{
		name: 'Ten of Coins',
		number: 'Ten',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Legacy, Prosperity Shared, Generational Wealth'
	},
	{
		name: 'Queen of Coins',
		number: 'Queen',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Practicality, Resourcefulness, Building a Secure Future'
	},
	{
		name: 'King of Coins',
		number: 'King',
		suite: 'Coins',
		attribute: 'Charisma',
		meaning: 'Business Acumen, Leadership, Financial Mastery'
	}
]);
