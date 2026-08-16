import { buildCluster } from "./lib/cluster.js";
import { peloraFor, typeMeta, typeMultiplier, rarityMeta } from "./lib/pelora.js";
import {
  getBestiary, getParty, getRecord, recordResult, setAristos, addToBestiary,
  addToParty, removeFromParty, isBound, attemptBind, replaceState, MAX_PARTY,
} from "./lib/roster.js";
import { ready, resolveRound } from "./lib/battle.js";
import { LADDER } from "./lib/trainers.js";
import { login, getSession, clearSession, completeLoginIfCallback } from "./lib/oauth.js";
import { getMyRoster, saveRoster } from "./lib/records.js";

const $ = (id) => document.getElementById(id);
const els = {
  titleScreen: $("titleScreen"),
  gameScreen: $("gameScreen"),
  searchForm: $("searchForm"),
  handleInput: $("handleInput"),
  openBtn: $("openBtn"),
  status: $("status"),
  titleSigninBtn: $("titleSigninBtn"),

  trainerAvatar: $("trainerAvatar"),
  trainerWho: $("trainerWho"),
  trainerSub: $("trainerSub"),
  recWins: $("recWins"),
  recLosses: $("recLosses"),
  aristosBadge: $("aristosBadge"),
  syncBtn: $("syncBtn"),
  syncStatus: $("syncStatus"),

  regionStatus: $("regionStatus"),
  regionGrid: $("regionGrid"),

  partyCount: $("partyCount"),
  partySlots: $("partySlots"),
  dexGrid: $("dexGrid"),
  dexEmpty: $("dexEmpty"),

  gymStatus: $("gymStatus"),
  ladderList: $("ladderList"),
  gymModal: $("gymModal"),
  gymEmoji: $("gymEmoji"),
  gymName: $("gymName"),
  gymTitle: $("gymTitle"),
  gymQuote: $("gymQuote"),
  gymTeam: $("gymTeam"),
  gymChallengeBtn: $("gymChallengeBtn"),
  closeGymBtn: $("closeGymBtn"),
  closeGym: $("closeGym"),

  opponentForm: $("opponentForm"),
  opponentInput: $("opponentInput"),
  battleIntro: $("battleIntro"),
  battleStatus: $("battleStatus"),
  opponentPreview: $("opponentPreview"),
  opponentTitle: $("opponentTitle"),
  opponentTeam: $("opponentTeam"),
  startBattleBtn: $("startBattleBtn"),

  battleArena: $("battleArena"),
  battleHeading: $("battleHeading"),
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

let session = null; // atproto OAuth session, or null if playing signed-out
let trainer = null; // { did, handle, self, pool }
let regionPool = []; // peloraFor(...) per cluster.pool entry
let regionByDid = new Map();
let currentEncounter = null; // { pelor, hp, maxHp }
let currentGymIdx = -1;
let rival = null; // { did, handle, team: [pelor...] }
let battle = null; // { playerTeam, oppTeam, pIdx, oIdx, over, mode: 'gym'|'pvp', meta }

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function setStatus(el, msg, isErr) {
  el.textContent = msg || "";
  el.classList.toggle("err", !!isErr);
}

function avatarImg(url, cls, fallbackEmoji) {
  return url
    ? `<img class="${cls}" src="${url}" alt="" loading="lazy" />`
    : `<div class="${cls}">${fallbackEmoji || ""}</div>`;
}

// ---------- PDS sync ----------
// A signed-in player's party/record is durable state in their own repo, not
// just this browser — see net.bisks.kolpelor.roster in public/lexicons/.
// Playing signed-out (or as a handle that isn't the signed-in account) still
// works off localStorage alone; signing in just layers a write-through on top.

function rosterRecordFromLocal(trainerDid) {
  const bestiary = getBestiary(trainerDid);
  const party = getParty(trainerDid);
  const rec = getRecord(trainerDid);
  return {
    party: party
      .map((did) => bestiary[did])
      .filter(Boolean)
      .map((p) => ({
        did: p.did,
        handle: p.handle,
        avatar: p.avatar || undefined,
        type: p.type,
        species: p.species,
        rarity: p.rarity,
        hp: p.stats.hp,
        atk: p.stats.atk,
        def: p.stats.def,
        spd: p.stats.spd,
      })),
    wins: rec.wins || 0,
    losses: rec.losses || 0,
    ladderRank: rec.ladderRank || 0,
    aristos: !!rec.aristos,
    updatedAt: new Date().toISOString(),
  };
}

function hydrateFromRemote(trainerDid, remote) {
  const bestiary = {};
  const party = [];
  for (const p of remote.party || []) {
    if (!p || !p.did) continue;
    const rm = rarityMeta(p.rarity);
    bestiary[p.did] = {
      did: p.did,
      handle: p.handle,
      displayName: p.handle,
      avatar: p.avatar || "",
      type: p.type,
      species: p.species,
      rarity: p.rarity,
      rarityLabel: rm.label,
      rarityColor: rm.color,
      catchRate: rm.catchRate,
      stats: { hp: p.hp, atk: p.atk, def: p.def, spd: p.spd },
      boundAt: Date.now(),
    };
    party.push(p.did);
  }
  replaceState(trainerDid, {
    bestiary,
    party,
    record: {
      wins: remote.wins || 0,
      losses: remote.losses || 0,
      ladderRank: remote.ladderRank || 0,
      aristos: !!remote.aristos,
    },
  });
}

async function pullRoster(trainerDid) {
  if (!session || session.did !== trainerDid) return;
  try {
    const remote = await getMyRoster(session);
    if (remote && Array.isArray(remote.party)) {
      hydrateFromRemote(trainerDid, remote);
      setStatus(els.syncStatus, "loaded your roster from your PDS.");
    } else {
      await pushRoster(trainerDid);
    }
  } catch (err) {
    setStatus(els.syncStatus, "couldn't reach your PDS: " + err.message, true);
  }
}

async function pushRoster(trainerDid) {
  if (!session || session.did !== trainerDid) return;
  try {
    await saveRoster(session, rosterRecordFromLocal(trainerDid));
    setStatus(els.syncStatus, "synced to your PDS.");
  } catch (err) {
    setStatus(els.syncStatus, "PDS sync failed: " + err.message, true);
  }
}

function updateSyncButton() {
  const signedIn = !!(session && trainer && session.did === trainer.did);
  els.syncBtn.textContent = signedIn ? `Signed in as @${session.handle}` : "Sign in with Bluesky";
  els.syncBtn.classList.toggle("signed-in", signedIn);
}

els.syncBtn.addEventListener("click", async () => {
  if (session && trainer && session.did === trainer.did) {
    await clearSession();
    session = null;
    updateSyncButton();
    setStatus(els.syncStatus, "signed out — your party stays local to this browser now.");
    return;
  }
  if (!trainer) return;
  try {
    await login(trainer.handle);
  } catch (err) {
    setStatus(els.syncStatus, "sign-in failed: " + err.message, true);
  }
});

els.titleSigninBtn.addEventListener("click", async () => {
  const h = (els.handleInput.value || "").trim().replace(/^@/, "");
  if (!h) { setStatus(els.status, "type your handle above first, then sign in.", true); return; }
  try {
    await login(h);
  } catch (err) {
    setStatus(els.status, "sign-in failed: " + err.message, true);
  }
});

// ---------- title / cluster load ----------

async function startGame(rawHandle) {
  const handle = (rawHandle || "").trim().replace(/^@/, "");
  if (!handle) { setStatus(els.status, "enter a handle first.", true); return; }

  els.openBtn.disabled = true;
  setStatus(els.status, `resolving @${handle}...`);

  try {
    const cluster = await buildCluster(handle, { onStep: (s) => setStatus(els.status, s) });
    trainer = { did: cluster.did, handle: cluster.handle, self: cluster.self, pool: cluster.pool };
    regionPool = cluster.pool.map((p) => peloraFor(p, cluster.pool));
    regionByDid = new Map(regionPool.map((m) => [m.did, m]));

    if (session && session.did === trainer.did) {
      setStatus(els.status, "loading your roster from your PDS...");
      await pullRoster(trainer.did);
    }

    els.trainerAvatar.src = trainer.self.avatar || "";
    els.trainerWho.textContent = "@" + trainer.handle;
    els.trainerSub.textContent = `${cluster.kind} · ${regionPool.length} wild pelora in range`;
    updateTrainerBar();
    updateSyncButton();

    els.titleScreen.classList.add("hidden");
    els.gameScreen.classList.remove("hidden");
    setStatus(els.status, "");

    renderRegion();
    renderParty();
    renderLadder();
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
    if (btn.dataset.panel === "gymnasion") renderLadder();
  });
});

