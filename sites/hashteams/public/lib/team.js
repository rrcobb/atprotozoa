// team.js — the whole methodology, given by @mfzx.net: UTF-8 encode a DID,
// SHA-256 it, take the first two bytes, read them as a big-endian uint16,
// then add one. The last step was requested by @mfzx.net after the first
// pass shipped: a bare 0-65535 range reads as zero-indexing to anyone who
// isn't used to it, so the methodology's final step shifts the result to a
// plain 1-65536 range instead. Pure function of the DID string; Web Crypto
// only, works unchanged under node --test (see tests/team.test.mjs) since
// crypto.subtle is a global in both runtimes.

export async function digestForDid(did) {
  const bytes = new TextEncoder().encode(did);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

// The big-endian uint16 read straight off the digest's first two bytes,
// before the methodology's final +1 step. Exported so the tests can pin the
// byte order independently of the shift.
export function rawTeamFromDigest(digest) {
  return (digest[0] << 8) | digest[1];
}

export function teamFromDigest(digest) {
  return rawTeamFromDigest(digest) + 1;
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
