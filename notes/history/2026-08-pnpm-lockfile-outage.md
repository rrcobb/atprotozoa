# pnpm-lock.yaml desync silently blocked every deploy, 2026-08-07

`@handackett.bsky.social` tagged the bot on the `quotebucket` build post: "nothing
seems to have appeared yet, can you look into it?" `quotebucket`'s client-side
quote-detection logic was fine (verified live against the AppView — norvid's
quote posts match `isQuote`'s filter correctly), and the wrong first guess would
have been to start debugging that code. The actual symptom was one level up:
`https://quotebucket.bisks.net/` 404'd — **the site had never deployed at all.**

## Root cause

`deploy.yml`'s `check` job runs `pnpm install --frozen-lockfile` before anything
else; `deploy` only runs if `check` passes. `pnpm-lock.yaml` records every
workspace member (`sites/*`) as an `importers` entry. Adding a new site means
adding `sites/<name>/package.json` — a new workspace member — but several builds
in a row added the package.json **without regenerating the lockfile**, so
`pnpm-lock.yaml` didn't list the new importer. `--frozen-lockfile` fails hard on
that mismatch (it won't silently resolve), so `check` failed, `deploy` was
skipped (`needs: [check, changes]`), and **nothing in that push deployed** — not
just the new site, *every* directory touched by that commit.

The break traces to the `lovecoupons` build (commit `8ff0e03`, 2026-08-07
06:38 UTC) — its `package.json` added a new workspace member and the lockfile
was never touched in that commit. Every push after it inherited the same broken
lockfile and kept failing `check` the same way, all the way to `quotebucket`
(`c30af78`) and beyond — 13 sites' worth of builds queued up completely
undeployed with no alert anywhere: `bskyxp`, `didscope`, `intentometer`,
`liquidchess`, `lovecoupons` itself, `nothoney`, `quotebucket`, `sidenote`,
`skeetin`, `sleepsim`, `tamagotchip`, `trashpanda`, `windchimes`, plus `apex`.
Confirmed via `GET /repos/rrcobb/atprotozoa/commits/<sha>/check-runs` on each
commit in that range — `check: failure`, `deploy: skipped`, every time.

## Why nobody noticed sooner

Nothing watches this. A failed `check` produces a red X on the commit in GitHub,
but the buildthis loop doesn't check its own push's CI status after handing off
to the harness, and there's no other alerting wired up. It took a human noticing
a specific site never went live to surface an outage that had actually been
silently eating every build for hours.

## Fix (2026-08-07)

1. Ran `pnpm install` (not frozen) at the repo root — regenerates
   `pnpm-lock.yaml` to match every `sites/*/package.json` on disk. Verified
   `pnpm install --frozen-lockfile` then succeeds, plus `pnpm check:imports` and
   `node audit/build-gallery.mjs` both still pass (they were never the problem).
2. `deploy.yml` computes changed dirs from `git diff <push-before> <push-sha>` —
   a push containing *only* the lockfile fix wouldn't touch any `sites/*`
   directory, so none of the 13 backlogged sites would re-enter that diff and
   they'd stay undeployed even after `check` started passing again. Appended a
   one-line dated comment to each affected site's (+ apex's) `wrangler.toml` —
   config-only, no behavior change — specifically to force them back into the
   changed-dirs diff so this one push redeploys the whole backlog alongside the
   real fix.

## Lesson for next time

See the new note in `notes/20-deploy.md` ("New workspace member needs a lockfile
update, or `check` fails silently for everyone after it") — check
`git diff --stat -- pnpm-lock.yaml` after adding any new `sites/<name>/package.json`
and expect a `sites/<name>: {}` entry to appear. If it doesn't, run
`pnpm install` at the repo root before finishing the build. This is the kind of
failure that doesn't show up locally (nothing in a normal build session runs
`--frozen-lockfile`) and won't have a red flag anywhere the bot looks — the only
way to catch it early is to check for it on purpose.

## Recurrence, 2026-08-14/15

Same failure mode, different trigger. `dave.9000ish.uk` tagged the bot asking it
to "fix the deployment of bestofcee" (in a thread where `cee.wtf` had asked for
the site the day before). `bestofcee.bisks.net` 404'd — the site had never
deployed.

Root cause traced the same way as before: `sites/1001nights`'s build (commit
`a08fb1e8`) added a `@resvg/resvg-js` devDependency to its `package.json`
without regenerating `pnpm-lock.yaml`. `bestofcee`'s own lockfile entry was
never the problem — it has no dependencies, and a zero-dependency workspace
member doesn't trip `--frozen-lockfile`. The 1001nights drift did, and it broke
`check` for **every push for the next 25 commits**, `bestofcee`'s among them —
confirmed via `GET /repos/rrcobb/atprotozoa/commits/<sha>/check-runs` on each
commit from `a08fb1e8` through `75d36f6d`, all `check: failure`. The next push
(`493d6e40`, an unrelated `voidshout` edit) happened to run a non-frozen
`pnpm install` and fixed the lockfile going forward, but its own diff only
touched `sites/voidshout` — so `check` started passing again without
redeploying any of the 21 directories backlogged behind it. Most of those got
swept back into a deploy by a later, unrelated edit to the same site; **eight
did not** and were still stuck as of 2026-08-15: `1001nights`, `bestofcee`,
`freakout`, `likescore`, `logs`, `mootdrone`, `moottery`, `runway` (three —
`1001nights`, `bestofcee`, `moottery` — had never deployed at all and 404'd;
the other four were live but serving the pre-outage version, silently stale).

Fix followed the 2026-08-07 precedent exactly: a one-line dated comment in each
of the eight sites' `wrangler.toml` (config-only, no behavior change) to force
them back into a push's changed-dirs diff.

**What's still missing**: nothing watches `check` for failure, so this will
recur a third time under a different trigger. The backlog is also only found by
manually diffing "sites touched while `check` was red" against "sites touched
since" — there's no standing script for it. A real fix would be either (a) a
step in the build loop that checks `git diff --stat -- pnpm-lock.yaml` and
fails loudly if a touched `package.json` has no matching lockfile change, before
the harness ever commits, or (b) a scheduled job that polls recent run
conclusions and flags a red `check` on `main`. Neither exists yet.
