// thunderdome of thought — arena logic. Pure client-side: pick a concept,
// two of its rival framings fight, you crown a winner, ELO tracks the board.
// King-of-the-hill: the winner defends against a fresh random challenger
// every round, so a run of wins reads as a streak, not just a single vote.

const ELO_KEY = "thoughtdome:elo:v1";
const LAST_CONCEPT_KEY = "thoughtdome:lastConcept";
const K = 32;

const els = {
  select: document.getElementById("concept-select"),
  spark: document.getElementById("concept-spark"),
  banner: document.getElementById("duel-banner"),
  fighterA: document.getElementById("fighter-a"),
  fighterB: document.getElementById("fighter-b"),
  badgeA: document.getElementById("badge-a"),
  badgeB: document.getElementById("badge-b"),
  framingA: document.getElementById("framing-a"),
  framingB: document.getElementById("framing-b"),
  definitionA: document.getElementById("definition-a"),
  definitionB: document.getElementById("definition-b"),
  tauntA: document.getElementById("taunt-a"),
  tauntB: document.getElementById("taunt-b"),
  ratingA: document.getElementById("rating-a"),
  ratingB: document.getElementById("rating-b"),
  shareDuel: document.getElementById("share-duel"),
  resetConcept: document.getElementById("reset-concept"),
  leaderboardTitle: document.getElementById("leaderboard-title"),
  leaderboardList: document.getElementById("leaderboard-list"),
  leaderboardEmpty: document.getElementById("leaderboard-empty"),
};

const state = {
  concepts: [],
  conceptId: null,
  champion: { senseId: null, streak: 0 },
  challenger: { senseId: null },
  previousChallengerId: null,
  duelLocked: false,
  animating: false,
};

function loadElo() {
  try {
    return JSON.parse(localStorage.getItem(ELO_KEY)) || {};
  } catch {
    return {};
  }
}

function saveElo(store) {
  localStorage.setItem(ELO_KEY, JSON.stringify(store));
}

function ratingKey(conceptId, senseId) {
  return conceptId + ":" + senseId;
}

function getRating(store, conceptId, senseId) {
  return store[ratingKey(conceptId, senseId)] || { elo: 1000, wins: 0, losses: 0 };
}

function updateElo(conceptId, winnerSenseId, loserSenseId) {
  const store = loadElo();
  const wKey = ratingKey(conceptId, winnerSenseId);
  const lKey = ratingKey(conceptId, loserSenseId);
  const wr = store[wKey] || { elo: 1000, wins: 0, losses: 0 };
  const lr = store[lKey] || { elo: 1000, wins: 0, losses: 0 };

  const expectedW = 1 / (1 + Math.pow(10, (lr.elo - wr.elo) / 400));
  wr.elo = Math.round(wr.elo + K * (1 - expectedW));
  lr.elo = Math.round(lr.elo + K * (0 - (1 - expectedW)));
  wr.wins += 1;
  lr.losses += 1;

  store[wKey] = wr;
  store[lKey] = lr;
  saveElo(store);
}

function currentConcept() {
  return state.concepts.find((c) => c.id === state.conceptId);
}

function senseById(concept, senseId) {
  return concept.senses.find((s) => s.id === senseId);
}

function randomSenseId(concept, excludeIds) {
  const pool = concept.senses.filter((s) => !excludeIds.includes(s.id));
  const choices = pool.length ? pool : concept.senses;
  return choices[Math.floor(Math.random() * choices.length)].id;
}

function drawFreshPair(concept) {
  const a = randomSenseId(concept, []);
  const b = randomSenseId(concept, [a]);
  return { a, b };
}

function parseDuelPath() {
  const m = location.pathname.match(/^\/duel\/([^/]+)\/([^/]+)\/([^/]+)\/?$/);
  if (!m) return null;
  return {
    conceptId: decodeURIComponent(m[1]),
    a: decodeURIComponent(m[2]),
    b: decodeURIComponent(m[3]),
  };
}

function clearDuelUrl() {
  if (location.pathname !== "/") {
    history.replaceState(null, "", "/");
  }
}

function setupConcept(conceptId, presetPair) {
  const concept = state.concepts.find((c) => c.id === conceptId) || state.concepts[0];
  state.conceptId = concept.id;
  localStorage.setItem(LAST_CONCEPT_KEY, concept.id);

  if (presetPair && senseById(concept, presetPair.a) && senseById(concept, presetPair.b)) {
    state.champion = { senseId: presetPair.a, streak: 0 };
    state.challenger = { senseId: presetPair.b };
    state.duelLocked = true;
  } else {
    const { a, b } = drawFreshPair(concept);
    state.champion = { senseId: a, streak: 0 };
    state.challenger = { senseId: b };
    state.duelLocked = false;
  }
  state.previousChallengerId = state.challenger.senseId;
  els.select.value = concept.id;
  els.banner.hidden = !state.duelLocked;
  render();
}

function fmtRecord(r) {
  return r.wins + "W–" + r.losses + "L";
}

