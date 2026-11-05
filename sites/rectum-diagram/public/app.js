// Senate hemicycle toy, examined by goose colonoscopy. Seats are [state, party] pairs; clicking cycles D -> R -> I.
// A goose-tipped scope travels the seats in order; seats whose party differs from the loaded preset are "polyps".
const REGIONS = {
  "New England": ["CT", "ME", "MA", "NH", "RI", "VT"],
  "Mid-Atlantic": ["NJ", "NY", "PA", "DE", "MD"],
  "South": ["VA", "WV", "NC", "SC", "GA", "FL", "AL", "MS", "TN", "KY", "AR", "LA", "TX", "OK"],
  "Midwest": ["OH", "MI", "IN", "IL", "WI", "MN", "IA", "MO", "KS", "NE", "SD", "ND"],
  "Mountain West": ["MT", "ID", "WY", "NV", "UT", "CO", "AZ", "NM"],
  "Pacific": ["WA", "OR", "CA", "AK", "HI"],
};
// 119th Congress as seated January 2025: [first seat, second seat]
const BASE = {
  AL:"RR", AK:"RR", AZ:"DD", AR:"RR", CA:"DD", CO:"DD", CT:"DD", DE:"DD", FL:"RR", GA:"DD",
  HI:"DD", ID:"RR", IL:"DD", IN:"RR", IA:"RR", KS:"RR", KY:"RR", LA:"RR", ME:"RI", MD:"DD",
  MA:"DD", MI:"DD", MN:"DD", MS:"RR", MO:"RR", MT:"RR", NE:"RR", NV:"DD", NH:"DD", NJ:"DD",
  NM:"DD", NY:"DD", NC:"RR", ND:"RR", OH:"RR", OK:"RR", OR:"DD", PA:"DR", RI:"DD", SC:"RR",
  SD:"RR", TN:"RR", TX:"RR", UT:"RR", VT:"DI", VA:"DD", WA:"DD", WV:"RR", WI:"DR", WY:"RR",
};
const PRESETS = {
  119: () => structuredClone(BASE),
  // Headline premise: New England has no Republican senators. Only Maine's R seat changes.
  ne: () => ({ ...structuredClone(BASE), ME: "DI" }),
};
const COLORS = { D: "var(--d)", R: "var(--r)", I: "var(--i)" };
const NEXT = { D: "R", R: "I", I: "D" };
const STATE_ORDER = Object.values(REGIONS).flat();
const REGION_OF = {};
for (const [r, ss] of Object.entries(REGIONS)) for (const s of ss) REGION_OF[s] = r;

// Rows of 12/16/20/24/28 = 100 seats, laid out left to right by angle.
const ROWS = [12, 16, 20, 24, 28];
const CX = 400, CY = 380;
const seatsGeom = [];
ROWS.forEach((n, ri) => {
  const rad = 130 + ri * 46;
  for (let k = 0; k < n; k++) {
    const a = Math.PI - (Math.PI * (k + 0.5)) / n;
    seatsGeom.push({ a, x: CX + rad * Math.cos(a), y: CY - rad * Math.sin(a), rad });
  }
});
seatsGeom.sort((p, q) => q.a - p.a || p.rad - q.rad);

let seats = []; // [{state, party}] in state order
let sortMode = "party";
let spot = "";
let depth = 0; // seats the scope has passed, 0 = scope not inserted
let timer = null;

function load(name) {
  const m = PRESETS[name]();
  seats = [];
  for (const st of STATE_ORDER) [...m[st]].forEach((p) => seats.push({ state: st, party: p, base: p }));
  draw();
}

function ordered() {
  if (sortMode === "state") return seats;
  const rank = { D: 0, I: 1, R: 2 };
  return [...seats].sort((a, b) => rank[a.party] - rank[b.party]);
}

