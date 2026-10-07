import { resolveActor, findMoots, buildCorpus, saveCorpus, loadCachedCorpus, cleanHandle } from "./lib/corpus.js";
import { train } from "./lib/model.js";

const $ = (id) => document.getElementById(id);
const els = {
  form: $("form"), handle: $("handle"), go: $("go"), status: $("status"), barwrap: $("barwrap"), bar: $("bar"),
  actions: $("actions"), train: $("train"), stop: $("stop"), arena: $("arena"), stats: $("stats"), curve: $("curve"),
  honest: $("honest"), draft: $("draft"), heat: $("heat"), score: $("score"), pts: $("pts"), meter: $("meter"),
  name: $("name"), enter: $("enter"), boardcard: $("boardcard"), board: $("board"), share: $("share"), secret: $("secret"),
};

if (window.attachHandleTypeahead) window.attachHandleTypeahead(els.handle);

// small secret: the "u" in the title prefills a handle
els.secret.addEventListener("click", () => {
  els.handle.value = "@cee.wtf";
  els.handle.dispatchEvent(new Event("input", { bubbles: true }));
  els.handle.dispatchEvent(new Event("change", { bubbles: true }));
  els.handle.focus();
});

let actor = null;
let corpus = { posts: [] };
let ctl = { stop: false };
let model = null;
let training = false;

function say(msg, isErr) {
  els.status.textContent = msg;
  els.status.classList.toggle("err", !!isErr);
}

function tick() {
  const c = corpus;
  say(`${c.readMoots || 0}/${c.moots || 0} moots read${c.failedMoots ? ` (${c.failedMoots} unreachable)` : ""} · ${(c.found || 0).toLocaleString()} posts found · ${c.posts.length.toLocaleString()} with like counts`);
  els.bar.style.width = (c.moots ? Math.round(((c.readMoots || 0) / c.moots) * 100) : 0) + "%";
}

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.go.disabled = true;
  els.arena.hidden = true;
  model = null;
  ctl = { stop: false };
  try {
    say("looking you up…");
    actor = await resolveActor(cleanHandle(els.handle.value));
    const cached = await loadCachedCorpus(actor.did);
    corpus = { posts: cached ? cached.posts : [] };
    els.barwrap.hidden = false;
    els.actions.hidden = false;
    els.train.disabled = corpus.posts.length < 20;
    const moots = await findMoots(actor.did, (m) => say(m));
    if (!moots.length) throw new Error("no moots found — mutual follows only");
    if (cached) say(`${corpus.posts.length.toLocaleString()} posts cached from last time; checking for more…`);
    const watch = setInterval(() => { tick(); els.train.disabled = corpus.posts.length < 20; }, 400);
    await buildCorpus(moots, corpus, ctl, tick);
    clearInterval(watch);
    tick();
    await saveCorpus(actor.did, { posts: corpus.posts });
    await trainNow();
  } catch (err) {
    say(String(err.message || err), true);
  } finally {
    els.go.disabled = false;
    els.actions.hidden = true;
  }
});

els.stop.addEventListener("click", () => { ctl.stop = true; });
els.train.addEventListener("click", () => { trainNow(); });

async function trainNow() {
  if (training) return;
  training = true;
  els.train.disabled = true;
  try {
    const snap = corpus.posts.slice();
    if (actor) saveCorpus(actor.did, { posts: snap });
    model = await train(snap, { onProgress: (m) => say(m) });
    replayBoard();
    showArena();
    say(`trained on ${model.stats.trainPosts.toLocaleString()} posts from ${model.stats.authors.toLocaleString()} moots.`);
  } catch (err) {
    say(String(err.message || err), true);
  } finally {
    training = false;
    els.train.disabled = corpus.posts.length < 20;
  }
}

function showArena() {
  const s = model.stats;
  els.arena.hidden = false;
  els.stats.textContent = "";
  for (const [v, l] of [
    [s.posts.toLocaleString(), "posts"], [s.authors.toLocaleString(), "moots"],
    [s.r.toFixed(2), "held-out correlation"], [model.markov.uni.length.toLocaleString(), "words known"],
  ]) {
    const d = document.createElement("div");
    d.className = "stat";
    const b = document.createElement("b"); b.textContent = v;
    const sm = document.createElement("small"); sm.textContent = l;
    d.append(b, sm);
    els.stats.append(d);
  }
  drawCurve(null);
  const better = s.rmse < s.baseRmse;
  els.honest.textContent = `The regression ${better ? "beats" : "does not beat"} guessing the average on ${s.holdout.toLocaleString()} posts it never saw (error ${s.rmse.toFixed(2)} vs ${s.baseRmse.toFixed(2)} log-likes). Likes are noisy; treat the score as a vibe, not a forecast.`;
  renderBoard();
  update();
}

