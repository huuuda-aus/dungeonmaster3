import { iconFor } from './icons';
import { SKILL_NAMES } from './sim/actions';
import { SLOT, SLOT_COUNT, STAT } from './sim/champion';
import type { Game } from './sim/game';
import type { Item } from './sim/items';

const EMPTY_LABEL: Record<number, string> = {
  0: 'Right hand', 1: 'Left hand', 2: 'Head', 3: 'Torso', 4: 'Legs', 5: 'Feet', 6: 'Neck',
  7: 'Pouch', 8: 'Pouch', 9: 'Quiver', 10: 'Quiver', 11: 'Quiver', 12: 'Quiver',
};
const STAT_ROWS: [string, number][] = [
  ['Strength', STAT.STRENGTH], ['Dexterity', STAT.DEXTERITY], ['Wisdom', STAT.WISDOM],
  ['Vitality', STAT.VITALITY], ['Anti-magic', STAT.ANTIMAGIC], ['Anti-fire', STAT.ANTIFIRE], ['Luck', STAT.LUCK],
];
const describe = (it: Item): string => {
  const bits = [it.name, `weight ${(it.weight / 10).toFixed(1)} kg`];
  if (it.food) bits.push(`food +${it.food}`);
  if (it.drink) bits.push(`water +${it.drink}`);
  if (it.potion) bits.push(`power ${it.potion.power}`);
  if (it.weapon?.twoHanded) bits.push('two-handed');
  return bits.join(' · ');
};

/**
 * Inventory screen. Click an item to pick it up onto the pointer, click a slot to
 * put it down (swapping). Drop food or a potion on the mouth to consume it.
 */
export class Inventory {
  private root: HTMLElement;
  private cursorEl: HTMLElement;
  private champ = 0;
  private opened = false;
  private slotEls: HTMLButtonElement[] = [];
  private tabsEl!: HTMLElement;
  private statsEl!: HTMLElement;
  private floorEl!: HTMLElement;
  private mouthEl!: HTMLButtonElement;
  private floorKey = '';
  private slotKeys: string[] = [];

  constructor(host: HTMLElement, private getGame: () => Game) {
    this.root = document.createElement('div');
    this.root.id = 'inv';
    this.root.style.display = 'none';
    this.root.addEventListener('click', (e) => e.stopPropagation());
    host.appendChild(this.root);
    this.build();
    this.cursorEl = document.createElement('div');
    this.cursorEl.id = 'cursoritem';
    this.cursorEl.style.display = 'none';
    document.body.appendChild(this.cursorEl);
    addEventListener('pointermove', (e) => {
      this.cursorEl.style.left = `${e.clientX + 6}px`;
      this.cursorEl.style.top = `${e.clientY + 6}px`;
    });
  }

  /** Remove the screen and the pointer item from the page (on restart). */
  destroy(): void {
    this.root.remove();
    this.cursorEl.remove();
  }

  get isOpen(): boolean { return this.opened; }

  open(champ: number): void {
    this.champ = champ;
    this.opened = true;
    this.root.style.display = '';
    this.slotKeys = [];
    this.update();
  }
  close(): void {
    this.opened = false;
    this.root.style.display = 'none';
  }
  toggle(champ: number): void {
    if (this.opened && this.champ === champ) this.close();
    else this.open(champ);
  }

  private build(): void {
    this.root.innerHTML = `
      <div class="invhead"><div class="tabs"></div><button class="x" title="Close (Esc / I)">✕</button></div>
      <div class="invbody">
        <div class="stats"></div>
        <div class="doll">
          <div class="dollgrid"></div>
          <div class="label">Pouches &amp; quiver</div>
          <div class="row small"></div>
          <div class="label">Backpack</div>
          <div class="pack"></div>
        </div>
        <div class="ground"><div class="label">On the floor here</div><div class="floorlist"></div></div>
      </div>`;
    this.tabsEl = this.root.querySelector('.tabs')!;
    this.statsEl = this.root.querySelector('.stats')!;
    this.floorEl = this.root.querySelector('.floorlist')!;
    this.root.querySelector('.x')!.addEventListener('click', () => this.close());

    const mk = (slot: number, area: HTMLElement, extra = ''): void => {
      const b = document.createElement('button');
      b.className = `slot ${extra}`;
      b.dataset['slot'] = String(slot);
      b.addEventListener('click', () => {
        this.getGame().clickSlot(this.champ, slot);
        this.slotKeys[slot] = '';
        this.update();
      });
      area.appendChild(b);
      this.slotEls[slot] = b;
    };
    // Paper doll: neck / head, weapon hand / torso / shield hand, legs / mouth, feet.
    const grid = this.root.querySelector<HTMLElement>('.dollgrid')!;
    const cell = (slot: number | 'mouth' | null, area: string): void => {
      const holder = document.createElement('div');
      holder.style.gridArea = area;
      grid.appendChild(holder);
      if (slot === 'mouth') {
        const b = document.createElement('button');
        b.className = 'slot mouth';
        b.innerHTML = '<span class="empty">Mouth</span>';
        b.title = 'Drop food, a flask or a potion here to consume it';
        b.addEventListener('click', () => { this.getGame().consumeCursor(this.champ); this.update(); });
        holder.appendChild(b);
        this.mouthEl = b;
      } else if (slot !== null) {
        mk(slot, holder);
      }
    };
    cell(SLOT.NECK, 'neck'); cell(SLOT.HEAD, 'head');
    cell(SLOT.ACTION, 'lh'); cell(SLOT.TORSO, 'torso'); cell(SLOT.READY, 'rh');
    cell(SLOT.LEGS, 'legs'); cell('mouth', 'mouth'); cell(SLOT.FEET, 'feet');
    const small = this.root.querySelector<HTMLElement>('.row.small')!;
    for (let s = SLOT.POUCH1; s < SLOT.PACK; s++) mk(s, small, 'sm');
    const pack = this.root.querySelector<HTMLElement>('.pack')!;
    for (let s = SLOT.PACK; s < SLOT_COUNT; s++) mk(s, pack);
  }

