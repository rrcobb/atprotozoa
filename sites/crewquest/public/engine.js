/*
 * crewquest engine — a compact PuzzleScript-flavoured party-Sokoban runtime.
 *
 * The game ships as real PuzzleScript-style source (PUZZLESCRIPT_SOURCE): the
 * OBJECTS / LEGEND / COLLISIONLAYERS / RULES / WINCONDITIONS / LEVELS sections
 * you'd paste into puzzlescript.net. This file parses that source and runs it.
 *
 * The twist over plain Sokoban: there are FOUR playable crew members on the
 * board at once — thebes, norvid, bisks and the buildthis bot — and only one is
 * ACTIVE at a time. Tab/Space cycles who you're steering. Each crew member has
 * their own colored door that only they can walk through, so you're forever
 * handing the puzzle off to whoever can reach the next bit. Any active member
 * can shove a single Idea crate onto a ship-pad. Win when every idea is shipped
 * and (where the level has home-pads) the whole crew is home.
 *
 * The engine is deliberately small and copied-not-abstracted from sokobisks'
 * runtime, then reworked for the multi-character rule. Runs in the browser
 * (window.CrewQuest) and in Node (module.exports) so levels can be checked.
 */
(function (root) {
  "use strict";

  // The four crew members, in cycle order. Kept here so the engine and the UI
  // agree on identity, colors-by-name, and the order Tab walks through.
  var CREW = ["thebes", "norvid", "bisks", "buildthis"];

  var PUZZLESCRIPT_SOURCE = [
    "title crewquest — the whole crew, one puzzle",
    "author @buildthis.bisks.net",
    "homepage crewquest.bisks.net",
    "",
    "( Four playable crew members share the board: thebes, norvid, bisks and the",
    "  buildthis bot. Only one is active at a time — Tab or Space cycles who you",
    "  steer. Each has their own colored door only they may pass. Any active",
    "  member can push one Idea onto a ship-pad. Ship every idea (and, where",
    "  there are home-pads, get everyone home). Arrows / WASD move. Z undo, R",
    "  restart. This is a party-Sokoban riff on PuzzleScript, not a straight",
    "  port — the multi-character swap rule is handled by the engine. )",
    "",
    "========",
    "OBJECTS",
    "========",
    "",
    "Background",
    "#0f1118",
    "",
    "Wall",
    "#2a2f42 #363c56",
    "00000",
    "01110",
    "00000",
    "01110",
    "00000",
    "",
    "Idea",
    "#ffe66d #fff6c9 #b8892b",
    "..2..",
    ".010.",
    "21012",
    ".010.",
    "..2..",
    "",
    "ShipPad",
    "#3ddc84",
    "0...0",
    ".....",
    "..0..",
    ".....",
    "0...0",
    "",
    "( thebes — teal. the puzzlescript one; her door is teal. )",
    "Thebes",
    "#5ce1c6 #0f1118 #bff6ec",
    ".000.",
    "02120",
    ".000.",
    "01110",
    ".0.0.",
    "",
    "( norvid — purple. sealed-envelope, notices-three-posts guy. )",
    "Norvid",
    "#b18cff #0f1118 #e4d6ff",
    ".000.",
    "02120",
    ".000.",
    "01110",
    ".0.0.",
    "",
    "( bisks / rob — blue. the one holding the credits. )",
    "Bisks",
    "#7fb2ff #0f1118 #d6e6ff",
    ".000.",
    "02120",
    ".000.",
    "01110",
    ".0.0.",
    "",
    "( buildthis — orange. you, the bot. )",
    "Buildthis",
    "#ffae57 #0f1118 #14181f",
    ".000.",
    "02020",
    "00000",
    "00000",
    ".0.0.",
    "",
    "( doors — a member may only pass their own color. )",
    "DoorThebes",
    "#2f5f57 #5ce1c6",
    "01110",
    "10001",
    "10001",
    "10001",
    "01110",
    "",
    "DoorNorvid",
    "#453a5f #b18cff",
    "01110",
    "10001",
    "10001",
    "10001",
    "01110",
    "",
    "DoorBisks",
    "#324a66 #7fb2ff",
    "01110",
    "10001",
    "10001",
    "10001",
    "01110",
    "",
    "DoorBuildthis",
    "#5f4325 #ffae57",
    "01110",
    "10001",
    "10001",
    "10001",
    "01110",
    "",
    "( home-pads — each crew member's spot to end on, faint in their color. )",
    "HomeThebes",
    "#5ce1c6",
    "0...0",
    ".....",
    ".....",
    ".....",
    "0...0",
    "",
    "HomeNorvid",
    "#b18cff",
    "0...0",
    ".....",
    ".....",
    ".....",
    "0...0",
    "",
    "HomeBisks",
    "#7fb2ff",
    "0...0",
    ".....",
    ".....",
    ".....",
    "0...0",
    "",
    "HomeBuildthis",
    "#ffae57",
    "0...0",
    ".....",
    ".....",
    ".....",
    "0...0",
    "",
    "=======",
    "LEGEND",
    "=======",
    "",
    ". = Background",
    "# = Wall",
    "* = Idea",
    "@ = ShipPad",
    "T = Thebes",
    "N = Norvid",
    "B = Bisks",
    "O = Buildthis",
    "t = DoorThebes",
    "n = DoorNorvid",
    "b = DoorBisks",
    "o = DoorBuildthis",
    "1 = HomeThebes",
    "2 = HomeNorvid",
    "3 = HomeBisks",
    "4 = HomeBuildthis",
    "",
    "================",
    "COLLISIONLAYERS",
    "================",
    "",
    "Background",
    "ShipPad, HomeThebes, HomeNorvid, HomeBisks, HomeBuildthis",
    "DoorThebes, DoorNorvid, DoorBisks, DoorBuildthis",
    "Wall, Idea, Thebes, Norvid, Bisks, Buildthis",
    "",
    "======",
    "RULES",
    "======",
    "",
    "( The active crew member pushes one Idea directly ahead. Door-passing and",
    "  which member is active are resolved by the engine, not by textual rules. )",
    "[ > Player | Idea ] -> [ > Player | > Idea ]",
    "",
    "==============",
    "WINCONDITIONS",
    "==============",
    "",
    "All Idea on ShipPad",
    "",
    "=======",
    "LEVELS",
    "=======",
    "",
    "message hello world (the whole crew's here)",
    "#########",
    "#O.*...@#",
    "#.......#",
    "#T.N..B.#",
    "#########",
    "",
    "message you breaka my heart (thebes' door)",
    "#########",
    "#O..#T..#",
    "#...t...#",
    "#...#.*@#",
    "#########",
    "",
    "message a beach that makes you old (norvid crosses)",
    "##########",
    "#O..#..N.#",
    "#...n....#",
    "#...#....#",
    "#...#.*.@#",
    "##########",
    "",
    "message out of credits (bisks pays)",
    "##########",
    "#O..#B...#",
    "#...b....#",
    "#...#....#",
    "#...#.*.@#",
    "##########",
    "",
    "message cognitive security (mind the gates)",
    "############",
    "#.T..#..O.#",
    "#.t..#..o.#",
    "#.#..#..#.#",
    "#.*.@#.*.@#",
    "############",
    "",
    "message the reunion (everyone ships their part)",
    "###################",
    "#.T..#.N..#.B..#.O.#",
    "#.t..#.n..#.b..#.o.#",
    "#.#..#.#..#.#..#.#.#",
    "#.*.@#.*.@#.*.@#.*.@#",
    "###################",
    ""
  ].join("\n");

  var DIRS = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 }
  };

  // Door name -> the single crew member allowed through it.
  var DOOR_OWNER = {
    doorthebes: "thebes",
    doornorvid: "norvid",
    doorbisks: "bisks",
    doorbuildthis: "buildthis"
  };

  function isCrew(name) { return CREW.indexOf(name) >= 0; }
  function isDoor(name) { return Object.prototype.hasOwnProperty.call(DOOR_OWNER, name); }

  // ---- parsing -----------------------------------------------------------
  // Copied from sokobisks and lightly extended: same section reader, plus it
  // skips ( PuzzleScript comment ) lines wherever they appear, and the legend
  // maps digits to home-pads so a crew member can stand on a pad in a level.

  function parse(source) {
    var lines = source.split("\n");
    var sections = { OBJECTS: [], LEGEND: [], COLLISIONLAYERS: [], RULES: [], WINCONDITIONS: [], LEVELS: [] };
    var current = null;
    var headers = { OBJECTS: 1, LEGEND: 1, COLLISIONLAYERS: 1, RULES: 1, WINCONDITIONS: 1, LEVELS: 1 };
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var upper = raw.trim().toUpperCase();
      if (/^=+$/.test(raw.trim())) continue; // ===== separators
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

  function isComment(line) { return /^\(.*\)\s*$/.test(line.trim()); }

  function isHexList(line) {
    return /^\s*(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)(\s+(#[0-9a-fA-F]{3,6}|[a-zA-Z]+))*\s*$/.test(line);
  }

  function parseObjects(lines) {
    var objects = {};
    var i = 0;
    while (i < lines.length) {
      while (i < lines.length && (lines[i].trim() === "" || isComment(lines[i]))) i++;
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
      if (!t || isComment(line) || t.indexOf("=") < 0) return;
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
      if (!t || isComment(line)) return;
      layers.push(t.split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean));
    });
    return layers;
  }

  function parseWin(lines) {
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t || isComment(lines[i])) continue;
      var m = t.match(/^(All|Some|No)\s+(\w+)\s+on\s+(\w+)$/i);
      if (m) return { quant: m[1].toLowerCase(), obj: m[2].toLowerCase(), on: m[3].toLowerCase() };
    }
    return { quant: "all", obj: "idea", on: "shippad" };
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
      if (isComment(line)) return; // comment line inside LEVELS
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
    // Which crew members are present, in cycle order (thebes, norvid, bisks,
    // buildthis) — the active pointer walks this list, Tab steps through it.
    var present = CREW.filter(function (name) {
      return objs.some(function (o) { return o.name === name; });
    });
    // Start on the buildthis bot when it's on the board — the bot is "you", the
    // site's narrator — otherwise on whoever's first present.
    var active = present.indexOf("buildthis");
    if (active < 0) active = 0;
    return { rows: rows, cols: cols, objs: objs, present: present, active: active };
  }

  function cloneState(state) {
    return {
      rows: state.rows,
      cols: state.cols,
      objs: state.objs.map(function (o) { return { name: o.name, r: o.r, c: o.c }; }),
      present: state.present.slice(),
      active: state.active
    };
  }

  function activeName(state) { return state.present[state.active]; }

  function cycle(state, delta) {
    var ns = cloneState(state);
    if (ns.present.length) {
      ns.active = ((ns.active + delta) % ns.present.length + ns.present.length) % ns.present.length;
    }
    return ns;
  }

  function objAt(state, r, c, pred) {
    for (var i = 0; i < state.objs.length; i++) {
      var o = state.objs[i];
      if (o.r === r && o.c === c && pred(o)) return o;
    }
    return null;
  }

  // ---- movement ----------------------------------------------------------
  // Only the active crew member moves. It may push exactly one Idea ahead
  // (classic single-crate rule). It is blocked by the board edge, a wall,
  // another crew member, and any door that isn't its own. Pure: returns a new
  // state and whether anything moved.
  function step(game, state, dirName) {
    var dir = DIRS[dirName];
    if (!dir) return { state: state, moved: false };
    var me = activeName(state);
    if (!me) return { state: state, moved: false };

    var ns = cloneState(state);
    var self = null;
    ns.objs.forEach(function (o) { if (o.name === me && !self) self = o; });
    if (!self) return { state: state, moved: false };

    var nr = self.r + dir.dr, nc = self.c + dir.dc;
    if (nr < 0 || nc < 0 || nr >= ns.rows || nc >= ns.cols) return { state: state, moved: false };

    // Blocked by a wall or another crew member in the destination cell.
    if (objAt(ns, nr, nc, function (o) { return o.name === "wall"; })) return { state: state, moved: false };
    if (objAt(ns, nr, nc, function (o) { return isCrew(o.name); })) return { state: state, moved: false };
    // Blocked by a door that isn't ours.
    var door = objAt(ns, nr, nc, function (o) { return isDoor(o.name); });
    if (door && DOOR_OWNER[door.name] !== me) return { state: state, moved: false };

    // Is there an Idea directly ahead we'd have to push?
    var idea = objAt(ns, nr, nc, function (o) { return o.name === "idea"; });
    if (idea) {
      var pr = nr + dir.dr, pc = nc + dir.dc;
      if (pr < 0 || pc < 0 || pr >= ns.rows || pc >= ns.cols) return { state: state, moved: false };
      // The idea can't move into a wall, a crew member, another idea, or ANY
      // door (ideas don't fit through the crew's personal doors).
      if (objAt(ns, pr, pc, function (o) {
        return o.name === "wall" || o.name === "idea" || isCrew(o.name) || isDoor(o.name);
      })) return { state: state, moved: false };
      idea.r = pr; idea.c = pc;
    }

    self.r = nr; self.c = nc;
    return { state: ns, moved: true };
  }

  // ---- win ---------------------------------------------------------------
  // Primary condition from WINCONDITIONS (all ideas on ship-pads). If the level
  // also contains home-pads, every crew member must additionally stand on their
  // own home-pad — that's the "reunion" finish.

  function homeName(crew) { return "home" + crew; }

  function isWin(game, state) {
    var w = game.win;
    var carriers = state.objs.filter(function (o) { return o.name === w.obj; });
    function onName(o, target) {
      return state.objs.some(function (t) { return t.name === target && t.r === o.r && t.c === o.c; });
    }
    var ideasOk;
    if (w.quant === "all") ideasOk = carriers.length > 0 && carriers.every(function (o) { return onName(o, w.on); });
    else if (w.quant === "some") ideasOk = carriers.some(function (o) { return onName(o, w.on); });
    else if (w.quant === "no") ideasOk = !carriers.some(function (o) { return onName(o, w.on); });
    else ideasOk = false;
    if (!ideasOk) return false;

    // If any home-pad exists on the board, require the crew home too.
    var hasHomes = state.objs.some(function (o) { return /^home/.test(o.name); });
    if (!hasHomes) return true;
    return state.present.every(function (crew) {
      var member = state.objs.filter(function (o) { return o.name === crew; });
      return member.length > 0 && member.every(function (o) { return onName(o, homeName(crew)); });
    });
  }

  // Progress helpers for the HUD.
  function shipped(state) {
    var ideas = state.objs.filter(function (o) { return o.name === "idea"; });
    var on = ideas.filter(function (o) {
      return state.objs.some(function (t) { return t.name === "shippad" && t.r === o.r && t.c === o.c; });
    });
    return { on: on.length, total: ideas.length };
  }

  function homed(state) {
    var homes = state.objs.filter(function (o) { return /^home/.test(o.name); });
    if (!homes.length) return null;
    var on = state.present.filter(function (crew) {
      var member = state.objs.filter(function (o) { return o.name === crew; });
      return member.length > 0 && member.every(function (o) {
        return state.objs.some(function (t) { return t.name === homeName(crew) && t.r === o.r && t.c === o.c; });
      });
    });
    return { on: on.length, total: state.present.length };
  }

  var API = {
    PUZZLESCRIPT_SOURCE: PUZZLESCRIPT_SOURCE,
    CREW: CREW,
    DIRS: DIRS,
    DOOR_OWNER: DOOR_OWNER,
    isCrew: isCrew,
    isDoor: isDoor,
    parse: parse,
    buildState: buildState,
    cloneState: cloneState,
    activeName: activeName,
    cycle: cycle,
    step: step,
    isWin: isWin,
    shipped: shipped,
    homed: homed,
    layerIndexOf: layerIndexOf
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.CrewQuest = API;
})(typeof window !== "undefined" ? window : this);
