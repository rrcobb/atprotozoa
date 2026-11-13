// reply diagrams: pull a handle's last-7-days replies, take the 10 most-replied-to
// accounts, and draw five SVG arrow diagrams. Every label comes from a record.
const API = "https://public.api.bsky.app/xrpc/";
const WEEK_MS = 7 * 24 * 3600 * 1000;
const W = 900, H = 640, R = 30;
const $ = (id) => document.getElementById(id);

async function xrpc(method, params) {
  const url = API + method + "?" + new URLSearchParams(params);
  const r = await fetch(url);
  if (!r.ok) throw new Error(method + " " + r.status);
  return r.json();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clip = (s, n) => { s = s.replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

function setStatus(msg, err) { const s = $("status"); s.textContent = msg; s.className = err ? "err" : ""; }

// Walk the author feed back to the 7-day cutoff. The window is the product
// decision (last week), so we page until the feed passes it, not a page count.
async function weekOfReplies(actor) {
  const cutoff = Date.now() - WEEK_MS;
  const replies = [];
  let cursor;
  for (;;) {
    const p = { actor: actor.did, filter: "posts_with_replies", limit: "100" };
    if (cursor) p.cursor = cursor;
    const page = await xrpc("app.bsky.feed.getAuthorFeed", p);
    let passed = false;
    for (const item of page.feed) {
      if (item.reason && item.reason.$type === "app.bsky.feed.defs#reasonPin") continue;
      const post = item.post;
      const when = Date.parse(item.reason ? item.reason.indexedAt : post.record.createdAt);
      if (when < cutoff) { passed = true; continue; }
      if (item.reason) continue; // a repost, not their own reply
      const rec = post.record;
      if (post.author.did !== actor.did || !rec.reply) continue;
      const parentDid = rec.reply.parent.uri.split("/")[2];
      if (parentDid === actor.did) continue;
      replies.push({ to: parentDid, at: Date.parse(rec.createdAt), text: rec.text || "" });
    }
    if (passed || !page.cursor || !page.feed.length) break;
    cursor = page.cursor;
  }
  return replies;
}

async function getProfiles(dids) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const url = API + "app.bsky.actor.getProfiles?" + dids.slice(i, i + 25).map((d) => "actors=" + encodeURIComponent(d)).join("&");
    const r = await fetch(url);
    if (!r.ok) throw new Error("getProfiles " + r.status);
    for (const p of (await r.json()).profiles) out.set(p.did, p);
  }
  return out;
}

// follows[a][b] = true when a follows b, among the cast. getRelationships takes
// up to 30 others per call; the cast is 11 so it is one call per node.
async function followEdges(dids) {
  const follows = {};
  await Promise.all(dids.map(async (a) => {
    follows[a] = {};
    const others = dids.filter((d) => d !== a);
    const url = API + "app.bsky.graph.getRelationships?actor=" + encodeURIComponent(a) + "&" + others.map((d) => "others=" + encodeURIComponent(d)).join("&");
    try {
      const r = await fetch(url);
      if (!r.ok) return;
      for (const rel of (await r.json()).relationships || []) {
        if (rel.following) follows[a][rel.did] = true;
        if (rel.followedBy) (follows[rel.did] ||= {})[a] = true;
      }
    } catch { /* edges stay empty for this node */ }
  }));
  return follows;
}

// ---- svg helpers
// ids are document-global and the five svgs share one page, so each diagram gets its own clip prefix
let diagramNo = 0, clipPre = "d0c";
const clipDefs = (nodes) => nodes.map((n, i) => `<clipPath id="${clipPre}${i}"><circle cx="${n.x}" cy="${n.y}" r="${R}"/></clipPath>`).join("");
const MARKERS = ["#7fd1ae", "#f2a65a", "#6aa7f5", "#c9a6ff", "#8d92a3"].map((c, i) =>
  `<marker id="m${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join("");
const COLORS = ["#7fd1ae", "#f2a65a", "#6aa7f5", "#c9a6ff", "#8d92a3"];

function arrow(a, b, { color = 0, width = 2, label = "", bend = 0, labelAt = 0.5 } = {}) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const pad = R + 4;
  const x1 = a.x + ux * pad + nx * bend, y1 = a.y + uy * pad + ny * bend;
  const x2 = b.x - ux * (pad + 5) + nx * bend, y2 = b.y - uy * (pad + 5) + ny * bend;
  const lx = x1 + (x2 - x1) * labelAt, ly = y1 + (y2 - y1) * labelAt;
  let s = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLORS[color]}" stroke-width="${width}" stroke-opacity=".85" marker-end="url(#m${color})"/>`;
  if (label) s += `<text x="${lx}" y="${ly - 5}" font-size="12" text-anchor="middle">${esc(label)}</text>`;
  return s;
}

