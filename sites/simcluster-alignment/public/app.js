import { moots } from "./lib/cluster.js";
import { fetchPosts, extractFeatures, aggregateFeatures, align, bandFor, auraColor, buildReading, MIN_POSTS } from "./lib/align.js";

const els = {
  form: document.getElementById("searchForm"),
  input: document.getElementById("handleInput"),
  genBtn: document.getElementById("genBtn"),
  status: document.getElementById("status"),
  results: document.getElementById("results"),
  who: document.getElementById("who"),
  scoreBig: document.getElementById("scoreBig"),
  bandName: document.getElementById("bandName"),
  orb: document.getElementById("orb"),
  axes: document.getElementById("axes"),
  reading: document.getElementById("reading"),
  stats: document.getElementById("stats"),
  chips: document.getElementById("chips"),
  graphicWrap: document.getElementById("graphicWrap"),
  canvas: document.getElementById("graphic"),
  shareRow: document.getElementById("shareRow"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  shareLink: document.getElementById("shareLink"),
};

const MONO = "ui-monospace, monospace";
const POOL_CAP = 16; // bounds how many mutuals' feeds get fetched
const CONCURRENCY = 4;

let lastShareText = "";
let lastShareUrl = "";

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function short(h) {
  return "@" + String(h || "").replace(/\.bsky\.social$/, "");
}

async function runPool(items, worker, limit) {
  const out = new Array(items.length);
  let idx = 0;
  async function lane() {
    while (idx < items.length) {
      const i = idx++;
      try { out[i] = await worker(items[i], i); } catch { out[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

function axisRow(container, axis) {
  const row = document.createElement("div");
  row.className = "axisrow" + (axis.value === null ? " na" : "");
  const lbl = document.createElement("div");
  lbl.className = "lbl";
  lbl.textContent = `${axis.meta.glyph} ${axis.meta.label}`;
  const bar = document.createElement("div");
  bar.className = "axisbar";
  const fill = document.createElement("div");
  fill.style.width = (axis.value === null ? 0 : Math.round(axis.value * 100)) + "%";
  bar.appendChild(fill);
  const val = document.createElement("div");
  val.className = "val";
  val.textContent = axis.value === null ? "n/a" : Math.round(axis.value * 100) + "%";
  row.append(lbl, bar, val);
  container.appendChild(row);
}

function chipRow(container, label, words) {
  if (!words.length) return;
  const note = document.createElement("div");
  note.className = "chipgroup";
  const lbl = document.createElement("b");
  lbl.textContent = label;
  const row = document.createElement("div");
  row.className = "chips";
  for (const w of words) {
    const c = document.createElement("span");
    c.className = "chip";
    c.textContent = w;
    row.appendChild(c);
  }
  note.append(lbl, row);
  container.appendChild(note);
}

function statLine(container, label, value) {
  const row = document.createElement("div");
  row.className = "statrow";
  const l = document.createElement("span");
  l.className = "sl";
  l.textContent = label;
  const v = document.createElement("span");
  v.className = "sv";
  v.textContent = value;
  row.append(l, v);
  container.appendChild(row);
}

// URL-safe base64 of the already-computed result — decoded server-side
// (src/index.ts) to stamp personalized OG tags. No re-analysis needed.
function encodeResult(handle, score, element, bandName) {
  const json = JSON.stringify({ h: handle, s: score, e: element, b: bandName });
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function shareUrlFor(handle, score, element, bandName) {
  const code = encodeResult(handle, score, element, bandName);
  return `https://simcluster-alignment.bisks.net/r/${code}`;
}

function buildShareText(handle, result, band, url) {
  const el = result.dominant ? result.dominant.meta.element : "";
  return (
    `@${handle} reads ${result.score}% spiritually aligned with the SimCluster` +
    (el ? ` (${el}-dominant, ${band.name}).` : ` (${band.name}).`) +
    ` ${url}`
  );
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  let lines = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
      lines++;
      if (maxLines && lines >= maxLines - 1) {
        ctx.fillText(line + "…", x, cy);
        return cy;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy;
}

function loadImg(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function drawShareCard({ profile, hue, score, band, dominant, readingExcerpt }) {
  const canvas = els.canvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const avatar = await loadImg(profile.avatar);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a0712";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.32, 0, W * 0.5, H * 0.32, W * 0.6);
  glow.addColorStop(0, `hsla(${hue}, 70%, 45%, 0.55)`);
  glow.addColorStop(1, "rgba(10,7,18,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = `hsl(${hue}, 80%, 72%)`;
  ctx.font = `800 34px ${MONO}`;
  ctx.fillText("simcluster-alignment", 56, 70);

  let textX = 56;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(80, 130, 26, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 54, 104, 52, 52);
    ctx.restore();
    textX = 122;
  }
  ctx.fillStyle = "#f2e9ff";
  ctx.font = `700 26px ${MONO}`;
  ctx.fillText("@" + profile.handle, textX, 140);

  ctx.textAlign = "center";
  ctx.fillStyle = `hsl(${hue}, 85%, 78%)`;
  ctx.font = `900 150px ${MONO}`;
  ctx.fillText(score + "%", W / 2, 380);

  ctx.fillStyle = "#f2e9ff";
  ctx.font = `800 34px ${MONO}`;
  ctx.fillText(band.name, W / 2, 430);

  if (dominant) {
    ctx.fillStyle = "#a996c4";
    ctx.font = `400 20px ${MONO}`;
    ctx.fillText(`${dominant.meta.glyph} ${dominant.meta.element}-dominant · ${dominant.meta.chakra}`, W / 2, 462);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#d8c9ef";
  ctx.font = `400 19px ${MONO}`;
  wrapCanvasText(ctx, readingExcerpt, 70, 510, W - 140, 26, 3);

  ctx.textAlign = "center";
  ctx.fillStyle = `hsl(${hue}, 80%, 70%)`;
  ctx.font = `700 20px ${MONO}`;
  ctx.fillText("simcluster-alignment.bisks.net", W / 2, H - 36);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

async function reveal(rawHandle) {
  const handle = (rawHandle || "").trim().replace(/^@/, "");
  if (!handle) { setStatus("enter a handle first.", true); return; }

  els.genBtn.disabled = true;
  els.results.classList.remove("show");
  els.graphicWrap.classList.remove("show");
  els.shareRow.style.display = "none";
  setStatus(`resolving @${handle}...`);

  try {
    const res = await moots(handle, { onStep: (s) => setStatus(s) });

    setStatus(`reading @${short(res.handle)}'s own posts...`);
    const selfPosts = await fetchPosts(res.did, { pages: 2 });
    const selfFeat = extractFeatures(selfPosts);
    if (selfFeat.postCount < MIN_POSTS) {
      setStatus(`@${short(res.handle)} doesn't have enough posts to read a signal off.`, true);
      return;
    }

    if (res.pool.length < 1) {
      setStatus(`@${short(res.handle)} has no mutuals or follows to form a SimCluster from — nothing to align against.`, true);
      return;
    }

    const pool = res.pool.slice(0, POOL_CAP);
    let done = 0;
    const perMember = await runPool(pool, async (p) => {
      const posts = await fetchPosts(p.did, { pages: 1 });
      done++;
      setStatus(`downloading @${short(res.handle)}'s SimCluster (${done}/${pool.length})...`);
      return extractFeatures(posts);
    }, CONCURRENCY);

    const memberFeats = perMember.filter((f) => f && f.postCount >= MIN_POSTS);
    if (!memberFeats.length) {
      setStatus(`@${short(res.handle)}'s cluster is too quiet to read — nobody had enough posts.`, true);
      return;
    }

    setStatus("summing the communal mind...");
    const clusterFeat = aggregateFeatures(memberFeats);
    const result = align(selfFeat, clusterFeat);
    const band = bandFor(result.score);
    const hue = auraColor(result.dominant, result.score).match(/hsl\((\d+)/)[1];
    const reading = buildReading(res.handle, result, clusterFeat, selfFeat.postCount);

    // render
    els.who.innerHTML = "";
    const avImg = document.createElement("img");
    avImg.alt = "";
    avImg.src = res.self.avatar || "";
    avImg.style.visibility = res.self.avatar ? "visible" : "hidden";
    const whoText = document.createElement("div");
    const dn = document.createElement("div");
    dn.className = "dn";
    dn.textContent = res.self.displayName || short(res.handle);
    const hn = document.createElement("div");
    hn.className = "hn";
    hn.textContent = short(res.handle);
    whoText.append(dn, hn);
    els.who.append(avImg, whoText);

    els.scoreBig.textContent = result.score + "%";
    els.scoreBig.style.color = auraColor(result.dominant, result.score);
    els.bandName.textContent = band.name;
    els.orb.style.background = `radial-gradient(circle at 35% 30%, ${auraColor(result.dominant, Math.min(100, result.score + 20))}, ${auraColor(result.dominant, result.score)} 55%, transparent 78%)`;

    els.axes.innerHTML = "";
    for (const axis of result.axes) axisRow(els.axes, axis);

    els.reading.textContent = reading;

    els.stats.innerHTML = "";
    statLine(els.stats, "cluster size", `${res.counts.pool} (${res.kind})`);
    statLine(els.stats, "mutuals", res.counts.mutuals);
    statLine(els.stats, "cluster members read", `${memberFeats.length} / ${pool.length}`);
    statLine(els.stats, "cluster posts analyzed", clusterFeat.postCount.toLocaleString());
    statLine(els.stats, "your posts analyzed", selfFeat.postCount.toLocaleString());

    els.chips.innerHTML = "";
    chipRow(els.chips, "words you share with the cluster", result.sharedWords);
    chipRow(els.chips, "sigils you share", result.sharedTags.map((t) => "#" + t));
    chipRow(els.chips, "words only you say", result.onlyYou);

    setStatus("");
    els.results.classList.add("show");

    lastShareUrl = shareUrlFor(res.handle, result.score, result.dominant ? result.dominant.meta.element : "", band.name);
    lastShareText = buildShareText(res.handle, result, band, lastShareUrl);
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
    els.shareLink.href = lastShareUrl;
    els.shareLink.textContent = lastShareUrl.replace("https://", "");

    await drawShareCard({
      profile: res.self,
      hue,
      score: result.score,
      band,
      dominant: result.dominant,
      readingExcerpt: reading,
    });
    els.graphicWrap.classList.add("show");
    els.shareRow.style.display = "flex";
  } catch (err) {
    setStatus("couldn't read that one: " + (err && err.message ? err.message : "try again") + ".", true);
  } finally {
    els.genBtn.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  reveal(els.input.value);
});

els.shareDownload.addEventListener("click", () => {
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const who = (els.who.textContent || "reading").replace(/[^a-z0-9.-]/gi, "_");
    a.download = `simcluster-alignment-${who}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "simcluster-alignment.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "simcluster-alignment" });
      } catch {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

// /r/<code> (a shared result link) decodes back to the handle that produced
// it and re-runs the reading live; the code itself was only ever needed to
// stamp the server-side OG tags (src/index.ts), not to skip the analysis.
function decodeHandleFromCode(code) {
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const o = JSON.parse(atob(b64));
    return typeof o.h === "string" ? o.h : null;
  } catch {
    return null;
  }
}

const pathCode = (location.pathname.match(/^\/r\/([^/]+)\/?$/) || [])[1];
const pathHandle = pathCode && decodeHandleFromCode(pathCode);
const sharedHandle = pathHandle || new URLSearchParams(location.search).get("h");
if (sharedHandle) {
  els.input.value = sharedHandle;
  reveal(sharedHandle);
}
