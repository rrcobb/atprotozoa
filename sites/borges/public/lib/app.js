import { WORKS, KINDS, TIMELINE } from "./works.js";
import { PIECES, PIECE_KINDS, COLLECTIONS } from "./pieces.js";
import { randomAddress, parseAddress, addressString, pageLines } from "./babel.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- works list ----
const hasPieces = new Set(PIECES.flatMap((p) => p.in));
let kind = "all";
let query = "";
function renderWorks() {
  const q = query.trim().toLowerCase();
  const rows = WORKS.filter((w) => (kind === "all" || w.kind === kind) &&
    (!q || (w.t + " " + (w.n || "") + " " + w.y).toLowerCase().includes(q)));
  $("works-count").textContent = `${rows.length} of ${WORKS.length}`;
  $("works-body").innerHTML = rows.length
    ? rows.map((w) => `<tr><td class="yr">${w.y}</td><td><em>${esc(w.t)}</em><span class="k k-${w.kind}">${w.kind}</span>` +
        (w.n ? `<div class="note">${esc(w.n)}</div>` : "") +
        (hasPieces.has(w.t) ? `<button type="button" class="tag-coll" data-coll="${esc(w.t)}">see its pieces →</button>` : "") + `</td></tr>`).join("")
    : `<tr><td colspan="2" class="note">nothing on the shelf matches that.</td></tr>`;
}
function initWorks() {
  $("works-filters").innerHTML = KINDS.map(([k, label]) =>
    `<button type="button" data-k="${k}" class="chip${k === kind ? " on" : ""}">${label}</button>`).join("");
  $("works-filters").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]");
    if (!b) return;
    kind = b.dataset.k;
    for (const c of $("works-filters").children) c.classList.toggle("on", c === b);
    renderWorks();
  });
  $("works-q").addEventListener("input", (e) => { query = e.target.value; renderWorks(); });
  $("works-body").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-coll]");
    if (b) showPiecesIn(b.dataset.coll);
  });
  renderWorks();
}

// ---- every individual piece ----
// 25 a page is a reading-length choice for a list of ~125 rows, not a limit on
// the data: every piece is reachable by paging, A-Z jump, search or "show all".
const PAGE = 25;
const ps = { kind: "all", q: "", coll: "", sort: "year", page: 0, all: false };
const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const initial = (p) => (norm(p.t.replace(/^(el|la|los|las|un|una)\s+/i, ""))[0] || "#").toUpperCase();

