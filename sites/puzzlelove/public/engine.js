/*
 * sokobisks engine — a compact PuzzleScript-flavoured Sokoban runtime.
 *
 * The game below is written as real PuzzleScript source (PUZZLESCRIPT_SOURCE):
 * OBJECTS / LEGEND / COLLISIONLAYERS / RULES / WINCONDITIONS / LEVELS, exactly
 * the sections you'd paste into puzzlescript.net. This file parses that source
 * and runs it. It implements the classic single-push Sokoban rule
 *   [ > Player | Idea ] -> [ > Player | > Idea ]
 * with real collision layers and simultaneous move resolution, which is all
 * this particular game needs — copy, don't abstract.
 *
 * Runs in the browser (attaches window.Sokobisks) and in Node (module.exports)
 * so the levels can be solver-checked offline.
 */
(function (root) {
  "use strict";

  var PUZZLESCRIPT_SOURCE = [
    "title sokobisks — adventures of the build crew",
    "author @buildthis.bisks.net",
    "homepage sokobisks.bisks.net",
    "",
    "( You are the @buildthis bot. Shove every idea onto a ship-pad and it goes",
    "  live. norvid, thebes and bisks are watching. Arrow keys / WASD to move,",
    "  Z to undo, R to restart. )",
    "",
    "========",
    "OBJECTS",
    "========",
    "",
    "Background",
    "#12141c",
    "",
    "Wall",
    "#2a2f42 #363c56",
    "00000",
    "01110",
    "00000",
    "01110",
    "00000",
    "",
    "Player",
    "#ffae57 #14181f #7fd4ff",
    ".000.",
    "02020",
    "00000",
    "00000",
    ".0.0.",
    "",
    "Idea",
    "#ffe66d #fff6c9 #b8892b",
    "..2..",
    ".010.",
    "21012",
    ".010.",
    "..2..",
    "",
    "Target",
    "#3ddc84",
    "0...0",
    ".....",
    "..0..",
    ".....",
    "0...0",
    "",
    "Norvid",
    "#b18cff #14181f",
    ".000.",
    "01010",
    ".000.",
    ".000.",
    ".0.0.",
    "",
    "Thebes",
    "#5ce1c6 #14181f",
    ".000.",
    "01010",
    ".000.",
    ".000.",
    ".0.0.",
    "",
    "Bisks",
    "#7fb2ff #14181f",
    ".000.",
    "01010",
    ".000.",
    ".000.",
    ".0.0.",
    "",
    "=======",
    "LEGEND",
    "=======",
    "",
    ". = Background",
    "# = Wall",
    "P = Player",
    "* = Idea",
    "@ = Target",
    "I = Idea and Target",
    "+ = Player and Target",
    "n = Norvid",
    "h = Thebes",
    "b = Bisks",
    "",
    "================",
    "COLLISIONLAYERS",
    "================",
    "",
    "Background",
    "Target",
    "Player, Wall, Idea, Norvid, Thebes, Bisks",
    "",
    "======",
    "RULES",
    "======",
    "",
    "[ > Player | Idea ] -> [ > Player | > Idea ]",
    "",
    "==============",
    "WINCONDITIONS",
    "==============",
    "",
    "All Idea on Target",
    "",
    "=======",
    "LEVELS",
    "=======",
    "",
    "message the dislike button",
    "#######",
    "#..@..#",
    "#..*..#",
    "#..P..#",
    "#.n...#",
    "#######",
    "",
    "message cursed text strings",
    "#######",
    "#.....#",
    "#.*.@.#",
    "#.P...#",
    "#.*.@.#",
    "#..h..#",
    "#######",
    "",
    "message the killswitch",
    "#########",
    "#.......#",
    "#..@.@..#",
    "#..*.*..#",
    "#...P...#",
    "#...b...#",
    "#########",
    "",
    "message sonnets, fourteen lines",
    "#########",
    "#.......#",
    "#.@...@.#",
    "#.*...*.#",
    "#...P...#",
    "#.*...*.#",
    "#.@...@.#",
    "#...h...#",
    "#########",
    "",
    "message cogsec",
    "#########",
    "#.......#",
    "#.*.*.*.#",
    "#.@.@.@.#",
    "#...P...#",
    "#.h.n.b.#",
    "#########",
    "",
    "message ship the game itself",
    "###########",
    "#h.......b#",
    "#.........#",
    "#....@....#",
    "#.........#",
    "#....*....#",
    "#.........#",
    "#....P....#",
    "#....n....#",
    "###########",
    ""
  ].join("\n");

  var DIRS = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 }
  };

  // ---- parsing -----------------------------------------------------------

  function parse(source) {
    var lines = source.split("\n");
    var sections = { OBJECTS: [], LEGEND: [], COLLISIONLAYERS: [], RULES: [], WINCONDITIONS: [], LEVELS: [] };
    var current = null;
    var headers = { OBJECTS: 1, LEGEND: 1, COLLISIONLAYERS: 1, RULES: 1, WINCONDITIONS: 1, LEVELS: 1 };
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var trimmed = raw.replace(/^=+$/, "").trim();
      var upper = raw.trim().toUpperCase();
      if (/^=+$/.test(raw.trim())) continue; // rule of ===== separators
      if (headers[upper]) { current = upper; continue; }
      if (current) sections[current].push(raw);
    }
    return {
      objects: parseObjects(sections.OBJECTS),
      legend: parseLegend(sections.LEGEND),
      layers: parseLayers(sections.COLLISIONLAYERS),
      win: parseWin(sections.WINCONDITIONS),
      levels: parseLevels(sections.LEVELS),
      source: source
    };
  }

  function isHexList(line) {
    return /^\s*(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)(\s+(#[0-9a-fA-F]{3,6}|[a-zA-Z]+))*\s*$/.test(line);
  }

  function parseObjects(lines) {
    var objects = {};
    var i = 0;
    // strip leading blanks
    while (i < lines.length) {
      // skip blanks
      while (i < lines.length && lines[i].trim() === "") i++;
      if (i >= lines.length) break;
      var name = lines[i].trim();
      i++;
      var colors = [];
      if (i < lines.length && isHexList(lines[i]) && lines[i].trim() !== "") {
        colors = lines[i].trim().split(/\s+/);
        i++;
      }
      var sprite = [];
      while (i < lines.length && lines[i].trim() !== "" && /^[0-9.\s]+$/.test(lines[i]) && lines[i].trim().length === 5) {
        sprite.push(lines[i].trim().split(""));
        i++;
      }
      objects[name.toLowerCase()] = { name: name, colors: colors, sprite: sprite };
    }
    return objects;
  }

  function parseLegend(lines) {
    var map = {};
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t || t.indexOf("=") < 0) return;
      var parts = t.split("=");
      var key = parts[0].trim();
      var names = parts[1].split(/\s+and\s+/i).map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      map[key] = names;
    });
    return map;
  }

  function parseLayers(lines) {
    var layers = [];
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      layers.push(t.split(",").map(function (s) { return s.trim().toLowerCase(); }));
    });
    return layers;
  }

  function parseWin(lines) {
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) continue;
      var m = t.match(/^(All|Some|No)\s+(\w+)\s+on\s+(\w+)$/i);
      if (m) return { quant: m[1].toLowerCase(), obj: m[2].toLowerCase(), on: m[3].toLowerCase() };
    }
    return { quant: "all", obj: "idea", on: "target" };
  }

  function parseLevels(lines) {
    var levels = [];
    var pendingTitle = null;
    var block = [];
    function flush() {
      if (block.length) {
        levels.push({ title: pendingTitle, grid: block.slice() });
        block = [];
        pendingTitle = null;
      }
    }
    lines.forEach(function (line) {
      var t = line.trim();
      var m = t.match(/^message\s+(.*)$/i);
      if (m) { flush(); pendingTitle = m[1]; return; }
      if (t === "") { flush(); return; }
      block.push(line.replace(/\s+$/, ""));
    });
    flush();
    return levels;
  }

  // ---- state -------------------------------------------------------------

  function layerIndexOf(game, name) {
    for (var i = 0; i < game.layers.length; i++) {
      if (game.layers[i].indexOf(name) >= 0) return i;
    }
    return -1;
  }

  function buildState(game, levelIndex) {
    var lvl = game.levels[levelIndex];
    var grid = lvl.grid;
    var rows = grid.length;
    var cols = 0;
    grid.forEach(function (r) { cols = Math.max(cols, r.length); });
    var objs = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var ch = grid[r][c] || ".";
        var names = game.legend[ch] || [];
        names.forEach(function (n) {
          if (n === "background") return;
          objs.push({ name: n, r: r, c: c });
        });
      }
    }
    return { rows: rows, cols: cols, objs: objs };
  }

  function cloneState(state) {
    return {
      rows: state.rows,
      cols: state.cols,
      objs: state.objs.map(function (o) { return { name: o.name, r: o.r, c: o.c }; })
    };
  }

  function stateKey(state) {
    // only movable things matter for search / dedup
    var parts = [];
    state.objs.forEach(function (o) {
      if (o.name === "player" || o.name === "idea") parts.push(o.name[0] + o.r + "," + o.c);
    });
    return parts.sort().join("|");
  }

  // ---- movement (the one Sokoban rule) -----------------------------------

  function occupantsAt(state, layerIdx, game, r, c, exclude) {
    var out = [];
    for (var i = 0; i < state.objs.length; i++) {
      var o = state.objs[i];
      if (o === exclude) continue;
      if (o.r === r && o.c === c && layerIndexOf(game, o.name) === layerIdx) out.push(o);
    }
    return out;
  }

  // Returns { state, moved:bool }. Pure — takes a state, returns a new one.
  function step(game, state, dirName) {
    var dir = DIRS[dirName];
    if (!dir) return { state: state, moved: false };
    var ns = cloneState(state);
    var player = null;
    ns.objs.forEach(function (o) { if (o.name === "player") player = o; });
    if (!player) return { state: state, moved: false };

    var movers = new Map();
    movers.set(player, dirName);

    // Propagate the push rule: a moving Player pushes an Idea directly ahead.
    var changed = true;
    while (changed) {
      changed = false;
      movers.forEach(function (d, m) {
        if (m.name !== "player") return; // only Player pushes, single crate
        var nr = m.r + dir.dr, nc = m.c + dir.dc;
        ns.objs.forEach(function (o) {
          if (o.name === "idea" && o.r === nr && o.c === nc && !movers.has(o)) {
            movers.set(o, dirName);
            changed = true;
          }
        });
      });
    }

    // Resolve movement: cancel any mover blocked by a wall/edge or by a
    // same-layer object that isn't itself vacating. Cascade until stable.
    var blocked = new Set();
    var stable = false;
    while (!stable) {
      stable = true;
      movers.forEach(function (d, m) {
        if (blocked.has(m)) return;
        var nr = m.r + dir.dr, nc = m.c + dir.dc;
        var layer = layerIndexOf(game, m.name);
        if (nr < 0 || nc < 0 || nr >= ns.rows || nc >= ns.cols) {
          blocked.add(m); stable = false; return;
        }
        var occ = occupantsAt(ns, layer, game, nr, nc, m);
        for (var i = 0; i < occ.length; i++) {
          var o = occ[i];
          var oMoving = movers.has(o) && !blocked.has(o);
          if (!oMoving) { blocked.add(m); stable = false; return; }
        }
      });
    }

    var anyMoved = false;
    movers.forEach(function (d, m) {
      if (blocked.has(m)) return;
      m.r += dir.dr; m.c += dir.dc;
      anyMoved = true;
    });

    return { state: ns, moved: anyMoved };
  }

  function isWin(game, state) {
    var w = game.win;
    var carriers = state.objs.filter(function (o) { return o.name === w.obj; });
    function onTarget(o) {
      return state.objs.some(function (t) { return t.name === w.on && t.r === o.r && t.c === o.c; });
    }
    if (w.quant === "all") return carriers.length > 0 && carriers.every(onTarget);
    if (w.quant === "some") return carriers.some(onTarget);
    if (w.quant === "no") return !carriers.some(onTarget);
    return false;
  }

  var API = {
    PUZZLESCRIPT_SOURCE: PUZZLESCRIPT_SOURCE,
    DIRS: DIRS,
    parse: parse,
    buildState: buildState,
    cloneState: cloneState,
    stateKey: stateKey,
    step: step,
    isWin: isWin,
    layerIndexOf: layerIndexOf
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.Sokobisks = API;
})(typeof window !== "undefined" ? window : this);
