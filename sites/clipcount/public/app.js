import {
  parseCount, breakdown, physical, fmtCount, fmtHTML, fmtLog, compare,
  VOLUME_REFS, MASS_REFS, LENGTH_REFS, TIERS, log10Big, countFromLog,
} from "./lib/clips.js";

const $ = (id) => document.getElementById(id);
const input = $("count"), slider = $("slider"), chess = $("chess");

// Icons are drawn in SVG, sized so each tier is visibly bigger than the last.
const CLIP = "M4 22V6a4 4 0 0 1 8 0V24a4.5 4.5 0 0 1-9 0V10a2.5 2.5 0 0 1 5 0V20";
const svg = (w, h, body, label) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${body}</svg>`;
const ICONS = {
  clip: () => svg(16, 30, `<path d="${CLIP}" transform="scale(1.1) translate(.5 .5)" fill="none" stroke="#b9c3cf" stroke-width="1.5" stroke-linecap="round"/>`, "paperclip"),
  box: () => svg(40, 30, `<rect x="2" y="8" width="36" height="20" rx="2" fill="#2e6fb5"/><rect x="2" y="8" width="36" height="6" fill="#3f86d1"/><text x="20" y="24" font-size="9" fill="#fff" text-anchor="middle" font-family="monospace">100</text>`, "box of 100 paperclips"),
  carton: () => svg(56, 46, `<rect x="2" y="10" width="52" height="34" fill="#b98b52"/><rect x="2" y="10" width="52" height="9" fill="#cfa166"/><rect x="24" y="10" width="8" height="9" fill="#e6d3b0"/>`, "carton"),
  crate: () => svg(74, 66, `<rect x="2" y="8" width="70" height="56" fill="#a87b45"/><rect x="2" y="8" width="70" height="14" fill="#c4965d"/><rect x="31" y="8" width="12" height="14" fill="#e6d3b0"/><rect x="48" y="34" width="18" height="12" fill="#f3efe6"/>`, "shipping box"),
  pallet: () => {
    let b = `<rect x="2" y="86" width="116" height="10" fill="#8a6a3d"/><rect x="2" y="80" width="116" height="6" fill="#a98450"/>`;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
      b += `<rect x="${4 + c * 38}" y="${42 + r * 12 - 0 + 0}" width="36" height="12" fill="${(r + c) % 2 ? "#a87b45" : "#c4965d"}" stroke="#7a5a30"/>`;
    for (let c = 0; c < 3; c++) b += `<rect x="${4 + c * 38}" y="${6 + 0}" width="36" height="36" fill="${c % 2 ? "#c4965d" : "#a87b45"}" stroke="#7a5a30"/>`;
    return svg(120, 98, b.replace(/y="42"/g, 'y="42"'), "pallet of shipping boxes");
  },
  container: (hue = 0) => {
    const cols = ["#c0392b", "#2e6fb5", "#e0a526", "#2f9d6b"];
    const col = cols[hue % cols.length];
    let ribs = "";
    for (let x = 12; x < 150; x += 8) ribs += `<rect x="${x}" y="8" width="2" height="42" fill="rgba(0,0,0,.22)"/>`;
    return svg(160, 58, `<rect x="2" y="6" width="156" height="46" fill="${col}"/>${ribs}<rect x="2" y="6" width="156" height="3" fill="rgba(255,255,255,.25)"/>`, "shipping container");
  },
  ship: () => {
    let st = "";
    const cols = ["#c0392b", "#2e6fb5", "#e0a526", "#2f9d6b", "#8e5bd0"];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 22; c++)
      st += `<rect x="${24 + c * 11}" y="${24 + r * 10}" width="10" height="9" fill="${cols[(c * 3 + r * 7) % 5]}"/>`;
    return svg(300, 110, `${st}<rect x="262" y="8" width="26" height="40" fill="#e8ebee"/><rect x="266" y="14" width="18" height="5" fill="#3a4550"/><polygon points="2,74 298,74 280,104 22,104" fill="#1f2d3a"/><rect x="2" y="74" width="296" height="6" fill="#c0392b"/>`, "container ship");
  },
};

// Icons per row are bounded by screen space only; the real count is always in
// the row header. Bigger containers get fewer slots because they're bigger.
const SLOTS = { clip: 40, box: 24, carton: 16, crate: 10, pallet: 6, container: 8, ship: 3 };

