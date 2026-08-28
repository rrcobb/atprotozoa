# microcosm.blue — surveyed and partially adopted, 2026-08-28

Asked for by bisks.net, tagging the bot in the kevinmoot thread: "have you done
anything with microcosm.blue? worth a note / experiment on this site if it
seems like a fit." The immediate context: orpach.neocities.org, in the same
thread, had pointed at microcosm.blue and specifically at its **network-graph
fit** — "I can only see requests to the bluesky appview getfollowers endpoint
in the network view. It might be better for doing graph-type things." This
note is both: a survey of what microcosm.blue actually offers, and the
experiment it prompted on kevinmoot.

## Who's behind it / what it is

`microcosm.blue` — "atproto building blocks," described as "open-source
atproto services and resilient community infrastructure." Three public
services, all crawling the firehose independently of the Bluesky AppView:

- **Constellation** — a backlink index. Crawls every record on the network and
  indexes every link it contains (any `at://` reference — a `.subject` on a
  follow, a `.subject` on a like, a reply's `.reply.parent`, etc.) keyed by
  *target*. Answers "who/what points at this DID/URI," the reverse-index
  question the AppView only answers per-relationship-type
  (`getFollowers`/`getLikes`/etc.).
- **Spacedust** — the same link extraction, re-emitted live as a filtered
  WebSocket firehose (subscribe by `wantedSources`/`wantedSubjects`).
  Untried here; the fit would be a live "who's interacting with X right now"
  feed, not a bulk backfill.
- **Slingshot** — a firehose-backed record/identity cache, including a
  `resolveMiniDoc`-style identity endpoint. Untried; the bot's existing
  `plc.directory` + AppView identity resolution already covers this ground
  (see `identity.js` copied across most graph sites).

Public, unauthenticated, CORS-enabled (`Access-Control-Allow-Origin: *`,
confirmed live against `constellation.microcosm.blue`) — same trust shape as
the Bluesky public AppView: a third party this project doesn't operate, with
no SLA, but nothing to log in to and nothing secret to leak. The one asked-for
courtesy — a `User-Agent` naming your project — isn't enforced, and isn't
something browser `fetch()` can even set (browsers own that header), so
client-side callers can't comply with it even if they wanted to; a
server-side Worker call could.

## What actually got tried: Constellation for followers

kevinmoot (`sites/kevinmoot`) computes a "moot" (mutual-follow) graph via
per-account BFS (`public/lib/bfs.js`). The two halves of "who is this account
connected to" were already asymmetric before this note:

- **follows** are records in the account's own repo — bulk-readable in one
  `com.atproto.sync.getRepo` CAR download, no pagination, since 2026-08-25.
- **followers** are an AppView-*computed* reverse index, not a repo record —
  there's no repo-level bulk read for "everyone who follows me," so this side
  stayed a paginated `app.bsky.graph.getFollowers` walk (100/page), which is
  exactly the AppView traffic orpach called out.

Constellation turns out to index this exact relationship independently:
`app.bsky.graph.follow` records, keyed by their `.subject`, are precisely
"who follows this DID." Confirmed live (2026-08-28) against
`https://constellation.microcosm.blue/links/distinct-dids
?target=<did>&collection=app.bsky.graph.follow&path=.subject&limit=1000`:
correct linking-DID lists, cursor pagination that behaves as expected, CORS
open, and — the actual win — **pages up to ~1000 DIDs** versus the AppView's
100, roughly a 10x reduction in requests for the same followers list. (Tried
`limit=2000`/`5000`/`10000`: all `400`; `1000` is accepted but a given page
can come back short of 1000 depending on response byte size, so pagination
still has to loop on `cursor`, it just loops far less.)

Wired in: `fetchFollowers()` in `bfs.js` now tries Constellation first and
falls back to the old paginated `getFollowers` walk only if Constellation
itself errors (outage, CORS regression, response-shape change) — the same
"bulk-first, paginate-as-fallback" shape `fetchFollows()` already used for the
CAR-vs-`getFollows` choice. No UI change; this is a data-source swap under an
existing feature, not a new one.

## Where this doesn't (yet) extend

- Not proven at kevinmoot's actual moot-family siblings (moot-bingo,
  clustercrawl, the simcluster\* cluster, ~55 others per
  `notes/40-new-site-playbook.md`'s 2026-08-28 order) — they all copied the
  same `graphAll()` pagination helper kevinmoot used to have. Same swap would
  apply to each, un-tried here; "copy, don't abstract" means each site's own
  `bfs.js`/`identity.js` copy needs the same edit individually, not a shared
  fix.
- Constellation's index lags the live firehose by however long its own
  ingestion takes (not measured here) — for a "did they just follow/unfollow"
  freshness question, the AppView is still the more current source. For "give
  me the shape of the graph," which is what moot-tracing actually needs,
  freshness on the order of the site's own 6-hour moot-set cache
  (`bfs.js`'s `CACHE_TTL_MS`) is a non-issue.
- Spacedust (live filtered firehose) is the more interesting untried piece —
  closer to idea #10/#11 (digest/curator bot, `other-bots.md`) than to
  kevinmoot's one-shot BFS. Worth a second look if either of those gets built.

Half-surveyed, half-adopted — unlike `waow-tech-utilities.md`'s pure survey,
this one shipped a real (small, reversible) change. Nothing else here is
committed to.
