# Site: trigrams (the first experiment)

## What it is

Inspired by mino.mobi's `b.` surface (`notes/inspiration/`): a live feed of
**three-word phrases (3-grams)** streaming off the Bluesky firehose, each rendered
as a card the first time we see it.

Each card:
- a mono-font **title** = the trigram (e.g. `manifold polymarket integration`),
  with a small `3-GRAM` tag.
- the **source post text**, with the trigram bolded in context.
- a **"see the one post →"** link to the post on bsky.app.

The conceit: watch novel three-word phrases scroll by live — little fingerprints
of specific thoughts as they're posted.

### Honest scope of "novel" (important)

This is **NOT** mino's global-uniqueness claim. mino's `b.mino.mobi/unique/` takes
a handle, finds phrases that person used exactly once, then checks each against
platform-wide search to prove *no one else on Bluesky ever posted it* — a real
global-uniqueness test. That's a different, heavier tool.

Ours means: **novel to this browser session.** We open the firehose and show each
3-gram the first time our in-memory set sees it since the page loaded. A phrase we
card might be one someone posts constantly — we just hadn't seen it yet. That's
fine and still fun (it reads as a stream of specific, one-off-feeling thoughts),
but the label on the page must not overclaim. A future version could add a real
global check (mino-style search, or a server-side rolling index) — see below.

## Data source

Bluesky firehose via **Jetstream** (JSON websocket, no CBOR):
`wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post`

For each incoming post:
1. Tokenize the text (lowercase, strip punctuation, split on whitespace).
2. Emit all consecutive 3-grams.
3. Track counts. A 3-gram seen exactly once (so far, in our window) is a
   candidate card. Keep the post it came from.

## Architecture options (pick one when building)

The tension: Jetstream is a long-lived websocket; a plain Worker fetch handler is
request/response. Options, cheapest first:

1. **Client-side firehose (simplest, no server state).** The static page opens
   the Jetstream websocket *from the browser*, computes 3-grams live, and renders
   cards as novel ones stream in. No backend, no storage — the "window" is just
   the current session. This is the right first cut: a pure-static Worker whose
   `public/index.html` does everything. Matches "copy, don't abstract" and needs
   no OAuth, no DO, no cron.

2. **Durable Object window (server-side).** A DO holds the Jetstream connection
   and a rolling map of 3-gram → count/post; the page fetches recent one-off
   3-grams. More faithful to "seen exactly once across everyone recently," but
   more moving parts (DO + hibernation + the always-on socket cost). Defer.

**Decision for v1: option 1, client-side.** It's the fastest path to something
live and shareable, and it's genuinely fun to watch phrases stream in. We can
graft on a DO later if we want a real global "exactly once" guarantee.

## Look

Match the screenshots: light card with a green left border, monospace title,
serif body, muted grays, the `3-GRAM` tag in small caps. This visual is a good
candidate to become the copied-around "card" look for future sites.

## Subdomain

`trigrams.bisks.net`
