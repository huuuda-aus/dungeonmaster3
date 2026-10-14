# 01 Champions, skills, damage

Source basis: DM1/CSB reference (`F0284..F0331`, champion module). All rules
`[DM1]` unless noted. See `00-conventions.md`.

## 1. Data model

**Statistics** (each has current / maximum / minimum): `[DM1]`

| idx | name |
|---|---|
| 0 | Luck |
| 1 | Strength |
| 2 | Dexterity |
| 3 | Wisdom |
| 4 | Vitality |
| 5 | Anti-magic |
| 6 | Anti-fire |

**Vitals:** current/max Health (cap 999), Stamina (cap 9999), Mana (cap 900),
plus Food and Water counters (can go negative, floor -1024), Load (weight
carried), Wounds bitmask, Direction/Cell in the party formation.

**Skills** `[DM1]` 20 entries, each with `experience` and `temporaryExperience`.
- 0..3 are base skills: Fighter, Ninja, Priest, Wizard.
- 4..19 are hidden skills, four per base skill. Hidden skill `i` belongs to
  base `(i - 4) / 4`.
  - 4..7 Fighter group (4 = Swing; others per original: climb, disarm, parry)
  - 8..11 Ninja group (10 = Throw, 11 = Shoot; 8, 9 = steal, fight)
  - 12..15 Priest group (13 = Heal, 14 = Influence, 15 = Defend; 12 = identify)
  - 16..19 Wizard group (fire, air, earth, water)
  - Names marked "per original" beyond the indices the code references are
    from memory and need confirmation.

**Slots** `[DM1]`: 0 ready hand, 1 action hand, 2.. head/torso/legs, 5 feet,
10 neck, remaining are pouch/quiver/backpack. Wound bits are indexed by the
same slot numbers: wound bit `1 << slot` for slots 0..5.

## 2. Skill level from experience `[DM1]`

```
exp  = skill.experience + (ignoreTemp ? 0 : skill.temporaryExperience)
if hidden skill:
    base = skills[(idx-4)/4]
    exp  = (exp + base.experience + (ignoreTemp ? 0 : base.temporaryExperience)) / 2
level = 1
while exp >= 500: exp /= 2; level += 1      // so thresholds 500, 1000, 2000, ...
```

- If the party is resting, level is always 1.
- Unless "ignore object modifiers" is set, add item bonuses:
  - Firestaff in action hand: +1; complete Firestaff: +2.
  - Neck item: Wizard +1 Pendant Feral; Defend +1 Ekkhard Cross;
    Heal +1 Gem of Ages **or** Sceptre of Lyf in action hand (not cumulative);
    Influence +1 Moonstone.
- (A DM1 later-version fix made the Firestaff bonus stack with the others.
  Remake: stack them.) `[design]`

## 3. Gaining experience `[DM1]`

`addExperience(champion, skill, amount)`:

1. If skill is a combat hidden skill (indices 4..11) and no creature has
   attacked the party in the last 150 ticks: `amount /= 2`.
2. If `amount > 0`: multiply by current map difficulty if that is non-zero.
3. Record base-skill level before.
4. If hidden skill and a creature attacked within the last 25 ticks:
   `amount *= 2`.
5. `skill.experience += amount`; `skill.temp += clamp(1, amount/8, 100)` while
   `skill.temp < 32000`. If hidden skill, also add `amount` to the base skill.
6. If the base-skill level rose, apply the **level-up bonuses**:

Level-up rolls: `minor = rnd2()`, `major = 1 + rnd2()`, `vit = rnd2()`
(non-Priest: `vit &= newLevel`, so even levels give 0).
- `Vitality.max += vit`
- `AntiFire.max += rnd2() & ~newLevel` (only even levels can give +1)
- Class bonuses (`stamBase = maxStamina`):

| Class | Stamina amt | Health-level factor | Stats | Mana |
|---|---|---|---|---|
| Fighter | `stamBase/16` | `newLevel*3` | Str.max += major; Dex.max += minor | none |
| Ninja | `stamBase/21` | `newLevel*2` | Str.max += minor; Dex.max += major | none |
| Wizard | `stamBase/32` | `newLevel` | Wis.max += major | `+= newLevel + newLevel/2`, then extra |
| Priest | `stamBase/25` | `newLevel + (newLevel+1)/2` | Wis.max += minor | `+= newLevel`, then extra |

- Wizard/Priest extra: `Mana.max += min(rnd4(), baseLevel-1)`, cap 900;
  `AntiMagic.max += rnd4()`.
- Finally for all classes:
  `Health.max += factor + rnd(factor/2 + 1)` (cap 999);
  `Stamina.max += amt + rnd(amt/2 + 1)` (cap 9999).
- Show message "<name> just gained a <class> level!"

## 4. Derived values

