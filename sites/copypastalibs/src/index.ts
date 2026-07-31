// copypastalibs Worker — bisks.net/copypastalibs
//
// The mad-libbing itself runs client-side (public/index.html does the real
// work). The one thing that needed a server: shared links. A plain static
// site serves the *same* index.html — same og:title/og:description/og:url —
// no matter whose handle or which pasta is in the URL, so a link-unfurl
// cache (Bluesky's included) shows one generic card forever no matter who
// shares it (see notes/45-sharing-and-virality.md's per-result-unfurl tier,
// and sites/didscope/src/index.ts for the reference implementation this
// copies).
//
// Fix: /p/<handle>/<pastaIndex>/<seed36> is a real, distinct URL per shared
// card. The Worker resolves the handle, re-reads their feed, and rebuilds
// the exact same word pools + seeded mad-lib the client would (same seed →
// same fill, see mulberry32 in public/index.html), then stamps personalized
// og:title/og:description/og:url onto the same page shell before handing it
// back. Falls through to ASSETS for everything else.
//
// The word-pool + template logic below is a deliberate copy of the same
// functions in public/index.html — server-side duplication within ONE site,
// not a shared package across sites (see sites/didscope/src/index.ts for
// the same reasoning). Keep the two in sync by hand if either changes.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const STOPWORDS = new Set(
  `
  the a an and or but if of to in on at for with is was were are be been
  being this that these those i you he she it we they my your his her
  its our their me him us them not no do does did will would can could
  should shall just so than then there here what which who whom when
  where why how all any both each few more most other some such only
  own same as from up down out about into over under again further once
  also very really like im ive dont cant its thats youre theyre were
  got get one two has have had am was been having ok okay yeah yes yep
  nah lol lmao rt via too still even much many well now well going go
  goes went back new one people time day today good bad thing things
  gonna wanna gotta kinda sorta bit way ur u r your youre didnt doesnt
  isnt arent wasnt werent wont wouldnt couldnt shouldnt hasnt havent
  hadnt ill youll well theyll id youd hed shed wed theyd whats hows
  thats heres theres reply replying quote quoted post posted posting
  skeet bsky bluesky com www http https feed thread
`
    .trim()
    .split(/\s+/),
);

const FALLBACK_WORDS = [
  "gremlin", "waffle", "spreadsheet", "raccoon", "vibe", "cursed",
  "goblin", "printer", "chaos", "wifi", "burrito", "static", "moss",
  "puddle", "toaster", "swamp", "glitter", "pigeon", "vibes", "modem",
];

type Pools = { nv: string[]; adj: string[]; adv: string[] };

function classify(word: string): "adv" | "adj" | "nv" {
  if (word.length > 4 && /ly$/.test(word)) return "adv";
  if (
    (word.length > 4 && /(ful|ous|ive|less|able|ible|ish|al|ic)$/.test(word)) ||
    (word.length > 3 && /y$/.test(word) && !/ly$/.test(word))
  ) {
    return "adj";
  }
  return "nv";
}

