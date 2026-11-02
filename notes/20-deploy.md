# Deploy

Push to `main` → every site that changed re-deploys to Cloudflare. No manual
`wrangler deploy` in the normal loop.

## Mechanism

`.github/workflows/deploy.yml` runs on push to `main`: it diffs the
`last-deployed` tag against `github.sha` to find changed `sites/*` and `apex/`
directories, and runs `wrangler deploy` in each. When `check`, `changes` and
every deploy chunk succeed, a final `mark-deployed` job moves the tag to the
pushed commit.

Diffing from the tag, rather than from the push's own `before`, means a run that
fails or gets dropped doesn't strand its dirs: the tag stays put, so the next
run covers them too. Before 2026-10-06 it diffed from `before`, and a dropped
run's sites stayed on their old build until someone touched them again. The
last time it happened, GitHub cancelled the `changes` job after failing to find
a hosted runner for 15 minutes, and the buildthis Worker kept its old
daily-slot brief. If the tag is missing, the workflow falls back to `before`.

A tag rather than the Actions API's "latest successful run": the API returned a
run from two weeks earlier on the first query from a fresh context, both
locally and in CI, and one run redeployed ~250 sites because of it.

One side effect: while deploys keep failing (one site that always fails to
deploy, say), every push redeploys everything changed since the last green run,
so the set grows until the failure is fixed.

The deploy matrix is **chunked (~100 dirs per job, each job loops its chunk)**
because GitHub caps a matrix at 256 jobs — a flat one-job-per-dir matrix made
every `workflow_dispatch` `deploy_all` run fail at expansion (the run dies with
no failed-job logs, just a red X; 2026-08-13, when the site count passed 256).
`deploy_all` is the catch-up path for "a push's deploy was skipped and later
pushes never covered those dirs" — e.g. the 2026-08-13 gallery-drift outage.

The diff spans every commit in a push, not just the tip. But `gh run list` shows
a run by its *tip commit's* message, so a push whose last commit only touches
`notes/` looks like a notes-only deploy even when the same run is deploying a
dozen sites underneath. Check the job list (`gh run view <id> --json jobs`)
rather than the run title, and wait for `status=completed` before concluding a
site is serving stale code.

CI authenticates with `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (repo
secrets). Local deploys use the interactive `wrangler login` session instead.

## Local deploy

From a site directory:

```
pnpm dlx wrangler deploy          # deploy this site
pnpm dlx wrangler dev             # run locally at localhost:8787
```

If `wrangler whoami` errors with an expired token, re-run `wrangler login` in an
interactive terminal (in a Claude Code session, type
`! npx --yes wrangler@latest login` so the browser opens).

**Keep the local wrangler in step with CI.** CI runs `pnpm dlx wrangler deploy`,
which always fetches the latest; the repo pins a version in `package.json`. When
those drift, a deploy can fail locally and succeed in CI. See the next section.

## The 500-Worker cap

Cloudflare's Workers Paid plan allows 500 Workers per account. Until November
2026 this repo was one Worker per site, and the account reached **799 Workers on
2026-11-02, 299 over the cap.**

Over the cap, existing Workers keep serving and redeploying. **Creating** a
Worker that does not exist yet fails:

```
A request to the Cloudflare API (/accounts/…/workers/scripts/atprotozoa-<name>/assets-upload-session) failed.
  You have exceeded the limit of 500 Workers on your account. [code: 10037]
