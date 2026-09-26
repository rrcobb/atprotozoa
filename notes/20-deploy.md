# Deploy

Push to `main` → every site that changed re-deploys to Cloudflare. No manual
`wrangler deploy` in the normal loop.

## Mechanism

`.github/workflows/deploy.yml` runs on push to `main`: it diffs
`github.event.before` against `github.sha` to find changed `sites/*` and `apex/`
directories, and runs `wrangler deploy` in each.

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

Cloudflare's Workers Paid plan allows 500 Workers per account. This repo is one
Worker per site, so the count tracks the number of experiments: **679 as of
2026-09-17, 179 over the cap.**

Nothing is broken by that, and nothing has been for weeks. The account passed
500 on 2026-08-20 and kept creating Workers at the usual 5-10/day for another
month. Every site serves, and every site redeploys. The cap applies only to
**creating** a Worker that does not exist yet.

### It depends on the wrangler version

Creating a new Worker over the cap fails on old wrangler and succeeds on new:

| wrangler | creating a new Worker over the cap |
| --- | --- |
| 4.114.0 | fails, `code: 10037` |
| 4.134.0 | succeeds |

Both were tried against this account on 2026-09-17 with the same credentials,
minutes apart. Newer wrangler provisions a new script through the Workers
Assets upload path rather than the legacy `PUT /workers/scripts/:name`, and that
path does not hit the same check. Calling the legacy API directly returns 10037
regardless of which token you use — the account's OAuth session and the CI API
token behave identically, so this is **not** a credentials difference.

This is what made it confusing: `sites/listbot` would not deploy locally
(wrangler 4.114.0) but deployed cleanly through CI (`pnpm dlx`, 4.134.0) a
minute later. The natural reading is "CI has more permission than I do," and
that reading is wrong.

The repo now pins `^4.134.0`, so the local path works too. If a local deploy of
a *new* site ever fails with 10037 again, check the wrangler version first.

### The error often does not name the cap

`wrangler kv namespace create` has reported a bare
`Authentication error [code: 10000]` and then succeeded on a plain retry — which
sends you looking at auth, tokens, and logins for an hour. The Cloudflare
account API returns the same misleading 10000 for scope problems. Treat a bare
10000 during a *new site* setup as a possible cap symptom.

### Where this actually sits

`node audit/cf-workers.mjs` inventories the account against the cap, classifies
every Worker against the repo, and flags routes left behind by a deleted Worker
(routes are a zone resource, so they can strand the way DO namespaces did).

There is deliberately no `--prune`. The DO and custom-domain caps were held by
leftovers that outlived their bindings, so a safe delete set could be derived.
This one is not: all 674 site Workers map to live site directories. Deleting one
deletes a site.

A limit increase was requested from Cloudflare on 2026-09-17 via the
[Limit Increase Request Form](https://forms.gle/eX6pXvit1wBv77Yw5); the limits
doc says the cap is adjustable. That is the right fix — the alternatives
(migrating static sites to Pages, or collapsing many sites into one
multi-tenant Worker) either fight the deploy pipeline or give up the
per-site isolation that makes a build-on-demand bot safe to run.

Note that assets-only sites (`wrangler.toml` with no `main`) still count: all 70
of them appear in the account's script list, so dropping `main` frees nothing.

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

### Route cap likely hit again (2026-09-26, unconfirmed — needs API access)

`chatcontrol` and `tubersona` both shipped with a persistent root 404:
`curl -sI https://chatcontrol.bisks.net/` returns Cloudflare's *fallback* Worker
page ("not found — bisks.net", the `*.bisks.net/*` catch-all in `fallback/`),
meaning the explicit `<name>.bisks.net/*` route for each never actually got
created on the zone — the deploy step failed silently on the route, not on the
asset upload (`wrangler deploy --dry-run` is clean locally for both; the repo's
`check` job passed for every one of the three chatcontrol attempts and the one
tubersona attempt; only `deploy (chunk N)` failed, each time).

`grep -rh "pattern = " sites/*/wrangler.toml apex/wrangler.toml
fallback/wrangler.toml | wc -l` currently returns **1001** — right at the
documented 1000/zone cap this section already warns about. That arithmetic,
plus "the most recent new-route creation before these two (`moottwins`,
2026-09-25 05:17) still succeeded, and every *existing*-route redeploy since
keeps succeeding" is consistent with the zone having just filled up: creating a
new route is the only operation this would break, matching what's actually
failing here.