function updateTrainerBar() {
  if (!trainer) return;
  const r = getRecord(trainer.did);
  els.recWins.textContent = r.wins;
  els.recLosses.textContent = r.losses;
  els.aristosBadge.classList.toggle("hidden", !r.aristos);
}

// ---------- region / encounters ----------

function mcardHTML(m, bound) {
  const type = typeMeta(m.type);
  return `
    <span class="type-badge">${type.emoji}</span>
    ${bound ? '<span class="caught-badge">✓ bound</span>' : ""}
    ${avatarImg(m.avatar, "avatar", type.emoji)}
    <div class="species">${escapeHtml(m.species)}</div>
    <div class="handle">@${escapeHtml(m.handle)}</div>
    <span class="rarity" style="color:${m.rarityColor};">${m.rarityLabel}</span>
  `;
}

function renderRegion() {
  if (!regionPool.length) {
    setStatus(els.regionStatus, "no wild pelora found in this SimCluster.");
    els.regionGrid.innerHTML = "";
    return;
  }
  setStatus(els.regionStatus, "");
  els.regionGrid.innerHTML = regionPool
    .map((m) => `<div class="mcard${isBound(trainer.did, m.did) ? " caught" : ""}" data-did="${m.did}">${mcardHTML(m, isBound(trainer.did, m.did))}</div>`)
    .join("");
  els.regionGrid.querySelectorAll(".mcard").forEach((card) => {
    card.addEventListener("click", () => openEncounter(regionByDid.get(card.dataset.did)));
  });
}

