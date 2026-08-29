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
   than the last-seen cursor (KV).
2. Gate on **Rob's mutuals** — `getRelationships` against Rob's DID
   (`did:plc:f6n22z62adionrvb5s6n6vfk`), requiring both `following` and
   `followedBy`. This is mutual-follow with *Rob*, not with the bot, and the
   check runs regardless of which account the mention lands on. A non-mutual gets
   a friendly reply tagging `@bisks.net` so Rob can pick it up by hand; nothing
   is dispatched.
3. **Build the brief.** The tagging post's text is the instruction. If the tag
   was a reply, `getPostThread` walks up to **10 ancestors** and prepends them,
   plus the thread root when it sits above that window, so "build this ☝️"
   resolves to what it points at. Posts render as text plus a bracketed line per
   embed — quoted post, link card, image/video alt text. Images are downloaded
   and passed to the builder as files it can open (`MAX_BRIEF_IMAGES`, default
   4). `MAX_BRIEF_CHARS` caps the *assembled* brief at 20k, cutting on a word
   boundary with a visible marker. Thread fetch and image download are
   best-effort; on failure the build proceeds on what it has.
4. **Like the tagging post** as a "working on it" ack, guarded by a per-post KV
   marker so a retry can't stack duplicate likes.
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

### Mobius mode

A running gag on the landing page denies any resemblance to
`@minormobius.bsky.social`; a mutual asked the bot to actually adopt mino's
habit of spacing releases out. When more than one job is queued, releases are
paced to at most one every `MOBIUS_INTERVAL_MINUTES` (default 20) rather than
draining back-to-back. A **lone** queued job always ships on the next poll —
this throttles backlogs only. Set to `"0"` to disable. Status page at `/mobius`.

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
- Allowlist is **Rob's mutuals**, not the bot's.
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
