import { resolveHandle, getRecord, cleanHandle } from "./lib/identity.js";
import { fetchDirectBlocks, fetchListMemberships, fetchListSubscribers, fetchFollowers } from "./lib/constellation.js";
import { tidToMs } from "./lib/tid.js";

const $ = (id) => document.getElementById(id);
const els = {
  form: $("lookup-form"),
  input: $("handle-input"),
  btn: $("trace-btn"),
  includeLists: $("include-lists"),
  includeFollowers: $("include-followers"),
  status: $("status"),
  result: $("result"),
  stats: $("stats"),
  chartTitle: $("chart-title"),
  legend: $("legend"),
  svg: $("chart"),
  crosshair: $("crosshair-line"),
  tooltip: $("tooltip"),
  tableToggle: $("table-toggle"),
  tableWrap: $("table-wrap"),
  spike: $("spike"),
  shareRow: $("share-row"),
  shareBluesky: $("share-bluesky"),
  shareCardBtn: $("share-card-btn"),
  shareCanvas: $("share-canvas"),
};

const SVG_NS = "http://www.w3.org/2000/svg";
const MARGIN = { top: 16, right: 16, bottom: 28, left: 46 };
const VBW = 960, VBH = 420;
const DOM_ROW_CAP = 500; // real browser cost: rendering 5000+ table rows is what's actually slow, not the data itself

// ---------- secret handle-prefill (see notes/40-new-site-playbook.md, 2026-08-28 order) ----------
$("cee-anchor").addEventListener("click", () => {
  els.input.value = "@cee.wtf";
  els.input.dispatchEvent(new Event("input", { bubbles: true }));
  els.input.dispatchEvent(new Event("change", { bubbles: true }));
  els.input.focus();
});