function openEncounter(pelor) {
  currentEncounter = { pelor, hp: pelor.stats.hp, maxHp: pelor.stats.hp };
  const type = typeMeta(pelor.type);
  els.encType.textContent = `${type.emoji} ${type.label}`;
  els.encAvatar.src = pelor.avatar || "";
  els.encSpecies.textContent = pelor.species;
  els.encHandle.textContent = "@" + pelor.handle;
  els.encRarity.textContent = pelor.rarityLabel;
  els.encRarity.style.background = pelor.rarityColor + "33";
  els.encRarity.style.color = pelor.rarityColor;
  els.encStats.textContent = `HP ${pelor.stats.hp}  ATK ${pelor.stats.atk}  DEF ${pelor.stats.def}  SPD ${pelor.stats.spd}`;
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
    setStatus(els.catchLog, "you need at least one bound pelor to strike with.", true);
    return;
  }
  const bestiary = getBestiary(trainer.did);
  const lead = bestiary[party[0]];
  const mult = typeMultiplier(lead.type, currentEncounter.pelor.type);
  const raw = Math.max(3, Math.round(lead.stats.atk * (0.5 + Math.random() * 0.3) * mult));
  currentEncounter.hp = Math.max(1, currentEncounter.hp - raw);
  updateEncounterHpBar();
  const tag = mult > 1 ? " — super effective!" : mult < 1 ? " — not very effective." : "";
  setStatus(els.catchLog, `${lead.species} strikes for ${raw}${tag}`, false);
});

els.throwBtn.addEventListener("click", () => {
  if (!currentEncounter) return;
  const { pelor, hp, maxHp } = currentEncounter;
  const result = attemptBind(pelor, hp / maxHp);
  if (result.success) {
    addToBestiary(trainer.did, pelor);
    addToParty(trainer.did, pelor.did);
    setStatus(els.catchLog, `Bound! ${pelor.species} answers φιλία${getParty(trainer.did).includes(pelor.did) ? " and joins your party" : " (party full — check Bestiary)"}.`, false);
    els.throwBtn.disabled = true;
    renderRegion();
    renderParty();
    pushRoster(trainer.did);
  } else {
    setStatus(els.catchLog, `${pelor.species} breaks free! (${Math.round(result.chance * 100)}% chance)`, true);
  }
});

// ---------- party / bestiary ----------

function renderParty() {
  if (!trainer) return;
  const bestiary = getBestiary(trainer.did);
  const party = getParty(trainer.did);
  els.partyCount.textContent = party.length;

  const slots = [];
  for (let i = 0; i < MAX_PARTY; i++) {
    const did = party[i];
    if (!did || !bestiary[did]) { slots.push('<div class="slot-empty">·</div>'); continue; }
    const m = bestiary[did];
    slots.push(`<div class="mcard" data-did="${m.did}">${mcardHTML(m, true)}</div>`);
  }
  els.partySlots.innerHTML = slots.join("");
  els.partySlots.querySelectorAll(".mcard").forEach((card) => {
    card.addEventListener("click", () => {
      removeFromParty(trainer.did, card.dataset.did);
      renderParty();
      renderRegion();
      pushRoster(trainer.did);
    });
  });

  const entries = Object.values(bestiary).sort((a, b) => b.boundAt - a.boundAt);
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
      pushRoster(trainer.did);
    });
  });
}

