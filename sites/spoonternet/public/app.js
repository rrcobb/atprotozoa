// spoonternet home-page toy. The swap algorithm here is a deliberate copy of
// src/index.ts's (see that file's header comment): server-side duplication of
// client logic within ONE site, not a shared package across sites. Proxied
// pages (/go?u=...) never load this file — their CSP forbids scripts
// entirely, and their own spoonerizing happens server-side.

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

const toyInput = document.getElementById("toy-input");
const toyOutput = document.getElementById("toy-output");
if (toyInput && toyOutput) {
  const run = () => {
    toyOutput.textContent = toyInput.value.trim() ? spoonerizeText(toyInput.value) : "";
  };
  toyInput.addEventListener("input", run);
  run();
}
