// board.js — a single board's leaderboard, at /b/<did>/<rkey>. The did/rkey
// identify the net.bisks.tacocounter.board record (owned by whoever created
// it); the member roster comes from constellation.microcosm.blue, which
// indexes every net.bisks.tacocounter.membership record whose `.board`
// points at this board's at-uri (public/lib/constellation.js) — the same
// mechanism that keeps a board "private": nobody can enumerate members (or
// even find the board) without already knowing its at-uri, which is exactly
// what the shareable /b/<did>/<rkey> link encodes.

import { getSession, clearSession, completeLoginIfCallback, login, resolvePds, resolveHandleForDid } from "./lib/oauth.js";
import { joinBoard, BOARD_COLLECTION } from "./lib/records.js";
import { fetchBoardMembers } from "./lib/constellation.js";
import { fetchTacoTotal } from "./lib/tally.js";

const els = {
  sessionBar: document.getElementById("sessionBar"),
  boardName: document.getElementById("boardName"),
  boardErr: document.getElementById("boardErr"),
  joinRow: document.getElementById("joinRow"),
  joinBtn: document.getElementById("joinBtn"),
  joinHint: document.getElementById("joinHint"),
  scanStatus: document.getElementById("scanStatus"),
  standingsTable: document.getElementById("standingsTable"),
  standingsBody: document.getElementById("standingsBody"),
  emptyState: document.getElementById("emptyState"),
  shareRow: document.getElementById("shareRow"),
  shareLinkBox: document.getElementById("shareLinkBox"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  shareBlueskyBtn: document.getElementById("shareBlueskyBtn"),
};

let session = null;

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function setErr(msg) {
  els.boardErr.textContent = msg || "";
  els.boardErr.style.display = msg ? "block" : "none";
}

function renderSessionBar() {
  if (session) {
    els.sessionBar.innerHTML = `
      <span>signed in as <strong>@${esc(session.handle)}</strong></span>
      <button id="signOutBtn">sign out</button>
    `;
    document.getElementById("signOutBtn").onclick = async () => {
      await clearSession();
      session = null;
      renderSessionBar();
    };
  } else {
    els.sessionBar.innerHTML = `
      <input type="text" id="loginHandle" placeholder="your.bsky.social" style="width:150px" autocomplete="off" spellcheck="false" />
      <button id="signInBtn">sign in</button>
    `;
    document.getElementById("signInBtn").onclick = async () => {
      const h = document.getElementById("loginHandle").value.trim();
      if (!h) return;
      try {
        await login(h);
      } catch (err) {
        alert(`sign in failed: ${err.message}`);
      }
    };
  }
}

async function xrpcJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function fetchBoardRecord(did, rkey) {
  const pds = await resolvePds(did);
  if (!pds) return null;
  const params = new URLSearchParams({ repo: did, collection: BOARD_COLLECTION, rkey });
  const data = await xrpcJson(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
  return typeof data?.value?.name === "string" ? data.value : null;
}

(async function boot() {
  try {
    const cb = await completeLoginIfCallback();
    if (cb) session = cb;
  } catch (err) {
    console.warn("oauth callback failed", err);
  }
  if (!session) session = await getSession();
  renderSessionBar();

  const m = location.pathname.match(/^\/b\/([^/]+)\/([^/]+)\/?$/);
  if (!m) {
    els.boardName.textContent = "board not found";
    setErr("that doesn't look like a board link.");
    return;
  }
  const did = decodeURIComponent(m[1]);
  const rkey = decodeURIComponent(m[2]);
  const boardUri = `at://${did}/${BOARD_COLLECTION}/${rkey}`;
  const shareUrl = `https://tacocounter.bisks.net/b/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;

  let board;
  try {
    board = await fetchBoardRecord(did, rkey);
  } catch (err) {
    console.warn("fetchBoardRecord failed", err);
  }
  if (!board) {
    els.boardName.textContent = "board not found";
    setErr("couldn't load this board — the link may be wrong, or the owner's PDS is unreachable.");
    return;
  }
  els.boardName.textContent = board.name;
  document.title = `${board.name} — tacocounter`;

  els.shareRow.style.display = "flex";
  els.shareLinkBox.textContent = shareUrl;
  els.copyLinkBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      els.copyLinkBtn.textContent = "copied!";
      setTimeout(() => (els.copyLinkBtn.textContent = "copy link"), 1500);
    } catch {
      // clipboard permission denied — the link is still visible to select by hand
    }
  };
  const shareText = `racing to eat the most tacos on "${board.name}" — join me: ${shareUrl}`;
  els.shareBlueskyBtn.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;

  els.scanStatus.textContent = "finding members…";
  let links;
  try {
    links = await fetchBoardMembers(boardUri, (n) => {
      els.scanStatus.textContent = `finding members… ${n} found so far`;
    });
  } catch (err) {
    els.scanStatus.textContent = "";
    setErr(`couldn't load the member list from constellation.microcosm.blue: ${err.message}`);
    return;
  }

  const memberDids = Array.from(new Set(links.map((l) => l.did)));

  if (session) {
    const alreadyIn = memberDids.includes(session.did);
    if (!alreadyIn) {
      els.joinRow.style.display = "block";
      els.joinBtn.onclick = async () => {
        els.joinBtn.disabled = true;
        try {
          await joinBoard(session, boardUri);
          els.joinHint.textContent = "joined! refreshing…";
          setTimeout(() => location.reload(), 600);
        } catch (err) {
          els.joinHint.textContent = err.message || String(err);
          els.joinBtn.disabled = false;
        }
      };
    }
  } else {
    els.joinRow.style.display = "block";
    els.joinBtn.textContent = "sign in to join";
    els.joinBtn.onclick = () => {
      document.getElementById("loginHandle")?.focus();
    };
  }

  if (!memberDids.length) {
    els.scanStatus.textContent = "";
    els.emptyState.style.display = "block";
    els.emptyState.textContent = "nobody's joined this board yet — share the link above.";
    return;
  }

  els.scanStatus.textContent = `${memberDids.length} member${memberDids.length === 1 ? "" : "s"} — tallying totals…`;
  const rows = await Promise.all(
    memberDids.map(async (d) => {
      const [handle, tally] = await Promise.all([resolveHandleForDid(d), fetchTacoTotal(d)]);
      return { did: d, handle, total: tally.total };
    }),
  );
  rows.sort((a, b) => b.total - a.total);

  els.scanStatus.textContent = `${rows.length} member${rows.length === 1 ? "" : "s"}.`;
  els.standingsTable.style.display = "table";
  els.standingsBody.innerHTML = rows
    .map(
      (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><a href="https://bsky.app/profile/${esc(r.did)}" target="_blank" rel="noopener">@${esc(r.handle)}</a></td>
        <td>${r.total}</td>
      </tr>`,
    )
    .join("");
})();
