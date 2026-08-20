// qwopsheet — a QWOP-like runner controlled by spreadsheet formulas instead
// of mashed keys. Q/W/O/P are cells (A1/B1/A2/B2); the sheet recalculates
// every frame like a live spreadsheet, and the formula's output *is* the
// input to a small balance simulation. Built for @antiali.as, off the
// atproto spaces alpha announcement.
//
// Pure logic (tokenizer/parser/evaluator/physics) is exported so it can be
// unit-tested from Node with no DOM. Everything else only runs once
// `document` exists.

// ---------------------------------------------------------------------------
// Formula engine
// ---------------------------------------------------------------------------

const FUNCS = {
  SIN: (a) => Math.sin(a),
  COS: (a) => Math.cos(a),
  TAN: (a) => Math.tan(a),
  ABS: (a) => Math.abs(a),
  SQRT: (a) => Math.sqrt(a),
  FLOOR: (a) => Math.floor(a),
  CEIL: (a) => Math.ceil(a),
  ROUND: (a) => Math.round(a),
  SIGN: (a) => Math.sign(a),
  MIN: (...args) => Math.min(...args),
  MAX: (...args) => Math.max(...args),
  CLAMP: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
  MOD: (a, b) => a % b,
};

const CELL_RE = /^[A-D][1-4]$/;

// Tokenizes a formula body (no leading "="). Numbers, identifiers, and the
// operators/punctuation the parser understands.
export function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      toks.push({ type: "num", value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9]/.test(src[j])) j++;
      toks.push({ type: "ident", value: src.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }
    if ("+-*/(),^".includes(c)) {
      toks.push({ type: "op", value: c });
      i++;
      continue;
    }
    throw new Error(`bad char '${c}'`);
  }
  return toks;
}

// Recursive-descent parser/evaluator over the token stream. `ctx` provides
// resolveCell(id), t (seconds), n (frame count).
function evalTokens(toks, ctx) {
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];

  function parseExpr() {
    let v = parseTerm();
    while (peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
      const op = next().value;
      const rhs = parseTerm();
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  }
  function parseTerm() {
    let v = parsePow();
    while (peek() && peek().type === "op" && (peek().value === "*" || peek().value === "/")) {
      const op = next().value;
      const rhs = parsePow();
      v = op === "*" ? v * rhs : v / rhs;
    }
    return v;
  }
  function parsePow() {
    let v = parseUnary();
    if (peek() && peek().type === "op" && peek().value === "^") {
      next();
      const rhs = parsePow();
      v = Math.pow(v, rhs);
    }
    return v;
  }
  function parseUnary() {
    if (peek() && peek().type === "op" && peek().value === "-") { next(); return -parseUnary(); }
    if (peek() && peek().type === "op" && peek().value === "+") { next(); return parseUnary(); }
    return parsePrimary();
  }
  function parsePrimary() {
    const tok = peek();
    if (!tok) throw new Error("unexpected end of formula");
    if (tok.type === "num") { next(); return tok.value; }
    if (tok.type === "op" && tok.value === "(") {
      next();
      const v = parseExpr();
      if (!(peek() && peek().type === "op" && peek().value === ")")) throw new Error("missing )");
      next();
      return v;
    }
    if (tok.type === "ident") {
      next();
      const name = tok.value;
      if (peek() && peek().type === "op" && peek().value === "(") {
        next();
        const args = [];
        if (!(peek() && peek().type === "op" && peek().value === ")")) {
          args.push(parseExpr());
          while (peek() && peek().type === "op" && peek().value === ",") {
            next();
            args.push(parseExpr());
          }
        }
        if (!(peek() && peek().type === "op" && peek().value === ")")) throw new Error("missing ) in call");
        next();
        const fn = FUNCS[name];
        if (!fn) throw new Error(`unknown function ${name}`);
        return fn(...args);
      }
      if (name === "PI") return Math.PI;
      if (name === "T") return ctx.t;
      if (name === "N") return ctx.n;
      if (CELL_RE.test(name)) return ctx.resolveCell(name);
      throw new Error(`unknown name ${name}`);
    }
    throw new Error(`unexpected token '${tok.value}'`);
  }

  const v = parseExpr();
  if (pos !== toks.length) throw new Error("unexpected trailing input");
  return v;
}

