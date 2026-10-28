// The terminal. Same interpreter in the page's console and in `node cli.mjs`:
// commands are plain functions of (args, world, ctx). Plugins add their own
// through `plugin.commands`. No DOM.

import { L } from "./world.js";

const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  return s < 90 ? `${s | 0}s` : `${(s / 60) | 0}m`;
};

const core = {
  help: {
    help: "help  — this list",
    run(args, w) {
      const all = { ...core, ...w.pluginCommands() };
      return Object.values(all).map((c) => "  " + c.help);
    },
  },
  look: {
    help: "look  — what's around you on the Street",
    run(args, w) {
      const near = w.near(w.me.x, 60).slice(0, 8);
      if (!near.length) return `empty road at x=${w.me.x.toFixed(0)} of ${L}. (${w.status})`;
      return [
        `x=${w.me.x.toFixed(0)} of ${L}. nearby buildings:`,
        ...near.map(({ e, d }) => {
          const last = e.signs[e.signs.length - 1];
          return `  ${d >= 0 ? "+" : ""}${d.toFixed(0).padStart(4)}  ${w.label(e)}  ${e.sword.name}${last ? `  “${last.text.slice(0, 50)}”` : ""}`;
        }),
      ];
    },
  },
  who: {
    help: "who  — the busiest buildings right now",
    run(args, w) {
      const top = [...w.ents.values()].sort((a, b) => b.last - a.last).slice(0, 10);
      if (!top.length) return `nobody yet. (${w.status})`;
      return top.map((e) => `  ${w.label(e).padEnd(34)} ${e.posts}p ${e.likes}l ${e.reposts}r ${e.follows}f  seen ${ago(e.last)} ago`);
    },
  },
  goto: {
    help: "goto <handle|did>  — teleport to someone's building",
    async run(args, w) {
      if (!args[0]) return "usage: goto <handle>";
      const e = await w.find(args[0]);
      const ey = e.side * (14 + e.off);
      w.me.auto = false;
      w.me.x = (e.x - 12 + L) % L;
      w.me.y = 0;
      w.me.yaw = Math.atan2(ey, 12);
      return `standing outside ${w.label(e)} (x=${e.x.toFixed(0)}). the sign says: ${e.sword.name}.`;
    },
  },
  walk: {
    help: "walk <n>  — move n units along the Street (negative walks back)",
    run(args, w) {
      const n = Number(args[0]);
      if (!Number.isFinite(n)) return "usage: walk <n>";
      w.me.auto = false;
      w.me.x = (((w.me.x + n) % L) + L) % L;
      return `x=${w.me.x.toFixed(0)}`;
    },
  },
  cruise: {
    help: "cruise [on|off]  — ride the monorail down the Street",
    run(args, w) {
      w.me.auto = args[0] ? args[0] !== "off" : !w.me.auto;
      return `cruise ${w.me.auto ? "on" : "off"}`;
    },
  },
  stats: {
    help: "stats  — what the Street has seen since you tuned in",
    run(args, w) {
      const c = w.counts;
      return [
        `firehose: ${w.status}, ${w.rate().toFixed(0)} events/s`,
        `seen: ${c.post} posts, ${c.like} likes, ${c.repost} reposts, ${c.follow} follows`,
        `buildings standing: ${w.ents.size}`,
      ];
    },
  },
  feed: {
    help: "feed  — the last few posts",
    run(args, w) {
      const posts = w.events.filter((e) => e.type === "post" && e.text).slice(-8);
      if (!posts.length) return `nothing yet. (${w.status})`;
      return posts.map((ev) => `  ${w.label(ev.ent)}: ${ev.text.slice(0, 100)}`);
    },
  },
  tail: {
    help: "tail [on|off]  — stream posts into this terminal as they happen",
    run(args, w, ctx) {
      if (ctx.untail) { ctx.untail(); ctx.untail = null; }
      if (args[0] === "off") return "tail off";
      let last = 0;
      ctx.untail = w.on((ev) => {
        if (ev.type !== "post" || !ev.text || Date.now() - last < 700) return; // a readable trickle, not the whole firehose
        last = Date.now();
        ctx.print(`  ${w.label(ev.ent)}: ${ev.text.slice(0, 110)}`);
      });
      return "tail on (a readable trickle of posts). `tail off` to stop.";
    },
  },
  plugins: {
    help: "plugins  — list plugins; `enable <id>` / `disable <id>` to flip one",
    run(args, w) {
      return [...w.plugins.values()].map((p) => `  [${p.enabled ? "x" : " "}] ${p.id.padEnd(10)} ${p.desc || ""}${p.error ? `  (crashed: ${p.error})` : ""}`);
    },
  },
  enable: {
    help: "enable <plugin>",
    run(args, w) { return w.setEnabled(args[0], true) ? `${args[0]} on` : `no plugin ${args[0]}`; },
  },
  disable: {
    help: "disable <plugin>",
    run(args, w) { return w.setEnabled(args[0], false) ? `${args[0]} off` : `no plugin ${args[0]}`; },
  },
  about: {
    help: "about  — what this place is",
    run() {
      return [
        "hyperstreet: a loop of road, one building per account active on atproto right now.",
        "the world is derived from the public firehose; nothing here is stored. the web view,",
        "cardboard VR, this terminal and cli.mjs are all projections of the same stream.",
        "everything you can see is a plugin.",
      ];
    },
  },
};

// Returns an array of output lines.
export async function runCommand(world, line, ctx = { print() {} }) {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const name = parts[0].toLowerCase();
  const cmd = world.pluginCommands()[name] || core[name];
  if (!cmd) return [`unknown command: ${name}. try \`help\`.`];
  try {
    const out = await cmd.run(parts.slice(1), world, ctx);
    return Array.isArray(out) ? out : String(out).split("\n");
  } catch (err) {
    return [`error: ${err.message}`];
  }
}
