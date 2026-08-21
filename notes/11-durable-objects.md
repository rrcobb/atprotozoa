# Backend Policy: No Durable Objects

**This repo does not use Durable Objects.** Not "avoids where possible" — the
migration off them is finished, in code and on the account. There is no standing
exception list, and this note is not a place to add one.

The default site starts in the frontend. Browser state stays in `public/`, live
atproto data comes from browser-side Jetstream or AppView requests, durable
user-owned results go to atproto records, and shared results go to KV.

## KV is the shared backend

KV is the server-side home for shared experiment state when occasional
staleness, duplicate writes, or last-write-wins behavior is harmless. This is
not a failure mode to hide; it is the intended tradeoff that makes a public
counter, board, event log, or snapshot useful across browsers without bringing
back a coordinator.

Reasonable KV uses include:

- Approximate counters, tallies, and best-effort leaderboards.
- Anonymous or shared event logs where a missed or duplicated event is fine.
- Derived AppView or Jetstream indexes that can be rebuilt.
- Read-mostly snapshots and cached outputs with a TTL or bounded size.
- Small queues where duplicate claims are harmless and the producer can retry.

Say plainly in the site or its config what may be stale, duplicated, or
overwritten. `sites/dontpressit` is the worked example: its shared round counter
is KV, and both the Worker and the `wrangler.toml` state that a simultaneous
double-press can collapse into a single advance.

Do not use KV as an authentication boundary or for money, exact balances,
first-writer claims, unique allocation, or another invariant where a race is a
real bug.

## When the feature seems to need exact coordination

Soften the semantics. Every case in this repo that looked like it needed a
Durable Object turned out to be a product question wearing an infrastructure
costume:

- A global leaderboard, counter, tally, or guestbook — best-effort is fine.
- A cached AppView response or derived firehose window — rebuildable.
- A derived Jetstream snapshot or materialized window — retryable producer.
- A site-wide analytics beacon or visit counter — approximate by nature.
- A game timer — derive it from the current time in the browser.
- A shared round or turn counter — KV, and accept that a simultaneous
  double-advance collapses into one.

If a genuinely new case appears where softening would make the feature
pointless, that is a conversation to have before writing the binding, not a
line to add to this note.

## Patterns that replaced the DOs

The migration mostly moved state in one of two directions, and it is worth
knowing which applies before rewriting a site:

- **Into the browser.** The site's state was never really shared — it just
  looked shared because it lived on a server. `dontpressit`'s button became
  browser-local this way: each browser plays its own sequence.
- **Into KV.** The state genuinely is shared, and best-effort is acceptable.
  `presspool` and `guestbet` are pari-mutuel markets that now keep pools, bets,
  and balances in a single KV key.

Watch for the case where a site does both, because the two sites can be
coupled. `dontpressit` went browser-local, but `presspool` bets on which
dontpressit round is live and polls `dontpressit.bisks.net/api/state` for it.
Making the button browser-local removed the shared round that presspool's whole
premise rests on. The fix was a small KV-backed shared round counter alongside
the browser-local button — not a DO, and not retiring the market.

One thing KV does not replace: a DO alarm. There is no background timer, so
state that used to advance on its own now advances on the next request. For
`presspool` that means a quiet market catches up when someone loads the page.

## Account cleanup

As of 2026-08-21 the account holds **zero** Durable Object namespaces. Keep it
that way.

Removing a `[[durable_objects]]` binding does not delete the namespace it
pointed at. Namespaces outlive their bindings and keep sitting on the account,
so the code being clean is only half the job — this repo sat at 36 orphaned
namespaces for weeks after the code was already DO-free.

`audit/cf-durable-objects.mjs` is the tool for this. There is no
`wrangler durable-objects namespace list`, which is why the state of the account
was previously invisible:

```
node audit/cf-durable-objects.mjs                  # inventory
node audit/cf-durable-objects.mjs --prune          # dry run
node audit/cf-durable-objects.mjs --prune --apply  # delete
```

It reuses the `wrangler login` session, so it needs no separate token. It
classifies every namespace against the bindings the repo actually declares —
`[[migrations]]` entries do not count as bindings, they are Cloudflare's
ledger — and deletes only the orphans. It pages the API explicitly, because the
namespace list defaults to 20 per page and made the account look far cleaner
than it was.