// ---------- gymnasion (PvAI ladder) ----------

function renderLadder() {
  if (!trainer) return;
  const rec = getRecord(trainer.did);
  els.ladderList.innerHTML = LADDER.map((t, i) => {
    const beaten = i < rec.ladderRank;
    const locked = i > rec.ladderRank;
    const badge = beaten
      ? '<span class="badge">beaten ✓</span>'
      : locked
        ? '<span class="badge" style="color:var(--dim)">locked</span>'
        : '<span class="badge" style="color:var(--gold)">next</span>';
    return `<div class="ladder-card ${beaten ? "beaten" : ""} ${locked ? "locked" : ""}" data-idx="${i}">
      <div class="num">${i + 1}</div>
      <span class="emoji">${t.emoji}</span>
      <div class="meta">
        <div class="name">${escapeHtml(t.name)}</div>
        <div class="title">${escapeHtml(t.title)}</div>
      </div>
      ${badge}
    </div>`;
  }).join("");
  const rankNow = rec.ladderRank;
  els.ladderList.querySelectorAll(".ladder-card").forEach((card) => {
    card.addEventListener("click", () => {
      const idx = Number(card.dataset.idx);
      if (idx > rankNow) {
        setStatus(els.gymStatus, "beat the trainer before this one first.", true);
        return;
      }
      openGym(idx);
    });
  });
  setStatus(els.gymStatus, "");
}

function openGym(idx) {
  const t = LADDER[idx];
  currentGymIdx = idx;
  els.gymEmoji.textContent = t.emoji;
  els.gymName.textContent = t.name;
  els.gymTitle.textContent = t.title;
  els.gymQuote.textContent = t.quote;
  els.gymTeam.innerHTML = t.team.map((m) => avatarImg(m.avatar, "mini", typeMeta(m.type).emoji)).join("");
  const hasParty = getParty(trainer.did).length > 0;
  els.gymChallengeBtn.disabled = !hasParty;
  els.gymChallengeBtn.textContent = hasParty ? "Challenge" : "Bind a pelor first";
  els.gymModal.classList.remove("hidden");
}

function closeGymModal() {
  els.gymModal.classList.add("hidden");
}
els.closeGym.addEventListener("click", closeGymModal);
els.closeGymBtn.addEventListener("click", closeGymModal);

els.gymChallengeBtn.addEventListener("click", () => {
  if (currentGymIdx < 0) return;
  const t = LADDER[currentGymIdx];
  closeGymModal();
  startBattle(t.team, "gym", { idx: currentGymIdx, trainer: t });
});

// ---------- rivals (PvP) ----------

els.opponentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const handle = (els.opponentInput.value || "").trim().replace(/^@/, "");
  if (!handle) { setStatus(els.battleStatus, "enter a rival handle first.", true); return; }
  if (!getParty(trainer.did).length) {
    setStatus(els.battleStatus, "bind at least one pelor before challenging a rival.", true);
    return;
  }

  $("scoutBtn").disabled = true;
  els.opponentPreview.classList.add("hidden");
  setStatus(els.battleStatus, `scouting @${handle}...`);

  try {
    const cluster = await buildCluster(handle, { onStep: (s) => setStatus(els.battleStatus, s) });
    if (cluster.did === trainer.did) throw new Error("that's you — pick a rival.");
    const pelora = cluster.pool
      .map((p) => peloraFor(p, cluster.pool))
      .sort((a, b) => (b.stats.hp + b.stats.atk) - (a.stats.hp + a.stats.atk))
      .slice(0, MAX_PARTY);
    if (!pelora.length) throw new Error(`@${handle} has no SimCluster to build a team from.`);

    rival = { did: cluster.did, handle: cluster.handle, team: pelora };
    els.opponentTitle.textContent = `@${rival.handle}'s team (${pelora.length})`;
    els.opponentTeam.innerHTML = pelora.map((m) => avatarImg(m.avatar, "mini", typeMeta(m.type).emoji)).join("");
    els.opponentPreview.classList.remove("hidden");
    setStatus(els.battleStatus, "");
  } catch (err) {
    setStatus(els.battleStatus, "couldn't scout that rival: " + err.message, true);
  } finally {
    $("scoutBtn").disabled = false;
  }
});

els.startBattleBtn.addEventListener("click", () => {
  if (!rival) return;
  startBattle(rival.team, "pvp", { handle: rival.handle });
});

