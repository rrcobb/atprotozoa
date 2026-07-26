// Spot the AI — client-side quiz. All logic runs in the browser against
// /images/manifest.json; no server surface needed for this site.

const screens = {
  intro: document.getElementById("intro"),
  quiz: document.getElementById("quiz"),
  results: document.getElementById("results"),
};

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle("active", key === name);
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let manifest = null;
let rounds = [];
let roundIndex = 0;
let score = 0;
let answered = false;

async function loadManifest() {
  const res = await fetch("/images/manifest.json");
  manifest = await res.json();
}

function buildRounds() {
  // Pair each AI image with a human image of the same `subject` when one is
  // still available, so a round pits like against like (two witches, two
  // water spirits) instead of a random fantasy AI piece against a random
  // fairy tale illustration. Falls back to any unused human image otherwise.
  const ai = shuffle(manifest.ai);
  const humanPool = shuffle(manifest.human);
  const used = new Set();
  const pairs = ai.map((a) => {
    let idx = humanPool.findIndex((h) => !used.has(h.key) && h.subject === a.subject);
    if (idx === -1) idx = humanPool.findIndex((h) => !used.has(h.key));
    const human = humanPool[idx];
    used.add(human.key);
    return { ai: a, human };
  });
  rounds = shuffle(pairs).map((p) => ({
    ...p,
    aiOnLeft: Math.random() < 0.5,
  }));
}

function renderRound() {
  answered = false;
  document.getElementById("next-btn").disabled = true;
  document.getElementById("round-label").textContent = `Round ${roundIndex + 1} / ${rounds.length}`;
  document.getElementById("live-score").textContent = String(score);
  document.getElementById("progress-fill").style.width = `${(roundIndex / rounds.length) * 100}%`;

  const round = rounds[roundIndex];
  const left = round.aiOnLeft ? round.ai : round.human;
  const leftIsAI = round.aiOnLeft;
  const right = round.aiOnLeft ? round.human : round.ai;
  const rightIsAI = !round.aiOnLeft;

  const pairEl = document.getElementById("pair");
  pairEl.innerHTML = "";
  pairEl.appendChild(makeCard(left, leftIsAI, "A"));
  pairEl.appendChild(makeCard(right, rightIsAI, "B"));
}

function makeCard(item, isAI, letter) {
  const btn = document.createElement("button");
  btn.className = "pick";
  btn.innerHTML = `
    <img src="/images/${item.file}" alt="Illustration ${letter}" loading="lazy">
    <div class="label">Illustration ${letter}</div>
    <div class="reveal"></div>
  `;
  btn.addEventListener("click", () => onPick(btn, isAI, item));
  return btn;
}

function onPick(btn, isAI, item) {
  if (answered) return;
  answered = true;

  const cards = document.querySelectorAll(".pick");
  cards.forEach((c) => (c.disabled = true));

  if (isAI) {
    score++;
    btn.classList.add("correct");
  } else {
    btn.classList.add("incorrect");
  }

  const round = rounds[roundIndex];
  cards.forEach((c, i) => {
    const other = i === 0 ? round.aiOnLeft : !round.aiOnLeft;
    const otherItem = other ? round.ai : round.human;
    const otherIsAI = other;
    c.classList.add("revealed");
    const isCorrectSide = otherIsAI;
    if (isCorrectSide && c !== btn) c.classList.add("correct");
    c.querySelector(".reveal").innerHTML =
      `<strong>${otherIsAI ? "AI-generated" : "Human-made"}</strong> — ${escapeHtml(otherItem.artist)}`;
  });

  document.getElementById("live-score").textContent = String(score);
  document.getElementById("progress-fill").style.width = `${((roundIndex + 1) / rounds.length) * 100}%`;
  document.getElementById("next-btn").disabled = false;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function nextRound() {
  roundIndex++;
  if (roundIndex >= rounds.length) {
    showResults();
  } else {
    renderRound();
  }
}

function showResults() {
  document.getElementById("final-score").textContent = String(score);
  const verdicts = [
    [10, "Perfect eye. You cannot be fooled."],
    [8, "Very sharp — the machines rarely got past you."],
    [6, "Solid. You caught most of them."],
    [4, "A coin flip with extra steps."],
    [2, "The machines had their way with you."],
    [0, "Total AI upset. Never trust your eyes again."],
  ];
  const verdict = verdicts.find(([min]) => score >= min)[1];
  document.getElementById("verdict").textContent = verdict;
  showScreen("results");
}

function shareText() {
  return `I scored ${score}/${rounds.length} spotting AI-generated illustrations vs. human ones on Spot the AI. Think you can do better?`;
}

function share() {
  const url = "https://spot-the-ai.bisks.net";
  const intent = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText() + " " + url)}`;
  window.open(intent, "_blank", "noopener");
}

function renderCredits() {
  const grid = document.getElementById("credit-grid");
  grid.innerHTML = "";
  const all = [
    ...manifest.ai.map((i) => ({ ...i, kind: "ai" })),
    ...manifest.human.map((i) => ({ ...i, kind: "human" })),
  ].sort((a, b) => a.artist.localeCompare(b.artist));
  for (const item of all) {
    const div = document.createElement("div");
    div.innerHTML = `<span class="credit-tag ${item.kind}">${item.kind === "ai" ? "AI" : "HUMAN"}</span>` +
      `<a href="${item.source}" target="_blank" rel="noopener">${escapeHtml(item.artist)}</a> — ${item.license}`;
    grid.appendChild(div);
  }
}

async function init() {
  await loadManifest();
  renderCredits();

  document.getElementById("start-btn").addEventListener("click", () => {
    buildRounds();
    roundIndex = 0;
    score = 0;
    renderRound();
    showScreen("quiz");
  });

  document.getElementById("next-btn").addEventListener("click", nextRound);
  document.getElementById("share-btn").addEventListener("click", share);
  document.getElementById("replay-btn").addEventListener("click", () => {
    buildRounds();
    roundIndex = 0;
    score = 0;
    renderRound();
    showScreen("quiz");
  });
}

init();
