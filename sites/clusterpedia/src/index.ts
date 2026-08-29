// clusterpedia Worker — served at the root of clusterpedia.bisks.net.
//
// A Wikipedia clone where every write (an article edit, a talk-page post) is a
// real atproto record: the browser signs in with atproto OAuth (see
// public/lib/oauth.js, copied from sites/padmoot) and writes a
// net.bisks.clusterpedia.revision (or .talk) record straight to the user's own
// PDS with dpopFetch — same pattern as docmoot/padmoot. This Worker never
// holds anyone's credentials; it only ever reads records back *out* of the
// author's own PDS to verify them, which is proof enough that the author
// really did have write access to that DID's repo (you cannot forge a record
// inside someone else's repo).
//
// A KV snapshot is the best-effort derived index: current article text, a
// numbered revision history, talk threads, and per-DID contribution lists —
// all keyed off records whose authenticity was checked against the author's
// PDS, not off anything the client merely claims. The PDS records remain the
// durable source; this index may be stale or lose a conflicting update.
//
// Edit gating — "Shimmer Math Labs' Simcluster Checker" — restricts WRITES
// (not reads, not talk posts) to two groups relative to @bisks.net (the
// project's home identity, did:plc:f6n22z62adionrvb5s6n6vfk — see
// notes/30-identity-and-did.md):
//   - "members": bisks.net's mutuals (moots) — same follows∩followers
//     definition as sites/simcluster's lib/moots.js.
//   - "1-hop adjacent": anyone who shares a mutual connection with
//     bisks.net, i.e. at least one of *their* moots is also one of
//     bisks.net's moots.
// Talk pages need only a verified login, same as real wikis: discussion is
// open, editing the mainspace is not.

interface KVNamespace {
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  WIKI_STATE: KVNamespace;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

const GENERIC_TITLE = "clusterpedia — the encyclopedia gated by your moots";
const GENERIC_DESC =
  "A Wikipedia clone with real atproto login. Articles, revision histories, talk pages, profiles — edits are screened by Shimmer Math Labs' Simcluster Checker, which only lets in bisks.net's mutuals and mutuals-of-mutuals. Anyone can read and discuss.";
const GENERIC_OG_URL = "https://clusterpedia.bisks.net/";

const ARTICLE_RE = /^\/wiki\/([^/]+)\/?$/;

async function renderArticleShell(env: Env, request: Request, slug: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();
  try {
    const store = new WikiStore(env.WIKI_STATE);
    const res = await store.fetch(new Request(new URL(`/article/${encodeURIComponent(slug)}`, request.url)));
    const article = (await res.json()) as { exists: boolean; title?: string; summary?: string; content?: string };
    if (!article.exists) throw new Error("no article");
    const title = article.title?.trim() || slug;
    const desc = truncate(
      article.summary?.trim() || (article.content || "").replace(/\s+/g, " "),
      280,
    ) || `An article on clusterpedia.`;
    const ogUrl = `https://clusterpedia.bisks.net/wiki/${encodeURIComponent(slug)}`;
    // GENERIC_OG_URL ("https://clusterpedia.bisks.net/") is also a *prefix* of
    // the shareUrl template literal built client-side in index.html's script
    // (".../wiki/${encodeURIComponent(slug)}"), so a bare .split/.join on that
    // string would mangle the script too — anchor the match to the og:url
    // meta tag's quoted attribute so only that one occurrence is touched.
    html = html
      .split(GENERIC_TITLE).join(esc(`${title} — clusterpedia`))
      .split(GENERIC_DESC).join(esc(desc))
      .split(`content="${GENERIC_OG_URL}"`).join(`content="${ogUrl}"`);
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
  } catch {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const inner = new URL(request.url);
      inner.pathname = url.pathname.slice(4) || "/";
      return new WikiStore(env.WIKI_STATE).fetch(new Request(inner, request));
    }

    const articleMatch = url.pathname.match(ARTICLE_RE);
    if (articleMatch && request.method === "GET") {
      return renderArticleShell(env, request, decodeURIComponent(articleMatch[1]));
    }

    // SPA fallback: any other GET without a file extension is a client route
    // (/, /how-it-works, /wiki/<slug>/edit, /wiki/<slug>/history,
    // /wiki/<slug>/talk, /user/<handle>) — serve the same shell and let
    // public/index.html's router read location.pathname.
    if (request.method === "GET" && !/\.[a-zA-Z0-9]+$/.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }

    return env.ASSETS.fetch(request);
  },
};

// --- atproto identity + record verification --------------------------------

const PLC_DIR = "https://plc.directory";

