// feeds.js — read-only Bluesky feed access for the signed-in user.
// Everything goes through the user's own PDS with an atproto-proxy header,
// which is how a DPoP session reaches app.bsky.* methods (same path the
// official app uses). Scope: getTimeline, getFeed (aud=*: the PDS audiences it to the feed generator), getPreferences (read only).
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
    items = (v2?.items || []).filter((i) => i.type === "feed" || i.type === "list");
  } catch { /* preferences unreadable: Following alone still works */ }
  if (!items.length) return out;
  const names = new Map();
  try {
    // getFeedGenerators is public; ask in batches of 25 (its documented max).
    const gens = items.filter((f) => f.type === "feed");
    for (let i = 0; i < gens.length; i += 25) {
      const qs = gens.slice(i, i + 25).map((f) => "feeds=" + encodeURIComponent(f.value)).join("&");
      const r = await fetch(`${PUBLIC_API}/xrpc/app.bsky.feed.getFeedGenerators?${qs}`);
      if (!r.ok) continue;
      for (const g of (await r.json()).feeds || []) names.set(g.uri, g.displayName);
    }
  } catch { /* fall through with raw names */ }
  await Promise.all(items.filter((f) => f.type === "list").map(async (f) => {
    try {
      const r = await fetch(`${PUBLIC_API}/xrpc/app.bsky.graph.getList?limit=1&list=${encodeURIComponent(f.value)}`);
      if (r.ok) names.set(f.value, "List: " + ((await r.json()).list?.name || ""));
    } catch { /* raw name */ }
  }));
  items.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  for (const f of items) out.push({ id: f.value, label: names.get(f.value) || f.value.split("/").pop(), pinned: !!f.pinned });
  return out;
}

// getFeed through the user's PDS, so personalized feeds know who is asking. The PDS
// refuses (403) when the session's grant doesn't cover the feed generator's audience;
// the public AppView serves the same feeds without a viewer, so fall back to it.
async function getFeed(session, params) {
  try {
    return await call(session, "app.bsky.feed.getFeed", params);
  } catch (e) {
    if (!/\(40[13]\)/.test(String(e.message))) throw e;
    const r = await fetch(`${PUBLIC_API}/xrpc/app.bsky.feed.getFeed?${new URLSearchParams(params)}`);
    if (!r.ok) throw new Error(`app.bsky.feed.getFeed failed (${r.status})`);
    return r.json();
  }
}

// One page of a feed. Returns { posts, cursor } — cursor is undefined at the end.
export async function fetchPage(session, feedId, cursor) {
  const params = { limit: String(PAGE) };
  if (cursor) params.cursor = cursor;
  let j;
  if (feedId === FOLLOWING) j = await call(session, "app.bsky.feed.getTimeline", params);
  else if (feedId.includes("/app.bsky.graph.list/")) {
    // lists aren't in the granted scope; the public AppView serves them without a viewer
    const r = await fetch(`${PUBLIC_API}/xrpc/app.bsky.feed.getListFeed?${new URLSearchParams({ ...params, list: feedId })}`);
    if (!r.ok) throw new Error(`app.bsky.feed.getListFeed failed (${r.status})`);
    j = await r.json();
  } else j = await getFeed(session, { ...params, feed: feedId });
  return { posts: (j.feed || []).map((it) => simplify(it)).filter(Boolean), cursor: j.cursor };
}

// Turn whatever a person pastes into a feed id: an at:// feed/list uri, or a
// bsky.app/profile/<handle|did>/feed/<rkey> (or /lists/<rkey>) link.
export async function parseFeedInput(text) {
  const t = text.trim();
  if (/^at:\/\/[^/]+\/app\.bsky\.(feed\.generator|graph\.list)\/[^/]+$/.test(t)) return t;
  const m = t.match(/profile\/([^/]+)\/(feed|lists)\/([^/?#]+)/);
  if (!m) throw new Error("paste a bsky.app feed link or an at:// feed uri");
  let did = m[1];
  if (!did.startsWith("did:")) {
    const r = await fetch(`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(did)}`);
    if (!r.ok) throw new Error("couldn't resolve @" + did);
    did = (await r.json()).did;
  }
  return `at://${did}/${m[2] === "feed" ? "app.bsky.feed.generator" : "app.bsky.graph.list"}/${m[3]}`;
}
