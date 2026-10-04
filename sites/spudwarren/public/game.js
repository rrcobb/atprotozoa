// spudwarren — a cozy potatopunk farming sim. All state lives in localStorage.

const SAVE_KEY = "spudwarren-save-v1";
const COLS = 7, ROWS = 5;
const BASE_ENERGY = 12;

const CROPS = {
  turnip:   { name: "turnip",   emoji: "🧅", days: 2, sell: 9,   seed: 4 },
  potato:   { name: "potato",   emoji: "🥔", days: 3, sell: 16,  seed: 7 },
  beet:     { name: "beet",     emoji: "🍠", days: 4, sell: 26,  seed: 11 },
  glowcap:  { name: "glowcap",  emoji: "🍄", days: 5, sell: 46,  seed: 20 },
  moonspud: { name: "moonspud", emoji: "🌕", days: 6, sell: 110, seed: null }, // only the sixth house hands these out
};
const CROP_KEYS = Object.keys(CROPS);

const NPCS = {
  mabel: {
    name: "Mabel", face: "🕊️", kind: "pigeon, market stall",
    loves: "beet",
    lines: [
      ["coo. seeds are on the cart, rent is on the cart, and the cart is on fire (it's fine, it's a heat lamp).", "you're the rat with the roof plot? good. nobody else buys turnips."],
      ["i saved you the good seeds. don't tell the sparrows, they unionized.", "the city's got a lot of dirt in it if you know which parts to scrape."],
      ["you know what i like about you? you pay. in coin. not in 'exposure' or 'gum'.", "if the roof ever floods, my coop's got room. bring the beets."],
    ],
  },
  reginald: {
    name: "Reginald", face: "🪳", kind: "cockroach, poet, tenant of the radiator",
    loves: "potato",
    lines: [
      ["i have survived four exterminations and one divorce. ask me anything. do not ask me about the divorce.", "a rat! how rustic. i write about hunger, mostly."],
      ["'oh tuber, oh tuber, thou art a fist of earth / a brown moon / a promise.' — it's a work in progress.", "they say the fifth house is the last house. they say that, yes. they say it quickly."],
      ["you've read my poems and not fled. i'm putting you in the dedication, in the small print where the roaches live.", "the sixth house has a smell of wet soil and candle. i don't go. a poet should know when to be a witness and not a participant."],
    ],
  },
  rocco: {
    name: "Rocco", face: "🦝", kind: "raccoon, bin chef",
    loves: "glowcap",
    lines: [
      ["i cook out of the bins behind the noodle place. it's called 'curating'.", "got any mushrooms? the dumpster ones are fine but you can tell they have lived."],
      ["today's special: day-old bread, a peach pit, and ambition. the ambition is free.", "word on the street is a door shows up in the alley after dark. i said 'sure' and kept walking."],
      ["i made you a stew. it's mostly love, a little bit of pigeon feather, i apologize.", "listen: if you ever join a cult, make sure it has a kitchen. cults run on soup."],
    ],
  },
  marlowe: {
    name: "Marlowe", face: "🐈‍⬛", kind: "stray cat, landlord of the fire escape",
    loves: "turnip",
    lines: [
      ["we have an arrangement, you and i. i do not eat you. you do not make it weird.", "the turnips. keep them coming. do not look at me like that."],
      ["i'm not smiling. that's just my face doing a thing. leave it.", "i've been to the sixth door once. the door asked me my name. i said 'no.' the door respected that."],
      ["fine. you're alright. the arrangement is now a friendship and i will deny it in public.", "the cult doesn't want a cat. we 'have too many opinions.' fair."],
    ],
  },
  opal: {
    name: "Opal", face: "🐁", kind: "opossum (the emoji doesn't exist, she's fine about it)",
    loves: "glowcap",
    lines: [
      ["*lies perfectly still* ...i'm asleep. this is a nap. this is a very good nap.", "*cracks one eye* you smell like soil. good soil. night soil."],
      ["do you ever just... feel the city breathing? the pipes? it's got a pulse. it's slow. it's patient.", "come out after dark sometime. the alley has a sixth door. don't tell the others. they already know."],
      ["i only play dead because it's the one way the world lets me stop. you listen. thank you.", "the sixth house isn't scary. it's just people who got tired of being alone and decided to share a hole."],
    ],
  },
};
const NPC_KEYS = Object.keys(NPCS);

