const SITE_URL = "https://acid100.bisks.net/";

const SPECS = [
  "HTML Living Standard", "CSS Box Model", "CSS Grid", "CSS Flexbox",
  "CSS Anchor Positioning", "CSS Houdini", "Container Queries",
  "View Transitions API", "Popover API", "WebGPU", "WebGL 2", "WebXR",
  "WebAssembly GC", "WebNFC", "WebUSB", "WebHID", "Web Serial",
  "Web Bluetooth", "Web Locks API", "Origin Private File System",
  "Compute Pressure API", "Shared Storage API", "Fenced Frames",
  "Service Workers", "WebSockets", "WebRTC", "WebTransport",
  "the <marquee> tag (spiritually)", "Quirks Mode (deleted, on purpose)",
  "CSS :has()", "prefers-color-scheme", "the CSS cascade (all 8 layers)",
  "ARIA 1.3", "Web Speech API", "Screen Wake Lock", "Payment Request API",
];

let running = false;

function renderSpecGrid() {
  const grid = document.getElementById("specgrid");
  grid.innerHTML = "";
  SPECS.forEach((name) => {
    const el = document.createElement("div");
    el.className = "spec";
    el.innerHTML =
      '<span class="ok">✓</span><span>' + name + '</span><span class="pct">100.00%</span>';
    grid.appendChild(el);
  });
}
renderSpecGrid();

// ---- compliance meter: counts up to 100.00% once, on load ----
function animateMeter(cb) {
  const pctEl = document.getElementById("pct");
  const start = performance.now();
  const dur = 1400;
  function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    pctEl.textContent = (eased * 100).toFixed(2);
    if (t < 1) requestAnimationFrame(tick);
    else {
      pctEl.textContent = "100.00";
      if (cb) cb();
    }
  }
  requestAnimationFrame(tick);
}
animateMeter();

// ---- url bar / "navigation" ----
const urlInput = document.getElementById("urlInput");
const frame = document.getElementById("frame");
const startpage = document.getElementById("startpage");
const notice = document.getElementById("notice");
const statusText = document.getElementById("statusText");
const statusFlag = document.getElementById("statusFlag");
const tabTitle = document.getElementById("tabTitle");

let lastTried = null;

function normalizeUrl(raw) {
  let v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) {
    if (/^[\w-]+(\.[\w-]+)+/.test(v)) v = "https://" + v;
    else v = "https://duckduckgo.com/?q=" + encodeURIComponent(v);
  }
  try {
    return new URL(v).toString();
  } catch (e) {
    return null;
  }
}

function go() {
  const target = normalizeUrl(urlInput.value);
  notice.classList.remove("show");
  notice.textContent = "";
  if (!target) {
    startpage.style.display = "block";
    frame.style.display = "none";
    tabTitle.textContent = "New Tab — 100% compliant";
    statusText.textContent = "ready.";
    updateShare(null);
    return;
  }
  lastTried = target;
  let host = "";
  try { host = new URL(target).host; } catch (e) {}
  tabTitle.textContent = host || target;
  statusText.textContent = "loading " + target + " …";
  startpage.style.display = "none";
  frame.style.display = "block";
  frame.src = target;

  window.clearTimeout(go._t);
  go._t = window.setTimeout(() => {
    statusText.textContent = "rendered " + host + " (as much of it as it's earned).";
    notice.innerHTML =
      "If that came up blank: not a compliance failure on our end — " +
      "acid100 is 100.00% spec compliant. Most sites decline to be " +
      "embedded in someone else's browser chrome, which is a them problem. " +
      '<a href="' + target + '" target="_blank" rel="noopener">open it directly ↗</a>';
    notice.classList.add("show");
  }, 1400);

  updateShare(target);
}

document.getElementById("btnGo").addEventListener("click", go);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") go();
});
document.getElementById("btnReload").addEventListener("click", () => {
  if (frame.src) frame.src = frame.src;
});
document.getElementById("btnBack").addEventListener("click", () => {
  statusText.textContent = "already at the start of history. it's a very compliant history.";
});
document.getElementById("btnFwd").addEventListener("click", () => {
  statusText.textContent = "nothing forward yet. the future is 100% compliant too, once it exists.";
});

