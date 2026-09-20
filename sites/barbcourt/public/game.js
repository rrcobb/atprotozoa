// barbcourt — the game logic. Everything runs in the browser: standing is
// kept in localStorage, and judging is either a local heuristic (the house
// decorum-meter, always available) or the visitor's own LLM key via byok.js
// (mountKeyPanel/chat), when they choose to bring one. Either way nothing is
// billed to this site and nothing leaves the browser except, optionally, a
// call the visitor's own key pays for.

import { mountKeyPanel, chat, hasKey } from "./lib/byok.js";
import { rankFor, nextRankFor, newScenario, heuristicScore, parseJudgeReply, judgeSystemPrompt } from "./lib/scoring.js";

const STORE_KEY = "barbcourt:v1";

// The optional real judge, via the visitor's own key. Falls back to the
// house decorum-meter (see the catch around its call site below) on any
// network error, dead key, or reply that doesn't match the requested format.
async function llmScore(scenario, remark, provider) {
  const raw = await chat(
    `The provocation, delivered by ${scenario.name}: "${scenario.text}"\n\nThe reply, delivered in company: "${remark}"`,
    { provider, maxTokens: 200, system: judgeSystemPrompt() },
  );
  return parseJudgeReply(raw);
}

// --- persistence -------------------------------------------------------------
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { standing: 0, history: [], bestRemark: null };
    const parsed = JSON.parse(raw);
    return {
      standing: parsed.standing || 0,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      bestRemark: parsed.bestRemark || null,
    };
  } catch {
    return { standing: 0, history: [], bestRemark: null };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / storage disabled — the round still plays, it just won't persist */
  }
}

// --- wiring --------------------------------------------------------------
let state = loadState();
let scenario = newScenario();
let judgeProvider = null;

const els = {
  rank: document.getElementById("rank"),
  standing: document.getElementById("standing"),
  progressFill: document.getElementById("progress-fill"),
  progressLabel: document.getElementById("progress-label"),
  scenario: document.getElementById("scenario"),
  remark: document.getElementById("remark"),
  charcount: document.getElementById("charcount"),
  deliver: document.getElementById("deliver"),
  result: document.getElementById("result"),
  history: document.getElementById("history"),
  shareBluesky: document.getElementById("share-bluesky"),
  shareCard: document.getElementById("share-card"),
  reset: document.getElementById("reset"),
  judgeNote: document.getElementById("judge-note"),
};

function renderStanding() {
  const rank = rankFor(state.standing);
  const next = nextRankFor(state.standing);
  els.rank.textContent = rank.title;
  els.standing.textContent = String(state.standing);
  if (next) {
    const span = next.min - rank.min;
    const into = state.standing - rank.min;
    els.progressFill.style.width = `${Math.round((into / span) * 100)}%`;
    els.progressLabel.textContent = `${next.min - state.standing} to ${next.title}`;
  } else {
    els.progressFill.style.width = "100%";
    els.progressLabel.textContent = "There is nowhere higher to climb.";
  }
}

function renderScenario() {
  els.scenario.textContent = scenario.text;
  els.remark.value = "";
  els.charcount.textContent = "0";
  els.result.hidden = true;
  els.result.className = "";
}

function renderHistory() {
  els.history.innerHTML = "";
  for (const h of state.history.slice(0, 8)) {
    const li = document.createElement("li");
    li.className = `verdict-${h.verdict.toLowerCase()}`;
    const q = document.createElement("span");
    q.className = "hq";
    q.textContent = `“${h.remark}”`;
    const s = document.createElement("span");
    s.className = "hs";
    s.textContent = ` — ${h.score} (${h.verdict})`;
    li.appendChild(q);
    li.appendChild(s);
    els.history.appendChild(li);
  }
}

function buildShareText() {
  const rank = rankFor(state.standing);
  const line = state.bestRemark
    ? ` My best cut: "${state.bestRemark.remark}" (${state.bestRemark.score}/100).`
    : "";
  return (
    `I have risen to ${rank.title} (${state.standing} standing) at barbcourt — ` +
    `a Victorian court of manners where wit is the only rank that matters.${line} ` +
    `https://barbcourt.bisks.net/`
  );
}

els.remark.addEventListener("input", () => {
  els.charcount.textContent = String(els.remark.value.length);
  els.deliver.disabled = els.remark.value.trim().length === 0;
});

els.deliver.dataset.mode = "deliver";

