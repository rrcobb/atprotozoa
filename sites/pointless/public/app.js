// Pointless™ — every interaction on this page is fake except the
// certificate generator at the bottom, which is the one real feature.

const toastEl = document.getElementById("toast");
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

// Every element with data-noop pops a toast and does literally nothing else.
document.querySelectorAll("[data-noop]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    toast(el.dataset.noop);
  });
});

document.getElementById("cta-start").addEventListener("click", () => {
  toast("You're in. There is nothing to do next.");
});
document.getElementById("cta-demo").addEventListener("click", () => {
  toast("That was the whole demo.");
});

document.getElementById("invite-btn").addEventListener("click", () => {
  const val = document.getElementById("invite-handle").value.trim();
  toast(val ? `Invitation to @${val.replace(/^@/, "")} not sent, as intended.` : "Enter a handle to not invite them.");
});

document.getElementById("support-btn").addEventListener("click", () => {
  const replies = [
    "have you tried nothing?",
    "that's a great question. the answer is nothing.",
    "our specialists agree: nothing can be done.",
    "escalating to a manager who also does nothing.",
  ];
  document.querySelector(".chat-bubble").textContent = replies[Math.floor(Math.random() * replies.length)];
});

// Flip a toggle on and it snaps back off shortly after — automation that
// automates nothing.
document.querySelectorAll(".auto-off").forEach((cb) => {
  cb.addEventListener("change", () => {
    if (cb.checked) setTimeout(() => { cb.checked = false; }, 350);
  });
});

// Time you've wasted here, ticking up from the moment the page loaded.
const startedAt = performance.now();
function tickTime() {
  const secs = Math.floor((performance.now() - startedAt) / 1000);
  const m = Math.floor(secs / 60), s = secs % 60;
  document.getElementById("stat-time").textContent = `${m}:${String(s).padStart(2, "0")}`;
}
setInterval(tickTime, 1000);

// "Total Value Generated" appears to tick like a live counter but always
// resolves back to $0.00 — a little jitter, then settles.
const statValueEl = document.getElementById("stat-value");
function jitterValue() {
  const fake = (Math.random() * 0.02).toFixed(2);
  statValueEl.textContent = `$${fake}`;
  setTimeout(() => { statValueEl.textContent = "$0.00"; }, 400);
}
setInterval(jitterValue, 4000);

const optimizingWords = ["optimizing…", "recalculating…", "still optimizing…", "converging on 100%…", "optimizing…"];
let optIdx = 0;
setInterval(() => {
  optIdx = (optIdx + 1) % optimizingWords.length;
  document.getElementById("optimizing").textContent = optimizingWords[optIdx];
}, 2500);

// The secret cee.wtf prefill (standing order, 2026-08-28): one character in
// the brand mark quietly fills the handle-shaped input. No visual tell.
document.getElementById("secret").addEventListener("click", () => {
  const input = document.getElementById("invite-handle");
  input.value = "@cee.wtf";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();
});

// --- Certificate of Complete Uselessness -----------------------------------

const ACHIEVEMENTS = [
  "Scrolled to the bottom of a page that goes nowhere",
  "Clicked six buttons that do nothing and asked for a seventh",
  "Achieved a Total Value Generated of exactly $0.00",
  "Synced 0 bytes of data to nowhere, successfully",
  "Toggled a switch that turned itself back off",
  "Read the fine print. There was nothing in it either",
  "Waited for a demo that had already ended",
  "Upgraded to a plan that changed nothing",
  "Asked support for help and received none",
  "Invited a teammate who was never notified",
];

function certNumber() {
  const n = Math.floor(Math.random() * 900000 + 100000);
  return `PL-${n}`;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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

let lastCert = null;

function drawCertificate() {
  const canvas = document.getElementById("cert-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  const achievement = pick(ACHIEVEMENTS);
  const score = (Math.random() * 3 + 97).toFixed(1); // 97.0–100.0%
  const number = certNumber();
  const date = new Date().toISOString().slice(0, 10);

  ctx.fillStyle = "#f7f8fc";
  ctx.fillRect(0, 0, W, H);

  // border
  ctx.strokeStyle = "#4f46e5";
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.strokeStyle = "#c7d2fe";
  ctx.lineWidth = 2;
  ctx.strokeRect(38, 38, W - 76, H - 76);

  ctx.textAlign = "center";
  ctx.fillStyle = "#5b5f7a";
  ctx.font = "700 16px ui-monospace, monospace";
  ctx.fillText("POINTLESS™ — OFFICE OF CERTIFIED USELESSNESS", W / 2, 92);

  ctx.fillStyle = "#14152b";
  ctx.font = "800 44px Georgia, serif";
  ctx.fillText("Certificate of Complete Uselessness", W / 2, 150);

  ctx.font = "16px ui-monospace, monospace";
  ctx.fillStyle = "#5b5f7a";
  ctx.fillText("This certifies that the bearer has, on this day, accomplished:", W / 2, 220);

  ctx.fillStyle = "#4f46e5";
  ctx.font = "700 28px Georgia, serif";
  wrapText(ctx, `"${achievement}"`, W / 2, 270, W - 220, 36);

  ctx.fillStyle = "#5b5f7a";
  ctx.font = "16px ui-monospace, monospace";
  ctx.fillText("and is hereby recognized as having generated zero value in the process.", W / 2, 380);

  // score block
  ctx.fillStyle = "#16a34a";
  ctx.font = "800 40px ui-monospace, monospace";
  ctx.fillText(`Uselessness Score: ${score}%`, W / 2, 450);

  ctx.fillStyle = "#5b5f7a";
  ctx.font = "14px ui-monospace, monospace";
  ctx.fillText(`Certificate No. ${number}   ·   Issued ${date}   ·   Valid for absolutely nothing`, W / 2, 500);

  ctx.font = "italic 15px Georgia, serif";
  ctx.fillStyle = "#14152b";
  ctx.fillText("pointless.bisks.net", W / 2, 570);

  lastCert = { achievement, score, number, date };
  return lastCert;
}

function buildShareText(cert) {
  const text =
    `I just earned a Certificate of Complete Uselessness (No. ${cert.number}) from Pointless™: ` +
    `"${cert.achievement}" — Uselessness Score ${cert.score}%.\n\n` +
    `get yours → https://pointless.bisks.net/`;
  return text;
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

document.getElementById("gen-cert").addEventListener("click", () => {
  const cert = drawCertificate();
  document.getElementById("cert-result").hidden = false;
  document.getElementById("cert-result").scrollIntoView({ behavior: "smooth", block: "center" });

  const canvas = document.getElementById("cert-canvas");
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    document.getElementById("cert-download").href = url;
  }, "image/png");

  const shareText = buildShareText(cert);
  document.getElementById("cert-share-bsky").href =
    "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  if (canShareFiles()) {
    const nativeBtn = document.getElementById("cert-native-share");
    nativeBtn.hidden = false;
    nativeBtn.onclick = () => {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `pointless-${cert.number}.png`, { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: shareText, title: "Pointless™" });
        } catch (_) {
          // cancelled — no-op, fittingly
        }
      }, "image/png");
    };
  }
});
