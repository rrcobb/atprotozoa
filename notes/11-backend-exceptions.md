# Backend Policy

The default site starts in the frontend. Browser state stays in `public/`, live
atproto data comes from browser-side Jetstream or AppView requests, durable
user-owned results go to atproto records, and low-stakes shared results may go
to KV.

KV is the preferred server-side home for shared experiment state when occasional
staleness, duplicate writes, or last-write-wins behavior is harmless. This is
not a failure mode to hide; it is the intended tradeoff that makes a public
counter, board, event log, or snapshot useful across browsers without bringing
back a heavyweight coordinator.

Reasonable KV uses include:

- Approximate counters, tallies, and best-effort leaderboards.
- Anonymous or shared event logs where a missed or duplicated event is fine.
- Derived AppView or Jetstream indexes that can be rebuilt.
- Read-mostly snapshots and cached outputs with a TTL or bounded size.
- Small queues where duplicate claims are harmless and the producer can retry.

Do not use KV as an authentication boundary or for money, exact balances,
first-writer claims, unique allocation, or another invariant where a race is a
real bug. If the feature needs that invariant, first ask whether the semantics
can be softened; only then consider a Durable Object exception.

## Durable Object Retirement Queue

Every existing Durable Object binding in an experiment site is a migration or
retirement candidate. Low-stakes global state should generally move to KV, not
be forced into browser-local storage just because KV is not perfectly atomic.
The formerly sanctioned coordination and temporary-computation sites remain in
the retirement queue:

| Sites | Former classes | Migration direction |
| --- | --- | --- |
| `gridlock`, `netris`, `revolver` | `Jam`, `Match`, `Round` / `Leaderboard` | Convert to browser-owned experiences, using user-authorized atproto records for durable/shareable results where useful, or retire the server-coordination feature |
| `likescore` | `LikeScoreEngine` | Move scanning and scoring into the browser; use public atproto data as input and optional user-owned records for durable results |
| `griftmax` | `AscensionEngine` | Move the pulse and ascension state into the browser and the user's PDS; remove the shared rank counter |

In particular, these patterns are not reasons to keep a Durable Object; they
are often good KV candidates after their semantics are made explicitly
best-effort:

- A global leaderboard, counter, tally, or guestbook.
- A cached AppView response or derived firehose window.
- A derived Jetstream snapshot or materialized window populated by a retryable producer.
- A site-wide analytics beacon or visit counter.
- A game timer that can be derived from the current time in the browser.

## Infrastructure, Not Site State

`buildthis`'s KV queue, scheduled watcher, and Workers AI calls are bot
infrastructure. `watchtower` is an infrastructure monitor. They are reviewed
separately from the experiment sites and are not a reason for new site Workers
to use backend state.

The retired `footfall` beacon no longer writes to its global `FootBoard`. Its
old namespace and historical data remain only until an explicit data-retention
decision is made, after which the class can be deleted with a destructive
Durable Object migration.
