import { NODES, newStack, evaluate, fmtOhms, fmtFarads, fmtHz, KINDS } from "./circuit.js";

const NS = "http://www.w3.org/2000/svg";
const COLORS = ["var(--p1)", "var(--p2)"];
const NAMES = ["player 1", "player 2"];

// Pin coordinates on the 360x300 board. Pins 1-4 down the left, 8-5 down the right.
const PIN_Y = [90, 130, 170, 210];
const POS = {};
PIN_Y.forEach((y, i) => {
  POS[`P${i + 1}`] = [112, y];
  POS[`P${8 - i}`] = [248, y];
});
const RAIL = { VCC: { y: 14 }, GND: { y: 286 } };
const PIN_LABEL = { P1: "GND", P2: "TRIG", P3: "OUT", P4: "RESET", P5: "CTRL", P6: "THRES", P7: "DISCH", P8: "V+" };

let game;
function fresh() {
  return {
    turn: 0,
    winner: null,
    hand: null, // { part, origin?: placed record to restore on cancel }
    first: null,
    boards: [0, 1].map(() => ({ stack: newStack(), placed: [] })),
    msg: "player 1 starts. pick a part from your stack.",
  };
}

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

function partLabel(p) {
  if (p.kind === "res") return fmtOhms(p.ohms) + "Ω";
  if (p.kind === "cap") return fmtFarads(p.farads);
  return KINDS[p.kind].label;
}

function endpoints(p, placed) {
  const rail = (n, other) => {
    const ox = POS[other] ? POS[other][0] : 180;
    return [Math.max(30, Math.min(330, ox)), RAIL[n].y];
  };
  let a = POS[p.a], b = POS[p.b];
  if (!a && !b) return [[40, RAIL[p.a].y], [320, RAIL[p.b].y]];
  if (!a) a = rail(p.a, p.b);
  if (!b) b = rail(p.b, p.a);
  return [a, b];
}

