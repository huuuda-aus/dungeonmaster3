import { Champion, CHAMPION_TEMPLATES, SKILL, SLOT, SLOT_COUNT, STAT, WEAR_OF_SLOT, type PartyShields } from './champion';
import {
  LIGHT_AMOUNT, PROJECTILE_COLOR, SPELL_COOLDOWNS, explosionDamage, findSpell, projectileRange, requiredLevel, runeCost,
  selfPower, spellEnergy, spellExperience, wisdomFailThreshold,
  type Cloud, type Effect, type Projectile, type ProjectileKind, type SpellDef,
} from './magic';
import { ACTIONS, DOOR_BREAKERS, type ActionDef } from './actions';
import { FIST_ACTIONS, makeItem, makePotion, type Item, type PotionType } from './items';
import { MONSTER_DEFS, type Monster } from './monsters';
import { Rng, clamp } from './rng';
import { Timeline, type GameEvent } from './timeline';
import { DX, DY, GameMap, Tile, opposite, turnLeft, turnRight, type Dir } from './world';

export type Command =
  | 'forward' | 'back' | 'strafeLeft' | 'strafeRight' | 'turnLeft' | 'turnRight';

export interface ActionResult { performed: boolean; hit: boolean; damage: number; killed: boolean }

/** Melee strength needed to break a closed door. */
const DOOR_DEFENSE = 28;

export const TICKS_PER_SECOND = 7.5; // 25% slower than the original 10
const REGEN_PERIOD = 32;

export class Game {
  readonly rng: Rng;
  readonly timeline = new Timeline();
  readonly map: GameMap;
  readonly champions: Champion[];
  monsters: Monster[] = [];
  px: number;
  py: number;
  dir: Dir;
  time = 0;
  /** Tick of the most recent creature attack on the party. */
  lastCreatureAttack = -1000;
  lastPartyMove = 0;
  partyReadyAt = 0;
  shields: PartyShields = { shield: 0, fire: 0, spell: 0 };
  messages: string[] = [];
  /** The item held on the pointer ("leader hand"), moved between slots. */
  cursor: Item | null = null;
  /** Items lying on the floor, by cell. */
  floor = new Map<number, Item[]>();
  /** Bumped whenever the floor changes, so the renderer can refresh. */
  floorVersion = 0;
  projectiles: Projectile[] = [];
  effects: Effect[] = [];
  /** Extra light radius multiplier from light spells (1 = none). */
  lightBoost = 1;
  private lightSources: number[] = [];
  clouds: Cloud[] = [];
  /** Active-effect counters (stackable). */
  seeThrough = 0;
  invisible = 0;
  footprints = 0;
  /** Recent party positions, newest last (for magic footprints). */
  trail: { x: number; y: number }[] = [];
  private nextEffect = 1;
  private pending: Command | null = null;
  private nextUid = 1;
  over = false;
  /** While frozen, time-sensitive commands (moving, fighting, casting) are refused. */
  frozen = false;

  constructor(map: GameMap, seed = 1) {
    this.map = map;
    this.rng = new Rng(seed);
    this.px = map.start.x;
    this.py = map.start.y;
    this.dir = map.start.dir;
    this.champions = CHAMPION_TEMPLATES.map((t, i) => new Champion(t, i));
    this.equipDefaults();
    for (const s of map.spawns) this.spawn(s.id, s.x, s.y, s.facing);
    for (const it of map.itemSpawns) this.addToFloor(it.x, it.y, makeItem(it.id));
    this.timeline.add({ time: REGEN_PERIOD, priority: 0, kind: 'regen' });
  }

  private equipDefaults(): void {
    const [brann, sable, ione, veyr] = this.champions as [Champion, Champion, Champion, Champion];
    brann.slots[SLOT.ACTION] = makeItem('shortSword');
    brann.slots[SLOT.READY] = makeItem('woodenShield');
    brann.slots[SLOT.TORSO] = makeItem('leatherJerkin');
    sable.slots[SLOT.ACTION] = makeItem('dagger');
    sable.slots[SLOT.FEET] = makeItem('leatherBoots');
    ione.slots[SLOT.ACTION] = makeItem('club');
    veyr.slots[SLOT.ACTION] = makeItem('dagger');
    for (const c of this.champions) {
      c.slots[SLOT.PACK] = makeItem('bread');
      c.slots[SLOT.PACK + 1] = makeItem('waterFlask');
    }
    ione.slots[SLOT.PACK + 2] = makeItem('flask');
    veyr.slots[SLOT.PACK + 2] = makeItem('flask');
  }

  // ---- Inventory ------------------------------------------------------------
  private cellKey(x: number, y: number): number { return y * this.map.width + x; }

  /** Items on the cell the party is standing on. */
  floorHere(): Item[] { return this.floor.get(this.cellKey(this.px, this.py)) ?? []; }

  private addToFloor(x: number, y: number, item: Item): void {
    const k = this.cellKey(x, y);
    const list = this.floor.get(k) ?? [];
    list.push(item);
    this.floor.set(k, list);
    this.floorVersion++;
  }

  /** Can `item` go in this slot of this champion? */
  canPlace(idx: number, slot: number, item: Item): { ok: boolean; reason?: string } {
    const ch = this.champions[idx]!;
    if (slot < 0 || slot >= SLOT_COUNT) return { ok: false, reason: 'No such slot.' };
    if (slot >= SLOT.POUCH1) return { ok: true };
    if (slot >= SLOT.HEAD) {
      return item.wear === WEAR_OF_SLOT[slot]
        ? { ok: true }
        : { ok: false, reason: `That does not go on the ${WEAR_OF_SLOT[slot]}.` };
    }
    // Hands.
    if (item.weapon?.twoHanded) {
      if (slot !== SLOT.ACTION) return { ok: false, reason: 'A two-handed weapon needs the weapon hand.' };
      if (ch.slots[SLOT.READY]) return { ok: false, reason: 'Free the shield hand first.' };
    } else if (slot === SLOT.READY && ch.twoHanded) {
      return { ok: true }; // swapping out the two-handed weapon
    }
    return { ok: true };
  }