**Stamina adjust** `adj(champ, v)` `[DM1]`: if `stamina < maxStamina/2` then
`h = v/2; return h + h * stamina / (maxStamina/2)`, else `v`.
(The original has an evaluation-order bug that gave different results by
platform. Use the above, the intended behaviour.)

**Max load** `[DM1]`:
```
load = adj(champ, Strength.cur * 8 + 100)
if wounds != 0: load -= load >> (legsWounded ? 2 : 3)
if feet item == Elven Boots: load += load >> 4
load = round up to multiple of 10 after adding 9
```

**Movement ticks** `[DM1]`:
```
max = maxLoad
if load <  max:   ticks = 2; if load*8 > max*5: ticks += 1; woundTicks = 1
else:             ticks = 4 + ((load - max) * 4) / max; woundTicks = 2
if feet wounded: ticks += woundTicks
if feet item == Boots of Speed: ticks -= 1
```
(Original bug: load exactly equal to max is treated as overloaded. Fix in
remake.) `[design]`

**Dexterity (for dodging/hit rolls)** `[DM1]`:
```
d = rnd(8) + Dex.cur
d -= (d/2) * load / maxLoad
d = max(2, d)
if resting: d /= 2
return clamp(1 + rnd(8), d/2, 100 - rnd(8))
```

**Strength for a slot (melee/throw power)** `[DM1]`:
```
s = rnd(16) + Str.cur
w = weight of item in slot; q = maxLoad/16
if w <= q:                s += w - 12
elif w <= q + (q-12)/2:   s += (w - q)/2
else:                     s -= (w - (q + (q-12)/2)) * 2
if item is a weapon:
    s += weapon.strength
    lvl = 0
    class swing or dagger/axe: lvl  = skillLevel(Swing)
    class not swing and < bow:  lvl += skillLevel(Throw)
    class bow..magic weapon:    lvl += skillLevel(Shoot)
    s += lvl * 2
s = adj(champ, s)
if hand slot wounded: s /= 2
return clamp(0, s/2, 100)
```

**Luck check** `isLucky(champ, pct)` `[DM1]`:
- 50% chance: if `rnd(100) > pct` return true immediately (no luck change).
- else if `Luck.cur <= 0` result false; else
  `result = rnd(Luck.cur * 2) > pct`.
- Luck changes by -2 on lucky result, +2 on unlucky, clamped to its min/max.

**Throw stamina cost** `[DM1]`: `w = weight/2`; `cost = clamp(1, w, 10)`;
`while (w -= 10) > 0: cost += w/2`.

## 5. Damage and wounds

### 5.1 Wound defense of one body location `[DM1]`

```
shieldDef = 0
for hand in {ready, action}:
    if item is a shield-type armour:
        shieldDef += (strengthForSlot(hand) + armourDefense(item, sharp))
                       * woundFactor[wound] >> (hand == wound ? 4 : 5)
d = rnd(Vitality.cur/8 + 1);  if sharp: d /= 2
d += champ.actionDefense + champ.shieldDefense + party.shieldDefense + shieldDef
if wound slot > action hand and armour is there: d += armourDefense(item, sharp)
if that location already wounded: d -= 8 + rnd4()
if resting: d /= 2
return clamp(0, d/2, 100)
```

### 5.2 Applying an attack `addDamage(champ, attack, allowedWounds, type)` `[DM1]`

Attack types: normal, fire, self, blunt, sharp, magic, psychic, lightning.

```
if attack <= 0 or champ dead: return 0
if type != normal:
    defense = average woundDefense over allowed wound locations
              (sharp flag set for type sharp)
    switch type:
      psychic:  wf = 115 - Wisdom.cur
                attack = wf <= 0 ? 0 : scaled(attack, 6, wf)
                (skips the common defense step below)
      magic:    attack = statAdjusted(AntiMagic, attack) - party.spellShield
                (skips the common defense step below)
      fire:     attack = statAdjusted(AntiFire, attack) - party.fireShield
      self:     defense = defense/2 + skillLevel(Ninja)
      blunt/sharp/lightning: nothing extra
    if type is fire/self/blunt/sharp/lightning:
        if attack <= 0: return 0
        attack = scaled(attack, 6, 130 - defense)
    // psychic and magic skip the defense scaling above
    if attack <= 0: return 0
    threshold = statAdjusted(Vitality, rnd(128) + 10)
    if attack > threshold:
        do: wounds |= (1 << rnd(8)) & allowedWounds
        while attack > (threshold <<= 1) and threshold != 0
    if resting: wake the party
pendingDamage[champ] += attack
return attack
```

`statAdjusted(stat, a)`: `f = 170 - stat.cur; if f < 16 return a/8; else scaled(a, 7, f)`.

