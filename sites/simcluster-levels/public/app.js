import { buildCluster } from "./lib/cluster.js";
import { buildLevels, fieldNotes, colorFor, TITLES } from "./lib/levels.js";

const $ = (id) => document.getElementById(id);
const els = {
  form: $("searchForm"),
  input: $("handleInput"),
  genBtn: $("genBtn"),
  status: $("status"),
  resultWrap: $("resultWrap"),
  bAv: $("bAv"), bDn: $("bDn"), bHn: $("bHn"), bLvl: $("bLvl"), bTitle: $("bTitle"),
  sReviews: $("sReviews"), sPanics: $("sPanics"), sNoms: $("sNoms"),
  fnText: $("fnText"),
  hist: $("hist"), histCount: $("histCount"),
  rosterNote: $("rosterNote"), roster: $("roster"),
  prLine: $("prLine"), prBtn: $("prBtn"), prCount: $("prCount"),
  shareRow: $("shareRow"), shareBluesky: $("shareBluesky"),
  shareDownload: $("shareDownload"), shareNative: $("shareNative"),
  canvas: $("cardCanvas"),
};

const MONO = "ui-monospace, monospace";
const short = (h) => "@" + String(h || "").replace(/\.bsky\.social$/, "");
const initials = (p) =>
  (p.displayName || p.handle || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
const TINTS = ["#1a5fd0", "#1f8a4c", "#d81e6a", "#e0a400", "#8e44ad", "#c0392b", "#0f9b9b", "#e2711d"];
function tintFor(did) {
  let h = 0;
  for (const c of did || "x") h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return TINTS[h % TINTS.length];
}
function setAvatar(el, p) {
  if (p.avatar) {
    el.style.backgroundImage = `url("${p.avatar}")`;
    el.textContent = "";
  } else {
    el.style.backgroundImage = "none";
    el.style.background = tintFor(p.did);
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.color = "#fff";
    el.style.fontWeight = "700";
    el.textContent = initials(p);
  }
}

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

let lastReport = null;
let lastHandle = "";
let lastShareText = "";

// ── pre-review of the pre-review: escalating bureaucratic absurdity ──────
const PRE_REVIEW_LINES = [
  "reviewing the draft of the pre-review outline.",
  "scheduling a sync to align on the pre-review's tone before drafting.",
  "circulating the pre-review draft for pre-review feedback.",
  "the pre-review has been sent back for a pre-review of its structure.",
  "opening a doc to pre-review the feedback on the pre-review.",
  "a stakeholder has requested a pre-pre-review to de-risk the pre-review.",
  "the pre-review of the pre-review is now itself under review.",
  "escalating: nobody can agree who owns the pre-review of the pre-review.",
  "the original review has been indefinitely postponed pending pre-review consensus.",
  "congratulations — you have achieved full bureaucratic recursion. nothing was built.",
];
let prClicks = 0;
els.prBtn.addEventListener("click", () => {
  const line = PRE_REVIEW_LINES[Math.min(prClicks, PRE_REVIEW_LINES.length - 1)];
  els.prLine.textContent = line;
  prClicks++;
  els.prCount.textContent = `pre-review depth: ${prClicks}`;
});

// ── rendering ──────────────────────────────────────────────────────────
function renderBadge(handle, report) {
  const { self } = report;
  setAvatar(els.bAv, self);
  els.bDn.textContent = self.displayName || self.handle;
  els.bHn.textContent = short(self.handle);
  els.bLvl.textContent = "S" + self.level;
  els.bLvl.style.background = colorFor(self.level);
  els.bTitle.textContent = TITLES[self.level];

  els.sReviews.textContent = report.stats.docReviews.toLocaleString();
  els.sPanics.textContent = report.stats.coffeePotPanics.toLocaleString();
  els.sNoms.textContent = report.stats.selfNominations.toLocaleString();

  els.fnText.textContent = fieldNotes(short(handle).replace(/^@/, ""), report);
}

function renderHistogram(report) {
  els.hist.innerHTML = "";
  const max = Math.max(1, ...report.histogram.slice(1));
  const myLevel = report.self.level;
  for (let lvl = 1; lvl <= 10; lvl++) {
    const count = report.histogram[lvl] || 0;
    const col = document.createElement("div");
    col.className = "col";
    const bar = document.createElement("div");
    bar.className = "bar" + (lvl === myLevel ? " you" : "");
    bar.style.background = colorFor(lvl);
    bar.style.height = Math.max(3, Math.round((count / max) * 76)) + "px";
    bar.title = `S${lvl}: ${count}`;
    const lab = document.createElement("div");
    lab.className = "lab";
    lab.textContent = "S" + lvl;
    col.append(bar, lab);
    els.hist.appendChild(col);
  }
  const total = report.counts.pool + 1;
  els.histCount.textContent = total.toLocaleString();
}

function renderRoster(report) {
  els.roster.innerHTML = "";
  const myLevel = report.self.level;
  const outrankers = report.roster.filter((p) => p.level > myLevel).length;
  els.rosterNote.textContent = outrankers
    ? `· ${outrankers} mutual${outrankers === 1 ? "" : "s"} currently outrank you`
    : "· you are, for now, the most senior person in your own cluster";

  for (const p of report.roster.slice(0, 60)) {
    const row = document.createElement("div");
    row.className = "rrow" + (p.level > myLevel ? " outrank" : "");
    const av = document.createElement("div");
    av.className = "av";
    setAvatar(av, p);
    const hn = document.createElement("div");
    hn.className = "hn";
    hn.textContent = short(p.handle);
    hn.title = TITLES[p.level];
    const lvl = document.createElement("div");
    lvl.className = "lvl";
    lvl.style.background = colorFor(p.level);
    lvl.textContent = "S" + p.level;
    row.append(av, hn, lvl);
    if (p.level > myLevel) {
      const flag = document.createElement("div");
      flag.className = "flag";
      flag.textContent = "outranks you";
      row.appendChild(flag);
    }
    els.roster.appendChild(row);
  }
}

// ── share card (canvas) ───────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function drawCard(canvas, handle, report) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const { self } = report;
  const accent = colorFor(self.level);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W, 0, 0, W, 0, W * 0.7);
  g.addColorStop(0, "rgba(217,115,26,0.14)");
  g.addColorStop(1, "rgba(217,115,26,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // badge card
  const cx = 60, cy = 60, cw = W - 120, ch = H - 220;
  ctx.fillStyle = "#fffdf7";
  roundRect(ctx, cx, cy, cw, ch, 22);
  ctx.fill();
  ctx.strokeStyle = "#d8cfb8";
  ctx.lineWidth = 2;
  roundRect(ctx, cx, cy, cw, ch, 22);
  ctx.stroke();

  // kicker
  ctx.textAlign = "left";
  ctx.fillStyle = "#d9731a";
  ctx.font = `700 22px ${MONO}`;
  ctx.fillText("S-NUMBER LEVELING REVIEW", cx + 40, cy + 60);

  // handle
  ctx.fillStyle = "#1c1a14";
  ctx.font = `800 40px ${MONO}`;
  ctx.fillText("@" + handle, cx + 40, cy + 130);
  ctx.fillStyle = "#6b6455";
  ctx.font = `400 20px ${MONO}`;
  ctx.fillText(TITLES[self.level], cx + 40, cy + 165);

  // big S badge
  const bx = cx + cw - 260, by = cy + 55, bw = 200, bh = 130;
  ctx.fillStyle = accent;
  roundRect(ctx, bx, by, bw, bh, 18);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#1c1a14";
  ctx.font = `800 74px ${MONO}`;
  ctx.fillText("S" + self.level, bx + bw / 2, by + 90);

  // stat row
  const stats = [
    [report.stats.docReviews, "doc reviews"],
    [report.stats.coffeePotPanics, "panics"],
    [report.stats.selfNominations, "self-noms"],
  ];
  const sy = cy + 230;
  const sw = cw / 3;
  stats.forEach(([n, label], i) => {
    const sx = cx + sw * i + sw / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = "#1a2b4a";
    ctx.font = `800 34px ${MONO}`;
    ctx.fillText(String(n), sx, sy);
    ctx.fillStyle = "#6b6455";
    ctx.font = `400 15px ${MONO}`;
    ctx.fillText(label, sx, sy + 26);
  });

  // histogram
  const hy0 = cy + ch - 90, hh = 70, hx0 = cx + 40, hw = (cw - 80) / 10;
  const max = Math.max(1, ...report.histogram.slice(1));
  for (let lvl = 1; lvl <= 10; lvl++) {
    const count = report.histogram[lvl] || 0;
    const barH = Math.max(3, (count / max) * hh);
    ctx.fillStyle = colorFor(lvl);
    ctx.fillRect(hx0 + (lvl - 1) * hw + 4, hy0 + hh - barH, hw - 8, barH);
    if (lvl === self.level) {
      ctx.strokeStyle = "#1a2b4a";
      ctx.lineWidth = 3;
      ctx.strokeRect(hx0 + (lvl - 1) * hw + 4, hy0 + hh - barH, hw - 8, barH);
    }
  }

  // footer
  ctx.textAlign = "center";
  ctx.fillStyle = "#6b6455";
  ctx.font = `400 18px ${MONO}`;
  ctx.fillText("simcluster-levels.bisks.net", W / 2, H - 40);
}

