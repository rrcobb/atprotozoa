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

These are plain repo scripts, not CI gates. Wiring `check:imports` into
`deploy.yml` needs someone with `.github/` write access — the builder is barred
from that directory.

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

## History

`notes/history/2026-07-deploy-incidents.md` has the full incident log from the
first weeks: the Safe Browsing flag and its root cause, the custom-domain cap
discovery, the path-migration bugs (unconditional prefix-strip, bare-mount
trailing slash), and the subdomain migration. Read it if a symptom here looks
familiar.
