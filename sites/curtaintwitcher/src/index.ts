// curtaintwitcher Worker — curtaintwitcher.bisks.net
//
// @fromthewestmeadow.com: "Make a fake Nextdoor-style social app where users
// post increasingly paranoid neighborhood updates, reply in character, and
// vote on whether each complaint is real or completely unhinged."
//
// One Durable Object ("global") is the whole town: a hand-written seed feed
// (18 posts, mundane → unhinged) plus whatever anyone posts after. Every post
// gets 1-3 auto-generated replies from a fixed cast of eight neighbors —
// keyword-matched templates, not an LLM call, so no secret is needed and the
// voice is hand-tuned instead of drifting. Two vote buttons per post, REAL vs
// UNHINGED, feed a shared "paranoia meter" for the whole town. New posts get
// a paranoia tier that mostly ratchets up from whatever the last submitted
// post's tier was (the "increasingly paranoid" part), occasionally resetting
// once it maxes out — a fresh news cycle. No login: an opaque id in
// localStorage sent as X-Client-Id, same anonymous-identity shape as
// sites/guestbet's Market DO, which this was copied from.
//
// /p/<id> is a real per-post URL so a shared link's OG card shows THAT post's
// text, not a generic card every share collapses into — same string-replace
// trick as sites/didscope's /s/<handle> (renderShare here is renderPost).

interface DurableObjectId {
  toString(): string;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  BOARD: DurableObjectNamespace;
}

const GENERIC_TITLE = "curtaintwitcher — is it real, or is it just Tuesday";
const GENERIC_DESC =
  "A fake Nextdoor where the neighborhood's posts get more paranoid by the day. Read the thread, vote REAL or UNHINGED.";
const GENERIC_OG_URL = "https://curtaintwitcher.bisks.net/";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