const RANKS = [
  { title: "stranger", ask: { potato: 1 } },
  { title: "listener", ask: { turnip: 3 } },
  { title: "sprout", ask: { glowcap: 1 } },
  { title: "tuber", ask: { moonspud: 1 } },
  { title: "eldest eye", ask: null },
];
const DOOR_TEXT = [
  "A small door, painted the green of old copper, between the noodle place and the laundromat vents. It wasn't here at noon.\n\nA voice that sounds like a hundred small voices breathing together: \"A tuber, for the table. One. Raw is fine. We aren't fussy.\"",
  "The door opens a hand's width. Warm light and onion smell. Somebody is humming.\n\n\"Welcome, listener. Three turnips for the long table. We feed anyone who feeds the long table.\"",
  "The door opens fully. Inside: a round cellar, rugs layered on rugs, a hundred candles in jars. Rats, mice, one very small frog. A soup the size of a bathtub.\n\n\"Sprout! Bring us light. A glowcap, for the lamp that never goes out.\"",
  "They've made you a robe out of a tea towel. It fits. Someone has embroidered a small potato on the hood.\n\n\"Tuber. The last offering is the one you grew in our own dirt: a moonspud. Bring one, and we plant the First Spud.\"",
  "The cellar is quiet. The First Spud goes into a bowl of soil, and everyone puts a hand in.\n\nIt turns out the sixth house is not a house. It's the pooled rent of five houses' worth of nobody, a soup on Thursdays, and a promise that no one in the warren eats alone.\n\n\"Eldest Eye. Come whenever. The door will know you.\"",
];
const RANK_REWARDS = [
  { seeds: { moonspud: 1 }, text: "They press a single pale seed into your paws. It's warm. 🌕 moonspud seed." },
  { seeds: { moonspud: 1 }, text: "A bowl of soup and another moonspud seed. 'Plant it by night, water it with a lullaby.'" },
  { seeds: { moonspud: 1 }, coins: 60, text: "The lamp lights. They give you 60 coins from the jar and another moonspud seed." },
  { coins: 120, text: "A robe and 120 coins from the soup jar. You get a nickname: 'Spud-Who-Listens'." },
];

// ---------- state ----------
function freshState() {
  return {
    day: 1, energy: BASE_ENERGY, boots: 0, coins: 12,
    tool: "hoe", seedPick: "potato",
    seeds: { turnip: 3, potato: 2, beet: 0, glowcap: 0, moonspud: 0 },
    crops: { turnip: 0, potato: 0, beet: 0, glowcap: 0, moonspud: 0 },
    plots: Array.from({ length: COLS * ROWS }, () => ({ tilled: false, crop: null, stage: 0, wet: false })),
    friends: Object.fromEntries(NPC_KEYS.map((k) => [k, { pts: 0, talked: 0, gifted: 0, perk: false }])),
    rank: 0, rain: false, harvested: 0, robe: false,
  };
}
let S = load();
let says = {};     // npc key -> last line shown (transient)
let doorSay = "";  // transient
let scene = "farm";
let logMsg = "you wake up on a rooftop in a bathtub full of dirt. good.";

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (raw && Array.isArray(raw.plots) && raw.plots.length === COLS * ROWS) {
      const base = freshState();
      return { ...base, ...raw, seeds: { ...base.seeds, ...raw.seeds }, crops: { ...base.crops, ...raw.crops },
               friends: { ...base.friends, ...raw.friends } };
    }
  } catch (_) { /* fall through to a fresh save */ }
  return freshState();
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (_) { /* private mode: play unsaved */ } }

const maxEnergy = () => BASE_ENERGY + S.boots * 3;
const isNight = () => S.energy <= 0;
const hearts = (k) => Math.min(5, Math.floor(S.friends[k].pts / 4));
const $ = (id) => document.getElementById(id);

function say(msg) { logMsg = msg; $("log").textContent = msg; }

function spend() {
  S.energy = Math.max(0, S.energy - 1);
  if (S.energy === 0) logMsg = "the streetlights flicker on. too dark to farm — but the alley is waking up.";
}

