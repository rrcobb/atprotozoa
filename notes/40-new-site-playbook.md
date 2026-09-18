# New-site playbook (for humans and agents)

The target workflow: "text an idea → an agent builds and deploys a whole small
site." This note is the recipe.

A site is a directory under `sites/`, deployed as its own Cloudflare Worker
named `atprotozoa-<name>`, served at `<name>.bisks.net`.

## Steps

1. **Pick a lineage.** Copy the existing site closest to the idea:
   `cp -r sites/<closest> sites/<newname>`. If nothing's close, copy
   `sites/trigrams` or start from the template below.

2. **Rename.** In the new `sites/<newname>/`:
   - `wrangler.toml`: `name = "atprotozoa-<newname>"` and a single route
     `{ pattern = "<newname>.bisks.net/*", zone_name = "bisks.net" }`.
   - `package.json`: `"name": "@atprotozoa/<newname>"`.
   - If you copied an older site, delete any `bisks.net/<oldname>` path route
     and the prefix-stripping in its `src/index.ts` — a new site is served at
     the root of its own hostname and needs neither. See "Older sites" below.
   - Purge copied-in logic you don't need.

3. **Build the idea frontend-first.** Start in `public/`: keep ephemeral state,
   derived data, timers, and live Jetstream subscriptions in the browser. Use
   atproto OAuth and records when the user wants durable, shareable state. Copy
   atproto helpers from sibling sites as needed — copy, don't import across
   sites. Any absolute URL the site writes about itself (OG tags, share links,
   OAuth redirect URIs) is `https://<newname>.bisks.net/...` with no path prefix.
   If the site needs OAuth, scope it to exactly what it does — see
   `notes/50-oauth-scopes.md`, not a blanket `atproto transition:generic`.
   If shared persistence would make the site more useful than browser-local
   state, use KV for best-effort counters, boards, event logs, snapshots, or
   derived indexes. Document what may be stale or duplicated. Durable Objects
   are not used in this repo (notes/11-durable-objects.md); do not inherit one
   from the lineage site, and note that a cron or alarm has no KV equivalent —
   state advances on the next request instead.

4. **Run it locally.** `cd sites/<newname> && pnpm dlx wrangler dev`, then open
   `localhost:8787`.

5. **Check local paths.** `pnpm check:imports` from the repo root walks every
   site's `public/` for `<script src>` / `<link href>` / module `import`
   references that don't resolve or don't exist on disk.

6. **Write `sites/<newname>/site.json`** — the site's canonical record, and what
   puts it on the apex gallery:

   ```json
   {
     "name": "<newname>",
     "url": "https://<newname>.bisks.net/",
     "title": "<newname>",
     "blurb": "one or two sentences, lowercase, what it is and who asked",
     "tag": "game",
     "type": "game",
     "by": "requester.handle",
     "src": "bot",
     "hidden": false
   }
   ```

   `type` is the front page's filter vocabulary — `toy`, `game`, `tool`,
   `joke`, `explainer`, `art`. Set `hidden: true` for infrastructure or a
   retired site.

   Then run `node audit/build-gallery.mjs --apply` to regenerate
   `apex/public/index.html`. **Don't hand-edit the gallery's card list** — it's
   overwritten from the manifests, and CI fails the push if the two disagree.
   That check exists because a build once committed a gallery card for a site it
   never created, and the dead link sat on the front page for three days.

7. **Deploy.** Push to `main` and let CI deploy, or `pnpm dlx wrangler deploy`
   once to confirm it comes up.

## Why a route and not a Custom Domain

The zone has a wildcard `*.bisks.net` DNS record (proxied) and a wildcard ACM
certificate, so an arbitrary subdomain resolves and completes TLS without being
registered in advance. A site therefore claims its hostname with a plain
**route**:

```toml
routes = [
  { pattern = "<name>.bisks.net/*", zone_name = "bisks.net" },
]
```

**Don't use `custom_domain = true`.** Custom Domains cap at 100 per zone and
routes cap at 1000. The zone has hit that cap before, and a Custom Domain
consumes a slot without giving a site anything a route doesn't. The apex is the
one exception: `*.bisks.net` matches one level below the apex, so `bisks.net`
itself stays a Custom Domain.

## Template

```toml
# sites/<name>/wrangler.toml
name = "atprotozoa-<name>"
main = "src/index.ts"
compatibility_date = "2025-01-01"

routes = [
  { pattern = "<name>.bisks.net/*", zone_name = "bisks.net" },
]

[assets]
directory = "./public"
binding = "ASSETS"
run_worker_first = true
```

```ts
// sites/<name>/src/index.ts
// Served at the root of <name>.bisks.net, so requests are passed to the
// static-asset router unchanged. Server-side behavior (an OAuth callback, a
// per-result share route, a cron) goes here, ahead of the ASSETS fallthrough.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
```

