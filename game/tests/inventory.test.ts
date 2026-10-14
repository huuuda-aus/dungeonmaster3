import { describe, expect, it } from 'vitest';
import { SLOT, STAT } from '../src/sim/champion';
import { Game } from '../src/sim/game';
import { makeItem, makePotion } from '../src/sim/items';
import { GameMap } from '../src/sim/world';

const BRANN = 0, SABLE = 1, IONE = 2, VEYR = 3;
const room = () => new Game(GameMap.parse(['#####', '#@..#', '#####'], {}), 5);

describe('moving items', () => {
  it('picks up an item onto the pointer and places it in another slot', () => {
    const g = room();
    const pack = SLOT.PACK;
    const bread = g.champions[BRANN]!.slots[pack]!;
    expect(g.clickSlot(BRANN, pack)).toBe(true);
    expect(g.cursor).toBe(bread);
    expect(g.champions[BRANN]!.slots[pack]).toBeNull();
    g.clickSlot(BRANN, pack + 5);
    expect(g.champions[BRANN]!.slots[pack + 5]).toBe(bread);
    expect(g.cursor).toBeNull();
  });

  it('swaps with what is already in the slot', () => {
    const g = room();
    const a = g.champions[BRANN]!.slots[SLOT.PACK]!;
    const b = g.champions[BRANN]!.slots[SLOT.PACK + 1]!;
    g.clickSlot(BRANN, SLOT.PACK);
    g.clickSlot(BRANN, SLOT.PACK + 1);
    expect(g.champions[BRANN]!.slots[SLOT.PACK + 1]).toBe(a);
    expect(g.cursor).toBe(b);
  });

  it('clicking an empty slot with an empty pointer does nothing', () => {
    const g = room();
    expect(g.clickSlot(BRANN, SLOT.PACK + 8)).toBe(false);
  });

  it('wearables only fit their own slot', () => {
    const g = room();
    g.cursor = makeItem('leatherCap');
    expect(g.clickSlot(SABLE, SLOT.FEET)).toBe(false);
    expect(g.cursor?.id).toBe('leatherCap');
    expect(g.clickSlot(SABLE, SLOT.HEAD)).toBe(true);
    expect(g.champions[SABLE]!.slots[SLOT.HEAD]?.id).toBe('leatherCap');
    expect(g.cursor).toBeNull();
  });

  it('hands and containers take anything', () => {
    const g = room();
    g.cursor = makeItem('apple');
    expect(g.clickSlot(IONE, SLOT.READY)).toBe(true);
  });

  it('two-handed weapons need the weapon hand and an empty shield hand', () => {
    const g = room();
    g.cursor = makeItem('greatsword');
    expect(g.clickSlot(BRANN, SLOT.READY)).toBe(false); // wrong hand
    expect(g.clickSlot(BRANN, SLOT.ACTION)).toBe(false); // Brann holds a shield
    g.champions[BRANN]!.slots[SLOT.READY] = null;
    expect(g.clickSlot(BRANN, SLOT.ACTION)).toBe(true);
    expect(g.champions[BRANN]!.twoHanded).toBe(true);
    expect(g.cursor?.id).toBe('shortSword');
  });

  it('clicking the ghost hand of a two-handed weapon lifts the weapon', () => {
    const g = room();
    const b = g.champions[BRANN]!;
    b.slots[SLOT.READY] = null;
    b.slots[SLOT.ACTION] = makeItem('greatsword');
    g.clickSlot(BRANN, SLOT.READY);
    expect(g.cursor?.id).toBe('greatsword');
    expect(b.slots[SLOT.ACTION]).toBeNull();
  });

  it('carried weight changes with the contents', () => {
    const g = room();
    const b = g.champions[BRANN]!;
    const before = b.load;
    b.slots[SLOT.PACK + 3] = makeItem('greatsword');
    expect(b.load).toBe(before + 20);
  });
});

describe('floor', () => {
  it('drops the held item and picks it up again', () => {
    const g = room();
    g.cursor = makeItem('apple');
    const v = g.floorVersion;
    expect(g.dropCursor()).toBe(true);
    expect(g.floorVersion).toBeGreaterThan(v);
    expect(g.floorHere().map((i) => i.id)).toEqual(['apple']);
    expect(g.takeFromFloor(0)).toBe(true);
    expect(g.cursor?.id).toBe('apple');
    expect(g.floorHere()).toEqual([]);
  });

  it('spawns level items and drops belongings of the dead', () => {
    const m = GameMap.parse(['#####', '#@..#', '#####'], {});
    m.itemSpawns = [{ x: 2, y: 1, id: 'bread' }];
    const g = new Game(m, 1);
    expect(g.floor.size).toBe(1);
    g.champions[BRANN]!.health = 0;
    g.tick();
    expect(g.floorHere().length).toBeGreaterThan(3);
    expect(g.champions[BRANN]!.slots.every((s) => s === null)).toBe(true);
  });

  it('monsters leave loot where they die', () => {
    const g = new Game(GameMap.parse(['#####', '#@g.#', '#####'], { g: 'gnawer' }), 3);
    const m = g.monsters[0]!;
    m.def = { ...m.def, drops: [{ id: 'cheese', chance: 1 }] };
    m.health = 0;
    // kill through a hit-free path: call the private helper via a poison-free route
    (g as unknown as { killMonster(m: unknown): void }).killMonster(m);
    expect(g.floor.get(1 * g.map.width + 2)?.map((i) => i.id)).toEqual(['cheese']);
  });
});

