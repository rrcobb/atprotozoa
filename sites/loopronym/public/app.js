// loopronym — turn any word into a TESCREAL-flavored backronym, one entry
// per letter. See sites/loopronym/site.json for the thread this came from.
//
// The R slot is the whole point: @ver.ooo joked "the r in recursive stands
// for recursive," and @shimmermathlabs.com replied "75% of the time it is
// the second one / 25% of the time it is both." That's not a metaphor here —
// rSlot() below rolls exactly that split every time a word contains an R.

const BANK = {
  A: ["Agentic", "Acausal", "Aligned", "Ascended", "Autopoietic", "Adjacent-possible"],
  B: ["Bayesian", "Boltzmann-brained", "Basilisk-adjacent", "Backpropagated", "Base-rate-pilled"],
  C: ["Cognitohazardous", "Cybernetic", "Convergent", "Compute-pilled", "Consequentialist", "Chaotic-good"],
  D: ["Decentralized", "Decision-theoretic", "Distributed", "Dath-ilani-brained", "Doom-adjacent"],
  E: ["Emergent", "Entangled", "Epistemic", "Extropian", "Effective", "Eldritch"],
  F: ["Foom-pilled", "Fractal", "Functionalist", "Feral", "Forecasting-pilled"],
  G: ["Generative", "Galaxy-brained", "Gradient-descended", "Grokked", "Goodharted"],
  H: ["Hyperstitious", "Hivemindful", "Heuristic", "High-decoupling", "Half-aligned"],
  I: ["Instrumental", "Infohazardous", "Iterative", "Inscrutable", "Illegible"],
  J: ["Jhana-pilled", "Jailbroken", "Judgment-free", "Janky-but-load-bearing"],
  K: ["Kolmogorov-complex", "Karmically-weighted", "Kayfabe-aware"],
  L: ["Longtermist", "Love", "Legible", "Latent", "Loss-minimizing"],
  M: ["Mesa-optimizing", "Multi-agent", "Memetic", "Manifold-pilled", "Misaligned-on-purpose"],
  N: ["Nonlinear", "Neuralese", "Networked", "Non-zero-sum", "Numinous"],
  O: ["Orthogonal", "Optimizing", "Oracular", "Overfit", "Open-source-pilled"],
  P: ["Panpsychic", "Probabilistic", "Posthuman", "Prediction-market-pilled", "Path-dependent"],
  Q: ["Quantized", "Quokka-brained", "Qualia-pilled", "Quixotic"],
  R_NORMAL: ["Reflective", "Reward-hacking", "Recombinant", "Ratio'd", "Resonant"],
  S: ["Simcluster", "Singularity-bound", "Stochastic", "Self-modifying", "Simulacral"],
  T: ["Transfeminist", "Transhuman", "Timeless", "Thoughtcrime-curious", "Tail-risk-pilled"],
  U: ["Utilitarian", "Uploaded", "Unbounded", "Underdetermined"],
  V: ["Vibecoded", "Value-aligned", "Variational", "Vestigial-but-load-bearing"],
  W: ["Wireheaded", "World-modeling", "Weakly-godlike"],
  X: ["Xenic", "X-risk-pilled", "Xenocompatible"],
  Y: ["Yoked-to-the-timeline", "Yotta-scaled", "Yearning"],
  Z: ["Zero-shot", "Zeitgeist-pilled", "Zettabyte-brained"],
};

const DEFAULT_WORD = "RECURSIVE";
const MAX_LETTERS = 32;

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// The exact split from the thread: 75% the tautology alone ("the second
// one" — R just stands for recursive, full stop), 25% both readings at
// once, entangled — the ordinary bank word plus the recursive chain.
function rSlot() {
  if (Math.random() < 0.75) {
    return { letter: "R", text: "Recursive", note: "recursive (it's recursive)" };
  }
  const normal = pick(BANK.R_NORMAL);
  const chain = "Recursive → Recursive → Recursive → …";
  return { letter: "R", text: `${normal} — and, recursively: ${chain}`, both: true };
}

function lettersOf(word) {
  const letters = word.toUpperCase().replace(/[^A-Z]/g, "").split("");
  return letters.slice(0, MAX_LETTERS);
}

function generate(word) {
  let letters = lettersOf(word);
  if (letters.length === 0) letters = lettersOf(DEFAULT_WORD);
  return letters.map((L) => (L === "R" ? rSlot() : { letter: L, text: pick(BANK[L]) }));
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64) {
  let s = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeResult(word, rows) {
  return toBase64Url(JSON.stringify({ w: word, r: rows.map((r) => r.text) }));
}

function decodeResult(encoded) {
  const obj = JSON.parse(fromBase64Url(encoded));
  const letters = lettersOf(obj.w);
  return {
    word: obj.w,
    rows: letters.map((L, i) => {
      const text = obj.r[i] || "";
      return { letter: L, text, both: L === "R" && text.includes("and, recursively") };
    }),
  };
}

function render(word, rows) {
  const els = window.__loopronymEls;
  els.word.textContent = word.toUpperCase();
  els.rows.innerHTML = "";
  rows.forEach((row) => {
    const li = document.createElement("li");
    li.className = "row" + (row.both ? " both" : "") + (row.letter === "R" ? " rslot" : "");
    const letter = document.createElement("span");
    letter.className = "letter";
    letter.textContent = row.letter;
    const text = document.createElement("span");
    text.className = "text";
    text.textContent = row.text;
    li.append(letter, text);
    els.rows.appendChild(li);
  });
  els.output.hidden = false;
  els.output.style.display = "";

  const url = new URL(location.href);
  url.pathname = `/r/${encodeResult(word, rows)}`;
  els.permalink.href = url.toString();

  const shareBody = `${word.toUpperCase()} is ${rows.map((r) => r.text.split(" — ")[0].split(" (")[0]).join(", ")}`;
  let shareText = `${shareBody} — my recursive backronym: ${url.toString()}`;
  // Bluesky's 300-grapheme cap — fall back to a short form if the letter
  // list runs long (most words are fine; long inputs might not be).
  if ([...new Intl.Segmenter().segment(shareText)].length > 300) {
    shareText = `My recursive backronym for "${word.toUpperCase()}": ${url.toString()}`;
  }
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
}

function init() {
  const els = {
    form: document.getElementById("genForm"),
    input: document.getElementById("wordInput"),
    output: document.getElementById("output"),
    word: document.getElementById("outWord"),
    rows: document.getElementById("outRows"),
    reroll: document.getElementById("rerollBtn"),
    permalink: document.getElementById("permalinkLink"),
    shareBluesky: document.getElementById("shareBluesky"),
  };
  window.__loopronymEls = els;

  let currentWord = DEFAULT_WORD;

  // /r/<encoded> — a shared permalink. Decode client-side so the visitor
  // sees exactly the result that was shared, not a fresh reroll.
  const shared = location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)/);
  let loadedShared = false;
  if (shared) {
    try {
      const { word, rows } = decodeResult(shared[1]);
      currentWord = word;
      els.input.value = word;
      render(word, rows);
      loadedShared = true;
    } catch {
      // malformed permalink — fall through to the default.
    }
  }
  if (!loadedShared) {
    els.input.value = DEFAULT_WORD;
    render(DEFAULT_WORD, generate(DEFAULT_WORD));
  }

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const word = els.input.value.trim();
    if (!word) return;
    currentWord = word;
    render(word, generate(word));
  });

  els.reroll.addEventListener("click", () => {
    render(currentWord, generate(currentWord));
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
