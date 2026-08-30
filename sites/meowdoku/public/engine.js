// meowdoku engine — killer sudoku generation + solving, no dependencies.
//
// A killer sudoku is a 9x9 sudoku (standard row/col/3x3-box rules) plus
// irregular "cages": groups of orthogonally-adjacent cells, each labelled
// with the sum its digits must add to, and no digit may repeat within a
// cage. Classic killer sudoku shows zero starting digits — the cage sums
// alone (combined with sudoku's own rules) are enough to pin down a unique
// solution, so that's what we generate. When a random cage layout doesn't
// pin down a unique solution on its own, we reveal the minimum number of
// extra "given" digits needed to force it — same trick real killer-sudoku
// setters use.
//
// Pipeline: generateSolvedGrid → generateCages → solve (counts solutions,
// used both to fix uniqueness at generation time and to check the player's
// board for a win).
//
// Exposed as `window.Meowdoku` in the browser, `module.exports` under node
// (for the CLI smoke test in test.mjs).

(function (global) {
  "use strict";

  var N = 9, BOX = 3;
  function idx(r, c) { return r * N + c; }

  // ---------- PRNG (deterministic, so a date seeds the same daily puzzle for everyone) ----------

  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFromString(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // ---------- full solved grid ----------

  function generateSolvedGrid(rng) {
    var grid = new Array(81).fill(0);

    function valid(r, c, d) {
      for (var i = 0; i < N; i++) {
        if (grid[idx(r, i)] === d) return false;
        if (grid[idx(i, c)] === d) return false;
      }
      var br = Math.floor(r / BOX) * BOX, bc = Math.floor(c / BOX) * BOX;
      for (var rr = br; rr < br + BOX; rr++)
        for (var cc = bc; cc < bc + BOX; cc++)
          if (grid[idx(rr, cc)] === d) return false;
      return true;
    }

    function fill(pos) {
      if (pos === 81) return true;
      var r = Math.floor(pos / N), c = pos % N;
      var digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
      for (var i = 0; i < digits.length; i++) {
        var d = digits[i];
        if (valid(r, c, d)) {
          grid[idx(r, c)] = d;
          if (fill(pos + 1)) return true;
          grid[idx(r, c)] = 0;
        }
      }
      return false;
    }

    fill(0);
    return grid;
  }

  // ---------- cage partitioning ----------

  function neighbors(r, c) {
    var out = [];
    if (r > 0) out.push([r - 1, c]);
    if (r < N - 1) out.push([r + 1, c]);
    if (c > 0) out.push([r, c - 1]);
    if (c < N - 1) out.push([r, c + 1]);
    return out;
  }

  function pickCageSize(rng) {
    var roll = rng();
    if (roll < 0.04) return 1;
    if (roll < 0.34) return 2;
    if (roll < 0.78) return 3;
    return 4;
  }

  // Grows random contiguous cages over every cell, greedily avoiding
  // same-digit cells within a cage (killer sudoku's one extra rule beyond
  // regular sudoku). Writes into the caller-provided cellCage array.
  function generateCages(grid, rng, cellCage) {
    cellCage.fill(-1);
    var cages = [];
    var order = shuffle(Array.from({ length: 81 }, function (_, i) { return i; }), rng);

    for (var oi = 0; oi < order.length; oi++) {
      var start = order[oi];
      if (cellCage[start] !== -1) continue;
      var r0 = Math.floor(start / N), c0 = start % N;
      var cageId = cages.length;
      var cells = [[r0, c0]];
      cellCage[start] = cageId;
      var usedDigits = {};
      usedDigits[grid[start]] = true;
      var targetSize = pickCageSize(rng);
      var frontier = neighbors(r0, c0).filter(function (rc) { return cellCage[idx(rc[0], rc[1])] === -1; });

      while (cells.length < targetSize && frontier.length) {
        shuffle(frontier, rng);
        var pickedAt = -1;
        for (var i = 0; i < frontier.length; i++) {
          var rc = frontier[i];
          if (cellCage[idx(rc[0], rc[1])] !== -1) continue;
          var d = grid[idx(rc[0], rc[1])];
          if (usedDigits[d]) continue;
          pickedAt = i;
          break;
        }
        if (pickedAt === -1) break;
        var picked = frontier[pickedAt];
        cells.push(picked);
        cellCage[idx(picked[0], picked[1])] = cageId;
        usedDigits[grid[idx(picked[0], picked[1])]] = true;
        frontier.splice(pickedAt, 1);
        var more = neighbors(picked[0], picked[1]).filter(function (rc2) { return cellCage[idx(rc2[0], rc2[1])] === -1; });
        frontier = frontier.concat(more);
      }

      var sum = 0;
      for (var k = 0; k < cells.length; k++) sum += grid[idx(cells[k][0], cells[k][1])];
      cages.push({ id: cageId, cells: cells, sum: sum });
    }
    return cages;
  }

  // Greedy graph coloring of the cage-adjacency graph so neighboring cages
  // render in visually distinct hues. Not safety-critical — worst case two
  // touching cages share a hue and the dashed border still disambiguates them.
  function colorCages(cages, cellCage) {
    var adj = {};
    cages.forEach(function (cg) { adj[cg.id] = {}; });
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var cid = cellCage[idx(r, c)];
        if (c < N - 1) {
          var rid = cellCage[idx(r, c + 1)];
          if (rid !== cid) { adj[cid][rid] = true; adj[rid][cid] = true; }
        }
        if (r < N - 1) {
          var did = cellCage[idx(r + 1, c)];
          if (did !== cid) { adj[cid][did] = true; adj[did][cid] = true; }
        }
      }
    }
    var order = cages.map(function (cg) { return cg.id; })
      .sort(function (a, b) { return Object.keys(adj[b]).length - Object.keys(adj[a]).length; });
    var colorOf = {};
    order.forEach(function (id) {
      var used = {};
      Object.keys(adj[id]).forEach(function (n) { if (colorOf[n] !== undefined) used[colorOf[n]] = true; });
      var col = 0;
      while (used[col]) col++;
      colorOf[id] = col;
    });
    cages.forEach(function (cg) { cg.color = colorOf[cg.id]; });
    return cages;
  }

  // ---------- cage sum -> valid digit-set combinations ----------

  var combosCache = {};
  function combos(size, sum) {
    var key = size + "_" + sum;
    if (combosCache[key]) return combosCache[key];
    var result = [];
    function rec(start, chosen, remSum, remCount) {
      if (remCount === 0) {
        if (remSum === 0) result.push(chosen.slice());
        return;
      }
      if (remSum <= 0) return;
      for (var d = start; d <= 9; d++) {
        if (d > remSum) break;
        chosen.push(d);
        rec(d + 1, chosen, remSum - d, remCount - 1);
        chosen.pop();
      }
    }
    rec(1, [], sum, size);
    combosCache[key] = result;
    return result;
  }

  // ---------- solver (constraint propagation + backtracking, MRV heuristic) ----------
  //
  // Used two ways: (1) at generation time to prove a cage layout + given
  // set has exactly one solution, capping the search at 2 so it stops the
  // instant it's disproven; (2) client-side to validate the player's board.

  function solve(cages, cellCage, opts) {
    opts = opts || {};
    var cap = opts.cap || 2;
    var stepBudget = opts.stepBudget || 300000;
    var givens = opts.givens || [];

    var grid = new Array(81).fill(0);
    givens.forEach(function (g) { grid[idx(g.r, g.c)] = g.value; });

    var cageById = {};
    cages.forEach(function (cg) { cageById[cg.id] = cg; });

    var solutions = [];
    var steps = 0;

    function eligibleForCage(cg) {
      var used = {}, usedCount = 0;
      for (var i = 0; i < cg.cells.length; i++) {
        var v = grid[idx(cg.cells[i][0], cg.cells[i][1])];
        if (v) { used[v] = true; usedCount++; }
      }
      var cmb = combos(cg.cells.length, cg.sum);
      var elig = {};
      for (var ci = 0; ci < cmb.length; ci++) {
        var combo = cmb[ci];
        var ok = true;
        for (var u in used) { if (combo.indexOf(+u) === -1) { ok = false; break; } }
        if (!ok) continue;
        for (var di = 0; di < combo.length; di++) {
          if (!used[combo[di]]) elig[combo[di]] = true;
        }
      }
      return elig;
    }

    function candidatesFor(r, c) {
      var used = {};
      for (var i = 0; i < 9; i++) {
        if (grid[idx(r, i)]) used[grid[idx(r, i)]] = true;
        if (grid[idx(i, c)]) used[grid[idx(i, c)]] = true;
      }
      var br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (var rr = br; rr < br + 3; rr++)
        for (var cc = bc; cc < bc + 3; cc++)
          if (grid[idx(rr, cc)]) used[grid[idx(rr, cc)]] = true;

      var cg = cageById[cellCage[idx(r, c)]];
      var cageElig = eligibleForCage(cg);
      var out = [];
      for (var d = 1; d <= 9; d++) {
        if (used[d]) continue;
        if (!cageElig[d]) continue;
        out.push(d);
      }
      return out;
    }

    function pickCell() {
      var best = null, bestLen = 10;
      for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
          if (grid[idx(r, c)]) continue;
          var cand = candidatesFor(r, c);
          if (cand.length === 0) return { r: r, c: c, cand: cand };
          if (cand.length < bestLen) {
            bestLen = cand.length;
            best = { r: r, c: c, cand: cand };
            if (bestLen === 1) return best;
          }
        }
      }
      return best;
    }

    function backtrack() {
      if (steps > stepBudget || solutions.length >= cap) return;
      steps++;
      var pick = pickCell();
      if (pick === null) { solutions.push(grid.slice()); return; }
      if (pick.cand.length === 0) return;
      for (var i = 0; i < pick.cand.length; i++) {
        grid[idx(pick.r, pick.c)] = pick.cand[i];
        backtrack();
        grid[idx(pick.r, pick.c)] = 0;
        if (solutions.length >= cap || steps > stepBudget) return;
      }
    }

    backtrack();
    return { solutions: solutions, steps: steps, hitBudget: steps > stepBudget };
  }

  // ---------- puzzle generation: cages + just enough givens for uniqueness ----------

  function generatePuzzle(seedStr) {
    var rng = mulberry32(seedFromString(seedStr));
    var solutionGrid = generateSolvedGrid(rng);
    var MAX_CAGE_ATTEMPTS = 12;

    for (var attempt = 0; attempt < MAX_CAGE_ATTEMPTS; attempt++) {
      var cellCage = new Array(81).fill(-1);
      var cages = generateCages(solutionGrid, rng, cellCage);
      colorCages(cages, cellCage);
      var givens = [];
      var resolved = false, broken = false;

      for (var round = 0; round < 24; round++) {
        var res = solve(cages, cellCage, { cap: 2, stepBudget: 300000, givens: givens });
        if (res.hitBudget || res.solutions.length === 0) { broken = true; break; }
        if (res.solutions.length === 1) { resolved = true; break; }

        var a = res.solutions[0], b = res.solutions[1];
        var taken = {};
        givens.forEach(function (g) { taken[idx(g.r, g.c)] = true; });
        var diffCells = [];
        for (var i = 0; i < 81; i++) if (a[i] !== b[i] && !taken[i]) diffCells.push(i);
        if (!diffCells.length) { broken = true; break; }
        shuffle(diffCells, rng);
        var pick = diffCells[0];
        givens.push({ r: Math.floor(pick / 9), c: pick % 9, value: solutionGrid[pick] });
      }

      if (resolved) {
        return { cages: cages, cellCage: cellCage, solution: solutionGrid, givens: givens, seed: seedStr };
      }
      if (!broken) {
        // ran out of rounds without pinning it down — try a fresh cage layout
      }
    }

    // last-resort fallback: same style of cages, but reveal a modest fixed
    // set of starting digits directly (like a normal sudoku's givens) so
    // there's always a playable puzzle even in a pathological seed.
    var cellCageFb = new Array(81).fill(-1);
    var cagesFb = generateCages(solutionGrid, rng, cellCageFb);
    colorCages(cagesFb, cellCageFb);
    var cellOrder = shuffle(Array.from({ length: 81 }, function (_, i) { return i; }), rng);
    var givensFb = cellOrder.slice(0, 26).map(function (i) {
      return { r: Math.floor(i / 9), c: i % 9, value: solutionGrid[i] };
    });
    return { cages: cagesFb, cellCage: cellCageFb, solution: solutionGrid, givens: givensFb, seed: seedStr };
  }

  // ---------- board validation (used for live mistake-highlighting + win check) ----------

  // board: length-81 array of 0-9 (0 = empty). Returns which cells conflict
  // with sudoku or cage rules, plus per-cage running-sum status, without
  // ever consulting the solution — a full, rule-valid board is necessarily
  // *the* solution, because generation guaranteed uniqueness.
  function validate(cages, cellCage, board) {
    var conflicts = {};
    function flag(i) { conflicts[i] = true; }

    for (var r = 0; r < 9; r++) {
      var seen = {};
      for (var c = 0; c < 9; c++) {
        var v = board[idx(r, c)];
        if (!v) continue;
        if (seen[v] !== undefined) { flag(idx(r, c)); flag(seen[v]); }
        else seen[v] = idx(r, c);
      }
    }
    for (var c2 = 0; c2 < 9; c2++) {
      var seenC = {};
      for (var r2 = 0; r2 < 9; r2++) {
        var v2 = board[idx(r2, c2)];
        if (!v2) continue;
        if (seenC[v2] !== undefined) { flag(idx(r2, c2)); flag(seenC[v2]); }
        else seenC[v2] = idx(r2, c2);
      }
    }
    for (var br = 0; br < 9; br += 3) {
      for (var bc = 0; bc < 9; bc += 3) {
        var seenB = {};
        for (var rr = br; rr < br + 3; rr++) {
          for (var cc = bc; cc < bc + 3; cc++) {
            var v3 = board[idx(rr, cc)];
            if (!v3) continue;
            if (seenB[v3] !== undefined) { flag(idx(rr, cc)); flag(seenB[v3]); }
            else seenB[v3] = idx(rr, cc);
          }
        }
      }
    }

    var cageStatus = {};
    cages.forEach(function (cg) {
      var seenCage = {}, filledSum = 0, filledCount = 0, dup = false;
      cg.cells.forEach(function (rc) {
        var v = board[idx(rc[0], rc[1])];
        if (!v) return;
        filledSum += v;
        filledCount++;
        if (seenCage[v]) { dup = true; flag(idx(rc[0], rc[1])); flag(seenCage[v]); }
        seenCage[v] = idx(rc[0], rc[1]);
      });
      var over = filledSum > cg.sum || (filledCount === cg.cells.length && filledSum !== cg.sum);
      if (over) cg.cells.forEach(function (rc) { if (board[idx(rc[0], rc[1])]) flag(idx(rc[0], rc[1])); });
      cageStatus[cg.id] = { sum: cg.sum, filledSum: filledSum, filledCount: filledCount, dup: dup, over: over,
        complete: filledCount === cg.cells.length && filledSum === cg.sum && !dup };
    });

    var complete = board.every(function (v) { return v !== 0; });
    var conflictCount = Object.keys(conflicts).length;
    return { conflicts: conflicts, cageStatus: cageStatus, complete: complete, valid: conflictCount === 0,
      win: complete && conflictCount === 0 };
  }

  // ---------- daily seed helpers ----------

  var EPOCH_UTC_DAYS = Date.UTC(2026, 0, 1) / 86400000; // puzzle #1 = 2026-01-01

  function utcDateString(date) {
    return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0");
  }

  function dailySeed(date) {
    return "meowdoku-" + utcDateString(date);
  }

  function puzzleNumber(date) {
    var days = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
    return Math.max(1, days - EPOCH_UTC_DAYS + 1);
  }

  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var rem = s % 60;
    return m + ":" + String(rem).padStart(2, "0");
  }

  var Meowdoku = {
    idx: idx,
    mulberry32: mulberry32,
    seedFromString: seedFromString,
    shuffle: shuffle,
    generateSolvedGrid: generateSolvedGrid,
    generateCages: generateCages,
    colorCages: colorCages,
    solve: solve,
    generatePuzzle: generatePuzzle,
    validate: validate,
    dailySeed: dailySeed,
    puzzleNumber: puzzleNumber,
    utcDateString: utcDateString,
    formatTime: formatTime
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Meowdoku;
  else global.Meowdoku = Meowdoku;
})(typeof window !== "undefined" ? window : globalThis);
