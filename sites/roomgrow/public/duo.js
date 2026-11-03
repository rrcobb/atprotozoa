// roomgrow/duo: "Self-Portrait in Amp Light", redrawn as two. The panel-stack that
// is rooms.anthonybecker.me and the little builder that is @buildthis, side by side
// at one drafting table. Pure functions, no I/O: runs in the page and in Node.

export const DUO_NAME = "Duo in Amp Light";

// Spatial sounds for the room (the API's own limit is 8 emitters). Amps hum, sparks crackle,
// the lattice pulses on a beat.
export const DUO_EMITTERS = [
  { sound: "hum", pos: [-3.6, 1.2, -2.0], gain: 0.5, pitch: 0.8 },
  { sound: "hum", pos: [3.6, 1.2, -2.0], gain: 0.45, pitch: 0.95 },
  { sound: "crackle", pos: [0, 1.4, 0], gain: 0.45, pitch: 1.1 },
  { sound: "pulse", pos: [0, 3.4, 0], gain: 0.5, pitch: 0.7 },
  { sound: "drone", pos: [0, 2, 3], gain: 0.35, pitch: 0.6 },
];

const SDF = `// roomgrow duo · two figures at one drafting table
fn rg_sphere(q: vec3f, r: f32) -> f32 { return length(q) - r; }
fn rg_box(q: vec3f, b: vec3f) -> f32 { let d = abs(q) - b; return length(max(d, vec3f(0.0))) + min(max(d.x, max(d.y, d.z)), 0.0); }
fn rg_pillar(q: vec3f, r: f32, h: f32) -> f32 { let d = vec2f(length(q.xz) - r, abs(q.y) - h); return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0))); }
fn rg_torus(q: vec3f, big: f32, small: f32) -> f32 { let t = vec2f(length(q.xz) - big, q.y); return length(t) - small; }
fn rg_tint(id: f32) -> vec3f { return 0.5 + 0.5 * cos(6.28318 * (id + vec3f(0.0, 0.33, 0.67))); }
fn rg_put(best: vec2f, d: f32, id: f32) -> vec2f { if (d < best.x) { return vec2f(d, id); } return best; }
`;

