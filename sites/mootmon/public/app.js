import { buildCluster } from "./lib/cluster.js";
import { monsterFor, typeMeta, typeMultiplier } from "./lib/monster.js";
import {
  getDex, getParty, getRecord, recordResult, addToDex, addToParty,
  removeFromParty, isCaught, attemptCatch, MAX_PARTY,
} from "./lib/capture.js";
import { ready, resolveRound } from "./lib/battle.js";

const $ = (id) => document.getElementById(id);
const els = {
  titleScreen: $("titleScreen"),
  gameScreen: $("gameScreen"),
  searchForm: $("searchForm"),
  handleInput: $("handleInput"),
  openBtn: $("openBtn"),
  status: $("status"),

  trainerAvatar: $("trainerAvatar"),
  trainerWho: $("trainerWho"),
  trainerSub: $("trainerSub"),
  recWins: $("recWins"),
  recLosses: $("recLosses"),

  regionStatus: $("regionStatus"),
  regionGrid: $("regionGrid"),

  partyCount: $("partyCount"),
  partySlots: $("partySlots"),
  dexGrid: $("dexGrid"),
  dexEmpty: $("dexEmpty"),

  opponentForm: $("opponentForm"),
  opponentInput: $("opponentInput"),
  battleStatus: $("battleStatus"),
  opponentPreview: $("opponentPreview"),
  opponentTitle: $("opponentTitle"),
  opponentTeam: $("opponentTeam"),
  startBattleBtn: $("startBattleBtn"),
  battleArena: $("battleArena"),
  pAvatar: $("pAvatar"), pSpecies: $("pSpecies"), pHpBar: $("pHpBar"),
  oAvatar: $("oAvatar"), oSpecies: $("oSpecies"), oHpBar: $("oHpBar"),
  battleLog: $("battleLog"),
  attackBtn: $("attackBtn"),
  fleeBtn: $("fleeBtn"),
  battleShareRow: $("battleShareRow"),
  shareBluesky: $("shareBluesky"),
  rematchBtn: $("rematchBtn"),

  encounterModal: $("encounterModal"),
  encType: $("encType"),
  encAvatar: $("encAvatar"),
  encSpecies: $("encSpecies"),
  encHandle: $("encHandle"),
  encRarity: $("encRarity"),
  encHpBar: $("encHpBar"),
  encStats: $("encStats"),
  weakenBtn: $("weakenBtn"),
  throwBtn: $("throwBtn"),
  fleeEncounterBtn: $("fleeEncounterBtn"),
  closeEncounter: $("closeEncounter"),
  catchLog: $("catchLog"),
};

let trainer = null; // { did, handle, self, pool }
let regionPool = []; // monsterFor(...) per cluster.pool entry
let regionByDid = new Map();
let currentEncounter = null; // { monster, hp, maxHp }
let opponent = null; // { did, handle, team: [monster...] }
let battle = null; // { playerTeam, oppTeam, pIdx, oIdx, over }

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function setStatus(el, msg, isErr) {
  el.textContent = msg || "";
  el.classList.toggle("err", !!isErr);
}

function avatarImg(url, cls) {
  return url
    ? `<img class="${cls}" src="${url}" alt="" loading="lazy" />`
    : `<div class="${cls}"></div>`;
}

// ---------- title / cluster load ----------

async function startGame(rawHandle) {
  const handle = (rawHandle || "").trim().replace(/^@/, "");
  if (!handle) { setStatus(els.status, "enter a handle first.", true); return; }

  els.openBtn.disabled = true;
  setStatus(els.status, `resolving @${handle}...`);

  try {
    const cluster = await buildCluster(handle, { onStep: (s) => setStatus(els.status, s) });
    trainer = { did: cluster.did, handle: cluster.handle, self: cluster.self, pool: cluster.pool };
    regionPool = cluster.pool.map((p) => monsterFor(p, cluster.pool));
    regionByDid = new Map(regionPool.map((m) => [m.did, m]));

    els.trainerAvatar.src = trainer.self.avatar || "";
    els.trainerWho.textContent = "@" + trainer.handle;
    els.trainerSub.textContent = `${cluster.kind} · ${regionPool.length} wild creatures in range`;
    updateRecordUI();

    els.titleScreen.classList.add("hidden");
    els.gameScreen.classList.remove("hidden");
    setStatus(els.status, "");

    renderRegion();
    renderParty();
  } catch (err) {
    setStatus(els.status, "couldn't start that journey: " + err.message, true);
  } finally {
    els.openBtn.disabled = false;
  }
}

