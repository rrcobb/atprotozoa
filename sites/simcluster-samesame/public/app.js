import { buildStats } from "./lib/simstats.js";

const els = {
  form: document.getElementById("searchForm"),
  input: document.getElementById("handleInput"),
  genBtn: document.getElementById("genBtn"),
  status: document.getElementById("status"),
  graphicWrap: document.getElementById("graphicWrap"),
  canvas: document.getElementById("graphic"),
  shareRow: document.getElementById("shareRow"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
};

const MONO = "ui-monospace, monospace";
let lastStats = null;
let lastShareText = "";

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function wrapCenter(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
  return lines.length * lineHeight;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Draws one bar-pair panel. `alarming` toggles the broken-axis trick and
// the color/tone palette; both panels plot the exact same two numbers.
function drawPanel(ctx, { x, y, w, h, mutualRate, oneWayRate, handle, mutuals, scanned, alarming }) {
  const pad = 40;

  if (alarming) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, "#3a0a0a");
    g.addColorStop(1, "#1a0505");
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, "#0a2420");
    g.addColorStop(1, "#0a1620");
    ctx.fillStyle = g;
  }
  roundRect(ctx, x, y, w, h, 20);
  ctx.fill();
  ctx.strokeStyle = alarming ? "#5a1a1a" : "#1a3a36";
  ctx.lineWidth = 2;
  ctx.stroke();

  // title
  ctx.textAlign = "center";
  ctx.save();
  if (alarming) {
    ctx.translate(x + w / 2, y + 70);
    ctx.rotate(-0.018);
    ctx.fillStyle = "#ff6b6b";
    ctx.font = `800 38px ${MONO}`;
    ctx.fillText(`\u{1F6A8} @${handle}'S SIMCLUSTER, EXPOSED \u{1F6A8}`, 0, 0);
    ctx.restore();
    ctx.fillStyle = "#e8a0a0";
    ctx.font = `italic 400 20px ${MONO}`;
    ctx.fillText("sources say this could be a crisis", x + w / 2, y + 105);
  } else {
    ctx.translate(x + w / 2, y + 70);
    ctx.fillStyle = "#f2e9ff";
    ctx.font = `800 34px ${MONO}`;
    ctx.fillText(`@${handle}'s simcluster, honestly`, 0, 0);
    ctx.restore();
    ctx.fillStyle = "#9adfca";
    ctx.font = `400 19px ${MONO}`;
    ctx.fillText(`mutual rate: ${mutualRate}% (${mutuals} of ${scanned} scanned)`, x + w / 2, y + 105);
  }

  // chart geometry
  const chartTop = y + 150;
  const chartBottom = y + h - 90;
  const chartH = chartBottom - chartTop;
  const barW = 170;
  const gap = 140;
  const cx = x + w / 2;
  const bar1X = cx - gap / 2 - barW; // one-way (the "scary" one)
  const bar2X = cx + gap / 2; // mutual

  let floor = 0;
  if (alarming) {
    floor = Math.max(0, Math.floor((Math.min(mutualRate, oneWayRate) - 8) / 10) * 10);
  } else {
    // honest gridlines every 25%
    ctx.strokeStyle = "rgba(242,233,255,0.12)";
    ctx.fillStyle = "rgba(242,233,255,0.35)";
    ctx.font = `400 13px ${MONO}`;
    ctx.textAlign = "right";
    for (let g = 0; g <= 100; g += 25) {
      const gy = chartBottom - (g / 100) * chartH;
      ctx.beginPath();
      ctx.moveTo(x + pad, gy);
      ctx.lineTo(x + w - pad, gy);
      ctx.stroke();
      ctx.fillText(`${g}%`, x + pad - 8, gy + 4);
    }
  }

  const barH = (v) => Math.max(4, ((v - floor) / (100 - floor)) * chartH);

  const bars = [
    { x: bar1X, v: oneWayRate, label: "doesn't follow back", color: alarming ? "#ff3b3b" : "#4ea1ff" },
    { x: bar2X, v: mutualRate, label: "follows back", color: alarming ? "#7a3a3a" : "#6ef2c9" },
  ];

  for (const b of bars) {
    const bh = barH(b.v);
    ctx.fillStyle = b.color;
    roundRect(ctx, b.x, chartBottom - bh, barW, bh, 10);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = alarming ? "#ffe0e0" : "#f2e9ff";
    ctx.font = `800 30px ${MONO}`;
    ctx.fillText(`${b.v}%`, b.x + barW / 2, chartBottom - bh - 14);

    ctx.fillStyle = alarming ? "#e8b0b0" : "#a996c4";
    ctx.font = `400 15px ${MONO}`;
    ctx.fillText(b.label, b.x + barW / 2, chartBottom + 26);
  }

  // baseline
  ctx.strokeStyle = alarming ? "#ff8a8a" : "rgba(242,233,255,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + pad, chartBottom);
  ctx.lineTo(x + w - pad, chartBottom);
  ctx.stroke();

  if (alarming) {
    // jagged "axis break" mark + fine-print disclaimer, easy to miss on purpose
    ctx.save();
    ctx.strokeStyle = "#ff8a8a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const zx = x + pad + 30, zy = chartBottom;
    ctx.moveTo(zx - 8, zy + 8);
    ctx.lineTo(zx, zy - 8);
    ctx.lineTo(zx + 8, zy + 8);
    ctx.lineTo(zx + 16, zy - 8);
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,138,138,0.55)";
    ctx.font = `400 12px ${MONO}`;
    ctx.fillText(`*y-axis starts at ${floor}%, not 0%`, x + pad, chartBottom + 26);
  }
}

