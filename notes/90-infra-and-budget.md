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
(`queued` → `claimed`, deleted on outcome). Keyed by mention uri so a re-tick
can't double-enqueue, and so it lines up with the `event:<uri>` timeline record.

- `enqueueJob()` — watcher writes the job (idempotent on uri).
- `POST /next-job` (QUEUE_TOKEN-authed) — box claims the oldest queued job.
- `POST /outcome` (OUTCOME_SECRET-authed) — box reports the result; merges onto
  the event record AND deletes the job. No separate done endpoint.

KV, not a real queue: the store's already here, the job set is tiny (one box,
serialized), and "list queued, take oldest, mark claimed" is all that's needed.
Claims aren't perfectly atomic, but one box means no contention.

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

- Box loop: `journalctl -u buildthis-poll -f` on the box.
- Timeline: `logs.bisks.net` (reads `buildthis.bisks.net/logs.json`).
- Watcher: `pnpm --filter @atprotozoa/buildthis logs`, or the Cloudflare
  dashboard (observability is on).
