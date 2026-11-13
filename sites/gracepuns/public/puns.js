// [rebus, answer, explanation, extra accepted guesses]
const PUNS = [
  ["🔄🥫", "re-grace?", "gracekind's original: 🔄 (re) + 🥫 (can) — recan, the can-version of a regrace", ["recan", "re can"]],
  ["🔄🙏", "regrace", "to grace again", ["regrace", "re grace"]],
  ["🛬🧈", "grace landing", "a soft touchdown with a smooth finish", ["grace landing"]],
  ["😇🎶", "amazing grace", "how sweet the sound", ["amazing grace"]],
  ["🅰️🧱🙏", "a-grace-ive", "abrasive, but gracefully", ["abgraceive", "abrasive"]],
  ["🙏🫒", "grace-ful olive", "graceful, with a garnish", ["graceful"]],
  ["🙏👩‍🦲", "disgrace", "dis- + grace", ["disgrace"]],
  ["⬇️🙏", "degrace", "the opposite of a graceful ascent", ["degrace", "disgrace"]],
  ["🙏🧂", "grace period", "a pinch of mercy before the deadline", ["grace period"]],
  ["🥺🙏", "saving grace", "the one thing that's still fine", ["saving grace"]],
  ["🙏🍽️", "say grace", "before the meal", ["say grace"]],
  ["🙏🌿", "gracefully overgrown", "ivy, but make it a pun", ["graceful"]],
  ["🙏🚀", "grace hopper", "a compiler, a bug, and a very good rocket", ["grace hopper", "hopper"]],
  ["🙏🥫🔄", "grace-can-recycle", "an emoji rebus about an emoji rebus", ["recycle"]],
  ["🥫🙏", "can grace", "the thing in the can, graced", ["can grace"]],
  ["⛪🙏🤷", "there but for the grace of god", "if you know you know", ["there but for the grace"]],
  ["🌑🙏", "grace note", "a tiny ornament before the real note", ["grace note"]],
  ["🥱🙏", "gracefully bored", "a yawn with excellent posture", ["graceful"]],
];

const $ = (id) => document.getElementById(id);
const norm = (s) => s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
const solved = new Set();

function updateScore() {
  $("score").textContent = `${solved.size} / ${PUNS.length} guessed`;
  const text = `I got ${solved.size}/${PUNS.length} grace puns as emoji rebuses. 🔄🥫`;
  $("share").href = "https://bsky.app/intent/compose?text=" +
    encodeURIComponent(text + "\nhttps://gracepuns.bisks.net/");
}

function reveal(li, i, on, counts) {
  li.querySelector(".ans").hidden = !on;
  li.querySelector("input").hidden = on;
  if (on && counts) { solved.add(i); li.classList.add("solved"); }
  updateScore();
}

const list = $("list");
PUNS.forEach(([rebus, answer, why, accepted], i) => {
  const li = document.createElement("li");
  const r = document.createElement("div"); r.className = "rebus"; r.textContent = rebus;
  const a = document.createElement("div"); a.className = "ans";
  const inp = document.createElement("input"); inp.className = "guess"; inp.placeholder = "guess…";
  const ans = document.createElement("div"); ans.className = "ans"; ans.hidden = true;
  const pun = document.createElement("div"); pun.className = "pun"; pun.textContent = answer;
  const w = document.createElement("div"); w.className = "why"; w.textContent = why;
  ans.append(pun, w);
  a.append(inp, ans);
  li.append(r, a);
  // the wrapper .ans holds both; only the inner answer toggles
  a.className = "ans-wrap"; a.style.flex = "1";
  li.querySelector(".ans").hidden = true;
  li.reveal = (on) => reveal(li, i, on, false);
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { check(); } });
  inp.addEventListener("input", check);
  function check() {
    const g = norm(inp.value);
    if (g && [answer, ...accepted].some((x) => norm(x) === g)) reveal(li, i, true, true);
  }
  const btn = document.createElement("button"); btn.type = "button"; btn.textContent = "reveal";
  btn.addEventListener("click", () => reveal(li, i, true, false));
  li.append(btn);
  list.append(li);
});

$("reveal-all").addEventListener("click", () => list.querySelectorAll("li").forEach((li) => li.reveal(true)));
$("hide-all").addEventListener("click", () => {
  solved.clear();
  list.querySelectorAll("li").forEach((li) => {
    li.classList.remove("solved");
    li.querySelector(".ans").hidden = true;
    const inp = li.querySelector("input"); inp.hidden = false; inp.value = "";
  });
  updateScore();
});
updateScore();
