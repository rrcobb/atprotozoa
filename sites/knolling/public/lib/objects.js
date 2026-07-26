// objects.js — deterministic "ordinary object" per DID. Every account hashes
// (FNV-1a, same convention as mootdrone/lib/synth.js hash32) to one fixed
// object type, accent color, size, and starting scatter transform — stable
// forever, no server, no randomness at render time.

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hash32(str, salt = "") {
  return fnv1a(`${salt}::${str}`);
}

// Deterministic PRNG seeded from a hash — mulberry32.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = [
  "#e4572e", "#f3a712", "#a8c256", "#669bbc", "#5b6d9c",
  "#d62828", "#457b9d", "#ffb703", "#6a4c93", "#2a9d8f",
  "#e76f51", "#8ab17d", "#c9184a", "#4d908e",
];

const NEUTRAL = { ink: "#2b2b2e", metal: "#c7ccd4", metalDark: "#9aa1ac", wood: "#b98a52", paper: "#f4efe4" };

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// Every draw fn receives (ctx, color) with the origin already translated to
// the object's own center and no rotation/scale applied yet (caller does
// that). Footprint is roughly [-w/2,w/2] x [-h/2,h/2] per the type's w/h.
export const OBJECT_TYPES = [
  {
    key: "mug", label: "mug", names: ["chipped mug", "world's okayest mug", "cold coffee mug"],
    w: 74, h: 80,
    draw(ctx, color) {
      ctx.fillStyle = color; ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2.2;
      rr(ctx, -26, -34, 52, 66, 8); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -34, 26, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fill();
      ctx.beginPath(); ctx.arc(30, -4, 15, -1.1, 1.1); ctx.lineWidth = 6;
      ctx.strokeStyle = color; ctx.stroke();
      ctx.beginPath(); ctx.arc(30, -4, 15, -1.1, 1.1); ctx.lineWidth = 2.2;
      ctx.strokeStyle = NEUTRAL.ink; ctx.stroke();
    },
  },
  {
    key: "pen", label: "pen", names: ["chewed pen", "borrowed pen", "out-of-ink pen"],
    w: 132, h: 16,
    draw(ctx, color) {
      ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2;
      ctx.fillStyle = color; rr(ctx, -66, -7, 92, 14, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = NEUTRAL.metal; rr(ctx, 24, -7, 22, 14, 4); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(46, -7); ctx.lineTo(66, 0); ctx.lineTo(46, 7); ctx.closePath();
      ctx.fillStyle = NEUTRAL.metalDark; ctx.fill(); ctx.stroke();
      ctx.fillStyle = NEUTRAL.metalDark; rr(ctx, -66, -9, 10, 6, 2); ctx.fill();
    },
  },
  {
    key: "stapler", label: "stapler", names: ["jammed stapler", "office stapler", "borrowed stapler"],
    w: 108, h: 44,
    draw(ctx, color) {
      ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2.2;
      ctx.fillStyle = NEUTRAL.metalDark; rr(ctx, -54, 8, 108, 12, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; rr(ctx, -50, -18, 100, 26, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)"; rr(ctx, -44, -14, 88, 6, 3); ctx.fill();
    },
  },
  {
    key: "scissors", label: "scissors", names: ["craft scissors", "kitchen scissors", "desk scissors"],
    w: 96, h: 42,
    draw(ctx, color) {
      ctx.strokeStyle = NEUTRAL.metalDark; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(46, -18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 4); ctx.lineTo(46, 18); ctx.stroke();
      ctx.lineCap = "butt";
      ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(-30, -10, 16, 10, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-30, 10, 16, 10, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = NEUTRAL.metalDark;
      ctx.beginPath(); ctx.arc(-8, 0, 4, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    key: "tape", label: "tape", names: ["roll of tape", "washi tape", "half-used tape"],
    w: 66, h: 66,
    draw(ctx, color) {
      ctx.fillStyle = color; ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, 32, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = NEUTRAL.paper;
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    },
  },
  {
    key: "keys", label: "keys", names: ["jangly keys", "spare keys", "one mystery key"],
    w: 46, h: 88,
    draw(ctx, color) {
      ctx.strokeStyle = NEUTRAL.metalDark; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -34, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -34, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = NEUTRAL.metal; ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 1.6;
      for (const dx of [-8, 8]) {
        ctx.save(); ctx.translate(dx, 12); ctx.rotate(dx > 0 ? 0.08 : -0.08);
        rr(ctx, -4, -20, 8, 44, 3); ctx.fill(); ctx.stroke();
        ctx.fillRect(-4, 18, 5, 5); ctx.fillRect(3, 24, 5, 5);
        ctx.restore();
      }
    },
  },
  {
    key: "sunglasses", label: "sunglasses", names: ["scratched sunglasses", "cheap sunglasses", "lost sunglasses"],
    w: 120, h: 40,
    draw(ctx, color) {
      ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2.4; ctx.fillStyle = color;
      rr(ctx, -54, -14, 40, 28, 8); ctx.fill(); ctx.stroke();
      rr(ctx, 14, -14, 40, 28, 8); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-14, -6); ctx.quadraticCurveTo(0, -12, 14, -6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-54, -4); ctx.lineTo(-66, -10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(54, -4); ctx.lineTo(66, -10); ctx.stroke();
    },
  },
  {
    key: "wallet", label: "wallet", names: ["empty wallet", "worn wallet", "receipt-stuffed wallet"],
    w: 84, h: 58,
    draw(ctx, color) {
      ctx.fillStyle = color; ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2.2;
      rr(ctx, -42, -29, 84, 58, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-42, 0); ctx.lineTo(42, 0); ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.stroke();
      ctx.strokeStyle = NEUTRAL.metalDark; ctx.lineWidth = 1.4;
      ctx.strokeRect(-30, -18, 24, 15);
    },
  },
  {
    key: "dice", label: "die", names: ["lucky die", "loaded die", "spare die"],
    w: 42, h: 42,
    draw(ctx, color) {
      ctx.fillStyle = "#f4efe4"; ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2.2;
      rr(ctx, -20, -20, 40, 40, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      const pips = [[-9,-9],[9,-9],[-9,0],[9,0],[-9,9],[9,9]];
      for (const [px, py] of pips) { ctx.beginPath(); ctx.arc(px, py, 3.4, 0, Math.PI * 2); ctx.fill(); }
    },
  },
  {
    key: "wrench", label: "wrench", names: ["borrowed wrench", "rusty wrench", "toolbox wrench"],
    w: 122, h: 34,
    draw(ctx, color) {
      ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2.2; ctx.fillStyle = color;
      rr(ctx, -50, -6, 80, 12, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(30, -16); ctx.lineTo(50, -16); ctx.lineTo(61, -6);
      ctx.lineTo(61, 6); ctx.lineTo(50, 16); ctx.lineTo(30, 16);
      ctx.lineTo(38, 6); ctx.lineTo(38, -6); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = NEUTRAL.metalDark;
      ctx.beginPath(); ctx.arc(-46, 0, 6, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    key: "lighter", label: "lighter", names: ["empty lighter", "borrowed lighter", "lucky lighter"],
    w: 30, h: 60,
    draw(ctx, color) {
      ctx.fillStyle = color; ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2;
      rr(ctx, -14, -22, 28, 44, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = NEUTRAL.metal; rr(ctx, -11, -30, 22, 10, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = NEUTRAL.metalDark; ctx.fillRect(-4, -33, 8, 4);
    },
  },
  {
    key: "spool", label: "spool of thread", names: ["spool of thread", "half-used thread", "sewing spool"],
    w: 52, h: 58,
    draw(ctx, color) {
      ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2;
      ctx.fillStyle = NEUTRAL.paper;
      ctx.beginPath(); ctx.ellipse(0, -22, 24, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 22, 24, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      rr(ctx, -22, -22, 44, 44, 0); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -22, 24, 8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 22, 24, 8, 0, 0, Math.PI); ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 1;
      for (let i = -18; i <= 18; i += 6) { ctx.beginPath(); ctx.moveTo(i, -20); ctx.lineTo(i, 20); ctx.stroke(); }
    },
  },
  {
    key: "ruler", label: "ruler", names: ["splintery ruler", "school ruler", "drafting ruler"],
    w: 140, h: 22,
    draw(ctx, color) {
      ctx.fillStyle = color; ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2;
      rr(ctx, -70, -10, 140, 20, 3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.2;
      for (let i = -64; i <= 64; i += 8) {
        ctx.beginPath(); ctx.moveTo(i, -10); ctx.lineTo(i, i % 16 === 0 ? 2 : -3); ctx.stroke();
      }
    },
  },
  {
    key: "battery", label: "batteries", names: ["dead batteries", "spare batteries", "one good battery"],
    w: 68, h: 28,
    draw(ctx, color) {
      ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 2;
      for (const dx of [-18, 18]) {
        ctx.fillStyle = color; rr(ctx, dx - 14, -12, 28, 24, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = NEUTRAL.metalDark; ctx.fillRect(dx - 4, -16, 8, 5);
        ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(dx - 9, -6, 18, 5);
      }
    },
  },
  {
    key: "paperclip", label: "paperclip", names: ["bent paperclip", "jumbo paperclip", "one paperclip"],
    w: 34, h: 74,
    draw(ctx, color) {
      ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(-6, -34);
      ctx.arc(0, -22, 12, Math.PI, 0, true);
      ctx.lineTo(12, 24);
      ctx.arc(0, 24, 9, 0, Math.PI, true);
      ctx.lineTo(-9, -14);
      ctx.arc(0, -14, 9, Math.PI, 0, true);
      ctx.lineTo(9, 30);
      ctx.stroke();
    },
  },
  {
    key: "clothespin", label: "clothespin", names: ["wooden clothespin", "chip-bag clip", "spare clothespin"],
    w: 20, h: 70,
    draw(ctx, color) {
      ctx.strokeStyle = NEUTRAL.ink; ctx.lineWidth = 1.8; ctx.fillStyle = NEUTRAL.wood;
      rr(ctx, -9, -34, 8, 68, 3); ctx.fill(); ctx.stroke();
      rr(ctx, 1, -34, 8, 68, 3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, -6, 7, 0, Math.PI * 2); ctx.stroke();
    },
  },
];

function pick(rng, n) { return Math.floor(rng() * n); }

// Deterministic identity for one DID: which object, what color, what size,
// what it's called. The same DID always gets the same object — forever, no
// login, no randomness. Where it lands on the desk is a runtime/layout
// concern (see worktop.js), not part of the identity.
export function paramsForDid(did) {
  const rng = mulberry32(hash32(did, "knolling"));
  const typeIdx = pick(rng, OBJECT_TYPES.length);
  const colorIdx = pick(rng, PALETTE.length);
  const nameIdx = pick(rng, 3);
  const scale = 0.82 + rng() * 0.32;
  const type = OBJECT_TYPES[typeIdx];
  return {
    typeIdx,
    type,
    color: PALETTE[colorIdx],
    name: type.names[Math.min(nameIdx, type.names.length - 1)],
    scale,
  };
}

export { PALETTE, NEUTRAL };