function node(n, i, sub) {
  const initial = esc((n.p.displayName || n.p.handle || "?").trim().slice(0, 1).toUpperCase());
  const pic = n.p.avatar
    ? `<image href="${esc(n.p.avatar)}" x="${n.x - R}" y="${n.y - R}" width="${2 * R}" height="${2 * R}" clip-path="url(#${clipPre}${i})" preserveAspectRatio="xMidYMid slice"/>`
    : `<text x="${n.x}" y="${n.y + 6}" font-size="20" text-anchor="middle">${initial}</text>`;
  return `<circle cx="${n.x}" cy="${n.y}" r="${R}" fill="#262938" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>${pic}` +
    `<text x="${n.x}" y="${n.y + R + 15}" font-size="11" text-anchor="middle">${esc(clip(n.p.handle, 22))}</text>` +
    (sub ? `<text class="mute" x="${n.x}" y="${n.y + R + 28}" font-size="10" text-anchor="middle">${esc(sub)}</text>` : "");
}

const svg = (nodes, body, subs = []) => (clipPre = "d" + (++diagramNo) + "c", `<svg viewBox="0 0 ${W} ${H}" role="img"><defs>${MARKERS}${clipDefs(nodes)}</defs>${body}${nodes.map((n, i) => node(n, i, subs[i])).join("")}</svg>`);

function ring(n, cx = W / 2, cy = H / 2, rx = 330, ry = 235, start = -Math.PI / 2) {
  return Array.from({ length: n }, (_, i) => {
    const t = start + (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry };
  });
}

// ---- the five diagrams. cast[0] is the requester, cast[1..] the top repliees.
function d1Star(cast, stats, follows) {
  const pts = ring(cast.length - 1, W / 2, H / 2 - 10, 340, 230);
  const nodes = [{ ...cast[0], x: W / 2, y: H / 2 - 10 }, ...cast.slice(1).map((c, i) => ({ ...c, ...pts[i] }))];
  const max = Math.max(...cast.slice(1).map((c) => stats[c.p.did].count));
  const body = nodes.slice(1).map((n) => {
    const c = stats[n.p.did].count;
    return arrow(nodes[0], n, { color: 0, width: 1.5 + (c / max) * 7, label: `${c} repl${c === 1 ? "y" : "ies"}`, labelAt: 0.58 });
  }).join("");
  return svg(nodes, body, nodes.map((_, i) => i === 0 ? "the replier" : ""));
}

function d2Web(cast, stats, follows) {
  const pts = ring(cast.length, W / 2, H / 2, 335, 245);
  const nodes = cast.map((c, i) => ({ ...c, ...pts[i] }));
  let body = "", mutuals = 0, oneway = 0;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const ab = follows[a.p.did]?.[b.p.did], ba = follows[b.p.did]?.[a.p.did];
    if (ab && ba) { mutuals++; body += arrow(a, b, { color: 0, width: 2.5, label: "mutuals", labelAt: 0.5 }).replace("marker-end", "marker-start=\"url(#m0)\" marker-end"); }
    else if (ab) { oneway++; body += arrow(a, b, { color: 2, width: 1.2, bend: 0 }); }
    else if (ba) { oneway++; body += arrow(b, a, { color: 2, width: 1.2, bend: 0 }); }
  }
  body += `<text x="16" y="26" font-size="13" class="mute">green double-headed: mutual follow (${mutuals}) · blue: one-way follow (${oneway})</text>`;
  return svg(nodes, body);
}

function d3Receipts(cast, stats) {
  const rest = cast.slice(1);
  const nodes = [{ ...cast[0], x: 90, y: H / 2 }, ...rest.map((c, i) => ({ ...c, x: W - 90, y: 44 + i * ((H - 100) / Math.max(rest.length - 1, 1)) }))];
  const body = nodes.slice(1).map((n, i) => {
    const last = stats[n.p.did].latest;
    return arrow(nodes[0], n, { color: i % 2 ? 1 : 3, width: 1.4, label: "“" + clip(last.text, 46) + "”", labelAt: 0.52 });
  }).join("");
  return svg(nodes, body);
}

