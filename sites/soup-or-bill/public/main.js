import { START, WAVES, pick, ending } from "./game.js";

const $ = (id) => document.getElementById(id);
let s, i, done;

function bars() {
  for (const k of ["wis", "leak", "soup", "heart"]) {
    const v = s[k];
    $("v-" + k).textContent = v;
    const pct = k === "wis" ? Math.min(100, v * 5) : k === "heart" ? Math.max(0, Math.min(100, v * 15)) : v;
    $("b-" + k).firstElementChild.style.width = pct + "%";
  }
}

function show(w) {
  $("who").textContent = w.who;
  $("line").textContent = w.line;
  $("wave").textContent = `wave ${i + 1} / ${WAVES.length}`;
  $("result").textContent = "";
  $("result").classList.remove("on");
  const box = $("choices");
  box.replaceChildren();
  w.choices.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice";
    b.textContent = c.t + (c.req ? `  [parry: WIS ${c.req}]` : "");
    b.addEventListener("click", () => choose(c));
    box.append(b);
  });
}

function choose(c) {
  if (done) return;
  const r = pick(s, c);
  s = r.state;
  bars();
  const end = ending(s, i + 1 >= WAVES.length);
  $("result").textContent = (r.parried ? "" : "✗ parry failed. ") + r.text;
  $("result").classList.add("on");
  const box = $("choices");
  box.replaceChildren();
  if (end) return finish(end);
  const n = document.createElement("button");
  n.type = "button";
  n.className = "choice next";
  n.textContent = "next wave →";
  n.addEventListener("click", () => { i++; show(WAVES[i]); });
  box.append(n);
}

function finish(end) {
  done = true;
  $("who").textContent = end.title;
  $("line").textContent = end.text;
  const box = $("choices");
  const text = `I played SOUP OR BILL: ${end.title}. WIS ${s.wis}, leaks ${s.leak}, soup ${s.soup}. Dodge the PRC honeypots yourself:`;
  const a = document.createElement("a");
  a.className = "choice";
  a.target = "_blank";
  a.rel = "noopener";
  a.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " https://soup-or-bill.bisks.net/");
  a.textContent = "post this ending to bluesky";
  const r = document.createElement("button");
  r.type = "button";
  r.className = "choice next";
  r.textContent = "play again";
  r.addEventListener("click", start);
  box.replaceChildren(a, r);
}

function start() {
  s = { ...START };
  i = 0;
  done = false;
  bars();
  show(WAVES[0]);
}

start();
