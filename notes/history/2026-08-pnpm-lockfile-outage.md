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
