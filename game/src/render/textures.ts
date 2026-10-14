import * as THREE from 'three';
import { hash3, sstep, tileNoise, worley } from './noise';

/** Surface materials a theme can use. */
export type SurfaceKind = 'granite' | 'blocks' | 'earth' | 'slate';

const SEED = 5;

/** Pure pixel generators (RGBA bytes and a height byte per pixel) so they can be tested without a canvas. */
export function albedoData(kind: SurfaceKind, size = 256): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const t = (x: number, y: number, p: number, s: number): number => tileNoise(x, y, size, p, s, SEED);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      const mottle = 0.5 * t(x, y, 6, 1) + 0.3 * t(x, y, 14, 2) + 0.2 * t(x, y, 40, 3);
      const fine = hash3(x, y, 11, SEED);
      if (kind === 'granite') {
        const grain = t(x, y, 110, 7), grain2 = t(x, y, 90, 8), navy = t(x, y, 9, 5);
        r = 64 + (mottle - 0.5) * 42 + (fine - 0.5) * 14;
        g = r + 3; b = r + 12;
        r -= navy * 8; g -= navy * 2; b += navy * 22;
        if (grain > 0.76) { r = 18 + fine * 12; g = r + 2; b = r + 8; }
        else if (grain < 0.2) { r = 128 + fine * 36; g = r + 6; b = r + 20; }
        else if (grain2 > 0.72) { r -= 10; g -= 4; b += 18; }
      } else if (kind === 'blocks') {
        // Running-bond blocks, 4 rows of 2 per tile (one tile per cell), with thin dark mortar.
        const rows = 4, cols = 2;
        const rowH = size / rows, blockW = size / cols;
        const row = Math.floor(y / rowH);
        const offset = row % 2 ? blockW / 2 : 0;
        const bx = (x + offset) % blockW, by = y % rowH;
        const col = Math.floor((x + offset) / blockW) % cols;
        const tone = 0.76 + 0.46 * hash3(row, col, 3, SEED); // each block its own shade
        const hue = hash3(row, col, 5, SEED) - 0.5; // and a slightly warmer or cooler cast
        const mortar = bx < 4 || by < 4;
        const speckle = (fine - 0.5) * 34 + (hash3(x >> 1, y >> 1, 12, SEED) - 0.5) * 14; // like the original's grain
        // darker toward each block's edges, as if weathered and chipped
        const edgeShade = mortar ? 1 : 0.84 + 0.16 * sstep(3, 18, Math.min(bx, blockW - bx, by - 0, rowH - by));
        const base = mortar ? 44 + (fine - 0.5) * 10 : (92 * tone + (mottle - 0.5) * 22 + speckle) * edgeShade;
        r = mortar ? base : base + hue * 9; g = mortar ? base - 1 : base - 4 + hue * 2; b = mortar ? base + 3 : base + 4 - hue * 9;
      } else if (kind === 'earth') {
        const pw = worley((x / size) * 10, (y / size) * 10, 10, 40, SEED);
        const pebble = pw.id > 0.55 ? 0.3 * (1 - sstep(0.0, 0.3, pw.f1)) : 0;
        const v = 0.45 * t(x, y, 4, 1) + 0.3 * t(x, y, 8, 2) + 0.18 * t(x, y, 16, 3) + 0.07 * t(x, y, 64, 4);
        const shade = 0.5 + v * 0.7 + pebble;
        r = 108 * shade; g = 84 * shade; b = 62 * shade;
      } else {
        // slate: cold, dark, wet-looking, with pale mineral veins
        const vein = Math.abs(t(x, y, 7, 6) - 0.5) < 0.01 && t(x, y, 4, 14) > 0.58 ? 1 : 0;
        const layers = 0.5 + 0.5 * Math.sin((y / size) * Math.PI * 14 + t(x, y, 5, 2) * 6);
        r = 44 + (mottle - 0.5) * 26 + layers * 10 + (fine - 0.5) * 10;
        g = r + 4; b = r + 14;
        if (vein) { r += 38; g += 42; b += 50; }
      }
      const o = (y * size + x) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
    }
  }
  return out;
}

