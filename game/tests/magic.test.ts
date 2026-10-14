import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import {
  RUNE_NAMES, SPELLS, findSpell, requiredLevel, runeCost, spellEnergy,
} from '../src/sim/magic';
import { GameMap } from '../src/sim/world';

const corridor = (monster = 'g') =>
  new Game(GameMap.parse(['#########', `#@..${monster}....#`, '#########'], { g: 'gnawer', s: 'shambler', x: 'wraith' }), 3);
const run = (g: Game, ticks: number) => { for (let i = 0; i < ticks; i++) g.tick(); };
const VEYR = 3;
const IONE = 2;
/** Max out skills and mana so tests exercise effects, not luck. */
const master = (g: Game, idx: number) => {
  const c = g.champions[idx]!;
  for (const sk of c.skills) sk.exp = 1_000_000;
  c.mana = c.maxMana = 900;
};
/** Enter runes [power, ...rest] given as 1-based numbers, as a player would. */
const enter = (g: Game, idx: number, runes: number[]) => {
  for (const r of runes) expect(g.addSymbol(idx, r - 1)).toBe(true);
};
const freeze = (g: Game) => {
  for (const m of g.monsters) m.def = { ...m.def, moveTicks: 9999, attackTicks: 9999 };
};

describe('rune system', () => {
  it('has 4 steps of 6 runes', () => {
    expect(RUNE_NAMES.length).toBe(4);
    expect(RUNE_NAMES.every((r) => r.length === 6)).toBe(true);
  });
  it('light (magic torch) is power + rune 4; fireball is power + 4 + 4', () => {
    expect(findSpell([0, 3])?.spell.id).toBe('torch');
    expect(findSpell([0, 3, 3])?.spell.id).toBe('fireball');
  });
  it('needs the power rune plus at least one more, and exact matches only', () => {
    expect(findSpell([0])).toBeNull();
    expect(findSpell([0, 3, 3, 3])).toBeNull();
    expect(findSpell([5, 5])?.spell.id).toBe('openDoor');
  });
  it('spell table has 25 unique rune sequences', () => {
    expect(SPELLS.length).toBe(25);
    expect(new Set(SPELLS.map((s) => s.runes.join(','))).size).toBe(25);
  });
  it('rune costs scale with the power rune', () => {
    expect(runeCost(0, 2, -1)).toBe(3); // power rune 3 costs 3
    expect(runeCost(1, 3, 0)).toBe(5); // element 4 at power 1
    expect(runeCost(1, 3, 5)).toBe(17); // 5 * 28 / 8 = 17
  });
  it('required skill is base + power', () => {
    const fb = SPELLS.find((s) => s.id === 'fireball')!;
    expect(requiredLevel(fb, 1)).toBe(4);
    expect(requiredLevel(fb, 6)).toBe(9);
  });
  it('projectile energy grows with power and skill, clamped', () => {
    expect(spellEnergy(1, 4)).toBe(36);
    expect(spellEnergy(6, 20)).toBe(255);
    expect(spellEnergy(1, 0)).toBe(21); // floor of 21
  });
});

describe('entering runes', () => {
  it('charges mana per rune and advances the step', () => {
    const g = corridor();
    const v = g.champions[VEYR]!;
    const mana = v.mana;
    expect(g.symbolStep(VEYR)).toBe(0);
    g.addSymbol(VEYR, 0);
    expect(g.symbolStep(VEYR)).toBe(1);
    g.addSymbol(VEYR, 3);
    expect(v.mana).toBe(mana - runeCost(0, 0, -1) - runeCost(1, 3, 0));
    g.recantSymbol(VEYR);
    expect(g.symbolStep(VEYR)).toBe(1); // mana not refunded
  });
  it('refuses runes you cannot afford and a 5th rune', () => {
    const g = corridor();
    g.champions[VEYR]!.mana = 1;
    expect(g.addSymbol(VEYR, 5)).toBe(false);
    master(g, VEYR);
    enter(g, VEYR, [1, 4, 4, 1]);
    expect(g.addSymbol(VEYR, 0)).toBe(false);
  });
});

