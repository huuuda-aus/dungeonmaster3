import { describe, expect, it } from 'vitest';
import { Champion, CHAMPION_TEMPLATES, NO_SHIELDS, SKILL, STAT } from '../src/sim/champion';
import { Game } from '../src/sim/game';
import { Rng } from '../src/sim/rng';
import { Timeline } from '../src/sim/timeline';
import { GameMap } from '../src/sim/world';

const fighter = () => new Champion(CHAMPION_TEMPLATES[0]!, 0);

describe('timeline', () => {
  it('orders by time, priority, then insertion', () => {
    const t = new Timeline();
    t.add({ time: 5, priority: 1, kind: 'b' });
    t.add({ time: 5, priority: 0, kind: 'a' });
    t.add({ time: 3, priority: 9, kind: 'first' });
    t.add({ time: 5, priority: 1, kind: 'c' });
    const out: string[] = [];
    for (let e = t.popDue(10); e; e = t.popDue(10)) out.push(e.kind);
    expect(out).toEqual(['first', 'a', 'b', 'c']);
  });
  it('cancels events and respects due time', () => {
    const t = new Timeline();
    const id = t.add({ time: 2, priority: 0, kind: 'x' });
    t.add({ time: 9, priority: 0, kind: 'y' });
    expect(t.cancel(id)).toBe(true);
    expect(t.popDue(5)).toBeUndefined();
    expect(t.popDue(9)?.kind).toBe('y');
  });
});

describe('experience and levelling', () => {
  it('skill level doubles at 500, 1000, 2000 experience', () => {
    const c = fighter();
    const lv = (exp: number) => { c.skills[SKILL.FIGHTER]!.exp = exp; return c.skillLevel(SKILL.FIGHTER); };
    expect([lv(0), lv(499), lv(500), lv(1000), lv(2000)]).toEqual([1, 1, 2, 3, 4]);
  });
  it('hidden skill averages with its base skill', () => {
    const c = fighter();
    c.skills[SKILL.FIGHTER]!.exp = 0;
    c.skills[SKILL.SWING]!.exp = 1000;
    expect(c.skillLevel(SKILL.SWING)).toBe(2); // (1000+0)/2 = 500
  });
  it('levelling up raises max health and logs a message', () => {
    const c = fighter();
    c.skills[SKILL.FIGHTER]!.exp = 0;
    const hp = c.maxHealth;
    c.addExperience(SKILL.FIGHTER, 600, 100, -1000, 1, new Rng(1));
    expect(c.skillLevel(SKILL.FIGHTER)).toBeGreaterThan(1);
    expect(c.maxHealth).toBeGreaterThan(hp);
    expect(c.log.some((l) => l.includes('Fighter level'))).toBe(true);
  });
  it('combat skill XP is halved when out of combat', () => {
    const a = fighter(); const b = fighter();
    const start = a.skills[SKILL.SWING]!.exp;
    a.addExperience(SKILL.SWING, 100, 1000, -1000, 1, new Rng(1));
    b.addExperience(SKILL.SWING, 100, 1000, 995, 1, new Rng(1)); // recent attack -> doubled
    expect(a.skills[SKILL.SWING]!.exp - start).toBe(50);
    expect(b.skills[SKILL.SWING]!.exp - start).toBe(200);
  });
});

describe('damage', () => {
  it('normal damage ignores defense', () => {
    const c = fighter();
    const hp = c.health;
    expect(c.takeAttack(10, 0, 'normal', NO_SHIELDS, new Rng(1))).toBe(10);
    expect(c.health).toBe(hp - 10);
  });
  it('shields reduce fire to zero', () => {
    const c = fighter();
    expect(c.takeAttack(5, 0b111111, 'fire', { shield: 0, fire: 500, spell: 0 }, new Rng(1))).toBe(0);
  });
  it('higher anti-magic lowers magic damage', () => {
    const lo = fighter(); const hi = fighter();
    lo.stat(STAT.ANTIMAGIC).cur = 10;
    hi.stat(STAT.ANTIMAGIC).cur = 100;
    const dl = lo.takeAttack(100, 0, 'magic', NO_SHIELDS, new Rng(3));
    const dh = hi.takeAttack(100, 0, 'magic', NO_SHIELDS, new Rng(3));
    expect(dh).toBeLessThan(dl);
  });
  it('dies at zero health', () => {
    const c = fighter();
    c.takeAttack(9999, 0, 'normal', NO_SHIELDS, new Rng(1));
    expect(c.alive).toBe(false);
  });
});

describe('game loop', () => {
  const arena = () => GameMap.parse([
    '#######',
    '#@..g.#',
    '#######',
  ], { g: 'gnawer' });

  it('is deterministic for a seed', () => {
    const run = () => {
      const g = new Game(arena(), 42);
      for (let i = 0; i < 400; i++) {
        g.tick();
        if (g.monsterAhead()) for (let c = 0; c < 4; c++) g.quickAction(c);
      }
      return JSON.stringify([g.time, g.messages, g.champions.map((c) => [c.health, c.skills.map((s) => s.exp)])]);
    };
    expect(run()).toBe(run());
  });

  it('monster approaches, party kills it and gains experience', () => {
    const g = new Game(arena(), 7);
    const before = g.champions[0]!.skills[SKILL.SWING]!.exp;
    for (let i = 0; i < 600 && g.monsters.length; i++) {
      g.tick();
      if (g.monsterAhead()) for (let c = 0; c < 4; c++) g.quickAction(c);
    }
    expect(g.monsters.length).toBe(0);
    expect(g.champions.some((c) => c.skills[SKILL.SWING]!.exp > before)).toBe(true);
  });

  it('party moves and cannot walk into walls or monsters', () => {
    const g = new Game(arena(), 1);
    g.monsters = [];
    g.command('forward');
    for (let i = 0; i < 6; i++) g.tick();
    expect(g.px).toBe(2);
    g.command('back'); for (let i = 0; i < 6; i++) g.tick();
    g.command('back'); for (let i = 0; i < 6; i++) g.tick();
    expect(g.px).toBe(1); // wall behind
  });

  it('an unattended party eventually loses to a warden', () => {
    const m = GameMap.parse(['#####', '#@.w#', '#####'], { w: 'warden' });
    const g = new Game(m, 5);
    for (let i = 0; i < 5000 && !g.over; i++) g.tick();
    expect(g.over).toBe(true);
  });
});