els.searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  startGame(els.handleInput.value);
});

// ---------- tabs ----------

document.querySelectorAll("nav.tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll("section.panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("panel-" + btn.dataset.panel).classList.add("active");
    if (btn.dataset.panel === "party") renderParty();
  });
});

function updateRecordUI() {
  if (!trainer) return;
  const r = getRecord(trainer.did);
  els.recWins.textContent = r.wins;
  els.recLosses.textContent = r.losses;
}

// ---------- region / encounters ----------

function mcardHTML(m, caught) {
  const type = typeMeta(m.type);
  return `
    <span class="type-badge">${type.emoji}</span>
    ${caught ? '<span class="caught-badge">✓ caught</span>' : ""}
    ${avatarImg(m.avatar, "avatar")}
    <div class="species">${escapeHtml(m.species)}</div>
    <div class="handle">@${escapeHtml(m.handle)}</div>
    <span class="rarity" style="color:${m.rarityColor};">${m.rarityLabel}</span>
  `;
}

function renderRegion() {
  if (!regionPool.length) {
    setStatus(els.regionStatus, "no wild creatures found in this SimCluster.");
    els.regionGrid.innerHTML = "";
    return;
  }
  setStatus(els.regionStatus, "");
  els.regionGrid.innerHTML = regionPool
    .map((m) => `<div class="mcard${isCaught(trainer.did, m.did) ? " caught" : ""}" data-did="${m.did}">${mcardHTML(m, isCaught(trainer.did, m.did))}</div>`)
    .join("");
  els.regionGrid.querySelectorAll(".mcard").forEach((card) => {
    card.addEventListener("click", () => openEncounter(regionByDid.get(card.dataset.did)));
  });
}

function openEncounter(monster) {
  currentEncounter = { monster, hp: monster.stats.hp, maxHp: monster.stats.hp };
  const type = typeMeta(monster.type);
  els.encType.textContent = `${type.emoji} ${type.label}`;
  els.encAvatar.src = monster.avatar || "";
  els.encSpecies.textContent = monster.species;
  els.encHandle.textContent = "@" + monster.handle;
  els.encRarity.textContent = monster.rarityLabel;
  els.encRarity.style.background = monster.rarityColor + "33";
  els.encRarity.style.color = monster.rarityColor;
  els.encStats.textContent = `HP ${monster.stats.hp}  ATK ${monster.stats.atk}  DEF ${monster.stats.def}  SPD ${monster.stats.spd}`;
  updateEncounterHpBar();
  setStatus(els.catchLog, "");
  els.throwBtn.disabled = false;
  els.encounterModal.classList.remove("hidden");
}

function updateEncounterHpBar() {
  const pct = Math.max(0, currentEncounter.hp / currentEncounter.maxHp) * 100;
  const bar = els.encHpBar;
  bar.querySelector("div").style.width = pct + "%";
  bar.classList.toggle("low", pct < 35);
}

function closeEncounter() {
  els.encounterModal.classList.add("hidden");
  currentEncounter = null;
}
els.closeEncounter.addEventListener("click", closeEncounter);
els.fleeEncounterBtn.addEventListener("click", closeEncounter);

els.weakenBtn.addEventListener("click", () => {
  if (!currentEncounter) return;
  const party = getParty(trainer.did);
  if (!party.length) {
    setStatus(els.catchLog, "you need at least one caught creature to weaken with.", true);
    return;
  }
  const dex = getDex(trainer.did);
  const lead = dex[party[0]];
  const mult = typeMultiplier(lead.type, currentEncounter.monster.type);
  const raw = Math.max(3, Math.round(lead.stats.atk * (0.5 + Math.random() * 0.3) * mult));
  currentEncounter.hp = Math.max(1, currentEncounter.hp - raw);
  updateEncounterHpBar();
  const tag = mult > 1 ? " — super effective!" : mult < 1 ? " — not very effective." : "";
  setStatus(els.catchLog, `${lead.species} strikes for ${raw}${tag}`, false);
});

