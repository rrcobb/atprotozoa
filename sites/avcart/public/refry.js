// refry.js — the AV cart's "refried" slideshow: takes a list of same-origin
// image URLs (proxied through /img, see src/index.ts) and paints a
// deep-fried, glitchy loop onto the screen canvas scene.js hands us, which
// three.js is already displaying as a CanvasTexture on the cart's screen
// mesh (call texture.needsUpdate = true after every paint).
//
// Two-tier drawing, so a phone doesn't choke: the expensive per-pixel work
// (chromatic-aberration channel shift, scanlines, vignette) runs ONCE per
// slide onto an offscreen "composed" canvas, not once per frame. The
// per-frame loop just blits that composed frame plus a cheap noise-grain
// overlay, and — for a couple hundred ms around every slide change — a
// horizontal tear glitch. That's the only per-frame cost.

const SLIDE_MS = 4800;
const GLITCH_MS = 260;
const NEW_ACCOUNT_GLITCH_MS = 700;

export class RefriedSlideshow {
  constructor(canvas, ctx, texture, opts = {}) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.texture = texture;
    this.onSlide = opts.onSlide || (() => {});
    this.images = [];
    this.loaded = [];
    this.index = 0;
    this.timer = null;
    this.glitchUntil = 0;
    this.composed = document.createElement("canvas");
    this.composed.width = canvas.width;
    this.composed.height = canvas.height;
    this.composedCtx = this.composed.getContext("2d");
    this.noise = document.createElement("canvas");
    this.noise.width = 96;
    this.noise.height = 72;
    this.noiseCtx = this.noise.getContext("2d");
    this._placeholder("no signal — pick an account below");
    this._rafLoop();
  }

  setImages(urls) {
    const clean = (urls || []).filter(Boolean);
    if (clean.join("|") === this.images.join("|")) return;
    this.images = clean;
    this.loaded = new Array(clean.length).fill(null);
    this.index = 0;
    if (this.timer) clearInterval(this.timer);
    if (!clean.length) {
      this._placeholder("no photos in that feed (yet)");
      return;
    }
    this._triggerGlitch(NEW_ACCOUNT_GLITCH_MS);
    this._preload(0);
    this._preload(1 % clean.length);
    this.timer = setInterval(() => this._advance(), SLIDE_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  _preload(i) {
    if (i >= this.images.length || this.loaded[i]) return;
    const img = new Image();
    this.loaded[i] = "pending";
    img.onload = () => {
      this.loaded[i] = img;
      if (i === this.index) this._composeSlide();
    };
    img.onerror = () => {
      this.loaded[i] = "error";
      if (i === this.index) this._composeSlide();
    };
    img.src = this.images[i];
  }

  _advance() {
    if (!this.images.length) return;
    this.index = (this.index + 1) % this.images.length;
    this._preload((this.index + 1) % this.images.length);
    this._triggerGlitch(GLITCH_MS);
    this.onSlide();
    const cur = this.loaded[this.index];
    if (cur && cur !== "pending") this._composeSlide();
    else this._placeholder(cur === "error" ? "( image didn't load )" : "tuning in…");
  }

  _triggerGlitch(ms) {
    this.glitchUntil = performance.now() + ms;
  }

  _placeholder(text) {
    const { composedCtx: ctx, composed } = this;
    ctx.fillStyle = "#0c0c10";
    ctx.fillRect(0, 0, composed.width, composed.height);
    ctx.fillStyle = "#7fc8ff";
    ctx.font = "600 20px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, composed.width / 2, composed.height / 2);
    this._addScanlinesAndVignette(ctx, composed.width, composed.height);
  }

  // The expensive pass: cover-fit draw, saturate/contrast, a real per-pixel
  // R/B channel shift for chromatic aberration, then scanlines + vignette.
  // Runs once per slide, not per frame.
  _composeSlide() {
    const img = this.loaded[this.index];
    const { composedCtx: ctx, composed } = this;
    const W = composed.width,
      H = composed.height;
    if (!img || img === "pending" || img === "error") {
      this._placeholder(img === "error" ? "( image didn't load )" : "tuning in…");
      return;
    }

    const base = document.createElement("canvas");
    base.width = W;
    base.height = H;
    const bctx = base.getContext("2d");
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * scale,
      h = img.naturalHeight * scale;
    bctx.filter = "saturate(2.6) contrast(1.3) brightness(1.08) hue-rotate(-8deg)";
    bctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);

    let shifted;
    try {
      const src = bctx.getImageData(0, 0, W, H);
      const out = bctx.createImageData(W, H);
      const shift = 3;
      for (let y = 0; y < H; y++) {
        const row = y * W * 4;
        for (let x = 0; x < W; x++) {
          const i = row + x * 4;
          const rx = Math.min(W - 1, x + shift);
          const bx = Math.max(0, x - shift);
          out.data[i] = src.data[row + rx * 4]; // R, shifted right
          out.data[i + 1] = src.data[i + 1]; // G, unshifted
          out.data[i + 2] = src.data[row + bx * 4 + 2]; // B, shifted left
          out.data[i + 3] = 255;
        }
      }
      shifted = out;
    } catch {
      shifted = null; // canvas got tainted somehow — fall back to the plain filtered draw
    }

    ctx.clearRect(0, 0, W, H);
    if (shifted) ctx.putImageData(shifted, 0, 0);
    else ctx.drawImage(base, 0, 0);

    this._addScanlinesAndVignette(ctx, W, H);
  }

  _addScanlinesAndVignette(ctx, W, H) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#000";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.restore();

    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  _drawNoise() {
    const { noiseCtx: nctx, noise } = this;
    const id = nctx.createImageData(noise.width, noise.height);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    nctx.putImageData(id, 0, 0);
  }

  _rafLoop() {
    let lastNoise = 0;
    const loop = (now) => {
      const { ctx, canvas } = this;
      ctx.drawImage(this.composed, 0, 0);

      const glitching = now < this.glitchUntil;
      if (glitching) {
        const tears = 4 + ((Math.random() * 5) | 0);
        for (let i = 0; i < tears; i++) {
          const y = (Math.random() * canvas.height) | 0;
          const sliceH = 2 + ((Math.random() * 14) | 0);
          const dx = (Math.random() - 0.5) * 40;
          ctx.drawImage(this.composed, 0, y, canvas.width, sliceH, dx, y, canvas.width, sliceH);
        }
        if (Math.random() < 0.35) {
          ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.2})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }

      if (now - lastNoise > 66) {
        this._drawNoise();
        lastNoise = now;
      }
      ctx.globalAlpha = glitching ? 0.13 : 0.05;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.noise, 0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;

      this.texture.needsUpdate = true;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