function filteredPieces() {
  const q = norm(ps.q.trim());
  const rows = PIECES.filter((p) => (ps.kind === "all" || p.kind === ps.kind) &&
    (!ps.coll || p.in.includes(ps.coll)) &&
    (!q || norm(p.t + " " + p.en + " " + p.y + " " + p.in.join(" ")).includes(q)));
  rows.sort(ps.sort === "title"
    ? (a, b) => norm(a.t).localeCompare(norm(b.t))
    : (a, b) => a.y - b.y || norm(a.t).localeCompare(norm(b.t)));
  return rows;
}
function renderPieces() {
  const rows = filteredPieces();
  const pages = ps.all ? 1 : Math.max(1, Math.ceil(rows.length / PAGE));
  ps.page = Math.min(ps.page, pages - 1);
  const shown = ps.all ? rows : rows.slice(ps.page * PAGE, ps.page * PAGE + PAGE);
  $("pieces-count").textContent = `${rows.length} of ${PIECES.length} pieces` + (ps.coll ? ` in ${ps.coll}` : "");
  $("pieces-body").innerHTML = shown.length
    ? shown.map((p) => `<tr><td class="yr">${p.y}</td><td><em>${esc(p.t)}</em><span class="k">${p.kind}</span>` +
        (p.en ? `<div class="note">${esc(p.en)}</div>` : "") +
        `<div>${p.in.map((c) => `<button type="button" class="tag-coll" data-coll="${esc(c)}">${esc(c)}</button>`).join("")}</div></td></tr>`).join("")
    : `<tr><td colspan="2" class="note">nothing on the shelf matches that.</td></tr>`;
  $("pg-info").textContent = ps.all ? "all shown" : `page ${ps.page + 1} of ${pages}`;
  $("pg-prev").disabled = ps.all || ps.page === 0;
  $("pg-next").disabled = ps.all || ps.page >= pages - 1;
  $("pg-all").textContent = ps.all ? "paginate" : "show all";
  $("pieces-pager").hidden = rows.length <= PAGE && !ps.all;
  // A-Z strip: letters that have entries under the current filters are live.
  const az = $("pieces-az");
  az.hidden = ps.sort !== "title";
  if (!az.hidden) {
    const have = new Set(rows.map(initial));
    const letters = [...new Set(PIECES.map(initial))].sort();
    az.innerHTML = letters.map((l) => `<button type="button" class="chip${have.has(l) ? "" : " dim"}" data-l="${l}"${have.has(l) ? "" : " disabled"}>${l}</button>`).join("");
  }
}
function showPiecesIn(coll) {
  setView("pieces");
  ps.coll = coll; ps.page = 0; ps.q = ""; ps.kind = "all";
  $("pieces-coll").value = coll; $("pieces-q").value = "";
  syncKindChips();
  renderPieces();
  $("works-view").scrollIntoView({ behavior: "smooth", block: "start" });
}
function syncKindChips() {
  for (const c of $("pieces-kinds").children) c.classList.toggle("on", c.dataset.k === ps.kind);
}
function setView(v) {
  $("books-pane").hidden = v !== "books";
  $("pieces-pane").hidden = v !== "pieces";
  for (const c of $("works-view").children) c.classList.toggle("on", c.dataset.v === v);
}
function initPieces() {
  $("works-view").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (b) setView(b.dataset.v);
  });
  $("pieces-kinds").innerHTML = PIECE_KINDS.map(([k, label]) =>
    `<button type="button" data-k="${k}" class="chip${k === ps.kind ? " on" : ""}">${label}</button>`).join("");
  $("pieces-kinds").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]");
    if (!b) return;
    ps.kind = b.dataset.k; ps.page = 0; syncKindChips(); renderPieces();
  });
  $("pieces-coll").innerHTML = `<option value="">any collection</option>` +
    COLLECTIONS.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("pieces-coll").addEventListener("change", (e) => { ps.coll = e.target.value; ps.page = 0; renderPieces(); });
  $("pieces-sort").addEventListener("change", (e) => { ps.sort = e.target.value; ps.page = 0; renderPieces(); });
  $("pieces-q").addEventListener("input", (e) => { ps.q = e.target.value; ps.page = 0; renderPieces(); });
  $("pieces-body").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-coll]");
    if (!b) return;
    ps.coll = b.dataset.coll; ps.page = 0; $("pieces-coll").value = ps.coll; renderPieces();
  });
  $("pg-prev").addEventListener("click", () => { ps.page--; renderPieces(); });
  $("pg-next").addEventListener("click", () => { ps.page++; renderPieces(); });
  $("pg-all").addEventListener("click", () => { ps.all = !ps.all; ps.page = 0; renderPieces(); });
  $("pieces-az").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-l]");
    if (!b || b.disabled) return;
    const idx = filteredPieces().findIndex((p) => initial(p) === b.dataset.l);
    if (idx < 0) return;
    if (ps.all) {
      renderPieces();
    } else {
      ps.page = Math.floor(idx / PAGE);
      renderPieces();
    }
    const row = [...$("pieces-body").rows].find((r) => initial({ t: r.cells[1].querySelector("em").textContent }) === b.dataset.l);
    if (row) row.scrollIntoView({ block: "center" });
  });
  renderPieces();
}

// ---- timeline ----
function initTimeline() {
  $("timeline").innerHTML = TIMELINE.map(([d, t]) => `<li><b>${esc(d)}</b> ${esc(t)}</li>`).join("");
}

// ---- babel ----
function showAddress(addr) {
  location.hash = "babel=" + addressString(addr);
  $("babel-addr").value = addressString(addr);
  $("babel-page").textContent = pageLines(addr).join("\n");
  $("babel-err").hidden = true;
}
function initBabel() {
  $("babel-next").addEventListener("click", () => showAddress(randomAddress()));
  $("babel-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const a = parseAddress($("babel-addr").value);
    if (!a) {
      $("babel-err").hidden = false;
      $("babel-err").textContent = "an address is hex.wall(1-4).shelf(1-5).book(1-32).page(1-410), e.g. 4k2x9.2.3.17.101";
      return;
    }
    showAddress(a);
  });
  const m = /^#babel=(.+)$/.exec(location.hash);
  showAddress((m && parseAddress(decodeURIComponent(m[1]))) || randomAddress());
}

function initShare() {
  const text = "borges.bisks.net — a reference page on Borges, and a note on librarians as knowledge nodes";
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

initWorks();
initPieces();
initTimeline();
initBabel();
initShare();
