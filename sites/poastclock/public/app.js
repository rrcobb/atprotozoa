// poastclock — @psingletary.com asked: fetch bsky.app's own
// app.bsky.graph.verification collection (one record per account it's ever
// blue-checked), find every real post matching "poaster's madness," chart
// the gap between an account's last qualifying post and its verification,
// then predict a handle's own verification date from that curve.
//
// bsky.app's verification repo IS the target-account list — every subject
// DID in it is an account bsky.app has verified, with the handle/displayName
// it had *at* verification time and the createdAt of the check itself. One
// com.atproto.sync.getRepo CAR download gets all ~7000+ of them in a single
// request (lib/car.js, copied from sites/followtide, itself following
// sites/activitygrid's reference implementation) — no paginated
// listRecords walk, per notes/40-new-site-playbook.md's bulk-read order.
//
// "poaster's madness" turns out to be a real, actively-posted phrase (not
// invented for this brief) — see lib/search.js for why the search sweep
// pages until the API itself runs dry rather than stopping early.

import { resolveDid, getProfile } from "./lib/identity.js";
import { fetchRepoRecords } from "./lib/car.js";
import { searchPhraseAll, searchPhraseByAuthor } from "./lib/search.js";
const attachHandleTypeahead = window.attachHandleTypeahead;

const VERIFIER_DID = "did:plc:z72i7hdynmk6r22z27h6tvur"; // bsky.app, the only account that issues app.bsky.graph.verification
const COLLECTION = "app.bsky.graph.verification";
const PHRASE = "poaster's madness";
const DAY_MS = 86_400_000;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

// bsky.app's own PDS, looked up fresh rather than hardcoded — the DID is
// fixed but service endpoints do move, and this is the one live network
// call standing between a hardcoded string and correctness.
async function resolveVerifierPds() {
  const doc = await jget(`https://plc.directory/${encodeURIComponent(VERIFIER_DID)}`);
  const svc = (doc.service || []).find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
  if (!svc || !svc.serviceEndpoint) throw new Error("couldn't find bsky.app's PDS");
  return svc.serviceEndpoint;
}

function fmtDays(ms) {
  const days = ms / DAY_MS;
  if (Math.abs(days) < 1) {
    const hours = ms / 3_600_000;
    return `${hours.toFixed(1)}h`;
  }
  if (Math.abs(days) < 60) return `${days.toFixed(1)}d`;
  return `${(days / 30.44).toFixed(1)}mo`;
}

