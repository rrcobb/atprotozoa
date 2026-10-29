// App wiring: roster -> worker engine -> playback timeline -> canvas, plus
// search/inspect, archive, chaining and the real-DID index.
import { ALGO, Tournament, roundSizes, genesisSeed, chainSeed, seedCommitment, tournamentId } from "./lib/engine.js";
import { syntheticRoster, realRoster, isDid, cleanInput } from "./lib/roster.js";
import { BracketView } from "./lib/render.js";
import { crawl, loadIndex, clearIndex, emptyIndex } from "./lib/index-crawl.js";

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString("en-US");
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
// 20M entrants ≈ 8 bytes each across all rounds (~160 MB of typed arrays) plus
// the shuffle: about what one browser tab can hold. Permalinks above it are refused.
const MAX_N = 20_000_000;
const ARCHIVE_KEY = "lastperson.archive.v1", ARCHIVE_KEEP = 200; // ~400 B each: ~80 KB of the 5 MB localStorage quota
const RATE_MAX = 4, RATE_STD = 0.9, SLOW_FACTOR = 0.3; // rounds per second

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const c of kids) e.append(c);
  return e;
}

const view = new BracketView($("bracket"));
const S = {
  mode: "real", nSyn: 1_000_000, k: 1, seed: "", runId: 0, cancel: null,
  roster: null, tour: null, checksum: "", computeMs: 0, matchesLive: 0,
  P: 0, paused: false, fast: true, slow: false,
  champShown: false, hold: false, holdLeft: 0, holdTotal: 12, archived: false,
  index: null, crawlAbort: null, pendingDid: null, selected: -1, tween: null, benching: false, maxDt: 0,
};

// ---------- compute (worker, with a main-thread fallback) ----------
function compute(N, seed, batch, onProgress) {
  let worker = null, cancelled = false, timer = 0;
  const promise = new Promise((resolve, reject) => {
    const fallback = () => {
      const t = new Tournament(N, seed), t0 = performance.now();
      const pump = () => {
        if (cancelled) return;
        const until = performance.now() + 25;
        while (performance.now() < until && !t.step(batch));
        onProgress?.(t.matches);
        if (t.done) resolve({ tour: t, ms: performance.now() - t0, checksum: t.checksum() });
        else timer = setTimeout(pump, 0);
      };
      pump();
    };
    try { worker = new Worker(new URL("./lib/worker.js", import.meta.url), { type: "module" }); } catch { return fallback(); }
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === "progress") onProgress?.(m.matches);
      else if (m.type === "done") {
        worker.terminate();
        resolve({ tour: Tournament.fromRounds(N, seed, m.rounds, m), ms: m.ms, checksum: m.checksum });
      }
    };
    worker.onerror = () => { worker.terminate(); worker = null; fallback(); };
    worker.postMessage({ N, seed, batch });
  });
  return { promise, cancel: () => { cancelled = true; clearTimeout(timer); worker?.terminate(); } };
}

// ---------- tournament lifecycle ----------
function permalink(did) {
  const base = location.origin + location.pathname;
  if (S.roster?.kind !== "synthetic") return `${base}#m=real&r=${S.roster?.id ?? ""}&t=${S.k}&s=${S.seed}` + (did ? `&d=${did}` : "");
  return `${base}#m=syn&n=${S.roster.n}&t=${S.k}&s=${S.seed}` + (did ? `&d=${did}` : "");
}

