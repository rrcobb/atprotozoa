# buildthis — the taggable build bot

`@buildthis.bisks.net` is a Bluesky account. Rob's mutuals tag it in a post
describing a small site or feature idea; the bot spins up a cloud coding agent
that builds the thing into this repo, autodeploys it, and replies in-thread with
the live URL.

The repo already does most of the work: push-to-main autodeploys changed Workers,
new sites are `cp -r` + rename, subdomains provision themselves. The only genuinely
new machinery is: **watch for mentions → gate on who + budget → run an agent →
reply.**

## The four parts

### 1. The bot account (`sites/buildthis`)

A real Bluesky account for `@buildthis.bisks.net` — its own DID, its own PDS
account (bsky.social signup). It gets the handle the same way the apex gets
`bisks.net`: a Worker serving `/.well-known/atproto-did` with the bot's DID. So
`buildthis` is just another site directory whose Worker's only job is that one
endpoint (plus a static "what am I" landing page).

The bot's **app-password** authenticates it to read mentions and post replies. It
lives as a secret (Cloudflare Worker secret for the watcher, GitHub Actions secret
for the reply step) — never in the repo.

### 2. The watcher (a cron Worker, `sites/buildthis`)

The same Worker runs on a cron trigger (every minute or two). Each tick:

1. Log in as the bot (app-password → session).
2. `app.bsky.notification.listNotifications`, filter to `reason: "mention"` and
   to notifications newer than the last-seen cursor (stored in KV).
3. For each new mention, resolve the author DID and check **Rob's** mutual status:
   `app.bsky.graph.getRelationships?actor=<rob-did>&others=<author-did>`. A mutual
   has BOTH `following` (Rob → them) and `followedBy` (them → Rob). A non-mutual
   gets a friendly reply that tags Rob (`@bisks.net`) so he can pick it up by hand
   — the bot doesn't build for them, but it doesn't leave them hanging either. No
   dispatch happens on the non-mutual path.
4. `repository_dispatch` to GitHub with the post text + light thread context as the
   build brief, and the reply target (the post's URI/CID) so the Action can reply.
   (No build-count checks — spend is bounded by the workspace cap, see Budget.)
5. Record the mention as handled (KV) so it can't re-trigger.

Why cron-polling notifications and not Jetstream: `listNotifications` gives
mentions already filtered and is naturally deduped by cursor; the bot is authed
anyway to reply. Jetstream would be live but needs its own dedup + a mention
filter we'd build by hand. Polling is the simpler correct thing for v1.

**"Rob's mutuals," specifically.** The allowlist is people who mutually follow
`bisks.net` (`did:plc:f6n22z62adionrvb5s6n6vfk`) — NOT the bot's own follows. The
check runs against Rob's DID regardless of which account the mention lands on.

### 3. The builder (GitHub Action)

`repository_dispatch` (event type `buildthis`) runs Claude Code headless
(`anthropics/claude-code-action@v1`) with a prompt built from the post text. The
agent builds a new `sites/<name>/` or a new path on an existing site — whatever
fits the idea — commits, and pushes to main. The existing deploy workflow sees the
push and ships the changed Worker to its subdomain.

Builds are **serialized** via a `concurrency` group: two mentions in the same
minute produce two dispatches, but they run one at a time, so two agents never
push to main at once. Rate caps keep the queue short.

### 4. The reply

The **last step of the Action** posts the reply — it knows the built site name →
URL and whether the build succeeded. It logs in as the bot and replies in-thread:
success → "built it: `<name>.bisks.net` 🎉"; failure → an honest "couldn't build
that one." No human-in-the-loop; the reply is automatic.

## Budget & rate caps

Rob's stated ceiling: **don't spend more than ~$10 by accident.** Three layers,
from hardest backstop to finest throttle:

- **The real backstop — an Anthropic spend cap on a dedicated Workspace.** The
  Console (Settings → Limits) lets you set a monthly USD spend cap per Workspace;
  when it's hit, that workspace's API key **stops serving requests until next
  month.** So: make a Workspace just for the bot, cap its spend, and give the
  builder Action a key scoped to it. This is enforced by Anthropic — even if the
  watcher's own caps failed and dispatched infinitely, spend can't exceed the cap.
  The cap is **monthly**, not daily; pick a modest monthly number (e.g. $20–50) as
  the true ceiling, and let the daily build-count below do the day-to-day pacing.
  (Verified against the rate-limits docs — there is no per-request USD flag, but
  the workspace cap is a genuine hard wall.)
- **Model choice — Sonnet 5, not Opus.** The builder runs `--model claude-sonnet-5`
  (~2–3× cheaper input than Opus). Scaffolding small static sites doesn't need
  Opus-tier taste, so this stretches the cap further. Haiku 4.5 is cheaper still,
  and Kimi K2 via an Anthropic-compatible proxy is ~15× cheaper again — both are
  cost-down levers to reach for only if the bill climbs.
- **Per-build bound in the Action: `--max-turns 30` + a job `timeout-minutes`.**
  So one runaway build can't spin forever. Not a dollar cap (the action has no USD
  flag), just a stop on a single wedged run.

