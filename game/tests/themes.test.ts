import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { level1 } from '../src/levels';
import { buildBoxGeometry, buildTunnelGeometry } from '../src/render/organic';
import { albedoData, DOOR_PLANKS, heightData, woodData, type SurfaceKind } from '../src/render/textures';
import { DEFAULT_THEME, getTheme, THEMES } from '../src/render/themes';
import { DX, DY, Tile } from '../src/sim/world';

const KINDS: SurfaceKind[] = ['granite', 'blocks', 'earth', 'slate'];

describe('themes', () => {
  it('have unique ids, a default, and a safe fallback', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(THEMES.length).toBeGreaterThanOrEqual(4);
    expect(getTheme(DEFAULT_THEME).id).toBe(DEFAULT_THEME);
    expect(getTheme('does-not-exist').id).toBe(THEMES[0]!.id);
  });
  it('every theme uses a known surface', () => {
    for (const t of THEMES) expect(KINDS).toContain(t.surface.surface);
  });
});

describe('surface textures', () => {
  const means = new Map<SurfaceKind, number[]>();
  for (const kind of KINDS) {
    it(`${kind}: colours are valid, dark enough for a dungeon, and the height map has relief`, () => {
      const rgba = albedoData(kind, 128);
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        r += rgba[i]!; g += rgba[i + 1]!; b += rgba[i + 2]!;
        expect(rgba[i + 3]).toBe(255);
      }
      const n = rgba.length / 4;
      means.set(kind, [r / n, g / n, b / n]);
      expect((r + g + b) / (3 * n)).toBeGreaterThan(30);
      expect((r + g + b) / (3 * n)).toBeLessThan(150);

      const h = heightData(kind, 128);
      let min = 255, max = 0;
      for (const v of h) { min = Math.min(min, v); max = Math.max(max, v); }
      expect(max - min).toBeGreaterThan(100);
    });
  }
  it('look different from each other and the cool themes stay blue-leaning', () => {
    const m = (k: SurfaceKind) => means.get(k)!;
    const key = (k: SurfaceKind) => m(k).map((v) => Math.round(v / 6)).join(',');
    expect(new Set(KINDS.map(key)).size).toBe(KINDS.length);
    expect(m('granite')[2]!).toBeGreaterThan(m('granite')[0]!);
    expect(m('slate')[2]!).toBeGreaterThan(m('slate')[0]!);
    expect(m('earth')[0]!).toBeGreaterThan(m('earth')[2]!); // earth is warm
  });
  it('blocks have mortar grooves: the height map dips on a regular grid', () => {
    const size = 128;
    const h = heightData('blocks', size);
    const rowH = size / 4;
    // along a vertical line in a block interior vs on a mortar line
    const mortarRow = Math.round(rowH) * 1 + 1; // just inside the mortar of row boundary
    const interiorRow = Math.round(rowH * 1.5);
    let mortar = 0, interior = 0;
    for (let x = 0; x < size; x++) { mortar += h[mortarRow * size + x]!; interior += h[interiorRow * size + x]!; }
    expect(mortar / size).toBeLessThan((interior / size) - 25);
  });
});

