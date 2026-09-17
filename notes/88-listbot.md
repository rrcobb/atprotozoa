# listbot — keep your own lists by tagging

`@listbot.bisks.net` is a Bluesky account. You sign in once at
`listbot.bisks.net`, and after that you reply `@listbot.bisks.net bots` under
anyone's post and that post's author joins **your** list called "bots" — created
if you don't have one. `@listbot.bisks.net remove bots` takes them off.

Bluesky already reads `app.bsky.graph.list` as mute lists, block lists, and feed
curation lists, so a list is useful the moment it exists. No consumer had to be
built.

## Why lists, not labels

Rob's framing: *"an ability for people to maintain their own labels / lists more
easily; act as a tool layer where we don't care about wrong labels since that's
for the person using it to determine."*

The second half of that decides the first. Labels are signed by one labeler DID,
so every label is that labeler's assertion. There is no such thing as a per-user
label — if listbot issued them, "wrong" would be listbot's problem to
adjudicate, for everyone, forever. That's the opposite of a tool layer.

A list inverts it. `app.bsky.graph.list` and `app.bsky.graph.listitem` live in
the **user's own repo**, signed by their own key. Nobody but the owner is
asserting anything, so there is nothing for listbot to be right or wrong about.
Someone can keep a list called "bots" with no bots on it and that's simply not a
correctness question.

Lists are created as `#curatelist`, not `#modlist`: the neutral kind. The owner
can point a mute or a block at one in the app, but creating it as a modlist
would presume a purpose listbot doesn't get to pick.

## The new part: a server-held OAuth session

This is the first site in the repo to do **confidential-client** atproto OAuth,
and it's the only genuinely novel machinery here.

Every other OAuth site is a **public** client: the browser holds the session,
`token_endpoint_auth_method` is `"none"`, there's no jwks, and a write happens
while the user is looking at the page. `sites/padmoot` is the reference.

listbot can't work that way. The user tags the bot on Bluesky and walks away;
the write to their PDS happens on a cron tick minutes later with no browser
open. So the Worker holds the refresh token and mints access tokens itself,
which makes it a confidential client. Three things follow:

1. **A client assertion.** The token endpoint authenticates listbot with a
   `private_key_jwt` — a short-lived JWT signed by a P-256 key whose public half
   is served at `/jwks.json`. Each PDS fetches that to verify it.
2. **A per-session DPoP keypair, persisted.** DPoP proofs must be signed by the
   same key across refreshes: the PDS binds the refresh token to that key's
   thumbprint, so a regenerated key is a dead session. The keypair is stored
   with the session, not derived.
3. **Encryption at rest** for the refresh token. See below.

ES256 (P-256) throughout — the curve Workers' WebCrypto implements natively, so
there's no crypto dependency. Same reasoning as the labeler's signing key
(`notes/87`).

`src/oauth.ts` has the whole flow: PAR, PKCE, the client assertion, the DPoP
nonce dance. The nonce part is worth knowing about — an atproto PDS rejects a
proof that doesn't carry the current nonce and signals it with a 401 containing
`use_dpop_nonce`, so `dpopFetch` retries once and hands back the fresh nonce for
the caller to persist.

### What protects the tokens

`notes/11` says KV is not an authentication boundary. That is just as true here,
and worth saying plainly rather than leaving implied: **KV is the filing
cabinet, not the lock.**

The boundary is `SESSION_ENC_KEY`, a Worker secret that appears nowhere in KV,
nowhere in this repo, and in no response the Worker serves. Sessions are stored
AES-GCM encrypted under it, with a fresh 12-byte IV per write.

- KV contents alone → ciphertext.
- KV contents **and** the secret → the ability to act on every signed-in user's
  PDS, within listbot's scope.

And the limit, stated honestly: this is encryption at rest against a KV-only
compromise. It is **not** protection against a compromise of the Worker itself —
a Worker that can decrypt for its own cron can decrypt for whoever controls it.
Rotating the secret invalidates every session, which is a real recovery move:
users just sign in again.

The same reasoning is written at the top of `src/store.ts`, where someone
editing the storage will actually read it.

### Scope

Per `notes/50`, exactly what the bot does and nothing more:

```
atproto
repo:app.bsky.graph.list?action=create&action=update&action=delete
repo:app.bsky.graph.listitem?action=create&action=delete
```

No posting, no following, no `transition:generic`. The two places scope lives
(`client-metadata.json` and the authorize request) are generated from a single
`SCOPE` constant in `src/index.ts` precisely so they cannot drift — that's the
failure notes/50 warns about, removed by construction rather than by discipline.

Note the metadata is **served by the Worker**, not a static file in `public/`,
because it interpolates `SITE_URL` and the jwks location.

## Watching for tags

Cron every 2 minutes, `listNotifications` plus a periodic `searchPosts` sweep —
copied from `sites/buildthis/src/index.ts`, not Jetstream. Jetstream is a
standing websocket, which is a Durable Object, which this repo doesn't do
(`notes/11`); `listNotifications` also arrives pre-filtered, and the bot is
authed anyway to reply.

Both discovery rails exist because each has been seen to drop mentions the other
caught — the two incidents are documented in `notes/80` (a reply on the bot's
own post arrives as `reason: "reply"`, not `"mention"`; and Bluesky once dropped
an author's mentions from every recipient's notifications account-wide while the
posts stayed live and searchable). Every 5th tick runs the sweep.

