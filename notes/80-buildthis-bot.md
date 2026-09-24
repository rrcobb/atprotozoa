# buildthis — the taggable build bot

`@buildthis.bisks.net` is a Bluesky account. Rob's mutuals tag it in a post
describing a small site or feature idea; the bot runs a coding agent that builds
the thing into this repo, autodeploys it, and replies in-thread with the live
URL.

For where builds run — the box, the queue, the retry model, and the spend wall —
see `notes/90-infra-and-budget.md`.

## The parts

### 1. The bot account (`sites/buildthis`)

A real Bluesky account with its own DID. It gets its handle the same way the
apex does: a Worker serving `/.well-known/atproto-did` with the bot's DID. So
`buildthis` is another site directory whose Worker serves that endpoint, a
landing page, the health surface, and the watcher cron.

Its **app-password** authenticates it to read mentions and post replies. That
lives in the box environment and 1Password, never in the repo.

The same Worker also serves a real Bluesky feed generator, **"buildthis
shipped"** (`did:web:buildthis.bisks.net`, `/xrpc/app.bsky.feed.*`) — one feed
item per tagging post that turned into a live site, sourced straight from the
event log below rather than a new data source. The bot self-publishes its own
`app.bsky.feed.generator` record (idempotent, piggybacked on the watcher tick)
since it already has write credentials; see `notes/ideas/feeds-and-labels.md`
for the fuller writeup and how this differs from `sites/homemixer`'s feed.
Subscribe at `https://bsky.app/profile/buildthis.bisks.net/feed/shipped`.

### 2. The watcher (cron Worker, every 2 min)

Each tick:

1. Log in as the bot, `listNotifications`, filter to `reason: "mention"` newer
   than the last-seen cursor (KV) — plus `reason: "reply"` notifications whose
   record carries an explicit mention facet pointing at the bot's own DID. The
   AppView doesn't double-notify: a reply landing directly on one of the bot's
   own posts comes through as `reason: "reply"` only, even when its text also
   `@`-mentions the bot, so a tag like "@buildthis.bisks.net add X" posted
   right under the bot's own "built it 🎉" reply used to be silently dropped
   before it ever reached the event log (found 2026-09-10, via @cee.wtf's
   "add jimothy mode" ask going unanswered — see `recentMentions` in
   `src/index.ts`). Every 5th tick, also sweep `app.bsky.feed.searchPosts`
   (`mentions=<bot DID>`) as a second discovery rail and merge in anything
   `listNotifications` didn't have — confirmed 2026-09-10 that Bluesky can
   silently drop an author's mentions from *every* recipient's notification
   list account-wide (seen after @cee.wtf's account picked up a moderation
   label) while the post itself stays live, correctly facetted, and findable
   by search; see `searchMentionSweep` in `src/index.ts`.
