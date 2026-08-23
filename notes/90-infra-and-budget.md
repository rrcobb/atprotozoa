# buildthis — infra & budget

Where builds run, how jobs queue and retry, and what stops runaway spend.
`notes/80-buildthis-bot.md` covers what the bot is and the rules it builds
under.

## Where builds run now

Builds run on an **always-on Hetzner box**, on Rob's **Claude subscription**
(via a headless `claude setup-token` OAuth token), driving the **Claude Code CLI**
at **Sonnet**. Not on a GitHub Action, not on per-token API billing, not on the
laptop.

The migration path this doc used to recommend (stay on GitHub Actions + a capped
API workspace) is dead — it got replaced once the bot got popular enough to burn
a month's API spend cap in a single day. The fix wasn't "raise the cap"; it was
"stop paying per token." A subscription is a flat monthly cost, so a popular day
means the bot rate-limits and waits, not that it runs up a bill.

## The end-to-end path

```
Bluesky mention (@buildthis.bisks.net)
   │
   ▼
Cloudflare cron Worker  (sites/buildthis, every 2 min)
   │  listNotifications → filter mentions → dedupe on handled:<uri> KV marker
   │  gate: author is a mutual of bisks.net?   (getRelationships)
   │  like the post (ack), build the brief (tag text + thread context)
   │
   │  USE_BOX_QUEUE = "1"  →  enqueueJob():  write job:<uri> to KV
   │  (else, fallback)     →  repository_dispatch to the GitHub Action
   ▼
KV build queue  (job:<uri> records in the buildthis Worker's STATE namespace)
   ▲   │
   │   │  POST /next-job  (QUEUE_TOKEN-authed)
   │   ▼
Hetzner box  (systemd service buildthis-poll, runs as unprivileged `builder`)
   │  poll /next-job every 15s → claim the oldest queued job
   │  box-build.sh:  git reset --hard origin/main
   │                 claude -p  (Sonnet, subscription OAuth token, --max-turns 90)
   │                 git push (PAT → fires deploy.yml)
   │                 reply.mjs: post in-thread + POST /outcome
   ▼
push to main → deploy.yml → wrangler deploy → <name>.bisks.net
   │
   ▼
POST /outcome  → merges onto event:<uri>, deletes job:<uri>
   → logs.bisks.net timeline flips pending → built/failed
```

One box, one poll loop, one build at a time — that serialization is free (two
agents never push to main at once). The box makes only **outbound** calls
(poll, push, reply); nothing listens on it. Firewalled to inbound-SSH-only.

## The box

- **Host:** Hetzner CX23 (2 vCPU, 4GB), Helsinki, `135.181.40.225`, named
  `pets-not-cattle-one` (a joke — it's cattle: stateless, disposable, rebuilt
  from a script). `ssh buildthis-box` from Rob's laptop.
- **No volume, no backups.** The box holds no state worth keeping — source of
  truth is GitHub + Cloudflare KV, secrets are in 1Password. If it dies, re-run
  `box-setup.sh` on a fresh one.
- **Provisioning:** `sites/buildthis/builder/box-setup.sh` — installs node,
  claude-code, wrangler, jq; clones the repo; creates the unprivileged `builder`
  user (claude -p bypassPermissions refuses to run as root, and root is wrong for
  an unattended agent); writes the `/etc/buildthis/env` secrets template; installs
  + enables the `buildthis-poll` systemd service. Idempotent.
- **The work loop:** `builder/box-poll.sh` (the systemd service). Claims a job,
  runs `builder/box-build.sh`, repeats. `set -uo` (not `-e`) so one failed build
  never kills the loop; a stuck build ages out of the queue rather than
  re-looping.
- **One build:** `builder/box-build.sh` — the box equivalent of the Action's
  build+reply steps, behavior-identical so the cutover was safe.

### Changing the box scripts (which need a restart, and when it's safe)

The two scripts deploy differently, which is easy to get wrong:

- **`box-build.sh` ships by itself.** Every build starts by syncing the checkout
  to `origin/main`, so a pushed change is picked up by the next build.
- **`box-poll.sh` does NOT.** It's the long-running systemd unit; the running
  process keeps its old copy until `sudo systemctl restart buildthis-poll`.
  Pushing is not enough.

**Restart only when no build is in flight.** The unit runs with systemd's default
`KillMode=control-group` and `TimeoutStopUSec=30s`, so a restart SIGTERMs every
process in the service cgroup — `box-poll.sh`, its `box-build.sh` child, and the
`claude -p` grandchild all sit in `/system.slice/buildthis-poll.service` — then
SIGKILLs after 30s. A mid-build `claude -p` won't exit in 30s, so it dies before
`box-build.sh` reaches its reply step: the job stays `claimed`, ages out on TTL
without being re-served, and the requester gets silence. That's the stranded-work
mode the harness otherwise works hard to avoid.

