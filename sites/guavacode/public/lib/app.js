import { compile, Scanner } from "./engine.js";

// Guava (Psidium guajava) 'New Age' chromosome-level assembly guava_v11.23,
// 443,755,635 bases in 44 sequences (11 chromosomes plus unplaced scaffolds).
const ASSEMBLY = "GCA_016432845.1";
const DATASETS = "https://api.ncbi.nlm.nih.gov/datasets/v2/genome/accession/";
const EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const APPVIEW = "https://public.api.bsky.app/xrpc/";

const $ = (id) => document.getElementById(id);
const els = {
  terms: $("terms"), run: $("run"), stop: $("stop"), status: $("status"), bar: $("bar"), barWrap: $("barWrap"),
  results: $("results"), body: $("tbody"), rankEnc: $("rankEnc"), rankBy: $("rankBy"), crown: $("crown"),
  handle: $("handle"), loadGraph: $("loadGraph"), graphStatus: $("graphStatus"), share: $("share"), foot: $("foot"),
};

const state = { terms: [], follows: new Map(), tally: null, total: 0, done: false, ctl: null };

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const fmtExp = (e) => (e >= 100 ? fmt(e) : e >= 0.01 ? e.toPrecision(2) : e === 0 ? "0" : e.toExponential(1));

function parseTerms() {
  const seen = new Set();
  const out = [];
  for (const line of els.terms.value.split("\n")) {
    const text = line.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ id: out.length, text });
  }
  return out;
}

// ---- NCBI -----------------------------------------------------------------

async function listSequences(signal) {
  const out = [];
  let token = "";
  do {
    const url = `${DATASETS}${ASSEMBLY}/sequence_reports?page_size=1000${token ? "&page_token=" + encodeURIComponent(token) : ""}`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`NCBI sequence list ${r.status}`);
    const j = await r.json();
    for (const s of j.reports || []) out.push({ acc: s.genbank_accession, length: s.length, name: s.chr_name });
    token = j.next_page_token || "";
  } while (token);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// efetch allows 3 requests a second without an API key; the unplaced
// scaffolds are tiny and would otherwise fire back to back and draw 429s.
const MIN_GAP_MS = 400;
let lastStart = 0;
async function pace() {
  const wait = lastStart + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastStart = Date.now();
}

// Stream one sequence through the scanner. A failure part-way restores the
// counts to how they stood before the record and starts it over.
async function scanRecord(scanner, seq, signal, onBytes) {
  const url = `${EFETCH}?db=nuccore&id=${seq.acc}&rettype=fasta`;
  const before = scanner.snapshot();
  for (let attempt = 1; ; attempt++) {
    try {
      scanner.startRecord();
      await pace();
      const r = await fetch(url, { signal });
      if (!r.ok) throw new Error(`efetch ${seq.acc} ${r.status}`);
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        scanner.feed(value);
        onBytes(value.length);
      }
    } catch (e) {
      if (signal.aborted) throw e;
      scanner.restore(before);
      if (attempt >= 5) throw e;
      setStatus(`${seq.acc}: ${e.message}, retrying (${attempt}/4)…`);
      await sleep(1500 * attempt);
    }
  }
}

// ---- run --------------------------------------------------------------------

function setStatus(msg) { els.status.textContent = msg; }

async function run() {
  const terms = parseTerms();
  if (!terms.length) { setStatus("type something to look up first."); return; }
  state.terms = terms;
  state.done = false;
  const compiled = compile(terms);
  const scanner = new Scanner(compiled);
  const ctl = new AbortController();
  state.ctl = ctl;
  els.run.disabled = true;
  els.stop.hidden = false;
  els.barWrap.hidden = false;
  els.bar.style.width = "0%";
  els.results.hidden = false;
  try {
    setStatus("asking NCBI which sequences make up the genome…");
    const seqs = await listSequences(ctl.signal);
    const genomeLen = seqs.reduce((a, s) => a + s.length, 0);
    let seen = 0;
    for (let i = 0; i < seqs.length; i++) {
      const s = seqs[i];
      await scanRecord(scanner, s, ctl.signal, (n) => {
        seen += n;
        els.bar.style.width = Math.min(100, (seen / genomeLen) * 100).toFixed(1) + "%";
      });
      const t = scanner.tally();
      state.tally = t.rows; state.total = t.total;
      render();
      setStatus(`read ${i + 1} of ${seqs.length} sequences · ${fmt(t.total)} bases so far`);
    }
    state.done = true;
    setStatus(`done: ${fmt(state.total)} bases, both strands.`);
  } catch (e) {
    setStatus(ctl.signal.aborted ? `stopped. counts so far cover ${fmt(state.total)} bases.` : `failed: ${e.message}`);
  } finally {
    els.run.disabled = false;
    els.stop.hidden = true;
    els.barWrap.hidden = true;
    render();
  }
}

// ---- table ------------------------------------------------------------------

const ENC = {
  text: "2-bit text",
  letters: "ACGT letters",
  protein: "protein",
};
const reasonFor = (info, mode) =>
  mode === "letters" ? "not spelled with only A, C, G, T" : (info.protein && info.protein.reason) || "";

