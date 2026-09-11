// tid.js — decode an atproto TID record key back into a timestamp.
//
// Record keys minted by the reference client are TIDs: a 13-char
// base32-sortable string encoding a 64-bit int (reserved 0 bit + 53-bit
// microseconds-since-epoch + 10-bit clock id). Constellation's backlink
// index hands back {did, collection, rkey} rather than full record bodies
// (that's the whole point — one bulk index query instead of one repo fetch
// per link), so decoding the rkey locally is how this site turns a
// backlink into a point in time without an extra network round trip per
// record. Approximate (a non-reference client could pick a custom rkey),
// good enough for a chart.

const CHARSET = "234567abcdefghijklmnopqrstuvwxyz";

export function tidToMs(tid) {
  if (typeof tid !== "string" || tid.length !== 13) return null;
  let n = 0n;
  for (const c of tid) {
    const v = CHARSET.indexOf(c);
    if (v < 0) return null;
    n = (n << 5n) | BigInt(v);
  }
  const micros = (n >> 10n) & ((1n << 53n) - 1n);
  const ms = Number(micros / 1000n);
  // Sanity bound: atproto launched ~2022, and a clock skewed into the far
  // future is more likely a decode error than a real record.
  if (ms < 1600000000000 || ms > Date.now() + 86400000) return null;
  return ms;
}