  /**
   * Click a slot: pick up its item if the pointer is empty, otherwise place the
   * held item there (swapping with what was there).
   */
  clickSlot(idx: number, slot: number): boolean {
    const ch = this.champions[idx];
    if (!ch) return false;
    // A two-handed weapon shows in both hands but lives in the weapon hand.
    if (slot === SLOT.READY && ch.twoHanded) slot = SLOT.ACTION;
    const here = ch.slots[slot] ?? null;
    if (!this.cursor) {
      if (!here) return false;
      this.cursor = here;
      ch.slots[slot] = null;
      return true;
    }
    const check = this.canPlace(idx, slot, this.cursor);
    if (!check.ok) {
      if (check.reason) this.messages.push(check.reason);
      return false;
    }
    ch.slots[slot] = this.cursor;
    this.cursor = here;
    return true;
  }

  /** The cell directly ahead of the party. */
  frontCell(): { x: number; y: number } {
    return { x: this.px + DX[this.dir], y: this.py + DY[this.dir] };
  }

  floorAt(x: number, y: number): Item[] { return this.floor.get(this.cellKey(x, y)) ?? []; }

  /** Put an item in the first free pouch, backpack or quiver slot. */
  autoPlace(idx: number, item: Item): boolean {
    const ch = this.champions[idx];
    if (!ch) return false;
    const order = [
      SLOT.POUCH1, SLOT.POUCH2,
      ...Array.from({ length: 12 }, (_, i) => SLOT.PACK + i),
      ...Array.from({ length: 4 }, (_, i) => SLOT.QUIVER1 + i),
    ];
    const slot = order.find((s) => !ch.slots[s]);
    if (slot === undefined) return false;
    ch.slots[slot] = item;
    return true;
  }

  /**
   * Click an item lying on the party's cell or the cell ahead: it goes into the
   * active champion's inventory; with no room it stays on the pointer.
   */
  pickUpFloor(x: number, y: number, index: number, idx: number): boolean {
    const front = this.frontCell();
    const here = x === this.px && y === this.py;
    if (!here && !(x === front.x && y === front.y)) return false;
    const k = this.cellKey(x, y);
    const list = this.floor.get(k);
    const item = list?.[index];
    const ch = this.champions[idx];
    if (!list || !item || !ch || !ch.alive) return false;
    if (this.cursor) {
      this.messages.push('Your hand is full.');
      return false;
    }
    if (this.autoPlace(idx, item)) {
      this.messages.push(`${ch.name} takes the ${item.name.toLowerCase()}.`);
    } else {
      this.cursor = item;
      this.messages.push(`${ch.name} has no room for the ${item.name.toLowerCase()}.`);
    }
    list.splice(index, 1);
    if (!list.length) this.floor.delete(k);
    this.floorVersion++;
    return true;
  }

  /** Throw the item on the pointer ahead of the party, thrown by champion `idx`. */
  throwCursor(idx: number): boolean {
    const ch = this.champions[idx];
    const item = this.cursor;
    if (!ch || !ch.alive || !item || this.over || this.frozen) return false;
    if (this.time < Math.min(ch.handReadyAt[0], ch.handReadyAt[1])) return false;
    const level = ch.skillLevel(SKILL.THROW);
    let ke = ch.strengthOf(item, this.rng, SKILL.THROW) + (item.weapon?.throwEnergy ?? 1);
    ke += this.rng.int(16) + (ke >> 1) + level;
    const attack = Math.min(200, Math.max(40, level * 8 + this.rng.int(32)));
    let w = item.weight >> 1;
    let cost = Math.min(10, Math.max(1, w));
    while ((w -= 10) > 0) cost += w >> 1;
    ch.drainStamina(cost);
    ch.handReadyAt = [this.time + 4, this.time + 4];
    ch.handTicks = [4, 4];
    this.train(ch, SKILL.THROW, 8 + (item.weapon ? 4 + ((item.weapon.throwEnergy ?? 0) >> 2) : 0));
    this.cursor = null;
    const p: Projectile = {
      uid: this.nextUid++, x: this.px, y: this.py, dir: this.dir, kind: 'thrown', energy: ke,
      stepsLeft: Math.min(10, Math.max(2, ke >> 3)), owner: idx, eventId: 0, power: 0, item, attack,
    };
    this.projectiles.push(p);
    p.eventId = this.timeline.add({ time: this.time + 2, priority: 2, kind: 'projectile', data: { uid: p.uid } });
    this.flushChampionLogs();
    return true;
  }

  private stepThrown(p: Projectile): void {
    const item = p.item!;
    const land = (x: number, y: number): void => {
      this.addToFloor(x, y, item);
      this.projectiles = this.projectiles.filter((o) => o !== p);
    };
    const nx = p.x + DX[p.dir];
    const ny = p.y + DY[p.dir];
    const tile = this.map.at(nx, ny);
    if (tile === Tile.Wall || tile === Tile.DoorClosed) { land(p.x, p.y); return; }
    const here = this.monsterAt(p.x, p.y);
    const m = here ?? this.monsterAt(nx, ny);
    if (m && !m.def.nonMaterial) {
      this.hitByProjectile(p, m);
      return;
    }
    p.x = nx;
    p.y = ny;
    if (--p.stepsLeft <= 0) { land(p.x, p.y); return; }
    p.eventId = this.timeline.add({ time: this.time + 2, priority: 2, kind: 'projectile', data: { uid: p.uid } });
  }

  /** Move the item in a hand into the champion's pouches/backpack/quiver. */
  stowHand(idx: number, hand: number): boolean {
    const ch = this.champions[idx];
    if (!ch) return false;
    const slot = hand === SLOT.READY && ch.twoHanded ? SLOT.ACTION : hand;
    const item = ch.slots[slot];
    if (!item) return false;
    if (!this.autoPlace(idx, item)) {
      this.messages.push(`${ch.name} has no room to stow the ${item.name.toLowerCase()}.`);
      return false;
    }
    ch.slots[slot] = null;
    return true;
  }