function render() {
  const concept = currentConcept();
  els.spark.textContent = concept.spark ? "— " + concept.spark : "";
  els.leaderboardTitle.textContent = "standings: " + concept.label;

  const champSense = senseById(concept, state.champion.senseId);
  const challSense = senseById(concept, state.challenger.senseId);
  const store = loadElo();
  const champRating = getRating(store, concept.id, champSense.id);
  const challRating = getRating(store, concept.id, challSense.id);

  els.framingA.textContent = champSense.framing;
  els.definitionA.textContent = champSense.definition;
  els.tauntA.textContent = "“" + champSense.taunt + "”";
  els.ratingA.textContent = "ELO " + champRating.elo + " · " + fmtRecord(champRating);

  els.framingB.textContent = challSense.framing;
  els.definitionB.textContent = challSense.definition;
  els.tauntB.textContent = "“" + challSense.taunt + "”";
  els.ratingB.textContent = "ELO " + challRating.elo + " · " + fmtRecord(challRating);

  if (state.champion.streak > 0) {
    els.badgeA.hidden = false;
    els.badgeA.textContent = "defending · streak " + state.champion.streak;
  } else {
    els.badgeA.hidden = true;
  }
  els.badgeB.hidden = true;

  els.fighterA.classList.remove("win", "lose");
  els.fighterB.classList.remove("win", "lose");

  const url =
    location.origin +
    "/duel/" +
    encodeURIComponent(concept.id) +
    "/" +
    encodeURIComponent(champSense.id) +
    "/" +
    encodeURIComponent(challSense.id);
  const shareText =
    "“" +
    champSense.framing +
    "” vs “" +
    challSense.framing +
    "”: who's right about " +
    concept.label +
    "? Settle it in the Thunderdome of Thought → " +
    url;
  els.shareDuel.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  renderLeaderboard(concept, store);
}

function renderLeaderboard(concept, store) {
  const rows = concept.senses.map((s) => {
    const r = getRating(store, concept.id, s.id);
    return { framing: s.framing, ...r };
  });
  const played = rows.filter((r) => r.wins + r.losses > 0);
  if (!played.length) {
    els.leaderboardList.innerHTML = "";
    els.leaderboardEmpty.hidden = false;
    return;
  }
  els.leaderboardEmpty.hidden = true;
  rows.sort((a, b) => b.elo - a.elo);
  els.leaderboardList.innerHTML = rows
    .map((r, i) => {
      const record = r.wins + r.losses > 0 ? fmtRecord(r) : "unfought";
      return (
        '<li><span class="rank">' +
        (i + 1) +
        '</span><span class="name">' +
        r.framing +
        '</span><span class="record">' +
        record +
        '</span><span class="elo">' +
        r.elo +
        "</span></li>"
      );
    })
    .join("");
}

function vote(side) {
  if (state.animating) return;
  const concept = currentConcept();
  const winner = side === "a" ? state.champion.senseId : state.challenger.senseId;
  const loser = side === "a" ? state.challenger.senseId : state.champion.senseId;

  state.animating = true;
  els.fighterA.classList.add(side === "a" ? "win" : "lose");
  els.fighterB.classList.add(side === "b" ? "win" : "lose");

  updateElo(concept.id, winner, loser);

  if (state.duelLocked) {
    state.duelLocked = false;
    els.banner.hidden = true;
    clearDuelUrl();
  }

  setTimeout(() => {
    if (side === "a") {
      state.champion.streak += 1;
    } else {
      state.champion = { senseId: state.challenger.senseId, streak: 1 };
    }
    const nextChallenger = randomSenseId(concept, [
      state.champion.senseId,
      state.previousChallengerId,
    ]);
    state.previousChallengerId = nextChallenger;
    state.challenger = { senseId: nextChallenger };
    state.animating = false;
    render();
  }, 420);
}

function resetConceptBoard() {
  const concept = currentConcept();
  if (!confirm("Clear the ELO board for " + concept.label + "? This can't be undone.")) return;
  const store = loadElo();
  Object.keys(store)
    .filter((k) => k.startsWith(concept.id + ":"))
    .forEach((k) => delete store[k]);
  saveElo(store);
  render();
}

async function init() {
  const res = await fetch("data/concepts.json");
  const data = await res.json();
  state.concepts = data.concepts;

  els.select.innerHTML = state.concepts
    .map((c) => '<option value="' + c.id + '">' + c.label + "</option>")
    .join("");

  const duel = parseDuelPath();
  if (duel && state.concepts.some((c) => c.id === duel.conceptId)) {
    setupConcept(duel.conceptId, { a: duel.a, b: duel.b });
  } else {
    const last = localStorage.getItem(LAST_CONCEPT_KEY);
    const startId = state.concepts.some((c) => c.id === last) ? last : state.concepts[0].id;
    setupConcept(startId, null);
  }

  els.fighterA.addEventListener("click", () => vote("a"));
  els.fighterB.addEventListener("click", () => vote("b"));
  els.resetConcept.addEventListener("click", resetConceptBoard);
  els.select.addEventListener("change", (e) => setupConcept(e.target.value, null));

  document.addEventListener("keydown", (e) => {
    if (document.activeElement === els.select) return;
    if (e.key === "ArrowLeft") vote("a");
    else if (e.key === "ArrowRight") vote("b");
  });
}

init();
