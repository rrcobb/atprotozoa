// The ecology. Pure logic, no DOM, so it can run under node (tests/sim.test.mjs).
//
// Fitness is never an input: a post becomes an organism with a palate (which of
// four nutrients it eats), a size, a speed and a lifespan taken from its text,
// and then the tank decides. Nutrients regrow in drifting blooms, so what thrives
// depends on what else is alive.

export const W = 1000, H = 600;          // tank coordinates; the canvas scales them
export const GW = 14, GH = 8;            // nutrient grid
export const NUT = 4;                    // nutrient kinds
// Render cost bound: the canvas redraws every organism every frame. This is a
// browser-performance limit, not a data cap — the tank starves things long
// before it gets here, and arrivals are simply refused while it is full.
export const MAX_ORGS = 520;

const STOP = new Set("the and for that this with have from your you are was but not just they them their what when which about would there been were will can its our out all has had how who why get got one very into than then also more some only like".split(" "));

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function words(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}#@']{2,}/gu) || []);
}

// Post text -> inherited traits.
export function traitsFor(post) {
  const text = post.text || "";
  const ws = words(text).filter((w) => !STOP.has(w));
  const palate = new Array(NUT).fill(0);
  for (const w of ws) palate[hash(w) % NUT] += 1;
  const tot = palate.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < NUT; i++) palate[i] /= tot;
  const uniq = new Set(ws).size;
  const diversity = ws.length ? uniq / ws.length : 0.5;
  const len = text.length;
  const hasLink = /https?:\/\//.test(text) || post.hasEmbed;
  const questions = (text.match(/\?/g) || []).length;
  const shouts = (text.match(/!/g) || []).length + (text.match(/\p{Extended_Pictographic}/gu) || []).length;
  const diet = questions >= 2 || (questions && len > 120) ? "predator" : post.isReply ? "scavenger" : hasLink ? "filter" : "grazer";
  return {
    palate,
    size: 5 + Math.min(14, Math.sqrt(len) * 0.9),
    speed: 14 + Math.min(40, shouts * 7) + (diet === "predator" ? 12 : 0),
    lifespan: 200 + 420 * diversity + (hasLink ? 60 : 0),
    diet,
    diversity,
    keywords: [...new Set(ws.filter((w) => w.length > 4))].slice(0, 4),
  };
}

let nextId = 1;

