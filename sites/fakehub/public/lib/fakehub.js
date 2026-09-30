// fakehub generator — pure functions, no DOM, no network. Takes what the page
// read (profile, recent post texts/timestamps, avatar pixels) and invents a
// GitHub profile. Everything is deterministic per DID so a handle always gets
// the same fake profile.

export function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function rng(seed) {
  let a = hash32(String(seed)) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  return next;
}

// rgba: Uint8ClampedArray of w*h*4 (the page downsamples the avatar to 32x32).
export function analyzeAvatar(rgba) {
  const n = Math.floor(rgba.length / 4);
  if (!n) return null;
  let sumS = 0, sumL = 0, sumWarm = 0, sumX = 0, sumY = 0, opaque = 0;
  const bins = new Array(12).fill(0);
  const lums = [];
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    if (a < 40) continue;
    const r = rgba[i * 4] / 255, g = rgba[i * 4 + 1] / 255, b = rgba[i * 4 + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    opaque++; sumS += s; sumL += l; sumWarm += r - b; lums.push(l);
    if (s > 0.15 && l > 0.1 && l < 0.92) bins[Math.floor(h / 30) % 12] += s;
    sumX += Math.cos(h * Math.PI / 180) * s; sumY += Math.sin(h * Math.PI / 180) * s;
  }
  if (!opaque) return null;
  const mean = sumL / opaque;
  const variance = lums.reduce((t, l) => t + (l - mean) ** 2, 0) / opaque;
  let top = 0;
  for (let i = 1; i < 12; i++) if (bins[i] > bins[top]) top = i;
  const used = bins.filter((b) => b > bins[top] * 0.25).length;
  return {
    sat: sumS / opaque, light: mean, warmth: sumWarm / opaque,
    contrast: Math.sqrt(variance), hue: top * 30 + 15, hues: used,
  };
}

const EMOJI = /\p{Extended_Pictographic}/gu;

