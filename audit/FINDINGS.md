# buildthis audit — what's working, what isn't

Snapshot taken 2026-07-26 ~21:30 UTC. All raw data is in `audit/raw/`, joined into
`audit/audit.db` (SQLite). Re-runnable: `node audit/check-sites.mjs` then
`node audit/build-db.mjs`.

## Data sources pulled

| Source | File | What it is |
|---|---|---|
| KV event timeline | `raw/logs.json` | 259 events — every mention the watcher saw, gate result, dispatch, build outcome + build-time liveness. The authoritative mention→outcome log (30-day TTL, covers the bot's whole life). |
| Health snapshot | `raw/health.json` | The bot's own computed health (box alive, queue, dead links). |
| Per-site provenance | `raw/provenance.json` | 80 `.buildthis.json` records — durable git-tracked origin (requester, brief, mentionUri) per built site. |
| GitHub Actions runs | `raw/gh-runs.json` | 361 runs — deploy.yml + the old `buildthis` dispatch path (pre-box). |
| Live HTTP sweep | `raw/site-http.json` | Every site's primary route fetched just now — current 200/down truth. |

**Not pulled:** raw Bluesky notifications. The public `searchPosts` API 403s non-browser
clients, and the bot's app-password lives only on the Hetzner box / 1Password, not on
this machine. The KV event log is the watcher's own record of every notification it
received, so it's the authoritative mention source regardless.

## Headline: it's in much better shape than the health flag suggests

`/health` says `ok:false` with "10 recent builds pushed but not live." That's a
**build-time** signal against the old subdomain URLs. Checked against a **live HTTP
sweep of all 114 sites**, the real picture:

- **~109 of 114 sites serve HTTP 200 right now.**
- **Exactly 5 sites are actually down**, all for the same one reason.
- Every site the bot ever reported as a successful build currently serves 200
  **except those same 5** (plus one early orphan, below).

The gap between "10 dead links" and "5 actually down" is the subdomain→path migration:
sites flagged dead at build time (their `<name>.bisks.net` never provisioned) were later
moved to `bisks.net/<name>` path routes and now serve fine. The stale build-time flag
never cleared.

## The one real problem: 5 sites stuck behind the Cloudflare custom-domain cap

All 5 are `custom_domain = true` subdomains with **no DNS record** — `wrangler deploy`
never provisioned the hostname. This is the known, still-open custom-domain-cap issue
(`notes/20-deploy.md`): the `bisks.net` zone hit a per-zone custom-domain limit, so new
subdomains silently fail to provision. Confirmed with `dig` — zero records for each.

| Site | Requested by | Route | Complication | Fix |
|---|---|---|---|---|
| **wheelhouse** | — (infra) | `wheelhouse.bisks.net` | none (static gallery) | migrate to path `bisks.net/wheelhouse` — **highest priority, it's the directory/gallery** |
| **solvers** | — | `solvers.bisks.net` | none (static + wasm) | migrate to path |
| **mcskeets** | — | `mcskeets.bisks.net` | none | migrate to path |
| **ratioed** | — | `ratioed.bisks.net` | Durable Object (`RatioTracker`) | migrate to path, thread a MOUNT prefix |
| **the-place** | bisks.net | `the-place.bisks.net` | Durable Object (`Canvas`) + client polling | migrate to path, thread a MOUNT prefix |

The migration recipe is proven — `notes/20-deploy.md` documents 46 sites already moved
this way. The two DO sites (`ratioed`, `the-place`) need the extra `MOUNT`-prefix care
that note describes for `immortals`/`verdict`; the other three are the simple static case.

The alternative fix is freeing/raising the cap in the Cloudflare dashboard — but that
needs dashboard access no agent has, and migrating to paths is the direction the repo
is already going anyway.

## The mention funnel (259 events)

| Bucket | Count | Status |
|---|---|---|
| Non-mutual → friendly reply tagging Rob, no build | 24 | ✅ correct by design |
| Mutual → build **confirmed live** | 72 | ✅ |
| Mutual → **live but partial** (continuable) | 20 | ✅ live, flagged WIP |
| Mutual → success, liveness unknown (pre-check records) | 85 | ✅ all serve 200 in the live sweep |
| Mutual → success but not-live at build time | 33 | ⚠️ **all recovered** except the 5 above |
| Mutual → build **failure** | 23 | see below — almost all fine |
| Dispatched, no outcome (in flight / lost) | 2 | 1 is building now, 1 is a lost early event |

### The 23 "failures" are almost all fine

"Failure" outcome status ≠ "site not delivered." Reading all 23 in full (`raw/failures.json`):

- **~11 are correct no-builds**: banter, encouragement ("keep going!"), meta-commentary,
  and debug/check requests the bot answered in-thread. Nothing owed.
- **~4 are correct refusals-by-design**: "set your own avatar" / "free my liege" — the
  bot's own login is a sealed secret, so it can't self-mutate its account. Correct.
- **~8 were genuinely-failed build attempts that a later mention successfully built.**
  Every one of these sites — `trigramonopoly`, `mechpilot`, `drivethru`, `cowlick`,
  `solitaire`, `mootdrone`, and the norvid EP (shipped as `norvidwave` an hour after the
  failed attempt) — exists and serves 200 today. The failures were superseded.

**One genuinely-open edit request** (not a down site, just an unfulfilled improvement):
`antiali.as` asked to "make drivethru better with combos / regional specialties"
(07-26 19:24) and the build failed. `drivethru` itself is live; the *edit* was never
landed. Re-taggable.

**Data-quality note (already fixed in code):** several 07-25 failures have a `replyText`
describing a *different* site's feature (e.g. a cowlick-hair request got a reply about
"share buttons"). That's the leftover-`BUILD_NOTE`-leaked-to-wrong-thread bug that
`notes/90` says was fixed later that day. These are stale artifacts, not new breakage.

