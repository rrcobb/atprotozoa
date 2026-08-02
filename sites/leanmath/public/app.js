// app.js — wires the textarea/button UI to translate.js's translateLean() and
// renders the result with KaTeX. Everything here is client-side; there's no
// server round trip.

const EXAMPLES = [
  "theorem add_comm (a b : Nat) : a + b = b + a := by ring",
  "theorem sq_nonneg (x : ℝ) : x^2 ≥ 0 := by nlinarith [sq_nonneg x]",
  "theorem exists_infinite_primes (n : ℕ) : ∃ p, p ≥ n ∧ Nat.Prime p :=\n  Nat.exists_infinite_primes n",
  "def is_even (n : ℕ) : Prop := ∃ k, n = 2 * k",
  "theorem le_trans {a b c : ℕ} (h1 : a ≤ b) (h2 : b ≤ c) : a ≤ c :=\n  le_trans h1 h2",
];

const els = {
  input: document.getElementById("input"),
  convertBtn: document.getElementById("convertBtn"),
  statusHint: document.getElementById("statusHint"),
  output: document.getElementById("output"),
  declList: document.getElementById("declList"),
  latexOut: document.getElementById("latexOut"),
  copyBtn: document.getElementById("copyBtn"),
  shareBtn: document.getElementById("shareBtn"),
};

document.querySelectorAll(".exampleBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    els.input.value = EXAMPLES[Number(btn.dataset.ex)];
    convert();
  });
});

els.convertBtn.addEventListener("click", convert);
els.input.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") convert();
});

function renderKatex(tex, target, displayMode) {
  try {
    window.katex.render(tex, target, { throwOnError: false, displayMode });
  } catch (e) {
    target.textContent = tex;
  }
}

function buildDeclNode(decl) {
  const wrap = document.createElement("div");
  wrap.className = "decl";

  if (decl.title) {
    const titleRow = document.createElement("div");
    titleRow.className = "declTitle";
    const titleMath = document.createElement("span");
    renderKatex(decl.title, titleMath, false);
    titleRow.appendChild(titleMath);
    if (decl.proofTag) {
      const tag = document.createElement("span");
      tag.className = "proofTag";
      tag.textContent = decl.proofTag;
      titleRow.appendChild(tag);
    }
    wrap.appendChild(titleRow);
  }

  for (const line of decl.lines) {
    const row = document.createElement("div");
    row.className = "line";
    if (line.label) {
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = line.label;
      row.appendChild(label);
    }
    const math = document.createElement("span");
    renderKatex(line.tex, math, false);
    row.appendChild(math);
    wrap.appendChild(row);
  }

  return wrap;
}

function convert() {
  const src = els.input.value.trim();
  if (!src) {
    els.statusHint.textContent = "paste some Lean first";
    els.output.classList.remove("show");
    return;
  }

  let decls;
  try {
    decls = translateLean(src);
  } catch (e) {
    els.statusHint.textContent = "couldn't parse that — try a smaller snippet";
    els.output.classList.remove("show");
    return;
  }

  if (!decls.length) {
    els.statusHint.textContent = "nothing to convert";
    els.output.classList.remove("show");
    return;
  }

  els.declList.innerHTML = "";
  const combined = [];
  for (const decl of decls) {
    els.declList.appendChild(buildDeclNode(decl));
    combined.push(decl.combinedTex);
  }

  els.latexOut.value = combined.map((t) => `$$${t}$$`).join("\n\n");
  els.statusHint.textContent = `converted ${decls.length} statement${decls.length === 1 ? "" : "s"}`;
  els.output.classList.add("show");
}

els.copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.latexOut.value);
    const original = els.copyBtn.textContent;
    els.copyBtn.textContent = "copied!";
    setTimeout(() => (els.copyBtn.textContent = original), 1400);
  } catch (e) {
    els.latexOut.select();
    document.execCommand("copy");
  }
});

els.shareBtn.addEventListener("click", () => {
  const shareText = "just turned some Lean into readable math notation with leanmath — https://leanmath.bisks.net/";
  window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`, "_blank", "noopener");
});

// Seed the box with the first example so the page never looks empty.
els.input.value = EXAMPLES[0];
convert();