els.throwBtn.addEventListener("click", () => {
  if (!currentEncounter) return;
  const { monster, hp, maxHp } = currentEncounter;
  const result = attemptCatch(monster, hp / maxHp);
  if (result.success) {
    addToDex(trainer.did, monster);
    addToParty(trainer.did, monster.did);
    setStatus(els.catchLog, `Gotcha! ${monster.species} was caught${getParty(trainer.did).includes(monster.did) ? " and joined your party" : " (party full — check your Pokedex)"}!`, false);
    els.throwBtn.disabled = true;
    renderRegion();
    renderParty();
  } else {
    setStatus(els.catchLog, `Aw, ${monster.species} broke free! (${Math.round(result.chance * 100)}% chance)`, true);
  }
});

// ---------- party / pokedex ----------

function renderParty() {
  if (!trainer) return;
  const dex = getDex(trainer.did);
  const party = getParty(trainer.did);
  els.partyCount.textContent = party.length;

  const slots = [];
  for (let i = 0; i < MAX_PARTY; i++) {
    const did = party[i];
    if (!did || !dex[did]) { slots.push('<div class="slot-empty">·</div>'); continue; }
    const m = dex[did];
    slots.push(`<div class="mcard" data-did="${m.did}">${mcardHTML(m, true)}</div>`);
  }
  els.partySlots.innerHTML = slots.join("");
  els.partySlots.querySelectorAll(".mcard").forEach((card) => {
    card.addEventListener("click", () => {
      removeFromParty(trainer.did, card.dataset.did);
      renderParty();
      renderRegion();
    });
  });

  const entries = Object.values(dex).sort((a, b) => b.caughtAt - a.caughtAt);
  els.dexEmpty.classList.toggle("hidden", entries.length > 0);
  els.dexGrid.innerHTML = entries
    .map((m) => `<div class="mcard${party.includes(m.did) ? " caught" : ""}" data-did="${m.did}">${mcardHTML(m, party.includes(m.did))}</div>`)
    .join("");
  els.dexGrid.querySelectorAll(".mcard").forEach((card) => {
    card.addEventListener("click", () => {
      const did = card.dataset.did;
      if (party.includes(did)) removeFromParty(trainer.did, did);
      else addToParty(trainer.did, did);
      renderParty();
      renderRegion();
    });
  });
}

// ---------- battle ----------

els.opponentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const handle = (els.opponentInput.value || "").trim().replace(/^@/, "");
  if (!handle) { setStatus(els.battleStatus, "enter a rival handle first.", true); return; }
  if (!getParty(trainer.did).length) {
    setStatus(els.battleStatus, "catch at least one creature before challenging a rival.", true);
    return;
  }

  $("scoutBtn").disabled = true;
  els.opponentPreview.classList.add("hidden");
  els.battleArena.classList.add("hidden");
  setStatus(els.battleStatus, `scouting @${handle}...`);

  try {
    const cluster = await buildCluster(handle, { onStep: (s) => setStatus(els.battleStatus, s) });
    if (cluster.did === trainer.did) throw new Error("that's you — pick a rival.");
    const monsters = cluster.pool
      .map((p) => monsterFor(p, cluster.pool))
      .sort((a, b) => (b.stats.hp + b.stats.atk) - (a.stats.hp + a.stats.atk))
      .slice(0, MAX_PARTY);
    if (!monsters.length) throw new Error(`@${handle} has no SimCluster to build a team from.`);

    opponent = { did: cluster.did, handle: cluster.handle, team: monsters };
    els.opponentTitle.textContent = `@${opponent.handle}'s team (${monsters.length})`;
    els.opponentTeam.innerHTML = monsters.map((m) => avatarImg(m.avatar, "mini")).join("");
    els.opponentPreview.classList.remove("hidden");
    setStatus(els.battleStatus, "");
  } catch (err) {
    setStatus(els.battleStatus, "couldn't scout that rival: " + err.message, true);
  } finally {
    $("scoutBtn").disabled = false;
  }
});

els.startBattleBtn.addEventListener("click", () => {
  const dex = getDex(trainer.did);
  const party = getParty(trainer.did).map((did) => dex[did]).filter(Boolean);
  if (!party.length || !opponent) return;

  battle = {
    playerTeam: party.map(ready),
    oppTeam: opponent.team.map(ready),
    pIdx: 0,
    oIdx: 0,
    over: false,
  };
  els.battleLog.innerHTML = "";
  els.battleShareRow.style.display = "none";
  els.attackBtn.disabled = false;
  els.opponentPreview.classList.add("hidden");
  els.battleArena.classList.remove("hidden");
  logBattle(`A wild battle begins! ${party.length} vs ${battle.oppTeam.length}.`);
  renderBattle();
});

