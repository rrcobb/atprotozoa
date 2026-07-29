// cutitclose — a CYOA race to the gate. Pick a departure time, a way to the
// airport, where to park, which security line to gamble on, and how hard to
// hustle down the concourse. Score is how close you land to "last call"
// boarding without going over it. Pure client-side, no server, no seed —
// every run is a fresh random scenario.

const DESTINATIONS = [
  { to: "Lisbon", flight: "TP 1584" },
  { to: "Reykjavík", flight: "FI 615" },
  { to: "Osaka", flight: "NH 6" },
  { to: "Mexico City", flight: "AM 405" },
  { to: "Nairobi", flight: "KQ 101" },
  { to: "Vancouver", flight: "AC 8" },
  { to: "Auckland", flight: "NZ 2" },
  { to: "Marrakesh", flight: "AT 943" },
  { to: "Reykjavík", flight: "FI 415" },
  { to: "Buenos Aires", flight: "AR 1303" },
  { to: "Seoul", flight: "KE 82" },
  { to: "Dakar", flight: "SN 251" },
];

const GATE_LETTERS = "ABCDEFGHJK";

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function fmtClock(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60), mm = m % 60;
  const ap = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return h12 + ":" + String(mm).padStart(2, "0") + " " + ap;
}
function fmtDur(min) {
  min = Math.round(min);
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60), m = min % 60;
  return h + "h" + (m ? " " + m + "m" : "");
}

function newScenario() {
  const dest = pick(DESTINATIONS);
  const gate = pick(GATE_LETTERS.split("")) + randInt(1, 42);
  const nowMin = randInt(6 * 60, 20 * 60);
  const gapMin = randInt(105, 260);
  const hasPrecheck = Math.random() < 0.5;
  return {
    dest, gate, hasPrecheck,
    nowMin, lastCallMin: nowMin + gapMin,
    clock: nowMin,
    mode: null,
    stepsOrder: ["leave", "transport", "parking", "security", "concourse"],
    stepPos: 0,
    log: [],
  };
}

