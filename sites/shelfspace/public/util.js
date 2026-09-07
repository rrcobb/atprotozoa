// util.js — tiny deterministic-hash helpers shared by scene.js (spine/cover
// color when there's no real cover to sample) and covers.js. Same book
// title+author always gets the same color across a session and across
// re-imports of the same CSV — no Math.random() anywhere in the render path.

export function hashString(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// A pleasant, book-cloth-like color from a hash: fixed saturation/lightness
// band so nothing turns up neon or mud, just a varied hue.
export function hashColor(str, sat = 45, light = 40) {
  const h = hashString(str) % 360;
  return `hsl(${h}, ${sat}%, ${light}%)`;
}

// Buckets a free-text CSV "Format" cell into print (the default when a row
// has no format at all, since "unlabeled" almost always means a normal
// book), audio (rendered as a glossy case instead of a cloth spine), or
// ebook — kept distinct for sorting/grouping (e.g. the "physical format"
// arrangement) even though ebooks render as an ordinary book on the shelf.
export function formatKind(format) {
  const f = String(format || "").toLowerCase();
  if (/audio/.test(f)) return "audio";
  if (/e[\s-]?book|kindle|digital|epub|\bpdf\b/.test(f)) return "ebook";
  return "print";
}
