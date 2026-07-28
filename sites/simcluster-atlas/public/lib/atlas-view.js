// atlas-view.js — renders the precomputed simcluster atlas (see
// ../../gen-atlas.mjs, which writes ../atlas-data.json). Round two: round
// one had a live handle picker; this round is centered on one fixed subject
// and everything's baked ahead of time, so this file is pure render + client
// -side filter/sort/group over the static JSON. No network calls but the
// one fetch for the data file. Round three: domain/poster filters became
// multi-select (Sets, not single active keys), added free-text search, and
// added a dense table view alongside the original cards.

const $ = (id) => document.getElementById(id);
const msg = $("msg"), stats = $("stats"), atlas = $("atlas");
const textSearch = $("textSearch");
const domainSearch = $("domainSearch"), domainChips = $("domainChips");
const posterSearch = $("posterSearch"), posterChips = $("posterChips");
const domainChosenCount = $("domainChosenCount"), posterChosenCount = $("posterChosenCount");
const minShared = $("minShared"), sortBy = $("sortBy"), viewMode = $("viewMode"), groupToggle = $("groupToggle");
const clearFiltersBtn = $("clearFiltersBtn");
const countNote = $("countNote"), entriesEl = $("entries"), shareBtn = $("shareBtn");

const short = (h) => "@" + String(h || "").replace(/\.bsky\.social$/, "");
const esc = (s) =>
  String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const TINTS = ["#0e6e6e", "#a9762f", "#a13b2b", "#4a5e8a", "#6b8e23", "#8a4a8a", "#2f7a4a", "#c76b3a"];
