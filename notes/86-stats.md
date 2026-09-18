# stats — per-site traffic for the fleet

`sites/stats` is a hidden infrastructure site at `stats.bisks.net`. It reads
request counts for every Worker on the account from Cloudflare's GraphQL
Analytics API on an hourly cron, keeps them in KV, and serves them CORS-open
so any site can show its own traffic with one fetch and no secret.

## Endpoints

- `/stats.json` — every site, last 30 days: per-day `requests` and `errors`,
  plus `total` (30 days) and `total7` (7 days). `days` is oldest first.
- `/stats/<name>.json` — one site, same fields.
- `/refresh` — run the cron body now. Unauthenticated; it only reads.
- `/` — a table of the fleet by 7-day requests with a sparkline each.

From a site:

```js
const r = await fetch("https://stats.bisks.net/stats/<name>.json").then((r) => r.json());
// r.days, r.requests, r.errors, r.total7, r.total
```

## Showing it on a site

`sites/didscope/public/lib/visits.js` is the copyable snippet (same file in
`sites/rateyourbuild`). Copy it into `public/lib/` and add one line before
`</body>`:

```html
<script src="lib/visits.js" data-site="<name>" data-into="footer"></script>
```

It appends `· N visits this week` and a 7-day sparkline to the target element,
drawn as flex-box bars that inherit the surrounding text color — the same
approach the table on `/` uses. If the fetch fails or the site has no data, it
adds nothing.

The week figure is `total7`, which equals the sum of the last 7 entries of
`requests`. The final bar is usually short: the last day is the current UTC
day, still accumulating.

## What the numbers are

Cloudflare's request total for the site's Worker: every request the Worker
answered, assets and API calls alike, bots and crawlers included. It is not
unique visitors and not pageviews. A site that serves a firehose proxy or
polls itself will dwarf the rest (spoonternet did 1.2M requests in the week
this was built, next highest was 37k).

The site name is the script name minus the `atprotozoa-` prefix, so it
matches `sites/<name>`. Scripts outside that prefix appear under their raw
name.

## Storage

KV, all rebuildable from the API:

- `day:<YYYY-MM-DD>` → `{ name: { requests, errors } }` for that UTC day.
  Past days are fetched once and kept for 400 days; today is re-fetched every
  tick because it is still accumulating.
- `stats:all` → the rolled-up document the endpoints serve.

Cloudflare's own retention on `workersInvocationsAdaptive` is short (days to
weeks depending on plan), so history older than that exists only if this
Worker fetched it while it was available. A cold start backfills whatever the
API still has and lists the rest under `missing`.

## Why one query per day

The dataset returns one row per script per day. Seven days across ~660
scripts overran a 2000-row page during the prototype, so the Worker asks for
one day at a time (`filter: { date }`, limit 5000). A cold start is ~31
queries in one invocation, well under the subrequest cap; a warm tick is one.

## The token

`CF_ANALYTICS_TOKEN` is a Worker secret: a Cloudflare API token with
`Account Analytics: Read` and nothing else. Rob mints it; the builder never
holds it, which is the reason this is a Worker rather than a fetch from each
site. Set it with `wrangler secret put CF_ANALYTICS_TOKEN` from
`sites/stats/`, then hit `/refresh` once rather than waiting for the hour.