describe('tunnel shapes by theme', () => {
  const map = level1();
  const wallDistances = (themeId: string): number[] => {
    const geo = buildTunnelGeometry(map, getTheme(themeId).tunnel);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    const out: number[] = [];
    for (let x = 1.4; x < 4.0; x += 0.15) {
      ray.set(new THREE.Vector3(x, 0.5, 1), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(mesh)[0];
      if (hit) out.push(hit.distance);
    }
    return out;
  };
  const spread = (a: number[]): number => Math.max(...a) - Math.min(...a);

  it('stone blocks are straight and flat at the original width; the cave is lumpy and wide', () => {
    const blocks = wallDistances('blocks');
    const cave = wallDistances('cave');
    expect(blocks.length).toBeGreaterThan(10);
    expect(spread(blocks)).toBeLessThan(0.08);
    expect(blocks.every((d) => d > 0.4 && d < 0.6)).toBe(true);
    expect(spread(cave)).toBeGreaterThan(spread(blocks) * 3);
    expect(cave.reduce((a, b) => a + b, 0) / cave.length).toBeGreaterThan(0.65);
  });
});

describe('door texture', () => {
  const size = 512;
  const { rgba, height } = woodData(size);
  const px = (x: number, y: number) => [rgba[(y * size + x) * 4]!, rgba[(y * size + x) * 4 + 1]!, rgba[(y * size + x) * 4 + 2]!];
  const lum = (c: number[]) => (c[0]! + c[1]! + c[2]!) / 3;

  it('is wood-coloured (warm) with dark gaps between the planks', () => {
    // mid-plank pixel in a gap-free row: warmer than blue
    const mid = px(Math.round(size / DOOR_PLANKS / 2), 250);
    expect(mid[0]!).toBeGreaterThan(mid[2]!);
    const plankW = size / DOOR_PLANKS;
    // average brightness along the plank boundaries vs plank middles, away from the straps
    let gap = 0, body = 0, n = 0;
    for (let y = 120; y < 360; y++) {
      for (let p = 1; p < DOOR_PLANKS; p++) {
        gap += lum(px(Math.round(p * plankW), y));
        body += lum(px(Math.round(p * plankW + plankW / 2), y));
        n++;
      }
    }
    expect(gap / n).toBeLessThan((body / n) * 0.6);
  });

  it('has two iron straps: cool grey bands across the full width', () => {
    const strapRow = Math.round(size * 0.14 + 4);
    const woodRow = Math.round(size * 0.5);
    const cool = (y: number) => {
      let c = 0;
      for (let x = 0; x < size; x += 8) { const p = px(x, y); if (p[2]! >= p[0]!) c++; }
      return c / (size / 8);
    };
    expect(cool(strapRow)).toBeGreaterThan(0.8);
    expect(cool(woodRow)).toBeLessThan(0.2);
    expect(cool(Math.round(size * 0.78 + 4))).toBeGreaterThan(0.8);
  });

  it('has height relief', () => {
    let min = 255, max = 0;
    for (const v of height) { min = Math.min(min, v); max = Math.max(max, v); }
    expect(max - min).toBeGreaterThan(150);
  });
});

describe('boxy (stone block) geometry', () => {
  const map = level1();
  const geo = buildBoxGeometry(map);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()); // front faces only
  mesh.updateMatrixWorld();

  it('is exactly square: axis-aligned normals and every corner on the cell grid', () => {
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
      expect(n.reduce((a, b) => a + b, 0)).toBe(1);
      expect(n.filter((v) => v === 1).length).toBe(1);
      expect(Math.abs(pos.getX(i) * 2 - Math.round(pos.getX(i) * 2))).toBeLessThan(1e-6);
      expect(Math.abs(pos.getZ(i) * 2 - Math.round(pos.getZ(i) * 2))).toBeLessThan(1e-6);
      expect([0, 1]).toContain(pos.getY(i));
    }
  });

  it('faces inward: from every open cell centre, walls, floor and ceiling are exactly 0.5 away', () => {
    const ray = new THREE.Raycaster();
    let walls = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!map.walkable(x, y) && map.at(x, y) !== Tile.DoorClosed) continue;
        for (const dy of [1, -1]) {
          ray.set(new THREE.Vector3(x, 0.5, y), new THREE.Vector3(0, dy, 0));
          expect(ray.intersectObject(mesh)[0]?.distance).toBeCloseTo(0.5, 5);
        }
        for (let d = 0; d < 4; d++) {
          const open = map.walkable(x + DX[d as 0], y + DY[d as 0]) || map.at(x + DX[d as 0], y + DY[d as 0]) === Tile.DoorClosed;
          ray.set(new THREE.Vector3(x, 0.5, y), new THREE.Vector3(DX[d as 0], 0, DY[d as 0]));
          const hit = ray.intersectObject(mesh)[0];
          if (!open) { expect(hit?.distance, `${x},${y} dir ${d}`).toBeCloseTo(0.5, 5); walls++; }
          else expect(!hit || hit.distance > 0.9).toBe(true);
        }
      }
    }
    expect(walls).toBeGreaterThan(50);
  });

  it('the block theme uses it, and has varied block colours', () => {
    expect(getTheme('blocks').boxy).toBe(true);
    expect(getTheme('granite').boxy).toBeFalsy();
    const rgba = albedoData('blocks', 256);
    // sample each block's centre: the shades should differ clearly
    const tones = new Set<number>();
    for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
      const x = Math.round(col * 128 + 64 + (row % 2 ? 64 : 0)) % 256, y = row * 64 + 32;
      tones.add(Math.round(rgba[(y * 256 + x) * 4]! / 8));
    }
    expect(tones.size).toBeGreaterThanOrEqual(4);
  });
});
