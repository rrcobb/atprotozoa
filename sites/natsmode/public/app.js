// NATS MODE — a Washington Nationals take generator + proper-noun glitch engine.
// No server, no live scores: this is a pure vibe toy that riffs on
// @guy1.bsky.social's own posting bit — respelling "NATIONALS" wrong, every
// single time, plus a running gag of glitching other proper nouns the same way
// ("Prince George's County" -> "Kink George's County", "Crash Bandicoot" ->
// "Cratch Bandidcoot", "Synergy" -> "Sinner Energy").

const QWERTY_NEIGHBORS = {
  a: "qws", b: "vghn", c: "xdfv", d: "serfcx", e: "wsdr", f: "drtgvc",
  g: "ftyhbv", h: "gyujnb", i: "ujko", j: "huikmn", k: "jiolm", l: "kop",
  m: "njk", n: "bhjm", o: "iklp", p: "ol", q: "wa", r: "edft", s: "awedxz",
  t: "rfgy", u: "yhji", v: "cfgb", w: "qase", x: "zsdc", y: "tghu", z: "asx",
};

function randInt(n) {
  return Math.floor(Math.random() * n);
}

function pick(arr) {
  return arr[randInt(arr.length)];
}

// One typo op applied at a random letter position: swap for a QWERTY
// neighbor, transpose with the next letter, double a letter, or drop one.
function glitchOnce(word) {
  const chars = word.split("");
  const letterIdx = chars
    .map((c, i) => (/[a-zA-Z]/.test(c) ? i : -1))
    .filter((i) => i >= 0);
  if (letterIdx.length < 2) return word;

  const op = pick(["swap-neighbor", "transpose", "double", "drop"]);
  const i = letterIdx[1 + randInt(letterIdx.length - 1)]; // never touch the first letter

  if (op === "swap-neighbor") {
    const lower = chars[i].toLowerCase();
    const neighbors = QWERTY_NEIGHBORS[lower];
    if (!neighbors) return word;
    const wasUpper = chars[i] === chars[i].toUpperCase();
    const n = pick(neighbors.split(""));
    chars[i] = wasUpper ? n.toUpperCase() : n;
  } else if (op === "transpose" && i < chars.length - 1) {
    const tmp = chars[i];
    chars[i] = chars[i + 1];
    chars[i + 1] = tmp;
  } else if (op === "double") {
    chars.splice(i, 0, chars[i]);
  } else if (op === "drop" && chars.length > 4) {
    chars.splice(i, 1);
  } else {
    return glitchOnce(word);
  }
  return chars.join("");
}

function glitch(word, ops = 1) {
  let out = word;
  for (let k = 0; k < ops; k++) out = glitchOnce(out);
  return out;
}

// A curated set of real corruptions from guy1's actual posts, mixed in with
// fresh procedural ones so the flavor stays recognizable but never repeats.
const KNOWN_NATIONALS_GLITCHES = [
  "NATONALS", "NARIONAL", "NATIPNALS", "NATINALS", "NATINOALS", "NATIOANLS",
];

function glitchedNationals() {
  if (Math.random() < 0.4) return pick(KNOWN_NATIONALS_GLITCHES);
  return glitch("NATIONALS", 1 + randInt(2)).toUpperCase();
}

const OPPONENTS = ["A'S", "ROYALS", "MARINERS", "METS", "PHILLIES", "BRAVES", "ASTROS", "DODGERS", "PADRES"];
const KNOWN_OPPONENT_GLITCHES = { MARINERS: "SEATLES" };

function glitchedOpponent() {
  const team = pick(OPPONENTS);
  if (KNOWN_OPPONENT_GLITCHES[team] && Math.random() < 0.5) {
    return KNOWN_OPPONENT_GLITCHES[team];
  }
  return Math.random() < 0.55 ? glitch(team, 1).toUpperCase() : team;
}

