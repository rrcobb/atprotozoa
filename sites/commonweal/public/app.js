// commonweal — all state lives in the browser. The charter itself round-trips
// through the URL (?c=<base64url json>) so a link IS the shared source of
// truth; no server, no login, no per-visitor account needed to found or join
// a commons. In-progress round state (votes, drawn council) is mirrored to
// localStorage per-charter so a reload mid-meeting doesn't lose it.

// ---- encoding helpers -------------------------------------------------

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64) {
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// cyrb53 string hash -> 32-bit seed for mulberry32
function hashStr(str) {
  let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0) ^ (h2 >>> 0);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- charter -----------------------------------------------------------

function parseMembers(raw) {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((s) => s.trim().replace(/^@/, ""))
        .filter(Boolean)
    )
  );
}

function encodeCharter(charter) {
  return toBase64Url(JSON.stringify(charter));
}

function decodeCharter(param) {
  try {
    const obj = JSON.parse(fromBase64Url(param));
    if (!obj || !Array.isArray(obj.members) || !obj.members.length) return null;
    return obj;
  } catch {
    return null;
  }
}

function charterUrl(charter) {
  const u = new URL(location.href);
  u.search = "";
  u.searchParams.set("c", encodeCharter(charter));
  return u.toString();
}

function charterKey(charter) {
  return "commonweal:" + hashStr(JSON.stringify(charter));
}

// ---- council sizing & sortition -----------------------------------------

function councilSize(n) {
  if (n <= 5) return n;
  const raw = Math.round(2 * Math.sqrt(n));
  return Math.min(Math.max(raw, 5), 25);
}

function drawCouncil(charter, roundTag) {
  const seed = hashStr(JSON.stringify(charter) + "|sortition|" + roundTag);
  const rng = mulberry32(seed);
  const size = councilSize(charter.members.length);
  return shuffled(charter.members, rng).slice(0, size);
}

// ---- doge-style lot & ballot facilitator draw ---------------------------

function runDogeElection(council, roundTag, charter) {
  const seed = hashStr(JSON.stringify(charter) + "|doge|" + roundTag);
  const rng = mulberry32(seed);
  const pool = council.slice();
  const steps = [];

  const nucleusSize = Math.max(3, Math.min(pool.length, Math.ceil(pool.length / 3)));
  const nucleus = shuffled(pool, rng).slice(0, nucleusSize);
  steps.push({
    kind: "lot",
    text: `<b>Lot</b> draws a nucleus of ${nucleus.length} from the council: ${nucleus.join(", ")}.`,
  });

  const slateSet = new Set();
  for (let i = 0; i < nucleus.length; i++) {
    slateSet.add(pool[Math.floor(rng() * pool.length)]);
  }
  while (slateSet.size < Math.min(3, pool.length)) {
    slateSet.add(pool[Math.floor(rng() * pool.length)]);
  }
  const slate = Array.from(slateSet);
  steps.push({
    kind: "ballot",
    text: `<b>Ballot</b> — the nucleus nominates a slate of ${slate.length}: ${slate.join(", ")}.`,
  });

  const committeeSize = Math.max(3, Math.min(slate.length, Math.ceil(slate.length / 2)));
  const committee = shuffled(slate, rng).slice(0, committeeSize);
  steps.push({
    kind: "lot",
    text: `<b>Lot</b> narrows to a committee of ${committee.length}: ${committee.join(", ")}.`,
  });

  const winner = slate[Math.floor(rng() * slate.length)];
  steps.push({
    kind: "ballot",
    text: `<b>Ballot</b> — the committee's vote names the facilitator: <b>${winner}</b>.`,
  });

  return { steps, winner };
}

// ---- concord, the ai delegate (heuristic, not a model) -------------------

const AI_NAME = "Concord";
const POS_WORDS = [
  "share", "shared", "sharing", "care", "caring", "support", "together",
  "consent", "transparent", "transparency", "rotate", "rotating", "open",
  "repair", "rest", "mutual", "access", "include", "inclusive", "sustain",
  "sustainable", "commons", "credit", "listen", "consensus", "volunteer",
  "kind", "kindness", "trust", "collective",
];
const NEG_WORDS = [
  "extract", "extractive", "control", "surveil", "surveillance", "punish",
  "punishment", "exclude", "exclusive", "hoard", "coerce", "coercive",
  "profit", "seize", "silence", "monopoly", "exploit", "opaque",
  "mandatory", "forever", "unlimited", "penalize", "confiscate",
];

