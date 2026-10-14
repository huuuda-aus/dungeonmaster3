import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { MONSTER_DEFS } from '../src/sim/monsters';
import { Rng } from '../src/sim/rng';
import { GameMap } from '../src/sim/world';

/** Average damage one hit from `defId` does to each fresh starting champion. */
function averageHits(defId: string): { name: string; hits: number }[] {
  const g = new Game(GameMap.parse(['#####', '#@..#', '#####'], {}), 1);
  const def = MONSTER_DEFS[defId]!;
  const rng = new Rng(9);
  return g.champions.map((c) => {
    let total = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const hp = c.health;
      const raw = def.attack + rng.int((def.attack >> 1) + 1);
      total += c.takeAttack(raw, def.wounds, def.attackType, g.shields, rng);
      c.health = hp;
      c.wounds = 0;
    }
    return { name: c.name, hits: c.maxHealth / (total / n) };
  });
}

describe('monster strength', () => {
  it('no monster fells any starting champion in fewer than 3 hits', () => {
    for (const id of Object.keys(MONSTER_DEFS)) {
      for (const r of averageHits(id)) {
        expect(r.hits, `${id} vs ${r.name}`).toBeGreaterThan(2.7);
      }
    }
  });
  it('tougher monsters hit harder than the weakest one', () => {
    const mean = (id: string) => averageHits(id).reduce((a, r) => a + r.hits, 0) / 4;
    expect(mean('gnawer')).toBeGreaterThan(mean('shambler'));
    expect(mean('shambler')).toBeGreaterThan(mean('warden'));
    expect(mean('gnawer')).toBeGreaterThan(5);
  });
});