async function launch(k, seed) {
  S.cancel?.(); const run = ++S.runId;
  S.k = k; S.seed = seed; S.tour = null; S.P = 0; S.champShown = false; S.archived = false; S.checksum = "";
  S.holdLeft = 0; S.selected = -1; S.matchesLive = 0; S.tween = null;
  $("champion").hidden = true; $("panel-inspect").hidden = true; view.setHighlight(null);
  setStatus(k === 1 ? "INITIALISING" : "REPOPULATING...");
  S.roster = S.mode === "syn" ? syntheticRoster(S.nSyn)
    : await realRoster(S.index?.dids ?? [], { partial: !S.index?.complete, asOf: S.index?.lastSeen });
  if (run !== S.runId) return;
  const N = S.roster.n, syn = S.roster.kind === "synthetic";
  view.setTournament({ N, sizes: roundSizes(N), roster: S.roster });
  $("m-tid").textContent = "#" + tournamentId(k);
  $("m-roster").textContent = `INDEXED IDENTITIES: ${fmt(N)}${syn ? " (SYNTHETIC)" : ""}`;
  $("bigcount").textContent = N === 0 ? "0 IDENTITIES" : `${fmt(N)} IDENTITIES → 1 SURVIVOR`;
  const b = $("banner");
  b.className = "banner" + (syn ? "" : " real");
  b.textContent = syn ? "DEMO DATA · SYNTHETIC did:example IDENTITIES · NO REAL ACCOUNTS"
    : `REAL PUBLIC DIDS · ${S.index?.complete ? "RELAY LISTING COMPLETE" : "PARTIAL INDEX"} · AS LISTED BY THE RELAY, NOT "ALL OF BLUESKY"`;
  seedCommitment(seed).then((c) => { if (run === S.runId) $("m-commit").textContent = c.slice(0, 16) + "…"; });
  if (N === 0) {
    setStatus("NO ENTRANTS · NO CHAMPION");
    $("remain").textContent = "THE ROSTER IS EMPTY. OPEN SOURCE TO INDEX SOME DIDS.";
    updateReadout(); return;
  }
  setStatus("ELIMINATION IN PROGRESS · COMPUTING");
  $("remain").textContent = "POPULATION REDUCTION IN PROGRESS";
  const job = compute(N, seed, 1 << 16, (m) => { if (run === S.runId) S.matchesLive = m; });
  S.cancel = job.cancel;
  const res = await job.promise;
  if (run !== S.runId) return;
  S.tour = res.tour; S.checksum = res.checksum; S.computeMs = res.ms; S.matchesLive = res.tour.matches;
  view.rounds = res.tour.rounds;
  if (REDUCED) S.P = view.R;
  setStatus(S.P >= view.R ? "SIMULATION COMPLETE" : "SIMULATION COMPLETE · PLAYBACK IN PROGRESS");
  if (S.pendingDid) { const d = S.pendingDid; S.pendingDid = null; $("q").value = d; locate(d); }
}

async function nextTournament() {
  if (!S.tour) return;
  const prevId = tournamentId(S.k);
  const champ = S.roster.didAt(S.tour.champion);
  const seed = await chainSeed(S.seed, champ, prevId);
  launch(S.k + 1, seed);
}

async function newChain(mode, n) {
  S.mode = mode; if (n) S.nSyn = n;
  history.replaceState(null, "", location.pathname);
  launch(1, await genesisSeed());
}

function setStatus(t) { $("m-status").textContent = t; }

// ---------- champion + archive ----------
function showChampion() {
  S.champShown = true;
  const t = S.tour, did = S.roster.didAt(t.champion);
  $("remain").textContent = "THE FINAL MATCH HAS BEEN RESOLVED";
  setStatus("ONE IDENTITY REMAINS");
  $("ch-did").textContent = did;
  $("ch-facts").textContent = `TOURNAMENT #${tournamentId(S.k)} · ${fmt(S.roster.n)} STARTING · ${fmt(t.matches)} ELIMINATIONS` +
    ` · ${t.byes} BYES · ${S.computeMs.toFixed(0)} ms COMPUTE · SEED ${S.seed.slice(0, 12)}… · ${ALGO} · CHECKSUM ${S.checksum}`;
  const txt = `TOURNAMENT #${tournamentId(S.k)}: ${fmt(S.roster.n)} ${S.roster.kind === "synthetic" ? "synthetic " : ""}identities → 1 survivor.\nYOU HAVE WON THE INTERNET.\n${did}`;
  $("a-share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\n" + permalink());
  $("champion").hidden = false;
  S.holdTotal = Number($("s-hold").value) || 12; S.holdLeft = S.holdTotal;
  if (!S.archived) { S.archived = true; archive(did); }
}

