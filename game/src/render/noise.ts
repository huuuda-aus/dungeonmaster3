/** Small deterministic noise helpers shared by the tunnel mesh and the procedural textures. */

export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export const smooth = (t: number): number => t * t * (3 - 2 * t);

/** 3D value noise in -1..1. */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = smooth(x - xi), fy = smooth(y - yi), fz = smooth(z - zi);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  ) * 2 - 1;
}

export const mod = (a: number, m: number): number => ((a % m) + m) % m;

export const sstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Tileable 2D value noise over a `size` x `size` image with `period` lattice cells (0..1). */
export function tileNoise(x: number, y: number, size: number, period: number, salt: number, seed: number): number {
  const fx = (x / size) * period, fy = (y / size) * period;
  const xi = Math.floor(fx), yi = Math.floor(fy);
  const tx = smooth(fx - xi), ty = smooth(fy - yi);
  const h = (a: number, b: number): number => hash3(mod(a, period), mod(b, period), salt, seed);
  return (h(xi, yi) * (1 - tx) + h(xi + 1, yi) * tx) * (1 - ty) + (h(xi, yi + 1) * (1 - tx) + h(xi + 1, yi + 1) * tx) * ty;
}

/** Tileable Worley noise: distances to the nearest two feature points, and the nearest cell's id. */
export function worley(u: number, v: number, period: number, salt: number, seed: number): { f1: number; f2: number; id: number } {
  const cx = Math.floor(u), cy = Math.floor(v);
  let f1 = 9, f2 = 9, id = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      const wx = mod(nx, period), wy = mod(ny, period);
      const fx = nx + hash3(wx, wy, salt, seed), fy = ny + hash3(wx, wy, salt + 50, seed);
      const d = Math.hypot(u - fx, v - fy);
      if (d < f1) { f2 = f1; f1 = d; id = hash3(wx, wy, salt + 99, seed); }
      else if (d < f2) f2 = d;
    }
  }
  return { f1, f2, id };
}
