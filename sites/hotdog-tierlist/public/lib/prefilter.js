// prefilter.js — a near-free plausibility check run before CLIP in the photo
// scan. CLIP costs on the order of a hundred ms per image and under 1% of
// everyone's photos are hot dogs, so most of the time goes to selfies, skies and
// screenshots. A hot dog photo has a lot of bun/sausage/mustard/ketchup colour
// (red through tan/yellow), so we downsize to 32x32 and drop images with almost
// none. It only ever says "clearly not" — anything unsure goes on to CLIP, and
// any failure to read the image fails open.
// (Jev would be the nicer first pass, but api.typesafe.ai sends no CORS headers,
// so a browser page can't call it — see notes/40-new-site-playbook.md.)

import { cacheGet, cacheSet, proxied } from "./cache.js";

const SIZE = 32;
// Share of pixels that must be warm food colours. Hot dogs fill a good part of
// the frame; 3% is far below any real one, so this rejects only images that
// have essentially none (night skies, greenery, b/w, UI screenshots).
export const WARM_MIN = 0.03;

// rgba: Uint8ClampedArray from canvas getImageData -> share of warm pixels.
export function warmFraction(rgba) {
  const n = rgba.length / 4;
  if (!n) return 1;
  let warm = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (max < 0.2 || d / max < 0.25) continue; // too dark or too grey to be food
    let h;
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h <= 65 || h >= 345) warm++; // red -> orange -> tan -> mustard yellow
  }
  return warm / n;
}

export function isPlausible(rgba) {
  return warmFraction(rgba) >= WARM_MIN;
}

// -> true if the photo at `url` could be a hot dog (also true when unreadable).
export async function plausibleUrl(url) {
  const key = "warm:" + url;
  const cached = await cacheGet(key);
  if (typeof cached === "boolean") return cached;
  try {
    const res = await fetch(proxied(url));
    if (!res.ok) return true;
    const bmp = await createImageBitmap(await res.blob(), { resizeWidth: SIZE, resizeHeight: SIZE });
    const c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const ctx = c.getContext("2d");
    ctx.drawImage(bmp, 0, 0, SIZE, SIZE);
    const ok = isPlausible(ctx.getImageData(0, 0, SIZE, SIZE).data);
    cacheSet(key, ok);
    return ok;
  } catch {
    return true;
  }
}
