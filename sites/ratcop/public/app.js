// ratcop: word/phrase-substitution translator between rationalist jargon
// (yudisms + broader rat-community usage + documented zizian dialect) and
// cop speak. Not machine translation — a fixed glossary (lib/glossary.js),
// matched longest-phrase-first so multi-word terms win over any word inside
// them, then swapped in place with best-effort case preservation.
import { GLOSSARY, dialectLabel } from "./lib/glossary.js";

const SITE_URL = "https://ratcop.bisks.net/";

const els = {
  sideLeft: document.getElementById("sideLeft"),
  sideRight: document.getElementById("sideRight"),
  flipBtn: document.getElementById("flipBtn"),
  input: document.getElementById("input"),
  inputLabel: document.getElementById("inputLabel"),
  output: document.getElementById("output"),
  outputLabel: document.getElementById("outputLabel"),
  exampleBtn: document.getElementById("exampleBtn"),
  clearBtn: document.getElementById("clearBtn"),
  shareBluesky: document.getElementById("shareBluesky"),
  glossarySearch: document.getElementById("glossarySearch"),
  dialectFilter: document.getElementById("dialectFilter"),
  glossaryBody: document.getElementById("glossaryBody"),
  noResults: document.getElementById("noResults"),
};

// direction: "r2c" translates rationalist -> cop, "c2r" the reverse.
let direction = "r2c";

// Five hand-picked examples per side, cycled in order on each click of
// exampleBtn (not random — a fixed tour so repeat clicks are predictable).
// Each sentence leans on a different cluster of glossary terms so repeated
// clicks show off more of the dictionary instead of the same handful of rows.
const EXAMPLES = {
  r2c: [
    "My prior is that Moloch is why my akrasia and the ugh field keep " +
      "threatening our AGI timelines — a real Vassarite would just do a " +
      "Bayesian update and get back to unihemispheric sleep training instead " +
      "of doing a paperclip maximizer about it.",
    "Crocker's rules apply here, so let's try some steelmanning instead of " +
      "falling into a motte and bailey — my epistemic status is uncertain, " +
      "but the crux is whether alignment even matters if p(doom) stays low.",
    "The Sequences taught me to notice a cached thought before it becomes " +
      "belief in belief, and Chesterton's fence says don't touch the org " +
      "chart until you understand orthogonality thesis versus instrumental " +
      "convergence.",
    "Reading HPMOR made me want to shut up and multiply instead of trusting " +
      "the typical mind fallacy, but the outside view says my AGI timelines " +
      "were always a mesa-optimizer for my own anxiety.",
    "Sinceres don't do current-self negotiation — they just accept " +
      "decision-theoretic purity, even when the rest of the hemisphere " +
      "calls it e/acc foom nonsense that violates corrigibility.",
  ],
  c2r: [
    "New intel just came in, so the working theory changed — it's quota " +
      "season, everybody's working a double, no choice, and the rookie who " +
      "goes off-script won't wait for ETA on backup because he thinks he's " +
      "the guy who remembers you didn't help.",
    "The confidence level on this tip is low, but if we hear the suspect's " +
      "side before we write it up we might find the piece that breaks the " +
      "case instead of pulling the old switcheroo on the report.",
    "Don't cross the tape until forensics clears it — that's the whole " +
      "point of setting a precedent, going strictly by the book, and " +
      "keeping the K-9 on a leash even when everybody wants backup and a " +
      "bigger radio.",
    "The academy manual says read them their rights whether or not you " +
      "like the answer, because the report writes itself and boilerplate " +
      "on the report is just a cached thought with a badge number.",
    "How bad tonight's shift is gonna get, out of ten, depends on whether " +
      "the known associate is working the two-way mirror or just assuming " +
      "the suspect thinks like you do — no need to Mirandize me, I know " +
      "the drill.",
  ],
};

// Independent per-side cursor so switching direction doesn't reset the
// other side's place in its tour.
const exampleIndex = { r2c: 0, c2r: 0 };

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function buildDictionary(fromKey, toKey) {
  const byLower = new Map();
  for (const entry of GLOSSARY) byLower.set(entry[fromKey].toLowerCase(), entry[toKey]);
  const terms = [...byLower.keys()].sort((a, b) => b.length - a.length);
  // \b only anchors between a word char and a non-word char, so a shared
  // \b(...)\b wrapper silently drops any term ending in punctuation — "p(doom)"
  // followed by a space has a non-word char on both sides of that boundary,
  // so \b never matches there and the term is never found. Anchor each term
  // only on the edges that are actually word characters.
  const pattern = terms
    .map((t) => {
      const left = /\w/.test(t[0]) ? "\\b" : "";
      const right = /\w/.test(t[t.length - 1]) ? "\\b" : "";
      return `${left}${escapeRegExp(t)}${right}`;
    })
    .join("|");
  const regex = new RegExp(pattern, "gi");
  return { regex, byLower };
}

