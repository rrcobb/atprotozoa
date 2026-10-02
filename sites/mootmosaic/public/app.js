// mootmosaic — client-only. handle -> moots -> that day's images -> canvas grid.
const API = "https://public.api.bsky.app/xrpc/";

// Concurrent requests against the public AppView / CDN: a politeness limit so
// a 1000-moot account doesn't fire 1000 requests at once.
const CONCURRENCY = 8;
// Canvas width in px. Bounded by browser canvas memory (and Bluesky's image
// size limits), not by the data.
const SIDE = 1600;

const $ = (id) => document.getElementById(id);
const els = {
  form: $("form"), handle: $("handle"), day: $("day"), go: $("go"), status: $("status"),
  result: $("result"), canvas: $("mosaic"), dl: $("dl"), share: $("share"), intent: $("intent"),
  credits: $("credits"), calSec: $("calendar-sec"), months: $("months"), yearLabel: $("yearLabel"),
  prevY: $("prevY"), nextY: $("nextY"), dlCal: $("dlCal"), secret: $("secret"),
};

function setStatus(msg, err) {
  els.status.textContent = msg;
  els.status.className = err ? "err" : "";
}

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const cleanHandle = (s) => s.trim().replace(/^@/, "").replace(/^.*bsky\.app\/profile\//, "").replace(/[/?#].*$/, "");

async function xrpc(method, params) {
  const u = new URL(API + method);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, x));
    else u.searchParams.set(k, v);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(u);
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 700 * (attempt + 1))); continue; }
    throw new Error(`${method} ${r.status}`);
  }
  throw new Error(`${method} failed`);
}

async function pool(items, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); } catch { out[k] = null; }
    }
  }));
  return out;
}

// Everyone `did` follows (paged to exhaustion — no bulk equivalent), then the
// subset who follow back, via getRelationships (30 others per call).
async function getMoots(did) {
  const follows = [];
  let cursor;
  do {
    const d = await xrpc("app.bsky.graph.getFollows", { actor: did, limit: 100, ...(cursor ? { cursor } : {}) });
    follows.push(...d.follows);
    cursor = d.cursor;
    setStatus(`reading follows… ${follows.length}`);
  } while (cursor);
  const chunks = [];
  for (let i = 0; i < follows.length; i += 30) chunks.push(follows.slice(i, i + 30));
  const rels = await pool(chunks, (c) => xrpc("app.bsky.graph.getRelationships", { actor: did, others: c.map((p) => p.did) }));
  const back = new Set();
  for (const r of rels) for (const x of (r && r.relationships) || []) if (x.followedBy) back.add(x.did);
  return follows.filter((p) => back.has(p.did));
}

// Original posts with images by `actor` between start and end (ms). Pages the
// media feed until it reaches a post older than `start` or the feed ends.
async function imagesForDay(actor, start, end) {
  const found = [];
  let cursor;
  for (;;) {
    const d = await xrpc("app.bsky.feed.getAuthorFeed", { actor: actor.did, filter: "posts_with_media", limit: 50, ...(cursor ? { cursor } : {}) });
    let sawOlder = false;
    for (const item of d.feed) {
      if (item.reason) continue; // repost or pin
      const p = item.post;
      if (p.author.did !== actor.did) continue;
      const t = Date.parse(p.record?.createdAt || p.indexedAt);
      if (t < start) { sawOlder = true; continue; }
      if (t >= end) continue;
      const imgs = p.embed?.images || p.embed?.media?.images || [];
      for (const im of imgs) found.push({ url: im.fullsize || im.thumb, thumb: im.thumb, alt: im.alt || "", handle: actor.handle, uri: p.uri, t });
    }
    cursor = d.cursor;
    // The feed is newest-first, but pinned posts can sit on top; one older
    // post is not proof the day is over, so require the whole page to be
    // older than the day before stopping.
    if (!cursor || (sawOlder && d.feed.every((i) => i.reason || Date.parse(i.post.record?.createdAt || i.post.indexedAt) < start))) break;
  }
  return found;
}

async function loadBitmap(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("image " + r.status);
  return createImageBitmap(await r.blob());
}

// Justified-row collage: every photo keeps its own aspect ratio (no cropping),
// rows are scaled to fill the width, and the canvas grows to fit.
const PAD = 36, GAP = 10, HEAD = 84, MAX_H = 3200;

function layoutRows(ars, inner, h) {
  const rows = [];
  let cur = [], sum = 0;
  for (let i = 0; i < ars.length; i++) {
    cur.push(i); sum += ars[i];
    if (sum * h + GAP * (cur.length - 1) >= inner) {
      rows.push({ idx: cur, h: (inner - GAP * (cur.length - 1)) / sum, full: true });
      cur = []; sum = 0;
    }
  }
  if (cur.length) rows.push({ idx: cur, h: Math.min(h, (inner - GAP * (cur.length - 1)) / sum), full: false });
  return rows;
}
const rowsHeight = (rows) => rows.reduce((a, r) => a + r.h, 0) + GAP * (rows.length - 1);

