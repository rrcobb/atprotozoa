import { dealHand, rankLabel, correctDecision } from "./lib/cards.js";

const STORAGE_KEY = "preflop-stats";

const els = {
  cards: document.getElementById("cards"),
  decisionRow: document.getElementById("decisionRow"),
  stayBtn: document.getElementById("stayBtn"),
  foldBtn: document.getElementById("foldBtn"),
  feedback: document.getElementById("feedback"),
  verdict: document.getElementById("verdict"),
  explain: document.getElementById("explain"),
  nextBtn: document.getElementById("nextBtn"),
  statScore: document.getElementById("statScore"),
  statStreak: document.getElementById("statStreak"),
  statBest: document.getElementById("statBest"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareNative: document.getElementById("shareNative"),
  shareDownload: document.getElementById("shareDownload"),
  shareCanvas: document.getElementById("shareCanvas"),
  resetBtn: document.getElementById("resetBtn"),
};

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("none");
    const parsed = JSON.parse(raw);
    return {
      played: parsed.played | 0,
      correct: parsed.correct | 0,
      streak: parsed.streak | 0,
      best: parsed.best | 0,
    };
  } catch (_) {
    return { played: 0, correct: 0, streak: 0, best: 0 };
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

let stats = loadStats();
let hand = null;
let answered = false;

function renderStats() {
  els.statScore.textContent = stats.correct + "/" + stats.played;
  els.statStreak.textContent = String(stats.streak);
  els.statBest.textContent = String(stats.best);
}

function renderCard(el, card) {
  const red = card.suit === "h" || card.suit === "d";
  el.className = "pcard " + (red ? "red" : "black");
  const symbol = { s: "♠", h: "♥", d: "♦", c: "♣" }[card.suit];
  el.innerHTML =
    '<span class="rank">' + rankLabel(card.rank) + '</span>' +
    '<span class="suit-big">' + symbol + "</span>";
}

function dealNewHand() {
  hand = dealHand();
  answered = false;
  els.cards.innerHTML = "";
  const c1 = document.createElement("div");
  const c2 = document.createElement("div");
  renderCard(c1, hand[0]);
  renderCard(c2, hand[1]);
  els.cards.appendChild(c1);
  els.cards.appendChild(c2);
  els.feedback.classList.remove("show");
  els.decisionRow.style.display = "flex";
  els.stayBtn.disabled = false;
  els.foldBtn.disabled = false;
}

function handleDecision(choice) {
  if (answered) return;
  answered = true;
  const { score, decision } = correctDecision(hand[0], hand[1]);
  const isCorrect = choice === decision;

  stats.played++;
  if (isCorrect) {
    stats.correct++;
    stats.streak++;
    stats.best = Math.max(stats.best, stats.streak);
  } else {
    stats.streak = 0;
  }
  saveStats();
  renderStats();
  refreshShare();

  els.verdict.textContent = isCorrect ? "✅ correct" : "❌ wrong";
  els.verdict.className = "verdict " + (isCorrect ? "correct" : "wrong");
  els.explain.textContent =
    "Chen score " + score + " → the book says " + decision + " here" +
    (isCorrect ? "." : ", not " + choice + ".");

  els.decisionRow.style.display = "none";
  els.feedback.classList.add("show");
}

function loadFont() {
  return document.fonts.load("800 60px 'JetBrains Mono'").then(() => document.fonts.load("400 20px 'JetBrains Mono'"));
}

function shareTextFor() {
  return (
    stats.correct + "/" + stats.played + " correct on preflop (best streak " + stats.best +
    ") — practicing just the first hold'em decision, stay in or fold. https://preflop.bisks.net/"
  );
}

async function drawShareCard() {
  try { await loadFont(); } catch (_) {}
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "'JetBrains Mono', ui-monospace, monospace";

  ctx.fillStyle = "#0b1f16";
  ctx.fillRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "rgba(79,214,140,0.18)");
  grad.addColorStop(1, "rgba(255,210,78,0.12)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#eef7f0";
  ctx.font = "800 64px " + mono;
  ctx.fillText("preflop", 60, 110);

  ctx.fillStyle = "#9fc3ac";
  ctx.font = "22px " + mono;
  ctx.fillText("stay in, or fold? just the first decision.", 60, 152);

  ctx.fillStyle = "#4fd68c";
  ctx.font = "800 120px " + mono;
  ctx.fillText(stats.correct + "/" + stats.played, 60, 320);

  ctx.fillStyle = "#ffd24e";
  ctx.font = "800 34px " + mono;
  ctx.fillText("best streak " + stats.best, 60, 380);

  ctx.strokeStyle = "rgba(238,247,240,0.18)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(30, 30, W - 60, H - 60);

  ctx.fillStyle = "#eef7f0";
  ctx.font = "700 26px " + mono;
  ctx.fillText("preflop.bisks.net", 60, H - 60);
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

function refreshShare() {
  drawShareCard();
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareTextFor());
}

els.shareDownload.addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = "preflop-" + stats.correct + "-" + stats.played + ".png";
  a.href = els.shareCanvas.toDataURL("image/png");
  a.click();
});

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "preflop.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: shareTextFor(), title: "preflop" });
      } catch (_) {}
    }, "image/png");
  });
}

els.resetBtn.addEventListener("click", () => {
  if (!confirm("reset your preflop stats and streak?")) return;
  stats = { played: 0, correct: 0, streak: 0, best: 0 };
  saveStats();
  renderStats();
  refreshShare();
});

els.stayBtn.addEventListener("click", () => handleDecision("stay"));
els.foldBtn.addEventListener("click", () => handleDecision("fold"));
els.nextBtn.addEventListener("click", dealNewHand);

renderStats();
refreshShare();
dealNewHand();