function aiTake(text) {
  const lower = " " + text.toLowerCase() + " ";
  const hits = (list) => list.filter((w) => lower.includes(w));
  const pos = hits(POS_WORDS);
  const neg = hits(NEG_WORDS);
  const score = pos.length - neg.length;
  let lean = "abstain";
  if (score > 0) lean = "yes";
  else if (score < 0) lean = "no";

  let comment;
  if (!text.trim()) {
    comment = "No proposal text yet — Concord has nothing to read.";
  } else if (pos.length === 0 && neg.length === 0) {
    comment = "No cooperative or extractive language jumps out — reads as neutral. Abstaining and deferring to the room.";
  } else {
    const parts = [];
    if (pos.length) parts.push(`cooperative language (${pos.join(", ")})`);
    if (neg.length) parts.push(`extractive language (${neg.join(", ")})`);
    comment = `Flags ${parts.join(" and ")}. Reads net ${lean === "yes" ? "cooperative" : lean === "no" ? "extractive" : "neutral"} — leaning ${lean}.`;
  }
  return { lean, comment, pos, neg };
}

// ---- app state -----------------------------------------------------------

let charter = null;
let currentCouncil = [];
let currentFacilitator = null;
let votes = {}; // name -> "yes" | "no" | "abstain"

const el = (id) => document.getElementById(id);

function saveSession() {
  if (!charter) return;
  const key = charterKey(charter);
  const state = {
    roundTag: el("round-tag").value,
    council: currentCouncil,
    facilitator: currentFacilitator,
    proposal: el("proposal-text").value,
    votes,
    fullMoot: el("full-moot").checked,
    twoThirds: el("two-thirds").checked,
  };
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {}
}

function loadSession() {
  if (!charter) return null;
  try {
    const raw = localStorage.getItem(charterKey(charter));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ---- rendering -------------------------------------------------------

function renderCharter() {
  el("foundCard").classList.add("hidden");
  el("charterCard").classList.remove("hidden");
  el("councilCard").classList.remove("hidden");

  el("c-name").textContent = charter.name || "unnamed commons";
  const you = el("c-yourhandle").value.trim().replace(/^@/, "");
  el("c-members").innerHTML = charter.members
    .map((m) => `<span class="chip${m === you ? " you" : ""}">${escapeHtml(m)}</span>`)
    .join("");
  el("c-link").textContent = charterUrl(charter);

  const n = charter.members.length;
  const size = councilSize(n);
  el("council-formula").textContent =
    n <= 5
      ? `${n} member${n === 1 ? "" : "s"} — everyone is the council (groups of 5 or fewer skip sortition entirely).`
      : `${n} members → council of ${size} (round(2·√${n}) = ${Math.round(2 * Math.sqrt(n))}, clamped to 5–25).`;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderCouncilList() {
  const you = el("c-yourhandle").value.trim().replace(/^@/, "");
  const list = el("council-list");
  if (!currentCouncil.length) {
    list.innerHTML = "";
    return;
  }
  const seats = currentCouncil.slice();
  let html = seats
    .map((m) => {
      const tags = [];
      if (m === you) tags.push('<span class="chip you">you</span>');
      if (m === currentFacilitator) tags.push('<span class="chip facilitator">facilitator</span>');
      return `<div class="roster-row"><div class="who"><span class="chip council">${escapeHtml(m)}</span>${tags.join("")}</div></div>`;
    })
    .join("");
  html += `<div class="roster-row"><div class="who"><span class="chip ai">${AI_NAME} · AI delegate</span><span class="note">always seated, heuristic vote, easy to overrule</span></div></div>`;
  list.innerHTML = html;
  el("proposalCard").classList.remove("hidden");
  el("dogeCard").classList.remove("hidden");
}

function seatsForVoting() {
  const fullMoot = el("full-moot").checked;
  const base = fullMoot ? charter.members.slice() : currentCouncil.slice();
  return base.concat([AI_NAME]);
}

function renderVoteList() {
  const you = el("c-yourhandle").value.trim().replace(/^@/, "");
  const seats = seatsForVoting();
  el("vote-list").innerHTML = seats
    .map((name) => {
      const isAi = name === AI_NAME;
      const v = votes[name] || null;
      const youTag = name === you ? '<span class="chip you">you</span>' : "";
      const aiTag = isAi ? '<span class="chip ai">ai delegate</span>' : "";
      return `
        <div class="roster-row" data-seat="${escapeHtml(name)}">
          <div class="who"><span>${escapeHtml(name)}</span>${youTag}${aiTag}</div>
          <div class="vote-btns">
            <button data-vote="yes" class="${v === "yes" ? "picked-yes" : ""}">yes</button>
            <button data-vote="no" class="${v === "no" ? "picked-no" : ""}">no</button>
            <button data-vote="abstain" class="${v === "abstain" ? "picked-abstain" : ""}">abstain</button>
          </div>
        </div>`;
    })
    .join("");

  el("vote-list").querySelectorAll("button[data-vote]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".roster-row");
      const name = row.getAttribute("data-seat");
      votes[name] = btn.getAttribute("data-vote");
      renderVoteList();
      renderTally();
      saveSession();
    });
  });

  renderTally();
}

