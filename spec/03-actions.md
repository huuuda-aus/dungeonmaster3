# 03 Hands and combat actions

Source basis: DM1/CSB action tables and melee code. `[DM1]` unless noted.

## Hands `[design]`

Each champion has two hands: ready (0) and action (1). **Either hand can act**
(DM1 only let the action hand act). Each hand has its own cooldown. A
two-handed weapon sits in the action hand and fills both hands.
An item offers up to three actions; the first is always available, the others
need a skill level (the level of that action's skill). An empty hand offers
Punch, Kick, War Cry.

## Action data `[DM1]`

Per action: busy ticks, damage factor (1/32 units), hit probability parameter,
defense modifier while busy, skill used/trained, experience, stamina.
See `src/sim/actions.ts` for the table (values taken from the reference).

Hidden skills by group: Fighter 4 Swing, 5 Thrust, 6 Club, 7 Parry;
Ninja 8 Steal, 9 Fight, 10 Throw, 11 Shoot; Priest 12 Identify, 13 Heal,
14 Influence, 15 Defend; Wizard 16-19 Fire, Air, Earth, Water.

## Melee strike `[DM1]`

1. Reach: a back-row champion cannot reach if the living champion in front of
   them (cell 2 behind 1, cell 3 behind 0) exists. Not performed: half xp, half cooldown.
2. Hit if `dexterity > rnd(32) + monsterDodge + 2*mapDifficulty - 16`,
   or a 25% automatic hit, or `isLucky(75 - hitProb)`.
3. Damage: `S = strength(hand)`; `D = S + rnd(S/2+1)`; `D = D * factor >> 5`;
   `D = rnd(32) + D - (rnd(32) + monsterDefense + 2*difficulty)`.
   If `D <= 1` a small-damage path applies (may do 0).
   Then `D>>=1; D += rnd(D) + rnd4; D += rnd(D); D>>=2; D += rnd4 + 1`.
   With probability `skillLevel/64` the damage doubles plus 10 (critical).
4. Experience: action xp, plus `(D * monster.xpFactor >> 4) + 3`. A miss halves
   the action xp.
5. Stamina: `action.stamina + rnd2` up front, then `rnd4 + 4` on a hit or
   `rnd2 + 2` on a miss.
6. While the hand is busy, the action's defense modifier applies to the
   champion's wound defense (Block/Parry raise it; Thrust/Stab lower it).

## Other `[design]` where noted

- Smashing a closed door: Chop, Bash, Hack, Berserk, Kick, Swing; needs strength 28.
- War Cry: chance `40% + 6%/skill level` to make the creature in front lose
  its next turns `[design]`.
- Non-material creatures ignore physical attacks.
- Throwing and shooting are not implemented yet.