**Not confirmed against the live zone — this builder has no
`CLOUDFLARE_API_TOKEN`.** Whoever picks this up next, in order:

1. `node audit/cf-workers.mjs` (needs the Workers-scoped token from 1Password,
   see `notes/90-infra-and-budget.md`) reports `danglingRoutes` — routes whose
   script no longer exists. `chatcontrol`'s wrangler.toml was renamed
   `atprotozoa-chatcontrol` → `atprotozoa-chatcontrol2` on 2026-09-25 (see that
   file's comment) to work around a *different*, now-superseded theory. If the
   old `atprotozoa-chatcontrol` script/route wasn't cleanly replaced by that
   rename, it's sitting there dangling and holding a slot the new script can't
   also claim — check for it by name first, and prune it if so
   (`audit/cf-workers.mjs` has no `--prune`; do it by hand via the dashboard or
   API, since deleting a *live* site's Worker is exactly what that script
   deliberately won't automate).
2. If the zone really is at 1000 with no dangling leftovers, this is the same
   shape as the July custom-domain cap incident, one level up: the fix there was
   pruning 64 stale hostnames; the routes cap has no equivalent stale set
   (`notes/20-deploy.md`'s Worker-cap section already established all live
   Workers map to real sites — same is likely true of routes). The sanctioned
   fix is a Cloudflare limit-increase request, same as the 500-Worker cap
   (`notes/90-infra-and-budget.md`) — check whether the 2026-09-17 request
   already covers routes or whether a separate one is needed.
3. Once headroom exists, redeploy `sites/chatcontrol` and `sites/tubersona`
   (touch a file and push, or `pnpm dlx wrangler deploy` from each dir with a
   real token) and re-check with `curl -sI`.

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

## A failed `check` job silently skips deploy for the whole push

`deploy` `needs: [check, changes]` — if `check` fails (most often the
`pnpm install --frozen-lockfile` step; see the lockfile note above), the
`deploy` job is skipped **entirely**, for every dir in that push, not just
whichever one caused the failure. A transient/soon-fixed lockfile mismatch on
a brand-new site's build push means that site's Worker never deploys, even
though its hostname is already `hidden: false` on the gallery and in
receipts/rateyourbuild — it just 404s. Nothing alerts on this; a red X on one
old commit is the only signal, and once a *later*, unrelated commit fixes
whatever `check` was failing on (e.g. some other site's build running
`pnpm install` at the repo root), every subsequent push deploys fine and
looks healthy, masking that the original site never got its first real
deploy. The only way to notice is to actually load the site.

Caught 2026-09-04 (a daily-slot pass): six sites — turfwar, collatz,
meowdoku, normalometer, meowsphere, timelane — had sat 404ing for between 2
and 18 days despite being fully built, gallery-linked, and CI-green on every
push since, because none of those later pushes happened to touch their own
`sites/<name>/` dir and so never re-entered the deploy diff. Found by cross
referencing `gh`/the GitHub API's list of failed `deploy` workflow runs
against which pushes added a new `sites/*/site.json`, then checking whether
that site's directory was touched by any commit since (if not, and the site
still 404s, it's this bug). Fixed by making a real, tiny touch to each site's
`wrangler.toml` (a dated note, no functional change) to force it back into
the next push's diff now that `check` passes again.

If you're ever unsure whether a site actually deployed, check its live URL —
don't trust "the gallery links it" or "the last push was green." Worth an
occasional sweep (the recipe above) rather than only checking sites you
happen to visit.

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

Four retired sites are still deployed and still hold a Worker slot:
`blockledger`, `catsofatproto`, `seinfeldify`, `thread-heirloom`. Each is
reduced to a static stub with a `RETIRED.md`; `audit/cf-workers.mjs` reports
them as RETIRED. Deleting their Workers is safe — the `fallback` Worker answers
unclaimed `*.bisks.net` hostnames with a "renamed, retired, or never existed"
page, and the `RETIRED.md` files stay in the repo either way. But
`catsofatproto` and `thread-heirloom` also hold `bisks.net/<name>` path routes,
which the wildcard fallback does **not** cover; those routes need deleting on
the zone too, or they 522.

## History

`notes/history/2026-07-deploy-incidents.md` has the full incident log from the
first weeks: the Safe Browsing flag and its root cause, the custom-domain cap
discovery, the path-migration bugs (unconditional prefix-strip, bare-mount
trailing slash), and the subdomain migration. Read it if a symptom here looks
familiar.
