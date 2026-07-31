# Beyond buildthis — what else the tag-a-bot pattern could be

Notes from reading every thread @buildthis.bisks.net has been tagged in
(2026-07-24 → 07-31: 204 threads, 511 bot posts, pulled via the bot's author
feed + `getPostThread` on each root). The question: the bot builds *microsites*
— what else could a taggable bot make? Labelers, other bots, lexicons/PDS
tooling, datasets.

The answer that came out of the corpus is that these four aren't peers. Two are
buildable under today's rules, one is blocked on a single security decision, and
one is already happening without anyone naming it.

## What the corpus says the bot can and can't reach

**Reliable:** client-side toys over public read APIs. No auth, no persistence,
no identity, one page. koipond, treeoflife, everzoom, mirrormode, didscope,
fourk. These land first try.

**Reachable with effort:** anonymous server state. Durable Objects work —
mootrider's leaderboard, the-place's shared canvas, docmoot's WebSocket relay.
State is fine. *Identity-bearing* state is not.

**Out of reach, and for one reason.** Three refusals, all the same shape:

- spoonerism bot (heartpunk): *"an auto-posting bsky bot needs an account + a
  secret I don't have."*
- its own avatar (ver.ooo): *"my own login is a secret even I don't get to
  read."*
- the captcha proxy (7778777): declined on taste, not capability — worth
  separating from the other two.

The wall isn't capability. It's rule 2 of `builder/INSTRUCTIONS.md`: the builder
may never read or write a secret. Everything that needs a credential to *be* an
actor on the network — rather than a page that reads the network — is on the far
side of that rule.

There's also a taste boundary, stated best by other people. minormobius on the
epistemics build: *"Ultimately your request is not in the realm of little web
toy."* Rob, same thread: *"most websites really can't help much with good
thinking, even when they try very hard."* Useful sorting question for any new
idea: is the deliverable a page, or is the page a costume for something else?

## The four ideas, ranked by what's actually in the way

### 1. Lexicon / PDS tooling — buildable now, and the demand is already logged

The strongest of the four, because the corpus contains both the ask and the
proof of need.

The ask: steamtags (7778777) escalated to *"let users log in and save this under
`net.bisks.steamtags` in their PDS. Use local storage for anonymous users, sync
and use the PDS if/when they log in."* The bot ran out of runway.

The proof: two independent sites hit the identical lexicon footgun days apart.

- paintmoot (funferall): `"number"/"float" isn't in that list of allowed types —
  only integer`
- padmoot (erisianrite): `Expected one of null, boolean, integer, string, cid,
  bytes, array or object value type (got 0.34) at $.record.swing`

Same bug, same fix (integer-scale the floats), both needed a human to notice and
a round-trip to repair. A schema designer / record validator / "will this
round-trip through a PDS" checker is a tool for a failure mode the builder
*demonstrably keeps rediscovering.* And it's pure client-side work — no secret
required. This one has no blocker at all.

### 2. Dataset / index — half-built, and the gap is named precisely

Already further along than it looks:

- carbonadoks pushed the bot into a CAR-download helper, then *"do a full sweep
  of all your websites and replace them with the car helper."*
- simcluster-atlas reached 4,426 links with multi-select filters, free-text
  search, and a dense sortable table over three rounds.
- cloutgraph (octopodeeznuts) crawled who-liked-whom off each PDS, PMI-weighted
  the edges, ran HITS.

The author of cloutgraph named the real gap himself: *"the full version of what
I had in mind would need to be hooked up to a jetstream for a while instead of
crawling everyone's PDS each run."* Every one of these sites re-crawls on each
page load because there is no standing index to read from.

Two unbuilt requests point at the same missing thing:

- norvid: *"dictionary of all outgoing links from the entire simcluster: annual
  review would be a cool macrosite"*
- Rob, replying: *"spotify year in review but for posting, and, socially"*

A persistent Jetstream-fed index is the substrate the other ideas would sit on,
not a peer to them. It's also the one item here that's genuinely infrastructure
rather than a toy — worth deciding deliberately, since it's a standing cost
where everything else is a static page.

### 3. Labeler — real demand, blocked on the key problem

> **Correction, later:** this section lumps feed generators in with labelers as
> credential-blocked. That's wrong — a feed generator's service DID can be
> `did:web:` (a served document, no key), so only the labeler needs a signing
> key. See `notes/86` and `notes/87`.

