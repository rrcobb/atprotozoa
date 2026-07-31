# atproto surface map — what a bot could actually do

Brainstorming scaffold, not a plan. The question behind it: if we build bots that
do "various atproto things," what things are there? This lists the protocol's
concepts, marks what this repo has already touched, and flags what a bot could do
that a website can't.

**What the repo uses today** (from a grep across `sites/`, counts are call sites,
not importance):

- Overwhelmingly reads: `getProfile`, `resolveHandle`, `searchActorsTypeahead`,
  `getAuthorFeed`, `getFollows`/`getFollowers`, `listRecords`, `getRepo` (CAR),
  `getPostThread`, `searchPosts`, `getLikes`.
- Some writes: `createRecord` / `putRecord` / `deleteRecord`, `feed.post`,
  `feed.like`, `feed.repost`, `graph.block`, `uploadBlob`, `video.uploadVideo`.
- Barely: `getRelationships` (2 — the mutual check), `getServiceAuth` (2),
  `listReposByCollection` (6), `notification.listNotifications` (4 — the
  watcher).

So: the repo is deep on **AppView reads** and shallow on everything structural.
Most of the list below is untouched.

---

## 1. Identity

**DID** — the permanent account ID. `did:plc:` (most accounts, mutable via the
PLC directory) or `did:web:` (a domain serves its own DID doc).
Touched: yes, read-only (`didscope`, `didneighbors` sort DIDs lexicographically).

**DID document** — public keys, the account's PDS location, `alsoKnownAs`
handles, and `service` entries. Fetchable from `plc.directory/<did>` with no
auth. orpach pointed this out in a thread: you don't need to log in to map DIDs
to handles.
Untouched. A bot could watch the PLC audit log — every DID doc change is public
and timestamped. Handle changes, PDS migrations, key rotations, all visible.

**Handle** — a domain that resolves to a DID (DNS `_atproto` TXT record or
`/.well-known/atproto-did`). Rented, not owned; the DID is the real identity.
Touched: `bisks.net` and `buildthis.bisks.net` both work this way.

**PLC operation log** — the append-only history of every change to a `did:plc`.
Genuinely untouched, and interesting: it's a public record of who moved PDS, who
rotated keys, when accounts were created. Bot territory (a "who migrated today"
poster).

## 2. Data storage

**Repository** — one per account, a signed Merkle tree of all their records.
Downloadable whole as a **CAR file** via `com.atproto.sync.getRepo`.
Touched, and this repo learned it the hard way: carbonadoks pushed buildthis into
a CAR helper because `listRecords` was slower, and it got swept across several
sites.

**Collection** — a namespaced group of records (`app.bsky.feed.post`,
`app.bsky.feed.like`, …). An account's repo is a set of collections.

**Record** — one JSON object at `at://<did>/<collection>/<rkey>`, validated
against a lexicon, signed as part of the repo.
Touched: sites write `net.bisks.*` records (steamtags, padmoot, verdict,
paintmoot, docmoot snapshots).

**Lexicon** — the schema language. This is where the repo has repeatedly drawn
blood: `padmoot` and `paintmoot` both hit "no floats, integers only" days apart.
A lexicon designer/validator is the tool that keeps not existing.

**Blob** — binary attachments (images, video), content-addressed, uploaded via
`uploadBlob` then referenced from a record.
Touched lightly. **This is the hook for the image/video-gen bot** — generated
media has to become a blob in the bot's own repo before it can be embedded in a
post.

**`listReposByCollection`** — find every repo that has records in a given
collection. The discovery primitive for any custom lexicon: it's how you'd find
everyone using `net.bisks.whatever`. Used 6 times here; underexploited.

## 3. Networking / sync

**Relay (firehose)** — aggregated stream of every commit across the network.

**Jetstream** — the same thing as JSON over a WebSocket, no CAR decoding.
Touched: several sites read it live in the browser (trigrams/firehose,
catsofatproto, koipond, chironhell, logjam, fruitninja).
The gap named repeatedly: nothing *persists* what it sees. cloutgraph's author
said the real version "would need to be hooked up to a jetstream for a while
instead of crawling everyone's PDS each run." That's a cron/worker job, not a
page.

**PDS** — the host that stores a repo and serves its records.

**AppView** — the indexed, queryable view (`public.api.bsky.app`). Almost
everything in `sites/` talks to this.

## 4. Bluesky application lexicons

**Feed generator** (`app.bsky.feed.generator`) — a service that returns a list of
post URIs; users subscribe to it as a custom feed. **A big untouched surface.**
The repo has 6 references but has never *published* one. Any filter written as a
site (unique trigrams, cats, ratioed) could be a feed instead, and feeds get
distribution inside the Bluesky app rather than requiring a link click.

**Labeler** (`app.bsky.labeler.service`) — publishes labels on accounts/posts;
users subscribe. Needs its own signing key and a persistent endpoint. Discussed
in `notes/81`. The natural home for thebadcode's semantic-mute idea.

**Lists** (`app.bsky.graph.list`) — curated account collections, usable for
moderation or feeds. Lightly touched.

**Starter packs**, **threadgates** (who may reply), **postgates** (who may
quote) — all untouched. A bot could manage any of them.

**Notifications** — how buildthis's watcher works today (`listNotifications` on a
cron, cursor in KV).

**Chat/DM** (`chat.bsky.*`) — untouched. A DM-triggered bot is a different UX
from a tag-triggered one: private, no thread noise.

**OAuth** — the real login flow for acting on a user's behalf. Some sites use it;
it's how anything user-authored (not bot-authored) has to work.

**Service auth** (`com.atproto.server.getServiceAuth`) — short-lived tokens for
one service to call another as a user. Used twice here (the video upload).
Relevant if bots start calling each other's authenticated endpoints.

## 5. Moderation

**Labels** — the atoms labelers emit. **Reports** (`com.atproto.moderation`) —
untouched. **Takedowns**, **mutes**, **blocks** — blocks are read in a couple of
sites; the rest untouched.

---

## What this suggests for bots

Grouping the untouched surfaces by what kind of bot they'd make:

**Things only a bot can do (a website structurally can't):**
- Post on a schedule (cron) — every firehose-derived site here would be a better
  daily poster than a page nobody reloads.
- Hold persistent state across the whole network over time (Jetstream → storage).
  Every "this re-crawls on each load" complaint points here.
- Own an identity: publish a feed generator, run a labeler, emit labels.
- React to notifications/DMs.
- Write blobs into its own repo — the prerequisite for generated images/video.

**Cheapest interesting things untouched:**
- Publish one feed generator. The repo has many filters and zero feeds.
- Watch the PLC audit log. Free, public, nobody's doing it.
- Use `listReposByCollection` to find everyone using a `net.bisks.*` lexicon —
  turns the sites' scattered records into a network.

**The recurring structural gap:** no persistent index. Jetstream is read live and
thrown away everywhere. That single missing piece is behind the dataset idea, the
cloutgraph limitation, the "annual review" idea, and most per-load slowness.
