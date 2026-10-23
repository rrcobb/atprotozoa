import { moots } from "./lib/cluster.js";
import { fetchRepoRecordsWithKeys } from "./lib/car.js";
import { resolvePds } from "./lib/identity.js";
import { TENETS, CLAIMER, summarizePosts, scoreTenets, overall, rankFor, extremes } from "./lib/honor.js";

const PUB = "https://api.bsky.app/xrpc";
const FEED_PAGES = 400; // fallback-only backstop (repo download failed); unreachable in practice, same as the moot-family GRAPH_PAGES

const $ = (id) => document.getElementById(id);
const els = {
  form: $("searchForm"), input: $("handleInput"), btn: $("goBtn"), status: $("status"),
  results: $("results"), who: $("who"), big: $("big"), rank: $("rank"), line: $("line"),
  chart: $("chart"), rows: $("rows"), facts: $("facts"),
  shareBluesky: $("shareBluesky"), shareDownload: $("shareDownload"), shareNative: $("shareNative"),
};

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

const pct = (x) => Math.round(x * 100);
const short = (h) => "@" + String(h || "").replace(/\.bsky\.social$/, "");

// All of the handle's posts: one getRepo download, or — only if that fails
// (oversized repo, non-CORS PDS, malformed CAR) — the AppView author feed
// walked until its cursor runs out.
async function loadPosts(did, onStep) {
  try {
    const pds = await resolvePds(did);
    if (!pds) throw new Error("no PDS");
    const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post", onStep);
    return records.map((r) => r.value);
  } catch {
    onStep("repo download failed, walking the author feed…");
    const out = [];
    let cursor = "";
    for (let p = 0; p < FEED_PAGES; p++) {
      const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
      u.searchParams.set("actor", did);
      u.searchParams.set("limit", "100");
      if (cursor) u.searchParams.set("cursor", cursor);
      const r = await fetch(u);
      if (!r.ok) break;
      const d = await r.json();
      for (const it of d.feed || []) {
        if (!it.reason && it.post && it.post.author.did === did && it.post.record) out.push(it.post.record);
      }
      cursor = d.cursor;
      if (!cursor) break;
    }
    return out;
  }
}

function polar(cx, cy, r, i, n) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