function drawGraphic(canvas, stats) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const oneWayRate = Math.round((100 - stats.mutualRate) * 10) / 10;

  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, W * 0.9);
  bg.addColorStop(0, "#1a0f26");
  bg.addColorStop(1, "#0b0710");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // header strip
  ctx.textAlign = "left";
  ctx.fillStyle = "#a996c4";
  ctx.font = `700 20px ${MONO}`;
  ctx.fillText("simcluster: same graphic", 40, 50);
  ctx.textAlign = "right";
  ctx.fillStyle = "#6ef2c9";
  ctx.font = `400 16px ${MONO}`;
  ctx.fillText("simcluster-samesame.bisks.net", W - 40, 50);

  const panelX = 40, panelW = W - 80;

  drawPanel(ctx, {
    x: panelX, y: 100, w: panelW, h: 540,
    mutualRate: stats.mutualRate, oneWayRate, handle: stats.handle,
    mutuals: stats.mutuals, scanned: stats.scanned, alarming: true,
  });

  // caption
  ctx.textAlign = "center";
  ctx.fillStyle = "#f2e9ff";
  ctx.font = `italic 600 32px Georgia, serif`;
  wrapCenter(ctx, "“if you read the numbers, you'll see these two graphics are, in essence, the same.”", W / 2, 700, 900, 42);

  drawPanel(ctx, {
    x: panelX, y: 750, w: panelW, h: 540,
    mutualRate: stats.mutualRate, oneWayRate, handle: stats.handle,
    mutuals: stats.mutuals, scanned: stats.scanned, alarming: false,
  });

  // footer
  ctx.textAlign = "center";
  ctx.fillStyle = "#a996c4";
  ctx.font = `400 18px ${MONO}`;
  ctx.fillText(
    `@${stats.handle}: ${stats.mutuals} of ${stats.scanned} follows scanned are mutual (${stats.mutualRate}%)${stats.truncated ? ", sampled" : ""}`,
    W / 2, 1350,
  );
  ctx.fillStyle = "#6ef2c9";
  ctx.font = `700 22px ${MONO}`;
  ctx.fillText("simcluster-samesame.bisks.net", W / 2, 1390);
}

function buildShareText(stats) {
  const url = `https://simcluster-samesame.bisks.net/?h=${encodeURIComponent(stats.handle)}`;
  return `@${stats.handle}'s SimCluster mutual rate is ${stats.mutualRate}% — here it is drawn twice, once alarming and once calm. same number. ${url}`;
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

async function generate(rawHandle) {
  const handle = (rawHandle || "").trim().replace(/^@/, "");
  if (!handle) { setStatus("enter a handle first.", true); return; }

  els.genBtn.disabled = true;
  els.graphicWrap.classList.remove("show");
  els.shareRow.style.display = "none";
  setStatus(`resolving @${handle}...`);

  try {
    const stats = await buildStats(handle, { onStep: (s) => setStatus(s) });
    lastStats = stats;
    drawGraphic(els.canvas, stats);
    els.graphicWrap.classList.add("show");

    lastShareText = buildShareText(stats);
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
    els.shareRow.style.display = "flex";
    setStatus("");
  } catch (err) {
    setStatus("couldn't build that graphic: " + err.message, true);
  } finally {
    els.genBtn.disabled = false;
  }
}

els.shareDownload.addEventListener("click", () => {
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `simcluster-samesame-${(lastStats?.handle || "cluster").replace(/[^a-z0-9.-]/gi, "_")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "simcluster-samesame.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "simcluster: same graphic" });
      } catch {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  generate(els.input.value);
});

const sharedHandle = new URLSearchParams(location.search).get("h");
if (sharedHandle) {
  els.input.value = sharedHandle;
  generate(sharedHandle);
} else {
  els.input.value = "norvid-studies.bsky.social";
  generate("norvid-studies.bsky.social");
}