function draw() {
  const svg = document.getElementById("chart");
  const NS = "http://www.w3.org/2000/svg";
  svg.replaceChildren();
  const seq = ordered();
  if (depth > 0) { // the scope tube, drawn under the seats
    const path = document.createElementNS(NS, "path");
    const pts = seq.slice(0, depth).map((_, i) => `${i ? "L" : "M"}${seatsGeom[i].x.toFixed(1)} ${seatsGeom[i].y.toFixed(1)}`);
    path.setAttribute("d", pts.join(" "));
    path.setAttribute("class", "tube");
    svg.append(path);
  }
  seq.forEach((seat, i) => {
    const g = seatsGeom[i];
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", g.x.toFixed(1));
    c.setAttribute("cy", g.y.toFixed(1));
    c.setAttribute("r", 15);
    c.setAttribute("fill", COLORS[seat.party]);
    const inSpot = spot && REGION_OF[seat.state] === spot;
    const unseen = depth > 0 && i >= depth;
    const polyp = depth > 0 && i < depth && seat.party !== seat.base;
    c.setAttribute("class", "seat" + (spot ? (inSpot ? " hl" : " dim") : unseen ? " dim" : "") + (polyp ? " polyp" : ""));
    const t = document.createElementNS(NS, "title");
    t.textContent = `${seat.state} — ${{ D: "Democratic", R: "Republican", I: "Independent" }[seat.party]} (click to flip)`;
    c.append(t);
    c.addEventListener("click", () => { seat.party = NEXT[seat.party]; draw(); });
    svg.append(c);
  });
  if (depth > 0) {
    const tip = document.createElementNS(NS, "text");
    tip.setAttribute("class", "goose");
    tip.setAttribute("x", seatsGeom[depth - 1].x.toFixed(1));
    tip.setAttribute("y", (seatsGeom[depth - 1].y + 9).toFixed(1));
    tip.textContent = "🪿";
    svg.append(tip);
  }
  report(seq);
  const n = { D: 0, R: 0, I: 0 };
  for (const s of seats) n[s.party]++;
  const mk = (cls, y, txt) => {
    const e = document.createElementNS(NS, "text");
    e.setAttribute("class", cls); e.setAttribute("x", CX); e.setAttribute("y", y);
    e.textContent = txt; svg.append(e);
  };
  mk("tally", 330, `${n.D + n.I} – ${n.R}`);
  mk("tally2", 354, "D+I vs R");
  document.getElementById("n-d").textContent = n.D;
  document.getElementById("n-i").textContent = n.I;
  document.getElementById("n-r").textContent = n.R;
  const rt = document.getElementById("region-tally");
  if (spot) {
    const rs = seats.filter((s) => REGION_OF[s.state] === spot);
    const c = { D: 0, R: 0, I: 0 };
    for (const s of rs) c[s.party]++;
    rt.textContent = `· ${spot}: ${c.D} D, ${c.I} I, ${c.R} R`;
  } else rt.textContent = "";
  const text = `the senate, examined by goose colonoscopy${depth ? ` (depth ${depth}/100)` : ""}: ${n.D} D, ${n.I} I, ${n.R} R${spot ? ` (${spot}: ${rs_r(spot)} R)` : ""} https://rectum-diagram.bisks.net/`;
  document.getElementById("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}
const PARTY = { D: "Democratic", R: "Republican", I: "Independent" };
// Findings for the seats the scope has passed so far.
function report(seq) {
  const el = document.getElementById("report");
  if (depth === 0) { el.textContent = "scope not inserted. drag the depth slider, or begin the exam."; return; }
  const seen = seq.slice(0, depth), cur = seen[depth - 1];
  const polyps = seen.filter((x) => x.party !== x.base);
  const lines = [`depth ${depth}/100 — ${cur.state}, ${PARTY[cur.party]}.`];
  const regionR = seats.filter((x) => REGION_OF[x.state] === REGION_OF[cur.state] && x.party === "R").length;
  if (cur.party !== cur.base) lines.push(`polyp: this seat was ${PARTY[cur.base]} at prep, now ${PARTY[cur.party]}. biopsy recommended.`);
  else if (cur.party === "R" && regionR === 1) lines.push(`foreign body: the only Republican tissue in ${REGION_OF[cur.state]}.`);
  else if (regionR === 0) lines.push(`${REGION_OF[cur.state]} looks clear of Republican tissue. mucosa pink and healthy.`);
  else lines.push("healthy mucosa. nothing to see here.");
  if (depth === 100) {
    const ne = seats.filter((x) => REGION_OF[x.state] === "New England" && x.party === "R").length;
    lines.push(`exam complete. ${polyps.length} polyp${polyps.length === 1 ? "" : "s"} found. New England: ${ne ? ne + " Republican seat" + (ne === 1 ? "" : "s") + " remain" : "no Republican seats remain"}. the goose is withdrawn. honk.`);
  }
  el.textContent = lines.join(" ");
}
function setDepth(v) {
  depth = Math.max(0, Math.min(100, v));
  document.getElementById("depth").value = depth;
  draw();
}
function stopExam() {
  clearInterval(timer); timer = null;
  document.getElementById("exam").textContent = depth === 100 ? "repeat exam" : "begin exam";
}
document.getElementById("depth").addEventListener("input", (e) => { stopExam(); setDepth(+e.target.value); });
document.getElementById("exam").addEventListener("click", () => {
  if (timer) { stopExam(); return; }
  if (depth >= 100) setDepth(0);
  document.getElementById("exam").textContent = "pause";
  timer = setInterval(() => { setDepth(depth + 1); if (depth >= 100) stopExam(); }, 80);
});
const rs_r = (r) => seats.filter((s) => REGION_OF[s.state] === r && s.party === "R").length;

const sel = document.getElementById("region");
sel.innerHTML = '<option value="">none</option>' + Object.keys(REGIONS).map((r) => `<option>${r}</option>`).join("");
sel.addEventListener("change", () => { spot = sel.value; draw(); });
for (const m of ["party", "state"]) {
  document.getElementById("sort-" + m).addEventListener("click", () => {
    sortMode = m;
    document.getElementById("sort-party").classList.toggle("on", m === "party");
    document.getElementById("sort-state").classList.toggle("on", m === "state");
    draw();
  });
}
document.getElementById("preset").addEventListener("change", (e) => { stopExam(); depth = 0; document.getElementById("depth").value = 0; load(e.target.value); });
load("119");
