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

## Durable Object Retirement: current state

**No site config in this repo binds a Durable Object.** The migration to
frontend and KV state is complete in code. What remains is deployment and
cleanup of leftover namespaces on Cloudflare.

As of 2026-08-21 there are **36 Durable Object namespaces** still present on the
account. All of them are orphans in the sense that matters: no `wrangler.toml`
declares a `[[durable_objects]]` binding for any of them. They persist because
deleting a namespace is a separate step from removing its binding.

They fall into two groups:

**No Worker at all (17).** These sites are assets-only — no `main` in their
config, no `src/`. Their namespaces are unreachable and idle. Deleting them
needs no code change, only the API call below.

`bangerwatch`, `bigwalk`, `docmoot`, `gridlock`, `hivemind`, `intrigue`,
`likescore`, `meadowecho`, `mootrider`, `netris`, `peakposting`, `runnerup`,
`still2016`, `thewall`, `thrashmeter`, `trigruessr`, `whopressedit`

**Worker present, but it no longer binds a DO (18).** The Worker serves assets
or uses KV. Same cleanup, but check the deployed version first — see the
deploy-drift warning below. `crossbreed` accounts for two namespaces
(`WireHub` and `Hatchery`), which is why 35 sites hold 36 namespaces.

`avcart`, `constraintfund`, `crossbreed`, `curtaintwitcher`, `derivatives`,
`dontpressit`, `eastmoot`, `footfall`, `guestbet`, `hyperobject`, `loverob`,
`nothingness`, `obelisk`, `presspool`, `simcluster-guests`, `skeetin`,
`the-place`, `westmoot`

### Deploy drift is the thing to watch

A namespace can keep billing long after its binding leaves the repo, because
**Cloudflare runs the last deployed build, not what is on `main`.** On
2026-08-21 eight sites — `ideahose`, `vibepantheon`, `mootstream`, `didrank`,
`ratioed`, `quotehof`, `thrashradar`, `karmahose` — were still running
firehose-consuming tracker code from a build that predated the refactor that
removed it. Their DOs were pinned awake 100% of the time, roughly 25 GB-s per
hour continuously. Redeploying and deleting the namespaces dropped account DO
compute by about 96%.

Two sites still showed activity afterward: `dontpressit` serves a DO-backed
`/api/state` from an old build, and `presspool` polls that endpoint every 15
seconds. Both have current source with no DO reference. They are the same
undeployed-refactor pattern and are the next thing to fix.

Before assuming a site is clean, compare what is live against the repo:

```
curl -s https://<name>.bisks.net/ | md5     # vs md5 of public/index.html
curl -s -o /dev/null -w "%{http_code}" https://<name>.bisks.net/api/<route>
```

A 200 on an API route that no longer exists in `public/` means the old build is
still serving.

### Deleting a namespace

Migrations with `deleted_classes` only run for a Worker that has a `main`. For
an assets-only site, `wrangler deploy` skips migrations entirely and the
namespace survives, so delete it directly:

```
curl -X DELETE \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/workers/durable_objects/namespaces/$ID" \
  -H "Authorization: Bearer $TOKEN"
```

The API refuses while any deployed Worker still binds the namespace, and names
the Worker and binding in the error. That error is the reliable way to find
which site a namespace belongs to — the namespace list paginates at 20 by
default, so pass `?per_page=200` or it will look shorter than it is.

Deleting destroys the stored data. For these sites that is the intent: the
frontend-first rewrites rebuild their state in the browser.

Leave the `[[migrations]]` blocks in `wrangler.toml` alone. They are inert once
the namespace is gone, and they are Cloudflare's migration ledger.

### Patterns that do not justify a Durable Object

These are usually KV candidates once their semantics are explicitly
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

`watchtower` checks that sites respond, not that the deployed build matches the
repo. It would not have caught the drift described above.

The retired `footfall` beacon no longer writes to its global `FootBoard`, and
its namespace is among the 36 awaiting cleanup. Its historical data remains
only until an explicit data-retention decision is made. Three sites —
`mootroast`, `singlebullet`, `beanjar2` — still reference
`footfall.bisks.net/beacon.js`, which now 404s; those embeds are dead weight
and can be removed.