export function analyzePosts(posts) {
  const texts = posts.map((p) => p.text || "").filter((t) => t.trim());
  const n = texts.length;
  const joined = texts.join("\n");
  const letters = joined.replace(/[^a-zA-Z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  const stop = new Set("the and for that this with you have are but not was just your from they what about when there would their like been will can its out all get has more one how why who too than into them then some only over also very much dont i'm it's i'd don't i've isn't can't a an of to in is it on be as at so if we my me or do no up he she by her his him our any".split(" "));
  const freq = new Map();
  for (const w of joined.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) {
    if (stop.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const topWords = [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 12).map((e) => e[0]);
  const tags = (joined.match(/#[\w]+/g) || []).map((t) => t.slice(1).toLowerCase());
  return {
    n,
    avgLen: n ? joined.length / n : 0,
    emojiRate: n ? (joined.match(EMOJI) || []).length / n : 0,
    lowerRate: letters.length ? 1 - upper / letters.length : 1,
    questionRate: n ? texts.filter((t) => t.includes("?")).length / n : 0,
    exclaimRate: n ? texts.filter((t) => t.includes("!")).length / n : 0,
    linkRate: n ? texts.filter((t) => /https?:\/\//.test(t)).length / n : 0,
    topWords, tags,
  };
}

// Archetypes score off avatar + writing style; the highest wins.
export const ARCHETYPES = {
  claudeish: { name: "The Claudeish", line: "Every PR arrives with a big heading, twelve contracts and an unnecessary testing fixture." },
  minimalist: { name: "The Minimalist", line: "+3 -3. No description. The reviewer is expected to simply know." },
  maximalist: { name: "The Maximalist", line: "Gitmoji in every commit, a rainbow of labels, and a PR template nobody asked for." },
  nightowl: { name: "The Night Owl", line: "Best commits land at 3:07am and get reverted by 3:40." },
  bikeshedder: { name: "The Bikeshedder", line: "Has approved zero PRs and left forty comments on one rename." },
  shipper: { name: "The Shipper", line: "Pushes straight to main. Fixes it in the next commit. Fixes that in the one after." },
};

export function pickArchetype(av, st, rand) {
  const a = av || { sat: 0.3, light: 0.5, contrast: 0.2, hues: 3, warmth: 0 };
  const s = {
    claudeish: a.sat * 0.6 + (st.avgLen > 160 ? 0.8 : st.avgLen / 250) + (a.warmth > 0.1 ? 0.25 : 0),
    minimalist: (1 - a.sat) * 0.8 + (a.contrast < 0.18 ? 0.4 : 0) + (st.avgLen < 70 ? 0.6 : 0),
    maximalist: a.hues * 0.12 + Math.min(st.emojiRate, 1.5) * 0.7 + st.exclaimRate * 0.5,
    nightowl: (a.light < 0.35 ? 0.9 : 0) + (1 - a.light) * 0.4 + (a.warmth < -0.05 ? 0.3 : 0),
    bikeshedder: st.questionRate * 1.4 + (a.contrast > 0.3 ? 0.3 : 0),
    shipper: st.lowerRate * 0.6 + (st.avgLen < 110 ? 0.35 : 0) + (a.warmth > 0.05 ? 0.2 : 0),
  };
  let best = "shipper", bv = -1;
  for (const k of Object.keys(s)) {
    const v = s[k] + rand() * 0.15;
    if (v > bv) { bv = v; best = k; }
  }
  return best;
}

const LANGS = [["TypeScript", "#3178c6"], ["Rust", "#dea584"], ["Python", "#3572a5"], ["Go", "#00add8"], ["Zig", "#ec915c"], ["Lua", "#000080"], ["Elixir", "#6e4a7e"], ["Nix", "#7e7eff"], ["Shell", "#89e051"], ["OCaml", "#ef7a08"], ["Haskell", "#5e5086"], ["Svelte", "#ff3e00"]];
const SUFFIX = ["-rs", "-core", "-kit", "-cli", "-server", "-utils", "-next", "-v2", "-playground", "-dotfiles", "-but-worse", "-lite", "-engine", "-sdk"];
const FALLBACK_WORDS = ["thing", "garden", "signal", "river", "ledger", "lantern", "static", "orbit", "pickle", "harbor"];
const slug = (w) => w.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const PR_TITLES = {
  claudeish: [
    (w) => `feat(${w}): introduce ${cap(w)}Orchestrator with pluggable strategy contracts`,
    (w) => `refactor: comprehensive overhaul of ${w} pipeline with enhanced observability`,
    (w) => `feat: robust, production-ready ${w} abstraction layer`,
    (w) => `fix(${w}): address edge cases and add comprehensive test coverage`,
  ],
  minimalist: [() => "fix typo", (w) => `rename ${w}`, () => "bump", (w) => `drop unused ${w}`, () => "tweak"],
  maximalist: [
    (w) => `✨ add ${w} 🎉`, (w) => `🐛 squash the ${w} bug 🔨`, (w) => `🚀 ship ${w} to the moon`,
    (w) => `🎨 make ${w} pretty 💅`, (w) => `🔥 delete ${w} (sorry)`,
  ],
  nightowl: [(w) => `wip: ${w} (3am, will fix)`, (w) => `revert "${w} fix"`, (w) => `actually fix ${w} this time`, () => "why does this work"],
  bikeshedder: [
    (w) => `chore: rename ${w} to ${w}Manager to ${w}Service to ${w}`, (w) => `refactor: should ${w} be a class?`,
    (w) => `style: standardize ${w} naming (see discussion)`, (w) => `docs: clarify what ${w} means`,
  ],
  shipper: [(w) => `add ${w}`, (w) => `${w} works now`, (w) => `fix ${w}`, (w) => `more ${w}`, () => "ship it"],
};

const COMMIT_PREFIX = {
  claudeish: ["feat:", "fix:", "refactor:", "docs:", "test:", "chore:"],
  minimalist: [""], maximalist: ["✨", "🐛", "🔥", "🎨", "🚀", "💄", "♻️"],
  nightowl: ["", "wip:", "fix:"], bikeshedder: ["chore:", "style:", "docs:"], shipper: ["", "fix"],
};

const ISSUE_COMMENTS = {
  claudeish: [
    "Great question! Let me break this down into three considerations: correctness, ergonomics, and extensibility.",
    "I've opened a PR that addresses this comprehensively. It adds 2,140 lines and a fixture.",
    "You're absolutely right, and I apologize for the oversight. Fixed in the latest commit.",
  ],
  minimalist: ["lgtm", "+1", "works for me", "dupe of #12", "wontfix"],
  maximalist: ["omg yes 🎉🎉 this is so needed!!", "LGTM 🚢", "thank you so much for this!! 💖", "added a 🚀 reaction and a 👀 reaction and a ❤️"],
  nightowl: ["can't repro. it was working at 3am", "reopening, it's back", "I think I fixed this but I don't remember how", "reverting my fix, will try again tomorrow"],
  bikeshedder: [
    "Have we considered a different name for this?", "I'd push back gently on the premise here.",
    "Not blocking, but I have eleven nits. (Blocking.)", "Requesting changes: see my 4 prior comments on the naming.",
  ],
  shipper: ["merged, will fix later", "already on main", "fixed in the next push", "shipping it, reply if it breaks"],
};

function numberStats(arch, rand) {
  switch (arch) {
    case "claudeish": return { add: 900 + rand.int(2600), del: 20 + rand.int(120), files: 14 + rand.int(28) };
    case "minimalist": return { add: 1 + rand.int(6), del: rand.int(6), files: 1 };
    case "maximalist": return { add: 80 + rand.int(500), del: 10 + rand.int(200), files: 5 + rand.int(14) };
    case "nightowl": return { add: 30 + rand.int(400), del: 20 + rand.int(380), files: 2 + rand.int(9) };
    case "bikeshedder": return { add: 40 + rand.int(180), del: 40 + rand.int(180), files: 6 + rand.int(24) };
    default: return { add: 10 + rand.int(200), del: rand.int(60), files: 1 + rand.int(5) };
  }
}

function prBody(arch, w, rand) {
  if (arch !== "claudeish") return null;
  return {
    heading: `## Summary\nThis PR introduces a comprehensive ${w} layer.`,
    bullets: [`Adds ${rand.int(9) + 3} new contracts`, "Adds an unnecessary testing fixture", "Updates docs (generated)", "🤖 Generated with help"],
  };
}

export function hourOfDay(iso) { return new Date(iso).getHours(); }

// profile: {did, handle, displayName, description, followersCount, postsCount, createdAt}
// posts: [{text, createdAt}], avatar: analyzeAvatar() result or null
export function generate({ profile, posts, avatar }, now = Date.now()) {
  const did = profile.did || profile.handle || "anon";
  const rand = rng(did);
  const st = analyzePosts(posts);
  const archKey = pickArchetype(avatar, st, rand);
  const arch = { key: archKey, ...ARCHETYPES[archKey] };

  const words = st.topWords.length ? st.topWords : FALLBACK_WORDS;
  const w = () => slug(rand.pick(words)) || "thing";

  const repos = [];
  const used = new Set();
  for (let i = 0; repos.length < 6 && i < 40; i++) {
    const name = w() + rand.pick(SUFFIX);
    if (used.has(name)) continue;
    used.add(name);
    const lang = rand.pick(LANGS);
    repos.push({
      name, lang: lang[0], color: lang[1], stars: Math.floor(rand() ** 3 * 4200),
      forks: rand.int(60), desc: repoDesc(arch.key, name, rand),
    });
  }

  const prs = [];
  for (let i = 0; i < 6; i++) {
    const repo = repos[i % repos.length].name;
    const word = w();
    const n = numberStats(arch.key, rand);
    const state = rand.pick(["merged", "merged", "open", "closed"]);
    prs.push({
      repo, number: 1 + rand.int(900), title: rand.pick(PR_TITLES[arch.key])(word),
      state: arch.key === "bikeshedder" && state === "merged" ? "open" : state,
      ...n, comments: arch.key === "bikeshedder" ? 20 + rand.int(60) : rand.int(6),
      body: prBody(arch.key, word, rand), daysAgo: 1 + i * 3 + rand.int(3),
    });
  }

  // commit messages: recent posts reworded as commits, so the feed shows through.
  const commits = [];
  const src = posts.filter((p) => p.text && p.text.trim());
  for (let i = 0; i < 8; i++) {
    const p = src.length ? src[(i * 3 + rand.int(3)) % src.length] : null;
    commits.push({ repo: rand.pick(repos).name, msg: commitMsg(arch.key, p ? p.text : null, w(), rand), hash: hashHex(did + i), hour: p ? hourOfDay(p.createdAt) : rand.int(24) });
  }

  const issues = [];
  for (let i = 0; i < 4; i++) {
    issues.push({
      repo: rand.pick(repos).name, number: 1 + rand.int(400),
      title: rand.pick(["Crash on startup", "Support " + cap(w()), "Docs are out of date", "Rename " + w(), "Flaky test", "Feature request: " + w()]),
      comment: rand.pick(ISSUE_COMMENTS[arch.key]),
    });
  }

  // contribution graph: real posting days light squares up; the rest is seeded noise.
  const DAY = 86400000;
  const start = startOfDay(now) - 52 * 7 * DAY;
  const counts = new Array(53 * 7).fill(0);
  for (const p of posts) {
    const idx = Math.floor((startOfDay(Date.parse(p.createdAt)) - start) / DAY);
    if (idx >= 0 && idx < counts.length) counts[idx] += 1 + rand.int(3);
  }
  const base = arch.key === "nightowl" ? 0.22 : arch.key === "minimalist" ? 0.12 : 0.3;
  for (let i = 0; i < counts.length; i++) if (rand() < base) counts[i] += 1 + rand.int(5);
  const total = counts.reduce((a, b) => a + b, 0);

  const langs = {};
  for (const r of repos) langs[r.lang] = (langs[r.lang] || 0) + 1 + rand.int(4);

  return {
    arch, repos, prs, commits, issues, counts, total, langs,
    start, stats: st,
    bio: bioFor(profile, arch.key, rand),
    followers: profile.followersCount || 0,
  };
}

function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function hashHex(s) { return hash32(s).toString(16).padStart(8, "0").slice(0, 7); }

function repoDesc(arch, name, rand) {
  const d = {
    claudeish: ["A robust, extensible framework for " + name, "Production-ready orchestration layer (with 12 contracts)"],
    minimalist: ["", "stuff", "."],
    maximalist: ["✨ the most beautiful " + name + " ✨", "🚀 blazingly fast 🚀"],
    nightowl: ["works on my machine, at night", "half-finished, sorry"],
    bikeshedder: ["A naming proposal, with an implementation", "RFC: " + name],
    shipper: ["it's a thing", "WIP (since 2022)", "ship first"],
  }[arch];
  return rand.pick(d);
}

function commitMsg(arch, text, word, rand) {
  let base = text ? text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().split(/[.!?\n]/)[0] : "";
  if (base.length < 6) base = "update " + word;
  base = base.length > 60 ? base.slice(0, 57).trimEnd() + "..." : base;
  const prefix = rand.pick(COMMIT_PREFIX[arch]);
  if (arch === "minimalist") return base.toLowerCase().split(" ").slice(0, 3).join(" ");
  if (arch === "claudeish") return `${prefix} ${base.charAt(0).toLowerCase() + base.slice(1)}`;
  if (arch === "shipper" || arch === "nightowl") return (prefix ? prefix + " " : "") + base.toLowerCase();
  return `${prefix} ${base}`.trim();
}

function bioFor(profile, arch, rand) {
  const d = (profile.description || "").replace(/\s+/g, " ").trim();
  const first = d.split(/[.\n|]/)[0].trim().slice(0, 80);
  const tail = { claudeish: "Building robust things.", minimalist: "", maximalist: "✨ open to collaborate ✨", nightowl: "timezone: ???", bikeshedder: "opinions are my own (there are many)", shipper: "ship > perfect" }[arch];
  return [first, tail].filter(Boolean).join(" · ") || rand.pick(["Hello world", "building"]);
}
