import { MAX_PLAY, MAX_JOKERS, ANTES, GLYPH, NAME, BLINDS, BOSSES, newRun, startRound, play, discard, jokerChoices, advance, score } from "./balatro-logic.js";

const $ = (id) => document.getElementById(id);
let run, picked = new Set(), choices = null, toast = "";

function reset() {
  run = newRun(); startRound(run); picked.clear(); choices = null; toast = "";
  $("bShare").hidden = true;
  ui();
}

const sorted = () => run.round.hand.slice().sort((a, b) => "pnbrqk".indexOf(a.t) - "pnbrqk".indexOf(b.t) || a.col.localeCompare(b.col));
const pickedCards = () => run.round.hand.filter((c) => picked.has(c.id));

function ui() {
  const r = run.round;
  const over = run.status === "won" || run.status === "failed";
  const blindName = r ? (run.blind === 2 ? BOSSES[run.ante].name : BLINDS[run.blind].name) : "";
  $("bAnte").textContent = Math.min(run.ante + 1, ANTES) + "/" + ANTES;
  $("bBlind").textContent = blindName;
  $("bTarget").textContent = r ? r.target : "–";
  $("bScore").textContent = r ? r.score : "–";
  $("bHands").textContent = r ? r.hands : "–";
  $("bDiscards").textContent = r ? r.discards : "–";
  $("bBoss").textContent = r && r.debuff ? `${blindName}: every ${NAME[r.debuff]} is debuffed (no chips, no joker triggers).` : "";
  $("bJokers").innerHTML = run.jokers.length
    ? run.jokers.map((j) => `<span class="joker" title="${j.text}"><b>${j.name}</b><br><small>${j.text}</small></span>`).join("")
    : `<span class="joker empty">no jokers yet — win a blind to pick one (${MAX_JOKERS} max)</span>`;

  const live = run.status === "playing";
  $("bHand").hidden = !live;
  $("bActions").hidden = !live;
  $("bPick").hidden = run.status !== "cleared";
  if (live) {
    $("bHand").innerHTML = sorted().map((c) =>
      `<button class="card ${c.col} ${picked.has(c.id) ? "up" : ""} ${r.debuff === c.t ? "deb" : ""}" data-id="${c.id}" aria-pressed="${picked.has(c.id)}">${GLYPH[c.col][c.t]}<small>${NAME[c.t]}</small></button>`).join("");
    const cards = pickedCards(), res = cards.length ? score(cards, run.jokers, { debuff: r.debuff, firstHand: r.played === 0, discardsLeft: r.discards }) : null;
    $("bPreview").textContent = res ? `${res.hand}: ${res.chips} chips × ${res.mult} = ${res.total}` : "select up to 5 pieces";
    $("bPlay").disabled = !cards.length;
    $("bDiscard").disabled = !cards.length || r.discards <= 0;
  }
  if (run.status === "cleared") {
    $("bPickTitle").textContent = `${blindName} cleared with ${r.score}/${r.target}. pick a joker:`;
    $("bChoices").innerHTML = choices.map((j, i) => `<button class="joker pick" data-i="${i}" ${run.jokers.length >= MAX_JOKERS ? "disabled" : ""}><b>${j.name}</b><br><small>${j.text}</small></button>`).join("");
    $("bSkip").textContent = run.jokers.length >= MAX_JOKERS ? "no room — continue" : "skip";
  }
  let msg = toast;
  if (run.status === "failed") msg = `out of hands: ${r.score}/${r.target}. the run ends at ante ${run.ante + 1}.`;
  if (run.status === "won") msg = "all five antes cleared. the giant queen is toppled.";
  $("bMsg").textContent = msg;
  $("bMsg").className = over ? "end" : "";
  if (over) {
    const txt = run.status === "won" ? `I beat Chess Balatro with ${run.jokers.map((j) => j.name).join(", ") || "no jokers"}.` : `My Chess Balatro run died at ante ${run.ante + 1} (${blindName}).`;
    $("bShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#balatro");
    $("bShare").hidden = false;
  }
}

$("bHand").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]"); if (!b || run.status !== "playing") return;
  const id = +b.dataset.id;
  if (picked.has(id)) picked.delete(id);
  else if (picked.size < MAX_PLAY) picked.add(id);
  ui();
});
$("bPlay").addEventListener("click", () => {
  const res = play(run, [...picked]); if (!res) return;
  picked.clear();
  toast = `${res.hand}: ${res.chips} × ${res.mult} = ${res.total}`;
  if (run.status === "cleared") choices = jokerChoices(run);
  ui();
});
$("bDiscard").addEventListener("click", () => {
  if (discard(run, [...picked])) { picked.clear(); toast = "discarded."; ui(); }
});
function next(j) { advance(run, j); picked.clear(); choices = null; toast = ""; ui(); }
$("bChoices").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]"); if (b && !b.disabled) next(choices[+b.dataset.i]);
});
$("bSkip").addEventListener("click", () => next(null));
$("bRestart").addEventListener("click", reset);

reset();