describe('eating and drinking', () => {
  it('food refills the food counter and is consumed', () => {
    const g = room();
    const c = g.champions[VEYR]!;
    c.food = 100;
    g.cursor = makeItem('bread');
    expect(g.consumeCursor(VEYR)).toBe(true);
    expect(c.food).toBe(700);
    expect(g.cursor).toBeNull();
  });

  it('water refills and leaves an empty flask', () => {
    const g = room();
    const c = g.champions[VEYR]!;
    c.water = 0;
    g.cursor = makeItem('waterFlask');
    g.consumeCursor(VEYR);
    expect(c.water).toBe(600);
    expect(g.cursor?.id).toBe('flask');
  });

  it('refuses things that are not edible', () => {
    const g = room();
    g.cursor = makeItem('dagger');
    expect(g.consumeCursor(VEYR)).toBe(false);
    expect(g.cursor?.id).toBe('dagger');
  });

  it('potions take effect and leave an empty flask', () => {
    const g = room();
    const c = g.champions[BRANN]!;
    c.health = 10;
    g.cursor = makePotion('health', 100);
    g.consumeCursor(BRANN);
    expect(c.health).toBe(90);
    expect(g.cursor?.id).toBe('flask');
    const str = c.stat(STAT.STRENGTH).cur;
    g.cursor = makePotion('strength', 120);
    g.consumeCursor(BRANN);
    expect(c.stat(STAT.STRENGTH).cur).toBeGreaterThan(str);
  });

  it('a shield potion adds defense that wears off', () => {
    const g = room();
    const c = g.champions[BRANN]!;
    g.cursor = makePotion('shield', 80);
    g.consumeCursor(BRANN);
    expect(c.shieldDefense).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) g.tick();
    expect(c.shieldDefense).toBe(0);
  });
});

describe('brewing potions', () => {
  const master = (g: Game, i: number) => {
    const c = g.champions[i]!;
    for (const s of c.skills) s.exp = 1_000_000;
    c.mana = c.maxMana = 900;
  };

  it('needs an empty flask in hand and keeps the runes otherwise', () => {
    const g = room();
    master(g, IONE);
    [0, 1].forEach((r) => g.addSymbol(IONE, r)); // power 1 + Vi = health potion
    g.champions[IONE]!.symbols = [0, 1];
    expect(g.castSpell(IONE)).toBe('flask');
    expect(g.champions[IONE]!.symbols).toEqual([0, 1]);
  });

  it('fills the flask with a potion, stronger at higher power', () => {
    const g = room();
    master(g, IONE);
    const c = g.champions[IONE]!;
    c.slots[SLOT.READY] = makeItem('flask');
    c.symbols = [3, 1]; // power 4 + health
    expect(g.castSpell(IONE)).toBe('ok');
    const p = c.slots[SLOT.READY]!;
    expect(p.potion?.type).toBe('health');
    expect(p.potion!.power).toBeGreaterThanOrEqual(160);
  });
});

describe('stowing from the main screen', () => {
  it('moves a hand item into the pack', () => {
    const g = room();
    const sword = g.champions[BRANN]!.slots[SLOT.ACTION]!;
    expect(g.stowHand(BRANN, SLOT.ACTION)).toBe(true);
    expect(g.champions[BRANN]!.slots[SLOT.ACTION]).toBeNull();
    expect(g.champions[BRANN]!.slots.includes(sword)).toBe(true);
  });

  it('stows a two-handed weapon from either hand icon', () => {
    const g = room();
    const b = g.champions[BRANN]!;
    b.slots[SLOT.READY] = null;
    b.slots[SLOT.ACTION] = makeItem('greatsword');
    expect(g.stowHand(BRANN, SLOT.READY)).toBe(true);
    expect(b.twoHanded).toBe(false);
  });

  it('keeps the item in hand when the pack is full', () => {
    const g = room();
    const b = g.champions[BRANN]!;
    for (let s = SLOT.POUCH1; s < b.slots.length; s++) b.slots[s] = makeItem('apple');
    expect(g.stowHand(BRANN, SLOT.ACTION)).toBe(false);
    expect(b.slots[SLOT.ACTION]?.id).toBe('shortSword');
  });

  it('stashes the pointer item into another champion', () => {
    const g = room();
    g.cursor = makeItem('dagger');
    expect(g.stashCursor(SABLE)).toBe(true);
    expect(g.cursor).toBeNull();
    expect(g.champions[SABLE]!.slots.some((i) => i?.id === 'dagger')).toBe(true);
  });
});
