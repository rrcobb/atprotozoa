// A classic "oilify" filter (GIMP's Oilify / Van Gogh-style painting effect):
// each output pixel becomes the average color of whichever intensity bucket
// is most common in its neighborhood. Cheap enough to run on a ~110px avatar
// in well under a frame, so it can run synchronously per portrait.
//
// bins/sums are allocated once by the caller and passed in so painting many
// portraits in a row (one per bawkchain block) doesn't churn the GC.
export function makeOilifyScratch(levels) {
  return {
    count: new Int32Array(levels),
    r: new Float64Array(levels),
    g: new Float64Array(levels),
    b: new Float64Array(levels),
  };
}

export function oilify(srcData, width, height, radius, levels, scratch) {
  const sd = srcData.data;
  const out = new Uint8ClampedArray(sd.length);
  const { count, r: binR, g: binG, b: binB } = scratch;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      count.fill(0);
      binR.fill(0);
      binG.fill(0);
      binB.fill(0);

      for (let dy = -radius; dy <= radius; dy++) {
        let sy = y + dy;
        if (sy < 0) sy = 0;
        else if (sy >= height) sy = height - 1;
        const rowOff = sy * width;
        for (let dx = -radius; dx <= radius; dx++) {
          let sx = x + dx;
          if (sx < 0) sx = 0;
          else if (sx >= width) sx = width - 1;
          const idx = (rowOff + sx) * 4;
          const r = sd[idx], g = sd[idx + 1], b = sd[idx + 2];
          const bucket = Math.floor(((r + g + b) / 3) * levels / 256);
          count[bucket]++;
          binR[bucket] += r;
          binG[bucket] += g;
          binB[bucket] += b;
        }
      }

      let best = 0, bestCount = -1;
      for (let i = 0; i < levels; i++) {
        if (count[i] > bestCount) { bestCount = count[i]; best = i; }
      }

      const di = (y * width + x) * 4;
      out[di] = binR[best] / bestCount;
      out[di + 1] = binG[best] / bestCount;
      out[di + 2] = binB[best] / bestCount;
      out[di + 3] = sd[di + 3];
    }
  }
  return new ImageData(out, width, height);
}

// Paints `img` (an already-loaded HTMLImageElement/avatar) as an oil
// painting into a fresh canvas of size `size`x`size`, framed with a gilded
// border. Returns the canvas.
export function paintPortrait(img, size, { radius = 3, levels = 12, scratch } = {}) {
  const work = document.createElement("canvas");
  work.width = size;
  work.height = size;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  wctx.drawImage(img, 0, 0, size, size);
  const src = wctx.getImageData(0, 0, size, size);
  const painted = oilify(src, size, size, radius, levels, scratch || makeOilifyScratch(levels));
  wctx.putImageData(painted, 0, 0);

  // canvas-crackle vignette so it reads as "on canvas" rather than "filtered jpeg"
  const vignette = wctx.createRadialGradient(
    size / 2, size / 2, size * 0.35,
    size / 2, size / 2, size * 0.72
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(20,12,4,0.35)");
  wctx.fillStyle = vignette;
  wctx.fillRect(0, 0, size, size);

  const frameW = Math.round(size * 0.09);
  const out = document.createElement("canvas");
  out.width = size + frameW * 2;
  out.height = size + frameW * 2;
  const octx = out.getContext("2d");

  const gilt = octx.createLinearGradient(0, 0, out.width, out.height);
  gilt.addColorStop(0, "#e8c976");
  gilt.addColorStop(0.25, "#8a6a2c");
  gilt.addColorStop(0.5, "#f4e2a1");
  gilt.addColorStop(0.75, "#7a5b22");
  gilt.addColorStop(1, "#e8c976");
  octx.fillStyle = gilt;
  octx.fillRect(0, 0, out.width, out.height);

  octx.strokeStyle = "rgba(0,0,0,0.55)";
  octx.lineWidth = 2;
  octx.strokeRect(frameW - 3, frameW - 3, size + 6, size + 6);

  octx.drawImage(work, frameW, frameW);
  octx.strokeStyle = "rgba(255,255,255,0.35)";
  octx.lineWidth = 1;
  octx.strokeRect(frameW + 1, frameW + 1, size - 2, size - 2);

  return out;
}
