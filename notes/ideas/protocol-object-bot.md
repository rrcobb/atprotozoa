# A bot that makes protocol objects

Extending the brainstorm. The idea: **buildthis makes pages; a sibling bot makes
protocol objects.** Tag it, and instead of a website you get a feed generator, a
labeler, a lexicon, a list — a thing that lives *in* atproto rather than a page
that reads it.

This reframes several earlier notes. `other-bots.md` and `bot-ideas-riff.md` listed candidates
as separate bots; a lot of them are better understood as **outputs of one bot**.
That's the more useful organizing idea, so treat this note as superseding the
"one bot per idea" framing there.

Verdict up front: the idea holds together, the pieces are ordinary, and most of
it is buildable under today's rules. The genuinely new problems are **lifecycle**
and **ownership**, not capability.

## Why the shape works

The four candidate outputs share a build template:

1. a **declaration record** written to some repo
2. optionally a **service endpoint** that serves it
3. optionally a **DID** for that service
4. some **logic** deciding what it says

That's a form with slots. An agent fills forms well — much better than it invents
novel toys. The variable part is (4), and even that is mostly "which filter,"
not "design a ranking algorithm."

Compare to buildthis, where every build is a fresh design problem. This bot's
builds are near-identical in structure and differ in configuration. That's a
*better* fit for automation, not a worse one.

## The four outputs are not equally hard

They split cleanly along one line — whether a signing key is involved.

| output | declaration | endpoint | DID | key | buildable today? |
| --- | --- | --- | --- | --- | --- |
| **lexicon** | schema JSON at a path | no | no | no | **yes** |
| **list / starter pack** | `app.bsky.graph.list` record | no | no | no | **yes** |
| **feed generator** | `app.bsky.feed.generator` record | `getFeedSkeleton` | `did:web:` | no | **yes** |
| **labeler** | `app.bsky.labeler.service` record | label websocket | own DID | **yes** | needs Rob |

Three of four need no secret the builder is forbidden to touch. That's better
than `beyond-buildthis.md` implied — I had lumped feeds in with labelers, and they're not
the same. A feed generator's service DID can be `did:web:bisks.net` (or a
subpath), which is *just a served document* — and `apex/src/index.ts` already
serves `.well-known/atproto-did` for exactly this class of thing. No PLC
operation, no key ceremony.

**And there's already a working pattern for the write path.** `builder/reply.mjs`
does `createSession` with `BOT_APP_PASSWORD` and then `createRecord` — the
harness holds the credential and performs the write; the build agent never reads
it. Any declaration record this bot needs to write can go through that same
shape. The sandbox rule isn't actually in the way for three of the four.

## The two real problems

### 1. These things are alive

A page is finished when it deploys. A feed generator has to keep answering
`getFeedSkeleton` forever — a request arrives at an arbitrary time and has to
return post URIs.

**But "alive" does not mean "storing."** See
`store-ours-rederive-theirs.md` for the governing principle: we store
what's ours (build requests, sites, interactions) and re-derive network data on
demand, caching where it helps. A feed generator is a *function*, evaluated per
request against the AppView, not a view over a private archive.

So the standing commitment is real but cheap: a Worker that answers a query. It
costs nothing when nobody subscribes, which matters a lot when most feeds a
tag-driven bot creates will be jokes nobody follows.

- Most feeds are expressible as an AppView query (`searchPosts`, an author list,
  a graph traversal). Those need no infrastructure beyond the skeleton endpoint.
- A feed that *cannot* be expressed that way — one that depends on global history
  the AppView doesn't index — is the exception, and needs a specific argument for
  its own storage. It should not be the default assumption.
- Feeds still need an **expiry / garbage collection** story, but for a different
  reason than cost: stale declaration records and dead feeds cluttering the
  ecosystem's directories. Same "expiry by default" instinct as the cron manager
  in `bot-ideas-riff.md`.

### 2. Who owns the thing

A page belongs to nobody in particular; a feed appears in someone's app under
some DID and shows up in the ecosystem's directories.

Open questions, all worth settling once:

- Does a created feed live under **`bisks.net`'s** identity, or the
  **requester's**? Under bisks.net, everything is Rob's reputation and Rob's
  problem. Under the requester's, they'd have to OAuth and grant write — more
  ceremony, but the feed is genuinely theirs and leaves with them.