// ---------- farm ----------
function plantedLeft(p) { return p.crop && p.stage < CROPS[p.crop].days; }
function isRipe(p) { return p.crop && p.stage >= CROPS[p.crop].days; }

function clickTile(i) {
  const p = S.plots[i];
  if (isRipe(p)) {
    S.crops[p.crop]++; S.harvested++;
    logMsg = `harvested a ${CROPS[p.crop].emoji} ${CROPS[p.crop].name}.`;
    p.crop = null; p.stage = 0; p.wet = false; p.tilled = true;
  } else if (isNight()) {
    logMsg = "it's night. you can't see your own hoe.";
  } else if (S.tool === "hoe") {
    if (p.tilled) logMsg = "already tilled.";
    else if (p.crop) logMsg = "something's growing there.";
    else { p.tilled = true; spend(); if (S.energy) logMsg = "tilled. smells like possibility and bus exhaust."; }
  } else if (S.tool === "can") {
    if (!plantedLeft(p)) logMsg = "nothing there that needs water.";
    else if (p.wet) logMsg = "already damp.";
    else { p.wet = true; spend(); if (S.energy) logMsg = "watered. a drip-drip lullaby."; }
  } else if (S.tool === "seed") {
    const k = S.seedPick;
    if (!p.tilled) logMsg = "till it first (🪏).";
    else if (p.crop) logMsg = "already planted.";
    else if (!S.seeds[k]) logMsg = `out of ${CROPS[k].name} seeds. the market has more.`;
    else {
      S.seeds[k]--; p.crop = k; p.stage = 0; p.wet = S.rain; spend();
      if (S.energy) logMsg = `planted a ${CROPS[k].name}. grows in ${CROPS[k].days} watered days.`;
    }
  }
  save(); render();
}

function sleep() {
  for (const p of S.plots) {
    if (plantedLeft(p) && p.wet) p.stage++;
    p.wet = false;
  }
  S.day++;
  S.energy = maxEnergy();
  S.rain = Math.random() < 0.25;
  if (S.rain) for (const p of S.plots) if (plantedLeft(p)) p.wet = true;
  const ripe = S.plots.filter(isRipe).length;
  logMsg = `day ${S.day}. ${S.rain ? "rain on the tin roof — everything got a free drink. " : ""}${ripe ? ripe + " ripe and waiting." : ""}`;
  scene = "farm";
  save(); render();
}

// ---------- alley ----------
function talk(k) {
  const f = S.friends[k], n = NPCS[k];
  const tier = hearts(k) < 2 ? 0 : hearts(k) < 4 ? 1 : 2;
  const pool = n.lines[tier];
  says[k] = pool[(S.day + f.pts) % pool.length];
  if (f.talked !== S.day) { f.talked = S.day; f.pts++; }
  perks(k);
  save(); render();
}

function give(k, crop) {
  const f = S.friends[k], n = NPCS[k];
  if (S.crops[crop] < 1) return;
  if (f.gifted === S.day) { says[k] = `${n.name} already has your gift for today. (one per day.)`; render(); return; }
  S.crops[crop]--; f.gifted = S.day;
  const loved = n.loves === crop;
  f.pts += loved ? 5 : 2;
  says[k] = loved ? `${n.name} clutches the ${CROPS[crop].emoji} like it's a baby. "how did you KNOW."` : `${n.name} accepts the ${CROPS[crop].emoji}. "...thanks. that's nice."`;
  perks(k);
  save(); render();
}

function perks(k) {
  const f = S.friends[k];
  if (f.perk || hearts(k) < 3) return;
  f.perk = true;
  if (k === "rocco") { S.seeds.glowcap += 3; says[k] += "\n\n[rocco hands you 3 glowcap spores in a takeout lid.]"; }
  if (k === "marlowe") { S.coins += 40; says[k] += "\n\n[marlowe drops 40 coins at your feet and looks away.]"; }
  if (k === "mabel") says[k] += "\n\n[mabel will now sell you seeds 20% cheaper.]";
  if (k === "reginald") { S.coins += 15; says[k] += "\n\n[reginald sells you nothing and gives you 15 coins for 'a good audience'.]"; }
  if (k === "opal") { S.seeds.moonspud += 1; says[k] += "\n\n[opal rolls a moonspud seed toward you with her tail.]"; }
}

