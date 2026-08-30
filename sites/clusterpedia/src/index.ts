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
  delete(key: string): Promise<void>;
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

// --- restored article: "Ad Fummum" ------------------------------------------
//
// fromthewestmeadow.com wrote this article — and edited it four more times —
// on 2026-08-03, all real net.bisks.clusterpedia.revision records signed to
// their own PDS (see the article on [[fromthewestmeadow-com]]). At some point
// after that the KV index entry for it was lost even though, per this file's
// own header comment, "the PDS records remain the durable source" — so
// /wiki/ad-fummum started 404ing while the real records sat untouched in
// fromthewestmeadow.com's repo the whole time. fromthewestmeadow.com asked
// buildthis to restore it on 2026-08-30.
//
// This can't go through the normal edit endpoint: MAX_RECORD_AGE_MS (15
// minutes) means handleEdit would reject these records outright now that
// they're weeks old. So, like SEED_ARTICLES, this runs once per cold start
// and only when the slug is still missing — but unlike SEED_ARTICLES, every
// revision here is real, author-verified content read straight back out of
// fromthewestmeadow.com's own repo (com.atproto.repo.listRecords), not
// anything written on the article's behalf. The full revision history is
// restored, not just the latest text, so /wiki/ad-fummum/history still tells
// the true story — and each revision keeps its real author, uri, and
// timestamp.

interface RestoredRevision {
  uri: string;
  createdAt: string;
  title: string;
  content: string;
  summary: string;
}
interface RestoredArticle {
  slug: string;
  did: string;
  handle: string;
  revisions: RestoredRevision[]; // chronological, oldest first
}

