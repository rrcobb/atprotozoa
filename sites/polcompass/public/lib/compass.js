// compass.js — encode/decode a whole chart definition into a URL-safe string.
//
// quadrants (the site this was copied from) keeps chart definitions in
// localStorage only, keyed by a random id — so a shared /c/<id>/ link only
// renders for whoever's browser created it; anyone else gets "chart not
// found". That's fine for quadrants' "shared discovery is best-effort" bit,
// but the whole point of a *maker* is that the subpages it generates have to
// actually work for the person you send them to. Fix: the config IS the id.
// Every /c/<encoded>/ URL is self-contained — decode the path, you have the
// whole chart, no storage or lookup involved, on any device.
//
// Keys are single/double letters to keep the URL short: t=title,
// tp/bt/l/r=axis labels (top/bottom/left/right), a=anchors ([x,y,label]
// tuples, x/y rounded to 2dp).

function toB64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(str) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeCompass(cfg) {
  const compact = {
    t: cfg.title,
    tp: cfg.top,
    bt: cfg.bottom,
    l: cfg.left,
    r: cfg.right,
    a: (cfg.anchors || []).map((an) => [Math.round(an.x * 100) / 100, Math.round(an.y * 100) / 100, an.label]),
  };
  return toB64Url(new TextEncoder().encode(JSON.stringify(compact)));
}

export function decodeCompass(encoded) {
  const json = new TextDecoder().decode(fromB64Url(encoded));
  const o = JSON.parse(json);
  if (typeof o.t !== "string") throw new Error("no title");
  return {
    title: String(o.t).slice(0, 80),
    top: String(o.tp || "top").slice(0, 40),
    bottom: String(o.bt || "bottom").slice(0, 40),
    left: String(o.l || "left").slice(0, 40),
    right: String(o.r || "right").slice(0, 40),
    anchors: Array.isArray(o.a)
      ? o.a
          .slice(0, 16)
          .filter((t) => Array.isArray(t) && t.length >= 2)
          .map((t) => ({ x: Math.max(-1, Math.min(1, Number(t[0]) || 0)), y: Math.max(-1, Math.min(1, Number(t[1]) || 0)), label: String(t[2] || "").slice(0, 40) }))
      : [],
  };
}

// A stable-ish short id for this chart, derived from its own encoded string
// (not random) — used only as a localStorage key for "remember my spot on
// this chart", so revisiting the same link recalls the same local pin.
export async function chartFingerprint(encoded) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encoded));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