/** Height maps: 1 = high, 0 = deep. */
export function heightData(kind: SurfaceKind, size = 256): Uint8Array {
  const out = new Uint8Array(size * size);
  const t = (x: number, y: number, p: number, s: number): number => tileNoise(x, y, size, p, s, SEED);
  const w = (x: number, y: number, p: number, s: number): ReturnType<typeof worley> => worley((x / size) * p, (y / size) * p, p, s, SEED);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0.55;
      if (kind === 'granite') {
        // Wander the sample point so cracks and pits are irregular rather than polygonal.
        const wx = x + 38 * (t(x, y, 5, 6) - 0.5) + 10 * (t(x, y, 16, 7) - 0.5);
        const wy = y + 38 * (t(x, y, 5, 8) - 0.5) + 10 * (t(x, y, 16, 9) - 0.5);
        h += 0.2 * (t(x, y, 3, 1) - 0.5) + 0.12 * (t(x, y, 8, 2) - 0.5);
        h += 0.1 * (Math.abs(t(x, y, 14, 3) * 2 - 1) - 0.4);
        h += 0.09 * (Math.abs(t(x, y, 30, 10) * 2 - 1) - 0.4);
        h += 0.07 * (Math.abs(t(x, y, 60, 11) * 2 - 1) - 0.4);
        const w1 = w(wx, wy, 4, 20);
        h -= 0.5 * (1 - sstep(0.0, 0.05, w1.f2 - w1.f1)) * sstep(0.5, 0.68, t(x, y, 6, 12)) * (0.6 + 0.4 * t(x, y, 20, 4));
        const w2 = w(wx, wy, 11, 30);
        h -= 0.2 * (1 - sstep(0.0, 0.045, w2.f2 - w2.f1)) * sstep(0.62, 0.8, t(x, y, 9, 13));
        const w3 = w(wx, wy, 26, 40);
        if (w3.id > 0.78) h -= 0.3 * (1 - sstep(0.0, 0.12 + 0.14 * w3.id, w3.f1));
        h += 0.09 * (t(x, y, 96, 5) - 0.5) + 0.05 * (hash3(x, y, 17, SEED) - 0.5);
      } else if (kind === 'blocks') {
        const rows = 4, cols = 2, rowH = size / rows, blockW = size / cols;
        const row = Math.floor(y / rowH);
        const bx = (x + (row % 2 ? blockW / 2 : 0)) % blockW, by = y % rowH;
        const edge = Math.min(bx, blockW - bx, by, rowH - by);
        h = 0.2 + 0.55 * sstep(2, 6, edge); // mortar grooves, soft block edges
        h += 0.12 * (t(x, y, 12, 3) - 0.5) + 0.08 * (Math.abs(t(x, y, 40, 4) * 2 - 1) - 0.4);
        const w3 = w(x, y, 20, 40);
        if (w3.id > 0.85) h -= 0.2 * (1 - sstep(0.0, 0.2, w3.f1));
        h += 0.06 * (hash3(x, y, 17, SEED) - 0.5);
      } else if (kind === 'earth') {
        h += 0.26 * (t(x, y, 4, 1) - 0.5) + 0.2 * (t(x, y, 9, 2) - 0.5) + 0.1 * (t(x, y, 22, 3) - 0.5);
        const w3 = w(x, y, 10, 40);
        if (w3.id > 0.55) h += 0.4 * (1 - sstep(0.0, 0.3, w3.f1)); // pebbles stand proud
        h += 0.05 * (hash3(x, y, 17, SEED) - 0.5);
      } else {
        h += 0.2 * (t(x, y, 3, 1) - 0.5) + 0.14 * (Math.abs(t(x, y, 8, 2) * 2 - 1) - 0.4);
        h += 0.12 * (Math.abs(t(x, y, 18, 3) * 2 - 1) - 0.4) + 0.08 * (Math.abs(t(x, y, 44, 4) * 2 - 1) - 0.4);
        h += 0.06 * Math.sin((y / size) * Math.PI * 14 + t(x, y, 5, 2) * 6);
        const w1 = w(x, y, 5, 20);
        h -= 0.3 * (1 - sstep(0.0, 0.05, w1.f2 - w1.f1)) * sstep(0.5, 0.7, t(x, y, 6, 12));
        h += 0.05 * (hash3(x, y, 17, SEED) - 0.5);
      }
      out[y * size + x] = Math.round(255 * Math.min(1, Math.max(0, h)));
    }
  }
  return out;
}