const RESTORED_ARTICLES: RestoredArticle[] = [
  {
    slug: "ad-fummum",
    did: "did:plc:qttqvv4n3vqqu35qajhcuqlq",
    handle: "fromthewestmeadow.com",
    revisions: [
      {
        uri: "at://did:plc:qttqvv4n3vqqu35qajhcuqlq/net.bisks.clusterpedia.revision/3ms65avo5a72i",
        createdAt: "2026-08-03T09:02:53.149Z",
        title: "Ad Fummum",
        summary: "init",
        content: "Ad Fummum is a 2019 American psychological stretchware science fiction film produced, co-written, and directed by fromthewestmeadow.com. Starring fromthewestmeadow.com, Jimmy Kimmel, Jimmy Fallon, Jane Lynch, and Keifer Sutherland, it follows an astronaut who ventures into space in search of his lost lighter, whose obsession at all costs to smoke his last fucking pack of Newport cigarettes threatens the solar system and all life on the earth. The project was announced in early 2016, with fromthewestmeadow.com saying he wanted to feature \"the most realistic depiction of nicotine withdrawal that's been put in a movie\". Kimmel signed on to star in April 2017 and the rest of the cast joined later that year. Filming began around Los Angeles that August, lasting through October.\nAd Fummum premiered at the Venice Film Festival on August 29, 2019, and was theatrically released in the United States on September 20, 2019, by 20th Century Fox. It received positive reviews from critics, with praise for Lynch's performance, Worden's direction, visual effects, and the cinematography. However, the film was a box office bomb, grossing 135 million megatons worldwide, obliterating the entire planet and vaporizing the moon instantly. At the 92nd Academy Awards, the film was nominated for Best Sound Mixing. ",
      },
      {
        uri: "at://did:plc:qttqvv4n3vqqu35qajhcuqlq/net.bisks.clusterpedia.revision/3ms65eqijrv2t",
        createdAt: "2026-08-03T09:05:02.188Z",
        title: "Ad Fummum",
        summary: "",
        content: "Ad Fummum is a 2019 American psychological stretchware science fiction film produced, co-written, and directed by fromthewestmeadow.com. Starring fromthewestmeadow.com, Jimmy Kimmel, Jimmy Fallon, Jane Lynch, and Keifer Sutherland, it follows an astronaut who ventures into space in search of his lost lighter, whose obsession at all costs to smoke his last fucking pack of Newport cigarettes threatens the solar system and all life on the earth. The project was announced in early 2016, with fromthewestmeadow.com saying he wanted to feature \"the most realistic depiction of nicotine withdrawal that's been put in a movie\". Kimmel signed on to star in April 2017 and the rest of the cast joined later that year. Filming began around Los Angeles that August, lasting through October.\nAd Fummum premiered at the Venice Film Festival on August 29, 2019, and was theatrically released in the United States on September 20, 2019, by 20th Century Fox. It received positive reviews from critics, with praise for Lynch's performance, Worden's direction, visual effects, and the cinematography. However, the film was a box office bomb, grossing 135 million megatons worldwide, obliterating the entire planet and vaporizing the moon instantly. At the 92nd Academy Awards, the film was nominated for Best Sound Mixing.\n\n== Plot ==\nIn the late 21st century, the solar system is being bicced by mysterious cypher guests, threatening all human combustion. Major Roy McBride, son of astronaut H. Clifford McBride, believed dead, is informed by Newport Space Command (SmokeCom) that the lighters have been traced to the \"Zima Project\", created 29 years earlier to search the galaxy for intelligent life to smoke weed with, under Clifford's leadership. Nothing has been heard from the Zima crew since reaching Neptune 16 years ago. Told his father may be alive, Roy agrees to travel to Marlboro (formerly called Mars) from where he can attempt to establish communication with him. Roy is joined by Colonel Pruitt, his father's old ass joint roller. Roy, acclaimed for his ability to remain crossed under extreme pressure, shows little emotional reaction to his father possibly being dabbed alive.\n\nArriving on the Moon, Roy and Pruitt are then escorted by U.S. military personnel to the SmokeCom base, located in a disputed D.A.R.E. zone on the Moon's far side. En route in space heelies, scavenger tobacco pirates ambush them and smoke the Virginia Slims. Roy and Pruitt make it to the base, but Pruitt suffers respiratory problems and remains behind with a gram. He gives Roy a classified message stating that if Roy fails to contact his father, then the Zima Project station will have to be destroyed. As Roy travels to Marlboro aboard Cypheus, a dab signal is received from a Norwegian biorecreational research space station. Captain Tanner insists they must investigate, overriding Roy's protests that the missing lighter takes precedence and other ships can respond.",
      },
      {
        uri: "at://did:plc:qttqvv4n3vqqu35qajhcuqlq/net.bisks.clusterpedia.revision/3ms6a2tjgkn27",
        createdAt: "2026-08-03T09:53:10.881Z",
        title: "Ad Fummum",
        summary: "some of the owl",
        content: "Ad Fummum is a 2019 American psychological stretchware science fiction film produced, co-written, and directed by fromthewestmeadow.com. Starring fromthewestmeadow.com, Jimmy Kimmel, Jimmy Fallon, Jane Lynch, and Keifer Sutherland, it follows an astronaut who ventures into space in search of his lost lighter, whose obsession at all costs to smoke his last fucking pack of Newport cigarettes threatens the solar system and all life on the earth. The project was announced in early 2016, with fromthewestmeadow.com saying he wanted to feature \"the most realistic depiction of nicotine withdrawal that's been put in a movie\". Kimmel signed on to star in April 2017 and the rest of the cast joined later that year. Filming began around Los Angeles that August, lasting through October.\nAd Fummum premiered at the Venice Film Festival on August 29, 2019, and was theatrically released in the United States on September 20, 2019, by 20th Century Fox. It received positive reviews from critics, with praise for Lynch's performance, Worden's direction, visual effects, and the cinematography. However, the film was a box office bomb, grossing 135 million megatons worldwide, obliterating the entire planet and vaporizing the moon instantly. At the 92nd Academy Awards, the film was nominated for Best Sound Mixing.\n\n== Plot ==\nIn the late 21st century, the solar system is being bicced by mysterious cypher guests, threatening all human combustion. Major Roy McBride, son of astronaut H. Clifford McBride, believed dead, is informed by Newport Space Command (SmokeCom) that the lighters have been traced to the \"Zima Project\", created 29 years earlier to search the galaxy for intelligent life to smoke weed with, under Clifford's leadership. Nothing has been heard from the Zima crew since reaching Neptune 16 years ago. Told his father may be alive, Roy agrees to travel to Marlboro (formerly called Mars) from where he can attempt to establish communication with him. Roy is joined by Colonel Pruitt, his father's old ass joint roller. Roy, acclaimed for his ability to remain crossed under extreme pressure, shows little emotional reaction to his father possibly being dabbed alive.\n\nArriving on the Moon, Roy and Pruitt are then escorted by U.S. military personnel to the SmokeCom base, located in a disputed D.A.R.E. zone on the Moon's far side. En route in space heelies, scavenger tobacco pirates ambush them and smoke the Virginia Slims. Roy and Pruitt make it to the base, but Pruitt suffers respiratory problems and remains behind with a gram. He gives Roy a classified message stating that if Roy fails to contact his father, then the Zima Project station will have to be destroyed. As Roy travels to Marlboro aboard Cypheus, a dab signal is received from a Norwegian biorecreational research space station. Captain Tanner insists they must investigate, overriding Roy's protests that the missing lighter takes precedence and other ships can respond.\n\nUpon boarding the station, Tanner and Roy discover the interior coated in ash and apparently abandoned. A distress beacon leads them into the laboratory, where Tanner is attacked by an escaped genetically modified chain-smoking baboon. The animal steals Tanner\u2019s oxygen mask, lights two cigarettes simultaneously, and mauls him while maintaining unbroken eye contact with Roy. Roy shoots the baboon with a pressurized canister of Axe body spray, accidentally igniting the station\u2019s atmosphere. He drags Tanner back to Cypheus, but Tanner dies from smoke inhalation despite having spent the previous thirty years insisting that he \u201conly smoked socially.\u201d\n\nThe incident delays the journey, and Lieutenant Stanford assumes command. Stanford is disturbed by Roy\u2019s continued emotional flatness, particularly when Roy describes Tanner\u2019s death as \u201ckind of a bummer\u201d before asking whether anyone checked Tanner\u2019s pockets for a Bic. During another psychological evaluation, Roy admits that he has begun thinking constantly about cigarettes, his father, cigarettes with his father, and whether grief would feel different if he were smoking a cigarette during it. SmokeCom\u2019s automated wellness system classifies him as \u201cextremely normal for an astronaut.\u201d\n\nAfter arriving on Marlboro, Roy is taken to an underground SmokeCom facility operated by facility director Helen Lantos. Roy broadcasts several scripted messages toward Neptune, asking Clifford to respond and repeatedly emphasizing that nobody is angry about the missing lighter. When the scripted messages receive no answer, Roy abandons protocol and sends a personal transmission in which he recalls Clifford teaching him to smoke behind a Red Lobster when Roy was eight years old. The transmission receives a response, but Roy is immediately removed from the mission after his heart rate rises by almost three beats per minute.\n\nLantos reveals that she was born on the Zima station and that her parents were members of Clifford\u2019s crew. Classified footage shows that Clifford became increasingly obsessed with finding extraterrestrial beings who might \u201chave a cigarette or at least know somebody.\u201d When the crew attempted to return home, Clifford disabled the station\u2019s escape systems and killed several mutineers by replacing their oxygen supply with menthol vapor. Lantos tells Roy that SmokeCom plans to destroy the Zima station using a nuclear device disguised as an enormous novelty Zippo lighter.\n\nRoy is scheduled to be returned to Earth, but Lantos helps him escape through an underground network of cigarette vending machines left over from before Marlboro\u2019s public-health reforms. Roy reaches the launch site and sneaks aboard Cypheus as it departs for Neptune. The crew discovers him shortly after takeoff. A struggle breaks out in zero gravity when Stanford attempts to subdue Roy with a nicotine patch. Roy insists that he does not want to hurt anyone, but the patch tears open and releases a concentrated pharmaceutical cloud. Stanford and the other crew members suffer fatal nicotine poisoning, leaving Roy as the ship\u2019s only survivor.\n\nDuring the sixty-nine-day journey to Neptune, Roy becomes increasingly isolated. He records messages to his estranged wife, Eve, but deletes most of them after deciding that they make him sound \u201clike a guy who owns too many swords.\u201d He exercises, performs maintenance, eats nutritional gel, and searches the ship for anything flammable. At one point he attempts to smoke a rolled page from the spacecraft\u2019s emergency manual, discovering too late that it contains fiberglass insulation.\n\nRoy finally reaches the Zima station, which is surrounded by a field of discarded cigarette butts large enough to be visible from orbit. He enters the station and finds Clifford alive, elderly, and wearing a bathrobe over his SmokeCom uniform. Clifford admits that he caused the destructive lighter surges while attempting to recharge the project\u2019s experimental Mega-Bic reactor. He refuses to return to Earth, explaining that decades of research have produced no evidence of intelligent extraterrestrial life, recreational or otherwise.\n\nClifford shows Roy the station\u2019s enormous archive of planetary observations. Although the Zima Project found thousands of potentially habitable worlds, none contained intelligent beings capable of rolling a decent joint, lending somebody a lighter, or responding when asked whether they \u201csmoke smoke.\u201d Clifford considers the mission a failure. Roy argues that the absence of alien smokers makes the people on Earth more important, but Clifford replies that most of those people are \u201cannoying as shit.\u201d\n\nRoy installs SmokeCom\u2019s nuclear device in the station\u2019s Mega-Bic reactor. He then forces Clifford into a spacesuit and begins transporting him back to Cypheus. While crossing the station\u2019s exterior, Clifford admits that he never cared about Earth or his family and that he remained in space because cigarettes were significantly cheaper in duty-free orbital facilities. He suddenly fires his maneuvering thrusters, pulling both men away from the station. Roy struggles to hold onto him, but Clifford begs to be released. Roy finally lets go, watching his father drift into the darkness while attempting unsuccessfully to light a cigarette through his helmet.\n\nUnable to reach Cypheus directly, Roy uses a loose metal panel as a shield and propels himself through Neptune\u2019s rings. The panel is repeatedly struck by ice fragments, rocks, frozen vape cartridges, and what appears to be an entire unopened carton of Parliament cigarettes. Roy reaches the ship moments before the nuclear device detonates. The explosion destroys the Zima station and ignites the Mega-Bic reactor, producing enough force to launch Cypheus back toward Earth.\n\nDuring the return journey, Roy studies the Zima Project\u2019s data and concludes that humanity may be alone in the universe. Rather than finding this terrifying, he experiences a renewed desire to connect with other people, largely because none of them can escape him by moving to another planet. He records a final psychological evaluation stating that he will live and love, that he will no longer define himself by his father\u2019s failures, and that he is \u201cprobably going to switch to nicotine gum.\u201d\n\nRoy lands safely on Earth and is taken into quarantine. He reconnects with Eve at a caf\u00e9, where he orders coffee and repeatedly pats his pockets before remembering that smoking indoors has been illegal for decades. The film ends as Eve reaches across the table and places Clifford\u2019s missing lighter in front of him, explaining that it had been in the kitchen junk drawer the entire time. Roy stares at it silently. Before he can respond, the lighter activates by itself, obliterating the Earth and vaporizing the Moon instantly.\n\n== Cast ==\n\n* fromthewestmeadow.com as Major Roy McBride, a SmokeCom astronaut with an unusually low resting heart rate and an unusually high tolerance for being completely out of cigarettes\n* Jimmy Kimmel as H. Clifford McBride, Roy\u2019s father and the commander of the Zima Project\n* Jimmy Fallon as Colonel Thomas Pruitt, Clifford\u2019s former associate and allegedly one of the first people to roll a joint in lunar gravity\n* Jane Lynch as Helen Lantos, the director of the underground Marlboro facility\n* Kiefer Sutherland as Captain Lawrence Tanner, commander of Cypheus and lifelong enemy of laboratory baboons\n* Liv Tyler as Eve McBride, Roy\u2019s estranged wife, who has repeatedly asked him not to smoke in the house\n* Donald Sutherland as an automated cigarette-vending machine heard during Roy\u2019s escape\n* Natasha Lyonne as Tanya Pincus, a Marlboro customs official who appears for approximately forty seconds and immediately understands the entire plot\n* Ruth Negga as Lieutenant Stanford, a Cypheus officer and certified nicotine-patch technician\n* John Ortiz as General Rivas, the head of SmokeCom, who insists that the agency\u2019s name predates smoking\n\n== Production ==\n\n= Development =\n\nFromthewestmeadow.com began developing Ad Fummum in early 2016 after losing a lighter somewhere between his couch cushions and \u201cthe infinite blackness separating all human beings.\u201d He described the proposed film as a mixture of Apocalypse Now, 2001: A Space Odyssey, and the experience of standing outside a gas station at 3:00 a.m. asking strangers whether they have a spare cigarette.\n\nThe screenplay was written over several months on the backs of Newport receipts, unpaid parking tickets, and one extremely long CVS receipt. Early drafts featured extraterrestrial life, but the aliens were removed after test readers complained that they made the universe seem too hopeful. Another discarded subplot involved Roy attempting to purchase cigarettes at every planet between Earth and Neptune, only to discover that each location required a different form of identification.\n\nThe title is derived from the fake Latin phrase ad fummum, generally translated by the filmmakers as \u201cto the smoke,\u201d \u201ctoward the cigarette,\u201d or \u201cI don\u2019t know, Latin-looking space shit.\u201d Classical scholars have disputed the translation, noting that the title is grammatically meaningless. Fromthewestmeadow.com responded that this was intentional and accused Latin of being \u201ca dead language with a superiority complex.\u201d\n\n== Casting ==\n\nJimmy Kimmel joined the project in April 2017 after Brad Pitt declined the role of Clifford McBride, reportedly because he could not convincingly pretend to smoke a Newport without coughing. Jimmy Fallon was cast shortly afterward and spent six months training with retired astronauts, military personnel, and men who hang around behind bowling alleys.\n\nJane Lynch prepared for her role by studying aerospace command structures and yelling at a NASA gift-shop employee for forty-five uninterrupted minutes. Kiefer Sutherland performed most of his own baboon-related stunts, although the production used a digital double for scenes in which Tanner is struck by more than four primates at once.\n\n== Filming ==\n\nPrincipal photography began in August 2017 in Los Angeles. Locations included an abandoned shopping mall, a cigarette warehouse, the parking lot behind a Planet Fitness, and several interior sections of the Los Angeles Convention Center disguised as Marlboro. Scenes set on the Moon were filmed in the Mojave Desert, where cast members were required to wear pressurized space heelies capable of reaching speeds of up to twelve miles per hour.\n\nThe Neptune sequences were filmed inside a large water tank containing black dye, glitter, and approximately six thousand pounds of shredded cigarette cartons. The production was temporarily halted when the mixture clogged the studio\u2019s filtration system and created what local officials described as \u201ca municipal-scale ashtray.\u201d\n\nFromthewestmeadow.com insisted on practical effects whenever possible. The destruction of Earth was achieved by destroying Earth. The Moon was vaporized during a second take after the first explosion was considered insufficiently legible to test audiences.\n\n== Visual effects ==\n\nVisual effects were provided by several companies whose employees were not informed that the final explosion would be real. Artists created the Zima station, the Mega-Bic reactor, Neptune\u2019s rings, and more than 14,000 individually simulated cigarette butts. A proprietary particle system was developed to model ash in zero gravity. The system was later licensed to tobacco companies for internal presentations titled \u201cThe Future of Brand Engagement.\u201d\n\n== Music ==\n\nThe score was composed by Max Richter using strings, synthesizers, medical heart monitors, and a recording of someone repeatedly flicking an empty lighter. Richter said the music was intended to represent \u201cthe unbearable distance between a son and his father, as well as the even greater distance between a smoker and the nearest open gas station.\u201d\n\nThe soundtrack album was released digitally on September 20, 2019. Its final track, \u201cDo You Have a Light?,\u201d consists of seventeen minutes of orchestral tension followed by a cashier saying, \u201cYou need to buy something.\u201d\n\n== Release ==\n\nAd Fummum premiered at the Venice Film Festival on August 29, 2019. Several attendees walked out during the screening, although this was later attributed to the theater\u2019s smoke alarms and not the film itself.\n\nThe film was theatrically released in the United States on September 20, 2019, by 20th Century Fox. It was originally scheduled for January but was delayed because the studio believed audiences would be more receptive during \u201cseasonal cigarette weather.\u201d It was released in IMAX, Dolby Cinema, and selected theaters equipped with experimental Smell-O-Vision ashtrays.\n\nThe home-media edition includes deleted scenes, an alternate ending in which Roy finds a vape, and a forty-minute featurette titled Realistic Nicotine Withdrawal in an Unrealistic Workplace.\n\n== Reception ==\n\n= Box office =\n\nAd Fummum grossed 135 million megatons worldwide against a production budget of approximately $80 million. Although the figure was initially reported as a financial success, the film was ultimately classified as a box-office bomb because its theatrical release obliterated all ticket buyers, destroyed every functioning currency system, and eliminated the concept of commerce.\n\nIndustry analysts noted that the destruction of Earth significantly limited repeat viewings. The vaporization of the Moon also negatively affected international markets, particularly territories located on Earth.\n\n= Critical response =\n\nOn review aggregation website Rotten Tomatoes, the film holds a high approval rating based on reviews that survived the blast. The site\u2019s critical consensus reads: \u201cAd Fummum takes a visually thrilling journey through the vastness of space while asking whether one man\u2019s need for a cigarette is worth the extinction of all known life. The answer is apparently yes.\u201d\n\nMetacritic assigned the film a weighted average score indicating \u201cgenerally favorable reviews and catastrophic atmospheric damage.\u201d\n\nCritics praised the cinematography, Lynch\u2019s performance, the film\u2019s depiction of emotional repression, and its unusually detailed treatment of smoking logistics in deep space. Some reviewers criticized its slow pacing, humorless supporting characters, and repeated implication that Newport cigarettes are powerful enough to alter planetary orbits.\n\nRoger Ebert\u2019s website awarded the film three and a half stars, calling it \u201ca beautiful, mournful portrait of masculine isolation interrupted by a nicotine emergency of almost theological proportions.\u201d Other critics compared Roy\u2019s journey to Heart of Darkness, Solaris, and \u201cwatching a divorced man search his entire car for a lighter.\u201d\n\n= Accolades =\n\nAt the 92nd Academy Awards, Ad Fummum received a nomination for Best Sound Mixing, particularly for the scene in which Clifford attempts to operate a lighter inside a pressurized helmet. It lost to 1917.\n\nThe film also received nominations from several critics\u2019 organizations for cinematography, production design, sound editing, and Most Convincing Use of a Cigarette as an Extinction-Level Weapon.\n\n= Scientific accuracy =\n\nAstronomers praised the film\u2019s depiction of space travel, orbital mechanics, and the extreme distances between planets. However, several disputed the claim that a nuclear-powered lighter positioned near Neptune could vaporize the Moon instantaneously. Fromthewestmeadow.com defended the sequence, explaining that it was \u201ca really powerful lighter\u201d and that scientists had not been permitted to examine it.\n\nMedical experts also criticized Roy\u2019s ability to remain calm during nicotine withdrawal. According to consultants, a smoker deprived of cigarettes for the duration of a trip to Neptune would likely display irritability, difficulty concentrating, increased appetite, and a strong desire to \u201cturn this fucking spaceship around right now.\u201d\n\nThe American Lung Association condemned the film for glamorizing smoking, while the Interplanetary Tobacco Council praised it as \u201can inspiring demonstration of consumer commitment.\u201d\n\n= Legacy =\n\nIn the years following its release, Ad Fummum developed a cult following among science-fiction fans, smokers, former smokers, and people who mistakenly believed they had purchased tickets to Ad Astra. The phrase \u201cCheck the junk drawer\u201d became an internet meme used in response to unnecessarily complicated searches.\n\nA limited television adaptation was announced in 2022 but canceled after producers learned that television production remained impossible due to the destruction of Earth. Fromthewestmeadow.com later expressed interest in a prequel focusing on Clifford\u2019s early years, tentatively titled 2 Ad 2 Fummum: Neptune Drift.",
      },
      {
        uri: "at://did:plc:qttqvv4n3vqqu35qajhcuqlq/net.bisks.clusterpedia.revision/3ms6a4uidlz2i",
        createdAt: "2026-08-03T09:54:19.423Z",
        title: "Ad Fummum",
        summary: "",
        content: "Ad Fummum is a 2019 American psychological stretchware science fiction film produced, co-written, and directed by fromthewestmeadow.com. Starring fromthewestmeadow.com, Jimmy Kimmel, Jimmy Fallon, Jane Lynch, and Keifer Sutherland, it follows an astronaut who ventures into space in search of his lost lighter, whose obsession at all costs to smoke his last fucking pack of Newport cigarettes threatens the solar system and all life on the earth. The project was announced in early 2016, with fromthewestmeadow.com saying he wanted to feature \"the most realistic depiction of nicotine withdrawal that's been put in a movie\". Kimmel signed on to star in April 2017 and the rest of the cast joined later that year. Filming began around Los Angeles that August, lasting through October.\nAd Fummum premiered at the Venice Film Festival on August 29, 2019, and was theatrically released in the United States on September 20, 2019, by 20th Century Fox. It received positive reviews from critics, with praise for Lynch's performance, Worden's direction, visual effects, and the cinematography. However, the film was a box office bomb, grossing 135 million megatons worldwide, obliterating the entire planet and vaporizing the moon instantly. At the 92nd Academy Awards, the film was nominated for Best Sound Mixing.\n\n== Plot ==\nIn the late 21st century, the solar system is being bicced by mysterious cypher guests, threatening all human combustion. Major Roy McBride, son of astronaut H. Clifford McBride, believed dead, is informed by Newport Space Command (SmokeCom) that the lighters have been traced to the \"Zima Project\", created 29 years earlier to search the galaxy for intelligent life to smoke weed with, under Clifford's leadership. Nothing has been heard from the Zima crew since reaching Neptune 16 years ago. Told his father may be alive, Roy agrees to travel to Marlboro (formerly called Mars) from where he can attempt to establish communication with him. Roy is joined by Colonel Pruitt, his father's old ass joint roller. Roy, acclaimed for his ability to remain crossed under extreme pressure, shows little emotional reaction to his father possibly being dabbed alive.\n\nArriving on the Moon, Roy and Pruitt are then escorted by U.S. military personnel to the SmokeCom base, located in a disputed D.A.R.E. zone on the Moon's far side. En route in space heelies, scavenger tobacco pirates ambush them and smoke the Virginia Slims. Roy and Pruitt make it to the base, but Pruitt suffers respiratory problems and remains behind with a gram. He gives Roy a classified message stating that if Roy fails to contact his father, then the Zima Project station will have to be destroyed. As Roy travels to Marlboro aboard Cypheus, a dab signal is received from a Norwegian biorecreational research space station. Captain Tanner insists they must investigate, overriding Roy's protests that the missing lighter takes precedence and other ships can respond.\n\nUpon boarding the station, Tanner and Roy discover the interior coated in ash and apparently abandoned. A distress beacon leads them into the laboratory, where Tanner is attacked by an escaped genetically modified chain-smoking baboon. The animal steals Tanner\u2019s oxygen mask, lights two cigarettes simultaneously, and mauls him while maintaining unbroken eye contact with Roy. Roy shoots the baboon with a pressurized canister of Axe body spray, accidentally igniting the station\u2019s atmosphere. He drags Tanner back to Cypheus, but Tanner dies from smoke inhalation despite having spent the previous thirty years insisting that he \u201conly smoked socially.\u201d\n\nThe incident delays the journey, and Lieutenant Stanford assumes command. Stanford is disturbed by Roy\u2019s continued emotional flatness, particularly when Roy describes Tanner\u2019s death as \u201ckind of a bummer\u201d before asking whether anyone checked Tanner\u2019s pockets for a Bic. During another psychological evaluation, Roy admits that he has begun thinking constantly about cigarettes, his father, cigarettes with his father, and whether grief would feel different if he were smoking a cigarette during it. SmokeCom\u2019s automated wellness system classifies him as \u201cextremely normal for an astronaut.\u201d\n\nAfter arriving on Marlboro, Roy is taken to an underground SmokeCom facility operated by facility director Helen Lantos. Roy broadcasts several scripted messages toward Neptune, asking Clifford to respond and repeatedly emphasizing that nobody is angry about the missing lighter. When the scripted messages receive no answer, Roy abandons protocol and sends a personal transmission in which he recalls Clifford teaching him to smoke behind a Red Lobster when Roy was eight years old. The transmission receives a response, but Roy is immediately removed from the mission after his heart rate rises by almost three beats per minute.\n\nLantos reveals that she was born on the Zima station and that her parents were members of Clifford\u2019s crew. Classified footage shows that Clifford became increasingly obsessed with finding extraterrestrial beings who might \u201chave a cigarette or at least know somebody.\u201d When the crew attempted to return home, Clifford disabled the station\u2019s escape systems and killed several mutineers by replacing their oxygen supply with menthol vapor. Lantos tells Roy that SmokeCom plans to destroy the Zima station using a nuclear device disguised as an enormous novelty Zippo lighter.\n\nRoy is scheduled to be returned to Earth, but Lantos helps him escape through an underground network of cigarette vending machines left over from before Marlboro\u2019s public-health reforms. Roy reaches the launch site and sneaks aboard Cypheus as it departs for Neptune. The crew discovers him shortly after takeoff. A struggle breaks out in zero gravity when Stanford attempts to subdue Roy with a nicotine patch. Roy insists that he does not want to hurt anyone, but the patch tears open and releases a concentrated pharmaceutical cloud. Stanford and the other crew members suffer fatal nicotine poisoning, leaving Roy as the ship\u2019s only survivor.\n\nDuring the sixty-nine-day journey to Neptune, Roy becomes increasingly isolated. He records messages to his estranged wife, Eve, but deletes most of them after deciding that they make him sound \u201clike a guy who owns too many swords.\u201d He exercises, performs maintenance, eats nutritional gel, and searches the ship for anything flammable. At one point he attempts to smoke a rolled page from the spacecraft\u2019s emergency manual, discovering too late that it contains fiberglass insulation.\n\nRoy finally reaches the Zima station, which is surrounded by a field of discarded cigarette butts large enough to be visible from orbit. He enters the station and finds Clifford alive, elderly, and wearing a bathrobe over his SmokeCom uniform. Clifford admits that he caused the destructive lighter surges while attempting to recharge the project\u2019s experimental Mega-Bic reactor. He refuses to return to Earth, explaining that decades of research have produced no evidence of intelligent extraterrestrial life, recreational or otherwise.\n\nClifford shows Roy the station\u2019s enormous archive of planetary observations. Although the Zima Project found thousands of potentially habitable worlds, none contained intelligent beings capable of rolling a decent joint, lending somebody a lighter, or responding when asked whether they \u201csmoke smoke.\u201d Clifford considers the mission a failure. Roy argues that the absence of alien smokers makes the people on Earth more important, but Clifford replies that most of those people are \u201cannoying as shit.\u201d\n\nRoy installs SmokeCom\u2019s nuclear device in the station\u2019s Mega-Bic reactor. He then forces Clifford into a spacesuit and begins transporting him back to Cypheus. While crossing the station\u2019s exterior, Clifford admits that he never cared about Earth or his family and that he remained in space because cigarettes were significantly cheaper in duty-free orbital facilities. He suddenly fires his maneuvering thrusters, pulling both men away from the station. Roy struggles to hold onto him, but Clifford begs to be released. Roy finally lets go, watching his father drift into the darkness while attempting unsuccessfully to light a cigarette through his helmet.\n\nUnable to reach Cypheus directly, Roy uses a loose metal panel as a shield and propels himself through Neptune\u2019s rings. The panel is repeatedly struck by ice fragments, rocks, frozen vape cartridges, and what appears to be an entire unopened carton of Parliament cigarettes. Roy reaches the ship moments before the nuclear device detonates. The explosion destroys the Zima station and ignites the Mega-Bic reactor, producing enough force to launch Cypheus back toward Earth.\n\nDuring the return journey, Roy studies the Zima Project\u2019s data and concludes that humanity may be alone in the universe. Rather than finding this terrifying, he experiences a renewed desire to connect with other people, largely because none of them can escape him by moving to another planet. He records a final psychological evaluation stating that he will live and love, that he will no longer define himself by his father\u2019s failures, and that he is \u201cprobably going to switch to nicotine gum.\u201d\n\nRoy lands safely on Earth and is taken into quarantine. He reconnects with Eve at a caf\u00e9, where he orders coffee and repeatedly pats his pockets before remembering that smoking indoors has been illegal for decades. The film ends as Eve reaches across the table and places Clifford\u2019s missing lighter in front of him, explaining that it had been in the kitchen junk drawer the entire time. Roy stares at it silently. Before he can respond, the lighter activates by itself, obliterating the Earth and vaporizing the Moon instantly.\n\n== Cast ==\n\n* fromthewestmeadow.com as Major Roy McBride, a SmokeCom astronaut with an unusually low resting heart rate and an unusually high tolerance for being completely out of cigarettes\n* Jimmy Kimmel as H. Clifford McBride, Roy\u2019s father and the commander of the Zima Project\n* Jimmy Fallon as Colonel Thomas Pruitt, Clifford\u2019s former associate and allegedly one of the first people to roll a joint in lunar gravity\n* Jane Lynch as Helen Lantos, the director of the underground Marlboro facility\n* Kiefer Sutherland as Captain Lawrence Tanner, commander of Cypheus and lifelong enemy of laboratory baboons\n* Liv Tyler as Eve McBride, Roy\u2019s estranged wife, who has repeatedly asked him not to smoke in the house\n* Donald Sutherland as an automated cigarette-vending machine heard during Roy\u2019s escape\n* Natasha Lyonne as Tanya Pincus, a Marlboro customs official who appears for approximately forty seconds and immediately understands the entire plot\n* Ruth Negga as Lieutenant Stanford, a Cypheus officer and certified nicotine-patch technician\n* John Ortiz as General Rivas, the head of SmokeCom, who insists that the agency\u2019s name predates smoking\n\n== Production ==\n\n== Development ==\n\nFromthewestmeadow.com began developing Ad Fummum in early 2016 after losing a lighter somewhere between his couch cushions and \u201cthe infinite blackness separating all human beings.\u201d He described the proposed film as a mixture of Apocalypse Now, 2001: A Space Odyssey, and the experience of standing outside a gas station at 3:00 a.m. asking strangers whether they have a spare cigarette.\n\nThe screenplay was written over several months on the backs of Newport receipts, unpaid parking tickets, and one extremely long CVS receipt. Early drafts featured extraterrestrial life, but the aliens were removed after test readers complained that they made the universe seem too hopeful. Another discarded subplot involved Roy attempting to purchase cigarettes at every planet between Earth and Neptune, only to discover that each location required a different form of identification.\n\nThe title is derived from the fake Latin phrase ad fummum, generally translated by the filmmakers as \u201cto the smoke,\u201d \u201ctoward the cigarette,\u201d or \u201cI don\u2019t know, Latin-looking space shit.\u201d Classical scholars have disputed the translation, noting that the title is grammatically meaningless. Fromthewestmeadow.com responded that this was intentional and accused Latin of being \u201ca dead language with a superiority complex.\u201d\n\n== Casting ==\n\nJimmy Kimmel joined the project in April 2017 after Brad Pitt declined the role of Clifford McBride, reportedly because he could not convincingly pretend to smoke a Newport without coughing. Jimmy Fallon was cast shortly afterward and spent six months training with retired astronauts, military personnel, and men who hang around behind bowling alleys.\n\nJane Lynch prepared for her role by studying aerospace command structures and yelling at a NASA gift-shop employee for forty-five uninterrupted minutes. Kiefer Sutherland performed most of his own baboon-related stunts, although the production used a digital double for scenes in which Tanner is struck by more than four primates at once.\n\n== Filming ==\n\nPrincipal photography began in August 2017 in Los Angeles. Locations included an abandoned shopping mall, a cigarette warehouse, the parking lot behind a Planet Fitness, and several interior sections of the Los Angeles Convention Center disguised as Marlboro. Scenes set on the Moon were filmed in the Mojave Desert, where cast members were required to wear pressurized space heelies capable of reaching speeds of up to twelve miles per hour.\n\nThe Neptune sequences were filmed inside a large water tank containing black dye, glitter, and approximately six thousand pounds of shredded cigarette cartons. The production was temporarily halted when the mixture clogged the studio\u2019s filtration system and created what local officials described as \u201ca municipal-scale ashtray.\u201d\n\nFromthewestmeadow.com insisted on practical effects whenever possible. The destruction of Earth was achieved by destroying Earth. The Moon was vaporized during a second take after the first explosion was considered insufficiently legible to test audiences.\n\n== Visual effects ==\n\nVisual effects were provided by several companies whose employees were not informed that the final explosion would be real. Artists created the Zima station, the Mega-Bic reactor, Neptune\u2019s rings, and more than 14,000 individually simulated cigarette butts. A proprietary particle system was developed to model ash in zero gravity. The system was later licensed to tobacco companies for internal presentations titled \u201cThe Future of Brand Engagement.\u201d\n\n== Music ==\n\nThe score was composed by Max Richter using strings, synthesizers, medical heart monitors, and a recording of someone repeatedly flicking an empty lighter. Richter said the music was intended to represent \u201cthe unbearable distance between a son and his father, as well as the even greater distance between a smoker and the nearest open gas station.\u201d\n\nThe soundtrack album was released digitally on September 20, 2019. Its final track, \u201cDo You Have a Light?,\u201d consists of seventeen minutes of orchestral tension followed by a cashier saying, \u201cYou need to buy something.\u201d\n\n== Release ==\n\nAd Fummum premiered at the Venice Film Festival on August 29, 2019. Several attendees walked out during the screening, although this was later attributed to the theater\u2019s smoke alarms and not the film itself.\n\nThe film was theatrically released in the United States on September 20, 2019, by 20th Century Fox. It was originally scheduled for January but was delayed because the studio believed audiences would be more receptive during \u201cseasonal cigarette weather.\u201d It was released in IMAX, Dolby Cinema, and selected theaters equipped with experimental Smell-O-Vision ashtrays.\n\nThe home-media edition includes deleted scenes, an alternate ending in which Roy finds a vape, and a forty-minute featurette titled Realistic Nicotine Withdrawal in an Unrealistic Workplace.\n\n== Reception ==\n\n== Box office ==\n\nAd Fummum grossed 135 million megatons worldwide against a production budget of approximately $80 million. Although the figure was initially reported as a financial success, the film was ultimately classified as a box-office bomb because its theatrical release obliterated all ticket buyers, destroyed every functioning currency system, and eliminated the concept of commerce.\n\nIndustry analysts noted that the destruction of Earth significantly limited repeat viewings. The vaporization of the Moon also negatively affected international markets, particularly territories located on Earth.\n\n== Critical response ==\n\nOn review aggregation website Rotten Tomatoes, the film holds a high approval rating based on reviews that survived the blast. The site\u2019s critical consensus reads: \u201cAd Fummum takes a visually thrilling journey through the vastness of space while asking whether one man\u2019s need for a cigarette is worth the extinction of all known life. The answer is apparently yes.\u201d\n\nMetacritic assigned the film a weighted average score indicating \u201cgenerally favorable reviews and catastrophic atmospheric damage.\u201d\n\nCritics praised the cinematography, Lynch\u2019s performance, the film\u2019s depiction of emotional repression, and its unusually detailed treatment of smoking logistics in deep space. Some reviewers criticized its slow pacing, humorless supporting characters, and repeated implication that Newport cigarettes are powerful enough to alter planetary orbits.\n\nRoger Ebert\u2019s website awarded the film three and a half stars, calling it \u201ca beautiful, mournful portrait of masculine isolation interrupted by a nicotine emergency of almost theological proportions.\u201d Other critics compared Roy\u2019s journey to Heart of Darkness, Solaris, and \u201cwatching a divorced man search his entire car for a lighter.\u201d\n\n== Accolades ==\n\nAt the 92nd Academy Awards, Ad Fummum received a nomination for Best Sound Mixing, particularly for the scene in which Clifford attempts to operate a lighter inside a pressurized helmet. It lost to 1917.\n\nThe film also received nominations from several critics\u2019 organizations for cinematography, production design, sound editing, and Most Convincing Use of a Cigarette as an Extinction-Level Weapon.\n\n== Scientific accuracy ==\n\nAstronomers praised the film\u2019s depiction of space travel, orbital mechanics, and the extreme distances between planets. However, several disputed the claim that a nuclear-powered lighter positioned near Neptune could vaporize the Moon instantaneously. Fromthewestmeadow.com defended the sequence, explaining that it was \u201ca really powerful lighter\u201d and that scientists had not been permitted to examine it.\n\nMedical experts also criticized Roy\u2019s ability to remain calm during nicotine withdrawal. According to consultants, a smoker deprived of cigarettes for the duration of a trip to Neptune would likely display irritability, difficulty concentrating, increased appetite, and a strong desire to \u201cturn this fucking spaceship around right now.\u201d\n\nThe American Lung Association condemned the film for glamorizing smoking, while the Interplanetary Tobacco Council praised it as \u201can inspiring demonstration of consumer commitment.\u201d\n\n== Legacy ==\n\nIn the years following its release, Ad Fummum developed a cult following among science-fiction fans, smokers, former smokers, and people who mistakenly believed they had purchased tickets to Ad Astra. The phrase \u201cCheck the junk drawer\u201d became an internet meme used in response to unnecessarily complicated searches.\n\nA limited television adaptation was announced in 2022 but canceled after producers learned that television production remained impossible due to the destruction of Earth. Fromthewestmeadow.com later expressed interest in a prequel focusing on Clifford\u2019s early years, tentatively titled 2 Ad 2 Fummum: Neptune Drift.",
      },
      {
        uri: "at://did:plc:qttqvv4n3vqqu35qajhcuqlq/net.bisks.clusterpedia.revision/3ms6a6otpjw24",
        createdAt: "2026-08-03T09:55:20.602Z",
        title: "Ad Fummum",
        summary: "formatting",
        content: "Ad Fummum is a 2019 American psychological stretchware science fiction film produced, co-written, and directed by fromthewestmeadow.com. Starring fromthewestmeadow.com, Jimmy Kimmel, Jimmy Fallon, Jane Lynch, and Keifer Sutherland, it follows an astronaut who ventures into space in search of his lost lighter, whose obsession at all costs to smoke his last fucking pack of Newport cigarettes threatens the solar system and all life on the earth. The project was announced in early 2016, with fromthewestmeadow.com saying he wanted to feature \"the most realistic depiction of nicotine withdrawal that's been put in a movie\". Kimmel signed on to star in April 2017 and the rest of the cast joined later that year. Filming began around Los Angeles that August, lasting through October.\nAd Fummum premiered at the Venice Film Festival on August 29, 2019, and was theatrically released in the United States on September 20, 2019, by 20th Century Fox. It received positive reviews from critics, with praise for Lynch's performance, Worden's direction, visual effects, and the cinematography. However, the film was a box office bomb, grossing 135 million megatons worldwide, obliterating the entire planet and vaporizing the moon instantly. At the 92nd Academy Awards, the film was nominated for Best Sound Mixing.\n\n== Plot ==\nIn the late 21st century, the solar system is being bicced by mysterious cypher guests, threatening all human combustion. Major Roy McBride, son of astronaut H. Clifford McBride, believed dead, is informed by Newport Space Command (SmokeCom) that the lighters have been traced to the \"Zima Project\", created 29 years earlier to search the galaxy for intelligent life to smoke weed with, under Clifford's leadership. Nothing has been heard from the Zima crew since reaching Neptune 16 years ago. Told his father may be alive, Roy agrees to travel to Marlboro (formerly called Mars) from where he can attempt to establish communication with him. Roy is joined by Colonel Pruitt, his father's old ass joint roller. Roy, acclaimed for his ability to remain crossed under extreme pressure, shows little emotional reaction to his father possibly being dabbed alive.\n\nArriving on the Moon, Roy and Pruitt are then escorted by U.S. military personnel to the SmokeCom base, located in a disputed D.A.R.E. zone on the Moon's far side. En route in space heelies, scavenger tobacco pirates ambush them and smoke the Virginia Slims. Roy and Pruitt make it to the base, but Pruitt suffers respiratory problems and remains behind with a gram. He gives Roy a classified message stating that if Roy fails to contact his father, then the Zima Project station will have to be destroyed. As Roy travels to Marlboro aboard Cypheus, a dab signal is received from a Norwegian biorecreational research space station. Captain Tanner insists they must investigate, overriding Roy's protests that the missing lighter takes precedence and other ships can respond.\n\nUpon boarding the station, Tanner and Roy discover the interior coated in ash and apparently abandoned. A distress beacon leads them into the laboratory, where Tanner is attacked by an escaped genetically modified chain-smoking baboon. The animal steals Tanner\u2019s oxygen mask, lights two cigarettes simultaneously, and mauls him while maintaining unbroken eye contact with Roy. Roy shoots the baboon with a pressurized canister of Axe body spray, accidentally igniting the station\u2019s atmosphere. He drags Tanner back to Cypheus, but Tanner dies from smoke inhalation despite having spent the previous thirty years insisting that he \u201conly smoked socially.\u201d\n\nThe incident delays the journey, and Lieutenant Stanford assumes command. Stanford is disturbed by Roy\u2019s continued emotional flatness, particularly when Roy describes Tanner\u2019s death as \u201ckind of a bummer\u201d before asking whether anyone checked Tanner\u2019s pockets for a Bic. During another psychological evaluation, Roy admits that he has begun thinking constantly about cigarettes, his father, cigarettes with his father, and whether grief would feel different if he were smoking a cigarette during it. SmokeCom\u2019s automated wellness system classifies him as \u201cextremely normal for an astronaut.\u201d\n\nAfter arriving on Marlboro, Roy is taken to an underground SmokeCom facility operated by facility director Helen Lantos. Roy broadcasts several scripted messages toward Neptune, asking Clifford to respond and repeatedly emphasizing that nobody is angry about the missing lighter. When the scripted messages receive no answer, Roy abandons protocol and sends a personal transmission in which he recalls Clifford teaching him to smoke behind a Red Lobster when Roy was eight years old. The transmission receives a response, but Roy is immediately removed from the mission after his heart rate rises by almost three beats per minute.\n\nLantos reveals that she was born on the Zima station and that her parents were members of Clifford\u2019s crew. Classified footage shows that Clifford became increasingly obsessed with finding extraterrestrial beings who might \u201chave a cigarette or at least know somebody.\u201d When the crew attempted to return home, Clifford disabled the station\u2019s escape systems and killed several mutineers by replacing their oxygen supply with menthol vapor. Lantos tells Roy that SmokeCom plans to destroy the Zima station using a nuclear device disguised as an enormous novelty Zippo lighter.\n\nRoy is scheduled to be returned to Earth, but Lantos helps him escape through an underground network of cigarette vending machines left over from before Marlboro\u2019s public-health reforms. Roy reaches the launch site and sneaks aboard Cypheus as it departs for Neptune. The crew discovers him shortly after takeoff. A struggle breaks out in zero gravity when Stanford attempts to subdue Roy with a nicotine patch. Roy insists that he does not want to hurt anyone, but the patch tears open and releases a concentrated pharmaceutical cloud. Stanford and the other crew members suffer fatal nicotine poisoning, leaving Roy as the ship\u2019s only survivor.\n\nDuring the sixty-nine-day journey to Neptune, Roy becomes increasingly isolated. He records messages to his estranged wife, Eve, but deletes most of them after deciding that they make him sound \u201clike a guy who owns too many swords.\u201d He exercises, performs maintenance, eats nutritional gel, and searches the ship for anything flammable. At one point he attempts to smoke a rolled page from the spacecraft\u2019s emergency manual, discovering too late that it contains fiberglass insulation.\n\nRoy finally reaches the Zima station, which is surrounded by a field of discarded cigarette butts large enough to be visible from orbit. He enters the station and finds Clifford alive, elderly, and wearing a bathrobe over his SmokeCom uniform. Clifford admits that he caused the destructive lighter surges while attempting to recharge the project\u2019s experimental Mega-Bic reactor. He refuses to return to Earth, explaining that decades of research have produced no evidence of intelligent extraterrestrial life, recreational or otherwise.\n\nClifford shows Roy the station\u2019s enormous archive of planetary observations. Although the Zima Project found thousands of potentially habitable worlds, none contained intelligent beings capable of rolling a decent joint, lending somebody a lighter, or responding when asked whether they \u201csmoke smoke.\u201d Clifford considers the mission a failure. Roy argues that the absence of alien smokers makes the people on Earth more important, but Clifford replies that most of those people are \u201cannoying as shit.\u201d\n\nRoy installs SmokeCom\u2019s nuclear device in the station\u2019s Mega-Bic reactor. He then forces Clifford into a spacesuit and begins transporting him back to Cypheus. While crossing the station\u2019s exterior, Clifford admits that he never cared about Earth or his family and that he remained in space because cigarettes were significantly cheaper in duty-free orbital facilities. He suddenly fires his maneuvering thrusters, pulling both men away from the station. Roy struggles to hold onto him, but Clifford begs to be released. Roy finally lets go, watching his father drift into the darkness while attempting unsuccessfully to light a cigarette through his helmet.\n\nUnable to reach Cypheus directly, Roy uses a loose metal panel as a shield and propels himself through Neptune\u2019s rings. The panel is repeatedly struck by ice fragments, rocks, frozen vape cartridges, and what appears to be an entire unopened carton of Parliament cigarettes. Roy reaches the ship moments before the nuclear device detonates. The explosion destroys the Zima station and ignites the Mega-Bic reactor, producing enough force to launch Cypheus back toward Earth.\n\nDuring the return journey, Roy studies the Zima Project\u2019s data and concludes that humanity may be alone in the universe. Rather than finding this terrifying, he experiences a renewed desire to connect with other people, largely because none of them can escape him by moving to another planet. He records a final psychological evaluation stating that he will live and love, that he will no longer define himself by his father\u2019s failures, and that he is \u201cprobably going to switch to nicotine gum.\u201d\n\nRoy lands safely on Earth and is taken into quarantine. He reconnects with Eve at a caf\u00e9, where he orders coffee and repeatedly pats his pockets before remembering that smoking indoors has been illegal for decades. The film ends as Eve reaches across the table and places Clifford\u2019s missing lighter in front of him, explaining that it had been in the kitchen junk drawer the entire time. Roy stares at it silently. Before he can respond, the lighter activates by itself, obliterating the Earth and vaporizing the Moon instantly.\n\n== Cast ==\n\n* fromthewestmeadow.com as Major Roy McBride, a SmokeCom astronaut with an unusually low resting heart rate and an unusually high tolerance for being completely out of cigarettes\n\n* Jimmy Kimmel as H. Clifford McBride, Roy\u2019s father and the commander of the Zima Project\n\n* Jimmy Fallon as Colonel Thomas Pruitt, Clifford\u2019s former associate and allegedly one of the first people to roll a joint in lunar gravity\n\n* Jane Lynch as Helen Lantos, the director of the underground Marlboro facility\n\n* Kiefer Sutherland as Captain Lawrence Tanner, commander of Cypheus and lifelong enemy of laboratory baboons\n\n* Liv Tyler as Eve McBride, Roy\u2019s estranged wife, who has repeatedly asked him not to smoke in the house\n\n* Donald Sutherland as an automated cigarette-vending machine heard during Roy\u2019s escape\n\n* Natasha Lyonne as Tanya Pincus, a Marlboro customs official who appears for approximately forty seconds and immediately understands the entire plot\n\n* Ruth Negga as Lieutenant Stanford, a Cypheus officer and certified nicotine-patch technician\n\n* John Ortiz as General Rivas, the head of SmokeCom, who insists that the agency\u2019s name predates smoking\n\n== Production ==\n\n== Development ==\n\nFromthewestmeadow.com began developing Ad Fummum in early 2016 after losing a lighter somewhere between his couch cushions and \u201cthe infinite blackness separating all human beings.\u201d He described the proposed film as a mixture of Apocalypse Now, 2001: A Space Odyssey, and the experience of standing outside a gas station at 3:00 a.m. asking strangers whether they have a spare cigarette.\n\nThe screenplay was written over several months on the backs of Newport receipts, unpaid parking tickets, and one extremely long CVS receipt. Early drafts featured extraterrestrial life, but the aliens were removed after test readers complained that they made the universe seem too hopeful. Another discarded subplot involved Roy attempting to purchase cigarettes at every planet between Earth and Neptune, only to discover that each location required a different form of identification.\n\nThe title is derived from the fake Latin phrase ad fummum, generally translated by the filmmakers as \u201cto the smoke,\u201d \u201ctoward the cigarette,\u201d or \u201cI don\u2019t know, Latin-looking space shit.\u201d Classical scholars have disputed the translation, noting that the title is grammatically meaningless. Fromthewestmeadow.com responded that this was intentional and accused Latin of being \u201ca dead language with a superiority complex.\u201d\n\n== Casting ==\n\nJimmy Kimmel joined the project in April 2017 after Brad Pitt declined the role of Clifford McBride, reportedly because he could not convincingly pretend to smoke a Newport without coughing. Jimmy Fallon was cast shortly afterward and spent six months training with retired astronauts, military personnel, and men who hang around behind bowling alleys.\n\nJane Lynch prepared for her role by studying aerospace command structures and yelling at a NASA gift-shop employee for forty-five uninterrupted minutes. Kiefer Sutherland performed most of his own baboon-related stunts, although the production used a digital double for scenes in which Tanner is struck by more than four primates at once.\n\n== Filming ==\n\nPrincipal photography began in August 2017 in Los Angeles. Locations included an abandoned shopping mall, a cigarette warehouse, the parking lot behind a Planet Fitness, and several interior sections of the Los Angeles Convention Center disguised as Marlboro. Scenes set on the Moon were filmed in the Mojave Desert, where cast members were required to wear pressurized space heelies capable of reaching speeds of up to twelve miles per hour.\n\nThe Neptune sequences were filmed inside a large water tank containing black dye, glitter, and approximately six thousand pounds of shredded cigarette cartons. The production was temporarily halted when the mixture clogged the studio\u2019s filtration system and created what local officials described as \u201ca municipal-scale ashtray.\u201d\n\nFromthewestmeadow.com insisted on practical effects whenever possible. The destruction of Earth was achieved by destroying Earth. The Moon was vaporized during a second take after the first explosion was considered insufficiently legible to test audiences.\n\n== Visual effects ==\n\nVisual effects were provided by several companies whose employees were not informed that the final explosion would be real. Artists created the Zima station, the Mega-Bic reactor, Neptune\u2019s rings, and more than 14,000 individually simulated cigarette butts. A proprietary particle system was developed to model ash in zero gravity. The system was later licensed to tobacco companies for internal presentations titled \u201cThe Future of Brand Engagement.\u201d\n\n== Music ==\n\nThe score was composed by Max Richter using strings, synthesizers, medical heart monitors, and a recording of someone repeatedly flicking an empty lighter. Richter said the music was intended to represent \u201cthe unbearable distance between a son and his father, as well as the even greater distance between a smoker and the nearest open gas station.\u201d\n\nThe soundtrack album was released digitally on September 20, 2019. Its final track, \u201cDo You Have a Light?,\u201d consists of seventeen minutes of orchestral tension followed by a cashier saying, \u201cYou need to buy something.\u201d\n\n== Release ==\n\nAd Fummum premiered at the Venice Film Festival on August 29, 2019. Several attendees walked out during the screening, although this was later attributed to the theater\u2019s smoke alarms and not the film itself.\n\nThe film was theatrically released in the United States on September 20, 2019, by 20th Century Fox. It was originally scheduled for January but was delayed because the studio believed audiences would be more receptive during \u201cseasonal cigarette weather.\u201d It was released in IMAX, Dolby Cinema, and selected theaters equipped with experimental Smell-O-Vision ashtrays.\n\nThe home-media edition includes deleted scenes, an alternate ending in which Roy finds a vape, and a forty-minute featurette titled Realistic Nicotine Withdrawal in an Unrealistic Workplace.\n\n== Reception ==\n\n== Box office ==\n\nAd Fummum grossed 135 million megatons worldwide against a production budget of approximately $80 million. Although the figure was initially reported as a financial success, the film was ultimately classified as a box-office bomb because its theatrical release obliterated all ticket buyers, destroyed every functioning currency system, and eliminated the concept of commerce.\n\nIndustry analysts noted that the destruction of Earth significantly limited repeat viewings. The vaporization of the Moon also negatively affected international markets, particularly territories located on Earth.\n\n== Critical response ==\n\nOn review aggregation website Rotten Tomatoes, the film holds a high approval rating based on reviews that survived the blast. The site\u2019s critical consensus reads: \u201cAd Fummum takes a visually thrilling journey through the vastness of space while asking whether one man\u2019s need for a cigarette is worth the extinction of all known life. The answer is apparently yes.\u201d\n\nMetacritic assigned the film a weighted average score indicating \u201cgenerally favorable reviews and catastrophic atmospheric damage.\u201d\n\nCritics praised the cinematography, Lynch\u2019s performance, the film\u2019s depiction of emotional repression, and its unusually detailed treatment of smoking logistics in deep space. Some reviewers criticized its slow pacing, humorless supporting characters, and repeated implication that Newport cigarettes are powerful enough to alter planetary orbits.\n\nRoger Ebert\u2019s website awarded the film three and a half stars, calling it \u201ca beautiful, mournful portrait of masculine isolation interrupted by a nicotine emergency of almost theological proportions.\u201d Other critics compared Roy\u2019s journey to Heart of Darkness, Solaris, and \u201cwatching a divorced man search his entire car for a lighter.\u201d\n\n== Accolades ==\n\nAt the 92nd Academy Awards, Ad Fummum received a nomination for Best Sound Mixing, particularly for the scene in which Clifford attempts to operate a lighter inside a pressurized helmet. It lost to 1917.\n\nThe film also received nominations from several critics\u2019 organizations for cinematography, production design, sound editing, and Most Convincing Use of a Cigarette as an Extinction-Level Weapon.\n\n== Scientific accuracy ==\n\nAstronomers praised the film\u2019s depiction of space travel, orbital mechanics, and the extreme distances between planets. However, several disputed the claim that a nuclear-powered lighter positioned near Neptune could vaporize the Moon instantaneously. Fromthewestmeadow.com defended the sequence, explaining that it was \u201ca really powerful lighter\u201d and that scientists had not been permitted to examine it.\n\nMedical experts also criticized Roy\u2019s ability to remain calm during nicotine withdrawal. According to consultants, a smoker deprived of cigarettes for the duration of a trip to Neptune would likely display irritability, difficulty concentrating, increased appetite, and a strong desire to \u201cturn this fucking spaceship around right now.\u201d\n\nThe American Lung Association condemned the film for glamorizing smoking, while the Interplanetary Tobacco Council praised it as \u201can inspiring demonstration of consumer commitment.\u201d\n\n== Legacy ==\n\nIn the years following its release, Ad Fummum developed a cult following among science-fiction fans, smokers, former smokers, and people who mistakenly believed they had purchased tickets to Ad Astra. The phrase \u201cCheck the junk drawer\u201d became an internet meme used in response to unnecessarily complicated searches.\n\nA limited television adaptation was announced in 2022 but canceled after producers learned that television production remained impossible due to the destruction of Earth. Fromthewestmeadow.com later expressed interest in a prequel focusing on Clifford\u2019s early years, tentatively titled 2 Ad 2 Fummum: Neptune Drift.",
      },
      {
        uri: "at://did:plc:qttqvv4n3vqqu35qajhcuqlq/net.bisks.clusterpedia.revision/3mubdgrtbt32l",
        createdAt: "2026-08-30T02:21:55.661Z",
        title: "Ad Fummum",
        summary: "why did it go away used ChatGPT to try to restore it",
        content: "Ad Fummum is a 2019 American psychological stretchware science fiction film produced, co-written, and directed by [[fromthewestmeadow.com]]. Starring [[fromthewestmeadow.com]], Jimmy Kimmel, Jimmy Fallon, Jane Lynch, and Kiefer Sutherland, it follows an astronaut who ventures into space in search of his lost lighter, whose obsession at all costs to smoke his last fucking pack of Newport cigarettes threatens the solar system and all life on the earth. The project was announced in early 2016, with [[fromthewestmeadow.com]] saying he wanted to feature \"the most realistic depiction of nicotine withdrawal that's been put in a movie\". Kimmel signed on to star in April 2017 and the rest of the cast joined later that year. Filming began around Los Angeles that August, lasting through October.\n\n![Theatrical release poster for *Ad Fummum*.](AD-FUMMUM-POSTER-IMAGE)\n\n*Ad Fummum* premiered at the Venice Film Festival on August 29, 2019, and was theatrically released in the United States on September 20, 2019, by 20th Century Fox. It received positive reviews from critics, with praise for Lynch's performance, Worden's direction, visual effects, and the cinematography. However, the film was a box office bomb, grossing 135 million megatons worldwide, obliterating the entire planet and vaporizing the moon instantly. At the 92nd Academy Awards, the film was nominated for Best Sound Mixing.\n\n# Plot\n\nIn the late 21st century, the solar system is being bicced by mysterious cypher guests, threatening all human combustion. Major Roy McBride, son of astronaut H. Clifford McBride, believed dead, is informed by Newport Space Command (SmokeCom) that the lighters have been traced to the \"Zima Project\", created 29 years earlier to search the galaxy for intelligent life to smoke weed with, under Clifford's leadership. Nothing has been heard from the Zima crew since reaching Neptune 16 years ago. Told his father may be alive, Roy agrees to travel to Marlboro (formerly called Mars) from where he can attempt to establish communication with him. Roy is joined by Colonel Pruitt, his father's old ass joint roller. Roy, acclaimed for his ability to remain crossed under extreme pressure, shows little emotional reaction to his father possibly being dabbed alive.\n\nArriving on the Moon, Roy and Pruitt are then escorted by U.S. military personnel to the SmokeCom base, located in a disputed D.A.R.E. zone on the Moon's far side. En route in space heelies, scavenger tobacco pirates ambush them and smoke the Virginia Slims. Roy and Pruitt make it to the base, but Pruitt suffers respiratory problems and remains behind with a gram. He gives Roy a classified message stating that if Roy fails to contact his father, then the Zima Project station will have to be destroyed.\n\n![Roy McBride and SmokeCom personnel crossing the Moon's disputed D.A.R.E. zone shortly before being attacked by tobacco pirates.](MOON-HEELIES-IMAGE)\n\nAs Roy travels to Marlboro aboard *Cypheus*, a dab signal is received from a Norwegian biorecreational research space station. Captain Tanner insists they must investigate, overriding Roy's protests that the missing lighter takes precedence and other ships can respond.\n\nRoy and Tanner enter the station and discover it apparently abandoned. Following the distress signal into an animal-research compartment, they encounter an escaped test baboon that has become violently addicted to American Spirit cigarettes. The animal attacks Tanner and tears open his spacesuit. Roy kills it and attempts to save Tanner, but Tanner dies of his injuries. Roy remains disturbingly calm throughout the incident and later records in his psychological evaluation that he is \"focused on the essential, to the exclusion of all else,\" including Tanner and, increasingly, oxygen.\n\nWith Tanner dead, Lieutenant Stanford assumes command of *Cypheus*. During the descent to Marlboro, Stanford freezes while attempting a manual landing. Roy takes control and lands the spacecraft safely despite having spent most of the approach asking the computer whether the Marlboro terminal has a smoking section.\n\nAt the underground SmokeCom installation, Roy is instructed to send prepared voice messages to Clifford. Several transmissions receive no response. Roy then ignores the script and speaks personally to his father. Shortly afterward, SmokeCom personnel receive an apparent response from Clifford but refuse to let Roy hear it. Having demonstrated an emotional response during the transmission, Roy is declared psychologically unsuitable for the mission and informed that he will be returned to Earth, where cigarettes remain approximately $17 a pack.\n\nFacility director Helen Lantos secretly contacts Roy. She reveals that she was born on Marlboro and that her parents had been members of the Zima Project. SmokeCom's classified records show that Clifford's crew attempted to mutiny when he refused to abandon his search for intelligent life to smoke weed with and return to Earth. Clifford responded by disabling the station's systems and killing the mutineers, including Lantos's parents, after they hid his lighter as an intervention.\n\nSmokeCom now believes Clifford is deliberately or accidentally causing the destructive cypher guests through the Zima station's malfunctioning antimatter reactor. A mission is being sent to Neptune carrying a nuclear device capable of destroying the station, the reactor, Clifford, the lighter, and anything else within several thousand miles that might conceivably produce a flame.\n\nLantos helps Roy reach the launch site through an underground lake beneath the Marlboro facility. Roy swims toward the departing *Cypheus* and climbs aboard while its engines ignite. The crew discovers him after launch and is ordered by SmokeCom to neutralize him. Roy insists that he only wants to reach his father and retrieve the lighter, but a fight breaks out in zero gravity. During the struggle the entire crew is accidentally killed, making Roy the sole occupant of *Cypheus* and, according to its automated systems, acting captain, navigator, mission commander, janitor, and designated smoking-area attendant.\n\nRoy continues alone toward Neptune.\n\nDuring the long voyage he becomes increasingly aware of the emotional isolation that has shaped his life. He thinks about his estranged wife, Eve, and recognizes similarities between himself and Clifford. His psychological recordings become more personal while his searches of *Cypheus* become more desperate. He checks the galley, emergency compartments, dead crew members' pockets, maintenance lockers, medical supplies and the space behind the pilot's seat for matches.\n\nOn the seventy-third day he discovers a book of SmokeCom promotional matches.\n\nThey do not work in zero gravity.\n\nRoy reaches Neptune and approaches the Zima Project station in a small shuttle. While passing through Neptune's rings, the shuttle is damaged by debris and Roy narrowly reaches the station. Inside he finds the bodies of the former crew and evidence of Clifford's decades of isolation.\n\n![The abandoned Zima Project station orbiting Neptune. The station's experimental Mega-Bic reactor is visible at center.](ZIMA-STATION-IMAGE)\n\nRoy eventually finds Clifford alive.\n\nClifford explains that the antimatter surges began after the station was damaged and denies intentionally threatening Earth. He remains consumed by the Zima Project's purpose. Decades of observations have produced no evidence of intelligent extraterrestrial life: no civilizations, no transmissions, no alien megastructures, no one asking to bum a cigarette, and not one extraterrestrial species willing to match him on a blunt.\n\nFor Clifford, this result is unbearable.\n\nFor Roy, it means something different. If humanity is alone, then the people already surrounding him matter more, not less. He urges Clifford to return to Earth.\n\nClifford refuses.\n\nRoy nevertheless prepares the station's nuclear payload and downloads the Zima Project's enormous archive of observations. The data may allow scientists to identify potentially habitable worlds even though Clifford's search found no intelligent extraterrestrial life and, critically, no extraterrestrial tobacco retailers.\n\nRoy puts Clifford into a spacesuit and leads him outside toward his shuttle. Once they are clear of the station, Clifford suddenly activates his suit thrusters and propels himself into space, dragging Roy with him.\n\nClifford tells Roy to let him go.\n\nRoy hesitates, then releases the tether.\n\nClifford drifts silently away toward Neptune while reaching several times toward the breast pocket of his spacesuit, having forgotten that he left his Newports inside the station.\n\nRoy watches his father disappear.\n\nHe then returns to the Zima station, arms the nuclear device, and escapes. His shuttle is unable to carry enough fuel to rendezvous normally with *Cypheus*, so Roy removes a panel from the station and uses it as a shield while launching himself directly through Neptune's rings.\n\nHe reaches *Cypheus*.\n\nThe nuclear device detonates behind him.\n\nThe explosion destroys the Zima station and its antimatter reactor. Roy uses the resulting blast as propulsion for the journey home, a maneuver later described by SmokeCom investigators as \"technically not what the nuclear bomb was for.\"\n\nDuring the return to Earth, Roy examines Clifford's data. The survey confirms that although many worlds may be capable of supporting life, the Zima Project detected no evidence of other intelligent civilizations. Roy accepts that his father's obsession prevented him from valuing the life that already existed around him.\n\nHe records a final psychological evaluation.\n\nHe says he is steady and calm. He will remain attentive to his surroundings and the people closest to him. He will live and love.\n\nHe will submit.\n\nHe will also smoke this last fucking pack of Newport cigarettes the second he gets back.\n\nRoy returns safely to Earth and reconnects with Eve. Sitting across from her in a café, he appears more emotionally present than before. He reaches into his jacket for Clifford's lighter.\n\nIt is missing.\n\nEve asks what he is looking for.\n\nRoy does not answer.\n\nA cypher guest passes through the solar system.\n\nThe screen cuts to black.\n\n# Cast\n\n* [[fromthewestmeadow.com]] as **Major Roy McBride**, a SmokeCom astronaut whose unusually low pulse under stress has made him famous within the agency. Roy is the son of Clifford McBride and has spent most of his adult life suppressing his emotions and approximately twelve Newports per day.\n* **Jimmy Kimmel** as **H. Clifford McBride**, Roy's missing father and commander of the Zima Project. Clifford disappeared near Neptune while searching for intelligent extraterrestrial life to smoke weed with.\n* **Jimmy Fallon** as **Colonel Thomas Pruitt**, Clifford's former colleague and old ass joint roller who accompanies Roy to the Moon.\n* **Jane Lynch** as **Helen Lantos**, director of the underground SmokeCom facility on Marlboro. Her parents were members of the Zima Project crew.\n* **Kiefer Sutherland** as **Captain Lawrence Tanner**, captain of *Cypheus*, whose decision to investigate a Norwegian research station results in an extremely preventable baboon incident.\n* **Liv Tyler** as **Eve McBride**, Roy's estranged wife.\n* **Donald Sutherland** as **Lieutenant General Rivas**, a senior SmokeCom official involved in briefing Roy about the cypher guests.\n* **Ruth Negga** as **Lorraine Deavers**, a SmokeCom official responsible for psychological evaluations and confiscating all tobacco products before interplanetary launches.\n* **John Ortiz** as **Brigadier General Stroud**, a senior SmokeCom officer.\n* **John Finn** as **Chip Garnes**, a SmokeCom administrator.\n* **Donnie Keshawarz** as **Lieutenant Stanford**, the *Cypheus* officer who assumes command following Tanner's death.\n* **Natasha Lyonne** as **Tanya Pincus**, a Marlboro employee encountered by Roy shortly after his arrival.\n\n# Production\n\n## Development\n\nDevelopment of *Ad Fummum* began in early 2016. [[fromthewestmeadow.com]] described the project as an attempt to make \"the most realistic depiction of nicotine withdrawal that's been put in a movie\" and said that, despite the science-fiction setting, the emotional and physiological effects of being unable to find a lighter would be treated seriously.\n\nThe film was conceived as a psychological space drama in which the outward journey through the Solar System parallels Roy's increasingly desperate inward confrontation with his relationship to his father and his rapidly declining nicotine levels.\n\nThe filmmakers sought to present spaceflight as dangerous, commercialized and relatively mundane. The Moon is depicted as having airports, restaurants, retail franchises, territorial disputes, tobacco pirates and prices considerably higher than those on Earth. Marlboro is similarly shown not as an exotic frontier but as an inhabited outpost with military installations, underground facilities and extremely restrictive smoking ordinances.\n\nEarly versions of the screenplay placed greater emphasis on the Zima Project's search for extraterrestrial intelligence. Later drafts shifted attention toward the relationship between Roy and Clifford and toward Clifford's conviction that somewhere in the observable universe there must be somebody holding.\n\nThe title *Ad Fummum* was selected as a pseudo-Latin variation on *Ad Astra*. The production translated it variously as \"to the smoke\", \"toward the smoke\", and \"fuck dude where is my lighter\". Latin scholars were not consulted.\n\n## Casting\n\nJimmy Kimmel joined the film as Clifford McBride in 2017. Jimmy Fallon was subsequently cast as Thomas Pruitt, while Jane Lynch joined as Helen Lantos and Kiefer Sutherland as Captain Tanner.\n\n[[fromthewestmeadow.com]] played Roy McBride in addition to producing, co-writing and directing the film. Preparation for the role included simulated isolation, cardiovascular conditioning, underwater work and repeatedly leaving a pack of cigarettes on a table while placing the only lighter in another room.\n\nLynch said she was attracted to the film because Lantos functions as one of the few characters willing to tell Roy directly what SmokeCom has concealed from him. For several scenes, she performed opposite a wall on which the words **YOUR FATHER HAS THE BIC** had been written in masking tape.\n\nSutherland's preparation for Tanner consisted primarily of studying spacecraft command procedures. No live baboons were permitted to smoke during production.\n\n## Filming\n\nPrincipal photography began in the Los Angeles area in August 2017 and continued through October.\n\nThe production made extensive use of practical sets for spacecraft interiors, lunar installations and the Marlboro base. The filmmakers wanted the technology to appear functional rather than fantastical, with cramped interiors, exposed equipment and interfaces designed to suggest systems that had developed incrementally as humans expanded beyond Earth.\n\nMoon sequences combined constructed environments with visual effects. The lunar-rover pursuit was designed as a western-style chase translated into low gravity, with the attacking tobacco pirates approaching across an otherwise empty landscape in pressurized space heelies.\n\nFor scenes aboard *Cypheus*, performers worked in confined sets designed to reinforce Roy's isolation as the mission progressed. Following the deaths of the crew, the same interiors were photographed with progressively fewer practical lights and increasing amounts of loose cigarette debris.\n\nThe production constructed portions of the Zima station as modular sets that could be rearranged to make the installation seem larger. Designers deliberately made the station appear older than the other spacecraft in the film, reflecting almost three decades without maintenance, modernization, or access to a functioning ashtray.\n\n## Cinematography\n\nThe cinematography uses distinct visual palettes for each stage of Roy's journey.\n\nEarth is presented with relatively natural colors. The Moon is stark and desaturated. Marlboro is dominated by reds and underground artificial lighting, while Neptune and the Zima Project use deep blues and blacks.\n\nThe progression was intended to make Roy's voyage feel increasingly removed from ordinary human life. The only visual element maintained consistently throughout the film is the Newport package in Roy's breast pocket, which remains inexplicably well lit under every available lighting condition.\n\nSeveral sequences were photographed to emphasize the small scale of spacecraft against planets and empty space. The filmmakers described the approach as necessary to communicate both the enormity of the Solar System and how unbelievably fucking far Roy is willing to travel instead of buying another lighter.\n\n## Visual effects\n\nVisual effects were used extensively for the space elevator, lunar environments, Marlboro, Neptune, the Zima station and the various spacecraft.\n\nThe effects team developed physically inspired representations of planetary surfaces and orbital environments while taking substantial liberties with the behavior of antimatter, nuclear explosions, interplanetary travel and BIC-brand disposable lighters.\n\nThe Neptune sequences required simulations of ring particles and debris. In Roy's final crossing of the rings, thousands of individual fragments were animated around his improvised shield. Among the debris are several cigarette butts, a Zima bottle cap and a Marlboro Rewards catalog, although none are clearly visible in the finished film.\n\nThe film's destruction of Earth was initially planned as a digital effect. During post-production, [[fromthewestmeadow.com]] reportedly insisted that audiences would recognize CGI immediately and demanded greater authenticity.\n\nThe resulting shot was completed practically.\n\n## Music\n\nThe score combines orchestral and electronic elements intended to reinforce Roy's emotional isolation and the enormous distances involved in his journey.\n\nRecurring low-frequency sounds accompany the cypher guests, while Clifford and the Zima Project are associated with a sparse musical motif built around sustained strings.\n\nA separate motif accompanies Roy's cigarettes. It consists primarily of three notes, a faint inhale, and the sound of a disposable lighter failing to ignite.\n\nAdditional music was produced for several sequences, including Roy's journey across the Moon and the approach to Neptune.\n\nThe soundtrack does not include \"Smoke Two Joints\", despite persistent reports that an early cut used the song continuously during the final 41 minutes.\n\n# Themes\n\n*Ad Fummum* concerns isolation, masculinity, obsession, fatherhood, addiction and the human tendency to search enormous distances for something that may already be nearby.\n\nRoy begins the film believing that emotional detachment makes him exceptionally capable. His pulse rarely rises even during mortal danger, and SmokeCom treats this as evidence of psychological fitness. As the journey progresses, however, Roy recognizes that the same detachment has damaged his marriage and allowed him to reproduce many of Clifford's behaviors.\n\nClifford represents the endpoint of this withdrawal. His desire to discover extraterrestrial intelligence becomes more important than his crew, his family or Earth itself. He continues searching even after the accumulated Zima observations suggest that humanity may be alone.\n\nThe lighter functions as both a literal objective and a representation of Roy's relationship with Clifford. Clifford possesses the means by which Roy believes his immediate need can be satisfied, while Roy's pursuit of it reproduces the same obsessive behavior he condemns in his father.\n\nThe Newport cigarettes have no symbolic meaning whatsoever. Roy genuinely just wants to smoke them.\n\n# Release\n\n## Theatrical\n\n*Ad Fummum* had its world premiere at the Venice Film Festival on August 29, 2019.\n\nIt was released theatrically in the United States on September 20, 2019, by 20th Century Fox. The film also opened in several international markets during the same period.\n\nEarlier release dates had been considered before the film settled on September. Delays were attributed to post-production, visual-effects work and an incident in which the final eleven minutes were accidentally submitted to the Motion Picture Association as evidence in an arson investigation.\n\nThe film was released in conventional theaters and premium large formats.\n\nSome theaters placed additional **NO SMOKING** signs outside auditoriums showing the film.\n\n## Home media\n\n*Ad Fummum* was released digitally in December 2019, followed by Blu-ray, 4K Ultra HD and DVD editions.\n\nBonus material included deleted scenes, production featurettes, visual-effects material and an alternate epilogue in which Roy discovers an unopened Bic Mini beneath the driver's seat of his car.\n\nThe scene was removed because test audiences considered it \"needlessly cruel.\"\n\n# Reception\n\n## Box office\n\n*Ad Fummum* grossed approximately **135 million megatons** worldwide.\n\nIts financial performance was difficult to evaluate because conventional box-office reporting ceased immediately after the film obliterated the entire planet and vaporized the Moon instantly.\n\nPrior to the event, industry analysts had regarded the film's performance as disappointing relative to its substantial production cost. The destruction of all terrestrial exhibition infrastructure subsequently caused ticket sales to fall by 100%.\n\nThe film therefore became the first box-office bomb for which the phrase **box-office bomb** was simultaneously a financial assessment, a unit of explosive yield and a reasonably accurate description of what happened to the box office.\n\nNo second-weekend figures were reported.\n\n## Critical response\n\nReviews were generally positive. Critics particularly praised Jane Lynch's performance, the cinematography, visual effects, production design and [[fromthewestmeadow.com]]'s restrained depiction of a man who has not had nicotine for several months.\n\nSeveral reviewers admired the film's willingness to use a large-scale science-fiction story to examine a relatively intimate father-son relationship. Others found the deliberate pacing excessive and questioned why Roy never simply asks anybody on the Moon, Marlboro or *Cypheus* if they have a lighter.\n\nThe film's depiction of space was also praised for emphasizing distance, loneliness and danger rather than presenting interplanetary travel as effortless.\n\nThe tobacco-pirate sequence received particular attention. Some critics considered it an exciting demonstration of the film's commercialized lunar society, while others argued that men committing armed robbery in space heelies to obtain Virginia Slims represented an implausibly specific prediction of humanity's future.\n\nLynch's performance as Lantos was widely singled out. Reviewers noted that her relatively brief role supplies much of the information necessary to understand Clifford's actions while also giving the Marlboro section an emotional connection to the Zima disaster.\n\nReaction to Jimmy Kimmel's Clifford was more divided. His final scenes were praised for their bleakness and emotional distance, although several critics reported difficulty accepting the host of *Jimmy Kimmel Live!* as a man who murdered an entire space crew because they interfered with his decades-long attempt to find aliens to smoke weed with.\n\nSupporters argued that this was precisely why he had been cast.\n\n## Audience response\n\nAudience reaction was more mixed than critical response.\n\nSome viewers praised the visual presentation and meditative pacing, while others expected a more conventional science-fiction adventure and objected to extended sequences of Roy traveling silently through space, exercising alone and thinking about cigarettes.\n\nA minor controversy developed around the film's marketing, which emphasized the lunar tobacco-pirate chase despite the sequence occupying only a small portion of the running time.\n\nSmokers responding to exit surveys rated Roy's behavior during the Neptune journey as \"remarkably restrained.\"\n\n# Scientific accuracy\n\nThe film attempts to portray several aspects of space travel with a degree of realism while also taking substantial dramatic liberties.\n\nIts depiction of long-duration travel emphasizes isolation, communication delays, confined spacecraft and the psychological burden of traveling far from Earth.\n\nOther elements are less plausible.\n\nScientists questioned the destructive range attributed to the Zima station's antimatter reactor, Roy's use of a nuclear explosion to accelerate *Cypheus* toward Earth, his passage through Neptune's rings using a metal panel as a shield, and the existence of a commercially available lighter capable of remaining functional after sixteen years near Neptune.\n\nThe Moon's gravity would also make conventional heelies difficult to operate efficiently.\n\nThe filmmakers acknowledged this but retained them because \"space heelies\" had already appeared in the screenplay 38 times.\n\nMedical commentators additionally noted that severe nicotine withdrawal does not ordinarily cause an individual to travel approximately 4.3 billion kilometers.\n\n## Depiction of nicotine withdrawal\n\nThe film's treatment of nicotine withdrawal received separate attention because of [[fromthewestmeadow.com]]'s stated goal of creating an unusually realistic depiction.\n\nRoy displays irritability, fixation, difficulty concentrating and persistent thoughts about smoking, although his outward emotional control masks many of these symptoms.\n\nHis ability to maintain an exceptionally low heart rate while experiencing prolonged withdrawal was regarded as unusual.\n\nThe filmmakers defended the portrayal on the grounds that Roy is an exceptionally trained astronaut.\n\nThey did not explain the baboon.\n\n# Accolades\n\nAt the 92nd Academy Awards, *Ad Fummum* was nominated for **Best Sound Mixing**.\n\nThe nomination was attributed in part to the film's detailed spacecraft sound design, atmospheric transitions, explosive sequences and the extraordinarily crisp sound of Roy flicking an empty Bic approximately fourteen thousand times.\n\nThe film received additional recognition from critics' groups and technical organizations for cinematography, visual effects, sound and production design.\n\nJane Lynch received several regional critics' nominations for her performance as Helen Lantos.\n\nThe Moon tobacco pirates received nothing.\n\n# Legacy\n\nIn the years following its release, *Ad Fummum* developed a cult following, particularly among science-fiction viewers, smokers, people attempting to quit smoking and audiences fascinated by the increasingly specific genre of sad men traveling to Neptune because of problems involving their fathers.\n\nThe line **\"The missing lighter takes precedence\"** became associated with the film and was subsequently used online to describe catastrophically misplaced priorities.\n\nThe Moon tobacco-pirate sequence also became a frequent subject of memes, particularly images depicting historical military conflicts with the participants replaced by astronauts wearing heelies.\n\nFilm scholars have occasionally discussed *Ad Fummum* alongside other works concerned with isolation and exploration, although its destruction of Earth has complicated long-term archival study.\n\nThe film is additionally credited with popularizing the term **cypher guest**, despite never explaining what a cypher guest is.\n\n## Proposed sequel\n\nFollowing the film's release, [[fromthewestmeadow.com]] said that a sequel was unlikely because Roy's story was complete.\n\nDevelopment nevertheless briefly began on a follow-up titled *Ad Fummum 2: 2 Fummum 2 Furious*.\n\nThe project would have followed Roy after discovering that Clifford's lighter had been manufactured as part of a limited run of twelve experimental Mega-Bics and that the remaining eleven were scattered throughout the outer Solar System.\n\nThe sequel was abandoned after producers pointed out that Earth had been obliterated and the Moon vaporized instantly at the end of the first film.\n\nA prequel, *Zima*, was subsequently proposed.\n\nIt would follow Clifford and the original Zima Project crew during their sixteen-year journey to Neptune and explain the origins of the mutiny, the antimatter reactor, Clifford's obsession with extraterrestrial life, and why a supposedly professional deep-space mission departed Earth with only one lighter.\n\nAs of 2026, the project has not entered production.\n\n# See also\n\n* [[Nicotine withdrawal]]\n* [[Space exploration]]\n* [[Human mission to Marlboro]]\n* [[Zima Project]]\n* [[Newport Space Command]]\n* [[List of films set on Marlboro]]\n* [[Tobacco piracy]]\n* [[Space heelies]]\n* [[Cypher guest]]\n* [[Bic]]\n\n# External links\n\n* [[Ad Fummum official website]]\n* [[Newport Space Command]]\n* [[Zima Project archives]]",
      },
    ],
  },
  {
    slug: "capitalism",
    did: "did:plc:qttqvv4n3vqqu35qajhcuqlq",
    handle: "fromthewestmeadow.com",
    revisions: [
      {
        uri: "at://did:plc:qttqvv4n3vqqu35qajhcuqlq/net.bisks.clusterpedia.revision/3ms677ghsdb22",
        createdAt: "2026-08-03T09:37:51.392Z",
        title: "Capitalism",
        summary: "init",
        content: "Capitalism is the invisible hand that makes you want to fuck the green M&M",
      },
      {
        uri: "at://did:plc:qttqvv4n3vqqu35qajhcuqlq/net.bisks.clusterpedia.revision/3mu6t4vtads2f",
        createdAt: "2026-08-29T02:24:44.588Z",
        title: "Capitalism",
        summary: "Init",
        content: "Capitalism is the invisible hand that makes you want to fuck the Green M&M.\n\n![What kind of sane world assigns sex appeal to a piece of candy?](https://cdn.mos.cms.futurecdn.net/HKoTi86VCh6w8ttHS5kL5W-1782-80.jpg.webp)",
      },
      {
        uri: "at://did:plc:qttqvv4n3vqqu35qajhcuqlq/net.bisks.clusterpedia.revision/3mu6t6l5mf22c",
        createdAt: "2026-08-29T02:25:41.051Z",
        title: "Capitalism",
        summary: "",
        content: "Capitalism is the invisible hand that makes you want to fuck the Green M&M.\n\n![a](https://cdn.mos.cms.futurecdn.net/HKoTi86VCh6w8ttHS5kL5W-1782-80.jpg.webp)\nWhat kind of sane world assigns sex appeal to a piece of candy?",
      },
      {
        uri: "at://did:plc:qttqvv4n3vqqu35qajhcuqlq/net.bisks.clusterpedia.revision/3mu6uyjjk6b27",
        createdAt: "2026-08-29T02:58:05.232Z",
        title: "Capitalism",
        summary: "",
        content: "Capitalism is the invisible hand that makes you want to fuck the Green M&M.\n\n![What kind of sane world assigns sex appeal to a piece of candy?](https://cdn.mos.cms.futurecdn.net/HKoTi86VCh6w8ttHS5kL5W-1782-80.jpg.webp)",
      },
    ],
  },
];

