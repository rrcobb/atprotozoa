# Deploy

## Goal

Push to `main` → every site that changed re-deploys to Cloudflare. No manual
`wrangler deploy` in the normal loop.

## Mechanism

A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs on push to `main`:

1. Figure out which `sites/*` (and `apex/`) directories changed in the push
   (diff against the previous commit).
2. For each changed site, run `wrangler deploy` in that directory.

Deploying only changed sites keeps a one-line fix to one experiment from
redeploying all 50. First cut can just deploy everything if the diff logic is
fussy; optimize later.

### Auth for CI

The Action authenticates with a **Cloudflare API token** stored as the repo
secret `CLOUDFLARE_API_TOKEN` (plus `CLOUDFLARE_ACCOUNT_ID`). The token needs
`Workers Scripts:Edit` and, for custom-domain routes, `Workers Routes:Edit` +
the zone. Create it at dash.cloudflare.com → My Profile → API Tokens, or scoped
to the account. **Never commit the token**; it lives only in GitHub repo secrets.

Local deploys use the interactive `wrangler login` OAuth session instead (see
below) — no token needed on the dev machine.

## Local deploy (manual, for testing before CI exists / is trusted)

From a site directory:

```
pnpm dlx wrangler deploy          # deploy this site
pnpm dlx wrangler dev             # run locally at localhost:8787
```

Requires a valid `wrangler login`. If `wrangler whoami` errors with an expired
token, re-run `wrangler login` in an interactive terminal (in a Claude Code
session, type `! npx --yes wrangler@latest login` so the browser opens and the
result lands in the session).

## Custom domains / subdomains

Each site's `wrangler.toml` declares its route. Two options:

- **Custom domain** (preferred): `routes = [{ pattern = "trigrams.bisks.net", custom_domain = true }]`.
  Wrangler provisions the DNS record + cert on deploy. Requires the zone
  (`bisks.net`) to be in the same Cloudflare account.
- **workers.dev subdomain** (fallback for quick tests): every Worker gets
  `atprotozoa-<name>.<your-subdomain>.workers.dev` for free. Good for previewing
  before wiring the real subdomain.

The apex (`bisks.net`) is a custom_domain route on the zone apex.

## Durable Objects need the SQLite storage backend

This account is on Workers Free, which doesn't support the legacy KV-backed
Durable Object storage — only the newer SQLite-backed one. In `wrangler.toml`
that means the migration must say:

```
[[migrations]]
tag = "v1"
new_sqlite_classes = ["YourClassName"]   # NOT new_classes
```

Using `new_classes` deploys fine locally-looking (no TOML error) but fails at
`wrangler deploy` on this account — and because the deploy dies before the
route/custom-domain step runs, the site's subdomain never resolves, which
looks identical to a totally unrelated deploy failure. This bit `sites/ratioed`,
`sites/the-place`, and `sites/mootrider` before it was caught (2026-07-26).
The `state.storage.get/put` API is unchanged on SQLite-backed DOs, so no other
code needs to change — just this one line.

## Possible custom-domain cap on the zone (unresolved, needs dashboard access)

On 2026-07-26, every *new* custom-domain deploy started failing around 14:18
UTC — `sites/lasercats`, `sites/pvnp`, `sites/sonnethype`, `sites/padmoot`, and
`sites/windmill` all failed their first deploy, while every deploy to an
*already-provisioned* domain (edits to existing sites) kept succeeding right
through and after that window. Two new sites (`sites/fourk`, `sites/hashdo`)
deployed fine about an hour earlier (13:06–13:12 UTC), so this isn't these
sites' `wrangler.toml` — they're plain `assets`-only configs, same shape as
dozens of sites that work. `dig` shows no DNS record at all for any of the
failing hostnames, meaning `wrangler deploy` is dying before it gets to
route/custom-domain creation specifically for *new* hostnames.

The repo at that point had ~107 sites with `custom_domain = true` in their
`wrangler.toml` (not all successfully provisioned — some are the failures
above). That's suspiciously close to plan-level custom-domain caps some
Cloudflare tiers impose per zone. This build agent has no Cloudflare
dashboard/API access to confirm — someone with dash.cloudflare.com access
needs to check the `bisks.net` zone's custom domains count/limit and either
free up room or raise the cap. Until then, expect brand-new sites' first
deploy to keep failing even when the code is fine; retrying the same push
won't help if it's really a cap.

**Still unresolved as of a later same-day build agent run (2026-07-26,
padmoot follow-up):** `dig` for `padmoot`, `windmill`, `lasercats`, `pvnp`,
`sonnethype`, and even `the-place` (whose Durable Object migration bug was
already fixed) all still return no DNS record. So the cap is a distinct,
still-live blocker on top of the migration bug, and it isn't specific to
sites that also had the migration bug — `the-place`'s fix didn't unstick its
custom domain. As a stopgap, `sites/padmoot/wrangler.toml` now also sets
`workers_dev = true` alongside its `custom_domain` route, on the theory that
custom-domain route creation failing shouldn't also block the workers.dev
route in the same deploy. Worth copying to the other stuck sites if it turns
out to work — unconfirmed, since this agent has no way to check the deploy
result or the resulting workers.dev URL.

**Third report, same day (2026-07-26):** someone in the wild flagged both
`apex.bisks.net` and `windmill.bisks.net` as dead. Two distinct causes:

1. `apex.bisks.net` was never supposed to resolve — the apex site's real
   domain is the bare zone apex, `bisks.net` (see `notes/00-vision.md` /
   `notes/30-identity-and-did.md`), not a subdomain. A prior bot reply had
   mechanically appended `.bisks.net` to the built name "apex" and linked the
   wrong, nonexistent host. Fixed in `sites/buildthis/builder/reply.mjs`:
   `BUILD_RESULT=apex` (or `apex/<path>`) now special-cases to
   `https://bisks.net<path>` instead of `https://apex.bisks.net<path>`.
2. `windmill.bisks.net` is a real instance of the custom-domain-cap bug above
   (still unresolved, needs dashboard access) — copied the same `workers_dev
   = true` stopgap into `sites/windmill/wrangler.toml`.

## First-deploy checklist for a new site

1. `wrangler.toml` has a unique `name` (`atprotozoa-<sitename>`).
2. Route/custom_domain set to `<sitename>.bisks.net`.
3. `wrangler deploy` once locally to confirm it comes up.
4. Commit → CI takes over from there.
