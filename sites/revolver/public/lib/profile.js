// profile.js — resolve a typed Bluesky handle to its public profile (did,
// handle, displayName, avatar). Reads Bluesky's PUBLIC AppView anonymously
// (public.api.bsky.app, CORS *, no auth). Trimmed from
// sites/dial-a-mutual/public/lib/moots.js's resolveDid (copy, don't
// abstract) — this site never logs anyone in, since it never posts on
// anyone's behalf; every handle here is self-asserted, just like typing
// someone's name into a search box.

const PUB = "https://public.api.bsky.app/xrpc";

export function cleanHandle(actor) {
  return (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

export async function getProfile(actor) {
  const handle = cleanHandle(actor);
  if (!handle) throw new Error("empty handle");
  const res = await fetch(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`);
  if (!res.ok) {
    const e = new Error(`couldn't find "${handle}"`);
    e.status = res.status;
    throw e;
  }
  const p = await res.json();
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName || p.handle,
    avatar: p.avatar || "",
  };
}
