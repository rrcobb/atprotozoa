// Splicepedia — everything runs client-side against Wikipedia's own
// CORS-enabled action API (origin=* is explicitly supported for anonymous
// browser reads). No backend, no persisted state: a "permalink" just encodes
// which source sentences were used so the exact splice can be rebuilt later.

const API = "https://en.wikipedia.org/w/api.php";
const MIN_EXTRACT_LEN = 400;
const ARTICLES_PER_BATCH = 9;
const MIN_POOL_SENTENCES = 40;
const MIN_SOURCES = 6;
const BEAM_WIDTH = 6;

// ---- Wikipedia fetch -------------------------------------------------------
//
// TextExtracts has a hard, undocumented-until-you-hit-it cap: a *full*
// plain-text extract (explaintext with no exintro/exchars limit) is only
// ever returned for ONE page per request — the API silently caps exlimit at
// 1 and adds a warning, even when you passed a generator or a multi-title
// `titles=` list asking for many. Batch full-article extract requests just
// come back with every page but the first having an empty extract. So: fetch
// the N random titles cheaply in one call, then fetch each page's real
// extract with its own request, in parallel.

async function fetchRandomTitles(n) {
  const params = new URLSearchParams({
    action: "query",
    generator: "random",
    grnnamespace: "0",
    grnlimit: String(n),
    format: "json",
    origin: "*",
    formatversion: "2",
  });
  const res = await fetch(`${API}?${params.toString()}`);
  if (!res.ok) throw new Error(`Wikipedia API error ${res.status}`);
  const data = await res.json();
  return ((data.query && data.query.pages) || []).map((p) => p.title);
}

async function fetchPageFull(title) {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "extracts|categories",
    explaintext: "1",
    exsectionformat: "plain",
    cllimit: "50",
    format: "json",
    origin: "*",
    formatversion: "2",
  });
  const res = await fetch(`${API}?${params.toString()}`);
  if (!res.ok) throw new Error(`Wikipedia API error ${res.status}`);
  const data = await res.json();
  const pages = (data.query && data.query.pages) || [];
  return pages[0] || null;
}

async function fetchRandomPages(n) {
  const titles = await fetchRandomTitles(n);
  const pages = await Promise.all(titles.map((t) => fetchPageFull(t).catch(() => null)));
  return pages.filter(Boolean);
}

async function fetchPagesByTitles(titles) {
  const pages = await Promise.all(titles.map((t) => fetchPageFull(t).catch(() => null)));
  return pages.filter(Boolean);
}

// ---- text -> sentences ------------------------------------------------------

