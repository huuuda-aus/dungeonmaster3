import { SKILL } from './champion';

/**
 * Melee and combat actions. Numbers come from the DM1/CSB action tables.
 * A weapon or item offers up to three of these; later ones need skill levels.
 */
export interface ActionDef {
  id: string;
  name: string;
  /** Ticks the hand is busy afterwards. */
  ticks: number;
  /** Damage multiplier in 1/32 units (32 = x1). */
  damageFactor: number;
  /** Hit probability parameter (0..100). */
  hitProb: number;
  /** Defense modifier while the hand is busy (can be negative). */
  defense: number;
  /** Skill index that is used and trained. */
  skill: number;
  /** Experience granted for the action. */
  xp: number;
  /** Base stamina cost. */
  stamina: number;
  kind: 'melee' | 'shout';
}

const S = SKILL;
// Hidden skills by group (see spec): Fighter 4 swing, 5 thrust, 6 club, 7 parry;
// Ninja 8 steal, 9 fight, 10 throw, 11 shoot.
export const SKILL_SWING = S.SWING, SKILL_THRUST = 5, SKILL_CLUB = 6, SKILL_PARRY = 7, SKILL_FIGHT = 9;

export const ACTIONS: Record<string, ActionDef> = {
  block:  { id: 'block',  name: 'Block',   ticks: 6,  damageFactor: 15, hitProb: 22, defense: 36,  skill: SKILL_PARRY,  xp: 8,  stamina: 4,  kind: 'melee' },
  chop:   { id: 'chop',   name: 'Chop',    ticks: 8,  damageFactor: 48, hitProb: 48, defense: 0,   skill: SKILL_CLUB,   xp: 10, stamina: 10, kind: 'melee' },
  punch:  { id: 'punch',  name: 'Punch',   ticks: 1,  damageFactor: 32, hitProb: 38, defense: -10, skill: SKILL_FIGHT,  xp: 8,  stamina: 1,  kind: 'melee' },
  kick:   { id: 'kick',   name: 'Kick',    ticks: 5,  damageFactor: 48, hitProb: 28, defense: -5,  skill: SKILL_FIGHT,  xp: 13, stamina: 3,  kind: 'melee' },
  warCry: { id: 'warCry', name: 'War Cry', ticks: 3,  damageFactor: 0,  hitProb: 0,  defense: 4,   skill: SKILL_PARRY,  xp: 7,  stamina: 1,  kind: 'shout' },
  hit:    { id: 'hit',    name: 'Hit',     ticks: 4,  damageFactor: 20, hitProb: 20, defense: 16,  skill: SKILL_FIGHT,  xp: 10, stamina: 3,  kind: 'melee' },
  swing:  { id: 'swing',  name: 'Swing',   ticks: 6,  damageFactor: 16, hitProb: 32, defense: 5,   skill: SKILL_SWING,  xp: 6,  stamina: 2,  kind: 'melee' },
  stab:   { id: 'stab',   name: 'Stab',    ticks: 10, damageFactor: 60, hitProb: 42, defense: -15, skill: SKILL_THRUST, xp: 12, stamina: 4,  kind: 'melee' },
  thrust: { id: 'thrust', name: 'Thrust',  ticks: 16, damageFactor: 66, hitProb: 57, defense: -17, skill: SKILL_THRUST, xp: 19, stamina: 17, kind: 'melee' },
  jab:    { id: 'jab',    name: 'Jab',     ticks: 2,  damageFactor: 8,  hitProb: 70, defense: -5,  skill: SKILL_THRUST, xp: 11, stamina: 3,  kind: 'melee' },
  parry:  { id: 'parry',  name: 'Parry',   ticks: 18, damageFactor: 8,  hitProb: 18, defense: 29,  skill: SKILL_PARRY,  xp: 17, stamina: 1,  kind: 'melee' },
  hack:   { id: 'hack',   name: 'Hack',    ticks: 8,  damageFactor: 25, hitProb: 27, defense: 10,  skill: SKILL_SWING,  xp: 9,  stamina: 6,  kind: 'melee' },
  berserk:{ id: 'berserk',name: 'Berserk', ticks: 30, damageFactor: 96, hitProb: 46, defense: -10, skill: SKILL_SWING,  xp: 40, stamina: 40, kind: 'melee' },
  melee:  { id: 'melee',  name: 'Melee',   ticks: 20, damageFactor: 60, hitProb: 64, defense: -5,  skill: SKILL_CLUB,   xp: 24, stamina: 25, kind: 'melee' },
  slash:  { id: 'slash',  name: 'Slash',   ticks: 4,  damageFactor: 16, hitProb: 26, defense: 4,   skill: SKILL_SWING,  xp: 9,  stamina: 2,  kind: 'melee' },
  cleave: { id: 'cleave', name: 'Cleave',  ticks: 12, damageFactor: 48, hitProb: 40, defense: 0,   skill: SKILL_SWING,  xp: 12, stamina: 10, kind: 'melee' },
  bash:   { id: 'bash',   name: 'Bash',    ticks: 20, damageFactor: 50, hitProb: 32, defense: 0,   skill: SKILL_CLUB,   xp: 11, stamina: 9,  kind: 'melee' },
  stun:   { id: 'stun',   name: 'Stun',    ticks: 7,  damageFactor: 16, hitProb: 50, defense: 5,   skill: SKILL_CLUB,   xp: 10, stamina: 2,  kind: 'melee' },
};

/** Actions strong enough to smash a closed door. */
export const DOOR_BREAKERS = new Set(['chop', 'bash', 'hack', 'berserk', 'kick', 'swing']);

export const SKILL_NAMES: Record<number, string> = {
  0: 'Fighter', 1: 'Ninja', 2: 'Priest', 3: 'Wizard',
  4: 'Swing', 5: 'Thrust', 6: 'Club', 7: 'Parry',
  8: 'Steal', 9: 'Fight', 10: 'Throw', 11: 'Shoot',
  12: 'Identify', 13: 'Heal', 14: 'Influence', 15: 'Defend',
  16: 'Fire', 17: 'Air', 18: 'Earth', 19: 'Water',
};