  /** Refresh contents. Cheap enough to call every frame. */
  update(): void {
    const g = this.getGame();
    const cur = g.cursor;
    this.cursorEl.style.display = cur ? '' : 'none';
    if (cur) {
      const k = cur.id + (cur.potion?.type ?? '');
      if (this.cursorEl.dataset['k'] !== k) {
        this.cursorEl.dataset['k'] = k;
        this.cursorEl.innerHTML = iconFor(cur);
      }
      this.cursorEl.title = describe(cur);
    }
    if (!this.opened) return;
    const ch = g.champions[this.champ]!;

    // Tabs
    if (this.tabsEl.childElementCount !== g.champions.length) {
      this.tabsEl.innerHTML = '';
      g.champions.forEach((c, i) => {
        const b = document.createElement('button');
        b.textContent = c.name;
        b.addEventListener('click', () => { this.champ = i; this.slotKeys = []; this.update(); });
        this.tabsEl.appendChild(b);
      });
    }
    Array.from(this.tabsEl.children).forEach((b, i) => {
      b.classList.toggle('on', i === this.champ);
      b.classList.toggle('dead', !g.champions[i]!.alive);
    });

    // Slots
    this.slotEls.forEach((btn, slot) => {
      if (!btn) return;
      const item = slot === SLOT.READY && ch.twoHanded ? ch.slots[SLOT.ACTION] ?? null : ch.slots[slot] ?? null;
      const key = `${this.champ}:${item?.id ?? ''}:${item?.potion?.power ?? ''}:${slot === 0 && ch.twoHanded ? 'T' : ''}`;
      if (this.slotKeys[slot] !== key) {
        this.slotKeys[slot] = key;
        btn.innerHTML = item ? iconFor(item) : `<span class="empty">${EMPTY_LABEL[slot] ?? ''}</span>`;
        btn.title = item ? describe(item) : EMPTY_LABEL[slot] ?? '';
        btn.classList.toggle('filled', !!item);
        btn.classList.toggle('ghost', slot === SLOT.READY && ch.twoHanded);
      }
    });
    this.mouthEl.classList.toggle('ready', !!cur && !!(cur.food || cur.drink || cur.potion));

    // Stats
    const lvl = (i: number): number => ch.skillLevel(i);
    const bar = (v: number): string => `<span class="mini" title="${Math.round(v)}"><i style="width:${Math.max(0, Math.min(100, (v / 2048) * 100))}%"></i></span>`;
    const skills = [0, 1, 2, 3].map((b) => {
      const hidden = [0, 1, 2, 3].map((k) => `<span>${SKILL_NAMES[4 + b * 4 + k]}<em>${lvl(4 + b * 4 + k)}</em></span>`).join('');
      return `<div class="sk"><b>${SKILL_NAMES[b]} · level ${lvl(b)}</b><div>${hidden}</div></div>`;
    }).join('');
    this.statsEl.innerHTML = `
      <h4>${ch.name}${ch.alive ? '' : ' (dead)'}</h4>
      <div class="kv"><span>Health</span><b>${ch.health}/${ch.maxHealth}</b></div>
      <div class="kv"><span>Stamina</span><b>${ch.stamina}/${ch.maxStamina}</b></div>
      <div class="kv"><span>Mana</span><b>${ch.mana}/${ch.maxMana}</b></div>
      <div class="kv"><span>Food</span>${bar(ch.food)}</div>
      <div class="kv"><span>Water</span>${bar(ch.water)}</div>
      <div class="kv"><span>Load</span><b>${(ch.load / 10).toFixed(1)}/${(ch.maxLoad / 10).toFixed(1)} kg</b></div>
      <hr>${STAT_ROWS.map(([n, i]) => `<div class="kv"><span>${n}</span><b>${ch.stat(i).cur}/${ch.stat(i).max}</b></div>`).join('')}
      <hr>${skills}`;

    // Floor items
    const floor = g.floorHere();
    const fk = `${g.floorVersion}:${g.px},${g.py}:${cur ? 1 : 0}`;
    if (fk !== this.floorKey) {
      this.floorKey = fk;
      this.floorEl.innerHTML = '';
      floor.forEach((it, i) => {
        const b = document.createElement('button');
        b.className = 'slot filled';
        b.innerHTML = iconFor(it);
        b.title = describe(it);
        b.addEventListener('click', () => { this.getGame().takeFromFloor(i); this.update(); });
        this.floorEl.appendChild(b);
      });
      if (cur) {
        const d = document.createElement('button');
        d.className = 'drop';
        d.textContent = 'Drop here';
        d.addEventListener('click', () => { this.getGame().dropCursor(); this.update(); });
        this.floorEl.appendChild(d);
      } else if (!floor.length) {
        this.floorEl.innerHTML = '<span class="none">Nothing here.</span>';
      }
    }
  }
}