function readArchive() { try { return JSON.parse(localStorage.getItem(ARCHIVE_KEY)) || []; } catch { return []; } }
function archive(did) {
  const rec = { k: S.k, id: tournamentId(S.k), at: new Date().toISOString(), mode: S.roster.kind, rosterId: S.roster.id, n: S.roster.n,
    seed: S.seed, champion: did, matches: S.tour.matches, byes: S.tour.byes, ms: Math.round(S.computeMs), checksum: S.checksum, algo: ALGO, link: permalink() };
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify([rec, ...readArchive()].slice(0, ARCHIVE_KEEP))); } catch { /* quota or private mode: archive is best-effort */ }
  if (!$("panel-archive").hidden) renderArchive();
}
function renderArchive() {
  const body = $("archive-body"), rows = readArchive();
  body.replaceChildren();
  if (!rows.length) { body.append(el("p", { class: "note" }, "NO COMPLETED TOURNAMENTS YET.")); return; }
  const tb = el("table", { class: "t" }, el("tr", {}, ...["#", "ENTRANTS", "CHAMPION", "MS", ""].map((h) => el("th", {}, h))));
  for (const r of rows) {
    const link = r.mode === "synthetic" ? el("a", { href: r.link, onclick: () => setTimeout(() => location.reload(), 0) }, "REPLAY") : el("span", { class: "note" }, "SNAPSHOT NOT STORED");
    tb.append(el("tr", {}, el("td", {}, r.id), el("td", {}, fmt(r.n) + (r.mode === "synthetic" ? " (demo)" : " (real)")),
      el("td", { title: r.champion }, r.champion.length > 24 ? r.champion.slice(0, 14) + "…" + r.champion.slice(-5) : r.champion), el("td", {}, String(r.ms)), el("td", {}, link)));
    tb.append(el("tr", {}, el("td", { colspan: "5", class: "note" }, `seed ${r.seed} · roster ${r.rosterId} · ${r.algo} · checksum ${r.checksum} · ${r.at.slice(0, 19)}Z`)));
  }
  body.append(tb);
}

// ---------- search / inspect ----------
async function resolveDid(input) {
  const q = cleanInput(input);
  if (isDid(q)) return { did: q };
  if (!q.includes(".")) return { error: "ENTER A DID (did:plc:…) OR A HANDLE" };
  try {
    const r = await fetch("https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=" + encodeURIComponent(q.toLowerCase()));
    if (!r.ok) return { error: "HANDLE RESOLUTION FAILED — THIS SAYS NOTHING ABOUT THE ROSTER" };
    return { did: (await r.json()).did, handle: q };
  } catch { return { error: "HANDLE RESOLUTION FAILED — THIS SAYS NOTHING ABOUT THE ROSTER" }; }
}

async function locate(input) {
  const out = $("inspect-body"); $("panel-inspect").hidden = false;
  if (!S.tour) { out.replaceChildren(el("p", { class: "miss" }, "SIMULATION NOT COMPLETE. TRY AGAIN IN A MOMENT.")); return; }
  out.replaceChildren(el("p", { class: "note" }, "RESOLVING…"));
  const r = await resolveDid(input);
  if (r.error) { out.replaceChildren(el("p", { class: "miss" }, r.error)); return; }
  const e = S.roster.indexOf(r.did);
  if (e < 0) { out.replaceChildren(el("p", { class: "miss" }, "NOT IN THIS TOURNAMENT'S ROSTER"), el("p", { class: "note" }, r.did + "\nTournament #" + tournamentId(S.k) + " roster: " + S.roster.id)); view.setHighlight(null); return; }
  inspect(e, true);
}

function didBtn(e) {
  const d = S.roster.didAt(e);
  return el("button", { class: "did", type: "button", title: d, onclick: () => inspect(e, true) }, d.length > 30 ? d.slice(0, 18) + "…" + d.slice(-6) : d);
}