// ---------- market ----------
const seedPrice = (k) => Math.round(CROPS[k].seed * (S.friends.mabel.perk ? 0.8 : 1));
const bootPrice = () => 50 + S.boots * 50;

function buySeed(k) {
  const c = seedPrice(k);
  if (S.coins < c) { say("not enough coins."); return; }
  S.coins -= c; S.seeds[k]++; logMsg = `bought a ${CROPS[k].name} seed for ${c}.`;
  save(); render();
}
function sellCrop(k) {
  const n = S.crops[k];
  if (!n) return;
  const gain = n * CROPS[k].sell;
  S.crops[k] = 0; S.coins += gain;
  logMsg = `sold ${n} ${CROPS[k].name} for ${gain} coins.`;
  save(); render();
}
function buyBoots() {
  if (S.boots >= 3) return;
  const c = bootPrice();
  if (S.coins < c) { say("not enough coins."); return; }
  S.coins -= c; S.boots++; S.energy += 3;
  logMsg = "patched boots! you have more energy now.";
  save(); render();
}

// ---------- the sixth door ----------
function offer() {
  const need = RANKS[S.rank].ask;
  if (!need) return;
  for (const [k, n] of Object.entries(need)) if (S.crops[k] < n) { doorSay = "The voices wait. You don't have the offering yet."; render(); return; }
  for (const [k, n] of Object.entries(need)) S.crops[k] -= n;
  const r = RANK_REWARDS[S.rank];
  if (r) {
    if (r.seeds) for (const [k, n] of Object.entries(r.seeds)) S.seeds[k] += n;
    if (r.coins) S.coins += r.coins;
    if (S.rank === 2) S.robe = true;
  }
  S.rank++;
  doorSay = (r ? r.text + "\n\n" : "") + DOOR_TEXT[S.rank];
  logMsg = `you are now: ${RANKS[S.rank].title}.`;
  save(); render();
}

// ---------- rendering ----------
function offerText(need) {
  return Object.entries(need).map(([k, n]) => `${n}× ${CROPS[k].emoji} ${CROPS[k].name}`).join(" + ");
}

function render() {
  const night = isNight();
  document.body.classList.toggle("night", night);
  $("dayLabel").textContent = `day ${S.day}`;
  $("weather").textContent = night ? "🌙" : S.rain ? "🌧️" : "☀️";
  $("coins").textContent = S.coins;
  $("energyNum").textContent = `${S.energy}/${maxEnergy()}`;
  $("energyBar").style.width = `${Math.round((S.energy / maxEnergy()) * 100)}%`;
  $("clock").textContent = night ? "night" : S.energy <= 4 ? "dusk" : S.energy <= 8 ? "afternoon" : "morning";
  $("log").textContent = logMsg;
  $("tagline").textContent = S.rank >= 4 ? "a rat. a rooftop plot. a seat at the long table." : "a rat. a rooftop plot. a city of nonhuman neighbors.";

  // the sixth door only exists after dark, from day 3 on
  const doorOpen = night && S.day >= 3;
  $("doorTab").hidden = !doorOpen;
  if (scene === "door" && !doorOpen) scene = "farm";
  for (const b of document.querySelectorAll("#nav [data-scene]")) b.classList.toggle("on", b.dataset.scene === scene);
  for (const el of document.querySelectorAll(".scene")) el.hidden = el.id !== `scene-${scene}`;

  renderFarm(); renderAlley(); renderMarket(); renderDoor(); renderBag();
  $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText());
}

