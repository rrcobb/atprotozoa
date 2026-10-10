import { fetchRepoRecordsWithKeys } from "./lib/car.js";
import { backlinkRecords, SOURCES } from "./lib/microcosm.js";
import { tidToMs, computeMoots, byDay, dayKey } from "./moots.js";

const PUB = "https://public.api.bsky.app/xrpc";
const $ = (id) => document.getElementById(id);
const els = { form: $("form"), handle: $("handle"), go: $("go"), status: $("status"), out: $("out"), summary: $("summary"), today: $("today"), years: $("years"), tip: $("tip"), share: $("share"), note: $("note") };

function setStatus(msg, err) { els.status.textContent = msg || ""; els.status.className = err ? "err" : ""; }

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

function cleanHandle(raw) {
  return (raw || "").trim().replace(/^@/, "").replace(/^at:\/\//, "").replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "").split("/")[0];
}

async function resolveDid(h) {
  if (h.startsWith("did:")) return h;
  return (await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(h)}`)).did;
}

async function resolvePds(did) {
  const doc = did.startsWith("did:web:")
    ? await jget(`https://${decodeURIComponent(did.slice(8))}/.well-known/did.json`)
    : await jget(`https://plc.directory/${encodeURIComponent(did)}`);
  const svc = (doc.service || []).find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
  if (!svc) throw new Error("no PDS in DID document");
  return svc.serviceEndpoint;
}

// Paginate to exhaustion (cursor comes back empty). 400 pages x 100 = 40,000
// is an unreachable backstop for a runaway cursor, not a budget.
async function graphAll(endpoint, key, did, onStep) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < 400; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u);
    out.push(...(d[key] || []));
    if (onStep) onStep(out.length);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// My follow records: whole repo in one CAR; paginated listRecords if that fails.
async function myFollows(pds, did) {
  const mine = new Map();
  const add = (subject, createdAt, rkey) => {
    let ms = createdAt ? Date.parse(createdAt) : NaN;
    if (!Number.isFinite(ms)) ms = tidToMs(rkey);
    if (subject && ms != null) mine.set(subject, ms);
  };
  try {
    const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.graph.follow", setStatus);
    for (const r of records) add(r.value.subject, r.value.createdAt, r.uri.split("/").pop());
    return mine;
  } catch (e) {
    setStatus("repo download failed (" + e.message + "), paging through listRecords…");
  }
  let cursor = "";
  for (let p = 0; p < 400; p++) { // 400 x 100 = 40,000 follows: unreachable backstop, not a budget
    const u = new URL(pds.replace(/\/$/, "") + "/xrpc/com.atproto.repo.listRecords");
    u.searchParams.set("repo", did);
    u.searchParams.set("collection", "app.bsky.graph.follow");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u);
    for (const r of d.records || []) add(r.value.subject, r.value.createdAt, r.uri.split("/").pop());
    cursor = d.cursor;
    if (!cursor) break;
  }
  return mine;
}

let state = null;

async function run(rawHandle) {
  const h = cleanHandle(rawHandle);
  if (!h) { setStatus("enter a handle first", true); return; }
  els.go.disabled = true;
  els.out.hidden = true;
  try {
    setStatus("resolving @" + h + "…");
    const did = await resolveDid(h);
    const pds = await resolvePds(did);
    const profile = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`).catch(() => ({ handle: h }));

    setStatus("reading who follows @" + profile.handle + "…");
    const followersList = await graphAll("app.bsky.graph.getFollowers", "followers", did, (n) => setStatus(`reading followers… ${n}`));
    const followers = new Set(followersList.map((f) => f.did));
    const people = new Map(followersList.map((f) => [f.did, f.handle]));

    const mine = await myFollows(pds, did);

    // When each follower followed back: the rkey of their follow record is a TID.
    setStatus("looking up when each follower followed…");
    const theirs = new Map();
    try {
      const recs = await backlinkRecords(did, SOURCES.followers, { onStep: (n) => setStatus(`dating followers… ${n}`) });
      for (const r of recs) {
        const ms = tidToMs(r.rkey);
        if (ms != null) theirs.set(r.did, ms);
      }
    } catch (e) { /* every moot falls back to the date I followed; flagged approx below */ }

    const moots = computeMoots(mine, followers, theirs).map((m) => ({ ...m, handle: people.get(m.did) || m.did }));
    state = { profile, did, moots, days: byDay(moots) };
    render();
    setStatus("");
    history.replaceState(null, "", "#" + profile.handle);
  } catch (e) {
    setStatus("couldn't load that: " + e.message, true);
  } finally {
    els.go.disabled = false;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const level = (n) => (n >= 6 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : 1);

function render() {
  const { moots, days, profile } = state;
  els.out.hidden = false;
  els.years.textContent = "";
  const approx = moots.filter((m) => m.approx).length;
  const busiest = [...days.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  els.summary.innerHTML = "";
  for (const [v, l] of [[moots.length, "moots"], [days.size, "mootiversary days"], [busiest ? busiest[1].length : 0, busiest ? "most on " + busiest[0] : "most in a day"]]) {
    const d = document.createElement("div");
    d.className = "stat";
    const b = document.createElement("b"); b.textContent = v;
    const s = document.createElement("span"); s.textContent = l;
    d.append(b, s);
    els.summary.append(d);
  }
  renderToday(days);
  if (!moots.length) {
    els.years.textContent = "";
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = `@${profile.handle} has no moots yet.`;
    els.years.append(p);
  } else {
    const first = new Date(Math.min(...moots.map((m) => m.ms))).getUTCFullYear();
    const last = new Date().getUTCFullYear();
    for (let y = last; y >= first; y--) els.years.append(yearBlock(y, days));
  }
  els.note.textContent = approx
    ? `${approx} moot${approx === 1 ? "" : "s"} show the day you followed them, because the day they followed you couldn't be looked up.`
    : "";
  const text = `I have ${moots.length} moots on Bluesky, with mootiversaries on ${days.size} different days 💙`;
  els.share.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + "\nhttps://mootiversary.bisks.net/#" + profile.handle);
}

