import { describe, expect, it } from 'vitest';
import { SKILL, SLOT } from '../src/sim/champion';
import { Game } from '../src/sim/game';
import { ITEM_LIBRARY } from '../src/sim/items';
import { GameMap } from '../src/sim/world';

const BRANN = 0, SABLE = 1, IONE = 2;
const arena = (door = false) =>
  new Game(GameMap.parse(['#######', door ? '#@+...#' : '#@.g..#', '#######'], { g: 'gnawer' }), 11);
/** Put the monster directly in front of the party. */
const adjacent = (g: Game) => {
  const m = g.monsters[0]!;
  m.x = g.px + 1; m.y = g.py;
  m.def = { ...m.def, moveTicks: 99999, attackTicks: 99999 };
  g.timeline.cancel(m.eventId);
  return m;
};

describe('hands and action lists', () => {
  it('bare hands offer punch, kick, war cry', () => {
    const g = arena();
    const list = g.availableActions(IONE, SLOT.READY);
    expect(list.map((e) => e.action.id)).toEqual(['punch', 'kick', 'warCry']);
  });
  it('a weapon offers its own actions, gated by skill level', () => {
    const g = arena();
    const b = g.champions[BRANN]!;
    b.skills.forEach((s) => (s.exp = 0));
    const list = g.availableActions(BRANN, SLOT.ACTION);
    expect(list.map((e) => e.action.id)).toEqual(['swing', 'thrust', 'parry']);
    expect(list.map((e) => e.unlocked)).toEqual([true, false, false]);
    b.skills[SKILL.SWING]!.exp = 40000; b.skills[5]!.exp = 40000; b.skills[7]!.exp = 40000;
    expect(g.availableActions(BRANN, SLOT.ACTION).every((e) => e.unlocked)).toBe(true);
  });
  it('a shield in the ready hand offers block', () => {
    const g = arena();
    expect(g.availableActions(BRANN, SLOT.READY).map((e) => e.action.id)).toEqual(['block']);
  });
  it('a two-handed weapon fills both hands', () => {
    const g = arena();
    const b = g.champions[BRANN]!;
    b.slots[SLOT.READY] = null;
    b.slots[SLOT.ACTION] = ITEM_LIBRARY['greatsword']!;
    expect(b.twoHanded).toBe(true);
    expect(g.itemInHand(BRANN, SLOT.READY)?.id).toBe('greatsword');
    expect(g.availableActions(BRANN, SLOT.READY)[0]!.action.id).toBe('cleave');
  });
  it('items without actions list nothing', () => {
    const g = arena();
    g.champions[IONE]!.slots[SLOT.READY] = ITEM_LIBRARY['leatherJerkin']!;
    expect(g.availableActions(IONE, SLOT.READY)).toEqual([]);
  });
});

