import { CONSTANTS, isValidCursor } from "./formulas.mjs";
const APPVIEW = "https://public.api.bsky.app";
export class AppViewError extends Error { constructor(message, status, retryable = false) { super(message); this.status = status; this.retryable = retryable; } }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(url) {
  let last;
  for (let attempt = 0; attempt <= CONSTANTS.MAX_RETRIES; attempt++) try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (r.status === 429 || r.status >= 500) { if (attempt === CONSTANTS.MAX_RETRIES) throw new AppViewError(`appview ${r.status}`, r.status, true); await sleep(CONSTANTS.RETRY_BASE_MS * 2 ** attempt); continue; }
    if (!r.ok) { let body = null; try { body = await r.json(); } catch {} throw new AppViewError(body?.message || `appview ${r.status}`, r.status); }
    return await r.json();
  } catch (err) { last = err; if (err instanceof AppViewError && !err.retryable) throw err; if (attempt < CONSTANTS.MAX_RETRIES) await sleep(CONSTANTS.RETRY_BASE_MS * 2 ** attempt); }
  throw last || new Error("AppView request failed");
}
export async function resolveHandle(handle) { return (await request(`${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`)).did; }
export async function getProfile(actor, fallbackHandle) { try { const d = await request(`${APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`); return { did: d.did, handle: d.handle, displayName: d.displayName, avatar: d.avatar, deactivated: false }; } catch (e) { if (/deactivat/i.test(e.message)) return { did: actor, handle: fallbackHandle || actor, deactivated: true }; throw e; } }
export async function getRecentPosts(did, onPage) { const posts = []; let cursor, page = 0; do { const q = new URLSearchParams({ actor: did, limit: String(CONSTANTS.POST_PAGE_LIMIT), filter: "posts_no_replies" }); if (cursor) q.set("cursor", cursor); const d = await request(`${APPVIEW}/xrpc/app.bsky.feed.getAuthorFeed?${q}`); for (const item of d.feed || []) { const p = item?.post; if (p?.uri && p?.cid) posts.push({ uri: p.uri, cid: p.cid, createdAt: p.record?.createdAt || p.indexedAt }); } page++; onPage?.(page, posts.length); cursor = isValidCursor(d.cursor) ? d.cursor : undefined; } while (cursor && page < CONSTANTS.MAX_POST_PAGES); return { posts, truncated: !!cursor }; }
export async function getLikers(uri, cid) { const likers = []; let cursor, page = 0; do { const q = new URLSearchParams({ uri, cid, limit: String(CONSTANTS.LIKES_PAGE_LIMIT) }); if (cursor) q.set("cursor", cursor); const d = await request(`${APPVIEW}/xrpc/app.bsky.feed.getLikes?${q}`); for (const l of d.likes || []) if (l?.actor?.did) likers.push({ did: l.actor.did, handle: l.actor.handle, displayName: l.actor.displayName, avatar: l.actor.avatar, createdAt: l.createdAt || l.indexedAt }); page++; cursor = isValidCursor(d.cursor) ? d.cursor : undefined; } while (cursor && page < CONSTANTS.MAX_LIKE_PAGES_PER_POST); return { likers, truncated: !!cursor }; }
export async function boundedMap(items, limit, worker, onResult) { const out = new Array(items.length); let next = 0, done = 0; async function run() { for (;;) { const i = next++; if (i >= items.length) return; const result = await worker(items[i], i); out[i] = result; onResult?.(result, items[i], i, ++done, items.length); } } await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run)); return out; }