// Evaluates one cell's raw text ("=SIN(t)*40", "12", "A1+1"). Leading "=" is
// optional, mirroring a real spreadsheet.
export function evalFormula(raw, ctx) {
  const src = String(raw ?? "").trim().replace(/^=/, "");
  if (src === "") return 0;
  const toks = tokenize(src);
  const v = evalTokens(toks, ctx);
  if (typeof v !== "number" || Number.isNaN(v)) throw new Error("not a number");
  return v;
}

// Builds an evaluator over a full sheet ({ A1: "raw", ... }). Call the
// returned function once per frame with (t, n); it resolves every cell
// lazily, memoized for that one call, with circular-reference detection.
export function makeSheet(cellsRaw) {
  return function evalAll(t, n) {
    const cache = new Map();
    const visiting = new Set();
    const errors = {};

    function resolveCell(id) {
      if (cache.has(id)) return cache.get(id);
      if (visiting.has(id)) {
        errors[id] = "circular reference";
        cache.set(id, 0);
        return 0;
      }
      visiting.add(id);
      let val = 0;
      try {
        val = evalFormula(cellsRaw[id], { resolveCell, t, n });
        if (!Number.isFinite(val)) {
          errors[id] = "not finite";
          val = 0;
        }
      } catch (e) {
        errors[id] = e.message || "error";
        val = 0;
      }
      visiting.delete(id);
      cache.set(id, val);
      return val;
    }

    const values = {};
    for (const id of Object.keys(cellsRaw)) values[id] = resolveCell(id);
    return { values, errors };
  };
}

// ---------------------------------------------------------------------------
// Physics — a deliberately loose "inverted pendulum with two legs" balance
// model, not a rigid-body simulation. A leg counts as "planted" when its
// knee is close to straight; the average hip angle of planted leg(s) is the
// base's restoring torque, and an unsupported runner pitches forward under
// constant "gravity" until they faceplant.
// ---------------------------------------------------------------------------

export const PHYS = {
  thigh: 42,
  shin: 40,
  kneeSupportMax: 42, // degrees of knee bend still counted as "planted"
  fallLean: 55, // degrees of torso lean that ends the run
  gravity: 40, // deg/s^2 forward pitch while airborne (both knees bent)
  springK: 1.2,
  dampK: 1.0,
  velDamp: 0.985,
  baseSpeed: 0.55, // m/s while grounded, even with zero stride
  strideK: 0.05, // extra m/s per degree of hip-angle spread
  airSpeed: 0.15, // m/s while airborne
};