function drawMosaic(canvas, bitmaps, side, caption) {
  const inner = side - PAD * 2;
  const ars = bitmaps.map((b) => b.width / b.height);
  // Largest target row height whose collage stays roughly square-ish
  // (<= 1.25x the width): bigger photos when there are few, tighter rows when many.
  let lo = 40, hi = inner, best = layoutRows(ars, inner, lo);
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2, rows = layoutRows(ars, inner, mid);
    if (rowsHeight(rows) <= inner * 1.25) { lo = mid; best = rows; } else hi = mid;
  }
  const rows = best;
  const bodyH = Math.min(rowsHeight(rows), MAX_H);
  const scale = bodyH / rowsHeight(rows);
  canvas.width = side;
  canvas.height = Math.round(HEAD + bodyH + PAD);
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, side, canvas.height);
  g.addColorStop(0, "#151a24"); g.addColorStop(1, "#0d1016");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, side, canvas.height);
  ctx.fillStyle = "#e8ecf4"; ctx.font = "600 34px ui-monospace, Menlo, Consolas, monospace";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(caption, PAD, 58);
  ctx.fillStyle = "#5fd0c4"; ctx.fillRect(PAD, 70, 56, 3);
  let y = HEAD;
  for (const r of rows) {
    const rh = r.h * scale;
    const widths = r.idx.map((i) => ars[i] * rh);
    let x = PAD;
    if (!r.full) x += (inner - widths.reduce((a, b) => a + b, 0) - GAP * (r.idx.length - 1)) / 2;
    r.idx.forEach((i, j) => {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, widths[j], rh, 6);
      ctx.clip();
      ctx.drawImage(bitmaps[i], x, y, widths[j], rh);
      ctx.restore();
      x += widths[j] + GAP;
    });
    y += rh + GAP;
  }
}

