import { describe, expect, it } from 'vitest';
import { SLOT, SLOT_COUNT } from '../src/sim/champion';
import { Game } from '../src/sim/game';
import { makeItem } from '../src/sim/items';
import { GameMap } from '../src/sim/world';

const BRANN = 0;
const corridor = (tail = '....') =>
  new Game(GameMap.parse(['#########', `#@${tail}#`.padEnd(9, '#'), '#########'], { g: 'gnawer' }), 4);
const run = (g: Game, n: number) => { for (let i = 0; i < n; i++) g.tick(); };

describe('picking up from the world', () => {
  it('puts the item in the first free slot of the active champion', () => {
    const g = corridor();
    g.floor.set(g.map.width + 2, [makeItem('apple')]); // cell ahead (2,1)
    g.floorVersion++;
    expect(g.pickUpFloor(2, 1, 0, BRANN)).toBe(true);
    expect(g.champions[BRANN]!.slots[SLOT.POUCH1]?.id).toBe('apple');
    expect(g.cursor).toBeNull();
    expect(g.floorAt(2, 1)).toEqual([]);
  });

  it('works for items on the party square too, but not farther away', () => {
    const g = corridor();
    g.floor.set(g.map.width + 1, [makeItem('bread')]);
    g.floor.set(g.map.width + 4, [makeItem('cheese')]);
    expect(g.pickUpFloor(4, 1, 0, BRANN)).toBe(false);
    expect(g.pickUpFloor(1, 1, 0, BRANN)).toBe(true);
  });

  it('keeps the item on the pointer when the inventory is full', () => {
    const g = corridor();
    const b = g.champions[BRANN]!;
    for (let s = SLOT.POUCH1; s < SLOT_COUNT; s++) b.slots[s] = makeItem('apple');
    g.floor.set(g.map.width + 2, [makeItem('cheese')]);
    expect(g.pickUpFloor(2, 1, 0, BRANN)).toBe(true);
    expect(g.cursor?.id).toBe('cheese');
    expect(g.floorAt(2, 1)).toEqual([]);
  });

  it('will not pick up while the pointer already holds something', () => {
    const g = corridor();
    g.cursor = makeItem('dagger');
    g.floor.set(g.map.width + 2, [makeItem('cheese')]);
    expect(g.pickUpFloor(2, 1, 0, BRANN)).toBe(false);
    expect(g.floorAt(2, 1).length).toBe(1);
  });
});

describe('throwing', () => {
  it('flies ahead and lands on the floor', () => {
    const g = corridor();
    g.cursor = makeItem('apple');
    expect(g.throwCursor(BRANN)).toBe(true);
    expect(g.cursor).toBeNull();
    expect(g.projectiles.length).toBe(1);
    run(g, 80);
    expect(g.projectiles.length).toBe(0);
    const landed = [...g.floor.values()].flat();
    expect(landed.map((i) => i.id)).toEqual(['apple']);
  });

  it('stops at a wall and drops in front of it', () => {
    const g = new Game(GameMap.parse(['####', '#@.#', '####'], {}), 1);
    g.cursor = makeItem('dagger');
    g.throwCursor(BRANN);
    run(g, 60);
    expect(g.floorAt(2, 1).map((i) => i.id)).toEqual(['dagger']);
  });

  it('costs stamina, takes a moment, and trains the throw skill', () => {
    const g = corridor();
    const b = g.champions[BRANN]!;
    const st = b.stamina;
    const xp = b.skills[10]!.exp;
    g.cursor = makeItem('dagger');
    g.throwCursor(BRANN);
    expect(b.stamina).toBeLessThan(st);
    expect(b.skills[10]!.exp).toBeGreaterThan(xp);
    g.cursor = makeItem('dagger');
    expect(g.throwCursor(BRANN)).toBe(false); // hands busy for a few ticks
  });

  it('can hurt a monster in the way, and the item lands there', () => {
    let hits = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = new Game(GameMap.parse(['########', '#@.g...#', '########'], { g: 'gnawer' }), seed);
      const m = g.monsters[0]!;
      m.def = { ...m.def, moveTicks: 99999, attackTicks: 99999 };
      g.timeline.cancel(m.eventId);
      m.health = 9999;
      g.cursor = makeItem('dagger');
      g.throwCursor(BRANN);
      run(g, 30);
      if (m.health < 9999) hits++;
      expect(g.floorAt(3, 1).map((i) => i.id)).toContain('dagger');
    }
    expect(hits).toBeGreaterThan(10);
  });

  it('a thrown weapon can kill and the killer gets the credit', () => {
    const g = new Game(GameMap.parse(['########', '#@.g...#', '########'], { g: 'gnawer' }), 2);
    const m = g.monsters[0]!;
    m.def = { ...m.def, moveTicks: 99999, attackTicks: 99999 };
    g.timeline.cancel(m.eventId);
    m.health = 1;
    for (let i = 0; i < 20 && g.monsters.length; i++) {
      g.cursor = makeItem('dagger');
      g.champions[BRANN]!.handReadyAt = [0, 0];
      g.throwCursor(BRANN);
      run(g, 30);
    }
    expect(g.monsters.length).toBe(0);
  });

  it('nothing happens with an empty pointer', () => {
    const g = corridor();
    expect(g.throwCursor(BRANN)).toBe(false);
  });
});
