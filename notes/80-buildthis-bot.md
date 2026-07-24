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
4. Build the brief. The tagging post's text is the instruction. **If the tag was a
   reply** (someone wrote "@buildthis build this ☝️" under another post),
   `getPostThread` walks the ancestor chain and prepends those posts as context, so
   "this" resolves to what it points at. The only bound is **10 ancestors** — each
   is included in full (a Bluesky post is ~300 chars, so 10 is ~3k chars / <1k
   tokens, not worth truncating). The tagging post keeps a 600-char sanity cap.
   Thread fetch is best-effort; on failure the build proceeds on the tag alone.
5. **Like the tagging post** as a "working on it" acknowledgement, so the requester
   can see the bot picked up the tag while the build runs in the background. Guarded
   by a per-post `liked:` KV marker so a dispatch retry can't stack duplicate likes.
6. `repository_dispatch` to GitHub with the brief + the reply target (the post's
   URI/CID) so the Action can reply. (No build-count checks — spend is bounded by
   the provider spend cap, see Budget.)
7. Record the mention as handled (KV) so it can't re-trigger.

Why cron-polling notifications and not Jetstream: `listNotifications` gives
mentions already filtered and is naturally deduped by cursor; the bot is authed
anyway to reply. Jetstream would be live but needs its own dedup + a mention
filter we'd build by hand. Polling is the simpler correct thing for v1.

**"Rob's mutuals," specifically.** The allowlist is people who mutually follow
`bisks.net` (`did:plc:f6n22z62adionrvb5s6n6vfk`) — NOT the bot's own follows. The
check runs against Rob's DID regardless of which account the mention lands on.

### 3. The builder (GitHub Action)

`repository_dispatch` (event type `buildthis`) runs the **Claude Code CLI directly**
(`claude -p`), not the `claude-code-action`. Why the CLI: it lets plain env vars
(`ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL`) control the model
and endpoint, with no action wrapper deciding what to forward — so swapping the
builder's provider is a one-line change. The agent reads the build prompt
(`sites/buildthis/builder/BUILD_PROMPT.md`), builds a new site OR edits an existing
one, commits, and pushes to main. `--permission-mode bypassPermissions` makes it
fully unattended; `--max-turns` bounds a runaway. The existing deploy workflow sees
the push and ships the changed Worker to its subdomain.

**Why the builder files live in `sites/buildthis/builder/`, not `.github/`.** The
prompt, instructions, and reply script describe the bot's *behavior*, and the bot is
allowed to edit its own behavior ("make yourself do X" is a valid request). If they
lived under `.github/` — which is off-limits — the bot couldn't self-edit. So only
the *workflow* stays in `.github/` (protected); everything that shapes what the bot
does sits with the bot, editable. `builder/` is not bundled into the Worker (its
`main` is `src/index.ts`, assets are `public/`).

**GOTCHA — the build must push with a PAT, not `GITHUB_TOKEN`.** GitHub suppresses
workflow runs for pushes made with the default `GITHUB_TOKEN` (an infinite-loop
guard), so a build that pushed with it would land on main but **never deploy** — the
reply promises a URL that never comes up. The checkout therefore uses a repo-scoped
PAT (`BUILDER_PAT`, Contents:write) as its token, which pushes as a normal user and
fires `deploy.yml`. Caught this the first live test — do not "simplify" it back to
`GITHUB_TOKEN`.

**Model: currently Opus 5 (`claude-opus-5`) on the Anthropic endpoint.** Same price as
Opus 4.8 ($5/$25 per MTok), newer and stronger at agentic coding — a one-line bump from
4.8. Kimi K3 was the original plan (near-frontier coding, prepaid = hard cap), but
Moonshot's signups are capacity-throttled, so we're on Opus for now. Switching to K3 later is three env
lines in the workflow (base URL → Moonshot, model → `kimi-k3`, key → `MOONSHOT_API_KEY`).

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