function tintFor(seed) {
  let h = 0;
  for (const c of seed || "x") h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return TINTS[h % TINTS.length];
}
function initials(name) {
  return (name || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
}
function avEl(handle, displayName, avatar) {
  const d = document.createElement("div");
  d.className = "av";
  if (avatar) d.style.backgroundImage = `url("${avatar}")`;
  else { d.style.background = tintFor(handle); d.textContent = initials(displayName || handle); }
  return d;
}
function timeAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
function postUrl(uri, handle) {
  const rkey = (uri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}
function domainOf(uri) {
  try { return new URL(uri).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function normalizeUrl(uri) {
  try {
    const u = new URL(uri);
    for (const k of [...u.searchParams.keys()]) {
      if (/^utm_|^ref$|^si$/i.test(k)) u.searchParams.delete(k);
    }
    return (u.origin + u.pathname.replace(/\/+$/, "") + (u.search ? "?" + u.searchParams.toString() : "")).toLowerCase();
  } catch {
    return uri;
  }
}

const SITE_URL = "https://bisks.net/simcluster-atlas";
function composeUrl(text) {
  return "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

let DATA = null;
let posterByHandle = new Map();
const activeDomains = new Set();
const activePosters = new Set();

function textQuery() {
  return textSearch.value.trim().toLowerCase();
}

function updateChosenCounts() {
  domainChosenCount.textContent = activeDomains.size ? `(${activeDomains.size} selected)` : "";
  posterChosenCount.textContent = activePosters.size ? `(${activePosters.size} selected)` : "";
}

function chipRow(container, items, keyFn, labelFn, activeSet, onPick) {
  container.innerHTML = "";
  for (const item of items) {
    const key = keyFn(item);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (activeSet.has(key) ? " sel" : "");
    b.innerHTML = labelFn(item);
    b.addEventListener("click", () => onPick(key));
    container.appendChild(b);
  }
  if (!items.length) {
    const d = document.createElement("div");
    d.className = "chip-empty";
    d.textContent = "no matches";
    container.appendChild(d);
  }
}

function renderDomainChips() {
  const q = domainSearch.value.trim().toLowerCase();
  let pool = q ? DATA.domains.filter((d) => d.domain.toLowerCase().includes(q)) : DATA.domains.slice();
  pool = pool.slice().sort((a, b) => activeDomains.has(b.domain) - activeDomains.has(a.domain));
  chipRow(
    domainChips,
    pool.slice(0, q ? 60 : 30),
    (d) => d.domain,
    (d) => `${esc(d.domain)}<span class="n">${d.count}</span>`,
    activeDomains,
    (key) => {
      if (activeDomains.has(key)) activeDomains.delete(key); else activeDomains.add(key);
      renderDomainChips();
      updateChosenCounts();
      renderEntries();
    },
  );
}

function renderPosterChips() {
  const q = posterSearch.value.trim().toLowerCase();
  let pool = q
    ? DATA.posters.filter((p) => p.handle.toLowerCase().includes(q) || (p.displayName || "").toLowerCase().includes(q))
    : DATA.posters.slice();
  pool = pool.slice().sort((a, b) => activePosters.has(b.handle) - activePosters.has(a.handle));
  chipRow(
    posterChips,
    pool.slice(0, q ? 60 : 30),
    (p) => p.handle,
    (p) => `${esc(p.displayName)}<span class="n">${p.count}</span>`,
    activePosters,
    (key) => {
      if (activePosters.has(key)) activePosters.delete(key); else activePosters.add(key);
      renderPosterChips();
      updateChosenCounts();
      renderEntries();
    },
  );
}

function linksForDisplay(e) {
  return activeDomains.size ? e.links.filter((l) => activeDomains.has(domainOf(l))) : e.links;
}

function filteredSortedEntries() {
  const min = Number(minShared.value) || 1;
  const q = textQuery();
  let list = DATA.entries.filter((e) => {
    if (activeDomains.size && !e.links.some((l) => activeDomains.has(domainOf(l)))) return false;
    if (activePosters.size && !activePosters.has(e.handle)) return false;
    if (e.maxShareCount < min) return false;
    if (q) {
      const poster = posterByHandle.get(e.handle);
      const hay = [e.text || "", e.handle, poster?.displayName || "", ...e.links].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (sortBy.value === "shared") {
    list = list.slice().sort((a, b) => b.maxShareCount - a.maxShareCount || (a.createdAt < b.createdAt ? 1 : -1));
  }
  return list;
}

function entryCard(e) {
  const poster = posterByHandle.get(e.handle);
  const card = document.createElement("div");
  card.className = "entry";

  const hd = document.createElement("div"); hd.className = "hd";
  hd.appendChild(avEl(e.handle, poster?.displayName, poster?.avatar));
  const dn = document.createElement("span"); dn.className = "dn"; dn.textContent = poster?.displayName || e.handle;
  const hn = document.createElement("span"); hn.className = "hn";
  hn.innerHTML = ` <a href="https://bsky.app/profile/${esc(e.handle)}" target="_blank" rel="noopener">${short(e.handle)}</a>`;
  const when = document.createElement("span"); when.className = "when"; when.textContent = timeAgo(e.createdAt);
  hd.append(dn, hn, when);
  card.appendChild(hd);

  if (e.text) {
    const txt = document.createElement("div"); txt.className = "txt";
    txt.textContent = e.text;
    card.appendChild(txt);
  }

  const links = document.createElement("div"); links.className = "links";
  for (const l of e.links) {
    const row = document.createElement("div"); row.className = "linkrow";
    const a = document.createElement("a");
    a.href = l; a.target = "_blank"; a.rel = "noopener";
    a.textContent = "→ " + l;
    row.appendChild(a);
    if (e.maxShareCount > 1) {
      const tag = document.createElement("span");
      tag.className = "sharetag";
      tag.textContent = `shared ${e.maxShareCount}×`;
      row.appendChild(tag);
    }
    links.appendChild(row);
  }
  card.appendChild(links);

  const meta = document.createElement("div"); meta.className = "meta";
  meta.innerHTML =
    `<span>♡ ${e.likeCount}</span><span>⟲ ${e.repostCount}</span><span>↩ ${e.replyCount}</span>` +
    `<a href="${postUrl(e.uri, e.handle)}" target="_blank" rel="noopener">view post</a>`;
  card.appendChild(meta);

  return card;
}

function renderFlat(list) {
  entriesEl.innerHTML = "";
  for (const e of list) entriesEl.appendChild(entryCard(e));
}

function renderGrouped(list) {
  entriesEl.innerHTML = "";
  const groups = new Map(); // normalized url -> { url, domain, count, entries: [] }
  for (const e of list) {
    for (const l of linksForDisplay(e)) {
      const key = normalizeUrl(l);
      if (!groups.has(key)) groups.set(key, { url: l, domain: domainOf(l), entries: [] });
      groups.get(key).entries.push(e);
    }
  }
  const ordered = [...groups.values()].sort((a, b) => b.entries.length - a.entries.length);
  for (const g of ordered) {
    const card = document.createElement("div");
    card.className = "entry group";

    const hd = document.createElement("div"); hd.className = "grouphd";
    const a = document.createElement("a");
    a.className = "grouplink"; a.href = g.url; a.target = "_blank"; a.rel = "noopener";
    a.textContent = g.url;
    const tag = document.createElement("span"); tag.className = "sharetag big";
    tag.textContent = g.entries.length > 1 ? `shared ${g.entries.length}×` : "shared once";
    hd.append(a, tag);
    card.appendChild(hd);

    const rows = document.createElement("div"); rows.className = "grouprows";
    for (const e of g.entries.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))) {
      const poster = posterByHandle.get(e.handle);
      const row = document.createElement("div"); row.className = "grouprow";
      row.appendChild(avEl(e.handle, poster?.displayName, poster?.avatar));
      const who = document.createElement("a");
      who.href = `https://bsky.app/profile/${esc(e.handle)}`; who.target = "_blank"; who.rel = "noopener";
      who.className = "hn"; who.textContent = short(e.handle);
      const when = document.createElement("span"); when.className = "when"; when.textContent = timeAgo(e.createdAt);
      const view = document.createElement("a");
      view.href = postUrl(e.uri, e.handle); view.target = "_blank"; view.rel = "noopener";
      view.className = "viewlink"; view.textContent = "view post";
      row.append(who, when, view);
      rows.appendChild(row);
    }
    card.appendChild(rows);
    entriesEl.appendChild(card);
  }
}

function tableShell(headCells) {
  const wrap = document.createElement("div"); wrap.className = "tablewrap";
  const table = document.createElement("table"); table.className = "densetable";
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const h of headCells) { const th = document.createElement("th"); th.textContent = h; hr.appendChild(th); }
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  wrap.appendChild(table);
  return { wrap, tbody };
}

function whoCell(handle) {
  const poster = posterByHandle.get(handle);
  const div = document.createElement("div"); div.className = "who";
  div.appendChild(avEl(handle, poster?.displayName, poster?.avatar));
  const a = document.createElement("a");
  a.href = `https://bsky.app/profile/${esc(handle)}`; a.target = "_blank"; a.rel = "noopener";
  a.textContent = short(handle);
  div.appendChild(a);
  return div;
}

function renderTableFlat(list) {
  entriesEl.innerHTML = "";
  const { wrap, tbody } = tableShell(["poster", "link", "domain", "text", "×", "when", ""]);
  for (const e of list) {
    for (const l of linksForDisplay(e)) {
      const tr = document.createElement("tr");

      const tdWho = document.createElement("td"); tdWho.appendChild(whoCell(e.handle));

      const tdLink = document.createElement("td");
      const a = document.createElement("a"); a.className = "lnk"; a.href = l; a.target = "_blank"; a.rel = "noopener"; a.textContent = l;
      tdLink.appendChild(a);

      const tdDom = document.createElement("td"); tdDom.className = "dom"; tdDom.textContent = domainOf(l);

      const tdText = document.createElement("td"); tdText.className = "snippet";
      tdText.title = e.text || ""; tdText.textContent = e.text || "";

      const tdN = document.createElement("td"); tdN.className = "n";
      tdN.textContent = e.maxShareCount > 1 ? `${e.maxShareCount}×` : "";

      const tdWhen = document.createElement("td"); tdWhen.className = "when";
      tdWhen.textContent = timeAgo(e.createdAt);
      if (e.createdAt) tdWhen.title = new Date(e.createdAt).toLocaleString();

      const tdView = document.createElement("td"); tdView.className = "view";
      const view = document.createElement("a");
      view.href = postUrl(e.uri, e.handle); view.target = "_blank"; view.rel = "noopener"; view.textContent = "view post";
      tdView.appendChild(view);

      tr.append(tdWho, tdLink, tdDom, tdText, tdN, tdWhen, tdView);
      tbody.appendChild(tr);
    }
  }
  entriesEl.appendChild(wrap);
}

function renderTableGrouped(list) {
  entriesEl.innerHTML = "";
  const groups = new Map();
  for (const e of list) {
    for (const l of linksForDisplay(e)) {
      const key = normalizeUrl(l);
      if (!groups.has(key)) groups.set(key, { url: l, domain: domainOf(l), entries: [] });
      groups.get(key).entries.push(e);
    }
  }
  const ordered = [...groups.values()].sort((a, b) => b.entries.length - a.entries.length);

  const { wrap, tbody } = tableShell(["link", "domain", "×", "posters", "latest"]);
  for (const g of ordered) {
    const tr = document.createElement("tr");

    const tdLink = document.createElement("td");
    const a = document.createElement("a"); a.className = "lnk"; a.href = g.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = g.url;
    tdLink.appendChild(a);

    const tdDom = document.createElement("td"); tdDom.className = "dom"; tdDom.textContent = g.domain;

    const tdN = document.createElement("td"); tdN.className = "n";
    tdN.textContent = g.entries.length > 1 ? `${g.entries.length}×` : "1×";

    const sorted = g.entries.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const tdPosters = document.createElement("td");
    const postersDiv = document.createElement("div"); postersDiv.className = "posters";
    const seen = new Set();
    let shown = 0;
    for (const e of sorted) {
      if (seen.has(e.handle)) continue;
      seen.add(e.handle);
      if (shown >= 6) continue;
      shown++;
      const who = document.createElement("a");
      who.href = `https://bsky.app/profile/${esc(e.handle)}`; who.target = "_blank"; who.rel = "noopener";
      who.textContent = short(e.handle);
      postersDiv.appendChild(who);
    }
    if (seen.size > shown) {
      const more = document.createElement("span"); more.className = "more"; more.textContent = `+${seen.size - shown} more`;
      postersDiv.appendChild(more);
    }
    tdPosters.appendChild(postersDiv);

    const tdWhen = document.createElement("td"); tdWhen.className = "when";
    tdWhen.textContent = timeAgo(sorted[0].createdAt);
    if (sorted[0].createdAt) tdWhen.title = new Date(sorted[0].createdAt).toLocaleString();

    tr.append(tdLink, tdDom, tdN, tdPosters, tdWhen);
    tbody.appendChild(tr);
  }
  entriesEl.appendChild(wrap);
}

function renderEntries() {
  const list = filteredSortedEntries();
  const grouping = groupToggle.checked;
  const dense = viewMode.value === "table";
  const filtered = activeDomains.size || activePosters.size || textQuery() || Number(minShared.value) > 1;
  countNote.textContent = filtered
    ? `showing ${list.length} of ${DATA.entries.length} link-posts`
    : `${DATA.entries.length} link-posts from the last ${DATA.lookbackDays || 120} days`;

  if (!list.length) {
    entriesEl.innerHTML = "";
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "nothing matches these filters.";
    entriesEl.appendChild(d);
    return;
  }
  if (dense) {
    if (grouping) renderTableGrouped(list);
    else renderTableFlat(list);
  } else {
    if (grouping) renderGrouped(list);
    else renderFlat(list);
  }
}

function buildShareText() {
  const s = DATA.subject;
  return (
    `the simcluster atlas, centered on ${short(s.handle)}: ${DATA.counts.pool} moots + self, ` +
    `${DATA.entries.length} links dropped in the last ${DATA.lookbackDays || 120} days across ` +
    `${DATA.domains.length} domains. ${SITE_URL}`
  );
}

async function main() {
  msg.textContent = "loading the precomputed atlas…";
  let res;
  try {
    res = await fetch("./atlas-data.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch (err) {
    msg.className = "msg err";
    msg.textContent = "couldn't load the atlas data — try refreshing.";
    return;
  }

  posterByHandle = new Map(DATA.posters.map((p) => [p.handle, p]));

  const s = DATA.subject;
  const genDate = DATA.generatedAt ? new Date(DATA.generatedAt).toLocaleDateString() : "unknown";
  stats.innerHTML =
    `<b>simcluster</b> for <span class="who">${short(s.handle)}</span>: ` +
    `${DATA.counts.pool} ${esc(DATA.clusterKind)} + self, all ${DATA.counts.scanned} scanned. ` +
    `<b>${DATA.entries.length}</b> link-posts from the last ${DATA.lookbackDays || 120} days across ` +
    `<b>${DATA.domains.length}</b> domains and <b>${DATA.posters.length}</b> posters. ` +
    `atlas generated ${genDate}.`;

  updateChosenCounts();
  renderDomainChips();
  renderPosterChips();
  renderEntries();
  shareBtn.href = composeUrl(buildShareText());

  msg.className = "msg ok";
  msg.textContent = `atlas loaded — mapping ${short(s.handle)}'s simcluster.`;
  atlas.classList.add("on");

  domainSearch.addEventListener("input", renderDomainChips);
  posterSearch.addEventListener("input", renderPosterChips);
  textSearch.addEventListener("input", renderEntries);
  minShared.addEventListener("change", renderEntries);
  sortBy.addEventListener("change", renderEntries);
  viewMode.addEventListener("change", renderEntries);
  groupToggle.addEventListener("change", renderEntries);
  clearFiltersBtn.addEventListener("click", () => {
    activeDomains.clear();
    activePosters.clear();
    domainSearch.value = "";
    posterSearch.value = "";
    textSearch.value = "";
    minShared.value = "1";
    updateChosenCounts();
    renderDomainChips();
    renderPosterChips();
    renderEntries();
  });
}

main();
