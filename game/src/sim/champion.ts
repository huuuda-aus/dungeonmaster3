import { Rng, clamp, scaled } from './rng';
import type { Item } from './items';

// ---- Skills --------------------------------------------------------------
export const SKILL = {
  FIGHTER: 0, NINJA: 1, PRIEST: 2, WIZARD: 3,
  SWING: 4, THROW: 10, SHOOT: 11,
  HEAL: 13, INFLUENCE: 14, DEFEND: 15,
} as const;
export const SKILL_COUNT = 20;

export const STAT = {
  LUCK: 0, STRENGTH: 1, DEXTERITY: 2, WISDOM: 3, VITALITY: 4, ANTIMAGIC: 5, ANTIFIRE: 6,
} as const;
export const STAT_COUNT = 7;

// ---- Slots / wounds ------------------------------------------------------
export const SLOT = {
  READY: 0, ACTION: 1, HEAD: 2, TORSO: 3, LEGS: 4, FEET: 5, NECK: 6,
  POUCH1: 7, POUCH2: 8, QUIVER1: 9, PACK: 13,
} as const;
export const SLOT_COUNT = 25; // 13 equipment/pouch/quiver slots + 12 backpack
/** Wear-slot name for the body slots 2..6. */
export const WEAR_OF_SLOT: Record<number, string> = { 2: 'head', 3: 'torso', 4: 'legs', 5: 'feet', 6: 'neck' };
export const WOUND_ALL = 0b111111;

export type AttackType = 'normal' | 'fire' | 'self' | 'blunt' | 'sharp' | 'magic' | 'psychic' | 'lightning';

export interface Stat { cur: number; max: number; min: number }
export interface SkillXp { exp: number; temp: number }

/** Party-wide defensive buffs. */
export interface PartyShields { shield: number; fire: number; spell: number }
export const NO_SHIELDS: PartyShields = { shield: 0, fire: 0, spell: 0 };

export interface ChampionTemplate {
  name: string;
  /** Primary class; seeds starting skill experience. */
  klass: 'fighter' | 'ninja' | 'priest' | 'wizard';
  health: number; stamina: number; mana: number;
  stats: [number, number, number, number, number, number, number];
}

export class Champion {
  name: string;
  health: number; maxHealth: number;
  stamina: number; maxStamina: number;
  mana: number; maxMana: number;
  food = 1024; water = 1024;
  stats: Stat[];
  skills: SkillXp[];
  slots: (Item | null)[] = new Array<Item | null>(SLOT_COUNT).fill(null);
  /** Extra defense from a Shield potion. */
  shieldDefense = 0;
  /** Set once their belongings have been dropped on death. */
  dropped = false;
  wounds = 0;
  /** Formation cell relative to party facing: 0 FL, 1 FR, 2 BR, 3 BL. */
  cell: number;
  /** Tick when the champion may cast again. */
  actionReadyAt = 0;
  /** Length of the recovery after the last spell (for the cooldown display). */
  castTicks = 1;
  /** Tick when each hand (0 ready, 1 action) may act again. */
  handReadyAt: [number, number] = [0, 0];
  /** Length of the action each hand last started (for cooldown display). */
  handTicks: [number, number] = [1, 1];
  /** Defense modifier granted/charged by the action each hand is performing. */
  handDefense: [number, number] = [0, 0];
  /** Spell runes chosen so far: 0-based rune index per step (power first). */
  symbols: number[] = [];
  /** Messages produced since last drain (level-ups etc). */
  log: string[] = [];

  constructor(t: ChampionTemplate, cell: number) {
    this.name = t.name;
    this.health = this.maxHealth = t.health;
    this.stamina = this.maxStamina = t.stamina;
    this.mana = this.maxMana = t.mana;
    this.stats = t.stats.map((v) => ({ cur: v, max: v, min: 0 }));
    this.skills = Array.from({ length: SKILL_COUNT }, () => ({ exp: 0, temp: 0 }));
    const base = { fighter: 0, ninja: 1, priest: 2, wizard: 3 }[t.klass];
    this.skills[base]!.exp = 520; // start at level 2 in the primary class
    // Everyone starts with practice in the four specialities of their class.
    for (let i = 4 + 4 * base; i < 8 + 4 * base; i++) this.skills[i]!.exp = 500;
    this.cell = cell;
  }

  get alive(): boolean { return this.health > 0; }

  /** Current defense modifier from actions in progress. */
  get actionDefense(): number { return this.handDefense[0] + this.handDefense[1]; }

  /** The item filling a hand; a two-handed weapon in the action hand also fills the ready hand. */
  get twoHanded(): boolean { return !!this.slots[SLOT.ACTION]?.weapon?.twoHanded; }

