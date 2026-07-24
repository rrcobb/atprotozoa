# buildthis — infra & budget

## Recommendation

Stay on the current architecture (GitHub Actions running `claude -p` against a
capped Anthropic workspace). Make two changes:

1. **Drop the builder to Sonnet 5** (`claude-sonnet-5`, $3/$15 per MTok vs Opus's
   $5/$25 — introductory $2/$10 through 2026-08-31). This is one line in
   `buildthis.yml` (`ANTHROPIC_MODEL`). For toy-site builds the quality gap
   won't be visible in the output; it roughly halves cost per build, so the same
   monthly cap buys ~2x the builds.
2. **Raise the workspace cap to a number you're comfortable losing in a month,
   and treat "cap hit" as the expected steady state, not an incident.** The wall
   is working exactly as designed — the bot got popular and spent the month's
   budget in a day. That's a pricing decision, not a bug. Pick a monthly number
   that's fun-money, and know that when it's gone the bot goes quiet until the
   1st.

Everything below is the reasoning and the alternatives I ruled out.

The two ideas you floated — Anthropic Managed Agents, and a subscription-backed
Claude Code session — don't fix the actual problem. Managed Agents moves *where*
the agent runs but it's still billed per token, so the economics are identical.
A subscription-backed session trades a clean, provider-enforced hard wall for an
always-on machine, a ToS gray area, and a soft limit you can't rely on. Neither
is worth the migration.

---

## Current architecture

The end-to-end path, and where money is spent:

```
Bluesky mention (@buildthis)
   │
   ▼
Cloudflare cron Worker  (sites/buildthis, runs every ~2 min)
   │  listNotifications → filter mentions → dedupe on KV cursor
   │  gate: is the author a mutual of bisks.net?  (getRelationships)
   │  like the post (ack), build the brief from the tag + thread
   ▼
repository_dispatch → GitHub  (event_type: buildthis)
   │
   ▼
GitHub Action  (.github/workflows/buildthis.yml)
   │  checkout with BUILDER_PAT (not GITHUB_TOKEN — so the push deploys)
   │  ┌─────────────────────────────────────────────┐
   │  │  claude -p  (Claude Code CLI, headless)      │  ← ALL the money is here
   │  │  --permission-mode bypassPermissions         │
   │  │  --max-turns 30                              │
   │  │  ANTHROPIC_API_KEY = capped-workspace key    │
   │  │  builds a site, commits, pushes to main      │
   │  └─────────────────────────────────────────────┘
   │  reply step: reads BUILD_RESULT, posts in-thread as the bot
   ▼
push to main → deploy.yml → wrangler deploy → <name>.bisks.net
```

The only line item that costs money is the `claude -p` step. Everything else —
the Cloudflare Worker, the Actions minutes, Bluesky API calls — is free or
negligible. Cost is entirely input+output tokens on the builder model, billed
per build. There is no per-build or per-person cap in the code; spend is bounded
only by the workspace's monthly USD cap.

### The current failure mode

The bot's API key lives on a dedicated Anthropic workspace with a monthly spend
cap (Console → Settings → Limits). The bot got popular and, in one day, spent the
whole month's cap. Once the cap is hit, that workspace's key stops serving until
the calendar month rolls over.

What that looks like end to end, confirmed from the recent run history: every
dispatch still fires, the Action still runs, but the `claude -p` step dies
immediately with

```
API Error: 400 You have reached your specified API usage limits.
You will regain access on 2026-08-01 at 00:00 UTC.
```

The build writes no `BUILD_RESULT`, so the reply step falls through to the
failure copy — "couldn't build that one, sorry!" — and posts it in-thread. From
the requester's side the bot looks broken; it's actually just out of budget. The
run history shows a clean split: builds succeeding through ~20:00 UTC, then an
unbroken wall of failures after the cap tripped.

So the wall works — it's a hard, provider-enforced stop, exactly what you wanted
for "don't spend more than ~$X by accident." The problem is purely that the
number was small and the traffic was large, and that hitting the wall produces a
confusing user-facing failure rather than a "come back next month" message.

---

