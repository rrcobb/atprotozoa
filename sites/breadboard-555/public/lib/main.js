import { evaluate, fmtOhms, fmtFarads, fmtHz, KINDS } from "./circuit.js";
import { newGame, place, move, pass, rematch, whyNot } from "./game.js";
import { clientId, localStore, onlineStore } from "./net.js";

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

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

const me = clientId();
let store = null;
let mode = null; // "online" | "local"
let hand = null; // { from: "stack" | "board", id } — local to this browser, never synced
let first = null;
let note = ""; // local hint shown instead of the game log until the next move
let lastRound = -1;
let lastTurn = -1;

const g = () => store.get();
// Which side this browser plays: -1 is a spectator. Hot-seat plays whoever's turn it is.
function mySeat() {
  if (mode === "local") return g().turn;
  return g().seats.indexOf(me);
}

function partLabel(p) {
  if (p.kind === "res") return fmtOhms(p.ohms) + "Ω";
  if (p.kind === "cap") return fmtFarads(p.farads);
  return KINDS[p.kind].label;
}

function endpoints(p) {
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

function canAct() {
  return mode && !whyNot(g(), mySeat());
}

function drawBoard() {
  const doc = g();
  const active = canAct();
  const sec = document.createElement("section");
  sec.className = "board" + (doc.winner ? " won" : "");
  const res = evaluate(doc.placed);
  const h = document.createElement("h2");
  const nm = document.createElement("span");
  nm.textContent = "the shared breadboard";
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
  for (const n of ["VCC", "GND"]) {
    const r = el("rect", { x: 20, y: RAIL[n].y - 9, width: 320, height: 18, rx: 4, class: "rail", fill: n === "VCC" ? "#6b2a2a" : "#26364a" }, svg);
    if (first === n && active) r.setAttribute("stroke", "#f0c040");
    r.addEventListener("click", () => clickNode(n));
    const t = el("text", { x: 180, y: RAIL[n].y + 4, class: "pinlabel", "text-anchor": "middle" }, svg);
    t.textContent = n === "VCC" ? "V+ rail" : "GND rail";
  }
  el("rect", { x: 130, y: 62, width: 100, height: 176, rx: 6, fill: "#222", stroke: "#555" }, svg);
  el("path", { d: "M170 62 a10 10 0 0 0 20 0", fill: "#0b100d", stroke: "#555" }, svg);
  const ct = el("text", { x: 180, y: 155, class: "pinlabel", "text-anchor": "middle", style: "font-size:22px;fill:#777" }, svg);
  ct.textContent = "555";
  const seen = {};
  doc.placed.forEach((p) => {
    if (hand && hand.from === "board" && hand.id === p.id) return; // lifted off the board
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
    const g2 = el("g", { class: "part" }, svg);
    const owner = COLORS[p.by] || "#d8b878";
    const color = p.kind === "wire" ? owner : p.kind === "led" ? "#ff6060" : "#d8b878";
    el("path", { d, class: "body", fill: "none", stroke: color, "stroke-width": p.kind === "wire" ? 2.5 : 5, "stroke-dasharray": p.kind === "wire" ? "" : "10 3" }, g2);
    el("path", { d, class: "hit" }, g2);
    if (p.kind !== "wire") {
      const t = el("text", { x: mx + nx * off, y: my + ny * off - 4, style: `fill:${owner}` }, g2);
      t.textContent = partLabel(p);
    }
    g2.addEventListener("click", () => clickPart(p));
  });
  for (const n of Object.keys(POS)) {
    const [x, y] = POS[n];
    const c = el("circle", { cx: x, cy: y, r: 8, class: "node" + (first === n && active ? " sel" : "") }, svg);
    c.addEventListener("click", () => clickNode(n));
    const left = x < 180;
    const t = el("text", { x: left ? 138 : 222, y: y + 4, class: "pinlabel", "text-anchor": left ? "start" : "end" }, svg);
    t.textContent = `${n.slice(1)} ${PIN_LABEL[n]}`;
  }
  sec.appendChild(svg);

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

function drawStack(i) {
  const doc = g();
  const seat = mySeat();
  const mine = seat === i;
  const sec = document.createElement("section");
  sec.className = "pstack" + (doc.turn === i && !doc.winner ? " active" : "");
  sec.style.setProperty("--c", COLORS[i]);
  const h = document.createElement("h2");
  h.textContent = NAMES[i] + (mode === "online" && mine ? " (you)" : "") + (doc.turn === i && !doc.winner ? " · to move" : "");
  sec.appendChild(h);
  const st = document.createElement("div");
  st.className = "stack";
  const usable = canAct() && mine && !(hand && hand.from === "board");
  for (const p of doc.stacks[i]) {
    const c = document.createElement("button");
    c.className = "chip" + (hand && hand.from === "stack" && hand.id === p.id ? " sel" : "");
    c.textContent = partLabel(p);
    c.disabled = !usable;
    c.addEventListener("click", () => clickChip(p));
    st.appendChild(c);
  }
  if (!doc.stacks[i].length) st.textContent = "(stack empty)";
  sec.appendChild(st);
  return sec;
}

function drawInvite() {
  const doc = g();
  const box = $("invite");
  const waiting = mode === "online" && doc.seats[1] == null;
  box.hidden = !waiting;
  if (!waiting) return;
  const link = location.href;
  $("joinlink").value = link;
  $("sharejoin").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(`join my breadboard-555 game: first to make the shared 555 oscillate wins.\n\n${link}`);
}

function render() {
  const doc = g();
  if (doc.round !== lastRound) { hand = null; first = null; note = ""; lastRound = doc.round; }
  if (doc.turn !== lastTurn) { hand = null; first = null; lastTurn = doc.turn; }
  $("lobby").hidden = !!mode;
  $("game").hidden = !mode;
  if (!mode) return;
  $("boards").replaceChildren(drawStack(0), drawBoard(), drawStack(1));
  drawInvite();
  const over = !!doc.winner;
  const seat = mySeat();
  const who = mode === "local" ? "" : seat < 0 ? " (watching)" : ` (you are ${NAMES[seat]})`;
  $("turn").textContent = (over ? "game over" : `${NAMES[doc.turn]}'s turn`) + who;
  $("turn").style.color = COLORS[doc.turn];
  $("hand").textContent = hand
    ? `holding: ${partLabel(hand.from === "stack" ? g().stacks[seat].find((p) => p.id === hand.id) || {} : g().placed.find((p) => p.id === hand.id) || {})}${first ? ` · from ${first}, now pick the other end` : " · pick two holes"}`
    : "";
  $("cancel").hidden = !hand;
  $("pass").disabled = !canAct();
  $("msg").textContent = note || doc.log;
  $("win").hidden = !over;
  if (over) {
    const text = `${NAMES[doc.winner - 1]} just got the shared 555 oscillating at ${doc.result || ""} in breadboard-555, a two-player breadboard race.\n\nhttps://breadboard-555.bisks.net/`;
    $("winTitle").textContent = `${NAMES[doc.winner - 1]} wins!`;
    $("winText").textContent = `the 555 is oscillating: ${doc.result || ""}.`;
    $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  }
}

function say(t) { note = t; render(); }

function clickChip(p) {
  if (!canAct()) return;
  hand = hand && hand.id === p.id ? null : { from: "stack", id: p.id };
  first = null;
  say(hand ? `now click two holes to place the ${KINDS[p.kind].label}.` : "");
}

function clickPart(p) {
  if (!canAct()) return say(whyNot(g(), mySeat()) || "you're watching this one.");
  if (hand) return say("you're already holding something. place it or put it back first.");
  hand = { from: "board", id: p.id };
  first = null;
  say(`picked up the ${KINDS[p.kind].label}${p.by !== mySeat() ? " (it's your opponent's!)" : ""}. click two holes to move it.`);
}

function clickNode(n) {
  if (!canAct()) return say(whyNot(g(), mySeat()) || "you're watching this one.");
  if (!hand) return say("pick a part from your stack first (or click one on the board to move it).");
  if (!first) { first = n; return say(`from ${n}. now the other end.`); }
  if (first === n) { first = null; return say(""); }
  const a = first, seat = mySeat(), h = hand;
  hand = null;
  first = null;
  note = "";
  store.change((d) => { if (h.from === "stack") place(d, seat, h.id, a, n); else move(d, seat, h.id, a, n); });
  render();
}

$("cancel").addEventListener("click", () => {
  hand = null;
  first = null;
  say("put it back. still your turn.");
});
$("pass").addEventListener("click", () => {
  const seat = mySeat();
  hand = null; first = null; note = "";
  store.change((d) => { pass(d, seat); });
  render();
});
$("again").addEventListener("click", () => { store.change((d) => rematch(d)); render(); });
$("reset").addEventListener("click", () => {
  if (mode === "local") { store = localStore(newGame()); lastRound = -1; lastTurn = -1; note = ""; hand = null; first = null; render(); }
  else if (confirm("start a fresh game with the same link? the board and both stacks reset.")) { store.change((d) => rematch(d)); render(); }
});
$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); $("copy").textContent = "copied"; }
  catch { $("joinlink").select(); }
});