function renderBattle() {
  const p = battle.playerTeam[battle.pIdx];
  const o = battle.oppTeam[battle.oIdx];
  els.pAvatar.src = p?.avatar || "";
  els.pSpecies.textContent = p ? `${p.species} (${p.hp}/${p.maxHp})` : "—";
  els.pHpBar.querySelector("div").style.width = p ? Math.max(0, (p.hp / p.maxHp) * 100) + "%" : "0%";
  els.pHpBar.classList.toggle("low", !!p && p.hp / p.maxHp < 0.35);
  $("pCombatant").classList.toggle("fainted", !p);

  els.oAvatar.src = o?.avatar || "";
  els.oSpecies.textContent = o ? `${o.species} (${o.hp}/${o.maxHp})` : "—";
  els.oHpBar.querySelector("div").style.width = o ? Math.max(0, (o.hp / o.maxHp) * 100) + "%" : "0%";
  els.oHpBar.classList.toggle("low", !!o && o.hp / o.maxHp < 0.35);
  $("oCombatant").classList.toggle("fainted", !o);
}

function logBattle(text, cls) {
  const line = document.createElement("div");
  line.className = "line" + (cls ? " " + cls : "");
  line.textContent = text;
  els.battleLog.appendChild(line);
  els.battleLog.scrollTop = els.battleLog.scrollHeight;
}

function classFor(mult) {
  if (mult > 1) return "super";
  if (mult < 1) return "weak";
  return "hit";
}

els.attackBtn.addEventListener("click", () => {
  if (!battle || battle.over) return;
  const p = battle.playerTeam[battle.pIdx];
  const o = battle.oppTeam[battle.oIdx];
  if (!p || !o) return;

  const events = resolveRound(p, o);
  for (const ev of events) {
    const who = ev.side === "player" ? p.species : o.species;
    const foe = ev.side === "player" ? o.species : p.species;
    const tag = ev.multiplier > 1 ? " (super effective!)" : ev.multiplier < 1 ? " (not very effective)" : "";
    logBattle(`${who} used ${ev.move} on ${foe} — ${ev.damage} dmg${tag}`, classFor(ev.multiplier));
  }

  if (p.fainted) {
    logBattle(`${p.species} fainted!`);
    const next = battle.playerTeam.findIndex((m, i) => i > battle.pIdx && !m.fainted);
    if (next >= 0) battle.pIdx = next;
  }
  if (o.fainted) {
    logBattle(`${o.species} fainted!`);
    const next = battle.oppTeam.findIndex((m, i) => i > battle.oIdx && !m.fainted);
    if (next >= 0) battle.oIdx = next;
  }
  renderBattle();

  const playerDown = battle.playerTeam.every((m) => m.fainted);
  const oppDown = battle.oppTeam.every((m) => m.fainted);
  if (playerDown || oppDown) endBattle(!playerDown);
});

function endBattle(won) {
  battle.over = true;
  els.attackBtn.disabled = true;
  recordResult(trainer.did, won);
  updateRecordUI();
  logBattle(won ? `Victory! @${opponent.handle}'s team is out of creatures.` : `Defeat... your party is out of creatures.`);

  const rec = getRecord(trainer.did);
  const text = `My mootmon party ${won ? "beat" : "lost to"} @${opponent.handle}'s SimCluster team (${rec.wins}W-${rec.losses}L overall). Catch yours: https://mootmon.bisks.net/`;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  els.battleShareRow.style.display = "flex";
}

els.fleeBtn.addEventListener("click", () => {
  battle = null;
  els.battleArena.classList.add("hidden");
  setStatus(els.battleStatus, "you fled the battle.");
});

els.rematchBtn.addEventListener("click", () => {
  battle = null;
  opponent = null;
  els.battleArena.classList.add("hidden");
  els.opponentInput.value = "";
  setStatus(els.battleStatus, "");
});

// ---------- boot ----------

const sharedHandle = new URLSearchParams(location.search).get("h");
if (sharedHandle) {
  els.handleInput.value = sharedHandle;
  startGame(sharedHandle);
}
