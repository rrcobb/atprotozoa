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
- `/lists` — the signed-in UI: every list in your repo, who's on it, and a
  remove button per member. Plus delete-a-whole-list. See below.
- `/lists/remove`, `/lists/delete`, `/logout` — POSTs from that page.
- `/status.json` — the CORS-open catalog document `notes/ideas/other-bots.md`
  asks every bot here to publish on day one. Says what the service is, whether
  it's `live` or `not-configured`, what it writes and under what scope, and
  **how many** accounts are signed in — a count only, never who. Whose list
  contains whom is the user's business; listbot publishing it would undo the
  point of keeping lists in their own repo.
- `/.well-known/atproto-did` — handle verification, the HTTP method. Serving it
  costs nothing, but it is **not** what verifies this handle; see below.

## The web UI, and why it exists

The bot acts minutes after a tag, while the user is doing something else.
Anything that acts on your behalf while you aren't looking needs a place to see
what it did and undo it. Bluesky's own app can edit these lists — they're
ordinary records in your repo — but that's a context switch away from where the
mistake was made, and "go somewhere else and fix it" is a bad worst case.

`/lists` shows every list with its members and a remove button on each. It needs
**no new permission**: the OAuth grant already covers `listitem` delete, which is
exactly what the button does.

This also underwrites a product decision. The tag-reading agent is tuned to act
on decent evidence rather than ask, because a wrong list membership costs one
tap to fix. That's only true if the one tap exists.

### The browser session

A **separate** thing from the OAuth sessions, and the distinction is the point.
An OAuth session is standing permission to act on a repo. A browser session is
one logged-in tab.

The cookie holds a random 256-bit token and **nothing else** — no DID, no
tokens. The token is a KV key pointing at the DID. So a forged or tampered
cookie can't name a repo to act on; the worst it can do is fail to resolve.

Deliberately not a signed JWT carrying the DID: that puts the user's identity in
something the browser holds, and a signing bug becomes an account-takeover bug.
A lookup table can't be forged, only guessed, and 256 bits doesn't get guessed.

`HttpOnly` so script can't read it, `Secure` so it never crosses plaintext, and
`SameSite=Lax` — Lax rather than Strict because the OAuth callback is a
cross-site redirect back into this origin and Strict would drop the cookie on
exactly that hop. Lax still stops another origin driving a state-changing POST.

A token that doesn't match `^[0-9a-f]{64}$` is refused **before** the KV read, so
a crafted cookie can't be used to probe or to build a key of its own choosing.
There's a test on precisely that, asserting KV was never touched.

Signing out drops the browser session only. The OAuth grant stays, because the
point of the bot is that it keeps working after you close the tab — revoking it
is something you do in Bluesky's app settings, and the page says so rather than
offering a button that quietly means something else.

## The handle is verified by DNS, not by the Worker

`listbot.bisks.net` is claimed with a TXT record, not the well-known endpoint:

```
_atproto.listbot.bisks.net  TXT  "did=did:plc:ydbdmpz23ou2ycc4oejlf24z"
```

Both methods are valid atproto (`notes/30` describes the pair). DNS was chosen
because the HTTP method needs a deployed Worker at `listbot.bisks.net`, and
Workers were exactly what was unavailable when the account hit Cloudflare's
500-Worker cap. The TXT record needs no Worker, so the handle landed while the
deploy was still blocked.

Worth knowing generally: **a subdomain handle verifies by DNS the same way an
apex does** — confirmed here, `resolveHandle` returns the bot's DID. The zone
already had the pattern in `_lexicon.bisks.net`.

The record is written with the `DNS edit bisks.net token` in 1Password's
Cloudflare item, which is a different credential from the Workers token the
`audit/cf-*.mjs` tools use — that one reads zones but 403s on DNS records.

## Tests

`node audit/run-tests.mjs listbot` — 39 tests, no network.

- `tests/command.test.mjs` — the tag parser. The load-bearing case is that other
  people's handles in a tag never become the subject or the list name.
- `tests/crypto.test.mjs` — the security story: a client assertion verifies
  under the published jwks and a tampered one doesn't; a DPoP proof verifies
  under its own embedded jwk and that jwk carries only the four thumbprint
  members (WebCrypto's raw export includes `key_ops`/`ext`, which some PDSes
  reject); a stored session round-trips, the blob never contains the refresh
  token, the wrong key can't decrypt it, and the same session encrypts
  differently every time.
- `tests/session.test.mjs` — the browser cookie. The load-bearing case is that a
  malformed token never reaches KV.

These mirror the source rather than importing it (`src/*.ts` uses Workers
globals), so an edit to either has to be made in both places deliberately.

## Configuration

The Worker is inert until it's configured; `/status.json` reports
`not-configured` rather than advertising a loop that can't run.

**Vars** (`wrangler.toml`): `BOT_DID` and `BOT_IDENTIFIER` — both the bot
account's DID. The DID rather than the handle so login survives a handle switch,
same reasoning as buildthis. `CLIENT_PUBLIC_JWK` is the public half of the
client signing key; it's a var rather than derived because the private key is
imported non-extractable and WebCrypto can't recover a public half from it.

**Secrets**, and what each one actually protects:

| secret | what it is | what it protects |
| --- | --- | --- |
| `BOT_APP_PASSWORD` | the bot account's app password | the bot's own notifications and replies. Grants **no** access to anyone's lists — those go only through each user's OAuth grant. |
| `CLIENT_PRIVATE_KEY` | P-256 PKCS#8, base64url, from `audit/listbot-keygen.mjs` | signs the client assertions that prove to a PDS that a sign-in request is really from listbot. Its public half is served at `/jwks.json`. |
| `SESSION_ENC_KEY` | any high-entropy string | **every user's stored refresh token.** The real boundary — see "What protects the tokens". Rotating it logs everyone out; leaking it means whoever holds it can edit signed-in users' lists. |

Plus a KV namespace bound as `STATE`.

`/status.json` reporting `"status": "live"` means all of it is in place.

## Out of scope: a labeler over these lists

An aggregate labeler was considered alongside this — one shared labeler
publishing counts over these lists ("on the 'bots' list of N accounts"). Rob
parked it on 2026-09-17: the lists in each user's own PDS are the whole product.

Nothing here is designed for it. There are no hooks, no shared subject store, no
label-shaped fields on anything, and `sites/builtbybot` is untouched. If it ever
comes back it starts from the product question, not from this code.