  /** Put the item on the pointer into a champion's pouches/backpack/quiver. */
  stashCursor(idx: number): boolean {
    const ch = this.champions[idx];
    const item = this.cursor;
    if (!ch || !ch.alive || !item) return false;
    if (!this.autoPlace(idx, item)) {
      this.messages.push(`${ch.name} has no room for the ${item.name.toLowerCase()}.`);
      return false;
    }
    this.cursor = null;
    return true;
  }

  /** Take an item from the floor onto the pointer (swapping if it is already holding one). */
  takeFromFloor(i: number): boolean {
    const k = this.cellKey(this.px, this.py);
    const list = this.floor.get(k);
    if (!list || i < 0 || i >= list.length) return false;
    const item = list[i]!;
    if (this.cursor) list[i] = this.cursor;
    else list.splice(i, 1);
    this.cursor = item;
    if (!list.length) this.floor.delete(k);
    this.floorVersion++;
    return true;
  }

  /** Put the held item down on the floor here. */
  dropCursor(): boolean {
    if (!this.cursor) return false;
    this.addToFloor(this.px, this.py, this.cursor);
    this.cursor = null;
    return true;
  }

  /** Eat/drink the held item with champion `idx`. */
  consumeCursor(idx: number): boolean {
    const ch = this.champions[idx];
    const it = this.cursor;
    if (!ch || !ch.alive || !it) return false;
    if (it.food) {
      ch.food = Math.min(2048, Math.max(ch.food, 0) + it.food);
      this.cursor = null;
      this.messages.push(`${ch.name} eats the ${it.name.toLowerCase()}.`);
    } else if (it.drink) {
      ch.water = Math.min(2048, Math.max(ch.water, 0) + it.drink);
      this.cursor = makeItem('flask');
      this.messages.push(`${ch.name} drinks.`);
    } else if (it.potion) {
      this.drinkPotion(ch, it.potion.type, it.potion.power);
      this.cursor = makeItem('flask');
    } else {
      this.messages.push(`${ch.name} cannot eat that.`);
      return false;
    }
    return true;
  }

  private drinkPotion(ch: Champion, type: PotionType, power: number): void {
    const stat = (i: number, amt: number): void => { ch.stat(i).cur += Math.max(1, Math.floor(amt)); };
    switch (type) {
      case 'health': ch.health = Math.min(ch.maxHealth, ch.health + Math.floor(power * 0.8)); break;
      case 'stamina': ch.stamina = Math.min(ch.maxStamina, ch.stamina + power * 3); break;
      case 'mana': ch.mana = Math.min(ch.maxMana + (power >> 4), ch.mana + (power >> 2)); break;
      case 'strength': stat(STAT.STRENGTH, power / 12); break;
      case 'dexterity': stat(STAT.DEXTERITY, power / 12); break;
      case 'wisdom': stat(STAT.WISDOM, power / 12); break;
      case 'vitality': stat(STAT.VITALITY, power / 12); break;
      case 'shield': {
        const amt = Math.max(1, power >> 3);
        ch.shieldDefense += amt;
        this.timeline.add({
          time: this.time + power * 2, priority: 0, kind: 'champShieldEnd',
          data: { champ: this.champions.indexOf(ch), amt },
        });
        break;
      }
      case 'poison': ch.takeAttack(Math.max(1, power >> 4), 0, 'normal', this.shields, this.rng); break;
      case 'cure': break;
    }
    this.messages.push(`${ch.name} drinks the ${type} potion.`);
    this.flushChampionLogs();
  }

  /** Drop everything a fallen champion carries. */
  private dropBelongings(ch: Champion): void {
    ch.dropped = true;
    let any = false;
    for (let i = 0; i < ch.slots.length; i++) {
      const it = ch.slots[i];
      if (it) { this.addToFloor(this.px, this.py, it); ch.slots[i] = null; any = true; }
    }
    if (any) this.messages.push(`${ch.name}'s belongings fall to the floor.`);
  }

  private dropLoot(m: Monster): void {
    for (const d of m.def.drops ?? []) {
      if (this.rng.int(1000) < d.chance * 1000) this.addToFloor(m.x, m.y, makeItem(d.id));
    }
  }

  // ---- Monsters ------------------------------------------------------------
  spawn(defId: string, x: number, y: number, facing: Dir): Monster {
    const def = MONSTER_DEFS[defId];
    if (!def) throw new Error(`unknown monster ${defId}`);
    const m: Monster = {
      uid: this.nextUid++, def, x, y, facing, health: def.health, eventId: 0, poison: null,
    };
    this.monsters.push(m);
    m.eventId = this.timeline.add({
      time: this.time + def.moveTicks, priority: 1, kind: 'monster', data: { uid: m.uid },
    });
    return m;
  }

  monsterAt(x: number, y: number): Monster | undefined {
    return this.monsters.find((m) => m.x === x && m.y === y);
  }

  private cellFree(x: number, y: number): boolean {
    return this.map.walkable(x, y) && !(x === this.px && y === this.py) && !this.monsterAt(x, y);
  }

  // ---- Party ---------------------------------------------------------------
  /** Request a command; executes as soon as the party is ready. */
  command(c: Command): void {
    if (this.frozen) return;
    this.pending = c;
  }

  get livingChampions(): Champion[] {
    return this.champions.filter((c) => c.alive);
  }

  private stepTicks(): number {
    const alive = this.livingChampions;
    if (!alive.length) return 4;
    return Math.max(...alive.map((c) => c.movementTicks));
  }

  private runCommand(c: Command): void {
    const step = this.stepTicks();
    switch (c) {
      case 'turnLeft': this.dir = turnLeft(this.dir); this.partyReadyAt = this.time + 2; return;
      case 'turnRight': this.dir = turnRight(this.dir); this.partyReadyAt = this.time + 2; return;
    }
    const d: Dir =
      c === 'forward' ? this.dir :
      c === 'back' ? opposite(this.dir) :
      c === 'strafeLeft' ? turnLeft(this.dir) : turnRight(this.dir);
    const nx = this.px + DX[d];
    const ny = this.py + DY[d];
    if (this.map.at(nx, ny) === Tile.DoorClosed) {
      this.map.set(nx, ny, Tile.DoorOpen);
      this.partyReadyAt = this.time + 4;
      return;
    }
    if (this.cellFree(nx, ny)) {
      this.px = nx;
      this.py = ny;
      this.lastPartyMove = this.time;
      this.trail.push({ x: nx, y: ny });
      if (this.trail.length > 80) this.trail.shift();
    }
    this.partyReadyAt = this.time + step;
  }

