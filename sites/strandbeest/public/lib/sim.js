// The walking physics. The machine is a rigid body (mass, pitch inertia) standing
// on its feet. Nothing moves the vehicle forward by decree: the crank swings each
// foot through its Jansen path, every foot that touches the ground pushes back on
// the machine (a one-sided contact spring, plus Coulomb friction along the
// ground), and the machine goes wherever those forces take it.
//
// With suspension on, each leg's hip mount is also a mass on a vertical spring
// slide, so the leg falls under gravity and lands on its own. The chassis being
// rigid (no pitching) is a separate switch and works with or without suspension.
import { solveLeg } from "./linkage.js";
import { heightAt, hash } from "./terrain.js";

export const MAX_OMEGA = 10; // rad/s of crank at 100% speed
export const MAX_SUSPENSION = 60; // end stops of a leg's slide (units)
const G = 900; // gravity in world units/s^2 (a leg is ~150 units, call it ~1.5 m)
const MB = 1.5; // chassis mass per leg, in units of one leg's mass
const I_FLOOR = 400; // pitch inertia per unit mass, floor so short machines don't spin up
const K_GROUND = 8000, C_GROUND = 120; // foot against the ground, when the leg is sprung
const K_FOOT = 1500, C_FOOT = 55; // foot against the ground, bolted straight to the chassis
const K_STOP = 4000, C_STOP = 60; // end stops of the suspension slide
// Sand friction. Feet are claws: a foot sliding backward over the sand digs in
// (MU_DIG), a foot sliding forward skims it (MU_SKIM). Without that asymmetry the
// Jansen foot, which grazes the ground while still swinging forward just before it
// plants, drags the machine back as hard as the planted feet push it on.
const MU_DIG = 1.0, MU_SKIM = 0.2, K_FRIC = 300; // K_FRIC: viscous gain until it saturates at MU * normal force
const DRAG = 0.15; // /s, air drag on forward speed
const DAMPING = 0.3; // damping ratio of each leg's spring
const CBODY = 2; // chassis damping per unit of the "body damping" control
const SUBSTEP = 1 / 240; // keeps the stiffest springs stable under semi-implicit Euler
const EPS = 1e-4;
const TOP_LIMIT = 0.7; // max body tilt (slope) at the 100% setting; the slider goes to 500% (slope 3.5, ~74°)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const ground = (S, x) => heightAt(x, S.mode, S.roughS) + S.modeOff;
// World units between neighbouring leg pairs. Legs are ~150 units wide, so they
// overlap; the pitch tightens at high counts to keep the whole machine on screen.
export const pitchFor = (S, pairs) => Math.min(26, 480 / Math.max(1, pairs - 1)) * S.spacing;

// Crank phase of pair k: how the shared shaft is timed along the machine.
export function phaseOf(S, k, pairs) {
  switch (S.phase) {
    case "wave": return (k * Math.PI * 2) / pairs;
    case "alt": return k * Math.PI;
    case "sync": return 0;
    case "random": return hash(k * 53 + 7) * Math.PI;
    default: return k * ((Math.PI * 2) / 3);
  }
}

// Body state lives on S: D (forward position), vx, bodyH/vy (height of the
// chassis centre), slope/w (pitch as a slope, and its rate), ay/al (last accelerations).
export function initBody(S) {
  S.vx = 0; S.vy = 0; S.w = 0; S.ay = 0; S.al = 0; S.slope = 0;
}

function prep(S, list) {
  for (const st of list) {
    const J = solveLeg(S.theta + st.ph).J5, fx = S.D + st.ox + J.x;
    st.fx0 = fx; st.gh0 = ground(S, fx); st.gs = (ground(S, fx + 1) - ground(S, fx - 1)) / 2;
  }
}

