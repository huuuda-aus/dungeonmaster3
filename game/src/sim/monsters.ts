import type { AttackType } from './champion';
import type { Dir } from './world';

export interface MonsterDef {
  id: string;
  name: string;
  health: number;
  /** Ticks between steps. */
  moveTicks: number;
  /** Ticks between attacks while adjacent. */
  attackTicks: number;
  /** Base attack strength; actual roll is attack + 0..attack/2. */
  attack: number;
  attackType: AttackType;
  /** Wound locations this creature can injure (bitmask over slots 0..5). */
  wounds: number;
  /** Resistance to melee: subtracted from the attacker's damage roll (about 10 weak .. 60 tough). */
  defense: number;
  /** How much experience melee damage against it is worth. */
  xpFactor: number;
  /** Higher = harder to hit (0..100). */
  dodge: number;
  /** Path distance at which it notices the party. */
  sight: number;
  /** Bonus experience granted to the killer. */
  xp: number;
  color: number;
  /** Percent damage reduction per spell kind (negative = extra damage, 100 = immune). */
  resist?: Partial<Record<string, number>>;
  /** Immune to physical attacks and most spells; only 'dispel' harms it. */
  nonMaterial?: boolean;
  /** Items it may leave behind when killed. */
  drops?: { id: string; chance: number }[];
}

export const MONSTER_DEFS: Record<string, MonsterDef> = {
  gnawer: {
    id: 'gnawer', name: 'Gnawer', health: 18, moveTicks: 8, attackTicks: 12,
    attack: 14, attackType: 'sharp', wounds: 0b110111, defense: 10, xpFactor: 4, dodge: 35,
    sight: 6, xp: 10, color: 0x8a6b4a, drops: [{ id: 'cheese', chance: 0.25 }],
  },
  shambler: {
    id: 'shambler', name: 'Shambler', health: 46, moveTicks: 16, attackTicks: 18,
    attack: 26, attackType: 'blunt', wounds: 0b111111, defense: 24, xpFactor: 9, dodge: 15,
    sight: 7, xp: 30, color: 0x5d7a4a, drops: [{ id: 'club', chance: 0.3 }, { id: 'bread', chance: 0.4 }], resist: { fire: -25, poison: 60 },
  },
  warden: {
    id: 'warden', name: 'Warden', health: 90, moveTicks: 14, attackTicks: 14,
    attack: 38, attackType: 'sharp', wounds: 0b111111, defense: 40, xpFactor: 18, dodge: 25,
    sight: 9, xp: 90, color: 0x6a6f8c, drops: [{ id: 'greatsword', chance: 0.6 }, { id: 'pendant', chance: 0.4 }], resist: { lightning: 40 },
  },
  wraith: {
    id: 'wraith', name: 'Wraith', health: 40, moveTicks: 12, attackTicks: 16,
    attack: 30, attackType: 'magic', wounds: 0b111111, defense: 0, xpFactor: 12, dodge: 40,
    sight: 8, xp: 60, color: 0x9fb0d8, nonMaterial: true,
  },
};

export interface Monster {
  uid: number;
  def: MonsterDef;
  x: number;
  y: number;
  facing: Dir;
  health: number;
  /** Event id of its pending AI step, for cancellation on death. */
  eventId: number;
  /** Damage-over-time from poison: strength per pulse and pulses left. */
  poison: { dmg: number; pulses: number; owner: number } | null;
}