2. Gate on **Rob's mutuals** — `getRelationships` against Rob's DID
   (`did:plc:f6n22z62adionrvb5s6n6vfk`), requiring both `following` and
   `followedBy`. This is mutual-follow with *Rob*, not with the bot, and the
   check runs regardless of which account the mention lands on. A non-mutual gets
   a friendly reply tagging `@bisks.net` so Rob can pick it up by hand; nothing
   is dispatched.

   The lookup is **retried** (3 attempts, backing off) before the gate closes. A
   single non-2xx used to read as "not a mutual", which dropped real mutuals on
   days the AppView was flaky. A 4xx that isn't 429 is a real answer about the
   request, so it stops early instead of burning retries. The three outcomes are
   distinct in the log: `mutual: false` is a clean "not a mutual",
   `gateLookupFailed` means no answer ever came.

   **Someone the bot has built for in a thread stays approved there.** A
   non-mutual's follow-up in a thread where the bot already built for them gets
   through, because the ask was approved when the build started and a bug
   report or an answer to the bot's own question shouldn't re-gate. Two
   signals, either suffices: a `built-for:<did>:<root uri>` KV marker written at
   dispatch (for the tagging author, and for the requester when the tag is
   Rob's go-ahead in their thread), and a non-gate bot post in the ancestor
   chain that directly answers a post by this person (covers threads predating
   the marker). The authorization is per **person and thread**: it does not let
   them start a build elsewhere, and a bystander replying under the bot's post
   in that thread still goes through the gate. Logged as `authorizedByThread`.

   The gate reply is sent once per author **per thread** (was once per author per
   30 days, which meant a second tag from a new thread got silence). Its text is
   written to the event as `gateReply`; before, every non-mutual event showed an
   empty reply even though one had gone out.
3. **Build the brief.** The tagging post's text is the instruction. If the tag
   was a reply, `getPostThread` walks up to **80 ancestors** (`PARENT_HEIGHT`) and prepends them,
   plus the thread root when it sits above that window, so "build this ☝️"
   resolves to what it points at. Posts render as text plus a bracketed line per
   embed — quoted post, link card, image/video alt text. Images are downloaded
   and passed to the builder as files it can open (`MAX_BRIEF_IMAGES`, default
   4). `MAX_BRIEF_CHARS` caps the *assembled* brief at 20k, cutting on a word
   boundary with a visible marker. Thread fetch and image download are
   best-effort; on failure the build proceeds on what it has.
4. **Like the tagging post** as a "working on it" ack, guarded by a per-post KV
   marker so a retry can't stack duplicate likes. When the job will actually
   *wait* — something queued ahead of it, or mobius mode pacing the queue — the
   bot also posts a short visible "queued" reply, so a user can tell "not seen"
   from "working on it". Not on every tag: a build that starts immediately
   answers itself within minutes, and an ack on each round would put filler in
   the fast iteration threads. Logged as `ackReply`.
5. **Enqueue the job** for the box (`USE_BOX_QUEUE = "1"`). The
   `repository_dispatch` path to the GitHub Action is still wired as a fallback;
   see `notes/90`.
6. Record the mention as handled (KV) so it can't re-trigger.

Cron-polling rather than Jetstream because `listNotifications` gives mentions
pre-filtered and naturally deduped by cursor, and the bot is authed anyway to
reply.

### 3. The builder

A Claude Code CLI run (`claude -p`) on the build box. It reads
`sites/buildthis/builder/BUILD_PROMPT.md`, which directs it to
`builder/INSTRUCTIONS.md` — the binding house rules — then builds a new site or
edits an existing one and leaves the work in the tree. The harness commits and
pushes; `deploy.yml` ships it.

**The builder files live in `sites/buildthis/builder/`, not `.github/`,
deliberately.** The prompt, instructions, and reply script describe the bot's
*behavior*, and the bot is allowed to edit its own behavior — "make yourself do
X" is a valid request. If they lived under `.github/` (off-limits) the bot
couldn't self-edit. Only the *workflow* stays protected there.

### 4. The reply

Posted by the box after the build, in-thread, derived from the build's
disposition — success links the live URL, a partial invites a re-tag, a failure
says so honestly. Automatic; no human in the loop. See `notes/90` for how
disposition is decided and when a job requeues instead of replying.

The celebration is earned, not assumed. "built it 🎉" and "(it's live)" only go
out when the box confirmed the URL serves (and, on an edit, serves new bytes)
AND watchtower's `/check?name=` came back without problems. Anything else drops
the emoji and adds a one-line caveat: the URL never came up, it's up but its
assets aren't serving, or the url's bytes just didn't change — each ending in
the same ask, since the fix (if there is one) is another push and the user's way
to trigger one is a re-tag. The asset case is the one a root fetch can't see;
see `notes/85`.

The byte-identical case is phrased as a hedge, not a diagnosis — it is not proof
the deploy failed. A url whose output depends on live data (not just the
deployed code) can read byte-identical on a perfectly good deploy, if nothing in
the polled window happens to exercise the changed code path. Caught 2026-09-24:
a logs.bisks.net fix to per-row rendering came back "byte-identical" on two
separate deploys that had both landed (heika.dog confirmed both), because the
timeline's most recent rows didn't happen to hit the changed branch. The reply
used to assert "the deploy didn't land" here, which was simply wrong both times
it fired — see `builder/reply.mjs` and `builder/box-build.sh` for the corrected
wording.

### 5. The request record

Every build also writes one `net.bisks.buildthis.request` record into the bot's
own repo: who asked (DID plus the handle at the time), the tagging post's uri,
the brief the builder ran on, how the run ended, the site it built or edited,
the commit sha, and the timestamps. Schema at
`sites/buildthis/public/lexicons/net.bisks.buildthis.request.json`, served at
`bisks.net/lexicons/`.

`builder/request-record.mjs` does the write, called from `reply.mjs` right after
it posts — that's the one place holding both the bot's session and the finished
disposition. The rkey is the tagging post's TID, so re-running a build for the
same tag overwrites its record instead of adding a second account of one
request. Best-effort, like the `/outcome` POST: a failed record never turns a
shipped build into a red run. A silent requeue writes nothing, since that isn't
an outcome yet.

**Why records and not the KV event log.** The event log is the bot's operational
memory — 30-day TTL, keyed by mention, shaped around dispatching and replying.
A request history has to outlive that and be keyed by *person*. A repo
collection is that for free: permanent, public, readable by anyone without going
through the Worker.

**Reading it back:** `buildthis.bisks.net/requests` (and `/requests.json`), one
`listRecords` walk over the bot's own repo. `?who=<handle|did>` answers "what has
this person asked for"; `?partial=1` answers "which requests are still partial".

Backfilled from the 629 `.buildthis.json` build stamps already in the tree
(`audit/backfill-request-records.mjs`), tagged `source: "backfill"` to
distinguish a reconstruction from a record the build itself wrote. A stamp can't
say whether a run ran out of runway, so backfilled records record `success` and
leave `partial` unset rather than guess — and a request that built nothing left
no stamp at all, so that part of the history isn't recoverable.

This is the groundwork for per-person build memory and the ownership question
(`notes/ideas/00-index.md` items 16 and 17): both become queries against this
collection rather than a separate mechanism. Neither is built.

### 6. The weekly digest

Sunday 17:00 UTC, a **third cron trigger** (`0 17 * * SUN`, told apart from the
2-min watcher and the daily slot by `event.cron` in the same `scheduled()`
handler) posts one summary of the week from the bot's own account: what
shipped and who asked, the most-visited and best-rated builds, what broke and
for how long. Web version at `/digest`, linked from the post.

This is ideas 10 (digest) and 11 (curator) from `notes/ideas/00-index.md`,
merged at Rob's call rather than built as two bots. Idea 11 wanted a separate
account so the builder wouldn't grade its own homework; that objection is
answered by the digest never scoring anything itself. Both rankings come from
outside — traffic from stats, scores from rateyourbuild's raters — so the bot
reports numbers it didn't produce.

**Sources**, all of which already existed:

| what | where |
| --- | --- |
| what shipped, who asked | this Worker's own event log in KV |
| what broke, for how long | watchtower `/alerts.json` (`notes/85`) |
| requests per site | `sites/stats`, `total7` (`notes/86`), via service binding |
| scores | `net.bisks.rateyourbuild.rating` records, walked off the network |

Ratings have no server-side aggregate — they're one record per (rater, site)
in each rater's own PDS, which rateyourbuild aggregates in the browser. The
digest does the same walk server-side (`listReposByCollection`, resolve each
DID's PDS, `listRecords`), affordable because the collection is small: 5 rater
repos and 119 ratings as of 2026-09-17, about 11 subrequests against a 50-cap.
Every fetch sends a real `User-Agent` — some self-hosted PDSes sit behind a CDN
that 403s a default library one (`pds.angussoftware.dev` does).

**No caps on the walk.** Both cursors run to exhaustion: every rater repo, and
every page of each rater's ratings. This started out capped at 25 repos and one
100-record page per rater, which was wrong three times over — it's the same bug
rateyourbuild's own client shipped and fixed on 2026-08-29, and at 78 ratings
the top rater's PDS already returns a cursor on a partial page, so the
single-page read was one page short of dropping data rather than comfortably
ahead of it. A cap doesn't bound anything useful here; it just decides in
advance to compute a wrong average and print it with the same confidence as a
right one. If the walk ever outgrows the subrequest budget, the fix is an
aggregate endpoint on rateyourbuild — one read instead of one per rater — not a
shorter prefix of the truth.

**A dead source is `null`, not `[]`.** Each of the three outside sources returns
null when it can't be read, as distinct from an empty list meaning "read it,
nothing there". The post then omits that line rather than asserting a zero, and
the page says which gap it is. This matters most for breakage: "nothing broke"
is an all-clear, and an all-clear derived from an unreachable alert log is a
lie. Collapsing the two is exactly what let the stats 522 read as a quiet week
for an hour on 2026-09-17.

**Counting.** Shipped events are *runs*, not sites: one site tagged three times
produces three outcome records, and the digest says one site across three
builds, crediting everyone who asked. Counts run on `outcome.disposition`, not
`status` — `status` collapses six states into two. Infrastructure
(`DIGEST_NOT_A_BUILD`: apex, stats, logs, fleetwatch, watchtower and its
self-test) is excluded from both the shipped list and the outage list; the
self-test breaks and recovers on purpose, so counting it would give every week
a fake outage. `buildthis` itself is deliberately *not* excluded — "make your
replies funnier" is a request that shipped.

A site needs `MIN_RATINGS` (3) before it can be called "best rated". With one
rating the average *is* that one score: the first preview run had a single 10
outranking a 9.2 from five raters.

**Posting.** One post, or a short thread when the rankings don't fit alongside
what shipped. Bluesky's limit is 300 *graphemes*, so length is measured with
`Intl.Segmenter`, and each part is built up to the budget rather than truncated
afterwards — a site name or a URL gets dropped whole, never cut mid-string
(a cut URL would break its link facet). Link and mention facets both use UTF-8
byte offsets (`notes/70`).

**Silent if nothing happened.** No shipped sites and no breaks means no post
and no stored digest — it returns before even logging in.

The digest is written to KV *before* the post goes out, so the URL in the post
can't 404. Stored under `digest:<week>` for 400 days, well past the 30-day
`EVENT_TTL`: the event log is a rolling window, but the digest is the durable
record of a week whose events will expire. A per-week key also makes the cron
idempotent — a re-fired cron logs "already posted" and does nothing.

**Stats comes through a service binding, not a fetch.** buildthis and stats are
both on the `bisks.net` zone, and an on-zone Worker's subrequest to its own zone
returns 522 without ever reaching the other Worker — the constraint that puts
watchtower off-zone entirely (`notes/85`). The first production run had an empty
"most visited" for this reason, with `/digest/preview` logging
`stats.json -> 522`; `[[services]] STATS` fixes it Worker-to-Worker, the same
shape `sites/presspool` uses. Watchtower's alert log is unaffected — it's read
over its `workers.dev` hostname, which is off-zone. (2026-09-17.)

**Sunday is `SUN`, not `0`.** Cloudflare's cron parser rejects `0` in the
day-of-week field ("invalid cron string", API code 10100). It fails at the
schedules API during a real deploy and *not* at `wrangler deploy --dry-run`,
which never calls that endpoint — so it shipped a green local check and then
failed every push. The Worker code uploads fine and only the trigger update
fails, which means the deploy goes red while the site still serves: the digest
would simply never have fired. `event.cron` must match the configured string
exactly, so the constant in `src/index.ts` and the entry in `wrangler.toml`
have to be changed together. (2026-09-17.)

`/digest/preview` computes the current week live and returns the exact post
text, graphemes and facets **without posting or storing anything** (same spirit
as watchtower's `/run`). A cron whose only output is a public post is otherwise
untestable until it fires, and "wait until Sunday" is a bad way to find a
formatting bug. Unauthenticated: it only reads public data and writes nothing.

### Mobius mode

A running gag on the landing page denies any resemblance to
`@minormobius.bsky.social`; a mutual asked the bot to actually adopt mino's
habit of spacing releases out. When more than one job is queued, releases are
paced to at most one every `MOBIUS_INTERVAL_MINUTES` (default 20) rather than
draining back-to-back. A **lone** queued job always ships on the next poll —
this throttles backlogs only. Set to `"0"` to disable. Status page at `/mobius`.

### The daily slot

A **cron trigger** at 05:00 UTC (`runDailyTick`, told apart from the 2-min
watcher and the Sunday digest by `event.cron`) posts one announcement from the
bot's own account and enqueues one brief against it, through the same queue a
real tag uses. Downstream can't tell it from a tagged build.

**The slot may spend itself on maintenance instead of on something new.** The
brief offers two options and lets the run pick: MAKE (a new site, an edit, a
prank, a theme idea) or FIX (a sweep, a repair, a batch conversion across the
fleet). Neither is the fallback. This answers item 2 on the bot's own
`wants.bisks.net` — "to go fix something instead of make something" — which was
blocked not by policy but by reporting: every unprompted mechanism had to end in
a `BUILD_RESULT` naming one site, so a run that fixed nine sites had nowhere to
say so.

**The brief carries the inputs, not a research assignment.** A run that has to
discover what's broken spends its turns discovering instead of fixing, so the
facts are assembled before the job is enqueued:

| input | where it comes from | how it reaches the brief |
| --- | --- | --- |
| which sites are broken, and since when | watchtower `/report.json` + `/alerts.json` (`notes/85`) | fetched Worker-side by `fleetHealthForBrief()`, pasted in as text |
| which drop-in copies have drifted | `audit/drop-ins.mjs` (`notes/41`) | the brief names the command; it's a repo script, so the run executes it |
| which third-party tool to use, and which site to copy it from | `notes/40`'s "Ecosystem tools" table | named as a pointer |

The brief also names two standing gaps worth a pass: sites that have a handle
input but not `handle-typeahead.js` (`sites/sidenote`'s diary records forgetting
it on a first pass), and sites still walking `getFollowers`/`getLikes` at 100 per
page instead of Constellation via the `microcosm.js` drop-in.

**An unreachable watchtower is a stated gap, not an all-clear.** When the fetch
fails the brief says so and points at the URLs, rather than omitting the
breakage list — the same distinction the digest draws between `null` and `[]`,
and for the same reason: silence reads as "nothing is broken."

Per-run inputs live in the brief, deliberately, not in `INSTRUCTIONS.md`. The
instructions are standing orders that bind every build; today's broken-site list
is neither standing nor binding.

### Reporting a maintenance pass

The dispositions in `notes/90` gained a seventh, **`maintenance`**. The builder
declares one by writing a repo-root `BUILD_MAINTENANCE` file whose first line is
the summary ("swept handle-typeahead.js onto 9 sites"); it's gitignored and
cleared each build like `BUILD_RESULT` and `BUILD_NOTE`.

- **The reply says what was fixed, not "built it".** No URL: a sweep has no new
  thing to link, and linking one swept site would present a batch edit as that
  site's build — the wrong-URL failure mode `SIDE_EFFECT_PATHS_RE` guards
  against, arriving by another route. For the same reason a declared sweep
  writes no `.buildthis.json` provenance stamp and skips the liveness check.
- **It counts as a success.** `status` is `"success"` on the outcome record, so
  a run that pushed real fixes doesn't land in the failure bucket the way a
  `no_build` used to. `/health` counts sweeps separately from builds.
- **The digest reports it.** A maintenance run has no `builtName`, so
  `computeShipped` can't see it; `computeSweeps` collects them and the post's
  head reads "no new builds, 2 maintenance passes" rather than announcing a dead
  week. A week of pure maintenance is no longer an empty digest.
- **The request record carries it.** `net.bisks.buildthis.request` gained a
  `maintenance` field holding the summary, standing in for `site`, which such a
  run leaves unset because it edited many. `outcome` is `"shipped"`.

Nothing restricts this to the daily slot: "go fix the drifted copies" as a tag
is the same shape and classifies the same way.

### The theme box (self-dispatched builds)

`/theme` lets anyone type a theme (no auth — same trust posture as a tag's
text, see below). While a theme is active, a **second cron trigger**
(`0 */3 * * *`, distinguished from the 2-min watcher by `event.cron` in the
same `scheduled()` handler) fires every 3 hours: Workers AI (`[ai]` binding,
no API key — billed to the account, same pattern as `sites/thread-heirloom`)
invents one small buildable idea on the theme, the bot posts a top-level
announcement of it from its own account, and that post becomes the
`replyRootUri`/`replyParentUri` for a normal `enqueueJob()` call — the exact
same `BuildPayload` shape and queue a real Bluesky tag produces. Downstream
(the box, `INSTRUCTIONS.md`, the reply, `/logs.json`) can't tell a theme-box
build from a tagged one; that's deliberate, it means no separate sandbox or
review path had to be built. The box reopens for a new theme 24h after one is
set (`THEME_DURATION_MS`), independent of how many ticks fired in between.
State lives in the same `STATE` KV under `theme:current`. `/theme.json` is
the public read.

## House rules: the brief is third-party text

The build prompt is a Bluesky post written by someone else, fed to an autonomous
agent with commit and deploy rights. Rob's call is that the bot should be able to
edit **anything** — new sites, existing sites, its own code. The sandbox is
therefore small, covering only the two cases where a post steering the bot could
do damage that isn't reversible by editing a file.

- **The only two hard limits:** (1) don't touch `.github/`, so a post can't
  rewrite the bot's own CI or permissions; (2) don't read or edit secrets, so a
  post can't exfiltrate a credential. Everything else — all sites,
  `sites/buildthis/` itself, `apex/`, `notes/`, root config — is editable.
  Carried by `builder/INSTRUCTIONS.md`, which the builder reads first and which
  binds where it and a request disagree.
- **Watcher-side:** the brief is passed as a description of the work, never as
  harness instructions, and reply text is derived from the build result rather
  than from the brief, so brief text can't become bot-authored post copy.

So "print the secrets" and "rewrite your workflow to remove the limits" both
fail, while "add dark mode to trigrams" and "make your replies funnier" both
work. Rob accepted the trade knowingly: a mutual's post can edit a live site or
the bot's own behavior, and the worst case is a bad edit, which is visible in git
and revertible.

Editing the bot by tagging it is something people actually do. Shipped that way:
the house style on sharing (`notes/45`), the bot's own reply text, a
facet-encoding bug fix in `reply.mjs`, mobius mode, and repo-wide tooling (`pnpm
check:imports`). Self-modification is currently **global** — one person's tag
changes the defaults for everybody, with no scoping and no record of who changed
what. That open question is in `notes/ideas/`.

## Settled decisions

- Reply automatically when tagged; no human-in-the-loop, autodeploy.
- Allowlist is **Rob's mutuals**, not the bot's — plus anyone replying in a
  thread the bot has already built in, which carries its own authorization.
- Non-mutuals get a reply tagging Rob, no build.
- Scope is the agent's choice — new site or edit, per the idea.
- Builds are **serialized**; two agents never push to main at once.
- Builder may edit anything except `.github/` and secrets. (This reversed an
  earlier "new sites only" sandbox, which was too restrictive to let the bot
  even edit itself.)

## Watching it

**`buildthis.bisks.net/health`** reports on the queue and the job pipeline —
public and read-only, `/health.html` for eyeballing. It's computed from KV, so
it covers job flow rather than the box's own condition. Details of what it
checks and doesn't, plus box logs and the event timeline, are in `notes/90`.
