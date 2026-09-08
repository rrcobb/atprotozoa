import { renderSeal, tintFor } from "./lib/seal.js";
import { login, getSession, clearSession, completeLoginIfCallback, dpopFetch } from "./lib/oauth.js";
import { FissionLog } from "./lib/fission-log.js";

const PUB = "https://public.api.bsky.app/xrpc";
const FISSION_COLLECTION = "net.bisks.blubberize.fission";

const $ = (id) => document.getElementById(id);
const els = {
  form: $("searchForm"),
  youInput: $("youInput"),
  targetInput: $("targetInput"),
  genBtn: $("genBtn"),
  status: $("status"),
  resultWrap: $("resultWrap"),
  arena: $("arena"),
  youSlot: $("youSlot"),
  targetSlot: $("targetSlot"),
  youSeal: $("youSeal"),
  targetSeal: $("targetSeal"),
  youLabel: $("youLabel"),
  targetLabel: $("targetLabel"),
  fissionBolt: $("fissionBolt"),
  sYouFollowers: $("sYouFollowers"),
  sTargetFollowers: $("sTargetFollowers"),
  sBlubber: $("sBlubber"),
  fissionBtn: $("fissionBtn"),
  verdict: $("verdict"),
  shareRow: $("shareRow"),
  shareBluesky: $("shareBluesky"),
  shareDownload: $("shareDownload"),
  shareNative: $("shareNative"),
  canvas: $("cardCanvas"),
  signinBar: $("signinBar"),
  fissionLogStatus: $("fissionLogStatus"),
  fissionLogList: $("fissionLogList"),
};

const short = (h) => "@" + String(h || "").replace(/\.bsky\.social$/, "");
const fmt = (n) => Number(n || 0).toLocaleString();

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

async function resolveProfile(raw) {
  const actor = (raw || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!actor) throw new Error("empty handle");
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName || p.handle,
    avatar: p.avatar || "",
    followersCount: p.followersCount || 0,
  };
}

// --- sign in (optional — only needed to make a fission a real, permanent
// record instead of a purely local animation; see doFission) ---------------

let session = null;

function renderSignin() {
  if (session) {
    els.signinBar.innerHTML = `
      <span class="who">signed in as <b>${esc(short(session.handle))}</b> — fissions write a real record</span>
      <button type="button" id="signOutBtn">sign out</button>
    `;
    $("signOutBtn").addEventListener("click", async () => {
      await clearSession();
      session = null;
      renderSignin();
      applySessionToYouInput();
    });
  } else {
    els.signinBar.innerHTML = `
      <a href="#" class="signin-link" id="signInLink">sign in to make FISSION real</a>
      <span class="err" id="signinErr"></span>
    `;
    $("signInLink").addEventListener("click", async (e) => {
      e.preventDefault();
      const h = els.youInput.value.trim().replace(/^@/, "");
      const err = $("signinErr");
      if (!h) {
        err.textContent = "type your handle in \"you\" first.";
        return;
      }
      err.textContent = "signing in…";
      try {
        await login(h);
      } catch (ex) {
        err.textContent = ex.message || "sign-in failed.";
      }
    });
  }
  applySessionToYouInput();
}

// While signed in, "you" always is the signed-in identity — a real fission
// record is a claim about who did it, so it can't be typed as someone else.
function applySessionToYouInput() {
  if (session) {
    els.youInput.value = session.handle;
    els.youInput.readOnly = true;
    els.youInput.title = "signed in — this is you";
  } else {
    els.youInput.readOnly = false;
    els.youInput.title = "";
  }
}

async function initSession() {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setStatus("sign-in failed: " + e.message, true);
  }
  renderSignin();
}

// Real followersCount, sqrt-scaled so a huge account doesn't blow the arena
// out and a tiny one doesn't vanish — a doubling of followers grows the seal
// visibly but not linearly.
function sizeFor(followers, maxFollowers) {
  const MIN = 0.3, MAX = 1;
  if (maxFollowers <= 0) return (MIN + MAX) / 2;
  const t = Math.sqrt(Math.max(0, followers)) / Math.sqrt(maxFollowers);
  return MIN + Math.min(1, t) * (MAX - MIN);
}

let state = null; // { you, target, refMax, fissioned }

function renderSlot(seal, label, slot, profile, followersOverride, refMax, blubberized) {
  const followers = followersOverride ?? profile.followersCount;
  const scale = sizeFor(followers, refMax);
  const px = Math.round(70 + scale * 90);
  seal.style.width = px + "px";
  seal.style.height = px + "px";
  renderSeal(seal, scale, tintFor(profile.did), blubberized);
  label.innerHTML = `<b>${short(profile.handle)}</b> · ${fmt(Math.round(followers))} followers`;
  slot.classList.toggle("blubberized", !!blubberized);
}