function extractFrequencies(posts: { text: string }[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const p of posts) {
    const cleaned = p.text.replace(/https?:\/\/\S+/g, " ").replace(/@[a-zA-Z0-9._-]+/g, " ");
    const words = cleaned.toLowerCase().match(/[a-z]+/g) || [];
    for (const w of words) {
      if (w.length < 3 || w.length > 15) continue;
      if (STOPWORDS.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return freq;
}

function buildPools(freq: Map<string, number>): Pools {
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100);
  const pools: Pools = { nv: [], adj: [], adv: [] };
  for (const [word, count] of ranked) {
    const bucket = classify(word);
    const weight = Math.min(count, 4);
    for (let i = 0; i < weight; i++) pools[bucket].push(word);
  }
  return pools;
}

function padPools(pools: Pools): void {
  if (pools.nv.length < 8) pools.nv = pools.nv.concat(FALLBACK_WORDS);
  if (pools.adj.length < 4) pools.adj = pools.adj.concat(pools.nv.slice(0, 8));
  if (pools.adv.length < 4) pools.adv = pools.adv.concat(pools.adj.slice(0, 8));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(arr: string[], rng: () => number): string {
  return arr[Math.floor(rng() * arr.length)];
}

function pluralize(w: string): string {
  if (/(s|x|z|ch|sh)$/.test(w)) return w + "es";
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ies";
  return w + "s";
}

function gerund(w: string): string {
  if (/ie$/.test(w)) return w.slice(0, -2) + "ying";
  if (/[^aeiou]e$/.test(w) && !/ee$/.test(w)) return w.slice(0, -1) + "ing";
  return w + "ing";
}

function pastTense(w: string): string {
  if (/e$/.test(w)) return w + "d";
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ied";
  return w + "ed";
}

function fillBlank(kind: string, pools: Pools, rng: () => number): string {
  switch (kind) {
    case "noun": return pick(pools.nv, rng);
    case "plural_noun": return pluralize(pick(pools.nv, rng));
    case "verb": return pick(pools.nv, rng);
    case "verb_ing": return gerund(pick(pools.nv, rng));
    case "past_verb": return pastTense(pick(pools.nv, rng));
    case "adjective": return pick(pools.adj.length ? pools.adj : pools.nv, rng);
    case "adverb": {
      if (pools.adv.length) return pick(pools.adv, rng);
      return pick(pools.adj.length ? pools.adj : pools.nv, rng) + "ly";
    }
    case "exclamation": {
      const all = pools.nv.concat(pools.adj, pools.adv);
      return pick(all.length ? all : FALLBACK_WORDS, rng);
    }
    default: return kind;
  }
}

function fillTemplate(template: string, pools: Pools, rng: () => number): string {
  const filled = template.replace(/\{(\w+)\}/g, (_, kind) => fillBlank(kind, pools, rng));
  return filled.length ? filled[0].toUpperCase() + filled.slice(1) : filled;
}

// Titles + templates copied verbatim from public/index.html's PASTAS array —
// only the fill needs to match; the OG card doesn't render the other 12.
const PASTAS: { title: string; template: string }[] = [
  {
    title: "the navy seal",
    template: `What the {exclamation} did you just say about me, you {adjective} {noun}? I'll have you know I graduated top of my class in the {noun}s, and I've been involved in numerous secret raids on {plural_noun}, and I have over three hundred confirmed {plural_noun}. I am trained in {noun} warfare and I'm the top {noun} in the entire {adjective} armed forces. You are nothing to me but just another {noun}. I will {verb} you with {adjective} precision the likes of which has never been seen before on this Earth, mark my {adjective} words. You think you can get away with {verb_ing} that {noun} to me over the Internet? Think again, {noun}. As we speak I am contacting my secret network of {plural_noun} across the {noun}, and your {noun} is being traced right now so you better prepare for the {noun}, {noun}. The {noun} that wipes out the pathetic little thing you call your {noun}. You're {adjective} dead, {noun}. I can {verb} you in over seven hundred ways, and that's just with my bare {plural_noun}. Not only am I extensively trained in unarmed {noun}, but I have access to the entire {noun} of the {adjective} {noun} and I will use it to its full extent to {verb} your {adjective} {noun} off the face of the continent, you little {noun}. If only you could have known what {adjective} retribution your little {noun} comment was about to bring down upon you, maybe you would have {past_verb} your {adjective} tongue. But you didn't, and now you're {verb_ing}, you {adjective} {noun}. I will {verb} fury all over you and you will drown in it. You're {adjective} dead, {noun}boy.`,
  },
  {
    title: "a person of culture",
    template: `Ah, {noun}. I see you are a {noun} of {adjective} {noun} as well. I too like to {verb} my {plural_noun} in the {adjective} way before {verb_ing} them with {adjective} {noun} sauce, and then, without saying a {adjective} word, {verb} it and eat it.`,
  },
  {
    title: "the linkedin thought leader",
    template: `I was {verb_ing} my {noun} at 4am when a {adjective} {noun} walked up to me and asked for a {noun}. I had none to give. But I gave him something more valuable: {adjective} advice. "{noun} isn't about {plural_noun}," I told him, "it's about {verb_ing} your {adjective} {noun} until the {noun} believes in you." He {past_verb}. I {past_verb}. Neither of us will ever forget that {adjective} {noun} on {noun} street. This is {noun}. Repost if you agree. #{noun} #{adjective}{noun} #grindset`,
  },
  {
    title: "the totally real free nitro",
    template: `hey {noun}!! i just got a {adjective} amount of free {noun} from this {adjective} website, thought you'd want some too before it's {past_verb}. just {verb} your {noun} details and you'll get {adjective} {plural_noun} sent straight to your {noun}. don't tell {noun}, he's {verb_ing} for his own and there's only enough {noun} for {adjective} {plural_noun} like us. trust me {noun}, would i {verb} you???`,
  },
  {
    title: "the pep talk",
    template: `Listen up, {plural_noun}. Out there is a {adjective} {noun} that wants nothing more than to {verb} you, to {verb} your {adjective} dreams and leave you {verb_ing} in the {noun}. But I didn't {verb} four {adjective} {plural_noun} of practice to watch you {verb} now. When that {noun} steps onto the {noun}, I want you to {verb} like you've never {past_verb} before. I want {noun}. I want {adjective} {noun}. Now get out there and {adverb} {verb} that {adjective} {noun} into the ground!`,
  },
  {
    title: "the among us callout",
    template: `{noun} was {adjective}. {noun} says {noun} was in {noun} the whole {noun}. {noun} says {noun} is {adjective}. I saw {noun} vent near {noun}. {noun} is now {verb_ing} in {noun} and won't stop {verb_ing}. Emergency {noun} called. Only a {adjective} few of us remain. Wait — {noun} is {adjective} confirmed {noun}.`,
  },
  {
    title: "the sigma grindset",
    template: `5am. Woke up. Did not hit snooze because winners don't hit snooze. Drank a {adjective} glass of water while looking at my {noun} in the mirror. Told myself: today, we {verb}. Ate three {plural_noun} raw for the protein. Read {noun} pages of a book about {plural_noun}. Cold plunge in the {noun}, out in ninety seconds, no gasping, because gasping is a {noun} mindset. By 6am I had already {past_verb} more than most people {verb} all day. This is not about the {noun}. This is about becoming the kind of {noun} that a {adjective} {noun} would be proud of. Stay {adjective}. Stay {adjective}. Never explain the {noun} to people still {verb_ing} in bed.`,
  },
  {
    title: "the group chat conspiracy",
    template: `ok so hear me out. {noun} texted me at 2am asking if I still had the {noun} from last summer. weird right. then I saw {noun} liked a post about {plural_noun} THREE times. coincidence? I called {noun}, straight to voicemail. I think they're all in on it — the {noun}, the {adjective} {noun} outside, all of it connects. I'm not saying {noun} is behind the {plural_noun}. I'm saying somebody {adjective} needs to explain why every single {noun} in this group chat went quiet at the exact same {noun}. anyway I made a {adjective} chart. we're talking tonight. bring the {plural_noun}.`,
  },
  {
    title: "the raid boss enrage",
    template: `{noun} has entered ENRAGE. {noun} begins {verb_ing} uncontrollably. The ground beneath your {plural_noun} turns {adjective}. A voice, ancient and {adjective}, echoes: "YOU DARE {verb} IN MY {noun}?" "{exclamation}!" someone screams into voice chat. Your {noun} is reduced to zero. Your {plural_noun} scatter. The raid leader types, {adverb}ly, "everybody {verb} to the {noun}, do NOT stand in the {noun}." Someone did not {verb} to the {noun}. The {noun} wipes. Fifteen {plural_noun}, gone, {adverb}, to a mechanic that's been explained four times.`,
  },
  {
    title: "the true crime intro",
    template: `It was a {adjective} Tuesday in a town where everybody knew everybody's {noun}. {noun} was, by all accounts, a {adjective} {noun} — until the night the {noun} went missing. Neighbors reported hearing {plural_noun} at exactly 11pm. The local {noun} said, and I quote, "we've never {past_verb} anything like this before." Three {plural_noun} were found near the {noun}. A single {adjective} {noun} was left on the porch. To this day, no one knows who {past_verb} first — but everyone agrees it started with the {noun}. This is the story of the {adjective} {noun} case. Don't {verb} the lights off tonight.`,
  },
  {
    title: "the airport gate announcement",
    template: `{adjective} passengers, we are currently {verb_ing} the boarding process for the flight to {noun}. We are still waiting on {noun} number four, as well as a {adjective} {noun} that has not yet {past_verb}. If your {noun} has a purple tag, please proceed to the {noun} immediately. Once again, this is a {adjective} boarding call — anyone still in the {noun} area, we will need you to {verb} to the gate now. We appreciate your {adjective} patience and thank you for choosing an airline that definitely still has your {plural_noun} somewhere.`,
  },
  {
    title: "the wine mom",
    template: `Is it 5 o'clock somewhere? Asking for a {noun}. 😂🍷 Survived another day of {noun} duty, three loads of {adjective} laundry, and a {noun} that will not stop {verb_ing}. Pouring a {adjective} glass of the {noun} blend and NOT feeling a single {noun} of guilt about it. To all my {adjective} mama {plural_noun} out there {verb_ing} through the group chat right now — you {verb}, girl, you {verb} that {noun}. Tag a {noun} who needs to hear this. #wineoclock #{noun}mom #{adjective}blessed`,
  },
  {
    title: "the corporate all-hands",
    template: `Thanks everyone for joining today's {adjective} all-hands. I want to start by saying how {adjective} I am of this team's {noun} this quarter. We've seen a {adjective} increase in {noun} synergy, and our {noun} pipeline is looking more {adjective} than ever. I know there's been some {noun} around the recent {plural_noun}, and I want to be transparent: we are {verb_ing} through some {adjective} headwinds. But I truly believe if we all {verb} together, we can {verb} this {noun} to the next level. Any questions? ... {noun}? No? Great, let's {verb} and circle back next {noun}.`,
  },
];

const PUB = "https://public.api.bsky.app/xrpc";

async function jget(path: string, params: Record<string, string>): Promise<any> {
  const u = new URL(`${PUB}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), { cf: { cacheTtl: 60 } as unknown as Record<string, unknown> });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "copypastalibs — mad-libs from someone's own words";
const GENERIC_DESC =
  "Enter a Bluesky handle. It reads their feed, learns the words they actually use, and stuffs them back into classic copypastas mad-libs style.";
const GENERIC_OG_URL = "https://bisks.net/copypastalibs/";

async function renderShare(env: Env, request: Request, handleRaw: string, indexRaw: string, seedRaw: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = decodeURIComponent(handleRaw).trim().replace(/^@/, "");
  const index = Number(indexRaw);
  const seed = parseInt(seedRaw, 36);
  const pasta = PASTAS[index];
  if (!handle || !pasta || !Number.isFinite(seed)) {
    return new Response(html, { headers: base.headers });
  }

  try {
    let did: string;
    if (handle.startsWith("did:")) {
      did = handle;
    } else {
      const r = await jget("com.atproto.identity.resolveHandle", { handle });
      did = r.did;
    }
    const profile = await jget("app.bsky.actor.getProfile", { actor: did });
    const feedData = await jget("app.bsky.feed.getAuthorFeed", { actor: did, limit: "100" });
    const posts: { text: string }[] = [];
    for (const it of feedData.feed || []) {
      if (it.reason) continue;
      const rec = it.post && it.post.record;
      if (!rec || typeof rec.text !== "string" || !rec.text.trim()) continue;
      posts.push({ text: rec.text });
    }

    const freq = extractFrequencies(posts);
    const pools = buildPools(freq);
    padPools(pools);
    const text = fillTemplate(pasta.template, pools, mulberry32(seed));

    const who = "@" + (profile.handle || handle);
    const title = `copypastalibs: ${who}'s "${pasta.title}"`;
    const desc = truncate(text, 300);
    const ogUrl = `https://bisks.net/copypastalibs/p/${encodeURIComponent(handle)}/${index}/${seedRaw}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve/refetch server-side (typo, deleted account, rate
    // limit) — still serve the live page so the link isn't dead; the client
    // script surfaces its own error and the OG card just stays generic.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

const PREFIX = "/copypastalibs";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }

    // Only strip when the prefix is actually present — on the subdomain

    // requests arrive without it, and an unconditional slice would chop

    // the front off short paths ("/app.js" -> "") so every asset would

    // silently serve index.html.

    const localPath = url.pathname.startsWith(PREFIX + "/")

      ? url.pathname.slice(PREFIX.length) || "/"

      : url.pathname;

    const m = localPath.match(/^\/p\/([^/]+)\/(\d+)\/([0-9a-z]+)\/?$/i);
    if (m) return renderShare(env, request, m[1], m[2], m[3]);

    url.pathname = localPath;
    return env.ASSETS.fetch(new Request(url, request));
  },
};