// ---- compliance suite: cosmetic test runner ----
const runlog = document.getElementById("runlog");
document.getElementById("btnSuite").addEventListener("click", () => {
  if (running) return;
  running = true;
  runlog.innerHTML = "";
  runlog.classList.add("show");
  statusFlag.textContent = "running suite…";
  animateMeter();
  let i = 0;
  const order = SPECS.slice();
  function step() {
    if (i >= order.length) {
      const line = document.createElement("div");
      line.className = "line pass";
      line.textContent = "SUITE COMPLETE — " + order.length + "/" + order.length + " passed — 100.00% compliant, as expected.";
      runlog.appendChild(line);
      runlog.scrollTop = runlog.scrollHeight;
      statusFlag.textContent = "0 tests failed (" + order.length + " tests run)";
      running = false;
      return;
    }
    const line = document.createElement("div");
    line.className = "line";
    line.innerHTML = "testing: " + order[i] + " … <span class=\"pass\">PASS</span>";
    runlog.appendChild(line);
    runlog.scrollTop = runlog.scrollHeight;
    i++;
    setTimeout(step, 60);
  }
  step();
});

// ---- sharing ----
function buildShareText(triedUrl) {
  let text;
  if (triedUrl) {
    text = "acid100: the cross-platform browser with 100.00% web platform spec compliance.\n\ntried loading " + triedUrl + " in it. still 100.00% compliant either way.\n\n" + SITE_URL;
  } else {
    text = "acid100: a browser with a url bar, a compliance meter stuck at 100.00%, and zero regrets.\n\n" + SITE_URL;
  }
  return text;
}

function updateShare(triedUrl) {
  const shareEl = document.getElementById("shareBluesky");
  shareEl.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText(triedUrl));
}
updateShare(null);

function drawCard(triedUrl) {
  const canvas = document.getElementById("cardCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const BG = "#060907", INK = "#bdf5d2", DIM = "#5d8871", AMBER = "#ffcf6e", CYAN = "#7fe0e0";

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#1e3327";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.font = "700 20px 'JetBrains Mono', monospace";
  ctx.fillStyle = CYAN;
  ctx.fillText("ACID100 — COMPLIANCE REPORT", 60, 80);

  ctx.font = "800 76px 'JetBrains Mono', monospace";
  ctx.fillStyle = AMBER;
  ctx.fillText("100.00%", 60, 190);

  ctx.font = "18px 'JetBrains Mono', monospace";
  ctx.fillStyle = DIM;
  ctx.fillText("web platform spec compliance", 60, 225);

  ctx.font = "22px 'JetBrains Mono', monospace";
  ctx.fillStyle = INK;
  const label = triedUrl ? "tried to load:" : "specs implemented:";
  ctx.fillText(label, 60, 300);
  ctx.font = "20px 'JetBrains Mono', monospace";
  ctx.fillStyle = CYAN;
  const value = triedUrl ? triedUrl.replace(/^https?:\/\//, "") : SPECS.length + " out of " + SPECS.length;
  ctx.fillText(value.length > 46 ? value.slice(0, 43) + "..." : value, 60, 332);

  const cols = 8, cell = 24, gap = 10, startX = 60, startY = 400;
  SPECS.forEach((_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cell + gap);
    const y = startY + row * (cell + gap);
    ctx.fillStyle = "rgba(255,207,110,0.18)";
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeRect(x, y, cell, cell);
    ctx.fillStyle = AMBER;
    ctx.font = "16px 'JetBrains Mono', monospace";
    ctx.fillText("✓", x + 6, y + 17);
  });

  ctx.font = "700 24px 'JetBrains Mono', monospace";
  ctx.fillStyle = AMBER;
  ctx.fillText("acid100.bisks.net", 60, 580);

  return canvas.toDataURL("image/png");
}

document.getElementById("downloadCard").addEventListener("click", async () => {
  const dataUrl = drawCard(lastTried);
  const preview = document.getElementById("cardPreview");
  preview.src = dataUrl;
  preview.style.display = "block";

  if (navigator.share && navigator.canShare) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "acid100.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: buildShareText(lastTried),
          title: "acid100",
        });
        return;
      }
    } catch (e) {}
  }

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "acid100.png";
  a.click();
});
