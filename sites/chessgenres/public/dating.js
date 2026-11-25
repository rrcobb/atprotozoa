import { CAST, APPROACHES, SPOTS, GIFTS, DAYS, MAX_CHARM, ENDING_KEYS, newGame, date, work, practice, buy, resolve, confess, endingText, endingKey, endingTitle, heartsOf, cast, spotOf, busy, WORK_PAY } from "./dating-logic.js";

const $ = (id) => document.getElementById(id);
const KEY = "chessgenres:dating:gallery";
const MARK = { loved: "💖", liked: "💗", meh: "😐", ouch: "💔" };
const SPOTMARK = { fav: "💚", ok: "➖", hate: "💢" };
let g = newGame(), who = null, spot = null, gift = null, shuffled = false, fresh = false;

const loadGallery = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
function saveEnding(key) {
  const have = loadGallery();
  if (have.includes(key)) return false;
  try { localStorage.setItem(KEY, JSON.stringify([...have, key])); } catch { /* private mode: nothing to save to */ }
  return true;
}

// ---- extra panels, built here so index.html stays small ----
(function build() {
  const sec = $("dating");
  const hud = sec.querySelector(".hud");
  for (const [label, id] of [["coins", "hCoins"], ["charm", "hCharm"], ["gifts", "hGiftsOwned"]]) {
    const sp = document.createElement("span"); sp.innerHTML = `${label} <b id="${id}">0</b>`; hud.appendChild(sp);
  }
  const mk = (id, before) => { const d = document.createElement("div"); d.id = id; before.parentElement.insertBefore(d, before); return d; };
  mk("hEvent", $("hPick")).style.cssText = "background:#1c1612;border:1px solid #6b4f8a;border-radius:8px;padding:10px;margin-bottom:10px";
  $("hPick").after(Object.assign(document.createElement("div"), { id: "hDayBox" }));
  const how = $("hHow");
  const spots = Object.assign(document.createElement("div"), { id: "hSpots", className: "shop" });
  const gifts = Object.assign(document.createElement("div"), { id: "hGifts", className: "shop" });
  how.insertBefore(gifts, $("hApproaches")); how.insertBefore(spots, gifts);
  $("hLog").style.whiteSpace = "pre-line";
  const ctl = $("hRestart").parentElement;
  const lab = document.createElement("label"); lab.className = "dim"; lab.style.marginLeft = "10px";
  lab.innerHTML = `<input type="checkbox" id="hShuffle"> mix up what everyone loves`;
  ctl.appendChild(lab);
  ctl.parentElement.insertBefore(Object.assign(document.createElement("div"), { id: "hGallery" }), ctl.nextSibling);
})();

function renderGallery() {
  const got = loadGallery();
  $("hGallery").innerHTML = `<p class="dim" style="margin:10px 0 4px">endings found: <b style="color:var(--accent)">${got.filter((k) => ENDING_KEYS.includes(k)).length}/${ENDING_KEYS.length}</b></p>` +
    `<div style="display:flex;flex-wrap:wrap;gap:4px">` + ENDING_KEYS.map((k) => {
      const id = k.includes(":") ? k.split(":")[1] : null, has = got.includes(k);
      return `<span title="${has ? endingTitle(k) : "not found yet"}" style="border:1px solid ${has ? "var(--accent)" : "#3a302a"};border-radius:6px;padding:2px 6px;font-size:13px;opacity:${has ? 1 : 0.45}">` +
        `${has ? (id ? cast(id).glyph + (k.startsWith("true") ? "✨" : "") : "★") + " " + endingTitle(k) : "???"}</span>`;
    }).join("") + `</div>`;
}

