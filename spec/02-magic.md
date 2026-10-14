# 02 Magic (rune system)

Source basis: DM1/CSB reference (spell table, rune costs, cast logic). All `[DM1]`.
Rune labels in the remake are our own; positions and effects follow the reference.

## Building a spell `[DM1]`

Four steps, six runes each: **1 Power, 2 Element, 3 Form, 4 Class**. A champion
enters one rune per step, in order, paying mana for each rune as it is entered.
After the power rune, the runes entered so far are matched exactly against the
spell table; Cast works whenever they match. Examples (numbers = rune position):

- Magic Torch (light): power, **4**
- Fireball: power, **4, 4**
- Open Door: power, **6**

Meaningless runes clear the caster. Recanting removes the last rune (no refund).

## Mana `[DM1]`

`baseCost[step][rune]`:
```
step 1: 1 2 3 4 5 6
step 2: 2 3 4 5 6 7
step 3: 4 5 6 7 7 9
step 4: 2 2 3 4 6 7
```
Step 1 costs the base. Steps 2-4 cost `base * mult[powerRune] / 8` with
`mult = 8, 12, 16, 20, 24, 28`.

## Skill gate and practice `[DM1]`

`required = spell.baseSkill + power (1..6)`. For each missing skill level,
roll 0..127; if it exceeds `min(wisdom + 15, 115)` the spell fails ("needs more
practice") and the caster still earns `xp >> missing`. Mana is already spent.
`xp = rnd(8) + (req << 4) + (((power-1) * baseSkill) << 3) + req^2`, earned on
success too. Success applies the spell and disables the caster for the spell's
cooldown.

## Spell table `[DM1]`

Rune sequence after the power rune; skills: Fire 16, Air 17, Earth 18, Water 19,
Heal 13, Defend 15.

| Spell | Runes | Base | Skill | Cooldown |
|---|---|---|---|---|
| Party Shield | 1 4 | 2 | Defend | 30 |
| Magic Footprints | 1 5 2 | 1 | Earth | 18 |
| Invisibility | 3 2 6 | 3 | Air | 45 |
| Poison Cloud | 3 1 | 3 | Water | 27 |
| Thieves' Eye | 3 2 5 | 3 | Earth | 33 |
| Lightning Bolt | 3 3 5 | 4 | Air | 30 |
| Light | 3 4 5 | 4 | Air | 22 |
| Magic Torch | 4 | 1 | Fire | 15 |
| Fireball | 4 4 | 3 | Fire | 42 |
| Fire Shield | 4 5 4 | 4 | Defend | 28 |
| Weaken Nonmaterial | 5 2 | 1 | Earth | 20 |
| Poison Bolt | 5 1 | 1 | Water | 16 |
| Darkness | 5 4 6 | 1 | Defend | 12 |
| Open Door | 6 | 1 | Air | 15 |
| Potions (9) | various | | Heal/Defend/Priest/Water | | 
| Zokathra (conjure item) | 6 3 5 | 0 | Wizard | 15 |

Potions and Zokathra need a flask / free hand: stubbed until inventory exists.

## Effects `[DM1]` unless noted

- **Projectile energy** `KE = clamp(21, (power+2) * (4 + 2*skillLevel), 255)`
  (Open Door doubles the skill level). Range is `[design]`: `min(14, 3 + KE/16)` cells.
- **Explosion damage** from attack `A`: `L = A/2 + 1; damage = L + rnd(L) + 1`.
  Lightning uses `A = KE/2` and halves the damage again. Poison bolt uses
  `A = KE/4` and poisons instead of damaging (`[design]` DoT: `max(1, A/4)` x5 pulses).
- **Poison cloud**: lingers at the impact cell; per pulse `max(1, min(A/32, 4) + rnd2)`
  (x2 and every 4 ticks `[design]`), `A -= 3` per pulse until below 6.
- **Self power** `sp = (power+1) * 4`.
  Party shield: defense `sp` (quartered if already > 50), lasts `sp^2` ticks.
  Fire shield: `ticks = sp^2 + 100`, defense `ticks/32`.
  Invisibility: `sp * 8` ticks. Thieves' eye: `(sp/2)^2` ticks. Footprints: `sp^2` ticks.
  Light: table amount of `(sp/2) - 1`, `10000 + ((sp-8) << 9)` ticks.
  Torch: amount of `(sp/4) + 1`, `2000 + ((sp-3) << 7)` ticks. Darkness: `-(sp/4)`, 98 ticks.
  Light amount table: `0 5 12 24 33 40 46 51 59 68 76 82 89 94 97 100`.
- **Doors**: Open Door opens it; fire/lightning blast it open if the explosion is strong (`[design]` threshold 40).
- **Non-material creatures** ignore physical hits and most spells; only
  Weaken Nonmaterial harms them.

## Remake choices `[design]`

Rune names are our own. Monster resistances and the non-material wraith are
ours. Potions, flasks and Zokathra wait for the inventory.