function renderToday(days) {
  const now = new Date();
  const md = (d) => d.slice(5);
  const mdToday = dayKey(now.getTime()).slice(5);
  const todays = [];
  for (const [k, list] of days) if (md(k) === mdToday && k.slice(0, 4) !== String(now.getUTCFullYear())) for (const m of list) todays.push([k.slice(0, 4), m]);
  els.today.textContent = "";
  const h = document.createElement("h3");
  h.textContent = "mootiversaries today";
  els.today.append(h);
  if (!todays.length) {
    const p = document.createElement("span");
    p.className = "note";
    p.textContent = "none today. check back tomorrow.";
    els.today.append(p);
    return;
  }
  const ul = document.createElement("ul");
  for (const [y, m] of todays.sort((a, b) => a[0] - b[0])) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "https://bsky.app/profile/" + m.did; a.target = "_blank"; a.rel = "noopener";
    a.textContent = "@" + m.handle;
    li.append(a, ` — ${now.getUTCFullYear() - Number(y)} year${now.getUTCFullYear() - Number(y) === 1 ? "" : "s"} (since ${y})`);
    ul.append(li);
  }
  els.today.append(ul);
}

function yearBlock(y, days) {
  const wrap = document.createElement("div");
  wrap.className = "year";
  let count = 0;
  const grid = document.createElement("div");
  grid.className = "grid";
  const jan1 = new Date(Date.UTC(y, 0, 1));
  const pad = jan1.getUTCDay(); // Sunday = row 0
  const total = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86400000;
  for (let i = 0; i < total; i++) {
    const t = Date.UTC(y, 0, 1 + i);
    const dt = new Date(t);
    const col = Math.floor((i + pad) / 7);
    const row = ((i + pad) % 7) + 2; // row 1 is the month label row
    if (dt.getUTCDate() === 1) {
      const lab = document.createElement("div");
      lab.className = "mon";
      lab.textContent = MONTHS[dt.getUTCMonth()];
      lab.style.gridColumn = String(col + 1);
      lab.style.gridRow = "1";
      grid.append(lab);
    }
    const key = dayKey(t);
    const list = days.get(key);
    const c = document.createElement("div");
    c.className = "cell" + (list ? " m l" + level(list.length) : "");
    c.style.gridColumn = String(col + 1);
    c.style.gridRow = String(row);
    c.dataset.day = key;
    if (list) count += list.length;
    grid.append(c);
  }
  const h = document.createElement("h2");
  h.textContent = String(y);
  const sm = document.createElement("small");
  sm.textContent = count ? `${count} moot${count === 1 ? "" : "s"}` : "no new moots";
  h.append(sm);
  wrap.append(h, grid);
  return wrap;
}

// Tooltip: hover on desktop, tap on touch.
function showTip(cell, evt) {
  const list = state && state.days.get(cell.dataset.day);
  if (!list) { els.tip.hidden = true; els.tip.style.display = "none"; return; }
  els.tip.textContent = "";
  const d = document.createElement("div");
  d.className = "d";
  d.textContent = new Date(cell.dataset.day + "T00:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
  els.tip.append(d);
  for (const m of list.slice(0, 12)) {
    const r = document.createElement("div");
    r.textContent = "@" + m.handle + (m.approx ? " (~)" : "");
    els.tip.append(r);
  }
  if (list.length > 12) { // tooltip height only; the rest are one tap away on the profile
    const r = document.createElement("div");
    r.className = "d";
    r.textContent = `+${list.length - 12} more`;
    els.tip.append(r);
  }
  els.tip.hidden = false;
  els.tip.style.display = "block";
  const rect = cell.getBoundingClientRect();
  const w = els.tip.offsetWidth;
  els.tip.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, rect.left + rect.width / 2 - w / 2)) + "px";
  els.tip.style.top = Math.max(4, rect.top - els.tip.offsetHeight - 8) + "px";
}
function hideTip() { els.tip.hidden = true; els.tip.style.display = "none"; }

els.years.addEventListener("mouseover", (e) => { const c = e.target.closest(".cell.m"); if (c) showTip(c); else hideTip(); });
els.years.addEventListener("mouseleave", hideTip);
els.years.addEventListener("click", (e) => { const c = e.target.closest(".cell.m"); if (c) showTip(c); else hideTip(); });

els.form.addEventListener("submit", (e) => { e.preventDefault(); run(els.handle.value); });

if (window.attachHandleTypeahead) window.attachHandleTypeahead(els.handle, { onSelect: () => {} });

const initial = decodeURIComponent(location.hash.slice(1));
if (initial) { els.handle.value = initial; run(initial); }