export class Tank {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.t = 0;
    this.orgs = [];
    this.food = Array.from({ length: GW * GH }, () => new Array(NUT).fill(0.6));
    this.phase = Array.from({ length: NUT }, () => rng() * 6.28);
    this.freq = Array.from({ length: NUT }, () => 0.01 + rng() * 0.02);
    this.stats = { born: 0, bred: 0, died: { starvation: 0, eaten: 0, "old age": 0, crowding: 0 } };
    this.events = [];
    this.onDeath = null;
  }

  log(msg) { this.events.push({ t: this.t, msg }); if (this.events.length > 60) this.events.shift(); }

  bloom(k) { return 0.5 + 0.5 * Math.sin(this.t * this.freq[k] + this.phase[k]); }

  // A real post enters the tank. Returns the organism, or null if the tank is full.
  admit(post) {
    if (this.orgs.length >= MAX_ORGS) return null;
    const tr = traitsFor(post);
    const o = {
      id: nextId++, post, ...tr,
      x: this.rng() * W, y: this.rng() * H,
      a: this.rng() * 6.28, energy: 2.2, born: this.t, children: 0, eaten: 0,
      descendant: false, parent: null, alive: true, cell: 0,
    };
    this.orgs.push(o);
    this.stats.born++;
    return o;
  }

  cellAt(x, y) {
    const cx = Math.min(GW - 1, Math.max(0, Math.floor((x / W) * GW)));
    const cy = Math.min(GH - 1, Math.max(0, Math.floor((y / H) * GH)));
    return cy * GW + cx;
  }

  kill(o, cause, by) {
    if (!o.alive) return;
    o.alive = false; o.cause = cause; o.diedAt = this.t; o.killer = by || null;
    this.stats.died[cause] = (this.stats.died[cause] || 0) + 1;
    if (this.onDeath) this.onDeath(o);
  }

  step(dt) {
    this.t += dt;
    // regrowth: each nutrient blooms on its own slow cycle, and each cell leans a
    // little differently so blooms have geography.
    for (let c = 0; c < this.food.length; c++) {
      const f = this.food[c];
      const gx = c % GW, gy = (c / GW) | 0;
      for (let k = 0; k < NUT; k++) {
        const lean = 0.6 + 0.4 * Math.sin(gx * 0.7 + k * 1.9 + gy * 0.5 + this.t * 0.004);
        f[k] = Math.min(1.5, f[k] + 0.05 * this.bloom(k) * lean * dt);
      }
    }
    const cellCount = new Map();
    for (const o of this.orgs) {
      o.cell = this.cellAt(o.x, o.y);
      cellCount.set(o.cell, (cellCount.get(o.cell) || 0) + 1);
    }
    const born = [];
    for (const o of this.orgs) {
      if (!o.alive) continue;
      const f = this.food[o.cell];
      // eat: palate-weighted, shared out among everyone in the cell
      const share = 1 / (cellCount.get(o.cell) || 1);
      let gain = 0;
      for (let k = 0; k < NUT; k++) {
        const want = o.palate[k] * 0.55 * o.size * 0.1 * dt;
        const take = Math.min(f[k], want * Math.max(share, 0.25));
        f[k] -= take; gain += take * 4.6;
      }
      o.energy += gain - (0.06 + o.size * 0.012) * dt;

      // swim toward the richest neighbouring cell for this palate, plus wander
      const gx = o.cell % GW, gy = (o.cell / GW) | 0;
      let best = -1, bx = gx, by = gy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const nf = this.food[ny * GW + nx];
        let s = 0; for (let k = 0; k < NUT; k++) s += nf[k] * o.palate[k];
        s /= 1 + 0.15 * (cellCount.get(ny * GW + nx) || 0);
        if (s > best) { best = s; bx = nx; by = ny; }
      }
      const tx = ((bx + 0.5) / GW) * W, ty = ((by + 0.5) / GH) * H;
      const want = Math.atan2(ty - o.y, tx - o.x);
      let d = want - o.a; d = Math.atan2(Math.sin(d), Math.cos(d));
      o.a += d * 0.6 * dt + (this.rng() - 0.5) * 1.6 * dt;
      o.x += Math.cos(o.a) * o.speed * dt; o.y += Math.sin(o.a) * o.speed * dt;
      if (o.x < 0 || o.x > W) { o.a = Math.PI - o.a; o.x = Math.min(W, Math.max(0, o.x)); }
      if (o.y < 0 || o.y > H) { o.a = -o.a; o.y = Math.min(H, Math.max(0, o.y)); }

      // reproduction: a simulated descendant, never an authored post
      if (o.energy > 4.2 && this.orgs.length + born.length < MAX_ORGS) {
        o.energy /= 2; o.children++;
        const kid = {
          ...o, id: nextId++, descendant: true, parent: o.parent || o.id, rootPost: o.post,
          size: Math.max(4, o.size * (0.9 + this.rng() * 0.2)),
          speed: Math.max(8, o.speed * (0.85 + this.rng() * 0.3)),
          palate: mutatePalate(o.palate, this.rng),
          x: o.x + (this.rng() - 0.5) * 12, y: o.y + (this.rng() - 0.5) * 12,
          born: this.t, children: 0, eaten: 0, alive: true,
        };
        born.push(kid); this.stats.bred++;
      }
    }
    // predation: a predator that touches a smaller organism with a different palate eats it
    for (const p of this.orgs) {
      if (!p.alive || p.diet !== "predator") continue;
      for (const q of this.orgs) {
        if (!q.alive || q === p || q.size >= p.size * 0.8) continue;
        const dx = p.x - q.x, dy = p.y - q.y;
        if (dx * dx + dy * dy < (p.size + q.size) ** 2 * 2 && dot(p.palate, q.palate) < 0.8 && this.rng() < 0.8 * dt) {
          p.energy += Math.min(2.5, q.energy * 0.6 + 0.5); p.eaten++;
          this.kill(q, "eaten", p);
        }
      }
    }
    for (const o of this.orgs) {
      if (!o.alive) continue;
      if (o.energy <= 0) this.kill(o, "starvation");
      else if (this.t - o.born > o.lifespan) this.kill(o, "old age");
    }
    // crowding: if a cell is packed, the weakest there is squeezed out
    for (const [cell, n] of cellCount) {
      if (n < 14) continue;
      let w = null;
      for (const o of this.orgs) if (o.alive && o.cell === cell && (!w || o.energy < w.energy)) w = o;
      if (w && this.rng() < 0.4 * dt) this.kill(w, "crowding");
    }
    this.orgs = this.orgs.filter((o) => o.alive).concat(born);
    this.notice();
  }

  notice() {
    if (((this.t * 10) | 0) % 50 !== 0 || this._noticed === ((this.t * 10) | 0)) return;
    this._noticed = (this.t * 10) | 0;
    const n = this.orgs.length;
    if (!n) return;
    const diet = {};
    for (const o of this.orgs) diet[o.diet] = (diet[o.diet] || 0) + 1;
    const dom = Math.max(...this.food.map(() => 0), ...Array.from({ length: NUT }, (_, k) => this.bloom(k)));
    for (let k = 0; k < NUT; k++) if (this.bloom(k) === dom && dom > 0.93) this.log(`The tank is experiencing a bloom of nutrient ${"ABCD"[k]}.`);
    if ((diet.predator || 0) > n * 0.25) this.log("Predators are outnumbering the grazers. This will not last.");
    const oldest = this.orgs.filter((o) => !o.descendant).sort((a, b) => a.born - b.born)[0];
    if (oldest && this.t - oldest.born > 240 && this._oldest !== oldest.id) {
      this._oldest = oldest.id;
      this.log(`An original organism has outlived most of its cohort (${fmt(this.t - oldest.born)}).`);
    }
  }
}

function dot(a, b) {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return s / (Math.sqrt(na * nb) || 1);
}

function mutatePalate(p, rng) {
  const q = p.map((v) => Math.max(0, v + (rng() - 0.5) * 0.12));
  const s = q.reduce((a, b) => a + b, 0) || 1;
  return q.map((v) => v / s);
}

export function fmt(sec) {
  sec = Math.round(sec);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`;
}

export const HUES = [160, 45, 290, 205];
// colour of a palate: blend of the four nutrient hues, weighted
export function hueOf(palate) {
  let x = 0, y = 0;
  palate.forEach((v, k) => { x += v * Math.cos((HUES[k] * Math.PI) / 180); y += v * Math.sin((HUES[k] * Math.PI) / 180); });
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