function renderPair() {
  const { you, target, refMax, fissioned, youDisplay, targetDisplay } = state;
  renderSlot(els.youSeal, els.youLabel, els.youSlot, you, fissioned ? youDisplay : you.followersCount, refMax, false);
  renderSlot(
    els.targetSeal,
    els.targetLabel,
    els.targetSlot,
    target,
    fissioned ? targetDisplay : target.followersCount,
    refMax,
    fissioned,
  );
}

function buildShareUrl(youHandle, targetHandle) {
  return `https://blubberize.bisks.net/s/${encodeURIComponent(youHandle)}/${encodeURIComponent(targetHandle)}`;
}

function buildShareText() {
  const { you, target } = state;
  const url = buildShareUrl(you.handle, target.handle);
  const prefix = `${short(you.handle)} fissioned half their blubber at ${short(target.handle)} — BLUBBERIZED, unable to post. `;
  const budget = 300 - url.length - 1;
  const text = prefix.length > budget ? prefix.slice(0, Math.max(0, budget - 1)) + "… " : prefix;
  return text + url;
}

function drawShareCard() {
  const { you, target } = state;
  const c = els.canvas;
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0c2138");
  g.addColorStop(1, "#051220");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ff7a5c";
  ctx.font = "800 52px ui-monospace, monospace";
  ctx.fillText("BLUBBERIZED", 60, 110);

  ctx.fillStyle = "#eaf6ff";
  ctx.font = "600 26px ui-monospace, monospace";
  ctx.fillText(`${short(you.handle)} fissioned half their blubber at ${short(target.handle)}`, 60, 160);
  ctx.fillStyle = "#7fa3bf";
  ctx.font = "600 20px ui-monospace, monospace";
  ctx.fillText("unable to post (cosmetically, not really)", 60, 194);

  drawShareSeal(ctx, 300, 420, 130, tintFor(you.did), false, short(you.handle));
  drawShareSeal(ctx, W - 300, 420, 150, tintFor(target.did), true, short(target.handle));

  ctx.fillStyle = "#ffb84d";
  ctx.font = "700 30px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("💥", W / 2, 400);

  ctx.textAlign = "right";
  ctx.fillStyle = "#9fe3ff";
  ctx.font = "700 24px ui-monospace, monospace";
  ctx.fillText("blubberize.bisks.net", W - 56, H - 44);
}

function drawShareSeal(ctx, cx, cy, r, color, blubberized, label) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fillStyle = blubberized ? "#ffb84d" : color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.85, r * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = blubberized ? "#ffb84d" : color;
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "#eaf6ff";
  ctx.font = "700 22px ui-monospace, monospace";
  ctx.fillText(label, cx, cy + r + 40);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const test = new File([new Uint8Array([1])], "t.png", { type: "image/png" });
    return navigator.canShare({ files: [test] });
  } catch {
    return false;
  }
}

function wireShare() {
  const shareText = buildShareText();
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  els.shareRow.style.display = "flex";
  drawShareCard();
  if (canShareFiles()) els.shareNative.style.display = "inline-block";

  els.shareDownload.onclick = () => {
    els.canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "blubberized.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  };

  els.shareNative.onclick = () => {
    drawShareCard();
    els.canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "blubberized.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: shareText, title: "blubberize" });
      } catch {}
    }, "image/png");
  };
}

// Writes the receipt to the signed-in user's own PDS — this is the "real"
// part: a permanent, signed record instead of state that vanishes on reload.
// It has no effect on the target's actual ability to post; that stays a bit.
async function writeFissionRecord(sess, target, half, yourFollowers) {
  const record = {
    $type: FISSION_COLLECTION,
    target: target.did,
    targetHandle: target.handle,
    blubber: Math.round(half),
    yourFollowers: Math.round(yourFollowers),
    createdAt: new Date().toISOString(),
  };
  const res = await dpopFetch(sess, `${sess.pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: sess.did, collection: FISSION_COLLECTION, record }),
  });
  const written = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(written.message || "your PDS rejected that record");
  return written;
}

function doFission() {
  if (!state || state.fissioned) return;
  const { you, target } = state;
  const half = you.followersCount / 2;
  state.youDisplay = you.followersCount - half;
  state.targetDisplay = target.followersCount + half;

  const bolt = els.fissionBolt;
  const arenaRect = els.arena.getBoundingClientRect();
  const youRect = els.youSeal.getBoundingClientRect();
  const targetRect = els.targetSeal.getBoundingClientRect();
  const x1 = youRect.left + youRect.width / 2 - arenaRect.left;
  const x2 = targetRect.left + targetRect.width / 2 - arenaRect.left;
  bolt.style.left = Math.min(x1, x2) + "px";
  bolt.style.width = Math.abs(x2 - x1) + "px";
  bolt.classList.remove("go");
  void bolt.offsetWidth; // restart animation
  bolt.classList.add("go");

  els.fissionBtn.disabled = true;
  els.fissionBtn.textContent = "fissioning…";

  // Only the signed-in identity's own fission can become a real record — a
  // permanent claim about who did it has to come from them, not whoever
  // happens to have typed their handle into the "you" box.
  const canBeReal = !!session && session.did === you.did;

  setTimeout(async () => {
    state.fissioned = true;
    renderPair();
    els.fissionBtn.textContent = "💥 fissioned";
    els.verdict.style.display = "block";
    const baseLine = `${short(you.handle)} projectiled ${fmt(Math.round(half))} blubber at ${short(target.handle)} — BLUBBERIZED, unable to post. (it's a bit; the account can still post fine.)`;

    if (canBeReal) {
      els.verdict.textContent = baseLine + " writing a real record to your PDS…";
      try {
        await writeFissionRecord(session, target, half, you.followersCount);
        els.verdict.textContent =
          baseLine + " ✅ real: a signed record now lives in your own PDS and in the live log below.";
      } catch (err) {
        els.verdict.textContent =
          baseLine + " (couldn't write the real record — " + (err.message || "try again") + ".)";
      }
    } else if (!session) {
      els.verdict.textContent = baseLine + ` sign in as ${short(you.handle)} to make this one a real, permanent record.`;
    } else {
      els.verdict.textContent =
        baseLine + ` (signed in as someone else — only ${short(you.handle)} can make this one real.)`;
    }
    wireShare();
  }, 650);
}