function inspect(e, fly) {
  const t = S.tour; if (!t) return;
  const tr = t.trace(e); if (!tr) return;
  S.selected = e;
  const did = S.roster.didAt(e), out = $("inspect-body");
  const kv = el("dl", { class: "kv" },
    el("dt", {}, "DID"), el("dd", {}, did),
    el("dt", {}, "ENTRANT"), el("dd", {}, `#${fmt(e)} in canonical roster order`),
    el("dt", {}, "BRACKET SLOT"), el("dd", {}, `${fmt(tr.startPos)} of ${fmt(t.N)} (round 1)`),
    el("dt", {}, "RESULT"),
    el("dd", { class: tr.champion ? "won" : "lost" }, tr.champion ? "CHAMPION — WON EVERY ROUND" : `ELIMINATED IN ROUND ${tr.eliminatedRound + 1} OF ${t.R}`));
  const tb = el("table", { class: "t" }, el("tr", {}, ...["ROUND", "OPPONENT", ""].map((h) => el("th", {}, h))));
  for (const s of tr.steps) tb.append(el("tr", {}, el("td", {}, String(s.round + 1)),
    el("td", {}, s.bye ? "BYE (not a match)" : didBtn(s.opponent)), el("td", { class: s.won ? "won" : "lost" }, s.bye ? "ADVANCED" : s.won ? "WON" : "LOST")));
  const kids = [kv, tb];
  const chain = t.eliminatorChain(e);
  if (chain.length) {
    kids.push(el("p", { class: "note" }, "WHAT BECAME OF WHOEVER ELIMINATED THIS ENTRANT:"));
    const ct = el("table", { class: "t" }, el("tr", {}, ...["ROUND", "BEATEN BY"].map((h) => el("th", {}, h))));
    for (const c of chain) ct.append(el("tr", {}, el("td", {}, String(c.round + 1)), el("td", {}, didBtn(c.by))));
    kids.push(ct);
    const lastBy = chain[chain.length - 1].by;
    if (lastBy === t.champion) kids.push(el("p", { class: "won" }, "THE CHAIN ENDS AT THE CHAMPION."));
    else kids.push(el("p", { class: "note" }, "THE CHAIN ENDS AT AN ENTRANT ELIMINATED NO FURTHER."));
  }
  const link = permalink(did);
  kids.push(el("div", { class: "row" }, el("button", { type: "button", onclick: (ev) => { navigator.clipboard?.writeText(link); ev.target.textContent = "COPIED"; } }, "COPY PERMALINK")));
  if (S.roster.kind !== "synthetic") kids.push(el("p", { class: "note" }, "Real-roster permalinks name the snapshot but cannot rebuild it elsewhere."));
  out.replaceChildren(...kids);
  const mine = tr.steps.map((s) => ({ r: s.round, pos: s.pos, lose: !s.won }));
  let other = [];
  if (tr.eliminatedBy >= 0) { const t2 = t.trace(tr.eliminatedBy); other = t2.steps.filter((s) => s.round > tr.eliminatedRound).map((s) => ({ r: s.round, pos: s.pos })); }
  view.setHighlight({ mine, other });
  if (fly) flyTo(view.targetFor(0, tr.startPos));
}

function flyTo(target) {
  if (REDUCED) { Object.assign(view, { zoom: target.zoom, cx: target.cx, cy: target.cy }); view.clampCam(); view.dirty = true; return; }
  S.tween = { t0: performance.now(), dur: 650, from: { zoom: view.zoom, cx: view.cx, cy: view.cy }, to: target };
}