// ── scene definitions ───────────────────────────────────────────────────
const SCENES = {
  leave(state) {
    return {
      narrative: `It's <b>${fmtClock(state.nowMin)}</b>. ${state.dest.flight} to <b>${state.dest.to}</b> — last call — is <b>${fmtClock(state.lastCallMin)}</b> at gate <b>${state.gate}</b>. You're still at home.`,
      choices: [
        { id: "now", label: "Grab your bag and go — right now", meta: "no dawdling", min: 0, max: 4,
          outcomes: ["You're out the door before you've finished the thought."] },
        { id: "coffee", label: "Finish your coffee first", meta: "~10–15 min", min: 9, max: 16,
          outcomes: ["Worth it. Probably."] },
        { id: "show", label: "“One more episode” — you know how this goes", meta: "~20–35 min", min: 20, max: 36,
          outcomes: ["Reader, it was not one episode."] },
        { id: "pack", label: "You still need to pack", meta: "~40–65 min", min: 40, max: 66,
          outcomes: ["Passport located twice, out of pure paranoia."] },
      ],
    };
  },
  transport(state) {
    return {
      narrative: `Time to get to the airport. Gate <b>${state.gate}</b> isn't going to walk to you.`,
      choices: [
        { id: "drive", label: "Drive yourself and park", meta: "~35–55 min, then parking", min: 35, max: 56,
          riskChance: 0.25, riskMin: 10, riskMax: 25, riskText: "Traffic backs up out of nowhere on the interstate.",
          outcomes: ["Merge, merge, merge. You made it to the exit."] },
        { id: "uber", label: "Order a rideshare", meta: "~25–45 min", min: 25, max: 46,
          riskChance: 0.3, riskMin: 8, riskMax: 20, riskText: "Two drivers cancel on you before one actually shows.",
          outcomes: ["Your driver has Views about the freeway and shares every one."] },
        { id: "taxi", label: "Queue for a taxi", meta: "~30–50 min", min: 30, max: 51,
          riskChance: 0.15, riskMin: 10, riskMax: 15, riskText: "The dispatcher sends your cab to the wrong pickup point.",
          outcomes: ["Meter's running. So are you, mentally."] },
        { id: "train", label: "Catch the airport train", meta: "wait + ride", min: 25, max: 50,
          riskChance: 0.2, riskMin: 10, riskMax: 20, riskText: "Signal failure two stops out — everyone stands very still.",
          outcomes: ["You get a seat. A small miracle."] },
        { id: "bus", label: "Take the airport bus", meta: "~45–70 min, cheapest", min: 45, max: 71,
          riskChance: 0.3, riskMin: 15, riskMax: 30, riskText: "The bus makes every single stop, then a few that aren't stops.",
          outcomes: ["You've bonded with a stranger over the shared suffering."] },
      ],
    };
  },
  parking(state) {
    return {
      narrative: `You pull into airport parking. Gate <b>${state.gate}</b> is somewhere past all this.`,
      choices: [
        { id: "economy", label: "Economy lot", meta: "cheap, far, shuttle wait", min: 12, max: 23,
          outcomes: ["The shuttle finally, finally arrives."] },
        { id: "garage", label: "Short-term garage", meta: "pricier, closer, no shuttle", min: 6, max: 13,
          outcomes: ["Top floor, obviously. At least it's close to the door."] },
        { id: "dropoff", label: "Circle for curbside drop-off", meta: "fast if it works", min: 3, max: 9,
          riskChance: 0.35, riskMin: 10, riskMax: 20, riskText: "Every curb spot is taken. You loop the terminal twice.",
          outcomes: ["A spot opens up right as someone else eyes it. Yours now."] },
      ],
    };
  },
  security(state) {
    const choices = [];
    if (state.hasPrecheck) {
      choices.push({ id: "precheck", label: "TSA PreCheck lane", meta: "shoes stay on", min: 4, max: 9,
        outcomes: ["Laptop stays in the bag. This is the good timeline."] });
    }
    choices.push(
      { id: "standard", label: "Standard line", meta: "the usual gauntlet", min: 12, max: 26,
        riskChance: 0.25, riskMin: 10, riskMax: 20, riskText: "A family ahead discovers the liquids rule for the first time, live.",
        outcomes: ["Belt, shoes, laptop, repeat."] },
      { id: "gamble", label: "Gamble on the line that looks shortest", meta: "could go either way", min: 5, max: 16,
        riskChance: 0.4, riskMin: 15, riskMax: 30, riskText: "It was a trap: a school trip of 40 kids, all with metal water bottles.",
        outcomes: ["Read the room right for once — through in a flash."] },
    );
    return { narrative: "Bags on the belt. Which line?", choices };
  },
  concourse(state) {
    return {
      narrative: `Through security. Gate <b>${state.gate}</b> is, of course, at the far end.`,
      choices: [
        { id: "walk", label: "Walk at a normal pace", meta: "no need to sweat", min: 8, max: 17,
          outcomes: ["You ride the moving walkway like a civilized person."] },
        { id: "power", label: "Power-walk it", meta: "brisk, walkways included", min: 5, max: 11,
          outcomes: ["Overtaking people on the walkway is a personality trait now."] },
        { id: "run", label: "Run for it", meta: "full sprint", min: 3, max: 8,
          riskChance: 0.2, riskMin: 3, riskMax: 8, riskText: "You drop your boarding pass mid-sprint and have to double back for it.",
          outcomes: ["You are, briefly, an Olympic athlete."] },
        { id: "food", label: "Quick stop for food first", meta: "walk pace + a stop", min: 18, max: 34,
          outcomes: ["Worth it, honestly. Regrets: none."] },
      ],
    };
  },
};

function applicable(id, state) {
  if (id === "parking") return state.mode === "drive";
  return true;
}

// ── scoring ──────────────────────────────────────────────────────────────
function scoreFor(margin) {
  if (margin <= 2) return { score: 100, tier: "Threaded the needle" };
  if (margin <= 5) return { score: 92, tier: "Absolute legend" };
  if (margin <= 10) return { score: 80, tier: "Nailed it" };
  if (margin <= 20) return { score: 62, tier: "Comfortable" };
  if (margin <= 40) return { score: 42, tier: "Played it safe" };
  if (margin <= 70) return { score: 22, tier: "Way too early" };
  return { score: 8, tier: "Basically lived at the airport" };
}
function missedTier(lateBy) {
  if (lateBy <= 5) return "So close — the door just closed";
  if (lateBy <= 20) return "Missed it by a mile-ish";
  return "Not even close";
}

