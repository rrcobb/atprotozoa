// TPK — party roller. Everything client-side: seeded RNG so a rolled party
// is a URL (/p/<seed>), not server state. See tree.js for the backstory tree.

const SITE_URL = "https://tpk.bisks.net";

// mulberry32: small, fast, seeded PRNG. Same seed -> same party, forever.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
}

function seedToParam(seed) {
  return seed.toString(36);
}
function paramToSeed(param) {
  const n = parseInt(param, 36);
  return Number.isFinite(n) && n >= 0 ? n >>> 0 : null;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

const CLASSES = [
  "fighter",
  "wizard (theoretical)",
  "rogue, allegedly",
  "cleric of a god who stopped taking calls",
  "bard, unlicensed",
  "barbarian, well-read",
  "ranger who lost the map",
  "paladin between causes",
  "druid, mostly houseplants",
  "monk seeking inner peace and a snack",
  "sorcerer, self-taught, mostly by accident",
  "warlock, vibes-based",
  "necromancer, freelance",
  "artificer, uninsured",
  "assassin (day job: florist)",
  "paladin-adjacent",
];

const STRANGE_STUFF = [
  "sentient mushroom cluster",
  "tax-form golem",
  "swarm of bees in a trenchcoat",
  "possessed teapot",
  "ambulatory hedge",
  "cursed Roomba",
  "ghost of a mediocre bard",
  "pile of laundry, animate",
  "cloud with opinions",
  "three raccoons in a coat",
  "suit of armor, nobody home",
  "homunculus made of gas-station nachos",
  "disgruntled scarecrow",
  "living chandelier",
];

const STRANGE_NAMES = [
  "Unit Seven",
  "Gary",
  "The Third Raccoon",
  "Mx. Fondue",
  "Brenda (allegedly)",
  "Object 44",
  "Two Wasps in a Coat",
  "The Landlord",
  "Steve, Reluctantly",
  "Nameless (by choice)",
  "Chandelier Prime",
  "Roomba 9",
];

const SYLLABLES = {
  human: { pre: ["Al", "Bren", "Cor", "Da", "Ed", "Fen", "Gil", "Han", "Jor", "Mar", "Pet", "Ros"], mid: ["a", "e", "o", "i", "u", "en", "ar"], suf: ["ric", "wen", "din", "mund", "ley", "vic", "ton", "sa", "gard", "wyn"] },
  elf: { pre: ["Ael", "Fael", "Il", "Ly", "Syl", "Thal", "Vael", "Ny", "Cael", "Or"], mid: ["a", "ae", "i", "ie", "y"], suf: ["wyn", "riel", "las", "wen", "dor", "ith", "iel", "an"] },
  dwarf: { pre: ["Bor", "Dur", "Grim", "Kaz", "Thor", "Ung", "Brak", "Dor", "Fim", "Gron"], mid: ["a", "o", "u", "i"], suf: ["gnine", "din", "grim", "bak", "dun", "nor", "rik", "gar"] },
};

function rollName(rng, raceKind) {
  if (raceKind === "strange") return pick(rng, STRANGE_NAMES);
  const bank = SYLLABLES[raceKind];
  const name = pick(rng, bank.pre) + pick(rng, bank.mid) + pick(rng, bank.suf);
  return name;
}

function rollStat(rng) {
  return (
    (Math.floor(rng() * 6) + 1) +
    (Math.floor(rng() * 6) + 1) +
    (Math.floor(rng() * 6) + 1)
  );
}
function modOf(score) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function shortClass(cls) {
  return cls.split(/[,(]/)[0].trim();
}

function rollMember(rng) {
  const raceRoll = Math.floor(rng() * 4); // human / elf / dwarf / strange stuff
  const raceKind = ["human", "elf", "dwarf", "strange"][raceRoll];
  const race = raceKind === "strange" ? pick(rng, STRANGE_STUFF) : raceKind;
  const name = rollName(rng, raceKind);
  const cls = pick(rng, CLASSES);
  const str = rollStat(rng);
  const int = rollStat(rng);
  const agi = rollStat(rng);
  const backstory = rollBackstory(rng, { name, shortClass: shortClass(cls) });
  return { name, race, cls, str, int, agi, backstory };
}

const VERDICTS = [
  [0, 10, "The dungeon already has the paperwork ready."],
  [10, 25, "Grim. Bring the good rope."],
  [25, 40, "Not great. Somebody's not making the return trip."],
  [40, 55, "Coin flip energy, and the coin looks worried."],
  [55, 70, "Actually not bad, for once."],
  [70, 85, "Suspiciously confident. The dungeon does not like this."],
  [85, 101, "Genuinely good odds. Treat this as foreshadowing."],
];
function verdictFor(pct) {
  return VERDICTS.find(([lo, hi]) => pct >= lo && pct < hi)[2];
}

function rollParty(seed) {
  const rng = mulberry32(seed);
  const members = [1, 2, 3, 4].map(() => rollMember(rng));
  const total = members.reduce((s, m) => s + m.str + m.int + m.agi, 0); // 36..216
  const base = (total - 36) / (216 - 36);
  const dungeonMood = Math.floor(rng() * 20) + 1; // d20, the dungeon's own roll
  let pct = Math.round(base * 65 + dungeonMood * 1.6);
  pct = Math.max(2, Math.min(94, pct));
  return { seed, members, pct };
}

// --- rendering ---

const els = {
  rollBtn: document.getElementById("rollBtn"),
  rollFreshBtn: document.getElementById("rollFreshBtn"),
  sharedBanner: document.getElementById("sharedBanner"),
  meter: document.getElementById("meter"),
  meterPct: document.getElementById("meterPct"),
  meterFill: document.getElementById("meterFill"),
  meterVerdict: document.getElementById("meterVerdict"),
  party: document.getElementById("party"),
  shareRow: document.getElementById("shareRow"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareImage: document.getElementById("shareImage"),
  copyLink: document.getElementById("copyLink"),
  shareCanvas: document.getElementById("shareCanvas"),
};

let current = null;

function renderParty(state) {
  current = state;
  els.meter.classList.add("show");
  els.meterPct.textContent = `${state.pct}%`;
  els.meterFill.style.width = `${state.pct}%`;
  els.meterVerdict.textContent = verdictFor(state.pct);

  els.party.innerHTML = "";
  state.members.forEach((m) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h2>${escapeHtml(m.name)}</h2>
      <p class="subtitle">${escapeHtml(m.race)} · ${escapeHtml(m.cls)}</p>
      <div class="stats">
        <div class="stat"><div class="k">STR</div><div class="v">${m.str}</div><div class="m">${modOf(m.str)}</div></div>
        <div class="stat"><div class="k">INT</div><div class="v">${m.int}</div><div class="m">${modOf(m.int)}</div></div>
        <div class="stat"><div class="k">AGI</div><div class="v">${m.agi}</div><div class="m">${modOf(m.agi)}</div></div>
      </div>
      <p class="backstory">${escapeHtml(m.backstory)}</p>
    `;
    els.party.appendChild(card);
  });
  els.party.classList.add("show");
  els.shareRow.classList.add("show");

  const url = `${SITE_URL}/p/${seedToParam(state.seed)}`;
  els.shareBluesky.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(buildShareText(state, url))}`;
  history.replaceState(null, "", `/p/${seedToParam(state.seed)}`);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildShareText(state, url) {
  const full =
    `Rolled a TPK party: ` +
    state.members.map((m) => `${m.name} the ${m.race} ${shortClass(m.cls)}`).join(", ") +
    `. Survival odds: ${state.pct}%. ${url}`;
  if (Array.from(full).length <= 300) return full;
  const compact = `Rolled a TPK party of 4. Survival odds: ${state.pct}%. Odds are, they're not gonna make it. ${url}`;
  return compact;
}

function doRoll(seed) {
  const s = rollParty(seed);
  renderParty(s);
  return s;
}

els.rollBtn.addEventListener("click", () => {
  els.sharedBanner.classList.remove("show");
  doRoll(randomSeed());
});
els.rollFreshBtn.addEventListener("click", () => {
  els.sharedBanner.classList.remove("show");
  doRoll(randomSeed());
});

els.copyLink.addEventListener("click", async () => {
  if (!current) return;
  const url = `${SITE_URL}/p/${seedToParam(current.seed)}`;
  try {
    await navigator.clipboard.writeText(url);
    const orig = els.copyLink.textContent;
    els.copyLink.textContent = "copied!";
    setTimeout(() => (els.copyLink.textContent = orig), 1400);
  } catch {
    prompt("copy this link:", url);
  }
});

// --- share card image ---

function buildShareCard(state) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#17120c");
  bgGrad.addColorStop(1, "#0c0a08");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffb454";
  ctx.font = "700 64px 'JetBrains Mono', monospace";
  ctx.fillText("TPK", 48, 84);
  ctx.fillStyle = "#a89679";
  ctx.font = "22px 'JetBrains Mono', monospace";
  ctx.fillText("a dungeon crawler party roller", 52, 116);

  const rowY = 150;
  const rowH = 100;
  state.members.forEach((m, i) => {
    const y = rowY + i * rowH;
    ctx.fillStyle = "#1d1712";
    ctx.strokeStyle = "#352a1e";
    ctx.lineWidth = 1;
    roundRect(ctx, 48, y, W - 96, rowH - 14, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffb454";
    ctx.font = "700 24px 'JetBrains Mono', monospace";
    ctx.fillText(m.name, 68, y + 34);

    ctx.fillStyle = "#e9ddc6";
    ctx.font = "18px 'JetBrains Mono', monospace";
    ctx.fillText(`${m.race} · ${shortClass(m.cls)}`, 68, y + 62);

    ctx.fillStyle = "#a89679";
    ctx.font = "16px 'JetBrains Mono', monospace";
    ctx.fillText(`STR ${m.str}  INT ${m.int}  AGI ${m.agi}`, W - 300, y + 48);
  });

  const meterY = rowY + state.members.length * rowH + 20;
  ctx.fillStyle = "#a89679";
  ctx.font = "20px 'JetBrains Mono', monospace";
  ctx.fillText("PARTY SURVIVAL ODDS", 48, meterY);
  ctx.fillStyle = "#e9ddc6";
  ctx.font = "700 36px 'JetBrains Mono', monospace";
  ctx.fillText(`${state.pct}%`, 48, meterY + 44);

  ctx.fillStyle = "#2a1414";
  roundRect(ctx, 220, meterY + 18, W - 268, 18, 9);
  ctx.fill();
  const fillGrad = ctx.createLinearGradient(220, 0, W - 48, 0);
  fillGrad.addColorStop(0, "#b23a3a");
  fillGrad.addColorStop(1, "#e0553f");
  ctx.fillStyle = fillGrad;
  roundRect(ctx, 220, meterY + 18, (W - 268) * (state.pct / 100), 18, 9);
  ctx.fill();

  ctx.fillStyle = "#a89679";
  ctx.font = "20px 'JetBrains Mono', monospace";
  ctx.fillText("tpk.bisks.net", 48, H - 36);

  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

els.shareImage.addEventListener("click", async () => {
  if (!current) return;
  const canvas = buildShareCard(current);
  const url = `${SITE_URL}/p/${seedToParam(current.seed)}`;
  const text = buildShareText(current, url);

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    if (canShareFiles()) {
      const file = new File([blob], "tpk-party.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text, title: "TPK" });
        return;
      } catch {
        // fall through to download
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tpk-party.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
});

// --- boot ---

(function boot() {
  const m = location.pathname.match(/^\/p\/([A-Za-z0-9]+)$/);
  if (m) {
    const seed = paramToSeed(m[1]);
    if (seed !== null) {
      els.sharedBanner.classList.add("show");
      doRoll(seed);
      return;
    }
  }
})();