function clampNum(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// state: { lean, leanVel, distance } — mutated in place. Returns a snapshot
// of this tick's inputs/outputs for rendering.
export function physicsTick(state, hipL, hipR, kneeL, kneeR, dt) {
  hipL = clampNum(hipL, -90, 90);
  hipR = clampNum(hipR, -90, 90);
  kneeL = clampNum(kneeL, 0, 130);
  kneeR = clampNum(kneeR, 0, 130);

  const leftSupport = kneeL < PHYS.kneeSupportMax;
  const rightSupport = kneeR < PHYS.kneeSupportMax;
  let supportSum = 0;
  let supportCount = 0;
  if (leftSupport) { supportSum += hipL; supportCount++; }
  if (rightSupport) { supportSum += hipR; supportCount++; }
  const supportAngle = supportCount ? supportSum / supportCount : 0;

  const torque = supportCount > 0
    ? (-supportAngle * PHYS.springK - state.lean * PHYS.dampK)
    : PHYS.gravity;
  state.leanVel = (state.leanVel + torque * dt) * PHYS.velDamp;
  state.lean += state.leanVel * dt;

  const fell = Math.abs(state.lean) > PHYS.fallLean;

  const stride = Math.min(90, Math.abs(hipL - hipR));
  const grounded = leftSupport || rightSupport;
  const speed = fell ? 0 : (grounded ? (PHYS.baseSpeed + stride * PHYS.strideK) : PHYS.airSpeed);
  state.distance += speed * dt;

  return { fell, leftSupport, rightSupport, hipL, hipR, kneeL, kneeR, speed };
}

export function forwardKinematics(hipDeg, kneeDeg) {
  const hipRad = (hipDeg * Math.PI) / 180;
  const shinRad = ((hipDeg - kneeDeg) * Math.PI) / 180;
  const knee = { x: Math.sin(hipRad) * PHYS.thigh, y: Math.cos(hipRad) * PHYS.thigh };
  const foot = {
    x: knee.x + Math.sin(shinRad) * PHYS.shin,
    y: knee.y + Math.cos(shinRad) * PHYS.shin,
  };
  return { knee, foot };
}

// ---------------------------------------------------------------------------
// Cell layout
// ---------------------------------------------------------------------------

export const COLS = ["A", "B", "C", "D"];
export const ROWS = [1, 2, 3, 4];
export const ALL_CELLS = ROWS.flatMap((r) => COLS.map((c) => `${c}${r}`));

// The four "keys": Q/W/O/P map onto the primary drive cells.
export const PRIMARY = { A1: "Q", B1: "W", A2: "O", B2: "P" };
export const PRIMARY_LABEL = { A1: "L·HIP", B1: "R·HIP", A2: "L·KNEE", B2: "R·KNEE" };

export const PRESETS = {
  standing: { A1: "0", B1: "0", A2: "0", B2: "0" },
  sine: {
    A1: "SIN(t*6)*38",
    B1: "SIN(t*6+PI)*38",
    A2: "MAX(0,SIN(t*6+1.6))*60",
    B2: "MAX(0,SIN(t*6+1.6+PI))*60",
  },
  chaos: {
    A1: "SIN(t*19)*85",
    B1: "COS(t*23)*85",
    A2: "70+SIN(t*13)*45",
    B2: "70+COS(t*11)*45",
  },
};

export function defaultCells() {
  const cells = {};
  for (const id of ALL_CELLS) cells[id] = "";
  Object.assign(cells, PRESETS.sine);
  return cells;
}

// ---------------------------------------------------------------------------
// DOM wiring — everything below only runs in a browser.
// ---------------------------------------------------------------------------

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}

