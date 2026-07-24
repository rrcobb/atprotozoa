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

## First-deploy checklist for a new site

1. `wrangler.toml` has a unique `name` (`atprotozoa-<sitename>`).
2. Route/custom_domain set to `<sitename>.bisks.net`.
3. `wrangler deploy` once locally to confirm it comes up.
4. Commit → CI takes over from there.