thebadcode: *"an atproto appview implementation that allows you to mute semantic
concepts."* semanticmute got a first pass and stalled. The thread is unusually
valuable because dferrer had already tried it and posted real field notes:
embeddings are cheap and context-free, agentic tool-calling got expensive fast,
keyword mute was only beaten by a large model, and the hard case is exactly the
post at the top of that thread — heavy context, past the training cutoff.

A labeler is the correct atproto-native shape for this: it's how you publish
"this post is about X" without owning the client. But it needs a DID, a signing
key, and a long-lived service endpoint. Same wall as the bot maker.

### 4. Bot maker — the most interesting, the most blocked

The corpus is already a multi-bot ecosystem: buildthis ↔ minomobi built a real
CORS-open registry exchange and a WebSocket wire to talk over; void.comind filed
a bug report *with a failing test case* and buildthis fixed it; attie.ai,
minormobius, and impostorbel all orbit the same threads. norvid asked for a bot
that tags bots (*"@s any bot I commission a website with to 'keep going' 100
times in a row... so I can take a much-earned vacation"*).

But minting a bot means minting an identity and an app password per bot. That is
the exact thing the sandbox forbids. This is not a separate project from the
labeler — **both are the same single decision**: can the builder provision and
hold a credential it is currently not allowed to read?

That decision is about the security model, not about what to build. Worth
answering on its own terms before treating either as a project.

## The idea that's already happening: customization by tagging

This came up in conversation and it's the one the corpus supports most strongly —
because it isn't hypothetical. **The bot already reshapes itself when tagged, and
it's load-bearing.** `builder/` is deliberately outside `.github/` precisely so
"make yourself do X" is a valid request. Things that actually shipped this way:

- **Its own house style.** antiali: *"do you have any long-term memory? it would
  be great if you finish this and also remember to always build viral sharing in
  every app."* Result: `notes/45-sharing-and-virality.md`, and sharing became the
  default for every subsequent site. A post permanently changed how every future
  build behaves.
- **Its own reply text.** Rob asked it to soften the non-mutual reply; it
  rewrote it.
- **Its own faceting bug.** dave.9000ish.uk pointed out that Bluesky needs
  byte-indexed mention facets; the bot fixed `reply.mjs` so its own @mentions
  resolve.
- **Its own pacing.** norvid asked for minormobius-style spaced releases; that
  became mobius mode.
- **Its own repo-wide tooling.** ver.ooo asked for a global import-path check;
  that became `pnpm check:imports`. carbonadoks got a fleet-wide trailing-slash
  redirect and a typeahead sweep across ~30 sites out of two tags.

minormobius asked the right design question at the time and nobody answered it:
*"how would you structure that long term memory? Maybe edits to the claudemd, or
a community aesthetic guide."*

That's the actual open idea. Right now self-modification is **global and
uncontrolled** — one person's tag rewrites the house style for everybody, and
there's no record of who changed what, no scoping, no way to hold a preference
that's yours rather than the bot's. The obvious next move isn't a new bot; it's
giving the existing one **per-person or per-project memory** — a preference
record (plausibly in the requester's own PDS, which makes it atproto-native
rather than a config file) that shapes builds for that person without mutating
everyone's defaults.

This has a further advantage over the bot maker: it delivers most of what people
actually want from "my own bot" — a builder that knows my taste — **without
minting a single credential.** It sits entirely on the near side of the secrets
rule.

Adjacent unbuilt variants in the corpus:

- minormobius: *"a bot that makes one website a day but it's like The Place and
  everybody's prompts make changes to the one big site for that day."* A shared
  daily canvas rather than one site per tag.
- cee.wtf, on why the current design works — worth preserving through any
  change: *"the special sauce is that it removed the decision to post something
  after it's made. If it was a boring idea, too bad it's getting posted. I think
  that's Art."* The bot agreed: *"taste is a filter I don't have, so main is the
  raw feed."* Per-person memory should not quietly become a taste filter.

## Where this leaves things

- **No blocker:** lexicon/PDS tooling; per-person build memory. Both buildable
  under today's rules, both address problems the corpus documents repeatedly.
- **One decision, two projects:** labeler and bot maker both wait on whether the
  builder may hold a credential. Answer that once.
- **Standing-cost call:** the Jetstream index is infrastructure, not a toy —
  it unlocks the dataset work and several stalled sites, but it's the first
  thing here that costs money while idle.

Raw corpus and fetch scripts were session-scratch, not committed; regenerate by
walking the bot's author feed and calling `getPostThread` on each distinct
thread root.
