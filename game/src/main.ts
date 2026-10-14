import { Hud } from './hud';
import { iconFor } from './icons';
import { Inventory } from './inventory';
import { loadSettings, saveSettings } from './settings';
import { SpellBar } from './spellbar';
import { level1 } from './levels';
import { View } from './render/view';
import { Game, TICKS_PER_SECOND, type Command } from './sim/game';

const settings = loadSettings();
const viewEl = document.getElementById('view')!;
const hudEl = document.getElementById('hud')!;
const logEl = document.getElementById('log')!;
const overEl = document.getElementById('over')!;
const spellEl = document.getElementById('spell')!;
const pauseEl = document.getElementById('pause')!;

// Settings: a small gear in the corner of the view.
const gear = document.getElementById('gear')!;
const settingsEl = document.getElementById('settings')!;
const pauseBox = settingsEl.querySelector<HTMLInputElement>('#opt-pause-inv')!;
pauseBox.checked = settings.pauseInInventory;
pauseBox.addEventListener('change', () => {
  settings.pauseInInventory = pauseBox.checked;
  saveSettings(settings);
});
gear.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsEl.style.display = settingsEl.style.display === 'none' ? 'block' : 'none';
});
settingsEl.addEventListener('click', (e) => e.stopPropagation());


let manualPause = false;
let game: Game;
let selected = 0;
let spellBar: SpellBar;
let inventory: Inventory;
let view: View;
let hud: Hud;

function start(): void {
  hudEl.innerHTML = '';
  viewEl.querySelector('canvas')?.remove();
  game = new Game(level1(), (Date.now() & 0xffff) || 1);
  view = new View(viewEl, game);
  inventory?.destroy();
  inventory = new Inventory(viewEl, () => game);
  hud = new Hud(hudEl, logEl, game, (i) => select(i), (i) => inventory.toggle(i));
  selected = 0;
  spellBar = new SpellBar(
    spellEl, () => game,
    (r) => game.addSymbol(selected, r),
    () => { game.castSpell(selected); },
    () => game.recantSymbol(selected),
  );
  overEl.style.display = 'none';
  game.messages.push('You descend into the dark.');
}

/** Select champion `i` as the active caster, if alive. */
function select(i: number): void {
  if (game.champions[i]?.alive) selected = i;
}

/** If the active champion has died, hand focus to the next living one. */
function ensureLiveSelection(): void {
  const n = game.champions.length;
  for (let k = 0; k < n; k++) {
    const i = (selected + k) % n;
    if (game.champions[i]!.alive) { selected = i; return; }
  }
}

// Clicking the world: pick up the item under the pointer (it goes to the active champion's
// inventory, or stays on the pointer if there is no room). While holding an item, a click in
// the upper half of the view throws it and a click in the lower half drops it at your feet.
viewEl.addEventListener('click', (e) => {
  if (game.over) return;
  if (game.cursor) {
    const r = viewEl.getBoundingClientRect();
    if (e.clientY - r.top < r.height / 2) game.throwCursor(selected);
    else game.dropCursor();
    return;
  }
  const hit = view.pickFloorItem(e.clientX, e.clientY);
  if (hit) game.pickUpFloor(hit.x, hit.y, hit.index, selected);
});

// Items on the party's own square, shown as a strip you can click.
const feetEl = document.createElement('div');
feetEl.id = 'feet';
viewEl.appendChild(feetEl);
let feetKey = '';
function updateFeet(): void {
  const key = `${game.floorVersion}:${game.px},${game.py}:${selected}`;
  if (key === feetKey) return;
  feetKey = key;
  feetEl.innerHTML = '';
  game.floorHere().forEach((it, i) => {
    const b = document.createElement('button');
    b.innerHTML = iconFor(it);
    b.title = `Pick up ${it.name}`;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!game.cursor) game.pickUpFloor(game.px, game.py, i, selected);
    });
    feetEl.appendChild(b);
  });
}

let lastHealth = 0;
function doAttack(i: number): void {
  game.quickAction(i);
}

const KEYS: Record<string, Command> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'strafeLeft', KeyD: 'strafeRight',
  KeyQ: 'turnLeft', ArrowLeft: 'turnLeft',
  KeyE: 'turnRight', ArrowRight: 'turnRight',
};
/** Held movement keys -> time (ms) the key went down. */
const RUNE_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN'];
const held = new Map<string, number>();
/** A tap fires once; only keys held longer than this auto-repeat. */
const REPEAT_DELAY_MS = 220;
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && game.over) { start(); return; }
  if (e.code === 'KeyI' && !e.repeat) { inventory.toggle(selected); return; }
  if (e.code === 'Escape') { inventory.close(); return; }
  if (e.code === 'KeyP' && !e.repeat) { manualPause = !manualPause; held.clear(); return; }
  if (e.code === 'KeyG' && !e.repeat) { view.bloomOn = !view.bloomOn; return; }
  if (e.code === 'Backspace') { game.recantSymbol(selected); e.preventDefault(); return; }
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) game.castSpell(selected);
    return;
  }
  const rune = RUNE_KEYS.indexOf(e.code);
  if (rune >= 0 && !e.repeat) { game.addSymbol(selected, rune); return; }
  if (e.code >= 'Digit1' && e.code <= 'Digit4' && !e.repeat) {
    const i = Number(e.code.slice(5)) - 1;
    if (e.shiftKey) select(i); else doAttack(i);
    return;
  }
  if (KEYS[e.code]) {
    e.preventDefault();
    if (e.repeat || held.has(e.code)) return; // ignore OS auto-repeat
    held.set(e.code, performance.now());
    game.command(KEYS[e.code]!); // one command per physical press
  }
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

start();
let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const rawDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const paused = manualPause || (settings.pauseInInventory && inventory.isOpen);
  game.frozen = paused;
  pauseEl.style.display = paused ? 'grid' : 'none';
  pauseEl.textContent = manualPause ? 'PAUSED — press P to resume' : 'PAUSED while the inventory is open';
  const dt = paused ? 0 : rawDt;
  acc += dt * TICKS_PER_SECOND;
  while (acc >= 1) {
    acc -= 1;
    // Auto-repeat only for the most recently pressed key, after a delay.
    const entries = [...held];
    const newest = entries[entries.length - 1];
    if (newest && now - newest[1] > REPEAT_DELAY_MS) game.command(KEYS[newest[0]]!);
    game.tick();
  }
  const total = game.champions.reduce((s, c) => s + c.health, 0);
  if (total < lastHealth) view.hitFlash();
  lastHealth = total;
  view.render(dt);
  ensureLiveSelection();
  inventory.update();
  updateFeet();
  hud.update(selected);
  spellBar.update(selected);
  if (game.over) overEl.style.display = 'grid';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