// ── rendering ────────────────────────────────────────────────────────────
const els = {
  board: document.getElementById("board"),
  clockStrip: document.getElementById("clockStrip"),
  log: document.getElementById("log"),
  scene: document.getElementById("scene"),
  result: document.getElementById("result"),
  shareBox: document.getElementById("shareBox"),
  shareCanvas: document.getElementById("shareCanvas"),
  shareNative: document.getElementById("shareNative"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  actions: document.getElementById("actions"),
  again: document.getElementById("again"),
};

let state;
let lastShareText = "";

function renderBoard() {
  els.board.innerHTML = `
    <div class="row"><span class="k">Flight</span><span class="v">${state.dest.flight} → ${state.dest.to}</span></div>
    <div class="row"><span class="k">Gate</span><span class="v">${state.gate}</span></div>
    <div class="row"><span class="k">Last call</span><span class="v">${fmtClock(state.lastCallMin)}</span></div>
    <div class="row"><span class="k">TSA PreCheck</span><span class="v small">${state.hasPrecheck ? "yes" : "no"}</span></div>
  `;
}

function renderClockStrip() {
  els.clockStrip.innerHTML = `
    <div class="c"><div class="t">${fmtClock(state.clock)}</div><div class="l">now</div></div>
    <div class="c last"><div class="t">${fmtClock(state.lastCallMin)}</div><div class="l">last call</div></div>
  `;
}

function renderLog() {
  els.log.innerHTML = state.log.map(
    (e) => `<li><span class="lt">${e.label}</span><span class="ld">+${fmtDur(e.delta)}</span></li>`
  ).join("");
}

function renderScene() {
  const id = state.stepsOrder[state.stepPos];
  const def = SCENES[id](state);
  els.scene.innerHTML = `
    <p class="narrative">${def.narrative}</p>
    <div class="choices">
      ${def.choices.map((c, i) => `
        <button class="choice" data-i="${i}">
          <span class="clabel">${c.label}</span>
          <span class="cmeta">${c.meta}</span>
        </button>
      `).join("")}
    </div>
  `;
  els.scene.querySelectorAll(".choice").forEach((btn) => {
    btn.addEventListener("click", () => resolveChoice(id, def.choices[Number(btn.dataset.i)]));
  });
}

function resolveChoice(sceneId, choice) {
  let delta = randInt(choice.min, choice.max);
  let risk = false;
  let text = pick(choice.outcomes);
  if (choice.riskChance && Math.random() < choice.riskChance) {
    risk = true;
    delta += randInt(choice.riskMin, choice.riskMax);
    text = choice.riskText;
  }
  state.clock += delta;
  if (sceneId === "transport") state.mode = choice.id;
  state.log.push({ label: choice.label, delta });
  renderLog();
  renderClockStrip();

  els.scene.innerHTML = `
    <div class="outcome">
      ${text}
      <div style="margin-top:8px">Added <span class="delta ${risk ? "risk" : ""}">${risk ? "⚠ " : ""}+${fmtDur(delta)}</span> — now <b style="color:var(--amber)">${fmtClock(state.clock)}</b></div>
    </div>
    <button class="btn" id="continueBtn">Continue →</button>
  `;
  document.getElementById("continueBtn").addEventListener("click", advance);
}

function advance() {
  state.stepPos++;
  while (state.stepPos < state.stepsOrder.length && !applicable(state.stepsOrder[state.stepPos], state)) {
    state.stepPos++;
  }
  if (state.stepPos >= state.stepsOrder.length) {
    finishGame();
  } else {
    renderScene();
  }
}

function finishGame() {
  const margin = state.lastCallMin - state.clock;
  const missed = margin < 0;
  els.scene.innerHTML = "";
  els.result.hidden = false;
  els.actions.hidden = false;

  let tier, score, marginText;
  if (missed) {
    const lateBy = -margin;
    tier = missedTier(lateBy);
    score = 0;
    marginText = `You arrived at ${fmtClock(state.clock)} — ${fmtDur(lateBy)} after last call. Gate's closed.`;
    els.result.classList.add("missed");
  } else {
    const s = scoreFor(margin);
    tier = s.tier;
    score = s.score;
    marginText = margin <= 2
      ? `You boarded at ${fmtClock(state.clock)} — cutting it about as close as physically possible.`
      : `You arrived at ${fmtClock(state.clock)}, ${fmtDur(margin)} before last call.`;
    els.result.classList.remove("missed");
  }

  els.result.innerHTML = `
    <div class="tier">${tier}</div>
    <div class="margin">${marginText}</div>
    <div class="score">Score: <b>${score}</b> / 100</div>
  `;

  const shareText = buildShareText(state, missed, margin, tier, score);
  lastShareText = shareText;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  buildShareCard(state, missed, margin, tier, score);
  els.shareBox.classList.add("show");
}

function buildShareText(state, missed, margin, tier, score) {
  const url = "bisks.net/games/cutitclose";
  if (missed) {
    return `I missed my flight to ${state.dest.to} by ${fmtDur(-margin)} in cutitclose — "${tier}". Score: 0. Can you land it closer? ${url}`;
  }
  return `I made my flight to ${state.dest.to} with ${fmtDur(margin)} to spare in cutitclose — "${tier}" (${score}/100). Can you cut it closer? ${url}`;
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy + lineHeight;
}

function buildShareCard(state, missed, margin, tier, score) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "ui-monospace, monospace";

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a0e17";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, -H * 0.1, 0, W * 0.5, -H * 0.1, W * 0.6);
  glow.addColorStop(0, "#26200f");
  glow.addColorStop(1, "rgba(10,14,23,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffb238";
  ctx.font = `800 52px ${mono}`;
  ctx.fillText("✈ cutitclose", 60, 96);

  ctx.fillStyle = "#7c8aa3";
  ctx.font = `400 20px ${mono}`;
  ctx.fillText(`${state.dest.flight} → ${state.dest.to}  ·  gate ${state.gate}`, 60, 134);

  const cardX = 60, cardY = 190, cardW = W - 120, cardH = H - 260;
  ctx.fillStyle = "#10141f";
  ctx.strokeStyle = missed ? "#4a2020" : "#232b3d";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 18);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = missed ? "#ff5c5c" : "#3ddc84";
  ctx.font = `800 46px ${mono}`;
  ctx.fillText(tier, W / 2, cardY + 78);

  ctx.fillStyle = "#eef1fb";
  ctx.font = `400 24px ${mono}`;
  const marginLine = missed
    ? `arrived ${fmtDur(-margin)} after last call`
    : `landed ${fmtDur(margin)} before last call`;
  ctx.fillText(marginLine, W / 2, cardY + 122);

  ctx.fillStyle = "#ffb238";
  ctx.font = `700 30px ${mono}`;
  ctx.fillText(`score: ${score} / 100`, W / 2, cardY + 168);

  // mini timeline
  ctx.textAlign = "left";
  ctx.font = `400 16px ${mono}`;
  let ly = cardY + 216;
  ctx.fillStyle = "#7c8aa3";
  ctx.fillText("YOUR ROUTE", cardX + 40, ly);
  ly += 28;
  state.log.slice(0, 5).forEach((e) => {
    ctx.fillStyle = "#eef1fb";
    ctx.font = `400 16px ${mono}`;
    ly = wrapCanvasText(ctx, `· ${e.label} (+${fmtDur(e.delta)})`, cardX + 40, ly, cardW - 80, 22) + 2;
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "#4fd1c5";
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("bisks.net/games/cutitclose", 60, H - 40);
}

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cutitclose-run.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}
if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "cutitclose-run.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "cutitclose" });
      } catch (_) {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

function startGame() {
  state = newScenario();
  els.result.hidden = true;
  els.result.classList.remove("missed");
  els.actions.hidden = true;
  els.shareBox.classList.remove("show");
  renderBoard();
  renderClockStrip();
  renderLog();
  renderScene();
}

els.again.addEventListener("click", startGame);
startGame();
