// sand.js — a tiny falling-sand cellular automaton. Each cell is either
// empty or holds one grain's RGB color. One sim cell == one canvas pixel;
// the canvas is then scaled up in CSS with `image-rendering: pixelated` so
// each grain reads as a visible colored square (which is exactly what a
// grain ground from one pfp pixel should look like).
//
// Classic 3-neighbor rule: a grain falls straight down if the cell below is
// empty, otherwise slides to whichever open diagonal is free (checked in a
// randomized left/right order so piles don't lean). Rows are updated
// bottom-to-top each tick so a grain never falls twice in one frame.

export class SandSim {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    const n = cols * rows;
    this.occupied = new Uint8Array(n);
    this.color = new Uint8ClampedArray(n * 3); // RGB per cell
    this.count = 0;
  }

  idx(x, y) {
    return y * this.cols + x;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  isEmpty(x, y) {
    return this.inBounds(x, y) && !this.occupied[this.idx(x, y)];
  }

  // Place a grain at (x,y). If occupied, search upward in the same column
  // (and a couple neighbors) for the nearest free cell so a full bin still
  // accepts new grains by stacking higher instead of silently dropping
  // them. Returns false only if the whole column is jammed to the top.
  place(x, y, r, g, b) {
    x = Math.max(0, Math.min(this.cols - 1, x | 0));
    y = Math.max(0, Math.min(this.rows - 1, y | 0));
    let ty = y;
    while (ty >= 0 && this.occupied[this.idx(x, ty)]) ty--;
    if (ty < 0) return false;
    const i = this.idx(x, ty);
    this.occupied[i] = 1;
    this.color[i * 3] = r;
    this.color[i * 3 + 1] = g;
    this.color[i * 3 + 2] = b;
    this.count++;
    return true;
  }

  clear() {
    this.occupied.fill(0);
    this.count = 0;
  }

  move(fromI, toI) {
    this.occupied[fromI] = 0;
    this.occupied[toI] = 1;
    this.color[toI * 3] = this.color[fromI * 3];
    this.color[toI * 3 + 1] = this.color[fromI * 3 + 1];
    this.color[toI * 3 + 2] = this.color[fromI * 3 + 2];
  }

  step() {
    const { cols, rows } = this;
    for (let y = rows - 2; y >= 0; y--) {
      const leftFirst = Math.random() < 0.5;
      for (let xi = 0; xi < cols; xi++) {
        const x = leftFirst ? xi : cols - 1 - xi;
        const i = this.idx(x, y);
        if (!this.occupied[i]) continue;
        const belowI = this.idx(x, y + 1);
        if (!this.occupied[belowI]) {
          this.move(i, belowI);
          continue;
        }
        const tryLeftFirst = Math.random() < 0.5;
        const dx1 = tryLeftFirst ? -1 : 1;
        const dx2 = -dx1;
        if (this.isEmpty(x + dx1, y + 1)) {
          this.move(i, this.idx(x + dx1, y + 1));
        } else if (this.isEmpty(x + dx2, y + 1)) {
          this.move(i, this.idx(x + dx2, y + 1));
        }
      }
    }
  }

  // Plow the pile at (cx,cy) in direction (dirx,diry) — a real shove, not a
  // jitter. Every occupied cell within `radius` gets driven up to `dist`
  // cells along the drag direction, walking one cell at a time and stopping
  // the instant it hits a wall or another (still-unmoved) grain. Cells
  // closest to the leading edge of the push are moved first so trailing
  // grains can flow into the space just vacated ahead of them, which is what
  // makes it read as a plow carving a trench instead of grains teleporting.
  push(cx, cy, radius, dirx, diry, dist) {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.cols - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.rows - 1, Math.ceil(cy + radius));
    const cells = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const ddx = x - cx, ddy = y - cy;
        if (ddx * ddx + ddy * ddy > r2) continue;
        if (!this.occupied[this.idx(x, y)]) continue;
        cells.push([x * dirx + y * diry, x, y]);
      }
    }
    // leading edge (furthest along the push direction) moves first so
    // trailing grains can flow into the space it just vacated.
    cells.sort((a, b) => b[0] - a[0]);
    for (const [, x, y] of cells) {
      let gx = x, gy = y, fx = x, fy = y;
      for (let step = 0; step < dist; step++) {
        fx += dirx;
        fy += diry;
        const nx = Math.round(fx), ny = Math.round(fy);
        if (nx === gx && ny === gy) continue;
        if (!this.inBounds(nx, ny) || !this.isEmpty(nx, ny)) break;
        this.move(this.idx(gx, gy), this.idx(nx, ny));
        gx = nx;
        gy = ny;
      }
    }
  }

  // Write the grid straight into an ImageData's pixel buffer.
  render(imageData, bg) {
    const data = imageData.data;
    const n = this.cols * this.rows;
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      if (this.occupied[i]) {
        data[p] = this.color[i * 3];
        data[p + 1] = this.color[i * 3 + 1];
        data[p + 2] = this.color[i * 3 + 2];
        data[p + 3] = 255;
      } else {
        data[p] = bg[0];
        data[p + 1] = bg[1];
        data[p + 2] = bg[2];
        data[p + 3] = bg[3];
      }
    }
  }
}
