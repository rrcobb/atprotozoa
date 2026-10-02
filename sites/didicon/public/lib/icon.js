// icon.js — deterministic identicon from a DID string. Same DID, same icon:
// no network, no storage. cyrb53 (Bryc, public domain) hashes the DID to a
// number, mulberry32 turns that into a PRNG stream, and the stream picks a
// palette and a handful of angled strokes. Deliberately NOT symmetric — the
// strokes land wherever the hash puts them, at whatever angle it likes.
//
// iconSpec(did) is pure data (so og-gen.mjs can render the same icon to SVG);
// drawIcon(ctx, x, y, size, did, shape) paints it on a canvas.

function cyrb53(str, seed) {
  seed = seed || 0;
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hand-picked palettes: [name, background, ...ink colors]. Every ink is
// meant to sit well on its background and on its siblings.
const ICON_PALETTES = [
  ["dusk",      "#1d1b3a", "#ff6b9a", "#ffb86b", "#7ee8d0", "#a78bfa"],
  ["tangerine", "#fff4e0", "#ff5a1f", "#1b2a49", "#ffb400", "#e63946"],
  ["lagoon",    "#0b2b3a", "#2ec4b6", "#cbf3f0", "#ff9f1c", "#f4f1de"],
  ["bubblegum", "#ffe3ef", "#ff4d8d", "#5b4bff", "#00c2a8", "#ffd23f"],
  ["moss",      "#1f2a1c", "#a3d977", "#f2e8cf", "#e07a5f", "#6a994e"],
  ["ink",       "#f4efe6", "#111111", "#d62828", "#2a5cff", "#f7b32b"],
  ["sorbet",    "#fff0f3", "#ff8fa3", "#ffb347", "#7bdff2", "#b388eb"],
  ["ember",     "#190b0b", "#ff4500", "#ffb703", "#fb8b24", "#f5e6d3"],
  ["glacier",   "#e6f4ff", "#1e6091", "#48cae4", "#ff7f51", "#023e8a"],
  ["grape",     "#2a1040", "#e0aaff", "#ff70a6", "#70d6ff", "#ffd670"],
  ["matcha",    "#f1f7e8", "#3a7d44", "#ff6f59", "#254441", "#f2b134"],
  ["night-bus", "#101820", "#fee715", "#ff3d7f", "#4cc9f0", "#f8f9fa"],
  ["clay",      "#f2e2d0", "#c8553d", "#2d3047", "#93b7be", "#e0a458"],
  ["neon",      "#0a0a14", "#39ff88", "#ff2e97", "#2ee6ff", "#fff35c"],
  ["peach-fuzz","#2b2d42", "#ffbe98", "#ef476f", "#06d6a0", "#f1faee"],
  ["tide",      "#ecf8f8", "#0a9396", "#ee9b00", "#9b2226", "#005f73"],
];

function iconSpec(did) {
  const rng = mulberry32(cyrb53(did));
  const pal = ICON_PALETTES[Math.floor(rng() * ICON_PALETTES.length)];
  const bg = pal[1];
  // the ink colors in a hash-shuffled order, so two DIDs on one palette
  // still differ in which color leads
  const inks = pal.slice(2);
  for (let i = inks.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [inks[i], inks[j]] = [inks[j], inks[i]];
  }
  const count = 5 + Math.floor(rng() * 4); // 5..8 strokes
  const round = rng() < 0.5; // round or square line caps for the whole icon
  const strokes = [];
  for (let i = 0; i < count; i++) {
    // angle in degrees, kept at least 12° off the axes so every stroke
    // reads as deliberately slanted
    let angle = rng() * 180;
    const off = Math.min(angle % 90, 90 - (angle % 90));
    if (off < 12) angle = (angle + 24 + rng() * 20) % 180;
    strokes.push({
      cx: rng(), cy: rng(),              // center, fraction of the box
      angle,
      len: 0.45 + rng() * 0.9,           // fraction of the box
      width: 0.05 + Math.pow(rng(), 1.6) * 0.2,
      color: inks[Math.floor(rng() * inks.length)],
    });
  }
  // fat strokes first so slim ones sit on top
  strokes.sort((a, b) => b.width - a.width);
  return { palette: pal[0], bg, inks: pal.slice(2), strokes, round, count };
}

function iconClip(ctx, x, y, size, shape) {
  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  } else {
    const r = shape === "square" ? 0 : size * 0.18;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + size, y, x + size, y + size, r);
    ctx.arcTo(x + size, y + size, x, y + size, r);
    ctx.arcTo(x, y + size, x, y, r);
    ctx.arcTo(x, y, x + size, y, r);
  }
  ctx.closePath();
  ctx.clip();
}

// shape: "rounded" (default) | "circle" | "square"
function drawIcon(ctx, x, y, size, did, shape) {
  const spec = iconSpec(did);
  ctx.save();
  iconClip(ctx, x, y, size, shape || "rounded");
  ctx.fillStyle = spec.bg;
  ctx.fillRect(x, y, size, size);
  ctx.lineCap = spec.round ? "round" : "butt";
  for (const s of spec.strokes) {
    const a = (s.angle * Math.PI) / 180;
    const dx = (Math.cos(a) * s.len * size) / 2;
    const dy = (Math.sin(a) * s.len * size) / 2;
    const px = x + s.cx * size, py = y + s.cy * size;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width * size;
    ctx.beginPath();
    ctx.moveTo(px - dx, py - dy);
    ctx.lineTo(px + dx, py + dy);
    ctx.stroke();
  }
  ctx.restore();
  return spec;
}

if (typeof module !== "undefined") module.exports = { iconSpec, drawIcon, ICON_PALETTES };
