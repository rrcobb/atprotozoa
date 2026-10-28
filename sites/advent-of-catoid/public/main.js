import { DAYS, inputFor, answerFor, exampleAnswer } from "./lib/puzzles.js";

const $ = (id) => document.getElementById(id);
const SITE = "https://advent-of-catoid.bisks.net/";
const randomSeed = () => Math.random().toString(36).slice(2, 8);

let seed = (() => {
  const q = new URLSearchParams(location.search).get("seed");
  const fromUrl = q && q.trim().slice(0, 40);
  if (fromUrl) { localStorage.setItem("catoid:seed", fromUrl); return fromUrl; }
  let s = localStorage.getItem("catoid:seed");
  if (!s) { s = randomSeed(); localStorage.setItem("catoid:seed", s); }
  return s;
})();

const progKey = () => `catoid:progress:${seed}`;
const loadProgress = () => { try { return JSON.parse(localStorage.getItem(progKey())) || {}; } catch { return {}; } };
let progress = loadProgress();
const starsOf = (d) => (progress[d]?.s1 ? 1 : 0) + (progress[d]?.s2 ? 1 : 0);
const totalStars = () => DAYS.reduce((n, _, i) => n + starsOf(i + 1), 0);

let current = 0; // 0 = calendar view
let input = "";

function paragraphs(into, list) {
  into.replaceChildren();
  for (const text of list) {
    const p = document.createElement("p");
    p.className = "paragraph";
    text.split("`").forEach((chunk, i) => {
      if (i % 2) { const c = document.createElement("code"); c.textContent = chunk; p.append(c); }
      else p.append(chunk);
    });
    into.append(p);
  }
}

function renderCalendar() {
  const cal = $("calendar");
  cal.replaceChildren();
  DAYS.forEach((d, i) => {
    const day = i + 1, st = starsOf(day);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day" + (st === 2 ? " done" : "");
    const n = document.createElement("span"); n.className = "n"; n.textContent = `day ${day}`;
    const t = document.createElement("span"); t.className = "t"; t.textContent = d.title;
    const s = document.createElement("span"); s.className = "s";
    for (let k = 0; k < 2; k++) {
      const star = document.createElement("span");
      star.textContent = "★";
      if (k < st) star.className = "on";
      s.append(star);
    }
    b.append(n, t, s);
    b.addEventListener("click", () => go(day));
    cal.append(b);
  });
  const total = totalStars();
  $("stars").textContent = `★ ${total} / ${DAYS.length * 2}`;
  const text = `I have ${total}/${DAYS.length * 2} stars in Advent of Catoid 🐱⭐`;
  $("sharestars").href = `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${SITE}`)}`;
  $("share").href = $("sharestars").href;
  $("finale").hidden = total < DAYS.length * 2;
}

function renderPuzzle() {
  const d = DAYS[current - 1];
  $("calendar").hidden = true;
  $("puzzle").hidden = false;
  $("ptitle").textContent = `day ${current}: ${d.title}`;
  paragraphs($("pintro"), d.intro);
  $("pexample").textContent = d.example;
  let ex1 = "?", ex2 = "?";
  try { ex1 = exampleAnswer(current, 1); ex2 = exampleAnswer(current, 2); } catch { /* keep "?" */ }
  $("pexample-ans").textContent = `part 1 on this example: ${ex1}`;
  $("pexample2-ans").textContent = `part 2 on this example: ${ex2}`;
  const solved1 = !!progress[current]?.s1;
  $("part2-block").hidden = !solved1;
  if (solved1) paragraphs($("pintro2"), d.part2);
  try {
    input = inputFor(seed, current);
  } catch (e) {
    input = "";
    setFeedback("could not generate your input: " + e.message, "bad");
  }
  $("pinput").textContent = input;
  $("inlen").textContent = `(${input.length.toLocaleString()} characters)`;
  updateAnswerUi();
  $("prev").hidden = current <= 1;
  $("next").hidden = current >= DAYS.length;
}

function updateAnswerUi() {
  const st = starsOf(current);
  const form = $("answer-form");
  form.hidden = false;
  if (st === 2) {
    $("answer-label").textContent = "both stars collected";
    $("answer").disabled = true;
    $("submit").disabled = true;
    setFeedback("★★ nice. the cat approves.", "ok");
  } else {
    $("answer-label").textContent = st === 0 ? "part 1 answer" : "part 2 answer";
    $("answer").disabled = false;
    $("submit").disabled = false;
    $("answer").value = "";
    setFeedback("", "");
  }
}

function setFeedback(text, cls) {
  const f = $("feedback");
  f.textContent = text;
  f.className = cls;
}

function go(day) {
  current = day;
  if (location.hash !== `#${day}`) history.replaceState(null, "", `${location.pathname}${location.search}#${day}`);
  renderPuzzle();
  scrollTo(0, 0);
}

