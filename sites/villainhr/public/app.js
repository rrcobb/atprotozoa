import { moots } from "./lib/cluster.js";
import { fetchPosts, extractFeatures, scoreVillain, tierFor } from "./lib/villainy.js";
import { CHALLENGES, runChallenge } from "./lib/challenges.js";

const els = {
  form: document.getElementById("searchForm"),
  input: document.getElementById("handleInput"),
  genBtn: document.getElementById("genBtn"),
  status: document.getElementById("status"),

  stageShortlist: document.getElementById("stageShortlist"),
  shortlistMeta: document.getElementById("shortlistMeta"),
  shortlist: document.getElementById("shortlist"),

  stageDossier: document.getElementById("stageDossier"),
  backToShortlist: document.getElementById("backToShortlist"),
  who: document.getElementById("who"),
  dossierScore: document.getElementById("dossierScore"),
  dossierTier: document.getElementById("dossierTier"),
  dossierVerdict: document.getElementById("dossierVerdict"),
  axes: document.getElementById("axes"),
  coverLetter: document.getElementById("coverLetter"),
  checklist: document.getElementById("checklist"),
  startInterview: document.getElementById("startInterview"),

  stageInterview: document.getElementById("stageInterview"),
  backToDossierFromInterview: document.getElementById("backToDossierFromInterview"),
  interviewProgress: document.getElementById("interviewProgress"),
  challenges: document.getElementById("challenges"),
  finishInterview: document.getElementById("finishInterview"),

  stageOffer: document.getElementById("stageOffer"),
  offerLetter: document.getElementById("offerLetter"),
  startOver: document.getElementById("startOver"),
  graphicWrap: document.getElementById("graphicWrap"),
  canvas: document.getElementById("graphic"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  shareLink: document.getElementById("shareLink"),
};

const MONO = "ui-monospace, monospace";
// Bounds how many SimCluster members get their posts fetched. Each one costs
// a getAuthorFeed call at CONCURRENCY 4; 40 keeps a worst-case cluster scan
// under roughly a minute in-browser, not a "seemed safe" default — a bigger
// pool still resolves and counts toward the displayed cluster size, it just
// isn't all individually scored.
const CANDIDATE_CAP = 40;
const CONCURRENCY = 4;

const state = {
  originHandle: "",
  top10: [],
  selected: null, // { profile, feat, scored }
  passed: new Set(),
};

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function short(h) {
  return "@" + String(h || "").replace(/\.bsky\.social$/, "");
}

function showStage(id) {
  for (const s of document.querySelectorAll("section.stage")) {
    s.classList.toggle("show", s.id === id);
  }
}

async function runPool(items, worker, limit) {
  const out = new Array(items.length);
  let idx = 0;
  async function lane() {
    while (idx < items.length) {
      const i = idx++;
      try { out[i] = await worker(items[i], i); } catch { out[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

function axisRow(container, axis) {
  const row = document.createElement("div");
  row.className = "axisrow";
  const lbl = document.createElement("div");
  lbl.className = "lbl";
  lbl.textContent = `${axis.meta.glyph} ${axis.meta.label}`;
  const bar = document.createElement("div");
  bar.className = "axisbar";
  const fill = document.createElement("div");
  fill.style.width = Math.round(axis.value * 100) + "%";
  bar.appendChild(fill);
  const val = document.createElement("div");
  val.className = "val";
  val.textContent = Math.round(axis.value * 100) + "%";
  row.append(lbl, bar, val);
  container.appendChild(row);
}

// --- stage 1: shortlist -----------------------------------------------

async function shortlistCluster(rawHandle) {
  const handle = (rawHandle || "").trim().replace(/^@/, "");
  if (!handle) { setStatus("enter a handle first.", true); return; }

  els.genBtn.disabled = true;
  showStage(null);
  setStatus(`resolving @${handle}...`);

  try {
    const res = await moots(handle, { onStep: (s) => setStatus(s) });
    if (res.pool.length < 1) {
      setStatus(`@${short(res.handle)} has no mutuals or follows to form a SimCluster from — no candidates to shortlist.`, true);
      return;
    }

    state.originHandle = res.handle;
    const pool = res.pool.slice(0, CANDIDATE_CAP);
    let done = 0;
    const scored = await runPool(pool, async (profile) => {
      const posts = await fetchPosts(profile.did, { pages: 1 });
      done++;
      setStatus(`screening ${res.kind} (${done}/${pool.length})...`);
      const feat = extractFeatures(profile, posts);
      const scored = scoreVillain(feat);
      return { profile, feat, scored };
    }, CONCURRENCY);

    const ranked = scored.filter(Boolean).sort((a, b) => b.scored.score - a.scored.score);
    const top10 = ranked.slice(0, 10);
    state.top10 = top10;

    els.shortlistMeta.textContent =
      `@${short(res.handle)}'s SimCluster (${res.counts.pool} ${res.kind}) — ${ranked.length} screened, top 10 shortlisted for the villain role.`;

    els.shortlist.innerHTML = "";
    top10.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "candidate";
      const rank = document.createElement("div");
      rank.className = "rank";
      rank.textContent = "#" + (i + 1);
      const img = document.createElement("img");
      img.alt = "";
      img.src = c.profile.avatar || "";
      const info = document.createElement("div");
      info.className = "info";
      const dn = document.createElement("div");
      dn.className = "dn";
      dn.textContent = c.profile.displayName || short(c.profile.handle);
      const hn = document.createElement("div");
      hn.className = "hn";
      hn.textContent = short(c.profile.handle);
      const tier = document.createElement("div");
      tier.className = "tier";
      tier.textContent = tierFor(c.scored.score).name;
      info.append(dn, hn, tier);
      const scoreEl = document.createElement("div");
      scoreEl.className = "score";
      const b = document.createElement("b");
      b.textContent = c.scored.score;
      const d = document.createElement("div");
      d.textContent = "villain score";
      scoreEl.append(b, d);
      row.append(rank, img, info, scoreEl);
      row.addEventListener("click", () => openDossier(c));
      els.shortlist.appendChild(row);
    });

    setStatus("");
    showStage("stageShortlist");
  } catch (err) {
    setStatus("couldn't screen that one: " + (err && err.message ? err.message : "try again") + ".", true);
  } finally {
    els.genBtn.disabled = false;
  }
}

// --- stage 2: dossier / audition ---------------------------------------

const CHECKLIST = [
  { axis: "menace", text: "deliver at least one villain-coded monologue, in writing" },
  { axis: "caps", text: "shout in ALL CAPS without irony" },
  { axis: "chaos", text: "emit chaos on a predictable schedule" },
  { axis: "nocturnal", text: "maintain lair-hours availability (posting midnight-5am UTC)" },
  { axis: "instigation", text: "instigate discourse without being asked" },
];

function axisValue(scored, key) {
  const a = scored.axes.find((x) => x.key === key);
  return a ? a.value : 0;
}

function buildCoverLetter(c) {
  const { profile, feat, scored } = c;
  const who = short(profile.handle);
  const pct = (k) => Math.round(axisValue(scored, k) * 100) + "%";
  const lines = [
    `To the Hiring Committee,`,
    ``,
    `RE: Villain Role — ${short(state.originHandle)}'s SimCluster Casting Call`,
    ``,
    `Having reviewed ${who}'s public record, I'm pleased to recommend them for the open Villain position.`,
  ];
  if (feat.exhibit) {
    lines.push(``, `Exhibit A, in their own words:`, `"${feat.exhibit.trim().slice(0, 220)}"`);
  }
  lines.push(
    ``,
    `Score breakdown: schemes & plots ${pct("menace")} · monologue volume ${pct("caps")} · chaos emission ${pct("chaos")} · lair-hours attendance ${pct("nocturnal")} · instigation ${pct("instigation")}.`,
    `Dominant trait: ${scored.dominant.meta.archetype}.`,
    ``,
    `Overall villain rating: ${scored.score}/100 — ${tierFor(scored.score).name}.`,
    `${tierFor(scored.score).verdict}`,
    ``,
    `Recommend proceeding directly to worktrial.`,
    ``,
    `— Villain Ops Talent Acquisition`
  );
  return lines.join("\n");
}

function openDossier(c) {
  state.selected = c;
  state.passed = new Set();
  const { profile, scored } = c;
  const tier = tierFor(scored.score);

  els.who.innerHTML = "";
  const img = document.createElement("img");
  img.alt = "";
  img.src = profile.avatar || "";
  img.style.visibility = profile.avatar ? "visible" : "hidden";
  const info = document.createElement("div");
  const dn = document.createElement("div");
  dn.className = "dn";
  dn.textContent = profile.displayName || short(profile.handle);
  const hn = document.createElement("div");
  hn.className = "hn";
  hn.textContent = short(profile.handle);
  const arch = document.createElement("div");
  arch.className = "archetype";
  arch.textContent = `${scored.dominant.meta.glyph} ${scored.dominant.meta.archetype}`;
  info.append(dn, hn, arch);
  els.who.append(img, info);

  els.dossierScore.textContent = scored.score + "/100";
  els.dossierTier.textContent = tier.name;
  els.dossierVerdict.textContent = tier.verdict;

  els.axes.innerHTML = "";
  for (const axis of scored.axes) axisRow(els.axes, axis);

  els.coverLetter.textContent = buildCoverLetter(c);

  els.checklist.innerHTML = "";
  for (const item of CHECKLIST) {
    const li = document.createElement("li");
    const done = axisValue(scored, item.axis) >= 0.35;
    li.className = done ? "done" : "";
    const box = document.createElement("span");
    box.className = "box";
    box.textContent = done ? "☑" : "☐";
    li.append(box, document.createTextNode(item.text));
    els.checklist.appendChild(li);
  }

  showStage("stageDossier");
}

// --- stage 3: mandatory villain-coding interview ------------------------

function renderChallenges() {
  els.challenges.innerHTML = "";
  CHALLENGES.forEach((ch, i) => {
    const box = document.createElement("div");
    box.className = "challenge";
    box.dataset.id = ch.id;

    const h3 = document.createElement("h3");
    h3.textContent = `${i + 1}. ${ch.title}`;
    const p = document.createElement("p");
    p.className = "prompt";
    p.textContent = ch.prompt;
    const ta = document.createElement("textarea");
    ta.id = "code-" + ch.id;
    ta.spellcheck = false;
    ta.value = ch.starter;

    const runrow = document.createElement("div");
    runrow.className = "runrow";
    const runBtn = document.createElement("button");
    runBtn.className = "btn-ghost";
    runBtn.type = "button";
    runBtn.textContent = "run tests";
    const verdict = document.createElement("span");
    verdict.className = "verdict";
    runrow.append(runBtn, verdict);

    const testrow = document.createElement("div");
    testrow.className = "testrow";

    runBtn.addEventListener("click", () => {
      const { results, allPass, compileError } = runChallenge(ch, ta.value);
      testrow.innerHTML = "";
      if (compileError) {
        const d = document.createElement("div");
        d.className = "t fail";
        d.textContent = compileError;
        testrow.appendChild(d);
      } else {
        results.forEach((r) => {
          const d = document.createElement("div");
          d.className = "t " + (r.pass ? "pass" : "fail");
          const got = r.error ? `error: ${r.error}` : JSON.stringify(r.actual);
          d.textContent = `solve(${r.args.map((a) => JSON.stringify(a)).join(", ")}) → ${got} (expected ${JSON.stringify(r.expect)})`;
          testrow.appendChild(d);
        });
      }
      verdict.className = "verdict " + (allPass ? "pass" : "fail");
      verdict.textContent = allPass ? "✓ passed" : "not yet — keep scheming";
      if (allPass) state.passed.add(ch.id);
      else state.passed.delete(ch.id);
      updateInterviewProgress();
    });

    box.append(h3, p, ta, runrow, testrow);
    els.challenges.appendChild(box);
  });
}

function updateInterviewProgress() {
  els.interviewProgress.textContent = `${state.passed.size} / ${CHALLENGES.length} rounds passed`;
  els.finishInterview.disabled = state.passed.size < CHALLENGES.length;
}

// --- stage 4: offer letter + share --------------------------------------

function encodeResult(handle, score, tierName, archetype, origin) {
  const json = JSON.stringify({ h: handle, s: score, t: tierName, a: archetype, o: origin });
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function shareUrlFor(handle, score, tierName, archetype, origin) {
  const code = encodeResult(handle, score, tierName, archetype, origin);
  return `https://villainhr.bisks.net/r/${code}`;
}

function buildShareText(handle, score, tierName, archetype, origin, url) {
  return (
    `${short(handle)} cleared Villain Ops' interview loop and got the offer letter as ${short(origin)}'s SimCluster's top villain candidate ` +
    `(${score}/100, ${archetype}, ${tierName}). ${url}`
  );
}

function buildOfferLetter(c, origin) {
  const { profile, scored } = c;
  const tier = tierFor(scored.score);
  return [
    `OFFER OF EMPLOYMENT`,
    ``,
    `Villain Ops, a Division of ${short(origin)}'s SimCluster`,
    ``,
    `Dear ${short(profile.handle)} ("Candidate"),`,
    ``,
    `Congratulations. Having cleared the shortlist review, the audition dossier, and the mandatory three-round technical interview, Villain Ops is pleased to extend an offer for the position of `,
    `VILLAIN.`,
    ``,
    `Final villain rating: ${scored.score}/100 — ${tier.name}`,
    `Primary archetype: ${scored.dominant.meta.archetype}`,
    ``,
    `Start date: immediately. Villains do not serve a notice period.`,
    ``,
    `Welcome aboard.`,
    ``,
    `— Villain Ops Talent Acquisition`,
  ].join("\n");
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  let lines = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
      lines++;
      if (maxLines && lines >= maxLines - 1) {
        ctx.fillText(line + "…", x, cy);
        return cy;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy;
}

function loadImg(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function drawShareCard({ profile, score, tierName, archetype, exhibit }) {
  const canvas = els.canvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const avatar = await loadImg(profile.avatar);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0d0605";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, W * 0.6);
  glow.addColorStop(0, "rgba(255,90,77,0.35)");
  glow.addColorStop(1, "rgba(13,6,5,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#f4c76a";
  ctx.font = `800 32px ${MONO}`;
  ctx.fillText("villainHR — OFFER LETTER", 56, 68);

  let textX = 56;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(80, 128, 26, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 54, 102, 52, 52);
    ctx.restore();
    textX = 122;
  }
  ctx.fillStyle = "#f5e9e4";
  ctx.font = `700 26px ${MONO}`;
  ctx.fillText(short(profile.handle), textX, 138);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ff5a4d";
  ctx.font = `900 140px ${MONO}`;
  ctx.fillText(score, W / 2, 370);
  ctx.font = `700 28px ${MONO}`;
  ctx.fillStyle = "#b08b85";
  ctx.fillText("/ 100", W / 2, 405);

  ctx.fillStyle = "#f5e9e4";
  ctx.font = `800 30px ${MONO}`;
  ctx.fillText(tierName, W / 2, 452);

  ctx.fillStyle = "#f4c76a";
  ctx.font = `400 20px ${MONO}`;
  ctx.fillText(archetype, W / 2, 484);

  if (exhibit) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#d8c2bd";
    ctx.font = `400 19px ${MONO}`;
    wrapCanvasText(ctx, `Exhibit A: "${exhibit.trim()}"`, 70, 530, W - 140, 26, 3);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#ff5a4d";
  ctx.font = `700 20px ${MONO}`;
  ctx.fillText("villainhr.bisks.net", W / 2, H - 36);
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

let lastShareText = "";

async function showOffer() {
  const c = state.selected;
  const origin = state.originHandle;
  const tier = tierFor(c.scored.score);

  els.offerLetter.textContent = buildOfferLetter(c, origin);
  showStage("stageOffer");

  const url = shareUrlFor(c.profile.handle, c.scored.score, tier.name, c.scored.dominant.meta.archetype, origin);
  lastShareText = buildShareText(c.profile.handle, c.scored.score, tier.name, c.scored.dominant.meta.archetype, origin, url);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  els.shareLink.href = url;
  els.shareLink.textContent = url.replace("https://", "");

  await drawShareCard({
    profile: c.profile,
    score: c.scored.score,
    tierName: tier.name,
    archetype: c.scored.dominant.meta.archetype,
    exhibit: c.feat.exhibit,
  });
  els.graphicWrap.classList.add("show");
}

els.shareDownload.addEventListener("click", () => {
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const who = (state.selected ? state.selected.profile.handle : "offer").replace(/[^a-z0-9.-]/gi, "_");
    a.download = `villainhr-${who}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "villainhr-offer.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "villainHR" });
      } catch {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

// --- wiring ---------------------------------------------------------------

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  shortlistCluster(els.input.value);
});

els.backToShortlist.addEventListener("click", () => showStage("stageShortlist"));
els.backToDossierFromInterview.addEventListener("click", () => showStage("stageDossier"));

els.startInterview.addEventListener("click", () => {
  state.passed = new Set();
  renderChallenges();
  updateInterviewProgress();
  showStage("stageInterview");
});

els.finishInterview.addEventListener("click", () => {
  showOffer();
});

els.startOver.addEventListener("click", () => {
  state.selected = null;
  els.graphicWrap.classList.remove("show");
  showStage("stageShortlist");
});

// /r/<code> — a shared offer letter. Renders read-only from the encoded
// result; doesn't re-run the screen (the interview can't be replayed
// automatically, it was a real skill check).
function decodeCode(code) {
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

async function renderSharedOffer(code) {
  const o = decodeCode(code);
  if (!o || typeof o.h !== "string") return;

  let avatar = "";
  try {
    const prof = await (await fetch(`https://api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(o.h)}`)).json();
    avatar = prof.avatar || "";
  } catch {}

  const fakeCandidate = {
    profile: { handle: o.h, avatar },
    scored: { score: o.s, dominant: { meta: { archetype: o.a } } },
    feat: { exhibit: null },
  };
  state.selected = fakeCandidate;
  state.originHandle = o.o || "";

  els.offerLetter.textContent = buildOfferLetter(fakeCandidate, state.originHandle);
  showStage("stageOffer");

  const url = shareUrlFor(o.h, o.s, o.t, o.a, state.originHandle);
  lastShareText = buildShareText(o.h, o.s, o.t, o.a, state.originHandle, url);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  els.shareLink.href = url;
  els.shareLink.textContent = url.replace("https://", "");

  await drawShareCard({ profile: { handle: o.h, avatar }, score: o.s, tierName: o.t, archetype: o.a, exhibit: null });
  els.graphicWrap.classList.add("show");
}

const pathCode = (location.pathname.match(/^\/r\/([^/]+)\/?$/) || [])[1];
if (pathCode) {
  renderSharedOffer(pathCode);
} else {
  const sharedHandle = new URLSearchParams(location.search).get("h");
  if (sharedHandle) {
    els.input.value = sharedHandle;
    shortlistCluster(sharedHandle);
  }
}