describe('performing actions', () => {
  it('locked or unknown actions do not start', () => {
    const g = arena();
    const b = g.champions[BRANN]!;
    b.skills.forEach((s) => (s.exp = 0));
    expect(g.performAction(BRANN, SLOT.ACTION, 'thrust')).toBeNull();
    expect(g.performAction(BRANN, SLOT.ACTION, 'nonsense')).toBeNull();
  });

  it('each hand has its own cooldown', () => {
    const g = arena();
    adjacent(g);
    expect(g.performAction(BRANN, SLOT.ACTION, 'swing')).not.toBeNull();
    expect(g.performAction(BRANN, SLOT.ACTION, 'swing')).toBeNull(); // still busy
    expect(g.performAction(BRANN, SLOT.READY, 'block')).not.toBeNull(); // other hand is free
  });

  it('a hand frees up after the action time', () => {
    const g = arena();
    adjacent(g);
    g.performAction(BRANN, SLOT.ACTION, 'swing');
    for (let i = 0; i < 7; i++) g.tick();
    expect(g.performAction(BRANN, SLOT.ACTION, 'swing')).not.toBeNull();
  });

  it('hits damage the monster and train the action skill', () => {
    const g = arena();
    const m = adjacent(g);
    m.health = 9999;
    const brann = g.champions[BRANN]!;
    const xp = brann.skills[SKILL.SWING]!.exp;
    let hits = 0;
    for (let i = 0; i < 40; i++) {
      brann.handReadyAt = [0, 0];
      brann.stamina = brann.maxStamina;
      const r = g.performAction(BRANN, SLOT.ACTION, 'swing')!;
      if (r.hit) hits++;
    }
    expect(hits).toBeGreaterThan(5);
    expect(m.health).toBeLessThan(9999);
    expect(brann.skills[SKILL.SWING]!.exp).toBeGreaterThan(xp);
  });

  it('actions cost stamina', () => {
    const g = arena();
    adjacent(g);
    const b = g.champions[BRANN]!;
    const before = b.stamina;
    g.performAction(BRANN, SLOT.ACTION, 'swing');
    expect(b.stamina).toBeLessThan(before);
  });

  it('back-row champions cannot reach past living front-row champions', () => {
    const g = arena();
    adjacent(g);
    const r = g.performAction(IONE, SLOT.ACTION, 'bash')!;
    expect(r.performed).toBe(false);
    g.champions[BRANN]!.health = 0; g.champions[SABLE]!.health = 0;
    g.champions[IONE]!.handReadyAt = [0, 0];
    g.champions[IONE]!.cell = 2; // still back-right, but cell 1 now empty of the living
    expect(g.performAction(IONE, SLOT.ACTION, 'bash')!.performed).toBe(true);
  });

  it('swinging at nothing wastes the action', () => {
    const g = arena();
    g.monsters = [];
    const r = g.performAction(BRANN, SLOT.ACTION, 'swing')!;
    expect(r.performed).toBe(false);
  });

  it('blocking raises defense only while the hand is busy', () => {
    const g = arena();
    adjacent(g);
    const b = g.champions[BRANN]!;
    expect(b.actionDefense).toBe(0);
    g.performAction(BRANN, SLOT.READY, 'block');
    expect(b.actionDefense).toBeGreaterThan(0);
    for (let i = 0; i < 8; i++) g.tick();
    expect(b.actionDefense).toBe(0);
  });

  it('powerful attacks lower defense while recovering', () => {
    const g = arena();
    adjacent(g);
    g.champions[BRANN]!.skills[5]!.exp = 40000;
    g.performAction(BRANN, SLOT.ACTION, 'thrust');
    expect(g.champions[BRANN]!.actionDefense).toBeLessThan(0);
  });

  it('war cry can make a monster cower (delays its next action)', () => {
    const g = arena();
    const m = adjacent(g);
    const sable = g.champions[SABLE]!;
    sable.skills[7]!.exp = 40000; // parry level for war cry
    let cowered = false;
    for (let i = 0; i < 30 && !cowered; i++) {
      sable.handReadyAt = [0, 0];
      g.performAction(SABLE, SLOT.READY, 'warCry');
      cowered = g.messages.some((t) => t.includes('cowers'));
    }
    expect(cowered).toBe(true);
    expect(m.health).toBeGreaterThan(0);
  });

  it('smashing a closed door open needs enough strength', () => {
    const g = arena(true);
    const b = g.champions[BRANN]!;
    b.slots[SLOT.ACTION] = ITEM_LIBRARY['club']!;
    for (let i = 0; i < 20 && g.map.at(2, 1) === 2; i++) {
      b.handReadyAt = [0, 0];
      b.stamina = b.maxStamina;
      g.performAction(BRANN, SLOT.ACTION, 'bash');
    }
    expect(g.map.at(2, 1)).toBe(3);
  });

  it('wraiths take no damage from melee', () => {
    const g = new Game(GameMap.parse(['#####', '#@x.#', '#####'], { x: 'wraith' }), 2);
    const w = g.monsters[0]!;
    g.timeline.cancel(w.eventId);
    for (let i = 0; i < 10; i++) {
      g.champions[BRANN]!.handReadyAt = [0, 0];
      g.performAction(BRANN, SLOT.ACTION, 'swing');
    }
    expect(w.health).toBe(w.def.health);
  });
});

describe('frozen game', () => {
  it('refuses fighting, casting, throwing and moving while frozen, but allows inventory changes', () => {
    const g = arena();
    adjacent(g);
    g.frozen = true;
    expect(g.performAction(BRANN, SLOT.ACTION, 'swing')).toBeNull();
    expect(g.castSpell(IONE)).toBe('dead');
    g.cursor = ITEM_LIBRARY['dagger']!;
    expect(g.throwCursor(BRANN)).toBe(false);
    g.command('forward');
    const x = g.px;
    for (let i = 0; i < 10; i++) g.tick();
    expect(g.px).toBe(x);
    g.cursor = null;
    expect(g.stowHand(BRANN, SLOT.ACTION)).toBe(true);
    g.frozen = false;
    expect(g.performAction(BRANN, SLOT.READY, 'block')).not.toBeNull();
  });
});
