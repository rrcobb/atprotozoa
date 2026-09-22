// Pure coordinate math for pixelcreep — no DOM, so it's the one part of the
// site testable with plain node:test instead of by-hand verification.

// How an object-fit:cover image maps onto a square box of side `size`:
// scales up to the LARGER ratio so it fills the box with no gaps, centered.
export function coverRect(naturalWidth, naturalHeight, size) {
  const scale = Math.max(size / naturalWidth, size / naturalHeight);
  const w = naturalWidth * scale;
  const h = naturalHeight * scale;
  return { x: (size - w) / 2, y: (size - h) / 2, w, h };
}

// How an object-fit:contain image maps onto a square box of side `size`:
// scales to the SMALLER ratio so the whole image is visible, centered.
export function containRect(naturalWidth, naturalHeight, size) {
  const scale = Math.min(size / naturalWidth, size / naturalHeight);
  const w = naturalWidth * scale;
  const h = naturalHeight * scale;
  return { x: (size - w) / 2, y: (size - h) / 2, w, h };
}

// Maps a crop square, given in the same `size`x`size` display coordinates
// as containRect, back to the image's own natural pixel coordinates —
// what drawImage needs as its source rect.
export function cropToNaturalRect(naturalWidth, naturalHeight, size, crop) {
  const r = containRect(naturalWidth, naturalHeight, size);
  const scale = r.w / naturalWidth; // == r.h / naturalHeight, square pixels
  return {
    sx: (crop.x - r.x) / scale,
    sy: (crop.y - r.y) / scale,
    ssize: crop.size / scale,
  };
}

// Reveal-circle radius for slider position t (0..1), given the seed point
// and the size of the square canvas it's centered in. sqrt(t) makes the
// slider track revealed *area* ~linearly — radius alone grows with r^2, so
// a linear radius ramp would make the reveal feel like it stalls near 0%.
// A 0.9px floor keeps the 0% state a visible dot instead of nothing at all.
export function growRadius(seedX, seedY, canvasSize, t) {
  const corners = [
    [0, 0], [canvasSize, 0], [0, canvasSize], [canvasSize, canvasSize],
  ];
  const maxRadius = Math.max(...corners.map(([cx, cy]) => Math.hypot(cx - seedX, cy - seedY))) * 1.01;
  if (t <= 0) return 0.9;
  return Math.max(0.9, maxRadius * Math.sqrt(t));
}

// Same 0.9px floor as growRadius, shared by the two effects below: a patch
// this small at t=0 reads as "one pixel" without vanishing entirely.
export const SEED_FLOOR = 0.9;

// "zoom" mode: instead of masking a static image, the camera itself zooms
// in on the seed point. `seed` is the on-screen size (px) of the new photo's
// patch at t=0 — the "seed size" slider, defaulting to SEED_FLOOR so a
// caller that doesn't pass it gets the original sub-pixel dot. zoomFactor(t)
// is the scale applied around the seed (1 = untouched photo at t=0); at t=1
// it's exactly canvasSize/seed, meaning a seed-px patch centered on the seed
// — drawn at native size in the same transformed context as the background —
// has been magnified to fill the whole canvas.
//
// The ramp is exponential in t (maxZoom**t), not sqrt(t). Zoom is a
// multiplicative quantity: what reads as a constant rate to the eye is a
// constant *ratio* of magnification per unit of slider, not a constant
// absolute increment. sqrt(t) (or plain t) front-loads the motion — the
// zoom factor is still near 1 for most of the early slider, so the same
// step there is a huge relative jump, then a tiny one by the time zoom is
// already large near t=1. That's exactly the "fast then slow" complaint.
// Interpolating the exponent keeps d(log zoom)/dt constant across the
// whole slide instead.
export function zoomFactor(canvasSize, t, seed = SEED_FLOOR) {
  const maxZoom = canvasSize / seed;
  if (t <= 0) return 1;
  return Math.pow(maxZoom, t);
}

// "zoom" mode's dolly target: where the zoomed content's seed point should
// land on screen. At t=0 that's the seed's own screen position (the camera
// hasn't moved yet); it slides linearly to the canvas center by t=1, so the
// final magnified patch — which is centered on the seed in content space —
// lands centered on the canvas instead of wherever the seed happened to be
// clicked. Without this, a seed near an edge leaves the 100% frame visibly
// off-center even though the patch itself fills canvasSize x canvasSize.
export function zoomPivot(seedX, seedY, canvasSize, t) {
  const u = Math.max(0, Math.min(1, t));
  const c = canvasSize / 2;
  return { x: seedX + (c - seedX) * u, y: seedY + (c - seedY) * u };
}

// "original size" mode: no camera zoom — the new photo's own square patch
// grows in place, from a SEED_FLOOR dot centered on the seed at t=0 to a
// rect that is exactly (0, 0, canvasSize, canvasSize) at t=1, so the patch
// itself ends up covering the whole frame regardless of where the seed is.
// Lerping all four rect fields (not just a side length centered on the
// seed) is what guarantees exact full coverage at t=1 even when the seed
// sits near an edge or corner.
export function originalSizeRect(canvasSize, seedX, seedY, t) {
  const u = t <= 0 ? 0 : Math.sqrt(t);
  const x0 = seedX - SEED_FLOOR / 2;
  const y0 = seedY - SEED_FLOOR / 2;
  const x = x0 + (0 - x0) * u;
  const y = y0 + (0 - y0) * u;
  const w = SEED_FLOOR + (canvasSize - SEED_FLOOR) * u;
  return { x, y, w, h: w };
}
