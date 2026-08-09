// Pikiwedia client script — home page toy + the bits every page shares
// (hamburger menu, bluesky share link). The swap algorithm here is a
// deliberate copy of src/index.ts's (see that file's header comment):
// server-side duplication of client logic within ONE site, not a shared
// package across sites.

const STOPWORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being","of","in","on","at","to","for","with","by",
  "from","as","or","and","but","that","this","these","those","it","its","his","her","their","our","your",
  "my","i","you","he","she","we","they","may","can","could","will","would","shall","should","has","have",
  "had","not","no","nor","than","then","so","such","also","which","who","whom","whose","into","onto","upon",
  "about","over","under","between","among","through","during","before","after","above","below","up","down",
  "out","off","again","further","once","here","there","when","where","why","how","all","each","few","more",
  "most","other","some","any","both","either","neither","one","two","if","because","while","do","does","did",
  "done","per","via","vs",
]);

function splitOnset(word) {
  const m = word.match(/^[^aeiouAEIOU]+/);
  const onset = m ? m[0] : "";
  return [onset, word.slice(onset.length)];
}

function spoonerizePair(a, b) {
  const [oa, ra] = splitOnset(a);
  const [ob, rb] = splitOnset(b);
  return [ob + ra, oa + rb];
}

function selfSpoonerize(word) {
  if (word.length < 4) return null;
  const isVowel = (c) => "aeiouAEIOU".includes(c);
  const candidates = [];
  for (let i = 1; i < word.length; i++) {
    if (isVowel(word[i - 1]) && !isVowel(word[i])) candidates.push(i);
  }
  const mid = word.length / 2;
  candidates.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  for (const split of candidates) {
    const h1 = word.slice(0, split);
    const h2 = word.slice(split);
    const [o1, r1] = splitOnset(h1);
    const [o2, r2] = splitOnset(h2);
    if (o1.length <= 2 && o2.length <= 2 && r1.length > 0 && r2.length > 0) {
      const [s1, s2] = spoonerizePair(h1, h2);
      return s1 + s2;
    }
  }
  return null;
}

function matchCase(orig, transformed) {
  if (!orig) return transformed;
  if (orig.length > 1 && orig === orig.toUpperCase() && /[A-Z]/.test(orig)) {
    return transformed.toUpperCase();
  }
  if (orig[0] >= "A" && orig[0] <= "Z") {
    return transformed.charAt(0).toUpperCase() + transformed.slice(1);
  }
  return transformed;
}

function spoonerizeText(text) {
  const tokens = text.match(/[A-Za-z]+|[^A-Za-z]+/g) || [];
  const contentIdx = [];
  tokens.forEach((t, i) => {
    if (/^[A-Za-z]/.test(t) && !STOPWORDS.has(t.toLowerCase())) contentIdx.push(i);
  });
  for (let k = 0; k + 1 < contentIdx.length; k += 2) {
    const i = contentIdx[k];
    const j = contentIdx[k + 1];
    const [sa, sb] = spoonerizePair(tokens[i].toLowerCase(), tokens[j].toLowerCase());
    tokens[i] = matchCase(tokens[i], sa);
    tokens[j] = matchCase(tokens[j], sb);
  }
  if (contentIdx.length % 2 === 1) {
    const last = contentIdx[contentIdx.length - 1];
    const self = selfSpoonerize(tokens[last].toLowerCase());
    if (self) tokens[last] = matchCase(tokens[last], self);
  }
  return tokens.join("");
}

// ---- live toy (home page only) ----
const toyInput = document.getElementById("toy-input");
const toyOutput = document.getElementById("toy-output");
if (toyInput && toyOutput) {
  const run = () => {
    toyOutput.textContent = toyInput.value.trim() ? spoonerizeText(toyInput.value) : "";
  };
  toyInput.addEventListener("input", run);
  run();
}

// ---- hamburger menu (every page) ----
const hamburger = document.querySelector(".hamburger");
if (hamburger) {
  hamburger.addEventListener("click", () => {
    let panel = document.getElementById("hamburger-panel");
    if (panel) {
      panel.remove();
      return;
    }
    panel = document.createElement("div");
    panel.id = "hamburger-panel";
    panel.style.cssText =
      "position:absolute;top:100%;left:0;background:#fff;border:1px solid #a2a9b1;" +
      "box-shadow:0 2px 6px rgba(0,0,0,0.15);padding:0.5rem 0;min-width:180px;z-index:10;border-radius:4px;";
    panel.innerHTML =
      '<a href="/" style="display:block;padding:0.5rem 1rem;">Home</a>' +
      '<a href="/random" style="display:block;padding:0.5rem 1rem;">Random article</a>' +
      '<a href="https://spoonerism.bisks.net/" style="display:block;padding:0.5rem 1rem;">spoonerism (word bank)</a>';
    hamburger.parentElement.style.position = "relative";
    hamburger.parentElement.appendChild(panel);
  });
}

// ---- bluesky share link (article pages) ----
const shareLink = document.getElementById("share-bsky");
if (shareLink) {
  const metaText = document.querySelector('meta[name="pikiwedia:share-text"]');
  const shareText = metaText
    ? metaText.getAttribute("content")
    : `${document.title} — ${location.href}`;
  shareLink.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
}