// Colour ids go through rg_tint: 0.45 monitor blue, 0.55 glass teal, 0.92 amber, 0.82 the builder's magenta.
const SCENE = `
fn rg_scene(p: vec3f) -> vec2f {
    let t = time();
    let beat = 0.5 + 0.5 * sin(t * 4.4);
    var best = vec2f(1e5, 0.0);
    // the drafting table, tilted a little toward the viewer
    var tq = p - vec3f(0.0, 1.0, 0.0);
    tq = vec3f(tq.x, tq.y + tq.z * 0.18, tq.z);
    best = rg_put(best, rg_box(tq, vec3f(0.95, 0.04, 0.6)), 0.92);
    best = rg_put(best, rg_pillar(p - vec3f(-0.7, 0.5, 0.0), 0.05, 0.5), 0.92);
    best = rg_put(best, rg_pillar(p - vec3f(0.7, 0.5, 0.0), 0.05, 0.5), 0.92);
    // the panel stack (left): glass panels rising from a plinth, each leaning a bit further over the table
    for (var i = 0; i < 7; i = i + 1) {
        let k = f32(i);
        let w = 0.62 - k * 0.045;
        let lean = 0.07 * k * k * 0.25 + 0.04 * sin(t * 0.9 + k * 0.5);
        let c = p - vec3f(-1.75 + lean, 0.3 + k * 0.27, 0.0);
        best = rg_put(best, rg_box(c, vec3f(w * 0.5, 0.05, w * 0.7)), 0.55);
    }
    // a lit doorway in the top panel
    best = rg_put(best, rg_box(p - vec3f(-1.45, 2.3, 0.0), vec3f(0.06, 0.12, 0.05)), 0.92);
    // the builder (right): body, head, antenna, a welding arm that points at the table
    let bob = 0.04 * sin(t * 2.2);
    best = rg_put(best, rg_box(p - vec3f(1.75, 0.95 + bob, 0.0), vec3f(0.34, 0.5, 0.26)), 0.82);
    best = rg_put(best, rg_box(p - vec3f(1.75, 1.78 + bob, 0.0), vec3f(0.3, 0.24, 0.26)), 0.82);
    best = rg_put(best, rg_sphere(p - vec3f(1.62, 1.82 + bob, 0.27), 0.07), 0.92);
    best = rg_put(best, rg_sphere(p - vec3f(1.88, 1.82 + bob, 0.27), 0.07), 0.92);
    best = rg_put(best, rg_pillar(p - vec3f(1.75, 2.2 + bob, 0.0), 0.025, 0.14), 0.82);
    best = rg_put(best, rg_sphere(p - vec3f(1.75, 2.38 + bob + 0.05 * beat, 0.0), 0.06 + 0.03 * beat), 0.92);
    var aq = p - vec3f(1.15, 1.25 + bob, 0.0);
    let ar = rot2(0.6) * aq.xy;
    aq = vec3f(ar.x, ar.y, aq.z);
    best = rg_put(best, rg_box(aq, vec3f(0.5, 0.045, 0.045)), 0.82);
    // sparks off the weld point, each cycling on its own phase
    for (var j = 0; j < 6; j = j + 1) {
        let u = f32(j);
        let ph = fract(t * 0.5 + u * 0.167);
        let sp = vec3f(0.55 - ph * 1.1 * (0.4 + 0.15 * u), 1.1 + ph * (1.2 + 0.2 * u) - ph * ph * 1.4, 0.15 * sin(u * 2.3 + ph * 6.0));
        best = rg_put(best, rg_sphere(p - sp, 0.035), 0.92);
    }
    // rooms forming: little cubes with a lit door, orbiting up into the lattice
    for (var m = 0; m < 5; m = m + 1) {
        let u = f32(m);
        let a = t * (0.35 + 0.05 * u) + u * 1.256;
        let c = vec3f(1.9 * cos(a), 2.7 + 0.35 * sin(a * 1.7 + u), 1.4 * sin(a));
        var cq = p - c;
        let cr = rot2(a) * cq.xz;
        cq = vec3f(cr.x, cq.y, cr.y);
        best = rg_put(best, rg_box(cq, vec3f(0.14)), 0.45);
        best = rg_put(best, rg_box(cq - vec3f(0.0, -0.04, 0.13), vec3f(0.05, 0.08, 0.02)), 0.92);
    }
    // the pulsing blue lattice overhead
    best = rg_put(best, rg_torus(p - vec3f(0.0, 3.5, 0.0), 2.4 + 0.1 * beat, 0.025), 0.45);
    best = rg_put(best, rg_torus(p - vec3f(0.0, 3.5, 0.0), 1.5 - 0.08 * beat, 0.02), 0.45);
    // amps (amber) on the left wall side, monitors (blue) on the right
    for (var n = 0; n < 3; n = n + 1) {
        let u = f32(n);
        best = rg_put(best, rg_box(p - vec3f(-3.7, 0.5 + u * 0.82, -2.0 + u * 0.2), vec3f(0.42, 0.4, 0.3)), 0.92);
        best = rg_put(best, rg_box(p - vec3f(3.7, 0.9 + u * 0.55, -2.0 - u * 0.1), vec3f(0.06, 0.26 - u * 0.03, 0.4)), 0.45);
    }
    return best;
}

fn rg_sky(rd: vec3f) -> vec3f {
    let n = fbm3(rd * 2.0 + vec3f(0.0, 0.0, time() * 0.02));
    return vec3f(0.03, 0.03, 0.05) * (0.5 + 0.5 * rd.y) + vec3f(0.35, 0.18, 0.05) * pow(n, 3.0);
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
        return Hit(tone(vec3f(0.05, 0.04, 0.06) + vec3f(0.1, 0.3, 0.9) * line * 0.35 + glow), tf);
    }
    return Hit(tone(rg_sky(rd) + glow), horizon_t(tmax));
}
`;

export function renderDuo() {
  return SDF + SCENE;
}

// Saves the duo into a room over a plain GET (same contract as roomgrow's saveUrl).
export function duoSaveUrl(base, room) {
  const q = [`x=${room.x}`, `y=${room.y}`, "confirm=1", `name=${encodeURIComponent(DUO_NAME)}`];
  if (room.key) q.push("key=" + encodeURIComponent(room.key));
  q.push("audio=" + encodeURIComponent(JSON.stringify(DUO_EMITTERS)));
  q.push("wgsl=" + encodeURIComponent(renderDuo()));
  return `${base}/api/agent/set_shader?${q.join("&")}`;
}