- **Who can delete or edit it?** If a mutual's tag creates a feed, can another
  mutual's tag change it? This is the same scoping question as
  "customization by tagging" in `beyond-buildthis.md`, arriving from a different angle —
  worth one answer for both.
- **What if the classifier is wrong?** A bad feed is low-stakes (unsubscribe). A
  bad *label* is on someone else's post. Different tolerance, which is the main
  argument for feed-first.

The middle path that seems most natural: **created under bisks.net by default,
with the requester recorded as commissioner** (the corpus already has this
instinct — void.comind called angussoftware "executive producer"; buildthis
commits are tagged with the requester's handle). Offer requester-owned as an
opt-in later if anyone cares.

## What tagging it would look like

Riffing on the UX, since it can't just be buildthis's:

- `@thatbot a feed of posts containing a phrase nobody's ever posted` → registers
  the trigram filter, writes the generator record, replies with a
  subscribe link.
- `@thatbot a lexicon for <site>'s records` → reads the site's `createRecord`
  calls, writes the schema, serves it, adds the `_lexicon` DNS entry
  (per `pds-and-lexicons.md`, ten sites need exactly this).
- `@thatbot a list of everyone who's ever tagged buildthis` → a real
  `app.bsky.graph.list`, which is more useful than the `timeline/scene` page that
  currently does this.
- `@thatbot label bot-built sites` → the labeler path, gated on Rob having
  provisioned a key.

The reply is the interesting part: a **subscribe link**, not a URL to visit.
That's a genuinely different artifact from anything buildthis produces, and it
lands inside the Bluesky app rather than requiring a click out.

## Architecture sketch

Not a design, just the shape implied by the above. Note there is **no tailer and
no index** — an earlier draft of this note had one at the center, which was
wrong (see `store-ours-rederive-theirs.md`).

```
  the bot  ──writes──▶  declaration records   (feed generator / lexicon / list)
     │                  harness holds creds, per reply.mjs pattern
     │
     └──registers──▶  a feed definition  (query + ranking, stored as data)
                             │
                             ▼
                   getFeedSkeleton worker
                             │  evaluates on request
                             ▼
                      AppView queries  ──▶  post URIs  (+ short-lived cache)

  our own records (build requests, sites, outcomes) live in our repo,
  published as net.bisks.* — see `pds-and-lexicons.md`, `store-ours-rederive-theirs.md`
```

The only persistent state is **feed definitions** (small: a query, a ranking, an
owner) and **our own records**. Post data is re-derived per request.

Open architectural questions worth chewing on before building:

- **Feed definition format.** Needs to be data, not code, or every new feed is a
  deploy. Small predicate language, or a set of parameterized query types
  (by-author-set, by-search-term, by-graph-hop).
- **Caching.** A feed evaluated per request may be slow if it fans out to several
  AppView calls. A short TTL cache (minutes) is almost certainly enough and is
  very different from an archive.
- **Ranking without history.** Chronological is free. "Best of today" needs
  engagement numbers, which the AppView gives at fetch time — fine. Anything
  needing *change over time* is the case that would justify storage; treat it as
  the exception requiring its own argument.
- **The unique-trigram case.** The one genuinely history-dependent idea. Its
  honest version has always been bounded ("unique since page load"). Bounding it
  explicitly — "unique among what I can see right now" — keeps it in the
  re-derive model. Worth doing rather than building an archive for one feed.

## Where this leaves it

Sensible order, given everything:

1. **One feed generator, hand-built**, evaluated live against the AppView —
   something expressible as a query (the microsite scene, or buildthis's own
   output). Proves the whole path (did:web, declaration record, skeleton endpoint,
   subscribe link) before automating it.
2. **Then the bot**, whose job is to do step 1 on request. Much easier to
   automate a path already walked once by hand.
3. Lexicons in parallel — they need none of the above and there are ten sites
   waiting (`pds-and-lexicons.md`).
4. Labeler last, gated on the key and on the classifier having proven itself as a
   feed.

The reassuring thing: nothing here is exotic. It's a JSON endpoint, some records,
and queries against an API the repo already calls from a hundred sites. What's
new is that the output keeps *answering* — but it doesn't keep *accumulating*,
which is the part that would have made it expensive.