function renderTally() {
  const seats = seatsForVoting();
  let yes = 0, no = 0, abstain = 0;
  for (const s of seats) {
    const v = votes[s];
    if (v === "yes") yes++;
    else if (v === "no") no++;
    else if (v === "abstain") abstain++;
  }
  const cast = yes + no + abstain;
  const total = seats.length;
  const bar = el("tally-bar");
  bar.innerHTML = "";
  if (cast > 0) {
    const mk = (cls, count) => {
      const d = document.createElement("div");
      d.className = cls;
      d.style.width = `${(count / total) * 100}%`;
      return d;
    };
    if (yes) bar.appendChild(mk("yes", yes));
    if (no) bar.appendChild(mk("no", no));
    if (abstain) bar.appendChild(mk("abstain", abstain));
  }
  el("tally-yes-label").textContent = `yes ${yes}`;
  el("tally-no-label").textContent = `no ${no}`;
  el("tally-abstain-label").textContent = `abstain ${abstain}`;

  const quorumNeeded = Math.ceil(total * 0.6);
  const verdict = el("verdict");
  if (cast === 0) {
    verdict.className = "verdict pending";
    verdict.textContent = "no votes cast yet";
    return;
  }
  if (cast < quorumNeeded) {
    verdict.className = "verdict pending";
    verdict.textContent = `not yet quorate — ${cast}/${total} seats voted, needs ${quorumNeeded}`;
    return;
  }
  const decided = yes + no;
  const threshold = el("two-thirds").checked ? 2 / 3 : 0.5;
  const passes = decided > 0 && yes / decided > threshold;
  verdict.className = "verdict " + (passes ? "pass" : "fail");
  verdict.textContent = passes
    ? `passes — ${yes}/${decided} of decided votes, above the ${el("two-thirds").checked ? "two-thirds" : "majority"} threshold`
    : `fails — ${yes}/${decided} of decided votes, at or below the ${el("two-thirds").checked ? "two-thirds" : "majority"} threshold`;
}

function renderAiTake() {
  const text = el("proposal-text").value;
  const take = aiTake(text);
  votes[AI_NAME] = take.lean;
  el("ai-take").classList.remove("hidden");
  el("ai-take-text").textContent = take.comment;
  renderVoteList();
}

function renderDogeSteps(result) {
  const container = el("doge-steps");
  container.innerHTML = "";
  result.steps.forEach((step, i) => {
    setTimeout(() => {
      const div = document.createElement("div");
      div.className = "doge-step";
      div.innerHTML = step.text;
      container.appendChild(div);
      if (i === result.steps.length - 1) {
        currentFacilitator = result.winner;
        el("doge-result").classList.remove("hidden");
        el("doge-name").textContent = result.winner;
        renderCouncilList();
        saveSession();
      }
    }, i * 550);
  });
}

// ---- share ---------------------------------------------------------------

function buildShareText() {
  const url = charterUrl(charter);
  const roundTag = el("round-tag").value.trim();
  let text = `${charter.name || "our commons"}`;
  if (roundTag) text += ` — round "${roundTag}"`;
  if (currentFacilitator) text += ` — facilitator: ${currentFacilitator}`;
  text += ` — sortition-drawn council of ${councilSize(charter.members.length)}, with an AI delegate in the room.\n${url}`;
  return text;
}

