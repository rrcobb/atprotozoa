// page.js — pure logic for yourspace: the page-record shape, theme presets,
// CSS sanitising, plyr.fm track refs and widget URL filling. No DOM here so
// tests/page.test.mjs can call it under node.

export const PAGE_COLLECTION = "net.bisks.yourspace.page";
export const WIDGET_COLLECTION = "net.bisks.yourspace.widget";

export const PRESETS = {
  classic: { label: "classic blue", bg: "#6d9bd6", text: "#111111", link: "#003399", panel: "#ffffff", panelAlpha: 0.95, font: "verdana" },
  emo: { label: "after midnight", bg: "#0d0d10", text: "#e8e0e8", link: "#ff4f9a", panel: "#1b1b22", panelAlpha: 0.92, font: "georgia" },
  glitter: { label: "glitter pink", bg: "#ff9ed8", text: "#4a0a3a", link: "#d4008a", panel: "#fff0fa", panelAlpha: 0.9, font: "comic" },
  terminal: { label: "terminal", bg: "#000000", text: "#33ff66", link: "#9dffb8", panel: "#04140a", panelAlpha: 0.95, font: "mono" },
  y2k: { label: "y2k chrome", bg: "#b8c4d8", text: "#1a1a33", link: "#5a2bd9", panel: "#eef2fb", panelAlpha: 0.9, font: "trebuchet" },
};

export const FONTS = {
  verdana: "Verdana, Geneva, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  comic: "'Comic Sans MS', 'Chalkboard SE', cursive",
  mono: "ui-monospace, 'Courier New', monospace",
  trebuchet: "'Trebuchet MS', Tahoma, sans-serif",
};

export const SECTIONS = ["about", "music", "skeets", "blog", "photos", "friends", "widgets"];

export function defaultPage() {
  return {
    preset: "classic",
    ...PRESETS.classic,
    title: "",
    mood: "",
    tagline: "",
    bgImage: "",
    bgRepeat: true,
    music: "",
    musicAutoplay: true,
    pinned: [],
    friends: [],
    widgets: [],
    sections: [...SECTIONS],
    css: "",
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
function hex(v, fallback) {
  return typeof v === "string" && HEX.test(v) ? v : fallback;
}
function str(v, max) {
  return typeof v === "string" ? v.slice(0, max) : "";
}

// Records come from anyone's PDS, so every field is re-validated on read.
// The max lengths are lexicon-style field limits (keeps the record small),
// not limits on how much of anyone's data the page reads.
export function normalizePage(rec) {
  const d = defaultPage();
  if (!rec || typeof rec !== "object") return d;
  const p = PRESETS[rec.preset] ? rec.preset : "classic";
  const base = PRESETS[p];
  const sections = Array.isArray(rec.sections)
    ? rec.sections.filter((s, i, a) => SECTIONS.includes(s) && a.indexOf(s) === i)
    : d.sections;
  return {
    preset: p,
    label: base.label,
    bg: hex(rec.bg, base.bg),
    text: hex(rec.text, base.text),
    link: hex(rec.link, base.link),
    panel: hex(rec.panel, base.panel),
    panelAlpha: typeof rec.panelAlpha === "number" ? Math.min(1, Math.max(0, rec.panelAlpha)) : base.panelAlpha,
    font: FONTS[rec.font] ? rec.font : base.font,
    title: str(rec.title, 120),
    mood: str(rec.mood, 80),
    tagline: str(rec.tagline, 200),
    bgImage: safeHttps(rec.bgImage),
    bgRepeat: rec.bgRepeat !== false,
    music: str(rec.music, 300),
    musicAutoplay: rec.musicAutoplay !== false,
    pinned: strList(rec.pinned, 100, 300),
    friends: strList(rec.friends, 24, 253),
    widgets: strList(rec.widgets, 24, 400),
    sections,
    css: sanitizeCss(rec.css),
  };
}

function strList(v, n, max) {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x).map((x) => x.slice(0, max)).slice(0, n) : [];
}

export function safeHttps(u) {
  if (typeof u !== "string") return "";
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

// Custom CSS is the MySpace tradition, but it's injected into a page other
// people visit. Drop everything that can fetch (url(), @import, image-set),
// execute (expression, behavior, -moz-binding) or break out of the <style>.
export function sanitizeCss(css) {
  if (typeof css !== "string") return "";
  let out = css.slice(0, 8000).replace(/[<>]/g, "").replace(/\\/g, "");
  out = out.replace(/@import[^;]*;?/gi, "");
  out = out.replace(/url\s*\(/gi, "blocked(");
  out = out.replace(/image-set\s*\(/gi, "blocked(");
  out = out.replace(/expression\s*\(/gi, "blocked(");
  out = out.replace(/(behaviou?r|-moz-binding)\s*:[^;}]*/gi, "");
  return out;
}

// Accepts "https://plyr.fm/track/1683", "plyr.fm/track/1683", "1683".
// Returns { id } or null.
export function parseTrackRef(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return { id: t };
  const m = t.match(/plyr\.fm\/track\/(\d+)/i);
  return m ? { id: m[1] } : null;
}

// bsky.app post URL or at:// URI -> at:// URI (needs a DID or handle in the
// authority; callers resolve handles to DIDs before fetching).
export function parsePostRef(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  let m = t.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)/);
  if (m) return { actor: m[1], rkey: m[2] };
  m = t.match(/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/);
  if (m) return { actor: m[1], rkey: m[2] };
  return null;
}

export function parseAtUri(s) {
  const m = typeof s === "string" && s.trim().match(/^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)$/);
  return m ? { repo: m[1], collection: m[2], rkey: m[3] } : null;
}

// A widget definition is a net.bisks.yourspace.widget record:
//   { name, description?, embedUrl (https, may contain {did} {handle}), height? }
// Returns the iframe src and height, or null if the definition isn't usable.
export function widgetFrame(def, ctx, baseOrigin = "") {
  if (!def || typeof def.embedUrl !== "string") return null;
  let raw = def.embedUrl.trim();
  if (raw.startsWith("/") && baseOrigin) raw = baseOrigin + raw; // built-ins only
  raw = raw
    .replace(/\{did\}/g, encodeURIComponent(ctx.did || ""))
    .replace(/\{handle\}/g, encodeURIComponent(ctx.handle || ""));
  const src = safeHttps(raw);
  if (!src) return null;
  const h = Number(def.height);
  const height = Number.isFinite(h) ? Math.min(800, Math.max(60, Math.round(h))) : 200; // iframe box size, not a data cap
  return { src, height, name: str(def.name, 80) || "widget" };
}

export const BUILTIN_WIDGETS = {
  "builtin:clock": { name: "clock", description: "a small analog-ish clock", embedUrl: "/widgets/clock.html", height: 120 },
  "builtin:visitors": { name: "visitor counter", description: "a fake-but-sincere hit counter, stored in this browser", embedUrl: "/widgets/counter.html?k={did}", height: 90 },
};
