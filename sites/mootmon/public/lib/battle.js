// battle.js — turn resolution for a wild "weaken" strike and for full
// trainer-vs-trainer rounds. Pure functions, no DOM/localStorage; app.js
// drives the UI and mutates working copies of the creature objects
// (each gets a `hp` field added on top of monster.js's `stats.hp` max).

import { typeMultiplier, moveName } from "./monster.js";

export function ready(monster) {
  return { ...monster, hp: monster.stats.hp, maxHp: monster.stats.hp, fainted: false };
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
