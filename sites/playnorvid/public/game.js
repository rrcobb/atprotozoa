// answers: claim | heuristic | like | skip. Every post is invented.
const POSTS = [
  ["@pelican_ops", "Nobody has ever regretted writing the test first.", "claim"],
  ["@margins.example", "If a meeting could be an email, it's usually a doc.", "heuristic"],
  ["@soupfacts", "Lukewarm soup is the final form of all soup.", "skip"],
  ["@tinybridges", "Three of the five largest outages this year were a config push.", "claim"],
  ["@kettle.dev", "When in doubt, delete the abstraction and copy the file.", "heuristic"],
  ["@moss_and_co", "A bakery that is also a bike shop. Where else does this exist?", "like"],
  ["@dusk.fm", "just ate lunch at 4pm. no notes.", "skip"],
  ["@gridlines", "Median rent in the city rose 11% year over year.", "claim"],
  ["@halfpint", "Never trust a dashboard with more than seven colors.", "heuristic"],
  ["@orrery.xyz", "Software that turns your calendar into a garden. Anything like this?", "like"],
  ["@cranberrybog", "good morning to everyone except the printer", "skip"],
  ["@lintroller", "Rewrites are always slower than the estimate.", "claim"],
  ["@wren_notes", "Rule of thumb: pay for the thing that wakes you at night.", "heuristic"],
  ["@pocketatlas", "Maps that only show what you can walk to in ten minutes. Similar?", "like"],
  ["@sleepyfox", "my cat has learned to open the fridge. we are negotiating.", "skip"],
  ["@cairn.codes", "Static sites outlive every framework that built them.", "claim"],
  ["@bobbinlace", "If you can't explain it in a tweet, it isn't a feature yet.", "heuristic"],
  ["@reedbed", "A feed where posts age like cheese and get better. Who's building these?", "like"],
  ["@umbrellaman", "rain again lol", "skip"],
  ["@fathom.io", "Most startups die of indigestion, not starvation.", "claim"],
  ["@quillmark", "Go with the boring database unless you can name the reason.", "heuristic"],
  ["@loomhouse", "A text editor that's also a synthesizer. More like this?", "like"],
  ["@pennywhistle", "one (1) good sandwich can fix a tuesday", "skip"],
  ["@stonefruit", "Quote-posts get more replies than the posts they quote.", "claim"],
];
const GAME_MS = 60000;
const LABEL = { claim: "claim", heuristic: "heuristic", like: "what else is like this?", skip: "scroll on" };
const $ = (id) => document.getElementById(id);

let deck, cur, score, streak, best, endAt, timer, locked;

// Wrong answers play a physically modelled fart (fart.js, loaded as a module).
function fart() { if (window.playFart) window.playFart(); }

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function next() {
  if (!deck.length) deck = shuffle(POSTS);
  cur = deck.pop();
  $("who").textContent = cur[0];
  $("txt").textContent = cur[1];
  $("post").className = "post";
  locked = false;
}

function answer(a) {
  if (locked || !cur) return;
  locked = true;
  const ok = a === cur[2];
  $("post").className = "post " + (ok ? "ok" : "bad");
  if (ok) {
    streak++; best = Math.max(best, streak);
    score += 10 + Math.min(streak - 1, 10) * 2;
    $("fb").textContent = "tagged: " + LABEL[a] + ". correct.";
  } else {
    streak = 0; score = Math.max(0, score - 5);
    fart();
    $("fb").textContent = "tagged: " + LABEL[a] + ". it was: " + LABEL[cur[2]] + ". *fart noise*";
  }
  $("score").textContent = score;
  $("streak").textContent = streak;
  setTimeout(() => { if (endAt) next(); }, 450);
}

function tick() {
  const left = Math.max(0, endAt - Date.now());
  $("time").textContent = Math.ceil(left / 1000);
  $("barfill").style.transform = "scaleX(" + left / GAME_MS + ")";
  if (left <= 0) finish();
}

function rank(s) {
  if (s >= 400) return "full norvid. the buttons fear you.";
  if (s >= 250) return "senior quote-tagger";
  if (s >= 120) return "casual tagger. bawk.";
  if (s >= 40) return "you mostly scrolled on";
  return "this is just \"claim\" and a fart noise";
}

function finish() {
  clearInterval(timer);
  endAt = 0; cur = null;
  $("game").hidden = true;
  $("end").hidden = false;
  $("final").textContent = score;
  $("rank").textContent = rank(score) + " (best streak " + best + ")";
  const text = "I scored " + score + " playing norvid: " + rank(score) + " https://playnorvid.bisks.net/";
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

function start() {
  deck = shuffle(POSTS); score = 0; streak = 0; best = 0;
  $("score").textContent = 0; $("streak").textContent = 0; $("fb").textContent = "";
  $("start").hidden = true; $("end").hidden = true; $("game").hidden = false;
  endAt = Date.now() + GAME_MS;
  next();
  clearInterval(timer);
  timer = setInterval(tick, 100);
  tick();
}

$("go").addEventListener("click", start);
$("again").addEventListener("click", start);
document.querySelectorAll("[data-a]").forEach((b) =>
  b.addEventListener("click", () => answer(b.dataset.a)));
document.addEventListener("keydown", (e) => {
  const a = { 1: "claim", 2: "heuristic", 3: "like", 4: "skip" }[e.key];
  if (a && endAt) answer(a);
});