Deleting a namespace destroys its stored data. That is the intent here: the
rewrites rebuild their state in the browser or in KV.

### Assets-only sites need a temporary Worker

`wrangler deploy` skips `[[migrations]]` entirely when a config has no `main`.
An assets-only site whose *deployed* Worker still binds a DO is therefore stuck:
the repo has the right `deleted_classes` tag, but nothing ever applies it, so
Cloudflare keeps refusing to delete the namespace.

The way out is to give the site a temporary no-op Worker, deploy once so the
migration runs, then put the config back:

```
# add to wrangler.toml:  main = "src/index.ts"  and  binding = "ASSETS" under [assets]
# src/index.ts:
export default { fetch(request, env) { return env.ASSETS.fetch(request); } };
wrangler deploy
git restore wrangler.toml && rm -r src
```

Cloudflare deletes the namespace itself as the migration applies — no separate
API call. Seven sites needed this: `bangerwatch`, `intrigue`, `meadowecho`,
`mootrider`, `peakposting`, `runnerup`, `thrashmeter`.

Leave the `[[migrations]]` blocks in `wrangler.toml` alone. They are inert once
the namespace is gone.

### Deploy drift is the thing to watch

A namespace can keep billing long after its binding leaves the repo, because
**Cloudflare runs the last deployed build, not what is on `main`.** In August
2026 eight sites — `ideahose`, `vibepantheon`, `mootstream`, `didrank`,
`ratioed`, `quotehof`, `thrashradar`, `karmahose` — were still running
firehose-consuming tracker code from a build predating the refactor that removed
it. Their DOs were pinned awake continuously, roughly 25 GB-s per hour.
Redeploying and deleting the namespaces dropped account DO compute by about 96%.

`dontpressit` was the last instance of this pattern, and the most confusing
one, because its stale build was serving an API that another live site depended
on. A site whose source is clean is not necessarily deployed clean.

To check what is actually live:

```
curl -s https://<name>.bisks.net/ | md5     # vs md5 of public/index.html
curl -s -o /dev/null -w "%{http_code}" https://<name>.bisks.net/api/<route>
```

A 200 on an API route that no longer exists in the source means the old build is
still serving.

The prune tool surfaces this on its own: Cloudflare refuses to delete a
namespace while a deployed Worker still binds it, and names the Worker and
binding in the error. A refusal means "redeploy that site, then re-run" — it is
the most reliable way to find drift.

`watchtower` checks that sites respond, not that the deployed build matches the
repo, so it would not catch this.

## Three things that bit us

**A migration tag is applied once.** Rewriting an existing `[[migrations]]` tag
in place is a silent no-op — Cloudflare skips a tag it has already applied. The
refactor that removed the DOs edited `v1` from `new_sqlite_classes` to
`deleted_classes` on five sites, so the deletion never ran and the deploy failed
with "New version of script does not export class X which is depended on by
existing Durable Objects." The deletion must go on a NEW tag, with the old one
left saying what it originally said. `audit/cf-durable-objects.mjs` now checks
for this.

**An on-zone Worker cannot fetch its own zone.** `presspool` polled
`https://dontpressit.bisks.net/api/state`; both are Workers on `bisks.net`, so
the subrequest came back 522 and the market sat permanently at
`sourceStale`. This is the same constraint that keeps `watchtower` off-zone.
Worker-to-Worker calls need a `[[services]]` binding, not a public URL.

**KV.put only accepts strings.** The DO-to-KV port kept passing plain objects to
`put()`, and each site's hand-written `KVNamespace` interface typed the value as
`unknown`, so it compiled and threw at runtime on every write. `presspool`,
`guestbet`, and `derivatives` all had it. The interface now says
`value: string`. If you copy a KV site, keep that type honest.

## Infrastructure, not site state

`buildthis`'s KV queue, scheduled watcher, and Workers AI calls are bot
infrastructure. `watchtower` is an infrastructure monitor. They are reviewed
separately from the experiment sites and are not a reason for a new site Worker
to reach for backend state.