```

The account passed 500 on 2026-08-20 and kept creating Workers for two more
months, because newer wrangler created scripts through the Workers Assets upload
path, which skipped the check (4.134.0 succeeded where 4.114.0 got 10037, same
credentials, 2026-09-17). That stopped between 2026-10-29 (strandbeest, the last
new Worker) and 2026-10-31: since then wrangler 4.134.0 and 4.156.1 both get
10037 on that same assets-upload path. Nine new sites piled up undeployed before
anyone noticed.

A limit increase was requested on 2026-09-17 via the
[Limit Increase Request Form](https://forms.gle/eX6pXvit1wBv77Yw5). Cloudflare
never answered, and its limits page now points accounts that want more than 500
Workers at Workers for Platforms instead. The fix taken was to stop giving every
site a Worker: see [Hosted sites](#hosted-sites). Moving 592 sites onto
fallback on 2026-11-02 brought the account to **216 Workers**.

New sites default to hosted, but nothing enforces it: a site that gets a
`wrangler.toml` it doesn't need still deploys and works, and costs a slot.
That's deliberate — a builder mistake should cost a slot, not a broken site.
When the count gets close to 500 again, rerun the sweep: `migrate-to-host.mjs
--all`, then `cf-cutover.mjs --routes` and `--workers`.

Assets-only sites (`wrangler.toml` with no `main`) still count as Workers, so
dropping `main` frees nothing. Only removing the Worker does.

### The error often does not name the cap

`wrangler kv namespace create` has reported a bare
`Authentication error [code: 10000]` and then succeeded on a plain retry — which
sends you looking at auth, tokens, and logins for an hour. The Cloudflare
account API returns the same misleading 10000 for scope problems. Treat a bare
10000 during a *new site* setup as a possible cap symptom.

### Where this actually sits

`node audit/cf-workers.mjs` inventories the account against the cap, classifies
every Worker against the repo, and flags routes left behind by a deleted Worker
(routes are a zone resource, so they can strand the way DO namespaces did). A
Worker whose site is now hosted shows as HOSTED; those are the ones that are
safe to delete, via `audit/cf-cutover.mjs`.

## Hosted sites

Most sites never needed a Worker of their own: theirs only handed every request
to the `ASSETS` binding, sometimes after stripping a path-era mount prefix. On
2026-11-02, 592 of the 803 site Workers were that, or had no Worker code at all.
Those sites are now **hosted**: they have no `wrangler.toml`, and four shared
host Workers serve them, behind `fallback`.

- **A hosted site is `sites/<name>/` with `public/` and no `wrangler.toml`.**
  It still has its own `site.json`, its own `<name>.bisks.net` hostname, and so
  its own origin, cookies and localStorage. OAuth works as before.
- **`fallback/sites.json` lists them**, each with a `group` (which host serves
  it) and two optional settings: `prefix` (the old mount prefix to strip, for
  migrated path-era sites) and `spa`
  (`not_found_handling = "single-page-application"`).
- **`hosts/<n>/` is the host Worker `atprotozoa-host-<n>`** for group n. All
  four share `hosts/src/index.ts` and `hosts/build.mjs`; each `wrangler.toml`
  sets `GROUP` and runs `node ../build.mjs <n>` as its `[build]` command, which
  copies the group's sites' `public/` into `hosts/<n>/.build/<name>/`. The
  Worker maps `<name>.bisks.net/<path>` to `/<name>/<path>`, takes the `/<name>`
  back off the asset router's redirects, and answers 404 for any site outside
  its group. Responses carry `x-bisks-host: fallback` and `x-bisks-group`.
- **`fallback` routes.** It holds `*.bisks.net/*`, looks the hostname up in
  `fallback/sites.json`, and passes the request unchanged to `HOST_<group>`, a
  service binding. Anything else gets the "nothing here" page.
  `https://fallback.bisks.net/hosted.json` lists the sites the deployed version
  routes. Explicit routes beat the wildcard, so sites with their own Worker
  never reach it.

The groups exist so a push redeploys one host, not every hosted site, and a bad
host deploy reaches only its 148 or so sites. New sites go to the smallest
group. To add a group, deploy `hosts/<n+1>/` first, then add its binding to
`fallback/wrangler.toml`; a binding to a Worker that doesn't exist yet fails the
fallback deploy.

`run_worker_first = true` on each host is load-bearing. `.build/` holds a whole
group side by side; without it the asset router would serve
`a.bisks.net/b/index.html` (site b's page, on site a's origin) before the
Worker's hostname check ran.

To run a hosted site locally, run its host directly:
`pnpm dlx wrangler dev --cwd hosts/<group> --host <name>.bisks.net`. `--host`
matters: local dev otherwise rewrites every request to `bisks.net`. Use
`--cwd`, not `-c`: with `-c` the build command runs from the repo root and
can't find `../build.mjs`.

### Keeping it in sync

- `node audit/hosted-sites.mjs` checks that `fallback/sites.json` lists exactly
  the site directories with no `wrangler.toml`, each with a group that has a
  `hosts/<group>/`, and that each has `public/index.html` and no `src/` (code in
  a hosted site would never run). It runs in `deploy.yml`'s `check` job.
  `--apply` adds new hosted sites to the smallest group and drops gone ones;
  `box-build.sh` runs it before every build push, the same as the gallery.
- `deploy.yml` maps a change under a hosted site to its group's host, so
  editing `sites/<name>/public/` redeploys one host. A change to
  `fallback/sites.json` or the shared host code redeploys all four (and
  fallback, for the manifest).

### Moving a site onto fallback

1. `node audit/migrate-to-host.mjs` classifies every site with a
   `wrangler.toml`. A site is eligible only when fallback reproduces what its
   Worker does: a standard `wrangler.toml` (one `<name>.bisks.net/*` route,
   assets from `./public`, no bindings, vars, crons or live Durable Object
   classes), Worker code that only passes requests to `ASSETS` or strips a
   mount prefix, and no `_headers` / `_redirects`. `--list` gives the reason
   for each site it keeps.
2. `node audit/migrate-to-host.mjs --apply <names>` (or `--all`) deletes the
   site's `wrangler.toml` and `src/` and records it in `fallback/sites.json`.
   Run `node audit/hosted-sites.mjs --apply` to give each a group, and push;
   CI deploys the hosts and fallback with the site in them.
3. The old Worker still holds the site's explicit route and keeps serving. Once
   fallback has deployed with the site (`hosted.json` lists it),
   `node audit/cf-cutover.mjs --routes` removes each such route, waits for
   fallback to answer, and compares status and body hash of `/` against the old
   Worker. On a mismatch it puts the route back.
4. `node audit/cf-cutover.mjs --workers` then deletes the old Workers, which no
   longer have routes. This is the step that frees cap. It skips any Worker
   that still holds a Custom Domain (29 of the migrated sites did): deleting
   the Worker takes the Custom Domain's DNS record and certificate with it, so
   those go one at a time with `--domain <hostname>`, which reports whether the
   hostname still answers afterwards.

Run `node audit/cf-cutover.mjs` with no flag to see what each step would touch.
Edits pushed to a migrated site between steps 2 and 3 deploy to fallback but
aren't visible until the cutover, since the old Worker is still answering.

## Routes

A site claims its hostname with a plain route, not a Custom Domain:

```toml
routes = [{ pattern = "<name>.bisks.net/*", zone_name = "bisks.net" }]
```

Custom Domains cap at **100 per zone**; routes cap at **1000**. The zone hit the
custom-domain cap in July 2026 — new subdomains silently failed to provision
(the Worker deployed fine, the DNS record never appeared) until 64 stale
hostnames were pruned. `audit/cf-custom-domains.mjs` inventories and prunes
them. Use `custom_domain = true` only for the apex.

Two things that make the cap hard to diagnose:

- **Migrating a site's `routes` off `custom_domain` does not deprovision the
  hostname.** It keeps resolving and keeps occupying a slot, so an in-repo
  `grep` for `custom_domain` undercounts what Cloudflare actually holds. Only
  the API or dashboard gives the real number.
- **Wildcard Custom Domains don't exist.** Custom Domains require an exact
  hostname. Wildcards are a route feature, and a wildcard route needs a proxied
  wildcard DNS record plus Advanced Certificate Manager for certs — Universal
  SSL won't issue `*.bisks.net`.

**A wildcard route shadows a Custom Domain.** Deploying `*.bisks.net/*` while
sites were still on `custom_domain = true` took one down within seconds. An
explicit `<name>.bisks.net/*` route is unaffected — a more specific route wins,
but a Custom Domain does not.

### The route cap

The zone reached 1000 routes on 2026-09-25. Past that point, deploying a
brand-new site uploads its Worker but fails to create its route:

```
You have exceeded the limit of 1000 Workers routes on zone ''. [code: 10073]
```

The site then answers with the `fallback` Worker's "nothing here" page, and
the run shows `check` green and `deploy (chunk N)` red. Redeploys of existing
sites keep working, since they don't add routes. `blueskyisms`, `chatcontrol`,
`preflop` and `tubersona` all hit this before it was fixed.

Most of the 1000 were legacy `bisks.net/<name>` path routes: 146 path-era
sites held 293 of them next to their subdomain route. On 2026-09-27 those were
removed from each `wrangler.toml` and every site redeployed, which brought the
zone to roughly one route per site. `wrangler deploy` replaces a Worker's
route set, so dropping a route from `wrangler.toml` and redeploying deletes it
from the zone. `sites/games` keeps its two routes because `bisks.net/games` is
its only address.

Old `bisks.net/<name>` links now reach the apex Worker instead of the site.

To count what the zone holds, run `node audit/cf-workers.mjs --json` and sum
each Worker's `routes`. The 2026-09-17 limit-increase request did not raise
the route cap.

## KV For Shared Low-Stakes State

KV is the default shared backend for experiment data that should survive a
reload and be visible across browsers, but does not need a transaction. Use a
binding in the site's `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "STATE"
id = "<namespace-id>"
```

Treat KV's behavior as part of the product, not as an implementation detail:
reads may be briefly stale, writes do not provide compare-and-swap, and a
concurrent update can be overwritten. Prefer one key per entity or event,
idempotent writes, bounded lists, and expirations. Approximate counters,
best-effort boards, anonymous event logs, caches, and derived indexes are all
appropriate. If a race would make the result materially wrong, soften the
semantics before reaching for a Durable Object.

## Durable Objects (historical)

This repo no longer uses Durable Objects; see notes/11-durable-objects.md for
the policy and `audit/cf-durable-objects.mjs` for namespace cleanup. Two things
are worth keeping, because they still explain old `wrangler.toml` blocks and
old incidents:

The account is on Workers Free, which doesn't support the legacy KV-backed DO
storage, so surviving migrations say `new_sqlite_classes`, not `new_classes`.
`new_classes` passes TOML validation and then fails at `wrangler deploy`, and
because the deploy dies before the route step runs, the hostname never resolves
— indistinguishable from an unrelated deploy failure.

`deleted_classes` only applies if the class still exists. `wrangler dev` on a
site with a `deleted_classes` migration fails locally with "Cannot apply
deleted_classes migration to non-existent class", because local state never had
it. That is a local-only artifact; the production deploy is fine while the
namespace still exists. Use `--dry-run`, or a config copy without the migration
block, to run such a site locally.

## Checks

- `pnpm check:imports` (`audit/check-import-paths.mjs`) — walks every site's
  `public/` for `<script src>`, `<link href>`, media `src`, and ES-module
  imports, resolves each the way a browser would, and flags references that
  don't exist on disk or escape the site. Catches the "absolute path forgot the
  mount prefix" class of bug. Skips protocol/data URLs, runtime-built template
  paths, and specifiers covered by a page's own importmap.
- `pnpm check:types` (`tsc -p tsconfig.json`) — typechecks the Workers listed
  in `tsconfig.json`'s `include` (currently `sites/buildthis`). wrangler
  strips types and never runs tsc, so without this a type error ships
  silently. Add a site to `include` to cover it; expect to fix its existing
  errors first.
- `audit/cf-custom-domains.mjs` — inventory / prune Cloudflare custom domains.
- `audit/cf-durable-objects.mjs` — inventory / prune leftover Durable Object
  namespaces. A delete refused by Cloudflare means a deployed Worker still
  binds it, which is the reliable way to spot a site whose live build has
  drifted from the repo.
- `audit/build-gallery.mjs --apply` — regenerate the apex gallery from the
  `site.json` manifests. CI fails the push if the gallery and manifests
  disagree. `box-build.sh` runs `--apply` before every build push, so bot
  builds can't reintroduce the drift (hand edits still can — run it yourself
  after touching a `site.json`).

`check:imports`, `check:types`, and the gallery check run in `deploy.yml`'s
`check` job, which every deploy waits on; the rest are plain repo scripts.
Changing that wiring needs someone with `.github/` write access — the builder
is barred from that directory.

**New workspace member needs a lockfile update, or `check` fails silently for
everyone after it.** `deploy.yml`'s `check` job runs
`pnpm install --frozen-lockfile` before `deploy` is allowed to run at all. A new
`sites/<name>/package.json` is a new pnpm workspace member; if `pnpm-lock.yaml`
isn't regenerated to add its `importers` entry, `--frozen-lockfile` fails hard.
Because `deploy` needs `check` to pass, this doesn't just block the new site —
it blocks *every* directory touched by that push, and by every push after it
until the lockfile is fixed, since each of those inherits the same stale
lockfile. There's no alert for this anywhere the bot looks; a red X on the
commit is the only signal, and nothing in a normal build session runs
`--frozen-lockfile` locally to surface it. After adding any new site (or any
other new `package.json`), check `git diff --stat -- pnpm-lock.yaml` — expect a
new `sites/<name>: {}` (or similar) importer entry. If it's not there, run
`pnpm install` at the repo root before finishing the build. See
`notes/history/2026-08-pnpm-lockfile-outage.md` for the incident this traces
back to (13 sites silently queued up undeployed before a human noticed).

## A failed `check` job skips deploy until the next green push

`deploy` `needs: [check, changes]`. If `check` fails (most often the
`pnpm install --frozen-lockfile` step; see the lockfile note above), the
`deploy` job is skipped for every dir in that push, not just whichever one
caused the failure. Because `changes` diffs from the last successful run, the
next push that passes `check` deploys those dirs along with its own. Nothing
alerts on the failed run itself; a red X on the commit is the only signal, and
the sites stay on their old build (or 404, for a brand-new one) until a later
push goes green.

Before 2026-10-06 those dirs were stranded for good: on 2026-09-04 six sites
(turfwar, collatz, meowdoku, normalometer, meowsphere, timelane) had sat 404ing
for 2 to 18 days behind green pushes that never touched their directories. They
were fixed by touching each site's `wrangler.toml` to force it back into a diff.
That's still the manual fix if something strands a dir anyway, along with a
`deploy_all` dispatch.

If you're ever unsure whether a site actually deployed, check its live URL —
don't trust "the gallery links it" or "the last push was green."

## Retired sites

`sites/catsofatproto` is a deliberate retirement stub and **must not be
revived.** It streamed unvetted third-party images off the firehose through an
image proxy while loading remote scripts from a CDN; Google Safe Browsing
flagged it as a deceptive page, and because the whole zone is one domain, that
one URL flagged every site on `bisks.net`. There is no safe way to display an
unfiltered live public image firehose. See `sites/catsofatproto/RETIRED.md` and
`notes/history/2026-07-deploy-incidents.md`.

The deploy workflow has no delete path; it only runs `wrangler deploy` on
changed directories. Removing a live Worker or a stale hostname is a manual step.

Five retired sites are still deployed and still hold a Worker slot:
`blockledger`, `catsofatproto`, `listbot`, `seinfeldify`, `thread-heirloom`. Each is
reduced to a static stub with a `RETIRED.md`; `audit/cf-workers.mjs` reports
them as RETIRED. Deleting their Workers is safe — the `fallback` Worker answers
unclaimed `*.bisks.net` hostnames with a "renamed, retired, or never existed"
page, and the `RETIRED.md` files stay in the repo either way.

## History

`notes/history/2026-07-deploy-incidents.md` has the full incident log from the
first weeks: the Safe Browsing flag and its root cause, the custom-domain cap
discovery, the path-migration bugs (unconditional prefix-strip, bare-mount
trailing slash), and the subdomain migration. Read it if a symptom here looks
familiar.
