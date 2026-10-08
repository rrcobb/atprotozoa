// Deterministic "library": address string -> seeded PRNG -> 29-symbol page.
const ALPHA = "abcdefghijklmnopqrstuvwxyz ,.";
const PAGE_LEN = 3200; // the real library's page length

function hashSeed(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function normalize(a) { return (a || "").trim().replace(/^@/, "").toLowerCase().replace(/[^0-9a-z.\-:]/g, "") || "0"; }

export function pageText(addr) {
  const r = rng(hashSeed(addr));
  let s = "";
  for (let i = 0; i < PAGE_LEN; i++) s += ALPHA[Math.floor(r() * ALPHA.length)];
  return s;
}

const words = (t) => t.split(/[ ,.]+/).filter(Boolean);
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// Build a structured article from the page text.
export function buildDoc(addr) {
  const text = pageText(addr);
  const r = rng(hashSeed(addr + "#layout"));
  const w = words(text);
  let k = 0;
  const take = (n) => w.slice(k, (k += n)).join(" ");
  const sentence = (n) => cap(take(n)) + ".";
  const para = () => { let o = []; const c = 3 + Math.floor(r() * 3); for (let i = 0; i < c; i++) o.push(sentence(4 + Math.floor(r() * 10))); return o.join(" "); };
  const title = cap(take(4 + Math.floor(r() * 3)));
  const author = cap(take(1)) + " " + cap(take(1));
  const blocks = [];
  const nsec = 2 + Math.floor(r() * 2);
  let thm = 0;
  for (let s = 0; s < nsec; s++) {
    blocks.push({ k: "sec", t: cap(take(2 + Math.floor(r() * 2))) });
    blocks.push({ k: "p", t: para() });
    blocks.push({ k: "thm", n: ++thm, kind: r() < .3 ? "Lemma" : "Theorem", who: cap(take(1)), t: sentence(10 + Math.floor(r() * 12)) });
    blocks.push({ k: "eq", t: take(3 + Math.floor(r() * 3)).replace(/ /g, "\\,") });
    blocks.push({ k: "proof", t: para() });
  }
  blocks.push({ k: "sec", t: "Conclusion" });
  blocks.push({ k: "p", t: para() });
  const abs = sentence(14) + " " + sentence(10);
  return { title, author, abs, blocks, leftover: w.length - k };
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export function toHTML(d, addr) {
  let eq = 0, h = `<h1>${esc(d.title)}</h1><div class="auth">${esc(d.author)}<small>page ${esc(addr)}, Library of Babel</small></div>`;
  h += `<div class="abs"><b>Abstract</b>${esc(d.abs)}</div>`;
  let sec = 0;
  for (const b of d.blocks) {
    if (b.k === "sec") h += `<h2>${++sec}&ensp;${esc(b.t)}</h2>`;
    else if (b.k === "p") h += `<p>${esc(b.t)}</p>`;
    else if (b.k === "thm") h += `<div class="thm"><p><span class="n">${b.kind} ${sec}.${b.n} </span><span class="b">(${esc(b.who)}). ${esc(b.t)}</span></p></div>`;
    else if (b.k === "eq") h += `<p class="eq">${esc(b.t.replace(/\\,/g, " "))}<span class="t">(${++eq})</span></p>`;
    else if (b.k === "proof") h += `<div class="proof"><p><span class="n">Proof. </span>${esc(b.t)}<span class="qed">&#9633;</span></p></div>`;
  }
  return h;
}

const texEsc = (s) => s.replace(/[\\{}$&#_%^~]/g, (c) => "\\" + c);
export function toTex(d, addr) {
  let o = `\\documentclass[11pt]{article}\n\\usepackage{amsmath,amsthm}\n\\newtheorem{theorem}{Theorem}\n\\newtheorem{lemma}{Lemma}\n`;
  o += `\\title{${texEsc(d.title)}}\n\\author{${texEsc(d.author)}}\n\\date{Library of Babel, page ${texEsc(addr)}}\n\\begin{document}\n\\maketitle\n`;
  o += `\\begin{abstract}\n${texEsc(d.abs)}\n\\end{abstract}\n`;
  for (const b of d.blocks) {
    if (b.k === "sec") o += `\n\\section{${texEsc(b.t)}}\n`;
    else if (b.k === "p") o += `${texEsc(b.t)}\n`;
    else if (b.k === "thm") o += `\n\\begin{${b.kind.toLowerCase()}}[${texEsc(b.who)}]\n${texEsc(b.t)}\n\\end{${b.kind.toLowerCase()}}\n`;
    else if (b.k === "eq") o += `\\begin{equation}\n\\mathrm{${b.t.replace(/\\,/g, "\\ ")}}\n\\end{equation}\n`;
    else if (b.k === "proof") o += `\\begin{proof}\n${texEsc(b.t)}\n\\end{proof}\n`;
  }
  return o + `\n\\end{document}\n`;
}

// ---- browser wiring ----
if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const randAddr = () => Math.random().toString(16).slice(2, 12) + Math.random().toString(16).slice(2, 12);
  let cur = "";
  const show = (raw, push = true) => {
    cur = normalize(raw);
    $("addr").value = cur;
    const d = buildDoc(cur);
    $("doc").innerHTML = toHTML(d, cur);
    $("tex").textContent = toTex(d, cur);
    const url = `https://babeltex.bisks.net/#${cur}`;
    $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(`"${d.title}" — page ${cur} of the Library of Babel, now in LaTeX.\n${url}`);
    document.title = `${d.title} — babeltex`;
    if (push) history.replaceState(null, "", "#" + cur);
  };
  $("go").onclick = () => show($("addr").value);
  $("addr").addEventListener("keydown", (e) => { if (e.key === "Enter") show($("addr").value); });
  $("rnd").onclick = () => show(randAddr());
  $("src").onclick = () => { const p = $("tex"); p.classList.toggle("on"); $("src").textContent = p.classList.contains("on") ? "hide .tex" : "show .tex"; };
  $("dl").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([$("tex").textContent], { type: "text/x-tex" }));
    a.download = `babel-${cur}.tex`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  show(location.hash.slice(1) || randAddr(), true);
}