els.fissionBtn.addEventListener("click", doFission);

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const youRaw = els.youInput.value.trim();
  const targetRaw = els.targetInput.value.trim();
  if (!youRaw || !targetRaw) {
    setStatus("need both a handle for you and a target.", true);
    return;
  }
  els.genBtn.disabled = true;
  els.fissionBtn.disabled = false;
  els.fissionBtn.textContent = "💥 FISSION";
  els.verdict.style.display = "none";
  els.shareRow.style.display = "none";
  setStatus(`resolving @${youRaw.replace(/^@/, "")} and @${targetRaw.replace(/^@/, "")}…`);
  try {
    const [you, target] = await Promise.all([resolveProfile(youRaw), resolveProfile(targetRaw)]);
    const refMax = Math.max(you.followersCount, target.followersCount, 1);
    state = { you, target, refMax, fissioned: false, youDisplay: you.followersCount, targetDisplay: target.followersCount };
    renderPair();
    els.sYouFollowers.textContent = fmt(you.followersCount);
    els.sTargetFollowers.textContent = fmt(target.followersCount);
    els.sBlubber.textContent = fmt(Math.round(you.followersCount / 2));
    els.resultWrap.classList.add("show");
    setStatus("both seals surfaced. hit FISSION when ready.");
    els.resultWrap.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    setStatus(
      err && err.status === 400
        ? "couldn't find one of those handles. check the spelling?"
        : "couldn't load one of those — " + (err.message || "try again") + ".",
      true,
    );
  } finally {
    els.genBtn.disabled = false;
  }
});

// --- live fission log: every real net.bisks.blubberize.fission record on
// the network, backfilled + kept live via Jetstream. Purely a public receipt
// board — it doesn't feed back into the arena above. ---------------------

function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const fissionLog = new FissionLog({
  onUpdate(snapshot) {
    els.fissionLogStatus.textContent = snapshot.connected
      ? `${fmt(snapshot.count)} real fission${snapshot.count === 1 ? "" : "s"} logged · live`
      : `${fmt(snapshot.count)} real fission${snapshot.count === 1 ? "" : "s"} logged · reconnecting…`;
    if (!snapshot.fissions.length) {
      els.fissionLogList.innerHTML = `<div class="fission-log-empty">${
        snapshot.backfillDone ? "nobody's made it real yet — sign in and be the first." : "scanning the network for signed fission records…"
      }</div>`;
      return;
    }
    els.fissionLogList.innerHTML = snapshot.fissions
      .map(
        (f) => `
      <div class="fission-log-row">
        <span class="fl-who"><b>${esc(short(f.handle))}</b> blubberized <b>${esc(short(f.targetHandle))}</b> (${fmt(f.blubber)} blubber)</span>
        <span class="fl-when">${esc(timeAgo(f.createdAt))}</span>
      </div>`,
      )
      .join("");
  },
});
fissionLog.start();

(async () => {
  // Await first: completeLoginIfCallback() rewrites location back to
  // whatever page (a ?you=&target= or /s/... link) the user signed in from,
  // so the you/target URL parsing below has to run after that, not before.
  await initSession();

  const params = new URLSearchParams(location.search);
  const pathMatch = location.pathname.match(/^\/s\/([^/]+)\/([^/]+)\/?$/);
  const initialYou = params.get("you") || (pathMatch && decodeURIComponent(pathMatch[1])) || "";
  const initialTarget = params.get("target") || (pathMatch && decodeURIComponent(pathMatch[2])) || "";
  if (initialYou && !session) els.youInput.value = initialYou;
  if (initialTarget) els.targetInput.value = initialTarget;
  if (els.youInput.value.trim() && els.targetInput.value.trim()) els.form.requestSubmit();
})();
