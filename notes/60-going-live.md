# Going live — one-time setup + deploy

Everything up to here is code in the repo. Nothing is deployed yet, and
`bisks.net` currently resolves to nothing (zone is on Cloudflare, no records).
This note is the checklist to actually put it online. Steps that need Rob's
credentials or the browser are marked **[you]**.

## 0. Prereqs (state as of scaffolding)

- `bisks.net` zone is active on Cloudflare (nameservers point there). ✓
- Node pinned via `.tool-versions` (nodejs 24.18.0); pnpm workspace installs. ✓
- wrangler is a dev dependency; no global install needed. ✓
- `wrangler login` token is **expired** — needs a fresh login (below).

## 1. **[you]** Log into Cloudflare (local deploys)

In a Claude Code session, type this so the browser opens and the result lands in
the session:

```
! npx --yes wrangler@latest login
```

Then confirm: `pnpm dlx wrangler whoami` — should show your account + account ID.

## 2. Fill in your real DID (for the handle)

The apex serves `/.well-known/atproto-did`. It needs your actual DID. Resolve it
from your current handle:

```
curl "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=<your-current-handle>"
```

Put the `did:plc:...` into `apex/wrangler.toml` under `[vars] ATPROTO_DID`
(replacing the `REPLACE_WITH_REAL_DID` placeholder).

## 3. Turn on the custom-domain routes

Both `apex/wrangler.toml` and `sites/trigrams/wrangler.toml` have their `routes`
line commented out (so a deploy can't fail on a not-yet-configured domain).
Uncomment them:

- apex → `bisks.net`
- trigrams → `trigrams.bisks.net`

Wrangler provisions the DNS record + cert on deploy (the zone is in your account).

## 4. First manual deploy

```
pnpm --filter @atprotozoa/apex deploy
pnpm --filter @atprotozoa/trigrams deploy
```

Check:
- `https://bisks.net` → landing page.
- `https://bisks.net/.well-known/atproto-did` → your DID as plain text.
- `https://trigrams.bisks.net` → the firehose feed, cards appearing live.

## 5. **[you]** Set your Bluesky handle to bisks.net

Once step 4's well-known endpoint returns your DID: Bluesky app → Settings →
Account → Handle → "I have my own domain" → enter `bisks.net` → verify. It fetches
the well-known path, sees its own DID, and switches your handle. Your DID is
unchanged; only the human-readable handle moves.

## 6. **[you]** Wire deploy-on-commit (GitHub)

The workflow (`.github/workflows/deploy.yml`) deploys changed Workers on push to
`main`. It needs two repo secrets:

- `CLOUDFLARE_API_TOKEN` — create at Cloudflare dash → My Profile → API Tokens.
  Scopes: `Workers Scripts:Edit`, and for custom domains `Workers Routes:Edit` +
  the `bisks.net` zone (Zone:Read + DNS:Edit).
- `CLOUDFLARE_ACCOUNT_ID` — from `wrangler whoami` or the dash URL.

Set them: repo → Settings → Secrets and variables → Actions → New repository
secret. (Or `gh secret set CLOUDFLARE_API_TOKEN` etc.)

After that, pushing a change to any `sites/*` or `apex/` redeploys just that one.

## 7. Push the repo to GitHub

The repo currently has no remote. Create one (`gh repo create atprotozoa
--private --source=. --push` or via the web) so the Action has somewhere to run.

## Order that matters

1 → 2 → 3 → 4 (verify) → 5 (handle) can all happen locally first. 6 and 7 (CI +
remote) can come after, or before — they're independent. The handle switch (5)
only needs the apex deployed and the well-known endpoint live.
