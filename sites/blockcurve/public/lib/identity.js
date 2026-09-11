// identity.js — handle -> DID resolution and basic profile lookup via the
// public Bluesky AppView (no auth, CORS *). Trimmed down from the copy of
// this file that other sites in this repo carry (see sites/xbill,
// sites/ngmi) — blockcurve only ever reads, so it drops the OAuth/PDS bits
// those need.

const API = "https://public.api.bsky.app/xrpc/";

export function cleanHandle(raw) {
  let h = decodeURIComponent(String(raw || "")).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

async function xrpc(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""));
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).message || "";
    } catch (_) {}
    throw new Error(`${method} failed (${res.status})${detail ? ": " + detail : ""}`);
  }
  return res.json();
}

export async function resolveHandle(rawHandle) {
  const handle = cleanHandle(rawHandle);
  if (!handle) throw new Error("enter a handle");
  const did = handle.startsWith("did:") ? handle : (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;
  let profile = null;
  try {
    profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
  } catch (_) {
    // profile lookup is cosmetic (avatar/displayName) — a resolved DID is
    // enough to keep going without it (e.g. a deactivated account).
  }
  return { did, handle: (profile && profile.handle) || handle, profile };
}

export async function getRecord(did, collection, rkey) {
  return xrpc("com.atproto.repo.getRecord", { repo: did, collection, rkey });
}
