import { SKILL } from './champion';

/**
 * Rune magic. A champion builds a spell by choosing runes in four consecutive
 * steps, each step offering six runes:
 *   1 Power   2 Element   3 Form   4 Class
 * The first rune (power, 1..6) scales the spell. The remaining runes identify it.
 * A spell may be cast after any step once the runes so far match a known spell.
 * Examples (power rune omitted): light = [4]; fireball = [4, 4].
 */
export const STEP_NAMES = ['Power', 'Element', 'Form', 'Class'] as const;

/** Display names for the 6 runes of each step (index 0..5). */
export const RUNE_NAMES: readonly (readonly string[])[] = [
  ['Ar', 'Bel', 'Cyr', 'Dov', 'Ess', 'Fyn'],
  ['Gal', 'Hesh', 'Ith', 'Jor', 'Kul', 'Lam'],
  ['Mir', 'Nox', 'Oph', 'Pry', 'Quo', 'Ruh'],
  ['Syl', 'Tarn', 'Ur', 'Vex', 'Wyn', 'Zed'],
];

/** Base mana cost of rune [step][index]. Later steps are scaled by power (see runeCost). */
export const RUNE_BASE_COST: readonly (readonly number[])[] = [
  [1, 2, 3, 4, 5, 6],
  [2, 3, 4, 5, 6, 7],
  [4, 5, 6, 7, 7, 9],
  [2, 2, 3, 4, 6, 7],
];
const POWER_COST_MULT = [8, 12, 16, 20, 24, 28]; // eighths

/** Mana to enter rune `index` at `step`, given the chosen power rune (0-based, or -1 at step 0). */
export function runeCost(step: number, index: number, powerIndex: number): number {
  const base = RUNE_BASE_COST[step]![index]!;
  return step === 0 ? base : (base * POWER_COST_MULT[powerIndex]!) >> 3;
}

export type SpellKind = 'potion' | 'projectile' | 'self';
export type SpellEffect =
  | 'partyShield' | 'fireShield' | 'footprints' | 'invisibility' | 'thievesEye'
  | 'light' | 'torch' | 'darkness'
  | 'fireball' | 'lightning' | 'poisonBolt' | 'poisonCloud' | 'dispel' | 'openDoor'
  | 'potion' | 'zokathra';

/**
 * Whether a cast keeps the caster busy for the spell's `cooldown` ticks. Only some
 * versions of the original had this; most let you chain-cast, limited by mana alone.
 */
export const SPELL_COOLDOWNS = false;

export interface SpellDef {
  id: string;
  name: string;
  /** Rune indices (1..6) for steps 2..4; shorter spells have fewer entries. */
  runes: number[];
  /** Skill level required = baseSkill + power (1..6). */
  baseSkill: number;
  /** Skill index used and trained. */
  skill: number;
  kind: SpellKind;
  effect: SpellEffect;
  /** Ticks the caster is busy after a successful cast. */
  cooldown: number;
  /** For potions: which potion. */
  potion?: string;
}

const S = SKILL;
const FIRE = 16, AIR = 17, EARTH = 18, WATER = 19;

