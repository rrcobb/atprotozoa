# Bot ideas — riffing

Loose brainstorm, not a plan and not conclusions. Five directions Rob wants,
plus what's appealing / awkward about each. Companion to
`notes/83-atproto-surface-map.md` (what the protocol offers) and
`notes/82-other-bots.md` (earlier riff on separate bot accounts).

## 1. Image / video gen bot

Tag it, get a generated image or video back — posted as a real blob in its own
repo, not a link to a page.

Why it's appealing: it's the most obvious *missing modality*. Everything the
current bot makes is a webpage; the whole scene passes around screenshots of
those pages. A bot that returns media natively skips the click. And per the
surface map, the mechanism is already sitting there — `uploadBlob` →
`app.bsky.embed.images` / `app.bsky.embed.video`. The repo has touched both
(twice), so it's not exotic.

Riffs:
- The gen output *is* the reply. No site at all — a real departure from
  buildthis, and maybe the point.
- Video is the more distinctive move; the ecosystem has almost no video toys.
  `app.bsky.video.uploadVideo` + `getJobStatus` is an async job flow, so the bot
  needs a "still rendering" state, which buildthis already has a pattern for
  (the like-as-acknowledgement).
- Could be the render arm for other bots rather than user-facing: "here's a
  scene, give me a frame."

Awkward bits: it's the one idea with a real content-safety surface, since output
isn't code review-able the way a site is. The corpus already has one instance of
a request Rob didn't want on his domain, and images are a lot harder to eyeball
after the fact than a diff. Also the only idea here with meaningful per-call cost
beyond tokens.

## 2. Physics-sim / fluoddity-flavored builder

A builder bot with a *taste*, rather than a general one. Narrow domain: physics
sims, generative visuals, simulation toys.

Why it's appealing: the corpus's most-liked builds skew this way already —
everzoom (Mandelbrot deep zoom), fourk (4kb raymarched shader), cowlick (fur
shader), lavalamp (inelastic collisions), delaunay-maze, turtle-garden
(L-systems), beanjar. A bot that *only* does this could be much better at it than
a generalist, because its prompt and its reference material can be specialized.

Riffs:
- The specialization could be the personality — it declines anything that isn't a
  sim, the way `declined` is a bit.
- Good candidate for a *different model or a different prompt* than buildthis,
  which makes it a real experiment rather than a clone.
- Shader/sim output is very screenshot-able, so it pairs naturally with idea 1.

Awkward bits: narrower audience, and the line "is this a physics sim?" is fuzzy
enough that it may spend a lot of replies negotiating scope.

## 3. Cron-driven infra observers

Not tag-triggered at all — things that wake up on a schedule and look at
something.

Why it's appealing: this is the category the repo most obviously lacks, and the
surface map makes the case — several sites read Jetstream live and throw it all
away; nothing persists. Also the verifier idea from `notes/82` lives here: a
whole class of trailing-slash breakage went unnoticed for days because nothing
was checking.

Riffs:
- **Link/health checker.** Fetch every site's URL, confirm it 200s and its
  scripts load. Silent unless broken.
- ~~**Jetstream tailer → durable index.**~~ Dropped, see `notes/88`. The
  dataset/annual-review idea should be built off *our own* records
  (`net.bisks.*` via `listReposByCollection`) rather than a copy of the network.
- **PLC audit log watcher.** Free, public, nobody's watching it. Who migrated
  PDS, who rotated keys, who changed handles.
- **Deploy/spend watcher.** The Cloudflare custom-domain cap and the Anthropic
  credit exhaustion both got discovered by users hitting broken things.
- **Daily digest poster.** What shipped, what broke, who tagged.

Awkward bits: crons that post are the easiest way to become noise. Strong bias
toward silent-unless-actionable. Also the first category here with a standing
cost when idle (a tailer has to stay up).

## 4. A bot that manages crons

Tag it to *schedule* something. "Every morning post X." "Check Y hourly."

Why it's appealing: it's the meta version of 3, and it's a genuinely different
primitive from anything here — buildthis is request/response, this is
request → standing behavior. It also matches something the corpus wanted as a
joke (norvid's "@ any bot 'keep going' 100 times spaced 30 seconds apart so I can
take a vacation") which is really a scheduling ask.

Riffs:
- Cron Triggers on Workers are the obvious substrate; the buildthis watcher
  already runs this way.
- The interesting design question is *whose* cron — one shared scheduler, or does
  each user get their own scheduled jobs? The latter is closer to "my own bot"
  without minting per-user accounts.
- Natural companion to the digest/observer bots: they become jobs it manages
  rather than separate deployments.

Awkward bits: the highest blast radius of anything here. A scheduled thing that
posts wrongly keeps posting wrongly at 3am. Needs a kill switch and probably an
expiry by default (jobs die after N runs unless renewed) — a standing behavior
created by a passing tag should not be immortal.

## 5. Repo janitor / improver bot

Tag it and it goes and *improves* something — perf, dead code, consistency,
broken links — rather than building new.

Why it's appealing: the corpus shows buildthis is already decent at this when
asked. carbonadoks got a fleet-wide trailing-slash redirect across 110 sites and
a typeahead sweep across ~30 from two tags. ver.ooo got `pnpm check:imports` out
of one. apex.atproto.ceo's WebGL crash produced a real perf fix (native AA + a
2048px shadow map + full-res bloom all at once, plus context-loss handling). The
capability is there; nothing *invokes* it except a human noticing.

Riffs:
- Could be cron-driven rather than tagged — a weekly sweep that opens its own
  small fixes. Merges idea 3 and 5.
- Pairs with the verifier: verifier finds it, janitor fixes it.
- The "20% complete, take it to 100%" ask (cee.wtf) is this bot's whole job
  description — it got asked of buildthis once and produced a half-finished
  thing, because finishing isn't what buildthis is shaped for.
- Repo has ~190 sites now. There's a lot of drift to clean.

Awkward bits: unsupervised edits to 190 live sites is the scariest write pattern
here. Wants small scoped diffs and probably a report-only mode first. And "make
it better" is exactly the kind of vague brief that produces churn.

---

## Cross-cutting

**Things that keep recurring across all five:**

- ~~*A persistent index* is upstream of 3, 4, and 5.~~ Dropped — see `notes/88`.
  Observers compare against small saved state (last-seen values), not an archive
  of the network. The digest bot queries the AppView for "today" like everything
  else here does.
- *Silent-unless-actionable* is the right default for everything cron-driven.
- *Expiry by default* for anything that creates standing behavior.
- The **feed generator** surface (untouched, per the surface map) is a
  distribution channel none of these have considered — a bot could publish
  results as a subscribable feed rather than as posts or pages.

**Rough sort by "cheap and safe" vs "expensive or scary":**
- Cheapest: link/health checker, PLC watcher, digest poster.
- Cheap but new-shaped: physics-sim builder (mostly a prompt change).
- Real cost: image/video gen (per-call).
- Real blast radius: cron manager, repo janitor.

Nothing here is decided — this is the menu, not the order.
