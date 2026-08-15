// battle.js — turns a SimCluster (self + moots, from cluster.js) into two
// ant colonies and fights them: forest vs desert, deterministic and seeded
// so the same handle refights the identical war every time (rematching
// doesn't reroll the outcome — same cluster, same fight, same result).
//
// No Math.random() anywhere. Team assignment and every attack roll come out
// of a mulberry32 PRNG seeded from the root handle's DID, same approach as
// sites/botbattle/public/lib/battle.js.

const TE = new TextEncoder();

function hash32(str) {
  let h = 5381;
  for (const b of TE.encode(str)) {
    h = ((h << 5) + h + b) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Real profile numbers -> small battle-friendly stats. Log-scaled so a
// mega-account doesn't just steamroll on raw follower count, same spirit as
// botbattle's statsFor.
function antStatsFor(profile) {
  const followers = profile.followersCount || 0;
  const follows = profile.followsCount || 0;
  const posts = profile.postsCount || 0;

  const hp = Math.round(clamp(10 + Math.log2(followers + 1) * 6, 10, 90));
  const atk = Math.round(clamp(2 + Math.log2(posts + 1) * 1.6, 1, 20));
  const spd = Math.round(clamp(2 + Math.log2(follows + 1) * 1.4, 1, 20));
  return { hp, atk, spd };
}

const ROSTER_CAP = 40; // total ants across both colonies, so playback stays watchable

// Split a cluster into two colonies. Uses a per-ant seed derived from the
// root DID so team assignment is fixed for a given handle but shuffles
// fresh for a different one. Sorting by that seed and alternating
// forest/desert guarantees a near-even split (off by at most one ant)
// regardless of how the hashes happen to land.
export function buildColonies(cluster) {
  const all = [cluster.self, ...cluster.pool].slice(0, ROSTER_CAP);
  const rootDid = cluster.did;

  const seeded = all.map((profile) => ({
    profile,
    seed: hash32(`${rootDid}|${profile.did}`),
  }));
  seeded.sort((a, b) => a.seed - b.seed);

  const forest = [];
  const desert = [];
  seeded.forEach(({ profile }, i) => {
    const s = antStatsFor(profile);
    const ant = {
      id: profile.did,
      handle: profile.handle,
      displayName: profile.displayName || profile.handle,
      avatar: profile.avatar || "",
      isSelf: profile.did === rootDid,
      team: i % 2 === 0 ? "forest" : "desert",
      hp: s.hp,
      maxHp: s.hp,
      atk: s.atk,
      spd: s.spd,
      alive: true,
      kills: 0,
      damageDealt: 0,
    };
    (ant.team === "forest" ? forest : desert).push(ant);
  });

  return { forest, desert, truncated: all.length < cluster.pool.length + 1 };
}

// Run the whole war to completion and return every event, ready for
// playback. Deterministic: same colonies in, same events out.
export function fight(colonies) {
  const forest = colonies.forest.map((a) => ({ ...a }));
  const desert = colonies.desert.map((a) => ({ ...a }));
  const byId = new Map([...forest, ...desert].map((a) => [a.id, a]));

  const seed = hash32(forest.map((a) => a.id).join(",") + "!" + desert.map((a) => a.id).join(","));
  const rng = mulberry32(seed);

  const events = [];
  const MAX_ROUNDS = 200;
  let round = 0;

  const aliveOf = (team) => team.filter((a) => byId.get(a.id).alive);

  while (aliveOf(forest).length && aliveOf(desert).length && round < MAX_ROUNDS) {
    round++;
    events.push({ type: "round", round });

    const order = [...forest, ...desert]
      .map((a) => byId.get(a.id))
      .filter((a) => a.alive)
      .map((a) => ({ a, tiebreak: rng() }))
      .sort((x, y) => y.a.spd - x.a.spd || y.tiebreak - x.tiebreak)
      .map((x) => x.a);

    for (const attacker of order) {
      if (!attacker.alive) continue;
      const enemyTeam = attacker.team === "forest" ? desert : forest;
      const targets = aliveOf(enemyTeam);
      if (!targets.length) break;

      const target = byId.get(targets[Math.floor(rng() * targets.length)].id);
      const variance = 0.75 + rng() * 0.5; // +/-25% swing so hits aren't uniform
      const dmg = Math.max(1, Math.round(attacker.atk * variance));
      target.hp = Math.max(0, target.hp - dmg);
      attacker.damageDealt += dmg;

      const died = target.hp === 0;
      if (died) {
        target.alive = false;
        attacker.kills++;
      }

      events.push({
        type: "attack",
        round,
        attackerId: attacker.id,
        targetId: target.id,
        dmg,
        targetHp: target.hp,
        targetMaxHp: target.maxHp,
        died,
      });
    }
  }

  const forestAlive = aliveOf(forest).length;
  const desertAlive = aliveOf(desert).length;
  let winner;
  if (forestAlive === desertAlive) {
    const forestHp = aliveOf(forest).reduce((s, a) => s + byId.get(a.id).hp, 0);
    const desertHp = aliveOf(desert).reduce((s, a) => s + byId.get(a.id).hp, 0);
    winner = forestHp >= desertHp ? "forest" : "desert";
  } else {
    winner = forestAlive > desertAlive ? "forest" : "desert";
  }

  const finalAnts = [...byId.values()];
  const mvp = finalAnts.reduce((best, a) =>
    !best || a.kills > best.kills || (a.kills === best.kills && a.damageDealt > best.damageDealt) ? a : best
  , null);

  return {
    events,
    rounds: round,
    winner,
    forestSurvivors: forestAlive,
    desertSurvivors: desertAlive,
    forestTotal: forest.length,
    desertTotal: desert.length,
    finalAnts,
    mvp,
    timedOut: round >= MAX_ROUNDS,
  };
}