Check idle first, with a pattern that can't match its own command line:

```
ssh buildthis-box "pgrep -af '[b]ox-build.sh'"   # exit 1 / no output = idle
```

The `[b]` matters. A plain `pgrep -f box-build.sh` over SSH matches the `bash -c`
wrapper running it, so it always reports a build in progress — a check that can
never come back idle. Builds run one at a time and take minutes to tens of
minutes; the gap between one finishing and the next claim is up to the 15s poll
interval.

## Auth on the box (the tricky part)

Inference is Rob's **Claude subscription**, via a headless OAuth token, NOT an
API key. Claude Code's auth precedence, higher wins:

1. `ANTHROPIC_API_KEY` → per-token API billing
2. `CLAUDE_CODE_OAUTH_TOKEN` → subscription, headless  ← **what the box uses**
3. interactive `~/.claude.json` login → subscription, interactive

The token comes from `claude setup-token` (run once as the `builder` user, since
`claude` refuses to run as root; prints
an `sk-ant-oat01-…` string). It lives in root-owned `/etc/buildthis/env` (which
`builder` cannot read — systemd sources it as root and passes the vars down) as
`CLAUDE_CODE_OAUTH_TOKEN` and is passed to `claude -p` per invocation.

Gotchas that cost real time getting here:

- **`claude auth status` reports `loggedIn: false`** even though the token
  authenticates fine — `status` only knows about mode 3 (interactive login), and
  the box uses mode 2 (env-var token). Don't guard on `auth status`.
- **`ANTHROPIC_API_KEY` outranks the OAuth token.** If one is set anywhere in the
  environment it silently switches to API billing. `box-build.sh` unsets it
  defensively.

## Model & the runaway guards

- **Sonnet** (`claude-sonnet-5`), `BUILDER_MODEL` overrides for a one-off Opus.
  Near-Opus on the copy-a-site-and-edit workload, cheaper, and on a subscription
  the "cost" is subscription rate-limit pressure, not dollars.
- **`--max-turns 90`** (`BUILDER_MAX_TURNS` overrides). Raised from 30 → 60 → 90.
  Measured across 434 builds from the box's journal: every partial (89, 20.5%)
  was a turn-ceiling hit, and they weren't runaways — the *fastest* partial took
  longer than the median success, running ~2.3× it. The distribution is
  unimodal, so the ceiling was cutting across ordinary big jobs rather than
  catching stuck ones.
- **A 20-minute wall clock** (`BUILDER_TIMEOUT`, SIGTERM then SIGKILL 30s later)
  is the actual runaway guard. Note the earlier claim that `systemd
  TimeoutStopSec` bounded a build was **wrong** — that only applies while systemd
  is *stopping* the unit, so a running build was unbounded. 20 min exceeds every
  success ever recorded (max 1091s) and would have cut 4 builds (0.9%), all
  already partials; 25 min would have cut nothing. A timeout is classified like a
  turn overrun (`partial` if work landed, `too_big` if not), so it ships its
  first pass and invites a re-tag rather than vanishing.

The measured distribution behind those numbers (434 builds, 30 days):

| disposition | n | agent-time median |
| --- | --- | --- |
| success | 284 | 339s |
| partial | 89 | 788s |
| no_build | 19 | 41s |
| too_big / incomplete / usage_limit | 4 | — |

**Partials are ~20% of builds and ~40% of agent time, and that's fine.** A
partial ships a live first pass and invites a re-tag; 77% of partial sites (60 of
78) were continued that way. The re-tag loop is a **feature** — the back-and-forth
is part of what people like about the bot — so the aim is giving a big build room
to finish in one go, not automating the conversation away. Auto-continuing a
partial was considered and rejected on those grounds (Rob, 2026-08-02), even
though the requeue machinery already exists and would make it a small change.

## The wall (what stops runaway spend)

The subscription's own usage limits. Hit the ceiling and builds fail with a
rate-limit / "usage limit, resets at …" message; `box-build.sh` matches that and
`reply.mjs` sends the honest "out of budget, back soon" reply instead of the
generic failure. There is no dollar cap to blow through — a popular day means the
bot naps and catches up, it doesn't bill.

## The queue