describe('casting', () => {
  it('fireball flies down the corridor and kills a gnawer', () => {
    const g = corridor();
    freeze(g);
    master(g, VEYR);
    enter(g, VEYR, [2, 4, 4]);
    expect(g.castSpell(VEYR)).toBe('ok');
    expect(g.projectiles.length).toBe(1);
    run(g, 30);
    expect(g.monsters.length).toBe(0);
    expect(g.projectiles.length).toBe(0);
    expect(g.champions[VEYR]!.symbols.length).toBe(0);
  });

  it('projectiles stop at walls', () => {
    const g = corridor();
    g.monsters = [];
    master(g, VEYR);
    enter(g, VEYR, [1, 4, 4]);
    g.castSpell(VEYR);
    run(g, 80);
    expect(g.projectiles.length).toBe(0);
  });

  it('meaningless runes clear the caster and cast nothing', () => {
    const g = corridor();
    master(g, VEYR);
    enter(g, VEYR, [1, 2, 2, 2]);
    expect(g.castSpell(VEYR)).toBe('meaningless');
    expect(g.champions[VEYR]!.symbols.length).toBe(0);
    expect(g.projectiles.length).toBe(0);
  });

  it('can be chain-cast with no cooldown, limited only by mana', () => {
    const g = corridor();
    master(g, VEYR);
    g.champions[VEYR]!.mana = 40;
    let casts = 0;
    for (let i = 0; i < 20; i++) {
      const ok = g.addSymbol(VEYR, 0) && g.addSymbol(VEYR, 3); // power 1 + rune 4 = magic torch, 6 mana
      if (!ok || g.castSpell(VEYR) !== 'ok') break;
      casts++;
    }
    expect(casts).toBe(6); // 40 mana / 6 per cast, all in the same tick
  });


  it('too-low skill fails with more practice needed (wisdom 0 => every check fails)', () => {
    const g = corridor();
    const v = g.champions[VEYR]!;
    for (const sk of v.skills) sk.exp = 0;
    v.stat(3).cur = -200; // threshold below any roll
    enter(g, VEYR, [6, 4, 4]); // fireball power 6 needs skill 9
    const xpBefore = v.skills[16]!.exp;
    expect(g.castSpell(VEYR)).toBe('practice');
    expect(g.projectiles.length).toBe(0);
    expect(v.skills[16]!.exp).toBeGreaterThan(xpBefore);
  });

  it('successful casts train the spell skill', () => {
    const g = corridor();
    master(g, VEYR);
    const v = g.champions[VEYR]!;
    v.skills[16]!.exp = 1000;
    enter(g, VEYR, [1, 4]);
    g.castSpell(VEYR);
    expect(v.skills[16]!.exp).toBeGreaterThan(1000);
  });

  it('potions need a flask and keep the runes', () => {
    const g = corridor();
    master(g, IONE);
    enter(g, IONE, [1, 2]); // health potion
    expect(g.castSpell(IONE)).toBe('flask');
    expect(g.champions[IONE]!.symbols.length).toBe(2);
  });
});

