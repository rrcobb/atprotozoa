# /rich — what makes a trigram "good" (taste calibration)

The v1 /rich is a knock-off of mino's /unique: globally-unique trigrams in
heuristic search-order, no quality rank. Rob's verdict on the first output: the
"coherent concept" ones I liked (`reductionism materialism computationalism`,
`happenstance mathematical coincidence`) all SUCK. So my taste model was wrong.

To calibrate on real signal: Rob screenshotted ~100 trigrams from the larger set
— a hand-curated "these are good" dataset. Transcribing all 100 (subagent) to use
as positive examples for a ranker.

## Early hypothesis (from a few screenshots, PRE full transcription)

Examples Rob screenshotted: `abstracted computer lives`, `secret notifications
tab`, `retaliatory state enlargement`, `alignment problems everywhere`.

What they seem to share, vs the rejected dry ones:
- Read as **complete, standalone phrases** — not mid-sentence fragments.
- Often from **very short posts** where the trigram is ~the whole post → a
  deliberate phrase, not an accidental slice.
- **Evocative / punchy / a little funny** on their own — band-name / headline /
  reply energy.

Strongest cheap signal so far: **trigram-length / post-length ratio.** A trigram
that IS most of the post is self-contained; one buried in a 300-char post is
likely a fragment. Cheap to compute, no model.

Rejected-example failure modes to penalize:
- mid-sentence fragments (`backwards compatibility preexisting`)
- repeated word (`embarrassed technocrat embarrassed`)
- near-duplicate slices of one post (dedup per source post)

## VERDICT after full transcription + testing (128 curated in data/curated.txt)

Studied all 128. My length-ratio hypothesis was weak — plenty are mid-sentence
(`legacy backwards compatibility`, `training data development`). What they share:
- **grammatically well-formed** noun phrases / mini-clauses (no junk fragments)
- **surprise / juxtaposition** — two domains colliding: `universal basic
  mansions`, `buzzfeed trolley problems`, `bulletproof ruggedized fursuit`
- **NO function words, NO repeated words** — 0/128 have either (with a NARROW
  stoplist; a broad one wrongly rejects `meaning after scarcity` etc.)
- NOT the dry -ism triples I liked — Rob rejected exactly those.

Tested a heuristic scorer (function-word + repeat filter; word-length bump
peaking ~8 chars, undoing mino's "longer=better" bias) against curated vs
rejected. Two hard findings:

1. **mino's score() ranks REJECTED above CURATED** (14.2 vs 11.9 mean) — it
   rewards long words, so it surfaces the dry academic ones Rob hates FIRST. This
   is why v1 /rich felt bad.
2. **The fixed heuristic FILTERS well but RANKS badly.** On real bisks.net data
   the ranked top was `nonexistent knowledge proliferates`, `backwards
   compatibility preexisting` — Rob's rejects, back on top. Length features can't
   see surprise/juxtaposition. Curated 0.67 vs rejected 0.63 — barely separated.

**Conclusion: heuristics = FILTER only (drop function-word/repeat/dupe junk, which
works great). Ranking by taste NEEDS a model.** Shipped filter+heuristic-rank so
Rob can see it's "clean but not good," which confirms the taste pass.

Also: global uniqueness is RARE — ~7 unique from 400 candidates on bisks.net. A
good /rich must verify MANY candidates (slow but free), or precompute.

## Next: the taste pass (options)

- (a) **client-side embeddings** — embed each candidate, rank by similarity to the
  128 curated exemplars (embedded once). Fully client-side (transformers.js), no
  key, no worker. Most on-brand. Try first.
- (b) Workers AI LLM judge (small worker, ~free, on-edge).
- (c) Claude Haiku judge (needs key, best taste).