// Radar chart. Tenets with no data plot at the centre and are labelled "n/a".
function drawRadar(ctx, W, H, scores, opts = {}) {
  const cx = opts.cx ?? W / 2, cy = opts.cy ?? H / 2, R = opts.r ?? Math.min(W, H) * 0.34;
  const n = TENETS.length;
  const fs = opts.font ?? 15;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#362647";
  for (const f of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [x, y] = polar(cx, cy, R * f, i, n);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = polar(cx, cy, R, i, n);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
  }
  ctx.beginPath();
  TENETS.forEach((t, i) => {
    const v = scores[t.key] ?? 0;
    const [x, y] = polar(cx, cy, R * v, i, n);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(244,199,106,0.28)";
  ctx.fill();
  ctx.strokeStyle = "#f4c76a";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = "#f4c76a";
  TENETS.forEach((t, i) => {
    const v = scores[t.key] ?? 0;
    const [x, y] = polar(cx, cy, R * v, i, n);
    ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
  });
  ctx.font = `700 ${fs}px ui-monospace, monospace`;
  ctx.textBaseline = "middle";
  TENETS.forEach((t, i) => {
    const [x, y] = polar(cx, cy, R + fs * 1.9, i, n);
    ctx.textAlign = Math.abs(x - cx) < 8 ? "center" : x < cx ? "right" : "left";
    ctx.fillStyle = "#f2e9ff";
    const v = scores[t.key];
    ctx.fillText(`${t.glyph} ${t.label}`, x, y - fs * 0.6);
    ctx.fillStyle = "#a996c4";
    ctx.fillText(v === null || v === undefined ? "n/a" : pct(v) + "%", x, y + fs * 0.7);
  });
  ctx.restore();
}

function renderRows(scores) {
  els.rows.textContent = "";
  for (const t of TENETS) {
    const v = scores[t.key];
    const row = document.createElement("div");
    row.className = "tenet" + (v === null ? " na" : "");
    const head = document.createElement("div");
    head.className = "th";
    const name = document.createElement("b");
    name.textContent = `${t.glyph} ${t.label}`;
    const val = document.createElement("span");
    val.textContent = v === null ? "n/a" : pct(v) + "%";
    head.append(name, val);
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("i");
    fill.style.width = (v === null ? 0 : pct(v)) + "%";
    bar.appendChild(fill);
    const rule = document.createElement("div");
    rule.className = "rule";
    rule.textContent = t.rule;
    row.append(head, bar, rule);
    els.rows.appendChild(row);
  }
}

function drawCard(handle, total, rank, scores) {
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 630;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0a0712"; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#f4c76a"; ctx.font = "800 34px ui-monospace, monospace"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("the simcluster code of honor", 48, 70);
  ctx.fillStyle = "#f2e9ff"; ctx.font = "800 40px ui-monospace, monospace";
  ctx.fillText(short(handle), 48, 130);
  ctx.fillStyle = "#f4c76a"; ctx.font = "900 140px ui-monospace, monospace";
  ctx.fillText(pct(total) + "%", 48, 300);
  ctx.fillStyle = "#f2e9ff"; ctx.font = "800 30px ui-monospace, monospace";
  ctx.fillText(rank.name, 48, 360);
  ctx.fillStyle = "#a996c4"; ctx.font = "18px ui-monospace, monospace";
  ctx.fillText("honorcode.bisks.net", 48, 590);
  drawRadar(ctx, 1200, 630, scores, { cx: 850, cy: 330, r: 170, font: 16 });
  return c;
}

let card = null;

async function run(raw) {
  const handle = raw.trim().replace(/^@/, "");
  if (!handle) return;
  els.btn.disabled = true;
  els.results.hidden = true;
  try {
    setStatus("mapping the cluster…");
    const cl = await moots(handle, { onStep: setStatus });
    setStatus("downloading every post…");
    const records = await loadPosts(cl.did, setStatus);
    const summary = summarizePosts(records);
    // pool lists mutuals first; widening to plain follows appends after them
    const mutualHandles = cl.pool.slice(0, cl.counts.mutuals).map((p) => p.handle.toLowerCase());
    const isClaimer = cl.handle.toLowerCase() === CLAIMER;
    const claimed = mutualHandles.includes(CLAIMER);
    const scores = scoreTenets(cl.counts, summary, claimed);
    if (isClaimer) scores.claimed = null; // the claimer can't claim themself
    const total = overall(scores);
    const rank = rankFor(total);
    const { best, worst } = extremes(scores);

    els.who.textContent = short(cl.handle);
    els.big.textContent = pct(total) + "%";
    els.rank.textContent = rank.name;
    els.line.textContent = rank.line;
    const ctx = els.chart.getContext("2d");
    ctx.clearRect(0, 0, els.chart.width, els.chart.height);
    drawRadar(ctx, els.chart.width, els.chart.height, scores, { font: 14 });
    renderRows(scores);

    els.facts.textContent = "";
    const facts = [
      `${summary.n.toLocaleString()} posts read, ${cl.counts.mutuals.toLocaleString()} mutuals out of ${cl.counts.follows.toLocaleString()} follows and ${cl.counts.followers.toLocaleString()} followers.`,
      best && worst && best !== worst ? `strongest tenet: ${best.label}. weakest: ${worst.label}.` : "",
      isClaimer ? "you are the claimer. the claim stands alone." : claimed ? "claimed by @norvid-studies.bsky.social. there is no higher honor." : "not yet claimed by @norvid-studies.bsky.social. the honor is pending.",
    ].filter(Boolean);
    for (const f of facts) {
      const li = document.createElement("li");
      li.textContent = f;
      els.facts.appendChild(li);
    }

    const text = `my honor by the tenets of the simcluster code: ${pct(total)}%, ${rank.name}${claimed ? " (claimed by @norvid-studies.bsky.social)" : ""}. plot yours:`;
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " https://honorcode.bisks.net/");
    card = drawCard(cl.handle, total, rank, scores);
    els.shareNative.style.display = navigator.share ? "" : "none";
    els.shareNative.onclick = () => card.toBlob((b) => {
      const file = new File([b], "honor.png", { type: "image/png" });
      navigator.share({ text, url: "https://honorcode.bisks.net/", files: navigator.canShare && navigator.canShare({ files: [file] }) ? [file] : undefined }).catch(() => {});
    });
    els.results.hidden = false;
    setStatus("");
  } catch (e) {
    setStatus(`couldn't read ${handle}: ${e.message}`, true);
  } finally {
    els.btn.disabled = false;
  }
}

els.form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  run(els.input.value);
});
els.shareDownload.addEventListener("click", () => {
  if (!card) return;
  const a = document.createElement("a");
  a.download = "honor.png";
  a.href = card.toDataURL("image/png");
  a.click();
});