function fmtDate(d) {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function median(nums) {
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---- els --------------------------------------------------------------------

const els = {
  globalStatus: document.getElementById("global-status"),
  globalStats: document.getElementById("global-stats"),
  chartCard: document.getElementById("chart-card"),
  chartSvg: document.getElementById("delta-chart"),
  caption: document.getElementById("caption"),
  afterList: document.getElementById("after-list"),
  form: document.getElementById("lookup-form"),
  input: document.getElementById("handle-input"),
  go: document.getElementById("go-btn"),
  predictStatus: document.getElementById("predict-status"),
  predictResult: document.getElementById("predict-result"),
  shareRow: document.getElementById("share-row"),
  shareBluesky: document.getElementById("share-bluesky"),
};

attachHandleTypeahead(els.input);

let dataset = null; // { verifiedMap, qualifying: [{did,handle,displayName,verifiedAt,lastPostAt,preDeltaMs}], afterOnly: [...], hitLimit, totalMatchingPosts, uniqueAuthors }
let userMarker = null; // { handle, days } — added to the chart once a prediction lands

// ---- global analysis ----------------------------------------------------

async function runGlobalAnalysis() {
  try {
    els.globalStatus.textContent = "downloading bsky.app's verification repo...";
    const pds = await resolveVerifierPds();
    const { records } = await fetchRepoRecords(pds, VERIFIER_DID, COLLECTION, (m) => (els.globalStatus.textContent = m));
    const verifiedMap = new Map();
    for (const r of records) {
      if (!r || r.$type !== COLLECTION || !r.subject || !r.createdAt) continue;
      const verifiedAt = new Date(r.createdAt);
      if (isNaN(verifiedAt.getTime())) continue;
      verifiedMap.set(r.subject, { handle: r.handle, displayName: r.displayName, verifiedAt });
    }
    if (!verifiedMap.size) throw new Error("no verification records found");

    els.globalStatus.textContent = `scanning bsky's search index for every "${PHRASE}" post...`;
    const { posts, hitLimit } = await searchPhraseAll(PHRASE, (p) => {
      els.globalStatus.textContent = `scanning for "${PHRASE}"... page ${p.page}, ${p.totalSoFar} matches so far`;
    });

    const byAuthor = new Map();
    for (const post of posts) {
      const did = post.author?.did;
      const createdAt = new Date(post.record?.createdAt);
      if (!did || isNaN(createdAt.getTime())) continue;
      if (!byAuthor.has(did)) byAuthor.set(did, []);
      byAuthor.get(did).push(createdAt);
    }

    const qualifying = [];
    const afterOnly = [];
    for (const [did, verInfo] of verifiedMap) {
      const times = byAuthor.get(did);
      if (!times) continue;
      const before = times.filter((t) => t <= verInfo.verifiedAt);
      if (before.length) {
        const lastPostAt = new Date(Math.max(...before.map((t) => t.getTime())));
        qualifying.push({
          did,
          handle: verInfo.handle,
          displayName: verInfo.displayName,
          verifiedAt: verInfo.verifiedAt,
          lastPostAt,
          preDeltaMs: verInfo.verifiedAt.getTime() - lastPostAt.getTime(),
        });
      } else {
        const firstAfter = new Date(Math.min(...times.map((t) => t.getTime())));
        afterOnly.push({ did, handle: verInfo.handle, verifiedAt: verInfo.verifiedAt, postAt: firstAfter });
      }
    }
    qualifying.sort((a, b) => a.preDeltaMs - b.preDeltaMs);

    dataset = {
      verifiedMap,
      qualifying,
      afterOnly,
      hitLimit,
      totalMatchingPosts: posts.length,
      uniqueAuthors: byAuthor.size,
    };

    els.globalStatus.textContent = "";
    renderGlobal();
  } catch (err) {
    console.error(err);
    els.globalStatus.textContent = "couldn't run the analysis: " + (err && err.message ? err.message : err);
  }
}

function renderGlobal() {
  const { verifiedMap, qualifying, afterOnly, hitLimit, totalMatchingPosts, uniqueAuthors } = dataset;

  els.globalStats.innerHTML = [
    `<span><b>${verifiedMap.size.toLocaleString()}</b> accounts bsky.app has ever verified</span>`,
    `<span><b>${totalMatchingPosts.toLocaleString()}</b> posts found matching "${PHRASE}" (${uniqueAuthors.toLocaleString()} accounts)</span>`,
    `<span><b>${qualifying.length}</b> of them are verified, with a matching post before the check</span>`,
  ].join("");

  renderChart();

  if (afterOnly.length) {
    els.afterList.innerHTML =
      `<h2>also spotted (after the fact)</h2><p class="hint">these accounts only posted about ${escapeHtml(PHRASE)} <em>after</em> getting verified — the theory doesn't get credit for these, but they're too on-the-nose to leave out.</p><ul>` +
      afterOnly
        .map(
          (a) =>
            `<li><a href="https://bsky.app/profile/${a.did}" target="_blank" rel="noopener">@${escapeHtml(a.handle)}</a> — posted it ${fmtDays(a.postAt - a.verifiedAt)} after verification</li>`,
        )
        .join("") +
      `</ul>`;
  }

  els.caption.innerHTML =
    `Every account in bsky.app's <code>app.bsky.graph.verification</code> repo is a "target account." Every post anywhere matching "${escapeHtml(PHRASE)}" was pulled from Bluesky's search index and kept if it's a literal match. ` +
    `For each verified account with at least one matching post <em>before</em> its check, the bar shows how long before — sorted fastest to slowest.` +
    (hitLimit ? ` The search sweep hit its page backstop before the index ran dry, so this undercounts the true total slightly.` : ` The search sweep ran until the index itself ran out of results, so this is the full history, not a sample.`);
}

// ---- chart ----------------------------------------------------------------

const CHART_MARGIN = { top: 16, right: 90, bottom: 8, left: 170 };
const ROW_H = 26;

function renderChart() {
  const svg = els.chartSvg;
  const rows = dataset.qualifying.map((q) => ({
    label: "@" + q.handle,
    days: q.preDeltaMs / DAY_MS,
    isUser: false,
  }));
  if (userMarker) rows.push({ label: userMarker.label, days: userMarker.days, isUser: true });
  rows.sort((a, b) => a.days - b.days);

  svg.innerHTML = "";
  if (!rows.length) {
    svg.setAttribute("viewBox", "0 0 800 80");
    svg.innerHTML = `<text x="400" y="40" text-anchor="middle" class="empty-note">no verified account has posted "${escapeHtml(PHRASE)}" before its check yet.</text>`;
    return;
  }

  const W = 800;
  const H = CHART_MARGIN.top + CHART_MARGIN.bottom + rows.length * ROW_H;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const maxDays = Math.max(1, ...rows.map((r) => r.days));
  const plotW = W - CHART_MARGIN.left - CHART_MARGIN.right;
  const xScale = (d) => CHART_MARGIN.left + (d / maxDays) * plotW;

  let svgContent = "";
  rows.forEach((r, i) => {
    const y = CHART_MARGIN.top + i * ROW_H;
    const barY = y + 5;
    const x2 = xScale(r.days);
    const barClass = r.isUser ? "bar bar-user" : "bar";
    svgContent += `<text x="${CHART_MARGIN.left - 10}" y="${y + ROW_H / 2 + 4}" text-anchor="end" class="row-label${r.isUser ? " row-label-user" : ""}">${escapeHtml(r.label)}</text>`;
    svgContent += `<rect x="${CHART_MARGIN.left}" y="${barY}" width="${Math.max(2, x2 - CHART_MARGIN.left)}" height="14" rx="3" class="${barClass}"/>`;
    svgContent += `<text x="${x2 + 8}" y="${y + ROW_H / 2 + 4}" class="row-value">${fmtDays(r.days * DAY_MS)}</text>`;
  });
  svg.innerHTML = svgContent;
}

// ---- predictor --------------------------------------------------------------

function shareUrlFor(handle) {
  return "https://poastclock.bisks.net/?h=" + encodeURIComponent(handle);
}

async function predict(rawHandle) {
  const handle = (rawHandle || "").trim();
  if (!handle) {
    els.predictStatus.textContent = "enter a handle first.";
    return;
  }
  if (!dataset) {
    els.predictStatus.textContent = "still running the global analysis — try again in a second.";
    return;
  }

  els.go.disabled = true;
  els.predictResult.innerHTML = "";
  els.shareRow.classList.remove("show");
  userMarker = null;
  els.predictStatus.textContent = "resolving " + handle + " ...";

  try {
    const did = await resolveDid(handle);
    const profile = await getProfile(did);
    const already = dataset.verifiedMap.get(did);

    if (already) {
      const q = dataset.qualifying.find((x) => x.did === did);
      els.predictStatus.textContent = "";
      if (q) {
        els.predictResult.innerHTML =
          `<p><b>@${escapeHtml(profile.handle)}</b> is already verified (${fmtDate(already.verifiedAt)}) — and had posted "${escapeHtml(PHRASE)}" ${fmtDays(q.preDeltaMs)} before it. lived it.</p>`;
      } else {
        els.predictResult.innerHTML = `<p><b>@${escapeHtml(profile.handle)}</b> is already verified (${fmtDate(already.verifiedAt)}) — without ever posting "${escapeHtml(PHRASE)}" first. proof the theory has holes.</p>`;
      }
      return;
    }

    els.predictStatus.textContent = `checking @${profile.handle}'s posts for "${PHRASE}"...`;
    const { posts } = await searchPhraseByAuthor(PHRASE, did);
    els.predictStatus.textContent = "";

    if (!posts.length) {
      els.predictResult.innerHTML =
        `<p>no matching post found for <b>@${escapeHtml(profile.handle)}</b> yet. post your own "${escapeHtml(PHRASE)}" first, then come back.</p>`;
      return;
    }

    const lastPostAt = new Date(posts[0].record.createdAt); // sort=latest, so posts[0] is the newest
    if (!dataset.qualifying.length) {
      els.predictResult.innerHTML =
        `<p><b>@${escapeHtml(profile.handle)}</b> posted "${escapeHtml(PHRASE)}" on ${fmtDate(lastPostAt)}, but no verified account has ever done the same before its own check — there's no curve to project from yet. call it an open question.</p>`;
      return;
    }

    const medianMs = median(dataset.qualifying.map((q) => q.preDeltaMs));
    const predicted = new Date(lastPostAt.getTime() + medianMs);
    const daysOut = (predicted.getTime() - Date.now()) / DAY_MS;

    els.predictResult.innerHTML =
      `<p><b>@${escapeHtml(profile.handle)}</b>'s last matching post was ${fmtDate(lastPostAt)}. Based on the median gap across ${dataset.qualifying.length} verified account${dataset.qualifying.length === 1 ? "" : "s"} (${fmtDays(medianMs)}), predicted verification: <b>${fmtDate(predicted)}</b>` +
      (daysOut > 0 ? ` (~${Math.round(daysOut)} days from now).</p>` : ` — which, math-wise, was a while ago. still waiting?</p>`);

    userMarker = { label: "@" + profile.handle + " (you)", days: (predicted.getTime() - lastPostAt.getTime()) / DAY_MS };
    renderChart();

    const shareText = `poastclock predicts @${profile.handle} gets verified around ${fmtDate(predicted)}, based on ${dataset.qualifying.length} accounts' own poaster's madness → blue check gap. ${shareUrlFor(handle)}`;
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
    els.shareRow.classList.add("show");
  } catch (err) {
    console.error(err);
    els.predictStatus.textContent = "couldn't check that handle: " + (err && err.message ? err.message : err);
  } finally {
    els.go.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  predict(els.input.value);
});

runGlobalAnalysis();

// auto-run a prediction from a shared ?h=handle link
const params = new URLSearchParams(location.search);
const initial = params.get("h");
if (initial) {
  els.input.value = initial;
  // predict() checks `dataset`, which the global analysis above is still
  // filling in — wait for it instead of racing the two.
  const waitAndPredict = () => {
    if (dataset) predict(initial);
    else setTimeout(waitAndPredict, 400);
  };
  waitAndPredict();
}
