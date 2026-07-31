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
  term, a graph hop. See `notes/87`.
- **Short-lived caching.** Minutes, to avoid hammering the AppView on a popular
  feed. A cache you can drop at any time without losing anything is categorically
  different from an archive.
- **Storing our own records properly.** This is the part that *should* grow —
  write the ten missing lexicons, publish them, and use
  `listReposByCollection` to get aggregate views of records our own sites wrote
  (`notes/85`). That data is genuinely ours to hold, and nobody else has it.
- **Small derived state where it's clearly ours.** The buildthis queue, build
  outcomes, health status. Already exists, already fine.

**The honest exception:** a filter that depends on global history the AppView
doesn't index — "no one has ever posted this phrase." There is exactly one such
idea (unique trigrams), its shipped version has always been bounded ("unique
since page load"), and minormobius flagged that limit in-thread. The right move
is to state the bound rather than build an archive to remove it. If some future
idea genuinely needs history, that's an argument for *that idea*, made then, with
its own storage — not a shared platform built in advance.

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

I (Claude) generalized from the one hard case (unique trigrams) to "everything
needs a persistent index," repeated it across four notes until it read as a
finding, then measured firehose volume to size infrastructure for a requirement
that mostly didn't exist. Rob pushed back; the pushback was right. Notes 83, 84,
86, and 87 have been corrected. Worth remembering as a pattern: a claim repeated
across several documents by the same author is not corroborated, it's just
repeated.
