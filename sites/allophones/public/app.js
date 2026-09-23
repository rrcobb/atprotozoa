import {
  PLACES, MANNERS, CONSONANTS, HEIGHTS, BACKNESSES, VOWELS,
} from "./data.js";
import {
  consonantIPA, voicingsFor, vowelIPA, roundingsFor,
  ipaOf, romanOf, meaning, countSpace,
  encodeSyllable, decodeSyllable,
} from "./meaning.js";

const SITE_URL = "https://allophones.bisks.net/";

const state = {
  slot: "onset", // "onset" | "nucleus" | "coda"
  onset: null, // { place, manner, voiced }
  nucleus: null, // { height, backness, rounded, nasal }
  coda: null, // { place, manner, voiced } | null
  word: [], // array of syllable objects the player has "added"
};

const els = {};
document.querySelectorAll("[id]").forEach((el) => { els[el.id] = el; });

// ---- consonant chart (11 places x 8 manners, voiceless/voiced per cell) ----
function buildConsonantChart() {
  const table = document.createElement("table");
  table.className = "chart consonant-chart";

  const head = document.createElement("tr");
  head.appendChild(document.createElement("th"));
  for (const p of PLACES) {
    const th = document.createElement("th");
    th.textContent = p.label;
    head.appendChild(th);
  }
  table.appendChild(head);

  for (const m of MANNERS) {
    const row = document.createElement("tr");
    const rowHead = document.createElement("th");
    rowHead.textContent = m.label;
    rowHead.className = "row-label";
    row.appendChild(rowHead);

    for (const p of PLACES) {
      const td = document.createElement("td");
      const voicings = voicingsFor(p.id, m.id);
      if (voicings.length === 0) {
        td.className = "empty-cell";
      } else {
        for (const voiced of voicings) {
          const symbol = consonantIPA(p.id, m.id, voiced);
          const span = document.createElement("span");
          span.className = "symbol " + (voiced ? "voiced" : "voiceless");
          span.textContent = symbol;
          span.dataset.place = p.id;
          span.dataset.manner = m.id;
          span.dataset.voiced = String(voiced);
          span.title = `${voiced ? "voiced" : "voiceless"} ${p.label.toLowerCase()} ${m.label.toLowerCase()}`;
          span.addEventListener("click", () => pickConsonant(p.id, m.id, voiced));
          td.appendChild(span);
        }
      }
      row.appendChild(td);
    }
    table.appendChild(row);
  }
  els["consonant-chart-mount"].replaceChildren(table);
}

// ---- vowel chart (7 heights x 3 backnesses, unrounded/rounded per cell) ----
function buildVowelChart() {
  const table = document.createElement("table");
  table.className = "chart vowel-chart";

  const head = document.createElement("tr");
  head.appendChild(document.createElement("th"));
  for (const b of BACKNESSES) {
    const th = document.createElement("th");
    th.textContent = b.label;
    head.appendChild(th);
  }
  table.appendChild(head);

  for (const h of HEIGHTS) {
    const row = document.createElement("tr");
    const rowHead = document.createElement("th");
    rowHead.textContent = h.label;
    rowHead.className = "row-label";
    row.appendChild(rowHead);

    for (const b of BACKNESSES) {
      const td = document.createElement("td");
      const roundings = roundingsFor(h.id, b.id);
      if (roundings.length === 0) {
        td.className = "empty-cell";
      } else {
        for (const rounded of roundings) {
          const symbol = vowelIPA(h.id, b.id, rounded, false);
          const span = document.createElement("span");
          span.className = "symbol " + (rounded ? "rounded" : "unrounded");
          span.textContent = symbol;
          span.dataset.height = h.id;
          span.dataset.backness = b.id;
          span.dataset.rounded = String(rounded);
          span.title = `${rounded ? "rounded" : "unrounded"} ${h.label.toLowerCase()} ${b.label.toLowerCase()} vowel`;
          span.addEventListener("click", () => pickVowel(h.id, b.id, rounded));
          td.appendChild(span);
        }
      }
      row.appendChild(td);
    }
    table.appendChild(row);
  }
  els["vowel-chart-mount"].replaceChildren(table);
}

// Highlights are derived from state on every render, not toggled ad hoc from
// click handlers — the consonant chart is shared between the onset and coda
// slots, so an onset selection and a coda selection must both stay visibly
// marked at once (picking a coda must not visually erase the onset).
function syncChartHighlights() {
  els["consonant-chart-mount"].querySelectorAll(".symbol").forEach((el) => {
    const matches = (v) => v && el.dataset.place === v.place && el.dataset.manner === v.manner && el.dataset.voiced === String(v.voiced);
    el.classList.toggle("selected-onset", matches(state.onset));
    el.classList.toggle("selected-coda", matches(state.coda));
  });
  els["vowel-chart-mount"].querySelectorAll(".symbol").forEach((el) => {
    const v = state.nucleus;
    const matches = v && el.dataset.height === v.height && el.dataset.backness === v.backness && el.dataset.rounded === String(v.rounded);
    el.classList.toggle("selected-nucleus", Boolean(matches));
  });
}

function pickConsonant(place, manner, voiced) {
  const value = { place, manner, voiced };
  if (state.slot === "onset") state.onset = value;
  else if (state.slot === "coda") state.coda = value;
  else return; // nucleus slot active — consonant chart clicks do nothing
  render();
}

function pickVowel(height, backness, rounded) {
  if (state.slot !== "nucleus") return;
  state.nucleus = { height, backness, rounded, nasal: els.nasalize.checked };
  render();
}

