# The gift-link labeler

> **Built, never launched — dropped 2026-09-17.** The idea already exists on the
> network: `paywall-radar.bsky.social` is a live labeler doing the same job, and
> the feed form is saturated (davidsacerdote's gift-links feed has ~10.8k likes).
> See `notes/ideas/labeler-candidates.md`. The service is committed and inert;
> nothing is provisioned and nothing should be. This note stays because the
> machinery it describes is reusable and genuinely value-agnostic — a future
> labeler should start here rather than from scratch.

`sites/builtbybot` is a real Bluesky labeler. It publishes one label value,
`gift-link`, on posts whose links carry a publisher's unlock token.

The directory and hostname still say `builtbybot`. That's leftover: the service
was built for a `built-by-bot` label, Rob judged that label inert
(`notes/ideas/labeler-candidates.md`), and it was repointed on 2026-09-17.
Renaming the site means a new Worker, route, and KV namespace, so it was left
alone — the label value and the subject set are what changed.

The service signs nothing until Rob provisions an account and key. See
"What Rob has to do."

## The claim

> This link carried an unlock token when this service saw it.

Deliberately narrow, and the narrowness is the safety story. It's a fact about
a URL that anyone can check by reading the link — not a judgment about the
person who posted it. Being wrong means a token expired, not that someone was
mislabeled.

The caveat is real and stated on `/policy` and the front page: gift tokens
expire and get revoked, nothing re-checks them, so a labeled link may be
paywalled by the time you click it. The label is a dated observation.

## Why the subject rule is gone

built-by-bot only labeled this project's own output. That rule was the whole
reason it was safe, and also why it said nothing — the labeled posts already
contained the bot's handle. `labeler-candidates.md` has the argument.

Gift links are other people's posts, so that protection doesn't transfer. What
replaces it:

- the label value is descriptive, not evaluative. It doesn't say the post is
  good, generous, or paywall-evading, and it must not grow to;
- the claim is checkable from the post itself;
- there's an opt-out, and it's enforced in code rather than promised on a page.

## Detection

`src/giftdetect.ts`, copied from `sites/giftlinks/public/gift-index.js` rather
than imported (the house rule: no shared package across sites). Eleven
publishers: NYT and nyti.ms on `unlocked_article_code`, WSJ on `st`, wapo.st on
the host alone, and a loose `gift`-ish query-param check applied only to hosts
already on the list.

Two things it does that the browser version doesn't:

- reads link facets as well as the embed card, so a pasted link counts;
- rejects non-http schemes and matches hosts on exact-or-subdomain, so
  `notnytimes.com` doesn't read as `nytimes.com`.

Tested in `tests/giftdetect.test.mjs`. The negative cases are the point.

## Discovery: a cron sweep, not Jetstream

The obvious design is a Jetstream subscription, which is what giftlinks runs in
the browser. A labeler can't: that's a standing websocket, which is a Durable
Object, which this repo doesn't do (`notes/11`). Running it in a visitor's
browser works for a page showing what's live while you watch; a labeler has to
have already seen a post by the time someone queries a label on it.

So `src/discover.ts` sweeps `app.bsky.feed.searchPosts` every 15 minutes, one
query per publisher domain — the same shape as buildthis's mention sweep.
`domain` is a real lexicon parameter ("posts with URLs linking to the given
domain"); `q` is required alongside it, and `since` takes a sortAt timestamp.
The sweep asks for a window overlapping the last one, because search indexing
lags behind posting.

**searchPosts needs a session.** The public AppView answers `getPosts`
unauthenticated but 403s `searchPosts` — checked 2026-09-17. So the labeler
carries its own account credentials, which built-by-bot never needed (buildthis's
event log was public JSON). Read-only: the Worker never writes to the repo.

Alternatives ruled out: Spacedust (microcosm.blue) is a live filtered link
firehose, but it's a websocket, same problem. Constellation and Cerulea index
`at://` backlinks, not external URLs.

The cost, stated on `/policy`: coverage is best-effort. Search lags and drops
things, so an unlabeled post means "not seen", never "checked and found clean."

## The subject set accumulates

This is the real structural change from built-by-bot, and worth understanding
before editing.

built-by-bot re-derived its whole subject set on every rebuild from buildthis's
event log — "store what's ours, re-derive the rest." Gift links can't work that
way: there's no queryable "every post that ever carried a gift link," just a
search index reaching back a few days. So each sweep *adds* what it found, and
KV holds the authoritative record rather than a cache.

Consequences, both accepted:

- losing the KV key loses labels that can't be re-derived, only
  re-accumulated from whatever search still returns. A lost label is a post
  that stops being marked, which is the harmless direction;
- the set is capped at 5000, oldest evicted first, so a rebuild stays inside a
  request.

`mergeSubjects` is idempotent by post URI, and re-seeing a post must not move
its `seenAt` — that becomes the label's `cts`, which is part of the signed
bytes, so a changing cts re-signs to different bytes and invalidates any copy a
consumer holds. Tested in `tests/subjects.test.mjs`.

## Opt-out

`/policy` promises that asking gets a post — or an account, permanently — out of
the set. `applyOptOut` enforces it on the read path, so adding someone retracts
labels they already have rather than only preventing new ones.

Two KV keys, both JSON arrays, written out of band:

```
wrangler kv key put --binding LABELS optout:dids '["did:plc:…"]'
wrangler kv key put --binding LABELS optout:uris '["at://…"]'
```

No endpoint edits them. A public write path on an opt-out list is a way for
someone to opt *someone else* out.

## Why there's no label stream

A canonical labeler serves `com.atproto.label.subscribeLabels` over a
long-lived websocket — a standing connection, so `notes/11` again. The Worker
serves the polled half instead:

- `com.atproto.label.queryLabels` — full support: exact URIs, `*` prefixes,
  `sources` filtering, cursor paging.
- `com.atproto.label.subscribeLabels` — accepts the upgrade and closes cleanly
  with a pointer to queryLabels, so a subscriber learns immediately instead of
  holding a socket that never sends a frame.

The consequence, stated on `/policy` too: consumers that only ingest the label
stream see nothing. Clients that query see every label.

## Endpoints

- `/xrpc/com.atproto.label.queryLabels` — the labels.
- `/xrpc/com.atproto.label.subscribeLabels` — answers and closes; see above.
- `/.well-known/did.json` — the did:web document, including the
  `#atproto_label` public key when one is configured.
- `/status.json` — the CORS-open catalog/status document
  `notes/ideas/other-bots.md` asks every new bot here to publish: what the
  service is, whether it's `live`, its label values, the publishers covered,
  and when it last swept.
- `/api/labels` — what it currently asserts, for the page and for eyeballs.

## Signing

Unchanged from built-by-bot, and it's the part that took the debugging.

P-256 (ES256) — one of the two curves atproto accepts, and the one Workers'
WebCrypto implements natively, so there's no crypto dependency. The signature
covers the dag-cbor encoding of the label *without* its `sig` field.

- **Canonical dag-cbor.** Map keys sort by length first, then bytewise. The
  encoder is hand-rolled (~40 lines) because only one flat, known shape is ever
  encoded; it was checked byte-for-byte against the `cborg` reference encoder.
  `cid` joining the signed field set made the ordering worth its own test
  (`tests/dagcbor.test.mjs`): five keys, all length 3, so the whole order falls
  to the bytewise tiebreak and `cid` has to sort ahead of `cts`.
- **Low-S normalization.** atproto requires the low-S variant. WebCrypto does
  not normalize — measured here, ~45% of P-256 signatures come back high-S — so
  without the fix roughly half of all labels would fail verification,
  intermittently and confusingly. `toLowS` replaces S with n-S.

Labels carry the post's `cid`, so the claim binds to the version of the record
that was read. An edited post gets a new CID, and the label then plainly refers
to the version that carried the link rather than silently following the edit.

## Key rotation

Cached labels are bound to the key that signed them and the DID they name, so
a rotation invalidates every one of them. KV records a fingerprint of the
current DID plus public key (public values only — never the secret), and a
mismatch forces an immediate re-sign instead of waiting out the 15-minute
window.

Without that, a rotated key left every cached label failing verification until
the window expired — 100/100 in testing. Relatedly, nothing is served at all
unless the service can currently sign: labels outlive a config change in KV,
and serving ones attributed to a DID the service no longer claims would be
publishing unverifiable claims as valid.

## What Rob has to do

Four steps. The site is deployed and inert until the last two.

### 1. Make the labeler account

A normal Bluesky account. A labeler's identity is what people subscribe to, so
it wants its own handle rather than sharing one with a bot.

**Open question:** the service lives at `builtbybot.bisks.net`, which now says
the wrong thing. Either claim `builtbybot.bisks.net` and accept the mismatch,
or move the site to its own subdomain first. The apex already serves
`/.well-known/atproto-did` for this class of thing (`notes/30`), so claiming a
handle is a DNS/apex change, not a new mechanism.

Then create an **app password** for it (Settings → App Passwords). It's needed
twice: once by the publish script, and once as a Worker secret, because the
discovery sweep has to authenticate.

### 2. Generate the signing key

```
node audit/labeler-keygen.mjs
```

Prints a P-256 keypair and self-tests it. Two outputs:

- the **private** half, base64url PKCS#8 — a secret, never committed;
- the **public** half as a multikey (`zDna…`) — goes in the DID document.

Register the public key on the account as its `#atproto_label` verification
method. Nothing can verify a label without it. If you provision through Ozone
instead and it issues its own K-256 key, use that key and skip this script —
but then the Worker needs a K-256 signer, which is a code change, since
WebCrypto has no secp256k1.

### 3. Publish the declaration

```
LABELER_IDENTIFIER=<handle> \
LABELER_APP_PASSWORD='xxxx-xxxx-xxxx-xxxx' \
node audit/labeler-publish.mjs
```

Idempotent; rkey is `self`. Prints the DID.

### 4. Wire it up

```
cd sites/builtbybot
pnpm dlx wrangler secret put LABELER_PRIVATE_KEY    # the signing key
pnpm dlx wrangler secret put LABELER_APP_PASSWORD   # for the search sweep
```

Then in `sites/builtbybot/wrangler.toml` set `LABELER_DID` to the DID the
publish script printed and `LABELER_IDENTIFIER` to the handle, and push.

Check it with `https://builtbybot.bisks.net/api/labels`: `configured: true` and
a non-zero `count` means it's live. `/status.json` shows `lastSweepAt` and
`lastSweepErrors` if discovery is misbehaving.

## Known gaps

- **Coverage is best-effort**, per the discovery section. This is the big one
  and it's structural, not a bug to fix.
- **A label outlives the token it describes.** Stated everywhere it's visible,
  but it remains the thing most likely to mislead someone.
- **No negations.** Removal drops the subject rather than publishing a `neg`.
- **No reports.** `reasonTypes: []` and `subjectTypes: []` are explicit, because
  the lexicon treats an omitted field as "all reason types allowed."
- **wapo.st is host-only.** It's the Post's gift-link shortener, so the host is
  the signal — but unlike every other publisher, no token is visible in the URL
  to check. A non-gift wapo.st link would be mislabeled.
