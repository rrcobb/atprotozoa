// hopper.js — the hopper is now a real object: dropped pfp circles fall
// into it with gravity, bounce off its funnel walls, and pile on each
// other, exactly like beans in a Baratza hopper. Nothing gets ground until
// the power switch is on; while it's off the pile just accumulates so you
// can stack up a bunch of moots first (@cee.wtf's ask). Once it's on, the
// grinder pulls particles from the bottom of the funnel one at a time and
// hands each one to the caller's `onConsume(particle)` — that's the hook
// app.js uses to feed it into the existing sand-grind pipeline.
//
// Small, self-contained circle physics: gravity + wall collision against a
// trapezoid funnel (narrow spout at the bottom) + pairwise circle-circle
// position correction so a pile of pfps settles instead of overlapping.
// No rotation, no restitution tuning beyond "looks right" — this is a toy,
// not a rigid-body engine.

const GRAVITY = 1500; // px/s^2
const AIR_DAMP = 0.999;
const WALL_RESTITUTION = 0.28;
const FLOOR_RESTITUTION = 0.12;
const MAX_SPEED = 2200;

export class HopperSim {
  constructor(width, height, { spoutFrac = 0.22, wallPad = 5 } = {}) {
    this.resize(width, height, spoutFrac, wallPad);
    this.particles = [];
    this.nextId = 1;
  }

  resize(width, height, spoutFrac = this.spoutFrac ?? 0.22, wallPad = this.wallPad ?? 5) {
    this.w = width;
    this.h = height;
    this.spoutFrac = spoutFrac;
    this.wallPad = wallPad;
    this.spoutHalf = (width * spoutFrac) / 2;
    this.centerX = width / 2;
  }

  // funnel wall x-bound at a given y (0 = top, h = bottom), for the given side.
  boundAt(y, side) {
    const t = Math.max(0, Math.min(1, y / this.h));
    const topX = side === "l" ? this.wallPad : this.w - this.wallPad;
    const bottomX = side === "l" ? this.centerX - this.spoutHalf : this.centerX + this.spoutHalf;
    return topX + (bottomX - topX) * t;
  }

  add(avatar, x, y, vx, vy, r, img, color) {
    const p = {
      id: this.nextId++,
      avatar,
      x: Math.max(0, Math.min(this.w, x)),
      y: Math.max(-40, Math.min(this.h, y)),
      vx: vx || 0,
      vy: vy || 0,
      r,
      img: img || null,
      color: color || "#c98a4a",
    };
    this.particles.push(p);
    return p;
  }

  // attach a now-loaded image to a still-live particle (drop is instant;
  // the avatar image may finish decoding a moment later).
  attachImage(id, img) {
    const p = this.particles.find((pp) => pp.id === id);
    if (p) p.img = img;
  }

  clear() {
    this.particles.length = 0;
  }

  // Advance physics by dt seconds. `sucking` (bool) pulls particles in the
  // lower half gently toward the spout center, like the grinder drawing
  // beans in once it's running.
  step(dt, sucking) {
    dt = Math.min(dt, 1 / 30); // clamp so a stalled tab doesn't fling everything
    const ps = this.particles;
    for (const p of ps) {
      p.vy += GRAVITY * dt;
      if (sucking && p.y > this.h * 0.45) {
        const pull = ((p.y / this.h) - 0.45) * 3.2;
        p.vx += (this.centerX - p.x) * pull * dt;
        p.vy += 220 * pull * dt;
      }
      p.vx *= AIR_DAMP;
      p.vy *= AIR_DAMP;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > MAX_SPEED) {
        p.vx = (p.vx / sp) * MAX_SPEED;
        p.vy = (p.vy / sp) * MAX_SPEED;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const lb = this.boundAt(p.y, "l") + p.r;
      const rb = this.boundAt(p.y, "r") - p.r;
      if (p.x < lb) {
        p.x = lb;
        if (p.vx < 0) p.vx = -p.vx * WALL_RESTITUTION;
      } else if (p.x > rb) {
        p.x = rb;
        if (p.vx > 0) p.vx = -p.vx * WALL_RESTITUTION;
      }
      const floor = this.h - p.r;
      if (p.y > floor) {
        p.y = floor;
        if (p.vy > 0) p.vy = -p.vy * FLOOR_RESTITUTION;
        p.vx *= 0.9; // friction against the floor
      }
      if (p.y < p.r) {
        p.y = p.r;
        if (p.vy < 0) p.vy = 0;
      }
    }

    // pairwise separation — a few relaxation passes read as a settling
    // pile rather than jittery overlap.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i], b = ps[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const minDist = a.r + b.r;
          const dist2 = dx * dx + dy * dy;
          if (dist2 >= minDist * minDist || dist2 < 1e-6) continue;
          const dist = Math.sqrt(dist2);
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist, ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          // kill the closing velocity along the normal so pairs don't
          // keep re-penetrating and vibrating in place.
          const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          const closing = rvx * nx + rvy * ny;
          if (closing < 0) {
            const impulse = closing * 0.5;
            a.vx += nx * impulse;
            a.vy += ny * impulse;
            b.vx -= nx * impulse;
            b.vy -= ny * impulse;
          }
        }
      }
    }
  }

  // The particle furthest down inside the spout gap — what the grinder
  // would bite into first. Falls back to the overall-lowest particle if
  // nothing has drifted into the gap yet, so a full-but-off-center pile
  // still eventually feeds in.
  lowestInSpout() {
    let best = null;
    for (const p of this.particles) {
      if (Math.abs(p.x - this.centerX) > this.spoutHalf * 1.25) continue;
      if (!best || p.y > best.y) best = p;
    }
    if (best) return best;
    for (const p of this.particles) {
      if (!best || p.y > best.y) best = p;
    }
    return best;
  }

  remove(id) {
    const i = this.particles.findIndex((p) => p.id === id);
    if (i >= 0) this.particles.splice(i, 1);
  }

  render(ctx) {
    ctx.clearRect(0, 0, this.w, this.h);
    for (const p of this.particles) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (p.img) {
        ctx.drawImage(p.img, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      } else {
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
