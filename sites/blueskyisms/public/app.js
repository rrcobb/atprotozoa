// blueskyisms — renders public/data/propositions.json as a navigable,
// cross-linked ontology. Everything below is client-side: no accounts, no
// state beyond a per-browser candle tally in localStorage.

const LINK_LABEL = { supports: "supports", tensions: "tensions with", qualifies: "qualifies" };
const CANDLE_KEY = "blueskyisms:candles";

function naturalCompare(a, b) {
  const pa = a.num.split(".").map(Number);
  const pb = b.num.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? -1, db = pb[i] ?? -1;
    if (da !== db) return da - db;
  }
  return 0;
}

function loadCandles() {
  try {
    return JSON.parse(localStorage.getItem(CANDLE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCandles(candles) {
  localStorage.setItem(CANDLE_KEY, JSON.stringify(candles));
}

async function main() {
  const res = await fetch("data/propositions.json");
  const props = (await res.json()).sort(naturalCompare);
  const byId = new Map(props.map((p) => [p.id, p]));

  const countEl = document.getElementById("prop-count");
  if (countEl) countEl.textContent = props.length;

  // Reverse index: who points AT this id, and with what relation.
  const incoming = new Map(props.map((p) => [p.id, []]));
  for (const p of props) {
    for (const link of p.links) {
      incoming.get(link.to)?.push({ from: p.id, type: link.type });
    }
  }

  const candles = loadCandles();

  const list = document.getElementById("propositions");
  const cards = new Map();

  for (const p of props) {
    const depth = p.num.split(".").length - 1;
    const card = document.createElement("article");
    card.className = "prop";
    card.id = `prop-${p.id}`;
    card.style.setProperty("--depth", depth);
    card.dataset.id = p.id;

    const heading = document.createElement("div");
    heading.className = "prop-head";
    heading.innerHTML = `<span class="prop-num">${p.num}</span>`;
    heading.addEventListener("click", () => toggleFocus(p.id));
    card.appendChild(heading);

    const text = document.createElement("p");
    text.className = "prop-text";
    text.textContent = p.text;
    card.appendChild(text);

    const links = document.createElement("div");
    links.className = "prop-links";
    for (const link of p.links) {
      const target = byId.get(link.to);
      if (!target) continue;
      const pill = document.createElement("button");
      pill.className = `link-pill link-${link.type}`;
      pill.textContent = `${LINK_LABEL[link.type]} → ${target.num}`;
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFocus(p.id, link.to);
      });
      links.appendChild(pill);
    }
    for (const rel of incoming.get(p.id) || []) {
      const source = byId.get(rel.from);
      if (!source) continue;
      const pill = document.createElement("button");
      pill.className = `link-pill link-incoming link-${rel.type}`;
      pill.textContent = `${source.num} ${LINK_LABEL[rel.type]} this →`;
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFocus(p.id, rel.from);
      });
      links.appendChild(pill);
    }
    if (links.children.length) card.appendChild(links);

    const candleRow = document.createElement("button");
    candleRow.className = "candle-btn";
    candleRow.type = "button";
    const count = candles[p.id] || 0;
    candleRow.innerHTML = `<span class="flame">🕯️</span><span class="candle-count">${count ? `${count} lit` : "light a candle"}</span>`;
    candleRow.addEventListener("click", (e) => {
      e.stopPropagation();
      candles[p.id] = (candles[p.id] || 0) + 1;
      saveCandles(candles);
      candleRow.querySelector(".candle-count").textContent = `${candles[p.id]} lit`;
      updateCandleTotal();
    });
    card.appendChild(candleRow);

    list.appendChild(card);
    cards.set(p.id, card);
  }

  function updateCandleTotal() {
    const total = Object.values(candles).reduce((a, b) => a + b, 0);
    const el = document.getElementById("candle-total");
    el.textContent = total ? `🕯️ ${total} candle${total === 1 ? "" : "s"} lit, this browser` : "";
  }
  updateCandleTotal();

  const resetBtn = document.getElementById("reset-view");

  function clearFocus() {
    for (const card of cards.values()) card.classList.remove("in-focus", "dimmed");
    resetBtn.hidden = true;
  }

  function toggleFocus(id, jumpTo) {
    const already = cards.get(id)?.classList.contains("in-focus") && !jumpTo;
    if (already) {
      clearFocus();
      return;
    }
    const focusId = jumpTo || id;
    const focusProp = byId.get(focusId);
    if (!focusProp) return;
    const related = new Set([focusId, ...focusProp.links.map((l) => l.to), ...(incoming.get(focusId) || []).map((r) => r.from)]);
    for (const [pid, card] of cards) {
      card.classList.toggle("in-focus", pid === focusId);
      card.classList.toggle("dimmed", !related.has(pid));
    }
    resetBtn.hidden = false;
    history.replaceState(null, "", `#${focusId}`);
    cards.get(focusId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  resetBtn.addEventListener("click", clearFocus);

  document.getElementById("random-prop").addEventListener("click", () => {
    const ids = [...byId.keys()];
    const pick = ids[Math.floor(Math.random() * ids.length)];
    toggleFocus(pick, pick);
  });

  const initial = decodeURIComponent(location.hash.slice(1));
  if (initial && byId.has(initial)) toggleFocus(initial, initial);
}

main();