  /** The monster directly ahead of the party, if any. */
  monsterAhead(): Monster | undefined {
    return this.monsterAt(this.px + DX[this.dir], this.py + DY[this.dir]);
  }

  // ---- Actions ---------------------------------------------------------------
  /** Item in a hand (0 = ready, 1 = action). A two-handed weapon fills both hands. */
  itemInHand(idx: number, hand: number): Item | null {
    const ch = this.champions[idx]!;
    if (hand === SLOT.READY && ch.twoHanded) return ch.slots[SLOT.ACTION] ?? null;
    return ch.slots[hand] ?? null;
  }

  /** Actions offered by whatever is in the hand, with whether the champion has the skill for each. */
  availableActions(idx: number, hand: number): { action: ActionDef; minLevel: number; unlocked: boolean; level: number }[] {
    const ch = this.champions[idx]!;
    const item = this.itemInHand(idx, hand);
    const offered = item ? (item.actions ?? []) : FIST_ACTIONS;
    return offered.flatMap((o) => {
      const action = ACTIONS[o.id];
      if (!action) return [];
      const level = ch.skillLevel(action.skill);
      return [{ action, minLevel: o.minLevel, unlocked: level >= o.minLevel, level }];
    });
  }

  /** Is the champion blocked from reaching the creature in front by a living champion ahead of them? */
  private cannotReach(ch: Champion): boolean {
    const blocker = ch.cell === 2 ? 1 : ch.cell === 3 ? 0 : -1;
    return blocker >= 0 && this.champions.some((o) => o.alive && o.cell === blocker);
  }

  /** Perform the first action the champion's action hand offers (keyboard shortcut). */
  quickAction(idx: number): ActionResult | null {
    const first = this.availableActions(idx, SLOT.ACTION)[0];
    return first ? this.performAction(idx, SLOT.ACTION, first.action.id) : null;
  }

  /**
   * Perform a melee action with a hand. Returns null if it could not start
   * (dead, hand busy, locked, or unknown action).
   */
  performAction(idx: number, hand: number, actionId: string): ActionResult | null {
    const ch = this.champions[idx];
    if (!ch || !ch.alive || this.over || this.frozen || (hand !== 0 && hand !== 1)) return null;
    if (this.time < ch.handReadyAt[hand]!) return null;
    const entry = this.availableActions(idx, hand).find((e) => e.action.id === actionId);
    if (!entry || !entry.unlocked) return null;
    const a = entry.action;
    const res: ActionResult = { performed: true, hit: false, damage: 0, killed: false };
    const faceStamina = a.stamina + this.rng.bit();
    let ticks = a.ticks;
    let xp = a.xp;
    ch.drainStamina(faceStamina);

    if (a.kind === 'shout') {
      res.performed = this.shout(ch, a);
    } else {
      const tx = this.px + DX[this.dir];
      const ty = this.py + DY[this.dir];
      const tile = this.map.at(tx, ty);
      const target = this.monsterAt(tx, ty);
      if (tile === Tile.DoorClosed && DOOR_BREAKERS.has(a.id)) {
        ticks = 6;
        const power = ch.strengthForSlot(hand, this.rng, a.skill);
        if (power >= DOOR_DEFENSE) {
          this.map.set(tx, ty, Tile.DoorOpen);
          this.messages.push(`${ch.name} smashes the door open.`);
        } else {
          this.messages.push(`${ch.name} pounds on the door.`);
        }
      } else if (!target) {
        res.performed = false;
      } else if (this.cannotReach(ch)) {
        this.messages.push(`${ch.name} cannot reach the ${target.def.name}.`);
        res.performed = false;
      } else {
        this.meleeStrike(ch, hand, a, target, res);
        xp = res.hit ? xp : xp >> 1;
      }
    }
    if (!res.performed) {
      xp >>= 1;
      ticks >>= 1;
    }
    ch.handReadyAt[hand] = this.time + Math.max(1, ticks);
    ch.handTicks[hand] = Math.max(1, ticks);
    ch.handDefense[hand] = a.defense;
    this.timeline.add({
      time: this.time + Math.max(1, ticks), priority: 0, kind: 'handReady', data: { champ: idx, hand },
    });
    if (xp > 0) this.train(ch, a.skill, xp);
    this.flushChampionLogs();
    return res;
  }

  private shout(ch: Champion, a: ActionDef): boolean {
    const m = this.monsterAhead();
    if (!m) return false;
    const level = ch.skillLevel(a.skill);
    // Frightened creatures lose their next few turns.
    if (this.rng.int(100) < 40 + level * 6) {
      const delay = 18 + level * 3;
      this.timeline.cancel(m.eventId);
      m.eventId = this.timeline.add({
        time: this.time + delay, priority: 1, kind: 'monster', data: { uid: m.uid },
      });
      this.messages.push(`The ${m.def.name} cowers.`);
      return true;
    }
    this.messages.push(`The ${m.def.name} is unimpressed.`);
    return false;
  }

