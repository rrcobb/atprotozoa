// classify.js — decides whether a post is "software": something somebody made
// and is showing off (an app, game, tool, library, bot, site, script) as
// opposed to a personal thought, politics, or AI-discourse. Rule-based on
// purpose — it runs in the browser on every post, with no model and no
// server. Each rule adds to a score; the reasons come back so the UI can
// show why a post made the cut. Pure functions, no DOM: see tests/.

// Hosts where "a link to it" is strong evidence of software.
const CODE_HOSTS = [
  "github.com", "gitlab.com", "codeberg.org", "tangled.sh", "tangled.org",
  "sr.ht", "bitbucket.org", "npmjs.com", "crates.io", "pypi.org", "pkg.go.dev",
  "rubygems.org", "hex.pm", "jsr.io", "huggingface.co",
];
const RUN_HOSTS = [
  "itch.io", "github.io", "pages.dev", "workers.dev", "vercel.app", "netlify.app",
  "glitch.me", "repl.co", "replit.app", "replit.com", "val.run", "val.town",
  "streamlit.app", "fly.dev", "onrender.com", "web.app", "firebaseapp.com",
  "codepen.io", "jsfiddle.net", "observablehq.com", "bisks.net", "gumroad.com",
  "apps.apple.com", "testflight.apple.com", "play.google.com", "f-droid.org",
  "store.steampowered.com", "flathub.org", "snapcraft.io", "producthunt.com",
  "lovable.app", "bolt.new", "stackblitz.com", "codesandbox.io", "scratch.mit.edu",
  "newgrounds.com", "gamejolt.com", "crazygames.com", "shadertoy.com", "pico-8.com",
];

const MAKE_VERBS =
  "(?:built|made|made this|wrote|coded|vibe[- ]?coded|shipped|released|launched|published|open[- ]?sourced|hacked together|put together|whipped up|cooked up|prototyped|created|programmed)";
const SOFT_NOUNS =
  "(?:app|apps|game|games|tool|tools|bot|bots|site|website|web ?app|extension|plugin|library|lib|package|crate|cli|script|toy|widget|dashboard|feed|feed ?generator|labeler|client|server|engine|emulator|compiler|interpreter|language|framework|api|sdk|shader|visuali[sz]er|visuali[sz]ation|simulator|simulation|generator|tracker|mod|userscript|bookmarklet|firmware|operating system|os|pds|appview|lexicon|minigame|mini-?game|prototype|demo|playground|calculator|editor|browser|terminal|keyboard layout|font|theme)";

const RULES = [
  { re: new RegExp(`\\b(?:i|we|i've|i just|just|finally|today i|been working on)\\s+(?:\\w+\\s+){0,2}${MAKE_VERBS}\\b[^.!?\\n]{0,60}\\b${SOFT_NOUNS}\\b`, "i"), pts: 4, why: "i made a thing" },
  { re: new RegExp(`\\b(?:new|tiny|little|small|weekend|free|open[- ]?source|browser|web|cli|terminal)\\s+(?:\\w+\\s+)?${SOFT_NOUNS}\\b`, "i"), pts: 2, why: "new tool/app/game" },
  { re: /\b(?:open[- ]?source(?:d)?|source code|github|gitlab|codeberg|repo(?:sitory)?|pull request|\bPRs? welcome|MIT licen[sc]e|AGPL|GPL)\b/i, pts: 2, why: "source/repo talk" },
  { re: /\b(?:v\d+\.\d+(?:\.\d+)?|version \d+(?:\.\d+)+|release notes|changelog|just released|now available|out now|now live|is live|beta|alpha|early access|launch(?:ed|ing)?)\b/i, pts: 2, why: "release language" },
  { re: /\b(?:try it|play it|play here|play now|check it out|link below|demo|live demo|give it a (?:try|spin|go)|feedback welcome|come break it|try it out)\b/i, pts: 2, why: "come use it" },
  { re: /\b(?:atproto|at protocol|jetstream|firehose|lexicon|appview|pds|feed generator|labeler|cloudflare workers?|wasm|webassembly|typescript|rust|python|javascript|react|svelte|htmx|sqlite|postgres|llvm|vim|neovim|emacs|linux|nix|docker|kubernetes|api|sdk|cli|regex|compiler|unix)\b/i, pts: 1, why: "dev vocabulary" },
  { re: /\b(?:minigame|mini-?game|game ?jam|ludum dare|pico-?8|roguelike|puzzle game|text adventure|shader|procedural|generative|sim(?:ulator)?|emulator|raytrac(?:er|ing)|demoscene)\b/i, pts: 2, why: "game/graphics project" },
  { re: /\b(?:vibe[- ]?cod(?:ed|ing)|built (?:with|using) (?:claude|cursor|codex|gpt)|made with claude)\b/i, pts: 1, why: "vibe-coded" },
];