function startLocal() {
  mode = "local";
  store = localStore(newGame());
  store.onChange(render);
  $("modeNote").textContent = "hot-seat: both players share this screen.";
  render();
}

// Seats are first-come. If two people grab seat 2 at once the last write wins,
// and the loser sees their seat isn't theirs after the next sync and just watches.
function claimSeat() {
  const d = g();
  if (d.seats.indexOf(me) < 0 && d.seats[1] == null) store.change((x) => { if (x.seats[1] == null) x.seats[1] = me; });
}

async function startOnline(url) {
  $("lobbyMsg").textContent = url ? "joining the game…" : "opening a new game…";
  try {
    store = await onlineStore(url, newGame(me));
  } catch (e) {
    $("lobbyMsg").textContent = `couldn't reach the shared game (${e.message}). you can still play hot-seat.`;
    return;
  }
  mode = "online";
  if (!url) history.replaceState(null, "", "#" + store.url);
  $("modeNote").textContent = "online: moves sync live between everyone with the link.";
  store.onChange(() => { claimSeat(); render(); });
  claimSeat();
  render();
}

$("newOnline").addEventListener("click", () => startOnline(null));
$("hotseat").addEventListener("click", startLocal);

const hash = decodeURIComponent(location.hash.slice(1));
if (hash.startsWith("automerge:")) startOnline(hash);
