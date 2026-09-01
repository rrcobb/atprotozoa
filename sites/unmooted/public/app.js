import { resolveDid, getProfile, profileOf, getFollows, getFollowers } from "./lib/graph.js";
import {
  loadSnapshot, saveSnapshot, loadHistory, appendHistory,
  loadWaves, appendWave, forgetHandle, forgetEverything,
} from "./lib/store.js";

const form = document.getElementById("form");
const input = document.getElementById("handle");
const msg = document.getElementById("msg");
const checkBtn = document.getElementById("checkBtn");
const result = document.getElementById("result");
const whoAvatar = document.getElementById("whoAvatar");
const whoName = document.getElementById("whoName");
const whoHandle = document.getElementById("whoHandle");
const statsEl = document.getElementById("stats");
const diffArea = document.getElementById("diffArea");
const histPanel = document.getElementById("histPanel");
const histBody = document.getElementById("histBody");
const forgetHandleBtn = document.getElementById("forgetHandle");
const wipeAllBtn = document.getElementById("wipeAll");
const tabRecent = document.getElementById("tabRecent");
const tabBiggest = document.getElementById("tabBiggest");
const waveList = document.getElementById("waveList");

let currentDid = null;
let waveSort = "recent";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function relTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function profileLink(p) {
  return `https://bsky.app/profile/${encodeURIComponent(p.handle || p.did)}`;
}

function prow(p) {
  const avatar = p.avatar
    ? `<img src="${esc(p.avatar)}" alt="" loading="lazy" />`
    : `<span style="width:26px;height:26px;border-radius:50%;background:var(--faint);display:inline-block;flex:0 0 auto"></span>`;
  const name = p.displayName && p.displayName !== p.handle ? `<span class="dn">${esc(p.displayName)}</span>` : "";
  const handle = p.handle ? `@${esc(p.handle)}` : p.did;
  return `<div class="prow">${avatar}<a href="${profileLink(p)}" target="_blank" rel="noopener">${handle}</a> ${name}</div>`;
}

function shareUrlFor(handle) {
  return "https://unmooted.bisks.net/?h=" + encodeURIComponent(handle);
}

function renderHistory(did) {
  const hist = loadHistory(did);
  if (!hist.length) { histPanel.style.display = "none"; return; }
  histPanel.style.display = "";
  histBody.innerHTML = hist.slice().reverse().map((h) => {
    const deltaCell = h.delta === null || h.delta === undefined
      ? `<td class="num">—</td>`
      : `<td class="num delta ${h.delta > 0 ? "up" : h.delta < 0 ? "down" : ""}">${h.delta > 0 ? "+" : ""}${h.delta}</td>`;
    const unmootCell = h.unmootedCount === null || h.unmootedCount === undefined
      ? `<td class="num">baseline</td>`
      : `<td class="num">${h.unmootedCount}</td>`;
    return `<tr><td>${esc(fmtDate(h.at))}</td><td class="num">${h.followerCount}</td>${deltaCell}${unmootCell}</tr>`;
  }).join("");
}

function renderWaves() {
  const waves = loadWaves();
  if (!waves.length) {
    waveList.innerHTML = `<div class="empty">nothing caught yet — check a handle twice (with time between) to catch a real unmooting.</div>`;
    return;
  }
  const sorted = waves.slice().sort((a, b) =>
    waveSort === "biggest" ? b.unmootedCount - a.unmootedCount : new Date(b.at) - new Date(a.at)
  );
  waveList.innerHTML = sorted.map((w) => {
    const avatar = w.avatar
      ? `<img src="${esc(w.avatar)}" alt="" loading="lazy" />`
      : `<span style="width:24px;height:24px;border-radius:50%;background:var(--faint);display:inline-block;flex:0 0 auto"></span>`;
    const people = (w.unmootedList || []).map(prow).join("");
    return `<div class="wave">
      <div class="head">
        ${avatar}
        <span>@${esc(w.handle)}</span>
        <span class="count">−${w.unmootedCount} moot${w.unmootedCount === 1 ? "" : "s"}</span>
        <span class="when">${esc(relTime(w.at))}</span>
      </div>
      <details>
        <summary>who left (since ${esc(fmtDate(w.since))})</summary>
        <div class="plist" style="margin-top:0.5rem">${people}</div>
      </details>
    </div>`;
  }).join("");
}

