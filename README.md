# Dungeon crawler remake (working title TBD)

Browser-based, real-time, grid-based dungeon crawler. Rules faithful to
*Dungeon Master II: The Legend of Skullkeep*. Rebranded: own name, own art,
audio, maps, text and lore. Only mechanics are reused.

## Decisions

- **Platform:** browser.
- **Stack (proposed):** TypeScript + Vite + Three.js.
  - Simulation is a pure, deterministic TS module with no rendering imports
    (seedable PRNG, tick-based timeline). Rendering is a separate layer.
  - Three.js for the first-person grid view (lets us do lighting, fog,
    particles for spells). A plain Canvas 2D "classic sprite" renderer can
    be added later behind the same view interface.
  - Tests with Vitest: rules in `spec/` become unit tests.
- **Clean room:** `research/` is read-only reference. Never copy code or
  assets from it. Specs in `spec/` are written in our own words.

## Run

```
cd game && npm install
npm run dev      # http://localhost:5173
npm test         # simulation unit tests
```

Controls: W/S move, A/D strafe, Q/E turn, 1-4 quick attack, Shift+1-4 pick the caster; click a hand icon to choose an action. Click a champion's bars (or press I) to open the inventory.
Casting: enter one rune per step (Power, Element, Form, Class) with the buttons or Z X C V B N, then Enter to cast; Backspace recants the last rune. Torch = power + rune 4, fireball = power + 4 + 4.

## Layout

```
game/        the playable prototype (src/sim = rules, src/render = Three.js)
spec/        rules spec, tagged by confidence ([DM1] / [DM2-fn] / [DM2-ok])
research/    cloned reference (reDM2). Reference only.
```

## Status

- [x] spec/00 conventions
- [x] spec/01 champions, skills, damage, regen (from DM1 reference)
- [x] spec/02 magic (4-step runes, 25-spell table, mana, skill gate)
- [x] spec/03 hands and combat actions (DM1 action tables, melee formula)
- [ ] spec/03b items (weapon/armour tables, weights)
- [ ] spec/04 monsters (stats, AI, movement, attacks)
- [ ] spec/05 world (tiles, doors, sensors, triggers, timeline)
- [ ] spec/06 DM2 additions (outdoors, day/night, shops, NPCs, auto-map)
- [ ] verify spec against DM2 (needs a DM2 copy)
- [x] scaffold Vite + TS + Three.js project
- [x] sim: seeded RNG, event timeline, tick loop, champions, XP/levelling, melee combat, monster AI + pathing, regen/hunger, doors
- [x] 14 unit tests passing
- [ ] browser playtest and tuning (renderer not yet visually verified)
- [x] magic: 4-step rune system with the full spell table (potions/Zokathra wait for inventory); 40 tests
- [x] inventory: 25 slots per champion, pointer item, floor items, eating/drinking, potions, loot, belongings drop on death; 78 tests
- [ ] ranged monsters, stairs/multi-level, save/load, sound, throwing/shooting
