import {
  escapeHtml,
  fetchJSON,
  fmtTimeAgo,
  statusStamp,
  readSSE,
  shareIntentUrl,
} from "./common.js";

const els = {
  form: document.getElementById("scan-form"),
  input: document.getElementById("subject-input"),
  btn: document.getElementById("scan-btn"),
  hint: document.getElementById("scan-hint"),
  log: document.getElementById("progress-log"),
  stats: document.getElementById("stats-row"),
  board: document.getElementById("leaderboard-body"),
  mathBody: document.getElementById("math-body"),
  share: document.getElementById("share-link"),
};

function logStep(text, kind = "") {
  els.log.hidden = false;
  const row = document.createElement("div");
  row.className = "step" + (kind ? ` ${kind}` : "");
  const t = document.createElement("span");
  t.className = "t";
  t.textContent = new Date().toLocaleTimeString([], { hour12: false });
  const msg = document.createElement("span");
  msg.textContent = text;
  row.append(t, msg);
  els.log.appendChild(row);
  els.log.scrollTop = els.log.scrollHeight;
}

function renderLeaderboard(accounts) {
  if (!accounts.length) {
    els.board.innerHTML = `<tr><td colspan="5" class="empty">no subjects scanned yet — file one above.</td></tr>`;
    return;
  }
  els.board.innerHTML = accounts
    .map((a, i) => {
      const rankClass = i < 3 ? "rank top" : "rank";
      return `<tr>
        <td class="${rankClass}">${a.rank ?? i + 1}</td>
        <td><a class="handle" href="/account.html?subject=${encodeURIComponent(a.did)}">@${escapeHtml(a.handle)}</a></td>
        <td>${statusStamp(a.status)}</td>
        <td class="num">${a.score.toFixed(1)}</td>
        <td class="num">${a.lastScanned ? fmtTimeAgo(a.lastScanned) : "—"}</td>
      </tr>`;
    })
    .join("");
}