describe('spell effects', () => {
  it('party shield adds defense that expires', () => {
    const g = corridor();
    g.monsters = [];
    master(g, IONE);
    enter(g, IONE, [1, 1, 4]);
    expect(g.castSpell(IONE)).toBe('ok');
    expect(g.shields.shield).toBeGreaterThan(0);
    run(g, 400);
    expect(g.shields.shield).toBe(0);
  });

  it('fire shield lasts longer and then expires', () => {
    const g = corridor();
    g.monsters = [];
    master(g, IONE);
    enter(g, IONE, [1, 4, 5, 4]);
    expect(g.castSpell(IONE)).toBe('ok');
    expect(g.shields.fire).toBeGreaterThan(0);
    run(g, 800);
    expect(g.shields.fire).toBe(0);
  });

  it('magic torch brightens then expires; darkness dims', () => {
    const g = corridor();
    g.monsters = [];
    master(g, VEYR);
    enter(g, VEYR, [1, 4]);
    g.castSpell(VEYR);
    expect(g.lightBoost).toBeGreaterThan(1);
    run(g, 3500);
    expect(g.lightBoost).toBe(1);
    g.champions[VEYR]!.actionReadyAt = 0;
    enter(g, VEYR, [3, 5, 4, 6]);
    expect(g.castSpell(VEYR)).toBe('ok');
    expect(g.lightBoost).toBeLessThan(1);
  });

  it('thieves eye, invisibility and footprints toggle and expire', () => {
    const g = corridor();
    g.monsters = [];
    master(g, VEYR);
    enter(g, VEYR, [1, 3, 2, 5]);
    g.castSpell(VEYR);
    expect(g.seeThrough).toBe(1);
    g.champions[VEYR]!.actionReadyAt = 0;
    enter(g, VEYR, [1, 3, 2, 6]);
    g.castSpell(VEYR);
    expect(g.invisible).toBe(1);
    g.champions[VEYR]!.actionReadyAt = 0;
    enter(g, VEYR, [1, 1, 5, 2]);
    g.castSpell(VEYR);
    expect(g.footprints).toBe(1);
    run(g, 2000);
    expect([g.seeThrough, g.invisible, g.footprints]).toEqual([0, 0, 0]);
  });

  it('an invisible party is ignored by distant monsters', () => {
    const g = corridor();
    const m = g.monsters[0]!;
    g.invisible = 1;
    const x = m.x;
    run(g, 100);
    expect(m.x).toBe(x);
  });

  it('open door opens a closed door in the corridor', () => {
    const g = new Game(GameMap.parse(['#######', '#@.+..#', '#######'], {}), 1);
    master(g, VEYR);
    enter(g, VEYR, [1, 6]);
    expect(g.castSpell(VEYR)).toBe('ok');
    run(g, 20);
    expect(g.map.at(3, 1)).toBe(3); // DoorOpen
  });

  it('poison bolt poisons for damage over time and can kill', () => {
    const g = corridor('s');
    const m = g.monsters[0]!;
    m.def = { ...m.def, moveTicks: 9999, attackTicks: 9999, resist: {} };
    m.health = 6;
    master(g, VEYR);
    enter(g, VEYR, [4, 5, 1]);
    g.castSpell(VEYR);
    run(g, 250);
    expect(g.monsters.length).toBe(0);
  });

  it('poison cloud lingers and damages over time', () => {
    const g = corridor('s');
    const m = g.monsters[0]!;
    m.def = { ...m.def, moveTicks: 9999, attackTicks: 9999, resist: {} };
    m.health = 9999;
    master(g, VEYR);
    enter(g, VEYR, [4, 3, 1]);
    g.castSpell(VEYR);
    run(g, 12);
    const early = 9999 - m.health;
    run(g, 80);
    expect(9999 - m.health).toBeGreaterThan(early);
  });

  it('wraiths are immune to fireballs and melee but dispel hurts them', () => {
    const g = corridor('x');
    const w = g.monsters[0]!;
    w.def = { ...w.def, moveTicks: 9999, attackTicks: 9999 };
    master(g, VEYR);
    enter(g, VEYR, [3, 4, 4]);
    g.castSpell(VEYR);
    run(g, 30);
    expect(w.health).toBe(w.def.health);
    g.champions[VEYR]!.actionReadyAt = 0;
    enter(g, VEYR, [4, 5, 2]);
    g.castSpell(VEYR);
    run(g, 30);
    expect(w.health).toBeLessThan(w.def.health);
  });

  it('fire and lightning both damage even resistant monsters', () => {
    const dmgFor = (spell: number[], defId: string) => {
      const g = new Game(GameMap.parse(['#####', '#@.m#', '#####'], { m: defId }), 1);
      const m = g.monsters[0]!;
      m.def = { ...m.def, moveTicks: 9999, attackTicks: 9999 };
      m.health = 99999;
      master(g, VEYR);
      enter(g, VEYR, spell);
      g.castSpell(VEYR);
      run(g, 12);
      return 99999 - m.health;
    };
    // Average over seeds is overkill; compare a power high enough to dominate rolls.
    const fire = (d: string) => dmgFor([6, 4, 4], d);
    const bolt = (d: string) => dmgFor([6, 3, 3, 5], d);
    expect(fire('shambler')).toBeGreaterThan(0);
    expect(bolt('warden')).toBeGreaterThan(0);
  });
});

describe('hitting moving monsters', () => {
  it('a fireball always connects with a monster walking toward the party', () => {
    for (let dist = 2; dist <= 7; dist++) {
      for (const moveTicks of [1, 2, 3, 5]) {
        for (let wait = 0; wait < 4; wait++) {
          const map = GameMap.parse(['##########', '#@........#', '##########'], { g: 'warden' });
          const g = new Game(map, 3);
          const m = g.spawn('warden', 1 + dist, 1, 3);
          m.def = { ...m.def, moveTicks, attackTicks: 99999, health: 9999 };
          m.health = 9999;
          master(g, VEYR);
          run(g, wait);
          enter(g, VEYR, [1, 4, 4]);
          g.castSpell(VEYR);
          run(g, 60);
          expect(m.health, `dist ${dist} speed ${moveTicks} wait ${wait}`).toBeLessThan(9999);
        }
      }
    }
  });

  it('a thrown item also connects with an approaching monster (or lands near it)', () => {
    const map = GameMap.parse(['##########', '#@........#', '##########'], {});
    const g = new Game(map, 3);
    const m = g.spawn('gnawer', 6, 1, 3);
    m.def = { ...m.def, moveTicks: 2, attackTicks: 99999, health: 9999 };
    m.health = 9999;
    g.cursor = (g.champions[0]!.slots[1])!;
    g.champions[0]!.slots[1] = null;
    g.throwCursor(0);
    run(g, 60);
    expect(g.projectiles.length).toBe(0);
  });
});
