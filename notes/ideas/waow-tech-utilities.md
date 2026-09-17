# waow.tech — surveyed 2026-08-25, measured 2026-09-17

Asked for by bisks.net, replying to a thread where `@zzstoatzzdevlog.bsky.social`
had pitched `typeahead.waow.tech` as a drop-in replacement for the bot's
handle-typeahead calls and the bot declined (see the thread quoted in that
request — "random 3rd party on the login path, not on an llms.txt say-so").
bisks.net came back and said waow.tech is legit, and asked the bot to note
which of its utilities might be useful later, for what kinds of projects.
This is that note. It started as a survey; the typeahead section below is
now backed by measurement rather than reasoning. Nothing here is wired into
any site.

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

## Measured against searchActorsTypeahead (2026-09-17)

Run it yourself: `node audit/typeahead-bench.mjs > audit/raw/typeahead-bench.json`.
15 query prefixes x 3 rounds x 3 backends, paced 1.1s apart. Raw results are
committed alongside.

### Latency

Two paced runs, medians in ms:

| backend | median | p95 |
| --- | --- | --- |
| `public.api.bsky.app` searchActorsTypeahead | 216 / 219 | 315 / 286 |
| waow bsky-compatible alias | 54 / 67 | 116 / 95 |
| waow canonical `tech.waow.typeahead.searchActors` | 38 / 38 | 50 / 59 |

waow is roughly 3-5x faster from this machine, and its canonical endpoint is
both the fastest and the tightest (p95 within 20ms of median, where bsky's
p95 is 300ms+). One caveat on our own first run: an unpaced burst measured
bsky at a 21ms median, because repeated queries were served from a warm CDN
cache. The paced numbers are the honest steady-state comparison, and the two
paced runs agree closely.

### Results differ, and that is the real finding

"Drop-in replacement" is true of the response *shape* and false of the
response *content*. Across 15 prefixes at limit=8, the mean overlap between
bsky's results and waow's is **2.53 of 8**, and the top hit differs on 9 of
15 queries. That number was byte-identical across two separate runs, so it
is an index difference, not noise.

It cuts both ways:

- `cee` -> six of eight handles are unique to each side.
- `bisks` -> waow returns fewer results but is the only one that surfaces
  `buildthis.bisks.net`, this project's own bot, which bsky's index misses.

So swapping the base URL silently changes who your users can find. For a
login box, that is the whole function of the field.

### CORS and rate limits

- CORS is clean on both: `access-control-allow-origin: *`. waow also sends
  `access-control-allow-headers: ... X-Client`, so the attribution header
  the llms.txt asks for works from the browser without a preflight failure.
- waow documents 60 req/min per IP. An unpaced 135-request benchmark burst
  drew 13 429s from the alias endpoint. Two later attempts to characterise
  the threshold — 75 rapid requests with unique queries, then 75 with one
  repeated query — drew **zero** 429s, so we could not reproduce it on
  demand or pin down the mechanism. Treat it as real but not characterised.
- bsky publishes no rate limit on this path and returned no 429s in any run.

The per-IP shape matters more than the number. Typeahead fires per keystroke,
so a shared egress IP (office, campus, CGNAT, a VPN exit) pools toward one
bucket, and the failure lands on whoever is typing at the time.

### Where this leaves the swap

The original objection in this note was "a third party on the login path
buys no functionality, only a dependency." Latency data weakens the "no
functionality" half — waow is genuinely faster, and measurably more
consistent. The result-set divergence strengthens the other half, in a way
the earlier reasoning did not anticipate: this is not a mirror of the same
index, it is a different index. Being faster at returning different people
is not straightforwardly better for a login box.

A defensible middle, if we ever want it:

- Keep `public.api.bsky.app` as the default in `handle-typeahead.js`. It is
  the index users' mental model comes from; matching bsky.app's own search
  box is a feature on a field where someone types their identity.
- waow looks like a good fit for the places its index is *better* — anything
  scoped to bisks.net handles, where it finds our own bot and bsky does not.
  That is a search-and-discovery use, not a login use.
- Either way, send `X-Client: bisks.net`. It costs nothing and the ask is
  reasonable.

Nothing above is wired into any site. As of this survey **zero** sites call
typeahead.waow.tech; 244 use the bsky AppView via `handle-typeahead.js`.
(An earlier brief claimed five sites already used waow — that was wrong. The
grep hits are all prose in `.buildthis.json` briefs and data JSON describing
the past declines, not code.)
