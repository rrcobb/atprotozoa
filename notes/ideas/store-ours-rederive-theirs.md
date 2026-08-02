# Store what's ours, re-derive the rest

A design principle, settled 2026-07-31. It supersedes a "build a persistent
firehose index" thread that ran through notes 83, 84, 86, and 87 — that was
wrong, and those notes are corrected.

## The rule

**Store and publish what's ours. Don't store the network's data — re-derive it
on demand, and cache if it helps.**

Ours:

- build requests to the bot, and their outcomes
- the sites, their metadata, what got built and when
- interactions with our own stuff (ratings, boards, verdicts — the
  `net.bisks.*` records sites already write)
- our own posts and replies

Not ours:

- the firehose
- other people's posts, likes, follows, graph
- anything the AppView already indexes and will answer a query about

For "not ours," the AppView *is* the database. Querying it per request is the
normal path, not a fallback.

## Why

**It matches how everything here already works.** A hundred-odd sites query
`public.api.bsky.app` live on page load and hold nothing. That's not a
limitation they're working around — it's why they're free, why they can't drift
out of sync, and why deleting a site directory fully deletes the site. Standing
storage of other people's data would be the first thing in the repo that
violates all three.

**Cost only accrues when something is used.** A Worker that answers a query costs
nothing idle. A tailer costs the same whether a feed has 10,000 subscribers or
zero — and for a tag-driven bot, most created feeds will be jokes nobody follows.
Paying continuously for those is backwards.

**It avoids owning a copy of other people's data.** Deletes propagate on the
firehose, and honoring them in a private archive is work. Re-deriving means a
deleted post is simply gone from the next query. Same for blocks and takedowns.
Not having the archive is the cheapest way to be correct.

**The scale argues for it too.** Measured live off Jetstream, 90-second sample,
2026-07-31 (order of magnitude, not a budget — expect 2–3x diurnal swing):

| stream | rate | per day |
| --- | --- | --- |
| posts + likes + reposts + follows | 463 events/s | 40M events, **22 GB** raw |
| likes alone | 324/s | 28M — ~70% of all events |
| posts only | 49/s | 4.3M posts, **3.7 GB** raw |
| post *text* only | — | **0.4 GB** (avg post: 879 B raw, 94 chars of text) |

Even the cheap end is ~150 GB/year for text alone, to hold a worse copy of
something the AppView already serves.

## What this rules in and out

**Ruled out:** a Jetstream tailer writing a durable index as shared
infrastructure; feeds backed by a private post archive; "we need history first"
as a prerequisite for anything.

**Ruled in:**

- **Feed generators as pure functions.** `getFeedSkeleton` evaluates a query per
  request. Most feed ideas are expressible this way: an author set, a search
  term, a graph hop. See `protocol-object-bot.md`.
- **Short-lived caching.** Minutes, to avoid hammering the AppView on a popular
  feed. A cache you can drop at any time without losing anything is categorically
  different from an archive.
- **Storing our own records properly.** This is the part that *should* grow —
  write the ten missing lexicons, publish them, and use
  `listReposByCollection` to get aggregate views of records our own sites wrote
  (`pds-and-lexicons.md`). That data is genuinely ours to hold, and nobody else has it.
- **Small derived state where it's clearly ours.** The buildthis queue, build
  outcomes, health status. Already exists, already fine.

**On the supposed exception (unique trigrams).** An earlier draft of this note
called this the one idea that might justify an archive, since "nobody has ever
posted this phrase" is a claim about global history. That was wrong too — the
problem is already solved in `sites/trigrams/public/lib/unique.js`, using
minormobius's algorithm (credited in the file header). Two phases:

1. **`scan()`** — download the actor's whole repo as one CAR, tally n-grams, keep
   only those used **exactly once**. The insight that makes it cheap: a phrase
   you repeated is already ≥2 uses network-wide, so it can't be globally unique.
   A free local filter that cuts thousands of candidates to a handful, no network
   calls.
2. **`verify()`** — check only the survivors against `searchPosts`, ordered by an
   interest score so a capped budget goes to the most promising first.

So even the hardest case re-derives rather than stores. **There is currently no
idea on the table that needs a network archive.**

(Side finding recorded in the file: `api.bsky.app` serves `searchPosts`
unauthenticated where `public.api.bsky.app` 403s — but under burst load it
soft-403s anyway, which was undercounting uniques ~8x, hence the authed proxy.
Both 403 and 429 must be retried with backoff; only other 4xx are real errors.)

## Caching: the actual gap in trigrams

Re-deriving is the right default, but `unique.js` currently re-derives *too*
much — it has **no client-side cache at all**. Re-run the same handle and it
re-downloads the CAR and re-verifies every candidate from scratch. The only
caching anywhere is the search proxy's `max-age=300`
(`sites/trigrams/src/index.ts`) and its module-level token cache.
`public/market/index.html` does cache results in `localStorage` with a
timestamp, so the pattern exists in the codebase — just not where the expensive
work is.

Verify is where the cost sits: up to `SCAN_CAP` 8,000 candidates, 6-wide
fan-out, with retry/backoff on soft-403s.

**Verdicts are unusually cacheable, because they're near-monotonic:** a phrase
can only become *less* unique over time, never more. So:

- a cached **"common"** verdict is permanently valid — never recheck
- a cached **"unique"** verdict can go stale in only one direction, so an
  occasional recheck (or a TTL of days) is plenty
- the scan phase is deterministic given the repo, so it can be keyed on the
  actor's latest post rkey/cursor and skipped entirely when nothing new was
  posted

Roughly: a `localStorage` map of `trigram -> {status, at}`, shared across
`/`, `/tagged`, `/waluigi`, `/quiver`. Small change, and repeat runs get
dramatically cheaper. Not done yet — noted 2026-07-31.

## How to apply it

When an idea seems to need stored network data, ask in order:

1. Can the AppView answer this directly? (`searchPosts`, `getAuthorFeed`,
   `getLikes`, `listReposByCollection`) → do that.
2. Can it be computed from a small seed set fetched live? → do that.
3. Does it only need *our* records? → store those properly, that's the good case.
4. Does it truly need global history? → state the bound and ship the honest
   version. Only build storage if the bounded version is genuinely useless, and
   scope the storage to that one feature.

Most things stop at 1 or 2.

## Correction record

I (Claude) generalized from one hard case (unique trigrams) to "everything needs
a persistent index," repeated it across four notes until it read as a finding,
then measured firehose volume to size infrastructure for a requirement that
mostly didn't exist. Rob pushed back; the pushback was right. Notes 83, 84, 86,
and 87 have been corrected.

Then, on the one case I'd still held out as a genuine exception, Rob pointed at
mino's two-phase approach — and reading `unique.js` showed it was already
implemented here, and had been all along. So the exception wasn't one either.

Two things worth remembering:

- A claim repeated across several documents by the same author is not
  corroborated, it's just repeated.
- **Read the code before theorizing about the problem.** The answer to "does
  this need stored history" was sitting in a file in this repo, with a comment
  explaining the algorithm, the whole time.
