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

## The zone's custom-domain cap, and the path migration

New `<name>.bisks.net` custom-domain deploys hit a Cloudflare per-zone
custom-domain cap: `wrangler deploy` succeeds for the Worker but the DNS record
never provisions, so the hostname returns no DNS and the site is unreachable.
Deploys to *already-provisioned* domains are unaffected. This is why new sites
mount as a path route on the already-live `bisks.net` zone (`bisks.net/<name>`,
or a cluster like `bisks.net/games/<name>`) instead of a dedicated subdomain —
a path route doesn't consume a custom-domain slot. See
`notes/40-new-site-playbook.md` ("Why paths, not subdomains").

Each path-mounted site has a thin `src/index.ts` that strips its `/<name>`
mount prefix before serving. Two gotchas beyond the plain prefix-strip:

- **Subdirectory index → trailing-slash redirect drops the prefix.** A site
  with `public/<sub>/index.html` gets a 307 to the trailing-slash form whose
  `Location` is built off the *stripped* path, so it points at
  `bisks.net/<sub>/` (no mount prefix, 404). Fix: after `env.ASSETS.fetch`, if
  the response is a 3xx whose `Location` is a same-origin absolute path missing
  the prefix, re-add it. A flat single-`index.html` site never hits this.
- **Durable Object sites: `run_worker_first = true`, and the client must
  prefix its `/api` calls.** Root-relative `run_worker_first` patterns (`["/",
  "/api/*"]`) don't match the mounted `/<name>/*` paths, so set it to `true` and
  let the Worker strip the prefix first. The browser client's absolute `/api/...`
  fetches and self-links also need a `MOUNT` const threaded through, or they
  resolve to `bisks.net/api/...` off-route. DO cold-start can return a one-off
  404/empty on the first request after deploy — retry before concluding it broke.

## First-deploy checklist for a new site

1. `wrangler.toml` has a unique `name` (`atprotozoa-<sitename>`).
2. `routes` set to a path on the `bisks.net` zone (`bisks.net/<name>` +
   `bisks.net/<name>/*`), with a `src/index.ts` that strips the mount prefix.
   A dedicated `<name>.bisks.net` custom domain is the exception, not the
   default — the zone is at its custom-domain cap (see above).
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

## Bare mount route (no trailing slash) breaks relative asset URLs

Separate from the stale-hostname issue above: a handful of sites (`sepcheck`,
`pvnp`, `padmoot`) independently hit and fixed the same bug — visiting a
path-mounted site's bare route, `bisks.net/<name>` with **no** trailing slash,
served `index.html` at that exact URL (status 200, looks fine), but any
relative asset reference in that HTML (`<script src="app.js">`,
`href="style.css"`) resolves against the request URL per normal browser
relative-URL rules. Without a trailing slash, `<name>` reads as the last path
*segment*, not a directory, so the relative resolution drops it and asks for
`bisks.net/app.js` instead of `bisks.net/<name>/app.js` — a 404 that silently
kills the site's JS/CSS with no error visible to the visitor. The Worker's own
prefix-stripping (`url.pathname.slice(PREFIX.length) || "/"`) masks this
because slicing an exact-match `PREFIX` also yields `"/"`, so the Worker
happily serves `index.html` either way — the bug is entirely in what URL ends
up in the browser's address bar, not in what bytes come back.

2026-07-28: swept every path-mounted site's `src/index.ts` (~110 of them; the
~35 sites still on `custom_domain` routes are unaffected, they're mounted at
the root) and added the same fix everywhere: if `url.pathname === PREFIX`
exactly, 308-redirect to `PREFIX + "/"` before doing anything else, so the
browser's URL always carries the trailing slash before relative asset
resolution happens. Sites with pre-existing stale-hostname guards (the
`fitzcarraldo`/`giftlinks`/`mootcycle`/`didneighbors` pattern from the section
above) got the redirect check added ahead of that guard rather than folded
into it, so the two fixes stay independent.

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

## `steamtags.bisks.net` missing DNS record right after its subdomain migration (2026-07-31)

`@7778777.online` reported "missing A record when I try to resolve DNS" for
`steamtags.bisks.net`, ~20 minutes after the commit (`dd44787`) that moved
`steamtags` from `bisks.net/steamtags` onto its own custom domain (requested
in the same thread because the site grew login + persisted data). Checked
from a build-agent sandbox with live network access: `dig steamtags.bisks.net
A/AAAA/CNAME` all return nothing, and `curl` fails to resolve the host —
`bisks.net` itself resolves fine in the same check, so this isn't a
sandbox/resolver problem. An empty `dig` result like this means the
authoritative zone has no record at all, not a resolver-side negative cache
(a negative cache would still reflect a real NXDOMAIN from the authoritative
zone and clear on TTL) — so the requester's "just negative cache on my side"
guess is probably not it.