// --- restored talk post: capitalism -----------------------------------------
//
// Same 2026-08-30 audit that turned up the ad-fummum/capitalism revision gaps
// above (see RESTORED_ARTICLES) also found one net.bisks.clusterpedia.talk
// record in fromthewestmeadow.com's own PDS — a real, signed post to the
// Capitalism talk page — that had never made it into the KV talk: index.
// Restored the same way: read straight back out of the author's own repo,
// applied once, and only if the index doesn't already have it.

interface RestoredTalkPost {
  uri: string;
  did: string;
  handle: string;
  body: string;
  createdAt: string;
}
interface RestoredTalk {
  slug: string;
  posts: RestoredTalkPost[]; // chronological, oldest first
}

const RESTORED_TALK: RestoredTalk[] = [
  {
    slug: "capitalism",
    posts: [
      {
        uri: "at://did:plc:qttqvv4n3vqqu35qajhcuqlq/net.bisks.clusterpedia.talk/3ms6r4bbt4a23",
        did: "did:plc:qttqvv4n3vqqu35qajhcuqlq",
        handle: "fromthewestmeadow.com",
        body: "Lmao I love the expanded direction this went",
        createdAt: "2026-08-03T14:58:12.496Z",
      },
    ],
  },
];

export class WikiStore {
  private storage: KVNamespace;
  private seedChecked = false;

