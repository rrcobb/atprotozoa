# Backend Exceptions

The default site has no backend state. Browser state stays in `public/`, live
atproto data comes from browser-side Jetstream or AppView requests, and durable
user-owned results go to atproto records.

The entries below are the current manually curated exceptions. Adding a new
entry requires naming the invariant that cannot be enforced in the browser,
the backend surface allowed, and the condition that lets it scale to zero.

## Provisionally Allowed

| Site | Class | Reason | Allowed surface | Run condition |
| --- | --- | --- | --- | --- |
| `gridlock` | `Jam` | Live presence and room broadcast | One DO per room with a hibernatable WebSocket | Only while a room has connected editors |
| `netris` | `Match` | Live multiplayer match coordination | One DO per room with a hibernatable WebSocket | Only while a match is active |
| `revolver` | `Round` | Server-authoritative commit-reveal game state | One DO per round with a hibernatable WebSocket | Only for active or recently resolved rounds |

These are exceptions for coordination, not a general license to put site data
in a Durable Object. Their current standard WebSocket handlers still need a
separate hibernation pass.

## Temporary Exception

| Site | Class | Reason | Exit path |
| --- | --- | --- | --- |
| `likescore` | `LikeScoreEngine` | Server-side graph expansion and SQLite-backed scoring are not a practical browser-only operation | Move the graph/scoring workload to a deliberately chosen database or remove the feature; do not add alarms or more DOs |
| `griftmax` | `AscensionEngine` | Atomic rank assignment and duplicate-record verification for the deliberately shared ascension counter | Keep only the rare `/api/ascend` path; the live pulse now runs in the browser. Move ranking to atproto/KV or remove the counter before treating this as permanent |

## Infrastructure, Not Site State

`buildthis`'s KV queue, scheduled watcher, and Workers AI calls are bot
infrastructure. `watchtower` is an infrastructure monitor. They are reviewed
separately from the experiment sites and are not a reason for new site Workers
to use backend state.

## Retirement Queue

Every other Durable Object binding is a migration or retirement candidate. In
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
