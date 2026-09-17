# What a labeler should actually say

`sites/builtbybot` works and is pointed at the wrong question. The plumbing —
signed labels, a real `queryLabels`, verification against `@atproto/crypto` —
is worth keeping. The label isn't.

## Why built-by-bot was a dud

Rob's read, 2026-09-17, and it's right: the labeled posts contain
`@buildthis.bisks.net` and are followed by the bot's own reply with a link.
Nothing about their origin was ever in doubt. A label that restates what the
post already shows adds no information, so nobody has a reason to subscribe.

`notes/ideas/feeds-and-labels.md` picked it for being "hard to be harmfully
wrong about," and optimized so hard for that it landed on a claim with no
content. Safe and useless is still useless.

**The test a label has to pass:** it tells a subscriber something they could
not have worked out from looking at the post. If reading the post answers the
question, the label is decoration.

A second test, from the same mistake: **would anyone subscribe?** A labeler
nobody subscribes to is strictly worse than a feed nobody follows, because it
carries a standing claim about other people's posts.

## The counting bug, which is its own lesson

builtbybot labeled 408 "shipped" events as if they were 408 sites. They're 171
distinct sites — `rateyourbuild` alone is 43 of them, because every edit
appends another success event. The repo has 672 site directories, so the log
attributes only about a quarter of the fleet to a tag.

Anything counting ships from `/logs.json` is probably counting edits as builds.
Worth checking wherever fleet numbers get quoted.

## Candidates that pass the test

Ordered by how much the judgment is already built.

**1. Gift links.** `sites/giftlinks` already detects them: `unlocked_article_code`
on nytimes, `st` on wsj, `wapo.st`, and a `gift`-ish query param across ~8 more
publishers. This is the strongest candidate in the repo and the clearest win:

- The signal is **invisible in the post** — a gift link and a paywalled link
  look identical unless you read the query string. That's a real information
  gain, which built-by-bot never had.
- It's **verifiable, not a guess**. The label is "this URL carries an unlock
  token," which is a fact about the URL, not an opinion about the author. Being
  wrong means the token expired, not that we've mislabeled a person.
- It's **useful to strangers**, which none of the toys are. "Show me the free
  reads" is a thing people actually want.
- The blast radius is small and the failure mode is boring.

The detection already exists and runs in the browser; a labeler version moves
the same rules server-side over Jetstream. Note the honest caveat: gift tokens
expire, so a label is "was unlocked when seen," and the policy page should say
so rather than implying a permanent guarantee.

**2. Microsite / vibe-coded-toy links.** `feeds-and-labels.md` already wanted
this as a feed, and `simcluster-atlas` collected 4,426 links to build the
pattern from. As a label it answers "is this link one of those little
single-purpose toys" — not visible from the post text, and it's the discovery
problem norvid kept poking at. Riskier than gift links: the boundary is fuzzy
and it touches other people's projects, so it wants an opt-out.

**3. Semantic topic labels.** thebadcode's original ask, and `semanticmute`
exists as a first pass. Highest value, highest difficulty, and the place to be
careful — dferrer's field notes in that thread (embeddings cheap and
context-free, keyword mute only beaten by a large model, the hard cases need a
lot of context) are the prior art to read before starting. This is the one where
being wrong actually costs someone something, so it should not be the second
labeler, let alone the first.

## Status

Done, 2026-09-17. `sites/builtbybot` now publishes `gift-link`; `notes/87`
documents the service as it stands. The rest of this note is the argument that
led there, kept because candidates 2 and 3 are still open.

Two things the repoint turned up that this note didn't anticipate:

- **searchPosts needs a session.** Discovery can't be a Jetstream subscription
  (no standing sockets), so it's a cron sweep over searchPosts — and the public
  AppView 403s that endpoint unauthenticated. The labeler needs its own account
  credentials, not just a signing key.
- **The subject set has to accumulate.** There's no "every post that ever
  carried a gift link" to re-derive from, so KV holds the authoritative record
  rather than a cache. That's a different shape from built-by-bot, which
  re-derived everything from buildthis's log on each rebuild.

## What to do with builtbybot

Kept the service; repointed the label. The parts worth preserving were the ones
that took the debugging: low-S signature normalization, the key-rotation
fingerprint, the "never serve what you can't sign" guard, canonical dag-cbor,
and `/status.json`. Those are labeler infrastructure, not built-by-bot
infrastructure — the gift-links labeler reuses all of it. It changed more than
"`subjectsToLabel` and the label value" in the end, because discovery and the
subject store are shaped differently (see Status above), but nothing in the
signing or serving path moved.

The subject rule that made built-by-bot safe ("only label our own output") does
not survive the repoint: gift links are other people's posts. That's the real
cost of making it interesting, and it's why the claim has to stay factual and
checkable rather than evaluative. In the shipped version that's backed by an
opt-out enforced in code, not just a promise on the policy page.