const RAT_TO_COP = buildDictionary("rat", "cop");
const COP_TO_RAT = buildDictionary("cop", "rat");

// Whether to capitalize the replacement's first letter. Keying this off the
// matched text's own casing (rather than sentence position) was the first
// version's bug: rationalist terms are full of capitalized proper nouns
// ("Moloch", "Vassarite") that aren't sentence-initial, and capitalizing on
// every one of those mid-sentence garbled the output ("a real The one who
// won't let a stop count as a stop would just do..."). Sentence position is
// the only signal that actually means "this should be capitalized."
function isSentenceStart(text, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (i < 0) return true;
  return /[.!?]/.test(text[i]);
}

function applyCase(replacement, atSentenceStart) {
  if (!atSentenceStart || !/^[a-z]/.test(replacement)) return replacement;
  return replacement.charAt(0).toUpperCase() + replacement.slice(1);
}

function translate(text, dir) {
  const { regex, byLower } = dir === "r2c" ? RAT_TO_COP : COP_TO_RAT;
  regex.lastIndex = 0;
  let out = "";
  let lastEnd = 0;
  let match;
  while ((match = regex.exec(text))) {
    const matched = match[0];
    const replacement = byLower.get(matched.toLowerCase());
    out += escapeHtml(text.slice(lastEnd, match.index));
    out += `<mark>${escapeHtml(applyCase(replacement, isSentenceStart(text, match.index)))}</mark>`;
    lastEnd = match.index + matched.length;
  }
  out += escapeHtml(text.slice(lastEnd));
  return out;
}

function render() {
  const text = els.input.value;
  if (!text.trim()) {
    els.output.innerHTML = "";
    els.shareBluesky.style.visibility = "hidden";
    return;
  }
  els.output.innerHTML = translate(text, direction);
  els.shareBluesky.style.visibility = "visible";
  const plain = els.output.textContent;
  const shareText = `ratcop translated my sentence:\n"${plain}"\n${SITE_URL}`;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
}

function setDirection(dir) {
  direction = dir;
  const r2c = dir === "r2c";
  els.sideLeft.classList.toggle("active", r2c);
  els.sideRight.classList.toggle("active", !r2c);
  els.inputLabel.textContent = r2c ? "type some rationalist" : "type some cop";
  els.outputLabel.textContent = r2c ? "translated to cop" : "translated to rationalist";
  render();
}

els.flipBtn.addEventListener("click", () => setDirection(direction === "r2c" ? "c2r" : "r2c"));
els.sideLeft.addEventListener("click", () => setDirection("r2c"));
els.sideRight.addEventListener("click", () => setDirection("c2r"));
els.input.addEventListener("input", render);
els.exampleBtn.addEventListener("click", () => {
  const examples = EXAMPLES[direction];
  const idx = exampleIndex[direction];
  els.input.value = examples[idx];
  exampleIndex[direction] = (idx + 1) % examples.length;
  render();
});
els.clearBtn.addEventListener("click", () => {
  els.input.value = "";
  render();
});

setDirection("r2c");

// --- glossary table ---

function renderGlossary() {
  const q = els.glossarySearch.value.trim().toLowerCase();
  const dialect = els.dialectFilter.value;
  const rows = GLOSSARY.filter((e) => {
    if (dialect && e.dialect !== dialect) return false;
    if (!q) return true;
    return (
      e.rat.toLowerCase().includes(q) ||
      e.cop.toLowerCase().includes(q) ||
      e.ratGloss.toLowerCase().includes(q) ||
      e.copGloss.toLowerCase().includes(q)
    );
  });

  els.noResults.style.display = rows.length ? "none" : "";
  els.glossaryBody.innerHTML = rows
    .map(
      (e) => `<tr>
        <td class="term">${escapeHtml(e.rat)}<span class="badge ${e.dialect}">${escapeHtml(dialectLabel(e.dialect))}</span>
          <div class="gloss">${escapeHtml(e.ratGloss)}</div>
        </td>
        <td class="term">${escapeHtml(e.cop)}
          <div class="gloss">${escapeHtml(e.copGloss)}</div>
        </td>
      </tr>`
    )
    .join("");
}

els.glossarySearch.addEventListener("input", renderGlossary);
els.dialectFilter.addEventListener("change", renderGlossary);
renderGlossary();