function drawBoard(i) {
  const b = game.boards[i];
  const active = game.turn === i && !game.winner;
  const sec = document.createElement("section");
  sec.className = "board" + (active ? " active" : "") + (game.winner === i + 1 ? " won" : "");
  sec.style.setProperty("--c", COLORS[i]);
  const res = evaluate(b.placed);
  const h = document.createElement("h2");
  const nm = document.createElement("span");
  nm.textContent = NAMES[i];
  h.appendChild(nm);
  const hz = document.createElement("span");
  hz.className = "hz";
  if (res.ok) {
    const led = document.createElement("span");
    led.textContent = "● ";
    // A real 555 at audio speeds would be a blur, so the blink is capped to something visible.
    led.style.animation = `blink ${1 / Math.min(res.hz, 3)}s steps(1) infinite`;
    hz.appendChild(led);
    hz.appendChild(document.createTextNode(fmtHz(res.hz)));
  } else if (res.short) hz.textContent = "💨 smoke";
  h.appendChild(hz);
  sec.appendChild(h);

  const svg = el("svg", { class: "bb", viewBox: "0 0 360 300" });
  // rails
  for (const n of ["VCC", "GND"]) {
    const r = el("rect", { x: 20, y: RAIL[n].y - 9, width: 320, height: 18, rx: 4, class: "rail", fill: n === "VCC" ? "#6b2a2a" : "#26364a" }, svg);
    if (game.first === n && active) r.setAttribute("stroke", "#f0c040");
    r.addEventListener("click", () => clickNode(i, n));
    const t = el("text", { x: 180, y: RAIL[n].y + 4, class: "pinlabel", "text-anchor": "middle" }, svg);
    t.textContent = n === "VCC" ? "V+ rail" : "GND rail";
  }
  // chip
  el("rect", { x: 130, y: 62, width: 100, height: 176, rx: 6, fill: "#222", stroke: "#555" }, svg);
  el("path", { d: "M170 62 a10 10 0 0 0 20 0", fill: "#0b100d", stroke: "#555" }, svg);
  const ct = el("text", { x: 180, y: 155, class: "pinlabel", "text-anchor": "middle", style: "font-size:22px;fill:#777" }, svg);
  ct.textContent = "555";
  // parts (under pin dots)
  const seen = {};
  b.placed.forEach((p) => {
    const [pa, pb] = endpoints(p);
    const key = [p.a, p.b].sort().join("-");
    const k = (seen[key] = (seen[key] || 0) + 1);
    const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2;
    let nx = -(pb[1] - pa[1]), ny = pb[0] - pa[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    // bow away from the chip so parts don't draw across its body
    if ((mx - 180) * nx + (my - 150) * ny < 0) { nx = -nx; ny = -ny; }
    const off = 22 + (k - 1) * 16;
    const cx = mx + nx * off * 2, cy = my + ny * off * 2;
    const d = `M${pa[0]} ${pa[1]} Q${cx} ${cy} ${pb[0]} ${pb[1]}`;
    const g = el("g", { class: "part" }, svg);
    const color = p.kind === "wire" ? "#7ad77a" : p.kind === "led" ? "#ff6060" : "#d8b878";
    el("path", { d, class: "body", fill: "none", stroke: color, "stroke-width": p.kind === "wire" ? 2.5 : 5, "stroke-dasharray": p.kind === "wire" ? "" : "10 3" }, g);
    el("path", { d, class: "hit" }, g);
    if (p.kind !== "wire") {
      const t = el("text", { x: mx + nx * off, y: my + ny * off - 4 }, g);
      t.textContent = partLabel(p);
    }
    g.addEventListener("click", () => clickPart(i, p));
  });
  // holes
  for (const n of Object.keys(POS)) {
    const [x, y] = POS[n];
    const c = el("circle", { cx: x, cy: y, r: 8, class: "node" + (game.first === n && active ? " sel" : "") }, svg);
    c.addEventListener("click", () => clickNode(i, n));
    const left = x < 180;
    const t = el("text", { x: left ? 138 : 222, y: y + 4, class: "pinlabel", "text-anchor": left ? "start" : "end" }, svg);
    t.textContent = `${n.slice(1)} ${PIN_LABEL[n]}`;
  }
  sec.appendChild(svg);

  // stack
  const st = document.createElement("div");
  st.className = "stack";
  for (const p of b.stack) {
    const c = document.createElement("button");
    c.className = "chip" + (game.hand && game.hand.part === p ? " sel" : "");
    c.textContent = partLabel(p);
    c.disabled = !active || (game.hand && game.hand.part !== p && game.hand.origin);
    c.addEventListener("click", () => clickChip(i, p));
    st.appendChild(c);
  }
  if (!b.stack.length) st.textContent = "(stack empty)";
  sec.appendChild(st);

  // checklist
  const ul = document.createElement("ul");
  ul.className = "checks";
  for (const c of res.checks) {
    const li = document.createElement("li");
    li.textContent = c.label;
    if (c.pass) li.className = "ok";
    ul.appendChild(li);
  }
  sec.appendChild(ul);
  return sec;
}

function render() {
  const boards = $("boards");
  boards.replaceChildren(drawBoard(0), drawBoard(1));
  const over = !!game.winner;
  $("turn").textContent = over ? "game over" : `${NAMES[game.turn]}'s turn`;
  $("turn").style.color = COLORS[game.turn];
  const h = game.hand;
  $("hand").textContent = h ? `holding: ${partLabel(h.part)}${game.first ? ` · from ${game.first}, now pick the other end` : " · pick two holes"}` : "";
  $("cancel").hidden = !h;
  $("pass").disabled = over;
  $("msg").textContent = game.msg;
  $("win").hidden = !over;
}

function endTurn() {
  game.hand = null;
  game.first = null;
  game.turn = 1 - game.turn;
  game.msg = `${NAMES[game.turn]}: your move.`;
}

function clickChip(i, part) {
  if (i !== game.turn || game.winner) return;
  if (game.hand && game.hand.part === part) game.hand = null;
  else game.hand = { part };
  game.first = null;
  game.msg = game.hand ? `now click two holes to place the ${KINDS[part.kind].label}.` : "";
  render();
}

function clickPart(i, placed) {
  if (i !== game.turn || game.winner) return;
  if (game.hand) {
    game.msg = "you're already holding something. place it or put it back first.";
    return render();
  }
  const b = game.boards[i];
  b.placed.splice(b.placed.indexOf(placed), 1);
  game.hand = { part: placed.part, origin: placed };
  game.first = null;
  game.msg = `picked up the ${KINDS[placed.kind].label}. click two holes to move it.`;
  render();
}

function clickNode(i, n) {
  if (i !== game.turn || game.winner) return;
  if (!game.hand) {
    game.msg = "pick a part from your stack first (or click one on the board to move it).";
    return render();
  }
  if (!game.first) {
    game.first = n;
    game.msg = `from ${n}. now the other end.`;
    return render();
  }
  if (game.first === n) {
    game.first = null;
    game.msg = "";
    return render();
  }
  const b = game.boards[i];
  const part = game.hand.part;
  const rec = { kind: part.kind, a: game.first, b: n, part };
  if (part.ohms) rec.ohms = part.ohms;
  if (part.farads) rec.farads = part.farads;
  const moved = !!game.hand.origin;
  if (!moved) b.stack.splice(b.stack.indexOf(part), 1);
  b.placed.push(rec);
  const res = evaluate(b.placed);
  if (res.ok) {
    game.winner = i + 1;
    game.msg = "";
    $("winTitle").textContent = `${NAMES[i]} wins!`;
    $("winText").textContent = `the 555 is oscillating at ${fmtHz(res.hz)} (${res.mode}) after ${b.placed.length} parts on the board.`;
    const text = `${NAMES[i]} just got a 555 oscillating at ${fmtHz(res.hz)} in breadboard-555, a two-player breadboard race.\n\nhttps://breadboard-555.bisks.net/`;
    $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
    game.hand = null;
    game.first = null;
    return render();
  }
  const note = res.short ? " 💨 that shorted V+ to GND. smoke everywhere." : "";
  endTurn();
  game.msg = `${NAMES[1 - game.turn]} ${moved ? "moved" : "placed"} a ${KINDS[part.kind].label}.${note} ${NAMES[game.turn]}: your move.`;
  render();
}

$("cancel").addEventListener("click", () => {
  const h = game.hand;
  if (!h) return;
  // A part picked up from the board goes back where it was; one from the stack just stays there.
  if (h.origin) game.boards[game.turn].placed.push(h.origin);
  game.hand = null;
  game.first = null;
  game.msg = "put it back. still your turn.";
  render();
});
$("pass").addEventListener("click", () => {
  if (game.winner) return;
  if (game.hand && game.hand.origin) game.boards[game.turn].placed.push(game.hand.origin);
  endTurn();
  game.msg = `${NAMES[1 - game.turn]} passed. ${NAMES[game.turn]}: your move.`;
  render();
});
const restart = () => { game = fresh(); render(); };
$("reset").addEventListener("click", restart);
$("again").addEventListener("click", restart);

restart();
