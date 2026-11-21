import { generate, toText } from "./gen.js";

const $ = (id) => document.getElementById(id);
const newSeed = () => (Math.random() * 4294967296) >>> 0;
let seed = Number(new URLSearchParams(location.search).get("s"));
if (!Number.isInteger(seed) || seed <= 0) seed = newSeed();

function render() {
  const e = generate(seed);
  $("name").textContent = e.name;
  $("epistemic").textContent = e.epistemic;
  $("setup").textContent = e.setup;
  $("twist").textContent = e.twist;
  $("verdict").textContent = e.verdict;
  $("credence").textContent = e.credence + "%";
  const tags = $("tags");
  tags.textContent = "";
  for (const t of e.tags) {
    const s = document.createElement("span");
    s.textContent = t;
    tags.append(s);
  }
  const url = `https://thoughtlab.bisks.net/?s=${seed}`;
  const text = `${e.name}\n\n${e.setup}\n\nCredence: ${e.credence}%`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text.slice(0, 220) + "\n" + url);
  history.replaceState(null, "", `?s=${seed}`);
  document.title = `${e.name} — thoughtlab`;
}

$("again").addEventListener("click", () => { seed = newSeed(); render(); });
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(toText(generate(seed)) + `\nhttps://thoughtlab.bisks.net/?s=${seed}`);
    $("copy").textContent = "copied";
  } catch { $("copy").textContent = "copy failed"; }
  setTimeout(() => ($("copy").textContent = "copy"), 1500);
});
render();