This looks like the same custom-domain-provisioning failure documented
above (padmoot/windmill/etc.), even though a `grep -rc "custom_domain =
true" sites/*/wrangler.toml` right now only counts 37 sites — well under the
~107 that coincided with the original cap. That repo count likely
undercounts what's actually provisioned in Cloudflare: per the "old custom
domain can keep resolving" note above, migrating a site's `wrangler.toml`
*off* `custom_domain` does not deprovision the hostname in Cloudflare, so
every site migrated path→subdomain or subdomain→path over the past several
days may still be occupying a zone custom-domain slot that the in-repo count
no longer reflects. Only dashboard access can confirm the real count/cap.

**Resolved (2026-07-31).** Confirmed via the API: the zone held **101** custom
domains against Cloudflare's documented cap of **100 per zone**, so every new
custom domain silently failed to provision. Of those 101, **64 were stale** —
sites migrated subdomain → path whose hostname was never deprovisioned (moving
`routes` off `custom_domain = true` does not release the slot). Pruned all 64
with `audit/cf-custom-domains.mjs --prune --apply`, taking the zone to **37/100**,
then redeployed `steamtags`, which provisioned immediately and now serves 200
over TLS. The in-repo `grep` count was indeed undercounting, exactly as
suspected above.

Two things worth knowing for next time:

- **Wildcard custom domains do not exist.** `custom_domain = true` requires an
  exact hostname ("Custom Domains do not support wildcard DNS records").
  Wildcards are only a *route* feature (`*.bisks.net/*`), and a wildcard route
  needs a proxied wildcard DNS record **plus** Total TLS / Advanced Certificate
  Manager for certs, because Universal SSL does not issue `*.bisks.net`. This
  zone is on the **Free** plan, so the wildcard path is not currently available.
- **Routes cap at 1,000/zone vs 100 for custom domains.** If more than ~100
  sites ever need their own hostname, the way there is per-hostname *routes*
  plus a proxied DNS record per site — which needs a token with DNS:Edit. The
  1Password token (`Cloudflare` → `api token edit workers bisks.net`) is
  Workers-scoped only and has **no DNS permission**; it can inventory and prune,
  but cannot create DNS records.

The stopgap below is now unnecessary but harmless.

### Two things that bit during the migration back to subdomains

**A wildcard route shadows a Custom Domain.** Deploying `*.bisks.net/*` while
sites were still on `custom_domain = true` took `steamtags.bisks.net` down
(404) within seconds. Sites on an explicit `<name>.bisks.net/*` route were
unaffected — a more specific route wins, but a Custom Domain does not. So the
catch-all can only be live once every site holds a real hostname route. The
apex is fine either way: `*.bisks.net` matches one level *below* the apex, so
`bisks.net` never matches it.

**A green run for the tip commit does not mean the whole push has deployed.**
`deploy.yml` diffs `github.event.before` against `github.sha`, which correctly
spans every commit in a push — that part works. What's easy to get wrong is
reading the run list: `gh run list` shows the newest run by its *tip commit's*
message, so a push whose last commit only touches `notes/` looks like a
notes-only deploy even when the same run is deploying 14 sites underneath. Check
the job list (`gh run view <id> --json jobs`) rather than the run title, and
wait for `status=completed` before concluding a site is serving stale code.

Three sites were briefly diagnosed as "never deployed" this way on 2026-07-31;
they were mid-deploy in a run that then went green on its own.

As a stopgap, added `workers_dev = true` to `sites/steamtags/wrangler.toml`
(same idea as the padmoot/windmill stopgap further up, though those two were
later migrated off custom domains entirely rather than kept on the
workers.dev fallback). This should give a reachable `atprotozoa-steamtags.
<account-subdomain>.workers.dev` URL if the custom-domain route keeps
failing — but it will **not** restore login: `public/client-metadata.json`
and the OAuth redirect URIs are pinned to `https://steamtags.bisks.net/...`,
which only resolves once the real custom domain provisions. This build agent
has no way to discover the account's actual `workers.dev` subdomain to link
it (same limitation noted for `windmill` above). Someone with
dash.cloudflare.com access needs to check the `bisks.net` zone's custom
domain count and either free up room (deprovisioning stale hostnames from
past migrations) or confirm `steamtags.bisks.net` specifically and retry its
provisioning.
