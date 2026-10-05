// Pull every thread @buildthis.bisks.net has been involved in, for auditing what
// users run into. Usage (from the repo root):
//   node audit/pull-bot-threads.mjs [out-dir]
// Public data only, no login: thread roots come from the bot's own author feed
// (every thread it replied in) plus the mentions in buildthis.bisks.net/logs.json
// (the last 30 days, which also covers tags the bot never answered). Output:
// threads.json, threads.txt, unanswered.txt.
// See notes/history/2026-09-buildthis-issue-themes.md for a read of the output.
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = (process.argv[2] || "audit/raw/bot-threads") + "/";
mkdirSync(OUT, { recursive: true });

const APPVIEW = "https://public.api.bsky.app";
const BOT = "buildthis.bisks.net";
async function xrpc(method, params) {
  const url = new URL(`${APPVIEW}/xrpc/${method}`);
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined) url.searchParams.set(k, v);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    throw new Error(`${method} ${res.status}: ${await res.text()}`);
  }
}

// 1. every post the bot has made; each one's thread root is a thread it was in
const roots = new Set();
let cursor;
let botPosts = 0;
for (let page = 0; ; page++) {
  const r = await xrpc("app.bsky.feed.getAuthorFeed", { actor: BOT, limit: 100, cursor, filter: "posts_with_replies" });
  for (const item of r.feed) {
    if (item.post.author.handle !== BOT) continue; // reposts
    botPosts++;
    roots.add(item.post.record?.reply?.root?.uri || item.post.uri);
  }
  if ((page + 1) % 5 === 0) console.log(`author feed page ${page + 1}: ${botPosts} bot posts, ${roots.size} roots`);
  cursor = r.cursor;
  if (!cursor || r.feed.length === 0) break;
}
console.log(`author feed done: ${botPosts} bot posts, ${roots.size} roots`);

// 2. mentions from the event log, including ones the bot never replied to. These
// are the tagging posts, not roots; getPostThread walks up from them below.
let offset = 0;
let logged = 0;
for (;;) {
  const res = await fetch(`https://${BOT}/logs.json?limit=500&offset=${offset}`);
  const body = await res.json();
  for (const e of body.events || []) if (e.mentionUri) { roots.add(e.mentionUri); logged++; }
  offset += (body.events || []).length;
  if (!body.events?.length || offset >= body.total) break;
}
console.log(`event log: ${logged} mentions; ${roots.size} uris to fetch`);

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
const seenRoots = new Set();
let i = 0;
for (const uri of roots) {
  i++;
  try {
    let t = await xrpc("app.bsky.feed.getPostThread", { uri, depth: 50, parentHeight: 80 });
    // Walk up to the true root. Parents in a thread view carry no siblings, so
    // when the uri isn't the root, refetch from the root to get the whole tree.
    let top = t.thread;
    while (top.parent && top.parent.post) top = top.parent;
    const rootUri = top.post?.uri || uri;
    if (!seenRoots.has(rootUri)) {
      seenRoots.add(rootUri);
      if (rootUri !== uri) top = (await xrpc("app.bsky.feed.getPostThread", { uri: rootUri, depth: 50, parentHeight: 0 })).thread;
      threads.push({ root: rootUri, posts: flatten(top) });
    }
  } catch (e) {
    threads.push({ root: uri, error: String(e.message).slice(0, 200) });
  }
  if (i % 50 === 0) console.log(`threads ${i}/${roots.size} (${threads.length} distinct)`);
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
const BOT_HANDLE = BOT;
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
