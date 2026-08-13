# Backend Exceptions

The default site has no backend state. Browser state stays in `public/`, live
atproto data comes from browser-side Jetstream or AppView requests, and durable
user-owned results go to atproto records.

There are no permanent or provisional exceptions. Existing Durable Object
sites are a finite retirement queue, including the formerly sanctioned
coordination and temporary-computation sites listed below:

| Sites | Former classes | Migration direction |
| --- | --- | --- |
| `gridlock`, `netris`, `revolver` | `Jam`, `Match`, `Round` / `Leaderboard` | Convert to browser-owned experiences, using user-authorized atproto records for durable/shareable results where useful, or retire the server-coordination feature |
| `likescore` | `LikeScoreEngine` | Move scanning and scoring into the browser; use public atproto data as input and optional user-owned records for durable results |
| `griftmax` | `AscensionEngine` | Move the pulse and ascension state into the browser and the user's PDS; remove the shared rank counter |

## Infrastructure, Not Site State

`buildthis`'s KV queue, scheduled watcher, and Workers AI calls are bot
infrastructure. `watchtower` is an infrastructure monitor. They are reviewed
separately from the experiment sites and are not a reason for new site Workers
to use backend state.

## Retirement Queue

Every Durable Object binding in an experiment site is a migration or retirement candidate. In
particular, these patterns are not exceptions:

- A global leaderboard, counter, tally, or guestbook.
- A cached AppView response or derived firehose window.
- A background Jetstream consumer kept alive by an alarm.
- A site-wide analytics beacon or visit counter.
- A game timer that can be derived from the current time in the browser.

The retired `footfall` beacon no longer writes to its global `FootBoard`. Its
old namespace and historical data remain only until an explicit data-retention
decision is made, after which the class can be deleted with a destructive
Durable Object migration.