async function renderPost(env: Env, request: Request, id: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  const html = await base.text();

  try {
    const stubId = env.BOARD.idFromName("global");
    const stub = env.BOARD.get(stubId);
    const r = await stub.fetch(new Request(`https://internal/api/post?id=${encodeURIComponent(id)}`));
    if (!r.ok) throw new Error("no such post");
    const post = await r.json<{ author: string; text: string; tierLabel: string; real: number; unhinged: number }>();

    const title = `curtaintwitcher: ${post.tierLabel} — ${truncate(post.text, 60)}`;
    const desc = truncate(
      `"${post.text}" — ${post.author}. So far: ${post.real} say real, ${post.unhinged} say unhinged.`,
      300
    );
    const ogUrl = `https://curtaintwitcher.bisks.net/p/${encodeURIComponent(id)}`;

    const out = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(out, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
  } catch (_) {
    // Unknown/deleted post id — still serve the live page rather than a dead
    // link; the client's own fetch will just not find it in the feed list.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const id = env.BOARD.idFromName("global");
      const stub = env.BOARD.get(id);
      return stub.fetch(request);
    }

    const m = url.pathname.match(/^\/p\/([^/]+)\/?$/);
    if (m) return renderPost(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};

// ---------------------------------------------------------------------------
// The cast. Every reply in the feed comes from one of these eight — same
// voice every time, so the thread reads like a real neighborhood instead of
// a chatbot doing a bit.
// ---------------------------------------------------------------------------
type CharId = "gladys" | "steve" | "dave" | "nadia" | "barb" | "ted" | "tom" | "kevin";

const CHARACTERS: Record<CharId, string> = {
  gladys: "Gladys, Birchwood Ct",
  steve: "Steve (Ret. PD)",
  dave: "Dave + the Ring cam",
  nadia: "Nadia, moon stuff",
  barb: "Barb, HOA Treasurer",
  ted: "Ted, always outside",
  tom: "Tom (doing his own research)",
  kevin: "Kevin, just walking the dog",
};

interface Reply {
  char: CharId;
  text: string;
}

// category -> hand-written, keyword-relevant replies. Matched against a new
// post's text; unmatched posts fall back to GENERIC.
const TEMPLATES: Record<string, Reply[]> = {
  car: [
    { char: "steve", text: "Had a buddy run the plate. Comes back to a rental agency two towns over. That's not nothing." },
    { char: "dave", text: "Got it on the Ring. Circled the cul-de-sac twice before it parked. Timestamped, saved, backed up." },
    { char: "gladys", text: "This is the THIRD unregistered vehicle on our street this month. Forwarding this to the board." },
    { char: "tom", text: "Rental agency's address doesn't show up on any registry I can find. That's not a paperwork error. That's a gap." },
    { char: "kevin", text: "It's probably just someone visiting the Hendersons. They have a lot of family in town." },
  ],
  light: [
    { char: "nadia", text: "I felt this before I saw the post. Moon's void of course tonight, so take it with a grain of salt — but also, trust your gut." },
    { char: "ted", text: "Seen lights like that before. Not gonna say where. Not gonna say when." },
    { char: "dave", text: "Ring caught nothing on my end at that time, which honestly worries me more." },
    { char: "tom", text: "Flickering in a pattern, on a schedule, is not a bad bulb. That's a signal." },
    { char: "gladys", text: "Please tell me this isn't going to turn into the string-light situation on Sherwood again." },
  ],
  noise: [
    { char: "steve", text: "Documented the timestamps for you. If it happens again, call the non-emergency line, not me, I'm retired." },
    { char: "ted", text: "Heard it too. Didn't say anything last time either." },
    { char: "barb", text: "Per Section 4.2 of the bylaws, sustained noise after 10pm is a finable offense regardless of source." },
    { char: "kevin", text: "Could just be the Petersons' new HVAC unit. It is genuinely very loud." },
    { char: "nadia", text: "A sound like that carries energy through a whole block. Please smudge before bed tonight." },
  ],
  drone: [
    { char: "tom", text: "Third pass this week, same flight path. They think we're not keeping track. We are keeping track." },
    { char: "dave", text: "Got 40 seconds of it on the Ring before it went behind the Millers' roofline. Clip saved." },
    { char: "steve", text: "FAA has rules about altitude over residential. I've still got the number if anyone wants it." },
    { char: "gladys", text: "Is this a county thing? Did anyone else get a notice? I did not get a notice." },
  ],
  wifi: [
    { char: "tom", text: "My smart fridge has been acting different since Tuesday. Coincidence? I've stopped using that word." },
    { char: "nadia", text: "Electronics pick up on tension in a house. Have you considered the energy in the room, not just the router?" },
    { char: "kevin", text: "This sounds like you need a firmware update, not a neighborhood watch thread." },
    { char: "dave", text: "Mine dropped too. Lined up the outage times against your post — they match, almost to the minute." },
  ],
  animal: [
    { char: "gladys", text: "If it's the Hendersons' cat again I am calling the board, that's the fourth garden this month." },
    { char: "ted", text: "Raccoons round here have gotten bold lately. Gotten organized, some might say." },
    { char: "kevin", text: "It's a raccoon. It's just a raccoon." },
    { char: "nadia", text: "Animals sense things before we do. I wouldn't dismiss this so fast." },
  ],
  mail: [
    { char: "dave", text: "Ring's got a clean shot of the porch. Whoever it was knew exactly where the blind spot is." },
    { char: "barb", text: "Package theft is a police matter, not an HOA matter — please stop emailing the board about this." },
    { char: "steve", text: "File a report. Doesn't have to go anywhere, it just needs to be on record somewhere official." },
    { char: "tom", text: "Notice it's always a Tuesday? That's not a coincidence, that's a pattern." },
  ],
  smell: [
    { char: "nadia", text: "Trust your nose. It knows before your brain has caught up to it." },
    { char: "kevin", text: "Someone on Birchwood is probably just smoking near an open window. It happens more than you'd think." },
    { char: "gladys", text: "If this is coming from a permitted business I would like to see the permit." },
  ],
  kids: [
    { char: "gladys", text: "I've said this before and I'll say it again: we need an actual town hall, in person, with a sign-in sheet." },
    { char: "steve", text: "Kept an eye out on my walk today. Nothing. Doesn't mean nothing yesterday, but nothing today." },
    { char: "tom", text: "Ask yourself why the school never released the visitor log for that week. Just ask yourself that." },
  ],
};

const GENERIC: Reply[] = [
  { char: "gladys", text: "Adding this to the list. The list is getting long." },
  { char: "ted", text: "Yep." },
  { char: "kevin", text: "Could just be nothing, honestly. Most of this stuff usually is." },
  { char: "dave", text: "Checking the Ring history now. Will report back either way." },
  { char: "nadia", text: "This tracks with what I've been sensing all week, for what it's worth." },
  { char: "barb", text: "Please use the proper form for neighborhood concerns going forward, not just a post." },
  { char: "tom", text: "This is bigger than one street. You know that, right?" },
  { char: "steve", text: "Noted. Keeping an eye on it, same as everything else on this app lately." },
];

const CATEGORY_KEYWORDS: Record<string, RegExp> = {
  car: /\b(van|car|sedan|vehicle|parked|plate|truck)\b/i,
  light: /\b(light|flashlight|headlights?|glow(ing)?|flicker(ing)?|streetlight)\b/i,
  noise: /\b(nois(e|y)|sound|humming|buzzing|knock(ing)?|hum)\b/i,
  drone: /\b(drone|helicopter|hovering|sky)\b/i,
  wifi: /\b(wifi|wi-fi|router|signal|internet|electronics?)\b/i,
  animal: /\b(cat|dog|raccoon|coyote|animal|squirrel)\b/i,
  mail: /\b(mail|package|delivery|porch|mailbox)\b/i,
  smell: /\b(smell|odor|odour)\b/i,
  kids: /\b(kids?|child(ren)?|school|playground)\b/i,
};

function categoriesFor(text: string): string[] {
  const hits: string[] = [];
  for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS)) {
    if (re.test(text)) hits.push(cat);
  }
  return hits;
}

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickReplies(text: string, tier: number): Reply[] {
  const cats = categoriesFor(text);
  const pool = cats.length ? cats.flatMap((c) => TEMPLATES[c] || []) : [];
  const combined = shuffled([...pool, ...shuffled(GENERIC)]);

  const numReplies = tier <= 2 ? 1 : tier <= 4 ? 2 : 3;
  const used = new Set<CharId>();
  const out: Reply[] = [];
  for (const r of combined) {
    if (used.has(r.char)) continue;
    used.add(r.char);
    out.push(r);
    if (out.length >= numReplies) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Seed feed — 18 hand-written posts, tier 1 (mundane) through tier 5 (off the
// grid), plus hand-picked replies so the launch feed has a real comedic arc
// instead of reading like random template output. createdAt offsets are
// negative minutes-ago so the feed sorts newest (most unhinged) first.
// ---------------------------------------------------------------------------
const TIER_LABELS = ["", "Mildly Suspicious", "Keeping An Eye Out", "Building A Timeline", "This Is Bigger Than Us", "Off The Grid"];

interface SeedSpec {
  author: string;
  text: string;
  tier: number;
  minutesAgo: number;
  real: number;
  unhinged: number;
  replies: Reply[];
}

const SEEDS: SeedSpec[] = [
  { author: "Linda P.", tier: 1, minutesAgo: 60 * 24 * 9, real: 14, unhinged: 1,
    text: "Anyone else notice the recycling gets picked up at a different time now? Just seems later than usual. Not complaining, just noting it.",
    replies: [{ char: "kevin", text: "Yeah, city changed the route last month. It's on their site." }] },
  { author: "Frank D.", tier: 1, minutesAgo: 60 * 24 * 8, real: 11, unhinged: 3,
    text: "There's a white sedan I don't recognize that's been parked outside the Hendersons' for two days. Probably just visiting family but wanted to flag it.",
    replies: [
      { char: "kevin", text: "It's probably just someone visiting the Hendersons. They have a lot of family in town." },
      { char: "gladys", text: "Noting this for the record in case it becomes a pattern." },
    ] },
  { author: "Marcus T.", tier: 1, minutesAgo: 60 * 24 * 7, real: 9, unhinged: 2,
    text: "Porch light on 14 Birchwood has been flickering every night around 9pm. Might just be the bulb!",
    replies: [{ char: "dave", text: "Could be a loose connection. I'd check the socket before anything else." }] },
  { author: "Dana W.", tier: 2, minutesAgo: 60 * 24 * 6, real: 7, unhinged: 6,
    text: "Second night in a row I've heard a weird humming sound around 11pm. Coming from the direction of the greenbelt, maybe? Anyone else?",
    replies: [
      { char: "ted", text: "Heard it too. Didn't say anything last time either." },
      { char: "nadia", text: "A sound like that carries energy through a whole block. Please smudge before bed tonight." },
    ] },
  { author: "New Neighbor (regrets moving here already)", tier: 2, minutesAgo: 60 * 24 * 6 - 40, real: 5, unhinged: 8,
    text: "My Ring caught someone walking a dog past my house four times in one hour yesterday. Same dog, same direction, every time. Made a note of the times.",
    replies: [
      { char: "dave", text: "Send me the clip, I'll cross-reference against my own timestamps." },
      { char: "kevin", text: "Some dogs just really like that loop. Mine does the same thing." },
    ] },
  { author: "The Ochoas", tier: 2, minutesAgo: 60 * 24 * 5, real: 10, unhinged: 4,
    text: "Does anyone know why there's suddenly a drone doing slow laps over the cul-de-sac around dinnertime? Not accusing anyone, just curious.",
    replies: [{ char: "tom", text: "Third pass this week, same flight path. They think we're not keeping track. We are keeping track." }] },
  { author: "Priya S.", tier: 2, minutesAgo: 60 * 24 * 4, real: 6, unhinged: 9,
    text: "Package didn't get stolen but it WAS moved about two feet from where the driver left it. I have the delivery photo and the porch cam photo and they don't match up.",
    replies: [
      { char: "barb", text: "Package theft is a police matter, not an HOA matter, please stop emailing the board about this." },
      { char: "tom", text: "Two feet exactly? That's not wind. That's deliberate." },
    ] },
  { author: "Frank D.", tier: 3, minutesAgo: 60 * 24 * 3 - 200, real: 4, unhinged: 12,
    text: "Ok I've started keeping a written log. Three nights now the streetlight outside my house goes dark for exactly 6 minutes, always between 10:40 and 11pm. I checked, it is NOT on a timer according to the utility company.",
    replies: [
      { char: "gladys", text: "Adding this to the list. The list is getting long." },
      { char: "ted", text: "Seen lights like that before. Not gonna say where. Not gonna say when." },
      { char: "kevin", text: "Could just be a grid maintenance thing. Utility companies don't always tell you." },
    ] },
  { author: "Dana W.", tier: 3, minutesAgo: 60 * 24 * 3 - 100, real: 3, unhinged: 15,
    text: "Wifi has dropped at my house at 3:12am two nights running. Checked my router logs, nothing changed on my end. Not saying it's connected to the light thing but I wrote both down in the same notebook.",
    replies: [
      { char: "tom", text: "My smart fridge has been acting different since Tuesday. Coincidence? I've stopped using that word." },
      { char: "dave", text: "Mine dropped too. Lined up the outage times against your post — they match, almost to the minute." },
    ] },
  { author: "Marcus T.", tier: 3, minutesAgo: 60 * 24 * 3, real: 5, unhinged: 18,
    text: "The same white sedan from last week (see my earlier post) is back — except now there are TWO of them, parked one house apart, facing opposite directions. Like a pincer.",
    replies: [
      { char: "steve", text: "Had a buddy run the plate. Comes back to a rental agency two towns over. That's not nothing." },
      { char: "gladys", text: "This is the THIRD unregistered vehicle on our street this month. Forwarding this to the board." },
    ] },
  { author: "The Ochoas", tier: 3, minutesAgo: 60 * 24 * 2 - 300, real: 6, unhinged: 14,
    text: "Cats have been screaming near the storm drain on Birchwood every night this week, almost the exact same time. My cat WON'T go near that end of the yard anymore and she has never once been wrong about anything.",
    replies: [{ char: "nadia", text: "Animals sense things before we do. I wouldn't dismiss this so fast." }] },
  { author: "Priya S.", tier: 4, minutesAgo: 60 * 24 * 2 - 150, real: 2, unhinged: 22,
    text: "I don't think this is random anymore. The streetlight thing, the wifi thing, the sedans — I laid it all out on a corkboard (yes, an actual corkboard, don't laugh) and the timestamps line up in a way that should not line up by chance.",
    replies: [
      { char: "tom", text: "This is bigger than one street. You know that, right?" },
      { char: "kevin", text: "Genuinely, respectfully — maybe step away from the corkboard for a night." },
      { char: "gladys", text: "Would love to see this at the next town hall. Bring the corkboard." },
    ] },
  { author: "Linda P.", tier: 4, minutesAgo: 60 * 24 * 2, real: 3, unhinged: 19,
    text: "Talked to someone two streets over — the SAME streetlight pattern is happening on Sherwood Ln. That's not a coincidence, that's a grid.",
    replies: [
      { char: "barb", text: "If this is a grid-wide issue I need it in writing before the next board meeting, not just a post." },
      { char: "ted", text: "Told you it wasn't just us." },
    ] },
  { author: "The Ochoas", tier: 4, minutesAgo: 60 * 24 - 400, real: 1, unhinged: 27,
    text: "Found a small device zip-tied to the underside of the community mailbox cluster. Did NOT touch it. Called it in. Taking pictures from a distance until someone official shows up.",
    replies: [
      { char: "steve", text: "Good, do not touch it. Called the same thing in myself once, turned out to be a temperature logger, but you did the right thing." },
      { char: "tom", text: "'Temperature logger' is exactly what they'd want you to think it is." },
      { char: "dave", text: "Get a wide shot on the Ring too if you can, not just the zoom." },
    ] },
  { author: "Marcus T.", tier: 4, minutesAgo: 60 * 24 - 200, real: 2, unhinged: 24,
    text: "The drone is back. This time it hovered. It has never hovered before.",
    replies: [{ char: "dave", text: "Got 40 seconds of it on the Ring before it went behind the Millers' roofline. Clip saved." }] },
  { author: "Dana W.", tier: 5, minutesAgo: 60 * 20, real: 1, unhinged: 31,
    text: "I am typing this from my neighbor's driveway because I do not trust my own wifi right now. Everything I said would happen has happened. Screenshot this post before it 'disappears' like my last one did (it did not disappear, I deleted it, but that is beside the point).",
    replies: [
      { char: "nadia", text: "This tracks with what I've been sensing all week, for what it's worth." },
      { char: "kevin", text: "It's your own wifi. You're on your neighbor's driveway using their wifi to say you don't trust wifi." },
      { char: "tom", text: "She's not wrong to be careful. None of us are careful enough." },
    ] },
  { author: "Frank D.", tier: 5, minutesAgo: 60 * 10, real: 4, unhinged: 26,
    text: "The HOA newsletter this month used the word 'community' eleven times. Eleven. That is not normal for a newsletter that used to just be about trash day. I counted twice.",
    replies: [
      { char: "barb", text: "I write the newsletter. It is about trash day. I promise you it is still about trash day." },
      { char: "gladys", text: "Counted it myself just now. It's nine, not eleven, but the trend is still concerning." },
    ] },
  { author: "New Neighbor (regrets moving here already)", tier: 5, minutesAgo: 20, real: 8, unhinged: 20,
    text: "New neighbor moved in three weeks ago. Has not once put their trash bins away same-day. I am not saying it's connected to the drone. I am saying I have questions and so far zero answers.",
    replies: [
      { char: "gladys", text: "Adding this to the list. The list is getting long." },
      { char: "kevin", text: "I think this one might just be about the trash bins." },
    ] },
];

interface Post {
  id: string;
  author: string;
  text: string;
  tier: number;
  tierLabel: string;
  createdAt: number;
  votes: { real: number; unhinged: number };
  replies: { char: CharId; name: string; text: string }[];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const POST_COOLDOWN_MS = 15_000;
const MAX_POSTS = 400;
const MAX_TEXT = 400;
const MAX_AUTHOR = 40;

export class Board {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private posts: Post[] = [];
  private meter = 40;
  private lastTier = 3;
  private nextId = 1;
  private voters: Map<string, Map<string, "real" | "unhinged">> = new Map();
  private lastPostAt: Map<string, number> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const posts = await this.state.storage.get<Post[]>("posts");
      if (posts) {
        this.posts = posts;
      } else {
        const now = Date.now();
        this.posts = SEEDS.map((s, i) => ({
          id: "s" + (i + 1),
          author: s.author,
          text: s.text,
          tier: s.tier,
          tierLabel: TIER_LABELS[s.tier],
          createdAt: now - s.minutesAgo * 60_000,
          votes: { real: s.real, unhinged: s.unhinged },
          replies: s.replies.map((r) => ({ char: r.char, name: CHARACTERS[r.char], text: r.text })),
        })).sort((a, b) => b.createdAt - a.createdAt);
        this.nextId = SEEDS.length + 1;
        await this.persist();
      }
      const meter = await this.state.storage.get<number>("meter");
      if (typeof meter === "number") this.meter = meter;
      else this.meter = this.computeSeedMeter();
      const lastTier = await this.state.storage.get<number>("lastTier");
      if (typeof lastTier === "number") this.lastTier = lastTier;
      const nextId = await this.state.storage.get<number>("nextId");
      if (typeof nextId === "number") this.nextId = nextId;
      const voters = await this.state.storage.get<[string, [string, "real" | "unhinged"][]][]>("voters");
      if (voters) this.voters = new Map(voters.map(([pid, list]) => [pid, new Map(list)]));
    });
  }

  private computeSeedMeter(): number {
    const totalTier = this.posts.reduce((a, p) => a + p.tier, 0);
    const avgTier = this.posts.length ? totalTier / this.posts.length : 3;
    return Math.round(((avgTier - 1) / 4) * 80 + 10);
  }

  private async persist(): Promise<void> {
    await this.state.storage.put({
      posts: this.posts,
      meter: this.meter,
      lastTier: this.lastTier,
      nextId: this.nextId,
      voters: Array.from(this.voters.entries()).map(([pid, m]) => [pid, Array.from(m.entries())]),
    });
  }

  private meterLabel(): string {
    if (this.meter < 20) return "Suspiciously calm";
    if (this.meter < 40) return "Business as usual";
    if (this.meter < 60) return "Getting chatty";
    if (this.meter < 80) return "Whole block is on edge";
    return "Nobody is sleeping tonight";
  }

  private nextTier(): number {
    if (this.lastTier >= 5) {
      // Occasionally the news cycle resets rather than staying pinned at max.
      return Math.random() < 0.3 ? 2 : 5;
    }
    const roll = Math.random();
    if (roll < 0.15) return this.lastTier; // held steady
    return Math.min(5, this.lastTier + 1);
  }

  private feedView(clientId: string) {
    return {
      meter: this.meter,
      meterLabel: this.meterLabel(),
      posts: this.posts.map((p) => ({
        ...p,
        yourVote: this.voters.get(p.id)?.get(clientId) || null,
      })),
    };
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const clientId = (request.headers.get("x-client-id") || "").trim().slice(0, 80);

    if (url.pathname === "/api/post" && request.method === "GET") {
      const id = url.searchParams.get("id") || "";
      const post = this.posts.find((p) => p.id === id);
      if (!post) return json({ error: "not found" }, 404);
      return json({
        author: post.author,
        text: post.text,
        tierLabel: post.tierLabel,
        real: post.votes.real,
        unhinged: post.votes.unhinged,
      });
    }

    if (url.pathname === "/api/feed" && request.method === "GET") {
      return json(this.feedView(clientId));
    }

    if (url.pathname === "/api/post" && request.method === "POST") {
      if (!clientId) return json({ error: "missing client id" }, 400);

      const last = this.lastPostAt.get(clientId) || 0;
      if (Date.now() - last < POST_COOLDOWN_MS) {
        return json({ error: "one crisis at a time — try again in a moment" }, 429);
      }

      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }

      const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
      const author = (typeof body.author === "string" ? body.author.trim() : "").slice(0, MAX_AUTHOR) || "A Neighbor";
      if (text.length < 3) return json({ error: "needs a little more than that" }, 400);

      this.lastPostAt.set(clientId, Date.now());

      const tier = this.nextTier();
      this.lastTier = tier;
      const replies = pickReplies(text, tier).map((r) => ({ char: r.char, name: CHARACTERS[r.char], text: r.text }));

      const post: Post = {
        id: "p" + this.nextId++,
        author,
        text,
        tier,
        tierLabel: TIER_LABELS[tier],
        createdAt: Date.now(),
        votes: { real: 0, unhinged: 0 },
        replies,
      };
      this.posts.unshift(post);
      if (this.posts.length > MAX_POSTS) this.posts.length = MAX_POSTS;

      this.meter = Math.max(0, Math.min(100, this.meter + (tier - 3) * 4));

      await this.persist();
      return json({ ...this.feedView(clientId), newPostId: post.id });
    }

    if (url.pathname === "/api/vote" && request.method === "POST") {
      if (!clientId) return json({ error: "missing client id" }, 400);

      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }

      const postId = typeof body.postId === "string" ? body.postId : "";
      const choice = body.choice === "real" || body.choice === "unhinged" ? body.choice : null;
      if (!postId || !choice) return json({ error: "bad vote" }, 400);

      const post = this.posts.find((p) => p.id === postId);
      if (!post) return json({ error: "not found" }, 404);

      if (!this.voters.has(postId)) this.voters.set(postId, new Map());
      const postVoters = this.voters.get(postId)!;
      if (postVoters.has(clientId)) {
        return json({ error: "already voted", ...this.feedView(clientId) }, 409);
      }
      postVoters.set(clientId, choice);
      post.votes[choice] += 1;
      this.meter = Math.max(0, Math.min(100, this.meter + (choice === "unhinged" ? 1 : -1)));

      await this.persist();
      return json(this.feedView(clientId));
    }

    return json({ error: "not found" }, 404);
  }
}
