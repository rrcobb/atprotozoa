// roomgrow generator: pure functions, no I/O. Runs in the page and in Node.
// A room is a list of objects + sound emitters. step() makes one small change
// (add, tweak, retire, retune a sound, rename); render() turns the state into WGSL.

export const MAX_OBJECTS = 28; // GPU budget: every object is evaluated at every march step of every pixel
export const MAX_EMITTERS = 8; // the API's own limit on emitters per room
const SOUNDS = ["drone", "wind", "waves", "rain", "hum", "chimes", "bubbles", "crackle", "birds", "pulse", "musicbox", "space"];
const ADJ = ["Salt", "Quiet", "Amber", "Hollow", "Tidal", "Velvet", "Slow", "Glass", "Mossy", "Lunar", "Brass", "Pale", "Drifting", "Embered"];
const NOUN = ["Orrery", "Atrium", "Cistern", "Loft", "Grotto", "Gallery", "Conservatory", "Cellar", "Rotunda", "Archive", "Foundry", "Lantern Hall"];
const KINDS = ["sphere", "box", "pillar", "torus"];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => (Math.round(n * 100) / 100).toFixed(2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap01 = (v) => ((v % 1) + 1) % 1;

export function init(seed = 1) {
  const rng = mulberry32(seed * 7919 + 13);
  return { seed, tick: 0, hue: rng(), objects: [], emitters: [], name: title(rng) };
}

function title(rng) {
  return ADJ[Math.floor(rng() * ADJ.length)] + " " + NOUN[Math.floor(rng() * NOUN.length)];
}

// extent = how far the object reaches above and below its centre, so it stays off the floor
function extent(o) {
  return o.kind === "pillar" ? o.h : o.kind === "torus" ? o.r2 + 0.1 : o.kind === "box" ? o.s * 1.74 : o.s;
}

function place(o, rng) {
  // the doorways are centred on each wall; keep their lanes clear
  for (let i = 0; i < 20; i++) {
    o.x = (rng() - 0.5) * 9.2;
    o.z = (rng() - 0.5) * 9.2;
    if (!((Math.abs(o.x) < 1.4 && Math.abs(o.z) > 3.0) || (Math.abs(o.z) < 1.4 && Math.abs(o.x) > 3.0))) break;
  }
  const lift = o.kind === "pillar" ? 0 : rng() * 2.4;
  o.y = o.kind === "pillar" ? o.h : extent(o) + o.bob + lift;
  if (o.kind === "torus") o.y = Math.max(o.y, 1.0 + rng() * 2.2);
  return o;
}

function newObject(state, rng) {
  const kind = KINDS[Math.floor(rng() * KINDS.length)];
  const o = {
    kind,
    hue: wrap01(state.hue + (rng() - 0.5) * 0.5),
    s: 0.25 + rng() * 0.55,
    h: 0.8 + rng() * 1.3,
    r2: 0.06 + rng() * 0.08,
    bob: kind === "pillar" ? 0 : rng() * 0.25,
    spd: 0.2 + rng() * 0.9,
    ph: rng() * 6.28,
    x: 0, y: 0, z: 0,
  };
  if (kind === "pillar") o.s = 0.15 + rng() * 0.25;
  if (kind === "torus") o.s = 0.4 + rng() * 0.6;
  return place(o, rng);
}

function newEmitter(rng) {
  return {
    sound: SOUNDS[Math.floor(rng() * SOUNDS.length)],
    pos: [+((rng() - 0.5) * 9).toFixed(1), +(0.5 + rng() * 3).toFixed(1), +((rng() - 0.5) * 9).toFixed(1)],
    gain: +(0.25 + rng() * 0.4).toFixed(2),
    pitch: +(0.7 + rng() * 0.7).toFixed(2),
  };
}

// One elaboration. `salt` changes the dice when a previous roll failed to compile.
// `grow: false` (the room is over its GPU budget) means no new objects, only changes.
export function step(prev, { salt = 0, grow = true } = {}) {
  const state = JSON.parse(JSON.stringify(prev));
  const rng = mulberry32(state.seed * 104729 + state.tick * 31 + salt * 977 + 1);
  const roll = rng();
  const full = state.objects.length >= MAX_OBJECTS;
  let what;
  if (state.objects.length === 0) {
    state.objects.push(newObject(state, rng)); what = "added the first " + state.objects[0].kind;
  } else if (roll < 0.5 && grow && !full) {
    const o = newObject(state, rng); state.objects.push(o); what = "added a " + o.kind;
  } else if (roll < 0.6 && full) {
    const old = state.objects.shift(); const o = newObject(state, rng); state.objects.push(o);
    what = "retired the oldest " + old.kind + ", added a " + o.kind;
  } else if (roll < 0.82) {
    const o = state.objects[Math.floor(rng() * state.objects.length)];
    const which = Math.floor(rng() * 4);
    if (which === 0) { o.x = clamp(o.x + (rng() - 0.5) * 1.6, -5, 5); o.z = clamp(o.z + (rng() - 0.5) * 1.6, -5, 5); }
    else if (which === 1) { o.s = clamp(o.s * (0.8 + rng() * 0.45), 0.15, 1.1); if (o.kind === "pillar") o.h = clamp(o.h * (0.85 + rng() * 0.4), 0.6, 2.2); }
    else if (which === 2) o.hue = wrap01(o.hue + (rng() - 0.5) * 0.25);
    else o.spd = clamp(o.spd * (0.6 + rng() * 0.9), 0.1, 1.6);
    o.y = Math.max(o.y, o.kind === "pillar" ? o.h : extent(o) + o.bob);
    what = "tweaked a " + o.kind;
  } else if (roll < 0.94) {
    if (state.emitters.length < MAX_EMITTERS && (state.emitters.length < 2 || rng() < 0.5)) {
      const e = newEmitter(rng); state.emitters.push(e); what = "added " + e.sound;
    } else if (state.emitters.length) {
      const e = state.emitters[Math.floor(rng() * state.emitters.length)];
      e.gain = +clamp(e.gain + (rng() - 0.5) * 0.2, 0.1, 0.8).toFixed(2);
      e.pitch = +clamp(e.pitch * (0.85 + rng() * 0.3), 0.5, 1.6).toFixed(2);
      what = "retuned " + e.sound;
    } else what = "waited";
  } else if (roll < 0.97) {
    state.hue = wrap01(state.hue + (rng() - 0.5) * 0.15); what = "shifted the mood";
  } else {
    state.name = title(rng); what = "renamed the room to " + state.name;
  }
  state.tick += 1;
  return { state, what };
}

// Replay `n` steps from a seed (what the page's slider does).
export function replay(seed, n) {
  let s = init(seed);
  for (let i = 0; i < n; i++) s = step(s).state;
  return s;
}

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const k = (n) => { const m = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(m - 3, 9 - m, 1)); };
  return [k(0), k(8), k(4)];
}
const vec = (c) => `vec3f(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;

function objectSnippet(o) {
  const c = `p - vec3f(${f(o.x)}, ${f(o.y)} + ${f(o.bob)} * sin(time() * ${f(o.spd)} + ${f(o.ph)}), ${f(o.z)})`;
  const hit = `if (d < best.x) { best = vec2f(d, ${f(o.hue)}); }`;
  switch (o.kind) {
    case "sphere": return `    { let d = rg_sphere(${c}, ${f(o.s)}); ${hit} }`;
    case "box": return `    { var q = ${c}; let xz = rot2(time() * ${f(o.spd)} + ${f(o.ph)}) * q.xz; q = vec3f(xz.x, q.y, xz.y); let d = rg_box(q, vec3f(${f(o.s)}, ${f(o.s * 0.8)}, ${f(o.s)})); ${hit} }`;
    case "pillar": return `    { let d = rg_pillar(${c}, ${f(o.s)}, ${f(o.h)}); ${hit} }`;
    default: return `    { var q = ${c}; let yz = rot2(time() * ${f(o.spd)} + ${f(o.ph)}) * q.yz; q = vec3f(q.x, yz.x, yz.y); let d = rg_torus(q, ${f(o.s)}, ${f(o.r2)}); ${hit} }`;
  }
}

export function render(state) {
  const a = hsl(state.hue, 0.55, 0.12);
  const b = hsl(wrap01(state.hue + 0.18), 0.7, 0.22);
  const parts = state.objects.map(objectSnippet).join("\n");
  return `// roomgrow · ${state.name} · tick ${state.tick} · ${state.objects.length} objects
