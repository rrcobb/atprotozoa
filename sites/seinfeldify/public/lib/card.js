// card.js — encode/decode a distilled thread into a URL-safe blob. The
// *entire* card lives in the URL (like sites/windmill's /r/<code>), not in a
// database — no server-side storage means a card keeps rendering exactly as
// captured even if the original thread gets deleted, blocked, or the AppView
// changes its mind. That's the point: "a conversation that can outlive the
// scrolling surface" means the card can't depend on the surface either.
//
// Mirrored server-side in src/index.ts (encodeCard/decodeCard) — same
// duplication-within-one-site the didscope Worker does for its sign tables.

function toBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s) {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeCard(card) {
  const json = JSON.stringify(card);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodeCard(code) {
  const json = new TextDecoder().decode(fromBase64Url(code));
  return JSON.parse(json);
}
