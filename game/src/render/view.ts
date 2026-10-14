import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { iconDataUrl } from '../icons';
import { Fx } from './fx';
import { buildTunnelGeometry, createTunnelMaterial, type TunnelMaterial } from './organic';
import { getTheme } from './themes';
import type { Game } from '../sim/game';
import { PROJECTILE_COLOR, type Projectile } from '../sim/magic';
import type { Monster } from '../sim/monsters';
import { DX, DY, Tile } from '../sim/world';

/** Monster billboard drawn procedurally from its colour. */
function monsterTexture(color: number, kind: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const col = '#' + color.toString(16).padStart(6, '0');
  g.fillStyle = col;
  if (kind === 'gnawer') {
    g.beginPath(); g.ellipse(64, 92, 38, 22, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(34, 80, 18, 14, 0, 0, Math.PI * 2); g.fill();
  } else if (kind === 'shambler') {
    g.fillRect(40, 30, 48, 80); g.beginPath(); g.arc(64, 26, 18, 0, Math.PI * 2); g.fill();
    g.fillRect(24, 46, 16, 50); g.fillRect(88, 46, 16, 50);
  } else if (kind === 'wraith') {
    g.globalAlpha = 0.65;
    g.beginPath(); g.arc(64, 40, 24, Math.PI, 0); g.lineTo(88, 112);
    for (let x = 88; x > 40; x -= 12) { g.lineTo(x - 6, 100); g.lineTo(x - 12, 112); }
    g.closePath(); g.fill(); g.globalAlpha = 1;
  } else {
    g.fillRect(36, 28, 56, 84); g.beginPath(); g.moveTo(36, 28); g.lineTo(64, 6); g.lineTo(92, 28); g.fill();
    g.fillStyle = '#222'; g.fillRect(20, 40, 12, 70);
  }
  g.fillStyle = '#ff5030';
  const ey = kind === 'gnawer' ? 76 : 24;
  g.fillRect(kind === 'gnawer' ? 28 : 56, ey, 5, 5);
  g.fillRect(kind === 'gnawer' ? 40 : 70, ey, 5, 5);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Lighting tunables: the dungeon is almost pitch dark; the party's own light and spells are all there is. */
const LIGHT = {
  ambient: 0.035,
  partyDist: 2.8, // reach (tiles) of the party's own dim light
  partyIntensity: 3.2,
  fogNear: 1.5,
  fogFar: 8,
};

/** Fireball visual size: half the old size at power 1, growing with the power rune only. */
const fireballScale = (power: number): number => 0.5 * (1 + (Math.max(1, power) - 1) * 0.25);

/** Soft round glow used for projectiles and impact flashes. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Pulse { sprite: THREE.Sprite; born: number; life: number; size: number; mult: number }

/** The open-door spell is a small effect: 80% smaller than the generic spell visuals. */
const OPEN_DOOR_SCALE = 0.2;

export class View {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private torch: THREE.PointLight;
  private doors = new Map<number, THREE.Mesh>();
  private sprites = new Map<number, THREE.Sprite>();
  private texCache = new Map<string, THREE.CanvasTexture>();
  private camPos = new THREE.Vector3();
  private camYaw = 0;
  private flash = 0;
  private glow = glowTexture();
  private bolts = new Map<number, THREE.Sprite>();
  private pulses: Pulse[] = [];
  private seenEffect = 0;
  private castLight = 0;
  private tunnel!: TunnelMaterial;
  private themeId = '';
  private levelObjects: THREE.Object3D[] = [];
  private shellCache = new Map<string, { geo: THREE.BufferGeometry; tunnel: TunnelMaterial }>();
  private footGroup = new THREE.Group();
  private footKey = '';
  private fx!: Fx;
  private fireballs = new Map<number, { core: THREE.Sprite; halo: THREE.Sprite; light: number }>();
  private shake = 0;
  private floorSprites: THREE.Sprite[] = [];
  private floorSeen = -1;
  private itemTex = new Map<string, THREE.Texture>();
  private composer: EffectComposer | null = null;
  /** Toggle the bloom glow pass (key G). */
  bloomOn = true;

  constructor(private host: HTMLElement, private game: Game, themeId: string) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.prepend(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 40);
    this.scene.background = new THREE.Color(0x050406);
    this.scene.fog = new THREE.Fog(0x020203, LIGHT.fogNear, LIGHT.fogFar);
    this.scene.add(new THREE.AmbientLight(0x141a30, LIGHT.ambient));
    this.torch = new THREE.PointLight(0xe6dccb, LIGHT.partyIntensity, LIGHT.partyDist, 1.6);
    this.scene.add(this.torch);
    // Shadows keep the party light from shining through walls.
    this.renderer.shadowMap.enabled = true;
    this.torch.castShadow = true;
    this.torch.shadow.mapSize.set(512, 512);
    this.torch.shadow.bias = -0.0008;
    this.torch.shadow.normalBias = 0.03;
    this.fx = new Fx(this.scene, this.glow);
    this.scene.add(this.footGroup);
    this.setTheme(themeId);
    try {
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.9));
      composer.addPass(new OutputPass());
      this.composer = composer;
    } catch {
      this.composer = null; // fall back to plain rendering
    }
    this.camPos.set(game.px, 0.5, game.py);
    this.camYaw = this.yawFor(game.dir);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  private yawFor(dir: number): number {
    // N = -Z. Yaw 0 looks toward -Z; turning right (E) is negative yaw.
    return -dir * (Math.PI / 2);
  }

  /**
   * Switch the look of the dungeon: rebuilds the tunnel mesh and doors for a theme.
   * Meshes and textures are cached per theme, so going back to one is instant.
   */
  setTheme(id: string): void {
    const theme = getTheme(id);
    if (this.themeId === theme.id) return;
    this.themeId = theme.id;
    for (const o of this.levelObjects) {
      this.scene.remove(o);
      if (o instanceof THREE.Mesh && o.userData['door']) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    }
    this.levelObjects = [];
    this.doors.clear();
    const { map } = this.game;

    let entry = this.shellCache.get(theme.id);
    if (!entry) {
      entry = { geo: buildTunnelGeometry(map, theme.tunnel), tunnel: createTunnelMaterial(theme.surface) };
      this.shellCache.set(theme.id, entry);
    }
    this.tunnel = entry.tunnel;
    // The wall-fade for Thieves' Eye lives on the old material; make the new one match.
    this.tunnel.material.transparent = false;
    this.tunnel.material.depthWrite = true;
    const shell = new THREE.Mesh(entry.geo, this.tunnel.material);
    shell.castShadow = true;
    shell.receiveShadow = true;
    this.scene.add(shell);
    this.levelObjects.push(shell);

    const doorMat = new THREE.MeshStandardMaterial({ color: theme.doorColor, roughness: 0.9 });
    // Wider than the doorway so the edges sit inside the rock and leave no gaps.
    const span = 1 + 2 * theme.tunnel.widen + 0.5;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = map.at(x, y);
        if (t !== Tile.DoorClosed && t !== Tile.DoorOpen) continue;
        // Walls left/right => passage runs north-south => door spans east-west.
        const horizontal = map.at(x - 1, y) === Tile.Wall;
        const geo = new THREE.BoxGeometry(horizontal ? span : 0.14, 1.3, horizontal ? 0.14 : span).translate(x, 0.5, y);
        const d = new THREE.Mesh(geo, doorMat);
        d.userData['door'] = true;
        d.castShadow = d.receiveShadow = true;
        this.scene.add(d);
        this.levelObjects.push(d);
        this.doors.set(y * map.width + x, d);
      }
    }
  }

  /** 0..1 brightness at a floor position from the party's light and any fireballs in flight. */
  private lightAt(x: number, z: number): number {
    const boost = this.game.lightBoost;
    let v = 0;
    const dp = Math.hypot(x - this.camPos.x, z - this.camPos.z);
    const rp = LIGHT.partyDist * boost;
    if (dp < rp) v += Math.pow(1 - dp / rp, 1.6) * Math.min(1.5, boost);
    for (const fb of this.fireballs.values()) {
      const d = Math.hypot(x - fb.core.position.x, z - fb.core.position.z);
      if (d < 3.5) v += Math.pow(1 - d / 3.5, 1.5) * 0.9;
    }
    return Math.min(1, v);
  }

  private spriteFor(m: Monster): THREE.Sprite {
    let s = this.sprites.get(m.uid);
    if (!s) {
      let tex = this.texCache.get(m.def.id);
      if (!tex) {
        tex = monsterTexture(m.def.color, m.def.id);
        this.texCache.set(m.def.id, tex);
      }
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      s.scale.set(0.9, 0.9, 1);
      s.position.set(m.x, 0.45, m.y);
      this.scene.add(s);
      this.sprites.set(m.uid, s);
    }
    return s;
  }

  private updateSpellVisuals(): void {
    const g = this.game;
    const seeThrough = g.seeThrough > 0;
    const mat = this.tunnel.material;
    this.tunnel.seeThrough.value = seeThrough ? 1 : 0;
    if (mat.transparent !== seeThrough) {
      mat.transparent = seeThrough;
      mat.depthWrite = !seeThrough;
      mat.needsUpdate = true;
    }
    const last = g.trail[g.trail.length - 1];
    const key = g.footprints > 0 ? `${g.trail.length}:${last?.x},${last?.y}` : '';
    if (key !== this.footKey) {
      this.footKey = key;
      for (const c of [...this.footGroup.children]) {
        this.footGroup.remove(c);
        (c as THREE.Sprite).material.dispose();
      }
      if (g.footprints > 0) {
        g.trail.forEach((t, i) => {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.glow, color: 0x6aa0ff, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, opacity: 0.25 + 0.5 * (i / g.trail.length),
          }));
          sp.scale.set(0.35, 0.35, 1);
          sp.position.set(t.x, 0.04, t.y);
          this.footGroup.add(sp);
        });
      }
    }
  }

  private renderMagic(dt: number): void {
    const g = this.game;
    const liveBolts = new Set<number>();
    const liveFire = new Set<number>();
    for (const p of g.projectiles) {
      if (p.kind === 'fire') {
        liveFire.add(p.uid);
        this.updateFireball(p, dt);
        continue;
      }
      liveBolts.add(p.uid);
      let sp = this.bolts.get(p.uid);
      if (!sp && p.kind === 'thrown' && p.item) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textureForItem(p.item), transparent: true, depthWrite: false }));
        sp.scale.set(0.32, 0.32, 1);
        sp.position.set(p.x, 0.5, p.y);
        this.scene.add(sp);
        this.bolts.set(p.uid, sp);
      }
      if (!sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.glow, color: PROJECTILE_COLOR[p.kind], transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        const bs = p.kind === 'openDoor' ? 0.45 * OPEN_DOOR_SCALE : 0.45;
        sp.scale.set(bs, bs, 1);
        sp.position.set(p.x, 0.5, p.y);
        this.scene.add(sp);
        this.bolts.set(p.uid, sp);
      }
      // Projectiles advance one cell per 2 ticks; ease toward the logical cell.
      sp.position.x += (p.x - sp.position.x) * (1 - Math.pow(0.0001, dt));
      sp.position.z += (p.y - sp.position.z) * (1 - Math.pow(0.0001, dt));
      sp.position.y = 0.5;
    }
    for (const [uid, sp] of this.bolts) {
      if (!liveBolts.has(uid)) {
        this.scene.remove(sp);
        (sp.material as THREE.SpriteMaterial).dispose();
        this.bolts.delete(uid);
      }
    }
    for (const [uid, fb] of this.fireballs) {
      if (!liveFire.has(uid)) {
        this.scene.remove(fb.core, fb.halo);
        (fb.halo.material as THREE.SpriteMaterial).dispose();
        this.fx.releaseLight(fb.light);
        this.fireballs.delete(uid);
      }
    }
    for (const e of g.effects) {
      if (e.id <= this.seenEffect) continue;
      this.seenEffect = e.id;
      if (e.kind === 'cast') { this.castLight = 1; continue; }
      if (e.kind === 'hit' && e.spell === 'fire') {
        const sc = fireballScale(e.power ?? 1);
        this.fx.fireballBurst(e.x, e.y, sc);
        const d = Math.hypot(e.x - this.camPos.x, e.y - this.camPos.z);
        this.shake = Math.max(this.shake, (0.9 * sc) / (1 + d * 0.6));
        continue;
      }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glow, color: e.color, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      sp.position.set(e.x, 0.5, e.y);
      this.scene.add(sp);
      this.pulses.push({ sprite: sp, born: performance.now(), life: e.kind === 'fizzle' ? 350 : 450, size: e.kind === 'fizzle' ? 0.5 : 1.3,
        mult: e.spell === 'openDoor' ? OPEN_DOOR_SCALE : 1 });
    }
    const now = performance.now();
    this.pulses = this.pulses.filter((p) => {
      const t = (now - p.born) / p.life;
      if (t >= 1) {
        this.scene.remove(p.sprite);
        (p.sprite.material as THREE.SpriteMaterial).dispose();
        return false;
      }
      p.sprite.scale.setScalar((0.3 + p.size * t) * p.mult);
      (p.sprite.material as THREE.SpriteMaterial).opacity = 1 - t;
      return true;
    });
  }

  private updateFireball(p: Projectile, dt: number): void {
    let fb = this.fireballs.get(p.uid);
    if (!fb) {
      const core = new THREE.Sprite(this.fx.coreMaterial);
      core.scale.set(0.8 * fireballScale(p.power), 0.8 * fireballScale(p.power), 1);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glow, color: 0xff7a2a, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.scale.set(1.7 * fireballScale(p.power), 1.7 * fireballScale(p.power), 1);
      core.position.set(p.x, 0.5, p.y);
      this.scene.add(core, halo);
      fb = { core, halo, light: this.fx.acquireLight() };
      this.fireballs.set(p.uid, fb);
    }
    const k = 1 - Math.pow(0.0001, dt);
    fb.core.position.x += (p.x - fb.core.position.x) * k;
    fb.core.position.z += (p.y - fb.core.position.z) * k;
    fb.core.position.y = 0.5;
    fb.halo.position.copy(fb.core.position);
    const t = performance.now() / 1000;
    const pulse = 1 + 0.12 * Math.sin(t * 28) + 0.06 * Math.sin(t * 61);
    const sc = fireballScale(p.power);
    fb.core.scale.setScalar(0.8 * sc * pulse);
    fb.halo.scale.setScalar(1.7 * sc * pulse);
    this.fx.fireballTrail(fb.core.position.x, 0.5, fb.core.position.z, DX[p.dir], DY[p.dir], dt, sc);
    if (fb.light >= 0) {
      this.fx.setLight(fb.light, fb.core.position.x, 0.6, fb.core.position.z, 0xff7a30, (8 + Math.random() * 2.5) * sc, 7);
    }
  }

  private textureForItem(item: import('../sim/items').Item): THREE.Texture {
    const key = item.id;
    let tex = this.itemTex.get(key);
    if (!tex) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = 'rgba(10,8,12,0.55)';
        ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(img, 8, 8, 48, 48);
        t.needsUpdate = true;
      };
      img.src = iconDataUrl(item);
      this.itemTex.set(key, t);
      tex = t;
    }
    return tex;
  }

  /** Items lying on the floor, drawn as small icons on their cells. */
  private updateFloorItems(): void {
    const g = this.game;
    if (g.floorVersion === this.floorSeen) return;
    this.floorSeen = g.floorVersion;
    for (const s of this.floorSprites) {
      this.scene.remove(s);
      (s.material as THREE.SpriteMaterial).dispose();
    }
    this.floorSprites = [];
    for (const [key, list] of g.floor) {
      const x = key % g.map.width;
      const z = Math.floor(key / g.map.width);
      list.slice(0, 4).forEach((item, i) => {
        const a = (i / 4) * Math.PI * 2 + key;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textureForItem(item), transparent: true, depthWrite: false }));
        sp.scale.set(0.34, 0.34, 1);
        sp.userData['floor'] = { x, y: z, index: i };
        sp.position.set(x + Math.cos(a) * (list.length > 1 ? 0.18 : 0), 0.24, z + Math.sin(a) * (list.length > 1 ? 0.18 : 0));
        this.scene.add(sp);
        this.floorSprites.push(sp);
      });
    }
  }

  /** Which floor item on the cell ahead is under the pointer, if any. */
  pickFloorItem(clientX: number, clientY: number): { x: number; y: number; index: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const front = this.game.frontCell();
    for (const hit of ray.intersectObjects(this.floorSprites)) {
      const f = hit.object.userData['floor'] as { x: number; y: number; index: number } | undefined;
      if (f && f.x === front.x && f.y === front.y) return f;
    }
    return null;
  }

  /** Brief red flash when the party is hit. */
  hitFlash(): void { this.flash = 1; }

  private resize(): void {
    const w = this.host.clientWidth || 640;
    const h = this.host.clientHeight || 360;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number): void {
    const g = this.game;
    // Smooth camera toward grid position.
    const target = new THREE.Vector3(g.px, 0.5, g.py);
    this.camPos.lerp(target, 1 - Math.pow(0.0005, dt));
    let yaw = this.yawFor(g.dir);
    let diff = yaw - this.camYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.camYaw += diff * (1 - Math.pow(0.0005, dt));
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const sh = this.shake * 0.06;
    this.camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * sh,
      this.camPos.y + (Math.random() - 0.5) * sh,
      this.camPos.z + (Math.random() - 0.5) * sh,
    );
    this.camera.rotation.set((Math.random() - 0.5) * sh * 0.5, this.camYaw, (Math.random() - 0.5) * sh * 0.5);
    this.torch.position.copy(this.camPos);
    const boost = g.lightBoost;
    this.castLight = Math.max(0, this.castLight - dt * 2.5);
    this.torch.distance = LIGHT.partyDist * boost;
    this.torch.intensity =
      (LIGHT.partyIntensity + Math.sin(performance.now() / 90) * 0.3 + Math.random() * 0.25) * boost * boost +
      this.castLight * 8;
    (this.scene.fog as THREE.Fog).far = LIGHT.fogFar * Math.max(0.6, boost);

    for (const [key, mesh] of this.doors) {
      const open = g.map.tiles[key] === Tile.DoorOpen;
      mesh.visible = !open;
    }
    const alive = new Set<number>();
    for (const m of g.monsters) {
      alive.add(m.uid);
      const s = this.spriteFor(m);
      s.position.x += (m.x - s.position.x) * (1 - Math.pow(0.001, dt));
      s.position.z += (m.y - s.position.z) * (1 - Math.pow(0.001, dt));
      const bob = Math.sin(performance.now() / 220 + m.uid) * 0.02;
      s.position.y = 0.42 + bob;
      const lit = 0.05 + 0.95 * this.lightAt(s.position.x, s.position.z);
      (s.material as THREE.SpriteMaterial).color.setScalar(lit * (m.health < m.def.health ? 0.8 : 1));
    }
    for (const [uid, s] of this.sprites) {
      if (!alive.has(uid)) {
        this.scene.remove(s);
        (s.material as THREE.SpriteMaterial).dispose();
        this.sprites.delete(uid);
      }
    }
    this.updateSpellVisuals();
    this.updateFloorItems();
    this.renderMagic(dt);
    const bufH = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    this.fx.update(dt, bufH / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    this.flash = Math.max(0, this.flash - dt * 3);
    this.scene.background = new THREE.Color().setRGB(0.02 + this.flash * 0.35, 0.016, 0.024);
    if (this.composer && this.bloomOn) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