function renderFarm() {
  const tools = $("tools");
  tools.textContent = "";
  const mk = (label, on, fn) => {
    const b = document.createElement("button");
    b.textContent = label; b.className = on ? "on" : ""; b.onclick = fn; tools.appendChild(b);
  };
  mk("🪏 hoe", S.tool === "hoe", () => { S.tool = "hoe"; render(); });
  mk("🚿 can", S.tool === "can", () => { S.tool = "can"; render(); });
  for (const k of CROP_KEYS) {
    if (k === "moonspud" && !S.seeds[k] && S.tool !== "seed") continue;
    if (!S.seeds[k] && S.seedPick !== k) continue;
    mk(`${CROPS[k].emoji}×${S.seeds[k]}`, S.tool === "seed" && S.seedPick === k, () => { S.tool = "seed"; S.seedPick = k; render(); });
  }
  const grid = $("grid");
  grid.textContent = "";
  S.plots.forEach((p, i) => {
    const b = document.createElement("button");
    b.className = "tile" + (p.tilled ? " tilled" : p.crop ? "" : " weedy") + (p.wet ? " wet" : "") + (isRipe(p) ? " ripe" : "") + (p.crop === "moonspud" ? " moon" : "");
    let t = "";
    if (isRipe(p)) t = CROPS[p.crop].emoji;
    else if (p.crop) t = p.stage === 0 ? "🌱" : "🌿";
    else if (!p.tilled) t = "·";
    b.textContent = t;
    b.setAttribute("aria-label", p.crop ? `${p.crop}, ${isRipe(p) ? "ripe" : "growing"}` : p.tilled ? "tilled soil" : "weedy dirt");
    b.onclick = () => clickTile(i);
    grid.appendChild(b);
  });
  $("farmHint").textContent = isNight()
    ? "night. the roof is too dark to work. sleep, or go see who's out."
    : "pick a tool, tap a tile. ripe crops are picked by tapping them. each till / plant / water costs 1 energy.";
}

function renderAlley() {
  const list = $("alleyList");
  list.textContent = "";
  const night = isNight();
  for (const k of NPC_KEYS) {
    const n = NPCS[k];
    const awake = !night || k === "opal";
    const card = document.createElement("div");
    card.className = "panel npc";
    const f = document.createElement("div"); f.className = "face"; f.textContent = n.face;
    const m = document.createElement("div"); m.className = "meta";
    const h = document.createElement("div");
    h.innerHTML = "";
    const nm = document.createElement("b"); nm.textContent = n.name;
    const kd = document.createElement("span"); kd.style.color = "var(--dim)"; kd.textContent = ` — ${n.kind}`;
    const hr = document.createElement("div"); hr.className = "hearts";
    hr.textContent = "♥".repeat(hearts(k)) + "♡".repeat(5 - hearts(k));
    h.append(nm, kd); m.append(h, hr);
    if (!awake) {
      const z = document.createElement("div"); z.className = "say"; z.textContent = "zzz… (asleep until morning)";
      m.appendChild(z);
    } else {
      const row = document.createElement("div"); row.className = "row";
      const tb = document.createElement("button"); tb.textContent = "💬 talk"; tb.onclick = () => talk(k); row.appendChild(tb);
      for (const c of CROP_KEYS) {
        if (!S.crops[c]) continue;
        const gb = document.createElement("button");
        gb.textContent = `give ${CROPS[c].emoji}`; gb.onclick = () => give(k, c); row.appendChild(gb);
      }
      m.appendChild(row);
      if (says[k]) { const s = document.createElement("div"); s.className = "say"; s.textContent = says[k]; m.appendChild(s); }
    }
    card.append(f, m);
    list.appendChild(card);
  }
  const ex = $("alleyExtra");
  ex.textContent = "";
  const p = document.createElement("p");
  p.style.margin = "0 0 8px";
  if (night) {
    p.textContent = S.day >= 3
      ? "the alley is quiet. at the far end, between the noodle place and the laundromat vents, there is a door that wasn't there at noon."
      : "the alley is quiet. you feel like you're early for something.";
    ex.appendChild(p);
  } else {
    p.textContent = "daylight. everyone who matters is out. if you want to see what the alley's like after dark, you can wait for nightfall.";
    ex.appendChild(p);
    const w = document.createElement("button");
    w.textContent = "🌙 wait for nightfall";
    w.onclick = () => { S.energy = 0; logMsg = "you lie low till the streetlights come on."; save(); render(); };
    ex.appendChild(w);
  }
}

