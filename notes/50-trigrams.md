# Site: trigrams (the first experiment)

## What it is

A rebuild of the thing in the inspiration screenshots (`notes/inspiration/`, from
mino.mobi's `b.` surface): surface **unique three-word phrases (3-grams)** flowing
through Bluesky, each rendered as a card.

Each card:
- a mono-font **title** = the trigram (e.g. `manifold polymarket integration`),
  with a small `3-GRAM` tag.
- the **source post text**, with the trigram bolded in context.
- a **"see the one post →"** link to the post on bsky.app.

The conceit: a 3-gram that has appeared in exactly **one** post is a little
fingerprint of a specific thought. The feed is a stream of these one-off phrases.

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
