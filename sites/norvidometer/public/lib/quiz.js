import { POSTS } from "./posts.js";

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const els = {
  start: document.getElementById("start"),
  startBtn: document.getElementById("startBtn"),
  quiz: document.getElementById("quiz"),
  qNum: document.getElementById("qNum"),
  qScore: document.getElementById("qScore"),
  postText: document.getElementById("postText"),
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
let controlTotal = 0;
let controlCorrect = 0;
let forcedControls = 0;
let answered = false;

function renderQuestion() {
  answered = false;
  els.nextWrap.style.display = "none";
  const q = order[idx];
  els.qNum.textContent = idx + 1 + " / " + order.length;
  els.qScore.textContent = score + " matched";
  els.postText.textContent = q.text;
  els.contextLine.innerHTML = "";
  els.optGrid.innerHTML = "";

  const onPick = (pickedAnswer, btn) => {
    if (answered) return;
    answered = true;
    const correct = pickedAnswer === q.answer;
    if (correct) score++;
    if (q.answer === "neither") {
      if (correct) controlCorrect++;
      else if (pickedAnswer === "claim" || pickedAnswer === "heuristic") forcedControls++;
    }
    const sourceLinks =
      '<a href="' + q.permalink + '" target="_blank" rel="noopener">real post, by @' + q.author + "</a> · " +
      '<a href="' + q.norvidPermalink + '" target="_blank" rel="noopener">norvid\'s actual QT</a>';
    els.contextLine.innerHTML = "— " + q.note + "<br>" + sourceLinks;
    document.querySelectorAll("#optGrid button.opt").forEach((b) => {
      b.disabled = true;
      if (b.dataset.answer === q.answer) b.classList.add("correct");
      else if (b === btn) b.classList.add("wrong");
      else b.classList.add("dim");
    });
    els.qScore.textContent = score + " matched";
    els.nextWrap.style.display = "block";
  };

  for (const opt of ["claim", "heuristic", "neither"]) {
    const btn = document.createElement("button");
    btn.className = "opt " + opt;
    btn.dataset.answer = opt;
    btn.textContent = opt;
    btn.addEventListener("click", () => onPick(opt, btn));
    els.optGrid.appendChild(btn);
  }
}

function tierFor(score, total) {
  const pct = score / total;
  if (pct >= 0.9) return "high-dimensional flanderization achieved";
  if (pct >= 0.75) return "basically norvid-pilled";
  if (pct >= 0.55) return "you see the shape of his usage";
  if (pct >= 0.35) return "still using it the gracekind way";
  return "rule of thumb? never heard of her";
}

function shareUrlFor() {
  return "https://norvidometer.bisks.net/";
}

function shareTextFor(score, total, tier) {
  return (
    score + "/" + total + " on the norvidometer — \"" + tier + "\". guess how norvid tagged " + total + " real quote-tweets from his own timeline (some are controls — neither). " +
    shareUrlFor()
  );
}

function loadFont() {
  return document.fonts.load("800 60px 'JetBrains Mono'").then(() => document.fonts.load("400 20px 'JetBrains Mono'"));
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = word;
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, curY);
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
  grad.addColorStop(1, "rgba(196,138,255,0.16)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#eaf2fb";
  ctx.font = "800 60px " + mono;
  ctx.fillText("norvidometer", 60, 110);

  ctx.fillStyle = "#8b96ab";
  ctx.font = "22px " + mono;
  ctx.fillText("claim or heuristic? how norvid are you?", 60, 152);

  ctx.fillStyle = "#63c7ff";
  ctx.font = "800 130px " + mono;
  ctx.fillText(String(score) + "/" + String(total), 60, 330);

  ctx.fillStyle = "#c48aff";
  ctx.font = "800 36px " + mono;
  wrapText(ctx, tier, 60, 390, 1080, 42);

  ctx.strokeStyle = "rgba(234,242,251,0.18)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(30, 30, W - 60, H - 60);

  ctx.fillStyle = "#eaf2fb";
  ctx.font = "700 26px " + mono;
  ctx.fillText("norvidometer.bisks.net", 60, H - 60);
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
  let sub = "every one of those was a real quote-tweet norvid actually tagged himself — no invented posts this time.";
  if (controlTotal > 0) {
    sub += " " + controlCorrect + "/" + controlTotal + " controls correctly spotted as neither.";
    if (forcedControls > 0) {
      sub += " you flanderized " + forcedControls + " of them into claim or heuristic anyway.";
    }
  }
  els.resultSub.textContent = sub;

  drawResultCard(score, total, tier);

  const text = shareTextFor(score, total, tier);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);

  els.shareDownload.onclick = () => {
    const a = document.createElement("a");
    a.download = "norvidometer-" + score + "-" + total + ".png";
    a.href = els.resultCanvas.toDataURL("image/png");
    a.click();
  };

  if (canShareFiles()) {
    els.shareNative.style.display = "";
    els.shareNative.onclick = () => {
      els.resultCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "norvidometer.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text, title: "norvidometer" });
        } catch (_) {}
      }, "image/png");
    };
  }
}

function start() {
  order = shuffle(POSTS);
  idx = 0;
  score = 0;
  controlTotal = order.filter((q) => q.answer === "neither").length;
  controlCorrect = 0;
  forcedControls = 0;
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
