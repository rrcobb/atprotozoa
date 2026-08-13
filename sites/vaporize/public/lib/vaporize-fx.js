// vaporize-fx.js — the laser-beam disintegration effect.
//
// vaporize(imgEl, opts) turns a loaded <img> into a canvas overlay, chops it
// into a grid of tiles, sweeps a glowing beam across it, and blows each tile
// apart as the beam passes (fade + drift + spin + shrink). imgEl is hidden
// (not removed) so layout doesn't jump; the canvas sits exactly on top of it.
//
// Deliberately reads the image with drawImage() only, never
// getImageData()/toDataURL() — avatar images are cross-origin
// (cdn.bsky.app) and don't send Access-Control-Allow-Origin, so a canvas
// that painted one would be "tainted" and throw on any pixel read. drawImage
// never triggers that check, so real per-pixel dust from the actual avatar
// works with zero server-side proxying — see notes/20-deploy.md's Safe
// Browsing incident for why an open image proxy is something this repo
// avoids on purpose.

const TAU = Math.PI * 2;

function noiseBuffer(ctx, seconds) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  return buf;
}

let actx = null;
function audioCtx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  return actx;
}

export function playZap() {
  try {
    const ctx = audioCtx();
    const now = ctx.currentTime;

    // descending laser pew
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1900, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.28);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);

    // crumble noise burst, slightly after the beam hits
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.5);
    const nGain = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 900;
    nGain.gain.setValueAtTime(0, now);
    nGain.gain.linearRampToValueAtTime(0.06, now + 0.12);
    nGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.55);
    src.connect(filt).connect(nGain).connect(ctx.destination);
    src.start(now + 0.08);
  } catch {}
}

// imgEl must be a loaded <img> (real avatar or a generated placeholder —
// both are plain <img> sources, see avatarImg() in index.html). Returns a
// Promise that resolves when the tile dust has fully faded.
export function vaporize(imgEl, opts = {}) {
  const {
    beamMs = 480,
    particleLife = 950,
    tileSize = 6,
    minGrid = 8,
    maxGrid = 20,
    sound = true,
    beamColor = "#8ff5ff",
  } = opts;

  return new Promise((resolve) => {
    const parent = imgEl.parentElement;
    if (!parent || imgEl.dataset.vaporized) return resolve();
    imgEl.dataset.vaporized = "1";

    const rect = imgEl.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const left = rect.left - parentRect.left;
    const top = rect.top - parentRect.top;

    const nw = imgEl.naturalWidth || w;
    const nh = imgEl.naturalHeight || h;

    const canvas = document.createElement("canvas");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.position = "absolute";
    canvas.style.left = left + "px";
    canvas.style.top = top + "px";
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "5";
    const cs = getComputedStyle(parent);
    if (cs.position === "static") parent.style.position = "relative";
    parent.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    imgEl.style.visibility = "hidden";

    const cols = Math.max(minGrid, Math.min(maxGrid, Math.round(w / tileSize)));
    const rows = Math.max(minGrid, Math.min(maxGrid, Math.round(h / tileSize)));
    const dw = w / cols, dh = h / rows;
    const sw = nw / cols, sh = nh / rows;

    const tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        tiles.push({
          sx: c * sw, sy: r * sh, sw, sh,
          dx: c * dw, dy: r * dh, dw, dh,
          cx: c * dw + dw / 2, cy: r * dh + dh / 2,
          activated: false, t0: 0,
          vx: 0, vy: 0, vrot: 0, rot: 0,
          extraDelay: Math.random() * 90,
        });
      }
    }

    if (sound) playZap();

    const beamMargin = 14;
    const totalMs = beamMs + particleLife + 150;
    const start = performance.now();
    let flashDone = false;

    function frame(now) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, w, h);

      const beamT = Math.min(1, elapsed / beamMs);
      const beamX = -beamMargin + beamT * (w + beamMargin * 2);

      for (const t of tiles) {
        if (!t.activated) {
          if (beamX >= t.cx) {
            t.activated = true;
            t.t0 = elapsed + t.extraDelay;
            const upward = -0.5 - Math.random() * 0.9;
            const sideways = (Math.random() - 0.5) * 1.3;
            t.vx = sideways;
            t.vy = upward;
            t.vrot = (Math.random() - 0.5) * 0.012;
          } else {
            ctx.drawImage(imgEl, t.sx, t.sy, t.sw, t.sh, t.dx, t.dy, t.dw, t.dh);
            continue;
          }
        }

        const te = elapsed - t.t0;
        if (te < 0) {
          ctx.drawImage(imgEl, t.sx, t.sy, t.sw, t.sh, t.dx, t.dy, t.dw, t.dh);
          continue;
        }
        const life = te / particleLife;
        if (life >= 1) continue; // fully gone

        const alpha = 1 - life;
        const ease = life * life; // accelerate outward
        const px = t.cx + t.vx * te * (0.35 + ease * 1.4);
        const py = t.cy + t.vy * te * (0.35 + ease * 1.4) - ease * 40;
        const scale = 1 - life * 0.55;
        const rot = t.vrot * te;

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(px, py);
        ctx.rotate(rot);
        ctx.scale(scale, scale);
        ctx.drawImage(imgEl, t.sx, t.sy, t.sw, t.sh, -t.dw / 2, -t.dh / 2, t.dw, t.dh);
        ctx.restore();
      }

      // the beam itself: a glowing vertical bar with a bright flash on entry
      if (beamT < 1) {
        ctx.save();
        ctx.shadowColor = beamColor;
        ctx.shadowBlur = 16;
        ctx.fillStyle = beamColor;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(beamX - 2, 0, 4, h);
        ctx.globalAlpha = 0.35;
        ctx.fillRect(beamX - 8, 0, 16, h);
        ctx.restore();
      }
      if (elapsed < 130) {
        const flashAlpha = 0.5 * (1 - elapsed / 130);
        ctx.save();
        ctx.globalAlpha = Math.max(0, flashAlpha);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      } else {
        flashDone = true;
      }

      if (elapsed < totalMs) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}