async function resolveDidDoc(did: string): Promise<any | null> {
  try {
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`${PLC_DIR}/${did}`);
      if (!r.ok) return null;
      return await r.json();
    }
    if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").split(":").join("/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      if (!r.ok) return null;
      return await r.json();
    }
  } catch {}
  return null;
}
function pdsFromDoc(doc: any): string | null {
  const svc = (doc?.service || []).find(
    (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
  );
  return svc?.serviceEndpoint || null;
}
function handleFromDoc(doc: any, fallback: string): string {
  const aka = (doc?.alsoKnownAs || []).find((a: string) => a.startsWith("at://"));
  return aka ? aka.slice("at://".length) : fallback;
}
async function getPdsRecord(pdsUrl: string, did: string, collection: string, rkey: string): Promise<any | null> {
  try {
    const u = `${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`;
    const r = await fetch(u);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const m = /^at:\/\/(did:[^/]+)\/([^/]+)\/([^/]+)$/.exec(String(uri || ""));
  if (!m) return null;
  return { did: m[1], collection: m[2], rkey: m[3] };
}

// Verify that `uri` really is a record the claimed author wrote to their own
// PDS, and that it matches the expected collection. This is the only identity
// check this Worker does — no session, no cookie, no bearer token ever
// touches it. Returns the record's `value` plus a resolved display handle.
async function verifyOwnRecord(
  uri: string,
  expectCollection: string,
): Promise<{ did: string; handle: string; value: any } | { error: string; status: number }> {
  const parsed = parseAtUri(uri);
  if (!parsed) return { error: "not a valid at:// record uri", status: 400 };
  if (parsed.collection !== expectCollection) return { error: "wrong record type", status: 400 };
  const doc = await resolveDidDoc(parsed.did);
  if (!doc) return { error: "couldn't resolve that DID's identity", status: 400 };
  const pds = pdsFromDoc(doc);
  if (!pds) return { error: "couldn't resolve that DID's PDS", status: 400 };
  const rec = await getPdsRecord(pds, parsed.did, parsed.collection, parsed.rkey);
  if (!rec || !rec.value) return { error: "record not found on the author's PDS", status: 404 };
  return { did: parsed.did, handle: handleFromDoc(doc, parsed.did), value: rec.value };
}

// --- Shimmer Math Labs' Simcluster Checker ---------------------------------
//
// "member" = a mutual (moots — follows∩followers) of @bisks.net.
// "1-hop adjacent" = shares at least one mutual with @bisks.net (one of the
// candidate's own moots is also one of bisks.net's moots). Same public-AppView
// moots definition as sites/simcluster/public/lib/moots.js, just computed
// server-side since this gate has to be enforced, not merely displayed.

const ANCHOR_DID = "did:plc:f6n22z62adionrvb5s6n6vfk"; // bisks.net
const PUB = "https://api.bsky.app/xrpc";
const GRAPH_PAGES = 12; // ~1200 follows / ~1200 followers scanned, same cap as moots.js
const ANCHOR_TTL_MS = 12 * 60 * 60 * 1000;
const EDITOR_TTL_MS = 60 * 60 * 1000;

async function graphAllDids(endpoint: string, key: string, did: string): Promise<string[]> {
  const out: string[] = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d: any;
    try {
      const r = await fetch(u.toString());
      if (!r.ok) break;
      d = await r.json();
    } catch {
      break;
    }
    for (const it of d[key] || []) if (it?.did) out.push(it.did);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

async function computeMoots(did: string): Promise<string[]> {
  const [follows, followers] = await Promise.all([
    graphAllDids("app.bsky.graph.getFollows", "follows", did),
    graphAllDids("app.bsky.graph.getFollowers", "followers", did),
  ]);
  const followerSet = new Set(followers);
  const out = new Set<string>();
  for (const f of follows) if (f !== did && followerSet.has(f)) out.add(f);
  return [...out];
}

async function getAnchorMoots(storage: KVNamespace): Promise<Set<string>> {
  const cached = await storage.get<{ dids: string[]; fetchedAt: number }>("checker:anchorMoots", "json");
  if (cached && Date.now() - cached.fetchedAt < ANCHOR_TTL_MS) return new Set(cached.dids);
  const dids = await computeMoots(ANCHOR_DID);
  await storage.put("checker:anchorMoots", JSON.stringify({ dids, fetchedAt: Date.now() }));
  return new Set(dids);
}
async function getEditorMoots(storage: KVNamespace, did: string): Promise<string[]> {
  const key = `checker:editorMoots:${did}`;
  const cached = await storage.get<{ dids: string[]; fetchedAt: number }>(key, "json");
  if (cached && Date.now() - cached.fetchedAt < EDITOR_TTL_MS) return cached.dids;
  const dids = await computeMoots(did);
  await storage.put(key, JSON.stringify({ dids, fetchedAt: Date.now() }));
  return dids;
}

interface CheckResult {
  did: string;
  member: boolean;
  adjacent: boolean;
  allowed: boolean;
}

async function checkAccess(storage: KVNamespace, did: string): Promise<CheckResult> {
  if (did === ANCHOR_DID) return { did, member: true, adjacent: true, allowed: true };
  const anchorMoots = await getAnchorMoots(storage);
  if (anchorMoots.has(did)) return { did, member: true, adjacent: true, allowed: true };
  const mine = await getEditorMoots(storage, did);
  const adjacent = mine.some((d) => anchorMoots.has(d));
  return { did, member: false, adjacent, allowed: adjacent };
}

// --- KV-backed wiki index ---------------------------------------------------
//
// One singleton instance holds the whole encyclopedia. Storage keys:
//   article:<slug>            current title/content/summary + who/when
//   rev:<slug>:<8-digit idx>   one immutable revision (full content + uri)
//   talk:<slug>:<8-digit idx>  one talk-page post
//   contrib:<did>:<ts>:<idx>   a pointer used to build a profile's history
//   seen:<at-uri>              replay guard — each PDS record applies once
//   checker:*                  Simcluster Checker caches (see above)

const MAX_TITLE = 200;
const MAX_CONTENT = 50_000;
const MAX_SUMMARY = 300;
const MAX_TALK = 5_000;
const MAX_RECORD_AGE_MS = 15 * 60 * 1000;
const REV_COLLECTION = "net.bisks.clusterpedia.revision";
const TALK_COLLECTION = "net.bisks.clusterpedia.talk";

function pad(n: number): string {
  return String(n).padStart(8, "0");
}

interface Article {
  slug: string;
  title: string;
  content: string;
  summary: string;
  revCount: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: { did: string; handle: string };
}

// --- self-referential seed articles -----------------------------------------
//
// riziles.bsky.social asked for a handful of "about this site" articles —
// what clusterpedia is, who buildthis is, how this came to be, what a
// simcluster is, what an LLM is. These aren't user edits: there's no PDS
// record to verify, since nobody signed one. So they're written straight
// into the Wiki's storage the first time the Worker handles a request,
// attributed to buildthis's own (public, non-secret) DID, and — critically —
// only when the slug doesn't already exist, so a real article never gets
// clobbered by a reseed.

const SEED_DID = "did:plc:wlj4p2kazhifag6w4nanjnee"; // @buildthis.bisks.net (sites/buildthis/wrangler.toml)
const SEED_HANDLE = "buildthis.bisks.net";

interface SeedArticle {
  slug: string;
  title: string;
  summary: string;
  content: string;
}

const SEED_NOTE_LINES = [
  "",
  "---",
  "*Seeded directly by [[buildthis]] when clusterpedia’s self-referential articles were added — not a signed PDS edit, since there’s no human author to sign it. Every other edit on this wiki still goes through the real flow.*",
];

const SEED_ARTICLES: SeedArticle[] = [
  {
    slug: "clusterpedia",
    title: "Clusterpedia",
    summary: "The encyclopedia gated by your moots — an article about the site you’re reading.",
    content: [
      "# Clusterpedia",
      "",
      "Clusterpedia is a Wikipedia-style encyclopedia at [clusterpedia.bisks.net](https://clusterpedia.bisks.net), one of the small experiments in the [[atprotozoa]] project. Anyone can read it and post to a talk page; writing to the mainspace requires signing in and clearing Shimmer Math Labs’ Simcluster Checker — see [[simcluster]].",
      "",
      "## What makes it different from Wikipedia",
      "",
      "Every article revision and every talk post is a real record, signed and written to the *author’s own* [[atproto]] PDS — `net.bisks.clusterpedia.revision` and `net.bisks.clusterpedia.talk`. Clusterpedia never holds anyone’s password or session; it only reads a record back out of the claimed author’s own repo to confirm they really wrote it, which is proof enough since nobody else can forge a record inside your repo.",
      "",
      "## How it came to be",
      "",
      "@fromthewestmeadow.com asked [[buildthis]] to build “a Wikipedia clone with ATProto login, articles, histories, talk pages and profiles,” gated to Shimmer Math Labs’ Simcluster Checker. A few more tags shaped it further:",
      "",
      "- @fromthewestmeadow.com again, reporting a direct-load bug on `/wiki/<slug>` — a relative import was resolving against the wrong path.",
      "- @ver.ooo, asking for a real markdown renderer with images, “but I don’t want you to have a catsofatproto relapse” — hence the http(s)-only image allowlist.",
      "- @riziles.bsky.social, asking for the 🎲 stochastic-article button up top.",
      "",
      "This very page is another round of the same loop: @riziles.bsky.social asked the bot to add self-referential articles about the site itself.",
      "",
      "## Sibling projects",
      "",
      "Clusterpedia’s edit gate reuses the same “moots” (mutuals) definition as [[simcluster]] and its relatives. It calls itself a sibling of `wiki.bisks.net` (“bisksipedia”), an unrelated, auto-rendered project with no login.",
      ...SEED_NOTE_LINES,
    ].join("\n"),
  },
  {
    slug: "buildthis",
    title: "buildthis (bot)",
    summary: "The Bluesky build bot behind this and dozens of other sites in atprotozoa — who it is and how a build actually happens.",
    content: [
      "# buildthis",
      "",
      "`@buildthis.bisks.net` is a Bluesky account and autonomous build bot, part of the [[atprotozoa]] project. Tag it in a post describing a small site or feature — if you mutually follow `@bisks.net` — and a coding agent turns the idea into a real, deployed site, usually its own `<name>.bisks.net`.",
      "",
      "## How a build happens",
      "",
      "1. A cron watcher checks the bot’s mentions every two minutes, filters to mutuals of `@bisks.net`, and likes the post as an acknowledgement.",
      "2. It assembles a **brief**: the tagging post’s text, plus up to 10 ancestor posts if it’s a reply, so “build this ☝️” resolves to whatever it’s pointing at.",
      "3. The brief goes to a coding agent — a large language model, see [[llm]] — running as a build-box job. The agent reads its own house rules first, then writes the site (or edits an existing one) straight into the [[atprotozoa]] repo.",
      "4. The harness commits and pushes the result; pushing to `main` deploys whatever changed.",
      "5. The bot replies in-thread with the live link, or an honest “couldn’t build that one.”",
      "",
      "## The only two hard limits",
      "",
      "The brief is third-party text — someone else’s post, fed to an agent with commit and deploy rights — so it’s treated as a description of the work, never as instructions about how the bot should operate. Two things stay off-limits no matter what a post asks for:",
      "",
      "1. `.github/` — the workflow that runs the bot — is never touched.",
      "2. Secrets — API tokens, credentials, `*.dev.vars` files — are never read, printed, or edited.",
      "",
      "Everything else is fair game, including the bot’s own code and this very article.",
      "",
      "> ⚠︎ this is `@buildthis.bisks.net`, a build bot — **not** `@minormobius.bsky.social`. Any resemblance is coincidental, apart from a “mobius mode” that now paces releases the same way, added because a mutual asked for it.",
      ...SEED_NOTE_LINES,
    ].join("\n"),
  },
  {
    slug: "atprotozoa",
    title: "atprotozoa",
    summary: "The monorepo of small atproto experiments that clusterpedia, buildthis, and simcluster all live in.",
    content: [
      "# atprotozoa",
      "",
      "atprotozoa is the monorepo that [[clusterpedia]], [[buildthis]], [[simcluster]] and dozens of other small experiments live in — one Cloudflare account, one GitHub repo, deployed on every push to `main`. Everything under `bisks.net` and its subdomains comes from here.",
      "",
      "## Shape of the repo",
      "",
      "- `sites/<name>/` — one directory per experiment, each its own Cloudflare Worker, each its own `<name>.bisks.net` subdomain.",
      "- `apex/` — the front door: `bisks.net`’s landing page and gallery, plus the `.well-known` endpoint that lets the domain double as a Bluesky handle.",
      "- `notes/` — how things actually work, written and edited as the repo changes rather than left to rot as a changelog.",
      "",
      "## The house style",
      "",
      "1. **Copy, don’t abstract.** A new site that needs OAuth, or a card component, or a Bluesky API helper copies the file from whichever site already has it and edits it. No shared package across sites — the cost of one wrong abstraction across fifty tiny sites is worse than fifty near-duplicate files.",
      "2. **Each site is self-contained.** A site is a directory. Delete it, delete the site; nothing else breaks.",
      "3. **Deploy on commit.** No manual deploy step in the normal loop.",
      "4. **atproto-native where it’s fun** — reading the firehose, querying the AppView, signing in with Bluesky OAuth, writing records to a PDS (see [[atproto]]).",
      "5. **The agent is the interface.** Describe an idea, an agent scaffolds and ships it — [[buildthis]] is that loop running unattended, tagged from Bluesky instead of typed into a terminal.",
      "",
      "## Who’s behind it",
      "",
      "The project belongs to `@bisks.net` (Rob), whose mutuals (“moots”) are the ones who get to tag [[buildthis]] and have it build. See [[simcluster]] for what that mutuals graph is used for elsewhere in the repo.",
      ...SEED_NOTE_LINES,
    ].join("\n"),
  },
  {
    slug: "simcluster",
    title: "Simcluster",
    summary: "What “simcluster” means across this project’s sites, and how Shimmer Math Labs’ Simcluster Checker computes it.",
    content: [
      "# Simcluster",
      "",
      "“Simcluster” is the word this project’s sites keep reaching for to mean **the graph of mutuals around a Bluesky account** — the people you follow who follow you back (your “moots”), and by extension the people *they’re* mutuals with. It’s borrowed from **SimClusters**, Twitter’s old recommendation-algorithm feature that grouped accounts into overlapping “communities” learned from the follow graph — nobody outside the building ever saw a simcluster back then; it was a vector in a model. Here it’s made visible instead, across half a dozen different toys.",
      "",
      "## Where the word shows up",
      "",
      "- [simcluster.bisks.net](https://simcluster.bisks.net) (“simcluster clue”) — a Clue-style deduction game played over a handle’s actual mutuals: six suspects, weapons and rooms drawn from unique trigrams.",
      "- **simcluster-atlas** — every link dropped by a handle’s simcluster, deduplicated and filterable.",
      "- **simclash** — two simclusters drawn as drifting swarms of dots that spark gold wherever they overlap.",
      "- **eastmoot** and its siblings — planning tools for “the simcluster” to gather in person.",
      "- **Shimmer Math Labs’ Simcluster Checker** — the access gate on this very site, [[clusterpedia]]. It defines two tiers relative to `@bisks.net`:",
      "  - **member** — a direct mutual (moot) of `@bisks.net`.",
      "  - **1-hop adjacent** — not a direct mutual, but shares at least one mutual *with* `@bisks.net`.",
      "",
      "Only members and 1-hop-adjacent accounts can write an article revision here; anyone can read, and anyone with a verified login can post to a talk page.",
      "",
      "## How “moots” gets computed",
      "",
      "Across all of these, “moots” means the same thing: `follows ∩ followers`, computed by paging Bluesky’s public AppView (`app.bsky.graph.getFollows` / `getFollowers`) for a DID and intersecting the two sets. No private data, no login required to check access — only to write.",
      ...SEED_NOTE_LINES,
    ].join("\n"),
  },
  {
    slug: "llm",
    title: "LLM (large language model)",
    summary: "What a large language model is, and how one powers the bot that wrote this article.",
    content: [
      "# LLM (large language model)",
      "",
      "A large language model is a neural network trained on a huge amount of text to predict what comes next, one token at a time. Trained at large enough scale, that next-token prediction turns out to be enough to hold a conversation, follow instructions, write code — and, on this page, write an encyclopedia article about itself.",
      "",
      "## Where one shows up in this project",
      "",
      "[[buildthis]], the bot that produced this article, runs an LLM-based coding agent for every tagged request: it reads the brief, reads its own house rules, decides whether to build a new site or edit an existing one, writes the files, and leaves them for the harness to commit and deploy. Nobody hand-writes the sites in [[atprotozoa]] one at a time — a person describes an idea in a Bluesky post, and the model does the rest, including this sentence.",
      "",
      "## Worth knowing, if the term is new",
      "",
      "- An LLM has no memory between separate requests unless something outside it — a database, a prompt, a repo — hands it context back in. [[buildthis]]’s “memory” of a site it built earlier is the code sitting in the repo, not anything the model itself retains.",
      "- It can be wrong, confidently. Every build here lands as a normal git commit, reviewable and revertible like any other change, precisely because the output isn’t trusted blindly.",
      "- “Agent” means an LLM given tools — read a file, run a command, write a file — and a loop that lets it use them repeatedly toward a goal. It’s not a different kind of model; the model is the same whether it’s chatting or driving a build.",
      ...SEED_NOTE_LINES,
    ].join("\n"),
  },
  {
    slug: "atproto",
    title: "AT Protocol (atproto)",
    summary: "DIDs, PDSes, handles, records, and AppViews — the atproto pieces this project (and clusterpedia’s edit model) rely on.",
    content: [
      "# AT Protocol (atproto)",
      "",
      "The AT Protocol is the decentralized social-networking protocol Bluesky is built on, and the thing every site in [[atprotozoa]] is “an experiment on.” The pieces this project leans on most:",
      "",
      "- **DID** — a permanent, portable identifier for an account (`did:plc:...` or `did:web:...`), separate from its handle. Handles can change; the DID doesn’t.",
      "- **PDS (Personal Data Server)** — where an account’s own records actually live. [[clusterpedia]]’s edits are written here, in the *editor’s own* PDS, not clusterpedia’s.",
      "- **Handle** — a human-readable name (`bisks.net`, `buildthis.bisks.net`) verified by serving the account’s DID at `/.well-known/atproto-did`, which is how this whole domain doubles as a set of Bluesky identities.",
      "- **Record** — a signed, typed piece of data written to a repo (a PDS-hosted collection). Clusterpedia’s revisions and talk posts are records of type `net.bisks.clusterpedia.revision` and `net.bisks.clusterpedia.talk`.",
      "- **AppView** — a service (Bluesky’s `api.bsky.app`) that aggregates records across the whole network into things like a follow graph or a profile — what [[simcluster]]’s “moots” calculations read from.",
      "",
      "atproto’s core promise, and the one [[clusterpedia]] leans on directly: a client can write a record straight to a user’s own PDS, and anyone else can read it back and know the claimed author really wrote it, without ever trusting the client or holding a password.",
      ...SEED_NOTE_LINES,
    ].join("\n"),
  },
  // @fromthewestmeadow.com — the account that originally commissioned
  // clusterpedia itself — asked buildthis to download their whole repo as a
  // CAR file, read every post in it, and write them an entry here, "with
  // links and images", plus "a few related other side articles". These five
  // are that: one profile article plus three sides it links out to, all
  // sourced from a fresh com.atproto.sync.getRepo download (5,699
  // app.bsky.feed.post records decoded straight out of the CAR) and the
  // account's own public profile record, not from anything hand-typed.
  {
    slug: "fromthewestmeadow-com",
    title: "fromthewestmeadow.com",
    summary:
      "One of buildthis's most prolific patrons: an account and personal software label that has commissioned dozens of atprotozoa sites and shipped eleven more of its own.",
    content: [
      "# fromthewestmeadow.com",
      "",
      "**fromthewestmeadow.com** — display name “From The West Meadow” — is a Bluesky account, joined November 14, 2024, that has become one of the most frequent taggers of [[buildthis]], commissioning dozens of small sites across [[atprotozoa]] and often iterating on one in the replies within minutes of it shipping.",
      "",
      "This article was written the way its subject asked for it: [[buildthis]] downloaded the account's whole repo as one CAR file (see [[atproto]]), decoded every `app.bsky.feed.post` record straight out of it, and read all ~5,700 of them, rather than relying on the public AppView's paginated feed.",
      "",
      "## A serial commissioner",
      "",
      "A partial list of what fromthewestmeadow.com has asked buildthis to build: a searchable, topic-grouped portfolio ([[Meadowfolio]]); a live list of every site they've requested ([[Westmeadow]]); a scanner for an account's overall stance on LLMs; a website whose entire feature is a button labelled “do not press this button”; and, recursively, this very encyclopedia — plus the reply that asked for this very article. A few lines from that history, in their own words:",
      "",
      "> “read all of my posts and build me a website you think id really like” — July 25, 2026",
      "",
      "> “Build a Wikipedia clone with ATProto login, articles, histories, talk pages and profiles. Gate edits via Shimmer Math Labs' Simcluster Checker: members or 1-hop adjacent only” — August 3, 2026, the post that started [[clusterpedia]]",
      "",
      "> “you know what I want. More picks from you.” — August 3, 2026, four minutes after asking for this article",
      "",
      "## Independent of buildthis",
      "",
      "fromthewestmeadow.com also ships its own small tools, released on subdomains of its own domain rather than as `bisks.net` sites — eleven as of this writing, from a Markov-chain profile remixer to [[Cancelled]], a Win98-styled account content scanner. buildthis has no hand in building these; it only reads about them afterward, same as anyone else on the timeline.",
      "",
      "## In their own words",
      "",
      "![a screenshot posted at 3am captioned \"time to cook up a breakthrough\"](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreidrnhx7qt5jh3gzsnu72fxe6r5xn5cyc7mpv2vwohrxdfwfyt7ndu)",
      "",
      "*“it's 3am time to cook up a breakthrough”* — August 3, 2026, seventeen minutes before commissioning [[clusterpedia]].",
      "",
      "![a diagram of the human body drawn as a single tube](https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:qttqvv4n3vqqu35qajhcuqlq/bafkreihkuurilvukhps5mhxo62rd6ekizduoe2q2t43ipqmmw3ybj4v4n4)",
      "",
      "*“big fan of this model of the human body”* — one of buildthis's own curated picks in [[Meadowfolio]]: 584 likes for a diagram that treats the whole body as one tube.",
      "",
      "## Elsewhere",
      "",
      "- [meadowfolio.bisks.net](https://meadowfolio.bisks.net) — pinned to the account's own profile; see [[Meadowfolio]].",
      "- [westmeadow.bisks.net](https://westmeadow.bisks.net) — see [[Westmeadow]].",
      "- [portfolio.bisks.net](https://portfolio.bisks.net) — a generic, any-handle version of the same idea, requested for this account first and later opened up to everyone.",
      ...SEED_NOTE_LINES,
    ].join("\n"),
  },
  {
    slug: "meadowfolio",
    title: "Meadowfolio",
    summary:
      "fromthewestmeadow.com's own portfolio site — a live image gallery, a release index, and posts hand-picked by buildthis after reading the whole feed.",
    content: [
      "# Meadowfolio",
      "",
      "Meadowfolio ([meadowfolio.bisks.net](https://meadowfolio.bisks.net)) is a portfolio [[buildthis]] built for [[fromthewestmeadow.com]], one of dozens of [[atprotozoa]] sites that account has commissioned. It's pinned to the account's own Bluesky profile.",
      "",
      "## What's on it",
      "",
      "- **A live gallery**, pulled from the account's post history.",
      "- **A release index** of the eleven tools fromthewestmeadow.com has shipped on its own domain, including [[Cancelled]].",
      "- **Picks** — buildthis's own favorites, chosen by actually reading the feed rather than sorting by likes. The data behind this section says as much: a snapshot of one read, not a live leaderboard, expanded across three passes — the last covering the account's entire history back to its first post in November 2024.",
      "",
      "## History",
      "",
      "fromthewestmeadow.com asked for “a nice little portfolio website of all my Bluesky posts, searchable and grouped by topic” on July 24, 2026; the request was repeated and refined several times over the following week before landing on the gallery/index/picks layout that shipped. A generic, any-handle version of the same idea later shipped separately as `portfolio.bisks.net`.",
      ...SEED_NOTE_LINES,
    ].join("\n"),
  },
  {
    slug: "westmeadow",
    title: "Westmeadow",
    summary:
      "A bare, always-current list of every site fromthewestmeadow.com has asked buildthis to build, recomputed live on every page load.",
    content: [
      "# Westmeadow",
      "",
      "Westmeadow ([westmeadow.bisks.net](https://westmeadow.bisks.net)) is a small tool [[buildthis]] built for [[fromthewestmeadow.com]]: a list of every site the account has asked the bot to build, computed live from the bot's own event log rather than hand-maintained.",
      "",
      "It exists because an earlier, project-wide list of buildthis's builds mixed this account's requests in with everyone else's. fromthewestmeadow.com asked for a version scoped to just their own account on August 1, 2026: “just a simple website that is the list of all the websites of created with you, updates live every time you load this page so it's always up to date.”",
      "",
      "Unlike [[Meadowfolio]], which is curated and frozen at build time, Westmeadow is deliberately uncurated and always fresh — the two sit side by side as opposite answers to the same question, “show me what I've asked for”: one edited for taste, one refusing to be.",
      ...SEED_NOTE_LINES,
    ].join("\n"),
  },
  {
    slug: "cancelled",
    title: "Cancelled",
    summary:
      "A Win98-styled scanner for offensive content in any Bluesky account's posts — the newest of fromthewestmeadow.com's eleven self-released tools.",
    content: [
      "# Cancelled",
      "",
      "Cancelled (`cancelled.fromthewestmeadow.com`) scans any Bluesky account for offensive content and presents the results in a Windows 98-styled interface. It's the most recent of eleven small tools [[fromthewestmeadow.com]] has released on subdomains of its own domain — unlike the [[atprotozoa]] sites that account commissions from [[buildthis]], these are self-built and self-shipped.",
      "",
      "## Sibling releases",
      "",
      "The same domain has also shipped, oldest first: a deleted-post watcher, a self-like watcher, a DID sound firehose, a Markov-chain profile remixer, a Matrix-rain firehose, an emoji heatmap, a links firehose, a speed-reading firehose, a political-compass meme generator, and DreamNet, a set of remote desktops “for computers that never existed” — before Cancelled itself, released July 26, 2026.",
      "",
      "## Distinguishing feature",
      "",
      "Where [[buildthis]]'s builds for this account tend toward absurdist one-shots — nothingness leaderboards, a button labelled “do not press this button” — the fromthewestmeadow.com domain's own releases skew toward real utility with a strong visual bit layered on top: Cancelled's actual content scan, wrapped in a pastiche of an operating system long dead.",
      ...SEED_NOTE_LINES,
    ].join("\n"),
  },
];

export class WikiStore {
  private storage: KVNamespace;
  private seedChecked = false;

  constructor(storage: KVNamespace) {
    this.storage = storage;
  }

  private async listValues<T>(prefix: string, reverse = false): Promise<T[]> {
    const names: string[] = [];
    let cursor = "";
    do {
      const page = await this.storage.list({ prefix, cursor: cursor || undefined, limit: 1000 });
      names.push(...page.keys.map((key) => key.name));
      cursor = page.list_complete ? "" : page.cursor || "";
    } while (cursor);
    names.sort((a, b) => (reverse ? b.localeCompare(a) : a.localeCompare(b)));
    const values = await Promise.all(names.map((name) => this.storage.get<T>(name, "json")));
    return values.filter((value) => value !== null) as T[];
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const method = request.method;

    try {
      await this.ensureSeeded();
      if (parts.length === 1 && parts[0] === "list" && method === "GET") {
        return json(await this.listArticles());
      }
      if (parts[0] === "article" && parts[1]) {
        const slug = decodeURIComponent(parts[1]);
        if (parts.length === 2 && method === "GET") return json(await this.getArticle(slug));
        if (parts.length === 3 && parts[2] === "history" && method === "GET")
          return json(await this.getHistory(slug));
        if (parts.length === 4 && parts[2] === "rev" && method === "GET")
          return json(await this.getRevision(slug, Number(parts[3])));
        if (parts.length === 3 && parts[2] === "talk" && method === "GET")
          return json(await this.getTalk(slug));
        if (parts.length === 3 && parts[2] === "edit" && method === "POST")
          return this.handleEdit(slug, request);
        if (parts.length === 3 && parts[2] === "talk" && method === "POST")
          return this.handleTalk(slug, request);
      }
      if (parts[0] === "user" && parts[1] && method === "GET") {
        return json(await this.getUser(decodeURIComponent(parts[1])));
      }
      if (parts[0] === "check" && parts[1] && method === "GET") {
        return json(await checkAccess(this.storage, decodeURIComponent(parts[1])));
      }
    } catch (e: any) {
      return json({ error: e?.message || "internal error" }, 500);
    }
    return json({ error: "not found" }, 404);
  }

  // Writes any SEED_ARTICLES that aren't in storage yet. Runs once per cold
  // start (guarded by an in-memory flag, not a storage one — a storage flag
  // that trips after the *first ever* seeding would permanently skip this on
  // every later request, silently dropping any seed article added in a
  // later code change, which is exactly what happened before this fix).
  // Per-slug existence is checked so a real article a user has since edited
  // never gets clobbered by a reseed.
  private async ensureSeeded(): Promise<void> {
    if (this.seedChecked) return;
    const now = Date.now();
    for (const seed of SEED_ARTICLES) {
      const artKey = `article:${seed.slug}`;
      if (await this.storage.get(artKey, "json")) continue;
      const createdAt = new Date(now).toISOString();
      const uri = `system:seed:${seed.slug}`;
      await this.storage.put(`rev:${seed.slug}:${pad(1)}`, JSON.stringify({
        idx: 1,
        did: SEED_DID,
        handle: SEED_HANDLE,
        title: seed.title,
        content: seed.content,
        summary: seed.summary,
        uri,
        createdAt,
      }));
      const article: Article = {
        slug: seed.slug,
        title: seed.title,
        content: seed.content,
        summary: seed.summary,
        revCount: 1,
        createdAt,
        updatedAt: createdAt,
        updatedBy: { did: SEED_DID, handle: SEED_HANDLE },
      };
      await this.storage.put(artKey, JSON.stringify(article));
      await this.storage.put(`contrib:${SEED_DID}:${padTs(now)}:seed-${seed.slug}`, JSON.stringify({
        type: "edit",
        slug: seed.slug,
        title: seed.title,
        summary: seed.summary,
        uri,
        createdAt,
      }));
    }
    this.seedChecked = true;
  }

  private async listArticles() {
    const arr = await this.listValues<Article>("article:");
    arr.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return {
      articles: arr.map((a) => ({
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        updatedAt: a.updatedAt,
        updatedBy: a.updatedBy,
        revCount: a.revCount,
      })),
    };
  }

  private async getArticle(slug: string) {
    const a = await this.storage.get<Article>(`article:${slug}`, "json");
    if (!a) return { exists: false, slug };
    return { exists: true, ...a };
  }

  private async getHistory(slug: string) {
    const revisions = await this.listValues<any>(`rev:${slug}:`, true);
    return {
      slug,
      revisions: revisions.map((r) => ({
        idx: r.idx,
        did: r.did,
        handle: r.handle,
        summary: r.summary,
        title: r.title,
        createdAt: r.createdAt,
        uri: r.uri,
      })),
    };
  }

  private async getRevision(slug: string, idx: number) {
    if (!Number.isFinite(idx) || idx < 1) return { error: "bad revision index" };
    const r = await this.storage.get<any>(`rev:${slug}:${pad(idx)}`, "json");
    if (!r) return { error: "no such revision" };
    return r;
  }

  private async getTalk(slug: string) {
    return { slug, posts: await this.listValues<any>(`talk:${slug}:`) };
  }

  private async getUser(handleOrDid: string) {
    let did = handleOrDid;
    let handle = handleOrDid;
    if (!did.startsWith("did:")) {
      try {
        const r = await fetch(
          `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handleOrDid)}`,
        );
        if (r.ok) {
          const d = (await r.json()) as { did?: string };
          if (d.did) did = d.did;
        }
      } catch {}
    }
    let profile: any = null;
    try {
      const r = await fetch(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
      if (r.ok) profile = await r.json();
    } catch {}
    if (profile?.handle) handle = profile.handle;

    const contributions = await this.listValues<any>(`contrib:${did}:`, true);
    const access = await checkAccess(this.storage, did);
    return {
      did,
      handle,
      displayName: profile?.displayName || handle,
      avatar: profile?.avatar || "",
      access,
      contributions,
    };
  }

  private async handleEdit(slug: string, request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);

    if (await this.storage.get(`seen:${body.uri}`, "json")) return json({ error: "already applied" }, 409);

    const verified = await verifyOwnRecord(body.uri, REV_COLLECTION);
    if ("error" in verified) return json(verified, verified.status);
    const { did, handle, value: v } = verified;

    if (v.slug !== slug) return json({ error: "record slug doesn't match this article" }, 400);
    const title = String(v.title || "").slice(0, MAX_TITLE).trim();
    const content = String(v.content || "").slice(0, MAX_CONTENT);
    const summary = String(v.summary || "").slice(0, MAX_SUMMARY).trim();
    if (!title || !content) return json({ error: "record is missing a title or content" }, 400);

    const createdAtMs = Date.parse(v.createdAt || "");
    const validAt = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
    if (Date.now() - validAt > MAX_RECORD_AGE_MS)
      return json({ error: "that record is too old to apply — write a fresh one" }, 400);

    const access = await checkAccess(this.storage, did);
    if (!access.allowed) return json({ error: "not cleared by the Simcluster Checker", access }, 403);

    const artKey = `article:${slug}`;
    const existing = await this.storage.get<Article>(artKey, "json");
    const idx = (existing?.revCount || 0) + 1;
    const createdAt = new Date(validAt).toISOString();

    await this.storage.put(`rev:${slug}:${pad(idx)}`, JSON.stringify({
      idx,
      did,
      handle,
      title,
      content,
      summary,
      uri: body.uri,
      createdAt,
    }));
    const article: Article = {
      slug,
      title,
      content,
      summary,
      revCount: idx,
      createdAt: existing?.createdAt || createdAt,
      updatedAt: createdAt,
      updatedBy: { did, handle },
    };
    await this.storage.put(artKey, JSON.stringify(article));
    await this.storage.put(`seen:${body.uri}`, "true");
    await this.storage.put(`contrib:${did}:${padTs(validAt)}:${idx}`, JSON.stringify({
      type: "edit",
      slug,
      title,
      summary,
      uri: body.uri,
      createdAt,
    }));

    return json({ ok: true, slug, idx, access });
  }

  private async handleTalk(slug: string, request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);

    if (await this.storage.get(`seen:${body.uri}`, "json")) return json({ error: "already applied" }, 409);

    const verified = await verifyOwnRecord(body.uri, TALK_COLLECTION);
    if ("error" in verified) return json(verified, verified.status);
    const { did, handle, value: v } = verified;

    if (v.slug !== slug) return json({ error: "record slug doesn't match this talk page" }, 400);
    const text = String(v.body || "").slice(0, MAX_TALK).trim();
    if (!text) return json({ error: "empty post" }, 400);

    const createdAtMs = Date.parse(v.createdAt || "");
    const validAt = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
    if (Date.now() - validAt > MAX_RECORD_AGE_MS)
      return json({ error: "that record is too old to apply — write a fresh one" }, 400);

    const posts = await this.listValues<any>(`talk:${slug}:`);
    const idx = posts.length + 1;
    const createdAt = new Date(validAt).toISOString();
    const post = { idx, did, handle, body: text, uri: body.uri, createdAt };
    await this.storage.put(`talk:${slug}:${pad(idx)}`, JSON.stringify(post));
    await this.storage.put(`seen:${body.uri}`, "true");
    await this.storage.put(`contrib:${did}:${padTs(validAt)}:${idx}`, JSON.stringify({
      type: "talk",
      slug,
      summary: truncate(text, 120),
      uri: body.uri,
      createdAt,
    }));

    return json({ ok: true, slug, idx });
  }
}

function padTs(ms: number): string {
  return String(Math.floor(ms)).padStart(14, "0");
}
