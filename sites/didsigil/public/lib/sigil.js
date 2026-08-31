// sigil.js — deterministic radial-kaleidoscope generator, keyed off a did:plc
// string. Same DID always hashes to the same seed, which always draws the
// same sigil: no network calls, no storage, pure function of the string.
//
// cyrb53 (Bryc's public-domain 53-bit string hash) turns the DID into a
// number; mulberry32 turns that number into a deterministic PRNG stream. A
// fixed batch of shape descriptors is drawn once from that stream, then
// stamped around the circle `segments` times (rotation) and mirrored across
// each wedge's centerline (reflection) — the two symmetries that make it
// read as a kaleidoscope instead of scattered noise.

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

function sigilParams(did) {
  const seed = cyrb53(did) % 4294967296;
  const rng = mulberry32(seed);
  const segments = 5 + Math.floor(rng() * 8); // 5..12
  const rings = 3 + Math.floor(rng() * 3); // 3..5
  const shapesPerRing = 2 + Math.floor(rng() * 3); // 2..4
  const hueBase = rng() * 360;
  const hueSpread = 20 + rng() * 100;
  return { seed, segments, rings, shapesPerRing, hueBase, hueSpread };
}

function drawShapeKind(ctx, kind, size) {
  ctx.beginPath();
  if (kind === 0) {
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 1) {
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(size * 0.6, 0, 0, size);
    ctx.quadraticCurveTo(-size * 0.6, 0, 0, -size);
    ctx.fill();
  } else if (kind === 2) {
    ctx.lineWidth = Math.max(1.5, size * 0.15);
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 1.3);
    ctx.stroke();
  } else {
    ctx.lineWidth = Math.max(1.5, size * 0.12);
    ctx.moveTo(-size * 0.5, 0);
    ctx.lineTo(size * 0.5, 0);
    ctx.stroke();
  }
}

// Draws a full sigil into a circle centered at (cx, cy) with the given
// outer radius. Safe to call into any canvas context at any position/size —
// used both for the live rotating canvas and for the share-card layout.
function drawSigil(ctx, cx, cy, radius, did) {
  const p = sigilParams(did);
  const rng = mulberry32(p.seed ^ 0x5bd1e995); // second independent stream for shape layout

  const bgHue = (p.hueBase + 180) % 360;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.4);
  grad.addColorStop(0, `hsl(${bgHue}, 40%, 11%)`);
  grad.addColorStop(1, `hsl(${bgHue}, 55%, 4%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  ctx.translate(cx, cy);
  const usable = radius * 0.94;
  const wedgeAngle = (Math.PI * 2) / p.segments;

  const shapes = [];
  const count = p.rings * p.shapesPerRing;
  for (let i = 0; i < count; i++) {
    const ring = Math.floor(i / p.shapesPerRing);
    const rInner = (ring / p.rings) * usable;
    const rOuter = ((ring + 1) / p.rings) * usable;
    shapes.push({
      angle: rng() * (wedgeAngle / 2) * 0.92,
      rad: rInner + rng() * (rOuter - rInner),
      size: (usable / p.rings) * (0.3 + rng() * 0.55),
      hue: (p.hueBase + (rng() - 0.5) * p.hueSpread + 360) % 360,
      light: 50 + rng() * 28,
      sat: 60 + rng() * 30,
      alpha: 0.55 + rng() * 0.4,
      kind: Math.floor(rng() * 4),
      jitter: (rng() - 0.5) * 0.5,
    });
  }

  function drawAt(angle, sh) {
    const x = sh.rad * Math.cos(angle);
    const y = sh.rad * Math.sin(angle);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + sh.jitter);
    ctx.fillStyle = `hsla(${sh.hue}, ${sh.sat}%, ${sh.light}%, ${sh.alpha})`;
    ctx.strokeStyle = ctx.fillStyle;
    drawShapeKind(ctx, sh.kind, sh.size);
    ctx.restore();
  }

  for (let seg = 0; seg < p.segments; seg++) {
    ctx.save();
    ctx.rotate(seg * wedgeAngle);
    for (const sh of shapes) {
      drawAt(sh.angle, sh);
      drawAt(-sh.angle, sh); // mirror across the wedge centerline
    }
    ctx.restore();
  }

  // faint core to anchor the center
  ctx.beginPath();
  ctx.arc(0, 0, usable * 0.045, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${p.hueBase}, 70%, 80%, 0.9)`;
  ctx.fill();

  ctx.restore(); // undoes clip + translate

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${p.hueBase}, 60%, 70%, 0.35)`;
  ctx.lineWidth = Math.max(2, radius * 0.01);
  ctx.stroke();
}