async function loadLeaderboard() {
  try {
    const data = await fetchJSON("/api/leaderboard?limit=50");
    renderLeaderboard(data.accounts);
  } catch (err) {
    els.board.innerHTML = `<tr><td colspan="5" class="empty">couldn't load leaderboard: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function loadStats() {
  try {
    const s = await fetchJSON("/api/stats");
    els.stats.innerHTML = `
      <div class="stat"><div class="n">${s.accountsScanned}</div><div class="l">scanned</div></div>
      <div class="stat"><div class="n">${s.accountsProvisional}</div><div class="l">provisional</div></div>
      <div class="stat"><div class="n">${s.edges}</div><div class="l">edges</div></div>
      <div class="stat"><div class="n">${s.lastScanAt ? fmtTimeAgo(s.lastScanAt) : "—"}</div><div class="l">last scan</div></div>
    `;
    renderMath(s.constants);
  } catch {
    els.stats.innerHTML = "";
  }
}

function renderMath(c) {
  if (!c) {
    els.mathBody.textContent = "constants unavailable.";
    return;
  }
  els.mathBody.innerHTML = `
    <p>Every scanned account's outgoing "likes" become directed, weighted
    edges (liker → subject). Edge weight folds in streak and reciprocity:</p>
    <pre>weight(B→A) = likeCount(B→A)
           × (1 + min(distinctDays / ${c.STREAK_CAP_DAYS}, 1) × ${c.STREAK_BONUS_MAX})   // streak bonus, capped
           × (1 + ${c.RECIPROCITY_BONUS} if A also likes B else 0)     // reciprocity bonus</pre>
    <p>Prestige is standard PageRank power-iteration over that weighted
    graph, run over <em>every</em> account currently known — not just the
    one just scanned, which is why scanning one more account can move
    everyone's rank:</p>
    <pre>score(A) = (1-d) + d × [ Σ (weight(B→A)/outWeight(B)) × score(B)   for each B→A
                          + danglingMass / N ]                    // provisional nodes leak rank uniformly
                                                                    // (sum of all scores stays == N)
PI(A) = round(score(A) × 100, 1)     // "prestige index" — display form, mean ≈ 100</pre>
    <table class="const-table">
      <tr><td>damping (d)</td><td>${c.DAMPING}</td></tr>
      <tr><td>iterations (max)</td><td>${c.ITERATIONS}</td></tr>
      <tr><td>convergence epsilon</td><td>${c.EPSILON}</td></tr>
      <tr><td>streak cap</td><td>${c.STREAK_CAP_DAYS} distinct days</td></tr>
      <tr><td>streak bonus (max)</td><td>+${Math.round(c.STREAK_BONUS_MAX * 100)}%</td></tr>
      <tr><td>reciprocity bonus</td><td>+${Math.round(c.RECIPROCITY_BONUS * 100)}%</td></tr>
      <tr><td>posts scanned per account</td><td>up to ${c.POST_PAGE_LIMIT * c.MAX_POST_PAGES}</td></tr>
      <tr><td>likers read per post</td><td>up to ${c.LIKES_PAGE_LIMIT * c.MAX_LIKE_PAGES_PER_POST}</td></tr>
      <tr><td>fetch concurrency</td><td>${c.FETCH_CONCURRENCY} in flight</td></tr>
      <tr><td>rescan cooldown</td><td>${Math.round(c.RESCAN_COOLDOWN_MS / 60000)} min per subject</td></tr>
      <tr><td>anonymous rate limit</td><td>${c.IP_SCANS_PER_HOUR} scans/hour per visitor</td></tr>
    </table>
    <p class="explain">These are read live from the running engine (src/formulas.ts) —
    this panel can't drift from what the scan actually does.</p>
  `;
}

function subjectFromQuery() {
  const p = new URLSearchParams(location.search);
  return p.get("subject") || p.get("handle") || "";
}

async function runScan(subject, force = false) {
  els.btn.disabled = true;
  els.log.innerHTML = "";
  els.log.hidden = false;
  logStep(`filing scan request for ${subject}…`);
  try {
    const resp = await fetch("/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, force }),
    });
    if (!resp.ok || !resp.body) {
      logStep("scan request failed to start", "err");
      els.btn.disabled = false;
      return;
    }
    await readSSE(resp, (event, data) => {
      if (event === "stage") {
        switch (data.stage) {
          case "resolving_handle":
            logStep(`resolving handle "${data.subject}"…`);
            break;
          case "handle_resolved":
            logStep(`resolved → ${data.did}`);
            break;
          case "profile_loaded":
            logStep(
              `profile loaded: @${data.handle}${data.deactivated ? " (deactivated)" : ""}`
            );
            break;
          case "posts_loaded":
            logStep(
              data.final
                ? `posts loaded: ${data.count}${data.truncated ? " (capped)" : ""}`
                : `posts loaded: page ${data.page} (${data.count} so far)`
            );
            break;
          case "likes_read":
            logStep(`likes read: ${data.postsProcessed}/${data.postsTotal} posts, ${data.likesRead} likes`);
            break;
          case "likers_discovered":
            logStep(`likers discovered: ${data.count}${data.skippedPosts ? ` (${data.skippedPosts} posts skipped)` : ""}`);
            break;
          case "relationships_built":
            logStep(`relationships built: ${data.edges} edges written`);
            break;
          case "prestige_recomputed":
            logStep(`prestige recomputed: ${data.nodes} nodes, ${data.iterations} iterations${data.converged ? " (converged)" : ""}`);
            break;
        }
      } else if (event === "leaderboard") {
        renderLeaderboard(data.accounts);
      } else if (event === "cached") {
        logStep(
          `@${data.handle} was scanned ${fmtTimeAgo(data.lastScanned)} — rescan available in ${Math.ceil(data.retryAfterMs / 60000)}m`,
          "ok"
        );
      } else if (event === "error") {
        logStep(data.message, "err");
      } else if (event === "done") {
        logStep(
          `done: ${data.status}${data.postsScanned != null ? `, ${data.postsScanned} posts, ${data.likersDiscovered ?? 0} likers` : ""} (${(data.elapsedMs / 1000).toFixed(1)}s)`,
          "ok"
        );
        loadStats();
      }
    });
  } catch (err) {
    logStep(`stream error: ${err.message}`, "err");
  } finally {
    els.btn.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const subject = els.input.value.trim();
  if (!subject) return;
  els.share.href = shareIntentUrl(
    `checking @${subject}'s likescore prestige index — a real recursive who-likes-whom leaderboard, live: https://likescore.bisks.net/account.html?subject=${encodeURIComponent(subject)}`
  );
  runScan(subject);
});

// A provisional node's graph card links here with ?scan=<did> to trigger an
// immediate promote-by-scanning.
const autoScan = new URLSearchParams(location.search).get("scan");
if (autoScan) {
  els.input.value = autoScan;
  runScan(autoScan);
}

loadStats();
loadLeaderboard();
setInterval(loadLeaderboard, 15000);
setInterval(loadStats, 15000);