  /**
   * Luck check: chance (0..100) the champion is lucky against `pct`.
   * Luck rises when unlucky and falls when lucky.
   */
  isLucky(pct: number, rng: Rng): boolean {
    if (rng.bit() && rng.int(100) > pct) return true;
    const luck = this.stat(STAT.LUCK);
    const lucky = luck.cur > 0 && rng.int(luck.cur * 2) > pct;
    luck.cur = clamp(luck.min, luck.cur + (lucky ? -2 : 2), luck.max);
    return lucky;
  }

  stat(i: number): Stat { return this.stats[i]!; }

  /** Total carried weight. */
  get load(): number {
    return this.slots.reduce((w, it) => w + (it ? it.weight : 0), 0);
  }

  // ---- Skill level -------------------------------------------------------
  skillLevel(idx: number, opts: { ignoreTemp?: boolean } = {}): number {
    const s = this.skills[idx]!;
    let exp = s.exp + (opts.ignoreTemp ? 0 : s.temp);
    if (idx > SKILL.WIZARD) {
      const b = this.skills[(idx - 4) >> 2]!;
      exp = (exp + b.exp + (opts.ignoreTemp ? 0 : b.temp)) >> 1;
    }
    let level = 1;
    while (exp >= 500) { exp >>= 1; level++; }
    return level;
  }

  // ---- Experience --------------------------------------------------------
  /**
   * @param now current game tick
   * @param lastCreatureAttack tick of the last creature attack on the party
   * @param mapDifficulty multiplier from the current map (0 = none)
   */
  addExperience(
    idx: number, amount: number, now: number, lastCreatureAttack: number,
    mapDifficulty: number, rng: Rng,
  ): void {
    if (idx >= SKILL.SWING && idx <= SKILL.SHOOT && lastCreatureAttack < now - 150) {
      amount >>= 1;
    }
    if (amount <= 0) return;
    if (mapDifficulty) amount *= mapDifficulty;
    const baseIdx = idx >= SKILL.SWING ? (idx - 4) >> 2 : idx;
    const before = this.skillLevel(baseIdx, { ignoreTemp: true });
    if (idx >= SKILL.SWING && lastCreatureAttack > now - 25) amount <<= 1;
    const sk = this.skills[idx]!;
    sk.exp += amount;
    if (sk.temp < 32000) sk.temp += clamp(1, amount >> 3, 100);
    if (idx >= SKILL.SWING) this.skills[baseIdx]!.exp += amount;
    const after = this.skillLevel(baseIdx, { ignoreTemp: true });
    if (after > before) this.levelUp(baseIdx, after, rng);
  }

  private levelUp(baseIdx: number, level: number, rng: Rng): void {
    const minor = rng.bit();
    const major = 1 + rng.bit();
    let vit = rng.bit();
    if (baseIdx !== SKILL.PRIEST) vit &= level;
    this.stat(STAT.VITALITY).max += vit;
    this.stat(STAT.ANTIFIRE).max += rng.bit() & ~level & 1;
    let stamAmt = this.maxStamina;
    let hpFactor = level;
    let extraMana = false;
    let className = '';
    switch (baseIdx) {
      case SKILL.FIGHTER:
        className = 'Fighter'; stamAmt >>= 4; hpFactor = level * 3;
        this.stat(STAT.STRENGTH).max += major; this.stat(STAT.DEXTERITY).max += minor;
        break;
      case SKILL.NINJA:
        className = 'Ninja'; stamAmt = Math.floor(stamAmt / 21); hpFactor = level << 1;
        this.stat(STAT.STRENGTH).max += minor; this.stat(STAT.DEXTERITY).max += major;
        break;
      case SKILL.WIZARD:
        className = 'Wizard'; stamAmt >>= 5;
        this.maxMana += level + (level >> 1);
        this.stat(STAT.WISDOM).max += major; extraMana = true;
        break;
      case SKILL.PRIEST:
        className = 'Priest'; stamAmt = Math.floor(stamAmt / 25);
        this.maxMana += level;
        hpFactor = level + ((level + 1) >> 1);
        this.stat(STAT.WISDOM).max += minor; extraMana = true;
        break;
    }
    if (extraMana) {
      this.maxMana = Math.min(900, this.maxMana + Math.min(rng.twoBits(), level - 1));
      this.stat(STAT.ANTIMAGIC).max += rng.twoBits();
    }
    this.maxHealth = Math.min(999, this.maxHealth + hpFactor + rng.int((hpFactor >> 1) + 1));
    this.maxStamina = Math.min(9999, this.maxStamina + stamAmt + rng.int((stamAmt >> 1) + 1));
    this.log.push(`${this.name} just gained a ${className} level!`);
  }

  // ---- Derived values ----------------------------------------------------
  /** Scale a value down when stamina is below half. */
  staminaAdjust(v: number): number {
    const half = this.maxStamina >> 1;
    if (this.stamina < half && half > 0) {
      const h = v >> 1;
      return h + Math.floor((h * this.stamina) / half);
    }
    return v;
  }

