import { CAST, APPROACHES, DAYS, newGame, date, confess, endingText, heartsOf, cast } from "./dating-logic.js";

const $ = (id) => document.getElementById(id);
let g = newGame(), who = null;
const MARK = { loved: "💖", liked: "💗", meh: "😐", ouch: "💔" };

function render() {
  $("hDay").textContent = Math.min(g.day, DAYS);
  $("hPick").hidden = g.phase === "over";
  $("hCast").innerHTML = CAST.map((c) => {
    const n = heartsOf(g, c.id);
    const tried = APPROACHES.filter((a) => g.seen[c.id][a.id]).map((a) => a.glyph + MARK[g.seen[c.id][a.id]]).join(" ");
    return `<button class="person${who === c.id ? " sel" : ""}" data-id="${c.id}" ${g.phase === "play" ? "" : "disabled"}>` +
      `<span class="face">${c.glyph}</span><b>${c.name}</b><span class="hearts">${"♥".repeat(n)}${"♡".repeat(8 - n)}</span>` +
      `<small>${c.blurb}</small><small>${tried}</small></button>`;
  }).join("");
  const playing = g.phase === "play";
  $("hHow").hidden = !(playing && who);
  $("hHowTitle").textContent = who ? `how do you spend day ${g.day} with ${cast(who).name}?` : "";
  $("hApproaches").innerHTML = APPROACHES.map((a) =>
    `<button data-how="${a.id}" title="${a.text}">${a.glyph} ${a.name}</button>`).join("");
  $("hConfess").hidden = g.phase !== "confess";
  $("hConfessBtns").innerHTML = CAST.map((c) => `<button data-who="${c.id}">${c.glyph} confess to ${c.name}</button>`).join("") +
    `<button data-who="">walk away</button>`;
  $("hLog").textContent = g.ending ? endingText(g.ending)
    : g.last ? `${MARK[g.last.tier]} ${g.last.line}`
    : "pick a piece to spend today with. each loves a different way of being approached. hearts fade for anyone you ignore.";
  $("hLog").className = g.ending ? "end" : "";
  $("hShare").hidden = !g.ending;
  if (g.ending) {
    const e = g.ending, name = e.who ? cast(e.who).name : null;
    const txt = e.kind === "checkmate" ? `I won ${name}'s heart in Chess Heart, the chess dating sim. Checkmate. 💘`
      : e.kind === "friends" ? `${name} friend-zoned me in Chess Heart, the chess dating sim. Draw by mutual respect.`
      : e.kind === "rejected" ? `${name} rejected me in Chess Heart, the chess dating sim. I resigned.`
      : "I walked away from every date in Chess Heart, the chess dating sim. Stalemate.";
    $("hShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#dating");
  }
}

$("hCast").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b || g.phase !== "play") return;
  who = b.dataset.id; render();
});
$("hApproaches").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-how]");
  if (!b || !who) return;
  date(g, who, b.dataset.how); who = null; render();
});
$("hConfessBtns").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-who]");
  if (!b) return;
  confess(g, b.dataset.who || null); render();
});
$("hRestart").addEventListener("click", () => { g = newGame(); who = null; render(); });
render();
