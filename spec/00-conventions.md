# Spec conventions

Clean-room rules spec for the remake. Written in our own words and notation.
No code is copied from any reference. Formulas are facts about game
behaviour; implementation is ours.

## Confidence tags

Every rule carries one tag:

| Tag | Meaning |
|---|---|
| `[DM1]` | Seen in DM1/CSB reference only. **Hypothesis for DM2.** DM2 reused much of the engine but rewrote or dropped functions. |
| `[DM2-fn]` | A DM2 function exists with matching behaviour, per reDM2 notes (not yet checked by us). |
| `[DM2-ok]` | Verified against DM2 binary or play. Nothing carries this yet. |
| `[design]` | Our own decision. |

Until a rule is verified in DM2, treat `[DM1]` as "good default, may differ".

## Random helpers (as used by the rules)

- `rnd(n)`   uniform integer 0..n-1
- `rnd2()`   0 or 1
- `rnd4()`   0..3
- `scaled(a, bits, b)` = `(a * b) >> bits` (integer, truncating)
- `clamp(lo, v, hi)`, `min`, `max`

All integer math is truncating and sometimes 16-bit. The remake should use
a seedable PRNG so runs are reproducible (the original PRNG was a plain LCG,
never clock-seeded per reDM2 notes).

## Time

Game time is an integer tick counter. Events (monster moves, poison, regen,
projectiles, re-enabling actions) sit on a timeline ordered by tick, then by
priority. Everything periodic below is expressed in ticks.
