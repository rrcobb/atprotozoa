// battle.js — turn resolution for a wild "weaken" strike and for full
// trainer-vs-trainer rounds (gymnasion PvAI and PvP alike). Pure functions,
// no DOM/localStorage; app.js drives the UI and mutates working copies of the
// pelora objects (each gets an `hp` field added on top of pelora.js's
// `stats.hp` max). Adapted from sites/mootmon/public/lib/battle.js: ready()
// now folds a bound pelor's equipped gear bonus (treasure.js) into its
// working stats, so dug-up gear actually matters in a fight.

import { typeMultiplier, moveName } from "./pelora.js";
import { effectiveStats } from "./treasure.js";

export function ready(monster) {
  const stats = effectiveStats(monster);
  return { ...monster, stats, hp: stats.hp, maxHp: stats.hp, fainted: false };
}

// One attacker -> defender strike. Returns { damage, move, multiplier }.
export function strike(attacker, defender, rng = Math.random) {
  const mult = typeMultiplier(attacker.type, defender.type);
  const raw = attacker.stats.atk - defender.stats.def * 0.4;
  const variance = 0.85 + rng() * 0.15;
  const damage = Math.max(3, Math.round(Math.max(raw, attacker.stats.atk * 0.3) * mult * variance));
  defender.hp = Math.max(0, defender.hp - damage);
  if (defender.hp === 0) defender.fainted = true;
  return { damage, move: moveName(attacker.type), multiplier: mult };
}

// Resolve one full round between a player creature and an opponent
// creature: faster one hits first, second only hits back if still alive.
// Returns an ordered list of strike events, each tagged with `side`.
export function resolveRound(player, opponent, rng = Math.random) {
  const events = [];
  const playerFirst =
    player.stats.spd === opponent.stats.spd
      ? rng() < 0.5
      : player.stats.spd > opponent.stats.spd;

  const attackers = playerFirst
    ? [
        ["player", player, opponent],
        ["opponent", opponent, player],
      ]
    : [
        ["opponent", opponent, player],
        ["player", player, opponent],
      ];

  for (const [side, atk, def] of attackers) {
    if (atk.fainted || def.fainted) continue;
    const result = strike(atk, def, rng);
    events.push({ side, ...result, attacker: atk.species, defender: def.species });
  }
  return events;
}