function cell(row, mode) {
  const d = row.rows && row.rows[mode];
  if (!d) return { n: -1, exp: 0, html: `<td class="na" title="${reasonFor(row.info, mode)}">—</td>` };
  const n = d.plus + d.minus;
  const ratio = d.expected > 0 ? n / d.expected : 0;
  const tip = `${fmt(d.plus)} forward + ${fmt(d.minus)} reverse; random genome would give about ${fmtExp(d.expected)}`;
  const vs = d.expected > 0 && (n > 0 || d.expected >= 0.01) ? `${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(2)}× chance` : "";
  return { n, ratio, exp: d.expected, html: `<td title="${tip}"><b>${fmt(n)}</b><small>${vs}</small></td>` };
}

function render() {
  const compiled = state.terms.length ? state.terms : [];
  if (!compiled.length) return;
  const rows = state.terms.map((t) => ({
    ...t,
    info: infoFor(t),
    rows: state.tally ? state.tally.get(t.id) : null,
    follows: state.follows.get(t.text.toLowerCase()) || 0,
  }));
  const enc = els.rankEnc.value, by = els.rankBy.value;
  const key = (r) => {
    const c = cell(r, enc);
    return by === "ratio" ? (c.exp > 0.001 ? c.ratio || 0 : -1) : c.n;
  };
  rows.sort((a, b) => key(b) - key(a) || a.text.localeCompare(b.text));
  const anyFollows = rows.some((r) => r.follows);
  $("thFollows").hidden = !anyFollows;
  els.body.innerHTML = rows
    .map((r, i) => {
      const cells = ["text", "letters", "protein"].map((m) => cell(r, m).html).join("");
      const f = anyFollows ? `<td class="num">${r.follows ? "×" + r.follows : ""}</td>` : "";
      return `<tr class="${i === 0 && state.tally && key(r) > 0 ? "top" : ""}"><td class="term">${i === 0 && state.tally && key(r) > 0 ? "🏆 " : ""}${esc(r.text)}${r.info.bases ? `<small>${r.info.bases} bases</small>` : ""}</td>${f}${cells}</tr>`;
    })
    .join("");
  const top = rows[0];
  if (state.tally && top && key(top) > 0) {
    const c = cell(top, enc);
    els.crown.textContent = `${top.text}: ${fmt(c.n)} ${ENC[enc]} hits${state.done ? "" : " so far"}`;
    els.share.hidden = false;
    els.share.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText(top, c, enc));
  } else {
    els.crown.textContent = "";
    els.share.hidden = true;
  }
}

const infoCache = new Map();
function infoFor(t) {
  // per-term facts (bases, protein reason) come from compile(); cache by text
  let i = infoCache.get(t.text);
  if (!i) { i = compile([{ id: 0, text: t.text }]).info.get(0); infoCache.set(t.text, i); }
  return i;
}

function shareText(top, c, enc) {
  const verb = { text: "written as 2-bit text", letters: "spelled in ACGT", protein: "spelled in amino acids" }[enc];
  return `"${top.text}" appears ${fmt(c.n)} times in the guava genome, ${verb}, both strands. how many times is yours in there?\nhttps://guavacode.bisks.net`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- social graph names -------------------------------------------------------

// Names only: first words of display names (or the first label of a handle),
// grouped and counted. Who has which name is never shown.
async function loadGraph() {
  const handle = els.handle.value.trim().replace(/^@+/, "");
  if (!handle) { els.graphStatus.textContent = "enter a handle first."; return; }
  els.loadGraph.disabled = true;
  const counts = new Map(), shown = new Map();
  let n = 0, cursor = "";
  try {
    do {
      els.graphStatus.textContent = `reading follows… ${n}`;
      const url = `${APPVIEW}app.bsky.graph.getFollows?actor=${encodeURIComponent(handle)}&limit=100${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status === 400 ? "couldn't find that account" : `appview ${r.status}`);
      const j = await r.json();
      for (const f of j.follows || []) {
        n++;
        const raw = (f.displayName || "").trim().split(/\s+/)[0] || f.handle.split(".")[0];
        const name = raw.replace(/[^\p{L}\p{M}]/gu, "");
        if ([...name].length < 2) continue;
        const k = name.toLowerCase();
        counts.set(k, (counts.get(k) || 0) + 1);
        if (!shown.has(k)) shown.set(k, name);
      }
      cursor = j.cursor || "";
    } while (cursor);
  } catch (e) {
    els.graphStatus.textContent = `failed: ${e.message}`;
    els.loadGraph.disabled = false;
    return;
  }
  state.follows = counts;
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => shown.get(k));
  els.terms.value = names.join("\n");
  els.graphStatus.textContent = `${n} follows, ${names.length} distinct first names. hit count to scan them all in one pass.`;
  els.loadGraph.disabled = false;
}

// ---- wiring ---------------------------------------------------------------------

els.run.addEventListener("click", run);
els.stop.addEventListener("click", () => state.ctl && state.ctl.abort());
els.loadGraph.addEventListener("click", loadGraph);
els.handle.addEventListener("keydown", (e) => { if (e.key === "Enter") loadGraph(); });
els.rankEnc.addEventListener("change", render);
els.rankBy.addEventListener("change", render);
els.terms.addEventListener("input", () => state.follows.clear());
for (const b of document.querySelectorAll("[data-example]")) {
  b.addEventListener("click", () => { els.terms.value = b.dataset.example.replace(/\\n/g, "\n"); state.follows.clear(); });
}
if (window.attachHandleTypeahead) window.attachHandleTypeahead(els.handle);
