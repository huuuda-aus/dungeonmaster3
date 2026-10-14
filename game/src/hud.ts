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
  private menuEntries: ReturnType<Game['availableActions']> = [];

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
            <button class="hand" data-hand="0"><span class="ico"></span><span class="cd"></span><kbd>${i + 5}</kbd></button>
            <button class="hand" data-hand="1"><span class="ico"></span><span class="cd"></span><kbd>${i + 1}</kbd></button>
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
    this.showMenu(champ, hand, anchor);
  }

  /** Is an action menu open? While it is, the number keys 1-3 choose its actions. */
  get menuOpen(): boolean { return this.menu !== null; }

  /** Keyboard: open a champion's hand menu (0 = shield/ready hand, 1 = weapon/action hand). */
  openHandMenu(champ: number, hand: number): void {
    const anchor = this.panels[champ]?.querySelector<HTMLElement>(`.hand[data-hand="${hand}"]`);
    if (anchor) this.showMenu(champ, hand, anchor);
  }

  /** Keyboard: pick the n-th action (1-based) of the open menu. A locked or missing one does nothing. */
  chooseAction(n: number): void {
    const e = this.menuEntries[n - 1];
    if (!this.menuFor || !e || !e.unlocked) return;
    const { champ, hand } = this.menuFor;
    this.game.performAction(champ, hand, e.action.id);
    this.closeMenu();
  }

  private showMenu(champ: number, hand: number, anchor: HTMLElement): void {
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
    this.menuEntries = list;
    if (!list.length) {
      const none = document.createElement('div');
      none.className = 'none';
      none.textContent = 'Nothing to do with this.';
      menu.appendChild(none);
    }
    list.forEach((e, n) => {
      const b = document.createElement('button');
      b.disabled = !e.unlocked;
      const skill = SKILL_NAMES[e.action.skill] ?? '';
      const key = `<kbd>${n + 1}</kbd>`;
      b.innerHTML = e.unlocked
        ? `<b>${key}${e.action.name}</b><small>${skill} · ${e.action.ticks}t</small>`
        : `<b>${key}${e.action.name}</b><small>needs ${skill} ${e.minLevel} (you ${e.level})</small>`;
      b.addEventListener('click', () => {
        g.performAction(champ, hand, e.action.id);
        this.closeMenu();
      });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    // Open over the space to the right of the bars (the card's info area), covering it.
    const area = (anchor.closest('.info') ?? anchor) as HTMLElement;
    const r = area.getBoundingClientRect();
    menu.style.width = `${r.width}px`;
    menu.style.minHeight = `${r.height}px`;
    const mh = menu.offsetHeight;
    menu.style.left = `${r.left}px`;
    menu.style.top = `${Math.max(8, Math.min(innerHeight - mh - 8, r.top))}px`;
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