  /** Resolve one melee swing against `target`. */
  private meleeStrike(ch: Champion, hand: number, a: ActionDef, target: Monster, res: ActionResult): void {
    const doubled = this.map.difficulty << 1;
    if (target.def.nonMaterial) {
      this.messages.push(`${ch.name}'s blow passes through the ${target.def.name}.`);
      ch.drainStamina(this.rng.bit() + 2);
      return;
    }
    const dex = ch.dexterity(this.rng);
    const hits =
      dex > this.rng.int(32) + target.def.dodge + doubled - 16 ||
      !this.rng.twoBits() ||
      ch.isLucky(75 - a.hitProb, this.rng);
    if (!hits) {
      this.messages.push(`${ch.name} misses the ${target.def.name}.`);
      ch.drainStamina(this.rng.bit() + 2);
      return;
    }
    let dmg = ch.strengthForSlot(hand, this.rng, a.skill);
    let spare = 0;
    let weak = dmg === 0;
    if (!weak) {
      dmg += this.rng.int((dmg >> 1) + 1);
      dmg = (dmg * a.damageFactor) >> 5;
      const defense = this.rng.int(32) + target.def.defense + doubled;
      spare = dmg = this.rng.int(32) + dmg - defense;
      weak = dmg <= 1;
    }
    if (weak) {
      dmg = this.rng.twoBits();
      if (dmg === 0) {
        this.messages.push(`${ch.name}'s blow glances off the ${target.def.name}.`);
        ch.drainStamina(this.rng.bit() + 2);
        return;
      }
      dmg++;
      spare += this.rng.int(16);
      if (spare > 0 || this.rng.bit()) {
        dmg += this.rng.twoBits();
        if (!this.rng.twoBits()) dmg += Math.max(0, spare + this.rng.int(16));
      }
    }
    dmg >>= 1;
    dmg += this.rng.int(dmg) + this.rng.twoBits();
    dmg += this.rng.int(dmg);
    dmg >>= 2;
    dmg += this.rng.twoBits() + 1;
    if (this.rng.int(64) < ch.skillLevel(a.skill)) dmg += dmg + 10; // critical
    target.health -= dmg;
    res.hit = true;
    res.damage = dmg;
    this.messages.push(`${ch.name}'s ${a.name} hits the ${target.def.name} for ${dmg}.`);
    this.train(ch, a.skill, ((dmg * target.def.xpFactor) >> 4) + 3);
    ch.drainStamina(this.rng.twoBits() + 4);
    if (target.health <= 0) {
      res.killed = true;
      this.finishKill(target, ch, a.skill);
    }
  }

  private train(ch: Champion, skill: number, xp: number): void {
    ch.addExperience(skill, xp, this.time, this.lastCreatureAttack, this.map.difficulty, this.rng);
  }

  private killMonster(m: Monster): void {
    this.dropLoot(m);
    this.timeline.cancel(m.eventId);
    this.monsters = this.monsters.filter((o) => o !== m);
  }

  private flushChampionLogs(): void {
    for (const c of this.champions) {
      if (c.log.length) {
        this.messages.push(...c.log);
        c.log.length = 0;
      }
    }
  }

  // ---- Magic -----------------------------------------------------------------
  private fx(x: number, y: number, color: number, kind: Effect['kind'], spell?: ProjectileKind, power?: number): void {
    this.effects.push({ id: this.nextEffect++, x, y, color, time: this.time, kind, spell, power });
    if (this.effects.length > 64) this.effects.splice(0, this.effects.length - 64);
  }

  /** Step (0..3) the caster's next rune belongs to. */
  symbolStep(idx: number): number {
    return this.champions[idx]!.symbols.length;
  }

  /** Pay for and add a rune (0-based index) at the caster's current step. */
  addSymbol(idx: number, index: number): boolean {
    const ch = this.champions[idx];
    if (!ch || !ch.alive || this.over) return false;
    const step = ch.symbols.length;
    if (step >= 4 || index < 0 || index > 5) return false;
    const cost = runeCost(step, index, ch.symbols[0] ?? -1);
    if (ch.mana < cost) return false;
    ch.mana -= cost;
    ch.symbols.push(index);
    return true;
  }

  /** Remove the last rune (mana is not refunded). */
  recantSymbol(idx: number): void {
    this.champions[idx]?.symbols.pop();
  }

  /** The spell the champion's current runes would cast, if any. */
  pendingSpell(idx: number): ReturnType<typeof findSpell> {
    return findSpell(this.champions[idx]?.symbols ?? []);
  }

  /** Cast the champion's chosen runes. */
  castSpell(idx: number):
    'ok' | 'meaningless' | 'practice' | 'flask' | 'busy' | 'dead' {
    const ch = this.champions[idx];
    if (!ch || !ch.alive || this.over || this.frozen) return 'dead';
    if (this.time < ch.actionReadyAt) {
      this.messages.push(`${ch.name} is still recovering from the last spell.`);
      return 'busy';
    }
    const found = findSpell(ch.symbols);
    if (!found) {
      if (ch.symbols.length) this.messages.push(`${ch.name}'s runes are meaningless.`);
      ch.symbols = [];
      return 'meaningless';
    }
    const { spell, power } = found;
    const saved = ch.symbols;
    ch.symbols = [];
    const req = requiredLevel(spell, power);
    const xp = spellExperience(spell, power, this.rng.int(8));
    let level = ch.skillLevel(spell.skill);
    if (level < req) {
      const missing = req - level;
      for (let i = 0; i < missing; i++) {
        if (this.rng.int(128) > wisdomFailThreshold(ch.stat(STAT.WISDOM).cur)) {
          this.train(ch, spell.skill, xp >> missing);
          this.messages.push(`${ch.name} needs more practice with ${spell.name}.`);
          this.fx(this.px, this.py, 0x666666, 'fizzle');
          this.flushChampionLogs();
          return 'practice';
        }
      }
    }
    // Potions are brewed into an empty flask held in a hand.
    let flaskSlot = -1;
    if (spell.kind === 'potion') {
      flaskSlot = [SLOT.ACTION, SLOT.READY].find((sl) => ch.slots[sl]?.id === 'flask') ?? -1;
      if (flaskSlot < 0) {
        ch.symbols = saved; // keep the runes; fetch a flask and try again
        this.messages.push(`${ch.name} needs an empty flask in hand.`);
        return 'flask';
      }
    }
    if (SPELL_COOLDOWNS) {
      ch.actionReadyAt = this.time + spell.cooldown;
      ch.castTicks = spell.cooldown;
    }
    this.fx(this.px, this.py, 0xc0a0ff, 'cast');
    if (spell.kind === 'potion') {
      ch.slots[flaskSlot] = makePotion(spell.potion as PotionType, this.rng.int(16) + power * 40);
      this.messages.push(`${ch.name} brews a ${spell.name.toLowerCase()}.`);
    } else {
      this.applySpell(idx, spell, power, level);
    }
    this.train(ch, spell.skill, xp);
    this.flushChampionLogs();
    return 'ok';
  }

