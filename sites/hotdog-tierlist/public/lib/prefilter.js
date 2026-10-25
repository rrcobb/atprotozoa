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
// A hot dog photo needs three things at once: a fair share of saturated
// bun/sausage browns (hue 8-42, saturation >= 0.4), and either a stripe of
// condiment (mustard yellow or ketchup red, both strongly saturated) or a frame
// that is mostly bun/sausage. Skin, wood and sunsets are warm too but low in
// saturation, so the 0.4 floor plus the condiment test is what rejects them.
// The thresholds lean strict on purpose: under 1% of photos are hot dogs, so
// the saved CLIP time matters more than the odd missed plain dog.
export const BROWN_MIN = 0.08;
export const BROWN_ONLY = 0.25;
export const CONDIMENT_MIN = 0.005;

// rgba: Uint8ClampedArray from canvas getImageData -> {brown, condiment} shares.
export function foodShares(rgba) {
  const n = rgba.length / 4;
  if (!n) return { brown: 1, condiment: 1 };
  let brown = 0, condiment = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (max < 0.3 || d === 0) continue;
    const s = d / max;
    let h;
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (s >= 0.6 && ((h >= 44 && h <= 64 && max >= 0.6) || ((h <= 8 || h >= 350) && max <= 0.9))) condiment++;
    else if (s >= 0.4 && h >= 8 && h <= 42) brown++;
  }
  return { brown: brown / n, condiment: condiment / n };
}

// Kept for callers/tests that want the single combined number.
export function warmFraction(rgba) {
  const { brown, condiment } = foodShares(rgba);
  return brown + condiment;
}

export function isPlausible(rgba) {
  if (!rgba.length) return true; // unreadable fails open
  const { brown, condiment } = foodShares(rgba);
  return brown >= BROWN_ONLY || (brown >= BROWN_MIN && condiment >= CONDIMENT_MIN);
}

// -> true if the photo at `url` could be a hot dog (also true when unreadable).
export async function plausibleUrl(url) {
  const key = "warm2:" + url; // bumped when the thresholds changed, so old verdicts are not reused
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
