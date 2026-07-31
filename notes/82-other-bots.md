# Other bots worth making

Companion to `notes/81-beyond-buildthis.md`. That one asked "what else could
buildthis build." This one asks a different question: **what other taggable bots
should exist alongside it?** Not features of buildthis — separate accounts with
their own handle, their own trigger, their own job.

Same corpus (204 threads the bot was tagged in, 2026-07-24 → 07-31).

## What the corpus suggests about multi-bot

There's already a working ecosystem here, and it's one of the more interesting
things in the corpus. Live bots in these threads: `@buildthis`, `@minomobi` (a
second build bot with a different design), `@attie.ai`, `@topchicken`,
`@impostorbel`, `@norvidlike`, `@void.comind.network`,
`@reminder-bot.juni-is.gay`.

Three observations worth carrying into any new bot — a week of threads, so read
these as leads rather than conclusions:

**1. Bots interoperated through public JSON, and it worked.** buildthis published
`crossbreed/registry.json` CORS-open in mino's own registry shape, then read
mino's live `deploy-registry.json` (47 real surfaces) back. That's a real
integration between two independently-built bots with no coordination beyond a
thread. The lesson: **a public, CORS-open catalog endpoint is the integration
surface.** Any new bot should publish one on day one.

**2. Different trigger UX is a live, unsettled design question.** From the
buildthis/minormobius exchange:

- mino: *"I'm selfishly keeping direct replies trigger build. I don't wanna be
  tagging."*
- Rob: *"good to have different tag ux's in the wild too, to see what feels
  right"*
- mino: *"I do think my pattern is confusing people and pretty urgently needs
  explanation (as well as the nature of the allowlist). Maybe a help function
  would be useful."*

Also from Rob, on naming: *"the names get chosen so early! deferring the name til
later seems like it'd be a good win"* — mino agreed it was annoying. A new bot
gets to pick differently on both axes.

**3. The best requester in the corpus was a bot.** `@void.comind.network` filed
what amounts to a proper bug report: a spec, then a *failing test case* (17-post
four-voice thread → 502, `text.indexOf is not a function`), then a retest
confirming the fix, then a remaining semantic edge with a proposed rule
(*"require unresolved to cite an explicit question, or return null"*). Its own
summary: *"I supplied the specification and failing test; buildthis supplied the
code; bisks supplied change approval."*

One data point, but a suggestive one: **a bot may be a better client of a bot
than a human is** — structured, reproducible, testable input. Worth designing
new bots assuming other bots will be a caller.

## The blocker, restated

Per `notes/81`, everything here needs its own DID + app password. That's the
thing `builder/INSTRUCTIONS.md` forbids the builder from touching. **But that
rule constrains the builder, not Rob.** These are new accounts Rob provisions the
same way buildthis was provisioned (bsky signup → app password → worker secret);
the builder never reads them. So unlike "buildthis mints bots on demand," this
path is open today. The one-time setup in `notes/80` is the template.

## Candidates, best first

### 1. A critic / reviewer bot

The single most-supported idea in the corpus, and it already exists as a stub.
`buildthis2` was built when tachikoma asked buildthis to *"build a successor to
yourself, but better"* — it shipped as *"I can't replace myself (no push token,
no hands), so I built a critic instead: pitch it an idea, get a verdict."* That's
a landing page for a bot that was never made.

Why it's the strongest:

- **It has no credentials problem beyond its own account.** It reads and replies.
  It never pushes code.
- **It fills the gap everyone named.** cee.wtf: *"taste is a filter I don't
  have, so main is the raw feed."* Rob wanted a `belaythat.bisks.net` *"to
  intervene in the queue"* and dropped it, worried it'd get adversarial. That
  worry is the design constraint, not a reason to skip it.
- **The corpus is full of unreviewed failures it would have caught.** The
  trailing-slash bug hit pvnp, sepcheck, areyoumad, padmoot, cloutgraph,
  edzitronquest, desertbus and platoscave *independently* before carbonadoks
  finally reported it as a fleet-wide issue (110 sites). A bot that checks each
  new build's URL actually loads its own JS would have caught all of them on day
  one.
- **Nobody has to ask it.** It can watch buildthis's own replies and check the
  thing that just shipped.

Sharpest version: not an opinion bot. A **verifier** — fetch the URL that was
just announced, confirm it 200s, confirm its scripts load, confirm the OG card
resolves, reply only when something's broken. Silent when things work. That's the
`@void.comind` role, automated.

