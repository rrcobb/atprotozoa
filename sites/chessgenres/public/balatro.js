import { MAX_PLAY, MAX_JOKERS, MAX_ITEMS, ANTES, GLYPH, NAME, BLINDS, HAND_TYPES, handStats, newRun, startRound, play, discard, advance, score, scoreOpts, useItem, buy, whyNot, reroll, rerollCost, sellJoker, sellValue, moveJoker, levelCost, ITEMS } from "./balatro-logic.js";

const $ = (id) => document.getElementById(id);
let run, picked = new Set(), toast = "", busy = false, skip = false;
const reduce = matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, skip || reduce ? 0 : ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function reset(seed) {
  const s = (seed ?? $("bSeed").value.trim()) || Math.random().toString(36).slice(2, 8);
  $("bSeed").value = s;
  run = newRun(s); startRound(run); picked.clear(); toast = ""; busy = false;
  $("bShare").hidden = true; $("bScoreBox").hidden = true;
  ui();
}

const sorted = () => run.round.hand.slice().sort((a, b) => "pnbrqk".indexOf(a.t) - "pnbrqk".indexOf(b.t) || a.col.localeCompare(b.col));
const pickedCards = () => run.round.hand.filter((c) => picked.has(c.id));
const inShop = () => run.status === "shop" || run.status === "won";
const anteLabel = () => (run.ante >= ANTES ? `${run.ante + 1} (endless)` : `${run.ante + 1}/${ANTES}`);

function ui() {
  const r = run.round;
  const over = run.status === "failed";
  const boss = r && r.boss;
  const blindName = r ? (boss ? boss.name : BLINDS[run.blind].name) : "";
  const live = run.status === "playing";
  $("bAnte").textContent = anteLabel();
  $("bBlind").textContent = blindName;
  $("bTarget").textContent = r ? r.target : "–";
  $("bScore").textContent = r ? r.score : "–";
  $("bHands").textContent = r ? r.hands : "–";
  $("bDiscards").textContent = r ? r.discards : "–";
  $("bMoney").textContent = run.money;
  $("bDeck").textContent = run.deck.length;
  $("bBoss").textContent = boss ? `${boss.name}: ${boss.text}.` : "";

  $("bJokers").innerHTML = run.jokers.length
    ? run.jokers.map((j, i) => `<span class="joker" title="${esc(j.text)}"><b>${j.name}</b>${j.id === "pawnstorm" ? ` (+${j.n})` : ""}<br><small>${j.text}</small>${inShop() ? `<span class="jb"><button data-mv="${i}" data-d="-1" ${i ? "" : "disabled"} aria-label="move left">◀</button><button data-mv="${i}" data-d="1" ${i < run.jokers.length - 1 ? "" : "disabled"} aria-label="move right">▶</button><button data-sell="${i}">sell $${sellValue(j)}</button></span>` : ""}</span>`).join("") + `<span class="joker empty">${run.jokers.length}/${MAX_JOKERS} jokers, left to right</span>`
    : `<span class="joker empty">no jokers yet. buy them in the shop after a blind (${MAX_JOKERS} max)</span>`;
  const sel = picked.size === 1 && live;
  $("bItems").innerHTML = run.items.map((it, i) => `<button class="joker item ${sel ? "on" : ""}" data-use="${i}" title="${esc(it.text)}"><b>${it.name}</b><br><small>${it.text}${live ? (sel ? "" : " (select 1 piece, then tap)") : ""}</small></button>`).join("");

  $("bHand").hidden = !live;
  $("bActions").hidden = !live;
  $("bPick").hidden = !inShop();
  $("bReroll").hidden = !inShop();
  if (live) {
    const busyDis = busy ? "disabled" : "";
    $("bHand").innerHTML = sorted().map((c) =>
      `<button class="card ${c.col} ${picked.has(c.id) ? "up" : ""} ${r.debuff === c.t || r.debuffCol === c.col ? "deb" : ""}" data-id="${c.id}" aria-pressed="${picked.has(c.id)}" ${busyDis}>${GLYPH[c.col][c.t]}<small>${NAME[c.t]}</small></button>`).join("");
    const cards = pickedCards(), res = cards.length ? score(cards, run.jokers, scoreOpts(run)) : null;
    $("bPreview").textContent = res ? `${res.hand} (lvl ${run.levels[res.hand] || 1}): ${res.chips} chips × ${res.mult} = ${res.total}` : "select up to 5 pieces";
    $("bPlay").disabled = busy || !cards.length;
    $("bDiscard").disabled = busy || !cards.length || r.discards <= 0;
  }
  if (inShop()) {
    const p = run.payout, sh = run.shop;
    const head = run.status === "won" ? `all ${ANTES} antes cleared! the giant queen is toppled. ` : "";
    $("bPickTitle").textContent = `${head}${blindName} cleared with ${r.score}/${r.target}. earned $${p.total} (blind ${p.base}, spare hands ${p.hands}, interest ${p.interest}${p.econ ? `, jokers ${p.econ}` : ""}). you have $${run.money}.`;
    const offerBtn = (o, key) => {
      const why = whyNot(run, o);
      const title = o.kind === "joker" ? `${o.joker.name}` : o.kind === "item" ? o.item.name : `${o.name} +1 level`;
      const text = o.kind === "joker" ? o.joker.text : o.kind === "item" ? o.item.text : (() => { const l = run.levels[o.name] || 1, a = handStats(o.name, l), b = handStats(o.name, l + 1); return `lvl ${l} to ${l + 1}: ${a.chips}×${a.mult} becomes ${b.chips}×${b.mult}`; })();
      return `<button class="joker pick" data-o="${key}" ${why ? "disabled" : ""} title="${why || ""}"><b>${title}</b> · $${o.price}<br><small>${o.sold ? "sold" : text}</small></button>`;
    };
    $("bChoices").innerHTML = sh.jokers.map((o, i) => offerBtn(o, "j" + i)).join("") + sh.other.map((o, i) => offerBtn(o, "o" + i)).join("");
    $("bReroll").textContent = `reroll jokers · $${rerollCost(run)}`;
    $("bReroll").disabled = run.money < rerollCost(run);
    $("bSkip").textContent = run.status === "won" ? "keep going (endless)" : "next blind";
  }
  // hand reference
  $("bRefBody").innerHTML = Object.keys(HAND_TYPES).map((n) => { const l = run.levels[n] || 1, h = handStats(n, l); return `${n}${l > 1 ? ` (lvl ${l})` : ""}: ${h.chips} × ${h.mult}`; }).join("<br>");

  let msg = toast;
  if (over) msg = `out of hands: ${r.score}/${r.target}. the run ends at ante ${run.ante + 1}. best hand ${run.best}. seed ${run.seed}.`;
  $("bMsg").textContent = msg;
  $("bMsg").className = over || run.status === "won" ? "end" : "";
  const share = over || run.status === "won";
  $("bShare").hidden = !share;
  if (share) {
    const js = run.jokers.map((j) => j.name).join(", ") || "no jokers";
    const txt = run.status === "won" ? `I beat Chess Balatro (seed ${run.seed}) with ${js}. best hand ${run.best}.` : `My Chess Balatro run died at ante ${run.ante + 1} (${blindName}), best hand ${run.best} (seed ${run.seed}).`;
    $("bShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#balatro");
  }
}