// Things that make a post probably not "the sweet software".
const NEGATIVES = [
  { re: /\b(?:trump|biden|harris|maga|gop|democrats?|republicans?|congress|senate|election|tariffs?|genocide|fascis[tm]|ice raids?|immigration|supreme court|zionis[tm]|palestin\w+|ukraine|gaza|netanyahu|putin|vote|voting|protest|regime|billionaires?|oligarch\w*|liberals?|conservatives?|leftists?)\b/i, pts: -4, why: "politics" },
  { re: /\b(?:ai (?:bubble|slop|doom|safety|takeover|hype|discourse|art|skeptics?|bros?)|agi|doomers?|foom|alignment|stochastic parrots?|llms? (?:can't|cannot|don't|will|won't|are|aren't)|chatgpt (?:is|isn't|can't|won't)|anti-?ai|pro-?ai|ai (?:is|isn't|will|won't|can't)\b|sentien[ct]\w*|singularity|scaling laws?|ai companies|ai labs?)\b/i, pts: -3, why: "ai discourse" },
  { re: /\b(?:i feel|i'm so|i am so|my (?:mom|dad|wife|husband|partner|cat|dog|therapist|boss)|feeling|anxiety|depress\w+|good morning|gm\b|happy birthday|rip\b|miss (?:you|him|her)|lol\b|lmao\b|tired|hungry|can't sleep|rant|hot take|unpopular opinion)\b/i, pts: -2, why: "personal thought" },
  { re: /\b(?:thoughts\?|am i (?:the only|crazy)|why do people|discourse|debate|hot take|change my mind|ratio)\b/i, pts: -2, why: "debate bait" },
];

export function hostOf(uri) {
  try {
    return new URL(uri).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostMatches(host, list) {
  return list.some((h) => host === h || host.endsWith("." + h));
}

// Classify a link by its host. Returns { pts, kind, why } or null.
export function linkSignal(uri) {
  const host = hostOf(uri);
  if (!host) return null;
  if (host === "bsky.app" || host === "bsky.social" || host === "youtube.com" || host === "youtu.be" || host === "twitter.com" || host === "x.com") return null;
  if (hostMatches(host, CODE_HOSTS)) {
    // a bare github.com/org/repo link is software; the github.com homepage or a news page is not
    if (host === "github.com") {
      const parts = new URL(uri).pathname.split("/").filter(Boolean);
      if (parts.length < 2) return null;
      if (["sponsors", "orgs", "topics", "about", "features", "pricing", "blog", "collections"].includes(parts[0])) return null;
    }
    return { pts: 5, kind: "code", why: `code link (${host})` };
  }
  if (hostMatches(host, RUN_HOSTS)) {
    return { pts: 4, kind: host.includes("itch.io") || host.includes("steam") || host.includes("newgrounds") || host.includes("gamejolt") ? "game" : "app", why: `runnable link (${host})` };
  }
  return null;
}

// post: { text, links: [uri], external: {uri,title,description}|null, isReply, isQuote }
// -> { score, isSoftware, kinds: [..], reasons: [..] }
export function classify(post, { threshold = 4 } = {}) {
  const text = post.text || "";
  const extra = post.external ? `${post.external.title || ""} ${post.external.description || ""}` : "";
  const reasons = [];
  const kinds = new Set();
  let score = 0;
  let strongLink = false;

  const uris = new Set([...(post.links || []), post.external?.uri].filter(Boolean));
  for (const u of uris) {
    const s = linkSignal(u);
    if (s) {
      score += s.pts;
      strongLink = true;
      kinds.add(s.kind);
      reasons.push(s.why);
      break; // one link's evidence is enough; more links shouldn't stack
    }
  }

  const hay = `${text}\n${extra}`;
  for (const r of RULES) {
    if (r.re.test(hay)) {
      score += r.pts;
      reasons.push(r.why);
    }
  }
  for (const r of NEGATIVES) {
    if (r.re.test(text)) {
      score += r.pts;
      reasons.push("− " + r.why);
    }
  }

  // Replies are conversation, not announcements — unless they link the thing.
  if (post.isReply && !strongLink) score -= 3;
  // Software with no link and no "I made" voice is just dev chat.
  if (!strongLink && !post.external && !reasons.includes("i made a thing")) score -= 1;
  // A very short text with nothing attached has no room to be a project.
  if (!strongLink && text.trim().length < 25 && !post.hasMedia) score -= 2;

  if (/\b(game|play|jam|puzzle|roguelike|minigame|mini-?game)\b/i.test(hay)) kinds.add("game");
  if (/\b(bot|labeler|feed ?generator|appview|pds|atproto|lexicon)\b/i.test(hay)) kinds.add("atproto");
  if (/\b(cli|terminal|library|crate|package|sdk|api|compiler|plugin|extension)\b/i.test(hay)) kinds.add("dev tool");
  if (/\b(shader|generative|visuali[sz]\w*|sim(?:ulat\w*)?|procedural|art)\b/i.test(hay)) kinds.add("toy");
  if (!kinds.size && score >= threshold) kinds.add("software");

  return { score, isSoftware: score >= threshold, kinds: [...kinds], reasons };
}
