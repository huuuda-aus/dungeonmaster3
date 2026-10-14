# Dungeon crawler remake (working title TBD)

A browser-based, real-time, grid-based dungeon crawler in the spirit of
*Dungeon Master* and *Dungeon Master II: The Legend of Skullkeep*. The rules
follow the originals; the name, art, audio, maps, text and lore are our own.
Only mechanics are reused.

## Run

```
cd game
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run build    # typecheck + production build
```

## Controls

| Input | Action |
|---|---|
| W / S | Move forward / back |
| A / D | Strafe left / right |
| Q / E (or arrow keys) | Turn left / right |
| Click a hand icon | Open that hand's action list; click an action to perform it |
| Right-click a hand | Lift the item in it onto the cursor |
| 1-4 | Quick attack: the first action of that champion's weapon hand |
| Shift + 1-4, or click a champion's name | Make that champion the active caster |
| Click a champion's bars, or I | Open that champion's inventory |
| Click an item in the world | Take it (it goes to the active champion's pack, else onto the cursor) |
| Click upper half of the view, holding an item | Throw it; lower half drops it at your feet |
| Z X C V B N | Choose rune 1-6 for the current spell step |
| Enter / Space | Cast; Backspace recants the last rune |
| P | Pause |
| G | Toggle the bloom glow |
| Esc | Close menus / inventory |
| R | Restart after the party falls |

The gear icon in the corner of the view has a setting to pause automatically
while an inventory is open. It is off by default, as in the originals.

### Casting

A spell is built from runes in four steps, six runes each:
**Power, Element, Form, Class**. Each rune costs mana when chosen. You can cast
once the runes so far match a known spell: Magic Torch is power + rune 4,
Fireball is power + 4 + 4. Higher power needs a higher skill level; trying
spells above your level fails but trains the skill. See `spec/02-magic.md` for
the full spell table.

## What is in

- Deterministic tick simulation (seeded RNG, event timeline) kept free of any
  rendering code, so it can be unit-tested.
- Four champions with stats, 20 skills, experience, level-ups, hunger and thirst,
  regeneration and wounds.
- Two hands per champion, each with its own actions (from the original action
  tables), cooldowns, stamina costs and defense modifiers. Two-handed weapons.
- Melee, thrown items, and 25 rune spells (projectiles, shields, light,
  invisibility, potions and more).
- Monsters that path toward the party and attack, including a non-material one
  that only one spell can hurt.
- Inventory: 25 slots per champion, items on the floor, eating, drinking,
  potions, monster loot, belongings dropped on death.
- Three.js renderer: a nearly dark dungeon lit by the party's own light,
  shadows, particle fireballs, and a bloom pass.

## Layout

```
game/        the playable prototype
  src/sim/     rules (no rendering imports): champions, actions, magic, items, game loop
  src/render/  Three.js view and particle effects
  src/         HUD, inventory, spell bar, settings
  tests/       Vitest suites
spec/        rules specs, tagged by confidence
```

## Specs

The specs describe the rules in our own words. Each rule carries a tag:
`[DM1]` seen only in the DM1/CSB reference (a hypothesis for DM2),
`[DM2-fn]` / `[DM2-ok]` checked against DM2 (nothing is yet), `[design]` our own
choice.

- `spec/00-conventions.md`
- `spec/01-champions-and-combat.md`: stats, skills, damage, wounds, regeneration
- `spec/02-magic.md`: rune system and the spell table
- `spec/03-actions.md`: hands and combat actions

## Clean room

Reference material used while writing the specs (a clone of the reDM2 project
and reconstructed DM1/CSB source) lives in an untracked `research/` folder and is
**not** part of this repository: it is third-party work. Nothing in `game/` is
copied from it; the code is written from the specs.

## Status

Done: simulation, combat, magic, inventory, throwing, pause, and the
renderer. 92 unit tests pass.

Not yet:

- Specs for items, monsters and the world (`spec/03b` to `spec/05`).
- Shooting (bows and slings) and ranged or spellcasting monsters.
- Stairs and multiple levels, keys, levers, pressure plates.
- Save and load, sound.
- Checking the rules against DM2 itself (needs a copy of the game); most
  numbers come from DM1 and a few are our own tuning.