  private applySpell(idx: number, spell: SpellDef, power: number, level: number): void {
    const ch = this.champions[idx]!;
    const sp = selfPower(power);
    this.messages.push(`${ch.name} casts ${spell.name}.`);
    switch (spell.effect) {
      case 'fireball': this.launch(idx, 'fire', power, level); break;
      case 'lightning': this.launch(idx, 'lightning', power, level); break;
      case 'poisonBolt': this.launch(idx, 'poisonBolt', power, level); break;
      case 'poisonCloud': this.launch(idx, 'poisonCloud', power, level); break;
      case 'dispel': this.launch(idx, 'dispel', power, level); break;
      case 'openDoor': this.launch(idx, 'openDoor', power, level * 2); break;
      case 'partyShield': {
        let def = sp;
        if (this.shields.shield > 50) def >>= 2;
        this.shields.shield += def;
        this.timeline.add({ time: this.time + sp * sp, priority: 0, kind: 'shieldEnd', data: { which: 'shield', amt: def } });
        break;
      }
      case 'fireShield': {
        const ticks = sp * sp + 100;
        let def = ticks >> 5;
        if (this.shields.fire > 50) def >>= 2;
        this.shields.fire += def;
        this.timeline.add({ time: this.time + ticks, priority: 0, kind: 'shieldEnd', data: { which: 'fire', amt: def } });
        break;
      }
      case 'light': this.addLight((sp >> 1) - 1, 10000 + ((sp - 8) << 9)); break;
      case 'torch': this.addLight((sp >> 2) + 1, 2000 + ((sp - 3) << 7)); break;
      case 'darkness': this.addLight(-(sp >> 2), 98); break;
      case 'thievesEye':
        this.seeThrough++;
        this.timeline.add({ time: this.time + (sp >> 1) * (sp >> 1), priority: 0, kind: 'thievesEyeEnd' });
        break;
      case 'invisibility':
        this.invisible++;
        this.timeline.add({ time: this.time + (sp << 3), priority: 0, kind: 'invisibilityEnd' });
        break;
      case 'footprints':
        this.footprints++;
        this.timeline.add({ time: this.time + sp * sp, priority: 0, kind: 'footprintsEnd' });
        break;
      case 'zokathra': {
        const orb = makeItem('zokathra');
        const free = [SLOT.READY, SLOT.ACTION].find((sl) => !ch.slots[sl] && !(sl === SLOT.READY && ch.twoHanded));
        if (free !== undefined) ch.slots[free] = orb;
        else this.addToFloor(this.px, this.py, orb);
        break;
      }
      default: break;
    }
  }

  /** Light amount from the table (0..100); negative power darkens. */
  private addLight(power: number, ticks: number): void {
    const amt = (power >= 0 ? 1 : -1) * LIGHT_AMOUNT[Math.min(15, Math.abs(power))]!;
    this.lightSources.push(amt);
    this.recomputeLight();
    this.timeline.add({ time: this.time + ticks, priority: 0, kind: 'lightEnd', data: { amt } });
  }

  private recomputeLight(): void {
    const total = this.lightSources.reduce((a, b) => a + b, 0);
    this.lightBoost = Math.min(3, Math.max(0.5, 1 + total / 100));
  }

  private launch(owner: number, kind: ProjectileKind, power: number, level: number): void {
    const energy = spellEnergy(power, level);
    const p: Projectile = {
      uid: this.nextUid++, x: this.px, y: this.py, dir: this.dir, kind, energy,
      stepsLeft: projectileRange(energy), owner, eventId: 0, power,
    };
    this.projectiles.push(p);
    p.eventId = this.timeline.add({ time: this.time + 2, priority: 2, kind: 'projectile', data: { uid: p.uid } });
  }

  /** Resolve a projectile striking monster `m` at the monster's cell, and remove the projectile. */
  private hitByProjectile(p: Projectile, m: Monster): void {
    this.projectiles = this.projectiles.filter((o) => o !== p);
    this.timeline.cancel(p.eventId);
    if (p.kind === 'thrown') {
      const item = p.item!;
      const owner = this.champions[p.owner]!;
      const chance = Math.min(95, Math.max(30, (p.attack ?? 40) - m.def.dodge + 50));
      if (this.rng.int(100) < chance) {
        const ke = p.energy;
        let dmg = Math.floor((((ke >> 1) + this.rng.int((ke >> 1) + 1)) * (p.attack ?? 40)) / 100);
        dmg = Math.max(1, dmg - this.rng.int((m.def.defense >> 1) + 1));
        m.health -= dmg;
        this.messages.push(`The ${item.name.toLowerCase()} hits the ${m.def.name} for ${dmg}.`);
        this.train(owner, SKILL.THROW, ((dmg * m.def.xpFactor) >> 4) + 3);
        if (m.health <= 0) this.finishKill(m, owner, SKILL.THROW);
        this.flushChampionLogs();
      } else {
        this.messages.push(`The ${item.name.toLowerCase()} misses the ${m.def.name}.`);
      }
      this.addToFloor(m.x, m.y, item);
      return;
    }
    this.explode(p, m.x, m.y, m);
    this.fx(m.x, m.y, PROJECTILE_COLOR[p.kind], 'hit', p.kind, p.power);
  }

  /** A monster just moved: any projectile already in its new cell hits it. */
  private collideProjectiles(m: Monster): void {
    const p = this.projectiles.find((o) => o.x === m.x && o.y === m.y);
    if (p && !(p.kind === 'thrown' && m.def.nonMaterial)) this.hitByProjectile(p, m);
  }

