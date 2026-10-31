import { buildRows, trainsFromDir, stationBoard, countdown, distance } from "./lib/trains.js";

const $ = (id) => document.getElementById(id);
const POLL_MS = 20000; // upstream refreshes about every 30s; the Worker caches for 15s
let line, rows, stById, trainsByDir = [[], []], fetchedAt = 0, selected = null;
let lastOk = 0, failing = false;

$("share").href = "https://bsky.app/intent/compose?text=" +
  encodeURIComponent("Live Baltimore light rail tracker — where every train is right now\nhttps://lightrail.bisks.net/");

async function boot() {
  line = await (await fetch("data/line.json")).json();
  stById = Object.fromEntries(line.stations.map((s) => [s.id, s]));
  rows = buildRows(line);
  selected = localStorage.getItem("lightrail:station");
  if (!stById[selected]) selected = null;
  render();
  poll();
  setInterval(() => { if (!document.hidden) render(); }, 1000);
  setInterval(() => { if (!document.hidden) poll(); }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
}

async function poll() {
  try {
    const [n, s] = await Promise.all([0, 1].map(async (d) => {
      const r = await fetch("api/dir/" + d);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }));
    fetchedAt = Date.now();
    trainsByDir = [trainsFromDir(n, line.platforms, 0, fetchedAt), trainsFromDir(s, line.platforms, 1, fetchedAt)];
    lastOk = fetchedAt; failing = false;
  } catch (e) {
    failing = true;
  }
  render();
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function render() {
  if (!line) return;
  const now = Date.now();
  renderStatus(now);
  renderDiagram(now);
  renderPanel(now);
}

function renderStatus(now) {
  const st = $("status");
  const count = trainsByDir[0].length + trainsByDir[1].length;
  st.className = failing ? "err" : "";
  if (failing) {
    $("statusText").textContent = lastOk ? "MTA data unreachable, showing " + Math.round((now - lastOk) / 1000) + "s old" : "MTA data unreachable, retrying…";
  } else if (lastOk) {
    $("statusText").textContent = count + (count === 1 ? " train" : " trains") + " live · updated " + Math.round((now - lastOk) / 1000) + "s ago";
  }
}

function renderDiagram(now) {
  // trains still ahead of "now" only; each sits in the gap before the station it's approaching
  const atStation = {}, gapAbove = {}, gapBelow = {};
  for (const trains of trainsByDir) {
    for (const t of trains) {
      const next = t.stops.find((x) => x.arriveAt > now - 20000);
      if (!next) continue;
      const secs = (next.arriveAt - now) / 1000;
      const item = { t, secs, next };
      if (secs <= 45) (atStation[next.st] ||= []).push(item);
      // northbound trains come from the row below, southbound from the row above
      else ((t.dir === 0 ? gapBelow : gapAbove)[next.st] ||= []).push(item);
    }
  }
  const frag = document.createDocumentFragment();
  const stRows = rows.filter((r) => r.kind === "station");
  const train = ({ t, secs, next }) => {
    const e = el("span", "train " + (t.dir ? "s" : "n"),
      (t.dir ? "▼ " : "▲ ") + t.vehicle + " → " + stById[next.st].name.replace(/ \(.*\)$/, "") + " " + countdown(next.arriveAt, now));
    return e;
  };
  const gap = (list) => {
    const g = el("div", "gap" + (list ? " has" : ""));
    if (list) for (const it of list) g.appendChild(train(it));
    return g;
  };
  rows.forEach((r, i) => {
    if (r.kind === "label") { frag.appendChild(el("div", "label", r.text)); return; }
    frag.appendChild(gap(gapAbove[r.id]));
    const row = el("div", "row" + (r.spur ? " spur" : "") + (r.id === selected ? " sel" : "") +
      (r === stRows[0] ? " first" : "") + (r === stRows[stRows.length - 1] ? " last" : ""));
    row.dataset.id = r.id;
    row.appendChild(el("span", "nm", stById[r.id].name));
    const chips = el("span", "chips");
    for (const it of atStation[r.id] || []) chips.appendChild(el("span", "chip " + (it.t.dir ? "s" : "n"), (it.t.dir ? "▼ " : "▲ ") + it.t.vehicle + " now"));
    row.appendChild(chips);
    row.addEventListener("click", () => select(r.id));
    frag.appendChild(row);
    frag.appendChild(gap(gapBelow[r.id]));
  });
  $("diagram").replaceChildren(frag);
}

function select(id, scroll) {
  selected = id;
  if (id) localStorage.setItem("lightrail:station", id);
  render();
  if (scroll) document.querySelector(".row.sel")?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function board(container, list, now) {
  const frag = document.createDocumentFragment();
  const upcoming = list.filter((a) => a.arriveAt > now - 30000).slice(0, 5);
  if (!upcoming.length) frag.appendChild(el("div", "none", failing ? "no data" : "no trains reported"));
  for (const a of upcoming) {
    const r = el("div", "arr");
    r.appendChild(el("span", "eta", countdown(a.arriveAt, now)));
    r.appendChild(el("span", "veh", a.time + " · train " + a.vehicle));
    frag.appendChild(r);
  }
  container.replaceChildren(frag);
}

function renderPanel(now) {
  const p = $("panel");
  if (!selected) { p.hidden = true; return; }
  p.hidden = false;
  $("panelName").textContent = stById[selected].name;
  const all = stationBoard(trainsByDir, selected);
  board($("boardN"), all.filter((a) => a.dir === 0), now);
  board($("boardS"), all.filter((a) => a.dir === 1), now);
}

$("panelClose").addEventListener("click", () => { selected = null; localStorage.removeItem("lightrail:station"); render(); });

$("near").addEventListener("click", () => {
  if (!navigator.geolocation) { $("statusText").textContent = "location isn't available in this browser"; return; }
  navigator.geolocation.getCurrentPosition((pos) => {
    let best = null, bd = Infinity;
    for (const s of line.stations) {
      const d = distance(pos.coords.latitude, pos.coords.longitude, s.lat, s.lon);
      if (d < bd) { bd = d; best = s; }
    }
    select(best.id, true);
    $("statusText").textContent = best.name + " is " + (bd < 1000 ? Math.round(bd) + " m" : (bd / 1609).toFixed(1) + " mi") + " away";
  }, () => { $("statusText").textContent = "couldn't get your location"; }, { timeout: 10000 });
});

boot().catch((e) => { $("statusText").textContent = "failed to load: " + e.message; $("status").className = "err"; });