## Zone-wide risk (separate from the 5 down sites): Safe Browsing

Mid-audit, the box committed a fix (`f8aac58`) retiring **`catsofatproto`**: Google Safe
Browsing flagged `catsofatproto.bisks.net` as a deceptive page, which puts a
dangerous-site warning in front of the **entire `bisks.net` zone** (all sites share it).
The trigger was that page streaming unvetted third-party firehose images + loading remote
tfjs/mobilenet scripts + running an image proxy — the shape of a compromised page to the
crawler. The box replaced it with a static retirement stub so the flagged URL serves
benign content and the Search Console review can clear the zone.

- This is the same class of issue `notes/20-deploy.md` tracks (Safe Browsing false-ish
  positives on the shared zone). `catsofatproto` was the most defensible real trigger.
- **Still open per the box's own commit note:** the live Cloudflare Worker and the
  leftover `catsofatproto.bisks.net` hostname still need removing dashboard-side; the
  commit only neutralizes what the crawler fetches.
- Worth watching whether the zone warning clears after this + the domain ages.

**Concurrency note:** that box commit ran a repo-wide `git add` at the same moment this
audit was staging its files, so `audit/` got swept into `f8aac58` alongside the
catsofatproto change (one commit, two unrelated changes, under the catsofatproto message).
Nothing was lost; left intact rather than rewriting a commit the box had just authored and
might be about to push. Flagging so the mixed commit isn't a surprise.

## Loose ends (low stakes)

- **`build-quotes`** — the bot's very first build (Rob, 07-24 06:21) reports success in
  the log but no `sites/build-quotes` directory exists and the subdomain is dead. An
  early test that was removed/renamed; predates the liveness check. Orphan in the log only.
- **`edzitronquest` route is malformed** — `wrangler.toml` has
  `routes = "bisks.net/games/edzitronquest*"` (wildcard glued on, missing the bare
  non-wildcard route). The site serves 200 anyway, but this is why it showed up twice in
  the health dead-link list (`games/edzitronquest` + `edzitronquest`). Worth normalizing
  to the standard two-route form.
- **1 lost early event** — a 07-24 Rob mention dispatched but never recorded an outcome
  (pre-box, when the Action path could drop the outcome POST). Cosmetic.
- **GitHub Action fallback path** — 25 of its 41 dispatches failed before the box cutover.
  That path is now dormant (the box handles builds), so those failures are historical.

## What to do, in order

1. **Migrate the 5 dead subdomains to path routes** — `wheelhouse` and `solvers` first
   (wheelhouse is the gallery; solvers was publicly reported broken). Then `mcskeets`.
   Then the two DO sites `ratioed` + `the-place` with the MOUNT-prefix care.
   → gets us to **all-green / all-200**.
2. **Clear the stale health flags** — after the migrations, the build-time `liveVerified`
   flags won't retroactively clear; consider a one-shot re-check or just let them age out
   of the 20-event window.
3. **Fix the `edzitronquest` route** to the standard form.
4. **Re-run the `antiali.as` drivethru edit** (re-tag, or hand-build).
5. *(after green)* Functionality spot-checks — the interactive sites (games, DO-backed
   canvases, OAuth flows) only got an HTTP-200 check here, not a real does-it-work pass.
