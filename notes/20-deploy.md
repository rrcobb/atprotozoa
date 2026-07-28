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

**Follow-up verification, same day (2026-07-26), after a fourth report** ("this
is not resolving, nor is windmill"): re-checked both from a build-agent sandbox
with live network access.

- `bisks.net` — resolves and serves (`curl -I` → `HTTP/2 200`). The reply.mjs
  fix above is confirmed working; no further action needed here.
- `windmill.bisks.net` — still `dig +short` empty / curl fails to resolve
  (getaddrinfo failure). The `workers_dev = true` stopgap in its
  `wrangler.toml` gives a fallback route, but without dashboard/CI deploy
  access this agent can't discover the account's actual `*.workers.dev`
  subdomain to link it, and can't confirm whether that fallback route ever
  successfully deployed either. This is still blocked on someone with
  dash.cloudflare.com access checking the `bisks.net` zone's custom-domain
  count/cap and freeing up room (or raising it) so `windmill.bisks.net`'s
  route can actually provision.

## Migrating existing sites off subdomains, to free cap room

On 2026-07-26, in response to a mutual flagging both the cap failures above and
a request to "keep moving sites from subdomains to trailing slash paths,"
migrated 24 pre-existing single-page static sites off their long-lived
`<name>.bisks.net` custom domains onto `bisks.net/<name>` path routes instead:
acausal, babel, bird-costumes, buildcoin, candyland, cogsec, delaunay-maze,
fourk, fruitninja, gulpstream, heistlibs, hellmole, idea-island, koipond,
labescape, mahjong-solitaire, norvidwave, old-beach, pixel-fishing, popmoot,
solitaire, tabernacle, trigramonopoly, and viable. Each got a `main =
"src/index.ts"` prefix-stripping Worker (they previously had no Worker at
all — pure `[assets]`), following the barebones template in
`notes/40-new-site-playbook.md`. Self-referential links (OG tags, share-text,
in-page footers) and the apex/wheelhouse gallery mirrors were updated to the
new path; a few other sites that linked out to them (`neighborhood`,
`buildthis2`) were fixed too.

These were picked because they're the simplest case — single static
`index.html`, no subresources, no Durable Objects, no OAuth — to minimize risk
of the prefix-stripping migration breaking something. This intentionally
**breaks each site's old `<name>.bisks.net` link** (no redirect is possible
once the custom domain is deprovisioned) in exchange for freeing a
custom-domain slot on the zone; that's the explicit tradeoff the requester
asked for. Unconfirmed from this sandbox (no dashboard/deploy access): whether
`wrangler deploy` actually deprovisions the now-unlisted custom domains on
push, and whether the freed slots actually unstick the sites still stuck on
the cap (`padmoot`, `windmill`). Worth checking after the next deploy.

There are ~80+ more pre-existing sites still on subdomains (most with a
`src/index.ts` already, or more subresources/state to account for) — this was
one batch, not the whole migration. A future agent picking this up should
grep `custom_domain = true` across `sites/*/wrangler.toml` for what's left.

## Clustering related sites under a shared path segment

Later the same day (2026-07-26), a mutual asked to keep migrating subdomains
to paths and, where there's "sensible clusters" (their example: trigrams,
games), to group them under a shared segment instead of flat
`bisks.net/<name>`. Introduced the first such cluster: `bisks.net/games/<name>`.
Migrated 12 game sites straight from their old `<name>.bisks.net` custom
domain onto the new cluster path (skipping the flat `bisks.net/<name>` stop
entirely): pacmoot, mootkombat, moottris, moot-bingo, grand-moot-auto,
sokobisks, crewquest, thunderdome, blackice, change, biskshow, and claudoku.
Same time, continued the plain flat-path migration for 10 more non-game
sites: alignment-chart, seismograph, immortals, knolling, oblique, invocation,
verbs, verdict, treeoflife, and erdosproof.

Same template as before (`main = "src/index.ts"` prefix-stripping Worker,
`routes` on the shared zone) — the only difference for a clustered site is
`PREFIX`/`routes` use `/games/<name>` instead of `/<name>`. Two extra classes
of self-reference turned up in this batch that the first batch's "simplest
case" picks didn't hit, worth checking for in future migrations:

- **Client-side path routing.** `immortals` reads a handle out of
  `location.pathname` (`immortals.bisks.net/<handle>`) and `pushState`s new
  URLs the same way — both needed a `MOUNT` constant threaded through so they
  strip/prepend the new mount prefix instead of assuming they own the domain
  root. `verdict`'s OAuth flow (`client-metadata.json`, `oauth.js`) had the
  same problem one level worse — `CLIENT_ID`/`REDIRECT_URI` are computed from
  `location.origin`, which silently drops the path, so the OAuth client
  metadata's `redirect_uris` had to be updated too, not just the JS.
- **Cross-site sibling links.** Sites in the same theme link to each other by
  old subdomain in their own footers/credits (e.g. `mootkombat` → `moot-bingo`,
  `grand-moot-auto`/`moottris`/`mootrider` → `pacmoot`, `puzzlelove` →
  `sokobisks`). Grepping only each site's *own* directory for its *own* old
  domain misses these; after a batch lands, grep the whole `sites/` tree for
  every migrated name's old `<name>.bisks.net` string to catch what other
  sites still point at it. (Left `og-gen.mjs` OG-image-generator scripts and
  `.buildthis.json` build-history records with the old domain string in a
  couple of spots — those aren't served/live, just re-run-on-demand tooling
  and historical logs, so lower priority than anything actually served.)

apex and wheelhouse's gallery mirrors were updated for all 22. Still ~60+
sites on subdomains after this batch (down from ~80+) — future batches should
keep grepping `custom_domain = true` for what's left, and keep an eye out for
more clusters as they emerge (e.g. the trigram-family sites — trigrams,
trigruessr, trigramonopoly, neighborhood — are already conceptually one
family, though trigrams itself already spans multiple paths under its own
site rather than needing a cluster segment). `mootrider` (has a Durable
Object) and `war` (has OAuth with a hardcoded-origin client) were
deliberately skipped this batch as higher-risk; worth a dedicated pass.

## Migrating the 5 cap-stuck sites off subdomains (2026-07-26, audit follow-up)

The five sites the custom-domain cap left with no DNS at all — `wheelhouse`,
`solvers`, `mcskeets`, `ratioed`, `the-place` — were migrated onto path routes
(`bisks.net/<name>`) and deployed directly with `wrangler deploy`, which drops
the old (never-provisioned) custom domain and creates the path route. All five
now serve 200; the old subdomains stay dead (they never resolved, so no live
link broke). This was pure upside — unlike migrating an *up* subdomain, there
was no working `<name>.bisks.net` link to break.

Two gotchas beyond the standard prefix-strip, worth knowing for the next batch:

- **Subdirectory index → trailing-slash redirect drops the mount prefix.**
  `solvers` has `public/magnetostatics/index.html`. The asset router serves a
  dir index via a 307 to the trailing-slash form, and it builds that `Location`
  off the *stripped* path — so it sent the browser to `bisks.net/magnetostatics/`
  (no `/solvers`, 404). Fix: in the Worker, after `env.ASSETS.fetch`, if the
  response is a 3xx whose `Location` is a same-origin absolute path missing the
  prefix, re-add it. A flat single-`index.html` site (most of them) never hits
  this; only sites with a real subdirectory index do.
- **DO sites: `run_worker_first` must become `true`, and the client must prefix
  its `/api` calls.** `ratioed`/`the-place` had `run_worker_first = ["/",
  "/api/*"]` — those root-relative patterns don't match the mounted `/ratioed/*`
  paths, so the asset router would grab them. Set `run_worker_first = true` so
  the Worker strips the prefix first, then routes to the DO/ASSETS with the
  stripped request. The browser client also fetches `/api/...` absolute, which
  becomes `bisks.net/api/...` (off-route) under the mount — thread a `MOUNT`
  const through every `fetch()` and self-link (`the-place` needed it for
  `/api/state`, `/api/pixel`, `/api/days`, the title link, the "go back" link,
  and the share URLs). DO cold-start returns a one-off 404/empty on the first
  request after deploy while `this.ready` resolves — retry before concluding
  it's broken.

## First-deploy checklist for a new site

1. `wrangler.toml` has a unique `name` (`atprotozoa-<sitename>`).
2. Route/custom_domain set to `<sitename>.bisks.net`.
3. `wrangler deploy` once locally to confirm it comes up.
4. Commit → CI takes over from there.

## Chrome "deceptive site" / Safe Browsing warnings on a brand-new custom domain

