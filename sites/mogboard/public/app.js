import { fetchRepoRecordsWithKeys } from "./lib/car.js";
import { resolvePds } from "./lib/identity.js";
import { perDay, daysBetween, scoreboard, dayKey } from "./lib/score.js";

const PUB = "https://public.api.bsky.app/xrpc";
const $ = (id) => document.getElementById(id);
const DEFAULTS = ["vgel.me", "norvid-studies.bsky.social"];
const handles = [];

function norm(h) { return String(h || "").trim().replace(/^@/, "").toLowerCase(); }
function today() { return dayKey(new Date().toISOString()); }

function renderChips() {
  const ul = $("chips");
  ul.textContent = "";
  for (const h of handles) {
    const li = document.createElement("li");
    li.append(h);
    const x = document.createElement("button");
    x.type = "button"; x.textContent = "×"; x.setAttribute("aria-label", "remove " + h);
    x.addEventListener("click", () => { handles.splice(handles.indexOf(h), 1); renderChips(); });
    li.append(x);
    ul.append(li);
  }
}

function addHandle(raw) {
  // accept pasted lists too: "a.bsky.social, @b.com c.org"
  for (const part of String(raw).split(/[\s,]+/)) {
    const h = norm(part);
    if (h && !handles.includes(h)) handles.push(h);
  }
  renderChips();
}

function setStatus(msg, err) { const s = $("status"); s.textContent = msg; s.classList.toggle("err", !!err); }

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status + " " + url);
  return r.json();
}

async function resolve(handle) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`);
  return { did: p.did, handle: p.handle };
}

// Fallback when getRepo fails (oversized repo, non-CORS PDS): page listRecords
// newest-first until the cursor ends or we pass the start date. Stopping at the
// start date is the point of the query, not a cap.
async function paged(pds, did, startDay) {
  const out = [];
  let cursor;
  for (;;) {
    const u = `${pds}/xrpc/com.atproto.repo.listRecords?repo=${did}&collection=app.bsky.feed.post&limit=100` + (cursor ? `&cursor=${cursor}` : "");
    const d = await jget(u);
    let older = false;
    for (const r of d.records) {
      out.push({ value: r.value });
      const k = dayKey(r.value.createdAt);
      if (k && k < startDay) older = true;
    }
    if (!d.cursor || !d.records.length || older) return out;
    cursor = d.cursor;
  }
}

async function loadPosts(who, startDay) {
  const pds = await resolvePds(who.did);
  if (!pds) throw new Error("no PDS for " + who.handle);
  try {
    return (await fetchRepoRecordsWithKeys(pds, who.did, "app.bsky.feed.post")).records;
  } catch (e) {
    setStatus(`${who.handle}: repo download failed (${e.message}); paging instead…`);
    return paged(pds, who.did, startDay);
  }
}

function td(text, cls) {
  const c = document.createElement("td");
  c.textContent = text;
  if (cls) c.className = cls;
  return c;
}
function th(text) { const c = document.createElement("th"); c.textContent = text; return c; }
function tr(...cells) { const r = document.createElement("tr"); r.append(...cells); return r; }

function render(bloggers, dayList, s) {
  const tb = $("standings").tBodies[0];
  tb.textContent = "";
  s.ranked.forEach((r, i) => {
    tb.append(tr(td(i + 1), td(r.handle), td(r.wins), td(r.mogs), td(r.words.toLocaleString()), td(r.posts), td(r.streak + "d"),
      td(r.best ? `${r.best.toLocaleString()} (${r.bestDay.slice(5)})` : "–")));
  });

  const hh = $("h2h");
  hh.textContent = "";
  hh.className = "left";
  const head = tr(th(""), ...bloggers.map((b) => th(b.handle)));
  hh.append(head);
  bloggers.forEach((b, i) => hh.append(tr(th(b.handle), ...bloggers.map((_, j) => td(i === j ? "·" : s.h2h[i][j], i === j || !s.h2h[i][j] ? "zero" : "")))));

  const dl = $("daily");
  dl.textContent = "";
  dl.className = "left";
  dl.append(tr(th("day"), ...bloggers.map((b) => th(b.handle))));
  for (const w of s.winners.slice().reverse()) {
    dl.append(tr(th(w.day.slice(5)), ...w.words.map((x, i) => td(x ? x.toLocaleString() : "–",
      x === 0 ? "zero" : w.winners.includes(i) ? "win" : w.tie && x === Math.max(...w.words) ? "tie" : ""))));
  }

  const top = s.ranked[0];
  const text = `mogboard ${dayList[0]} → ${dayList[dayList.length - 1]}:\n` +
    s.ranked.slice(0, 5).map((r, i) => `${i + 1}. ${r.handle} — ${r.mogs} mogs, ${r.wins} day wins, ${r.words.toLocaleString()} words`).join("\n") +
    `\n\n${top.handle} is mogging.`;
  const url = location.origin + location.pathname + "?" + new URLSearchParams({ h: bloggers.map((b) => b.handle).join(","), from: dayList[0], to: dayList[dayList.length - 1] });
  $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + "\n" + url);
  $("results").hidden = false;
}

async function run() {
  if (!handles.length) { setStatus("add at least one handle first.", true); return; }
  const startDay = $("from").value, endDay = $("to").value;
  if (!startDay || !endDay || startDay > endDay) { setStatus("pick a valid date range.", true); return; }
  const go = $("go");
  go.disabled = true;
  $("results").hidden = true;
  try {
    const bloggers = [];
    for (const h of handles) {
      setStatus(`resolving ${h}…`);
      const who = await resolve(h);
      setStatus(`reading ${who.handle}'s repo…`);
      const records = await loadPosts(who, startDay);
      bloggers.push({ handle: who.handle, days: perDay(who.did, records, startDay, endDay) });
    }
    const dayList = daysBetween(startDay, endDay);
    render(bloggers, dayList, scoreboard(bloggers, dayList));
    setStatus(bloggers.length < 2 ? "add a rival to start mogging." : "");
  } catch (e) {
    setStatus("couldn't finish: " + e.message, true);
  } finally {
    go.disabled = false;
  }
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const i = $("handle");
  addHandle(i.value);
  i.value = "";
});
$("go").addEventListener("click", () => {
  // a handle typed but not yet added still counts
  const i = $("handle");
  if (i.value.trim()) { addHandle(i.value); i.value = ""; }
  run();
});
$("secret").addEventListener("click", () => {
  const i = $("handle");
  i.value = "@cee.wtf";
  i.dispatchEvent(new Event("input", { bubbles: true }));
  i.dispatchEvent(new Event("change", { bubbles: true }));
  i.focus();
});
$("secret").style.cursor = "pointer";

const q = new URLSearchParams(location.search);
$("from").value = q.get("from") || "2026-11-01";
$("to").value = q.get("to") || today();
addHandle(q.get("h") || DEFAULTS.join(","));
if (window.attachHandleTypeahead) window.attachHandleTypeahead($("handle"));
if (q.get("h")) run();
