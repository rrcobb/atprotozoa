// layout.js — force-directed 2D placement for the walking map. Threads that
// share more resonant likers (see discourse.js's Jaccard similarity) pull
// closer together; every pair of threads repels by default so the map
// doesn't collapse into a point. Small node counts (< 30), so a plain
// all-pairs simulation run to convergence up front (no live physics loop
// needed) is cheap — a few hundred iterations finishes in well under a
// frame's worth of blocking time.

import { jaccard } from "./discourse.js";

const ITERATIONS = 400;
const REPEL = 55000; // repulsion constant
const MIN_DIST = 70; // never let two nodes sit closer than this
const SPRING = 0.06; // attraction strength per unit of similarity
const DAMPING = 0.82;
const SIM_THRESHOLD = 0.02; // ignore near-zero similarity, no edge drawn either

export function layoutThreads(threads) {
  const n = threads.length;
  const nodes = threads.map((t, i) => {
    const angle = (i / n) * Math.PI * 2;
    const r = 220 + (i % 3) * 90;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0 };
  });

  // Precompute pairwise similarity once — it doesn't change across iterations.
  const sims = [];
  for (let i = 0; i < n; i++) {
    sims[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        sims[i][j] = 0;
        continue;
      }
      sims[i][j] = jaccard(threads[i].resonantLikers, threads[j].resonantLikers);
    }
  }

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < n; i++) {
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        let dx = nodes[i].x - nodes[j].x;
        let dy = nodes[i].y - nodes[j].y;
        let dist = Math.hypot(dx, dy) || 0.01;
        if (dist < MIN_DIST) dist = MIN_DIST;

        // Repulsion — every pair, inverse-square.
        const rep = REPEL / (dist * dist);
        fx += (dx / dist) * rep;
        fy += (dy / dist) * rep;

        // Attraction — only for similar threads, pulls toward an ideal
        // distance that shrinks as similarity rises.
        const sim = sims[i][j];
        if (sim > SIM_THRESHOLD) {
          const idealDist = 340 - sim * 260;
          const stretch = dist - Math.max(idealDist, MIN_DIST);
          const pull = stretch * SPRING * sim;
          fx -= (dx / dist) * pull;
          fy -= (dy / dist) * pull;
        }
      }
      nodes[i].vx = (nodes[i].vx + fx * 0.001) * DAMPING;
      nodes[i].vy = (nodes[i].vy + fy * 0.001) * DAMPING;
    }
    for (let i = 0; i < n; i++) {
      nodes[i].x += nodes[i].vx;
      nodes[i].y += nodes[i].vy;
    }
  }

  normalize(nodes);

  return threads.map((t, i) => ({ ...t, x: nodes[i].x, y: nodes[i].y, neighbors: nearestNeighbors(i, sims, n) }));
}

// Rescale so the map's radius is consistent regardless of node count or how
// tightly the simulation happened to settle — keeps walking speed / view
// distance tuning meaningful across different people's networks.
const TARGET_RADIUS = 950;
function normalize(nodes) {
  let cx = 0;
  let cy = 0;
  for (const p of nodes) {
    cx += p.x;
    cy += p.y;
  }
  cx /= nodes.length;
  cy /= nodes.length;
  let maxR = 1;
  for (const p of nodes) {
    p.x -= cx;
    p.y -= cy;
    maxR = Math.max(maxR, Math.hypot(p.x, p.y));
  }
  const scale = TARGET_RADIUS / maxR;
  for (const p of nodes) {
    p.x *= scale;
    p.y *= scale;
  }
}

function nearestNeighbors(i, sims, n, k = 3) {
  const others = [];
  for (let j = 0; j < n; j++) {
    if (j === i) continue;
    if (sims[i][j] > SIM_THRESHOLD) others.push({ index: j, sim: sims[i][j] });
  }
  others.sort((a, b) => b.sim - a.sim);
  return others.slice(0, k);
}