els.deliver.addEventListener("click", async () => {
  if (els.deliver.dataset.mode === "next") {
    scenario = newScenario();
    renderScenario();
    els.deliver.dataset.mode = "deliver";
    els.deliver.textContent = "Deliver the cut";
    els.deliver.disabled = true;
    return;
  }

  const remark = els.remark.value.trim();
  if (!remark) return;

  els.deliver.disabled = true;
  els.deliver.textContent = judgeProvider ? "The panel deliberates…" : "The room reacts…";

  let outcome;
  try {
    if (judgeProvider && hasKey(judgeProvider)) {
      outcome = await llmScore(scenario, remark, judgeProvider);
    } else {
      outcome = heuristicScore(remark);
    }
  } catch (err) {
    // A dead key, a rate limit, a network blip — the house judge always
    // works, so a failed real judge falls back to it rather than stalling
    // the game on someone else's API outage.
    console.warn("llm judge failed, falling back to house scoring:", err);
    outcome = heuristicScore(remark);
  }

  const entry = { scenario: scenario.text, remark, ...outcome, ts: Date.now() };
  const prevRank = rankFor(state.standing);
  state.standing += outcome.score;
  state.history.unshift(entry);
  state.history = state.history.slice(0, 50);
  if (!state.bestRemark || outcome.score > state.bestRemark.score) state.bestRemark = entry;
  saveState(state);

  const newRank = rankFor(state.standing);
  els.result.hidden = false;
  els.result.className = `verdict-${outcome.verdict.toLowerCase()}`;
  els.result.innerHTML = "";

  const scoreLine = document.createElement("div");
  scoreLine.className = "score-line";
  scoreLine.textContent = `${outcome.score} / 100 — ${outcome.verdict}`;
  const reactionLine = document.createElement("div");
  reactionLine.className = "reaction-line";
  reactionLine.textContent = outcome.reaction;
  els.result.appendChild(scoreLine);
  els.result.appendChild(reactionLine);

  if (newRank.title !== prevRank.title) {
    const rankUp = document.createElement("div");
    rankUp.className = "rankup";
    rankUp.textContent = `You are received anew: ${newRank.title}.`;
    els.result.appendChild(rankUp);
  }

  renderStanding();
  renderHistory();

  els.deliver.textContent = "Face the next provocation";
  els.deliver.disabled = false;
  els.deliver.dataset.mode = "next";
});

els.reset.addEventListener("click", () => {
  if (!confirm("Forget your standing at court and start again as a nobody?")) return;
  state = { standing: 0, history: [], bestRemark: null };
  saveState(state);
  renderStanding();
  renderHistory();
});

els.shareBluesky.addEventListener("click", () => {
  els.shareBluesky.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(buildShareText())}`;
});

els.shareCard.addEventListener("click", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  const rank = rankFor(state.standing);

  ctx.fillStyle = "#f4ecd8";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = "#6b1f2a";
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, 1152, 582);
  ctx.strokeStyle = "#241c15";
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 40, 1120, 550);

  ctx.fillStyle = "#241c15";
  ctx.textAlign = "center";
  ctx.font = "italic 28px Georgia, serif";
  ctx.fillText("barbcourt", 600, 120);
  ctx.font = "bold 56px Georgia, serif";
  ctx.fillStyle = "#6b1f2a";
  ctx.fillText(rank.title, 600, 210);
  ctx.fillStyle = "#241c15";
  ctx.font = "24px Georgia, serif";
  ctx.fillText(`${state.standing} standing at court`, 600, 260);

  if (state.bestRemark) {
    ctx.font = "italic 26px Georgia, serif";
    wrapCanvasText(ctx, `“${state.bestRemark.remark}”`, 600, 360, 900, 36);
    ctx.font = "20px Georgia, serif";
    ctx.fillText(`— ${state.bestRemark.score}/100, ${state.bestRemark.verdict}`, 600, 470);
  }

  ctx.font = "20px Georgia, serif";
  ctx.fillStyle = "#6b1f2a";
  ctx.fillText("barbcourt.bisks.net", 600, 570);

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], "barbcourt.png", { type: "image/png" });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: buildShareText(), title: "barbcourt" });
        return;
      } catch {
        /* fall through to download */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "barbcourt.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
});

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

mountKeyPanel("#judge-panel", {
  capability: "chat",
  title: "Who judges you",
  blurb: "Optional. Skip it and the house decorum-meter judges instead — paste a key only if you want a real model reading the room.",
  onChange: (ready, provider) => {
    judgeProvider = ready ? provider : null;
    els.judgeNote.textContent = ready
      ? `${provider} is judging your remarks.`
      : "The house decorum-meter is judging your remarks.";
  },
});

renderStanding();
renderScenario();
renderHistory();
els.deliver.disabled = true;
