import { resolveDid, circle, readWindow, postUrl } from "./lib/feed.js";
import { classify, hostOf } from "./lib/classify.js";

const $ = (id) => document.getElementById(id);
const goForm = $("goForm"), handleInput = $("handle"), goBtn = $("goBtn"), goMsg = $("goMsg");
const progress = $("progress"), barFill = $("barFill"), progText = $("progText");
const results = $("results"), feedEl = $("feed"), summary = $("summary");
const strict = $("strict"), kindFilter = $("kindFilter"), showWhy = $("showWhy");

let all = []; // every post read, classified lazily on render
let meta = { accounts: 0, failed: 0, days: 3, handle: "" };

const DAY_MS = 86400000;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function dayLabel(d) {
  const today = new Date();
  const k = (x) => x.toDateString();
  if (k(d) === k(today)) return "today";
  if (k(d) === k(new Date(today.getTime() - DAY_MS))) return "yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function cardFor(p, c) {
  const card = el("div", "post");
  const who = el("div", "who");
  const av = el("img");
  av.alt = "";
  av.loading = "lazy";
  if (p.avatar) av.src = p.avatar;
  who.append(av);
  const a = el("a", "name", p.displayName);
  a.href = `https://bsky.app/profile/${p.handle}`;
  a.target = "_blank";
  a.rel = "noopener";
  who.append(a, el("span", "", "@" + p.handle));
  const when = el("a", "when", new Date(p.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
  when.href = postUrl(p.uri, p.handle);
  when.target = "_blank";
  when.rel = "noopener";
  who.append(when);
  card.append(who);
  if (p.text.trim()) card.append(el("div", "text", p.text));
  if (p.external) {
    const x = el("a", "ext");
    x.href = p.external.uri;
    x.target = "_blank";
    x.rel = "noopener noreferrer";
    if (p.external.thumb) {
      const im = el("img");
      im.src = p.external.thumb;
      im.alt = "";
      im.loading = "lazy";
      x.append(im);
    }
    const body = el("div");
    body.append(el("div", "t", p.external.title || p.external.uri));
    if (p.external.description) body.append(el("div", "d", p.external.description));
    body.append(el("div", "h", hostOf(p.external.uri)));
    x.append(body);
    card.append(x);
  }
  if (p.images.length) {
    const box = el("div", "imgs");
    for (const i of p.images) {
      const im = el("img");
      im.src = i.thumb;
      im.alt = i.alt;
      im.loading = "lazy";
      box.append(im);
    }
    card.append(box);
  }
  const tags = el("div", "tags");
  for (const k of c.kinds) tags.append(el("span", "tag", k));
  card.append(tags);
  if (showWhy.checked) card.append(el("div", "fine why", `score ${c.score}: ${c.reasons.join(" · ")}`));
  return card;
}

function render() {
  const threshold = Number(strict.value);
  const wantKind = kindFilter.value;
  const kept = [];
  const kinds = new Set();
  for (const p of all) {
    const c = classify(p, { threshold });
    if (!c.isSoftware) continue;
    c.kinds.forEach((k) => kinds.add(k));
    kept.push({ p, c });
  }
  // rebuild the kind dropdown without losing the current pick
  if (kindFilter.options.length - 1 !== kinds.size) {
    kindFilter.textContent = "";
    kindFilter.append(new Option("everything", ""));
    for (const k of [...kinds].sort()) kindFilter.append(new Option(k, k));
    kindFilter.value = kinds.has(wantKind) ? wantKind : "";
  }
  const shown = kept
    .filter(({ c }) => !kindFilter.value || c.kinds.includes(kindFilter.value))
    .sort((a, b) => (a.p.createdAt < b.p.createdAt ? 1 : -1));
  summary.textContent = `${shown.length} software posts out of ${all.length} read from ${meta.accounts} accounts over ${meta.days} day${meta.days > 1 ? "s" : ""}${meta.failed ? ` (${meta.failed} unreachable)` : ""}.`;
  feedEl.textContent = "";
  if (!shown.length) {
    feedEl.append(el("div", "empty", "no software in this window. try loose strictness or more days."));
  }
  let lastDay = "";
  for (const { p, c } of shown) {
    const d = new Date(p.createdAt);
    const key = d.toDateString();
    if (key !== lastDay) {
      feedEl.append(el("div", "day", dayLabel(d)));
      lastDay = key;
    }
    feedEl.append(cardFor(p, c));
  }
  const intro = `${shown.length} software posts from my moots in the last ${meta.days} day${meta.days > 1 ? "s" : ""} — scrolled with softscroll`;
  $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(intro + "\nhttps://softscroll.bisks.net/");
}

goForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  goMsg.textContent = "";
  const raw = handleInput.value.trim().replace(/^@/, "");
  if (!raw) {
    goMsg.textContent = "enter a handle";
    return;
  }
  const days = Number($("days").value) || 3;
  goBtn.disabled = true;
  results.hidden = true;
  progress.hidden = false;
  barFill.style.width = "0%";
  progText.textContent = "resolving handle…";
  all = [];
  try {
    const did = await resolveDid(raw);
    const c = await circle(did, { onStep: (s) => (progText.textContent = s) });
    const since = Date.now() - days * DAY_MS;
    meta = { accounts: c.pool.length, failed: 0, days, handle: raw };
    const { failed } = await readWindow(c.pool, since, {
      onPosts: (posts) => all.push(...posts),
      onProgress: ({ done, total, posts }) => {
        barFill.style.width = `${Math.round((done / total) * 100)}%`;
        progText.textContent = `read ${done}/${total} accounts · ${posts} posts so far`;
      },
    });
    meta.failed = failed;
    progress.hidden = true;
    results.hidden = false;
    render();
  } catch (e) {
    progress.hidden = true;
    goMsg.textContent = e.message || "something went wrong";
  } finally {
    goBtn.disabled = false;
  }
});

for (const c of [strict, kindFilter, showWhy]) c.addEventListener("change", render);
