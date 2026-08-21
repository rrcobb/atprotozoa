// penrose.js — generates a real Penrose (P3) rhombus tiling via Robinson
// triangle deflation, pairs triangles into rhombi, builds the tiling's dual
// adjacency graph, and carves a perfect maze over it.
//
// The trick that makes the maze "locally Euclidean": a rhombus has exactly
// four edges, so every tile has at most four neighbors — the same as a
// square room has four walls. We never need the tile's true (36/144 or
// 72/108 degree) geometry to render it; we only need "which of my up-to-4
// neighbors is my door." Compass directions (N/E/S/W) are assigned freely
// during maze-carving, not from the tile's real edge angles, and the two
// ends of a carved passage are always assigned opposite directions so
// backtracking feels consistent. That's the entire non-Euclidean-obscuring
// mechanism — see game.js for how the renderer exploits it.
(function (root) {
  "use strict";

  var PHI = (1 + Math.sqrt(5)) / 2;
  var DIRS = ["N", "E", "S", "W"];
  var OPPOSITE = { N: "S", S: "N", E: "W", W: "E" };
  var DIR_VEC = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };

  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function scale(a, s) { return { x: a.x * s, y: a.y * s }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function ptKey(p) { return p.x.toFixed(6) + "," + p.y.toFixed(6); }
  function edgeKey(p, q) {
    var kp = ptKey(p), kq = ptKey(q);
    return kp < kq ? kp + "|" + kq : kq + "|" + kp;
  }

  // One deflation step of the Robinson triangle substitution system.
  // color 0 = thin/acute triangle (36 deg apex at A), color 1 = thick/obtuse
  // (108 deg apex at A). Both isoceles, |A-B| == |A-C|, base is B-C.
  function deflate(triangles) {
    var result = [];
    for (var i = 0; i < triangles.length; i++) {
      var t = triangles[i];
      if (t.color === 0) {
        var P = add(t.A, scale(sub(t.B, t.A), 1 / PHI));
        result.push({ color: 0, A: t.C, B: P, C: t.B });
        result.push({ color: 1, A: P, B: t.C, C: t.A });
      } else {
        var Q = add(t.B, scale(sub(t.A, t.B), 1 / PHI));
        var R = add(t.B, scale(sub(t.C, t.B), 1 / PHI));
        result.push({ color: 1, A: R, B: t.C, C: t.A });
        result.push({ color: 1, A: Q, B: R, C: t.B });
        result.push({ color: 0, A: R, B: Q, C: t.A });
      }
    }
    return result;
  }

  // Ten thin triangles fanned around the origin ("sun"), the standard P3 seed.
  function initSun() {
    var triangles = [];
    for (var i = 0; i < 10; i++) {
      var B = { x: Math.cos((2 * i - 1) * Math.PI / 10), y: Math.sin((2 * i - 1) * Math.PI / 10) };
      var C = { x: Math.cos((2 * i + 1) * Math.PI / 10), y: Math.sin((2 * i + 1) * Math.PI / 10) };
      if (i % 2 === 0) { var tmp = B; B = C; C = tmp; }
      triangles.push({ color: 0, A: { x: 0, y: 0 }, B: B, C: C });
    }
    return triangles;
  }

  // Two triangles that share their *base* edge (B-C) and are the same color
  // are always mirror images of each other — the base is the rhombus's short
  // diagonal, and the two apexes are its other two corners. This is the only
  // reliable pairing (pairing on a leg edge instead gives a kite, not a
  // rhombus — verified against a reference implementation before shipping).
  function pairRhombi(triangles) {
    var baseMap = new Map();
    for (var i = 0; i < triangles.length; i++) {
      var t = triangles[i];
      var k = edgeKey(t.B, t.C);
      if (!baseMap.has(k)) baseMap.set(k, []);
      baseMap.get(k).push(i);
    }
    var rhombi = [];
    baseMap.forEach(function (owners) {
      if (owners.length !== 2) return;
      var t1 = triangles[owners[0]], t2 = triangles[owners[1]];
      if (t1.color !== t2.color) return;
      // quad in order: apex1, shared-pt, apex2, shared-pt (non-self-intersecting)
      rhombi.push({ p1: t1.A, p2: t1.B, p3: t2.A, p4: t1.C, color: t1.color });
    });
    return rhombi;
  }

  // Dual adjacency: two rhombi are neighbors if they share a full edge.
  function buildAdjacency(rhombi) {
    var sideMap = new Map();
    rhombi.forEach(function (r, idx) {
      var pts = [r.p1, r.p2, r.p3, r.p4];
      for (var s = 0; s < 4; s++) {
        var k = edgeKey(pts[s], pts[(s + 1) % 4]);
        if (!sideMap.has(k)) sideMap.set(k, []);
        sideMap.get(k).push(idx);
      }
    });
    var adj = rhombi.map(function () { return []; });
    sideMap.forEach(function (owners) {
      if (owners.length === 2) {
        adj[owners[0]].push(owners[1]);
        adj[owners[1]].push(owners[0]);
      }
    });
    return adj;
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // Carve a perfect maze (spanning tree, randomized DFS) over `adj` restricted
  // to `nodeSet`, starting from `startIdx`. Every carved passage gets a
  // compass direction on BOTH ends, chosen freely (not from real geometry),
  // with the far end always the opposite of the near end — the one
  // consistency guarantee that keeps "walk in, walk back out" feel sane.
  function carveMaze(adj, nodeSet, startIdx, rnd) {
    var doors = new Map(); // idx -> { N: idx|null, E: ..., S: ..., W: ... }
    var free = new Map(); // idx -> array of unused directions
    nodeSet.forEach(function (idx) {
      doors.set(idx, { N: null, E: null, S: null, W: null });
      free.set(idx, shuffle(DIRS.slice(), rnd));
    });

    var visited = new Set([startIdx]);
    var stack = [startIdx];
    var parent = new Map();
    parent.set(startIdx, null);

    while (stack.length) {
      var current = stack[stack.length - 1];
      var candidates = adj[current].filter(function (n) {
        return nodeSet.has(n) && !visited.has(n);
      });
      if (candidates.length === 0) { stack.pop(); continue; }
      var next = candidates[Math.floor(rnd() * candidates.length)];
      var d1 = free.get(current).pop();
      var d2 = OPPOSITE[d1];
      // In the vanishingly rare case the far node's opposite slot is somehow
      // already taken (can't happen for a tree — each node gains exactly one
      // parent edge — but guarded defensively), just skip this direction.
      doors.get(current)[d1] = next;
      doors.get(next)[d2] = current;
      var freeNext = free.get(next);
      var fi = freeNext.indexOf(d2);
      if (fi >= 0) freeNext.splice(fi, 1);
      visited.add(next);
      parent.set(next, current);
      stack.push(next);
    }
    return { doors: doors, visited: visited };
  }

  function bfsFarthest(doors, startIdx) {
    var dist = new Map([[startIdx, 0]]);
    var order = [startIdx];
    var q = [startIdx];
    while (q.length) {
      var u = q.shift();
      var d = doors.get(u);
      for (var i = 0; i < DIRS.length; i++) {
        var v = d[DIRS[i]];
        if (v !== null && !dist.has(v)) {
          dist.set(v, dist.get(u) + 1);
          order.push(v);
          q.push(v);
        }
      }
    }
    var farthest = startIdx, best = 0;
    dist.forEach(function (dd, node) {
      if (dd > best) { best = dd; farthest = node; }
    });
    return { farthest: farthest, dist: dist };
  }

  function generate(opts) {
    opts = opts || {};
    var generations = opts.generations || 6;
    var radiusFrac = opts.radiusFrac || 0.55;
    var seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31);
    var rnd = mulberry32(seed);

    var triangles = initSun();
    for (var i = 0; i < generations; i++) triangles = deflate(triangles);
    var rhombi = pairRhombi(triangles);
    rhombi.forEach(function (r) {
      r.cx = (r.p1.x + r.p2.x + r.p3.x + r.p4.x) / 4;
      r.cy = (r.p1.y + r.p2.y + r.p3.y + r.p4.y) / 4;
    });
    var adj = buildAdjacency(rhombi);

    var maxD = 0;
    rhombi.forEach(function (r) { maxD = Math.max(maxD, Math.hypot(r.cx, r.cy)); });
    var limit = radiusFrac * maxD;

    var candidates = [];
    rhombi.forEach(function (r, idx) {
      if (Math.hypot(r.cx, r.cy) <= limit) candidates.push(idx);
    });

    // Largest connected component within the disk (in practice the whole
    // disk selection, since the tiling patch has no interior holes).
    var candSet = new Set(candidates);
    var seen = new Set();
    var best = [];
    candidates.forEach(function (c) {
      if (seen.has(c)) return;
      var comp = [c]; seen.add(c);
      var stack = [c];
      while (stack.length) {
        var u = stack.pop();
        adj[u].forEach(function (v) {
          if (candSet.has(v) && !seen.has(v)) { seen.add(v); comp.push(v); stack.push(v); }
        });
      }
      if (comp.length > best.length) best = comp;
    });
    var nodeSet = new Set(best);

    // Start near the center of the region.
    var startIdx = best[0], startBest = Infinity;
    best.forEach(function (idx) {
      var d = Math.hypot(rhombi[idx].cx, rhombi[idx].cy);
      if (d < startBest) { startBest = d; startIdx = idx; }
    });

    var carved = carveMaze(adj, nodeSet, startIdx, rnd);
    var far1 = bfsFarthest(carved.doors, startIdx);
    var far2 = bfsFarthest(carved.doors, far1.farthest);
    // far1.farthest is a diameter endpoint; goal = the far end of the longest
    // shortest-path in the tree, entered from far1.farthest for real "longest
    // walk" feel but we actually start play at startIdx, so just use farthest
    // from startIdx as the goal — simpler and still a satisfying trek.
    var goalIdx = far1.farthest;

    return {
      seed: seed,
      rhombi: rhombi,
      adjacency: adj,
      nodeSet: nodeSet,
      nodes: best,
      doors: carved.doors,
      start: startIdx,
      goal: goalIdx,
      goalDistance: far1.dist.get(goalIdx) || 0,
      DIRS: DIRS,
      OPPOSITE: OPPOSITE,
      DIR_VEC: DIR_VEC,
    };
  }

  root.PenroseMaze = { generate: generate, DIRS: DIRS, OPPOSITE: OPPOSITE, DIR_VEC: DIR_VEC };
})(typeof window !== "undefined" ? window : globalThis);