// ---------- controls ----------
function revealed() {
  if (!S.tour) return 0;
  const r = Math.min(view.R, Math.floor(S.P));
  if (r >= view.R) return view.cum[view.R];
  return view.cum[r] + (S.P - r) * (view.sizes[r] >> 1);
}
const setPaused = (p) => { S.paused = p; $("b-pause").textContent = p ? "RESUME" : "PAUSE"; };
$("b-pause").onclick = () => setPaused(!S.paused);
$("b-speed").onclick = () => { S.fast = !S.fast; $("b-speed").setAttribute("aria-pressed", String(S.fast)); $("b-speed").textContent = S.fast ? "MAX SPEED" : "STANDARD SPEED"; };
$("c-slow").onchange = (e) => { S.slow = e.target.checked; };
$("b-replay").onclick = () => { if (!S.tour) return; S.P = 0; S.champShown = false; S.holdLeft = 0; $("champion").hidden = true; setPaused(false); setStatus("SIMULATION COMPLETE · PLAYBACK IN PROGRESS"); $("remain").textContent = "POPULATION REDUCTION IN PROGRESS"; if (REDUCED) setPaused(true); };
$("b-step").onclick = () => { if (!S.tour) return; setPaused(true); S.P = Math.min(view.R, Math.floor(S.P + 1e-9) + 1); if (S.P < view.R) { S.champShown = false; $("champion").hidden = true; } };
$("b-fit").onclick = () => flyTo({ zoom: 1, cx: view.R / 2, cy: 0.5 });
$("b-final").onclick = () => flyTo({ zoom: Math.min(view.maxZoom, 3), cx: Math.max(0, view.R - 1), cy: 0.5 });
$("b-next").onclick = () => nextTournament();
$("b-hold").onclick = () => { S.hold = !S.hold; $("b-hold").setAttribute("aria-pressed", String(S.hold)); $("b-hold").textContent = S.hold ? "RESUME RESTART" : "PAUSE RESTART"; };
$("b-copy").onclick = (ev) => { navigator.clipboard?.writeText(permalink()); ev.target.textContent = "COPIED"; setTimeout(() => (ev.target.textContent = "COPY PERMALINK"), 1500); };
$("b-verify").onclick = async () => {
  if (!S.tour) return; const msg = $("ch-count"); msg.textContent = "VERIFYING: RECOMPUTING WITH A DIFFERENT BATCH SIZE…";
  const job = compute(S.roster.n, S.seed, 4099); const r = await job.promise;
  const same = r.checksum === S.checksum && r.tour.champion === S.tour.champion;
  msg.textContent = same ? `REPLAY VERIFIED: ${fmt(r.tour.matches)} MATCHES IDENTICAL · CHECKSUM ${r.checksum}` : `REPLAY MISMATCH: ${r.checksum} ≠ ${S.checksum}`;
  S.holdLeft = Math.max(S.holdLeft, 8);
};
$("search").onsubmit = (ev) => { ev.preventDefault(); const v = $("q").value; if (v.trim()) locate(v); };
$("b-rand").onclick = () => {
  if (!S.tour) return; const a = new Uint32Array(1); crypto.getRandomValues(a);
  $("q").value = S.roster.didAt(a[0] % S.roster.n); locate($("q").value);
};
document.querySelectorAll("[data-panel]").forEach((b) => (b.onclick = () => {
  const p = $("panel-" + b.dataset.panel), open = p.hidden;
  document.querySelectorAll(".panel").forEach((x) => (x.hidden = true)); p.hidden = !open;
  if (b.dataset.panel === "archive") renderArchive();
  if (b.dataset.panel === "source") refreshSource();
}));
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => ($("panel-" + b.dataset.close).hidden = true)));

// ---------- source panel ----------
function refreshSource() {
  const mode = document.querySelector('input[name=mode]:checked').value;
  $("src-syn").hidden = mode !== "syn"; $("src-real").hidden = mode !== "real";
  const ix = S.index;
  $("idx-status").textContent = !ix ? "LOADING SAVED INDEX…" : `INDEXED PUBLIC DIDS: ${fmt(ix.dids.length)}\n${ix.complete ? "RELAY LISTING EXHAUSTED" : "PARTIAL — the relay has more repos than this index holds"}\nINACTIVE REPOS SKIPPED: ${fmt(ix.skippedInactive || 0)}\nFIRST SEEN ${ix.firstSeen || "—"}\nLAST SEEN  ${ix.lastSeen || "—"}\nSOURCE ${ix.source}`;
}
document.querySelectorAll("input[name=mode]").forEach((r) => (r.onchange = refreshSource));
$("b-apply").onclick = () => {
  const mode = document.querySelector('input[name=mode]:checked').value;
  newChain(mode, Number($("n-syn").value));
  $("panel-source").hidden = true;
};
$("s-hold").onchange = () => { S.holdTotal = Number($("s-hold").value); };
$("b-crawl").onclick = async () => {
  S.crawlAbort = new AbortController(); $("b-crawl").disabled = true; $("b-crawl-stop").disabled = false;
  try { await crawl(S.index, S.index.dids.length + 50_000, S.crawlAbort.signal, refreshSource); }
  catch (e) { if (e.name !== "AbortError") $("idx-status").textContent += "\nERROR: " + e.message + " (saved progress kept; try again)"; }
  $("b-crawl").disabled = false; $("b-crawl-stop").disabled = true; refreshSource();
};
$("b-crawl-stop").onclick = () => S.crawlAbort?.abort();
$("b-crawl-clear").onclick = async () => { S.crawlAbort?.abort(); await clearIndex(); S.index = emptyIndex(); refreshSource(); };
$("b-archive-clear").onclick = () => { localStorage.removeItem(ARCHIVE_KEY); renderArchive(); };

