import { GameMap } from './sim/world';

/** Legend: g gnawer, s shambler, w warden, x wraith (non-material). */
export const LEGEND = { g: 'gnawer', s: 'shambler', w: 'warden', x: 'wraith' };

export function level1(): GameMap {
  const m = GameMap.parse([
    '###################',
    '#@...#.....#......#',
    '#.##.#.###.#.####.#',
    '#.#g.#.#s#...#..#.#',
    '#.#..+.#.#####.g#.#',
    '#.####.#.......##.#',
    '#......####.####..#',
    '######.#..#.#...x.#',
    '#g.....+..#.#.###.#',
    '#.######..#...#w#.#',
    '#........####.#.+.#',
    '###################',
  ], LEGEND, 2);
  m.itemSpawns = [
    { x: 3, y: 1, id: 'apple' }, { x: 1, y: 6, id: 'flask' }, { x: 5, y: 8, id: 'leatherCap' },
    { x: 9, y: 1, id: 'bread' }, { x: 10, y: 5, id: 'leatherPants' }, { x: 6, y: 10, id: 'flask' },
    { x: 15, y: 1, id: 'club' }, { x: 17, y: 6, id: 'cheese' }, { x: 12, y: 9, id: 'waterFlask' },
    { x: 14, y: 3, id: 'dagger' },
  ];
  return m;
}
