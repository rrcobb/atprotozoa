// Per-lane sharing, kept local-first: a shared lane's data is embedded
// straight in the link's URL *fragment* (the part after "#"), which browsers
// never send to a server. Nothing about a shared lane ever touches this
// Worker or any database — the link itself IS the transport. That's the
// whole mechanism; there's no account system to grant a "role" against, so
// "role" here means "what the recipient's browser offers to do with it":
//
//   viewer — opening the link shows a read-only preview of the lane.
//   editor — opening the link offers to import the lane as a new lane in
//            one of the recipient's own boards, which they can then edit
//            freely (their copy, their browser, no link back to the sender).
//
// This is an honesty-based convention, not a cryptographic permission — a
// viewer link's data is still sitting in the URL, so a determined recipient
// could hand-copy it. That's an inherent property of a serverless share
// link, not a bug: there is no server to enforce anything more, by design.

const PARAM = "share";

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// role: "viewer" | "editor"
export function buildLaneShareLink(lane, role, boardTitle) {
  const payload = { v: 1, kind: "lane", role, boardTitle: boardTitle || "", lane };
  const encoded = toBase64Url(JSON.stringify(payload));
  const url = new URL(location.origin + "/");
  url.hash = `${PARAM}=${encoded}`;
  return url.toString();
}

export function readShareFromLocation() {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  if (!hash.startsWith(`${PARAM}=`)) return null;
  const encoded = hash.slice(PARAM.length + 1);
  try {
    const payload = JSON.parse(fromBase64Url(encoded));
    if (payload && payload.kind === "lane" && payload.lane) return payload;
  } catch {
    // malformed / tampered fragment — treat as no share present
  }
  return null;
}

export function clearShareFromLocation() {
  history.replaceState(null, "", location.pathname + location.search);
}