tabRecent.addEventListener("click", () => {
  waveSort = "recent";
  tabRecent.classList.add("active");
  tabBiggest.classList.remove("active");
  renderWaves();
});
tabBiggest.addEventListener("click", () => {
  waveSort = "biggest";
  tabBiggest.classList.add("active");
  tabRecent.classList.remove("active");
  renderWaves();
});

function renderDiff({ first, prevAt, lost, gained, unmooted, otherLost, degraded, handle }) {
  if (first) {
    diffArea.innerHTML = `<div class="panel">
      <h2>baseline saved</h2>
      <p class="sub">First time checking @${esc(handle)} from this browser — nothing to compare against yet.
        Check again later (an hour, a day, whenever) and unmooted will tell you exactly who left.</p>
    </div>`;
    return;
  }

  const shareText = unmooted.length
    ? `@${handle} got unmooted by ${unmooted.length} moot${unmooted.length === 1 ? "" : "s"} since I last checked, ${relTime(prevAt)}. ${shareUrlFor(handle)}`
    : `checked @${handle}'s moots again since ${relTime(prevAt)} — no unmootings this time. ${shareUrlFor(handle)}`;

  let html = "";
  if (unmooted.length) {
    html += `<div class="panel alarm">
      <h2 class="alarm-h">${unmooted.length} unmooting${unmooted.length === 1 ? "" : "s"} since ${esc(relTime(prevAt))}</h2>
      <p class="sub">these were mutuals last time you checked (${esc(fmtDate(prevAt))}) and have since stopped following @${esc(handle)}.</p>
      <div class="plist">${unmooted.map(prow).join("")}</div>
    </div>`;
  } else {
    html += `<div class="panel">
      <h2>no unmootings since ${esc(relTime(prevAt))}</h2>
      <p class="sub">nobody who was a moot on ${esc(fmtDate(prevAt))} has unfollowed @${esc(handle)} since. moots secure.</p>
    </div>`;
  }

  const otherBits = [];
  if (otherLost.length) otherBits.push(`<details class="moreinfo"><summary>${otherLost.length} other unfollow${otherLost.length === 1 ? "" : "s"} (not moots)</summary><div class="plist" style="margin-top:0.5rem">${otherLost.map(prow).join("")}</div></details>`);
  if (gained.length) otherBits.push(`<details class="moreinfo"><summary>${gained.length} new follower${gained.length === 1 ? "" : "s"} since last check</summary><div class="plist" style="margin-top:0.5rem">${gained.map(prow).join("")}</div></details>`);
  if (otherBits.length) html += `<div class="panel">${otherBits.join("")}</div>`;

  if (degraded) {
    html += `<p class="msg" style="color:var(--muted)">this account's follower list is big enough that your browser couldn't keep full profile info for everyone — future checks will still catch who left, just without a picture for some of them.</p>`;
  }

  html += `<div class="sharebar">
    <a class="bsky" href="https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener">share to Bluesky</a>
  </div>`;

  diffArea.innerHTML = html;
}