  private stepProjectile(p: Projectile): void {
    if (p.kind === 'thrown') { this.stepThrown(p); return; }
    const nx = p.x + DX[p.dir];
    const ny = p.y + DY[p.dir];
    const color = PROJECTILE_COLOR[p.kind];
    const remove = (): void => { this.projectiles = this.projectiles.filter((o) => o !== p); };
    const tile = this.map.at(nx, ny);
    if (tile === Tile.DoorClosed) {
      this.hitDoor(p, nx, ny);
      this.fx(p.x, p.y, color, 'hit', p.kind, p.power);
      remove();
      return;
    }
    if (tile === Tile.Wall) {
      this.fx(p.x, p.y, color, 'hit', p.kind, p.power);
      remove();
      return;
    }
    // A monster that stepped into our cell is hit first; otherwise the one in the next cell.
    const m = this.monsterAt(p.x, p.y) ?? this.monsterAt(nx, ny);
    if (m) {
      this.hitByProjectile(p, m);
      return;
    }
    p.x = nx;
    p.y = ny;
    if (--p.stepsLeft <= 0) {
      if (p.kind === 'poisonCloud') this.explode(p, p.x, p.y, undefined);
      this.fx(p.x, p.y, color, 'hit', p.kind, p.power);
      remove();
      return;
    }
    p.eventId = this.timeline.add({ time: this.time + 2, priority: 2, kind: 'projectile', data: { uid: p.uid } });
  }

  private hitDoor(p: Projectile, x: number, y: number): void {
    if (p.kind === 'openDoor') {
      this.map.set(x, y, Tile.DoorOpen);
      this.messages.push('The door swings open.');
    } else if (p.kind === 'fire' || p.kind === 'lightning') {
      const atk = p.kind === 'lightning' ? p.energy >> 1 : p.energy;
      if (explosionDamage(atk, (n) => this.rng.int(n)) >= 40) {
        this.map.set(x, y, Tile.DoorOpen);
        this.messages.push('The door is blasted apart.');
      }
    }
  }

  /** Resolve a projectile's explosion at (x, y), damaging `target` if present. */
  private explode(p: Projectile, x: number, y: number, target: Monster | undefined): void {
    const owner = this.champions[p.owner]!;
    if (p.kind === 'poisonCloud') {
      this.clouds.push({ uid: this.nextUid++, x, y, attack: p.energy, owner: p.owner });
      this.timeline.add({ time: this.time + 4, priority: 3, kind: 'cloud', data: { uid: this.clouds[this.clouds.length - 1]!.uid } });
      return;
    }
    if (!target) return;
    const k = p.kind;
    if (k === 'openDoor') return;
    let attack = p.energy;
    if (k === 'lightning') attack >>= 1;
    if (k === 'poisonBolt') attack >>= 2;
    if (k === 'dispel') {
      if (!target.def.nonMaterial) return;
    } else if (target.def.nonMaterial) {
      this.messages.push(`The ${k === 'fire' ? 'flames' : 'spell'} pass through the ${target.def.name}.`);
      return;
    }
    if (k === 'poisonBolt') {
      if (attack > 0) {
        target.poison = { dmg: Math.max(1, attack >> 2), pulses: 5, owner: p.owner };
        this.timeline.add({ time: this.time + 10, priority: 3, kind: 'poison', data: { uid: target.uid } });
        this.messages.push(`The ${target.def.name} is poisoned.`);
      }
      return;
    }
    let dmg = explosionDamage(attack, (n) => this.rng.int(n));
    if (k === 'lightning') dmg >>= 1;
    const resist = target.def.resist?.[k === 'fire' ? 'fire' : k === 'lightning' ? 'lightning' : 'dispel'] ?? 0;
    dmg = Math.max(0, Math.floor((dmg * (100 - resist)) / 100));
    if (dmg <= 0) {
      this.messages.push(`The ${target.def.name} shrugs it off.`);
      return;
    }
    target.health -= dmg;
    this.messages.push(`${k === 'fire' ? 'Fireball' : k === 'lightning' ? 'Lightning' : 'The spell'} hits the ${target.def.name} for ${dmg}.`);
    if (target.health <= 0) this.finishKill(target, owner, this.skillOf(k));
    this.flushChampionLogs();
  }

  private cloudPulse(uid: number): void {
    const c = this.clouds.find((o) => o.uid === uid);
    if (!c) return;
    const dmg = Math.max(1, Math.min(c.attack >> 5, 4) + this.rng.bit()) * 2;
    const m = this.monsterAt(c.x, c.y);
    if (m && !m.def.nonMaterial) {
      const resist = m.def.resist?.['poison'] ?? 0;
      m.health -= Math.floor((dmg * (100 - resist)) / 100);
      this.fx(m.x, m.y, 0x9bd05a, 'hit');
      if (m.health <= 0) this.finishKill(m, this.champions[c.owner]!, 19);
    }
    if (c.x === this.px && c.y === this.py) {
      for (const ch of this.livingChampions) ch.takeAttack(Math.max(1, dmg >> 1), 0, 'normal', this.shields, this.rng);
    }
    if (c.attack >= 6) {
      c.attack -= 3;
      this.timeline.add({ time: this.time + 4, priority: 3, kind: 'cloud', data: { uid } });
    } else {
      this.clouds = this.clouds.filter((o) => o !== c);
    }
    this.flushChampionLogs();
  }

  private skillOf(k: ProjectileKind): number {
    return k === 'fire' ? 16 : k === 'lightning' ? 17 : k === 'dispel' ? 18 : 19;
  }

  private finishKill(m: Monster, killer: Champion, skill: number): void {
    this.killMonster(m);
    this.train(killer, skill, m.def.xp);
    this.messages.push(`The ${m.def.name} dies.`);
  }

  // ---- Main loop -----------------------------------------------------------
  /** Advance the simulation by one tick. */
  tick(): void {
    if (this.over) return;
    this.time++;
    for (let ev = this.timeline.popDue(this.time); ev; ev = this.timeline.popDue(this.time)) {
      this.handle(ev);
    }
    if (this.pending && this.time >= this.partyReadyAt) {
      const c = this.pending;
      this.pending = null;
      this.runCommand(c);
    }
    for (const c of this.champions) if (!c.alive && !c.dropped) this.dropBelongings(c);
    if (!this.livingChampions.length) {
      this.over = true;
      this.messages.push('The party has fallen.');
    }
  }