// ---- calendar storage (IndexedDB, thumbnails only) ----
function db() {
  return new Promise((res, rej) => {
    const q = indexedDB.open("mootmosaic", 1);
    q.onupgradeneeded = () => q.result.createObjectStore("days", { keyPath: "id" });
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function saveDay(handle, date, thumb, count) {
  try {
    const d = await db();
    d.transaction("days", "readwrite").objectStore("days").put({ id: `${handle}|${date}`, handle, date, thumb, count });
  } catch {}
}
async function loadDays(handle) {
  try {
    const d = await db();
    return await new Promise((res) => {
      const q = d.transaction("days").objectStore("days").getAll();
      q.onsuccess = () => res(q.result.filter((x) => x.handle === handle));
      q.onerror = () => res([]);
    });
  } catch { return []; }
}

let state = { handle: null, year: new Date().getFullYear(), days: new Map(), blob: null };

function renderCalendar() {
  els.yearLabel.textContent = state.year;
  els.months.innerHTML = "";
  const names = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  for (let m = 0; m < 12; m++) {
    const box = document.createElement("div");
    box.innerHTML = `<h3>${names[m]}</h3>`;
    const grid = document.createElement("div");
    grid.className = "cal";
    const first = new Date(state.year, m, 1).getDay();
    for (let i = 0; i < first; i++) grid.appendChild(document.createElement("div"));
    const len = new Date(state.year, m + 1, 0).getDate();
    for (let d = 1; d <= len; d++) {
      const key = `${state.year}-${pad(m + 1)}-${pad(d)}`;
      const cell = document.createElement("div");
      cell.className = "cell";
      const lab = document.createElement("span");
      lab.textContent = d;
      cell.appendChild(lab);
      const rec = state.days.get(key);
      if (rec) {
        const img = document.createElement("img");
        img.src = rec.thumb;
        img.alt = `${key}: ${rec.count} images`;
        img.title = key;
        img.addEventListener("click", () => { els.day.value = key; els.form.requestSubmit(); });
        cell.appendChild(img);
      }
      grid.appendChild(cell);
    }
    box.appendChild(grid);
    els.months.appendChild(box);
  }
}

async function refreshCalendar() {
  state.days = new Map((await loadDays(state.handle)).map((r) => [r.date, r]));
  els.calSec.hidden = false;
  renderCalendar();
}

els.prevY.addEventListener("click", () => { state.year--; renderCalendar(); });
els.nextY.addEventListener("click", () => { state.year++; renderCalendar(); });

els.dlCal.addEventListener("click", () => {
  const cell = 160, gap = 6, pw = 7 * cell, W = 3 * (pw + 40) + 40;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const monthH = (m) => Math.ceil((new Date(state.year, m, 1).getDay() + new Date(state.year, m + 1, 0).getDate()) / 7) * cell + 50;
  const rowsH = [0, 1, 2, 3].map((r) => Math.max(...[0, 1, 2].map((k) => monthH(r * 3 + k))));
  c.width = W; c.height = 120 + rowsH.reduce((a, b) => a + b, 0);
  ctx.fillStyle = "#0f1218"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#e8ecf4"; ctx.font = "bold 56px monospace";
  ctx.fillText(`@${state.handle} · ${state.year}`, 40, 80);
  const imgs = [];
  let y0 = 120;
  const jobs = [];
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 3; k++) {
      const m = r * 3 + k, x0 = 40 + k * (pw + 40);
      ctx.fillStyle = "#5fd0c4"; ctx.font = "bold 28px monospace";
      ctx.fillText(["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"][m], x0, y0 + 30);
      const first = new Date(state.year, m, 1).getDay(), len = new Date(state.year, m + 1, 0).getDate();
      for (let d = 1; d <= len; d++) {
        const idx = first + d - 1, x = x0 + (idx % 7) * cell, y = y0 + 44 + Math.floor(idx / 7) * cell;
        ctx.fillStyle = "#181d27"; ctx.fillRect(x + gap / 2, y + gap / 2, cell - gap, cell - gap);
        const rec = state.days.get(`${state.year}-${pad(m + 1)}-${pad(d)}`);
        if (rec) jobs.push(new Promise((res) => {
          const im = new Image();
          im.onload = () => { ctx.drawImage(im, x + gap / 2, y + gap / 2, cell - gap, cell - gap); res(); };
          im.onerror = res;
          im.src = rec.thumb;
        }));
      }
    }
    y0 += rowsH[r];
  }
  Promise.all(jobs).then(() => c.toBlob((b) => download(b, `mootmosaic-${state.handle}-${state.year}.png`), "image/png"));
});

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---- main flow ----
els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = cleanHandle(els.handle.value);
  if (!raw) return setStatus("enter a handle", true);
  const [y, m, d] = els.day.value.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d);
  if (isNaN(dayStart)) return setStatus("pick a day", true);
  const start = dayStart.getTime(), end = new Date(y, m - 1, d + 1).getTime();
  els.go.disabled = true;
  els.result.hidden = true;
  try {
    setStatus("looking you up…");
    const prof = await xrpc("app.bsky.actor.getProfile", { actor: raw });
    state.handle = prof.handle;
    state.year = y;
    const moots = await getMoots(prof.did);
    if (!moots.length) throw new Error("no moots found for that account");
    let done = 0;
    const lists = await pool(moots, async (p) => {
      const r = await imagesForDay(p, start, end);
      setStatus(`checking moots for photos… ${++done}/${moots.length}`);
      return r;
    });
    const all = lists.flat().filter(Boolean).sort((a, b) => a.t - b.t);
    if (!all.length) {
      setStatus(`none of your ${moots.length} moots posted images on ${els.day.value}.`);
      await refreshCalendar();
      return;
    }
    let loaded = 0;
    const bms = await pool(all, async (im) => {
      const bm = await loadBitmap(im.url).catch(() => loadBitmap(im.thumb));
      setStatus(`loading images… ${++loaded}/${all.length}`);
      return bm;
    });
    const ok = all.map((im, i) => ({ im, bm: bms[i] })).filter((x) => x.bm);
    if (!ok.length) throw new Error("couldn't load any of the images");
    drawMosaic(els.canvas, ok.map((x) => x.bm), SIDE, `@${prof.handle}'s moots · ${els.day.value}`);
    els.result.hidden = false;
    const who = [...new Set(ok.map((x) => x.im.handle))];
    els.credits.textContent = `${ok.length} images from ${who.length} moots: ` + who.map((h) => "@" + h).join(" ");
    const text = `my moots' photos for ${els.day.value}, all in one — made with mootmosaic https://mootmosaic.bisks.net`;
    els.intent.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
    els.canvas.toBlob((b) => { state.blob = b; }, "image/png");
    const t = document.createElement("canvas");
    t.width = t.height = 240;
    const cw = els.canvas.width, chh = els.canvas.height, cs = Math.min(cw, chh);
    t.getContext("2d").drawImage(els.canvas, (cw - cs) / 2, 0, cs, cs, 0, 0, 240, 240);
    await saveDay(prof.handle, els.day.value, t.toDataURL("image/jpeg", 0.7), ok.length);
    setStatus(`done — ${ok.length} images from ${who.length} moots.`);
    await refreshCalendar();
    ok.forEach((x) => x.bm.close && x.bm.close());
  } catch (err) {
    setStatus(String(err.message || err), true);
  } finally {
    els.go.disabled = false;
  }
});

els.dl.addEventListener("click", () => {
  els.canvas.toBlob((b) => download(b, `mootmosaic-${state.handle}-${els.day.value}.png`), "image/png");
});

els.share.addEventListener("click", async () => {
  const text = `my moots' photos for ${els.day.value}, all in one — mootmosaic.bisks.net`;
  const blob = state.blob;
  if (blob && navigator.canShare) {
    const file = new File([blob], "mootmosaic.png", { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
  }
  if (navigator.share) { try { await navigator.share({ text, url: "https://mootmosaic.bisks.net/" }); return; } catch {} }
  setStatus("sharing isn't available here — use download, then attach it to a post.");
});

els.secret.addEventListener("click", () => {
  els.handle.value = "@cee.wtf";
  els.handle.dispatchEvent(new Event("input", { bubbles: true }));
  els.handle.dispatchEvent(new Event("change", { bubbles: true }));
  els.handle.focus();
});

els.day.value = dayKey(new Date());
