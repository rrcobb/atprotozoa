// Built-in hyperstreet plugins. Every visible thing on the Street is one of
// these; the renderer only draws sky, road and bare buildings. A plugin is:
//
//   { id, name, desc,
//     init(world), onEvent(ev, world),          // react to the firehose
//     drawEnt(g, view, ent, box),               // decorate each visible building
//     drawOverlay(g, view, world),              // draw across the whole scene
//     commands: { name: { help, run(args, world) -> string | string[] } } }
//
// No DOM at import time: this file also loads in node for the CLI, where draw
// hooks are simply never called. Draw hooks get a `view` (see render.js) with
// view.project(x, y, z), view.entTop(ent), view.now, view.dt.

import { duel } from "./world.js";

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// ---- signs: every post floats above its author's building ----
export const signs = {
  id: "signs",
  name: "post signs",
  desc: "posts float above their author's building as neon signs for a few seconds",
  drawEnt(g, view, e, box) {
    if (!e.signs.length || box.k < 1.6) return;
    const maxFont = Math.min(22, 7 + box.k * 0.5);
    let row = 0;
    for (let i = e.signs.length - 1; i >= 0; i--) {
      const s = e.signs[i];
      const age = (view.now - s.t) / 1000;
      if (age > 9) continue;
      const a = Math.min(1, (9 - age) / 2) * Math.min(1, box.fog + 0.2);
      g.font = `${maxFont}px "JetBrains Mono", ui-monospace, monospace`;
      g.textAlign = "center";
      const text = box.k < 6 ? s.text.slice(0, 28) : s.text.slice(0, 64);
      const w = g.measureText(text).width + 12;
      const y = box.top - 14 - row * (maxFont + 10) - age * 3;
      g.fillStyle = `rgba(8,4,16,${0.8 * a})`;
      g.fillRect(box.cx - w / 2, y - maxFont, w, maxFont + 8);
      g.strokeStyle = hsl(e.hue, 90, 65, a);
      g.strokeRect(box.cx - w / 2, y - maxFont, w, maxFont + 8);
      g.fillStyle = hsl(e.hue, 100, 85, a);
      g.fillText(text, box.cx, y - 3);
      row++;
    }
  },
};

// ---- sparks: a halo when someone gets liked or reposted ----
export const sparks = {
  id: "sparks",
  name: "like sparks",
  desc: "buildings flare when their author is liked or reposted",
  drawEnt(g, view, e, box) {
    if (e.flash <= 0) return;
    const r = box.w * (0.8 + (1 - e.flash) * 1.5);
    g.save();
    g.globalCompositeOperation = "lighter";
    const grad = g.createRadialGradient(box.cx, box.top, 0, box.cx, box.top, r);
    grad.addColorStop(0, hsl(e.hue, 100, 70, 0.7 * e.flash));
    grad.addColorStop(1, hsl(e.hue, 100, 50, 0));
    g.fillStyle = grad;
    g.fillRect(box.cx - r, box.top - r, r * 2, r * 2);
    g.restore();
  },
};

// ---- katana: every DID carries a sword; it hangs on the facade ----
function swordArt(s) {
  const n = Math.round(4 + s.len * 8);
  const grip = s.guard > 0.6 ? "+" : "-";
  return ["    o", "    |", `   ${grip}|${grip}`, ...Array(n).fill("    ||"), "    /\\"].join("\n");
}
function swordLines(e, w) {
  const s = e.sword;
  return [
    `${w.label(e)}  —  ${s.name}`,
    `  rarity ${s.rarity} · power ${s.power} · reach ${(s.len * 100) | 0}% · guard ${(s.guard * 100) | 0}%${s.curve ? " · curved" : ""}`,
    `  forged from ${e.did}`,
    swordArt(s),
  ];
}

