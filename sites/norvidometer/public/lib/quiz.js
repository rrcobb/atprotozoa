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
  voteStats: document.getElementById("voteStats"),
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
  recap: document.getElementById("recap"),
};

let order = [];
let idx = 0;
let score = 0;
let controlTotal = 0;
let controlCorrect = 0;
let forcedControls = 0;
let answered = false;
let answeredLog = [];
let pendingVotes = [];

// The quoted post's own rkey (unique per entry in POSTS) doubles as a stable
// question id for the shared vote tally — no need to hand-assign ids.
function qidFor(q) {
  const parts = q.permalink.split("/");
  return parts[parts.length - 1] || q.permalink;
}

async function submitVote(q, answer) {
  try {
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qid: qidFor(q), answer }),
    });
    if (!res.ok) throw new Error("bad status");
    return await res.json();
  } catch (_) {
    return null;
  }
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function statsBarsHtml(tally, norvidAnswer) {
  if (!tally || !tally.counts) {
    return '<div class="stats-note">crowd stats unavailable right now.</div>';
  }
  const { counts, total } = tally;
  const rows = ["claim", "heuristic", "neither"]
    .map((opt) => {
      const n = counts[opt] || 0;
      const p = pct(n, total);
      const isNorvid = opt === norvidAnswer;
      return (
        '<div class="stat-row' + (isNorvid ? " norvid" : "") + '">' +
        '<span class="stat-label">' + opt + (isNorvid ? " ← norvid" : "") + "</span>" +
        '<span class="stat-bar"><span class="stat-fill ' + opt + '" style="width:' + p + '%"></span></span>' +
        '<span class="stat-pct">' + p + "%</span>" +
        "</div>"
      );
    })
    .join("");
  return (
    '<div class="stats-head">' + total + (total === 1 ? " answer" : " answers") + " submitted so far</div>" + rows
  );
}

function renderQuestion() {
  answered = false;
  els.nextWrap.style.display = "none";
  const q = order[idx];
  els.qNum.textContent = idx + 1 + " / " + order.length;
  els.qScore.textContent = score + " matched";
  els.postText.textContent = q.text;
  els.contextLine.innerHTML = "";
  els.optGrid.innerHTML = "";
  els.voteStats.innerHTML = "";

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

    els.voteStats.innerHTML = '<div class="stats-loading">tallying votes…</div>';
    // Tracked in pendingVotes so the "next" handler can wait for the final
    // question's tally before rendering the recap, instead of racing it.
    const vote = submitVote(q, pickedAnswer).then((tally) => {
      answeredLog.push({ q, picked: pickedAnswer, tally });
      // A slow reply could land after the user has already moved to the next
      // question — only paint if this question is still the one on screen.
      if (order[idx] === q) {
        els.voteStats.innerHTML = statsBarsHtml(tally, q.answer);
      }
    });
    pendingVotes.push(vote);
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

  els.recap.innerHTML = answeredLog
    .map((entry, i) => {
      const { q, picked, tally } = entry;
      return (
        '<div class="recap-item">' +
        '<div class="recap-q">' + (i + 1) + '. “' + escapeHtml(q.text) + '”</div>' +
        '<div class="recap-meta">you said <b>' + picked + "</b> · norvid said <b>" + q.answer + "</b></div>" +
        statsBarsHtml(tally, q.answer) +
        "</div>"
      );
    })
    .join("");

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
  answeredLog = [];
  pendingVotes = [];
  els.start.style.display = "none";
  els.result.style.display = "none";
  els.quiz.style.display = "block";
  renderQuestion();
}

els.startBtn.addEventListener("click", start);
els.restartBtn.addEventListener("click", start);
els.nextBtn.addEventListener("click", async () => {
  idx++;
  if (idx >= order.length) {
    if (pendingVotes.length) await Promise.all(pendingVotes);
    showResult();
  } else {
    renderQuestion();
  }
});
