import { TICKS_PER_SECOND, type Game } from './sim/game';
import { RUNE_NAMES, STEP_NAMES, runeCost } from './sim/magic';

/**
 * Rune panel for the selected caster. Four rows, one per step (power, element,
 * form, class), six runes each. Only the current step's row accepts input.
 */
export class SpellBar {
  private rows: HTMLButtonElement[][] = [];
  private statusEl!: HTMLElement;
  private chosenEl!: HTMLElement;
  private castBtn!: HTMLButtonElement;
  private rowEls: HTMLElement[] = [];
  private casterEl!: HTMLElement;

  constructor(
    private root: HTMLElement,
    private getGame: () => Game,
    private onRune: (index: number) => void,
    private onCast: () => void,
    private onRecant: () => void,
  ) {
    root.innerHTML = '';
    this.casterEl = document.createElement('div');
    this.casterEl.className = 'caster';
    root.appendChild(this.casterEl);
    this.chosenEl = document.createElement('div');
    this.chosenEl.className = 'chosen';
    root.appendChild(this.chosenEl);

    STEP_NAMES.forEach((name, step) => {
      const row = document.createElement('div');
      row.className = 'grp';
      row.innerHTML = `<b>${name}</b>`;
      const buttons: HTMLButtonElement[] = [];
      RUNE_NAMES[step]!.forEach((rune, i) => {
        const b = document.createElement('button');
        b.innerHTML = `${i + 1} ${rune}<sup></sup>`;
        b.addEventListener('click', () => this.onRune(i));
        row.appendChild(b);
        buttons.push(b);
      });
      root.appendChild(row);
      this.rowEls.push(row);
      this.rows.push(buttons);
    });

    const actions = document.createElement('div');
    actions.className = 'grp actions';
    const cast = document.createElement('button');
    cast.textContent = 'Cast';
    cast.className = 'cast';
    this.castBtn = cast;
    cast.title = 'Enter';
    cast.addEventListener('click', () => this.onCast());
    const recant = document.createElement('button');
    recant.textContent = '⌫ Recant';
    recant.className = 'recant';
    recant.title = 'Backspace';
    recant.addEventListener('click', () => this.onRecant());
    actions.append(cast, recant);
    root.appendChild(actions);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'seq';
    root.appendChild(this.statusEl);
  }

  update(selected: number): void {
    const g = this.getGame();
    const ch = g.champions[selected]!;
    const step = ch.symbols.length;
    this.casterEl.textContent = `Caster: ${ch.name}  (mana ${ch.mana}/${ch.maxMana})`;
    // Only the current step's row is shown; it swaps as runes are chosen.
    this.rowEls.forEach((row, s) => { row.style.display = s === step ? '' : 'none'; });
    this.rows.forEach((buttons, s) => {
      if (s !== step) return;
      buttons.forEach((b, i) => {
        const cost = runeCost(s, i, ch.symbols[0] ?? -1);
        b.disabled = !ch.alive || ch.mana < cost;
        b.querySelector('sup')!.textContent = String(cost);
      });
    });
    this.chosenEl.innerHTML = ch.symbols.length
      ? ch.symbols.map((r, s) => `<span title="${STEP_NAMES[s]}">${r + 1} ${RUNE_NAMES[s]![r]}</span>`).join('<em>›</em>')
      : '<span class="hint">no runes chosen</span>';
    // Cast button: shows the recovery after the previous spell.
    const left = ch.actionReadyAt - g.time;
    if (left > 0) {
      const p = Math.min(1, Math.max(0, 1 - left / Math.max(1, ch.castTicks)));
      this.castBtn.classList.add('cooling');
      this.castBtn.style.setProperty('--p', String(p));
      this.castBtn.textContent = `Recovering ${(left / TICKS_PER_SECOND).toFixed(1)}s`;
    } else {
      this.castBtn.classList.remove('cooling');
      this.castBtn.textContent = 'Cast';
    }
    const found = g.pendingSpell(selected);
    this.statusEl.className = 'seq ' + (found ? 'ok' : '');
    if (found) {
      const reqLevel = found.spell.baseSkill + found.power;
      const level = ch.skillLevel(found.spell.skill);
      this.statusEl.textContent = `${found.spell.name} · power ${found.power} · needs skill ${reqLevel} (you: ${level})`;
    } else {
      this.statusEl.textContent = step < 2 ? `Choose a ${STEP_NAMES[step]!.toLowerCase()} rune…` : step >= 4 ? 'No known spell for these runes' : 'No known spell yet — choose another rune or recant';
    }
  }
}
