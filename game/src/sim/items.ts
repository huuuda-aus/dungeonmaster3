export type ItemKind = 'weapon' | 'armour' | 'food' | 'potion' | 'misc';

/** Body slot a wearable goes in. */
export type WearSlot = 'head' | 'torso' | 'legs' | 'feet' | 'neck';

export type PotionType =
  | 'strength' | 'shield' | 'stamina' | 'wisdom' | 'vitality' | 'health' | 'cure' | 'dexterity' | 'mana' | 'poison';

export const POTION_NAMES: Record<PotionType, string> = {
  strength: 'Strength', shield: 'Shield', stamina: 'Stamina', wisdom: 'Wisdom', vitality: 'Vitality',
  health: 'Health', cure: 'Cure Poison', dexterity: 'Dexterity', mana: 'Mana', poison: 'Poison',
};

/** An action an item offers, and the skill level needed to use it. */
export interface ItemAction { id: string; minLevel: number }

export interface WeaponStats {
  /** Added to wielder strength when swung. */
  strength: number;
  /** Occupies both hands. */
  twoHanded?: boolean;
  /** Extra kinetic energy when thrown (balanced throwing weapons). */
  throwEnergy?: number;
}

export interface ArmourStats {
  /** Defense vs sharp (cutting) attacks. */
  sharp: number;
  /** Defense vs everything else. */
  other: number;
  isShield: boolean;
}

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  weight: number;
  weapon?: WeaponStats;
  armour?: ArmourStats;
  /** Up to three actions; the first is always available. */
  actions?: ItemAction[];
  /** Where it can be worn (armour, amulets). */
  wear?: WearSlot;
  /** Eating restores this much food. */
  food?: number;
  /** Drinking restores this much water and leaves an empty flask. */
  drink?: number;
  /** A brewed potion. */
  potion?: { type: PotionType; power: number };
}

/** What an empty hand can do. */
export const FIST_ACTIONS: ItemAction[] = [
  { id: 'punch', minLevel: 1 },
  { id: 'kick', minLevel: 2 },
  { id: 'warCry', minLevel: 3 },
];

export const ITEM_LIBRARY: Record<string, Item> = {
  shortSword: {
    id: 'shortSword', name: 'Short Sword', kind: 'weapon', weight: 8,
    weapon: { strength: 10 },
    actions: [{ id: 'swing', minLevel: 1 }, { id: 'thrust', minLevel: 2 }, { id: 'parry', minLevel: 3 }],
  },
  club: {
    id: 'club', name: 'Club', kind: 'weapon', weight: 10,
    weapon: { strength: 8 },
    actions: [{ id: 'bash', minLevel: 1 }, { id: 'stun', minLevel: 2 }, { id: 'melee', minLevel: 4 }],
  },
  dagger: {
    id: 'dagger', name: 'Dagger', kind: 'weapon', weight: 3,
    weapon: { strength: 4, throwEnergy: 12 },
    actions: [{ id: 'jab', minLevel: 1 }, { id: 'stab', minLevel: 2 }],
  },
  greatsword: {
    id: 'greatsword', name: 'Greatsword', kind: 'weapon', weight: 20,
    weapon: { strength: 22, twoHanded: true },
    actions: [{ id: 'cleave', minLevel: 1 }, { id: 'hack', minLevel: 2 }, { id: 'berserk', minLevel: 4 }],
  },
  woodenShield: {
    id: 'woodenShield', name: 'Wooden Shield', kind: 'armour', weight: 9,
    armour: { sharp: 12, other: 10, isShield: true },
    actions: [{ id: 'block', minLevel: 1 }],
  },
  leatherJerkin: {
    id: 'leatherJerkin', name: 'Leather Jerkin', kind: 'armour', weight: 6,
    armour: { sharp: 8, other: 6, isShield: false }, wear: 'torso',
  },
  leatherBoots: {
    id: 'leatherBoots', name: 'Leather Boots', kind: 'armour', weight: 3,
    armour: { sharp: 5, other: 4, isShield: false }, wear: 'feet',
  },
  leatherCap: {
    id: 'leatherCap', name: 'Leather Cap', kind: 'armour', weight: 2,
    armour: { sharp: 6, other: 5, isShield: false }, wear: 'head',
  },
  leatherPants: {
    id: 'leatherPants', name: 'Leather Pants', kind: 'armour', weight: 4,
    armour: { sharp: 7, other: 6, isShield: false }, wear: 'legs',
  },
  pendant: { id: 'pendant', name: 'Pendant', kind: 'misc', weight: 1, wear: 'neck' },
  bread: { id: 'bread', name: 'Bread', kind: 'food', weight: 3, food: 600 },
  apple: { id: 'apple', name: 'Apple', kind: 'food', weight: 1, food: 250 },
  cheese: { id: 'cheese', name: 'Cheese', kind: 'food', weight: 2, food: 450 },
  waterFlask: { id: 'waterFlask', name: 'Water Flask', kind: 'food', weight: 8, drink: 600 },
  flask: { id: 'flask', name: 'Empty Flask', kind: 'misc', weight: 1 },
  zokathra: { id: 'zokathra', name: 'Conjured Orb', kind: 'misc', weight: 1 },
};

/** A fresh copy of an item (instances can carry their own state, e.g. potion power). */
export function makeItem(id: string): Item {
  const def = ITEM_LIBRARY[id];
  if (!def) throw new Error(`unknown item ${id}`);
  return structuredClone(def);
}

export function makePotion(type: PotionType, power: number): Item {
  return {
    id: `potion:${type}`, name: `${POTION_NAMES[type]} Potion`, kind: 'potion', weight: 3,
    potion: { type, power },
  };
}