  get maxLoad(): number {
    let load = this.staminaAdjust(this.stat(STAT.STRENGTH).cur * 8 + 100);
    if (this.wounds) load -= load >> (this.wounds & (1 << SLOT.LEGS) ? 2 : 3);
    load += 9;
    return load - (load % 10);
  }

  /** Ticks per step. */
  get movementTicks(): number {
    const max = this.maxLoad;
    const load = this.load;
    let ticks: number;
    let woundTicks: number;
    if (load <= max) {
      ticks = 2;
      if (load * 8 > max * 5) ticks++;
      woundTicks = 1;
    } else {
      ticks = 4 + Math.floor(((load - max) * 4) / max);
      woundTicks = 2;
    }
    if (this.wounds & (1 << SLOT.FEET)) ticks += woundTicks;
    return ticks;
  }

  dexterity(rng: Rng): number {
    let d = rng.int(8) + this.stat(STAT.DEXTERITY).cur;
    d -= Math.floor(((d >> 1) * this.load) / this.maxLoad);
    d = Math.max(2, d);
    return clamp(1 + rng.int(8), d >> 1, 100 - rng.int(8));
  }

  /**
   * Power of an attack/throw made with the item in `slot` (0..100).
   * `skill` is the skill whose level adds to weapon attacks.
   */
  strengthForSlot(slot: number, rng: Rng, skill: number = SKILL.SWING): number {
    return this.strengthOf(this.slots[slot] ?? null, rng, skill, !!(this.wounds & (1 << slot)));
  }

  /** Power of using `item` (or a bare hand) with the given skill; halved if the hand is wounded. */
  strengthOf(item: Item | null, rng: Rng, skill: number = SKILL.SWING, woundedHand = false): number {
    let s = rng.int(16) + this.stat(STAT.STRENGTH).cur;
    const w = item ? item.weight : 0;
    const q = this.maxLoad >> 4;
    if (w <= q) s += w - 12;
    else if (w <= q + ((q - 12) >> 1)) s += (w - q) >> 1;
    else s -= (w - (q + ((q - 12) >> 1))) << 1;
    if (item?.weapon) {
      s += item.weapon.strength;
      s += this.skillLevel(skill) << 1;
    }
    s = this.staminaAdjust(s);
    if (woundedHand) s >>= 1;
    return clamp(0, s >> 1, 100);
  }

  // ---- Defense and damage ------------------------------------------------
  woundDefense(wound: number, sharp: boolean, shields: PartyShields, rng: Rng): number {
    let shieldDef = 0;
    for (const hand of [SLOT.READY, SLOT.ACTION]) {
      const a = this.slots[hand]?.armour;
      if (a?.isShield) {
        const factor = WOUND_DEFENSE_FACTOR[wound] ?? 0;
        shieldDef += ((this.strengthForSlot(hand, rng) + (sharp ? a.sharp : a.other)) * factor) >> (hand === wound ? 4 : 5);
      }
    }
    let d = rng.int((this.stat(STAT.VITALITY).cur >> 3) + 1);
    if (sharp) d >>= 1;
    d += this.actionDefense + this.shieldDefense + shields.shield + shieldDef;
    if (wound > SLOT.ACTION) {
      const a = this.slots[wound]?.armour;
      if (a) d += sharp ? a.sharp : a.other;
    }
    if (this.wounds & (1 << wound)) d -= 8 + rng.twoBits();
    return clamp(0, d >> 1, 100);
  }

  /** Stat-based attack reduction: higher stat, smaller attack. */
  private statAdjusted(statIdx: number, attack: number): number {
    const f = 170 - this.stat(statIdx).cur;
    if (f < 16) return attack >> 3;
    return scaled(attack, 7, f);
  }