export const SPELLS: SpellDef[] = [
  { id: 'partyShield', name: 'Shield (Party)', runes: [1, 4], baseSkill: 2, skill: S.DEFEND, kind: 'self', effect: 'partyShield', cooldown: 30 },
  { id: 'footprints', name: 'Magic Footprints', runes: [1, 5, 2], baseSkill: 1, skill: EARTH, kind: 'self', effect: 'footprints', cooldown: 18 },
  { id: 'invisibility', name: 'Invisibility', runes: [3, 2, 6], baseSkill: 3, skill: AIR, kind: 'self', effect: 'invisibility', cooldown: 45 },
  { id: 'poisonCloud', name: 'Poison Cloud', runes: [3, 1], baseSkill: 3, skill: WATER, kind: 'projectile', effect: 'poisonCloud', cooldown: 27 },
  { id: 'thievesEye', name: "Thieves' Eye", runes: [3, 2, 5], baseSkill: 3, skill: EARTH, kind: 'self', effect: 'thievesEye', cooldown: 33 },
  { id: 'lightning', name: 'Lightning Bolt', runes: [3, 3, 5], baseSkill: 4, skill: AIR, kind: 'projectile', effect: 'lightning', cooldown: 30 },
  { id: 'light', name: 'Light', runes: [3, 4, 5], baseSkill: 4, skill: AIR, kind: 'self', effect: 'light', cooldown: 22 },
  { id: 'torch', name: 'Magic Torch', runes: [4], baseSkill: 1, skill: FIRE, kind: 'self', effect: 'torch', cooldown: 15 },
  { id: 'fireball', name: 'Fireball', runes: [4, 4], baseSkill: 3, skill: FIRE, kind: 'projectile', effect: 'fireball', cooldown: 42 },
  { id: 'strengthPotion', name: 'Strength Potion', runes: [4, 5, 1], baseSkill: 4, skill: S.HEAL, kind: 'potion', effect: 'potion', cooldown: 15, potion: 'strength' },
  { id: 'fireShield', name: 'Fire Shield (Party)', runes: [4, 5, 4], baseSkill: 4, skill: S.DEFEND, kind: 'self', effect: 'fireShield', cooldown: 28 },
  { id: 'dispel', name: 'Weaken Nonmaterial', runes: [5, 2], baseSkill: 1, skill: EARTH, kind: 'projectile', effect: 'dispel', cooldown: 20 },
  { id: 'poisonBolt', name: 'Poison Bolt', runes: [5, 1], baseSkill: 1, skill: WATER, kind: 'projectile', effect: 'poisonBolt', cooldown: 16 },
  { id: 'darkness', name: 'Darkness', runes: [5, 4, 6], baseSkill: 1, skill: S.DEFEND, kind: 'self', effect: 'darkness', cooldown: 12 },
  { id: 'openDoor', name: 'Open Door', runes: [6], baseSkill: 1, skill: AIR, kind: 'projectile', effect: 'openDoor', cooldown: 15 },
  { id: 'shieldPotion', name: 'Shield Potion', runes: [1, 5], baseSkill: 2, skill: S.DEFEND, kind: 'potion', effect: 'potion', cooldown: 25, potion: 'shield' },
  { id: 'staminaPotion', name: 'Stamina Potion', runes: [1], baseSkill: 2, skill: S.HEAL, kind: 'potion', effect: 'potion', cooldown: 15, potion: 'stamina' },
  { id: 'wisdomPotion', name: 'Wisdom Potion', runes: [1, 5, 3], baseSkill: 4, skill: S.HEAL, kind: 'potion', effect: 'potion', cooldown: 15, potion: 'wisdom' },
  { id: 'vitalityPotion', name: 'Vitality Potion', runes: [1, 5, 4], baseSkill: 4, skill: S.HEAL, kind: 'potion', effect: 'potion', cooldown: 15, potion: 'vitality' },
  { id: 'healthPotion', name: 'Health Potion', runes: [2], baseSkill: 1, skill: S.HEAL, kind: 'potion', effect: 'potion', cooldown: 32, potion: 'health' },
  { id: 'curePotion', name: 'Cure Poison Potion', runes: [2, 5], baseSkill: 1, skill: S.HEAL, kind: 'potion', effect: 'potion', cooldown: 26, potion: 'cure' },
  { id: 'dexterityPotion', name: 'Dexterity Potion', runes: [3, 5, 2], baseSkill: 4, skill: S.HEAL, kind: 'potion', effect: 'potion', cooldown: 15, potion: 'dexterity' },
  { id: 'manaPotion', name: 'Mana Potion', runes: [6, 5, 5], baseSkill: 3, skill: S.PRIEST, kind: 'potion', effect: 'potion', cooldown: 63, potion: 'mana' },
  { id: 'poisonPotion', name: 'Poison Potion', runes: [6, 1], baseSkill: 2, skill: WATER, kind: 'potion', effect: 'potion', cooldown: 30, potion: 'poison' },
  { id: 'zokathra', name: 'Conjure Item', runes: [6, 3, 5], baseSkill: 0, skill: S.WIZARD, kind: 'self', effect: 'zokathra', cooldown: 15 },
];