function renderMarket() {
  const el = $("marketPanel");
  el.textContent = "";
  const n = NPCS.mabel;
  const head = document.createElement("div");
  head.className = "npc";
  head.innerHTML = `<div class="face">${n.face}</div><div class="meta"><b>Mabel's cart</b><div class="sub" style="margin:2px 0">${isNight() ? "closed for the night. the heat lamp's still on." : "seeds, bolts, and gossip."}</div></div>`;
  el.appendChild(head);
  if (isNight()) return;

  const tbl = document.createElement("table");
  const addRow = (label, btnLabel, fn, disabled) => {
    const tr = document.createElement("tr");
    const a = document.createElement("td"); a.textContent = label;
    const b = document.createElement("td");
    const btn = document.createElement("button"); btn.textContent = btnLabel; btn.disabled = !!disabled; btn.onclick = fn;
    b.appendChild(btn); tr.append(a, b); tbl.appendChild(tr);
  };
  for (const k of CROP_KEYS) {
    if (CROPS[k].seed == null) continue;
    if (k === "glowcap" && S.day < 4) continue;
    addRow(`${CROPS[k].emoji} ${CROPS[k].name} seed · grows in ${CROPS[k].days}d · sells ${CROPS[k].sell}`, `buy ${seedPrice(k)}🪙`, () => buySeed(k), S.coins < seedPrice(k));
  }
  for (const k of CROP_KEYS) {
    if (!S.crops[k]) continue;
    addRow(`${CROPS[k].emoji} ${S.crops[k]} ${CROPS[k].name}`, `sell all ${S.crops[k] * CROPS[k].sell}🪙`, () => sellCrop(k));
  }
  if (S.boots < 3) addRow(`🥾 patched boots (+3 max energy) · ${S.boots}/3`, `buy ${bootPrice()}🪙`, buyBoots, S.coins < bootPrice());
  el.appendChild(tbl);
}

function renderDoor() {
  const el = $("doorPanel");
  el.textContent = "";
  el.className = "panel" + (S.rank >= 4 ? " end" : "");
  const t = document.createElement("div");
  t.className = "night-only";
  t.innerHTML = "<b>🚪 the sixth door</b>";
  const rank = document.createElement("div");
  rank.style.color = "var(--dim)"; rank.textContent = `standing: ${RANKS[S.rank].title}${S.robe ? " 🧥" : ""}`;
  const body = document.createElement("div");
  body.className = "say";
  body.textContent = doorSay || DOOR_TEXT[S.rank];
  el.append(t, rank, body);
  const need = RANKS[S.rank].ask;
  if (need) {
    const b = document.createElement("button");
    b.textContent = `offer ${offerText(need)}`;
    b.onclick = offer;
    el.appendChild(b);
  } else {
    const done = document.createElement("p");
    done.textContent = "🥔 you've found the sixth house. come back any night; there's always soup.";
    el.appendChild(done);
  }
}

function renderBag() {
  const parts = [];
  for (const k of CROP_KEYS) {
    if (S.seeds[k]) parts.push(`${CROPS[k].emoji} seed ×${S.seeds[k]}`);
    if (S.crops[k]) parts.push(`${CROPS[k].emoji} ×${S.crops[k]}`);
  }
  $("bag").textContent = "bag: " + (parts.length ? parts.join(" · ") : "empty, except for lint.");
}

function shareText() {
  const rank = RANKS[S.rank].title;
  const cult = S.rank >= 4 ? "i found the sixth house. " : "";
  return `${cult}day ${S.day} in spudwarren: a rat, ${S.harvested} harvests, ${S.coins} coins, standing: ${rank}. https://spudwarren.bisks.net/`;
}

// ---------- wiring ----------
for (const b of document.querySelectorAll("#nav [data-scene]")) {
  b.addEventListener("click", () => { scene = b.dataset.scene; render(); });
}
$("sleepBtn").addEventListener("click", sleep);
$("resetBtn").addEventListener("click", () => {
  if (!confirm("start a new save? your current warren is gone.")) return;
  S = freshState(); says = {}; doorSay = ""; scene = "farm";
  logMsg = "you wake up on a rooftop in a bathtub full of dirt. good.";
  save(); render();
});
$("shareBtn").addEventListener("click", async () => {
  const text = shareText();
  if (navigator.share) { try { await navigator.share({ text }); return; } catch (_) { /* cancelled; fall through */ } }
  try { await navigator.clipboard.writeText(text); say("copied to clipboard."); } catch (_) { say(text); }
});

render();