// ---------- helpers ----------
function fmtNum(n) {
  return n.toLocaleString("en-US");
}
function fmtDate(ms) {
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function fmtMonth(ms) {
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short" });
}
function setStatus(text, isError) {
  els.status.textContent = text || "";
  els.status.classList.toggle("error", !!isError);
}
function niceStep(maxVal, ticks) {
  const rough = Math.max(maxVal, 1) / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step;
  if (norm < 1.5) step = 1 * mag;
  else if (norm < 3) step = 2 * mag;
  else if (norm < 7) step = 5 * mag;
  else step = 10 * mag;
  return Math.max(step, 1);
}

// ---------- cumulative series ----------
function buildSeries(events) {
  const sorted = events.slice().sort((a, b) => a.ts - b.ts);
  return { events: sorted, ts: sorted.map((e) => e.ts) };
}
function cumulativeAt(series, t) {
  let lo = 0, hi = series.ts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series.ts[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function nearestIndex(series, t) {
  const i = cumulativeAt(series, t);
  return Math.max(0, Math.min(series.ts.length - 1, i > 0 ? i - 1 : 0));
}

// ---------- chart rendering ----------
function xScaleFor(minTs, maxTs, marginRight) {
  const mr = marginRight ?? MARGIN.right;
  const span = Math.max(maxTs - minTs, 1);
  return (t) => MARGIN.left + ((t - minTs) / span) * (VBW - MARGIN.left - mr);
}
function yScaleFor(maxCount) {
  const top = MARGIN.top, bottom = VBH - MARGIN.bottom;
  return (c) => bottom - (c / Math.max(maxCount, 1)) * (bottom - top);
}
function stepPath(series, x, y, startTs, endTs) {
  let d = `M ${x(startTs).toFixed(1)} ${y(0).toFixed(1)}`;
  let count = 0;
  for (const t of series.ts) {
    const px = x(t).toFixed(1);
    d += ` L ${px} ${y(count).toFixed(1)}`;
    count++;
    d += ` L ${px} ${y(count).toFixed(1)}`;
  }
  d += ` L ${x(endTs).toFixed(1)} ${y(count).toFixed(1)}`;
  return d;
}

function el(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

let chartState = null;
const FOLLOWER_MARGIN_RIGHT = 44; // room for the follower axis's own number labels

function renderChart(direct, total, spike, followers) {
  const svg = els.svg;
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${VBW} ${VBH}`);

  const now = Date.now();
  const minTs = direct.ts[0] ?? now;
  const primary = total || direct;
  const maxCount = primary.ts.length;
  const marginRight = followers ? FOLLOWER_MARGIN_RIGHT : MARGIN.right;
  const x = xScaleFor(minTs, now, marginRight);
  const y = yScaleFor(maxCount);

  // gridlines + y labels (left axis: block counts)
  const step = niceStep(maxCount, 4);
  const g = el("g", {});
  for (let v = 0; v <= maxCount + step; v += step) {
    const yy = y(v).toFixed(1);
    g.appendChild(el("line", { class: "grid", x1: MARGIN.left, x2: VBW - marginRight, y1: yy, y2: yy }));
    const t = el("text", { class: "axis-text", x: 4, y: Number(yy) + 3 });
    t.textContent = fmtNum(v);
    g.appendChild(t);
  }
  // x labels: ~5 evenly spaced
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const t = minTs + ((now - minTs) * i) / ticks;
    const xx = x(t).toFixed(1);
    const label = el("text", { class: "axis-text", x: xx, y: VBH - 8, "text-anchor": i === 0 ? "start" : i === ticks ? "end" : "middle" });
    label.textContent = fmtMonth(t);
    g.appendChild(label);
  }
  svg.appendChild(g);

  // area under the back series (total if present, else direct)
  const backSeries = total || direct;
  const backClass = total ? "line-total" : "line-direct";
  const areaClass = total ? "area-total" : "area-direct";
  let areaD = stepPath(backSeries, x, y, minTs, now);
  areaD += ` L ${x(now).toFixed(1)} ${y(0).toFixed(1)} L ${x(minTs).toFixed(1)} ${y(0).toFixed(1)} Z`;
  svg.appendChild(el("path", { class: areaClass, d: areaD }));

  svg.appendChild(el("path", { class: backClass, d: stepPath(backSeries, x, y, minTs, now) }));
  if (total) {
    svg.appendChild(el("path", { class: "line-direct", d: stepPath(direct, x, y, minTs, now) }));
  }

  // end dots
  const endSeries = total ? [direct, total] : [direct];
  const endClasses = total ? ["line-direct", "line-total"] : ["line-direct"];
  endSeries.forEach((s, i) => {
    const cx = x(now).toFixed(1);
    const cy = y(s.ts.length).toFixed(1);
    const dot = el("circle", { class: `end-dot ${endClasses[i]}`, cx, cy, r: 4 });
    dot.style.fill = getComputedStyle(document.documentElement).getPropertyValue(
      endClasses[i] === "line-direct" ? "--series-1" : "--series-2",
    );
    svg.appendChild(dot);
  });

  // spike marker
  if (spike && total) {
    const cx = x(spike.itemTs).toFixed(1);
    const cAtSpike = cumulativeAt(total, spike.itemTs);
    const cy = y(cAtSpike).toFixed(1);
    svg.appendChild(el("circle", { class: "spike-marker", cx, cy, r: 5 }));
  }

  // follower growth overlay — own right-hand axis, own scale (usually a very
  // different magnitude than block counts, so it can't share the left one)
  let y2 = null;
  if (followers) {
    y2 = yScaleFor(followers.ts.length);
    let areaDF = stepPath(followers, x, y2, minTs, now);
    areaDF += ` L ${x(now).toFixed(1)} ${y2(0).toFixed(1)} L ${x(minTs).toFixed(1)} ${y2(0).toFixed(1)} Z`;
    svg.appendChild(el("path", { class: "area-followers", d: areaDF }));
    svg.appendChild(el("path", { class: "line-followers", d: stepPath(followers, x, y2, minTs, now) }));

    const cx = x(now).toFixed(1);
    const cy = y2(followers.ts.length).toFixed(1);
    const dot = el("circle", { class: "end-dot line-followers", cx, cy, r: 4 });
    dot.style.fill = getComputedStyle(document.documentElement).getPropertyValue("--series-3");
    svg.appendChild(dot);

    const stepF = niceStep(followers.ts.length, 4);
    for (let v = 0; v <= followers.ts.length + stepF; v += stepF) {
      const yy = y2(v).toFixed(1);
      const t = el("text", { class: "axis-text-right", x: VBW - 4, y: Number(yy) + 3, "text-anchor": "end" });
      t.textContent = fmtNum(v);
      svg.appendChild(t);
    }
  }

  chartState = { direct, total, followers, x, y, y2, minTs, maxTs: now };
  wireHover();
}

function wireHover() {
  const box = els.svg.parentElement;
  const onMove = (clientX) => {
    if (!chartState) return;
    const rect = els.svg.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const t = chartState.minTs + frac * (chartState.maxTs - chartState.minTs);
    const px = frac * rect.width;

    els.crosshair.hidden = false;
    els.crosshair.style.left = px + "px";

    const rows = [];
    const directCount = cumulativeAt(chartState.direct, t);
    rows.push({ label: "direct blocks", value: directCount, color: "--series-1" });
    if (chartState.total) {
      const totalCount = cumulativeAt(chartState.total, t);
      rows.push({ label: "incl. modlists", value: totalCount, color: "--series-2" });
    }
    if (chartState.followers) {
      const followerCount = cumulativeAt(chartState.followers, t);
      rows.push({ label: "followers", value: followerCount, color: "--series-3" });
    }

    els.tooltip.hidden = false;
    els.tooltip.innerHTML = "";
    const dateEl = document.createElement("div");
    dateEl.className = "t-date";
    dateEl.textContent = fmtDate(t);
    els.tooltip.appendChild(dateEl);
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "t-row";
      const key = document.createElement("span");
      key.className = "t-key";
      key.style.background = getComputedStyle(document.documentElement).getPropertyValue(r.color);
      const val = document.createElement("span");
      val.className = "t-val";
      val.textContent = fmtNum(r.value);
      const lbl = document.createElement("span");
      lbl.textContent = r.label;
      row.append(key, val, lbl);
      els.tooltip.appendChild(row);
    }
    const left = Math.max(40, Math.min(rect.width - 40, px));
    els.tooltip.style.left = left + "px";
    els.tooltip.style.top = "0px";
  };
  box.onmousemove = (e) => onMove(e.clientX);
  box.onmouseleave = () => {
    els.crosshair.hidden = true;
    els.tooltip.hidden = true;
  };
  box.ontouchmove = (e) => {
    if (e.touches[0]) onMove(e.touches[0].clientX);
  };
}

// ---------- table view ----------
function renderTable(events) {
  const sorted = events.slice().sort((a, b) => b.ts - a.ts);
  const shown = sorted.slice(0, DOM_ROW_CAP);
  const wrap = els.tableWrap;
  wrap.innerHTML = "";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>date</th><th>kind</th><th>who</th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const e of shown) {
    const tr = document.createElement("tr");
    const d = document.createElement("td");
    d.textContent = fmtDate(e.ts);
    const k = document.createElement("td");
    k.textContent = e.kind;
    const w = document.createElement("td");
    w.textContent = e.by;
    tr.append(d, k, w);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  if (sorted.length > DOM_ROW_CAP) {
    const note = document.createElement("p");
    note.style.cssText = "color:var(--text-muted);font-family:var(--font-sans);font-size:0.72rem;padding:6px 8px;";
    note.textContent = `showing the ${DOM_ROW_CAP} most recent of ${fmtNum(sorted.length)} total — rendering all of them as DOM rows would be the slow part, not fetching them`;
    wrap.appendChild(note);
  }
}
els.tableToggle.addEventListener("click", () => {
  const open = els.tableWrap.hidden;
  els.tableWrap.hidden = !open;
  els.tableToggle.setAttribute("aria-expanded", String(open));
  els.tableToggle.textContent = open ? "hide table" : "show as table";
});

// ---------- stats ----------
function statTile(label, value, sub) {
  const d = document.createElement("div");
  d.className = "stat-tile";
  const l = document.createElement("div");
  l.className = "label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "value";
  v.textContent = value;
  d.append(l, v);
  if (sub) {
    const s = document.createElement("div");
    s.className = "sub";
    s.textContent = sub;
    d.appendChild(s);
  }
  return d;
}

// ---------- main trace ----------
let lastTrace = null;

async function trace(rawHandle) {
  els.btn.disabled = true;
  els.result.hidden = true;
  els.spike.hidden = true;
  els.legend.hidden = true;
  els.tableWrap.hidden = true;
  els.tableToggle.setAttribute("aria-expanded", "false");
  els.tableToggle.textContent = "show as table";

  try {
    setStatus("resolving handle…");
    const { did, handle } = await resolveHandle(rawHandle);

    setStatus(`walking app.bsky.graph.block backlinks for @${handle}…`);
    const directLinks = await fetchDirectBlocks(did, (n, total) =>
      setStatus(`direct blocks found: ${fmtNum(n)}${total ? " / " + fmtNum(total) : ""}`),
    );
    const directEvents = directLinks
      .map((r) => ({ ts: tidToMs(r.rkey), by: r.did, kind: "direct block" }))
      .filter((e) => e.ts != null);
    const direct = buildSeries(directEvents);

    let total = null;
    let spike = null;
    let allEvents = directEvents;

    if (els.includeLists.checked) {
      setStatus("tracing modlists you've been added to…");
      const memberships = await fetchListMemberships(did, (n) => setStatus(`modlist adds found: ${fmtNum(n)}`));
      const byList = new Map();
      for (const m of memberships) {
        if (!m.otherSubject) continue;
        const itemTs = tidToMs(m.rkey);
        if (itemTs == null) continue;
        const existing = byList.get(m.otherSubject);
        if (!existing || itemTs < existing.itemTs) byList.set(m.otherSubject, { listUri: m.otherSubject, itemTs });
      }
      const lists = [...byList.values()];

      const listEvents = [];
      let bestSpike = null;
      if (lists.length) {
        let idx = 0, completed = 0;
        const workers = Array.from({ length: Math.min(6, lists.length) }, async () => {
          while (idx < lists.length) {
            const i = idx++;
            const list = lists[i];
            try {
              const subs = await fetchListSubscribers(list.listUri);
              let instantCount = 0;
              for (const s of subs) {
                const subTs = tidToMs(s.rkey);
                if (subTs == null) continue;
                const eventTs = Math.max(list.itemTs, subTs);
                listEvents.push({ ts: eventTs, by: s.did, kind: "modlist block" });
                if (subTs <= list.itemTs) instantCount++;
              }
              if (!bestSpike || instantCount > bestSpike.instantCount) {
                bestSpike = { ...list, instantCount };
              }
            } catch (_) {
              // one bad list shouldn't sink the whole trace
            }
            completed++;
            setStatus(`modlists traced: ${completed}/${lists.length}`);
          }
        });
        await Promise.all(workers);
      }

      allEvents = directEvents.concat(listEvents);
      total = buildSeries(allEvents);

      if (bestSpike && bestSpike.instantCount > 0) {
        spike = bestSpike;
        setStatus("naming the biggest modlist spike…");
        try {
          const m = spike.listUri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
          if (m) {
            const rec = await getRecord(m[1], "app.bsky.graph.list", m[2]);
            spike.name = rec?.value?.name || null;
          }
        } catch (_) {
          spike.name = null;
        }
      }
    }

    let followers = null;
    if (els.includeFollowers.checked) {
      setStatus(`tracing follower growth for @${handle}…`);
      const followerLinks = await fetchFollowers(did, (n, total2) =>
        setStatus(`followers found: ${fmtNum(n)}${total2 ? " / " + fmtNum(total2) : ""}`),
      );
      const followerEvents = followerLinks
        .map((r) => ({ ts: tidToMs(r.rkey), by: r.did, kind: "new follower" }))
        .filter((e) => e.ts != null);
      followers = buildSeries(followerEvents);
      allEvents = allEvents.concat(followerEvents);
    }

    setStatus("");
    renderResult({ handle, did, direct, total, allEvents, spike, followers });
    lastTrace = { handle, did, direct, total, allEvents, spike, followers };
  } catch (err) {
    setStatus("couldn't trace that: " + err.message, true);
  } finally {
    els.btn.disabled = false;
  }
}

function renderResult({ handle, direct, total, allEvents, spike, followers }) {
  els.result.hidden = false;
  els.stats.innerHTML = "";

  els.stats.appendChild(statTile("blocked by", fmtNum(direct.ts.length), `@${handle}`));
  if (direct.ts.length) {
    els.stats.appendChild(statTile("first seen block", fmtDate(direct.ts[0])));
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const recent = direct.ts.length - cumulativeAt(direct, thirtyDaysAgo);
    els.stats.appendChild(statTile("last 30 days", "+" + fmtNum(recent), "direct blocks"));
  }
  if (total) {
    els.stats.appendChild(statTile("incl. modlists", fmtNum(total.ts.length), "direct + list-block exposure"));
  }
  if (followers) {
    els.stats.appendChild(statTile("followers", fmtNum(followers.ts.length)));
    if (followers.ts.length) {
      const thirtyDaysAgo = Date.now() - 30 * 86400000;
      const recentF = followers.ts.length - cumulativeAt(followers, thirtyDaysAgo);
      els.stats.appendChild(statTile("last 30 days", "+" + fmtNum(recentF), "new followers"));
    }
  }

  const titleParts = [total ? "cumulative blocks received (direct + modlists)" : "cumulative blocks received"];
  if (followers) titleParts.push("follower growth");
  els.chartTitle.textContent = titleParts.join(" & ");

  els.legend.hidden = !(total || followers);
  if (total || followers) {
    els.legend.innerHTML = "";
    const mk = (color, label) => {
      const span = document.createElement("span");
      span.className = "key";
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = `var(${color})`;
      const lbl = document.createElement("span");
      lbl.textContent = label;
      span.append(sw, lbl);
      return span;
    };
    els.legend.append(mk("--series-1", "direct blocks"));
    if (total) els.legend.append(mk("--series-2", "incl. modlists"));
    if (followers) els.legend.append(mk("--series-3", "followers"));
  }

  renderChart(direct, total, spike, followers);
  renderTable(allEvents);

  if (spike && spike.instantCount > 0) {
    els.spike.hidden = false;
    els.spike.innerHTML = "";
    const name = spike.name ? `“${spike.name}”` : "a modlist";
    const p = document.createElement("p");
    p.innerHTML = ""; // build with textContent below to avoid innerHTML on untrusted list name
    const strong1 = document.createElement("strong");
    strong1.textContent = "+" + fmtNum(spike.instantCount) + " blocks";
    p.append("biggest single moment: ", strong1, ` on ${fmtDate(spike.itemTs)}, when @${handle} was added to `);
    const nameSpan = document.createElement("strong");
    nameSpan.textContent = name;
    p.append(nameSpan, ` — every account already subscribed to that list blocked instantly.`);
    els.spike.appendChild(p);
  }

  els.shareRow.hidden = false;
  const url = `https://blockcurve.bisks.net/s/${encodeURIComponent(handle)}`;
  const followerSuffix = followers ? ` vs. ${fmtNum(followers.ts.length)} followers` : "";
  const shareText = total
    ? `@${handle} has been blocked ${fmtNum(direct.ts.length)} times directly (${fmtNum(total.ts.length)} incl. modlists)${followerSuffix} — cumulative chart: ${url}`
    : `@${handle} has been blocked ${fmtNum(direct.ts.length)} times, going back to ${direct.ts.length ? fmtDate(direct.ts[0]) : "—"}${followerSuffix} — cumulative chart: ${url}`;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText.slice(0, 300));
}

els.shareCardBtn.addEventListener("click", async () => {
  if (!lastTrace) return;
  await buildShareCard(lastTrace);
  const canvas = els.shareCanvas;
  if (canShareFiles()) {
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "blockcurve.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], title: "blockcurve", text: `@${lastTrace.handle}'s block curve` });
        return;
      } catch (_) {
        // fall through to download
      }
      downloadCanvas(canvas, lastTrace.handle);
    });
  } else {
    downloadCanvas(canvas, lastTrace.handle);
  }
});