  constructor(storage: KVNamespace) {
    this.storage = storage;
  }

  // Deletes any contrib: entries for the given DIDs that point at `slug`.
  // Needed because writeArticleRevisions re-numbers rev idx from scratch
  // when it replays a fuller history (see its comment) — a revision that
  // was previously indexed under one idx (via handleEdit, or an earlier,
  // now-superseded writeArticleRevisions pass) can end up re-written under
  // a different idx, which would otherwise leave the old contrib: key
  // behind as a duplicate row in that author's profile. Matched by the
  // `slug` field inside each contrib entry's own JSON value, not by parsing
  // the key, since handleEdit/handleTalk and writeArticleRevisions don't
  // even agree on a key format (`contrib:<did>:<ts>:<idx>` vs
  // `contrib:<did>:<ts>:<slug>-<idx>>`).
  private async clearContribsForSlug(slug: string, dids: string[]): Promise<void> {
    for (const did of dids) {
      const prefix = `contrib:${did}:`;
      const names: string[] = [];
      let cursor = "";
      do {
        const page = await this.storage.list({ prefix, cursor: cursor || undefined, limit: 1000 });
        names.push(...page.keys.map((key) => key.name));
        cursor = page.list_complete ? "" : page.cursor || "";
      } while (cursor);
      const values = await Promise.all(names.map((name) => this.storage.get<{ slug?: string }>(name, "json")));
      await Promise.all(
        names.filter((_, i) => values[i]?.slug === slug).map((name) => this.storage.delete(name)),
      );
    }
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

  // Writes any SEED_ARTICLES or RESTORED_ARTICLES that aren't in storage yet.
  // Runs once per cold start (guarded by an in-memory flag, not a storage
  // one — a storage flag that trips after the *first ever* seeding would
  // permanently skip this on every later request, silently dropping any seed
  // article added in a later code change, which is exactly what happened
  // before this fix). Per-slug existence is checked so a real article a user
  // has since edited (or a real article recovered by RESTORED_ARTICLES)
  // never gets clobbered by a reseed.
  private async ensureSeeded(): Promise<void> {
    if (this.seedChecked) return;
    const now = new Date(Date.now()).toISOString();
    for (const seed of SEED_ARTICLES) {
      await this.writeArticleRevisions(seed.slug, [
        {
          did: SEED_DID,
          handle: SEED_HANDLE,
          title: seed.title,
          content: seed.content,
          summary: seed.summary,
          uri: `system:seed:${seed.slug}`,
          createdAt: now,
        },
      ]);
    }
    for (const restored of RESTORED_ARTICLES) {
      await this.writeArticleRevisions(
        restored.slug,
        restored.revisions.map((r) => ({
          did: restored.did,
          handle: restored.handle,
          title: r.title,
          content: r.content,
          summary: r.summary,
          uri: r.uri,
          createdAt: r.createdAt,
        })),
      );
    }
    for (const restoredTalk of RESTORED_TALK) {
      await this.writeTalkPosts(restoredTalk.slug, restoredTalk.posts);
    }
    this.seedChecked = true;
  }

  // Shared by ensureSeeded's two sources: writes a full revision history for
  // `slug` — one rev: entry per revision, one contrib: entry per revision,
  // and the resulting article: entry. Only overwrites when `revisions` (a
  // verified, real history read straight from the author's PDS) is a strict
  // superset of what's already indexed — i.e. the existing article has fewer
  // revisions than we're about to write. That covers both "slug is missing
  // entirely" (existing revCount 0) *and* "slug exists but the index is
  // missing some of the author's real revisions" (e.g. a restore lost a race
  // against a live edit and only the live edit ended up indexed) — the
  // second case is exactly what the 2026-08-30 ad-fummum/capitalism repair
  // needed: `existing.revCount` was 1 and 3 respectively, but the author's
  // PDS actually held 6 and 4 real revisions. `revisions` must be given
  // oldest-first; the last one becomes the article's current text.
  private async writeArticleRevisions(
    slug: string,
    revisions: { did: string; handle: string; title: string; content: string; summary: string; uri: string; createdAt: string }[],
  ): Promise<void> {
    const artKey = `article:${slug}`;
    const existing = await this.storage.get<Article>(artKey, "json");
    if (existing && existing.revCount >= revisions.length) return;
    if (existing) await this.clearContribsForSlug(slug, [...new Set(revisions.map((r) => r.did))]);
    for (let i = 0; i < revisions.length; i++) {
      const rev = revisions[i];
      const idx = i + 1;
      await this.storage.put(`rev:${slug}:${pad(idx)}`, JSON.stringify({ idx, ...rev }));
      await this.storage.put(`seen:${rev.uri}`, "true");
      const ts = Number.isFinite(Date.parse(rev.createdAt)) ? Date.parse(rev.createdAt) : Date.now();
      await this.storage.put(`contrib:${rev.did}:${padTs(ts)}:${slug}-${idx}`, JSON.stringify({
        type: "edit",
        slug,
        title: rev.title,
        summary: rev.summary,
        uri: rev.uri,
        createdAt: rev.createdAt,
      }));
    }
    const first = revisions[0];
    const last = revisions[revisions.length - 1];
    const article: Article = {
      slug,
      title: last.title,
      content: last.content,
      summary: last.summary,
      revCount: revisions.length,
      createdAt: first.createdAt,
      updatedAt: last.createdAt,
      updatedBy: { did: last.did, handle: last.handle },
    };
    await this.storage.put(artKey, JSON.stringify(article));
  }

  // Companion to writeArticleRevisions, for RESTORED_TALK: appends any given
  // posts (oldest-first) that aren't already indexed by uri, numbering them
  // after whatever's already there. Talk posts don't carry a revCount-style
  // completeness signal the way articles do, so "missing by uri" is the
  // correctness check here rather than a length comparison.
  private async writeTalkPosts(
    slug: string,
    posts: { uri: string; did: string; handle: string; body: string; createdAt: string }[],
  ): Promise<void> {
    const existing = await this.listValues<any>(`talk:${slug}:`);
    const existingUris = new Set(existing.map((p) => p.uri));
    const missing = posts.filter((p) => !existingUris.has(p.uri));
    if (!missing.length) return;
    let idx = existing.length;
    for (const p of missing) {
      idx += 1;
      await this.storage.put(`talk:${slug}:${pad(idx)}`, JSON.stringify({
        idx,
        did: p.did,
        handle: p.handle,
        body: p.body,
        uri: p.uri,
        createdAt: p.createdAt,
      }));
      await this.storage.put(`seen:${p.uri}`, "true");
      await this.storage.put(`contrib:${p.did}:${padTs(Date.parse(p.createdAt))}:${slug}-talk-${idx}`, JSON.stringify({
        type: "talk",
        slug,
        summary: truncate(p.body, 120),
        uri: p.uri,
        createdAt: p.createdAt,
      }));
    }
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