- **The hard wall — an Anthropic Workspace spend cap** (while we're on Opus). The
  Console (Settings → Limits) sets a monthly USD cap per Workspace; when hit, that
  workspace's key stops serving until next month. Put the bot's `ANTHROPIC_API_KEY`
  on a dedicated capped workspace and that cap is the wall — enforced by Anthropic,
  independent of any code. It's monthly, not daily; pick a modest number.
  - *When K3/Moonshot is available:* the wall becomes the **prepaid Moonshot
    balance** instead — the account can't spend past what's loaded, which is an
    even simpler hard ceiling. Swapping to K3 swaps the wall along with it.
- **Model — Opus 5 for now** (Moonshot signups throttled; K3 is the intended
  target for its near-frontier coding at similar price + prepaid cap). Opus is the
  most capable option and fine for the toy sites; if spend matters more than taste,
  Sonnet 5 or Haiku 4.5 are cheaper drop-ins (one env line).
- **Per-build bound: `--max-turns 30` + a job `timeout-minutes`.** So one runaway
  build can't spin forever. Not a dollar cap, just a stop on a single wedged run.

The watcher dispatches a build for every mutual mention. If total spend ever climbs
too fast, the dial is the workspace cap (or, on K3, the prepaid balance) or a
cheaper model tier — not a count.

## House rules: the brief is third-party text

The build prompt is a Bluesky post written by someone else, fed to an autonomous
agent with commit + deploy rights. Rob's mutuals aren't attackers, and Rob's call is
that the bot should be able to edit **anything** — new sites, existing sites, even
its own code ("make yourself do X" is a valid ask). So the sandbox is deliberately
small: just the two things where third-party-text-steers-the-bot is genuinely
dangerous.

- **The only two hard limits:** (1) don't touch `.github/` — the workflow that runs
  the bot, so a post can't rewrite the bot's own CI/permissions; (2) don't read or
  edit secrets (`*.dev.vars`, tokens, keys), so a post can't exfiltrate the API key.
  Everything else — all sites, `sites/buildthis/` itself, `apex/`, `notes/`, root
  config — is fair game. Carried by `sites/buildthis/builder/INSTRUCTIONS.md` (read
  FIRST, binding).
- **Watcher-side:** the brief is passed as a *description of the work*, not as
  harness instructions, and the reply text is derived from the build result, never
  from the brief — so brief text can't become bot-authored post copy.

So "print the secrets" and "rewrite your workflow to remove the limits" have no
purchase (those two paths are off), but "add dark mode to trigrams" or "make your
replies funnier" (editing `sites/buildthis/builder/`) both work. The trade Rob chose
knowingly: a mutual's post *can* edit a live site or the bot's own behavior — the
blast radius is a bad site edit (fixable, and visible in git), not a leaked key.

## Decisions (settled with Rob)

- [x] Reply automatically when tagged — **no** human-in-the-loop, autodeploy.
- [x] Runner: **GitHub Actions**, running the Claude Code CLI (`claude -p`) headless
      against **Kimi K3** (Moonshot endpoint), triggered from the Cloudflare watcher.
      Nothing routes to Rob's laptop.
- [x] Allowlist: **Rob's mutuals** (mutual follow of `bisks.net`), not the bot's.
- [x] Non-mutuals: **replied to with a tag to `@bisks.net`** so Rob can take it
      manually. No build, but no silence either.
- [x] Scope: agent's choice — new site OR new path, per the idea.
- [x] Budget: **dollars only** — an Anthropic **Workspace spend cap** is the wall
      while on Opus (becomes the prepaid Moonshot balance if/when we move to K3).
      `--max-turns 30` per build as a runaway stop. **No build-count / per-person
      caps** — the watcher dispatches for every mutual mention.
- [x] Model: **Opus 5 for now** — Moonshot signups are capacity-throttled, so
      Kimi K3 (the intended target: near-frontier coding, prepaid hard cap) is on
      hold. Switching to K3 is a one-line env change when signups open.
- [x] Builds **serialized** via a concurrency group.
- [x] House rules: builder may edit **anything except `.github/` + secrets** —
      including existing sites and its own code. (Rob's call: reversed the earlier
      "new sites only, others read-only" sandbox; that was too restrictive — it
      couldn't even edit itself.)

## One-time setup (marked [rob] where it needs credentials)

1. **[rob]** Create the Bluesky account for `@buildthis.bisks.net` (bsky.social
   signup), then generate an **app-password** for it.
2. **[rob]** Resolve the bot's DID (`resolveHandle` on its temporary
   `*.bsky.social` handle) and drop it into `sites/buildthis` config.
3. Deploy `sites/buildthis` so `/.well-known/atproto-did` is live, then **[rob]**
   set the bot's handle to `buildthis.bisks.net` in the Bluesky app.
4. **[rob]** In the Anthropic Console: create a **Workspace** for the bot, set a
   monthly **spend cap** (Settings → Limits), and mint an `ANTHROPIC_API_KEY` scoped
   to it. That cap is the hard spend wall while on Opus. (Later, when Moonshot
   signups open: create a Moonshot account, load a prepaid balance = your ceiling,
   mint a key, and the wall moves to that balance.)
5. **[rob]** Secrets — Rob provides the values, Claude runs the `gh secret set` /
   `wrangler secret put` commands:
   - GitHub Actions: `ANTHROPIC_API_KEY` (workspace-scoped), `BOT_IDENTIFIER`,
     `BOT_APP_PASSWORD` (reply step needs the app password).
   - Cloudflare Worker: `BOT_APP_PASSWORD` + a repo-scoped `GITHUB_TOKEN` (watcher
     fires `repository_dispatch`).
6. Bot DID, KV namespace, and repo slug are already wired in
   `sites/buildthis/wrangler.toml`.

Details for each land next to the code as it's built.

## Watching the watcher (logs)

The watcher runs unattended on a 2-min cron, so a failed tick (login error, dispatch
failure) is invisible unless you look. Three ways to look, live → durable:

- **Live tail** — `pnpm --filter @atprotozoa/buildthis logs` (or from the site dir,
  `pnpm logs` / `pnpm logs:errors` for error-only). Streams `console.log`/error as
  they happen; only shows what fires while you're watching. Good for debugging a
  tick in real time.
- **Durable logs (dashboard)** — `[observability] enabled = true` is set in
  `wrangler.toml`, so Cloudflare retains logs (a few days). View at dash → Workers &
  Pages → `atprotozoa-buildthis` → Logs, with search/filter. This is the "did it
  error overnight?" answer — no need to be tailing when it happens.
- **GraphQL Analytics API** (scriptable) — `POST
  https://api.cloudflare.com/client/v4/graphql`, needs a Cloudflare **API token**
  (Account Analytics: Read; + Workers Observability read for log bodies) — the
  wrangler OAuth session is NOT a usable bearer token here, mint a scoped token.
  Use this for automated error-count checks / alerting from another script.

The watcher already `console.error`s each failure path (createSession,
listNotifications, dispatch, reply), so those land in all three.