function drawCurve(curBin) {
  const nc = model.stats.noveltyCurve;
  const max = Math.max(...nc.map((c) => c.lift), 1.01);
  els.curve.textContent = "";
  nc.forEach((c, i) => {
    const d = document.createElement("div");
    d.style.height = Math.max(2, (c.lift / max) * 100) + "%";
    if (i === curBin) d.classList.add("cur");
    const sp = document.createElement("span");
    sp.textContent = c.lift.toFixed(2) + "×";
    d.append(sp);
    d.title = `~${c.surprisal.toFixed(1)} bits/word, ${c.n.toLocaleString()} posts`;
    els.curve.append(d);
  });
}

function binOfSurprisal(s) {
  let b = 0;
  while (b < model.edges.length && s > model.edges[b]) b++;
  return b;
}

let current = null;
function update() {
  if (!model) return;
  const text = els.draft.value;
  current = model.score(text);
  els.heat.textContent = "";
  els.enter.disabled = !current;
  if (!current) { els.score.hidden = true; drawCurve(null); return; }
  els.score.hidden = false;
  let pos = 0;
  for (const t of current.toks) {
    if (t.start > pos) els.heat.append(document.createTextNode(text.slice(pos, t.start)));
    const m = document.createElement("mark");
    m.textContent = t.raw;
    m.style.background = `rgba(255,122,182,${Math.min(0.75, Math.max(0, (t.bits - 2) / 14))})`;
    m.title = `${t.bits.toFixed(1)} bits`;
    els.heat.append(m);
    pos = t.end;
  }
  if (pos < text.length) els.heat.append(document.createTextNode(text.slice(pos)));
  els.pts.textContent = current.points.toLocaleString();
  els.meter.textContent = "";
  const lines = [
    ["surprise", `${current.surprisal.toFixed(1)} bits/word — more surprising than ${Math.round(current.percentile * 100)}% of your moots' posts`],
    ["likes lift", `${current.lift.toFixed(2)}× the author's typical post (~${current.predictedLikes.toFixed(1)} likes for an average moot)`],
    ["surprise credit", `${Math.round(current.credit * 100)}%${current.gibberish > 0 ? ` · gibberish dock ${Math.round(current.gibberish * 100)}%` : ""}`],
  ];
  for (const [k, v] of lines) {
    const row = document.createElement("div");
    const b = document.createElement("b"); b.textContent = k + ": ";
    row.append(b, document.createTextNode(v));
    els.meter.append(row);
  }
  drawCurve(binOfSurprisal(current.surprisal));
}
els.draft.addEventListener("input", update);

// --- leaderboard (localStorage, per account) --------------------------------

const boardKey = () => "surprisal:board:" + (actor ? actor.did : "anon");
function loadBoard() {
  try { return JSON.parse(localStorage.getItem(boardKey())) || []; } catch { return []; }
}
function replayBoard() {
  // earlier entries stay "learned" across reloads
  for (const e of loadBoard()) model.learn(e.text);
}
function renderBoard() {
  const b = loadBoard().sort((x, y) => y.points - x.points).slice(0, 20); // display only: a top-20 table; every entry stays stored
  els.boardcard.hidden = !b.length;
  els.board.textContent = "";
  b.forEach((e, i) => {
    const tr = document.createElement("tr");
    for (const v of [String(i + 1), e.name, e.text, String(e.points)]) {
      const td = document.createElement("td");
      td.textContent = v;
      tr.append(td);
    }
    tr.children[2].className = "t";
    els.board.append(tr);
  });
}

els.enter.addEventListener("click", () => {
  if (!model || !current) return;
  const text = els.draft.value.trim();
  const entry = { name: els.name.value.trim() || "anonymous", text, points: current.points, surprisal: current.surprisal };
  const board = loadBoard();
  board.push(entry);
  try { localStorage.setItem(boardKey(), JSON.stringify(board)); } catch (_) {}
  model.learn(text);
  renderBoard();
  update(); // same text now scores lower: the model has seen it
});

els.share.addEventListener("click", () => {
  const best = loadBoard().sort((x, y) => y.points - x.points)[0];
  if (!best) return;
  const msg = `${best.points} points on surprisal — a Markov model of my moots didn't see this coming:\n\n“${best.text}”\n\nhttps://surprisal.bisks.net/`;
  window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(msg), "_blank", "noopener");
});