function downloadCanvas(canvas, handle) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `blockcurve-${(handle || "chart").replace(/[^a-z0-9.-]/gi, "_")}.png`;
    a.click();
  });
}
function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}

async function buildShareCard({ handle, direct, total, followers }) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "ui-monospace, monospace";

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#101013";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#3987e5";
  ctx.font = `800 44px ${mono}`;
  ctx.fillText("blockcurve", 60, 90);

  if (followers) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#39c97a";
    ctx.font = `700 26px ${mono}`;
    ctx.fillText(`${fmtNum(followers.ts.length)} followers`, W - 60, 90);
    ctx.textAlign = "left";
  }

  ctx.fillStyle = "#f3f3f1";
  ctx.font = `700 30px ${mono}`;
  ctx.fillText("@" + handle, 60, 140);

  const back = total || direct;
  ctx.fillStyle = "#d95926";
  ctx.font = `800 90px ${mono}`;
  ctx.fillText(fmtNum(back.ts.length), 60, 260);
  ctx.fillStyle = "#b9b8c4";
  ctx.font = `400 22px ${mono}`;
  ctx.fillText(total ? "blocks (direct + modlists)" : "direct blocks received", 60, 296);

  // sparkline
  const chartX = 60, chartY = 340, chartW = W - 120, chartH = 220;
  ctx.strokeStyle = "#2c2c33";
  ctx.lineWidth = 1;
  ctx.strokeRect(chartX, chartY, chartW, chartH);

  const drawSpark = (series, color) => {
    if (!series.ts.length) return;
    const minTs = direct.ts[0];
    const maxTs = Date.now();
    const span = Math.max(maxTs - minTs, 1);
    const maxCount = back.ts.length;
    ctx.beginPath();
    let count = 0;
    const px = (t) => chartX + ((t - minTs) / span) * chartW;
    const py = (c) => chartY + chartH - (c / Math.max(maxCount, 1)) * chartH;
    ctx.moveTo(px(minTs), py(0));
    for (const t of series.ts) {
      ctx.lineTo(px(t), py(count));
      count++;
      ctx.lineTo(px(t), py(count));
    }
    ctx.lineTo(px(maxTs), py(count));
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
  };
  if (total) drawSpark(total, "#d95926");
  drawSpark(direct, "#3987e5");

  ctx.fillStyle = "#7c7b87";
  ctx.font = `400 18px ${mono}`;
  ctx.fillText("blockcurve.bisks.net", 60, H - 40);
}

// ---------- boot ----------
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = els.input.value.trim();
  if (v) trace(v);
});

(function boot() {
  const m = location.pathname.match(/^\/s\/([^/]+)\/?$/);
  const prefill = m ? decodeURIComponent(m[1]) : new URLSearchParams(location.search).get("h");
  if (prefill) {
    els.input.value = cleanHandle(prefill);
    trace(prefill);
  }
})();