fn rg_sphere(q: vec3f, r: f32) -> f32 { return length(q) - r; }
fn rg_box(q: vec3f, b: vec3f) -> f32 { let d = abs(q) - b; return length(max(d, vec3f(0.0))) + min(max(d.x, max(d.y, d.z)), 0.0); }
fn rg_pillar(q: vec3f, r: f32, h: f32) -> f32 { let d = vec2f(length(q.xz) - r, abs(q.y) - h); return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0))); }
fn rg_torus(q: vec3f, big: f32, small: f32) -> f32 { let t = vec2f(length(q.xz) - big, q.y); return length(t) - small; }
fn rg_tint(id: f32) -> vec3f { return 0.5 + 0.5 * cos(6.28318 * (id + vec3f(0.0, 0.33, 0.67))); }

fn rg_scene(p: vec3f) -> vec2f {
    var best = vec2f(1e5, 0.0);
${parts}
    return best;
}

fn rg_sky(rd: vec3f) -> vec3f {
    let n = fbm3(rd * 2.0 + vec3f(0.0, 0.0, time() * 0.02));
    return ${vec(a)} * (0.5 + 0.5 * rd.y) + ${vec(b)} * pow(n, 3.0);
}

fn shade(ro: vec3f, rd: vec3f, tmin: f32, tmax: f32) -> Hit {
    let tf = plane_y(ro, rd, 0.0);
    var tend = tmax;
    if (tf > 0.0) { tend = min(tend, tf); }
    var t = tmin;
    var glow = vec3f(0.0);
    let steps = i32(20.0 + 36.0 * quality());
    for (var i = 0; i < steps; i = i + 1) {
        let p = ro + rd * t;
        let s = rg_scene(p);
        glow += rg_tint(s.y) * 0.003 / (0.05 + s.x * s.x * 20.0);
        if (s.x < 0.004) {
            let e = vec2f(0.003, -0.003);
            let n = normalize(e.xyy * rg_scene(p + e.xyy).x + e.yyx * rg_scene(p + e.yyx).x + e.yxy * rg_scene(p + e.yxy).x + e.xxx * rg_scene(p + e.xxx).x);
            let l = normalize(vec3f(0.0, 4.0, 0.0) - p);
            let lit = 0.25 + 0.75 * max(dot(n, l), 0.0);
            let rim = pow(1.0 - abs(dot(n, rd)), 3.0);
            let base = rg_tint(s.y);
            return Hit(tone(base * lit + base * rim * 0.6 + glow), t);
        }
        t += max(s.x, 0.01);
        if (t > tend) { break; }
    }
    if (tf > 0.0 && tf <= tmax + 0.01) {
        let q = (ro + rd * tf).xz;
        let g = abs(fract(q * 0.5 + 0.5) - 0.5) * 2.0;
        let line = 1.0 - smoothstep(0.0, 0.05, min(g.x, g.y));
        return Hit(tone(${vec(a)} * 0.6 + ${vec(b)} * line * 0.35 + glow), tf);
    }
    return Hit(tone(rg_sky(rd) + glow), horizon_t(tmax));
}
`;
}

// The URL that saves a state into a room over a plain GET: no token, no headers, no JSON body.
// GET calls that change the world need confirm=1. The edit key (from the build answer) lets the
// same visitor keep editing from another address; it is left out when there is none.
export function saveUrl(base, room, state) {
  const q = [`x=${room.x}`, `y=${room.y}`, "confirm=1", `name=${encodeURIComponent(state.name)}`];
  if (room.key) q.push("key=" + encodeURIComponent(room.key));
  if (state.emitters.length) q.push("audio=" + encodeURIComponent(JSON.stringify(state.emitters)));
  q.push("wgsl=" + encodeURIComponent(render(state)));
  return `${base}/api/agent/set_shader?${q.join("&")}`;
}

// Pulls x, y and the edit key out of whatever the visitor pastes: the JSON that build answers,
// or two numbers like "3 -1" / "3,-1".
export function parseRoom(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  try {
    const j = JSON.parse(t);
    if (Number.isInteger(j.x) && Number.isInteger(j.y)) return { x: j.x, y: j.y, key: typeof j.key === "string" ? j.key : "" };
  } catch {}
  const m = t.match(/(-?\d+)\D+?(-?\d+)/);
  const key = (t.match(/rwk1_[A-Za-z0-9_-]+/) || [""])[0];
  return m ? { x: Number(m[1]), y: Number(m[2]), key } : null;
}
