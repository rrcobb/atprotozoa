// graycart — procedural pixel sprites. Each sprite is a small bitmap of
// shade-role indices (0 = transparent, 1 = fg, 2 = hazard, 3 = goal — the
// actual color comes from the cartridge's shade permutation at draw time),
// built with left-right mirror symmetry so random noise still reads as a
// deliberate little creature instead of static.
(function (global) {
  "use strict";

  // size: width/height in pixels (square). density: fraction of the left
  // half that gets filled. role: which palette role (1/2/3) this sprite's
  // "on" pixels belong to.
  function makeSprite(rng, size, density, role) {
    const bmp = [];
    for (let y = 0; y < size; y++) {
      bmp.push(new Array(size).fill(0));
    }
    const half = Math.ceil(size / 2);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < half; x++) {
        if (rng.bool(density)) {
          bmp[y][x] = role;
          bmp[y][size - 1 - x] = role;
        }
      }
    }
    // Guarantee at least a visible core so low-density rolls never draw
    // an empty/invisible sprite.
    const cx = Math.floor(size / 2);
    const cy = Math.floor(size / 2);
    bmp[cy][cx] = role;
    bmp[cy][size - 1 - cx] = role;
    return { size, bmp };
  }

  // Draws a sprite bitmap into a 2D context at pixel-grid (px, py), each
  // bitmap cell rendered as a `scale`-px square. shades: the cartridge's
  // resolved 4-color palette array.
  function drawSprite(g, sprite, px, py, shades, scale) {
    scale = scale || 1;
    const { size, bmp } = sprite;
    for (let y = 0; y < size; y++) {
      const row = bmp[y];
      for (let x = 0; x < size; x++) {
        const role = row[x];
        if (!role) continue;
        g.fillStyle = shades[role];
        g.fillRect(
          Math.round(px + x * scale),
          Math.round(py + y * scale),
          scale,
          scale
        );
      }
    }
  }

  global.GC = global.GC || {};
  global.GC.makeSprite = makeSprite;
  global.GC.drawSprite = drawSprite;
})(window);
