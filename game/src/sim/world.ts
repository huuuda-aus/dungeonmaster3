export type Dir = 0 | 1 | 2 | 3; // N, E, S, W
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
export const turnLeft = (d: Dir): Dir => ((d + 3) % 4) as Dir;
export const turnRight = (d: Dir): Dir => ((d + 1) % 4) as Dir;
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;

export const enum Tile { Wall = 0, Floor = 1, DoorClosed = 2, DoorOpen = 3, Stairs = 4 }

export interface MapSpawn { id: string; x: number; y: number; facing: Dir }

export class GameMap {
  readonly width: number;
  readonly height: number;
  readonly tiles: Tile[];
  /** XP multiplier applied to experience gained on this map (0 = none). */
  difficulty: number;
  start: { x: number; y: number; dir: Dir } = { x: 1, y: 1, dir: 1 };
  spawns: MapSpawn[] = [];
  /** Items lying on the floor at the start. */
  itemSpawns: { x: number; y: number; id: string }[] = [];

  /**
   * Parse an ASCII map.
   *  # wall   . floor   + door   > stairs
   *  @ party start (facing east)   a-z monster spawn keyed by `legend`
   */
  static parse(rows: string[], legend: Record<string, string>, difficulty = 1): GameMap {
    const m = new GameMap(rows[0]!.length, rows.length, difficulty);
    rows.forEach((row, y) => {
      for (let x = 0; x < m.width; x++) {
        const c = row[x] ?? '#';
        let t: Tile = Tile.Floor;
        if (c === '#') t = Tile.Wall;
        else if (c === '+') t = Tile.DoorClosed;
        else if (c === '>') t = Tile.Stairs;
        else if (c === '@') m.start = { x, y, dir: 1 };
        else if (legend[c]) m.spawns.push({ id: legend[c]!, x, y, facing: 3 });
        m.tiles[y * m.width + x] = t;
      }
    });
    return m;
  }

  constructor(width: number, height: number, difficulty = 1) {
    this.width = width;
    this.height = height;
    this.difficulty = difficulty;
    this.tiles = new Array<Tile>(width * height).fill(Tile.Wall);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  at(x: number, y: number): Tile {
    return this.inBounds(x, y) ? this.tiles[y * this.width + x]! : Tile.Wall;
  }

  set(x: number, y: number, t: Tile): void {
    if (this.inBounds(x, y)) this.tiles[y * this.width + x] = t;
  }

  /** Can a creature stand/walk here (ignoring other creatures)? */
  walkable(x: number, y: number): boolean {
    const t = this.at(x, y);
    return t === Tile.Floor || t === Tile.DoorOpen || t === Tile.Stairs;
  }

  /** Blocks line of sight. */
  opaque(x: number, y: number): boolean {
    const t = this.at(x, y);
    return t === Tile.Wall || t === Tile.DoorClosed;
  }
}