Notes:
- Original oddities: Vitality mistakenly *increases* wound chance (bug in
  the original); the Atari ST build ignored stats entirely. Remake `[design]`:
  higher stat reduces damage and wound chance, as the design obviously
  intended.
- Fire with party fire shield above the attack gave huge damage in the
  original (negative intermediate). Fixed above by the `attack <= 0` check.

### 5.3 Applying pending damage (once per frame/tick) `[DM1]`

For each living champion: OR in pending wounds, clear. If pending damage > 0:
`health -= damage`. If `health <= 0` -> kill. Otherwise show damage, and
schedule/refresh a "hide damage indicator" event 5 ticks later.

### 5.4 Party-wide damage `damageAll(attack, wounds, type)` `[DM1]`

`spread = attack/8 + 1; base = attack - spread; each champion receives
max(1, base + rnd(spread*2))`; returns the count who took damage.

### 5.5 Poison `[DM1]`

`poison(champ, potency)`: immediate damage `max(1, potency/64)` (normal type).
If `potency - 1 > 0`: schedule a poison event 36 ticks later with
`potency-1`. Each firing repeats the same until potency hits 0.
Unpoison cancels all poison events for that champion.

### 5.6 Stamina drain `[DM1]`

`stamina -= x`. If it falls <= 0: set to 0 and apply `(-stamina)/2` normal
damage. Cap at max.

## 6. Periodic effects (every N ticks; party "tick" handler) `[DM1]`

Time criterion `t = ((time & 0x80) + ((time & 0x100) >> 2) + ((time & 0x40) << 2)) >> 2`
(a pseudo-random-ish 0..~? value that spreads effects across time).

Per living champion:
1. **Mana regen** if `mana < maxMana` and `t < Wisdom.cur + wizardLvl + priestLvl`:
   `gain = maxMana/40 (x2 if resting) + 1`; costs stamina
   `gain * max(7, 16 - wizardLvl - priestLvl)`; `mana += min(gain, deficit)`.
   If mana above max: decrement by 1.
2. **Temporary experience** on every skill decays by 1.
3. **Stamina/food/water cycle:** compute a cycle count starting at 4, +2 for
   each halving of max stamina that current stamina is below. Loop: if food
   or water are >= 0, stamina gains; if < -512, stamina loses (only while
   "stamina above half"); food falls 2 per cycle (or `cycles/2` when low),
   water 1 (or `cycles/4` when low). Per-cycle stamina amount =
   `clamp(1, maxStamina/256 - 1, 6)`, doubled when resting, +1 if idle more
   than 80 ticks, +1 more if idle more than 250 ticks.
   Net stamina change applied with the drain rule 5.6. Food/water floor -1024.
4. **Health regen** if `health < max` and `stamina >= max/4` and
   `t < Vitality.cur + 12`: `gain = maxHealth/128 + 1` (x2 resting, +50% +1 if
   Ekkhard Cross); `health += min(gain, deficit)`.
5. **Stat normalise** every 256 ticks (64 resting): each of the 7 stats
   moves toward max by 1 if below; if above max, decreases by `cur / max`.
6. If not resting and nobody attacked in 60 ticks, champion formation
   direction snaps to party direction.
7. Scent trail strengths decay.

## 7. Throwing `[DM1]`

- Throw skill XP: `8` base, `+4` if the thrown thing is a weapon,
  `+ kineticEnergy/4` if weapon class is a throwable (<= poison dart).
- Kinetic energy: `strengthForSlot + weaponKE`, then
  `+= rnd(16) + KE/2 + throwLevel`.
- Attack value: `clamp(40, throwLevel*8 + rnd(32), 200)`.
- Step energy: `max(5, 11 - throwLevel)`.
- Costs: throw stamina cost (section 4); champion's action disabled for 4
  ticks; party movement blocked toward the throw direction for 4 ticks.
- Projectile launched from the cell chosen by champion position and side.

## 8. Projectile spell cast `[DM1]`

If `mana < cost`: fail. Else `mana -= cost`;
`stepEnergy = 10 - min(8, maxMana/8)`; if `KE < stepEnergy*4`: `KE += 3`,
`stepEnergy -= 1`; attack value 90; launch. Movement block 4 ticks.

## 9. Open questions for DM2

- Do DM2's numbers (500 XP threshold, divisor constants) match? reDM2 has
  `champ_add_damage`, `champ_armour_absorb`, `champ_combat_value`,
  `champ_damage_tick`, `champ_stat_roll`, `champ_add_skill_experience`,
  `champ_load_*` ported: **compare these first**.
- DM2 adds shops/money and different class names? check formation and
  "recruit mid-game" rules.
- Does DM2 still have Food/Water, or does it change hunger? Check
  `champ_damage_tick`.
- Monster damage, armour tables, weapon tables: not covered yet.