$("b-bench").onclick = async () => {
  const out = $("bench-out"); $("b-bench").disabled = true; S.benching = true; S.maxDt = 0;
  out.textContent = "Running in a worker. Measured on this device, not promised.\n";
  const seed = await genesisSeed();
  for (const N of [100_000, 1_000_000, 10_000_000]) {
    try {
      const t0 = performance.now(); const r = await compute(N, seed, 1 << 16).promise; const wall = performance.now() - t0;
      out.textContent += `${fmt(N).padStart(11)} entrants: engine ${r.ms.toFixed(0)} ms, with transfer ${wall.toFixed(0)} ms, ${fmt(r.tour.matches)} matches, ~${(2 * 4 * N / 1048576).toFixed(0)} MB survivor arrays\n`;
    } catch (e) { out.textContent += `${fmt(N)}: failed (${e.message})\n`; break; }
  }
  out.textContent += `slowest animation frame during the run: ${S.maxDt.toFixed(0)} ms\n(peak memory is not exposed to pages; check the browser task manager)`;
  S.benching = false; $("b-bench").disabled = false;
};

// ---------- canvas input ----------
const cv = $("bracket"), ptrs = new Map();
let drag = null, pinch = 0;
cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; S.tween = null;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
cv.addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) return;
  const p = ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) view.zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch = d; drag && (drag.moved = 99);
  } else if (drag) { drag.moved += Math.abs(dx) + Math.abs(dy); view.panBy(dx, dy); }
});
const endPtr = (e) => {
  ptrs.delete(e.pointerId); pinch = 0;
  if (drag && ptrs.size === 0 && drag.moved < 5 && performance.now() - drag.t < 500) {
    const h = view.hit(e.clientX, e.clientY);
    if (h && S.tour) { inspect(h.entrant, false); $("panel-inspect").hidden = false; }
  }
  if (ptrs.size === 0) drag = null;
};
cv.addEventListener("pointerup", endPtr); cv.addEventListener("pointercancel", endPtr);
cv.addEventListener("wheel", (e) => { e.preventDefault(); S.tween = null; view.zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016)), e.clientX, e.clientY); }, { passive: false });
cv.addEventListener("keydown", (e) => {
  const step = 48, k = e.key;
  if (k === "ArrowUp") view.panBy(0, step); else if (k === "ArrowDown") view.panBy(0, -step);
  else if (k === "ArrowLeft") view.panBy(step, 0); else if (k === "ArrowRight") view.panBy(-step, 0);
  else if (k === "+" || k === "=") view.zoomAt(1.35, view.vw / 2, view.vh / 2); else if (k === "-") view.zoomAt(1 / 1.35, view.vw / 2, view.vh / 2);
  else if (k === "0") $("b-fit").click(); else if (k === "f" || k === "F") $("b-final").click(); else if (k === " ") setPaused(!S.paused);
  else return;
  e.preventDefault();
});
addEventListener("resize", () => view.resize());