function showCalendar() {
  current = 0;
  history.replaceState(null, "", location.pathname + location.search);
  $("puzzle").hidden = true;
  $("calendar").hidden = false;
  renderCalendar();
}

$("back").addEventListener("click", showCalendar);
$("prev").addEventListener("click", () => go(current - 1));
$("next").addEventListener("click", () => go(current + 1));

$("answer-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const guess = $("answer").value.trim().toLowerCase();
  if (!guess) { setFeedback("type an answer first", "bad"); return; }
  const part = starsOf(current) === 0 ? 1 : 2;
  setFeedback("the cat is thinking…", "");
  $("submit").disabled = true;
  setTimeout(() => {
    try {
      const want = answerFor(seed, current, part, input).toLowerCase();
      if (guess === want) {
        progress[current] = { ...progress[current], [`s${part}`]: true };
        localStorage.setItem(progKey(), JSON.stringify(progress));
        renderCalendar();
        $("calendar").hidden = true;
        renderPuzzle();
        setFeedback(part === 1 ? "★ that's right! part two is unlocked." : "★★ that's right! both stars!", "ok");
        if (part === 2) $("answer-form").hidden = false;
      } else if (guess === "nan") {
        setFeedback("nyaaaan~ 🌈🐱 that is a cat, not a number. (day 3 part 2 is fixed, promise.)", "bad");
        $("submit").disabled = false;
      } else {
        setFeedback("that's not it. the cat blinks slowly at you.", "bad");
        $("submit").disabled = false;
      }
    } catch (err) {
      setFeedback("the solver tripped over a hairball: " + err.message, "bad");
      $("submit").disabled = false;
    }
  }, 20);
});

$("copyinput").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(input); $("copyinput").textContent = "copied"; }
  catch { $("copyinput").textContent = "select + copy by hand"; }
  setTimeout(() => ($("copyinput").textContent = "copy"), 1500);
});

$("dlinput").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([input], { type: "text/plain" }));
  a.download = `catoid-day${String(current).padStart(2, "0")}-${seed}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
});

function setSeed(s) {
  seed = s;
  localStorage.setItem("catoid:seed", seed);
  $("seed").value = seed;
  progress = loadProgress();
  if (current) renderPuzzle(); else renderCalendar();
}

$("seed").value = seed;
$("seed").addEventListener("change", () => {
  const s = $("seed").value.trim().slice(0, 40);
  if (s && s !== seed) setSeed(s); else $("seed").value = seed;
});
$("reroll").addEventListener("click", () => setSeed(randomSeed()));
$("copylink").addEventListener("click", async () => {
  const url = `${SITE}?seed=${encodeURIComponent(seed)}`;
  try { await navigator.clipboard.writeText(url); $("copylink").textContent = "copied"; }
  catch { $("copylink").textContent = url; }
  setTimeout(() => ($("copylink").textContent = "copy seed link"), 2000);
});

renderCalendar();
const start = parseInt(location.hash.slice(1), 10);
if (start >= 1 && start <= DAYS.length) go(start);

// holiday spirit: a gentle snowfall of paws and flakes, skipped for reduced-motion
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const snow = document.createElement("div");
  snow.id = "snow";
  snow.setAttribute("aria-hidden", "true");
  const bits = ["❄", "❅", "❆", "🐾"];
  for (let i = 0; i < 28; i++) {
    const f = document.createElement("span");
    f.textContent = bits[i % bits.length];
    f.style.left = `${(i * 37) % 100}%`;
    f.style.fontSize = `${10 + (i * 7) % 12}px`;
    f.style.animationDuration = `${9 + (i * 5) % 11}s`;
    f.style.animationDelay = `-${(i * 3) % 13}s`;
    snow.append(f);
  }
  document.body.append(snow);
}
