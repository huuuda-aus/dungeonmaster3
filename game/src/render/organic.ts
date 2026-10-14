import * as THREE from 'three';
import { Tile, type GameMap } from '../sim/world';
import { noise3 } from './noise';
import { albedoTexture, heightTexture, type SurfaceKind } from './textures';

/**
 * Organic, dug-out tunnels. The level is treated as a 3D solid (rock) with the open
 * cells carved out. That solid is blurred, a little noise is added, and the surface
 * is extracted where the density crosses a threshold. The blur rounds every corner
 * (a corridor becomes something between a rectangle and a circle) and the noise
 * keeps any edge from staying straight.
 */
export interface TunnelOptions {
  /** Samples per world unit. */
  resolution: number;
  /** Blur radius in world units: bigger = rounder tunnels. */
  roundness: number;
  /** Size of the large lumps (in density units) and the small ones. */
  lump: number;
  bump: number;
  seed: number;
  /** Extra width carved on every side of the open cells, in world units (corridor width = 1 + 2 * widen). */
  widen: number;
}

export const DEFAULT_TUNNEL: TunnelOptions = { resolution: 10, roundness: 0.24, lump: 0.2, bump: 0.08, seed: 7, widen: 0.24 };

/** Separable Gaussian blur of a 3D field stored x-fastest. */
function blur3(src: Float32Array, nx: number, ny: number, nz: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { kernel[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += kernel[i + r]!; }
  for (let i = 0; i < kernel.length; i++) kernel[i]! /= sum;
  const strides = [1, nx, nx * ny];
  const dims = [nx, ny, nz];
  let a = src;
  for (let axis = 0; axis < 3; axis++) {
    const out = new Float32Array(a.length);
    const stride = strides[axis]!;
    const len = dims[axis]!;
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const idx = x + y * nx + z * nx * ny;
          const pos = axis === 0 ? x : axis === 1 ? y : z;
          let acc = 0;
          for (let k = -r; k <= r; k++) {
            const p = Math.min(len - 1, Math.max(0, pos + k));
            acc += a[idx + (p - pos) * stride]! * kernel[k + r]!;
          }
          out[idx] = acc;
        }
      }
    }
    a = out;
  }
  return a;
}