const WIN_TEMPLATES = [
  (n, o) => `THE ${n} HAVE BESTED THE ${o}`,
  (n, o) => `THE ${n} WON THE SERIES AGAINST THE ${o} THEY SAID IT COULDNT BE DONE`,
  (n, o) => `THE ${n} HAVE BEATEN THE ${o}`,
  (n, o) => `THE ${n} ARE WINNING THE GAME TODAY`,
  (n, _o) => `THE ${n} HABE RESTORED MY CONFIDENCE`,
  (n, _o) => `GO ${n}`,
  (n, o) => `THE ${o} ARE GOING DOWN AGAINST THE ${n}`,
];
const LOSS_TEMPLATES = [
  (n, o) => `THE ${n} LOST THE SERIES TO THE ${o}`,
  (n, _o) => `SAD MODE ${n}`,
  (n, _o) => `NOT A GREAT DAY FOR THE WASHINGTON BASEBALL ${n}`,
  (_n, o) => `${o} WON :(`,
  (_n, o) => `${o} DOWN ${o} DOWN`,
  (n, o) => `THE ${n} HAVE LOST TO THE ${o}`,
];

function generateTake() {
  const isWin = Math.random() < 0.55;
  const n = glitchedNationals();
  const o = glitchedOpponent();
  const template = pick(isWin ? WIN_TEMPLATES : LOSS_TEMPLATES);
  return { text: template(n, o), isWin };
}

// --- wiring ---

const takeEl = document.getElementById("take");
const generateBtn = document.getElementById("generate-btn");
const shareBtn = document.getElementById("share-btn");
const wCountEl = document.getElementById("w-count");
const lCountEl = document.getElementById("l-count");
const moodLabel = document.getElementById("mood-label");
const headerGlitch = document.getElementById("header-glitch");
const dcTicker = document.getElementById("dc-ticker");

let wins = 0;
let losses = 0;
let currentTake = "";

function renderTake() {
  const { text, isWin } = generateTake();
  currentTake = text;
  takeEl.textContent = text;
  takeEl.classList.toggle("go", isWin);
  takeEl.classList.toggle("sad", !isWin);
  if (isWin) { wins++; wCountEl.textContent = wins; }
  else { losses++; lCountEl.textContent = losses; }
  moodLabel.textContent = isWin ? "GO MODE" : "SAD MODE";
  moodLabel.classList.toggle("go", isWin);
  moodLabel.classList.toggle("sad", !isWin);
  document.body.style.backgroundColor = isWin ? "#0b120e" : "#130b0c";
}

generateBtn.addEventListener("click", renderTake);

shareBtn.addEventListener("click", () => {
  const text = `${currentTake} (via natsmode.bisks.net)`;
  const url = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener");
});

const glitchInput = document.getElementById("glitch-input");
const glitchBtn = document.getElementById("glitch-btn");
const glitchOut = document.getElementById("glitch-out");

function runGlitch() {
  const word = glitchInput.value.trim();
  if (!word) {
    glitchOut.innerHTML = `<span class="orig">type something first — try "Crash Bandicoot" or "Georgetown"</span>`;
    return;
  }
  const out = word
    .split(/(\s+)/)
    .map((part) => (/\s/.test(part) ? part : glitch(part, 1 + (Math.random() < 0.3 ? 1 : 0))))
    .join("");
  glitchOut.innerHTML = `${out}<br><span class="orig">was: ${word}</span>`;
}

glitchBtn.addEventListener("click", runGlitch);
glitchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runGlitch();
});

const DC_BITS = [
  "Prince George's County", "Georgetown", "Nationals Park", "Anacostia",
  "The Wharf", "Metro", "Union Station", "Navy Yard",
];
dcTicker.textContent = `ALSO: ${glitch(pick(DC_BITS), 1)}`;
setInterval(() => {
  dcTicker.textContent = `ALSO: ${glitch(pick(DC_BITS), 1)}`;
}, 6000);

setInterval(() => {
  headerGlitch.textContent = glitchedNationals();
}, 4000);

renderTake();