**No build-count or per-person caps.** Rob's call: the *only* ceiling is dollars —
the workspace spend cap. The watcher dispatches a build for every mutual mention;
if that ever costs too much, the workspace cap stops it, and the dial to turn is
the cap (Console) or the model (cheaper tier), not a count.

## House rules: the brief is third-party text

The build prompt is a Bluesky post written by someone else, fed to an autonomous
agent with commit + deploy rights. Rob's mutuals aren't attackers, but "someone
else's text steers an agent that can push to main" earns one bounded blast radius
regardless. No human-in-the-loop — just a sandbox the agent works happily within:

- **Builder scope:** the agent creates/edits only under `sites/<name>/` and
  `apex/public/`. It leaves `.github/`, secrets/`.dev.vars`, other sites, and
  `notes/` alone. Carried by `.github/buildthis/BUILDER_INSTRUCTIONS.md` (the
  build agent reads it FIRST and treats it as binding) plus the `--allowedTools`
  constraint.
- **Watcher-side:** length-cap the post text and pass it as a *feature
  description*, not as harness instructions.

So a brief like "delete the other sites" or "print the secrets" has no purchase:
the agent won't touch those paths, and the reply only ever exposes a URL. The
instructions file is written as house rules for a colleague, not a leash — the
point is that good work ships the moment it lands.

## Decisions (settled with Rob)

- [x] Reply automatically when tagged — **no** human-in-the-loop, autodeploy.
- [x] Runner: **GitHub Actions** (Claude Code headless), triggered from the
      Cloudflare watcher. Nothing routes to Rob's laptop.
- [x] Allowlist: **Rob's mutuals** (mutual follow of `bisks.net`), not the bot's.
- [x] Non-mutuals: **replied to with a tag to `@bisks.net`** so Rob can take it
      manually. No build, but no silence either.
- [x] Scope: agent's choice — new site OR new path, per the idea.
- [x] Budget: **dollars only** — a monthly spend cap on a dedicated Anthropic
      Workspace is the sole ceiling. Builder on **Sonnet 5** to stretch it,
      `--max-turns 30` per build as a runaway stop. **No build-count / per-person
      caps** — the watcher dispatches for every mutual mention.
- [x] Builds **serialized** via a concurrency group.
- [x] House rules: builder works within `sites/` + `apex/public/`.

## One-time setup (marked [rob] where it needs credentials)

1. **[rob]** Create the Bluesky account for `@buildthis.bisks.net` (bsky.social
   signup), then generate an **app-password** for it.
2. **[rob]** Resolve the bot's DID (`resolveHandle` on its temporary
   `*.bsky.social` handle) and drop it into `sites/buildthis` config.
3. Deploy `sites/buildthis` so `/.well-known/atproto-did` is live, then **[rob]**
   set the bot's handle to `buildthis.bisks.net` in the Bluesky app.
4. **[rob]** In the Anthropic Console: create a **Workspace** for the bot, set a
   monthly **spend cap** on it (Settings → Limits), and mint an `ANTHROPIC_API_KEY`
   scoped to that workspace. This is the hard spend wall.
5. **[rob]** Secrets: that workspace-scoped `ANTHROPIC_API_KEY` + `BOT_IDENTIFIER`
   + `BOT_APP_PASSWORD` as GitHub Actions secrets (the reply step needs the app
   password too); the bot app-password + a repo-scoped GitHub token as Cloudflare
   Worker secrets (the watcher uses the token to fire `repository_dispatch`).
6. Wire the watcher's cron trigger and KV namespace (`wrangler kv namespace create
   buildthis-state`, paste the id into `wrangler.toml`).

Details for each land next to the code as it's built.
