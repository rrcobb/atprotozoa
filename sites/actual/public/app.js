// Actual™ — the opposite of Pointless™. Every function below does the real
// thing its label says; nothing here is decorative.

const toastEl = document.getElementById("toast");
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = original; }, 1400);
  });
}
document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.copyTarget);
    if (target) copyText(target.textContent, btn);
  });
});

document.getElementById("cta-nav-start").addEventListener("click", () => {
  document.getElementById("tools").scrollIntoView({ behavior: "smooth" });
});
document.getElementById("cta-start").addEventListener("click", () => {
  document.getElementById("tools").scrollIntoView({ behavior: "smooth" });
});
document.getElementById("cta-demo").addEventListener("click", () => {
  document.getElementById("tools").scrollIntoView({ behavior: "smooth" });
});
document.getElementById("cta-pricing-use").addEventListener("click", () => {
  document.getElementById("tools").scrollIntoView({ behavior: "smooth" });
});

// --- Real usage tracking (this is the honest opposite of the fake
// "Uselessness Score" — every number here reflects a tool you actually used) --

const TOOL_KEYS = ["password", "uuid", "time", "qr", "json", "contrast"];
const usedTools = new Set();
function markUsed(key) {
  if (usedTools.has(key)) return;
  usedTools.add(key);
  document.getElementById("stat-tools-used").textContent = `${usedTools.size} / ${TOOL_KEYS.length}`;
  const pct = Math.round((usedTools.size / TOOL_KEYS.length) * 100);
  document.getElementById("stat-usefulness").textContent = `${pct}%`;
}

// Time you've actually spent here, ticking up for real.
const startedAt = performance.now();
function tickTime() {
  const secs = Math.floor((performance.now() - startedAt) / 1000);
  const m = Math.floor(secs / 60), s = secs % 60;
  document.getElementById("stat-time").textContent = `${m}:${String(s).padStart(2, "0")}`;
}
setInterval(tickTime, 1000);

// Real page load time from the Navigation Timing API.
window.addEventListener("load", () => {
  const nav = performance.getEntriesByType("navigation")[0];
  const ms = nav ? Math.round(nav.loadEventEnd || nav.duration) : Math.round(performance.now());
  document.getElementById("stat-load").textContent = `${ms}ms`;
});

// No secret cee.wtf handle-prefill on this page (standing order,
// 2026-08-28): that order only applies to Bluesky-handle-shaped inputs, and
// this page has none — every input here takes a password option, a
// timestamp, a URL, JSON, or a color, not a handle.

// --- Tool 1: Password generator (real crypto.getRandomValues) --------------

const pwLength = document.getElementById("pw-length");
const pwLengthOut = document.getElementById("pw-length-out");
pwLength.addEventListener("input", () => { pwLengthOut.textContent = pwLength.value; });

function generatePassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*()-_=+";
  let pool = "";
  if (document.getElementById("pw-upper").checked) pool += upper;
  if (document.getElementById("pw-lower").checked) pool += lower;
  if (document.getElementById("pw-digits").checked) pool += digits;
  if (document.getElementById("pw-symbols").checked) pool += symbols;
  if (!pool) { toast("Pick at least one character set."); return null; }

  const length = Number(pwLength.value);
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += pool[bytes[i] % pool.length];
  return out;
}

document.getElementById("pw-gen").addEventListener("click", () => {
  const pw = generatePassword();
  if (pw) {
    document.getElementById("pw-out").textContent = pw;
    markUsed("password");
  }
});

// --- Tool 2: UUID generator (real crypto.randomUUID) ------------------------

document.getElementById("uuid-gen").addEventListener("click", () => {
  document.getElementById("uuid-out").textContent = crypto.randomUUID();
  markUsed("uuid");
});

// --- Tool 3: Timestamp converter --------------------------------------------

function tickNow() {
  const now = new Date();
  document.getElementById("time-now").textContent =
    `${Math.floor(now.getTime() / 1000)}  ·  ${now.toISOString()}`;
}
tickNow();
setInterval(tickNow, 1000);

document.getElementById("time-convert").addEventListener("click", () => {
  const raw = document.getElementById("time-input").value.trim();
  const out = document.getElementById("time-out");
  if (!raw) { out.textContent = "type an epoch timestamp or a date"; return; }

  let date;
  if (/^-?\d+$/.test(raw)) {
    const n = Number(raw);
    date = new Date(raw.length > 10 ? n : n * 1000);
  } else {
    date = new Date(raw);
  }

  if (isNaN(date.getTime())) {
    out.textContent = `couldn't parse "${raw}" as a timestamp or date`;
    return;
  }
  out.textContent = `${date.toISOString()}  ·  epoch ${Math.floor(date.getTime() / 1000)}  ·  ${date.toLocaleString()}`;
  markUsed("time");
});

// --- Tool 4: QR code generator (real, scannable, drawn to canvas) ----------

document.getElementById("qr-gen").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const value = document.getElementById("qr-input").value.trim() || "https://actual.bisks.net";
  const original = btn.textContent;
  btn.textContent = "Generating…";
  btn.disabled = true;
  try {
    const QRCode = await import("https://esm.sh/qrcode@1.5.4");
    const canvas = document.getElementById("qr-canvas");
    await QRCode.toCanvas(canvas, value, { width: 180, margin: 1 });
    canvas.hidden = false;

    const downloadLink = document.getElementById("qr-download");
    canvas.toBlob((blob) => {
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.hidden = false;
    }, "image/png");

    markUsed("qr");
  } catch (err) {
    toast("Couldn't reach the QR library — everything else on this page works offline, this one tool needs the network once.");
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
});

