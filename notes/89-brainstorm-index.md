# Brainstorm index — everything on the table

Summary of the 2026-07-31 session (notes 81–88). Nothing here is committed to;
it's the menu. Sorted within each group by how ready it is, not by how good.

The one settled decision is the design principle in `notes/88`: **store what's
ours, re-derive the rest.** Several items below were re-scoped by it.

---

## A. No blockers — buildable today

**1. Write the ten missing lexicons.** (`notes/85`)
Sites already write ~11 `net.bisks.*` namespaces; only `steamtags` has an actual
schema. Copy that as a template. Catches the class of bug `padmoot` and
`paintmoot` both shipped independently (atproto records take integers, not
floats).

**2. Publish the lexicons.** (`notes/85`)
Serve them all under one path + add a `_lexicon.bisks.net` DNS record so NSIDs
resolve. One worker route, one DNS entry.

**3. Aggregate views via `listReposByCollection`.** (`notes/85`)
Find every repo holding `net.bisks.steamtags.rating` etc. Turns eleven isolated
toys that can only read your own records into a shared data layer. The
crowdsourced steamtags view is what 7778777 originally asked for.

**4. Cache trigram verdicts.** (`notes/88`)
`unique.js` has no client-side cache — every run re-downloads the CAR and
re-verifies from scratch. Verdicts are near-monotonic (a phrase only becomes
*less* unique), so they cache aggressively with little staleness risk. Small
change, big saving on repeat runs.

**5. One feed generator, hand-built.** (`notes/86`, `notes/87`)
`did:web:` on bisks.net (a served document — `apex/` already does this for the
handle), one declaration record, one `getFeedSkeleton` endpoint evaluating a live
AppView query. No signing key, no storage. Candidates: buildthis's own output,
the microsite scene, gift links.

---

## B. New bots

**6. Verifier / health-check bot.** (`notes/82`)
Fetches each announced URL, confirms it 200s and its scripts load. Silent unless
broken. The trailing-slash bug independently broke pvnp, sepcheck, areyoumad,
padmoot, cloutgraph, edzitronquest, desertbus, platoscave before anyone noticed
it was fleet-wide (110 sites).

**7. Protocol-object bot.** (`notes/87`)
Tag it, get a feed / lexicon / list instead of a page. The four outputs share one
template (declaration record, optional endpoint, optional DID, some logic) —
a form with slots, which suits automation better than buildthis's
fresh-design-per-build. Three of four need no forbidden secret.

**8. Physics-sim / fluoddity-flavored builder.** (`notes/84`)
A builder with a narrow taste rather than a general one. Mostly a prompt and
reference-material change, which makes it a cheap real experiment. The repo's
best-liked builds already skew this way (everzoom, fourk, cowlick, lavalamp,
turtle-garden).

**9. Image / video gen bot.** (`notes/84`)
Output is a blob in the bot's own repo, embedded in the reply — no site at all.
`uploadBlob` + `embed.images` / `video.uploadVideo`. The missing modality; also
the only idea with a real content-safety surface and per-call cost.

**10. Digest / "what happened" bot.** (`notes/82`, `notes/84`)
Daily or weekly: what shipped, what broke, who tagged. Low risk, feeds the
curator idea.

**11. Curator / gallery bot.** (`notes/82`)
norvid's "Top Chicken Oscars for the weekly profusion of these microsites,"
which nobody built. Wants to be a separate account precisely because it isn't the
builder grading its own homework.

**12. Commissioner / idea-mill bot.** (`notes/82`, `notes/84`)
`idea-mill` exists as a site; the bot never got made. Also norvid's "@ any bot
'keep going' 100 times" — said as a bit, but "keep going" is buildthis's single
most common human input. **Highest runaway risk here** — needs a hard tag budget
and a kill switch before it exists.

**13. Cron-manager bot.** (`notes/84`)
Tag it to *schedule* something. Different primitive from everything else
(request → standing behavior). Wants expiry by default: a job created by a
passing tag shouldn't be immortal.

**14. Repo janitor.** (`notes/84`)
Tag it to improve rather than build — perf, dead code, broken links. buildthis
already does this well when asked (110-site redirect fix, ~30-site typeahead
sweep, the WebGL perf fix), but nothing invokes it except a human noticing.
Scariest write pattern: unsupervised edits across ~190 live sites. Wants
report-only mode first.

---

## C. Needs a decision first

**15. Labeler.** (`notes/81`, `notes/86`)
The only item needing a **signing key** — the thing `INSTRUCTIONS.md` forbids the
builder from touching. Rob would provision it by hand, same as the buildthis
account. Suggested first label: `built-by-bot` (descriptive, hard to be
harmfully wrong about) rather than semantic moderation. Do a feed first; a bad
feed gets unsubscribed, a bad label lands on someone else's post.

