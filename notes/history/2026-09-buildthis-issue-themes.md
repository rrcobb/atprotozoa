# buildthis issue themes — 2026-09-17

A read of everything the bot has been tagged in, replied to, or quoted in, to
find what is going wrong from the users' side. Snapshot taken 2026-09-17 ~19:00
UTC. Re-run the pull with `node audit/pull-bot-threads.mjs` (reads the bot's
app-password from 1Password at runtime; nothing is written to the repo).

## Data

| Source | Size | Notes |
|---|---|---|
| `listNotifications`, all pages | 3,490 notifications | 1,168 mentions, 673 replies, 149 quotes; the rest are likes, follows, reposts |
| `getPostThread` for every distinct root | 603 threads, 1,010 distinct tags | 2025-09-25 to 2026-09-17; nearly all after the 2026-07-24 launch |
| `buildthis.bisks.net/logs.json?limit=500` | 500 events | 2026-08-23 to 2026-09-17, the KV log's 30-day window |

Six agents each read one slice (five time slices of the threads plus the
non-success half of the build log) and reported themes with examples. This note
is the merge, checked against the watcher and builder code where a theme
pointed at a specific mechanism.

One artifact to know about: the thread export captured 87 posts under two roots
(a reply-notification's `reasonSubject` and the real root). Agents reading a
single slice saw these as "duplicate threads, one copy unanswered". That is the
export, not the bot. After deduplication, 55 of 1,010 tags have no bot reply
beneath them (20 in September), and some of those are Rob's own "go ahead"
posts where the reply landed on the parent.

## Build-log outcomes, last 30 days

| Disposition | Count | Live-verified |
|---|---|---|
| success | 361 | 269 yes, 90 no, 2 unrecorded |
| partial | 49 | 36 yes, 13 no |
| no_build | 39 | n/a |
| non-mutual, not dispatched | 50 | n/a |
| incomplete | 1 | n/a |

About 20 of the 39 `no_build` events are the bot correctly answering a
compliment or question, logged with `status=failure`. The real failure rate is
lower than the log suggests.

## Themes, ranked by how much they hurt users

### 1. The reply links the wrong site

Confirmed mechanism. Every agent slice after 2026-08-29 found replies that
linked `rateyourbuild.bisks.net` for an unrelated build (mootfluence,
shelfspace, kinesin, friedcluster, blockcurve, a sankey appview, a bookshelf).
17 partials in the log carry `built=rateyourbuild`; roughly 8 are real
rateyourbuild work. Before 2026-08-29 the same shape pointed at
`receipts.bisks.net` (thumbjack, feedwalk, kolpelor).

Cause: `box-build.sh` names the built site from `BUILD_RESULT` when the agent
wrote one, else from the first changed `sites/<name>` path. A run killed by
max-turns never writes `BUILD_RESULT`, so partials always take the derived
name. `INSTRUCTIONS.md` has a standing order (added 2026-08-29) to regenerate
`sites/rateyourbuild/public/data/catalog.json` on every run, so that path is
dirty on every build and sorts first whenever the agent already committed its
own work. The receipts archive had the identical problem and was fixed by
adding it to `SIDE_EFFECT_PATHS_RE`; the rateyourbuild catalog (and
`bugfixes.json`) need the same exclusion. Every build commit since 08-29
touches `sites/rateyourbuild` (see `git log -- sites/rateyourbuild`).

Fix: add the catalog and bugfixes paths to `SIDE_EFFECT_PATHS_RE` in
`box-build.sh`. Consider also having the agent write `BUILD_RESULT` as soon as
it picks a site name, before building, so a max-turns kill still carries it.

### 2. Partial builds push the retry onto the user

49 partials in 30 days, about 1 in 9 builds. Users re-tag with "keep going"
and it usually works, but several never resumed (hypertower, apocrypha,
heartpunk's spoonerisms, cancrusher after three rounds). Some partials are
mislabeled finished work: on 2026-08-29 @angussoftware.dev said "please
continue" and the bot found nothing left to build. Disposition is set from a
non-clean exit, not from what landed.

Worst hit: @angussoftware.dev (7 of 10 partial, long multi-part briefs) and the
autonomous daily slot (5 of 7, no brief so it self-scopes too big).

Two sub-bugs in the reply itself:

- `fitToLimit` keeps the template tail whole and truncates the agent's note
  from the end, so the description of what was built is what gets cut. About
  20 replies per slice end mid-word with "…" right where the caveat was.
- The partial template is long enough that with a note there is little room
  left; 37 of 49 partials are bare boilerplate with no description.

Options: auto-continue a partial once before asking for a re-tag; shorten the
partial template; have the agent write a shorter note on partials; verify a
"partial" against the tree before labeling it.

### 3. "Built it" when the URL is dead or the site is broken

Two shapes.

Deploys that never landed (about 14 reports in mid-August, 5 in late August,
fewer in September): pnpm frozen-lockfile (twice), the 256-job matrix cap, a
route falling off the zone, a Cloudflare asset-upload blip with no retry, one
run where the site was never written. `box-build.sh` polls the URL for ~90s
and records `liveVerified`, but sends the reply either way. 90 of 361
successes in the log were not verified live. The live check also passes on an
existing site whose edit did not deploy, since the old page still serves.

Sites that load but do not work (about 10 per slice): a modal that cannot be
closed (three separate sites, same `[hidden]` vs `display:flex` bug), a module
importing a never-exported symbol, a render loop dead on a thrown error, login
broken on a leading "@", NaN minimap coordinates, a negative bit-shift. Users
are the QA. Nothing in `INSTRUCTIONS.md` requires loading the page and
exercising the primary control before declaring success.

Related: "already fixed, nothing to do" replies to users looking at a still
broken deployed site (vadrone voices, numbergrid, cartouche, fleetwatch). The
check is against the source tree; the user is on the deployed page.

Options: when `liveVerified` is false, say so in the reply instead of "give
the deploy a minute"; for edits, verify a content marker rather than a 2xx; add
a smoke-test step to the builder instructions (headless load, console errors,
click the main control).

### 4. Mutual gate misfires

The gate is per-mention and runs before any read of intent, so it fires on:

- thank-yous and questions (@rey-notnecessarily, @yaaliannar, @chinapanda6661)
- follow-ups and bug reports in a thread the bot is already building for
  (@lauragiron mid-thread, @eugenevinitsky "keep going please", @caesar.dev's
  bug report on a site built for them, @vikanezrimaya's perf report)
- bystanders offering useful context (@jurph's Ashby warning, which
  @norvid-studies then re-posted under his own handle to get it through)

Users have learned to launder asks through a mutual. Gated asks that Rob does
not see die there (@cass.scorpio.city: "man i'm so sad i didn't get to see
this"; @glatteis's water-tap map; @scoiattolo's follow sankey, built 9 hours
later when a mutual re-asked).

Two code facts from `sites/buildthis/src/index.ts`:

- The friendly reply is sent once per author per 30 days. A non-mutual's
  second tag, including a bug report on their own site, gets silence. The
  reply is also not written to the event log, so the log shows an empty reply
  for all 50 non-mutual events.
- `robMutual` fails closed on any non-2xx from `getRelationships`. @heika.dog
  (2026-09-12) and @psingletary.com (2026-09-04) were each dropped as
  non-mutual on a day they show as mutual on either side. One event
  (@words.bsky.social, 2026-09-04) has `mutual` unset and `dispatched=true`.

Options: treat a non-mutual reply inside a thread the bot has already built in
as continuation of an authorized ask; retry the relationship lookup before
failing closed; log the gate reply; surface pending gated asks to Rob
somewhere other than the thread itself.

### 5. Brief assembly misses what the user pointed at

About 8 per slice. Link cards and external URLs are not fetched (the reddit
post @personhood.removal.surgery wanted as the base; "build this on atproto"
pointing at a link card; a screenplay in a PDS record where the user wanted the
bot to read it, and got a record viewer instead). Images sometimes do not reach
the builder: on 2026-08-21 the bot told @shibbi.me "no, I can't see
screenshots", contradicting `MAX_BRIEF_IMAGES`; the download is best-effort
and its failure is silent to the user. Long reply-chain specs (a 32-part and a
73-part one from @fromthewestmeadow.com) exceed the 10-ancestor walk and 20k
cap; the 73-part one never got a build.

Also: a bare "👆" or "build this" tag carries the ancestor's words but not its
intent, which produced two refusals on misread briefs (hmans' block tool read
as mass-targeting; the omarchy "anti-woke" ask refused on a wrong factual
read).

Options: fetch link-card targets and quoted records into the brief; tell the
user in the reply when an image or link could not be read; when the reading is
ambiguous, state which one was taken.

### 6. Caps and pagination

The single most repeated correctness complaint from power users. "Did you do
the 'first couple pages of listrecords' thing again and pull 1% of the data?"
(@cee.wtf, mootvelocity). Rob asked for no caps on 2026-08-28 and the bot found
the same cap copy-pasted into ~60 sites. The bot has said the bulk-read rule
is "locked in" at least three times, and new sites keep shipping with a cap.
Either the rule is phrased as advice or it is buried; check where it sits in
`INSTRUCTIONS.md`.

### 7. Refusals: right calls, rough delivery

Refusals hold under pressure (Kinsey scorer, 9/11 game, custody deck, mass
block, a real prompt-injection attempt on 2026-09-16) and users mostly accept
them. Three rough edges:

- No memory of a prior decline across runs, so a re-ask burns a full build
  each time (four runs on the Kinsey scorer).
- A decline can carry a success suffix. The `sidenote` diary case was fixed
  via `SIDE_EFFECT_PATHS_RE`; the rateyourbuild case in theme 1 is the same
  bug back.
- Publicly calling a mutual's ask "a prompt injection" (2026-09-16,
  @antiali.as) was harsher than needed even though the call was right.

One consent failure: polycule (2026-08-17) seeded real accounts as "opted in"
after the bot had refused the gossip framing one tag earlier. Removal took
three rounds because the first "done" cleaned only the rendered page, not
localStorage or the share cache. beatupbuddy (2026-08-05) had the same shape:
the consent test was applied on pass two, not pass one.

### 8. Silent drops

After deduplication, 55 tags in the whole history have no bot reply beneath
them. Known causes already patched: reply-notifications carrying mention
facets, and Bluesky dropping a labeled author's mentions account-wide (cee.wtf,
2026-09-08, three "hello" tags then "im making my own"). Remaining candidates
in `audit/raw/bot-threads/unanswered.txt`. A visible "queued" ack separate
from the like would let a user tell "not seen" from "working on it".

### 9. Scope of self-edits

One tag changed ~190 sites (a prefill link for one user, applied as a
standing order). A restyle overwrote the original instead of forking
(distrotycoon). `INSTRUCTIONS.md` has no rule for fork-vs-replace or for
scoping a repo-wide change to the asker.

## Single incidents, resolved

- pnpm frozen-lockfile, 2026-08-25 to 08-30 (`2026-08-pnpm-lockfile-outage.md`).
  Still-armed trap: `deploy.yml` selects sites by diff, so a fix outside
  `sites/<name>/` does not redeploy that site.
- Bluesky moderation label dropping @cee.wtf's mentions; search sweep added
  2026-09-10.
- GitHub Actions outage 2026-08-06; 256-job matrix cap 2026-08-13.

## What is going well

Worth stating because it is most of the volume. Tag-to-live is routinely 10 to
20 minutes. Long iteration threads (gpuburn five rounds in 90 minutes,
thisminute four passes in 80, velvetrope, goodsky, meadowfolio) are the
product. Root-cause replies (percent-encoded DID colons, a 74MB CAR over a
64MB cap, split-surrogate `encodeURIComponent`, a firehose reconnect race) are
specific and users accept them. Refusals are gracious and hold. The self-edit
loop works: mobius mode, the theme box, the sharing style all entered the
instructions from a tag.

## Suggested order

1. Add the rateyourbuild catalog and bugfixes paths to `SIDE_EFFECT_PATHS_RE`
   (theme 1). One line, kills the wrong-link bug.
2. Make the reply honest when `liveVerified` is false, and verify a content
   marker for edits (theme 3).
3. Fix `fitToLimit` so the note keeps at least a sentence, and shorten the
   partial template (theme 2).
4. Thread-scope the mutual gate and retry the relationship lookup (theme 4).
5. Add a smoke-test step and a hard no-caps rule to `INSTRUCTIONS.md`
   (themes 3 and 6).
6. Fetch link cards and quoted records into the brief; report unread inputs
   (theme 5).