export const katana = {
  id: "katana",
  name: "swords",
  desc: "every account carries a sword forged from its DID; it hangs on the building and settles duels",
  drawEnt(g, view, e, box) {
    if (box.k < 2.2) return;
    const s = e.sword;
    const len = box.h * (0.4 + s.len * 0.45);
    const top = box.base - box.h * 0.92;
    const a = Math.min(1, box.fog + 0.25);
    g.save();
    g.translate(box.cx, top);
    g.globalCompositeOperation = "lighter";
    g.shadowColor = hsl(s.hue, 100, 60, a);
    g.shadowBlur = 8 + box.k * 0.15;
    g.strokeStyle = hsl(s.hue, 100, 78, a);
    g.lineWidth = Math.max(1.2, box.k * 0.09);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(s.curve * len * 0.25, len * 0.5, s.curve * len * 0.12, len);
    g.stroke();
    g.lineWidth = Math.max(1, box.k * 0.06);
    g.strokeStyle = hsl((s.hue + 40) % 360, 90, 70, a);
    const gw = box.w * (0.08 + s.guard * 0.16);
    g.beginPath();
    g.moveTo(-gw, 0);
    g.lineTo(gw, 0);
    g.stroke();
    g.beginPath();
    g.arc(0, -box.k * 0.4, Math.max(1.5, box.k * 0.22), 0, 6.3);
    g.stroke();
    g.restore();
  },
  commands: {
    sword: {
      help: "sword [handle]  — inspect someone's sword (default: nearest building)",
      async run(args, w) {
        const e = args[0] ? await w.find(args[0]) : w.near()[0]?.e;
        if (!e) return "nobody nearby. try `goto <handle>`.";
        return swordLines(e, w).join("\n");
      },
    },
    duel: {
      help: "duel <a> [b]  — settle it with swords (b defaults to the nearest building)",
      async run(args, w) {
        if (!args[0]) return "usage: duel <handle> [handle]";
        const a = await w.find(args[0]);
        const b = args[1] ? await w.find(args[1]) : w.near().find((n) => n.e !== a)?.e;
        if (!b) return "nobody to duel.";
        const r = duel(a, b);
        const hi = Math.max(r.sa, r.sb).toFixed(0), lo = Math.min(r.sa, r.sb).toFixed(0);
        return [
          `${w.label(a)} [${a.sword.name}, ${a.sword.power}]  vs  ${w.label(b)} [${b.sword.name}, ${b.sword.power}]`,
          `${w.label(r.winner)} wins, ${hi} to ${lo}.`,
        ];
      },
    },
  },
};

// ---- bridges: follows arc between buildings ----
export const bridges = {
  id: "bridges",
  name: "follow bridges",
  desc: "a new follow draws a light-arc between the two buildings",
  arcs: [],
  onEvent(ev) {
    if (ev.type !== "follow" || !ev.target) return;
    this.arcs.push({ a: ev.ent, b: ev.target, t: ev.t });
    if (this.arcs.length > 40) this.arcs.shift(); // an arc fades in 6s; 40 is more than ever on screen
  },
  drawOverlay(g, view) {
    const keep = [];
    for (const arc of this.arcs) {
      const age = (view.now - arc.t) / 1000;
      if (age > 6) continue;
      keep.push(arc);
      const pa = view.entTop(arc.a);
      const pb = view.entTop(arc.b);
      if (!pa || !pb) continue;
      const a = Math.min(1, (6 - age) / 3);
      const mx = (pa.sx + pb.sx) / 2;
      const my = Math.min(pa.sy, pb.sy) - Math.abs(pa.sx - pb.sx) * 0.25 - 20;
      g.save();
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = hsl(arc.a.hue, 100, 70, a);
      g.shadowColor = hsl(arc.a.hue, 100, 60, a);
      g.shadowBlur = 10;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(pa.sx, pa.sy);
      g.quadraticCurveTo(mx, my, pb.sx, pb.sy);
      g.stroke();
      g.restore();
    }
    this.arcs = keep;
  },
};

export const builtins = [signs, sparks, katana, bridges];
