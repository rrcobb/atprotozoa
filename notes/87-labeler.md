# The built-by-bot labeler

`sites/builtbybot` is a real Bluesky labeler. It publishes one label value,
`built-by-bot`, on @buildthis.bisks.net's own account and on the posts that
asked for sites the bot shipped.

This is idea #15 from `notes/ideas/00-index.md`, which sat behind "needs a
signing key Rob provisions." The code is written, tested, and deployed; the
service signs nothing until the key exists. See "What Rob has to do" below.

## What it labels, and why that set is small

Only this project's own output:

- the `@buildthis.bisks.net` account, and
- each post that requested a site the bot then shipped, read from buildthis's
  public `/logs.json` event log.

The wider version of this idea — label automated accounts across the network,
which is what ver.ooo's original ask gestured at — is deliberately not built. It
needs a judgment about strangers that would be wrong often, and a wrong label
lands on someone else's post. `feeds-and-labels.md` picked `built-by-bot` as the
first label precisely because it's descriptive and hard to be harmfully wrong
about; labeling our own output keeps it that way.

The one place it touches a third party: a tagging post is written by the person
who asked, not by the bot. Labeling it asserts "a bot built what this post asked
for" — about the site, not the author, and over URIs buildthis already publishes
in its `/shipped` feed. If that ever reads as too much, the fallback is labeling
only the bot account: delete one branch in `subjectsToLabel`.

## Why there's no label stream

A canonical labeler serves `com.atproto.label.subscribeLabels` over a long-lived
websocket. That's a standing connection, which is a Durable Object, which this
repo doesn't do (`notes/11`). So the Worker serves the polled half of the label
API instead:

- `com.atproto.label.queryLabels` — full support: exact URIs, `*` prefixes,
  `sources` filtering, cursor paging.
- `com.atproto.label.subscribeLabels` — accepts the upgrade and closes cleanly
  with a pointer to queryLabels, so a subscriber learns immediately instead of
  holding a socket that never sends a frame.

The real consequence, stated on the site's `/policy` too: consumers that only
ingest the label stream see nothing. Clients that query see every label. This is
a genuine limitation of running a labeler from a stateless Worker, not something
the code papers over.

## Endpoints

- `/xrpc/com.atproto.label.queryLabels` — the labels. Exact URIs, `*` prefixes,
  `sources` filtering, cursor paging.
- `/xrpc/com.atproto.label.subscribeLabels` — answers and closes; see above.
- `/.well-known/did.json` — the did:web document, including the
  `#atproto_label` public key when one is configured.
- `/status.json` — the CORS-open catalog/status document
  `notes/ideas/other-bots.md` asks every new bot here to publish on day one:
  what the service is, whether it's `live`, its label values, and where its
  endpoints are. `/api/labels` is the data; this is the description, which is
  what another bot needs first.
- `/api/labels` — what it currently asserts, for the page and for eyeballs.

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

## Signing

Labels are signed with P-256 (ES256) — one of the two curves atproto accepts,
and the one Workers' WebCrypto implements natively, so there's no crypto
dependency. The signature covers the dag-cbor encoding of the label *without*
its `sig` field.

Two things that are easy to get wrong and are handled:

- **Canonical dag-cbor.** Map keys sort by length first, then bytewise. The
  encoder is hand-rolled (~40 lines) because only one flat, known shape is ever
  encoded; it was checked byte-for-byte against the `cborg` reference encoder.
- **Low-S normalization.** atproto requires the low-S signature variant.
  WebCrypto does not normalize — measured here, ~45% of P-256 signatures come
  back high-S — so without the fix roughly half of all labels would fail
  verification, intermittently and confusingly. `toLowS` replaces S with n-S.

Verified end to end: labels pulled from the running Worker verify with
`@atproto/crypto` using the public key read from the served DID document, and a
tampered label fails.

## What Rob has to do

Three steps. The site is deployed and inert until step 3.

### 1. Make the labeler account

A normal Bluesky account, separate from @buildthis.bisks.net — a labeler's
identity is the thing people subscribe to, and merging it with the bot's would
make "unsubscribe from the labels" and "unfollow the bot" the same action.

Suggested handle: `builtbybot.bisks.net`. The apex already serves
`/.well-known/atproto-did` for this class of thing (`notes/30`), so claiming the
handle is a DNS/apex change, not a new mechanism.

Then create an **app password** for it (Settings → App Passwords).

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
but then `sites/builtbybot` needs a K-256 signer, which is a code change, since
WebCrypto has no secp256k1.

### 3. Wire it up

```
# the declaration record (idempotent; rkey is "self")
LABELER_IDENTIFIER=builtbybot.bisks.net \
LABELER_APP_PASSWORD='xxxx-xxxx-xxxx-xxxx' \
node audit/labeler-publish.mjs

# the signing key, as a Worker secret
cd sites/builtbybot
pnpm dlx wrangler secret put LABELER_PRIVATE_KEY
```

Then set `LABELER_DID` in `sites/builtbybot/wrangler.toml` to the labeler
account's DID (the publish script prints it) and push. The labels appear on the
next request — the set rebuilds on demand, at most every 15 minutes, since there
are no alarms (`notes/11`).

Check it with `https://builtbybot.bisks.net/api/labels`: `configured: true` and
a non-zero count means it's live.

## Known gaps

- **Backfill is bounded.** buildthis's `/logs.json` caps `limit` at 500 with no
  cursor, and the log passed that on 2026-09-17 (596 events, 408 shipped). The
  earliest ships therefore aren't labeled. `/api/labels` reports
  `truncated: true` when this is happening rather than quietly labeling a
  prefix. The fix is a cursor on buildthis's side — that file is busy, so it
  wasn't touched here.
- **No negations.** Nothing labeled stops being bot-built, so there's no
  retraction path. Removal drops the subject rather than publishing a `neg`.
- **No reports.** `reasonTypes: []` and `subjectTypes: []` are explicit, because
  the lexicon treats an omitted field as "all reason types allowed."
