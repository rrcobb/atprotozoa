// Canvas renderer for the bracket. One <canvas>, no per-entrant DOM.
//
// World space: x = round column (0..R), y = 0..1 down the roster. Node (r, p)
// sits at the vertical middle of the leaf slots it covers; a match joins nodes
// (r, 2j) and (r, 2j+1) to (r+1, j) with an elbow connector, so the picture is
// the real tournament tree, positions and all.
//
// Level of detail, per round, by pixel spacing between that round's matches:
//   >= 3 px   every visible match is drawn as an elbow
//   <  3 px   AGGREGATED: one sample match per 2px row band, drawn as a band
// Match nodes appear at >= 14 px, truncated DIDs at >= 16 px (round 0) / 30 px.

const COL = {
  bg: "#050505", idle: "rgba(232,230,223,0.30)", win: "rgba(159,227,180,0.85)",
  lose: "rgba(196,55,47,0.55)", sel: "#ffffff", selLose: "#ff5a4d", other: "#e0b04a",
};

export class BracketView {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    this.N = 0; this.R = 0; this.sizes = []; this.rounds = null; this.roster = null;
    this.cum = [0];               // cum[r] = matches in rounds before r
    this.resolved = 0;            // matches whose result the playback has revealed (float)
    this.cx = 0; this.cy = 0.5; this.zoom = 1;
    this.hl = null;               // {mine:[{r,pos,lose}], other:[{r,pos}]}
    this.dirty = true; this.frames = 0; this.fps = 0; this._fpsT = performance.now();
    this.lod = "—";
    this.resize();
  }

  setTournament({ N, sizes, rounds = null, roster = null }) {
    this.N = N; this.sizes = sizes; this.R = Math.max(0, sizes.length - 1);
    this.rounds = rounds; this.roster = roster;
    this.cum = [0];
    for (let r = 0; r < this.R; r++) this.cum.push(this.cum[r] + (sizes[r] >> 1));
    this.resolved = 0; this.hl = null;
    this.fit(); this.dirty = true;
  }
  setResolved(c) { if (c !== this.resolved) { this.resolved = c; this.dirty = true; } }
  setHighlight(hl) { this.hl = hl; this.dirty = true; }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = this.cv.clientWidth || window.innerWidth; this.vh = this.cv.clientHeight || window.innerHeight;
    this.cv.width = Math.round(this.vw * dpr); this.cv.height = Math.round(this.vh * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dirty = true;
  }

  // --- camera ---
  get kyFit() { return Math.max(50, this.vh * 0.84); }
  get ky() { return this.kyFit * this.zoom; }
  get kxFit() { return this.R > 0 ? (this.vw * 0.90) / this.R : this.vw * 0.5; }
  // Horizontal zoom grows slowly so a deep vertical zoom doesn't smear the rounds apart.
  get kx() { return this.kxFit * Math.min(Math.pow(this.zoom, 0.28), 5); }
  get maxZoom() { return Math.max(1, (90 * Math.max(1, this.N)) / this.kyFit); }
  sx(c) { return (c - this.cx) * this.kx + this.vw / 2; }
  sy(w) { return (w - this.cy) * this.ky + this.vh / 2; }

  fit() { this.zoom = 1; this.cx = this.R / 2; this.cy = 0.5; this.dirty = true; }
  clampCam() {
    this.zoom = Math.min(this.maxZoom, Math.max(1, this.zoom));
    this.cy = Math.min(1, Math.max(0, this.cy));
    this.cx = Math.min(this.R, Math.max(0, this.cx));
  }
  zoomAt(factor, px, py) {
    const wy = this.cy + (py - this.vh / 2) / this.ky, wx = this.cx + (px - this.vw / 2) / this.kx;
    this.zoom = Math.min(this.maxZoom, Math.max(1, this.zoom * factor));
    this.cy = wy - (py - this.vh / 2) / this.ky; this.cx = wx - (px - this.vw / 2) / this.kx;
    this.clampCam(); this.dirty = true;
  }
  panBy(dx, dy) { this.cx -= dx / this.kx; this.cy -= dy / this.ky; this.clampCam(); this.dirty = true; }

  // World y of node (r, p).
  yOf(r, p) { const span = 2 ** r; return (p * span + Math.min((p + 1) * span, this.N)) / 2 / this.N; }

  // Camera target for bracket position `pos` at round `r`, close enough to read.
  targetFor(r, pos) {
    const wantPx = 46;
    const zoom = Math.min(this.maxZoom, Math.max(1, (wantPx * this.N / 2 ** r) / this.kyFit));
    return { zoom, cy: this.yOf(r, pos), cx: Math.min(this.R, r + 1.2) };
  }

  hit(px, py) {
    if (!this.rounds) return null;
    const col = Math.round(this.cx + (px - this.vw / 2) / this.kx);
    if (col < 0 || col > this.R) return null;
    if (Math.abs(this.sx(col) - px) > 24) return null;
    const wy = this.cy + (py - this.vh / 2) / this.ky;
    const L = this.sizes[col];
    const pos = Math.min(L - 1, Math.max(0, Math.floor((wy * this.N) / 2 ** col)));
    if (Math.abs(this.sy(this.yOf(col, pos)) - py) > Math.max(10, (this.ky * 2 ** col) / this.N / 2)) return null;
    return { round: col, pos, entrant: this.rounds[col][pos] };
  }

  // --- drawing ---
  elbow(ctx, r, childPos, parentPos) {
    const x0 = this.sx(r), x1 = this.sx(r + 1), xm = (x0 + x1) / 2;
    const y0 = this.sy(this.yOf(r, childPos)), y1 = this.sy(this.yOf(r + 1, parentPos));
    ctx.moveTo(x0, y0); ctx.lineTo(xm, y0); ctx.lineTo(xm, y1); ctx.lineTo(x1, y1);
  }

  draw() {
    const ctx = this.ctx, vw = this.vw, vh = this.vh;
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, vw, vh);
    const N = this.N;
    if (N < 1) { this.tick(); return; }
    if (N === 1) {
      ctx.fillStyle = COL.win; ctx.fillRect(vw / 2 - 30, vh / 2, 60, 1.5);
      this.tick(); return;
    }
    const w0 = this.cy - vh / 2 / this.ky, w1 = this.cy + vh / 2 / this.ky;
    const aggRounds = [];
    ctx.lineWidth = 1;
    for (let r = 0; r < this.R; r++) {
      const xa = this.sx(r), xb = this.sx(r + 1);
      if (xb < -4 || xa > vw + 4) continue;
      const pairs = this.sizes[r] >> 1, odd = this.sizes[r] & 1;
      const span = 2 ** (r + 1);
      const sp = (this.ky * span) / N; // px between matches in this round
      const j0 = Math.max(0, Math.floor((w0 * N) / span) - 1), j1 = Math.min(pairs - 1, Math.ceil((w1 * N) / span) + 1);
      if (j1 < j0 && !odd) continue;
      const resolvedHere = Math.max(0, Math.min(pairs, this.resolved - this.cum[r])); // matches revealed this round
      if (sp >= 3) {
        const idle = new Path2D(), win = new Path2D(), lose = new Path2D();
        for (let j = j0; j <= j1; j++) {
          const done = j < resolvedHere;
          if (!done) { this.pathTo(idle, r, 2 * j, j); this.pathTo(idle, r, 2 * j + 1, j); continue; }
          const second = this.rounds ? this.rounds[r + 1][j] === this.rounds[r][2 * j + 1] : false;
          if (second) { this.pathTo(lose, r, 2 * j, j); this.pathTo(win, r, 2 * j + 1, j); }
          else { this.pathTo(win, r, 2 * j, j); this.pathTo(lose, r, 2 * j + 1, j); }
        }
        if (odd && pairs >= j0 - 1 && pairs <= j1 + 1) this.pathTo(resolvedHere >= pairs ? win : idle, r, 2 * pairs, pairs);
        ctx.strokeStyle = COL.idle; ctx.stroke(idle);
        ctx.strokeStyle = COL.lose; ctx.stroke(lose);
        ctx.strokeStyle = COL.win; ctx.stroke(win);
        if (sp >= 14) this.drawNodes(r, j0, j1, resolvedHere, sp);
      } else {
        aggRounds.push(r);
        // AGGREGATED: one sample per 2px band.
        const bands = Math.ceil(vh / 2);
        for (let b = 0; b < bands; b++) {
          const wy = this.cy + (b * 2 + 1 - vh / 2) / this.ky;
          if (wy < 0 || wy > 1) continue;
          const j = Math.min(pairs - 1, Math.floor((wy * N) / span));
          if (j < 0) continue;
          const y = b * 2;
          if (j < resolvedHere) {
            ctx.fillStyle = COL.win; ctx.fillRect(xa, y, xb - xa, 1);
            ctx.fillStyle = COL.lose; ctx.fillRect(xa, y + 1, xb - xa, 1);
          } else { ctx.fillStyle = COL.idle; ctx.fillRect(xa, y, xb - xa, 1.2); }
        }
      }
    }
    this.drawHighlight();
    this.drawColumnLabels();
    this.lod = aggRounds.length ? `AGGREGATED R${aggRounds[0] + 1}–R${aggRounds[aggRounds.length - 1] + 1}` : "EXACT";
    this.tick();
  }

  pathTo(path, r, childPos, parentPos) {
    const x0 = this.sx(r), x1 = this.sx(r + 1), xm = (x0 + x1) / 2;
    const y0 = this.sy(this.yOf(r, childPos)), y1 = this.sy(this.yOf(r + 1, parentPos));
    path.moveTo(x0, y0); path.lineTo(xm, y0); path.lineTo(xm, y1); path.lineTo(x1, y1);
  }

  drawNodes(r, j0, j1, resolvedHere, sp) {
    const ctx = this.ctx;
    ctx.fillStyle = "#e8e6df";
    const x1 = this.sx(r + 1);
    for (let j = j0; j <= j1; j++) {
      const y = this.sy(this.yOf(r + 1, j));
      ctx.fillRect(x1 - 2, y - 2, 4, 4);
    }
    // Labels: winners of revealed matches, and round-0 entrants.
    if (!this.roster || !this.rounds) return;
    ctx.font = "10px ui-monospace, Menlo, Consolas, monospace";
    ctx.textBaseline = "middle";
    if (r === 0 && sp / 2 >= 16) {
      ctx.fillStyle = "#8a8880"; ctx.textAlign = "right";
      const a = Math.max(0, 2 * j0), b = Math.min(this.sizes[0] - 1, 2 * j1 + 1);
      for (let p = a; p <= b; p++) ctx.fillText(this.short(this.rounds[0][p]), this.sx(0) - 6, this.sy(this.yOf(0, p)));
    }
    if (sp >= 30) {
      ctx.fillStyle = "#9fe3b4"; ctx.textAlign = "left";
      for (let j = j0; j <= j1; j++) if (j < resolvedHere) ctx.fillText(this.short(this.rounds[r + 1][j]), this.sx(r + 1) + 6, this.sy(this.yOf(r + 1, j)) - 8);
    }
  }

  short(e) {
    const d = this.roster.didAt(e);
    return d.length > 26 ? d.slice(0, 16) + "…" + d.slice(-5) : d;
  }

  drawHighlight() {
    const hl = this.hl; if (!hl) return;
    const ctx = this.ctx;
    ctx.lineWidth = 2.4; ctx.setLineDash([]);
    ctx.beginPath(); ctx.strokeStyle = COL.sel;
    for (const s of hl.mine) if (!s.lose) this.elbow(ctx, s.r, s.pos, s.pos >> 1);
    ctx.stroke();
    ctx.beginPath(); ctx.strokeStyle = COL.selLose;
    for (const s of hl.mine) if (s.lose) this.elbow(ctx, s.r, s.pos, s.pos >> 1);
    ctx.stroke();
    ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.strokeStyle = COL.other;
    for (const s of hl.other) this.elbow(ctx, s.r, s.pos, s.pos >> 1);
    ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    // marker at the starting leaf and the elimination match
    const first = hl.mine[0];
    if (first) { ctx.fillStyle = COL.sel; const x = this.sx(first.r), y = this.sy(this.yOf(first.r, first.pos)); ctx.fillRect(x - 3, y - 3, 6, 6); }
    const last = hl.mine[hl.mine.length - 1];
    if (last && last.lose) {
      const x = this.sx(last.r + 1), y = this.sy(this.yOf(last.r + 1, last.pos >> 1));
      ctx.strokeStyle = COL.selLose; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke(); ctx.lineWidth = 1;
    }
  }

  drawColumnLabels() {
    const ctx = this.ctx;
    ctx.font = "10px ui-monospace, Menlo, Consolas, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillStyle = "#6b6a64";
    const y = this.vh - 54;
    for (let r = 0; r <= this.R; r++) {
      const x = this.sx(r);
      if (x < 8 || x > this.vw - 8) continue;
      if (this.R > 12 && this.kx < 40 && r % 2) continue;
      ctx.fillText(r === this.R ? "FINAL" : `R${r + 1}`, x, y);
    }
  }

  tick() {
    this.dirty = false; this.frames++;
    const now = performance.now();
    if (now - this._fpsT >= 1000) { this.fps = Math.round((this.frames * 1000) / (now - this._fpsT)); this.frames = 0; this._fpsT = now; }
  }
}