/** Build the carved tunnel mesh for a map. Open cells = walkable tiles and doors (open or closed). */
export function buildTunnelGeometry(map: GameMap, opt: TunnelOptions = DEFAULT_TUNNEL): THREE.BufferGeometry {
  const R = opt.resolution;
  const xmin = -1.5, zmin = -1.5, ymin = -0.6;
  const nx = Math.ceil((map.width + 2) * R), nz = Math.ceil((map.height + 2) * R), ny = Math.ceil(2.2 * R);
  const px = (i: number): number => xmin + (i + 0.5) / R;
  const py = (j: number): number => ymin + (j + 0.5) / R;
  const pz = (k: number): number => zmin + (k + 0.5) / R;

  // 1 = rock, 0 = open. A sample counts as open if it is within `widen` of any open cell.
  const occ = new Float32Array(nx * ny * nz);
  const w = opt.widen;
  const nearOpen = (x: number, z: number): boolean => {
    const cx = Math.floor(x + 0.5), cz = Math.floor(z + 0.5);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        // Closed doors are carved too: the doorway must exist before the door opens.
        if (!map.walkable(cx + dx, cz + dz) && map.at(cx + dx, cz + dz) !== Tile.DoorClosed) continue;
        const ex = Math.max(Math.abs(x - (cx + dx)) - 0.5, 0);
        const ez = Math.max(Math.abs(z - (cz + dz)) - 0.5, 0);
        if (ex * ex + ez * ez <= w * w) return true;
      }
    }
    return false;
  };
  for (let k = 0; k < nz; k++) {
    const z = pz(k);
    for (let i = 0; i < nx; i++) {
      const open = nearOpen(px(i), z);
      for (let j = 0; j < ny; j++) {
        const y = py(j);
        occ[i + j * nx + k * nx * ny] = open && y >= 0 && y <= 1 ? 0 : 1;
      }
    }
  }
  const field = blur3(occ, nx, ny, nz, opt.roundness * R);
  // A much wider blur, on a coarse grid (it only darkens crevices, so it can be cheap).
  const D = 3;
  const cx = Math.ceil(nx / D), cy = Math.ceil(ny / D), cz = Math.ceil(nz / D);
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    coarse[i + j * cx + k * cx * cy] = occ[Math.min(nx - 1, i * D) + Math.min(ny - 1, j * D) * nx + Math.min(nz - 1, k * D) * nx * ny]!;
  }
  const wideCoarse = blur3(coarse, cx, cy, cz, (0.7 * R) / D);
  // s < 0 is open space.
  const s = new Float32Array(field.length);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = i + j * nx + k * nx * ny;
        const x = px(i), y = py(j), z = pz(k);
        const n = opt.lump * noise3(x * 1.1, y * 1.1, z * 1.1, opt.seed) + opt.bump * noise3(x * 3.3, y * 3.3, z * 3.3, opt.seed + 1);
        s[idx] = field[idx]! - 0.5 + n;
      }
    }
  }

  // ---- naive surface nets
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const positions: number[] = [];
  const colors: number[] = [];
  const at = (i: number, j: number, k: number): number => s[i + j * nx + k * nx * ny]!;
  const corners: [number, number, number][] = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges: [number, number][] = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v = corners.map(([dx, dy, dz]) => at(i + dx, j + dy, k + dz));
        let mask = 0;
        for (let c = 0; c < 8; c++) if (v[c]! < 0) mask |= 1 << c;
        if (mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, cnt = 0;
        for (const [a, b] of edges) {
          const va = v[a]!, vb = v[b]!;
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          const ca = corners[a]!, cb = corners[b]!;
          ax += ca[0] + (cb[0] - ca[0]) * t;
          ay += ca[1] + (cb[1] - ca[1]) * t;
          az += ca[2] + (cb[2] - ca[2]) * t;
          cnt++;
        }
        const gx = i + ax / cnt, gy = j + ay / cnt, gz = k + az / cnt;
        cellVert[i + j * nx + k * nx * ny] = positions.length / 3;
        positions.push(xmin + (gx + 0.5) / R, ymin + (gy + 0.5) / R, zmin + (gz + 0.5) / R);
        // Darker where the surroundings are crowded with rock (corners, crevices).
        const wi = Math.min(nx - 1, Math.max(0, Math.round(gx))), wj = Math.min(ny - 1, Math.max(0, Math.round(gy))), wk = Math.min(nz - 1, Math.max(0, Math.round(gz)));
        const crowd = wideCoarse[Math.min(cx - 1, Math.floor(wi / D)) + Math.min(cy - 1, Math.floor(wj / D)) * cx + Math.min(cz - 1, Math.floor(wk / D)) * cx * cy]!;
        const ao = Math.min(1, Math.max(0.35, 1 - (crowd - 0.5) * 1.6));
        colors.push(ao, ao, ao);
      }
    }
  }
  const index: number[] = [];
  const getV = (i: number, j: number, k: number): number => cellVert[i + j * nx + k * nx * ny]!;
  const quad = (a: number, b: number, c: number, d: number): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    index.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const here = at(i, j, k) < 0;
        // edge along +x
        if ((at(i + 1, j, k) < 0) !== here) {
          quad(getV(i, j - 1, k - 1), getV(i, j, k - 1), getV(i, j, k), getV(i, j - 1, k));
        }
        // edge along +y
        if ((at(i, j + 1, k) < 0) !== here) {
          quad(getV(i - 1, j, k - 1), getV(i - 1, j, k), getV(i, j, k), getV(i, j, k - 1));
        }
        // edge along +z
        if ((at(i, j, k + 1) < 0) !== here) {
          quad(getV(i - 1, j - 1, k), getV(i, j - 1, k), getV(i, j, k), getV(i - 1, j, k));
        }
      }
    }
  }

  // Make every triangle face the open space (the side where the field is lower).
  const gradAt = (x: number, y: number, z: number): [number, number, number] => {
    const i = Math.min(nx - 2, Math.max(1, Math.round((x - xmin) * R - 0.5)));
    const j = Math.min(ny - 2, Math.max(1, Math.round((y - ymin) * R - 0.5)));
    const k = Math.min(nz - 2, Math.max(1, Math.round((z - zmin) * R - 0.5)));
    return [at(i + 1, j, k) - at(i - 1, j, k), at(i, j + 1, k) - at(i, j - 1, k), at(i, j, k + 1) - at(i, j, k - 1)];
  };
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]! * 3, b = index[t + 1]! * 3, c = index[t + 2]! * 3;
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!;
    const nxf = uy * vz - uz * vy, nyf = uz * vx - ux * vz, nzf = ux * vy - uy * vx;
    const g = gradAt(
      (positions[a]! + positions[b]! + positions[c]!) / 3,
      (positions[a + 1]! + positions[b + 1]! + positions[c + 1]!) / 3,
      (positions[a + 2]! + positions[b + 2]! + positions[c + 2]!) / 3,
    );
    if (nxf * g[0] + nyf * g[1] + nzf * g[2] > 0) {
      const tmp = index[t + 1]!;
      index[t + 1] = index[t + 2]!;
      index[t + 2] = tmp;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

export interface SurfaceStyle {
  surface: SurfaceKind;
  roughness: number;
  /** How strongly the height map bumps the surface under light (0 = flat). */
  bump: number;
  /** World units per texture tile for the colour and height maps are 1 / these. */
  texScale: number;
  heightScale: number;
}

export interface TunnelMaterial {
  material: THREE.MeshStandardMaterial;
  /** 0 = solid walls, 1 = walls see-through (Thieves' Eye). */
  seeThrough: { value: number };
}

/**
 * Standard material that maps a surface's colour and height textures onto the mesh from
 * three directions (triplanar), so the organic shape has no stretched or seamed UVs.
 */
export function createTunnelMaterial(style: SurfaceStyle): TunnelMaterial {
  const seeThrough = { value: 0 };
  const heightMap = heightTexture(style.surface);
  const material = new THREE.MeshStandardMaterial({
    map: albedoTexture(style.surface), roughness: style.roughness, metalness: 0.04, vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uSee'] = seeThrough;
    shader.uniforms['uBump'] = { value: style.bump };
    shader.uniforms['uHeightMap'] = { value: heightMap };
    shader.uniforms['uTexScale'] = { value: style.texScale };
    shader.uniforms['uHeightScale'] = { value: style.heightScale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * normal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vWNrm;
uniform float uSee;
uniform float uBump;
uniform float uTexScale;
uniform float uHeightScale;
uniform sampler2D uHeightMap;
// Bump mapping for surfaces without UVs: perturb the normal by the screen-space slope of a height value.
vec3 bumpNormal(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDirection) {
  vec3 sx = normalize(dFdx(surfPos));
  vec3 sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}`)
      .replace('#include <map_fragment>', `
        vec3 tw = pow(abs(normalize(vWNrm)), vec3(4.0));
        tw /= (tw.x + tw.y + tw.z);
        float sc = uTexScale;
        vec4 tcol = texture2D(map, vWPos.zy * sc) * tw.x + texture2D(map, vWPos.xz * sc) * tw.y + texture2D(map, vWPos.xy * sc) * tw.z;
        // floors a touch lighter, ceilings a touch darker
        tcol.rgb *= mix(vec3(1.0), vec3(1.06, 1.06, 1.1), clamp(vWNrm.y, 0.0, 1.0));
        tcol.rgb *= mix(vec3(1.0), vec3(0.82), clamp(-vWNrm.y, 0.0, 1.0));
        float hs = uHeightScale;
        float hv = texture2D(uHeightMap, vWPos.zy * hs).r * tw.x + texture2D(uHeightMap, vWPos.xz * hs).r * tw.y + texture2D(uHeightMap, vWPos.xy * hs).r * tw.z;
        float bumpH = hv + 0.1 * dot(tcol.rgb, vec3(0.3333));
        // cracks, pits and mortar are darker
        tcol.rgb *= mix(0.5, 1.0, smoothstep(0.05, 0.5, hv));
        diffuseColor *= tcol;
        diffuseColor.a *= mix(1.0, mix(1.0, 0.28, 1.0 - abs(vWNrm.y)), uSee);
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = bumpNormal(-vViewPosition, normal, uBump * vec2(dFdx(bumpH), dFdy(bumpH)), faceDirection);`);
  };
  return { material, seeThrough };
}
