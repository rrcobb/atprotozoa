import {
  escapeHtml,
  fetchJSON,
  fmtTimeAgo,
  statusStamp,
  avatarOrInitial,
  shareIntentUrl,
} from "./common.js";

const params = new URLSearchParams(location.search);
const subject = params.get("subject") || params.get("did") || params.get("handle") || "";

const els = {
  profile: document.getElementById("profile-body"),
  graphPanel: document.getElementById("graph-link-panel"),
  graphLink: document.getElementById("focused-graph-link"),
  incoming: document.getElementById("incoming-body"),
  outgoing: document.getElementById("outgoing-body"),
  share: document.getElementById("share-link"),
};

function relRow(r) {
  return `<tr>
    <td>${avatarOrInitial(r.handle, r.avatar)}<a class="handle" href="/account.html?subject=${encodeURIComponent(r.did)}">@${escapeHtml(r.handle)}</a></td>
    <td>${statusStamp(r.status)}</td>
    <td class="num">${r.likeCount}</td>
    <td class="num">${r.distinctDays}</td>
    <td>${r.reciprocal ? "↔ mutual" : "—"}</td>
    <td class="num">${r.score.toFixed(1)}</td>
  </tr>`;
}

async function load() {
  if (!subject) {
    els.profile.innerHTML = `<p class="empty">no subject given. <a href="/">go file one</a>.</p>`;
    return;
  }
  try {
    const data = await fetchJSON(`/api/account?subject=${encodeURIComponent(subject)}`);
    const a = data.account;
    document.title = `@${a.handle} — likescore`;
    els.profile.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div>
          ${a.avatar ? `<img src="${escapeHtml(a.avatar)}" alt="" width="56" height="56" style="border-radius:50%;border:1px solid var(--border)">` : ""}
        </div>
        <div>
          <div style="font-size:19px;font-weight:700">@${escapeHtml(a.handle)}${a.displayName ? ` — ${escapeHtml(a.displayName)}` : ""}</div>
          <div class="hint">${escapeHtml(a.did)}</div>
          <div style="margin-top:8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            ${statusStamp(a.status)}
            <span class="stamp">rank #${a.rank ?? "—"}</span>
            <span class="stamp">PI ${a.score.toFixed(1)}</span>
            ${a.lastScanned ? `<span class="hint">scanned ${fmtTimeAgo(a.lastScanned)}</span>` : `<span class="hint">never scanned — provisional</span>`}
          </div>
        </div>
      </div>
      ${a.lastScanStatus === "partial" ? `<p class="hint" style="color:var(--warn)">last scan was partial: ${escapeHtml(a.lastScanNote || "some data was unavailable")}</p>` : ""}
      <form id="rescan-form" style="margin-top:12px;display:flex;gap:8px">
        <button type="submit" class="btn ghost">${a.status === "provisional" ? "scan this account" : "rescan"}</button>
      </form>
    `;
    document.getElementById("rescan-form").addEventListener("submit", (e) => {
      e.preventDefault();
      location.href = `/?scan=${encodeURIComponent(a.did)}`;
    });

    els.graphPanel.hidden = false;
    els.graphLink.href = `/graph.html?focus=${encodeURIComponent(a.did)}`;
    els.share.href = shareIntentUrl(
      `@${a.handle}'s likescore prestige index: ${a.score.toFixed(1)} (rank #${a.rank ?? "—"}) — a real recursive who-likes-whom score, not a follower count: https://likescore.bisks.net/account.html?subject=${encodeURIComponent(a.did)}`
    );

    els.incoming.innerHTML = data.likedBy.length
      ? data.likedBy.map(relRow).join("")
      : `<tr><td colspan="6" class="empty">no incoming likes recorded yet.</td></tr>`;
    els.outgoing.innerHTML = data.likes.length
      ? data.likes.map(relRow).join("")
      : `<tr><td colspan="6" class="empty">${a.status === "scanned" ? "no outgoing likes recorded." : "this subject hasn't been scanned itself — its outgoing likes are unknown."}</td></tr>`;
  } catch (err) {
    els.profile.innerHTML = `<p class="empty">couldn't load subject: ${escapeHtml(err.message)}. <a href="/?scan=${encodeURIComponent(subject)}">try scanning it</a>.</p>`;
  }
}

load();
