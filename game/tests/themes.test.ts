import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { level1 } from '../src/levels';
import { buildTunnelGeometry } from '../src/render/organic';
import { albedoData, heightData, type SurfaceKind } from '../src/render/textures';
import { DEFAULT_THEME, getTheme, THEMES } from '../src/render/themes';

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
