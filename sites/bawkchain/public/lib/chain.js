// Reads @topchicken.bsky.social's public post history (anonymous AppView,
// no auth) and turns every "New Top Chicken!" announcement into a block.
// TopChicken quotes the winning post in its embed, so the winner's DID,
// handle, avatar, and exact likeCount all come straight off that embedded
// record — no extra profile lookups needed.

const API = "https://public.api.bsky.app/xrpc/";
const BOT = "topchicken.bsky.social";
const GENESIS_HASH = "0".repeat(64);
const MAX_PAGES = 6; // safety cap; the bot's whole non-reply history fits in ~1 page today

async function xrpc(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

function parseWinnerPost(item) {
  const post = item.post;
  const rec = post.record || {};
  const embed = post.embed;
  if (!embed || embed.$type !== "app.bsky.embed.record#view") return null;
  const view = embed.record;
  if (!view || view.$type !== "app.bsky.embed.record#viewRecord") return null;
  const author = view.author;
  if (!author) return null;

  const m = /New Top Chicken!.*?got ([\d,]+) likes/is.exec(rec.text || "");
  const likeCount =
    typeof view.likeCount === "number"
      ? view.likeCount
      : m
      ? parseInt(m[1].replace(/,/g, ""), 10)
      : 0;

  return {
    announcedAt: rec.createdAt,
    announcePostUri: post.uri,
    winner: {
      did: author.did,
      handle: author.handle,
      displayName: author.displayName || author.handle,
      avatar: author.avatar || null,
    },
    likeCount,
    winningPostUri: view.uri,
    text: rec.text || "",
  };
}

// Pulls the bot's whole feed (paginated), extracts every winner post,
// oldest first (genesis of the chain first).
export async function fetchWinners({ onStep } = {}) {
  const out = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    onStep && onStep(`reading @${BOT}'s feed (page ${page + 1})…`);
    const params = { actor: BOT, limit: "100", filter: "posts_no_replies" };
    if (cursor) params.cursor = cursor;
    const data = await xrpc("app.bsky.feed.getAuthorFeed", params);
    for (const item of data.feed || []) {
      const w = parseWinnerPost(item);
      if (w) out.push(w);
    }
    cursor = data.cursor;
    if (!cursor || !data.feed || !data.feed.length) break;
  }
  out.reverse(); // feed comes back newest-first; the chain wants oldest-first
  return out;
}

async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Folds each winner into a block whose hash depends on the previous block's
// hash — a real (if entirely single-threaded, entirely deterministic, and
// entirely fake as a distributed ledger) hash chain. Re-running this against
// the same public data always reproduces the same chain, which is the whole
// bit: anyone can "sync a node" just by loading this page.
export async function buildChain(winners) {
  const blocks = [];
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    const payload = [
      i,
      prevHash,
      w.winner.did,
      w.winner.handle,
      w.likeCount,
      w.announcedAt,
      w.winningPostUri,
    ].join("|");
    const hash = await sha256Hex(payload);
    blocks.push({ index: i, prevHash, hash, payload, ...w });
    prevHash = hash;
  }
  return blocks;
}

export function verifyChain(blocks) {
  let prevHash = GENESIS_HASH;
  for (const b of blocks) {
    if (b.prevHash !== prevHash) return { ok: false, brokenAt: b.index };
    prevHash = b.hash;
  }
  return { ok: true, brokenAt: -1 };
}

export function short(hash, n = 10) {
  return hash.slice(0, n);
}
