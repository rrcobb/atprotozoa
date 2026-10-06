import { WORKS, KINDS, TIMELINE } from "./works.js";
import { randomAddress, parseAddress, addressString, pageLines } from "./babel.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- works list ----
let kind = "all";
let query = "";
function renderWorks() {
  const q = query.trim().toLowerCase();
  const rows = WORKS.filter((w) => (kind === "all" || w.kind === kind) &&
    (!q || (w.t + " " + (w.n || "") + " " + w.y).toLowerCase().includes(q)));
  $("works-count").textContent = `${rows.length} of ${WORKS.length}`;
  $("works-body").innerHTML = rows.length
    ? rows.map((w) => `<tr><td class="yr">${w.y}</td><td><em>${esc(w.t)}</em><span class="k k-${w.kind}">${w.kind}</span>` +
        (w.n ? `<div class="note">${esc(w.n)}</div>` : "") + `</td></tr>`).join("")
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
  renderWorks();
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
initTimeline();
initBabel();
initShare();