/**
 * Identify the spell for chosen runes. `symbols` holds the 0-based rune index of
 * each step taken so far (power first). Needs the power rune plus at least one more.
 */
export function findSpell(symbols: readonly number[]): { spell: SpellDef; power: number } | null {
  if (symbols.length < 2) return null;
  const rest = symbols.slice(1).map((i) => i + 1);
  const spell = SPELLS.find((s) => s.runes.length === rest.length && s.runes.every((r, i) => r === rest[i]));
  return spell ? { spell, power: symbols[0]! + 1 } : null;
}

/** Skill level the caster needs: base requirement plus the power rune (1..6). */
export const requiredLevel = (spell: SpellDef, power: number): number => spell.baseSkill + power;

/** Practice experience gained by trying a spell (grows with level and power). */
export function spellExperience(spell: SpellDef, power: number, roll: number): number {
  const req = requiredLevel(spell, power);
  return roll + (req << 4) + (((power - 1) * spell.baseSkill) << 3) + req * req;
}

/** Wisdom check for each missing skill level: fail when roll(0..127) exceeds this. */
export const wisdomFailThreshold = (wisdom: number): number => Math.min(wisdom + 15, 115);

// ---- Effect magnitudes ---------------------------------------------------
/** Kinetic energy of a projectile spell. */
export const spellEnergy = (power: number, skillLevel: number): number =>
  Math.min(255, Math.max(21, (power + 2) * (4 + (skillLevel << 1))));
/** "Spell power" used by self spells: 8 at power 1 up to 28 at power 6. */
export const selfPower = (power: number): number => (power + 1) << 2;
/** Cells a projectile can fly. */
export const projectileRange = (energy: number): number => Math.min(14, 3 + (energy >> 4));
/** Damage of an explosion with `attack` before resistance. */
export const explosionDamage = (attack: number, roll: (n: number) => number): number => {
  const l = (attack >> 1) + 1;
  return l + roll(l) + 1;
};
export const LIGHT_AMOUNT = [0, 5, 12, 24, 33, 40, 46, 51, 59, 68, 76, 82, 89, 94, 97, 100];

export type ProjectileKind = 'fire' | 'lightning' | 'poisonBolt' | 'poisonCloud' | 'dispel' | 'openDoor' | 'thrown';

export interface Projectile {
  uid: number;
  x: number;
  y: number;
  dir: 0 | 1 | 2 | 3;
  kind: ProjectileKind;
  /** Kinetic energy: also the explosion attack on impact. */
  energy: number;
  stepsLeft: number;
  owner: number; // champion index
  eventId: number;
  /** Power rune (1..6) the spell was cast with; 0 for thrown items. */
  power: number;
  /** For thrown objects: the item in flight and its attack value. */
  item?: import('./items').Item;
  attack?: number;
}

export interface Cloud { uid: number; x: number; y: number; attack: number; owner: number }

export interface Effect {
  id: number; x: number; y: number; color: number; time: number;
  kind: 'hit' | 'fizzle' | 'cast';
  /** Spell that caused a 'hit', so the renderer can pick a matching visual. */
  spell?: ProjectileKind;
  /** Power of that spell (1..6), for scaling visuals. */
  power?: number;
}

export const PROJECTILE_COLOR: Record<ProjectileKind, number> = {
  fire: 0xff7a2a, lightning: 0x9ad0ff, poisonBolt: 0x7be04a, poisonCloud: 0x9bd05a,
  dispel: 0xd0a0ff, openDoor: 0xf0e0a0, thrown: 0xffffff,
};