function d4Sides(cast, stats, follows) {
  const me = cast[0].p.did;
  const buckets = { mutual: [], out: [], inn: [], none: [] };
  for (const c of cast.slice(1)) {
    const f = follows[me]?.[c.p.did], b = follows[c.p.did]?.[me];
    buckets[f && b ? "mutual" : f ? "out" : b ? "inn" : "none"].push(c);
  }
  const cols = [["mutual", "follow each other", 0], ["out", "you follow, they don't", 1], ["inn", "they follow you, you don't", 2], ["none", "no follow either way", 4]];
  const nodes = [{ ...cast[0], x: W / 2, y: 70 }];
  let body = "";
  cols.forEach(([key, title, color], ci) => {
    const x = 110 + ci * 227;
    body += `<text x="${x}" y="190" font-size="12" class="mute" text-anchor="middle">${title}</text>`;
    buckets[key].forEach((c, i) => {
      const n = { ...c, x, y: 250 + i * 95 };
      nodes.push(n);
      const cnt = stats[c.p.did].count;
      body += arrow(nodes[0], n, { color, width: 1.5, label: `${cnt} repl${cnt === 1 ? "y" : "ies"}`, labelAt: 0.35 });
    });
  });
  return svg(nodes, body);
}

function d5Route(cast, stats) {
  const rest = cast.slice(1).slice().sort((a, b) => stats[a.p.did].latest.at - stats[b.p.did].latest.at);
  const t0 = stats[rest[0].p.did].latest.at, t1 = stats[rest[rest.length - 1].p.did].latest.at;
  const nodes = rest.map((c, i) => ({
    ...c, x: 70 + (i / Math.max(rest.length - 1, 1)) * (W - 140),
    y: H / 2 + Math.sin(i * 1.3) * 190,
  }));
  const gap = (ms) => ms < 3600e3 ? Math.max(1, Math.round(ms / 60e3)) + "m" : ms < 48 * 3600e3 ? Math.round(ms / 3600e3) + "h" : Math.round(ms / 86400e3) + "d";
  let body = "";
  for (let i = 0; i < nodes.length - 1; i++) {
    const g = stats[nodes[i + 1].p.did].latest.at - stats[nodes[i].p.did].latest.at;
    body += arrow(nodes[i], nodes[i + 1], { color: 1, width: 2, label: "then " + gap(g) + " later", labelAt: 0.5 });
  }
  body += `<text x="16" y="26" font-size="13" class="mute">order of your most recent reply to each, oldest to newest (${new Date(t0).toLocaleDateString()} → ${new Date(t1).toLocaleDateString()})</text>`;
  return svg(nodes, body);
}

const DIAGRAMS = [
  ["1 · the star", "arrow thickness is how many times they replied to each person.", d1Star],
  ["2 · the web", "every follow edge among the eleven accounts, from getRelationships.", d2Web],
  ["3 · the receipts", "each arrow carries the text of their latest reply to that person.", d3Receipts],
  ["4 · the sides", "who follows whom, sorted into columns; arrows labeled with reply counts.", d4Sides],
  ["5 · the route", "a walk through the week in the order of their latest replies.", d5Route],
];

async function run(raw) {
  const handle = raw.trim().replace(/^@+/, "");
  if (!handle) return;
  $("out").hidden = true; $("share").hidden = true;
  try {
    setStatus("looking up " + handle + "…");
    const me = await xrpc("app.bsky.actor.getProfile", { actor: handle });
    setStatus("reading the last 7 days of " + me.handle + "'s posts…");
    const replies = await weekOfReplies(me);
    if (!replies.length) { setStatus("no replies to other people in the last 7 days for " + me.handle + ".", true); return; }
    const stats = {};
    for (const r of replies) {
      const s = (stats[r.to] ||= { count: 0, latest: r });
      s.count++;
      if (r.at > s.latest.at) s.latest = r;
    }
    const top = Object.keys(stats).sort((a, b) => stats[b].count - stats[a].count || stats[b].latest.at - stats[a].latest.at).slice(0, 10);
    setStatus("fetching profiles and follow edges…");
    const profs = await getProfiles([me.did, ...top]);
    const cast = [me.did, ...top].filter((d) => profs.has(d)).map((d) => ({ p: profs.get(d) }));
    if (cast.length < 3) { setStatus("not enough replied-to accounts still resolve to draw with.", true); return; }
    const follows = await followEdges(cast.map((c) => c.p.did));
    diagramNo = 0;
    $("out").innerHTML = DIAGRAMS.map(([t, cap, fn]) => `<h2>${t}</h2><p class="cap">${cap}</p>${fn(cast, stats, follows)}`).join("");
    $("out").hidden = false;
    setStatus(`${replies.length} replies in the last 7 days, to ${Object.keys(stats).length} accounts; drew the top ${cast.length - 1}.`);
    const text = `my week of replies, as five arrow diagrams: https://reply-diagrams.bisks.net/`;
    $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
    $("share").hidden = false;
  } catch (e) {
    setStatus("couldn't draw that: " + e.message, true);
  }
}

$("form").addEventListener("submit", (e) => { e.preventDefault(); run($("handle").value); });
run($("handle").value);
