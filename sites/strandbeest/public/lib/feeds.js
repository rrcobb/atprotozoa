// feeds.js — read-only Bluesky feed access for the signed-in user.
// Everything goes through the user's own PDS with an atproto-proxy header,
// which is how a DPoP session reaches app.bsky.* methods (same path the
// official app uses). Scope: getTimeline, getFeed, getPreferences (read only).
import { dpopFetch } from "./oauth.js";
import { simplify } from "./post.js";

const APPVIEW_PROXY = "did:web:api.bsky.app#bsky_appview";
const PUBLIC_API = "https://public.api.bsky.app";
export const FOLLOWING = "timeline";
// 100 is the AppView's own maximum page size for these methods.
const PAGE = 100;

async function call(session, method, params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${session.pdsUrl.replace(/\/$/, "")}/xrpc/${method}${qs ? "?" + qs : ""}`;
  const res = await dpopFetch(session, url, { headers: { "atproto-proxy": APPVIEW_PROXY } });
  if (!res.ok) throw new Error(`${method} failed (${res.status})`);
  return res.json();
}

// The user's saved feeds, pinned ones first. "Following" is always offered.
export async function listFeeds(session) {
  const out = [{ id: FOLLOWING, label: "Following", pinned: true }];
  let items = [];
  try {
    const prefs = await call(session, "app.bsky.actor.getPreferences", {});
    const v2 = (prefs.preferences || []).find((p) => p.$type === "app.bsky.actor.defs#savedFeedsPrefV2");
    items = (v2?.items || []).filter((i) => i.type === "feed");
  } catch { /* preferences unreadable: Following alone still works */ }
  if (!items.length) return out;
  const names = new Map();
  try {
    // getFeedGenerators is public; ask in batches of 25 (its documented max).
    for (let i = 0; i < items.length; i += 25) {
      const qs = items.slice(i, i + 25).map((f) => "feeds=" + encodeURIComponent(f.value)).join("&");
      const r = await fetch(`${PUBLIC_API}/xrpc/app.bsky.feed.getFeedGenerators?${qs}`);
      if (!r.ok) continue;
      for (const g of (await r.json()).feeds || []) names.set(g.uri, g.displayName);
    }
  } catch { /* fall through with raw names */ }
  items.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  for (const f of items) out.push({ id: f.value, label: names.get(f.value) || f.value.split("/").pop(), pinned: !!f.pinned });
  return out;
}

// One page of a feed. Returns { posts, cursor } — cursor is undefined at the end.
export async function fetchPage(session, feedId, cursor) {
  const params = { limit: String(PAGE) };
  if (cursor) params.cursor = cursor;
  const j = feedId === FOLLOWING
    ? await call(session, "app.bsky.feed.getTimeline", params)
    : await call(session, "app.bsky.feed.getFeed", { ...params, feed: feedId });
  return { posts: (j.feed || []).map((it) => simplify(it)).filter(Boolean), cursor: j.cursor };
}
