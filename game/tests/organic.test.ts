import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { level1 } from '../src/levels';
import { buildTunnelGeometry } from '../src/render/organic';
import { heightData } from '../src/render/textures';
import { DX, DY, Tile } from '../src/sim/world';

describe('organic tunnels', () => {
  const map = level1();
  const t0 = performance.now();
  const geo = buildTunnelGeometry(map);
  const ms = performance.now() - t0;
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()); // front faces only
  mesh.updateMatrixWorld();

  it('builds quickly into a reasonably sized mesh', () => {
    const verts = geo.getAttribute('position').count;
    expect(verts).toBeGreaterThan(10_000);
    expect(verts).toBeLessThan(400_000);
    expect(ms).toBeLessThan(5000);
  });

  it('has no NaNs and stays inside the map', () => {
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
    }
    geo.computeBoundingBox();
    const b = geo.boundingBox!;
    expect(b.min.x).toBeGreaterThan(-1.3);
    expect(b.max.x).toBeLessThan(map.width + 0.3);
    expect(b.min.y).toBeGreaterThan(-0.4);
    expect(b.max.y).toBeLessThan(1.4);
  });

  it('faces inward: from every open cell centre, rays hit front faces at about the cell edges', () => {
    const ray = new THREE.Raycaster();
    let checked = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!map.walkable(x, y)) continue;
        const o = new THREE.Vector3(x, 0.5, y);
        // up and down
        for (const [dy, want] of [[1, 0.5], [-1, 0.5]] as const) {
          ray.set(o, new THREE.Vector3(0, dy, 0));
          const hit = ray.intersectObject(mesh)[0];
          expect(hit, `vertical ${x},${y}`).toBeDefined();
          expect(hit!.distance).toBeGreaterThan(want - 0.3);
          expect(hit!.distance).toBeLessThan(want + 0.3);
        }
        // towards neighbouring walls
        for (let d = 0; d < 4; d++) {
          if (map.at(x + DX[d as 0], y + DY[d as 0]) !== Tile.Wall) continue;
          ray.set(o, new THREE.Vector3(DX[d as 0], 0, DY[d as 0]));
          const hit = ray.intersectObject(mesh)[0];
          expect(hit, `wall ${x},${y} dir ${d}`).toBeDefined();
          // walls sit about half a cell plus the widening away, give or take the lumps
          expect(hit!.distance).toBeGreaterThan(0.45);
          expect(hit!.distance).toBeLessThan(1.05);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('is not made of straight, flat walls: wall distances vary along a corridor', () => {
    const ray = new THREE.Raycaster();
    const dists = new Set<number>();
    for (let z = 0.2; z < 1.8; z += 0.1) {
      // corridor along x at row y=1 is walled to the north (z=0 side)
      ray.set(new THREE.Vector3(1 + (z - 0.2) * 2, 0.5, 1), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(mesh)[0];
      if (hit) dists.add(Math.round(hit.distance * 100));
    }
    expect(dists.size).toBeGreaterThan(5);
  });

  it('corridors are wider than one cell', () => {
    const ray = new THREE.Raycaster();
    // corridor along x at row y=1: walls to the north and south at about +/- (0.5 + widen)
    let total = 0, n = 0;
    for (let x = 1.2; x < 4.6; x += 0.2) {
      for (const dz of [-1, 1]) {
        ray.set(new THREE.Vector3(x, 0.5, 1), new THREE.Vector3(0, 0, dz));
        const hit = ray.intersectObject(mesh)[0];
        if (hit) { total += hit.distance; n++; }
      }
    }
    expect(n).toBeGreaterThan(10);
    expect(total / n).toBeGreaterThan(0.62); // the old straight walls were at 0.5
  });
});

describe('doorways', () => {
  const map = level1();
  const geo = buildTunnelGeometry(map);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld();
  const doors: { x: number; y: number }[] = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (map.at(x, y) === Tile.DoorClosed) doors.push({ x, y });

  it('the level has doors to test', () => {
    expect(doors.length).toBeGreaterThan(1);
  });

  it('are carved even while closed, so walking through never means walking through rock', () => {
    const ray = new THREE.Raycaster();
    for (const d of doors) {
      for (const dy of [1, -1]) {
        ray.set(new THREE.Vector3(d.x, 0.5, d.y), new THREE.Vector3(0, dy, 0));
        const hit = ray.intersectObject(mesh)[0];
        expect(hit, `door ${d.x},${d.y}`).toBeDefined();
        expect(hit!.distance).toBeGreaterThan(0.25);
        expect(hit!.distance).toBeLessThan(0.85);
      }
      // along the passage the line of sight continues past the door cell
      for (let dir = 0; dir < 4; dir++) {
        const nx = d.x + DX[dir as 0], ny = d.y + DY[dir as 0];
        if (map.at(nx, ny) === Tile.Wall) continue;
        ray.set(new THREE.Vector3(d.x, 0.5, d.y), new THREE.Vector3(DX[dir as 0], 0, DY[dir as 0]));
        const hit = ray.intersectObject(mesh)[0];
        expect(!hit || hit.distance > 1.2, `door ${d.x},${d.y} dir ${dir}`).toBe(true);
      }
    }
  });
});

describe('granite height map', () => {
  const size = 256;
  const h = heightData('granite', size);
  it('has real relief: dark cracks and pits, a mid-grey body, and some high ground', () => {
    let min = 255, max = 0, sum = 0, dark = 0;
    for (const v of h) { min = Math.min(min, v); max = Math.max(max, v); sum += v; if (v < 70) dark++; }
    const mean = sum / h.length;
    expect(mean).toBeGreaterThan(110);
    expect(mean).toBeLessThan(180);
    expect(min).toBeLessThan(60);
    expect(max).toBeGreaterThan(190);
    expect(dark / h.length).toBeGreaterThan(0.01); // cracks and pits exist...
    expect(dark / h.length).toBeLessThan(0.3); // ...but do not dominate
  });
  it('tiles without seams: wrapped neighbours are about as alike as ordinary neighbours', () => {
    let inner = 0, wrapped = 0;
    for (let i = 0; i < size; i++) {
      inner += Math.abs(h[i * size + 100]! - h[i * size + 101]!);
      wrapped += Math.abs(h[i * size + size - 1]! - h[i * size]!);
      inner += Math.abs(h[100 * size + i]! - h[101 * size + i]!);
      wrapped += Math.abs(h[(size - 1) * size + i]! - h[i]!);
    }
    expect(wrapped).toBeLessThan(inner * 1.6 + 200);
  });
  it('is deterministic', () => {
    expect(Array.from(heightData('granite', 64))).toEqual(Array.from(heightData('granite', 64)));
  });
});