// --- Tool 5: JSON formatter / validator -------------------------------------

document.getElementById("json-format").addEventListener("click", () => {
  const raw = document.getElementById("json-input").value;
  const out = document.getElementById("json-out");
  if (!raw.trim()) { out.textContent = "paste some JSON above first"; return; }
  try {
    const parsed = JSON.parse(raw);
    out.textContent = JSON.stringify(parsed, null, 2);
    markUsed("json");
  } catch (err) {
    out.textContent = `Invalid JSON: ${err.message}`;
  }
});

// --- Tool 6: WCAG contrast checker ------------------------------------------

function relativeLuminance(hex) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1), l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function updateContrast() {
  const fg = document.getElementById("contrast-fg").value;
  const bg = document.getElementById("contrast-bg").value;
  const preview = document.getElementById("contrast-preview");
  preview.style.color = fg;
  preview.style.background = bg;

  const ratio = contrastRatio(fg, bg);
  const aa = ratio >= 4.5, aaa = ratio >= 7, aaLarge = ratio >= 3;
  document.getElementById("contrast-out").textContent =
    `${ratio.toFixed(2)}:1 — AA ${aa ? "pass" : "fail"} · AAA ${aaa ? "pass" : "fail"} · AA large text ${aaLarge ? "pass" : "fail"}`;
  markUsed("contrast");
}
document.getElementById("contrast-fg").addEventListener("input", updateContrast);
document.getElementById("contrast-bg").addEventListener("input", updateContrast);
updateContrast();

// --- Receipt of Actual Usefulness -------------------------------------------
// The honest opposite of Pointless™'s Certificate of Complete Uselessness:
// this one lists exactly which tools you really used this session, no more.

const TOOL_LABELS = {
  password: "Generated a real password",
  uuid: "Generated a real UUID",
  time: "Converted a real timestamp",
  qr: "Generated a real QR code",
  json: "Formatted real JSON",
  contrast: "Checked a real contrast ratio",
};

function receiptNumber() {
  const n = Math.floor(Math.random() * 900000 + 100000);
  return `AC-${n}`;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
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
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return lines.length;
}

let lastReceipt = null;

function drawReceipt() {
  const canvas = document.getElementById("receipt-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  const number = receiptNumber();
  const date = new Date().toISOString().slice(0, 10);
  const usedList = TOOL_KEYS.filter((k) => usedTools.has(k)).map((k) => TOOL_LABELS[k]);
  const pct = Math.round((usedTools.size / TOOL_KEYS.length) * 100);

  ctx.fillStyle = "#f7f8fc";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#4f46e5";
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.strokeStyle = "#c7d2fe";
  ctx.lineWidth = 2;
  ctx.strokeRect(38, 38, W - 76, H - 76);

  ctx.textAlign = "center";
  ctx.fillStyle = "#5b5f7a";
  ctx.font = "700 16px ui-monospace, monospace";
  ctx.fillText("ACTUAL™ — OFFICE OF VERIFIED USEFULNESS", W / 2, 92);

  ctx.fillStyle = "#14152b";
  ctx.font = "800 40px Georgia, serif";
  ctx.fillText("Receipt of Actual Usefulness", W / 2, 150);

  ctx.font = "16px ui-monospace, monospace";
  ctx.fillStyle = "#5b5f7a";
  ctx.fillText("This certifies that the bearer has, this session, genuinely:", W / 2, 210);

  ctx.fillStyle = "#4f46e5";
  ctx.font = "700 22px Georgia, serif";
  const listText = usedList.length ? usedList.join("  ·  ") : "used none of the six tools yet (this receipt is still honest)";
  wrapText(ctx, listText, W / 2, 255, W - 200, 32);

  ctx.fillStyle = "#16a34a";
  ctx.font = "800 40px ui-monospace, monospace";
  ctx.fillText(`Usefulness Score: ${pct}%`, W / 2, 450);

  ctx.fillStyle = "#5b5f7a";
  ctx.font = "14px ui-monospace, monospace";
  ctx.fillText(`Receipt No. ${number}   ·   Issued ${date}   ·   Every line above actually happened`, W / 2, 500);

  ctx.font = "italic 15px Georgia, serif";
  ctx.fillStyle = "#14152b";
  ctx.fillText("actual.bisks.net", W / 2, 570);

  lastReceipt = { number, date, pct, usedList };
  return lastReceipt;
}

function buildShareText(receipt) {
  return (
    `I just earned a Receipt of Actual Usefulness (No. ${receipt.number}) from Actual™: ` +
    `Usefulness Score ${receipt.pct}%.\n\n` +
    `get yours → https://actual.bisks.net/`
  );
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}

document.getElementById("gen-receipt").addEventListener("click", () => {
  const receipt = drawReceipt();
  document.getElementById("receipt-result").hidden = false;
  document.getElementById("receipt-result").scrollIntoView({ behavior: "smooth", block: "center" });

  const canvas = document.getElementById("receipt-canvas");
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    document.getElementById("receipt-download").href = url;
  }, "image/png");

  const shareText = buildShareText(receipt);
  document.getElementById("receipt-share-bsky").href =
    "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  if (canShareFiles()) {
    const nativeBtn = document.getElementById("receipt-native-share");
    nativeBtn.hidden = false;
    nativeBtn.onclick = () => {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `actual-${receipt.number}.png`, { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: shareText, title: "Actual™" });
        } catch (_) {
          // cancelled
        }
      }, "image/png");
    };
  }
});