## The design space

Four ways to change where the agent runs or how it's paid. For each: cost shape,
what changes, migration effort, and what the hard wall is.

### A. Status quo — GitHub Actions + capped API workspace

**What it is:** what's running now. Dial is the monthly cap or the model.

- **Cost shape:** pay per token, per build. Opus 5 is $5/$25 per MTok in/out; a
  toy-site build is a modest number of tokens, but "modest × popular" is what
  emptied the cap.
- **What changes:** nothing — it's built.
- **Effort:** zero.
- **Hard wall:** the Anthropic workspace spend cap. Monthly, USD-denominated,
  enforced by Anthropic independent of any code. When it's hit, the key 400s
  until the 1st. This is the strongest wall of any option — you cannot blow
  through it by accident.

The only real levers here are the cap number and the model tier (see D).

### B. Anthropic Managed Agents

**What it is:** instead of the GitHub Action running `claude -p`, Anthropic hosts
the agent loop and provisions a sandbox container per session. You'd trigger a
session (or a scheduled deployment) that clones the repo, edits files, commits,
pushes, and replies.

Mechanically this *can* do what the bot needs. The pieces exist:

- The repo mounts as a `github_repository` session resource (URL + a
  `Contents: Read and write` PAT), cloned into the container before the agent
  starts. The agent edits files and pushes over `git` via an Anthropic-side proxy
  that injects the token — the sandbox never sees it.
- The agent config carries the model, system prompt, and toolset
  (`agent_toolset_20260401` gives it bash/read/write/edit/grep — the same shape
  as the CLI's `--allowedTools`).
- The watcher would call `sessions.create()` instead of `repository_dispatch`,
  then stream events to know when it's done.
- The reply could stay in a follow-up step, or move into the agent.

**But it doesn't change the economics.** Managed Agents is still API-billed — you
pay per token for the model that runs inside the session, at the same per-MTok
rates as A. It changes *where* the agent runs (Anthropic's infra instead of a
GitHub runner), not *what you pay per token*. So it does nothing for the actual
problem, which is cost.

- **Cost shape:** same per-token billing as A, plus session/container overhead.
  Net: same or slightly more.
- **What changes:** the watcher stops dispatching to GitHub and starts driving
  sessions over the API; you take on the session lifecycle (create, stream
  events, detect terminal state, handle reconnects). More moving parts than a
  `repository_dispatch` POST. It's also a beta surface.
- **Effort:** a real migration — rewrite the dispatch path, define the agent and
  environment, wire a vault for the GitHub PR credential if you want PRs, handle
  the event stream. Days, not minutes.
- **Hard wall:** still the workspace spend cap (Managed Agents draws on the same
  org token limits and workspace). Same wall as A, reached the same way.

Verdict: strictly more complexity for identical cost economics. Skip it. The one
scenario where it'd be worth it is if you wanted Anthropic to own the sandbox and
you were fighting the GitHub Actions model — but you're not; the Action is fine.

### C. Subscription-backed Claude Code (the "under a subscription" idea)

**What it is:** a long-running Claude Code session on an always-on machine, logged
in with a Max-or-similar plan, that picks up build requests — instead of
per-call API billing. This is the "put it all under a subscription" idea.

The appeal is obvious: a subscription is a flat monthly cost, so a popular day
doesn't translate into a spend spike. But it trades away the properties that make
the current setup safe and simple.

**How requests would reach it.** The watcher can't `repository_dispatch` to a
laptop. You'd need either (a) the watcher messages the machine (a webhook it
polls, or an `am`-style queue), or (b) the machine polls Bluesky itself and the
Cloudflare watcher goes away. Either way you've added a piece of always-on infra
you now own and have to keep alive.

**The always-on-machine cost.** A subscription plan tied to an interactive login
isn't a server credential — it expects a machine that stays up and stays logged
in. That's a VPS or a home box running 24/7, plus the babysitting when the login
session expires or the box reboots. You wanted "don't want to babysit"; this is
the option that most wants babysitting.