function buildShareText(handle, report) {
  const url = `https://simcluster-levels.bisks.net/s/${encodeURIComponent(handle)}`;
  return `@${handle} is S${report.self.level} — ${TITLES[report.self.level]} — in the SimCluster. ${report.stats.docReviews} doc reviews logged, ${report.stats.coffeePotPanics} coffee pot panics pending. ${url}`;
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

els.shareDownload.addEventListener("click", () => {
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `simcluster-levels-${(lastHandle || "badge").replace(/[^a-z0-9.-]/gi, "_")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "simcluster-levels.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "simcluster levels" });
      } catch {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

// ── main flow ──────────────────────────────────────────────────────────
async function generate(rawHandle) {
  const handle = (rawHandle || "").trim().replace(/^@/, "");
  if (!handle) { setStatus("enter a handle first.", true); return; }

  els.genBtn.disabled = true;
  els.resultWrap.classList.remove("show");
  els.shareRow.style.display = "none";
  prClicks = 0;
  els.prLine.textContent = "click below to pre-review your pre-review.";
  els.prCount.textContent = "";
  setStatus(`resolving @${handle}...`);

  try {
    const cluster = await buildCluster(handle, { onStep: (s) => setStatus(s) });
    if (cluster.pool.length < 3) {
      setStatus(`${short(cluster.handle)} only has ${cluster.pool.length} moots — need at least 3 to rank a leveling scale. try someone with more mutuals.`, true);
      return;
    }
    const report = buildLevels(cluster);
    lastReport = report;
    lastHandle = cluster.handle;

    renderBadge(cluster.handle, report);
    renderHistogram(report);
    renderRoster(report);
    els.resultWrap.classList.add("show");

    lastShareText = buildShareText(cluster.handle, report);
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
    drawCard(els.canvas, cluster.handle, report);
    els.shareRow.style.display = "flex";

    setStatus(`review filed for ${short(cluster.handle)} — ranked against ${cluster.counts.pool} ${cluster.kind}.`);
  } catch (err) {
    setStatus("couldn't file that review: " + (err.message || "try again") + ".", true);
  } finally {
    els.genBtn.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  generate(els.input.value);
});

// /s/<handle> (current share links) or the older ?h=<handle> — either way,
// land on the same handle the personalized OG card was generated for.
const pathHandle = (location.pathname.match(/^\/s\/([^/]+)\/?$/) || [])[1];
const sharedHandle = new URLSearchParams(location.search).get("h") || (pathHandle && decodeURIComponent(pathHandle));
if (sharedHandle) {
  els.input.value = sharedHandle;
  generate(sharedHandle);
} else {
  els.input.value = "norvid-studies.bsky.social";
  generate("norvid-studies.bsky.social");
}
