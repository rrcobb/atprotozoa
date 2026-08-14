// telepathy test — telepathy.bisks.net
//
// Entirely client-side: the target card is fixed for the whole run (the
// queen of clubs — see wrangler.toml for why), and every guess is scored
// against it locally. Nothing about the target is ever sent anywhere, so
// there's no server surface worth having.
(() => {
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const SUITS = [
    { key: "spades", glyph: "♠", color: "black", name: "Spades" },
    { key: "hearts", glyph: "♥", color: "red", name: "Hearts" },
    { key: "diamonds", glyph: "♦", color: "red", name: "Diamonds" },
    { key: "clubs", glyph: "♣", color: "black", name: "Clubs" },
  ];
  const SUIT_BY_KEY = Object.fromEntries(SUITS.map((s) => [s.key, s]));

  // The target never changes for the life of a session — that's the whole
  // bit: it's not random per guess, so repeated tries actually converge.
  const TARGET = { rank: "Q", suit: "clubs" };

  const STORAGE_KEY = "telepathy:v1";

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { tried: [], won: false };
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.tried)) return { tried: [], won: false };
      return { tried: parsed.tried, won: !!parsed.won };
    } catch (_) {
      return { tried: [], won: false };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // localStorage unavailable (private mode, quota) — the test still
      // works for the current page load, it just won't survive a reload.
    }
  }

  const state = loadState();

  const els = {
    suitsGrid: document.getElementById("suitsGrid"),
    logList: document.getElementById("logList"),
    statusMsg: document.getElementById("statusMsg"),
    attemptCount: document.getElementById("attemptCount"),
    pickSection: document.getElementById("pickSection"),
    winSection: document.getElementById("winSection"),
    winCardLabel: document.getElementById("winCardLabel"),
    winAttempts: document.getElementById("winAttempts"),
    winPlural: document.getElementById("winPlural"),
    winStat: document.getElementById("winStat"),
    shareBtn: document.getElementById("shareBtn"),
  };

  function cardId(rank, suitKey) {
    return `${rank}-${suitKey}`;
  }

  function cardLabel(rank, suitKey) {
    const suit = SUIT_BY_KEY[suitKey];
    return `${rank}${suit.glyph}`;
  }

  function score(rank, suitKey) {
    const suit = SUIT_BY_KEY[suitKey];
    const rankHit = rank === TARGET.rank;
    const suitHit = suitKey === TARGET.suit;
    const colorHit = suit.color === SUIT_BY_KEY[TARGET.suit].color;
    return { rankHit, suitHit, colorHit, win: rankHit && suitHit };
  }

  function buildGrid() {
    els.suitsGrid.innerHTML = "";
    for (const suit of SUITS) {
      const row = document.createElement("div");
      row.className = "suit-row";

      const glyph = document.createElement("div");
      glyph.className = `suit-glyph ${suit.color}`;
      glyph.textContent = suit.glyph;
      row.appendChild(glyph);

      for (const rank of RANKS) {
        const id = cardId(rank, suit.key);
        const btn = document.createElement("button");
        btn.className = "card";
        btn.type = "button";
        btn.dataset.id = id;
        btn.dataset.rank = rank;
        btn.dataset.suit = suit.key;
        btn.textContent = `${rank}${suit.glyph}`;
        btn.setAttribute("aria-label", `guess ${rank} of ${suit.name}`);
        btn.addEventListener("click", () => onGuess(rank, suit.key));
        row.appendChild(btn);
      }
      els.suitsGrid.appendChild(row);
    }
  }

  function renderLog() {
    if (!state.tried.length) {
      els.logList.innerHTML =
        '<div class="empty">Nothing sensed yet. Every guess narrows the signal — color, suit, and rank each light up when they match.</div>';
      return;
    }
    els.logList.innerHTML = "";
    // Most recent first.
    for (let i = state.tried.length - 1; i >= 0; i--) {
      const t = state.tried[i];
      const suit = SUIT_BY_KEY[t.suit];
      const row = document.createElement("div");
      row.className = "log-row";

      const label = document.createElement("span");
      label.className = `card-label ${suit.color}`;
      label.textContent = cardLabel(t.rank, t.suit);
      row.appendChild(label);

      const tiles = document.createElement("div");
      tiles.className = "tiles";
      tiles.appendChild(makeTile(t.colorHit, "◐"));
      tiles.appendChild(makeTile(t.suitHit, suit.glyph));
      tiles.appendChild(makeTile(t.rankHit, t.rank));
      row.appendChild(tiles);

      const n = document.createElement("span");
      n.className = "n";
      n.textContent = `#${i + 1}`;
      row.appendChild(n);

      els.logList.appendChild(row);
    }
  }

  function makeTile(hit, glyph) {
    const tile = document.createElement("span");
    tile.className = "tile" + (hit ? " hit" : "");
    tile.textContent = glyph;
    return tile;
  }

  function applyButtonStates() {
    const buttons = els.suitsGrid.querySelectorAll("button.card");
    const triedById = new Map(state.tried.map((t) => [cardId(t.rank, t.suit), t]));
    buttons.forEach((btn) => {
      const id = btn.dataset.id;
      const t = triedById.get(id);
      btn.classList.remove("tried-warm", "tried-close", "won");
      if (t) {
        btn.disabled = true;
        if (t.win) btn.classList.add("won");
        else if (t.colorHit) btn.classList.add("tried-warm");
        else btn.classList.add("tried-close");
      } else {
        btn.disabled = state.won;
      }
    });
  }

  function updateStatus() {
    els.attemptCount.textContent = String(state.tried.length);
    if (state.won) {
      els.statusMsg.textContent = "Contact made.";
    } else if (state.tried.length === 0) {
      els.statusMsg.textContent = "No transmission received yet.";
    } else {
      const last = state.tried[state.tried.length - 1];
      const hits = [last.colorHit, last.suitHit, last.rankHit].filter(Boolean).length;
      els.statusMsg.textContent = hits === 0 ? "Static. Nothing landed." : `Partial signal — ${hits}/3 matched.`;
    }
  }

  function shareText(attempts) {
    const n = attempts;
    const url = "https://telepathy.bisks.net/";
    return `🧠 Made telepathic contact in ${n} attempt${n === 1 ? "" : "s"} at telepathy test. Clear your mind and try to read it too: ${url}`;
  }

  function showWin() {
    const suit = SUIT_BY_KEY[TARGET.suit];
    els.winCardLabel.textContent = cardLabel(TARGET.rank, TARGET.suit);
    els.winCardLabel.className = `card-big ${suit.color}`;
    const n = state.tried.length;
    els.winAttempts.textContent = String(n);
    els.winPlural.textContent = n === 1 ? "" : "s";
    els.winStat.textContent =
      n === 1
        ? "First try. Either you're the real thing or you read the original post."
        : `The deck has 52 cards. You needed ${n} of them.`;
    els.winSection.classList.add("show");
    els.shareBtn.onclick = () => {
      window.open(
        "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText(n)),
        "_blank",
        "noopener",
      );
    };
  }

  function onGuess(rank, suitKey) {
    if (state.won) return;
    const id = cardId(rank, suitKey);
    if (state.tried.some((t) => cardId(t.rank, t.suit) === id)) return;

    const result = score(rank, suitKey);
    state.tried.push({ rank, suit: suitKey, ...result });
    if (result.win) state.won = true;
    saveState();

    renderLog();
    applyButtonStates();
    updateStatus();
    if (result.win) showWin();
  }

  buildGrid();
  renderLog();
  applyButtonStates();
  updateStatus();
  if (state.won) showWin();
})();