function render() {
  const playing = g.phase === "play", free = !busy(g);
  $("hDay").textContent = Math.min(g.day, DAYS);
  $("hCoins").textContent = g.coins; $("hCharm").textContent = `${g.charm}/${MAX_CHARM}`;
  $("hGiftsOwned").textContent = GIFTS.filter((x) => g.inv[x.id] > 0).map((x) => x.glyph + (g.inv[x.id] > 1 ? "×" + g.inv[x.id] : "")).join(" ") || "none";
  $("hPick").hidden = g.phase === "over";
  $("hCast").innerHTML = g.roster.map((id) => {
    const c = cast(id), n = heartsOf(g, id);
    const tried = APPROACHES.filter((a) => g.seen[id][a.id]).map((a) => a.glyph + MARK[g.seen[id][a.id]]).join(" ");
    const places = SPOTS.filter((x) => g.seenSpot[id][x.id]).map((x) => x.glyph + SPOTMARK[g.seenSpot[id][x.id]]).join(" ");
    const gifts = GIFTS.filter((x) => g.seenGift[id][x.id]).map((x) => x.glyph + (g.seenGift[id][x.id] === "love" ? "💖" : "🙂")).join(" ");
    const sc = g.scenes[id] === undefined ? "" : g.scenes[id] === 2 ? " 💬✨" : g.scenes[id] === 1 ? " 💬" : " 💬💔";
    return `<button class="person${who === id ? " sel" : ""}" data-id="${id}" ${playing && free ? "" : "disabled"}>` +
      `<span class="face">${c.glyph}</span><b>${c.name}${sc}</b><span class="hearts">${"♥".repeat(n)}${"♡".repeat(8 - n)}</span>` +
      `<small>${c.blurb}</small><small>${tried}</small><small>${places} ${gifts}</small></button>`;
  }).join("");

  // events and scenes
  const p = g.pending;
  $("hEvent").hidden = !p;
  if (p) {
    $("hEvent").innerHTML = `<p style="margin:0 0 8px"><b>${p.type === "scene" ? "a moment" : "something happens"}.</b> ${p.text}</p><div class="shop" style="margin:0">` +
      p.choices.map((c, i) => `<button data-choice="${i}">${c.label}</button>`).join("") + `</div>`;
  }

  // today's actions
  $("hDayBox").hidden = !(playing && free);
  if (playing && free) {
    $("hDayBox").innerHTML = `<div class="shop"><button data-act="work">⚒ work a shift (+${WORK_PAY} coins)</button>` +
      `<button data-act="practice" ${g.charm >= MAX_CHARM ? "disabled" : ""}>🪞 practise charm (${g.charm}/${MAX_CHARM})</button>` +
      GIFTS.map((x) => `<button data-buy="${x.id}" ${g.coins < x.price ? "disabled" : ""} title="${x.name}">buy ${x.glyph} (${x.price}🪙)</button>`).join("") + `</div>`;
  }

  // how to spend the day with the chosen piece
  $("hHow").hidden = !(playing && free && who);
  if (who) {
    const c = cast(who);
    $("hHowTitle").textContent = `day ${g.day} with ${c.name}: pick a place, maybe a gift, then how to approach them.`;
    $("hSpots").innerHTML = g.spotsToday.map((id) => {
      const k = g.seenSpot[who][id];
      return `<button data-spot="${id}" class="${spot === id ? "sel" : ""}">${spotOf(id).glyph} ${spotOf(id).name}${k ? " " + SPOTMARK[k] : ""}</button>`;
    }).join("") + `<button data-spot="" class="${spot ? "" : "sel"}">🚶 just walk</button>`;
    $("hGifts").innerHTML = GIFTS.filter((x) => g.inv[x.id] > 0).map((x) => {
      const k = g.seenGift[who][x.id];
      return `<button data-gift="${x.id}" class="${gift === x.id ? "sel" : ""}">${x.glyph} give ${x.name}${k ? (k === "love" ? " 💖" : " 🙂") : ""}</button>`;
    }).join("");
    $("hGifts").hidden = !$("hGifts").innerHTML;
    $("hApproaches").innerHTML = APPROACHES.map((a) => {
      const k = g.seen[who][a.id];
      return `<button data-how="${a.id}" title="${a.text}">${a.glyph} ${a.name}${k ? " " + MARK[k] : ""}</button>`;
    }).join("");
  }
  $("hConfess").hidden = g.phase !== "confess";
  $("hConfessBtns").innerHTML = g.roster.map((id) => `<button data-who="${id}">${cast(id).glyph} confess to ${cast(id).name} (${"♥".repeat(heartsOf(g, id))})</button>`).join("") +
    `<button data-who="all">📣 confess to everyone</button><button data-who="">walk away${g.coins >= 12 ? " (rich)" : ""}</button>`;

  let log;
  if (g.ending) log = endingText(g.ending) + (fresh ? "\n(new ending found!)" : "");
  else if (g.last) log = (g.last.who ? MARK[g.last.tier] + " " : "") + g.last.line + (g.last.notes && g.last.notes.length ? "\n" + g.last.notes.join(" ") : "") +
    (g.last.who && !g.last.scene ? `\n(${g.last.delta >= 0 ? "+" : ""}${g.last.delta} with ${cast(g.last.who).name})` : "");
  else log = "pick a piece to spend today with. each loves a different way of being approached, and different places and gifts. six of the ten pieces are here this time. hearts fade for anyone you ignore.";
  $("hLog").textContent = log;
  $("hLog").className = g.ending ? "end" : "";
  $("hShare").hidden = !g.ending;
  if (g.ending) {
    const e = g.ending, name = e.who ? cast(e.who).name : null;
    const txt = e.kind === "checkmate" ? (e.true ? `I got the true ending with ${name} in Chess Heart, the chess dating sim. 💘✨` : `I won ${name}'s heart in Chess Heart, the chess dating sim. Checkmate. 💘`)
      : e.kind === "friends" ? `${name} friend-zoned me in Chess Heart, the chess dating sim. Draw by mutual respect.`
      : e.kind === "rejected" ? `${name} rejected me in Chess Heart, the chess dating sim. I resigned.`
      : e.kind === "fork" ? "I confessed to two people at once in Chess Heart, the chess dating sim. A royal fork. 😬"
      : e.kind === "crowd" ? "I confessed to everyone at once in Chess Heart, the chess dating sim. Nobody knew who I meant."
      : e.kind === "tycoon" ? "I skipped every date in Chess Heart, the chess dating sim, and retired rich."
      : "I walked away from every date in Chess Heart, the chess dating sim. Stalemate.";
    const found = loadGallery().length;
    $("hShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(`${txt} (${found}/${ENDING_KEYS.length} endings found)\nhttps://chessgenres.bisks.net/#dating`);
  }
  renderGallery();
}

function onEnd() {
  if (g.ending && !g.recorded) { g.recorded = true; fresh = saveEnding(endingKey(g.ending)); }
}

$("hCast").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b || busy(g)) return;
  who = b.dataset.id; spot = null; gift = null; render();
});
$("hEvent").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-choice]");
  if (!b) return;
  resolve(g, Number(b.dataset.choice)); who = null; spot = null; gift = null; render();
});
$("hDayBox").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.act === "work") work(g);
  else if (b.dataset.act === "practice") practice(g);
  else if (b.dataset.buy) { buy(g, b.dataset.buy); render(); return; }
  who = null; spot = null; gift = null; render();
});
$("hSpots").addEventListener("click", (e) => { const b = e.target.closest("button[data-spot]"); if (b) { spot = b.dataset.spot || null; render(); } });
$("hGifts").addEventListener("click", (e) => { const b = e.target.closest("button[data-gift]"); if (b) { gift = gift === b.dataset.gift ? null : b.dataset.gift; render(); } });
$("hApproaches").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-how]");
  if (!b || !who) return;
  date(g, who, b.dataset.how, spot, gift); who = null; spot = null; gift = null; render();
});
$("hConfessBtns").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-who]");
  if (!b) return;
  confess(g, b.dataset.who === "" ? null : b.dataset.who); onEnd(); render();
});
$("hRestart").addEventListener("click", () => {
  shuffled = $("hShuffle").checked;
  g = newGame({ shuffle: shuffled }); who = spot = gift = null; fresh = false; render();
});
render();
