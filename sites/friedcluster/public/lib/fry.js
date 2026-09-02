// fry.js — recursively re-fries an avatar through real <canvas> pixel
// manipulation + JPEG re-encoding, generation by generation: each pass draws
// the PREVIOUS generation's already-degraded output, boosts contrast /
// saturation / warmth, sprinkles noise, then re-encodes at a lower JPEG
// quality. That's a real screenshot-of-a-screenshot chain — the artifacts
// compound because they're genuinely re-encoded, not a single filter preset
// stamped ten times. Same joke as the thread this was built from: "make it
// look more delicious," ten times over, except the images are real Bluesky
// mutuals' pfps and the frying is actually recursive.

const SIZE = 220; // working resolution — enough texture to see, small enough that GENERATIONS canvas+JPEG passes per avatar stay fast in-browser

export const GENERATIONS = 10;

export const CAPTIONS = [
  "gen 0 — an ordinary pfp",
  "make it look more delicious",
  "even more delicious than that",
  "still more delicious",
  "increasingly, upsettingly delicious",
  "delicious beyond reason",
  "the delicious has become load-bearing",
  "delicious in a way that concerns onlookers",
  "no longer food, but delicious",
  "delicious as a terminal diagnosis",
  "10 generations deep. maximum delicious.",
];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

function snapshotAt(img) {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  c.getContext("2d").drawImage(img, 0, 0, SIZE, SIZE);
  return c.toDataURL("image/png");
}

function placeholderDataUrl(seedChar) {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "#ddd";
  ctx.font = "bold 96px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((seedChar || "?").toUpperCase(), SIZE / 2, SIZE / 2 + 8);
  return c.toDataURL("image/png");
}

// One fry pass over `srcImg`, escalating with `gen`. Returns a JPEG data URL.
function fryPass(srcImg, gen) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(srcImg, 0, 0, SIZE, SIZE);

  const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = imgData.data;

  const contrast = 1 + gen * 0.09;
  const satBoost = 1 + gen * 0.17;
  const warmth = gen * 3.4;
  const noiseAmt = gen * 6;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];

    r = clamp((r - 128) * contrast + 128, 0, 255);
    g = clamp((g - 128) * contrast + 128, 0, 255);
    b = clamp((b - 128) * contrast + 128, 0, 255);

    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    r = clamp(luma + (r - luma) * satBoost, 0, 255);
    g = clamp(luma + (g - luma) * satBoost, 0, 255);
    b = clamp(luma + (b - luma) * satBoost, 0, 255);

    const n = (Math.random() - 0.5) * noiseAmt;
    r = clamp(r + warmth + n, 0, 255);
    g = clamp(g + warmth * 0.5 + n, 0, 255);
    b = clamp(b - warmth * 0.6 + n, 0, 255);

    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(imgData, 0, 0);

  // quality drops each generation, so re-JPEGing an already-JPEGed image
  // compounds real blocking/ringing artifacts instead of faking a look.
  const quality = clamp(0.55 - gen * 0.045, 0.06, 0.55);
  return canvas.toDataURL("image/jpeg", quality);
}

// Fry one avatar through every generation. Returns an array of
// GENERATIONS + 1 data URLs: index 0 is the untouched snapshot, index N is
// generation N.
export async function fryAvatar(avatarUrl, seedChar) {
  const gens = [];
  let current;
  try {
    if (!avatarUrl) throw new Error("no avatar");
    const img = await loadImage(avatarUrl);
    gens.push(snapshotAt(img));
    current = await loadImage(gens[0]);
  } catch {
    gens.push(placeholderDataUrl(seedChar));
    current = await loadImage(gens[0]);
  }

  for (let gen = 1; gen <= GENERATIONS; gen++) {
    const dataUrl = fryPass(current, gen);
    gens.push(dataUrl);
    current = await loadImage(dataUrl); // feed forward — the next pass fries THIS generation's own artifacts
  }
  return gens;
}

// Fry a whole pool of {avatar, ...} entries with bounded concurrency (canvas
// work is CPU-bound and synchronous per pass, so unbounded parallelism just
// contends for the same main thread — 6 in flight keeps the tab responsive
// without slowing the total any further). Calls onProgress(done, total).
export async function fryPool(pool, { concurrency = 6, onProgress } = {}) {
  const results = new Array(pool.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < pool.length) {
      const i = next++;
      const p = pool[i];
      results[i] = await fryAvatar(p.avatar, (p.displayName || p.handle || "?")[0]);
      done++;
      if (onProgress) onProgress(done, pool.length);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, pool.length) }, worker);
  await Promise.all(workers);
  return results;
}
