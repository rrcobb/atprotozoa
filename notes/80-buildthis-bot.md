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

`repository_dispatch` (event type `buildthis`) runs the **Claude Code CLI directly**
(`claude -p`), not the `claude-code-action`. Why the CLI: the builder runs on
**Kimi K3** via Moonshot's Anthropic-compatible endpoint, and the CLI honors
`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL` directly — running
it ourselves means those env vars are set explicitly, with no action wrapper
deciding what to forward. The agent reads the build prompt
(`.github/buildthis/BUILD_PROMPT.md`), builds a new `sites/<name>/` or a new path on
an existing site, commits, and pushes to main. `--permission-mode bypassPermissions`
makes it fully unattended; `--max-turns` bounds a runaway. The existing deploy
workflow sees the push and ships the changed Worker to its subdomain.

Builds are **serialized** via a `concurrency` group: two mentions in the same
minute produce two dispatches, but they run one at a time, so two agents never
push to main at once.

### 4. The reply

The **last step of the workflow** posts the reply — it knows the built site name →
URL and whether the build succeeded. It logs in as the bot and replies in-thread:
success → "built it: `<name>.bisks.net` 🎉"; failure → an honest "couldn't build
that one." No human-in-the-loop; the reply is automatic.

## Budget

Rob's stated ceiling: **don't spend more than ~$10 by accident.** Dollars are the
*only* ceiling — no build-count or per-person caps.

- **The hard wall — Moonshot is prepaid.** The builder runs on Kimi K3, and
  Moonshot has no per-key spend-limit setting; instead the account is **prepaid**,
  so it simply can't spend more than the balance loaded. That balance *is* the cap:
  load $20 and $20 is the most it can ever cost before you choose to refill. This is
  a genuine hard ceiling — arguably better than a configurable cap, since it's the
  account balance, not a setting that can be misconfigured. Keep the balance at
  whatever accidental-spend number you're comfortable with.
- **Model — Kimi K3.** Near-frontier coding quality (benchmarks a hair below Fable 5
  / GPT-5.6, above Sonnet 5) at ~$3/$15 per Mtok, with a steep cache-hit discount
  ($0.30/Mtok input) that a coding agent hits often. Chosen over Sonnet 5 because
  it's better output at similar price, and the prepaid model gives us the hard cap
  anyway. Trade-off accepted: the builder talks to Moonshot's endpoint, not
  Anthropic's, so the Anthropic-workspace spend cap does not apply — the prepaid
  balance replaces it.
- **Per-build bound: `--max-turns 30` + a job `timeout-minutes`.** So one runaway
  build can't spin forever. Not a dollar cap, just a stop on a single wedged run.

The watcher dispatches a build for every mutual mention. If total spend ever climbs
too fast, the dial is the prepaid balance (don't refill) or the model tier — not a
count.

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
- [x] Runner: **GitHub Actions**, running the Claude Code CLI (`claude -p`) headless
      against **Kimi K3** (Moonshot endpoint), triggered from the Cloudflare watcher.
      Nothing routes to Rob's laptop.
- [x] Allowlist: **Rob's mutuals** (mutual follow of `bisks.net`), not the bot's.
- [x] Non-mutuals: **replied to with a tag to `@bisks.net`** so Rob can take it
      manually. No build, but no silence either.
- [x] Scope: agent's choice — new site OR new path, per the idea.
- [x] Budget: **dollars only** — the **prepaid Moonshot balance** is the sole
      ceiling (Kimi K3 can't spend past what's loaded). `--max-turns 30` per build
      as a runaway stop. **No build-count / per-person caps** — the watcher
      dispatches for every mutual mention.
- [x] Model: **Kimi K3** — near-frontier coding, prepaid = hard cap. (Reverses the
      earlier Sonnet-5 pick, which was chosen only to keep the Anthropic spend cap;
      prepaid gives us the cap regardless, so the better model wins.)
- [x] Builds **serialized** via a concurrency group.
- [x] House rules: builder works within `sites/` + `apex/public/`.

## One-time setup (marked [rob] where it needs credentials)

1. **[rob]** Create the Bluesky account for `@buildthis.bisks.net` (bsky.social
   signup), then generate an **app-password** for it.
2. **[rob]** Resolve the bot's DID (`resolveHandle` on its temporary
   `*.bsky.social` handle) and drop it into `sites/buildthis` config.
3. Deploy `sites/buildthis` so `/.well-known/atproto-did` is live, then **[rob]**
   set the bot's handle to `buildthis.bisks.net` in the Bluesky app.
4. **[rob]** Create a **Moonshot** account, load it with whatever prepaid balance
   you want as the spend ceiling, and mint a Moonshot API key. That balance is the
   hard spend wall for builds.
5. **[rob]** Secrets: `MOONSHOT_API_KEY` + `BOT_IDENTIFIER` + `BOT_APP_PASSWORD` as
   GitHub Actions secrets (the reply step needs the app password too); the bot
   app-password + a repo-scoped GitHub token as Cloudflare Worker secrets (the
   watcher uses the token to fire `repository_dispatch`). — Rob provides the values;
   Claude runs the `gh secret set` / `wrangler secret put` commands.
6. KV namespace + repo slug are already wired (`sites/buildthis/wrangler.toml`).

Details for each land next to the code as it's built.
