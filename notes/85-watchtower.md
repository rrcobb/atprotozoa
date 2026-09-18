# watchtower — the fleet verifier

`watchtower/` is a cron Worker that checks every site on the gallery from
outside the zone, remembers what it saw, and says so when something breaks.
It is the "verifier bot" from `notes/ideas/other-bots.md`: silent when things
work, reply in the build thread when they don't.

Page and JSON: `https://atprotozoa-watchtower.rwcobbjr.workers.dev/`
(`/report.json`, `/alerts.json`, `/site/<name>.json`, `/check?name=<name>`).

## Why it lives off-zone

A Worker routed on `bisks.net` cannot probe `bisks.net`: every subrequest to a
sibling subdomain comes back 522 whether or not the site is up. So watchtower
has no route and is reachable only at its `workers.dev` hostname. Its fetches
leave and re-enter through the edge like an outside visitor's. Do not add a
route; it would silently reintroduce the blind spot. `sites/fleetwatch` is the
on-zone board and has this blind spot by construction, so a disagreement
between the two should be settled in watchtower's favor.

A checker on Rob's laptop has a different blind spot: it inherits whatever DNS
and gateway filtering the local network applies. blockcurve looked
TLS-broken from home on 2026-09-17 because Xfinity's Advanced Security was
intercepting that one hostname. Watchtower saw it fine. See
`notes/history/2026-07-buildthis-audit.md`.

## What one check is

Two fetches per site:

1. The root URL must serve 2xx. A connection-level failure (TLS, DNS, timeout)
   is reported as "root unreachable" with the error text, never coerced into a
   status code.
2. The first `.js` or `.css` the root HTML references must serve 2xx and must
   not come back as `text/html`. This is the check that matters: a Worker
   that strips a mount prefix unconditionally still serves `/` fine and serves
   `index.html` for every asset, so the page renders and nothing works. 134
   sites had that bug on 2026-07-31 and a status-only check called them all
   healthy.

The site list is scraped from the apex gallery, which is generated from
`sites/*/site.json`, so it cannot drift from the repo and hidden sites are
excluded.

## Cadence and budget

Workers Free allows 50 subrequests per invocation, so a tick does a slice, not
the fleet. Every 2 minutes:

| step | subrequests |
| --- | --- |
| gallery fetch | 1 |
| sites new to the gallery, checked first | counted against the slice |
| re-probes of suspect or broken sites, up to 4 | 8 |
| the next 16 sites of the full walk | 32 |
| queued Bluesky posts, up to 2 | 8 |

A full walk of ~660 sites takes about 85 minutes. A site that just appeared on
the gallery is probed on the next tick, so a fresh build is verified within
minutes of deploying. `/run` runs one tick on demand; `/check?name=x` checks
one site now and returns its state.

## State machine

Per-site state is in KV under `site:<name>`.

- **ok** → first failing probe → **suspect**. Re-probed on the next tick.
- **suspect** → passes → **ok**, nothing said. A deploy in progress or an edge
  blip never becomes an alert.
- **suspect** → fails again → **broken**. An alert is queued. Re-probed at
  most every 15 minutes, plus whenever the full walk reaches it.
- **broken** → passes → **ok**. A recovery is queued.

Alerts land in the log (`/alerts.json`, last 200) whether or not they get
posted; an unposted alert records why.

## Posting

**Live as of 2026-09-17.** `BOT_APP_PASSWORD` is set as a Worker secret, so
`/alerts.json` reports `posting: true` and alerts reach Bluesky. Verified by a
`watchtower-selftest` entry that posted a real recovery from
`buildthis.bisks.net`. To turn it off, delete the secret (`wrangler secret
delete BOT_APP_PASSWORD` from `watchtower/`); alerts then keep landing in the
log unposted. `BOT_IDENTIFIER` in `wrangler.toml` names the account:
buildthis (decided 2026-09-17). Every break post @-mentions @bisks.net so Rob
sees it; recoveries do not.

How it behaves:

- A confirmed break posts once. If `sites/<name>/.buildthis.json` names the
  tagging post, the alert is a reply in that thread, so the person who asked
  for the site sees it. Otherwise it is a top-level post.
- A recovery replies to the alert post with how long it was down.
- Hard cap of `MAX_POSTS_PER_DAY` (12) per UTC day. Past the cap, alerts are
  logged, not posted.
- More than 5 sites breaking in one tick is treated as a zone-wide event: one
  summary post, and those sites' recoveries are logged but not posted.
- No "all clear" posts, ever.

Post text is derived from the probe result only, never from site content, so a
page can't put words in the bot's mouth.

## What it does not do

- It does not know whether a 200 page renders correctly, only that its bytes
  are the right kind.
- It does not check the deployed build matches the repo. A stale deploy that
  still serves is healthy to watchtower. See `notes/11-durable-objects.md`
  under "Deploy drift".
- It does not check OG images or OAuth metadata. Both would fit the two-fetch
  budget if a site class starts breaking that way.

## Wired into the box build

After `box-build.sh`'s root poll confirms a site is serving, it calls
`/check?name=<builtName>` once and passes the returned `problems` to
`reply.mjs` as `ASSET_PROBLEMS`. A non-empty list demotes the reply from
"built it 🎉 / (it's live)" to "built it — heads up: it's up but not serving
right", in the same protected paragraph the stale and dead caveats use. The
list is also recorded on the outcome as `assetProblems`.

The root poll alone passes the failure that broke 110 sites at once — an asset
served as `text/html` — because the root itself was 200 throughout. This check
is the one that sees it.

Advisory, never blocking: a watchtower that's unreachable, slow, or that
doesn't know the site yet leaves `ASSET_PROBLEMS` empty, and the reply reads
exactly as it did before. It only runs on a verified root, since a stale or
dead URL is already worse news than a broken asset.

One call at reply time, not a second delayed one. The cron probes sites that
just appeared on the gallery first (above), so a fresh site is re-checked
within minutes regardless, and a real break posts its own in-thread alert. A
delayed second poll would hold the box open to duplicate that.