function render(count, pushUrl = true) {
  const rows = $("rows");
  rows.innerHTML = "";
  $("err").textContent = "";
  $("big").innerHTML = fmtHTML(fmtCount(count)) + (count === 1n ? " paperclip" : " paperclips");
  if (count === 0n) {
    $("summary").textContent = "nothing. a pristine void. enjoy it.";
    $("factspanel").hidden = true;
    sync(count, pushUrl);
    return;
  }
  const parts = breakdown(count);
  $("summary").innerHTML = "= " + parts.map((p) =>
    `${fmtHTML(fmtCount(p.n))} ${p.n === 1n ? p.tier.name : p.tier.plural}`).join(" + ");
  for (const { tier, n } of parts) {
    const slots = SLOTS[tier.id];
    const shown = n > BigInt(slots) ? slots : Number(n);
    let icons = "";
    for (let i = 0; i < shown; i++) icons += tier.id === "container" ? ICONS.container(i) : ICONS[tier.id]();
    const more = n > BigInt(slots) ? `<span class="more">+ ${fmtHTML(fmtCount(n - BigInt(slots)))} more</span>` : "";
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div class="rowhead"><b>${fmtHTML(fmtCount(n))} × ${n === 1n ? tier.name : tier.plural}</b><span>${tier.dims} · ${fmtHTML(fmtCount(tier.size))} clip${tier.size === 1n ? "" : "s"} each</span></div><div class="icons">${icons}${more}</div>`;
    rows.appendChild(row);
  }
  const p = physical(count);
  const fact = (k, v, c) => `<div class="fact"><div class="k">${k}</div><div class="v">${fmtHTML(v)}</div><div class="c">${fmtHTML(c)}</div></div>`;
  $("facts").innerHTML =
    fact("packed volume", volText(p.logVolM3), cmp(p.logVolM3, VOLUME_REFS)) +
    fact("mass", massText(p.logMassKg), cmp(p.logMassKg, MASS_REFS)) +
    fact("laid end to end", lenText(p.logLenM), cmp(p.logLenM, LENGTH_REFS));
  $("factspanel").hidden = false;
  sync(count, pushUrl);
}

function volText(l) { return l < 0 ? `${fmtLog(l + 6)} cm³` : `${fmtLog(l)} m³`; }
function massText(l) {
  if (l < 0) return `${fmtLog(l + 3)} g`;
  if (l < 3) return `${fmtLog(l)} kg`;
  return `${fmtLog(l - 3)} tonnes`;
}
function lenText(l) {
  if (l < 0) return `${fmtLog(l + 3)} mm`;
  if (l < 3) return `${fmtLog(l)} m`;
  if (l < 17) return `${fmtLog(l - 3)} km`;
  return `${fmtLog(l - 15.976)} light-years`; // 1 ly = 9.461e15 m
}
function cmp(l, refs) {
  const c = compare(l, refs);
  if (c.ratioLog < -0.3) return `about ${fmtShare(c.ratioLog)} of ${c.name}`;
  if (c.ratioLog < 0.18) return `about as much as ${c.name}`;
  return `about ${fmtLog(c.ratioLog, 2)}× ${c.name}`;
}
// ratioLog < 0 here: how much of the reference we fill, as a percentage
function fmtShare(rl) { return rl > -6 ? (10 ** rl * 100).toPrecision(2) + "%" : "10^" + rl.toFixed(0) + "×"; }

function sync(count, pushUrl) {
  const l = count === 0n ? 0 : log10Big(count);
  if (document.activeElement !== slider) slider.value = String(Math.min(60, l));
  const text = `${fmtCount(count)} paperclips, as ${breakdown(count).slice(0, 1).map((p) => `${fmtCount(p.n)} ${p.n === 1n ? p.tier.name : p.tier.plural}`)[0] || "nothing"}`;
  const url = `https://clipcount.bisks.net/?n=${encodeURIComponent(count.toString().length > 40 ? "1e" + (count.toString().length - 1) : count.toString())}`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + "\n" + url);
  $("copy").dataset.url = url;
  if (pushUrl) history.replaceState(null, "", url.replace("https://clipcount.bisks.net", ""));
}

function submit() {
  const n = parseCount(input.value);
  if (n === null) { $("err").textContent = "that doesn't look like a count. try 5000, 3 billion, 1e12 or 2^64."; return; }
  render(n);
}
$("form").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
slider.addEventListener("input", () => {
  const n = countFromLog(Number(slider.value));
  input.value = fmtCount(n).includes("×") ? n.toString() : fmtCount(n);
  render(n);
});
chess.addEventListener("input", () => {
  const k = Number(chess.value);
  $("sqlabel").textContent = "square " + k;
  const n = 2n ** BigInt(k - 1);
  input.value = n.toString();
  render(n);
});
$("copy").addEventListener("click", async (e) => {
  e.preventDefault();
  try { await navigator.clipboard.writeText($("copy").dataset.url); $("copy").textContent = "copied!"; }
  catch { $("copy").textContent = $("copy").dataset.url; }
  setTimeout(() => { $("copy").textContent = "copy link"; }, 1800);
});

const PRESETS = [
  ["a desk drawer", "40"], ["a box", "100"], ["a stationery cupboard", "12000"],
  ["a million", "1000000"], ["a container", "75000000"], ["a trillion", "1e12"],
  ["a container ship", "1.5e12"], ["chessboard, all 64 squares", "2^64-1"], ["a googol", "googol"],
];
for (const [label, val] of PRESETS) {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = label;
  b.addEventListener("click", () => { input.value = val; submit(); });
  $("presets").appendChild(b);
}

const q = new URLSearchParams(location.search).get("n");
if (q) input.value = q;
submit();