```
sites/<name>/
├── wrangler.toml
├── package.json          # { "name": "@atprotozoa/<name>", "private": true }
├── src/index.ts
├── site.json
└── public/index.html
```

See `sites/windmill` for a personalized `/r/<code>` share route and
`sites/padmoot` for OAuth. For what scope to request, see
`notes/50-oauth-scopes.md`.

## Older sites: legacy path routes

Between mid-July and 2026-07-31, sites were mounted at `bisks.net/<name>`
because the zone was at its Custom Domain cap. Those sites kept their path
routes alongside their subdomain so previously-shared links still work, so **an
older site may answer on both**, and its `src/index.ts` strips the mount prefix.

If you're editing one, the prefix-strip must be **conditional**:

```ts
if (url.pathname === PREFIX || url.pathname.startsWith(PREFIX + "/")) {
  url.pathname = url.pathname.slice(PREFIX.length) || "/";
}
```

Stripping unconditionally fails silently. Reached on the subdomain the prefix
isn't there, so the slice chops the front off short paths instead
(`"/app.js".slice(6)` → `""` → falls back to `"/"`), and every asset request
serves `index.html` with a 200. The page renders; nothing works.

About 30 sites sit one level deeper at `bisks.net/games/<name>`, so their
`PREFIX` is `/games/<name>`. `sites/games` serves the cluster's index page at
the bare `bisks.net/games`, and deliberately does not claim `bisks.net/games/*`,
which would shadow each game's own path route. Clusters are no longer a routing
concept: a new game is an ordinary site with its own subdomain.

**OAuth sites need a single canonical host.** An atproto client is identified by
its `client_id` URL, and the PDS fetches `client-metadata.json` from that URL and
checks the contents agree — so the client can't be dual-homed. Pick the
subdomain, set `MOUNT = ""`, and point `client_id` / `client_uri` /
`redirect_uris` at `https://<name>.bisks.net`. A legacy path route may still
serve the site, but login only works on the canonical host.

## Conventions that keep this one-shottable

- **Directory name = site name = subdomain.** `sites/foo` → `atprotozoa-foo` →
  `foo.bisks.net`.
- **`public/index.html` always exists.** Even server-heavy sites have a static
  entry.
- **No cross-site imports.** An agent should never need to understand two sites
  to change one.
- **Keep `wrangler.toml` boring.** Same fields every time; only `name` and the
  route differ for a static site.
- **Self-contained deps.** A site declares what it needs in its own
  `package.json`. Don't hoist to the root.
- **Include sharing, not just when asked.** OG/Twitter meta tags with a real
  preview image, plus a one-tap way to post the result to Bluesky. This is the
  default for most sites — see `notes/45-sharing-and-virality.md` for the recipe
  and `sites/didscope` for the reference implementation. Skip it only when the
  site has no per-user "result" to show off.

## Ecosystem tools: copy from these sites

People tagging the bot keep recommending the same third-party atproto tools
(collected 2026-09-17 from every buildthis thread). Each one below has a
working, copied-before implementation in the repo. Copy that file; don't
reinvent the call, and don't wire in a tool that isn't listed without a
survey note in `notes/ideas/` first.

| need | tool | copy from |
| --- | --- | --- |
| who follows / likes / quotes / lists / blocks a DID or URI, in bulk | Constellation (`constellation.microcosm.blue`), the backlink index | `sites/innercircle/public/lib/topmutuals.js` (`getBacklinkDids` + `getBacklinks`) |
| live records as they land | Jetstream (`wss://jetstream*.us-*.bsky.network/subscribe?wantedCollections=`) | `sites/voidshout/public/lib/ingest.js`, `sites/trigrams/public/firehose/` |
| handle typeahead at login or in a search box | typeahead.waow.tech first, AppView `searchActorsTypeahead` as fallback (cut over 2026-09-17, `notes/ideas/waow-tech-utilities.md`) | `handle-typeahead.js`, identical in 244 sites; edit one, copy to all |
| every label on an account from every labeler | `atproto-accept-labelers` fan-out over mackuba's labeler directory | `sites/labelmuster` |
| a link to a raw record | pdsls (`https://pdsls.dev/at://<uri>`), not bsky.app | `sites/selflikes`, `sites/receipts` |
| how much traffic a site gets | `https://stats.bisks.net/stats/<name>.json` (`notes/86-stats.md`) | any site: one fetch, no token |

Constellation specifics that have bitten before:

- Use the XRPC routes. `/links/distinct-dids` and friends are deprecated
  (heika.dog, 2026-09-16). `getBacklinkDids?subject=<did>&source=<collection>:<path>`
  returns the same `{ total, linking_dids, cursor }` shape. `limit=1000`
  is the max; a page can come back short, so loop on `cursor`.