/**
 * Wooden door: vertical planks with grain, held by two iron straps.
 * Returns colour (RGBA) and height (one byte per pixel) for a single non-repeating panel.
 */
/** Planks across one door panel. */
export const DOOR_PLANKS = 9;

export function woodData(size = 512): { rgba: Uint8ClampedArray; height: Uint8Array } {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8Array(size * size);
  const planks = DOOR_PLANKS;
  const pw = size / planks;
  const k1 = size / 256; // pixel sizes below are tuned for 256 px
  const strapA = [Math.round(size * 0.14), Math.round(size * 0.14 + size * 0.07)];
  const strapB = [Math.round(size * 0.78), Math.round(size * 0.78 + size * 0.07)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = Math.min(planks - 1, Math.floor(x / pw));
      const lx = x - p * pw;
      const tone = 0.78 + 0.34 * hash3(p, 7, 3, SEED);
      // grain: streaks running along the plank, wavering slowly
      const wob = tileNoise(0, y, size, 3, 21, SEED) * 14 * k1;
      const streak = tileNoise(x + wob, 0, size, 130, 22, SEED);
      const fine = tileNoise(x + wob * 0.6, y * 0.2, size, 260, 23, SEED);
      let shade = tone * (0.74 + 0.4 * streak + 0.14 * fine);
      let h = 0.55 + 0.2 * (streak - 0.5);
      // gaps between planks, and slightly bevelled edges
      const edge = Math.min(lx, pw - 1 - lx);
      if (edge < 2 * k1) { shade *= 0.22; h = 0.05; }
      else if (edge < 4.5 * k1) { shade *= 0.8 + 0.06 * (edge / k1); h -= 0.1 * (4.5 * k1 - edge) / (3 * k1); }
      let r = 138 * shade, g = 96 * shade, b = 62 * shade;
      // iron straps with rivets
      const inStrap = (y >= strapA[0]! && y < strapA[1]!) || (y >= strapB[0]! && y < strapB[1]!);
      if (inStrap) {
        const sy = (y >= strapA[0]! && y < strapA[1]!) ? y - strapA[0]! : y - strapB[0]!;
        const edgeDark = sy < 2 * k1 || sy > size * 0.07 - 3 * k1 ? 0.7 : 1;
        const m = (46 + 12 * tileNoise(x, y, size, 90, 24, SEED)) * edgeDark;
        r = m; g = m + 2; b = m + 7;
        h = 0.85 - (sy < 2 * k1 ? 0.1 : 0);
        const rx = (x % pw) - pw / 2, ry = sy - size * 0.035;
        if (Math.hypot(rx, ry) < 3.2 * k1) { r += 40; g += 40; b += 44; h = 1; }
      }
      const o = (y * size + x) * 4;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
      height[y * size + x] = Math.round(255 * Math.min(1, Math.max(0, h)));
    }
  }
  return { rgba, height };
}

function toTexture(rgba: Uint8ClampedArray, size: number, srgb: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.putImageData(new ImageData(rgba, size, size), 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function albedoTexture(kind: SurfaceKind, size = 256): THREE.CanvasTexture {
  return toTexture(albedoData(kind, size), size, true);
}

export function heightTexture(kind: SurfaceKind, size = 256): THREE.CanvasTexture {
  const data = heightData(kind, size);
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = data[i]!;
    rgba[i * 4 + 3] = 255;
  }
  return toTexture(rgba, size, false);
}

/** Colour and height textures for door panels (planks and iron straps). */
export function doorTextures(size = 512): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const { rgba, height } = woodData(size);
  const h4 = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) { h4[i * 4] = h4[i * 4 + 1] = h4[i * 4 + 2] = height[i]!; h4[i * 4 + 3] = 255; }
  const map = toTexture(rgba, size, true);
  const bump = toTexture(h4, size, false);
  map.wrapS = map.wrapT = bump.wrapS = bump.wrapT = THREE.ClampToEdgeWrapping;
  return { map, bump };
}
