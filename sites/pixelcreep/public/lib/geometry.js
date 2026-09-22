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