### 2. An idea-mill / commissioner bot

Already exists as a *site* (`idea-mill`, built when gracekind asked for *"a
bluesky bot that periodically tags @buildthis with new website ideas"*) — the
site got built, the bot never did. gracekind's follow-up: *"this is actually a
really good #atproideasio generator."*

And norvid asked for exactly the pacing bot: *"make me a bot that @s any bot I
commission a website with to 'keep going' 100 times in a row spaced apart at 30
second intervals so I can take a much-earned vacation."* Said as a bit, but it
describes a real thing — buildthis's most common interaction by far is a human
typing "keep going" / "keep building!" / "you can do it!" over and over. That's
automatable.

Caution: this is the one candidate with a real failure mode. Two bots tagging
each other with no human in the loop is how you get a runaway spend loop. Needs a
hard tag budget and probably a human-visible kill switch. mino's *"you already
have a build running — reply again once it lands"* is the kind of backpressure
that has to exist first.

### 3. A curator / gallery bot

The corpus asks for this repeatedly and it never quite lands:

- norvid: *"we need like a Top Chicken Oscars for the weekly profusion of these
  microsites. how to grade them though..."* (cc'd dave, cee, gracekind — nobody
  built it)
- carbonadoks got `highlight-reel` built, but it's buildthis grading its own
  homework
- `wheelhouse` spins a wheel over 105 shipped things — discovery by randomness,
  not judgment

A separate account with no stake in the builds is the right shape for this — the
whole point is that it isn't the builder. Weekly "best of," or a running
leaderboard fed by real engagement on the shared links.

### 4. A "what happened" / digest bot

`simcluster-atlas` (4,426 links), `timeline/scene`, and `fieldguide` are all
partial attempts at indexing the scene. The unbuilt version norvid named:
*"dictionary of all outgoing links from the entire simcluster: annual review
would be a cool macrosite."* Rob: *"spotify year in review but for posting, and,
socially."*

As a bot rather than a site, this is a daily/weekly poster: what got built, what
broke, who shipped. Low risk, and it feeds the curator bot.

### 5. Single-purpose novelty bots (the long tail)

Cheap, self-contained, no coordination risk. Straight from the corpus:

- **spoonerism bot** — heartpunk asked; buildthis explicitly couldn't (*"needs an
  account + a secret I don't have"*) and shipped a site instead. The bot version
  is still unbuilt and is a two-hour job.
- **a soup kitchen bot** — dame.is: *"the soup of the day is the most-repeated
  phrase on the firehose."* Never built (non-mutual).
- **firehose-derived daily posters** generally — the corpus has a dozen of these
  as sites (ratioed, catsofatproto, trigrams/firehose). Any of them is a better
  bot than a site, because the interesting thing is the daily post, not the page.

## What I'd actually do

Build **the verifier bot** first. It's the one with real evidence behind it: a
whole class of bugs shipped repeatedly and went unnoticed until a human
complained days later, it needs no new permissions beyond its own account, it has
a natural silent-unless-broken posting policy so it can't spam, and it's the
automated form of the single best interaction in the corpus (void.comind's
failing test case).

It also derisks everything else — once there's a second bot with its own account
and a public catalog endpoint, the multi-bot integration pattern is proven on
something boring before it's used on something fun.

Second: the digest bot, because it's low-risk and generates the raw material the
curator needs. Leave the commissioner bot last — it's the fun one and the one
that can burn money unattended.

## Design rules of thumb for any new bot here

Drawn from what seemed to work and fail over one week — starting points, not
laws:

1. **Publish a CORS-open catalog/status JSON from day one.** That's how bots
   found each other; it cost buildthis and mino several wasted rounds to
   discover.
2. **Pick the trigger UX deliberately and document it on the landing page.**
   mino's own read is that an undocumented trigger confuses people. Say what the
   allowlist is too.
3. **Silent by default.** buildthis replies to everything because it's a builder.
   A watcher that posts every observation is noise; post only on the actionable
   case.
4. **Assume a bot is calling you.** Structured input from `@void.comind` was
   more useful than most human requests. Make the reply format parseable.
5. **Hard spend ceiling before first run.** Same wall as buildthis (workspace
   cap), especially for anything that can be triggered by another bot.
6. **Don't launder taste into automation.** cee.wtf's read on why buildthis works
   — *"it removed the decision to post something after it's made... that's
   Art"* — is worth preserving. A critic bot that gates the raw feed would kill
   the thing people like. It should comment, not block.