function drawShareCard() {
  const canvas = el("shareCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = "#0e1410";
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(180, 0, 0, 180, 0, 700);
  grad.addColorStop(0, "#1c3324");
  grad.addColorStop(1, "#0e1410");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#2c3d30";
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  ctx.fillStyle = "#d9b35c";
  ctx.font = "700 40px monospace";
  ctx.fillText("commonweal", 80, 120);

  ctx.fillStyle = "#eef3ea";
  ctx.font = "700 44px monospace";
  wrapText(ctx, charter.name || "an unnamed commons", 80, 200, 1040, 50);

  const roundTag = el("round-tag").value.trim();
  ctx.fillStyle = "#9fb3a4";
  ctx.font = "24px monospace";
  ctx.fillText(roundTag ? `round: ${roundTag}` : "no round drawn yet", 80, 270);

  ctx.fillStyle = "#9fb3a4";
  ctx.font = "22px monospace";
  ctx.fillText(`council of ${councilSize(charter.members.length)} of ${charter.members.length} members`, 80, 330);

  if (currentFacilitator) {
    ctx.fillStyle = "#16301f";
    ctx.fillRect(80, 380, 1040, 90);
    ctx.strokeStyle = "#d9b35c";
    ctx.strokeRect(80, 380, 1040, 90);
    ctx.fillStyle = "#d9b35c";
    ctx.font = "700 34px monospace";
    ctx.fillText(`facilitator: ${currentFacilitator}`, 110, 435);
  }

  ctx.fillStyle = "#7d8a80";
  ctx.font = "20px monospace";
  ctx.fillText("commonweal.bisks.net — sortition + doge-style draw + an AI delegate", 80, H - 70);

  return canvas.toDataURL("image/png");
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

// ---- wiring ----------------------------------------------------------

function init() {
  const params = new URLSearchParams(location.search);
  const c = params.get("c");
  if (c) charter = decodeCharter(c);

  el("f-members").addEventListener("input", () => {
    el("f-count").textContent = `${parseMembers(el("f-members").value).length} members`;
  });

  el("f-found").addEventListener("click", () => {
    const name = el("f-name").value.trim();
    const members = parseMembers(el("f-members").value);
    if (members.length < 1) {
      alert("add at least one member handle");
      return;
    }
    charter = { v: 1, name, members, createdAt: new Date().toISOString() };
    const u = new URL(location.href);
    u.search = "?c=" + encodeCharter(charter);
    history.replaceState(null, "", u.toString());
    votes = {};
    currentCouncil = [];
    currentFacilitator = null;
    renderCharter();
  });

  el("c-copy").addEventListener("click", () => {
    navigator.clipboard?.writeText(charterUrl(charter));
    el("c-copy").textContent = "copied";
    setTimeout(() => (el("c-copy").textContent = "copy"), 1200);
  });

  el("c-new").addEventListener("click", () => {
    charter = null;
    votes = {};
    currentCouncil = [];
    currentFacilitator = null;
    history.replaceState(null, "", location.pathname);
    el("charterCard").classList.add("hidden");
    el("councilCard").classList.add("hidden");
    el("dogeCard").classList.add("hidden");
    el("proposalCard").classList.add("hidden");
    el("foundCard").classList.remove("hidden");
  });

  if (window.attachHandleTypeahead) window.attachHandleTypeahead(el("c-yourhandle"));

  el("c-yourhandle").addEventListener("input", () => {
    renderCharter();
    renderCouncilList();
    renderVoteList();
  });

  el("draw-council").addEventListener("click", () => {
    const tag = el("round-tag").value.trim() || "untagged round";
    currentCouncil = drawCouncil(charter, tag);
    currentFacilitator = null;
    el("doge-result").classList.add("hidden");
    el("doge-steps").innerHTML = "";
    votes = {};
    renderCouncilList();
    renderVoteList();
    saveSession();
  });

  el("run-doge").addEventListener("click", () => {
    if (!currentCouncil.length) {
      alert("draw the council first");
      return;
    }
    const tag = el("round-tag").value.trim() || "untagged round";
    const result = runDogeElection(currentCouncil, tag, charter);
    el("doge-result").classList.add("hidden");
    renderDogeSteps(result);
  });

  el("bring-proposal").addEventListener("click", () => {
    renderAiTake();
    saveSession();
  });

  el("full-moot").addEventListener("change", () => {
    renderVoteList();
    saveSession();
  });
  el("two-thirds").addEventListener("change", () => {
    renderTally();
    saveSession();
  });

  el("share-bluesky").addEventListener("click", (e) => {
    e.preventDefault();
    const text = buildShareText();
    window.open(
      "https://bsky.app/intent/compose?text=" + encodeURIComponent(text),
      "_blank",
      "noopener"
    );
  });

  el("share-card-btn").addEventListener("click", async () => {
    const dataUrl = drawShareCard();
    el("share-card-row").classList.remove("hidden");
    el("share-card-img").src = dataUrl;

    if (navigator.share && navigator.canShare) {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "commonweal.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: buildShareText(), title: "commonweal" });
        }
      } catch {}
    }
  });

  // secret cee.wtf handle prefill — see notes on the "secret handle-prefill
  // link" standing order. No visual difference; just a click target.
  el("secret-h").addEventListener("click", () => {
    const input = el("c-yourhandle");
    input.value = "@cee.wtf";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  });

  if (charter) {
    renderCharter();
    const saved = loadSession();
    if (saved) {
      el("round-tag").value = saved.roundTag || "";
      currentCouncil = saved.council || [];
      currentFacilitator = saved.facilitator || null;
      el("proposal-text").value = saved.proposal || "";
      votes = saved.votes || {};
      el("full-moot").checked = !!saved.fullMoot;
      el("two-thirds").checked = !!saved.twoThirds;
      renderCouncilList();
      if (el("proposal-text").value) renderAiTake();
      renderVoteList();
      if (currentFacilitator) {
        el("doge-result").classList.remove("hidden");
        el("doge-name").textContent = currentFacilitator;
      }
    }
  }
}

init();