2026-07-26: a mutual reported Chrome showing a "deceptive site ahead" warning on
`solvers.bisks.net` right after its first deploy and asked for it to be fixed. Audited
`sites/solvers` end to end (`public/index.html`, `public/magnetostatics/index.html`,
`solver.js`, the compiled `pkg/magnetostatics.wasm`) looking for anything that would
legitimately trip Safe Browsing: no forms or credential collection, no `eval`/obfuscated
JS, no brand impersonation, no hidden iframes or redirects, no autodownloads. The only
non-self-referential outbound links are to `bsky.app` (share intent) and `github.com`
(source link) — both plain `<a>` tags, nothing dynamic. Found nothing in-app that
explains the warning.

This matches a well-documented false-positive class for brand-new Cloudflare-hosted
custom domains, unrelated to page content:

- **Shared-IP reputation** — Cloudflare terminates many customers' domains on the same
  anycast IPs; if any other tenant on that IP gets reported for phishing/malware, Safe
  Browsing can flag the whole IP block, catching unrelated innocent sites (see the
  Cloudflare Community threads on "deceptive site alert" / "false positive suspected
  phishing on my own Worker").
- **Newly-observed-domain heuristics** — a custom domain that got its cert and first
  traffic within the last day or so statistically resembles a throwaway phishing
  domain to Safe Browsing's classifier, independent of what's actually on it. This
  self-resolves as the domain ages, or can be sped up with a manual review.

Neither is fixable by editing site code — it's the same shape of blocker as the
custom-domain-cap issue above: this build agent has no browser/Google account access,
so it can't file Google's "report a detection problem" / Search Console review request.
That needs someone with domain-owner access to submit the review at
`https://safebrowsing.google.com/safebrowsing/report_error/`. Worth checking again in a
day or two even without filing anything — reputation-based false positives on new
domains often clear on their own.

**Follow-up (2026-07-26):** a mutual reported the warning now showing on *all* sites,
not just `solvers`, and floated a new theory — maybe some page is asking for a
password. Grepped the whole repo for `password` and every `input[type="password"]`.
Findings:

- The only real, visitor-facing password-type input anywhere in the repo is
  `sites/keytags` — a local HMAC secret ("your secret") used to derive a private
  record key client-side. It's explicitly documented as never leaving the browser
  and never stored, and is unrelated to Bluesky login. Tightened the label anyway
  (`sites/keytags/public/index.html`) to say "not your Bluesky password" right next
  to the field, so neither a scanner nor a visitor skimming the page could mistake
  it for account-credential collection.
- `sites/war/public/index.html` has a dead `input[type="password"]` CSS selector
  with no matching `<input>` on the page — copy-pasted rule, never rendered, not a
  risk.
- Every other `password` hit in the repo is server-side/backend code referring to
  the *bot's own* app-password (`BOT_APP_PASSWORD`) used in `createSession` calls
  from Workers/scripts — never a form a site visitor fills in. Real user auth
  everywhere else (`keytags`, `mootdrone`, etc.) goes through atproto OAuth
  (PKCE + DPoP, redirects to the user's own PDS), which never touches a password.

So: no phishing-shaped password collection found anywhere. A warning spreading from
one new custom domain to *all* sites on the zone is exactly the expected shape of the
shared-IP/zone reputation false-positive already diagnosed above, not evidence of a
real credential-harvesting page — still needs the Search Console review filed by
someone with dashboard access; no further code fix available from this agent.

**Root cause found and fixed (2026-07-26, with dashboard access):** Rob checked
Search Console → Security Issues, which named exactly **one** flagged URL:
`https://catsofatproto.bisks.net/`, category **Deceptive pages** ("attempt to
trick users into ... installing unwanted software or revealing personal
information"). So this was NOT a pure shared-IP/new-domain reputation false
positive after all — a specific page tripped it, and because the whole zone is
one domain, that one page flagged every site.

`catsofatproto` streamed **live, unvetted third-party images straight off the
Bluesky firehose**, loaded remote `tfjs`/`mobilenet` from a CDN, and ran an
`/img/` proxy. To the Safe Browsing crawler that combination (unreviewed
third-party image stream + remote script loading + image proxy) reads as a
compromised/deceptive page. The fix was to **retire the site**: `sites/catsofatproto`
is now a static retirement stub (no remote scripts, no firehose, no proxy), so the
flagged URL serves obviously-benign content and the Search Console review can clear
the domain.

**Do not revive `catsofatproto`'s live feed.** There is no safe way to display an
unfiltered live public image firehose — anything that re-displays it can re-trip the
flag and take down the entire `bisks.net` zone again. If a future pass is bringing
sites "back up," skip this one on purpose; it is down by design. See
`sites/catsofatproto/RETIRED.md`.

Still to do (needs Cloudflare dashboard / wrangler creds — repo change alone doesn't
do it): the deploy workflow only ever runs `wrangler deploy` on changed dirs, it has
no delete path, so the live Worker `atprotozoa-catsofatproto` and the leftover
`catsofatproto.bisks.net` hostname keep serving until explicitly removed. The stub
deploy makes them serve harmless content (enough to clear the flag); fully deleting
the Worker + that custom-domain binding is a separate manual step. After the stub is
live and the page serves benign content, file the review via Search Console's
**Request Review** button.

## Migrated-to-path sites: the old custom domain can keep resolving and silently break

`@ver.ooo` reported (2026-07-27) that `fitzcarraldo.bisks.net` — the site's
original custom domain, before the "bardposting" commit (2bdbc6c) moved it to the
`bisks.net/games/fitzcarraldo` clustered path route — "doesn't seem to load."
`dig fitzcarraldo.bisks.net` still resolves (unlike genuinely-never-provisioned
or intentionally-retired hostnames like `windmill.bisks.net`, which return no
record): moving a site's `routes` off `custom_domain = true` in `wrangler.toml`
does **not** deprovision the old custom-domain hostname in Cloudflare, so it kept
routing straight to the same Worker.

The break: every path-mounted site's `src/index.ts` unconditionally does
`url.pathname.slice(PREFIX.length) || "/"` to strip the mount prefix before
handing off to `ASSETS.fetch`. Hit through the *old* domain, requests arrive
**without** that prefix, so the slice chops the front off short paths instead
(`"/game.js".slice(20)` → `""` → falls back to `"/"`) and every asset request —
JS, images, fonts — silently served `index.html` instead. The page itself loaded
fine (empty path still resolves to `/` either way), so this only shows up as
"the game/interactive part doesn't work," not an outright 404 — easy to miss in
a quick check.

Fixed for `fitzcarraldo` by guarding the strip (`sites/fitzcarraldo/src/index.ts`):
only slice when `url.pathname === PREFIX || url.pathname.startsWith(PREFIX + "/")`,
otherwise pass the request through unchanged. This makes the Worker correct
regardless of which still-live hostname hits it, without needing dashboard access
to actually remove the stale custom domain.

**Every other site migrated off a custom domain onto a path route (the ~24+12+10
from the sections above, and any since) likely has the same latent bug** if its
old hostname is still resolving — worth sweeping `sites/*/src/index.ts` for the
unconditional-slice pattern and applying the same guard, and/or getting dashboard
access to actually deprovision the stale custom domains at the source.

## Static check for broken local import/script paths (2026-07-28)

`@ver.ooo` followed up on the fitzcarraldo report above asking for "some sort
of integration ~globally to find invalid paths, at least in important
imports" — a related but distinct bug class from the Worker prefix-strip bug:
an HTML/JS file itself referencing a local resource by a path that won't
resolve once deployed (a root-absolute `<script src="/foo.js">` that forgets
the site's mount prefix, or a plain typo'd/stale relative path).

Added `audit/check-import-paths.mjs` (`pnpm check:imports` from the repo
root): walks every `sites/*/public` (+ `apex/public`) for `<script src>`,
`<link href>`, `<img>`/`<source>`/`<audio>`/`<video>` `src`, and ES-module
`import`/`export …from`/`import()` references, resolves each one exactly like
a browser would (WHATWG `URL` resolution against the file's real served
path — including clamping `..` at the site's mount root, not the raw
filesystem parent) and flags any that resolve outside the site's mount prefix
or don't exist on disk. Skips protocol/data/mailto/anchor URLs, runtime
template-literal-built paths (`${...}`, can't be statically resolved), and
specifiers covered by a page's own `<script type="importmap">` (e.g.
`cowlick`/`grand-moot-auto`'s `three` import, resolved to a CDN, not a local
file). A run against the whole repo at the time this was added found zero
broken references — this is a preventive check, not a fix for a live bug.

This is a plain repo script, not a CI gate — the builder's hard rule against
touching `.github/` means it can't be wired into `deploy.yml` as a required
step from inside a build run. It's referenced from
`notes/40-new-site-playbook.md` as a pre-deploy step for new sites; running it
repo-wide occasionally (or after any batch of path migrations, like the
subdomain→path batches above) is still a manual/agent call, not automatic.
Wiring it into `.github/workflows/deploy.yml` as a real CI gate would need
someone with `.github/` write access to do it outside a buildthis run.
