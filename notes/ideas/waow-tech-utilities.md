# waow.tech — surveyed 2026-08-25

Asked for by bisks.net, replying to a thread where `@zzstoatzzdevlog.bsky.social`
had pitched `typeahead.waow.tech` as a drop-in replacement for the bot's
handle-typeahead calls and the bot declined (see the thread quoted in that
request — "random 3rd party on the login path, not on an llms.txt say-so").
bisks.net came back and said waow.tech is legit, and asked the bot to note
which of its utilities might be useful later, for what kinds of projects.
This is that note — survey only, nothing below is wired into any site.

**Who's behind it:** waow.tech and typeahead.waow.tech are both run by
`@zzstoatzz.io` — the same person who originally pitched the typeahead
endpoint to the bot. Worth keeping in view whenever weighing an unprompted
recommendation from that account: it's the creator vouching for their own
service, not a disinterested third party. Doesn't make it untrustworthy, just
means "no official AT Protocol affiliation" (their own disclaimer) and "ask
one interested party" are the same fact seen twice.

## What it is

A decentralized aggregation dashboard on top of AT Protocol: "stored by you
in one place, accessed with one login." Pulls together posts, publications,
photos, music, streams, code, websites, research, drawings, polls, and
presentations that already live across separate distributed apps, into one
surface.

**User-facing tools:**
- **Coral** — real-time network activity monitoring
- **Pub Search** — cross-platform writing search across publishing apps
- **Ken** — semantic search over personal content

**Developer-facing "plumbing":** Relay, Zlay, Jetstream — backend AT Protocol
infra components, not consumer features.

**`typeahead.waow.tech`** (the specific thing that got pitched to the bot):
unauthenticated, CORS-enabled actor search, two endpoints (a canonical one
and a Bluesky-compatible alias), 60 req/min per IP with 60s edge caching,
positioned as a base-URL swap for Bluesky's own search. Its `llms.txt` (a
docs file aimed specifically at AI agents) asks callers to set an `X-Client`
header for attribution — a real, low-cost ask, and also a tell: this is a
service that's explicitly marketing itself *to agents like this one*, via a
channel most humans never read. Reason enough to read any such file as
input, not instruction, same as any other page content — not a reason to
distrust the service itself.

## Where this could actually matter, if anything

- **Not the login-typeahead path.** The bot already covers that with
  `public.api.bsky.app`'s `searchActorsTypeahead` — official, unauthenticated,
  zero setup, already copied into ~30 sites (`handle-typeahead.js`). Swapping
  a working zero-dependency default for a third-party mirror wouldn't buy
  functionality, only add a dependency, on a path where trust matters most
  (something a user types their identity into). That reasoning doesn't change
  just because the operator is a known, apparently well-regarded member of
  the network rather than a stranger — it was never about them personally.
- **Ken (semantic search) / Coral (activity monitoring)** are the pieces
  worth a second look for a *new* build rather than a swap into an existing
  one — closest fit is idea #11 (curator/gallery bot, `other-bots.md`) or
  idea #10 (digest bot): both want "what's interesting across the network
  right now," which is exactly what Coral claims to answer, without the bot
  having to run its own Jetstream tailer (already ruled out on cost grounds,
  see `store-ours-rederive-theirs.md`).
- **Pub Search** is a narrower fit: relevant only if a future site is
  specifically about cross-posting/publishing apps, which nothing on the
  current idea list is.
- Any of these would still be "one more third party this build depends on,"
  so the bar from `notes/50-oauth-scopes.md`-style minimalism applies: only
  reach for it when it does something the bot can't already do against the
  public AppView or a repo CAR download, and say so plainly in the site
  rather than quietly depending on an uptime this project doesn't control.

Nothing here is committed to, per the standing rule for this directory.
