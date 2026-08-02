# Feed generators and labelers — two halves of one primitive

Riffing on "these go hand in hand." They do, more than they first look like they
do, and seeing why suggests building them as one thing rather than two.

## The shared shape

Both are **a service you run that takes a firehose and emits an opinion about
posts, which users subscribe to.** They differ only in what the opinion is
attached to and where it surfaces:

| | feed generator | labeler |
| --- | --- | --- |
| lexicon | `app.bsky.feed.generator` | `app.bsky.labeler.service` |
| emits | an ordered list of post URIs | `(subject, label)` pairs |
| answers | "what should I look at?" | "what is this thing?" |
| surfaces as | a tab in the app | a badge / filter / content warning |
| subscribed by | following the feed | subscribing to the labeler |
| needs signing key | no | **yes** |
| serving endpoint | `getFeedSkeleton` (returns URIs, AppView hydrates) | label stream over websocket |

The important structural point: **both are downstream of the same pipeline.**
Ingest the firehose → decide something about each post → publish. The classifier
in the middle is the whole product. Whether its output becomes a feed or a label
is close to a rendering decision.

So the honest framing is: **build one classifier, expose it two ways.** Feeds are
the low-risk half (no key, no moderation semantics, trivially reversible).
Labelers are the higher-commitment half. Doing the feed first de-risks the
labeler, because if the classifier is bad you find out with a feed nobody
follows, not with wrong labels on other people's posts.

## Why this repo is oddly well-positioned

There are already a dozen-plus sites that *are* classifiers, they just render to
canvas instead of publishing:

- `trigrams/firehose` — unique-trigram detection with a surprise score. That is
  literally a novelty ranker. minormobius asked for filters on it (language,
  surprise threshold, regex excludes) — feed-generator parameters, described as
  UI.
- `catsofatproto` — an image classifier over the firehose.
- `ratioed` — a ratio detector; a live "most ratioed right now" ranking.
- `giftlinks` — gift-article link detection with source filtering.
- `ideahose` — website-idea detection, already "watching the whole firehose and
  ranking the backlog."
- `chimehose`, `koipond`, `gulpstream`, `fruitninja`, `logjam` — firehose
  consumers with per-post logic.
- `semanticmute` — the one that's explicitly *about* classification, and stalled.

Every one of these answers "which posts are interesting, and why." That's the
feed-generator question. They're all rendered as toys because a toy is what the
builder knows how to make.

**None of them persist anything** — they read live and discard on reload. An
earlier draft of this note treated that as the blocker ("a classifier without a
memory can't be a feed"). That was wrong; see `store-ours-rederive-theirs.md`.

A feed generator answers a request by *evaluating a query*, and most of these
classifiers are expressible as AppView queries: giftlinks is a search, the
microsite scene is a link pattern over a known author set, ratioed is a ranking
over recent posts it can fetch on demand. Statelessness isn't what's stopping
them from being feeds — nobody has written the declaration record and skeleton
endpoint, which is a couple hundred lines, not a data platform.

The one genuine exception is unique trigrams, whose "nobody has ever posted this"
claim no API answers. Its shipped version has always been bounded to what it can
see; stating that bound honestly is better than building an archive to remove it.

## What it would actually take

**Feed generator (the cheaper half):**

1. A DID for the feed service (can be `did:web:` on `bisks.net` — no PLC
   operation needed, just serve a DID doc, which the apex already knows how to do
   for the handle).
2. A `app.bsky.feed.generator` record in a repo, declaring the feed.
3. An endpoint serving `app.bsky.feed.getFeedSkeleton` — returns post URIs and a
   cursor. The AppView hydrates them; you never serve post content.
4. Something that decides which URIs — evaluated per request against the
   AppView. ← the actual work, and it needs no storage for most feeds
   (`store-ours-rederive-theirs.md`).

Notably: **no signing key, no moderation semantics, and it's reversible** — a bad
feed is unsubscribed and forgotten. The blast radius is near zero, which makes it
a good first "own a piece of protocol infrastructure" move.

**Labeler (the heavier half):**

1. Its own DID *with a signing key* — this is the part `builder/INSTRUCTIONS.md`
   forbids the builder from touching, so Rob provisions it (same as the buildthis
   account, per `notes/80`).
2. A `app.bsky.labeler.service` record declaring the label values.
3. A persistent websocket endpoint streaming labels — a standing service, not a
   request/response worker.
4. Label definitions that mean something, and a policy for being wrong.

The judgment part is the real cost. thebadcode's semantic-mute ask is the obvious
use, and dferrer's field notes in that thread are the most useful prior art in
the corpus: embeddings are cheap and context-free, agentic tool-calling got
expensive fast, keyword mute was only beaten by a large model, and the hard case
needs a lot of context. Worth re-reading before committing.

## The riff: what would actually be good

Feeds worth publishing, roughly in order of "distinctive and already half-built":

- **unique trigrams** — the repo's signature idea, and a genuinely novel ranking
  signal nobody else has. A "posts containing a phrase nobody has ever posted"
  feed is the most on-brand thing available.
- **the microsite scene** — every post sharing a link to a bisks/mino/vibe-coded
  style toy. `simcluster-atlas` already collected 4,426 links; this is that,
  live, as a feed. Solves the discovery problem norvid kept poking at ("Top
  Chicken Oscars for the weekly profusion of these microsites").
- **buildthis output** — a feed of every site the bot has shipped. Trivial, and
  gives the whole project a subscribable surface inside the app rather than
  requiring people to visit a gallery.
- **gift links** — `giftlinks` already detects these; as a feed it's actually
  useful to strangers, which none of the toys are.

Labels worth emitting, if the labeler happens:

- **`built-by-bot`** — the corpus has real appetite for this. ver.ooo asked
  moistchicken to "exclude accounts marked as automated/bots"; the bot self-labels
  today. A labeler that marks *bot-built sites and bot posts* across the network
  would be genuinely useful and is low-controversy, since it's descriptive rather
  than judgmental.
- **semantic topic labels** — thebadcode's ask. Higher value, much higher
  difficulty, and the place to be careful.

The `built-by-bot` one is appealing precisely because it's the labeler equivalent
of the health-checker bot: factual, uncontroversial, hard to be harmfully wrong
about. Good first labeler for the same reason a link checker is a good first bot.

## Order this suggests

1. **Ship one feed generator**, evaluated live against the AppView. The microsite
   scene or buildthis's own output — both are plain queries. Cheap, reversible,
   no key, no storage.
2. **See if anyone subscribes.** That's the cheap signal on whether the
   classifier is any good.
3. **Then** consider a labeler, starting with something descriptive like
   `built-by-bot` rather than semantic moderation.

The pleasing part is how little there is to it: a `did:web:` document, one
record, one JSON endpoint. The repo already queries the AppView from a hundred
sites; a feed is that same query with a different consumer.