// ---------- frame loop ----------
let last = performance.now(), lastRead = 0;
function updateReadout() {
  const N = S.roster?.n ?? 0, c = Math.floor(revealed());
  $("r-matches").textContent = `${fmt(S.tour ? S.tour.matches : S.matchesLive)} / ${fmt(Math.max(0, N - 1))}`;
  const surv = S.tour ? Math.max(1, N - c) : N;
  $("r-surv").textContent = fmt(surv);
  $("r-round").textContent = S.tour ? `${Math.min(view.R, Math.floor(S.P) + (S.P >= view.R ? 0 : 1))} / ${view.R}` : `0 / ${view.R}`;
  $("r-ms").textContent = S.tour ? `${S.computeMs.toFixed(0)} ms` : "…";
  $("r-fps").textContent = `${view.fps} fps`; $("r-lod").textContent = view.lod;
  if (S.tour && !S.champShown) {
    $("remain").textContent = surv <= 1 ? "ONE IDENTITY REMAINS" : S.P <= 0 ? "NO INTERVENTION IS POSSIBLE" : `${fmt(surv)} IDENTITIES REMAIN`;
    setStatus(S.P >= view.R ? "SIMULATION COMPLETE" : "SIMULATION COMPLETE · PLAYBACK " + Math.floor((c / Math.max(1, N - 1)) * 100) + "%");
  }
}
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (S.benching) S.maxDt = Math.max(S.maxDt, dt * 1000);
  if (S.tween) {
    const u = Math.min(1, (now - S.tween.t0) / S.tween.dur), e = u * u * (3 - 2 * u), { from, to } = S.tween;
    view.zoom = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * e);
    view.cx = from.cx + (to.cx - from.cx) * e; view.cy = from.cy + (to.cy - from.cy) * e; view.clampCam(); view.dirty = true;
    if (u >= 1) S.tween = null;
  }
  if (S.tour && !S.paused && S.P < view.R) {
    let rate = S.fast ? RATE_MAX : RATE_STD;
    const surv = S.roster.n - revealed();
    if (S.slow && surv <= 64) rate *= SLOW_FACTOR;
    S.P = Math.min(view.R, S.P + rate * dt);
  }
  if (S.tour) {
    view.setResolved(revealed());
    if (S.P >= view.R && !S.champShown) showChampion();
    if (S.champShown && S.P >= view.R && S.holdLeft > 0 && !S.hold && !document.hidden) {
      S.holdLeft -= dt;
      $("ch-count").textContent = S.holdLeft > 0 ? `REPOPULATING IN ${Math.ceil(S.holdLeft)} s` : "REPOPULATING...";
      if (S.holdLeft <= 0) { S.holdLeft = 0; nextTournament(); }
    } else if (S.hold && S.champShown) $("ch-count").textContent = "AUTOMATIC RESTART PAUSED";
  }
  if (view.dirty || S.tour === null) view.draw();
  if (now - lastRead > 120) { lastRead = now; updateReadout(); }
  requestAnimationFrame(frame);
}

// ---------- boot ----------
function parseHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("m") === "syn") {
    const n = Number(p.get("n")), s = p.get("s"), t = Number(p.get("t")) || 1;
    if (Number.isInteger(n) && n >= 0 && n <= MAX_N && /^[0-9a-f]{64}$/.test(s || "")) return { n, s, t, d: p.get("d") };
  }
  return null;
}
(async () => {
  S.index = (await loadIndex()) || emptyIndex();
  const h = parseHash();
  if (h) { S.mode = "syn"; S.nSyn = h.n; if (h.d && isDid(h.d)) S.pendingDid = h.d; launch(h.t, h.s); }
  else {
    // Default roster is real: first visit pulls ~10k active DIDs from the relay
    // (10 pages of 1,000: enough for a first bracket without a long wait; the
    // SOURCE panel grows the index). Falls back to the synthetic demo if the
    // relay is unreachable.
    if (!S.index.dids.length) {
      $("m-roster").textContent = "INDEXING PUBLIC DIDS FROM THE RELAY…";
      try { await crawl(S.index, 10_000, new AbortController().signal, (ix) => { $("m-roster").textContent = `INDEXING PUBLIC DIDS… ${fmt(ix.dids.length)}`; }); }
      catch { /* relay unreachable: partial progress is kept, fallback below */ }
    }
    S.mode = S.index.dids.length >= 2 ? "real" : "syn";
    launch(1, await genesisSeed());
  }
  requestAnimationFrame(frame);
})();