- The `source` path is the record field's full path. Follows are
  `app.bsky.graph.follow:subject`, but a like's subject is a strongRef, so
  likers of a post are `app.bsky.feed.like:subject.uri`, and quotes are
  `app.bsky.feed.post:embed.record.uri`. `:subject` on a like returns
  `total: 0` with no error (`sites/listenheimer/public/lib/likes.js`).
  Mention facets have two encodings in the wild; sum both paths
  (`sites/hindex/public/lib/bsky.js`). `/links/all?target=<did>` lists every
  path that points at a subject, which is how to find the right one.
- It returns DIDs only. Hydrate with `getProfiles` (25 per call) for just
  the ones you display; a list write or a set comparison needs no hydrate.
- The index starts 2025-01-28. Anything older isn't there, and several
  people have hit that as a data gap — say so in the UI when it matters.
- Always keep the AppView walk as the fallback. It's a third-party service
  with no SLA; every site above does `try constellation, catch → getFollowers`.

Things people asked for that need Rob, not a site: a labeler or feed
generator as bot output (signing key), and pre-2025 history of any kind.
Storage on the user's own PDS is *not* on that list — it needs nothing from
Rob, and the recipe is below.

## The visitor's own API key (LLMs, images, voice)

Anything that costs per-call — an LLM feature, image generation, text-to-speech
— can run on the *visitor's* key instead of Rob's. They paste their key, it goes
in their browser's localStorage, and the page calls the provider directly.
Nothing is billed to the repo and no key touches a Worker, which is what unblocks
image generation (`notes/ideas/00-index.md` item 9, previously set aside on cost).

Copy `sites/byok/public/lib/byok.js`, call `mountKeyPanel()`, then one of the
capability functions — they take a `provider` and otherwise look the same:

| function | does |
| --- | --- |
| `chat(prompt, {provider, system})` | text in, text out |
| `image(prompt, {provider})` | a URL or `data:` URL for an `<img>` |
| `speak(text, {provider, voice})` | a `blob:` URL for an `<audio>` |
| `sfx(prompt)` / `music(prompt)` | ElevenLabs sound effects and music clips |
| `transcribe(blob, {provider})` | audio in (e.g. MediaRecorder), text out |
| `embed(text, {provider})` | a vector |
| `search(query, {provider})` | web results |

Pass `capability: "chat"` to `mountKeyPanel()` instead of a `provider` and the
panel renders a picker over every provider that can do the job, so a visitor
uses whichever key they already have. `providersFor("speak")` lists them.

`sites/byok` is the reference: a horoscope read from someone's recent posts,
with an optional voice reading it aloud.

### Which providers a browser can actually call

Probed 2026-09-17 by running `fetch` from a real page and checking that the
response body came back readable. Most speak the OpenAI `/chat/completions`
dialect, so they cost one registry entry each rather than one function each —
adding another is a base URL and a model id, no new code.

| provider | can | note |
| --- | --- | --- |
| OpenAI | chat, image, speak, transcribe, embed | the most complete one |
| Anthropic | chat | needs `anthropic-dangerous-direct-browser-access: true` |
| Google Gemini | chat, embed | via its OpenAI-compatible endpoint |
| ElevenLabs | speak, sfx, music | best voices; stock voice id ships in the file |
| Deepgram | speak, transcribe | |
| fal | image | |
| Voyage | embed | |
| Exa | search | |
| OpenRouter, Groq, Mistral, DeepSeek, Together, xAI, Perplexity, Fireworks, Nebius, Hugging Face | chat | all OpenAI-dialect |

Blocked — the browser refuses these outright, so they'd need a proxy:
**Replicate**, **Black Forest Labs**, **Cerebras**, **Tavily**, **Brave Search**,
**Ideogram**, **Luma**, **Runway**, and **Jev** (TypeSafe's System One model at
`api.typesafe.ai`, which sends no CORS headers on any auth variant).

A proxy means the site owner holds the key and pays for every visitor, which
defeats the point. Reach for a listed provider instead; if a site genuinely needs
a proxied one, that's a Rob decision and wants a note in `notes/ideas/` first,
alongside the labeler/feed-generator asks.

**Test this with a browser, not curl.** curl is not a stand-in for browser CORS,
and it gets OpenAI backwards: send `Origin` from curl and the POST response has
no `access-control-allow-origin`, so a curl probe concludes the browser will
block it. A real page gets the header and the call works fine. The reverse error
is just as easy — a permissive `OPTIONS` response says nothing about whether the
actual POST will be allowed. The only probe that settles it is `fetch` from a
page on a real origin, reading the body; a blocked call throws
`TypeError: Failed to fetch` with no status, while an allowed one gives you a
status and a readable body even when that status is 401. Watch for dead URLs
too — a retired endpoint fails the same way a CORS block does, so check the host
answers curl at all before recording it as blocked.

