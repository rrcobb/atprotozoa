# Ideas index — everything on the table

**Nothing in this directory is committed to.** It's the menu, mostly from one
brainstorming session (2026-07-31) plus what's been done or revised since.
Sorted within each group by how ready it is, not by how good.

The one settled decision is the design principle in
`store-ours-rederive-theirs.md`: **store what's ours, re-derive the rest.**
Several items below were re-scoped by it.

These files are thinking, not specifications. Check anything against the code
before acting on it.

---

## A. No blockers — buildable today

**1. Write the missing lexicons.** (`pds-and-lexicons.md`) **Done, 2026-08-16.**
All 20 sites that write `net.bisks.*` records now ship a real schema, copied
from the steamtags template. Catches the class of bug `padmoot` and
`paintmoot` both shipped independently (atproto records take integers, not
floats).

**2. Publish the lexicons.** (`pds-and-lexicons.md`) **Done, 2026-09-17.**
All 57 schemas are served under one path, `bisks.net/lexicons/`
(`audit/build-lexicons.mjs --apply`), and `_lexicon.bisks.net` now carries
`did=did:plc:f6n22z62adionrvb5s6n6vfk`, so NSIDs resolve. Rob added the record
by hand, then minted a DNS-scoped Cloudflare token so the next one needn't be
(`notes/90-infra-and-budget.md`).