function substep(S, list, h, wc, sprung, travel, rest, inertia) {
  const N = list.length, mB = MB * N, g = G * S.gravity;
  const lockPitch = S.rigid || !S.parallel;
  const lim = lockPitch ? 0 : TOP_LIMIT * S.tilt;
  const w = 2 + S.stiff, w2 = w * w, c = 2 * DAMPING * w;
  S.theta += wc * h;
  let Fy = 0, Fx = 0, T = 0;
  for (const st of list) {
    const J5 = solveLeg(S.theta + st.ph).J5, K5 = solveLeg(S.theta + st.ph + EPS).J5;
    const dJx = ((K5.x - J5.x) / EPS) * wc, dJy = ((K5.y - J5.y) / EPS) * wc;
    const line = S.bodyH + S.slope * st.dx;
    const railV = S.vy + S.w * st.dx, railA = S.ay + S.al * st.dx;
    const off = sprung ? st.off : rest, hipV = railV + (sprung ? st.vr : 0);
    const footH = line + off - J5.y, fx = S.D + st.ox + J5.x;
    const pen = st.gh0 + st.gs * (fx - st.fx0) - footH;
    let Nf = 0, Fb;
    if (pen > 0) {
      const prate = st.gs * (S.vx + dJx) - hipV + dJy; // closing speed of foot into ground
      Nf = Math.max(0, (sprung ? K_GROUND : K_FOOT) * pen + (sprung ? C_GROUND : C_FOOT) * prate);
      if (prate > st.impact) st.impact = prate;
    }
    if (sprung) {
      // The ground pushes the leg, the spring pushes the leg back toward the rail,
      // and the rail feels the opposite force.
      let Fr = -w2 * (st.off - rest) - c * st.vr;
      if (st.off > travel) Fr -= K_STOP * (st.off - travel) + C_STOP * Math.max(0, st.vr);
      else if (st.off < -travel) Fr += K_STOP * (-travel - st.off) + C_STOP * Math.max(0, -st.vr);
      st.vr += (-g + Nf + Fr - railA) * h;
      st.off += st.vr * h;
      Fb = -Fr;
    } else Fb = Nf;
    st.pen = pen; st.nf = Nf;
    if (Nf > 0) {
      // A foot that is planted can't slide: friction drives its ground speed to
      // zero, which is what drags the whole machine forward. The normal force
      // also leans back on an uphill face.
      const slip = S.vx + dJx; // foot's ground speed: >0 is sliding forward
      Fx += (slip < 0 ? Math.min(-K_FRIC * slip, MU_DIG * Nf) : -Math.min(K_FRIC * slip, MU_SKIM * Nf)) - Nf * st.gs;
    }
    Fy += Fb; T += Fb * st.dx;
  }
  S.ay = Fy / mB - g - CBODY * S.bodyRate * 0.25 * S.vy;
  S.al = lim > 0 ? T / inertia - CBODY * S.bodyRate * 0.25 * S.w : 0;
  S.vy += S.ay * h; S.bodyH += S.vy * h;
  S.w += S.al * h; S.slope += S.w * h;
  if (lim === 0) { S.slope = 0; S.w = 0; }
  else if (Math.abs(S.slope) > lim) { S.slope = Math.sign(S.slope) * lim; S.w = 0; }
  S.vx += (Fx / mB - DRAG * S.vx) * h;
  S.D += S.vx * h;
}

// One frame. `snap` (first frame, or reset) puts the machine on the ground and
// lets it settle at rest before anything is drawn. Returns the legs to draw and
// calls hooks.touchdown(x, y, side, impact) on each foot's first contact.
export function step(S, dt, snap, hooks) {
  const pairs = S.legs / 2, N = S.legs;
  S.roughS += (S.rough - S.roughS) * (1 - Math.exp(-4 * dt));
  S.modeOff *= Math.exp(-0.25 * dt);
  const wc = S.running ? S.speed * MAX_OMEGA : 0;
  if (S.running) S.time += dt;

  const pitch = pitchFor(S, pairs);
  const list = [];
  let inertia = 0;
  for (let k = 0; k < pairs; k++) {
    for (const side of [0, 1]) {
      const arr = side ? S.far : S.near;
      const st = arr[k] || (arr[k] = { off: 0, vr: 0, contact: false, impact: 0 });
      st.k = k; st.side = side; st.dx = (k - (pairs - 1) / 2) * pitch; st.ox = st.dx + 60;
      // Opposite sides of a pair run half a cycle apart, so one foot is always down.
      st.ph = phaseOf(S, k, pairs) + side * Math.PI;
      list.push(st);
      inertia += MB * st.dx * st.dx;
    }
  }
  S.near.length = Math.min(S.near.length, pairs); S.far.length = Math.min(S.far.length, pairs);
  inertia += MB * N * I_FLOOR;

  const travel = MAX_SUSPENSION * S.travel, sprung = S.suspension && travel > 1;
  const rest = sprung ? clamp(-S.ride, -travel, travel) : -S.ride;

  if (snap || S.bodyH === null) {
    initBody(S);
    let need = -Infinity;
    for (const st of list) {
      const J5 = solveLeg(S.theta + st.ph).J5;
      need = Math.max(need, ground(S, S.D + st.ox + J5.x) + J5.y);
      st.off = rest; st.vr = 0; st.contact = false;
    }
    S.bodyH = need - rest;
    S.cam = S.bodyH; S.alt0 = S.alt0 || S.bodyH;
    prep(S, list);
    for (let i = 0; i < 480; i++) substep(S, list, SUBSTEP, 0, sprung, travel, rest, inertia);
    S.vx = 0;
    for (const st of list) st.contact = st.nf > 0;
    S.cam = S.bodyH;
  }

  prep(S, list);
  const n = clamp(Math.ceil(dt / SUBSTEP), 1, 12), h = dt / n;
  for (const st of list) st.impact = 0;
  for (let i = 0; i < n; i++) substep(S, list, h, wc, sprung, travel, rest, inertia);

  // Camera trails the body so climbs read as climbs; it never pins the machine.
  S.cam += (S.bodyH - S.cam) * (1 - Math.exp(-0.9 * dt));

  const legs = [];
  for (const st of list) {
    const J = solveLeg(S.theta + st.ph);
    const hx = S.D + st.ox, line = S.bodyH + S.slope * st.dx;
    const off = sprung ? st.off : rest, hipH = line + off;
    const footX = hx + J.J5.x, footH = hipH - J.J5.y;
    // Lift-off needs a small gap so a foot resting on the ground doesn't chatter.
    const down = st.nf > 0 || (st.contact && st.pen > -1.5);
    if (down && !st.contact && S.running && hooks) hooks.touchdown(footX, footH, st.side, st.impact);
    st.contact = down;
    legs.push({ k: st.k, side: st.side, J, hx, line, hipH, off, footX, footH });
  }
  return legs;
}
