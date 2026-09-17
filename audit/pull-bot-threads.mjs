// Pull every notification for @buildthis.bisks.net plus the full thread each one
// sits in, for auditing what users run into. Usage (from the repo root):
//   node audit/pull-bot-threads.mjs [out-dir]
// Reads the bot app-password from 1Password (op read) at runtime; nothing secret
// is written. Output: notifications.json, threads.json, threads.txt, unanswered.txt.
// See notes/history/2026-09-buildthis-issue-themes.md for a read of the output.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = (process.argv[2] || "audit/raw/bot-threads") + "/";
mkdirSync(OUT, { recursive: true });

const identifier = execFileSync("op", ["read", "op://Personal/Bluesky/username"]).toString().trim();
const password = execFileSync("op", ["read", "op://Personal/Bluesky/add more/cf worker app password"]).toString().trim();

const PDS = "https://bsky.social";
async function xrpc(method, params, { auth, body } = {}) {
  const url = new URL(`${PDS}/xrpc/${method}`);
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}: ${await res.text()}`);
  return res.json();
}

const session = await xrpc("com.atproto.server.createSession", {}, { body: { identifier, password } });
const jwt = session.accessJwt;
console.log(`logged in as ${session.handle} (${session.did})`);

// 1. all notifications
const notifs = [];
let cursor;
for (let page = 0; page < 200; page++) {
  const r = await xrpc("app.bsky.notification.listNotifications", { limit: 100, cursor }, { auth: jwt });
  notifs.push(...r.notifications);
  console.log(`notifications page ${page + 1}: total ${notifs.length}`);
  cursor = r.cursor;
  if (!cursor || r.notifications.length === 0) break;
}
writeFileSync(OUT + "notifications.json", JSON.stringify(notifs, null, 2));

// 2. thread for each distinct root
const rootOf = (n) => n.record?.reply?.root?.uri || n.reasonSubject || n.uri;
const roots = new Set();
for (const n of notifs) if (["mention", "reply", "quote"].includes(n.reason)) roots.add(rootOf(n));
console.log(`distinct thread roots: ${roots.size}`);

function flatten(node, depth = 0, out = []) {
  if (!node || !node.post) return out;
  const p = node.post;
  out.push({
    depth,
    uri: p.uri,
    author: p.author.handle,
    createdAt: p.record?.createdAt,
    text: p.record?.text,
    embed: p.embed?.$type,
    likes: p.likeCount,
    replies: p.replyCount,
  });
  for (const r of node.replies || []) flatten(r, depth + 1, out);
  return out;
}

const threads = [];
let i = 0;
for (const uri of roots) {
  i++;
  try {
    const t = await xrpc("app.bsky.feed.getPostThread", { uri, depth: 50, parentHeight: 50 }, { auth: jwt });
    // walk up to true root
    let top = t.thread;
    while (top.parent && top.parent.post) top = top.parent;
    threads.push({ root: uri, posts: flatten(top) });
  } catch (e) {
    threads.push({ root: uri, error: String(e.message).slice(0, 200) });
  }
  if (i % 10 === 0) console.log(`threads ${i}/${roots.size}`);
}
writeFileSync(OUT + "threads.json", JSON.stringify(threads, null, 2));

// 3. flat text dump, newest thread first
const lines = [];
threads.sort((a, b) => {
  const ta = a.posts?.[0]?.createdAt || "", tb = b.posts?.[0]?.createdAt || "";
  return tb.localeCompare(ta);
});
for (const t of threads) {
  lines.push(`\n=== THREAD ${t.root} ===`);
  if (t.error) { lines.push(`  (error: ${t.error})`); continue; }
  for (const p of t.posts) {
    lines.push(`${"  ".repeat(p.depth)}[${(p.createdAt || "").slice(0, 16)}] @${p.author}: ${(p.text || "").replace(/\n/g, " ")}${p.embed ? ` {${p.embed}}` : ""}`);
  }
}
writeFileSync(OUT + "threads.txt", lines.join("\n"));
console.log(`wrote ${threads.length} threads, ${lines.length} lines`);

// 4. tags with no bot reply beneath them. A post can be captured under two roots
// (a reply-notification's reasonSubject and the real root), so dedupe by uri and
// count a tag answered if any copy has a bot descendant.
const BOT_HANDLE = session.handle;
const answered = new Map();
const meta = new Map();
for (const t of threads) {
  const posts = t.posts || [];
  posts.forEach((p, i) => {
    if (p.author === BOT_HANDLE || !(p.text || "").includes("@" + BOT_HANDLE)) return;
    let ok = false;
    for (const q of posts.slice(i + 1)) {
      if (q.depth <= p.depth) break;
      if (q.author === BOT_HANDLE) { ok = true; break; }
    }
    answered.set(p.uri, (answered.get(p.uri) || false) || ok);
    if (!meta.has(p.uri)) meta.set(p.uri, p);
  });
}
const unanswered = [...answered].filter(([, ok]) => !ok).map(([u]) => meta.get(u))
  .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
writeFileSync(OUT + "unanswered.txt", unanswered.map((p) =>
  `[${(p.createdAt || "").slice(0, 16)}] @${p.author} ${p.uri}\n   ${(p.text || "").slice(0, 200)}`).join("\n"));
console.log(`distinct tags ${answered.size}, unanswered ${unanswered.length}`);