function currentSyllable() {
  if (!state.nucleus) return null;
  return { onset: state.onset, nucleus: state.nucleus, coda: state.coda };
}

function render() {
  // slot tabs
  document.querySelectorAll(".slot-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.slot === state.slot);
  });
  els["consonant-chart-wrap"].hidden = state.slot === "nucleus";
  els["vowel-chart-wrap"].hidden = state.slot !== "nucleus";
  els["clear-onset"].hidden = state.slot !== "onset";
  els["clear-coda"].hidden = state.slot !== "coda";

  // if the nucleus's nasal flag disagrees with the checkbox (toggled after
  // picking a vowel), keep them in sync so the result panel is honest.
  if (state.nucleus) state.nucleus.nasal = els.nasalize.checked;

  const syl = currentSyllable();
  if (!syl) {
    els["ipa-display"].textContent = "pick a vowel to start";
    els["roman-display"].textContent = "";
    els["gloss-display"].textContent = "";
    els["add-syllable"].disabled = true;
  } else {
    els["ipa-display"].textContent = "[" + ipaOf(syl) + "]";
    els["roman-display"].textContent = romanOf(syl);
    els["gloss-display"].textContent = meaning(syl);
    els["add-syllable"].disabled = false;
  }

  syncChartHighlights();
  renderWord();
  syncPermalink();
}

function renderWord() {
  if (state.word.length === 0) {
    els["word-display"].textContent = "(nothing yet — build a syllable above and add it)";
    els["word-gloss"].replaceChildren();
    els["share-bar"].hidden = true;
    return;
  }
  els["share-bar"].hidden = false;
  els["word-display"].textContent = state.word.map(romanOf).join("") + " [" + state.word.map(ipaOf).join(".") + "]";
  els["word-gloss"].replaceChildren(
    ...state.word.map((syl, i) => {
      const li = document.createElement("div");
      li.className = "word-gloss-line";
      li.textContent = `${romanOf(syl)} — ${meaning(syl)}`;
      return li;
    })
  );

  const shareText = buildShareText();
  els["share-bluesky"].href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
}

function buildShareText() {
  const word = state.word.map(romanOf).join("");
  const glosses = state.word.map((s) => meaning(s).replace(/^[a-z]+\.\s*/, "")).join("; ");
  let text = `I minted "${word}" on the morphophonemic chart: ${glosses}\n${SITE_URL}${location.search}`;
  if (text.length > 300) text = `I minted "${word}" on the morphophonemic chart.\n${SITE_URL}${location.search}`;
  return text;
}

function syncPermalink() {
  if (state.word.length === 0) {
    history.replaceState(null, "", location.pathname);
    return;
  }
  const encoded = state.word.map(encodeSyllable).join("~");
  const url = new URL(location.href);
  url.search = "?w=" + encoded;
  history.replaceState(null, "", url.pathname + url.search);
}

function loadFromPermalink() {
  const params = new URLSearchParams(location.search);
  const w = params.get("w");
  if (!w) return;
  const syllables = w.split("~").map(decodeSyllable).filter(Boolean);
  state.word = syllables;
}

// ---- legal-value pools, for the dice button ----
function randomLegalConsonant() {
  const pool = [];
  for (const m of MANNERS) {
    for (const p of PLACES) {
      for (const voiced of voicingsFor(p.id, m.id)) pool.push({ place: p.id, manner: m.id, voiced });
    }
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomLegalVowel() {
  const pool = [];
  for (const h of HEIGHTS) {
    for (const b of BACKNESSES) {
      for (const rounded of roundingsFor(h.id, b.id)) pool.push({ height: h.id, backness: b.id, rounded });
    }
  }
  const v = pool[Math.floor(Math.random() * pool.length)];
  return { ...v, nasal: Math.random() < 0.15 };
}

function randomize() {
  const wantOnset = Math.random() < 0.85;
  state.onset = wantOnset ? randomLegalConsonant() : null;
  state.nucleus = randomLegalVowel();
  state.coda = Math.random() < 0.35 ? randomLegalConsonant() : null;
  els.nasalize.checked = state.nucleus.nasal;
  render();
}

function wireEvents() {
  document.querySelectorAll(".slot-tab").forEach((btn) => {
    btn.addEventListener("click", () => { state.slot = btn.dataset.slot; render(); });
  });
  els["clear-onset"].addEventListener("click", () => { state.onset = null; render(); });
  els["clear-coda"].addEventListener("click", () => { state.coda = null; render(); });
  els.nasalize.addEventListener("change", render);
  els["add-syllable"].addEventListener("click", () => {
    const syl = currentSyllable();
    if (!syl) return;
    state.word.push(syl);
    render();
  });
  els["random-syllable"].addEventListener("click", randomize);
  els["clear-word"].addEventListener("click", () => { state.word = []; render(); });
  els["copy-link"].addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      els["copy-link"].textContent = "copied!";
      setTimeout(() => { els["copy-link"].textContent = "copy permalink"; }, 1500);
    } catch (_) {
      // clipboard permission denied or unavailable — nothing to fall back to
      // on a plain button, the URL is already visible in the address bar.
    }
  });
}

function init() {
  buildConsonantChart();
  buildVowelChart();
  wireEvents();
  loadFromPermalink();

  const { total, consonants, vowelQualities } = countSpace();
  els["combo-count"].textContent = total.toLocaleString("en-US");
  els["inventory-count"].textContent = `${consonants} consonants x ${vowelQualities} vowel qualities (x2 for nasalization)`;

  render();
}

init();