**ToS / automation considerations.** Driving a subscription plan headlessly, as an
unattended bot serving other people's requests, is a different use than a person
using their own Claude Code. This is a gray area at best. It's not what the
subscription is sold for, and building the bot's public reliability on top of it
is a footgun — the account is yours, the exposure is yours.

**You lose the hard wall.** This is the big one. The capped-workspace design gives
you a clean, provider-enforced "spend = $0 past the cap" guarantee. A subscription
has usage limits, but they're soft, rate-shaped, and not a dollar figure you set —
you can't point at "the bot cannot cost more than $X this month" the way you can
today. You'd be swapping a hard wall you trust for a soft limit you don't control.

- **Cost shape:** flat monthly subscription + always-on machine cost. Predictable,
  but no hard dollar ceiling on *behavior*.
- **What changes:** new request-delivery path, new always-on infra, login-session
  maintenance, and you own the reliability of a headless subscription login.
- **Effort:** high, and ongoing.
- **Hard wall:** none that's a dollar cap. The plan's usage limits are the only
  ceiling, and they're not the clean wall you have now.

Verdict: this is the footgun. It's the option that looks cheapest and is actually
the most operationally expensive and the least safe. Don't.

### D. Cheaper model tiers (orthogonal to A–C)

**What it is:** keep the exact architecture, change one env var. This is a dial you
can pull *on top of* any of the above, but it's most useful on the status quo.

`ANTHROPIC_MODEL` in `buildthis.yml` selects the builder. Options, from the
current tier down:

| Model        | $/MTok in | $/MTok out | Note |
|--------------|-----------|------------|------|
| Opus (now)   | $5        | $25        | most capable; overkill for toy sites |
| Sonnet 5     | $3        | $15        | ~2x cheaper; intro $2/$10 through 2026-08-31 |
| Haiku 4.5    | $1        | $5         | ~5x cheaper; fastest, weakest at agentic coding |

**What you give up:** less on these builds than you'd think. The bot builds small,
self-contained sites by copying an existing one and editing — a well-scoped,
low-ambiguity task. Sonnet 5 is near-Opus on coding and will handle it fine.
Haiku is the aggressive move: 5x cheaper, but it's the weakest at multi-step
agentic work, so expect more builds that miss or need a retry. For the toy-site
workload, Sonnet 5 is the sweet spot.

- **Cost shape:** directly scales per-build cost. Sonnet ≈ half, Haiku ≈ fifth.
- **What changes:** one line.
- **Effort:** trivial.
- **Hard wall:** unchanged — still the workspace cap. A cheaper model just means
  the same cap buys more builds before it trips.

Note the K3/Moonshot plan already in the notes is a variant of this dial with a
different wall (prepaid balance instead of a monthly cap). When Moonshot signups
open, switching to K3 swaps both the model and the wall in three env lines. Until
then, Sonnet 5 is the cheaper-model move available today.

---

## Why the recommendation

Given the constraints — cost is a real barrier, it's for having fun with friends,
low ceremony, don't want to babysit — the ranking falls out:

- **The subscription idea (C) is the one to avoid.** It's the most work to build,
  the most work to keep running, sits in a ToS gray area, and gives up the hard
  dollar wall that makes the current setup safe. Everything you said you want
  points away from it.
- **Managed Agents (B) is a lateral move.** Same per-token cost, more complexity,
  a beta surface. It solves a problem you don't have (wanting Anthropic to host
  the sandbox) and not the one you do (cost).
- **The status quo (A) plus the cheaper-model dial (D) is the whole answer.** The
  wall already does its job — it stopped the spend exactly as designed. The two
  things worth fixing are cheap: halve the per-build cost by dropping to Sonnet 5,
  and set the monthly cap to a fun-money number you're happy to run out of.

The reframe: hitting the cap isn't a failure to fix, it's the system working. The
bot is popular; popularity costs tokens; the cap converts "popular" into a fixed
monthly bill instead of a runaway one. The only genuine rough edge is that the
user-facing failure ("couldn't build that one") is misleading when the real cause
is "out of budget until the 1st" — but that's a copy tweak in the reply step, not
an architecture change, and it's out of scope for this doc.
