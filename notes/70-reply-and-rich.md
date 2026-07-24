# trigrams: /rich and /reply (design)

Two new views on the trigrams site, from Rob's own unique trigrams.

## /rich — the good ones

Mino's unique-trigram list (phrases that are Rob's alone on the network) with an
EXTRA judging layer that scores each n-gram for being a genuinely *good/cool*
trigram — richness as a property of the trigram itself, not relative to any post.
Filters out the junk ("of the and") so only the bangers show.

- Source: the unique-trigram computation (from mino's `b/unique`, likely
  client-side against the public AppView). TBD after reading mino's code.
- Judge: an LLM scores each candidate for coolness/evocativeness. Model choice
  OPEN — Workers AI (self-contained, cheaper) vs Claude (better taste, needs an
  API key as a Worker secret). Leaning: try to keep it client-callable / cheap.
- Precompute vs live: lean precompute — judge once, cache the scored list, page
  reads the cache. (Revisit once we know if anything server-side exists at all.)

## /reply — reply with the perfect trigram

A composer. Point it at a bisk (post) you want to reply to → search your own past
bisks + trigrams → pick the perfect one → it posts the reply, with a little
perfect card image + a link back to the source.

- Needs Bluesky OAuth with write scope (createRecord for app.bsky.feed.post).
  Whether that can be client-side-only or needs a Worker is THE open question —
  being answered by reading mino's OAuth (airchat/oauth, fluoddity/auth). Yoink
  mino's auth, attribute on the home page.
- Posting model: ALWAYS show the drafted reply + preview image, require an
  explicit "post" click. Never auto-send.
- The card image: the trigram card (like the screenshots), tidied up, rendered as
  an image and attached to the reply. Server-side SVG→PNG (mino renders OG images
  as SVG — see og.svg). Maybe subtle style pickers.

## Build order (Rob's call)

1. /reply first, but it depends on the OAuth infra — so: OAuth infra → /reply.
2. /rich can come alongside or after; it depends on the unique-trigram generator
   + a judge, not on OAuth.

## What we learned from mino's source (agent01)

Read the repo. Findings that shape the build:

- **OAuth-to-post CAN be client-side** (atproto public-client: PKCE + DPoP,
  `token_endpoint_auth_method: none`, tokens in IndexedDB, via
  `@atproto/oauth-client-browser`). mino deliberately does NOT — every write goes
  through a confidential-client **Worker + D1** because browser-held refresh
  tokens are XSS-exfiltratable and a token = PDS write access. That's a security
  posture for multi-user public surfaces, not a protocol requirement.
  - **Our call (v1): client-side OAuth.** /reply is Rob's personal tool on his own
    device; the XSS risk that drove mino's choice is much smaller for a single
    user. Harden to the Worker+storage pattern later if it's ever opened up.
  - If we DO want the Worker pattern: `airchat/` is the copyable ~5-file example
    (oauth/{flow,jwt,discovery,keypair}.js + worker.js), backed by D1.

- **The richness judge needs NO LLM.** mino's unique-trigram tool ranks with a
  pure heuristic `score()` (stopwords +0.15; content words +min(len,12)/4+1;
  all-stopword grams dropped). Uniqueness is decided by searchPosts verification,
  not a scorer. Only LLMs in the whole repo are unrelated (a Gemini regex helper).
  - **Our call (v1): heuristic-only for /rich.** Run it on Rob's real trigrams,
    look at what surfaces, add a tiny model (Workers AI Llama 3.2 3B, on-edge,
    ~free) ONLY if the heuristic can't find the cool ones.

- **Unique-trigram computation is copyable** (`b/unique/unique.js`): resolve
  handle→DID→PDS, harvest own repo via `listRecords` (app.bsky.feed.post, ~40
  pages), tokenize, keep EXACTLY-ONCE grams (a repeated phrase is already ≥2 uses
  network-wide), then verify each against `searchPosts`. NOT firehose.
  - **searchPosts auth (resolved):** the *anonymous* public AppView 403s search
    (verified: `public.api.bsky.app` → 403). mino works around this with a shared
    service-account app-password token in `b/worker.js` (`serviceToken()` =
    plain `createSession` → Bearer), because their tool searches on behalf of
    anonymous visitors typing in ANY handle.
  - **We don't need that.** /rich is only for Rob, who is ALREADY logged in via
    the /reply OAuth session. An authed AppView call (`api.bsky.app` with the
    session's Bearer) does search. So /rich verification runs CLIENT-SIDE with
    Rob's own token — no proxy worker, no app-password, no service account.
    (To confirm: a user-OAuth token is accepted by searchPosts just like an
    app-password session token. Verify once OAuth is standing; fallback is a tiny
    proxy worker if not.)

- **Reply builder copyable** from `io/worker.js` `replyTracked()`: correct
  root/parent strongRefs, link facets with UTF-8 BYTE offsets (not JS string
  indices). Two production lessons baked in.

- **WARNING: automated replies got mino's service account taken down**
  (AccountTakedown, in io/DESIGN.md). Their reply tool defaults OFF + rate-limits.
  Confirms /reply MUST be human-in-the-loop, one at a time, never a bot.

## Reference files kept

`scratchpad/mino-ref/`: b-unique/, b-worker.js, airchat-oauth/, airchat-worker.js,
airchat-wrangler.jsonc, io-worker.js. (Full clone deleted — 739M → 144K.)

## Decisions (settled with Rob)

- [x] /reply OAuth: **client-side** (`@atproto/oauth-client-browser`).
- [x] /rich: **fully client-side too**, behind the same OAuth login — Rob's own
      session token does the searchPosts verification. No worker.
- [x] /rich judge: **heuristic-only v1**, copy mino's `score()`, iterate after.
- [ ] Card image style + whether style pickers are v1 or later. (open)

Net: both views are static pages sharing a copied-in OAuth module. The only
server anywhere is the redirect handler we already have.

## OAuth implementation: hand-rolled, NO build step

Checked how mino actually does it: **hand-rolled ES modules, no bundler, pure Web
Crypto** (`airchat/oauth/{jwt,flow,discovery,keypair}.js`). Browsers run ES modules
natively (`<script type="module">`), and every crypto call is `crypto.subtle.*` /
`crypto.randomUUID()` — identical in browser and Worker. No Buffer, no require, no
Node APIs.

So we hand-roll too, copying mino's primitives — but SIMPLER, because we're a
browser **public client**, not mino's server **confidential client**:
- Keep: PKCE (`generateCodeVerifier`/`computeCodeChallenge`), DPoP
  (`generateDPoPKeyPair`/`createDPoPProof`), discovery, the auth-server metadata
  fetch. All copyable near-verbatim from `jwt.js`/`discovery.js`.
- Drop: `createClientAssertion` + `keypair.js` (the server-held ES256 signing key
  and `private_key_jwt` assertions). A public client uses
  `token_endpoint_auth_method: none` — no client secret/key at all.
- Tokens/DPoP key persist in **IndexedDB** (browser), not D1.

client-metadata.json served at `trigrams.bisks.net/client-metadata.json`;
`client_id` = that URL; scope `atproto transition:generic` (covers feed.post).
Dev friction: atproto OAuth is fiddly against localhost — develop against the
deployed trigrams.bisks.net (we have push-to-deploy).

## Attribution

Home page (apex) gets a thank-you to mino.mobi / minormobius/agent01 for the
OAuth and trigram groundwork we're building on.