**15b. Build requests as records, not just posts.** (Rob, 2026-07-31)
Today a build request is a Bluesky post and the decision history is a thread.
If a request were also a `net.bisks.buildthis.request` record — with its outcome,
what it changed, and who asked — then scoping and history come almost free:
"what has this person asked for," "what changed the house style and who asked,"
"which requests are still partial." Makes #16/#17 tractable rather than
requiring a separate mechanism, and it's the atproto-native version of the
scoping problem instead of a config file. Pairs with the lexicon work (1–3).

**16. Per-person / per-project build memory.** (`notes/81`)
Self-modification by tagging is already happening and is uncontrolled — one
person's tag rewrote the house style (`notes/45`), the reply text, and repo-wide
tooling for everybody. minormobius asked the open question at the time and nobody
answered: *"how would you structure that long term memory? Maybe edits to the
claudemd, or a community aesthetic guide."* Needs a scoping decision, then it's
buildable — and it delivers most of "my own bot" without minting credentials.

**17. Ownership model for created objects.** (`notes/87`)
Does a bot-created feed live under `bisks.net` or the requester's identity? Who
can edit or delete it? Same question as #16 from a different angle — worth one
answer for both. Suggested default: under bisks.net, requester recorded as
commissioner.

---

## C2. Things the bot can't currently do (see `notes/91`)

**18. Let the bot see more than plain text.**
`threadContext()` extracts `record.text` only — images, image alt text, quote
posts, link cards, video, and the root post (when the tag is deep) are all
dropped. Alt text and quote posts are the cheap high-value fixes; actual image
input needs the blob passed to the model.

**19. Raise or drop `MAX_BRIEF_CHARS`.**
`slice(0, 600)` silently truncates the *instruction* mid-sentence while ancestors
go in full. Never fires for a normal 300-grapheme post; only bites the long-form
requests with the most detail to lose.

**20. Do something about the ~20% partial rate.**
73 "ran out of runway" vs 285 "built it" across the corpus. Partial work is
already preserved correctly; the gap is that a human has to notice and re-tag —
and "keep going" is one of the most common inputs in the whole dataset, which
suggests the harness could close that loop itself.

## D. Considered and set aside

**Self-hosted PDS.** (`notes/85`) Mostly orthogonal — custom lexicons already
work fine on Bluesky's PDS, and `bisks.net` as a handle already makes identity
domain-owned. Would be the first standing server in a project premised on not
having any. Revisit if minting many bot accounts becomes the goal.

**Persistent Jetstream index.** (`notes/88`) Dropped. The AppView is the database
for network data. Measured: 22 GB/day all-in, 3.7 GB/day for posts alone — to
hold a worse copy of what's already served. No idea currently on the table needs
it, including unique trigrams (already solved by scan-then-verify).

---

## The four threads

Everything above collapses into four groups, by what kind of work it is:

**Thread 1 — builder input fixes** (#18, #19; `notes/91`)
Things the bot structurally can't see. The 600-char cap, alt text, quote posts,
link cards, then real images. Small, ordinary changes to existing code that fix
active harm on every build. Highest value per unit effort, and the builder could
plausibly do most of it if tagged.

**Thread 2 — the partial rate** (#20; `notes/91`)
~1 in 5 builds ends "tag me again." Preservation already works; the gap is the
manual re-tag. Measure turn distribution from the box logs before touching
`BUILDER_MAX_TURNS`.

**Thread 3 — lexicons + atproto-native requests** (#1–3, #15b)
Write and publish the ten missing schemas, then `listReposByCollection` for
aggregate views, then build requests as records — which makes the scoping and
history questions (#16, #17) answerable by query instead of by config. The most
atproto-native direction, and largely doable by an atproto-pilled builder.

**Thread 4 — new bots** (#5–14; `notes/82`, `notes/84`, `notes/87`)
The genuinely new capability: a bot that makes protocol objects rather than
pages, plus the verifier / gen / sim / janitor / cron ideas. Wants the ownership
question (#17) settled first, since a created feed is externally visible in a way
a page isn't.

## If picking one thing

Cheapest real win: **the lexicon work (1–3)**. It's mostly documentation of what
already exists, it fixes a bug class that has already bitten twice, and step 3
turns it into something genuinely new — an aggregate view of data nobody else
has.

Most fun for the effort: **one hand-built feed generator (5)**. Small, and it
puts the project inside the Bluesky app instead of behind a link.

Best foundation for the bot ideas: **the verifier (6)**, because it proves the
second-bot pattern on something boring before anything fun depends on it.
