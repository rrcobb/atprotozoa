// app.js — the page: resolve a handle, download the repo, train the parrot in
// slices (so the tab stays alive), then draw the score, the loss histogram and
// a bsky-style thread to talk to the parrot in.

import { resolvePds } from "./lib/identity.js";
import { fetchRepoRecordsWithKeys } from "./lib/car.js";
import { buildCorpus, tokenize, Parrot, Trainer, unigramLoss, parrotScore, BLOCKS } from "./lib/model.js";

const PUB = "https://public.api.bsky.app/xrpc";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tick = () => new Promise((r) => setTimeout(r, 0));

// Under this many posts there's no meaningful held-out set or vocabulary.
const MIN_POSTS = 30;
// Every Nth post is held out of training and used for the parrot score.
const HOLDOUT_EVERY = 10;

let state = null; // { model, corpus, handle, profile }

function normHandle(v) {
  return String(v || "").trim().replace(/^@/, "").replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "").split("/")[0].trim();
}

async function resolveDid(actor) {
  if (actor.startsWith("did:")) return actor;
  const r = await fetch(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
  const d = await r.json().catch(() => ({}));
  if (!d.did) throw new Error(`couldn't resolve "${actor}"`);
  return d.did;
}

// Fallback when the repo download fails (non-CORS PDS, oversized CAR):
// listRecords on the PDS, paged until the cursor comes back empty.
async function listAllPosts(pds, did, onProgress) {
  const out = [];
  let cursor = "";
  for (;;) {
    const u = `${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=app.bsky.feed.post&limit=100${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`;
    const r = await fetch(u);
    if (!r.ok) throw new Error("listRecords failed: " + r.status);
    const d = await r.json();
    for (const rec of d.records || []) out.push({ value: rec.value });
    onProgress(`paging posts… ${out.length}`);
    if (!d.cursor || !(d.records || []).length) break;
    cursor = d.cursor;
  }
  return out;
}

function show(which) {
  for (const id of ["gate", "training", "results"]) $(id).hidden = id !== which;
}

function setBar(f) { $("trainBar").style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + "%"; }

async function run(raw) {
  const handle = normHandle(raw);
  if (!handle) { $("goMsg").textContent = "type a handle first"; return; }
  $("goMsg").textContent = "";
  $("goBtn").disabled = true;
  show("training");
  $("trainTitle").textContent = "fetching " + handle;
  $("trainLog").textContent = "";
  setBar(0);
  const log = (m) => { $("trainStatus").textContent = m; };
  try {
    const did = await resolveDid(handle);
    const pds = await resolvePds(did);
    if (!pds) throw new Error("couldn't find that account's PDS");
    let profile = { handle, displayName: handle };
    try {
      const pr = await fetch(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
      if (pr.ok) { const p = await pr.json(); profile = { handle: p.handle || handle, displayName: p.displayName || p.handle || handle }; }
    } catch (_) {}
    let recs;
    try {
      recs = (await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post", log)).records;
    } catch (e) {
      log("repo download failed (" + e.message + "), paging instead…");
      recs = await listAllPosts(pds, did, log);
    }
    const corpus = buildCorpus(recs.map((r) => r.value && r.value.text).filter(Boolean));
    if (corpus.posts.length < MIN_POSTS) throw new Error(`only ${corpus.posts.length} usable posts, a parrot needs at least ${MIN_POSTS}`);
    const trainIdx = [], heldIdx = [];
    corpus.posts.forEach((_, i) => (i % HOLDOUT_EVERY === HOLDOUT_EVERY - 1 ? heldIdx : trainIdx).push(i));
    const trainPosts = trainIdx.map((i) => corpus.posts[i]);
    const heldPosts = heldIdx.map((i) => corpus.posts[i]);

    const model = new Parrot(corpus.vocab, corpus.counts);
    const tokens = corpus.posts.reduce((a, p) => a + p.length - 2, 0);
    $("trainTitle").textContent = `training a parrot of ${profile.displayName}`;
    $("trainLog").textContent =
      `${corpus.posts.length.toLocaleString()} posts, ${tokens.toLocaleString()} words\n` +
      `vocab ${model.V.toLocaleString()} words (${BLOCKS} blocks x ${model.V} x ${model.V} + bias = ${model.paramCount.toLocaleString()} parameters)\n`;
    const trainer = new Trainer(model, trainPosts);
    const t0 = performance.now();
    for (;;) {
      const done = trainer.run(40);
      const f = (trainer.epoch + trainer.progress) / trainer.epochs;
      setBar(done ? 1 : f);
      log(`epoch ${trainer.epoch + 1}${done ? "" : ""} · ${Math.round(trainer.progress * 100)}% · ${trainer.examples.toLocaleString()} word predictions`);
      if (trainer.history.length && !done) {
        $("trainLog").textContent = $("trainLog").textContent.split("\nepoch loss")[0] + "\nepoch loss: " + trainer.history.map((x) => x.toFixed(2)).join(" → ");
      }
      if (done) break;
      await tick();
    }
    const secs = (performance.now() - t0) / 1000;

    // held-out scoring
    const heldLoss = heldPosts.reduce((a, s) => a + model.postLoss(s), 0) / heldPosts.length;
    const baseLoss = unigramLoss(corpus.counts, heldPosts);
    const losses = new Float64Array(corpus.posts.length);
    trainIdx.forEach((pi, k) => { losses[pi] = trainer.lastLoss[k]; });
    heldIdx.forEach((pi, k) => { losses[pi] = model.postLoss(heldPosts[k]); });
    state = { model, corpus, handle, profile, did, losses, heldLoss, baseLoss, trainer, secs, tokens, heldN: heldPosts.length };
    renderResults();
    show("results");
  } catch (e) {
    show("gate");
    $("goMsg").textContent = e.message || String(e);
  } finally {
    $("goBtn").disabled = false;
  }
}

function renderResults() {
  const { model, corpus, profile, losses, heldLoss, baseLoss, trainer, secs, tokens, handle } = state;
  const score = parrotScore(heldLoss, baseLoss);
  $("scoreNum").textContent = score;
  $("resTitle").textContent = `a parrot of ${profile.displayName}`;
  $("resBlurb").textContent = score >= 40
    ? "this account repeats itself enough for one linear layer to notice."
    : score >= 20 ? "some habits, some surprises."
    : "mostly says new things. the parrot is not impressed, or is it the other way round.";
  const stat = (b, s) => `<div class="stat"><b>${esc(b)}</b>${esc(s)}</div>`;
  $("stats").innerHTML =
    stat(corpus.posts.length.toLocaleString(), "posts") +
    stat(tokens.toLocaleString(), "words") +
    stat(model.V.toLocaleString(), "vocab") +
    stat((model.paramCount / 1e6).toFixed(1) + "M", "parameters") +
    stat(String(trainer.epoch), "epochs") +
    stat(secs.toFixed(0) + " s", "training time") +
    stat(heldLoss.toFixed(2), `held-out loss (${state.heldN} posts)`) +
    stat(baseLoss.toFixed(2), "unigram loss") +
    stat(Math.exp(heldLoss).toFixed(0), "perplexity");
  const text = `my stochastic parrot of @${profile.handle} scored ${score}/100. one linear layer + one softmax, trained in the tab`;
  $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + "\nhttps://stochastic-parrot.bisks.net/");
  drawHist(losses, baseLoss);
  const ranked = [...corpus.posts.keys()].filter((i) => corpus.posts[i].length >= 8).sort((a, b) => losses[a] - losses[b]);
  const li = (i) => `<li>${esc(corpus.texts[i].slice(0, 180))}${corpus.texts[i].length > 180 ? "…" : ""} <small>${losses[i].toFixed(2)}</small></li>`;
  $("easy").innerHTML = ranked.slice(0, 5).map(li).join("");
  $("hard").innerHTML = ranked.slice(-5).reverse().map(li).join("");
  $("thread").innerHTML = "";
  addPost("parrot", "squawk. ask me something, or reply to this.", true);
  addPost("parrot", model.generate([]));
}

function drawHist(losses, base) {
  const vals = [...losses].sort((a, b) => a - b);
  const hi = Math.max(vals[Math.floor(vals.length * 0.99)], base * 1.05);
  const N = 32, bins = new Array(N).fill(0);
  for (const v of vals) bins[Math.min(N - 1, Math.floor((v / hi) * N))]++;
  const mx = Math.max(...bins);
  const W = 640, H = 200, pad = 22, bw = (W - 2) / N;
  let g = "";
  bins.forEach((c, i) => {
    const h = (c / mx) * (H - pad - 8);
    g += `<rect x="${(1 + i * bw + 1).toFixed(1)}" y="${(H - pad - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="#2fbf8f"><title>${c} posts</title></rect>`;
  });
  const bx = Math.min(W - 2, (base / hi) * (W - 2));
  g += `<line x1="${bx}" x2="${bx}" y1="4" y2="${H - pad}" stroke="#ffb454" stroke-dasharray="4 4"/><text x="${Math.min(bx + 4, W - 70)}" y="14" fill="#ffb454" font-size="11">unigram ${base.toFixed(2)}</text>`;
  g += `<text x="1" y="${H - 6}" fill="#8b9bad" font-size="11">0</text><text x="${W - 2}" y="${H - 6}" fill="#8b9bad" font-size="11" text-anchor="end">${hi.toFixed(1)} nats / word →</text>`;
  $("hist").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="histogram of per-post loss">${g}</svg>`;
}

function addPost(who, text, intro) {
  const you = who === "you";
  const p = state && state.profile;
  const name = you ? "you" : `${p.displayName} parrot`;
  const hdl = you ? "@you.bsky.social" : "@stochastic.parrot";
  const av = you ? `<div class="av"></div>` : `<img class="av" src="parrot.svg" alt="parrot avatar" />`;
  const tag = you ? "" : `<span class="tag">${intro ? "bot" : "parrot noise"}</span>`;
  const el = document.createElement("div");
  el.className = "post" + (you ? "" : " reply");
  el.innerHTML = `${av}<div class="body"><div class="head"><b>${esc(name)}</b> <span>${hdl} · now</span>${tag}</div><div class="txt">${esc(text)}</div><div class="acts"><span>💬</span><span>🔁</span><span>🤍</span></div></div>`;
  $("thread").appendChild(el);
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function reply(promptText) {
  const { model, corpus } = state;
  const ids = tokenize(promptText).map((t) => corpus.index.get(t)).filter((x) => x !== undefined);
  addPost("parrot", model.generate(ids));
}

$("goForm").addEventListener("submit", (e) => { e.preventDefault(); run($("handle").value); });
$("replyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("replyText").value.trim();
  if (!t || !state) return;
  $("replyText").value = "";
  addPost("you", t);
  reply(t);
});
$("replyText").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("replyForm").requestSubmit(); }
});
$("squawkBtn").addEventListener("click", () => { if (state) addPost("parrot", state.model.generate([])); });
if (window.attachHandleTypeahead) window.attachHandleTypeahead($("handle"));
