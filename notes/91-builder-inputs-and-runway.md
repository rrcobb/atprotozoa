# Two builder problems: thin input, and the runway wall

Both raised by Rob 2026-07-31, both checked against the code and the tag corpus.
Both are real. Neither needs new infrastructure.

> **Status 2026-08-01: problem 1 is done, problem 2 is not.**
>
> Shipped in three commits — the brief cap, the text-bearing embeds, and image
> input. What the bot now sees: quote posts, link cards, image/video alt text,
> the thread root when the tag is deeper than the 10-ancestor window, and the
> images themselves as files the builder opens.
>
> One thing below turned out to be wrong. This note ranks alt text as the
> cheapest high-value fix; measured against 39 real tag threads it's the
> *cheapest* but close to worthless — 27 of 33 images have `alt: ""`, and the
> populated ones are mostly junk for our purposes ("asked anonymously 15m ago",
> and bare digits from a poll image). Quote posts are the real win at 15 of 165
> posts, link cards 5. And empty alt is the argument *for* passing pixels, not
> against: if nobody writes a description, the image is the only one there is.
>
> Three bugs that testing caught and reasoning alone hadn't: a quoted post's
> nested embed is the raw record (blob refs) rather than a hydrated `#view` (CDN
> urls), so quoted images need the url built from the quoted author's DID; the
> CDN answers a bad path with a 200-shaped error body, so a download without
> `--fail` silently hands the builder a 27-byte text file named `.jpg`; and
> `threadContext()` returned early unless the mention was a reply, which was
> harmless when it only walked ancestors but silently skipped embeds on a
> top-level tag — someone posting a screenshot *with* "@buildthis build this"
> rather than under it. It now runs for every mention.
>
> The table below lists "sibling replies" as dropped. Still dropped, deliberately:
> `depth: 0` keeps the response small, and a branch's replies are usually noise
> rather than the referent.
>
> **One deploy step was manual** (done 2026-08-02 00:27 UTC). `box-build.sh`
> re-syncs the checkout at the top of every build, so its half of this ships by
> itself. `box-poll.sh` does not — it's the long-running systemd unit, and it's
> where `BRIEF_IMAGES` is read off the job, so images didn't reach a build until
> `sudo systemctl restart buildthis-poll` ran on the box. Everything else (the
> cap, quotes, link cards, alt text, the root) is worker-side and live on deploy.
> See `notes/90` for why that restart has to wait for an idle box.
>
> Problem 2 (the ~20% partial rate) is untouched — it starts with the
> measurement described below, against logs on the box. **Read the outcome-
> accounting caveat there first**: the log's three notions of "what happened"
> disagree, so a naive count off these logs will be wrong.

## Problem 1: the bot sees almost nothing

`threadContext()` in `sites/buildthis/src/index.ts` walks up to 10 ancestors and
extracts exactly one field:

```ts
const text = (node.post.record?.text ?? "").trim();
if (text) chain.push(`@${handle}: ${text}`);
```

And the type it parses through is deliberately narrow:

```ts
interface ThreadNode {
  post?: { author?: { handle?: string }; record?: { text?: string } };
  parent?: ThreadNode;
}
```

So everything except plain text is dropped on the floor:

| dropped | why it matters |
| --- | --- |
| **images** (`embed.images`) | "build this ☝️" under a screenshot → the bot sees "build this ☝️" |
| **image alt text** | free, already-textual description of the image, thrown away |
| **quote posts** (`embed.record`) | the quoted post IS the referent, invisible |
| **link cards** (`embed.external`) | title + description are text and would help |
| **video** (`embed.video`) | including its alt text |
| **the root post when the tag is deep** | only the `.parent` chain is walked |
| **sibling replies** | `depth: 0`, so no replies are fetched — context in a branch is lost |
| **facets** | mentioned handles resolve to nothing |

The corpus has clear instances of this biting. dave.9000ish.uk's taxi thread
worked only because the story was in *text*. The `norvidwave` and `spot-the-ai`
asks reference images. `croissanthology`'s raven/slingshot game request was a
reply the bot never saw properly. And several "build this ☝️" tags point at
image posts.

**Fixes, cheapest first:**

1. **Alt text** — pure text, already in the record, zero cost. `embed.images[].alt`
   and `embed.video.alt`. Should have been there from the start.
2. **Quote posts** — `embed.record` / `embed.recordWithMedia`. The quoted post's
   text and author are in the same `getPostThread` response already. Probably
   the single highest-value fix, since a quote is usually *the* referent.
3. **Link cards** — `embed.external.{uri,title,description}`. Free text.
4. **Root post always** — if the tag is deep in a thread, include the root even
   when the 10-ancestor walk doesn't reach it.
5. **Actual images** — needs a vision-capable path: fetch the blob, pass it to
   the model. The builder runs `claude -p` with Sonnet, which is vision-capable,
   so this is a matter of getting bytes to it (a file path in the prompt), not a
   model limitation. Bigger change than 1–4 but not exotic.

### The 600-char cap is indefensible

`MAX_BRIEF_CHARS = "600"` applies to the tag text via a bare
`tagText.trim().slice(0, max)` — a **silent mid-sentence truncation** of the
actual instruction. Ancestors are included in full, so the cap only bites the one
piece of text that matters most.