  /**
   * Resolve an incoming attack. Applies damage and wounds immediately.
   * Returns damage dealt (0 if none).
   */
  takeAttack(
    attack: number, allowedWounds: number, type: AttackType,
    shields: PartyShields, rng: Rng,
  ): number {
    if (attack <= 0 || !this.alive) return 0;
    if (type !== 'normal') {
      let count = 0;
      let defense = 0;
      for (let w = SLOT.READY; w <= SLOT.FEET; w++) {
        if (allowedWounds & (1 << w)) {
          count++;
          defense += this.woundDefense(w, type === 'sharp', shields, rng);
        }
      }
      if (count) defense = Math.floor(defense / count);
      let skipScale = false;
      switch (type) {
        case 'psychic': {
          const wf = 115 - this.stat(STAT.WISDOM).cur;
          attack = wf <= 0 ? 0 : scaled(attack, 6, wf);
          skipScale = true;
          break;
        }
        case 'magic':
          attack = this.statAdjusted(STAT.ANTIMAGIC, attack) - shields.spell;
          skipScale = true;
          break;
        case 'fire':
          attack = this.statAdjusted(STAT.ANTIFIRE, attack) - shields.fire;
          break;
        case 'self':
          defense = (defense >> 1) + this.skillLevel(SKILL.NINJA);
          break;
        default:
          break;
      }
      if (!skipScale) {
        if (attack <= 0) return 0;
        attack = scaled(attack, 6, 130 - defense);
      }
      if (attack <= 0) return 0;
      let threshold = this.statAdjusted(STAT.VITALITY, rng.int(128) + 10);
      if (attack > threshold) {
        do {
          this.wounds |= (1 << rng.int(8)) & allowedWounds;
          threshold <<= 1;
        } while (attack > threshold && threshold !== 0);
      }
    }
    this.health -= attack;
    if (this.health <= 0) {
      this.health = 0;
      this.log.push(`${this.name} is dead.`);
    }
    return attack;
  }

  drainStamina(x: number): void {
    this.stamina -= x;
    if (this.stamina <= 0) {
      const over = -this.stamina;
      this.stamina = 0;
      if (over > 1) this.takeAttack(over >> 1, 0, 'normal', NO_SHIELDS, new Rng(0));
    } else if (this.stamina > this.maxStamina) {
      this.stamina = this.maxStamina;
    }
  }

  /**
   * Periodic regen/hunger. Called every REGEN_PERIOD ticks.
   * `idleTicks` = ticks since the party last moved.
   */
  regenTick(time: number, idleTicks: number): void {
    if (!this.alive) return;
    const t = (((time & 0x80) + ((time & 0x100) >> 2) + ((time & 0x40) << 2)) >> 2);
    const wiz = this.skillLevel(SKILL.WIZARD);
    const pri = this.skillLevel(SKILL.PRIEST);
    if (this.mana < this.maxMana && t < this.stat(STAT.WISDOM).cur + wiz + pri) {
      const gain = Math.floor(this.maxMana / 40) + 1;
      this.drainStamina(gain * Math.max(7, 16 - wiz - pri));
      this.mana += Math.min(gain, this.maxMana - this.mana);
    } else if (this.mana > this.maxMana) {
      this.mana--;
    }
    for (const s of this.skills) if (s.temp > 0) s.temp--;

    let cycles = 4;
    let mag = this.maxStamina;
    while (this.stamina < (mag >>= 1)) cycles += 2;
    let loss = 0;
    let amount = clamp(1, (this.maxStamina >> 8) - 1, 6);
    if (idleTicks > 80) { amount++; if (idleTicks > 250) amount++; }
    do {
      const aboveHalf = cycles <= 4;
      if (this.food < -512) {
        if (aboveHalf) { loss += amount; this.food -= 2; }
      } else {
        if (this.food >= 0) loss -= amount;
        this.food -= aboveHalf ? 2 : cycles >> 1;
      }
      if (this.water < -512) {
        if (aboveHalf) { loss += amount; this.water--; }
      } else {
        if (this.water >= 0) loss -= amount;
        this.water -= aboveHalf ? 1 : cycles >> 2;
      }
    } while (--cycles && this.stamina - loss < this.maxStamina);
    this.drainStamina(loss);
    this.food = Math.max(-1024, this.food);
    this.water = Math.max(-1024, this.water);

    if (this.health < this.maxHealth && this.stamina >= this.maxStamina >> 2 &&
        t < this.stat(STAT.VITALITY).cur + 12) {
      const gain = (this.maxHealth >> 7) + 1;
      this.health += Math.min(gain, this.maxHealth - this.health);
    }
    if ((time & 255) === 0) {
      for (const st of this.stats) {
        if (st.cur < st.max) st.cur++;
        else if (st.cur > st.max && st.max > 0) st.cur -= Math.floor(st.cur / st.max);
      }
    }
  }
}

/** How strongly a shield in hand protects each body location (design values). */
const WOUND_DEFENSE_FACTOR: number[] = [4, 5, 6, 8, 7, 6];

export const CHAMPION_TEMPLATES: ChampionTemplate[] = [
  { name: 'Brann', klass: 'fighter', health: 90, stamina: 600, mana: 10, stats: [30, 50, 40, 30, 45, 25, 25] },
  { name: 'Sable', klass: 'ninja', health: 70, stamina: 550, mana: 15, stats: [45, 35, 55, 35, 35, 25, 25] },
  { name: 'Ione', klass: 'priest', health: 65, stamina: 450, mana: 60, stats: [35, 30, 35, 55, 35, 40, 30] },
  { name: 'Veyr', klass: 'wizard', health: 50, stamina: 400, mana: 80, stats: [30, 25, 35, 60, 30, 45, 35] },
];
