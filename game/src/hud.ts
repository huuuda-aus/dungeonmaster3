import { iconFor } from './icons';
import { SKILL_NAMES } from './sim/actions';
import type { Game } from './sim/game';

const HAND_NAMES = ['Right hand (shield)', 'Left hand (weapon)'];

export class Hud {
  private panels: HTMLElement[] = [];
  private logEl: HTMLElement;
  private lastLogLen = 0;
  private menu: HTMLElement | null = null;
  private menuFor: { champ: number; hand: number } | null = null;

  constructor(
    root: HTMLElement, logEl: HTMLElement, private game: Game,
    onSelect: (i: number) => void,
    onInventory: (i: number) => void,
  ) {
    this.logEl = logEl;
    game.champions.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'champ';
      el.innerHTML = `
        <div class="info">
          <h3><span>${i + 1}. ${c.name}</span></h3>
          <div class="hands">
            <button class="hand" data-hand="0"><span class="ico"></span><span class="cd"></span></button>
            <button class="hand" data-hand="1"><span class="ico"></span><span class="cd"></span></button>
          </div>
        </div>
        <div class="vbars">
          <div class="vbar hp" title="Health"><i></i></div>
          <div class="vbar st" title="Stamina"><i></i></div>
          <div class="vbar mp" title="Mana"><i></i></div>
        </div>`;
      // Clicking the name tags the champion as the active caster; the bars open their inventory.
      el.querySelector('h3')!.addEventListener('click', () => onSelect(i));
      el.querySelector('.vbars')!.addEventListener('click', () => onInventory(i));
      // Holding an item and clicking anywhere on a card (but a hand) stashes it in their inventory.
      el.addEventListener('click', (e) => {
        if (this.game.cursor && !(e.target as HTMLElement).closest('.hand')) {
          e.stopPropagation();
          this.game.stashCursor(i);
        }
      }, true);
      el.querySelectorAll<HTMLButtonElement>('.hand').forEach((btn) => {
        // Right-click lifts whatever is in the hand onto the pointer.
        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.closeMenu();
          if (!this.game.cursor) this.game.clickSlot(i, Number(btn.dataset['hand']));
        });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const hand = Number(btn.dataset['hand']);
          // Holding an item: put it in this hand instead of opening the action menu.
          if (this.game.cursor) { this.game.clickSlot(i, hand); return; }
          this.toggleMenu(i, hand, btn);
        });
      });
      root.appendChild(el);
      this.panels.push(el);
    });
    addEventListener('keydown', (e) => { if (e.code === 'Escape') this.closeMenu(); });
    addEventListener('click', () => this.closeMenu());
  }

  closeMenu(): void {
    this.menu?.remove();
    this.menu = null;
    this.menuFor = null;
  }

  private toggleMenu(champ: number, hand: number, anchor: HTMLElement): void {
    if (this.menuFor?.champ === champ && this.menuFor.hand === hand) { this.closeMenu(); return; }
    this.closeMenu();
    const g = this.game;
    const ch = g.champions[champ]!;
    if (!ch.alive) return;
    const menu = document.createElement('div');
    menu.className = 'actmenu';
    menu.addEventListener('click', (e) => e.stopPropagation());
    const item = g.itemInHand(champ, hand);
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = `${ch.name} · ${item ? item.name : 'Bare hand'}`;
    menu.appendChild(title);
    const list = g.availableActions(champ, hand);
    if (!list.length) {
      const none = document.createElement('div');
      none.className = 'none';
      none.textContent = 'Nothing to do with this.';
      menu.appendChild(none);
    }
    for (const e of list) {
      const b = document.createElement('button');
      b.disabled = !e.unlocked;
      const skill = SKILL_NAMES[e.action.skill] ?? '';
      b.innerHTML = e.unlocked
        ? `<b>${e.action.name}</b><small>${skill} · ${e.action.ticks}t</small>`
        : `<b>${e.action.name}</b><small>needs ${skill} ${e.minLevel} (you ${e.level})</small>`;
      b.addEventListener('click', () => {
        g.performAction(champ, hand, e.action.id);
        this.closeMenu();
      });
      menu.appendChild(b);
    }
    if (item) {
      const sep = document.createElement('div');
      sep.className = 'sep';
      menu.appendChild(sep);
      const mkBtn = (label: string, hint: string, fn: () => void): void => {
        const b = document.createElement('button');
        b.innerHTML = `<b>${label}</b><small>${hint}</small>`;
        b.addEventListener('click', () => { fn(); this.closeMenu(); });
        menu.appendChild(b);
      };
      mkBtn('Put in pack', 'stow', () => g.stowHand(champ, hand));
      mkBtn('Pick up', 'right-click', () => { if (!g.cursor) g.clickSlot(champ, hand); });
    }
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    menu.style.left = `${Math.max(8, r.left - mw - 8)}px`;
    menu.style.top = `${Math.min(innerHeight - mh - 8, Math.max(8, r.top - 8))}px`;
    this.menu = menu;
    this.menuFor = { champ, hand };
  }

  update(selected: number): void {
    const g = this.game;
    g.champions.forEach((c, i) => {
      const el = this.panels[i]!;
      el.classList.toggle('dead', !c.alive);
      el.classList.toggle('droptarget', !!g.cursor && c.alive);
      el.classList.toggle('sel', i === selected);
      const bars = el.querySelectorAll<HTMLElement>('.vbar');
      const set = (b: HTMLElement, cur: number, max: number, label: string) => {
        b.firstElementChild!.setAttribute('style', `height:${max ? Math.max(0, (100 * cur) / max) : 0}%`);
        b.title = `${label} ${cur}/${max}`;
      };
      set(bars[0]!, c.health, c.maxHealth, 'Health');
      set(bars[1]!, c.stamina, c.maxStamina, 'Stamina');
      set(bars[2]!, c.mana, c.maxMana, 'Mana');
      el.querySelectorAll<HTMLButtonElement>('.hand').forEach((btn) => {
        const hand = Number(btn.dataset['hand']);
        const item = g.itemInHand(i, hand);
        const twoH = c.twoHanded;
        const name = item ? item.name : 'Bare hand';
        btn.title = `${HAND_NAMES[hand]}: ${name}${twoH ? ' (two-handed)' : ''}`;
        btn.classList.toggle('twohand', twoH);
        btn.disabled = !c.alive;
        const key = `${item?.id ?? 'fist'}${item?.potion?.type ?? ''}`;
        if (btn.dataset['icon'] !== key) {
          btn.dataset['icon'] = key;
          btn.querySelector('.ico')!.innerHTML = iconFor(item);
        }
        const left = Math.max(0, c.handReadyAt[hand]! - g.time);
        const cd = btn.querySelector<HTMLElement>('.cd')!;
        cd.style.height = left > 0 ? `${Math.min(100, (100 * left) / Math.max(1, c.handTicks[hand]!))}%` : '0%';
        btn.classList.toggle('busy', left > 0);
      });
    });
    if (g.messages.length !== this.lastLogLen) {
      this.lastLogLen = g.messages.length;
      this.logEl.innerHTML = g.messages.slice(-5).map((m) => `<div>${m}</div>`).join('');
    }
  }
}