### The subject is never taken from the tag text

The person added to a list is the **author of the post being replied to**,
fetched from the AppView by URI. A tag that also `@`-mentions other people
doesn't touch them — the parser strips every mention before reading the list
name, and there are tests on exactly that case, because a mis-parse writes a
record into somebody else's repo.

Tagging under your own post is refused, as is a top-level tag with no parent.

### There's no allowlist

buildthis gates on Rob's mutuals because a tag spends money and can edit the
repo. listbot can only write to the repo of someone who signed in and granted
it access, so the gate is the OAuth grant itself. Someone who hasn't signed in
gets a reply pointing at the site; nothing else happens.

## Endpoints

- `/` — landing page and sign-in.
- `/login`, `/callback` — the OAuth flow.
- `/client-metadata.json`, `/jwks.json` — the confidential client's identity.
  Public by design: they're how a PDS verifies listbot, not how it authenticates.
- `/status.json` — the CORS-open catalog document `notes/ideas/other-bots.md`
  asks every bot here to publish on day one. Says what the service is, whether
  it's `live` or `not-configured`, what it writes and under what scope, and
  **how many** accounts are signed in — a count only, never who. Whose list
  contains whom is the user's business; listbot publishing it would undo the
  point of keeping lists in their own repo.
- `/.well-known/atproto-did` — handle verification.

## Tests

`node audit/run-tests.mjs listbot` — 25 tests, no network.

- `tests/command.test.mjs` — the tag parser. The load-bearing case is that other
  people's handles in a tag never become the subject or the list name.
- `tests/crypto.test.mjs` — the security story: a client assertion verifies
  under the published jwks and a tampered one doesn't; a DPoP proof verifies
  under its own embedded jwk and that jwk carries only the four thumbprint
  members (WebCrypto's raw export includes `key_ops`/`ext`, which some PDSes
  reject); a stored session round-trips, the blob never contains the refresh
  token, the wrong key can't decrypt it, and the same session encrypts
  differently every time.

These mirror the source rather than importing it (`src/*.ts` uses Workers
globals), so an edit to either has to be made in both places deliberately.

## What Rob has to do

The site deploys and is inert until all of this is done. `/status.json` reports
`not-configured` until then rather than advertising a loop that can't run.

### 1. The bot account

A normal Bluesky account, same as buildthis (`notes/80`). Suggested handle
`listbot.bisks.net` — the Worker already serves `/.well-known/atproto-did`, so
claiming it is a var change, not a new mechanism. Create an **app password** for
it.

The app password is only for the bot's own notifications and replies. It gives
listbot no access to anyone's lists — those go exclusively through each user's
own OAuth grant.

### 2. The client signing key

```
node audit/listbot-keygen.mjs
```

Prints a P-256 keypair and self-tests it. The private half is a secret; the
public half is a JWK that goes in `wrangler.toml` as `CLIENT_PUBLIC_JWK` (public
values only). It's a var rather than derived because the private key is imported
non-extractable and WebCrypto can't recover a public half from it.

### 3. The session encryption key

Any high-entropy string, e.g. `openssl rand -base64 32`. This is the one that
matters most — see "What protects the tokens".

### 4. Wire it up

```
wrangler kv namespace create listbot-state     # id -> wrangler.toml

cd sites/listbot
pnpm dlx wrangler secret put BOT_APP_PASSWORD
pnpm dlx wrangler secret put CLIENT_PRIVATE_KEY
pnpm dlx wrangler secret put SESSION_ENC_KEY
```

Then replace in `wrangler.toml`: the KV namespace id, `BOT_DID` and
`BOT_IDENTIFIER` (both the bot's DID), and `CLIENT_PUBLIC_JWK`. Push.

Check with `https://listbot.bisks.net/status.json` — `"status": "live"` means
it's configured.

## Step two, not yet built: aggregate labels

The second half of the idea: one shared labeler publishing **aggregate** labels
over these lists — "on the 'bots' list of N accounts", with N visible. Nobody's
individual list is exposed; the claim is a count.

The trust judgment stays downstream, in whether anyone subscribes. That's the
honest place for it: the labeler asserts a countable fact about how many people
independently put someone on a list of a given name, and a subscriber decides
whether that's worth anything.

**Not started, and the ground shifted while listbot was being built.**
`sites/builtbybot` was repointed at gift links on 2026-09-17, so
`notes/87-labeler.md` now describes a `gift-link` labeler, not `built-by-bot`.
What that session reported, which decides the next step:

- It's still one labeler with one label value. Nothing in the infrastructure
  assumes that — `LABEL_VALUE` is a single constant and the signing/serving path
  is value-agnostic, and subject sets are already per-value KV keys.
- **The real question is a product one, not a technical one.** A labeler's DID
  is what people subscribe to, and subscribing is all-or-nothing per labeler. So
  sharing the account means anyone who wants list labels also gets gift-link
  labels, and vice versa. If the two have different audiences — and they look
  like they do — a separate account and key is cleaner, at the cost of
  provisioning a second key.
- `searchPosts` 403s on the public AppView, so any discovery path needs a
  session, not just a signing key.

Decide the account question before writing any of it.
