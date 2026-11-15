// Pure circuit logic for breadboard-555. No DOM here so it can be tested.
//
// A board is a set of nodes: the 555's eight pins (P1..P8) plus the two
// supply rails (VCC, GND). Parts sit between two nodes. Wires merge nodes
// into one net; everything else is an edge between nets.

export const NODES = ["VCC", "GND", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];

// Part kinds. `ohms` / `farads` give resistors and caps their values.
export const KINDS = {
  wire: { label: "wire" },
  res: { label: "resistor" },
  cap: { label: "capacitor" },
  led: { label: "LED" },
  diode: { label: "diode" }, // decoys: they sit there looking busy
  coil: { label: "inductor" },
};

export function fmtOhms(r) {
  if (r >= 1e6) return `${r / 1e6}M`;
  if (r >= 1e3) return `${r / 1e3}k`;
  return `${r}`;
}
export function fmtFarads(c) {
  if (c >= 1e-6) return `${c / 1e-6}µF`;
  if (c >= 1e-9) return `${Math.round(c / 1e-9)}nF`;
  return `${Math.round(c / 1e-12)}pF`;
}

let nextId = 1;
export function newStack() {
  const mk = (kind, extra = {}) => ({ id: nextId++, kind, ...extra });
  const s = [];
  for (let i = 0; i < 7; i++) s.push(mk("wire"));
  for (const r of [1e3, 4.7e3, 10e3, 47e3, 100e3, 470e3]) s.push(mk("res", { ohms: r }));
  for (const c of [10e-9, 100e-9, 1e-6, 10e-6]) s.push(mk("cap", { farads: c }));
  s.push(mk("led"), mk("diode"), mk("coil"));
  return s;
}

class UF {
  constructor() { this.p = new Map(); }
  find(x) {
    if (!this.p.has(x)) this.p.set(x, x);
    let r = x;
    while (this.p.get(r) !== r) r = this.p.get(r);
    this.p.set(x, r);
    return r;
  }
  union(a, b) { this.p.set(this.find(a), this.find(b)); }
}

// placed: [{kind, a, b, ohms?, farads?}]
// Returns { ok, reason, hz?, mode?, missing[] }. `missing` is a list of the
// checklist items still not satisfied, for the on-screen hints.
export function evaluate(placed) {
  const uf = new UF();
  for (const n of NODES) uf.find(n);
  for (const p of placed) if (p.kind === "wire") uf.union(p.a, p.b);
  const net = (n) => uf.find(n);

  const checks = [];
  const check = (label, pass) => checks.push({ label, pass });

  const powered = net("P8") === net("VCC");
  const grounded = net("P1") === net("GND");
  const resetHigh = net("P4") === net("VCC");
  const short = net("VCC") === net("GND");
  check("pin 8 → V+", powered);
  check("pin 1 → GND", grounded);
  check("pin 4 (reset) → V+", resetHigh);
  const tied = net("P2") === net("P6");
  check("pin 2 tied to pin 6", tied);
  const T = net("P6");
  const capOk = placed.some(
    (p) => p.kind === "cap" && ((net(p.a) === T && net(p.b) === net("GND")) || (net(p.b) === T && net(p.a) === net("GND")))
  );
  check("capacitor from pin 6 to GND", capOk);

  const edges = (kind) => placed.filter((p) => p.kind === kind).map((p) => ({ ...p, na: net(p.a), nb: net(p.b) }));
  const rs = edges("res");
  const between = (r, x, y) => (r.na === x && r.nb === y) || (r.na === y && r.nb === x);

  // Charge path A: V+ —R1— pin7 —R2— pin6 (classic astable, f = 1.44/((R1+2R2)C))
  let pathA = null;
  const P7 = net("P7");
  if (P7 !== net("VCC") && P7 !== T && P7 !== net("GND")) {
    for (const r1 of rs) {
      if (!between(r1, net("VCC"), P7)) continue;
      for (const r2 of rs) {
        if (r2 === r1 || !between(r2, P7, T)) continue;
        pathA = { r1: r1.ohms, r2: r2.ohms };
      }
    }
  }
  // Charge path B: output pin 3 —R— pin 6 (feedback oscillator, f ≈ 0.72/RC)
  let pathB = null;
  const P3 = net("P3");
  if (P3 !== T && P3 !== net("GND") && P3 !== net("VCC")) {
    for (const r of rs) if (between(r, P3, T)) pathB = { r: r.ohms };
  }
  check("a resistor route into pin 6 (via pin 7, or from pin 3)", !!(pathA || pathB));

  const cap = placed.find(
    (p) => p.kind === "cap" && ((net(p.a) === T && net(p.b) === net("GND")) || (net(p.b) === T && net(p.a) === net("GND")))
  );
  const missing = checks.filter((c) => !c.pass).map((c) => c.label);
  if (short) return { ok: false, reason: "smoke! V+ and GND are shorted", missing, checks, short: true };
  if (T === net("VCC") || T === net("GND")) return { ok: false, reason: "pin 6 is stuck on a rail", missing, checks };
  if (missing.length) return { ok: false, reason: "not oscillating yet", missing, checks };

  let hz, mode;
  if (pathA) {
    hz = 1.44 / ((pathA.r1 + 2 * pathA.r2) * cap.farads);
    mode = "pin 7 astable";
  } else {
    hz = 0.72 / (pathB.r * cap.farads);
    mode = "pin 3 feedback";
  }
  return { ok: true, reason: "oscillating", hz, mode, missing: [], checks };
}

export function fmtHz(hz) {
  if (hz >= 1e3) return `${(hz / 1e3).toPrecision(3)} kHz`;
  if (hz >= 1) return `${hz.toPrecision(3)} Hz`;
  return `${hz.toPrecision(2)} Hz (${(1 / hz).toPrecision(2)} s period)`;
}
