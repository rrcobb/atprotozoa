# buildthis — infra & budget

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
   │                 claude -p  (Sonnet, subscription OAuth token, --max-turns 60)
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
  never kills the loop; a wedged build ages out of the queue rather than
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

The token comes from `claude setup-token` (run once as the `builder` user; prints
an `sk-ant-oat01-…` string). It lives in `/etc/buildthis/env` as
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
- **`--max-turns 60`** (`BUILDER_MAX_TURNS` overrides). Was 30, tuned for Opus;
  Sonnet takes more, smaller steps and a real build (a whole game with
  animations) blew past 30 and got cut off mid-build. 60 gives room. This is a
  runaway stop, not a budget.
- **systemd `TimeoutStopSec` + wall-clock** are the outer runaway bounds.

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

KV, not a real queue: the store's already here, the job set is tiny (one box,
serialized), and "list queued, take oldest, mark claimed" is all that's needed.
Claims aren't perfectly atomic, but one box means no contention.

### Retry / requeue (why a build comes back)

The box classifies each build into a **disposition** (in `box-build.sh`) and the
reply + queue act on it:

- **success** — work actually landed on `origin/main` (HEAD moved past the pre-build
  SHA). Reply "built it", retire the job. Success is measured by *the push*, not by
  "a `BUILD_RESULT` file exists" — that distinction is what stops a staged-but-
  -uncommitted build from being announced live when it never shipped.
- **usage_limit** — out of subscription budget. Honest "out of budget, back soon"
  reply, and **requeue** (retry once budget resets — not the build's fault).
- **incomplete** — the agent worked but nothing reached main (`rc != 0`, or it
  claimed a result that never got pushed). **Requeue** up to the attempt cap; the
  requeues are silent (`REPLY_SKIP` — no "trying again" spam in the thread), and only
  the *final* failed attempt posts a terminal honest-failure reply. This is the case
  the favstar/mistarget bugs fell into.
- **no_build** — the agent cleanly chose not to build (a note-only reaction to
  banter/a question). Post the note, retire — retrying would just re-react.

The box caps retries on the job's `attempts` field; the worker enforces the same
ceiling as a backstop, so a buggy box can't loop a job forever.

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
redeploy to revert to it. (It'll be back on the capped API workspace and its
budget wall, so it's a real fallback only while that workspace has budget.)

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

- **Health surface (start here): `buildthis.bisks.net/health`** — one JSON answer to
  "is the whole thing OK?", computed from KV. `ok:false` + an `issues` list when
  something's wrong. `/health.html` is the same, for eyeballing. What it checks:
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
