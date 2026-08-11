// posts.js — pull an account's whole post history. Tries the full-repo CAR
// scan first (every app.bsky.feed.post record, no page cap — what "analyzes
// all your posts" actually asked for), falls back to paginated
// app.bsky.feed.getAuthorFeed only if that fails (PDS blocks sync.getRepo,
// repo too big to parse in-tab, network hiccup). Copied wholesale from
// sites/llmstance's scanAccountViaCar/scanAccountViaFeed/scanAccount — same
// CAR reader (./car.js), same PDS-resolution trick, same fallback shape.

import { fetchRepoRecordsWithKeys } from "./car.js";

const API = "https://public.api.bsky.app/xrpc/";
const PLC_DIRECTORY = "https://plc.directory";
const MAX_POSTS_FEED = 500; // cap for the paginated-feed fallback only — the CAR path reads every post record, no cap
const MAX_PAGES = 5;

async function xrpc(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""));
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

// Resolves a DID's PDS service endpoint straight from its DID doc — no
// listRecords/getAuthorFeed pagination involved, just enough to know where
// to point com.atproto.sync.getRepo. Trimmed from sites/padmoot's
// lib/atproto.js (didDoc + resolvePds), same as sites/llmstance.
async function didDoc(did) {
  if (did.startsWith("did:plc:")) {
    const r = await fetch(PLC_DIRECTORY + "/" + did);
    return r.ok ? r.json() : null;
  }
  if (did.startsWith("did:web:")) {
    const domain = did.replace("did:web:", "").replace(/:/g, "/");
    const r = await fetch("https://" + domain + "/.well-known/did.json");
    return r.ok ? r.json() : null;
  }
  return null;
}

async function resolvePds(did) {
  const doc = await didDoc(did);
  const svc = ((doc && doc.service) || []).find(
    (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
  );
  return (svc && svc.serviceEndpoint) || null;
}

async function scanViaCar(did, handle, onProgress) {
  const pds = await resolvePds(did);
  if (!pds) throw new Error("couldn't find a PDS for this account");
  const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post", onProgress);
  const posts = [];
  for (const { uri, value } of records) {
    const text = value && value.text;
    if (typeof text !== "string" || !text.trim()) continue;
    const rkey = uri.split("/").pop();
    posts.push({
      text: text.trim(),
      permalink: `https://bsky.app/profile/${handle}/post/${rkey}`,
      createdAt: value.createdAt || "",
    });
  }
  return posts;
}

async function scanViaFeed(did, handle, onProgress) {
  let cursor;
  const posts = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = { actor: did, limit: "100", filter: "posts_with_replies" };
    if (cursor) params.cursor = cursor;
    const feed = await xrpc("app.bsky.feed.getAuthorFeed", params);
    const items = (feed.feed || []).filter((f) => !f.reason);
    for (const f of items) {
      const text = f.post && f.post.record && f.post.record.text;
      if (typeof text !== "string" || !text.trim()) continue;
      const rkey = (f.post.uri || "").split("/").pop();
      posts.push({
        text: text.trim(),
        permalink: `https://bsky.app/profile/${handle}/post/${rkey}`,
        createdAt: f.post.record.createdAt || f.post.indexedAt || "",
      });
    }
    if (onProgress) onProgress(`scanning via feed API (no full-repo access)... (${posts.length} so far, page ${page + 1})`);
    cursor = feed.cursor;
    if (!cursor || items.length === 0 || posts.length >= MAX_POSTS_FEED) break;
  }
  return posts.slice(0, MAX_POSTS_FEED);
}

// Tries the full-repo CAR scan first (every post, no cap); falls back to the
// paginated feed API only if that fails. `method` tells the caller which one
// actually ran, so the UI can be honest about whether this was exhaustive.
export async function scanAllPosts(did, handle, onProgress) {
  try {
    const posts = await scanViaCar(did, handle, onProgress);
    return { posts, method: "car" };
  } catch (err) {
    if (onProgress) onProgress(`full repo scan failed (${err.message}) — falling back to the feed API...`);
    const posts = await scanViaFeed(did, handle, onProgress);
    return { posts, method: "feed" };
  }
}
