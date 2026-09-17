# Testing

Nothing blocks on tests. `deploy.yml` does not run them, and a red test will
not stop a push — `notes/history/2026-08-pnpm-lockfile-outage.md` is what a
blocking check looks like when it goes wrong (CI silently ate every deploy for
hours, twice). Tests here are a tool, not a gate.

## The two levels

**The smoke floor** — `audit/smoke-site.mjs <site>` plus `pnpm check:imports`.
Runs on every build, catches a module that can't load or an asset path that
would 404. `sites/buildthis/builder/INSTRUCTIONS.md` has the full rule.

**Site tests** — `sites/<name>/tests/*.test.mjs`, `node --test`, `node:assert`,
no dependencies. Three sites ship them today: `voidshout` (49), `patientzero`
(25), `likescore` (20) — 94 tests, all green. `sites/voidshout/tests/` is the
reference.

```
node audit/run-tests.mjs <site>   # one site; exits non-zero if it fails
node audit/run-tests.mjs          # every site with tests; always exits 0
pnpm test                         # same as the sweep
```

The single-site form is in the builder's floor, so a build that touches a site
with tests runs them. It is a quiet no-op for the ~660 sites with none, which
is why it can be run unconditionally.

## What's worth a test

Logic you can call without a browser and would otherwise re-verify by hand: a
parser, a scoring formula, a geohash, a search ranker. Not rendering, not
layout, not anything whose failure is obvious on the page.

## Why there is no fleet-wide functional check

`notes/history/2026-07-buildthis-audit.md` left "functionality spot-checks" as
an open item — watchtower proves a site serves the right *kind* of bytes, not
that its buttons work. That gap is real, but it was checked on 2026-09-17 and
the cheap ways to close it find nothing:

| check | result |
| --- | --- |
| `node --check` over all site JS | 1443 files, 0 syntax errors |
| OAuth `client_id` matches its host | 66 sites, 0 mismatches |
| OAuth `redirect_uris` on own host | 0 problems |
| OAuth metadata serving as JSON in prod | 66/66 correct |
| integer-typed lexicon fields vs. write paths | 54 flagged, all false positives |

The integer check was the most promising, since the float-into-integer bug
shipped independently in `padmoot` and `paintmoot`. Every flag was a read path
converting back to a float, or a `Math.round` the matcher misread. The write
paths round correctly and the lexicon descriptions document the fix.

What's left — does a click handler do anything — is the part that does not
generalize. Every site is a bespoke design with no shared selector or flow, so
a real check is per-site work at ~660 sites, and those scripts would rot faster
than the bot rebuilds the sites. Importing the modules does not substitute:
module-scope code is nearly all the smoke floor already runs, and the
interesting logic hangs off event handlers.

Hence the shape above. The builder tests the thing it just built, when there is
something worth testing; the sweep runs out of band; the fleet is watched for
structural breakage by `watchtower/` (`notes/85`) rather than functional
breakage by anything.