async function check(rawHandle) {
  checkBtn.disabled = true;
  msg.className = "msg";
  msg.textContent = "resolving @" + rawHandle.replace(/^@/, "") + "…";
  try {
    const did = await resolveDid(rawHandle);
    currentDid = did;

    msg.textContent = "loading profile…";
    let profile;
    try {
      profile = await getProfile(did);
    } catch {
      profile = { did, handle: rawHandle.replace(/^@/, ""), displayName: rawHandle.replace(/^@/, ""), avatar: "" };
    }

    msg.textContent = "finding who they follow…";
    const { items: follows } = await getFollows(did);
    msg.textContent = "finding who follows them back…";
    const { items: followersRaw, truncated } = await getFollowers(did);

    const followers = followersRaw.map(profileOf);
    const followDids = new Set(follows.map((f) => f.did));
    const moots = followers.filter((f) => followDids.has(f.did));

    const prev = loadSnapshot(did);

    if (profile.avatar) {
      whoAvatar.src = profile.avatar;
      whoAvatar.style.visibility = "visible";
    } else {
      whoAvatar.removeAttribute("src");
      whoAvatar.style.visibility = "hidden";
    }
    whoName.textContent = profile.displayName || profile.handle;
    whoHandle.textContent = "@" + profile.handle;
    statsEl.innerHTML =
      `<span><b>${followers.length}</b> followers</span>` +
      `<span><b>${follows.length}</b> follows</span>` +
      `<span><b>${moots.length}</b> moots</span>` +
      (truncated ? `<span>(follower list is huge — capped the crawl, numbers may be a floor)</span>` : "");

    const saveResult = saveSnapshot(did, {
      at: new Date().toISOString(),
      handle: profile.handle,
      followers,
      moots: moots.map((m) => m.did),
    });

    if (!prev) {
      appendHistory(did, { at: new Date().toISOString(), followerCount: followers.length, delta: null, unmootedCount: null });
      renderDiff({ first: true, handle: profile.handle });
    } else {
      const prevFollowerMap = new Map((prev.followers || []).map((p) => [p.did, p]));
      const currFollowerMap = new Map(followers.map((p) => [p.did, p]));
      const lost = [...prevFollowerMap.values()].filter((p) => !currFollowerMap.has(p.did));
      const gained = [...currFollowerMap.values()].filter((p) => !prevFollowerMap.has(p.did));
      const prevMootSet = new Set(prev.moots || []);
      const unmooted = lost.filter((p) => prevMootSet.has(p.did));
      const otherLost = lost.filter((p) => !prevMootSet.has(p.did));
      const now = new Date().toISOString();

      appendHistory(did, {
        at: now,
        followerCount: followers.length,
        delta: currFollowerMap.size - prevFollowerMap.size,
        unmootedCount: unmooted.length,
      });

      if (unmooted.length) {
        appendWave({
          did, handle: profile.handle, displayName: profile.displayName, avatar: profile.avatar,
          at: now, since: prev.at, unmootedCount: unmooted.length,
          unmootedList: unmooted.map((p) => ({ did: p.did, handle: p.handle, displayName: p.displayName, avatar: p.avatar })),
          followerCountBefore: prevFollowerMap.size, followerCountAfter: currFollowerMap.size,
        });
      }

      renderDiff({ first: false, prevAt: prev.at, lost, gained, unmooted, otherLost, handle: profile.handle, degraded: saveResult.degraded });
    }

    if (!saveResult.ok) {
      msg.className = "msg err";
      msg.textContent = "checked, but this browser's storage is full — this snapshot couldn't be saved, so the next check won't have anything to diff against.";
    } else {
      msg.className = "msg ok";
      msg.textContent = `checked @${profile.handle}.`;
    }

    result.classList.add("on");
    renderHistory(did);
    renderWaves();
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    msg.className = "msg err";
    msg.textContent = err && err.status === 400
      ? "couldn't find that handle — check the spelling?"
      : "couldn't load that one — " + (err.message || "try again") + ".";
  } finally {
    checkBtn.disabled = false;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const h = input.value.trim();
  if (!h) { input.focus(); return; }
  check(h);
});

forgetHandleBtn.addEventListener("click", () => {
  if (!currentDid) return;
  if (!confirm("forget this handle's saved snapshot and history? (won't touch the waves you've already caught)")) return;
  forgetHandle(currentDid);
  histPanel.style.display = "none";
  msg.className = "msg";
  msg.textContent = "forgot this handle's local history — next check starts a new baseline.";
});

wipeAllBtn.addEventListener("click", () => {
  if (!confirm("wipe every snapshot, history, and caught unmooting stored in this browser? this can't be undone.")) return;
  forgetEverything();
  result.classList.remove("on");
  renderWaves();
  msg.className = "msg";
  msg.textContent = "wiped all local unmooted data.";
});

renderWaves();

const initial = new URLSearchParams(location.search).get("h");
if (initial) {
  input.value = initial;
  check(initial);
}