function init() {
  const LS_BEST = "qwopsheet:best";
  const LS_CELLS = "qwopsheet:cells";

  const grid = document.getElementById("grid");
  const canvas = document.getElementById("runner");
  const ctx2d = canvas.getContext("2d");
  const distanceEl = document.getElementById("distance");
  const bestEl = document.getElementById("best");
  const statusEl = document.getElementById("status");
  const runBtn = document.getElementById("run-btn");
  const presetButtons = document.querySelectorAll("[data-preset]");
  const splat = document.getElementById("splat");
  const splatDistance = document.getElementById("splat-distance");
  const splatBest = document.getElementById("splat-best");
  const restartBtn = document.getElementById("restart-btn");
  const shareBtn = document.getElementById("share-btn");
  const shareBskyBtn = document.getElementById("share-bsky-btn");

  let cellsRaw = loadCells();
  let sheet = makeSheet(cellsRaw);
  let running = false;
  let t = 0;
  let n = 0;
  let lastFrame = 0;
  let state = { lean: 0, leanVel: 0, distance: 0 };
  let best = Number(localStorage.getItem(LS_BEST)) || 0;
  let lastValues = {};
  let lastErrors = {};

  bestEl.textContent = best ? `${best.toFixed(1)} m` : "—";

  buildGrid();
  resetRun();
  requestAnimationFrame(loop);

  function loadCells() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_CELLS) || "null");
      if (raw && typeof raw === "object") {
        const merged = defaultCells();
        for (const id of ALL_CELLS) if (typeof raw[id] === "string") merged[id] = raw[id];
        return merged;
      }
    } catch { /* fall through to defaults */ }
    return defaultCells();
  }

  function saveCells() {
    try { localStorage.setItem(LS_CELLS, JSON.stringify(cellsRaw)); } catch { /* ignore */ }
  }

  function buildGrid() {
    grid.innerHTML = "";
    for (const row of ROWS) {
      for (const col of COLS) {
        const id = `${col}${row}`;
        const cell = document.createElement("div");
        cell.className = "cell";
        if (PRIMARY[id]) cell.classList.add("primary");

        if (PRIMARY[id]) {
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = PRIMARY[id];
          cell.appendChild(badge);
          const label = document.createElement("span");
          label.className = "cell-label";
          label.textContent = PRIMARY_LABEL[id];
          cell.appendChild(label);
        } else {
          const label = document.createElement("span");
          label.className = "cell-label dim";
          label.textContent = id;
          cell.appendChild(label);
        }

        const input = document.createElement("input");
        input.className = "cell-input";
        input.spellcheck = false;
        input.autocomplete = "off";
        input.value = cellsRaw[id] || "";
        input.dataset.cell = id;
        input.addEventListener("input", () => {
          cellsRaw[id] = input.value;
          sheet = makeSheet(cellsRaw);
          saveCells();
        });
        cell.appendChild(input);

        const out = document.createElement("span");
        out.className = "cell-out";
        out.dataset.out = id;
        cell.appendChild(out);

        grid.appendChild(cell);
      }
    }
  }

  function resetRun() {
    running = true;
    t = 0;
    n = 0;
    lastFrame = 0;
    state = { lean: 0, leanVel: 0, distance: 0 };
    splat.hidden = true;
    statusEl.textContent = "running";
    statusEl.classList.remove("fell");
    runBtn.textContent = "↺ reset";
  }

  for (const btn of presetButtons) {
    btn.addEventListener("click", () => {
      const preset = PRESETS[btn.dataset.preset];
      if (!preset) return;
      Object.assign(cellsRaw, preset);
      sheet = makeSheet(cellsRaw);
      saveCells();
      for (const id of ALL_CELLS) {
        const input = grid.querySelector(`input[data-cell="${id}"]`);
        if (input) input.value = cellsRaw[id] || "";
      }
      resetRun();
    });
  }

  runBtn.addEventListener("click", resetRun);
  restartBtn.addEventListener("click", resetRun);

  function loop(ts) {
    if (!lastFrame) lastFrame = ts;
    const dt = Math.min(0.05, (ts - lastFrame) / 1000);
    lastFrame = ts;

    if (running) {
      t += dt;
      n += 1;
      const { values, errors } = sheet(t, n);
      lastValues = values;
      lastErrors = errors;
      const tick = physicsTick(state, values.A1, values.B1, values.A2, values.B2, dt);
      distanceEl.textContent = `${state.distance.toFixed(1)} m`;
      if (tick.fell) endRun();
      renderRunner(tick);
    }

    renderCellOutputs();
    requestAnimationFrame(loop);
  }

  function renderCellOutputs() {
    for (const id of ALL_CELLS) {
      const out = grid.querySelector(`[data-out="${id}"]`);
      if (!out) continue;
      if (lastErrors[id]) {
        out.textContent = "#ERR";
        out.title = lastErrors[id];
        out.classList.add("err");
      } else {
        const v = lastValues[id] ?? 0;
        out.textContent = v ? `→ ${v.toFixed(1)}` : "";
        out.title = "";
        out.classList.remove("err");
      }
    }
  }

  function endRun() {
    running = false;
    statusEl.textContent = "SPLAT";
    statusEl.classList.add("fell");
    runBtn.textContent = "▶ run again";
    const dist = state.distance;
    if (dist > best) {
      best = dist;
      localStorage.setItem(LS_BEST, String(best));
      bestEl.textContent = `${best.toFixed(1)} m`;
    }
    splatDistance.textContent = `${dist.toFixed(1)} m`;
    splatBest.textContent = `best: ${best.toFixed(1)} m`;
    splat.hidden = false;
    wireShare(dist);
  }

  function renderRunner(tick) {
    const w = canvas.width, h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);

    const groundY = h - 46;
    const hipX = 150;
    const hipY = groundY - (PHYS.thigh + PHYS.shin) * 0.92;

    // scrolling ground dashes sell forward motion
    ctx2d.strokeStyle = "#2c3550";
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.moveTo(0, groundY);
    ctx2d.lineTo(w, groundY);
    ctx2d.stroke();
    ctx2d.strokeStyle = "#1c2338";
    const offset = (state.distance * 40) % 40;
    for (let x = -offset; x < w; x += 40) {
      ctx2d.beginPath();
      ctx2d.moveTo(x, groundY + 1);
      ctx2d.lineTo(x + 18, groundY + 1);
      ctx2d.stroke();
    }

    const lean = (state.lean * Math.PI) / 180;

    // legs drawn from the (un-rotated) hip point; only the torso tips with lean
    ctx2d.lineCap = "round";
    ctx2d.lineWidth = 7;

    drawLeg(hipX, hipY, tick.hipL, tick.kneeL, tick.leftSupport ? "#6ef2c9" : "#4a5578");
    drawLeg(hipX, hipY, tick.hipR, tick.kneeR, tick.rightSupport ? "#6ef2c9" : "#4a5578");

    // torso + head, tipped by lean
    ctx2d.save();
    ctx2d.translate(hipX, hipY);
    ctx2d.rotate(lean);
    ctx2d.strokeStyle = "#f2e9ff";
    ctx2d.beginPath();
    ctx2d.moveTo(0, 0);
    ctx2d.lineTo(0, -58);
    ctx2d.stroke();
    ctx2d.fillStyle = "#f2e9ff";
    ctx2d.beginPath();
    ctx2d.arc(0, -70, 12, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.restore();
  }

  function drawLeg(hipX, hipY, hipDeg, kneeDeg, color) {
    const { knee, foot } = forwardKinematics(hipDeg, kneeDeg);
    ctx2d.strokeStyle = color;
    ctx2d.beginPath();
    ctx2d.moveTo(hipX, hipY);
    ctx2d.lineTo(hipX + knee.x, hipY + knee.y);
    ctx2d.lineTo(hipX + foot.x, hipY + foot.y);
    ctx2d.stroke();
  }

  // ---- sharing ----

  function buildShareText(dist) {
    const url = "https://qwopsheet.bisks.net/";
    return `ran ${dist.toFixed(1)}m in qwopsheet before faceplanting — QWOP but the controls are spreadsheet formulas. try to beat me: ${url}`;
  }

  function wireShare(dist) {
    const text = buildShareText(dist);
    shareBskyBtn.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;

    shareBtn.onclick = async () => {
      const card = buildShareCard(dist);
      card.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "qwopsheet.png", { type: "image/png" });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], text, title: "qwopsheet" });
            return;
          } catch { /* fall through to download */ }
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "qwopsheet.png";
        a.click();
      }, "image/png");
    };
  }

  function buildShareCard(dist) {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 630;
    const g = c.getContext("2d");
    g.fillStyle = "#0b0e1f";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#141a3d";
    g.fillRect(0, 470, c.width, 160);
    g.strokeStyle = "#2c3550";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 470);
    g.lineTo(c.width, 470);
    g.stroke();

    g.fillStyle = "#f2e9ff";
    g.font = "800 64px monospace";
    g.fillText("qwopsheet", 60, 120);
    g.fillStyle = "#93a3c2";
    g.font = "22px monospace";
    g.fillText("QWOP, but the controls are spreadsheet formulas", 62, 165);

    g.fillStyle = "#6ef2c9";
    g.font = "800 120px monospace";
    g.fillText(`${dist.toFixed(1)}m`, 60, 340);
    g.fillStyle = "#93a3c2";
    g.font = "24px monospace";
    g.fillText("before faceplanting", 64, 380);

    // little stick figure toppled over
    g.strokeStyle = "#f2e9ff";
    g.lineWidth = 8;
    g.lineCap = "round";
    g.save();
    g.translate(950, 420);
    g.rotate(1.1);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -70);
    g.stroke();
    g.beginPath();
    g.arc(0, -84, 15, 0, Math.PI * 2);
    g.fillStyle = "#f2e9ff";
    g.fill();
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-30, 40);
    g.moveTo(0, 0);
    g.lineTo(35, 30);
    g.stroke();
    g.restore();

    g.fillStyle = "#6ef2c9";
    g.font = "700 26px monospace";
    g.fillText("qwopsheet.bisks.net", 62, 560);

    return c;
  }
}
