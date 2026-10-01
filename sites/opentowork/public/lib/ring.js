// ring.js — draw the #OPENTOWORK frame over an avatar, on a canvas, in the
// browser. The geometry mimics LinkedIn's photo frame: a green ring hugging
// the circular crop, thickened into a banner along the bottom arc that
// carries the hashtag. Avatars are shown circle-cropped on Bluesky, so the
// ring is painted at the outer edge of the square image.

export const SIZE = 800; // output px; avatars are shown far smaller, and this keeps the JPEG well under the PDS's 1 MB avatar limit
const GREEN = "#4f8a2f";
const GREEN_DARK = "#2f5d1a";

// Draw `img` (ImageBitmap / HTMLImageElement) center-cropped to a square,
// then the ring. Returns the canvas.
export function drawRing(img, size = SIZE, text = "#OPENTOWORK") {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const iw = img.width, ih = img.height;
  const side = Math.min(iw, ih);
  g.fillStyle = "#fff";
  g.fillRect(0, 0, size, size);
  g.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, size, size);

  const cx = size / 2, cy = size / 2;
  const R = size / 2; // outer radius
  const thin = size * 0.065; // ring thickness
  const band = size * 0.17; // banner thickness at the bottom

  // thin ring, all the way round
  g.beginPath();
  g.arc(cx, cy, R - thin / 2, 0, Math.PI * 2);
  g.lineWidth = thin;
  g.strokeStyle = GREEN;
  g.stroke();

  // banner: an annular sector centred on the bottom (angle PI/2 in canvas coords)
  const half = (62 * Math.PI) / 180;
  const a0 = Math.PI / 2 - half, a1 = Math.PI / 2 + half;
  g.beginPath();
  g.arc(cx, cy, R, a0, a1);
  g.arc(cx, cy, R - band, a1, a0, true);
  g.closePath();
  g.fillStyle = GREEN;
  g.fill();
  g.lineWidth = size * 0.006;
  g.strokeStyle = GREEN_DARK;
  g.stroke();

  const rText = R - band / 2;
  // text along the arc, reading left-to-right across the bottom
  let fontPx = band * 0.62;
  const setFont = () => { g.font = `800 ${fontPx}px system-ui, "Helvetica Neue", Arial, sans-serif`; };
  setFont();
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const chars = [...text];
  const measure = () => chars.map((ch) => g.measureText(ch).width + fontPx * 0.06);
  let widths = measure();
  let total = widths.reduce((a, b) => a + b, 0);
  // Custom text has to stay inside the banner arc (the sector spans 2*half,
  // minus a little margin at each end), so shrink the font until it fits.
  const maxTotal = 2 * half * 0.86 * rText;
  if (total > maxTotal) {
    fontPx *= maxTotal / total;
    setFont();
    widths = measure();
    total = widths.reduce((a, b) => a + b, 0);
  }
  // At the bottom of the circle, larger canvas angle = further left, so start
  // at the left end and walk the angle down.
  let ang = Math.PI / 2 + total / rText / 2;
  chars.forEach((ch, i) => {
    const w = widths[i];
    const mid = ang - w / rText / 2;
    g.save();
    g.translate(cx + rText * Math.cos(mid), cy + rText * Math.sin(mid));
    g.rotate(mid - Math.PI / 2); // tangent to the arc; upright at the bottom
    g.fillText(ch, 0, 0);
    g.restore();
    ang -= w / rText;
  });
  return c;
}

// Canvas -> JPEG bytes under the PDS's 1,000,000-byte avatar limit.
export async function toJpeg(canvas) {
  for (const q of [0.92, 0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size < 1_000_000) return new Uint8Array(await blob.arrayBuffer());
  }
  throw new Error("couldn't get the image under 1 MB");
}