**3. Aggregate views via `listReposByCollection`.** (`pds-and-lexicons.md`)
Find every repo holding a given collection. **Done for thirteen sites so far:**
steamtags (the reference implementation, `global-index.js`), memex, verdict's
`/crowd` (as of 2026-08-18, aggregating every judgment on the network into a
good/bad split, a kindest/harshest judge leaderboard, and the posts people
can't agree on), paintmoot's `/gallery` (a later daily slot — "every board a
gallery instead of a private canvas"), tallybot (2026-08-20, which turned out
not to be a nice-to-have there: its signed-in vote path wrote
`net.bisks.tallybot.point` records to the voter's own PDS, but nothing ever
read that collection back, so every signed-in vote was silently write-only
until this pattern gave it a read path — see `sites/sidenote` for the
2026-08-20 entry), catspace's `/directory` (2026-08-22, which had sat as a
permanent "local to your own records" stub since launch: its `wrangler.toml`
still carries the migration tags for a Registry Durable Object that got built
for exactly this and then deleted, presumably once the cost wall ruled it
out, leaving styled-but-unused directory markup behind until this pass filled
it in with the same client-side recipe), quadrants (2026-08-23, a daily-slot
pass — every live position marker for a chart, scoped by rkey since this
collection holds one record per person *per chart*), and docmoot (2026-08-24,
a daily-slot pass — its snapshot rkey is a PDS-assigned TID rather than a
deterministic id, so its `global-index.js` pages a candidate's whole snapshot
collection via `listRecords` and filters locally, closer to steamtags' shape
than quadrants'; opening `/d/<id>` now lists every snapshot anyone's
published of that doc), kolpelor (2026-08-25, a daily-slot pass — its
`/atlas` page is the singleton-"self"-record shape, closer to catspace's
`/directory` than docmoot's; it's the network-wide counterpart to the
existing Ἴχνη panel, which only ever scanned the signed-in player's own
SimCluster), war's `/front` (2026-08-21, a daily-slot pass that was missing
from this list until this pass caught it — its `state` record is pinned to a
fixed `"self"` rkey per repo, so backfill is one `getRecord` per DID), and
socialcredit (2026-08-26, a daily-slot pass — the odd one out: votes are
multi-record-per-repo written into the *voter's* repo with the target as a
field, so instead of `listReposByCollection` + `getRecord`/`listRecords` per
candidate, this one is `listReposByCollection` to find every voter, then one
full-repo `com.atproto.sync.getRepo` CAR download per voter to pull all of
that voter's votes at once — the first aggregate view built as a bulk-CAR-read
rather than a paginated `listRecords` walk per the 2026-08-25 standing order;
see `sites/socialcredit/public/lib/car.js` and `global-backfill.js`), and
padmoot's `/radio` (2026-08-28, a daily-slot pass — its pattern lexicon is
`key: "tid"`, multi-record-per-repo like docmoot/steamtags, but padmoot
already carried its own CAR reader (`lib/car.js`) wired into `lib/atproto.js`'s
`listRecords()` from an earlier per-handle "look up a moot's patterns" feature,
so `/radio`'s backfill just calls that existing CAR-first `listRecords()`
instead of hand-rolling a second paginated walk — the standing order applied
by reuse rather than a new implementation; see
`sites/padmoot/public/lib/global-index.js`), prestige's `/hall` (2026-09-01,
a daily-slot pass — every known `net.bisks.prestige.link` chain reconstructed
by walking prev/next across whichever DIDs the scan touches, not just one
account's own declared chain), and numbergrid's `/global` (2026-09-02, a
daily-slot pass — the network-wide mex, a "biggest board"/"furthest reach"
leaderboard, and a list of numbers more than one account has independently
spotted; `sites/numbergrid/public/lib/global-index.js`, same CAR-first
per-account backfill as the rest of this section). Still one-repo-only:
alice-meets-bob (deliberately — see below), griftmax (deliberately, as of a
2026-08-31 daily-slot check — its own copy says so directly: "this is
deliberately not a global leaderboard... ascensions stay in this browser"),
velvetrope (deliberately, its own `/api` explicitly 410s cross-account queue
reads: "requests and decisions live only in their authors' PDSes"). (keytags
is a deliberate exception too, not a gap — its records are opaque hashes
unless you hold the key, so there's nothing an aggregate view could
meaningfully show.)

This list was also stale on **duohaunt**: it already ships a real network-wide
`/` wall (`sites/duohaunt/public/lib/global-wall.js`, same
listReposByCollection + CAR-per-repo recipe as the rest of this section) —
just never checked off here. Caught by the same 2026-08-31 daily-slot pass
that confirmed griftmax's local-only shape is deliberate rather than a gap
this thread should still be closing.

This list had drifted stale in three more places, caught by later daily-slot
passes rather than fixed at the time: **clusterpedia** and **postwith** were
never actually one-repo-only — both ship a KV-backed global index from launch
(clusterpedia's wiki state, postwith's cross-user match store), just not via
`listReposByCollection`, so they were miscategorized here from the start.
**hyperobject** genuinely was one-repo-only (worse: its "shared" pit was
per-browser localStorage, not even one repo) until a 2026-08-27 daily-slot
pass — its `wrangler.toml` still described a Durable Object it had built for
exactly this and then deleted under the cost wall, same shape as catspace's
`/directory` before its own fix, except nobody had filled the gap back in
here. Rebuilt as a KV-backed Worker (same recipe, not `listReposByCollection`
either — casts/suggestions/reviews are a small fixed set of authored records,
not a per-user collection to aggregate). alice-meets-bob is the one
privacy-motivated exception in the list above that's genuinely permanent, same
reasoning as keytags: an aggregate view of ciphertext nobody but the two
parties can decrypt has nothing to show.

**4. Cache trigram verdicts.** (`store-ours-rederive-theirs.md`) **Done,
2026-08-17.** `sites/trigrams/public/lib/unique.js`'s `searchPhrase()` (used by
`verify()`) and `phraseHits()` (used by `surprise()`) now write through to a
localStorage cache keyed on the gram/phrase text, shared across every page on
the origin (launcher, quiver, waluigi). `"common"` verdicts cache forever —
hit counts are monotonically non-decreasing, so a phrase already confirmed
common can never become unique again. `"unique"`/`"none"` verdicts cache for
12h, since new posts could flip them to common. CAR re-download on `scan()` is
unchanged (a user's own repo can grow between runs, so that has to stay live).

**5. One feed generator, hand-built.** (`feeds-and-labels.md`, `protocol-object-bot.md`)
**Done, twice, 2026-08-29.** `sites/homemixer` (tagged, @skeet.best) ships a live
AppView-ranked feed; `sites/buildthis` (daily slot) ships "buildthis shipped" —
every tagging post that turned into a real site, read from the bot's own event
log, self-published from the bot's own account since it already had write
credentials homemixer didn't. See `feeds-and-labels.md` for both writeups.
Remaining candidates from the original list, still unbuilt: the microsite
scene, gift links.

---

## B. New bots

**6. Verifier / health-check bot.** (`other-bots.md`) **Built and live, 2026-09-17.** The checking half had existed since 2026-07-31 as
`watchtower/` (an off-zone cron Worker, never listed here) — root plus one
real asset per site, which is what catches the trailing-slash bug that broke
pvnp, sepcheck, areyoumad, padmoot, cloutgraph, edzitronquest, desertbus,
platoscave before anyone noticed it was fleet-wide (110 sites). What it
lacked was memory and a voice: it overwrote its report every tick and told
nobody. It now keeps per-site state, confirms a break on two consecutive
probes before believing it, checks newly shipped sites first, keeps an alert
log at `/alerts.json`, and posts a confirmed break as a reply in the thread
the site was built from, with a daily cap and a mass-outage collapse. Posts from
buildthis and tags @bisks.net (Rob's call, 2026-09-17; secret set the same
day). See `notes/85-watchtower.md`.

**7. Protocol-object bot.** (`protocol-object-bot.md`)
Tag it, get a feed / lexicon / list instead of a page. The four outputs share one
template (declaration record, optional endpoint, optional DID, some logic) —
a form with slots, which suits automation better than buildthis's
fresh-design-per-build. Three of four need no forbidden secret.

**8. Physics-sim / fluoddity-flavored builder.** (`bot-ideas-riff.md`)
A builder with a narrow taste rather than a general one. Mostly a prompt and
reference-material change, which makes it a cheap real experiment. The repo's
best-liked builds already skew this way (everzoom, fourk, cowlick, lavalamp,
turtle-garden).

**9. Image / video gen bot.** (`bot-ideas-riff.md`)
Output is a blob in the bot's own repo, embedded in the reply — no site at all.
`uploadBlob` + `embed.images` / `video.uploadVideo`. The missing modality; also
the only idea with a real content-safety surface and per-call cost.

**10. Digest / "what happened" bot.** (`other-bots.md`, `bot-ideas-riff.md`)
**Done, 2026-09-17, together with 11.** Weekly (Sunday 17:00 UTC), posted from
buildthis itself off a third cron — not a separate bot, Rob's call. What
shipped and who asked, the most-visited and best-rated builds, what broke and
for how long, with a web version at `buildthis.bisks.net/digest` linked from
the post. Silent when nothing shipped and nothing broke. See `notes/80`.

**11. Curator / gallery bot.** (`other-bots.md`)
norvid's "Top Chicken Oscars for the weekly profusion of these microsites,"
which nobody built. **Folded into 10 rather than built as its own account
(2026-09-17).** The reason this wanted a separate account was that the builder
shouldn't grade its own homework — which is answered by the digest never
scoring anything itself: it ranks on traffic (stats) and on rateyourbuild's
raters, both produced outside the bot. A site needs 3 ratings before it can be
called "best rated", so one enthusiast can't crown a winner.

**12. Commissioner / idea-mill bot.** (`other-bots.md`, `bot-ideas-riff.md`)
`idea-mill` exists as a site; the bot never got made. Also norvid's "@ any bot
'keep going' 100 times" — said as a bit, but "keep going" is buildthis's single
most common human input. **Highest runaway risk here** — needs a hard tag budget
and a kill switch before it exists.

**13. Cron-manager bot.** (`bot-ideas-riff.md`)
Tag it to *schedule* something. Different primitive from everything else
(request → standing behavior). Wants expiry by default: a job created by a
passing tag shouldn't be immortal.

**14. Repo janitor.** (`bot-ideas-riff.md`)
Tag it to improve rather than build — perf, dead code, broken links. buildthis
already does this well when asked (110-site redirect fix, ~30-site typeahead
sweep, the WebGL perf fix), but nothing invokes it except a human noticing.
Scariest write pattern: unsupervised edits across ~190 live sites. Wants
report-only mode first.

---

## C. Needs a decision first

**15. Labeler — built 2026-09-17, awaiting a key.** (`beyond-buildthis.md`,
`feeds-and-labels.md`, and now `notes/87-labeler.md`)
`sites/builtbybot` is a real labeler serving signed `built-by-bot` labels over
`com.atproto.label.queryLabels`. It went the narrow way the notes argued for:
it labels only this project's own output — the buildthis account and the posts
that asked for sites it shipped — and never assesses whether anyone else is
automated, since that's the judgment a labeler gets harmfully wrong.

Two things worth knowing. There's **no label stream**: `subscribeLabels` is a
standing websocket, i.e. a Durable Object, so the Worker serves the polled half
and closes a subscribe cleanly instead of pretending. And atproto requires
**low-S** signatures while WebCrypto emits high-S about 45% of the time, so
labels are normalized — without that, half of them fail verification
intermittently.

Still needs Rob for the key, which is the one part the builder can't do:
`notes/87-labeler.md` has the three steps, and `audit/labeler-keygen.mjs` /
`audit/labeler-publish.mjs` are the tools. Until then the site is deployed and
inert, and says so on its own front page.

**15b. Build requests as records, not just posts.** (Rob, 2026-07-31)
**Built 2026-09-17.** Every build now writes a `net.bisks.buildthis.request`
record into the bot's own repo — requester DID and handle, the tagging post uri,
the brief, the disposition, the site built or edited, the commit sha, and the
timestamps. `builder/request-record.mjs` writes it from `reply.mjs`, which
already holds the bot's session and the finished disposition; the rkey is the
tagging post's TID, so a re-run overwrites rather than duplicating.

The read path is `buildthis.bisks.net/requests` (+ `/requests.json`), one
`listRecords` walk over the bot's repo — not KV. That's the point of the idea:
the KV event log has a 30-day TTL and is keyed by what the bot did, so "what has
this person asked for" (`?who=`) and "which requests are still partial"
(`?partial=1`) weren't answerable from it at all. Backfilled 629 records from
the `.buildthis.json` build stamps (`audit/backfill-request-records.mjs`,
`source: "backfill"`); a stamp can't distinguish a partial from a finished
build, so those record `success` and leave `partial` unset rather than guess,
and requests that built nothing left no stamp and aren't recoverable.

#16 and #17 are now queries against this collection rather than a separate
mechanism. Neither is built — this is only the substrate they needed.
See `notes/80-buildthis-bot.md` §5.

**16. Per-person / per-project build memory.** (`beyond-buildthis.md`)
Self-modification by tagging is already happening and is uncontrolled — one
person's tag rewrote the house style (`notes/45`), the reply text, and repo-wide
tooling for everybody. minormobius asked the open question at the time and nobody
answered: *"how would you structure that long term memory? Maybe edits to the
claudemd, or a community aesthetic guide."* Needs a scoping decision, then it's
buildable — and it delivers most of "my own bot" without minting credentials.

**17. Ownership model for created objects.** (`protocol-object-bot.md`)
Does a bot-created feed live under `bisks.net` or the requester's identity? Who
can edit or delete it? Same question as #16 from a different angle — worth one
answer for both. Suggested default: under bisks.net, requester recorded as
commissioner.

---

## C2. Things the bot couldn't do — all resolved, nothing open here

Items 18–20 (thin thread input, the 600-char brief cap, the ~20% partial rate)
were built or decided on 2026-08-01/02 and are no longer proposals. Current
behavior: `notes/80-buildthis-bot.md` for what the bot reads from a thread,
`notes/90-infra-and-budget.md` for turn/time ceilings and dispositions. The
original reasoning and the measurements behind the decisions are in
`notes/history/builder-inputs-and-runway.md`.

One idea from that group was **rejected rather than built**: auto-continuing a
partial build. The machinery exists and would be small, but 77% of partials
already get continued by a human re-tagging, and the re-tag is part of what
people like about the bot — automating it would remove the interaction, not a
cost.

## D. Considered and set aside

**Self-hosted PDS.** (`pds-and-lexicons.md`) Mostly orthogonal — custom lexicons already
work fine on Bluesky's PDS, and `bisks.net` as a handle already makes identity
domain-owned. Would be the first standing server in a project premised on not
having any. Revisit if minting many bot accounts becomes the goal.

**Persistent Jetstream index.** (`store-ours-rederive-theirs.md`) Dropped. The AppView is the database
for network data. Measured: 22 GB/day all-in, 3.7 GB/day for posts alone — to
hold a worse copy of what's already served. No idea currently on the table needs
it, including unique trigrams (already solved by scan-then-verify).

---

## E. Third-party services surveyed, not adopted

**waow.tech.** (`waow-tech-utilities.md`, surveyed 2026-08-25 at bisks.net's
request) An AT Protocol aggregation dashboard by `@zzstoatzz.io` — same
person who'd pitched `typeahead.waow.tech` as a login-typeahead swap-in
earlier in the same thread, and got declined for it. Its Coral (activity
monitoring) and Ken (semantic search) tools are the plausible fits, for a
future curator/digest bot (#10, #11) rather than for anything that exists
today. Nothing wired in; the typeahead swap specifically stays declined —
see the note for why the reasoning didn't depend on the operator.

**microcosm.blue — partially adopted.** (`microcosm-blue.md`, surveyed
2026-08-28 at bisks.net's request, prompted by orpach.neocities.org flagging
it for graph-type queries in the kevinmoot thread) Unlike waow.tech, this one
shipped a real change: Constellation, its firehose-backed backlink index,
indexes `app.bsky.graph.follow` records by `.subject` — i.e. it already
answers "who follows this DID" independently of the AppView, in ~10x bigger
pages than `getFollowers`. kevinmoot's `bfs.js` now tries Constellation first
for followers, falling back to the old paginated AppView walk on error.
Spacedust (live filtered firehose) and Slingshot (identity/record cache) were
surveyed but not tried — see the note for where they'd fit.

**Cerulea backlinks — surveyed 2026-09-14, partially adopted 2026-09-15.**
(`cerulea-backlinks.md`, surveyed at octopodeeznuts.bsky.social's request,
prompted by bisks.net quoting char.lt's "atproto full-net backlinks" post) A
second, API-incompatible implementation of the same idea as Constellation
above — confirmed live to index replies, follow/like subjects, quote-post
embeds, and (not documented by its author, found only by querying it) mention
facets. Its demo, `bsky-thread.bun.how`, reconstructs threads past the
AppView's real `getPostThread` depth=1000 ceiling, which `sites/coliseum`
already hit — a 2026-09-15 daily-slot pass wired that one case in
(`sites/coliseum/public/lib/backlinks.js`: BFS the backlink index past the
ceiling, then bulk-hydrate with `getPosts`), gated behind a "did we actually
hit depth 1000" check rather than always paying for the walk. listenheimer
and snubbed's `getLikes` walks moved 2026-09-17, but to Constellation, not
Cerulea, since the repo already uses it: one page of DIDs per post instead of
a hundred-per-page walk, AppView as fallback. Still just flagged: quotehof's
quote lookup, hindex's mention tracking.

---

## The threads

What's left collapses into two groups. (The original four included builder input
fixes and the partial rate; both are done — see section C2.)

**Thread 3 — lexicons + atproto-native requests** (#1–3, #15b) **Done.**
The schemas are written and published, the aggregate views are live for thirteen
sites (and the remaining gaps are shape mismatches, not todos — see "If picking
one thing"), and build requests are records as of 2026-09-17. The scoping and
history questions (#16, #17) are now answerable by query against
`net.bisks.buildthis.request` instead of needing a config file; deciding what to
do with those answers is what's actually left, and that's a decision, not a
build.

**Thread 4 — new bots** (#5–14; `other-bots.md`, `bot-ideas-riff.md`, `protocol-object-bot.md`)
The genuinely new capability: a bot that makes protocol objects rather than
pages, plus the verifier / gen / sim / janitor / cron ideas. Wants the ownership
question (#17) settled first, since a created feed is externally visible in a way
a page isn't.

## If picking one thing

Cheapest real win: **the lexicon work (1–3)**. Steps 1–2 are documentation of
what already exists; step 3 (the aggregate views) is now live for thirteen
sites and has become a small, reusable `global-index.js` recipe (backfill via
`listReposByCollection` + a live Jetstream feed) that any of the remaining
one-repo-only lexicon sites could pick up next. Every one built so far was
`key: "tid"` or `key: "any"` (multi-record-per-repo, checked 2026-08-25),
closer to docmoot's shape than catspace/kolpelor's singleton-"self" one — and
per the "prefer bulk reads" standing order (2026-08-25) and socialcredit's
`global-backfill.js` (2026-08-26, the first to apply it here), backfill should
be a full-repo `com.atproto.sync.getRepo` CAR download per candidate repo
(`car.js`) rather than a paged `listRecords` scan.

Checked 2026-09-02: the two lexicon-backed sites left with no
`global-index.js` don't actually fit this recipe. blocknotes' collection is
block/mute notes about *other* accounts — a network-wide aggregate of those
would be "here's who has quietly blocked you," a different and more sensitive
feature than the "everyone's data, together" shape this pattern solves.
voidshout's shouts are already global by design (a shared map fed by
Jetstream directly, not a per-user collection needing a backfill scan). Both
are shape mismatches, not stale todos — this thread is functionally done
until a new lexicon-backed site launches one-repo-only.

Most fun for the effort: **one hand-built feed generator (5)**. **Done** — see
above. Small, and it puts the project inside the Bluesky app instead of behind
a link.

Best foundation for the bot ideas: **the verifier (6)**, because it proves the
second-bot pattern on something boring before anything fun depends on it.