function looksLikeHeading(line) {
  // Plain-text extracts put section headers on their own line with no
  // trailing punctuation ("History", "See also"); real prose ends in ./!/?.
  if (/[.!?]["'”)]?$/.test(line)) return false;
  return line.length < 60;
}

function cleanLine(line) {
  return line.replace(/\[\d+\]/g, "").replace(/\s{2,}/g, " ").trim();
}

function splitIntoSentences(extract) {
  const lines = extract.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const sentences = [];
  for (const raw of lines) {
    if (looksLikeHeading(raw)) continue;
    const line = cleanLine(raw);
    if (!line) continue;
    const parts = line.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(“])/);
    for (const part of parts) {
      const t = part.trim();
      if (t.length < 35 || t.length > 280) continue;
      if (!/[.!?]["')”]?$/.test(t)) continue;
      if (!/^[A-Z0-9"'“]/.test(t)) continue;
      if (t.split(/\s+/).length < 6) continue;
      sentences.push(t);
    }
  }
  return sentences;
}

// ---- rough entity typing, for "ontological vandalism" ---------------------

const TYPE_RULES = [
  ["disease", /diseases|disorders|syndromes|infections|medical condition/i],
  ["war", /\bwars\b|battles|military conflict|campaigns/i],
  ["animal", /\bspecies\b|mammals|\bbirds\b|insects|genera|fauna|reptiles|amphibians|\bfish\b|arthropods/i],
  ["country", /\bcountries\b|sovereign states|\bnations\b/i],
  ["food", /\bfoods?\b|dishes|cuisine|beverages|cheeses|fruits|vegetables|\bsnacks?\b/i],
  ["philosophy", /philosoph/i],
  ["vehicle", /automobiles|aircraft|\bships\b|locomotives|\btrains\b|vehicles|spacecraft|motorcycles/i],
  ["religion", /religio|deities|mythology|churches|temples|scripture/i],
  ["software", /software|programming|video games|computing|operating systems|websites|applications/i],
  ["place", /\bcities\b|\btowns\b|geography|\brivers\b|mountains|populated places|villages/i],
  ["organization", /companies|organi[sz]ations|universities|corporations|record labels/i],
  ["person", /\bbirths\b|\bdeaths\b|\bpeople\b|surnames|alumni|living people/i],
  ["event", /\bevents\b|festivals|disasters|incidents/i],
  ["music", /albums|\bsongs\b|\bbands\b|musicians/i],
  ["art", /\bfilms\b|television series|paintings|artworks|novels|\bbooks\b/i],
];

const TYPE_META = {
  disease: { emoji: "\u{1F9A0}", label: "disease" },
  war: { emoji: "⚔️", label: "war" },
  animal: { emoji: "\u{1F43E}", label: "animal" },
  country: { emoji: "\u{1F30D}", label: "country" },
  food: { emoji: "\u{1F37D}️", label: "food" },
  philosophy: { emoji: "\u{1F4AD}", label: "philosophy" },
  vehicle: { emoji: "\u{1F697}", label: "vehicle" },
  religion: { emoji: "\u{1F6D5}", label: "religion" },
  software: { emoji: "\u{1F4BE}", label: "software" },
  place: { emoji: "\u{1F4CD}", label: "place" },
  organization: { emoji: "\u{1F3DB}️", label: "organization" },
  person: { emoji: "\u{1F9D1}", label: "person" },
  event: { emoji: "\u{1F4C5}", label: "event" },
  music: { emoji: "\u{1F3B5}", label: "music" },
  art: { emoji: "\u{1F3A8}", label: "art" },
  other: { emoji: "\u{1F4C4}", label: "topic" },
};

function classify(categories) {
  const text = (categories || []).map((c) => c.title || "").join(" | ");
  for (const [type, re] of TYPE_RULES) if (re.test(text)) return type;
  return "other";
}

// The brief's curated "big bonus" pairs: person<->disease, war<->animal,
// country<->food, philosophy<->vehicle, religion<->software.
const VANDAL_PAIRS = new Set(
  [
    ["person", "disease"],
    ["war", "animal"],
    ["country", "food"],
    ["philosophy", "vehicle"],
    ["religion", "software"],
  ].map(([a, b]) => [a, b].sort().join("|"))
);

function vandalismBonus(typeA, typeB) {
  if (typeA === typeB) return 0;
  if (typeA === "other" || typeB === "other") return 0.25;
  return VANDAL_PAIRS.has([typeA, typeB].sort().join("|")) ? 1 : 0.45;
}

// ---- lexical scoring --------------------------------------------------------

const STOP = new Set(
  ("a an the of to in and is was were are be been being with for on at by from as it its this " +
    "that these those he she they his her their which who whom whose but or not no nor so if " +
    "than then also into over under between among about after before during while up down out " +
    "off again further once here there when where why how all each other some such only own " +
    "same can will would should could may might must did do does had has have")
    .split(" ")
);

function wordsOf(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9' ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

function properNouns(text) {
  const words = text.replace(/[.,!?;:"'“”()]/g, "").split(/\s+/);
  const set = new Set();
  for (let i = 1; i < words.length; i++) {
    // skip index 0: sentence-initial capitalization isn't evidence of a proper noun
    if (/^[A-Z][a-z]{2,}$/.test(words[i])) set.add(words[i]);
  }
  return set;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

// "Similarity around 0.4-0.6 should often beat 0 or 1" -- a bell curve
// peaking at 0.5, not a monotonic overlap score.
function bellOverlap(j) {
  return Math.max(0, 1 - Math.abs(j - 0.5) * 2);
}

function hasSharedEntity(a, b) {
  if (!a.size || !b.size) return false;
  for (const w of a) if (b.has(w)) return true;
  return false;
}

// "Socket" openers naturally attach to almost any prior sentence.
const SOCKETS = [
  /^It\b/, /^This\b/, /^These\b/, /^That\b/, /^Those\b/, /^He\b/, /^She\b/, /^They\b/,
  /^Its\b/, /^Their\b/, /^Such\b/, /^Following this\b/i, /^Despite this\b/i,
  /^In response\b/i, /^The resulting\b/i, /^However\b/, /^Nevertheless\b/,
  /^As a result\b/i, /^Because of this\b/i, /^Meanwhile\b/, /^Consequently\b/,
];

function socketScore(text) {
  return SOCKETS.some((re) => re.test(text)) ? 1 : 0;
}

function grammarScore(prevText, nextText) {
  let s = 0.5;
  if (/^(And|But|Or|So|Yet)\b/.test(nextText)) s -= 0.15;
  if (/[:;]$/.test(prevText.trim())) s += 0.2;
  return Math.max(0, Math.min(1, s));
}

function openingScore(s) {
  let score = 0;
  if (s.position === 0) score += 1.2;
  else if (s.position === 1) score += 0.5;
  else if (s.position === 2) score += 0.15;
  if (/\b(is|was)\s+(a|an|the)\b/i.test(s.text)) score += 0.7;
  if (/^(In |On |During |Following |After )/i.test(s.text)) score -= 0.3;
  return score;
}

// fluency: how locally plausible the seam sounds.
// surprise: how far the ontological ground has shifted underneath it.
// Beam ranking optimizes fluency + surprise (never-same-consecutive-source is
// enforced as a hard constraint on candidates, so "source distance" is always
// satisfied within a valid transition; article-level source diversity gets
// its own bonus when beams are finally ranked, see buildArticle).
const MAX_TRANSITION = 1.6 + 1.0 + 0.6 + 0.4 + 1.4 + 0.6;

function scoreTransition(prev, next) {
  const j = jaccard(prev.words, next.words);
  const overlap = bellOverlap(j);
  const socket = socketScore(next.text);
  const entity = hasSharedEntity(prev.proper, next.proper);
  const grammar = grammarScore(prev.text, next.text);
  const vandal = vandalismBonus(prev.source.type, next.source.type);
  const surpriseOverlap = 1 - Math.min(j * 3, 1);

  const fluency = socket * 1.6 + overlap * 1.0 + (entity ? 0.6 : 0) + grammar * 0.4;
  const surprise = vandal * 1.4 + surpriseOverlap * 0.6;
  const total = fluency + surprise;

  return {
    total,
    normalized: Math.max(0, Math.min(100, Math.round((total / MAX_TRANSITION) * 100))),
    socket: !!socket,
    jaccard: j,
    entity,
    vandal,
    fromType: prev.source.type,
    toType: next.source.type,
  };
}

// ---- pool + beam search -----------------------------------------------------

function buildPool(pages) {
  const pool = [];
  for (const page of pages || []) {
    if (!page || page.missing || !page.extract) continue;
    if (page.extract.length < MIN_EXTRACT_LEN) continue;
    const type = classify(page.categories);
    const sentences = splitIntoSentences(page.extract);
    if (sentences.length < 3) continue;
    const source = {
      pageid: page.pageid,
      title: page.title,
      url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(page.title.replace(/ /g, "_")),
      type,
    };
    sentences.forEach((text, position) => {
      pool.push({ text, source, position, words: wordsOf(text), proper: properNouns(text) });
    });
  }
  return pool;
}

async function gatherPool() {
  let pool = buildPool(await fetchRandomPages(ARTICLES_PER_BATCH));
  let attempts = 0;
  const uniqueSources = () => new Set(pool.map((s) => s.source.pageid)).size;
  while ((pool.length < MIN_POOL_SENTENCES || uniqueSources() < MIN_SOURCES) && attempts < 4) {
    attempts++;
    pool = pool.concat(buildPool(await fetchRandomPages(ARTICLES_PER_BATCH)));
  }
  return pool;
}

// Beam seeds each start from a distinct source article (best opening line per
// source), and repeat-source reuse inside a beam is penalized during search —
// otherwise two sources with unusually high mutual lexical overlap can end up
// looping the whole "article" back and forth between just the two of them,
// which is a boring failure mode, not the ontological-vandalism one.
function buildArticle(pool, targetLen) {
  const bestPerSource = new Map();
  for (const s of pool) {
    const score = openingScore(s);
    const prev = bestPerSource.get(s.source.pageid);
    if (!prev || score > prev.score) bestPerSource.set(s.source.pageid, { s, score });
  }
  const seeds = [...bestPerSource.values()].sort((a, b) => b.score - a.score).slice(0, BEAM_WIDTH);

  let beams = seeds.map((o) => ({
    sentences: [o.s],
    transitions: [null],
    usedText: new Set([o.s.text]),
    sourceCounts: new Map([[o.s.source.pageid, 1]]),
    score: o.score,
  }));

  for (let step = 1; step < targetLen; step++) {
    const next = [];
    for (const beam of beams) {
      const last = beam.sentences[beam.sentences.length - 1];
      for (const cand of pool) {
        if (cand.source.pageid === last.source.pageid) continue; // never two in a row from the same source
        if (beam.usedText.has(cand.text)) continue;
        const t = scoreTransition(last, cand);
        const priorUses = beam.sourceCounts.get(cand.source.pageid) || 0;
        const repeatPenalty = priorUses * 0.9;
        const sourceCounts = new Map(beam.sourceCounts);
        sourceCounts.set(cand.source.pageid, priorUses + 1);
        next.push({
          sentences: beam.sentences.concat(cand),
          transitions: beam.transitions.concat(t),
          usedText: new Set(beam.usedText).add(cand.text),
          sourceCounts,
          score: beam.score + t.total - repeatPenalty,
        });
      }
    }
    if (!next.length) break; // every beam is stuck; ship what we have
    next.sort((a, b) => b.score - a.score);
    beams = next.slice(0, BEAM_WIDTH);
  }

  beams.sort((a, b) => {
    const ua = new Set(a.sentences.map((s) => s.source.pageid)).size;
    const ub = new Set(b.sentences.map((s) => s.source.pageid)).size;
    return b.score + ub * 0.3 - (a.score + ua * 0.3);
  });
  return beams[0];
}

// ---- permalink: encode/decode which exact sentences were used -------------
//
// Lives in the path (/a/<state>), not a #hash: a fragment never reaches the
// server, so a Worker can't tell splices apart to stamp per-result OG tags —
// every share would unfurl as the same generic card forever (see
// notes/45-sharing-and-virality.md, tier 4). src/index.ts decodes this same
// state server-side to personalize the title/description before serving.

function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return decodeURIComponent(escape(atob(s)));
}

function encodeState(result) {
  const compact = result.sentences.map((s) => [s.source.title, s.position]);
  return b64urlEncode(JSON.stringify(compact));
}

function decodePath() {
  const m = /^\/a\/([A-Za-z0-9\-_]+)\/?$/.exec(location.pathname);
  if (!m) return null;
  try {
    const compact = JSON.parse(b64urlDecode(m[1]));
    return Array.isArray(compact) && compact.length ? compact : null;
  } catch {
    return null;
  }
}

async function reconstructFromCompact(compact) {
  const titles = [...new Set(compact.map(([t]) => t))];
  const pages = await fetchPagesByTitles(titles);
  const byTitle = new Map();
  for (const p of pages) if (p && !p.missing && p.extract) byTitle.set(p.title, p);

  const sentences = [];
  for (const [title, position] of compact) {
    const page = byTitle.get(title);
    if (!page) throw new Error(`"${title}" is gone from Wikipedia now.`);
    const sents = splitIntoSentences(page.extract);
    const text = sents[position];
    if (!text) throw new Error(`"${title}" has been edited since this splice was made.`);
    const source = {
      pageid: page.pageid,
      title: page.title,
      url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(page.title.replace(/ /g, "_")),
      type: classify(page.categories),
    };
    sentences.push({ text, source, position, words: wordsOf(text), proper: properNouns(text) });
  }

  const transitions = [null];
  for (let i = 1; i < sentences.length; i++) transitions.push(scoreTransition(sentences[i - 1], sentences[i]));
  return { sentences, transitions };
}

// ---- rendering ---------------------------------------------------------

const els = {
  headline: document.getElementById("headline"),
  status: document.getElementById("status"),
  article: document.getElementById("article"),
  infobox: document.getElementById("infobox"),
  infoboxTitle: document.getElementById("infobox-title"),
  infoboxBody: document.getElementById("infobox-body"),
  stitchNotes: document.getElementById("stitch-notes"),
  btnRandomize: document.getElementById("btn-randomize"),
  btnStitches: document.getElementById("btn-stitches"),
  btnShare: document.getElementById("btn-share"),
  btnPermalink: document.getElementById("btn-permalink"),
  toast: document.getElementById("copied-toast"),
};

let current = null; // last rendered { sentences, transitions }
let stitchesOn = false;

function setStatus(msg, isError) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("error", !!isError);
}

function setBusy(busy) {
  els.btnRandomize.disabled = busy;
}

function bucketOf(norm) {
  if (norm >= 70) return "score-high";
  if (norm >= 40) return "score-mid";
  return "score-low";
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderResult(result) {
  current = result;
  const { sentences, transitions } = result;

  const headline = sentences[0].source.title;
  els.headline.textContent = headline;
  document.title = `${headline} — Splicepedia`;

  // paragraphs of ~3 sentences, like a real article
  const paras = [];
  for (let i = 0; i < sentences.length; i += 3) paras.push(sentences.slice(i, i + 3));

  let idx = 0;
  const paraHtml = paras
    .map((group) => {
      const spans = group
        .map(() => {
          const i = idx++;
          const s = sentences[i];
          const t = transitions[i];
          const norm = t ? t.normalized : null;
          const cls = t ? bucketOf(norm) : "score-low";
          return (
            `<span class="s ${cls}" data-i="${i}">${escapeHtml(s.text)}</span>` +
            `<sup class="stitch-mark ${cls}" data-i="${i}"><a href="#note-${i}" title="source: ${escapeHtml(s.source.title)}">[${i + 1}]</a></sup>`
          );
        })
        .join(" ");
      return `<p>${spans}</p>`;
    })
    .join("\n");
  els.article.innerHTML = paraHtml;
  els.article.hidden = false;

  renderInfobox(result);
  renderStitchNotes(result);

  els.btnStitches.disabled = false;
  els.btnShare.disabled = false;
  els.btnPermalink.disabled = false;
  applyStitchState();
}

function renderInfobox(result) {
  const { sentences, transitions } = result;
  const uniqueSources = new Set(sentences.map((s) => s.source.pageid));
  const scored = transitions.filter(Boolean);
  const avg = scored.length ? Math.round(scored.reduce((a, t) => a + t.normalized, 0) / scored.length) : 0;
  const vandalCount = scored.filter((t) => t.vandal >= 1).length;
  const socketCount = scored.filter((t) => t.socket).length;
  const types = [...new Set(sentences.map((s) => s.source.type))];

  els.infoboxTitle.textContent = sentences[0].source.title;
  els.infoboxBody.innerHTML = [
    ["Sentences", sentences.length],
    ["Sources spliced", uniqueSources.size],
    ["Avg. splice score", `${avg}/100`],
    ["Ontological vandalism", `${vandalCount} jump${vandalCount === 1 ? "" : "s"}`],
    ["Socket transitions", socketCount],
    ["Topics crossed", types.map((t) => `${TYPE_META[t].emoji}`).join(" ")],
  ]
    .map(([k, v]) => `<tr><td class="k">${escapeHtml(String(k))}</td><td class="v">${v}</td></tr>`)
    .join("");
  els.infobox.hidden = false;
}

function renderStitchNotes(result) {
  const { sentences, transitions } = result;
  els.stitchNotes.innerHTML = sentences
    .map((s, i) => {
      const t = transitions[i];
      const meta = TYPE_META[s.source.type];
      const srcLink = `<a href="${s.source.url}" target="_blank" rel="noopener">${escapeHtml(s.source.title)}</a>`;
      if (!t) {
        return `<li id="note-${i}"><strong>[${i + 1}]</strong> opening pick, from ${srcLink} ${meta.emoji} <span class="type-pill">${meta.label}</span> — chosen for confident encyclopedia-voice phrasing, not spliced from a prior sentence.</li>`;
      }
      const cls = bucketOf(t.normalized);
      const fromMeta = TYPE_META[t.fromType];
      const bits = [];
      if (t.socket) bits.push("socket opener");
      if (t.entity) bits.push("shared name/entity");
      if (t.vandal >= 1) bits.push(`ontological vandalism: ${fromMeta.label} → ${meta.label}`);
      bits.push(`lexical overlap ${(t.jaccard * 100).toFixed(0)}%`);
      return (
        `<li id="note-${i}"><strong>[${i + 1}]</strong> <span class="score-tag ${cls}">${t.normalized}/100</span> ` +
        `from ${srcLink} ${meta.emoji} <span class="type-pill">${meta.label}</span> ` +
        `<span class="breakdown">(${bits.join(", ")})</span></li>`
      );
    })
    .join("");
}

function applyStitchState() {
  document.body.classList.toggle("stitches-on", stitchesOn);
  els.stitchNotes.hidden = !stitchesOn;
  els.btnStitches.textContent = stitchesOn ? "\u{1F9F5} Hide stitches" : "\u{1F9F5} Show stitches";
  els.btnStitches.classList.toggle("active", stitchesOn);
}

// ---- sharing -----------------------------------------------------------

function buildShareText(headline, url) {
  const prefix = `Splicepedia generated "${headline}." Every sentence is real, verbatim, and from a completely different Wikipedia article. `;
  const suffix = ` ${url}`;
  const budget = 300 - suffix.length;
  const text = prefix.length > budget ? prefix.slice(0, Math.max(0, budget - 1)) + "…" : prefix;
  return text + suffix;
}

function currentUrl() {
  return `${location.origin}${location.pathname}`;
}

// ---- boot ----------------------------------------------------------------

async function generate() {
  history.replaceState(null, "", "/");
  setStatus("Fetching random articles from Wikipedia…");
  setBusy(true);
  els.btnStitches.disabled = true;
  els.btnShare.disabled = true;
  els.btnPermalink.disabled = true;
  try {
    const pool = await gatherPool();
    if (pool.length < 12) throw new Error("Wikipedia didn't return enough usable sentences that round — try again.");
    const targetLen = 9 + Math.floor(Math.random() * 5);
    const result = buildArticle(pool, targetLen);
    if (!result || result.sentences.length < 4) throw new Error("Couldn't stitch together enough sentences — try again.");
    renderResult(result);
    history.pushState(null, "", "/a/" + encodeState(result));
    setStatus("");
  } catch (e) {
    setStatus(String((e && e.message) || e), true);
  } finally {
    setBusy(false);
  }
}

async function loadFromPath(compact) {
  setStatus("Rebuilding the exact splice from this link…");
  setBusy(true);
  try {
    const result = await reconstructFromCompact(compact);
    renderResult(result);
    setStatus("");
  } catch (e) {
    setStatus(`${(e && e.message) || e} Generating a fresh one instead.`, true);
    await generate();
  } finally {
    setBusy(false);
  }
}

async function boot() {
  const compact = decodePath();
  if (compact) {
    await loadFromPath(compact);
  } else {
    await generate();
  }

  window.addEventListener("popstate", () => {
    const c = decodePath();
    if (c) loadFromPath(c);
  });

  els.btnRandomize.addEventListener("click", generate);

  els.btnStitches.addEventListener("click", () => {
    stitchesOn = !stitchesOn;
    applyStitchState();
  });

  els.btnShare.addEventListener("click", () => {
    if (!current) return;
    const headline = current.sentences[0].source.title;
    const url = currentUrl();
    const text = buildShareText(headline, url);
    window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  });

  els.btnPermalink.addEventListener("click", async () => {
    const url = currentUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this permalink:", url);
      return;
    }
    els.toast.hidden = false;
    setTimeout(() => (els.toast.hidden = true), 1600);
  });
}

boot();