Reuses the buildthis Worker's `STATE` KV. A `job:<uri>` record is the same
`BuildPayload` the Action's dispatch carried, plus a claim lifecycle
(`queued` → `claimed`, deleted on outcome) and an `attempts` counter. Keyed by
mention uri so a re-tick can't double-enqueue, and so it lines up with the
`event:<uri>` timeline record.

- `enqueueJob()` — watcher writes the job (idempotent on uri), `attempts: 1`.
- `POST /next-job` (QUEUE_TOKEN-authed) — box claims the oldest queued job.
- `POST /outcome` (OUTCOME_SECRET-authed) — box reports the result; merges onto
  the event record AND deletes the job. No separate done endpoint.
  - With `requeue: true` it instead **requeues**: the job flips back to `queued`,
    `attempts` bumps, and `enqueuedAt` resets so the retry goes to the FIFO tail
    (a repeatedly-failing build doesn't starve the ones behind it). No terminal
    outcome is written — the build isn't done. Capped at `MAX_JOB_ATTEMPTS` (3);
    past that the job is retired and the box's terminal failure reply is the last
    word.

This is intentionally a KV queue rather than a coordination system: the store's
already here, the job set is tiny (one box, serialized), and "list queued, take
oldest, mark claimed" is all that's needed. Claims are not perfectly atomic,
but duplicate work is harmless here and one box means there is little contention.

### Retry / requeue (why a build comes back)

The box classifies each build into a **disposition** (in `box-build.sh`) and the
reply + queue act on it:

- **success** — real work landed on `origin/main` (HEAD moved past the pre-build
  SHA). Reply "built it", retire the job. Success is measured by *the push*, not by
  "a `BUILD_RESULT` file exists" — that distinction is what stops a staged-but-
  -uncommitted build from being announced live when it never shipped. "Real" work
  specifically excludes a push that's *only* the mandatory receipts-archive resync
  (`REAL_CHANGED` in `box-build.sh`) — that housekeeping runs every build and must
  never by itself read as "built it 🎉" (fixed 2026-08-14, see `reply.mjs`).
- **usage_limit** — out of subscription budget. Honest "out of budget, back soon"
  reply, and **requeue** (retry once budget resets — not the build's fault).
- **incomplete** — the agent worked but nothing reached main (`rc != 0`, or it
  claimed a result that never got pushed). **Requeue** up to the attempt cap; the
  requeues are silent (`REPLY_SKIP` — no "trying again" spam in the thread), and only
  the *final* failed attempt posts a terminal honest-failure reply. This is the case
  the favstar/mistarget bugs fell into.
- **partial** — work landed, but the build hit the turn ceiling or the 20-minute
  clock. A real first pass is live and unfinished: reply "first pass is up, tag me
  to keep going", and retire. **Not** requeued — a continuation is a fresh re-tag,
  which is deliberate (see the runaway-guards section on why the re-tag is a
  feature). ~20% of builds.
- **too_big** — ran out of turns or clock and got *nothing* coherent onto disk.
  Terminal, no retry: an identical rerun overruns identically.
- **no_build** — the agent cleanly chose not to build: a note-only reaction to
  banter/a question, an explain-only answer (which still sets `BUILD_RESULT` to
  link the site being explained, without the "built it" framing), or a run where
  only the receipts-archive housekeeping touched the tree. Post the note (with
  the link, if any), retire — retrying would just re-react.

The box caps retries on the job's `attempts` field; the worker enforces the same
ceiling as a backstop, so a buggy box can't loop a job forever.

**Count outcomes on `disposition`, not `status`.** The outcome record carries
both. `status` is only success/failure, and it collapses the six dispositions in
a way that misleads in both directions: a `partial` reads as success (work did
ship) and a `no_build` reads as failure (nothing did). So neither field alone
answers "how many partials" or "how often does the bot decline". `disposition` is
stored verbatim on the event record for exactly this reason, and `/health` splits
partials and declines out rather than lumping them into shipped/failed. Records
written before 2026-08-02 have no `disposition` — historical counts have to come
from the box's journal (`disp=` in each `=== build rc=… ===` line) instead.

### Provenance (each site records its own origin)

On a real site build, `box-build.sh` stamps `sites/<name>/.buildthis.json` —
`{builtName, requestedBy, brief, note, mentionUri, builtAt}` — and commits it with
the site. This is the **durable** origin record: the KV event log (`/logs.json`,
logs.bisks.net) has a 30-day TTL; git history doesn't. The scratch files
(`BUILD_RESULT`, `BUILD_NOTE`) stay gitignored and per-build — they're cleared at
the start of every build (`git clean` skips gitignored files, so a stale one used to
leak into the next build and reply the wrong copy to the wrong thread).

## The cutover switch

`USE_BOX_QUEUE` (a plain var in `sites/buildthis/wrangler.toml`):

- `"1"` → watcher enqueues for the box (live).
- unset / not `"1"` → watcher fires the GitHub Action via `repository_dispatch`
  (fallback).

The Action is still fully wired as an instant fallback — flip the var off and
redeploy to revert to it. Caveat: it runs on the capped API workspace, which is
the billing model that got abandoned for burning a month's cap in a day. So it's
a real fallback only while that workspace has budget, and only as a stopgap
while the box is down — not somewhere to sit.

## Secrets

| Secret | Where | What |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | box `/etc/buildthis/env` | subscription inference auth |
| `BUILDER_PAT` | box env | Contents:write PAT; push fires deploy.yml |
| `BOT_APP_PASSWORD` | box env | bot's Bluesky app-password (posts replies) |
| `OUTCOME_SECRET` | box env + Worker + GH secret | auths POST /outcome |
| `QUEUE_TOKEN` | box env + Worker | auths POST /next-job |

All also mirrored in 1Password (Personal vault). The box env is root-owned,
group-readable by `builder` via the `buildthis-env` group (640) — not
world-readable.

## The provider is still a swappable env var

The box runs `claude -p`, so the inference provider is env-selected. If the
subscription ever stops being the right call, the builder can point at a cheaper
Anthropic-compatible endpoint — DeepSeek V4 Flash (~$0.01/build, official
`/anthropic` endpoint), a GLM coding plan, etc. — by setting `ANTHROPIC_BASE_URL`
+ a key in the box env. Task delivery, gate, deploy, and reply don't change. We
went with the subscription because it's flat-cost and already Rob's; the cheap
endpoints are the escape hatch if that changes.

## Watching it

- **`buildthis.bisks.net/health`** — the state of the **queue and the job
  pipeline**, computed entirely from KV on the Worker side. `ok:false` + an
  `issues` list when one of its checks trips. `/health.html` is the same, for
  eyeballing. It answers "are jobs flowing?" — it knows nothing about the box's
  internals (auth, disk, systemd unit state, the `claude` CLI); for those, log
  into the box. The four checks:
  - **box alive** — did the box poll `/next-job` within 12 min? (It polls every 15s
    *when idle*; during a build it's heads-down, hence the wide window — a build can
    run ~10 min. A dead box trips this AND the orphan check below.)
  - **queue** — how many waiting / building, and the age of the oldest of each. A
    backlog (>8 waiting) means arrivals are outpacing the one box.
  - **orphans** — jobs stuck `claimed` >30 min (a build that died without reporting;
    this is what the day-old orphaned job would have shown up as).
  - **pushed-but-not-live** — recent successes whose URL didn't serve after deploy
    (`liveVerified:false`); the favstar-class dead-link signal.
  - It's public + read-only (no secrets, just counts), so an uptime check or a cron
    can watch `.ok` without a token.
- Box loop: `journalctl -u buildthis-poll -f` on the box.
- Timeline: `logs.bisks.net` (reads `buildthis.bisks.net/logs.json`).
- Watcher: `pnpm --filter @atprotozoa/buildthis logs`, or the Cloudflare
  dashboard (observability is on).

## Guardrails against silent failure (why the bot's promises are now self-checking)

Two classes of bug bit early on, both invisible until someone complained: a build
that reported "live 🎉" but never actually shipped (favstar), and a failed build
that replied with a *previous* build's leftover note to the wrong thread. The
defenses now in place:

- **Success = the push actually landed on main** (HEAD moved past the pre-build
  SHA), not "a `BUILD_RESULT` file exists." A staged-but-uncommitted build can't be
  reported live. (`box-build.sh`)
- **Post-deploy liveness check** — after a success pushes, the box polls the target
  URL until it serves (bounded ~90s) *before* replying. The result (`liveVerified`)
  is logged on the outcome; a build that pushed but never came up is flagged in
  `/health`, not linked as a 404.
- **Scratch files cleared every build** — `BUILD_RESULT`/`BUILD_NOTE` are gitignored,
  so `git clean` skips them; they're now `rm`'d at the start of every build so a
  stale note can't leak into a later reply.
- **Retry/requeue** — an incomplete or out-of-budget build requeues (bumped
  attempts, FIFO tail, capped at 3) instead of dying silently.
- **`post-reply.mjs`** — admin tool (runs on the box) to post or delete a bot reply
  by hand for corrections, without leaking the app-password off the box.