The comment right above it argues against itself:

> We include the ancestor posts IN FULL — a Bluesky post is ~300 chars, so ≤10 of
> them is ~3000 chars (<1k tokens), trivial for the builder's context and not
> worth truncating mid-idea. The tag post keeps a generous cap purely as a sanity
> guard.

If 3,000 chars of ancestors is "trivial," 600 chars on the instruction is not
"generous" — it's an order of magnitude tighter than the thing it's justified
against. And a Bluesky post maxes at 300 graphemes anyway, so **for a plain post
the cap never fires at all**; it only fires on the long-form cases (a post from a
PDS without the 300-grapheme client limit, or a DM/long record if that ever
lands) — exactly the requests with the most detail to lose.

The corpus has requests that read as near-600 already: antiali's `postwith`
spec, kumavis's collaborative-drawing spec, `axeghostgame`'s multi-clause
image-quiz brief. Losing the tail of one of those silently drops requirements
the requester will then have to repeat.

**Fix:** raise it to something that can't bite in practice (5–10k) or drop it
and bound the *assembled* brief instead. If a guard is wanted, truncate at a
sentence/word boundary and say so in the brief ("[truncated]") rather than
cutting mid-word invisibly.

## Problem 2: "ran out of runway" is ~20% of outcomes

Counted across the 204-thread corpus (2026-07-24 → 07-31):

| reply state | count |
| --- | --- |
| `built it 🎉` | 285 |
| `ran out of runway` (partial) | **73** |
| `couldn't build that one` | 26 |
| `that one's a big one` | 3 |

So roughly **one in five builds ends with "tag me again to keep building."** The
handling is already good — `box-build.sh` preserves and pushes partial work, and
the comments show that was hard-won (heartpunk's solitaire drag-drop was lost
once by checking only for a dirty tree and missing local commits). The problem
isn't data loss, it's that the user has to notice and re-tag.

**What's known from the code:**

- `BUILDER_MAX_TURNS` defaults to **60**, raised from 30 because "Sonnet takes
  more, smaller steps."
- A max-turns overrun is explicitly **deterministic** — "an identical rerun
  overruns identically" — so it is never blindly retried.
- Partial work is preserved and shipped; the reply invites a re-tag.

**Things worth investigating (not yet done):**

- **Is 60 still right?** It was tuned once. The corpus is a week of evidence; the
  build logs on the box would show the actual turn distribution. If most
  overruns land at 60 with real work in progress, raising it is the one-line fix.
  If they're bimodal (fast successes vs. genuine runaways) that argues for
  something smarter.
- **Auto-continue instead of asking.** The overrun is deterministic given the
  same brief — but *not* given a brief plus the work already on disk. A second
  pass starting from the partial state is a different (easier) problem than the
  original. The corpus shows humans doing exactly this by hand: "keep going",
  "keep building!", "you can do it!" are among the most common inputs in the
  whole dataset. That's a loop the harness could close itself, with a bounded
  number of continuations.
- **Do partials cluster by request type?** Impression from the corpus: games and
  anything with "and also…" lists overrun most; single-page toys rarely do.
  Worth actually measuring rather than eyeballing.
- **Is the first pass structured well?** `BUILD_PROMPT.md` already says to get a
  minimal-but-real version onto disk early, then enrich. Whether that's happening
  is checkable in the logs.

**The measurement to run first:** pull `BUILD_RC` / `MAX_TURNS_HIT` and turn
counts out of the box's build logs, bucket by outcome and by request shape. That
turns all of the above from speculation into a decision. The logs are on the
Hetzner box; nothing here needs new instrumentation.

**Caveat: the logs carry three disagreeing notions of "what happened."** Two real
consecutive builds, 2026-08-01:

```
build rc=1 ... disp=no_build  ... → outcome reported: failure   # deliberate non-build
build rc=1 ... disp=partial   ... → outcome reported: success   # max-turns overrun, work shipped
```

`rc` is the agent's exit code, `disp` is the harness's disposition, and the
reported outcome is what the event log stores. `rc=1` covers both a max-turns
overrun and a clean decline. The reported outcome is narrower still: `BUILD_OK`
is set by `{ success || partial }` (box-build.sh:394), so an overrun reports
`success` because work did ship, and a deliberate non-build reports `failure`
because nothing did. Defensible individually; together it means **no single
field counts partials**.

`disp` is the field to bucket on — it's the only one that distinguishes all six
states (`success`, `partial`, `usage_limit`, `too_big`, `no_build`,
`incomplete`, classified at box-build.sh:306-335). `rc` and the reported outcome
both collapse states you care about. Note the corpus counts at the top of this
section came from *reply text*, which tracks `disp` closely but isn't the same
field — worth re-deriving from `disp` before trusting the ~20%.

Worth reconciling regardless of the measurement: a deliberate "nothing to build
here" reply logging as `failure` also inflates the failure rate on the health
page.

## Why these two matter more than most of `notes/89`

They're both **things the bot can't currently do** rather than new things to
build, which is the filter Rob asked for. And both are ordinary changes to
existing code — no new bot, no new account, no new infrastructure. The input
fixes in particular (alt text, quotes, link cards) are small enough that the
builder could plausibly make them itself if tagged.
