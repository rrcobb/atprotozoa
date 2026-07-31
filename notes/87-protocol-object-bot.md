# A bot that makes protocol objects

Extending the brainstorm. The idea: **buildthis makes pages; a sibling bot makes
protocol objects.** Tag it, and instead of a website you get a feed generator, a
labeler, a lexicon, a list — a thing that lives *in* atproto rather than a page
that reads it.

This reframes several earlier notes. `notes/82` and `notes/84` listed candidates
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
than `notes/81` implied — I had lumped feeds in with labelers, and they're not
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
`getFeedSkeleton` forever, and its answers are only good if a classifier has been
*running and storing* the whole time.

So this bot cannot emit-and-forget. Every feed it creates is a standing
commitment. Which means:

- It needs **something already running** to attach to — the persistent index that
  `notes/83`, `84`, `85`, and `86` all independently arrived at. This is now the
  fifth direction pointing at it. It's the actual prerequisite.
- The right division of labor: **the bot writes the declaration and registers a
  filter against a shared index; it does not stand up new infrastructure per
  request.** One tailer, many feeds reading off it. That keeps each new feed
  cheap (a row, a filter) rather than a new deployment.
- Feeds need an **expiry / garbage collection** story. An unfollowed feed created
  by a passing joke shouldn't run forever. Same "expiry by default" instinct as
  the cron manager in `notes/84`.

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
  "customization by tagging" in `notes/81`, arriving from a different angle —
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
  (per `notes/85`, ten sites need exactly this).
- `@thatbot a list of everyone who's ever tagged buildthis` → a real
  `app.bsky.graph.list`, which is more useful than the `timeline/scene` page that
  currently does this.
- `@thatbot label bot-built sites` → the labeler path, gated on Rob having
  provisioned a key.

The reply is the interesting part: a **subscribe link**, not a URL to visit.
That's a genuinely different artifact from anything buildthis produces, and it
lands inside the Bluesky app rather than requiring a click out.

## Architecture sketch

Not a design, just the shape implied by the above:

```
Jetstream tailer (one, always on)
        │  writes to
        ▼
  durable index  ──────────────┐
        │                      │
        │ filters registered   │ aggregate queries
        ▼                      ▼
 getFeedSkeleton worker    dataset / digest / observer bots
        │
        │ declarations written by
        ▼
  the bot (harness holds creds, per reply.mjs pattern)
```

Everything except the tailer is cheap per-item. The tailer is the one standing
cost, and it's shared by every direction in notes 83–86.

Open architectural questions worth chewing on before building:

- **Storage shape.** D1 (SQL, queryable, good for "posts matching X since Y") vs
  Durable Objects (already used in 15 sites) vs R2 for bulk. Feeds want cursor
  pagination over time-ordered data, which points at SQL.
- **Retention.** Full firehose is a lot; a filtered tail (only posts matching any
  registered filter) is much cheaper and probably sufficient. But then a new feed
  has no history on day one — acceptable? Probably yes.
- **Filter expression.** A registered filter needs to be data, not code, or every
  new feed is a deploy. Simple predicate language, or a small set of
  parameterized filter types.
- **Backfill.** Ties to retention — does a new feed start empty or reach back?

## Where this leaves it

Sensible order, given everything:

1. **Jetstream tailer → durable index.** Fifth note in a row to land here. It's
   the prerequisite for this bot *and* the dataset, digest, and observer ideas.
   Build it once, deliberately.
2. **One feed generator, hand-built**, off that index — probably unique trigrams.
   Proves the whole path (did:web, declaration record, skeleton endpoint,
   subscribe link) before automating it.
3. **Then the bot**, whose job is to do step 2 on request. Much easier to
   automate a path already walked once by hand.
4. Lexicons in parallel — they need none of the above and there are ten sites
   waiting (`notes/85`).
5. Labeler last, gated on the key and on the classifier having proven itself as a
   feed.

The reassuring thing: nothing here is exotic. It's a websocket reader, a
database, a JSON endpoint, and some records — all things this repo already does
in pieces. What's new is that the output keeps running, which is a discipline
question more than a technical one.
