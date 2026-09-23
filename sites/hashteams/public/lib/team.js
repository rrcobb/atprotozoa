// team.js — the whole methodology, given by @mfzx.net: UTF-8 encode a DID,
// SHA-256 it, take the first two bytes, read them as a big-endian uint16.
// That's the team number, 0-65535 (65536 possible teams). Pure function of
// the DID string; Web Crypto only, works unchanged under node --test (see
// tests/team.test.mjs) since crypto.subtle is a global in both runtimes.

export async function digestForDid(did) {
  const bytes = new TextEncoder().encode(did);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export function teamFromDigest(digest) {
  return (digest[0] << 8) | digest[1];
}

export async function teamForDid(did) {
  return teamFromDigest(await digestForDid(did));
}

// A stable, readable color for a team — not part of the methodology, just
// something to show next to the bare integer. Bytes 2-4 of the same digest,
// so it's one hash per lookup, not two, and it's exactly as deterministic as
// the team number itself.
export function colorFromDigest(digest) {
  return "#" + [digest[2], digest[3], digest[4]].map((b) => b.toString(16).padStart(2, "0")).join("");
}
