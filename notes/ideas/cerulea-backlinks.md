# Cerulea backlinks — surveyed, not adopted, 2026-09-14

Asked for by octopodeeznuts.bsky.social, replying "👀" under bisks.net saying
"this would be useful for a good handful of the build bot's creations" while
quoting char.lt's blog post ("atproto full-net backlinks") plus two links:
`backlinks.cerulea.blue` (the service) and `bsky-thread.bun.how` (a demo).
The ask: audit capabilities, note where it'd help, no build this round.

## What it is

`blue.cerulea.backlinks` — a full-network backlink index, v0.1, by char.lt.
Same category of tool as microcosm.blue's Constellation (see
[[microcosm-blue]], surveyed/partially-adopted 2026-08-28): crawl the
firehose, index every `at://`-shaped reference any record contains, keyed by
*target*, answer "what points at this?" instead of the AppView's
per-relationship-type endpoints (`getLikes`, `getRepostedBy`, `getFollowers`,
...). The author is explicit that the API is a deliberate, incompatible
redesign of Constellation's, not a compatible alternative ("i'm evil sorry")
— two independent implementations of the same idea, not a drop-in swap.

### Confirmed live, 2026-09-14

One XRPC endpoint, public, unauthenticated, CORS open
(`access-control-allow-origin: *` — same trust shape as the public AppView
and as Constellation):

```
GET https://backlinks.cerulea.blue/xrpc/blue.cerulea.backlinks.listBacklinks
    ?target=<at-uri>[&cursor=<cursor>]
```

`target` must be a full `at://` URI — either a specific record
(`at://did/collection/rkey`) or a bare repo (`at://did:...` alone, which
returns every link pointing at *anything* in that repo). A bare DID with no
`at://` prefix 400s.

Response shape, confirmed against real targets:

```json
{"backlinks": [{"location": "$.reply.parent", "uris": ["at://..."]}], "cursor": null}
```

Grouped by the *JSON path* of the reference inside the source record, not by
a friendly relationship name. Groups actually seen in testing: `$.subject`
(covers both `app.bsky.graph.follow.subject` and `app.bsky.feed.like.subject`
— same path name, different collections, so a consumer has to also look at
each returned URI's own collection to tell a follow from a like),
`$.reply.parent`, `$.reply.root`, and — not something the blog writeup
mentioned, found only by querying a real repo —
`$.facets[N].features[N].did`: **mention facets are indexed**, meaning
"who has actually @-mentioned this DID" is answerable as a link query, not
just a text search. Untested here: `$.embed.record` (quote posts) and
`$.embed.record.record` (quoted-repost-of-quote nesting) — didn't happen to
hit a live example, but the location-keyed shape strongly implies they'd
show up the same way. Cursor-paginated; page size not stress-tested.

### The demo: `bsky-thread.bun.how`

An "appviewless thread renderer" — reconstructs a full reply thread by
walking `$.reply.parent`/`$.reply.root` backlinks instead of calling the
AppView's `getPostThread`. That matters concretely here: `sites/coliseum`
already documents (`public/lib/atproto.js:69`) that `getPostThread`'s
`depth=1000` is "the API's actual max (not a guessed cap)" — a real ceiling
on how deep a reconstructed thread can go, not a self-imposed one this repo
could just raise per the "question every cap" standing order. A
backlinks-based walk has no such AppView-imposed depth limit; it's bounded
only by how many pages a client is willing to fetch, same tradeoff
Constellation already made for followers.

## Where this might help (first-pass audit, not exhaustive)

Grepped `sites/*/site.json` blurbs and `sites/**/*.js` for
`getPostThread`/`getLikes`/`getRepostedBy`/`getQuotes` usage and thread/quote/
mention-shaped blurbs across the ~657 sites in the repo; read the specific
candidates below, didn't open all ~130 grep hits. Treat this as a
worth-a-second-look list, not a verified backlog.

**Sites paginating `getLikes`/`getRepostedBy` for "who liked/quoted this
post," which Constellation-style link data would answer without AppView
pagination:**

- `sites/listenheimer` — reads every liker of a pasted post URL and writes
  them into a moderation list. `public/lib/likes.js:2-14` already documents
  the reasoning explicitly: *"getLikes has no bulk-download equivalent (it's
  an AppView aggregate, not a repo record)"* — the exact exception case the
  2026-08-25 bulk-reads order carved out. Cerulea's `$.subject` backlinks on
  the post's `at://` URI is a different, non-AppView source for the same
  list — not a repo-level bulk read either (still cursor-paginated), but
  worth comparing page size against `getLikes`' 100/page the way Constellation
  beat `getFollowers` ~10x for kevinmoot.
- `sites/snubbed` — compares likers of two posts (`public/lib/bsky.js:62`,
  `MAX_PAGES = 4000` backstop on the same `getLikes` walk). Same shape as
  listenheimer, two targets instead of one.
- `sites/quotehof` — a quote-post hall of fame; likely uses search or
  `getQuotes` rather than backlinks today. `$.embed.record` backlinks
  (unconfirmed above, but implied by the location-keyed shape) would be the
  direct "who quoted this" query if it turns out to be indexed.

**Sites reconstructing/walking threads, where `bsky-thread.bun.how`'s
appviewless approach is a closer match than `getPostThread`:**

- `sites/coliseum` — "fills a coliseum with the thread underneath" a pasted
  post, already documents the `depth=1000` AppView ceiling as a real limit,
  not a self-imposed cap (see above). The clearest concrete fit found in this
  pass.

**Engagement-graph crawlers that currently pull replies/likes/reposts across
many posts one AppView call at a time (a bulk backlink source could reduce
request count, same pattern as Constellation-for-followers, not confirmed
faster here):**

- `sites/metamoots`, `sites/mootflow`, `sites/purge`, `sites/areyoumad`,
  `sites/likeclusters`, `sites/lurkhelper` — all crawl a person's own recent
  posts plus who liked/replied/reposted them to build an engagement or
  meta-mutual graph. Each would need target-per-post backlink queries (one
  per post, same as today's per-post `getLikes` calls) rather than one bulk
  call, so the win here is smaller than the coliseum/listenheimer cases —
  flagging as a maybe, not a clear win.

**Mention tracking:**

- `sites/hindex` — "live-scans Bluesky for posts actually citing the
  handle." Today that's presumably keyword search. `$.facets[].features[].did`
  backlinks on `did:plc:...` (buildthis's own DID) would catch every
  *structured* @-mention directly — but wouldn't catch someone saying
  "buildthis" in plain text without the facet, so it's a complement to
  keyword search here, not a replacement.

**Already using microcosm.blue's Constellation for the same category of
query** (`sites/kevinmoot`, `mootfluence`, `blockcurve`, `blocksweep`,
`tacocounter`, `velvetrope`, `xbill`): no reason to add a second,
API-incompatible backlink source alongside a working one just because it
exists. Worth remembering as a fallback if Constellation ever has an outage,
not worth wiring in proactively.

## Not done here

Nothing wired in — the ask was explicitly notes-only. If a future build picks
one of the above up, re-confirm `$.embed.record` indexing live first (the one
gap in this survey), and decide per-site whether Cerulea's page size actually
beats the AppView's before treating it as a real win rather than a
maybe-parallel data source.
