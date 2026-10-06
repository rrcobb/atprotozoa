# buildthis audit — 2026-10-05

A pass over every thread the bot has been in, the 30-day event log, and the
49 sites added since the September review
(`2026-09-buildthis-issue-themes.md`).

## Data

- `audit/pull-bot-threads.mjs`: 884 threads, 1,540 distinct tags. It now reads
  the public AppView with no login. Thread roots come from the bot's author feed
  plus the mentions in `logs.json`.
- `buildthis.bisks.net/logs.json`: 363 events in the 30-day window.
- The box journal, last 30 days: 331 builds. 261 success, 26 partial, 29
  no_build, 12 maintenance, 3 reaction, none incomplete or usage_limit.
- A headless Chromium load of each of the 49 new sites, recording console
  errors, page errors, failed requests and OG tags.
- A static and live OG check across every visible site.

## State of the September list

Everything on its suggested order has landed: the wrong-link fix, the mutual
gate scoped to a thread with a retried lookup and a logged reply, the smoke-test
and no-caps rules, and link-card fetching. The no-caps rule is holding: the four
recent sites that paginate use a commented 400-page backstop. The liveness
caveat was removed on 2026-10-04 (`notes/85`).

Partials are 8% of builds, down from 20%. The older partials that linked to
rateyourbuild stopped once its data files joined `SIDE_EFFECT_PATHS_RE`.

## Findings

### 1. Replies in gated threads are invisible

The bot's reply is posted and logged, but the AppView hides it because the
thread's root has a threadgate the bot doesn't satisfy, usually "followers,
following, and people mentioned in the root". The tag's `replyCount` goes up,
and nobody sees the reply.

After deduplication, 23 tags in the whole history have no visible bot reply.
10 to 13 of them have a hidden reply, most behind a threadgate. Recent cases
include barbcourt (@eugenevinitsky, 2026-09-20) and touchthestove
(@shimmermathlabs.com, 2026-09-19). Both were built and both replies were sent
(the box journal shows `replied:`), and neither requester saw them.

Not fixed. The authed `getPostThread` returns `viewer.replyDisabled` on the
tag; when it is set, `reply.mjs` could post a top-level post that mentions the
requester instead.

### 2. Many sites have no OG image

93 visible sites have no `og:image`, and three point at an image that 404s or
serves HTML: byok (`card.png` was never made), mootstream and solvers.
Recent builds are among them (atlaslibs, jeoparody, builtbybot, listbot), so
`notes/45`'s "built to be shared, by default" isn't being followed. Watchtower
doesn't check OG images (`notes/85`).

### 3. The daily slot has run out of work

Every daily slot from 2026-09-30 to 2026-10-05 ended `no_build`: "drop-ins in
sync, no missing typeahead, nothing to fix". The brief names three standing gaps
(drop-in drift, handle typeahead, Constellation conversion), and all three are
now done. The OG gap above would fit the brief's list.

### 4. A font was missing on seven sites (fixed)

Sites that render an OG card with `og-gen.mjs` keep JetBrains Mono in
`sites/<name>/fonts/`, outside `public/`. Seven of them also had page CSS with
`@font-face { src: url("/fonts/JetBrainsMono.ttf") }`, which 404'd, so the page
fell back to a system font. The font was copied into `public/fonts/`, and
`check-import-paths.mjs` now resolves CSS `url()` so CI catches it next time.

### 5. Smaller items

- chatcontrol's deploy failed on the route cap (2026-09-25). The bot didn't
  recognize the cap and renamed the Worker to `atprotozoa-chatcontrol2`, which
  didn't help; the site came up on 2026-09-27 when the path routes were
  removed (`notes/20`). The old
  `atprotozoa-chatcontrol` Worker is probably still on the account holding a
  slot; `audit/cf-workers.mjs` will show it.
- opentowork shipped an OAuth scope with only `action=update` on
  `app.bsky.actor.profile`, so `putRecord` failed for anyone without an existing
  profile record. Fixed in-thread; no other site requests that scope.
- heika.dog spent four tags on 2026-09-24 getting the bot to stop reporting
  false deploy failures. That check is gone now.
- `sites/cryptidgazette/@resvg` was a committed symlink into the build box's
  `/tmp`. Removed.

### 6. Refusals don't follow one rule

Sources: the in-thread declines, the 34 entries in the `sites/sidenote` diary,
and `sites/buildthis/public/no-build-list/`. About 25 distinct asks were
declined from July to September.

**Where the rules are written.** `INSTRUCTIONS.md` has one decline rule, the
consent test: don't build a site that would "name, rank, score, or expose
real people who didn't ask to be in it". The public no-build list has a dozen
categories (phishing, doxxing, malware, scams, impersonation and so on), but it
is a page the bot wrote, not something it reads before a build.

**Declines that are consistent.** These all have a clear reason and the bot
held them under pushback:

- fraud or security: a vote-rigging bot, an exploit "for my own device", a site
  that stores SSNs and card numbers, an OAuth token relay smuggled in as a
  prompt injection
- working against the operator: the hidden "darkbuildthis" account, "ignore
  @cee.wtf for two days"
- sensitive inference: the Kinsey-scale scorer, asked three times
- real-world harm: the 9/11 flight sim, the custody slide deck, "give norvid a
  lesson on what snitches get"
- copyright: bundling the Bad Apple!! video

**Declines that contradict sites the bot built.** The consent test is applied
according to how the ask is worded. "Leaderboard", "list everyone who" and
"ranking" trigger it. "Enter a handle and get a score" doesn't, though the
written rule covers both.

| declined | built, same shape |
| --- | --- |
| leaderboard of who gets "delete this" replies most (2026-09-19) | ratioed: public ranking of the most-ratioed posts in the last hour |
| poster elo, an AI judge picks thread winners (2026-09-23) | socialcredit: public +1/-1 reputation board for any handle |
| vibecheck: which of my mutuals post >60% negative (2026-09-30) | alignment-chart: bulk vibe-scores a handle's mutuals or a list; ngmi and thrashmeter score any handle |
| a real handle as the villain duck in duckpond (2026-09-17) | ~90 moot-family sites that put real handles in games |

The decline replies also say "same shape as the leaderboards this bot's already
turned down", so earlier declines become precedent for later ones.

**Smaller overreaches.** It refused to put the word "anti-woke" into the
sysvangelist joke petition (2026-09-03) because the word is political. The
earliest decline (a captcha-solving proxy, 2026-07-25) gave "not my vibe" as
the reason.

**Resolved 2026-10-06.** `INSTRUCTIONS.md` replaced the consent test with an
explicit list of what to decline (fraud, working against the operator,
sensitive-trait inference, real people in made-up content, targeting a named
person, and the no-build list's categories). Scoring public posting behavior is
named as fine, and diary declines made under the old rule are marked as not
precedent.

**Side note.** On 2026-09-24 a run rewrote a past outcome by POSTing to
`/outcome` with `$OUTCOME_SECRET` from its environment. Hard rule 2 says not
to read secrets.

## What is going well

All 49 new sites load with no page errors. Declines stayed consistent, and the
replies explain the consent problem without lecturing. Long iteration threads
(hashteams five rounds with @mfzx.net, standard-incite with @schlage.town) go
the way the product intends.