// ---------- battle (shared by gymnasion + rivals) ----------

function startBattle(oppTeamRaw, mode, meta) {
  const bestiary = getBestiary(trainer.did);
  const party = getParty(trainer.did).map((did) => bestiary[did]).filter(Boolean);
  if (!party.length || !oppTeamRaw || !oppTeamRaw.length) return;

  battle = {
    playerTeam: party.map(ready),
    oppTeam: oppTeamRaw.map(ready),
    pIdx: 0,
    oIdx: 0,
    over: false,
    mode,
    meta,
  };
  els.battleLog.innerHTML = "";
  els.battleShareRow.style.display = "none";
  els.attackBtn.disabled = false;
  els.opponentPreview.classList.add("hidden");
  els.battleHeading.textContent = mode === "gym" ? `Gymnasion — ${meta.trainer.name}` : `Rival — @${meta.handle}`;
  els.battleArena.classList.remove("hidden");
  els.battleArena.scrollIntoView({ behavior: "smooth", block: "nearest" });
  logBattle(`The match begins! ${party.length} vs ${battle.oppTeam.length}.`);
  renderBattle();
}

function renderBattle() {
  const p = battle.playerTeam[battle.pIdx];
  const o = battle.oppTeam[battle.oIdx];
  els.pAvatar.innerHTML = avatarImg(p?.avatar, "avatar", p ? typeMeta(p.type).emoji : "");
  els.pSpecies.textContent = p ? `${p.species} (${p.hp}/${p.maxHp})` : "—";
  els.pHpBar.querySelector("div").style.width = p ? Math.max(0, (p.hp / p.maxHp) * 100) + "%" : "0%";
  els.pHpBar.classList.toggle("low", !!p && p.hp / p.maxHp < 0.35);
  $("pCombatant").classList.toggle("fainted", !p);

  els.oAvatar.innerHTML = avatarImg(o?.avatar, "avatar", o ? typeMeta(o.type).emoji : "");
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

  const rec0 = getRecord(trainer.did);
  let newRank = rec0.ladderRank;
  if (battle.mode === "gym" && won) newRank = Math.max(rec0.ladderRank, battle.meta.idx + 1);
  const rec = recordResult(trainer.did, won, newRank);

  let becameAristos = false;
  if (battle.mode === "gym" && won && rec.ladderRank >= LADDER.length && !rec.aristos) {
    setAristos(trainer.did);
    becameAristos = true;
  }

  updateTrainerBar();
  renderLadder();

  const oppName = battle.mode === "gym" ? battle.meta.trainer.name : `@${battle.meta.handle}`;
  logBattle(won ? `Victory! ${oppName}'s team is out of pelora.` : `Defeat... your party is out of pelora.`);
  if (becameAristos) logBattle("ἀριστεύε — the gymnasion is cleared. Best of all.");

  const shareBase = battle.mode === "gym"
    ? `My kolpelor party ${won ? "beat" : "lost to"} ${oppName} in the gymnasion`
    : `My kolpelor party ${won ? "beat" : "lost to"} ${oppName}'s SimCluster team`;
  const text = `${shareBase} (${rec.wins}W-${rec.losses}L overall)${becameAristos ? " — ἀριστεύε, ladder cleared!" : ""}. Bind yours: https://kolpelor.bisks.net/`;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  els.battleShareRow.style.display = "flex";

  pushRoster(trainer.did);
}

els.fleeBtn.addEventListener("click", () => {
  battle = null;
  els.battleArena.classList.add("hidden");
});

els.rematchBtn.addEventListener("click", () => {
  battle = null;
  rival = null;
  currentGymIdx = -1;
  els.battleArena.classList.add("hidden");
  els.opponentInput.value = "";
  setStatus(els.battleStatus, "");
});

// ---------- boot ----------

async function boot() {
  try {
    const cb = await completeLoginIfCallback();
    if (cb) {
      session = cb;
      await startGame(cb.handle);
      return;
    }
  } catch (err) {
    setStatus(els.status, "sign-in failed: " + err.message, true);
  }

  session = await getSession();
  if (session) {
    els.handleInput.value = session.handle;
    els.titleSigninBtn.textContent = `Signed in as @${session.handle}`;
    els.titleSigninBtn.disabled = true;
    await startGame(session.handle);
    return;
  }

  const sharedHandle = new URLSearchParams(location.search).get("h");
  if (sharedHandle) {
    els.handleInput.value = sharedHandle;
    startGame(sharedHandle);
  }
}
boot();
