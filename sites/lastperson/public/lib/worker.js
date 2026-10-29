// Runs one tournament off the main thread. Messages in: {N, seed, batch}.
// Out: {type:"progress", matches, phase} (throttled) then {type:"done", ...,
// rounds} with the survivor arrays transferred (not copied).
import { Tournament } from "./engine.js";

self.onmessage = (ev) => {
  const { N, seed, batch } = ev.data;
  const t0 = performance.now();
  const t = new Tournament(N, seed);
  let last = t0;
  while (!t.step(batch)) {
    const now = performance.now();
    if (now - last > 60) { last = now; self.postMessage({ type: "progress", matches: t.matches, phase: t.phase }); }
  }
  const ms = performance.now() - t0;
  const checksum = t.checksum();
  self.postMessage({ type: "done", N, matches: t.matches, byes: t.byes, champion: t.champion, ms, checksum, rounds: t.rounds, sizes: t.sizes },
    t.rounds.map((a) => a.buffer));
};
