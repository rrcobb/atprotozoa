import { PEOPLE, QUOTES } from "./quotes.js";

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const byId = Object.fromEntries(PEOPLE.map((p) => [p.id, p]));
const measured = PEOPLE.filter((p) => p.camp === "measured");
const euphoric = PEOPLE.filter((p) => p.camp === "euphoric");

const els = {
  start: document.getElementById("start"),
  startBtn: document.getElementById("startBtn"),
  quiz: document.getElementById("quiz"),
  qNum: document.getElementById("qNum"),
  qScore: document.getElementById("qScore"),
  quoteText: document.getElementById("quoteText"),
  contextLine: document.getElementById("contextLine"),
  optGrid: document.getElementById("optGrid"),
  nextWrap: document.getElementById("nextWrap"),
  nextBtn: document.getElementById("nextBtn"),
  result: document.getElementById("result"),
  resultTitle: document.getElementById("resultTitle"),
  resultScore: document.getElementById("resultScore"),
  resultSub: document.getElementById("resultSub"),
  resultCanvas: document.getElementById("resultCanvas"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareNative: document.getElementById("shareNative"),
  shareDownload: document.getElementById("shareDownload"),
  restartBtn: document.getElementById("restartBtn"),
};

let order = [];
let idx = 0;
let score = 0;
let answered = false;
let missedMeasuredAsEuphoric = 0;
let missedEuphoricAsMeasured = 0;

function renderGroupCol(people, groupLabel, groupClass, correctId, onPick) {
  const col = document.createElement("div");
  col.className = "groupcol";
  const label = document.createElement("div");
  label.className = "grouplabel " + groupClass;
  label.textContent = groupLabel;
  col.appendChild(label);
  for (const p of people) {
    const btn = document.createElement("button");
    btn.className = "opt";
    btn.dataset.id = p.id;
    btn.innerHTML = p.name + "<small>" + p.sub + "</small>";
    btn.addEventListener("click", () => onPick(p.id, btn));
    col.appendChild(btn);
  }
  return col;
}

function renderQuestion() {
  answered = false;
  els.nextWrap.style.display = "none";
  const q = order[idx];
  els.qNum.textContent = idx + 1 + " / " + order.length;
  els.qScore.textContent = score + " correct";
  els.quoteText.textContent = q.text;
  els.contextLine.textContent = "";
  els.optGrid.innerHTML = "";

  const onPick = (pickedId, btn) => {
    if (answered) return;
    answered = true;
    const correct = pickedId === q.person;
    if (correct) score++;
    else if (byId[q.person].camp === "measured" && byId[pickedId].camp === "euphoric") {
      missedMeasuredAsEuphoric++;
    } else if (byId[q.person].camp === "euphoric" && byId[pickedId].camp === "measured") {
      missedEuphoricAsMeasured++;
    }
    els.contextLine.textContent = "— " + q.context;
    document.querySelectorAll("#optGrid button.opt").forEach((b) => {
      b.disabled = true;
      if (b.dataset.id === q.person) b.classList.add("correct");
      else if (b === btn) b.classList.add("wrong");
      else b.classList.add("dim");
    });
    els.qScore.textContent = score + " correct";
    els.nextWrap.style.display = "block";
  };

  els.optGrid.appendChild(renderGroupCol(measured, "the measured ones", "measured", q.person, onPick));
  els.optGrid.appendChild(renderGroupCol(euphoric, "the euphoric ones", "euphoric", q.person, onPick));
}

function tierFor(score, total) {
  const pct = score / total;
  if (pct >= 0.9) return "certified vibes historian";
  if (pct >= 0.7) return "pretty plugged in";
  if (pct >= 0.5) return "coin flip energy";
  if (pct >= 0.3) return "hype-blind";
  return "you'd have invested in WeWork";
}

function shareUrlFor() {
  return "https://hypeorhickey.bisks.net/";
}

function shareTextFor(score, total, tier) {
  return (
    score + "/" + total + " on hype or hickey — \"" + tier + "\". can you tell a euphoric CEO from a euphoric Perl creator? " +
    shareUrlFor()
  );
}

function loadFont() {
  return document.fonts.load("800 60px 'JetBrains Mono'").then(() => document.fonts.load("400 20px 'JetBrains Mono'"));
}

async function drawResultCard(score, total, tier) {
  try { await loadFont(); } catch (_) {}
  const canvas = els.resultCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "'JetBrains Mono', ui-monospace, monospace";

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a0b10";
  ctx.fillRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "rgba(99,199,255,0.16)");
  grad.addColorStop(1, "rgba(255,138,76,0.16)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#eaf2fb";
  ctx.font = "800 64px " + mono;
  ctx.fillText("hype or hickey", 60, 110);

  ctx.fillStyle = "#8b96ab";
  ctx.font = "22px " + mono;
  ctx.fillText("guess who said the euphoric quote", 60, 152);

  ctx.fillStyle = "#63c7ff";
  ctx.font = "800 130px " + mono;
  ctx.fillText(String(score) + "/" + String(total), 60, 330);

  ctx.fillStyle = "#ff8a4c";
  ctx.font = "800 40px " + mono;
  ctx.fillText(tier, 60, 400);

  ctx.strokeStyle = "rgba(234,242,251,0.18)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(30, 30, W - 60, H - 60);

  ctx.fillStyle = "#eaf2fb";
  ctx.font = "700 26px " + mono;
  ctx.fillText("hypeorhickey.bisks.net", 60, H - 60);
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

function showResult() {
  els.quiz.style.display = "none";
  els.result.style.display = "block";
  const total = order.length;
  const tier = tierFor(score, total);
  els.resultTitle.textContent = tier;
  els.resultScore.textContent = score + " / " + total;
  const bits = [];
  if (missedMeasuredAsEuphoric) bits.push(missedMeasuredAsEuphoric + " time(s) you thought a quiet engineer was a hype-CEO");
  if (missedEuphoricAsMeasured) bits.push(missedEuphoricAsMeasured + " time(s) you thought a hype-CEO was a quiet engineer");
  els.resultSub.textContent = bits.length ? bits.join(" · ") : "clean sweep on camp, at least.";

  drawResultCard(score, total, tier);

  const text = shareTextFor(score, total, tier);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);

  els.shareDownload.onclick = () => {
    const a = document.createElement("a");
    a.download = "hypeorhickey-" + score + "-" + total + ".png";
    a.href = els.resultCanvas.toDataURL("image/png");
    a.click();
  };

  if (canShareFiles()) {
    els.shareNative.style.display = "";
    els.shareNative.onclick = () => {
      els.resultCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "hypeorhickey.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text, title: "hype or hickey" });
        } catch (_) {}
      }, "image/png");
    };
  }
}

function start() {
  order = shuffle(QUOTES);
  idx = 0;
  score = 0;
  missedMeasuredAsEuphoric = 0;
  missedEuphoricAsMeasured = 0;
  els.start.style.display = "none";
  els.result.style.display = "none";
  els.quiz.style.display = "block";
  renderQuestion();
}

els.startBtn.addEventListener("click", start);
els.restartBtn.addEventListener("click", start);
els.nextBtn.addEventListener("click", () => {
  idx++;
  if (idx >= order.length) showResult();
  else renderQuestion();
});