  private handle(ev: GameEvent): void {
    if (ev.kind === 'regen') {
      const idle = this.time - this.lastPartyMove;
      for (const c of this.champions) c.regenTick(this.time, idle);
      this.flushChampionLogs();
      this.timeline.add({ time: this.time + REGEN_PERIOD, priority: 0, kind: 'regen' });
    } else if (ev.kind === 'champShieldEnd') {
      const c = this.champions[Number(ev.data?.champ)];
      if (c) c.shieldDefense = Math.max(0, c.shieldDefense - Number(ev.data?.amt ?? 0));
    } else if (ev.kind === 'handReady') {
      const c = this.champions[Number(ev.data?.champ)];
      const h = Number(ev.data?.hand);
      // Only clear if this is still the action that set it.
      if (c && this.time >= c.handReadyAt[h]!) c.handDefense[h] = 0;
    } else if (ev.kind === 'projectile') {
      const p = this.projectiles.find((o) => o.uid === ev.data?.uid);
      if (p) this.stepProjectile(p);
    } else if (ev.kind === 'poison') {
      const m = this.monsters.find((o) => o.uid === ev.data?.uid);
      if (m?.poison) {
        const ownerIdx = m.poison.owner;
        m.health -= m.poison.dmg;
        this.fx(m.x, m.y, 0x7be04a, 'hit');
        if (--m.poison.pulses <= 0) m.poison = null;
        else this.timeline.add({ time: this.time + 10, priority: 3, kind: 'poison', data: { uid: m.uid } });
        if (m.health <= 0) {
          this.finishKill(m, this.champions[ownerIdx] ?? this.champions[0]!, 19);
          this.flushChampionLogs();
        }
      }
    } else if (ev.kind === 'cloud') {
      this.cloudPulse(Number(ev.data?.uid));
    } else if (ev.kind === 'shieldEnd') {
      const which = ev.data?.which === 'fire' ? 'fire' : 'shield';
      this.shields[which] = Math.max(0, this.shields[which] - Number(ev.data?.amt ?? 0));
    } else if (ev.kind === 'lightEnd') {
      const i = this.lightSources.indexOf(Number(ev.data?.amt));
      if (i >= 0) this.lightSources.splice(i, 1);
      this.recomputeLight();
    } else if (ev.kind === 'thievesEyeEnd') {
      this.seeThrough = Math.max(0, this.seeThrough - 1);
    } else if (ev.kind === 'invisibilityEnd') {
      this.invisible = Math.max(0, this.invisible - 1);
    } else if (ev.kind === 'footprintsEnd') {
      this.footprints = Math.max(0, this.footprints - 1);
    } else if (ev.kind === 'monster') {
      const m = this.monsters.find((o) => o.uid === ev.data?.uid);
      if (m) this.monsterAct(m);
    }
  }

  // ---- Monster AI ------------------------------------------------------------
  private monsterAct(m: Monster): void {
    const dx = this.px - m.x;
    const dy = this.py - m.y;
    let delay = m.def.moveTicks;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      m.facing = dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0;
      this.monsterAttack(m);
      delay = m.def.attackTicks;
    } else {
      const step = this.pathStep(m);
      if (step) {
        m.facing = step.dir;
        m.x = step.x;
        m.y = step.y;
        this.collideProjectiles(m);
      }
    }
    m.eventId = this.timeline.add({
      time: this.time + delay, priority: 1, kind: 'monster', data: { uid: m.uid },
    });
  }

  /** Next step along a shortest path to the party, if the party is within sight. */
  private pathStep(m: Monster): { x: number; y: number; dir: Dir } | null {
    // An invisible party is only noticed when adjacent (handled before pathing).
    if (this.invisible) return null;
    const { width } = this.map;
    const key = (x: number, y: number) => y * width + x;
    const seen = new Map<number, { x: number; y: number; first: Dir | -1; dist: number }>();
    seen.set(key(m.x, m.y), { x: m.x, y: m.y, first: -1, dist: 0 });
    const queue = [seen.get(key(m.x, m.y))!];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi]!;
      if (cur.dist >= m.def.sight) continue;
      for (let d = 0; d < 4; d++) {
        const nx = cur.x + DX[d as Dir];
        const ny = cur.y + DY[d as Dir];
        const k = key(nx, ny);
        if (seen.has(k)) continue;
        if (nx === this.px && ny === this.py) {
          const first = cur.first === -1 ? (d as Dir) : cur.first;
          const sx = m.x + DX[first];
          const sy = m.y + DY[first];
          return this.cellFree(sx, sy) ? { x: sx, y: sy, dir: first } : null;
        }
        if (!this.map.walkable(nx, ny) || this.monsterAt(nx, ny)) continue;
        const node = { x: nx, y: ny, first: cur.first === -1 ? (d as Dir) : cur.first, dist: cur.dist + 1 };
        seen.set(k, node);
        queue.push(node);
      }
    }
    return null;
  }

  private monsterAttack(m: Monster): void {
    this.lastCreatureAttack = this.time;
    const from = m.facing; // direction the monster looks = toward the party
    const side = opposite(from); // side of the party square it is on
    // Corners touching `side`: absolute corner k lies between side k and k+1.
    const corners = [side, (side + 3) % 4];
    const living = this.livingChampions;
    const exposed = living.filter((c) => corners.includes((this.dir + c.cell + 3) % 4));
    const pool = exposed.length ? exposed : living;
    const target = pool[this.rng.int(pool.length)];
    if (!target) return;
    const raw = m.def.attack + this.rng.int((m.def.attack >> 1) + 1);
    const dealt = target.takeAttack(raw, m.def.wounds, m.def.attackType, this.shields, this.rng);
    this.messages.push(
      dealt > 0
        ? `The ${m.def.name} hits ${target.name} for ${dealt}.`
        : `The ${m.def.name} fails to hurt ${target.name}.`,
    );
    this.flushChampionLogs();
  }
}