On Anthropic, the dangerous-direct-browser-access header is genuinely required,
not advisory: without it the browser blocks the call outright (verified both
ways from a page). The "dangerous" refers to exposing a key to page JavaScript,
which is the intended arrangement here — it's the visitor's own key, pasted by
them, on their machine.

### What to say in the UI

Say where the key goes, in plain words, next to the input: stored in this
browser, sent only to the provider, never to this site. Always ship the forget
button — `byok.js` renders one as soon as a key is set. Don't write "secure" or
"encrypted": localStorage is neither, it's just local, and any script on the page
can read it. Local is the honest claim and it's the one that matters.

## Storage on the user's own PDS

The single most-repeated ask in the buildthis threads, in several phrasings:
@mensmachina (08-13) "authenticate with atmosphere and the user's PDS for
storage", @7778777 (07-30) "save this under `net.bisks.steamtags` in their
PDS", @geesawra (09-13) "use the spaces pds to store data", @dame.is (09-09)
"the full potential ... is significantly knee-capped without write
permissions".

All of it already works, and nothing about it is blocked. Roughly 20 sites
write 32 `net.bisks.*` record types today, and `_lexicon.bisks.net` resolves
(TXT `did=did:plc:f6n22z62adionrvb5s6n6vfk`), so the NSIDs are real, not just
fetchable files. What was missing was a single place saying "copy these four
files, in this order" — so here it is.

Copy from `sites/steamtags`. It is the reference for all three halves.

**1. The lexicon.** `public/lexicons/<nsid>.json`, copied from
`sites/steamtags/public/lexicons/net.bisks.steamtags.rating.json`. Write it
*before* the write path, not after — it is where you notice that atproto
records take integers and not floats, which `padmoot` and `paintmoot` both
shipped as a bug and both needed a user to report. Decide `key` here too: it
decides your read path. `"any"` with a meaningful rkey (steamtags uses the
Steam appid) means re-writing overwrites in place; a fixed `"self"` rkey
means one record per person; `"tid"` means one record per event. Then run
`audit/build-lexicons.mjs --apply` to mirror it into `apex/public/lexicons/`
so it serves at `bisks.net/lexicons/`. **Not optional:** `deploy.yml` runs the
same script without `--apply` and fails the push when the mirror disagrees,
the way it already does for the gallery. Before that check the drift was
silent — the schema never appeared at `bisks.net/lexicons/` and its NSID
resolved to nothing readable. The build box runs the regen itself on every
push (`builder/box-build.sh`), so this step is for humans and other agents.

**2. The write path.** `public/lib/oauth.js` plus `oauth-jwt.js`, copied
whole. The only edit is the `SCOPE` constant — one line, and for a
create-only site it reads `atproto repo:<nsid>?action=create`. Copy
`public/client-metadata.json` too and change `client_id`, `client_uri`,
`redirect_uris`, and the same `scope` string. Those two scope strings must
match exactly or the PDS rejects the authorize request; `notes/50-oauth-scopes.md`
has the full syntax and the rollback if a PDS rejects the granular form.

**3. The read path.** Without this the site is write-only — it puts records
somewhere you can never see in aggregate, which is what `tallybot` shipped
until 2026-08-20. Copy `public/lib/global-index.js`, which does a
`com.atproto.sync.listReposByCollection` backfill plus a live Jetstream
subscription. Which variant you copy follows from the `key` you chose in step
1: `sites/steamtags` for many records per repo, `sites/kolpelor` for a
singleton `"self"`, `sites/quadrants` for one record per (person, thing),
`sites/socialcredit` for the case where you need every record from each repo
and a whole-repo CAR download beats paginating.

24 sites have a `global-index.js` / `network-index.js` today. Copy the one
whose record shape matches yours.

### Private storage is the part that doesn't exist

@geesawra asked for private leaderboards (09-13) and got `tacocounter`, which
is honest about what it actually delivers: "a board is private the same way
an unlisted link is: nobody finds it without the link, but it's not
encrypted." That's the real constraint — a PDS record is world-readable, and
`listReposByCollection` is exactly the thing that makes unlisted records
findable. Don't write "private" in a UI when you mean unlisted.

The one real precedent is `sites/keytags`: `public/lib/keytag.js` HMACs a
passphrase that never leaves the tab, and stores only the hash as the rkey.
An aggregate view of it shows nothing to anyone without the key — which is
why it's the deliberate exception in the `listReposByCollection` list in
`notes/ideas/pds-and-lexicons.md`. Copy that when someone asks for private,
and say plainly which half is hidden: keytags hides *which* entries are
yours, not their contents. Encrypting record values so a leaderboard can
still be computed over them isn't built here and isn't a copy job — it needs
a survey note in `notes/ideas/` first.