// Plays the scoring log back one trigger at a time: cards, then jokers left to right.
async function animate(res, cards) {
  const box = $("bScoreBox");
  skip = false; busy = true; box.hidden = false;
  const glyphs = cards.map((c) => `<span data-c="${c.id}">${GLYPH[c.col][c.t]}</span>`).join(" ");
  const draw = (e, extra = "") => {
    box.innerHTML = `<div class="tbl">${glyphs}</div><div class="tally"><span class="c">${e.chips}</span> × <span class="m">${e.mult}</span></div><div class="lbl ${extra}">${esc(e.label)}</div>`;
    if (e.id != null && e.k === "card") { const el = box.querySelector(`[data-c="${e.id}"]`); if (el) el.classList.add("pop"); }
  };
  for (const e of res.log) { draw(e); await sleep(e.k === "card" ? 170 : 380); }
  box.insertAdjacentHTML("beforeend", `<div class="tot pop">+${res.total}</div>`);
  await sleep(500);
  busy = false;
}
$("bScoreBox").addEventListener("click", () => { skip = true; });

$("bHand").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]"); if (!b || run.status !== "playing" || busy) return;
  const id = +b.dataset.id;
  if (picked.has(id)) picked.delete(id);
  else if (picked.size < MAX_PLAY) picked.add(id);
  ui();
});
$("bPlay").addEventListener("click", async () => {
  if (busy) return;
  const cards = pickedCards();
  const prevBest = run.best;
  const res = play(run, [...picked]); if (!res) return;
  picked.clear();
  toast = `${res.hand}: ${res.chips} × ${res.mult} = ${res.total}${res.total > prevBest && prevBest > 0 ? " (new best!)" : ""}`;
  ui();
  await animate(res, cards);
  ui();
});
$("bDiscard").addEventListener("click", () => {
  if (busy) return;
  if (discard(run, [...picked])) { picked.clear(); toast = "discarded."; ui(); }
});
$("bItems").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-use]"); if (!b || busy || run.status !== "playing") return;
  const msg = useItem(run, +b.dataset.use, [...picked]);
  if (msg) { picked.clear(); toast = msg; }
  else toast = "select exactly 1 piece that item can change (can't purge below 12 pieces).";
  ui();
});
$("bJokers").addEventListener("click", (e) => {
  const m = e.target.closest("button[data-mv]"), s = e.target.closest("button[data-sell]");
  if (m) moveJoker(run, +m.dataset.mv, +m.dataset.d);
  else if (s) sellJoker(run, +s.dataset.sell);
  else return;
  ui();
});
$("bChoices").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-o]"); if (!b || b.disabled) return;
  const o = (b.dataset.o[0] === "j" ? run.shop.jokers : run.shop.other)[+b.dataset.o.slice(1)];
  if (buy(run, o)) toast = "";
  ui();
});
$("bReroll").addEventListener("click", () => { reroll(run); ui(); });
$("bSkip").addEventListener("click", () => { advance(run); picked.clear(); toast = ""; $("bScoreBox").hidden = true; ui(); });
$("bRestart").addEventListener("click", () => reset());
$("bDaily").addEventListener("click", () => reset("daily-" + new Date().toISOString().slice(0, 10)));

reset();
