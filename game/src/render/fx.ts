import * as THREE from 'three';

type Ramp = 'fire' | 'spark' | 'smoke';

interface EmitArgs {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; s0: number; s1: number;
  drag?: number; gravity?: number; ramp: Ramp;
}

/** Fixed-size GPU particle pool drawn as soft round points. */
class ParticlePool {
  readonly points: THREE.Points;
  private readonly n: number;
  private pos: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private ramp: Uint8Array;
  private next = 0;
  readonly uniforms: { uMap: { value: THREE.Texture }; uScale: { value: number } };

  constructor(n: number, additive: boolean, map: THREE.Texture) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(1e9);
    this.life = new Float32Array(n).fill(1);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.ramp = new Uint8Array(n);
    const geo = new THREE.BufferGeometry();
    const dyn = (a: Float32Array, k: number): THREE.BufferAttribute =>
      new THREE.BufferAttribute(a, k).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', dyn(this.pos, 3));
    geo.setAttribute('aColor', dyn(this.col, 3));
    geo.setAttribute('aAlpha', dyn(this.alpha, 1));
    geo.setAttribute('aSize', dyn(this.size, 1));
    this.uniforms = { uMap: { value: map }, uScale: { value: 600 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
        uniform float uScale;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(0.0, aSize * uScale / -mv.z);
          vAlpha = aAlpha; vColor = aColor;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  emit(a: EmitArgs): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = a.x; this.pos[i * 3 + 1] = a.y; this.pos[i * 3 + 2] = a.z;
    this.vel[i * 3] = a.vx; this.vel[i * 3 + 1] = a.vy; this.vel[i * 3 + 2] = a.vz;
    this.age[i] = 0;
    this.life[i] = a.life;
    this.s0[i] = a.s0;
    this.s1[i] = a.s1;
    this.drag[i] = a.drag ?? 1.5;
    this.grav[i] = a.gravity ?? 0;
    this.ramp[i] = a.ramp === 'fire' ? 0 : a.ramp === 'spark' ? 1 : 2;
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      const age = this.age[i]! + dt;
      this.age[i] = age;
      const life = this.life[i]!;
      if (age >= life) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      const t = age / life;
      const damp = Math.exp(-this.drag[i]! * dt);
      this.vel[i * 3] = this.vel[i * 3]! * damp;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! * damp - this.grav[i]! * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2]! * damp;
      this.pos[i * 3] = this.pos[i * 3]! + this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1] = this.pos[i * 3 + 1]! + this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2] = this.pos[i * 3 + 2]! + this.vel[i * 3 + 2]! * dt;
      this.size[i] = this.s0[i]! + (this.s1[i]! - this.s0[i]!) * t;
      let r: number, g: number, b: number, al: number;
      switch (this.ramp[i]) {
        case 0: // flame: white-yellow -> orange -> deep red
          if (t < 0.25) { const k = t / 0.25; r = 1.8; g = 1.5 - 0.7 * k; b = 0.9 - 0.7 * k; }
          else { const k = (t - 0.25) / 0.75; r = 1.8 - 1.1 * k; g = 0.8 - 0.68 * k; b = 0.2 - 0.16 * k; }
          al = Math.pow(1 - t, 1.3);
          break;
        case 1: // spark
          r = 2.0; g = 1.3 - 0.9 * t; b = 0.5 - 0.45 * t; al = 1 - t;
          break;
        default: // smoke
          r = 0.14; g = 0.13; b = 0.13;
          al = 0.55 * Math.min(1, t * 6) * (1 - t);
      }
      this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
      this.alpha[i] = al;
    }
    const geo = this.points.geometry;
    for (const name of ['position', 'aColor', 'aAlpha', 'aSize']) {
      (geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** A flickering flame texture, redrawn every frame. */
class FlameTexture {
  readonly tex: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  constructor(private size = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    this.ctx = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
  }
  draw(time: number): void {
    const g = this.ctx;
    const s = this.size;
    g.clearRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    const lobes = 5;
    for (let i = 0; i < lobes; i++) {
      const a = time * (2.2 + i * 0.7) + i * 1.9;
      const ox = Math.cos(a) * s * 0.09;
      const oy = Math.sin(a * 1.3) * s * 0.09 - s * 0.03;
      const r = s * (0.3 + 0.06 * Math.sin(time * 9 + i * 2));
      const grad = g.createRadialGradient(s / 2 + ox, s / 2 + oy, 0, s / 2 + ox, s / 2 + oy, r);
      grad.addColorStop(0, 'rgba(255,250,220,0.9)');
      grad.addColorStop(0.35, 'rgba(255,170,60,0.6)');
      grad.addColorStop(1, 'rgba(255,60,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    }
    g.globalCompositeOperation = 'source-over';
    this.tex.needsUpdate = true;
  }
}

interface Flash { sprite: THREE.Sprite; born: number; life: number; from: number; to: number; ring: boolean }

/**
 * Visual effects: particles, flashes and a small fixed set of spell lights
 * (lights are pre-created, since adding lights at runtime recompiles shaders).
 */
export class Fx {
  private fire: ParticlePool;
  private smoke: ParticlePool;
  private flashes: Flash[] = [];
  private lights: { light: THREE.PointLight; base: number; decay: number; held: boolean }[] = [];
  private flame = new FlameTexture();
  private ringTex: THREE.CanvasTexture;
  private glow: THREE.Texture;
  private clock = 0;
  readonly coreMaterial: THREE.SpriteMaterial;

  constructor(private scene: THREE.Scene, glow: THREE.Texture, lightCount = 3) {
    this.glow = glow;
    this.fire = new ParticlePool(1400, true, glow);
    this.smoke = new ParticlePool(300, false, glow);
    scene.add(this.smoke.points, this.fire.points);
    for (let i = 0; i < lightCount; i++) {
      const light = new THREE.PointLight(0xff8a30, 0, 7, 1.7);
      light.castShadow = true; // keeps spell light from passing through walls
      light.shadow.mapSize.set(256, 256);
      light.shadow.bias = -0.001;
      light.shadow.normalBias = 0.03;
      scene.add(light);
      this.lights.push({ light, base: 0, decay: 0, held: false });
    }
    this.coreMaterial = new THREE.SpriteMaterial({
      map: this.flame.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 5;
    const grad = g.createRadialGradient(32, 32, 20, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.ringTex = new THREE.CanvasTexture(c);
  }

  /** Reserve a spell light; returns its index or -1 when all are busy. */
  acquireLight(): number {
    const i = this.lights.findIndex((l) => !l.held && l.light.intensity < 0.2);
    if (i >= 0) this.lights[i]!.held = true;
    return i;
  }
  releaseLight(i: number): void {
    const l = this.lights[i];
    if (l) { l.held = false; l.light.intensity = 0; }
  }
  setLight(i: number, x: number, y: number, z: number, color: number, intensity: number, distance = 7): void {
    const l = this.lights[i];
    if (!l) return;
    l.light.position.set(x, y, z);
    l.light.color.setHex(color);
    l.light.intensity = intensity;
    l.light.distance = distance;
  }

  /** Fireball in flight: call every frame with the projectile's world position. */
  fireballTrail(x: number, y: number, z: number, dirX: number, dirZ: number, dt: number, scale = 1): void {
    const n = Math.max(1, Math.round(110 * dt * Math.max(0.5, scale)));
    for (let i = 0; i < n; i++) {
      this.fire.emit({
        x: x + rnd(-0.05, 0.05), y: y + rnd(-0.05, 0.05), z: z + rnd(-0.05, 0.05),
        vx: -dirX * rnd(0.3, 1.1) + rnd(-0.25, 0.25),
        vy: rnd(0.1, 0.6),
        vz: -dirZ * rnd(0.3, 1.1) + rnd(-0.25, 0.25),
        life: rnd(0.35, 0.7), s0: rnd(0.16, 0.26) * scale, s1: 0.02, drag: 2.0, gravity: -0.5, ramp: 'fire',
      });
    }
    if (Math.random() < dt * 30) {
      this.fire.emit({
        x, y, z, vx: -dirX * rnd(0.5, 1.5) + rnd(-0.6, 0.6), vy: rnd(0.2, 1.0), vz: -dirZ * rnd(0.5, 1.5) + rnd(-0.6, 0.6),
        life: rnd(0.4, 0.9), s0: 0.05, s1: 0.01, drag: 0.8, gravity: 1.8, ramp: 'spark',
      });
    }
  }

  /** Explosion at world (x, z). Returns the light index used so callers can flash it. */
  fireballBurst(x: number, z: number, scale = 1): void {
    const y = 0.45;
    const n1 = Math.round(80 * scale);
    for (let i = 0; i < n1; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.acos(rnd(-0.2, 1));
      const sp = rnd(0.6, 3.2) * scale;
      this.fire.emit({
        x, y, z, vx: Math.cos(a) * Math.sin(e) * sp, vy: Math.cos(e) * sp * 0.8 + 0.3, vz: Math.sin(a) * Math.sin(e) * sp,
        life: rnd(0.35, 0.85), s0: rnd(0.3, 0.5) * scale, s1: 0.05, drag: 2.6, gravity: -0.3, ramp: 'fire',
      });
    }
    for (let i = 0; i < Math.round(36 * scale); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(2, 5.5) * Math.sqrt(scale);
      this.fire.emit({
        x, y, z, vx: Math.cos(a) * sp, vy: rnd(0.5, 3.5), vz: Math.sin(a) * sp,
        life: rnd(0.4, 1.0), s0: 0.06, s1: 0.01, drag: 0.7, gravity: 6, ramp: 'spark',
      });
    }
    for (let i = 0; i < Math.round(16 * scale); i++) {
      this.smoke.emit({
        x: x + rnd(-0.2, 0.2), y: y + rnd(0, 0.2), z: z + rnd(-0.2, 0.2),
        vx: rnd(-0.4, 0.4), vy: rnd(0.4, 1.0), vz: rnd(-0.4, 0.4),
        life: rnd(1.0, 1.8), s0: 0.3 * scale, s1: 1.1 * scale, drag: 1.0, gravity: -0.2, ramp: 'smoke',
      });
    }
    this.addFlash(x, y, z, 0xffd090, this.glow, 0.5 * scale, 2.8 * scale, 0.28, false);
    this.addFlash(x, y, z, 0xff8a30, this.ringTex, 0.3 * scale, 2.6 * scale, 0.45, true);
    const i = this.acquireLight();
    if (i >= 0) {
      const l = this.lights[i]!;
      this.setLight(i, x, y + 0.2, z, 0xffa050, 30 * scale, 9);
      l.base = 30 * scale;
      l.decay = 3.2;
      l.held = false; // fades out on its own
    }
  }

  private addFlash(x: number, y: number, z: number, color: number, map: THREE.Texture, from: number, to: number, life: number, ring: boolean): void {
    const mat = new THREE.SpriteMaterial({
      map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(from);
    this.scene.add(sprite);
    this.flashes.push({ sprite, born: this.clock, life, from, to, ring });
  }

  update(dt: number, pixelScale: number): void {
    this.clock += dt;
    this.fire.uniforms.uScale.value = pixelScale;
    this.smoke.uniforms.uScale.value = pixelScale;
    this.flame.draw(this.clock);
    this.fire.update(dt);
    this.smoke.update(dt);
    this.flashes = this.flashes.filter((f) => {
      const t = (this.clock - f.born) / f.life;
      if (t >= 1) {
        this.scene.remove(f.sprite);
        f.sprite.material.dispose();
        return false;
      }
      const e = 1 - Math.pow(1 - t, 3);
      f.sprite.scale.setScalar(f.from + (f.to - f.from) * e);
      f.sprite.material.opacity = f.ring ? 0.9 * (1 - t) : Math.pow(1 - t, 1.5);
      return true;
    });
    for (const l of this.lights) {
      if (!l.held && l.light.intensity > 0) {
        l.light.intensity = Math.max(0, l.light.intensity - l.base * l.decay * dt);
      }
    }
  }
}
